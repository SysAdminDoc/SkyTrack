<#
.SYNOPSIS
    SkyTrack Overnight Image Downloader
    Resumable, progress-saving aircraft photo downloader
    
.DESCRIPTION
    - Saves progress to resume after interruption
    - Detailed logging
    - Adaptive rate limiting
    - Can run unattended overnight
    
.PARAMETER BaseDir
    Base directory for SkyTrack data (default: C:\Users\Admin\Documents\GitHub\SkyTrack)
    
.PARAMETER DelayMs
    Delay between API requests in milliseconds (default: 600)
    
.PARAMETER BatchSize
    Save progress every N aircraft (default: 100)
    
.PARAMETER MaxHours
    Maximum hours to run (default: 12, 0 = unlimited)
    
.PARAMETER Reset
    Reset progress and start fresh
    
.EXAMPLE
    .\SkyTrack_ImageDownloader_Overnight.ps1
    
.EXAMPLE
    .\SkyTrack_ImageDownloader_Overnight.ps1 -DelayMs 750 -MaxHours 8
#>

param(
    [string]$BaseDir = "C:\Users\Admin\Documents\GitHub\SkyTrack",
    [int]$DelayMs = 600,
    [int]$BatchSize = 100,
    [int]$MaxHours = 12,
    [switch]$Reset,
    [switch]$Force
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Force TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ============================================================
# CONFIGURATION
# ============================================================

$script:Config = @{
    BaseDir = $BaseDir
    DataDir = "$BaseDir\data"
    PhotosDir = "$BaseDir\assets\aircraft_photos"
    ProgressFile = "$BaseDir\logs\image_download_progress.json"
    LogFile = "$BaseDir\logs\image_download_$(Get-Date -Format 'yyyyMMdd').log"
    DelayMs = $DelayMs
    BatchSize = $BatchSize
    MaxHours = $MaxHours
    StartTime = Get-Date
    AdaptiveDelay = $DelayMs
    ConsecutiveRateLimits = 0
    MaxConsecutiveRateLimits = 5
}

$script:Progress = @{
    Completed = [System.Collections.Generic.HashSet[string]]::new()
    NoPhoto = [System.Collections.Generic.HashSet[string]]::new()
    LastHex = ""
    TotalDownloaded = 0
    TotalNoPhoto = 0
    TotalFailed = 0
    TotalRateLimited = 0
    SessionsRun = 0
    LastRunTime = $null
}

$script:SessionStats = @{
    Attempted = 0
    Downloaded = 0
    Skipped = 0
    NoPhoto = 0
    RateLimited = 0
    Failed = 0
}

# ============================================================
# LOGGING
# ============================================================

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    
    # Write to file
    Add-Content -Path $script:Config.LogFile -Value $logLine -ErrorAction SilentlyContinue
    
    # Write to console
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "DEBUG" { "DarkGray" }
        default { "White" }
    }
    
    $prefix = switch ($Level) {
        "OK"    { "[+]" }
        "WARN"  { "[!]" }
        "ERROR" { "[X]" }
        "DEBUG" { "[.]" }
        default { "[*]" }
    }
    
    Write-Host "$prefix $Message" -ForegroundColor $color
}

function Write-Header {
    param([string]$Text)
    $line = "=" * 70
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
    Write-Host ""
    Write-Log $Text
}

# ============================================================
# PROGRESS MANAGEMENT
# ============================================================

function Initialize-Directories {
    @($script:Config.PhotosDir, (Split-Path $script:Config.LogFile)) | ForEach-Object {
        if (-not (Test-Path $_)) {
            New-Item -ItemType Directory -Force -Path $_ | Out-Null
        }
    }
}

