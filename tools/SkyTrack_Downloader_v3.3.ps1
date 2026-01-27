<#
.SYNOPSIS
    SkyTrack Complete Data Downloader v3.3
    Downloads ALL aviation databases and images for self-hosting
    Fixed image download method with proper headers
    
.NOTES
    Author: SkyTrack Tools
    Version: 3.3.0
#>

param(
    [string]$BaseDir = "C:\Users\Admin\Documents\GitHub\SkyTrack",
    [switch]$DataOnly,
    [switch]$ImagesOnly,
    [switch]$Force,
    [int]$MaxRetries = 3,
    [int]$PhotoDelayMs = 600
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# Force TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ============================================================
# COMPLETE DATA SOURCES - All verified working URLs
# ============================================================

$script:DataSources = [ordered]@{
    # ========== AIRCRAFT REGISTRATIONS (tar1090-db) ==========
    "aircraft\registrations.json" = @{
        Url = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/db.json.gz"
        Description = "Aircraft Registrations (300K+)"
        Decompress = $true
        OutputName = "registrations.json"
    }
    "aircraft\icao_types.json" = @{
        Url = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/icao_aircraft_types.json"
        Description = "ICAO Aircraft Type Codes"
    }
    "aircraft\ranges.json" = @{
        Url = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/ranges.json"
        Description = "Military Hex Ranges by Country"
    }
    
    # ========== INTERESTING AIRCRAFT (plane-alert-db) ==========
    "aircraft\interesting.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv"
        Description = "Interesting Aircraft - Master List (16K+)"
    }
    "aircraft\plane-alert-civ.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-civ.csv"
        Description = "Civilian Interesting Aircraft (4.5K)"
    }
    "aircraft\badgers-best.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/badgers-best.csv"
        Description = "Badger's Best - VIP Must-See Aircraft"
    }
    "aircraft\plane_images.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane_images.csv"
        Description = "Aircraft Image URLs (12K+)"
    }
    
    # ========== CATEGORIES (plane-alert-db) ==========
    "categories\plane-alert-categories.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-categories.csv"
        Description = "Aircraft Categories with Descriptions (51)"
    }
    
    # ========== MILITARY/GOVERNMENT (plane-alert-db) ==========
    "military\plane-alert-mil.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil.csv"
        Description = "Military Aircraft (8.7K)"
    }
    "military\plane-alert-gov.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-gov.csv"
        Description = "Government Aircraft (1.7K)"
    }
    "military\plane-alert-pol.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pol.csv"
        Description = "Police Aircraft (930+)"
    }
    "military\plane-alert-pia.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pia.csv"
        Description = "Privacy ICAO Address Aircraft (94)"
    }
    
    # ========== IMAGE DATABASES (plane-alert-db) ==========
    "images\plane-alert-mil-images.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil-images.csv"
        Description = "Military Aircraft Images"
    }
    "images\plane-alert-gov-images.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-gov-images.csv"
        Description = "Government Aircraft Images"
    }
    "images\plane-alert-pol-images.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pol-images.csv"
        Description = "Police Aircraft Images"
    }
    "images\plane-alert-civ-images.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-civ-images.csv"
        Description = "Civilian Aircraft Images"
    }
    "images\badgers-best-images.csv" = @{
        Url = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/badgers-best-images.csv"
        Description = "Badger's Best Aircraft Images"
    }
    
    # ========== AIRLINES (OpenFlights) ==========
    "airlines\airlines.csv" = @{
        Url = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat"
        Description = "Airlines Database (6K+)"
    }
    
    # ========== AIRPORTS (OurAirports + tar1090-db) ==========
    "airports\airports.csv" = @{
        Url = "https://davidmegginson.github.io/ourairports-data/airports.csv"
        Description = "World Airports (75K+)"
    }
    "airports\airport-coords.json" = @{
        Url = "https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/airport-coords.json"
        Description = "Compact Airport Coordinates (Fast Lookup)"
    }
    "airports\runways.csv" = @{
        Url = "https://davidmegginson.github.io/ourairports-data/runways.csv"
        Description = "Airport Runways (45K+)"
    }
    "airports\frequencies.csv" = @{
        Url = "https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv"
        Description = "ATC/ATIS Frequencies"
    }
    "airports\countries.csv" = @{
        Url = "https://davidmegginson.github.io/ourairports-data/countries.csv"
        Description = "Countries"
    }
    "airports\regions.csv" = @{
        Url = "https://davidmegginson.github.io/ourairports-data/regions.csv"
        Description = "Regions/States"
    }
    "airports\navaids.csv" = @{
        Url = "https://davidmegginson.github.io/ourairports-data/navaids.csv"
        Description = "Navigation Aids (VOR/NDB)"
    }
    
    # ========== ROUTES (OpenFlights) ==========
    "routes\routes.csv" = @{
        Url = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat"
        Description = "Flight Routes (67K+)"
    }
    "routes\planes.csv" = @{
        Url = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/planes.dat"
        Description = "Aircraft Equipment Codes"
    }
}

