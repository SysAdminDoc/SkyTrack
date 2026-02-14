# SkyTrack

![Version](https://img.shields.io/badge/version-0.16.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Web-4285F4)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020+-F7DF1E?logo=javascript&logoColor=black)
![Status](https://img.shields.io/badge/status-active-success)

> Real-time global aircraft tracker with 3D globe view, military/VIP detection, and comprehensive aviation intelligence — all in a single HTML file.

![Screenshot](screenshot.png)

## Quick Start

**Hosted:** Visit [sysadmindoc.github.io/SkyTrack](https://sysadmindoc.github.io/SkyTrack)

**Self-hosted:**
```bash
git clone https://github.com/SysAdminDoc/SkyTrack.git
cd SkyTrack
# Open index.html in any browser — no build step, no dependencies
```

SkyTrack is a zero-dependency, single-file web application. No npm, no bundler, no server required. Just open `index.html`.

## Features

### Aircraft Tracking

| Feature | Description |
|---------|-------------|
| Multi-Source ADS-B | Parallel data from Airplanes.live, ADSB One, and ADSB.lol with automatic failover |
| Grid Fetch | Viewport-tiled API requests for global coverage — see every plane in the sky |
| Smooth Animation | Interpolated movement on 2D map via `requestAnimationFrame`, SampledPositionProperty on 3D globe |
| History Trails | Altitude-colored flight paths with local + API trace data |
| Aircraft Photos | Auto-fetched from planespotters.net with preloaded image database |
| Trail Export | Export flight paths as KML or GeoJSON |
| Share Flight | Generate shareable links for specific aircraft |
| Historical Playback | Scrub through recorded flight paths with playback controls |

### 3D Globe View

| Feature | Description |
|---------|-------------|
| CesiumJS Globe | Full 3D Earth with terrain, atmosphere, and satellite imagery |
| Procedural 3D Models | Runtime-generated GLB airplane models with tubular fuselage, swept wings, tail, and engine nacelles |
| Smooth Interpolation | Aircraft glide between position updates using Cesium's SampledPositionProperty |
| 3D Trails | Flight history rendered as altitude-accurate polylines on the globe |
| Type-Based Scaling | Heavy (A380, B747): large, Medium (A320, B737): mid, GA: small |
| Altitude Coloring | Ground through cruise altitude mapped to a color gradient |
| Click Selection | Click any 3D aircraft to select and view details |

### Intelligence & Detection

| Feature | Description | Database Size |
|---------|-------------|---------------|
| Military Detection | Identifies military aircraft by hex range and registration database | 11,383 aircraft + 7 hex ranges |
| VIP/Government | Tracks heads of state, government, and notable private aircraft | 12,420 aircraft |
| PIA Detection | Privacy ICAO Address — identifies aircraft using anonymized transponders | 94 aircraft |
| Interesting Aircraft | Flagged aircraft of special interest (chase planes, test aircraft, etc.) | 4,530+ aircraft |
| Civilian Categories | Categorized civilian fleet with type/operator data | Self-hosted DB |

### Airport Intelligence

| Feature | Description |
|---------|-------------|
| 49,000+ Airports | Global airport database with ICAO/IATA codes, coordinates, and metadata |
| Arrival/Departure Boards | Real-time boards for any airport showing inbound and outbound traffic |
| Frequencies | Tower, ground, approach, ATIS frequencies for 11,000+ airports |
| Runway Visualization | Rendered runway outlines on the map |
| NOTAMs | Notices to Air Missions for selected airports |
| LiveATC | Direct links to live ATC audio feeds |
| METAR/TAF | Current weather observations and forecasts for airports |

### Airline & Route Data

| Feature | Description |
|---------|-------------|
| 5,800+ Airlines | ICAO/IATA codes, names, callsigns, and country data |
| 5,774 Callsign Prefixes | Decode any flight callsign to airline and route |
| Alliance Memberships | Star Alliance, oneworld, SkyTeam identification |
| Route Prediction | Predicts origin/destination based on flight path analysis |
| Route Database | Known routes for 568 airlines |

### Map & Visualization

| Feature | Description |
|---------|-------------|
| Multiple Map Styles | Dark CartoDB, satellite, OpenStreetMap, and more |
| Traffic Heatmap | Density visualization of aircraft positions |
| Airspace Overlays | Class B airspace boundaries, restricted areas, TFRs, MOAs |
| Weather Radar | Precipitation overlay from RainViewer |
| Mini-Map | Picture-in-picture overview map |
| Distance Measurement | Click-to-measure great-circle distances |
| Aircraft Clustering | Group dense traffic into expandable clusters |

### Monitoring & Alerts

| Feature | Description |
|---------|-------------|
| Watchlist | Track specific hex codes or registrations with real-time alerts |
| Military Alerts | Configurable radius-based alerts for military activity |
| Notification Center | Centralized alert history with sound and desktop notifications |
| Bookmarks | Save and quick-jump to map locations |

### Search & Analysis

| Feature | Description |
|---------|-------------|
| Advanced Search | Search by hex, registration, callsign, type, airline, or airport |
| Multi-Select | Ctrl+click to select multiple aircraft for comparison |
| Comparison Panel | Side-by-side analysis of selected aircraft |
| Altitude Chart | Live altitude profile with climb/descent phases |
| Time Machine | Browse historical aircraft positions |

### UI & Experience

| Feature | Description |
|---------|-------------|
| Themes | Dark, Midnight, Light, High Contrast, Color Blind |
| Compact Mode | Dense layout for smaller screens |
| Mobile Optimized | Touch gestures, responsive panels, swipe navigation |
| Offline Mode | ServiceWorker caching for use without internet |
| Dashboard Layouts | Configurable panel positions — Default, Minimal, Analyst presets |
| External Links | Quick links to FlightAware, FlightRadar24, ADS-B Exchange, Wikipedia |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        index.html (single file)                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │ Data Sources │───>│ Grid Fetch      │───>│ Aircraft Cache  │  │
│  │             │    │ System          │    │                 │  │
│  │ airplanes.  │    │ Viewport tiles  │    │ Dedup + enrich  │  │
│  │ live        │    │ Parallel fetch  │    │ with databases  │  │
│  │ adsb.one    │    │ Rate limiting   │    │                 │  │
│  │ adsb.lol    │    │ CORS proxy      │    │                 │  │
│  └─────────────┘    └─────────────────┘    └────────┬────────┘  │
│                                                      │          │
│            ┌─────────────────────────────────────────┤          │
│            │                                         │          │
│            v                                         v          │
│  ┌─────────────────┐                      ┌─────────────────┐  │
│  │ 2D Map (Leaflet)│                      │3D Globe (Cesium)│  │
│  │                 │                      │                 │  │
│  │ Smooth markers  │   ◄── Toggle ──►    │ GLB models      │  │
│  │ Altitude trails │                      │ Interpolation   │  │
│  │ Clusters/heat   │                      │ 3D trails       │  │
│  │ Airspace layers │                      │ Terrain/sat     │  │
│  └─────────────────┘                      └─────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Intelligence Layer                                        │   │
│  │ Military DB │ VIP DB │ PIA DB │ Airlines │ Airports │ ... │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ UI: Search │ Alerts │ Watchlist │ Compare │ Settings      │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

## Data Sources

SkyTrack fetches live ADS-B data from multiple free APIs with automatic failover:

| Source | CORS | Priority | Coverage |
|--------|------|----------|----------|
| [Airplanes.live](https://airplanes.live) | Yes | Primary | Global |
| [ADSB One](https://adsb.one) | Yes | Secondary | Global |
| [ADSB.lol](https://adsb.lol) | No (proxied) | Tertiary | Global |

The grid fetch system tiles the visible map area with overlapping 250nm radius API queries, distributing requests across sources at 1 req/sec per API. At global zoom, this covers the entire planet in ~16 seconds with progressive loading.

## Configuration

### Cesium Ion Token (Optional)
For 3D terrain in globe view, get a free token at [cesium.com/ion](https://cesium.com/ion) and enter it in Settings.

### Settings Panel
Access via the gear icon in the header. All settings persist in localStorage.

| Setting | Default | Description |
|---------|---------|-------------|
| Map Style | Dark CartoDB | Base map tile layer |
| Show Labels | On | Callsign labels on aircraft |
| Altitude Colors | On | Color-code trails by altitude |
| Show Airports | Off | Airport markers on map |
| Show Radar | Off | Weather precipitation overlay |
| Military Alert Radius | 50nm | Distance trigger for military alerts |
| Sound Alerts | Off | Audio notifications for watchlist/military |
| Compact Mode | Off | Dense UI for small screens |
| Follow Mode | Off | Camera tracks selected aircraft |

## Keyboard Shortcuts

SkyTrack is designed for mouse/touch interaction. All controls are accessible via the header toolbar and panel buttons.

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome/Edge 90+ | Full support |
| Firefox 90+ | Full support |
| Safari 15+ | Full support |
| Mobile Chrome/Safari | Optimized touch UI |

## Tech Stack

Everything runs client-side in a single `index.html` — no server, no build process:

- **Leaflet 1.9.4** — 2D map rendering, markers, layers
- **CesiumJS 1.119** — 3D globe (lazy-loaded on first use, ~3MB)
- **Leaflet.heat** — Traffic heatmap visualization
- **Leaflet.markercluster** — Aircraft clustering at dense zoom levels
- **IndexedDB** — Client-side caching of airport/registration databases
- **ServiceWorker** — Offline capability and asset caching

All external libraries loaded from cdnjs.cloudflare.com CDN. No npm packages, no compilation.

## FAQ

**Q: Where does the aircraft data come from?**
ADS-B (Automatic Dependent Surveillance-Broadcast) is a system where aircraft broadcast their GPS position, altitude, speed, and identity. Volunteer-run receiver networks like Airplanes.live and ADSB One collect and share this data via public APIs.

**Q: Why are some aircraft missing?**
Not all aircraft have ADS-B transponders. Military aircraft often don't broadcast, and some older general aviation aircraft use Mode-C transponders which report altitude but not position. Aircraft using Privacy ICAO Addresses (PIA) may appear with randomized hex codes.

**Q: How do I get 3D terrain working?**
Click the globe icon to enter 3D mode. Terrain loads automatically using a Cesium Ion token included in the app. For a custom token, sign up free at cesium.com/ion and enter it in Settings.

**Q: Can I run this offline?**
Yes. After the first load, the ServiceWorker caches core assets. Aircraft data requires an internet connection, but previously loaded databases and map tiles are available offline.

**Q: Why do some planes show as "interesting"?**
SkyTrack loads curated databases including military, VIP/government, PIA (Privacy ICAO Address), and general "interesting" aircraft. These are flagged with colored markers and badges.

## Contributing

Issues and PRs welcome. SkyTrack is a single-file application — all changes go into `index.html`.

When contributing:
- Test in both 2D and 3D modes
- Verify CORS compatibility for any new data sources
- Maintain the single-file architecture
- Dark theme is the default — ensure new UI elements support it

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Built by [SysAdminDoc](https://github.com/SysAdminDoc)