function Load-Progress {
    if ($Reset) {
        Write-Log "Progress reset requested" "WARN"
        return
    }
    
    if (Test-Path $script:Config.ProgressFile) {
        try {
            $saved = Get-Content $script:Config.ProgressFile -Raw | ConvertFrom-Json
            
            # Load completed hex codes
            if ($saved.Completed) {
                foreach ($hex in $saved.Completed) {
                    $script:Progress.Completed.Add($hex) | Out-Null
                }
            }
            
            # Load no-photo hex codes
            if ($saved.NoPhoto) {
                foreach ($hex in $saved.NoPhoto) {
                    $script:Progress.NoPhoto.Add($hex) | Out-Null
                }
            }
            
            $script:Progress.TotalDownloaded = $saved.TotalDownloaded
            $script:Progress.TotalNoPhoto = $saved.TotalNoPhoto
            $script:Progress.TotalFailed = $saved.TotalFailed
            $script:Progress.TotalRateLimited = $saved.TotalRateLimited
            $script:Progress.SessionsRun = $saved.SessionsRun
            $script:Progress.LastRunTime = $saved.LastRunTime
            
            Write-Log "Loaded progress: $($script:Progress.Completed.Count) completed, $($script:Progress.NoPhoto.Count) no-photo" "OK"
        }
        catch {
            Write-Log "Failed to load progress file: $($_.Exception.Message)" "WARN"
        }
    }
}

function Save-Progress {
    try {
        $saveData = @{
            Completed = @($script:Progress.Completed)
            NoPhoto = @($script:Progress.NoPhoto)
            TotalDownloaded = $script:Progress.TotalDownloaded
            TotalNoPhoto = $script:Progress.TotalNoPhoto
            TotalFailed = $script:Progress.TotalFailed
            TotalRateLimited = $script:Progress.TotalRateLimited
            SessionsRun = $script:Progress.SessionsRun
            LastRunTime = (Get-Date).ToString("o")
            LastHex = $script:Progress.LastHex
        }
        
        $saveData | ConvertTo-Json -Depth 3 | Set-Content $script:Config.ProgressFile -Encoding UTF8
    }
    catch {
        Write-Log "Failed to save progress: $($_.Exception.Message)" "ERROR"
    }
}

# ============================================================
# HEX CODE COLLECTION
# ============================================================