# Stats tracking
$script:Stats = @{
    StartTime = $null
    Downloaded = 0
    Skipped = 0
    Failed = 0
    TotalBytes = 0
    Errors = [System.Collections.ArrayList]::new()
}

$script:Config = @{
    BaseDir = $BaseDir
    DataDir = "$BaseDir\data"
    AssetsDir = "$BaseDir\assets"
    LogDir = "$BaseDir\logs"
    MaxRetries = $MaxRetries
    PhotoDelayMs = $PhotoDelayMs
    Timeout = 30
    UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# ============================================================
# LOGGING
# ============================================================

function Initialize-Logging {
    if (-not (Test-Path $script:Config.LogDir)) {
        New-Item -ItemType Directory -Force -Path $script:Config.LogDir | Out-Null
    }
    $script:LogFile = Join-Path $script:Config.LogDir "download_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $script:LogFile -Value "[$timestamp] [$Level] $Message" -ErrorAction SilentlyContinue
    
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        default { "White" }
    }
    $prefix = switch ($Level) {
        "OK"    { "[+]" }
        "WARN"  { "[!]" }
        "ERROR" { "[X]" }
        default { "[*]" }
    }
    Write-Host "$prefix " -ForegroundColor $color -NoNewline
    Write-Host $Message
}

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Progress2 {
    param([int]$Current, [int]$Total, [string]$Status)
    $pct = if ($Total -gt 0) { [math]::Round(($Current / $Total) * 100) } else { 0 }
    $bar = "[" + ("=" * [math]::Floor($pct / 5)) + (" " * (20 - [math]::Floor($pct / 5))) + "]"
    Write-Host "`r  $bar $pct% - $Status                              " -NoNewline
}

# ============================================================
# DIRECTORY SETUP
# ============================================================

function Initialize-Directories {
    Write-Header "Initializing Directory Structure"
    
    $dirs = @(
        "data\aircraft", "data\airlines", "data\airports", 
        "data\military", "data\routes", "data\categories", "data\images",
        "assets\aircraft_photos", "assets\airlines", 
        "assets\silhouettes", "assets\flags",
        "logs"
    )
    
    foreach ($dir in $dirs) {
        $fullPath = Join-Path $script:Config.BaseDir $dir
        if (-not (Test-Path $fullPath)) {
            New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
            Write-Log "Created: $dir" "OK"
        }
    }
}

# ============================================================
# DOWNLOAD FUNCTIONS
# ============================================================

