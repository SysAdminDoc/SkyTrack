# SkyTrack Project Analysis & Improvement Roadmap

## Current State Analysis

### What You're Self-Hosting (GitHub Repo)

| Category | File | Source | Status |
|----------|------|--------|--------|
| **Aircraft** | registrations.json | tar1090-db | ✅ Self-hosted |
| **Aircraft** | types.json | tar1090-db | ✅ Self-hosted |
| **Aircraft** | interesting.csv | plane-alert-db | ✅ Self-hosted |
| **Military** | plane-alert-mil.csv | plane-alert-db | ✅ Self-hosted |
| **Military** | plane-alert-gov.csv | plane-alert-db | ✅ Self-hosted |
| **Military** | plane-alert-pol.csv | plane-alert-db | ✅ Self-hosted |
| **Airlines** | airlines.csv | OpenFlights | ✅ Self-hosted |
| **Airports** | airports.csv | OurAirports | ✅ Self-hosted |

### What v3.1 Added (May Need Self-Hosting)

| Category | File | Currently From | Self-Host? |
|----------|------|----------------|------------|
| **Aircraft** | icao_types.json | tar1090-db (live) | Should self-host |
| **Military** | plane-alert-pia.csv | plane-alert-db (live) | Should self-host |
| **Airports** | frequencies.csv | OurAirports (live) | Should self-host |
| **Airports** | countries.csv | OurAirports (live) | Should self-host |
| **Airports** | regions.csv | OurAirports (live) | Should self-host |
| **Airports** | navaids.csv | OurAirports (live) | Should self-host |
| **Routes** | routes.csv | OpenFlights (live) | Should self-host |
| **Airlines** | alliances.csv | OpenFlights (live) | Should self-host |
| **Extra** | callsign-prefix.json | tar1090-db (live) | Should self-host |
| **Extra** | operators.json | tar1090-db (live) | Should self-host |
| **Extra** | mil-ranges.json | tar1090-db (live) | Should self-host |

### Image Assets Status

| Asset | Source | Self-Hosted? | Notes |
|-------|--------|--------------|-------|
| Aircraft Photos | Planespotters API | Partial | Downloaded ~8K, API for rest |
| Airline Logos | airplanes.live | Should be | Download all ~2K |
| Silhouettes | airplanes.live | Should be | Download all ~1K |
| Country Flags | flagcdn.com | Should be | Download all ~250 |
| Airport Photos | Wikipedia API | No | Can't easily pre-download |

---

## Datasets You're NOT Self-Hosting (But Could)

### 1. Additional plane-alert-db Files

| File | URL | Records | Use Case |
|------|-----|---------|----------|
| `plane-alert-twitter-blocked.csv` | [Link](https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-twitter-blocked.csv) | ~200 | Aircraft that requested Twitter tracking removal |
| `plane_images.csv` | [Link](https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane_images.csv) | ~12K | Direct image URLs (many broken) |
| `plane-alert-mil-images.csv` | [Link](https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil-images.csv) | ~2K | Military aircraft images |

### 2. Additional OurAirports Files

