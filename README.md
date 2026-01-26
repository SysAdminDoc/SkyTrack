# ✈️ SkyTrack - Live Flight Tracker

A real-time aircraft tracker. Track commercial flights, military aircraft, helicopters, cargo planes, and private aircraft on an interactive map.

<img width="1683" height="918" alt="2026-01-25 21_34_01-SkyTrack - Live Flight Tracker - Chromium" src="https://github.com/user-attachments/assets/4252b34a-de6d-4ee2-8ac5-97b60d0b26fb" />


## 🌟 Features

- **Real-time Aircraft Tracking** - Live positions updated every 5 seconds
- **Multiple Data Sources** - Automatic failover between OpenSky Network, ADSB.lol, and Airplanes.live
- **Aircraft Categories** - Filter by Commercial, Military, Cargo, Cessna, Private, Helicopter, or Ground vehicles
- **Flight Trails** - View complete flight paths from takeoff to current position
- **Aircraft Photos** - Automatic photo lookup via Planespotters.net
- **Airline Banners** - Display airline logos for commercial flights
- **Weather Radar** - Optional RainViewer overlay for precipitation
- **Satellite View** - Toggle between dark map and satellite imagery
- **Aircraft Labels** - Toggleable callsign labels on the map
- **Responsive Design** - Works on desktop and mobile devices

## 🚀 Live Demo

[View Live Demo](https://sysadmindoc.github.io/SkyTrack/)

## 🛠️ Technologies

- **Vanilla JavaScript** - No frameworks required
- **Leaflet.js** - Interactive mapping
- **OpenStreetMap / Esri** - Map tiles
- **CORS Proxies** - For cross-origin API requests from static hosting

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
3. Access at `https://yourusername.github.io/skytrack/`

### Option 2: Local

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/skytrack.git
   ```

2. Open `skytrack.html` in your browser

   Or serve locally:
   ```bash
   npx serve .
   ```

## 🎮 Usage

### Controls

| Button | Function |
|--------|----------|
| ☀️ | Toggle satellite view |
| T | Toggle aircraft labels |
| 🔘 | Toggle weather radar |
| 📍 | Center on your location |
| ⚙️ | Open settings panel |

### Filters

Click category buttons to filter aircraft:
- **All** - Show all aircraft
- **Commercial** - Airlines and scheduled flights
- **Military** - Military aircraft (AE/AF hex codes)
- **Cargo** - Freight carriers (FedEx, UPS, etc.)
- **Cessna** - All Cessna aircraft models
- **Private** - General aviation and business jets
- **Heli** - Helicopters
- **Ground** - Ground vehicles and taxiing aircraft

### Aircraft Details

Click any aircraft to view:
- Aircraft photo or silhouette
- Callsign and registration
- Altitude, speed, heading, vertical speed
- Aircraft type and category
- Squawk code
- Complete flight trail from takeoff

## ⚙️ Configuration

Edit the `CONFIG` object in `skytrack.html` to customize:

```javascript
const CONFIG = {
    updateInterval: 5000,        // Position update interval (ms)
    defaultLat: 28.5,            // Default map center latitude
    defaultLon: -81.5,           // Default map center longitude
    defaultZoom: 8,              // Default zoom level
    maxTrailPoints: 500,         // Maximum trail history points
    // ... more options
};
```

## 🔧 CORS Proxy Configuration

The application uses CORS proxies to access APIs that don't support cross-origin requests. Current proxies:

1. `api.allorigins.win`
2. `corsproxy.io`
3. `api.codetabs.com`

If proxies fail, the app automatically cycles through alternatives.

## 📋 Aircraft Classification

Aircraft are classified using multiple methods:

- **Hex prefix** - AE/AF prefixes indicate US military
- **Type codes** - ICAO aircraft type designators
- **Callsign prefixes** - Airline/operator identification
- **ADS-B category** - A1 (light), A2 (small), A7 (helicopter), etc.
- **Database flags** - Military flag in aircraft databases

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [OpenSky Network](https://opensky-network.org/) for free aircraft data API
- [ADSB.lol](https://adsb.lol/) for ADS-B aggregation
- [Planespotters.net](https://www.planespotters.net/) for aircraft photography
- [RainViewer](https://www.rainviewer.com/) for weather radar API
- [Leaflet](https://leafletjs.com/) for the mapping library

---

Made with ☕ and ✈️