function Download-File {
    param(
        [string]$Url,
        [string]$OutputPath,
        [int]$MinSize = 100,
        [switch]$Decompress
    )
    
    $attempt = 0
    $success = $false
    
    while ($attempt -lt $script:Config.MaxRetries -and -not $success) {
        $attempt++
        
        try {
            $tempPath = if ($Decompress) { "$OutputPath.gz" } else { $OutputPath }
            
            $webClient = New-Object System.Net.WebClient
            $webClient.Headers.Add("User-Agent", $script:Config.UserAgent)
            $webClient.DownloadFile($Url, $tempPath)
            
            if ($Decompress -and (Test-Path $tempPath)) {
                try {
                    $inStream = [System.IO.File]::OpenRead($tempPath)
                    $outStream = [System.IO.File]::Create($OutputPath)
                    $gzipStream = New-Object System.IO.Compression.GzipStream($inStream, [System.IO.Compression.CompressionMode]::Decompress)
                    $gzipStream.CopyTo($outStream)
                    $gzipStream.Close()
                    $outStream.Close()
                    $inStream.Close()
                    Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                }
                catch {
                    if (Test-Path $tempPath) {
                        Move-Item $tempPath $OutputPath -Force
                    }
                }
            }
            
            if ((Test-Path $OutputPath) -and (Get-Item $OutputPath).Length -ge $MinSize) {
                $script:Stats.TotalBytes += (Get-Item $OutputPath).Length
                $success = $true
            } else {
                Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
                if ($attempt -lt $script:Config.MaxRetries) {
                    Start-Sleep -Milliseconds (500 * $attempt)
                }
            }
        }
        catch {
            if ($attempt -lt $script:Config.MaxRetries) {
                Start-Sleep -Milliseconds (500 * $attempt)
            }
        }
        finally {
            if ($webClient) { $webClient.Dispose() }
        }
    }
    
    return $success
}

