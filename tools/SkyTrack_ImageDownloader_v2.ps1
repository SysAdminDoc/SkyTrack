<#
.SYNOPSIS
    SkyTrack Image Downloader v2 - Simplified with better error handling
#>

param(
    [string]$BaseDir = "C:\Users\Admin\Documents\GitHub\SkyTrack",
    [int]$Limit = 50000,
    [int]$DelayMs = 500,
    [switch]$Force,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Force TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:Config = @{
    BaseDir = $BaseDir
    DataDir = "$BaseDir\data"
    PhotosDir = "$BaseDir\assets\aircraft_photos"
    DelayMs = $DelayMs
}

$script:Stats = @{
    Attempted = 0
    Downloaded = 0
    Skipped = 0
    RateLimited = 0
    NoPhoto = 0
    Failed = 0
    Errors = @{}
}

# ============================================================
# SIMPLE HEADERS - Just the essentials
# ============================================================

function Get-SimpleHeaders {
    return @{
        "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        "Accept" = "application/json"
        "Referer" = "https://globe.airplanes.live/"
    }
}

function Get-ImageHeaders {
    return @{
        "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        "Accept" = "image/*"
        "Referer" = "https://globe.airplanes.live/"
    }
}

# ============================================================
# HEX CODE COLLECTION
# ============================================================

function Get-HexCodes {
    Write-Host "[*] Collecting hex codes..." -ForegroundColor Cyan
    
    $hexCodes = [System.Collections.Generic.List[string]]::new()
    
    $files = @(
        "aircraft\badgers-best.csv",
        "aircraft\interesting.csv",
        "military\plane-alert-mil.csv",
        "military\plane-alert-gov.csv"
    )
    
    foreach ($file in $files) {
        $filePath = Join-Path $script:Config.DataDir $file
        if (Test-Path $filePath) {
            Get-Content $filePath -ErrorAction SilentlyContinue | Select-Object -Skip 1 | ForEach-Object {
                $hex = ($_ -split ',')[0] -replace '\$', '' -replace '"', '' -replace '\s', ''
                if ($hex -match '^[A-Fa-f0-9]{6}$') {
                    $hexUpper = $hex.ToUpper()
                    if (-not $hexCodes.Contains($hexUpper)) {
                        $hexCodes.Add($hexUpper)
                    }
                }
            }
        }
    }
    
    Write-Host "[+] Found $($hexCodes.Count) unique hex codes" -ForegroundColor Green
    return $hexCodes
}

# ============================================================
# API METHODS
# ============================================================

function Test-ApiConnection {
    Write-Host ""
    Write-Host "[*] Testing API connection..." -ForegroundColor Cyan
    
    $testHex = "a835af"  # A known aircraft (common US registration)
    $apiUrl = "https://api.planespotters.net/pub/photos/hex/$testHex"
    
    Write-Host "    URL: $apiUrl" -ForegroundColor Gray
    
    # Method 1: Invoke-WebRequest with simple headers
    Write-Host ""
    Write-Host "[*] Method 1: Invoke-WebRequest + Referer header" -ForegroundColor Yellow
    try {
        $headers = Get-SimpleHeaders
        $response = Invoke-WebRequest -Uri $apiUrl -Headers $headers -UseBasicParsing -TimeoutSec 30
        Write-Host "[+] SUCCESS! Status: $($response.StatusCode)" -ForegroundColor Green
        $data = $response.Content | ConvertFrom-Json
        Write-Host "    Photos found: $($data.photos.Count)" -ForegroundColor Cyan
        if ($data.photos.Count -gt 0) {
            Write-Host "    First photo URL: $($data.photos[0].thumbnail.src)" -ForegroundColor Gray
        }
        return "WebRequest"
    }
    catch {
        $err = $_.Exception.Message
        Write-Host "[X] FAILED: $err" -ForegroundColor Red
        if ($_.Exception.Response) {
            Write-Host "    Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        }
    }
    
    # Method 2: Invoke-RestMethod (simpler)
    Write-Host ""
    Write-Host "[*] Method 2: Invoke-RestMethod (no custom headers)" -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 30
        Write-Host "[+] SUCCESS!" -ForegroundColor Green
        Write-Host "    Photos found: $($response.photos.Count)" -ForegroundColor Cyan
        return "RestMethod"
    }
    catch {
        Write-Host "[X] FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Method 3: WebClient
    Write-Host ""
    Write-Host "[*] Method 3: System.Net.WebClient" -ForegroundColor Yellow
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        $webClient.Headers.Add("Referer", "https://globe.airplanes.live/")
        $content = $webClient.DownloadString($apiUrl)
        $data = $content | ConvertFrom-Json
        Write-Host "[+] SUCCESS!" -ForegroundColor Green
        Write-Host "    Photos found: $($data.photos.Count)" -ForegroundColor Cyan
        $webClient.Dispose()
        return "WebClient"
    }
    catch {
        Write-Host "[X] FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Method 4: HttpClient
    Write-Host ""
    Write-Host "[*] Method 4: System.Net.Http.HttpClient" -ForegroundColor Yellow
    try {
        Add-Type -AssemblyName System.Net.Http
        $handler = New-Object System.Net.Http.HttpClientHandler
        $client = New-Object System.Net.Http.HttpClient($handler)
        $client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0")
        $client.DefaultRequestHeaders.Add("Referer", "https://globe.airplanes.live/")
        $task = $client.GetStringAsync($apiUrl)
        $task.Wait()
        $content = $task.Result
        $data = $content | ConvertFrom-Json
        Write-Host "[+] SUCCESS!" -ForegroundColor Green
        Write-Host "    Photos found: $($data.photos.Count)" -ForegroundColor Cyan
        $client.Dispose()
        return "HttpClient"
    }
    catch {
        Write-Host "[X] FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "[!] All methods failed. Check your internet connection or firewall." -ForegroundColor Red
    return $null
}

function Get-PhotoUrl-WebClient {
    param([string]$Hex)
    
    $apiUrl = "https://api.planespotters.net/pub/photos/hex/$($Hex.ToLower())"
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        $webClient.Headers.Add("Referer", "https://globe.airplanes.live/")
        
        $content = $webClient.DownloadString($apiUrl)
        $data = $content | ConvertFrom-Json
        $webClient.Dispose()
        
        if ($data.photos -and $data.photos.Count -gt 0) {
            $photoUrl = $data.photos[0].thumbnail_large.src
            if (-not $photoUrl) { $photoUrl = $data.photos[0].thumbnail.src }
            return @{ Success = $true; PhotoUrl = $photoUrl }
        }
        return @{ Success = $false; Reason = "NoPhotos" }
    }
    catch {
        $err = $_.Exception.Message
        if ($err -like "*429*" -or $err -like "*Too Many*") {
            return @{ Success = $false; Reason = "RateLimit" }
        }
        return @{ Success = $false; Reason = "Error"; Message = $err }
    }
}

function Get-PhotoUrl-RestMethod {
    param([string]$Hex)
    
    $apiUrl = "https://api.planespotters.net/pub/photos/hex/$($Hex.ToLower())"
    
    try {
        $data = Invoke-RestMethod -Uri $apiUrl -TimeoutSec 30
        
        if ($data.photos -and $data.photos.Count -gt 0) {
            $photoUrl = $data.photos[0].thumbnail_large.src
            if (-not $photoUrl) { $photoUrl = $data.photos[0].thumbnail.src }
            return @{ Success = $true; PhotoUrl = $photoUrl }
        }
        return @{ Success = $false; Reason = "NoPhotos" }
    }
    catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.value__
        }
        
        if ($statusCode -eq 429) {
            return @{ Success = $false; Reason = "RateLimit" }
        }
        return @{ Success = $false; Reason = "Error"; Message = $_.Exception.Message }
    }
}

function Download-Image {
    param(
        [string]$Url,
        [string]$OutputPath
    )
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        $webClient.Headers.Add("Referer", "https://globe.airplanes.live/")
        $webClient.DownloadFile($Url, $OutputPath)
        $webClient.Dispose()
        
        if ((Test-Path $OutputPath) -and (Get-Item $OutputPath).Length -gt 1000) {
            return $true
        }
        Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
        return $false
    }
    catch {
        Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# ============================================================
# MAIN DOWNLOAD
# ============================================================

function Download-Photos {
    param(
        [array]$HexCodes,
        [int]$Limit,
        [string]$Method
    )
    
    Write-Host ""
    Write-Host "=" -NoNewline
    Write-Host ("=" * 68) -ForegroundColor Cyan
    Write-Host "  Downloading Photos (Method: $Method, Delay: $($script:Config.DelayMs)ms)" -ForegroundColor Cyan
    Write-Host ("=" * 69) -ForegroundColor Cyan
    Write-Host ""
    
    if (-not (Test-Path $script:Config.PhotosDir)) {
        New-Item -ItemType Directory -Force -Path $script:Config.PhotosDir | Out-Null
    }
    
    $toProcess = if ($Limit -gt 0) { $HexCodes | Select-Object -First $Limit } else { $HexCodes }
    $total = $toProcess.Count
    $current = 0
    $consecutiveErrors = 0
    $maxConsecutiveErrors = 10
    
    foreach ($hex in $toProcess) {
        $current++
        $script:Stats.Attempted++
        $outputPath = Join-Path $script:Config.PhotosDir "$hex.jpg"
        
        # Skip existing
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 1000) {
            $script:Stats.Skipped++
            continue
        }
        
        # Progress
        $pct = [math]::Round(($current / $total) * 100)
        Write-Host "`r  [$current/$total] $pct% - $hex | OK:$($script:Stats.Downloaded) Skip:$($script:Stats.Skipped) 429:$($script:Stats.RateLimited) None:$($script:Stats.NoPhoto) Err:$($script:Stats.Failed)   " -NoNewline
        
        # Get photo URL
        $result = if ($Method -eq "WebClient") {
            Get-PhotoUrl-WebClient -Hex $hex
        } else {
            Get-PhotoUrl-RestMethod -Hex $hex
        }
        
        if ($result.Success) {
            $consecutiveErrors = 0
            if (Download-Image -Url $result.PhotoUrl -OutputPath $outputPath) {
                $script:Stats.Downloaded++
            } else {
                $script:Stats.Failed++
            }
        }
        elseif ($result.Reason -eq "RateLimit") {
            $script:Stats.RateLimited++
            $consecutiveErrors++
            Write-Host ""
            Write-Host "  [!] Rate limited! Waiting 5 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
        elseif ($result.Reason -eq "NoPhotos") {
            $script:Stats.NoPhoto++
            $consecutiveErrors = 0
        }
        else {
            $script:Stats.Failed++
            $consecutiveErrors++
            if ($Verbose -and $result.Message) {
                Write-Host ""
                Write-Host "  [X] $hex : $($result.Message)" -ForegroundColor Red
            }
        }
        
        # Abort if too many consecutive errors
        if ($consecutiveErrors -ge $maxConsecutiveErrors) {
            Write-Host ""
            Write-Host "  [!] Too many consecutive errors ($consecutiveErrors). Aborting." -ForegroundColor Red
            break
        }
        
        Start-Sleep -Milliseconds $script:Config.DelayMs
    }
    
    Write-Host ""
}

# ============================================================
# SUMMARY
# ============================================================

function Show-Summary {
    Write-Host ""
    Write-Host ("=" * 69) -ForegroundColor Cyan
    Write-Host "  Download Summary" -ForegroundColor Cyan
    Write-Host ("=" * 69) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Attempted:     $($script:Stats.Attempted)" -ForegroundColor White
    Write-Host "  Downloaded:    $($script:Stats.Downloaded)" -ForegroundColor Green
    Write-Host "  Skipped:       $($script:Stats.Skipped)" -ForegroundColor Yellow
    Write-Host "  Rate Limited:  $($script:Stats.RateLimited)" -ForegroundColor $(if ($script:Stats.RateLimited -gt 0) { "Red" } else { "Green" })
    Write-Host "  No Photo:      $($script:Stats.NoPhoto)" -ForegroundColor Gray
    Write-Host "  Failed:        $($script:Stats.Failed)" -ForegroundColor $(if ($script:Stats.Failed -gt 0) { "Red" } else { "Green" })
    
    $photosDir = $script:Config.PhotosDir
    if (Test-Path $photosDir) {
        $files = Get-ChildItem $photosDir -Filter "*.jpg" -ErrorAction SilentlyContinue
        $size = ($files | Measure-Object -Property Length -Sum).Sum
        Write-Host ""
        Write-Host "  Photos folder: $($files.Count) files, $("{0:N1} MB" -f ($size / 1MB))" -ForegroundColor Cyan
    }
    Write-Host ""
}

# ============================================================
# MAIN
# ============================================================

Write-Host ""
Write-Host ("=" * 69) -ForegroundColor Cyan
Write-Host "  SkyTrack Image Downloader v2" -ForegroundColor Cyan
Write-Host ("=" * 69) -ForegroundColor Cyan

# Test which method works
$workingMethod = Test-ApiConnection

if (-not $workingMethod) {
    Write-Host ""
    Write-Host "[X] Cannot connect to Planespotters API." -ForegroundColor Red
    Write-Host "    Possible causes:" -ForegroundColor Yellow
    Write-Host "      - Firewall blocking connections" -ForegroundColor Gray
    Write-Host "      - Antivirus/security software" -ForegroundColor Gray
    Write-Host "      - Network proxy issues" -ForegroundColor Gray
    Write-Host "      - ISP blocking the domain" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[+] Using method: $workingMethod" -ForegroundColor Green

# Get hex codes
$hexCodes = Get-HexCodes

if ($hexCodes.Count -eq 0) {
    Write-Host "[X] No hex codes found. Run the data downloader first." -ForegroundColor Red
    exit 1
}

# Download
Download-Photos -HexCodes $hexCodes -Limit $Limit -Method $workingMethod

# Summary
Show-Summary

Write-Host "Press Enter to exit..."
Read-Host
