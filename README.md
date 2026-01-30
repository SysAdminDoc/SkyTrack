# ✈️ SkyTrack - Live Flight Tracker

A powerful real-time aircraft tracking application. Track commercial flights, military aircraft, helicopters, cargo planes, and private aircraft on an interactive map with advanced filtering, alerts, and analysis tools.

<div align="center">

### ✈️ [**Launch SkyTrack**](https://sysadmindoc.github.io/SkyTrack/) ✈️

[![Live Demo](https://img.shields.io/badge/🔴_LIVE-Track_Flights-0a66c2?style=for-the-badge&logoColor=white)](https://sysadmindoc.github.io/SkyTrack/)

</div>

<img width="1683" height="918" alt="SkyTrack Screenshot" src="https://github.com/user-attachments/assets/4252b34a-de6d-4ee2-8ac5-97b60d0b26fb" />

## 🌟 Features

### Core Tracking
- **Real-time Aircraft Tracking** — Live positions updated every 5 seconds
- **Multiple Data Sources** — Automatic failover between OpenSky Network, ADSB.lol, and Airplanes.live
- **Aircraft Categories** — Filter by Commercial, Military, Cargo, Cessna, Private, Helicopter, or Ground vehicles
- **Flight Trails** — View complete flight paths from takeoff to current position
- **Aircraft Photos** — Automatic photo lookup via Planespotters.net
- **Airline Banners** — Display airline logos for commercial flights
- **Aircraft Labels** — Toggleable callsign labels on the map

### Special Aircraft Detection
- **Military Aircraft** — Automatic detection via hex codes and type
- **Government/State Aircraft** — Highlighted with special badges
- **Police & Law Enforcement** — Identified and tracked
- **Medical/Air Ambulance** — Emergency aircraft highlighted
- **Historic Aircraft** — Classic and vintage planes flagged
- **VIP Aircraft** — Notable aircraft with special indicators
- **PIA (Privacy/Interesting Aircraft)** — Tracked aircraft of interest

### Advanced Analysis
- **Multi-Select Mode** — Select multiple aircraft simultaneously
- **Comparison Panel** — Side-by-side comparison of selected aircraft stats
- **Statistics Dashboard** — Real-time stats with charts and records
- **Watchlist** — Track specific aircraft with alerts when spotted
- **Notification Center** — Centralized alerts for watchlist, geofence, and emergency events

### Airport Features
- **Airport Information Panel** — Detailed airport data with frequencies
- **Arrivals/Departures Board** — Live flight board for selected airports
- **Runway Visualization** — See runway layouts on the map
- **NOTAMs Display** — View active notices for airports
- **LiveATC Integration** — Quick link to live ATC audio feeds

### Time & History
- **Time Machine** — Replay historical flight data with playback controls
- **History Indicator** — See when viewing historical vs. live data
- **Session Statistics** — Track your viewing session stats

### Geofencing & Alerts
- **Custom Geofences** — Draw zones on the map to monitor
- **Entry/Exit Alerts** — Get notified when aircraft enter or leave zones
- **Zone Management** — Save, edit, and organize monitoring zones
- **Emergency Squawk Detection** — Automatic alerts for 7500/7600/7700

### Weather & Environment
- **Weather Radar** — RainViewer precipitation overlay
- **Satellite View** — Toggle between dark map and satellite imagery
- **Wind Barbs** — Optional wind data display
- **SIGMET Warnings** — Significant meteorological information

### Mobile Experience
- **Responsive Design** — Full-featured mobile interface
- **Bottom Sheet Navigation** — Native-feeling mobile UI
- **Touch Gestures** — Swipe and pinch controls
- **Haptic Feedback** — Tactile responses on supported devices
- **PWA Support** — Install as a standalone app

### Reliability & Offline
- **Offline Mode** — View cached data when connection is lost
- **Circuit Breakers** — Automatic failover between data sources
- **Data Source Health Monitor** — Real-time source status indicator
- **Error Recovery** — Automatic retry and reconnection
- **Position Caching** — Recent positions stored for offline viewing

### Capture & Export
- **Screenshots** — Capture current map view
- **Screen Recording** — Record tracking sessions
- **Export Data** — Save aircraft data for analysis

### Customization
- **Theme System** — Dark, light, and custom color themes
- **Layout Presets** — Save and load UI configurations
- **Mini-map** — Optional overview map
- **Clustering** — Group markers in dense areas
- **Configurable Update Intervals** — Adjust refresh rates

## 🛠️ Technologies

- **Vanilla JavaScript** — No frameworks required
- **Leaflet.js** — Interactive mapping
- **OpenStreetMap / Esri** — Map tiles
- **Service Worker** — PWA and offline support
- **CORS Proxies** — For cross-origin API requests

## 📡 Data Sources

| Source | Data Type | CORS Support |
|--------|-----------|--------------|
| [OpenSky Network](https://opensky-network.org/) | Aircraft positions | ✅ Native |
| [ADSB.lol](https://adsb.lol/) | Aircraft positions, trails | Via proxy |
| [Airplanes.live](https://airplanes.live/) | Aircraft positions, trails | Via proxy |
| [Planespotters.net](https://www.planespotters.net/) | Aircraft photos | Via proxy |
| [RainViewer](https://www.rainviewer.com/) | Weather radar | ✅ Native |

## 📦 Installation

### Option 1: GitHub Pages (Recommended)

1. Fork this repository
2. Enable GitHub Pages in repository settings
3. Access at `https://yourusername.github.io/SkyTrack/`

### Option 2: Local

```bash
git clone https://github.com/SysAdminDoc/SkyTrack.git
cd SkyTrack
# Open index.html in your browser, or serve locally:
npx serve .
```

### Option 3: Install as PWA

Visit the live demo and click "Install" when prompted, or use your browser's install option.

## 🎮 Usage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `?` | Show keyboard shortcuts |
| `Space` | Toggle play/pause (Time Machine) |
| `F` | Toggle fullscreen |
| `L` | Toggle aircraft labels |
| `T` | Toggle trails |
| `M` | Toggle multi-select mode |
| `S` | Open statistics |
| `W` | Open watchlist |
| `Esc` | Close panels / Exit modes |
| `Ctrl+Shift+D` | Log data source stats |

### Controls

| Button | Function |
|--------|----------|
| ☀️/🌙 | Toggle day/night theme |
| T | Toggle aircraft labels |
| 🌧️ | Toggle weather radar |
| 📍 | Center on your location |
| ⚙️ | Open settings panel |
| 📊 | Open statistics |
| 🔔 | Notification center |
| 📷 | Screenshot/Recording menu |

### Filters

Click category buttons to filter aircraft:
- **All** — Show all aircraft
- **Commercial** — Airlines and scheduled flights
- **Military** — Military aircraft (AE/AF hex codes)
- **Cargo** — Freight carriers (FedEx, UPS, etc.)
- **Cessna** — All Cessna aircraft models
- **Private** — General aviation and business jets
- **Heli** — Helicopters
- **Ground** — Ground vehicles and taxiing aircraft

### Aircraft Details

Click any aircraft to view:
- Aircraft photo or silhouette
- Callsign, registration, and operator
- Altitude, speed, heading, vertical speed
- Aircraft type and category
- Squawk code with alert detection
- Complete flight trail
- Wikipedia summary (when available)
- External links (FlightAware, FR24, ADSBx, etc.)

## ⚙️ Configuration

Edit the `CONFIG` object to customize:

```javascript
const CONFIG = {
    updateInterval: 5000,        // Position update interval (ms)
    defaultLat: 28.5,            // Default map center latitude
    defaultLon: -81.5,           // Default map center longitude
    defaultZoom: 8,              // Default zoom level
    maxTrailPoints: 500,         // Maximum trail history points
    enableClustering: true,      // Group markers in dense areas
    enableOfflineMode: true,     // Cache data for offline use
    // ... more options
};
```

## 🔧 CORS Proxy Configuration

The application uses CORS proxies for APIs without cross-origin support:

1. `api.allorigins.win`
2. `corsproxy.io`
3. `api.codetabs.com`

Circuit breakers automatically cycle through alternatives on failure.

## 📋 Aircraft Classification

Aircraft are classified using multiple methods:

- **Hex prefix** — AE/AF prefixes indicate US military
- **Type codes** — ICAO aircraft type designators
- **Callsign prefixes** — Airline/operator identification
- **ADS-B category** — A1 (light), A2 (small), A7 (helicopter), etc.
- **Database flags** — Military, government, and special flags
- **Registration patterns** — Country and operator identification

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License — See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenSky Network](https://opensky-network.org/) for free aircraft data API
- [ADSB.lol](https://adsb.lol/) for ADS-B aggregation
- [Airplanes.live](https://airplanes.live/) for additional aircraft data
- [Planespotters.net](https://www.planespotters.net/) for aircraft photography
- [RainViewer](https://www.rainviewer.com/) for weather radar API
- [Leaflet](https://leafletjs.com/) for the mapping library
- [LiveATC](https://www.liveatc.net/) for ATC audio feeds

---

<div align="center">

Made with ☕ and ✈️

**SkyTrack v3.9** — Track flights like a pro.

[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222?style=flat-square&logo=github)](https://sysadmindoc.github.io/SkyTrack/)

</div>