function Download-WithWebClient {
    param(
        [string]$Url,
        [string]$OutputPath,
        [int]$MinSize = 100
    )
    
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", $script:Config.UserAgent)
        $webClient.Headers.Add("Referer", "https://globe.airplanes.live/")
        $webClient.DownloadFile($Url, $OutputPath)
        $webClient.Dispose()
        
        if ((Test-Path $OutputPath) -and (Get-Item $OutputPath).Length -ge $MinSize) {
            $script:Stats.TotalBytes += (Get-Item $OutputPath).Length
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
# DATA FILE DOWNLOADS
# ============================================================

function Download-AllDataFiles {
    Write-Header "Downloading Data Files ($($script:DataSources.Count) total)"
    
    $total = $script:DataSources.Count
    $current = 0
    
    foreach ($file in $script:DataSources.Keys) {
        $current++
        $source = $script:DataSources[$file]
        
        $outputFile = if ($source.OutputName) { 
            Join-Path (Split-Path $file) $source.OutputName 
        } else { 
            $file 
        }
        
        $outputPath = Join-Path $script:Config.DataDir $outputFile
        
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 100) {
            Write-Progress2 -Current $current -Total $total -Status "$($source.Description) [EXISTS]"
            $script:Stats.Skipped++
            continue
        }
        
        Write-Progress2 -Current $current -Total $total -Status $source.Description
        
        $dir = Split-Path $outputPath -Parent
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        
        $success = Download-File -Url $source.Url -OutputPath $outputPath -MinSize 50 -Decompress:($source.Decompress -eq $true)
        
        if ($success) {
            $script:Stats.Downloaded++
            Write-Log "$($source.Description) downloaded" "OK"
        } else {
            $script:Stats.Failed++
            $script:Stats.Errors.Add("$($source.Description): $($source.Url)") | Out-Null
            Write-Log "$($source.Description) FAILED" "ERROR"
        }
        
        Start-Sleep -Milliseconds 100
    }
    
    Write-Host ""
}

# ============================================================
# IMAGE DOWNLOADS - FIXED VERSION
# ============================================================

function Get-HexCodesFromDatabases {
    Write-Log "Collecting hex codes from all databases..."
    
    $hexCodes = [System.Collections.Generic.List[string]]::new()
    
    $csvFiles = @(
        "aircraft\badgers-best.csv",
        "aircraft\interesting.csv",
        "aircraft\plane-alert-civ.csv",
        "military\plane-alert-mil.csv",
        "military\plane-alert-gov.csv",
        "military\plane-alert-pol.csv",
        "military\plane-alert-pia.csv"
    )
    
    foreach ($csvFile in $csvFiles) {
        $filePath = Join-Path $script:Config.DataDir $csvFile
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

function Get-AirlineCodesFromDatabase {
    Write-Log "Collecting airline codes..."
    
    $codes = [System.Collections.Generic.HashSet[string]]::new()
    
    $airlinesFile = Join-Path $script:Config.DataDir "airlines\airlines.csv"
    if (Test-Path $airlinesFile) {
        Get-Content $airlinesFile -ErrorAction SilentlyContinue | ForEach-Object {
            $parts = $_ -split ','
            if ($parts.Count -ge 5) {
                $icao = $parts[4] -replace '"', '' -replace '\\N', '' -replace '\s', ''
                if ($icao -match '^[A-Z]{3}$') {
                    $codes.Add($icao) | Out-Null
                }
            }
        }
    }
    
    @('AAL','UAL','DAL','SWA','JBU','ASA','FFT','SKW','RPA','ENY',
      'BAW','AFR','DLH','KLM','SAS','FIN','IBE','TAP','AZA','SWR','AUA',
      'QFA','ANZ','SIA','CPA','JAL','ANA','KAL','EVA','CAL','MAS','THA',
      'UAE','ETD','QTR','SAA','ETH','RAM','MSR','THY','FDX','UPS','DHL') | ForEach-Object {
        $codes.Add($_) | Out-Null
    }
    
    Write-Log "Found $($codes.Count) airline codes"
    return $codes
}

function Get-TypeCodesFromDatabase {
    Write-Log "Collecting aircraft type codes..."
    
    $types = [System.Collections.Generic.HashSet[string]]::new()
    
    $typesFile = Join-Path $script:Config.DataDir "aircraft\icao_types.json"
    if (Test-Path $typesFile) {
        try {
            $json = Get-Content $typesFile -Raw | ConvertFrom-Json
            $json.PSObject.Properties.Name | ForEach-Object {
                $types.Add($_.ToUpper()) | Out-Null
            }
        } catch {}
    }
    
    @('B738','B739','B37M','B38M','B752','B753','B763','B764','B772','B773','B77W',
      'B788','B789','B78X','B744','B748','A318','A319','A320','A321','A20N','A21N',
      'A332','A333','A339','A359','A35K','A388','E170','E175','E190','E195',
      'CRJ2','CRJ7','CRJ9','DH8D','AT72','C172','C208','PC12','SR22','GLF5',
      'C17','C130','C5','F16','F15','F18','F22','F35','B52','KC135','KC10') | ForEach-Object {
        $types.Add($_) | Out-Null
    }
    
    Write-Log "Found $($types.Count) aircraft type codes"
    return $types
}

function Get-CountryCodesFromDatabase {
    Write-Log "Collecting country codes..."
    
    $codes = [System.Collections.Generic.HashSet[string]]::new()
    
    $countriesFile = Join-Path $script:Config.DataDir "airports\countries.csv"
    if (Test-Path $countriesFile) {
        Get-Content $countriesFile -ErrorAction SilentlyContinue | Select-Object -Skip 1 | ForEach-Object {
            $parts = $_ -split ','
            if ($parts.Count -ge 2) {
                $code = ($parts[1] -replace '"', '').ToLower().Trim()
                if ($code -match '^[a-z]{2}$') {
                    $codes.Add($code) | Out-Null
                }
            }
        }
    }
    
    @('us','ca','mx','gb','de','fr','it','es','nl','be','ch','at','se','no','dk','fi',
      'pl','cz','hu','pt','ie','gr','tr','ru','ua','au','nz','jp','kr','cn','hk','tw',
      'sg','th','my','id','ph','in','ae','sa','qa','eg','za','br','ar') | ForEach-Object {
        $codes.Add($_) | Out-Null
    }
    
    Write-Log "Found $($codes.Count) country codes"
    return $codes
}

# FIXED: Aircraft photo download using working method
function Download-AircraftPhotos {
    param([int]$Limit = 0)
    
    Write-Header "Downloading Aircraft Photos (Planespotters API)"
    
    $outputDir = Join-Path $script:Config.AssetsDir "aircraft_photos"
    $hexCodes = Get-HexCodesFromDatabases
    
    if ($Limit -gt 0) {
        $hexCodes = $hexCodes | Select-Object -First $Limit
    }
    
    $total = $hexCodes.Count
    $current = 0
    $downloaded = 0
    $skipped = 0
    $noPhoto = 0
    $rateLimited = 0
    
    Write-Log "Processing $total aircraft for photos (delay: $($script:Config.PhotoDelayMs)ms)..."
    
    foreach ($hex in $hexCodes) {
        $current++
        $outputPath = Join-Path $outputDir "$hex.jpg"
        
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 1000) {
            $skipped++
            continue
        }
        
        if ($current % 25 -eq 0 -or $current -eq $total) {
            $pct = [math]::Round(($current / $total) * 100)
            Write-Host "`r  [$current/$total] $pct% | OK:$downloaded Skip:$skipped None:$noPhoto 429:$rateLimited   " -NoNewline
        }
        
        try {
            $apiUrl = "https://api.planespotters.net/pub/photos/hex/$($hex.ToLower())"
            
            # Use working method: Invoke-WebRequest with simple headers
            $headers = @{
                "User-Agent" = $script:Config.UserAgent
                "Accept" = "application/json"
                "Referer" = "https://globe.airplanes.live/"
            }
            
            $response = Invoke-WebRequest -Uri $apiUrl -Headers $headers -UseBasicParsing -TimeoutSec 30
            $data = $response.Content | ConvertFrom-Json
            
            if ($data.photos -and $data.photos.Count -gt 0) {
                $photoUrl = $data.photos[0].thumbnail_large.src
                if (-not $photoUrl) { $photoUrl = $data.photos[0].thumbnail.src }
                
                if ($photoUrl) {
                    if (Download-WithWebClient -Url $photoUrl -OutputPath $outputPath -MinSize 1000) {
                        $downloaded++
                    } else {
                        $noPhoto++
                    }
                } else {
                    $noPhoto++
                }
            } else {
                $noPhoto++
            }
        }
        catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = $_.Exception.Response.StatusCode.value__
            }
            
            if ($statusCode -eq 429) {
                $rateLimited++
                Write-Host ""
                Write-Log "Rate limited - waiting 5 seconds..." "WARN"
                Start-Sleep -Seconds 5
            } else {
                $noPhoto++
            }
        }
        
        Start-Sleep -Milliseconds $script:Config.PhotoDelayMs
    }
    
    Write-Host ""
    Write-Log "Aircraft photos: $downloaded downloaded, $skipped existed, $noPhoto no photo, $rateLimited rate limited"
}