| File | URL | Records | Use Case |
|------|-----|---------|----------|
| `runways.csv` | [Link](https://davidmegginson.github.io/ourairports-data/runways.csv) | ~45K | Runway info (length, surface, ILS) |
| `airport-comments.csv` | [Link](https://davidmegginson.github.io/ourairports-data/airport-comments.csv) | ~10K | User notes about airports |

### 3. FAA Data (US Only)

| Dataset | Source | Records | Use Case |
|---------|--------|---------|----------|
| Aircraft Registry | [FAA ReleasableDB](https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download) | ~300K | N-number owner info, address, serial |
| Aircraft Reference | Same | ~900 | Type certificate data |
| Engine Reference | Same | ~1K | Engine specifications |
| Dealer Registry | Same | ~2K | Aircraft dealers |

### 4. Additional tar1090-db Files

| File | URL | Use Case |
|------|-----|----------|
| `icao_aircraft_types2.json` | [Link](https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/icao_aircraft_types2.json) | Alternative type format |
| `dbversion.json` | [Link](https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/dbversion.json) | Version tracking |

### 5. Airframe Data

| Source | URL | Use Case |
|--------|-----|----------|
| Planespotters.net Production List | Web scraping required | Serial numbers, delivery dates, fleet history |
| JetPhotos Database | API/scraping | Higher quality photos |
| Airport-Data.com | API | Aircraft history, incidents |

---

## What CANNOT Be Self-Hosted

These require real-time APIs and can't be pre-downloaded:

| Service | Why Not Self-Hostable |
|---------|----------------------|
| ADS-B Feeds (adsb.lol, airplanes.live, adsb.fi) | Real-time aircraft positions |
| Trail/Trace Data | Historical positions, constantly updating |
| Weather Radar Tiles | Real-time weather data |
| Map Tiles | Massive datasets (petabytes) |
| Wikipedia API | Dynamic content, legal issues |
| Planespotters API | New photos added daily |

---

## Project Improvement Ideas

### Tier 1: Quick Wins (Easy, High Impact)

| Improvement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| **Complete self-hosting** | 1 hr | High | Run your downloader to get ALL datasets locally |
| **Add FAA N-number lookup** | 2 hrs | High | Show owner name for US aircraft |
| **Runway information** | 2 hrs | Medium | Show runway length/heading in airport panel |
| **Keyboard shortcuts** | 1 hr | Medium | Press 'F' to follow, 'Esc' to deselect, etc. |
| **URL sharing** | 1 hr | High | `skytrack.com/?hex=A12345` links to specific aircraft |
| **PWA manifest** | 30 min | Medium | "Install" as mobile app |

### Tier 2: Medium Effort Features

| Improvement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| **Flight alerts** | 4 hrs | High | Browser notification when specific aircraft appears |
| **Multi-select tracking** | 4 hrs | Medium | Track multiple aircraft simultaneously |
| **Export to GPX/KML** | 2 hrs | Medium | Download flight path for Google Earth |
| **Airspace overlay** | 6 hrs | Medium | Show Class B/C/D airspace boundaries |
| **TFR display** | 4 hrs | Medium | Show temporary flight restrictions |
| **Distance measuring** | 2 hrs | Low | Click two points to measure |
| **Aircraft comparison** | 3 hrs | Low | Side-by-side specs of two types |

### Tier 3: Advanced Features

| Improvement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| **Flight replay** | 8 hrs | High | Playback historical flights with timeline scrubber |
| **Pattern analysis** | 12 hrs | Medium | Detect holding patterns, go-arounds, diversions |
| **Heatmap mode** | 6 hrs | Medium | Show traffic density over time |
| **3D view** | 20 hrs | High | Cesium.js integration for 3D globe |
| **Audio integration** | 8 hrs | Medium | LiveATC.net audio for selected airport |
| **METAR/TAF display** | 4 hrs | Medium | Weather conditions at airports |
| **Approach plate viewer** | 6 hrs | Low | Show IAPs for airports |

### Tier 4: Infrastructure Improvements

| Improvement | Effort | Impact | Description |
|-------------|--------|--------|-------------|
| **Service Worker** | 4 hrs | High | Offline mode, background sync |
| **IndexedDB storage** | 6 hrs | Medium | Store more data locally than localStorage |
| **Web Workers** | 8 hrs | Medium | Process data without blocking UI |
| **WebSocket feeds** | 12 hrs | High | Real-time updates instead of polling |
| **Backend API** | 20+ hrs | High | Node.js backend for data aggregation |

---

## Recommended Improvements by Priority

### Immediate (Do Now)

1. **Self-host all datasets** - Run the downloader to get everything locally
2. **Add URL sharing** - Deep links to specific aircraft
3. **Keyboard shortcuts** - Better UX

### Short Term (This Week)

4. **FAA registry lookup** - Show N-number owners
5. **Runway information** - Enhance airport panel
6. **Flight alerts** - Notify for specific aircraft
7. **PWA support** - Installable on mobile

### Medium Term (This Month)

8. **Export functionality** - GPX/KML export
9. **Airspace overlays** - Show airspace boundaries
10. **Multi-aircraft tracking** - Follow several at once
11. **Service Worker** - Offline capability

### Long Term (Future)

12. **Flight replay** - Historical playback
13. **3D view** - Globe visualization
14. **Backend API** - Aggregate multiple data sources
15. **User accounts** - Save preferences, watchlists

---

## New Data Integration Ideas

### 1. FAA Aircraft Registry Integration

```javascript
// Add to DATA_URLS
faaRegistry: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/main/data/faa/MASTER.csv',

// New database object
const faaDB = {
    aircraft: new Map(),
    async init() { /* parse MASTER.csv */ },
    getByNNumber(nNumber) {
        return this.aircraft.get(nNumber.replace('-', '').toUpperCase());
    },
    // Returns: { name, street, city, state, zip, serialNumber, mfrYear, ... }
};
```

**Adds to info panel:**
- Owner name
- Owner city/state
- Serial number
- Year manufactured
- Airworthiness date

### 2. Runway Information

```javascript
// Add runway display to airport panel
const runwayDB = {
    runways: new Map(), // airport_ident -> array of runways
    async init() { /* parse runways.csv */ },
    getByAirport(icao) {
        return this.runways.get(icao) || [];
    }
};

// In airport panel:
// RWY 09L/27R: 12,000 ft x 150 ft, ILS, Asphalt
// RWY 04/22: 8,500 ft x 100 ft, Concrete
```

### 3. METAR/TAF Weather

```javascript
// Free METAR API
async function getWeather(icao) {
    const resp = await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`);
    const data = await resp.json();
    return data[0]; // { rawOb, temp, dewp, wdir, wspd, visib, ... }
}