function Get-HexCodes {
    Write-Log "Collecting hex codes from databases..."
    
    $hexCodes = [System.Collections.Generic.List[string]]::new()
    
    $files = @(
        "aircraft\badgers-best.csv",
        "aircraft\interesting.csv",
        "aircraft\plane-alert-civ.csv",
        "military\plane-alert-mil.csv",
        "military\plane-alert-gov.csv",
        "military\plane-alert-pol.csv"
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
    
    Write-Log "Found $($hexCodes.Count) unique hex codes"
    return $hexCodes
}

# ============================================================
# API FUNCTIONS
# ============================================================

function Get-PhotoUrl {
    param([string]$Hex)
    
    $apiUrl = "https://api.planespotters.net/pub/photos/hex/$($Hex.ToLower())"
    
    try {
        $headers = @{
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            "Accept" = "application/json"
            "Referer" = "https://globe.airplanes.live/"
        }
        
        $response = Invoke-WebRequest -Uri $apiUrl -Headers $headers -UseBasicParsing -TimeoutSec 30
        $data = $response.Content | ConvertFrom-Json
        
        # Reset rate limit counter on success
        $script:Config.ConsecutiveRateLimits = 0
        
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
        
        if ($statusCode -eq 429 -or $_.Exception.Message -like "*429*") {
            $script:Config.ConsecutiveRateLimits++
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
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
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
# ADAPTIVE RATE LIMITING
# ============================================================

function Update-AdaptiveDelay {
    param([bool]$WasRateLimited)
    
    if ($WasRateLimited) {
        # Increase delay on rate limit (up to 5 seconds)
        $script:Config.AdaptiveDelay = [math]::Min(5000, [int]($script:Config.AdaptiveDelay * 1.5))
        Write-Log "Rate limited - increased delay to $($script:Config.AdaptiveDelay)ms" "WARN"
    }
    else {
        # Slowly decrease delay on success (down to original)
        if ($script:Config.AdaptiveDelay -gt $script:Config.DelayMs) {
            $script:Config.AdaptiveDelay = [math]::Max($script:Config.DelayMs, [int]($script:Config.AdaptiveDelay * 0.95))
        }
    }
}

# ============================================================
# MAIN DOWNLOAD LOOP
# ============================================================

function Start-Download {
    param([array]$HexCodes)
    
    Write-Header "Starting Overnight Download"
    
    $total = $HexCodes.Count
    $remaining = $HexCodes | Where-Object { 
        -not $script:Progress.Completed.Contains($_) -and 
        -not $script:Progress.NoPhoto.Contains($_)
    }
    $remainingCount = @($remaining).Count
    
    Write-Log "Total aircraft: $total"
    Write-Log "Already processed: $($total - $remainingCount)"
    Write-Log "Remaining: $remainingCount"
    Write-Log "Estimated time: $([math]::Round($remainingCount * $script:Config.DelayMs / 1000 / 60 / 60, 1)) hours at $($script:Config.DelayMs)ms delay"
    Write-Log "Max runtime: $(if($script:Config.MaxHours -eq 0){'Unlimited'}else{"$($script:Config.MaxHours) hours"})"
    Write-Host ""
    
    $current = 0
    $lastSaveTime = Get-Date
    
    foreach ($hex in $remaining) {
        $current++
        $script:SessionStats.Attempted++
        $script:Progress.LastHex = $hex
        
        # Check time limit
        $elapsed = (Get-Date) - $script:Config.StartTime
        if ($script:Config.MaxHours -gt 0 -and $elapsed.TotalHours -ge $script:Config.MaxHours) {
            Write-Log "Time limit reached ($($script:Config.MaxHours) hours). Saving progress..." "WARN"
            Save-Progress
            break
        }
        
        # Check consecutive rate limits
        if ($script:Config.ConsecutiveRateLimits -ge $script:Config.MaxConsecutiveRateLimits) {
            Write-Log "Too many consecutive rate limits. Pausing for 60 seconds..." "WARN"
            Start-Sleep -Seconds 60
            $script:Config.ConsecutiveRateLimits = 0
        }
        
        $outputPath = Join-Path $script:Config.PhotosDir "$hex.jpg"
        
        # Skip if file exists (unless Force)
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 1000) {
            $script:Progress.Completed.Add($hex) | Out-Null
            $script:SessionStats.Skipped++
            continue
        }
        
        # Progress display
        $pct = [math]::Round(($current / $remainingCount) * 100, 1)
        $eta = if ($script:SessionStats.Attempted -gt 0) {
            $avgTime = $elapsed.TotalSeconds / $script:SessionStats.Attempted
            $remainingSecs = ($remainingCount - $current) * $avgTime
            [TimeSpan]::FromSeconds($remainingSecs).ToString("hh\:mm\:ss")
        } else { "--:--:--" }
        
        Write-Host "`r  [$current/$remainingCount] $pct% | OK:$($script:SessionStats.Downloaded) None:$($script:SessionStats.NoPhoto) 429:$($script:SessionStats.RateLimited) | ETA:$eta | Delay:$($script:Config.AdaptiveDelay)ms   " -NoNewline
        
        # Get photo URL from API
        $result = Get-PhotoUrl -Hex $hex
        
        if ($result.Success) {
            if (Download-Image -Url $result.PhotoUrl -OutputPath $outputPath) {
                $script:SessionStats.Downloaded++
                $script:Progress.TotalDownloaded++
                $script:Progress.Completed.Add($hex) | Out-Null
            } else {
                $script:SessionStats.Failed++
                $script:Progress.TotalFailed++
            }
            Update-AdaptiveDelay -WasRateLimited $false
        }
        elseif ($result.Reason -eq "RateLimit") {
            $script:SessionStats.RateLimited++
            $script:Progress.TotalRateLimited++
            Update-AdaptiveDelay -WasRateLimited $true
            Start-Sleep -Seconds 5  # Extra pause on rate limit
        }
        elseif ($result.Reason -eq "NoPhotos") {
            $script:SessionStats.NoPhoto++
            $script:Progress.TotalNoPhoto++
            $script:Progress.NoPhoto.Add($hex) | Out-Null
            Update-AdaptiveDelay -WasRateLimited $false
        }
        else {
            $script:SessionStats.Failed++
            $script:Progress.TotalFailed++
        }
        
        # Save progress periodically
        if (((Get-Date) - $lastSaveTime).TotalMinutes -ge 5 -or $current % $script:Config.BatchSize -eq 0) {
            Save-Progress
            $lastSaveTime = Get-Date
        }
        
        # Delay before next request
        Start-Sleep -Milliseconds $script:Config.AdaptiveDelay
    }
    
    Write-Host ""
    
    # Final save
    $script:Progress.SessionsRun++
    Save-Progress
}

# ============================================================
# SUMMARY
# ============================================================

function Show-Summary {
    $elapsed = (Get-Date) - $script:Config.StartTime
    
    Write-Header "Session Complete"
    
    Write-Host "  SESSION STATS:" -ForegroundColor Yellow
    Write-Host "    Runtime:       $($elapsed.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
    Write-Host "    Attempted:     $($script:SessionStats.Attempted)" -ForegroundColor White
    Write-Host "    Downloaded:    $($script:SessionStats.Downloaded)" -ForegroundColor Green
    Write-Host "    Skipped:       $($script:SessionStats.Skipped)" -ForegroundColor Yellow
    Write-Host "    No Photo:      $($script:SessionStats.NoPhoto)" -ForegroundColor Gray
    Write-Host "    Rate Limited:  $($script:SessionStats.RateLimited)" -ForegroundColor $(if ($script:SessionStats.RateLimited -gt 0) { "Red" } else { "Green" })
    Write-Host "    Failed:        $($script:SessionStats.Failed)" -ForegroundColor $(if ($script:SessionStats.Failed -gt 0) { "Red" } else { "Green" })
    Write-Host ""
    
    Write-Host "  ALL-TIME STATS:" -ForegroundColor Yellow
    Write-Host "    Sessions run:  $($script:Progress.SessionsRun)" -ForegroundColor Cyan
    Write-Host "    Total downloaded: $($script:Progress.TotalDownloaded)" -ForegroundColor Green
    Write-Host "    Total no-photo:   $($script:Progress.TotalNoPhoto)" -ForegroundColor Gray
    Write-Host ""
    
    if (Test-Path $script:Config.PhotosDir) {
        $files = Get-ChildItem $script:Config.PhotosDir -Filter "*.jpg" -ErrorAction SilentlyContinue
        $size = ($files | Measure-Object -Property Length -Sum).Sum
        Write-Host "  PHOTOS FOLDER:" -ForegroundColor Yellow
        Write-Host "    $($files.Count) photos, $("{0:N1} MB" -f ($size / 1MB))" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "  Progress saved to: $($script:Config.ProgressFile)" -ForegroundColor Gray
    Write-Host "  Log file: $($script:Config.LogFile)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Log "Session complete. Downloaded: $($script:SessionStats.Downloaded), No photo: $($script:SessionStats.NoPhoto), Rate limited: $($script:SessionStats.RateLimited)"
}

# ============================================================
# MAIN
# ============================================================

Write-Header "SkyTrack Overnight Image Downloader"

Initialize-Directories
Load-Progress

$hexCodes = Get-HexCodes

if ($hexCodes.Count -eq 0) {
    Write-Log "No hex codes found. Run the data downloader first." "ERROR"
    exit 1
}

# Handle Ctrl+C gracefully
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Write-Host "`n`n[!] Interrupted - saving progress..." -ForegroundColor Yellow
    Save-Progress
}

try {
    Start-Download -HexCodes $hexCodes
}
catch {
    Write-Log "Unexpected error: $($_.Exception.Message)" "ERROR"
    Save-Progress
}
finally {
    Show-Summary
}

Write-Host "Press Enter to exit..."
$null = Read-Host