function Download-AirlineLogos {
    Write-Header "Downloading Airline Logos"
    
    $outputDir = Join-Path $script:Config.AssetsDir "airlines"
    $codes = Get-AirlineCodesFromDatabase
    
    $total = $codes.Count
    $current = 0
    $downloaded = 0
    $skipped = 0
    
    foreach ($code in $codes) {
        $current++
        $outputPath = Join-Path $outputDir "$code.png"
        
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 200) {
            $skipped++
            continue
        }
        
        if ($current % 50 -eq 0) {
            Write-Progress2 -Current $current -Total $total -Status "$code ($downloaded downloaded)"
        }
        
        $url = "https://globe.airplanes.live/airline_banners/$code.png"
        if (Download-WithWebClient -Url $url -OutputPath $outputPath -MinSize 200) {
            $downloaded++
        }
        
        Start-Sleep -Milliseconds 50
    }
    
    Write-Host ""
    Write-Log "Airline logos: $downloaded downloaded, $skipped existed"
}

function Download-Silhouettes {
    Write-Header "Downloading Aircraft Silhouettes"
    
    $outputDir = Join-Path $script:Config.AssetsDir "silhouettes"
    $types = Get-TypeCodesFromDatabase
    
    $total = $types.Count
    $current = 0
    $downloaded = 0
    $skipped = 0
    
    foreach ($type in $types) {
        $current++
        $typeUpper = $type.ToUpper()
        $outputPath = Join-Path $outputDir "$typeUpper.png"
        
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 100) {
            $skipped++
            continue
        }
        
        if ($current % 50 -eq 0) {
            Write-Progress2 -Current $current -Total $total -Status "$typeUpper ($downloaded downloaded)"
        }
        
        $url = "https://globe.airplanes.live/aircraft_sil/$typeUpper.png"
        if (Download-WithWebClient -Url $url -OutputPath $outputPath -MinSize 100) {
            $downloaded++
        }
        
        Start-Sleep -Milliseconds 30
    }
    
    Write-Host ""
    Write-Log "Silhouettes: $downloaded downloaded, $skipped existed"
}