// Display in airport panel:
// Weather: VFR, 25°C, Wind 270@12kt, Vis 10+ mi
```

### 4. LiveATC Audio Integration

```javascript
// Add audio player for airport frequencies
function playLiveATC(icao) {
    const feedUrl = `https://www.liveatc.net/search/?icao=${icao}`;
    // Open in modal or new tab
    // Note: Requires LiveATC account for direct streaming
}
```

### 5. Historical Flight Database

Build your own flight history by logging every aircraft seen:

```javascript
// Log to IndexedDB
const flightHistoryDB = {
    async logPosition(hex, lat, lon, alt, ts) {
        // Store in IndexedDB
        // Over time, builds complete flight histories
    },
    async getHistory(hex, startDate, endDate) {
        // Retrieve past flights
    }
};
```

---

## Updated Repository Structure

```
SkyTrack/
├── index.html                 # Main application
├── manifest.json              # PWA manifest
├── sw.js                      # Service worker
├── assets/
│   ├── aircraft_photos/       # ~8,000 photos
│   ├── airlines/              # ~2,000 logos
│   ├── silhouettes/           # ~1,000 type images
│   ├── flags/                 # ~250 country flags
│   └── icons/                 # App icons
├── data/
│   ├── aircraft/
│   │   ├── registrations.json
│   │   ├── types.json
│   │   ├── icao_types.json
│   │   ├── interesting.csv
│   │   └── plane_images.csv
│   ├── airlines/
│   │   ├── airlines.csv
│   │   └── alliances.csv
│   ├── airports/
│   │   ├── airports.csv
│   │   ├── runways.csv
│   │   ├── frequencies.csv
│   │   ├── countries.csv
│   │   ├── regions.csv
│   │   └── navaids.csv
│   ├── military/
│   │   ├── plane-alert-mil.csv
│   │   ├── plane-alert-gov.csv
│   │   ├── plane-alert-pol.csv
│   │   ├── plane-alert-pia.csv
│   │   └── twitter-blocked.csv
│   ├── routes/
│   │   ├── routes.csv
│   │   └── equipment.csv
│   ├── faa/                   # NEW: FAA data
│   │   ├── MASTER.csv         # Aircraft registry
│   │   ├── ACFTREF.csv        # Type reference
│   │   └── ENGINE.csv         # Engine reference
│   └── extra/
│       ├── callsign-prefix.json
│       ├── operators.json
│       └── mil-ranges.json
├── tools/
│   ├── SkyTrack_Downloader.ps1
│   └── update_databases.ps1   # Scheduled update script
└── docs/
    ├── README.md
    ├── CHANGELOG.md
    └── API.md
```

---

## Automated Update Script

Create a script to keep databases current:

```powershell
# update_databases.ps1 - Run weekly via Task Scheduler

$BaseDir = "C:\Users\Admin\Documents\GitHub\SkyTrack"

# Sources that update frequently
$Updates = @{
    "data/aircraft/interesting.csv" = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv"
    "data/military/plane-alert-mil.csv" = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-mil.csv"
    "data/military/plane-alert-gov.csv" = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-gov.csv"
    "data/military/plane-alert-pol.csv" = "https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-pol.csv"
    "data/airports/airports.csv" = "https://davidmegginson.github.io/ourairports-data/airports.csv"
}

foreach ($file in $Updates.Keys) {
    $url = $Updates[$file]
    $path = Join-Path $BaseDir $file
    Write-Host "Updating $file..."
    Invoke-WebRequest -Uri $url -OutFile $path
}

# Git commit and push
Set-Location $BaseDir
git add -A
git commit -m "Auto-update databases $(Get-Date -Format 'yyyy-MM-dd')"
git push

Write-Host "Database update complete!"
```

---

## Summary

### Datasets to Self-Host Now

| Priority | Dataset | Action |
|----------|---------|--------|
| **HIGH** | icao_types.json | Run downloader |
| **HIGH** | callsign-prefix.json | Run downloader |
| **HIGH** | All image assets | Run downloader |
| **MEDIUM** | runways.csv | Add to downloader |
| **MEDIUM** | FAA MASTER.csv | Manual download + parse |
| **LOW** | twitter-blocked.csv | Add to downloader |

### Top 5 Feature Improvements

1. **FAA owner lookup** - Show who owns N-registered aircraft
2. **Flight alerts** - Notifications for watchlisted aircraft
3. **URL sharing** - Direct links to specific aircraft
4. **Offline mode** - Service worker + cached data
5. **Flight replay** - Playback historical flights

### Cannot Self-Host

- Real-time ADS-B feeds
- Live weather radar
- Map tiles
- Trail/trace data
- Dynamic API data (Wikipedia, Planespotters)