function Download-Flags {
    Write-Header "Downloading Country Flags"
    
    $outputDir = Join-Path $script:Config.AssetsDir "flags"
    $codes = Get-CountryCodesFromDatabase
    
    $total = $codes.Count
    $current = 0
    $downloaded = 0
    $skipped = 0
    
    foreach ($code in $codes) {
        $current++
        $outputPath = Join-Path $outputDir "$code.png"
        
        if (-not $Force -and (Test-Path $outputPath) -and (Get-Item $outputPath).Length -gt 100) {
            $skipped++
            continue
        }
        
        Write-Progress2 -Current $current -Total $total -Status "$($code.ToUpper()) ($downloaded downloaded)"
        
        $url = "https://flagcdn.com/w80/$code.png"
        if (Download-WithWebClient -Url $url -OutputPath $outputPath -MinSize 100) {
            $downloaded++
        }
        
        Start-Sleep -Milliseconds 50
    }
    
    Write-Host ""
    Write-Log "Flags: $downloaded downloaded, $skipped existed"
}

# ============================================================
# GENERATE MISSING FILES
# ============================================================

function Generate-AlliancesFile {
    Write-Header "Generating Airline Alliances Data"
    
    $outputPath = Join-Path $script:Config.DataDir "airlines\alliances.csv"
    
    $allianceData = @"
ICAO,Airline,Alliance,Color
UAL,United Airlines,Star Alliance,#FFD700
ACA,Air Canada,Star Alliance,#FFD700
DLH,Lufthansa,Star Alliance,#FFD700
SAS,Scandinavian Airlines,Star Alliance,#FFD700
THA,Thai Airways,Star Alliance,#FFD700
SIA,Singapore Airlines,Star Alliance,#FFD700
ANA,All Nippon Airways,Star Alliance,#FFD700
ANZ,Air New Zealand,Star Alliance,#FFD700
TAP,TAP Air Portugal,Star Alliance,#FFD700
LOT,LOT Polish Airlines,Star Alliance,#FFD700
SWR,Swiss International,Star Alliance,#FFD700
AUA,Austrian Airlines,Star Alliance,#FFD700
THY,Turkish Airlines,Star Alliance,#FFD700
ETH,Ethiopian Airlines,Star Alliance,#FFD700
EVA,EVA Air,Star Alliance,#FFD700
AEE,Aegean Airlines,Star Alliance,#FFD700
AVA,Avianca,Star Alliance,#FFD700
CMP,Copa Airlines,Star Alliance,#FFD700
MSR,EgyptAir,Star Alliance,#FFD700
AIC,Air India,Star Alliance,#FFD700
ASA,Alaska Airlines,Oneworld,#E91E63
AAL,American Airlines,Oneworld,#E91E63
BAW,British Airways,Oneworld,#E91E63
CPA,Cathay Pacific,Oneworld,#E91E63
FIN,Finnair,Oneworld,#E91E63
IBE,Iberia,Oneworld,#E91E63
JAL,Japan Airlines,Oneworld,#E91E63
MAS,Malaysia Airlines,Oneworld,#E91E63
QFA,Qantas,Oneworld,#E91E63
QTR,Qatar Airways,Oneworld,#E91E63
RJA,Royal Jordanian,Oneworld,#E91E63
SRI,SriLankan Airlines,Oneworld,#E91E63
AFR,Air France,SkyTeam,#00BFFF
KLM,KLM Royal Dutch,SkyTeam,#00BFFF
DAL,Delta Air Lines,SkyTeam,#00BFFF
AZA,Alitalia,SkyTeam,#00BFFF
CSN,China Southern,SkyTeam,#00BFFF
CES,China Eastern,SkyTeam,#00BFFF
KAL,Korean Air,SkyTeam,#00BFFF
VIR,Virgin Atlantic,SkyTeam,#00BFFF
SVA,Saudia,SkyTeam,#00BFFF
"@
    
    Set-Content -Path $outputPath -Value $allianceData -Encoding UTF8
    Write-Log "Generated alliances.csv" "OK"
}

function Generate-CallsignPrefixFile {
    Write-Header "Generating Callsign Prefix Data"
    
    $outputPath = Join-Path $script:Config.DataDir "airlines\callsign-prefix.json"
    
    $airlinesFile = Join-Path $script:Config.DataDir "airlines\airlines.csv"
    $prefixes = @{}
    
    if (Test-Path $airlinesFile) {
        Get-Content $airlinesFile -ErrorAction SilentlyContinue | ForEach-Object {
            $parts = $_ -split ','
            if ($parts.Count -ge 5) {
                $name = ($parts[1] -replace '"', '').Trim()
                $icao = ($parts[4] -replace '"', '' -replace '\\N', '').Trim()
                if ($icao -match '^[A-Z]{3}$' -and $name) {
                    $prefixes[$icao] = $name
                }
            }
        }
    }
    
    $extras = @{
        "AAL" = "American Airlines"; "UAL" = "United Airlines"; "DAL" = "Delta Air Lines"
        "SWA" = "Southwest Airlines"; "JBU" = "JetBlue Airways"; "ASA" = "Alaska Airlines"
        "FDX" = "FedEx Express"; "UPS" = "UPS Airlines"; "GTI" = "Atlas Air"
        "BAW" = "British Airways"; "AFR" = "Air France"; "DLH" = "Lufthansa"
        "KLM" = "KLM Royal Dutch Airlines"; "UAE" = "Emirates"; "QTR" = "Qatar Airways"
        "SIA" = "Singapore Airlines"; "CPA" = "Cathay Pacific"; "QFA" = "Qantas"
    }
    
    foreach ($key in $extras.Keys) {
        if (-not $prefixes.ContainsKey($key)) {
            $prefixes[$key] = $extras[$key]
        }
    }
    
    $prefixes | ConvertTo-Json | Set-Content -Path $outputPath -Encoding UTF8
    Write-Log "Generated callsign-prefix.json with $($prefixes.Count) entries" "OK"
}

# ============================================================
# SUMMARY
# ============================================================

function Show-Summary {
    Write-Header "Download Summary"
    
    $elapsed = if ($script:Stats.StartTime) { 
        (Get-Date) - $script:Stats.StartTime 
    } else { 
        [TimeSpan]::Zero 
    }
    
    Write-Host "  RESULTS:" -ForegroundColor Yellow
    Write-Host "    Downloaded:  $($script:Stats.Downloaded)" -ForegroundColor Green
    Write-Host "    Skipped:     $($script:Stats.Skipped)" -ForegroundColor Yellow
    Write-Host "    Failed:      $($script:Stats.Failed)" -ForegroundColor $(if ($script:Stats.Failed -gt 0) { "Red" } else { "Green" })
    Write-Host "    Total size:  $("{0:N2} MB" -f ($script:Stats.TotalBytes / 1MB))" -ForegroundColor Cyan
    Write-Host "    Elapsed:     $($elapsed.ToString('hh\:mm\:ss'))" -ForegroundColor Cyan
    Write-Host ""
    
    if ($script:Stats.Errors.Count -gt 0) {
        Write-Host "  FAILED DOWNLOADS:" -ForegroundColor Red
        $script:Stats.Errors | ForEach-Object {
            Write-Host "    - $_" -ForegroundColor Red
        }
        Write-Host ""
    }
    
    Write-Host "  FOLDER CONTENTS:" -ForegroundColor Yellow
    @("data\aircraft", "data\airlines", "data\airports", "data\military", 
      "data\routes", "data\categories", "data\images",
      "assets\aircraft_photos", "assets\airlines", "assets\silhouettes", "assets\flags") | ForEach-Object {
        $dir = Join-Path $script:Config.BaseDir $_
        if (Test-Path $dir) {
            $files = Get-ChildItem $dir -File -ErrorAction SilentlyContinue
            $size = ($files | Measure-Object -Property Length -Sum).Sum
            if ($files.Count -gt 0) {
                Write-Host "    $($_): $($files.Count) files, $("{0:N1} MB" -f ($size / 1MB))" -ForegroundColor Gray
            }
        }
    }
    Write-Host ""
}

# ============================================================
# MENU
# ============================================================

function Show-Menu {
    Clear-Host
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host "       SkyTrack Complete Data Downloader v3.3" -ForegroundColor Cyan
    Write-Host "       Fixed image downloads + overnight support" -ForegroundColor DarkCyan
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Target: $($script:Config.BaseDir)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  DATA FILES ($($script:DataSources.Count) sources):" -ForegroundColor White
    Write-Host "    1) Download all data files" -ForegroundColor Gray
    Write-Host "    2) Generate alliance + callsign files" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  IMAGE ASSETS:" -ForegroundColor White
    Write-Host "    3) Download aircraft photos - 100 (test)" -ForegroundColor Gray
    Write-Host "    4) Download aircraft photos - 500" -ForegroundColor Gray
    Write-Host "    5) Download aircraft photos - ALL (~3 hours)" -ForegroundColor Gray
    Write-Host "    6) Download airline logos" -ForegroundColor Gray
    Write-Host "    7) Download silhouettes + flags" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  BATCH OPTIONS:" -ForegroundColor White
    Write-Host "    8) Data + quick images (recommended first run)" -ForegroundColor Green
    Write-Host "    9) Download EVERYTHING (data + all photos)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    S) Show statistics" -ForegroundColor Gray
    Write-Host "    F) Toggle force mode (re-download existing)" -ForegroundColor Gray
    Write-Host "    D) Change photo delay (current: $($script:Config.PhotoDelayMs)ms)" -ForegroundColor Gray
    Write-Host "    Q) Quit" -ForegroundColor Gray
    Write-Host ""
    
    return Read-Host "  Select option"
}

# ============================================================
# MAIN
# ============================================================

Initialize-Logging
Initialize-Directories

if ($DataOnly -or $ImagesOnly) {
    $script:Stats.StartTime = Get-Date
    
    if ($DataOnly) {
        Download-AllDataFiles
        Generate-AlliancesFile
        Generate-CallsignPrefixFile
    }
    
    if ($ImagesOnly) {
        Download-AirlineLogos
        Download-Silhouettes
        Download-Flags
        Download-AircraftPhotos
    }
    
    Show-Summary
    exit
}

while ($true) {
    $choice = Show-Menu
    $script:Stats.StartTime = Get-Date
    $script:Stats.Downloaded = 0
    $script:Stats.Skipped = 0
    $script:Stats.Failed = 0
    $script:Stats.TotalBytes = 0
    $script:Stats.Errors.Clear()
    
    switch ($choice.ToUpper()) {
        "1" {
            Download-AllDataFiles
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "2" {
            Generate-AlliancesFile
            Generate-CallsignPrefixFile
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "3" {
            Download-AircraftPhotos -Limit 100
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "4" {
            Download-AircraftPhotos -Limit 500
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "5" {
            Download-AircraftPhotos -Limit 0
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "6" {
            Download-AirlineLogos
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "7" {
            Download-Silhouettes
            Download-Flags
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "8" {
            Download-AllDataFiles
            Generate-AlliancesFile
            Generate-CallsignPrefixFile
            Download-AirlineLogos
            Download-Silhouettes
            Download-Flags
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "9" {
            Download-AllDataFiles
            Generate-AlliancesFile
            Generate-CallsignPrefixFile
            Download-AirlineLogos
            Download-Silhouettes
            Download-Flags
            Download-AircraftPhotos -Limit 0
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "S" {
            Show-Summary
            Read-Host "`n  Press Enter to continue..."
        }
        "F" {
            $script:Force = -not $script:Force
            Write-Host "`n  Force mode: $(if($script:Force){'ENABLED'}else{'DISABLED'})" -ForegroundColor Yellow
            Read-Host "  Press Enter to continue..."
        }
        "D" {
            $newDelay = Read-Host "`n  Enter delay in ms (current: $($script:Config.PhotoDelayMs))"
            if ($newDelay -match '^\d+$') {
                $script:Config.PhotoDelayMs = [int]$newDelay
                Write-Host "  Delay set to $($script:Config.PhotoDelayMs)ms" -ForegroundColor Green
            }
            Read-Host "  Press Enter to continue..."
        }
        "Q" {
            Write-Host "`n  Goodbye!" -ForegroundColor Cyan
            exit
        }
        default {
            Write-Host "`n  Invalid option" -ForegroundColor Red
            Read-Host "  Press Enter..."
        }
    }
}
