# SkyTrack Roadmap

Living roadmap of what's shipped, what's next, and what's on the bench.
Updated 2026-04-17 (v0.18.0).

Contents:
1. [Shipped — v0.18.0](#shipped--v0180)
2. [Tier 1 — Next (high ROI, low-to-medium effort)](#tier-1--next-high-roi-low-to-medium-effort)
3. [Tier 2 — Candidate features](#tier-2--candidate-features)
4. [Tier 3 — Bigger bets](#tier-3--bigger-bets)
5. [Explicitly not doing](#explicitly-not-doing)
6. [Data sources — live & verified](#data-sources--live--verified-2026-04)
7. [Data sources — verified dead / do-not-integrate](#data-sources--verified-dead--do-not-integrate)

---

## Shipped — v0.18.0

### Core
| Area | Feature |
|------|---------|
| Build | Zero-dependency single-file release (`index.html`) built from `src/` by `build.mjs` (no deps, Node stdlib only) |
| PWA | Service-worker cache (`skytrack-v0.18.0` + `-tiles`), `beforeunload` state persist, installable manifest |
| Offline | ServiceWorker asset cache, IndexedDB persistence via `skytrackDB`, offline mode manager, sync queue |
| Reliability | Circuit breaker, auto-retry, error-recovery, connection monitor, `errorHandler` crash log (capped) |

### Position feeds (round-robin with health-scored failover)
- ADSB One · ADSB.lol (proxied) · ADSB.fi · Airplanes.live
- `dataSourceManager` health-checks every 60 s and reorders by latency + error count
- Grid-fetch tiling for viewport-wide coverage; global sweep in ~16 s

### Aircraft intelligence
- Registrations, types, callsign-prefix, alliances, airlines databases
- `routesDB` (OpenFlights) + **adsbdb.com / hexdb.io** on-demand callsign→route fallback with cached TTL
- Military hex ranges + plane-alert-db (mil / gov / pol / PIA / civilian interesting / Badger's Best VIP)
- Categories DB (51 categories with color map + tooltip descriptions)
- Preloaded aircraft-image DB (~12K URLs) feeding the photo pipeline (preloaded → self-hosted → Planespotters)
- Aircraft-type specs (wingspan, length, range, cruise, engines, pax) from `aircraftTypeDB`

### Airports
- 49K airports (OurAirports), 11K frequencies, runways, navaids, countries/regions
- Fast airport-coord JSON for route detection
- Arrival / departure boards (built from live feed)
- METAR / TAF per-airport via aviationweather.gov
- NOTAMs per-airport
- LiveATC link + direct FlightAware / FR24 / ADSBx external deep-links

### Map & viz (2D Leaflet)
- Multiple basemap styles; Google Hybrid default
- Altitude-colored aircraft trails (local + API trace)
- Aircraft clustering, traffic heatmap
- Mini-map (picture-in-picture)
- Distance measurement tool
- Hardcoded Class B airspace + restricted-area circles (placeholder — upgrade planned)
- **Animated RainViewer radar** (last 10 past + nowcast forecast frames, lower opacity for forecasts)

### Map & viz (3D Cesium)
- Full 3D Earth, terrain, atmosphere
- Procedural GLB airplane models (runtime-generated), type-based scale (heavy / medium / GA)
- Interpolated aircraft motion via `SampledPositionProperty`
- 3D trails as altitude-accurate polylines
- Click-selection parity with 2D view

### Weather overlay
- Open-Meteo wind barbs (surface + FL400)
- **SIGMETs + G-AIRMETs + CWAs** as polygons, hazard-colored
- **PIREPs** as cyan/red circle markers (urgent = larger red), viewport-scoped

### Route & flight analysis
- Route prediction line (heading × speed × minutes)
- Great-circle origin→destination arc
- Origin detection from low-altitude trail points
- Destination inference from airline + origin via routes DB
- Route API fallback (adsbdb / hexdb) for missing callsigns
- Live altitude chart (climb/descent phases)
- Flight progress bar (flown / remaining / ETA)

### Alerting & watch
- Watchlist with real-time hex/registration alerts
- Military proximity alerts (user geolocation-gated, `watchPosition`, no unsolicited prompts)
- Emergency squawk detection (7500 / 7600 / 7700)
- Per-type alert cooldowns, in-app + browser notifications, audio alerts
- Notification center with persisted history, XSS-hardened
- Geofence zones with in-browser drawing
- Bookmarks (locations)

### Search & comparison
- Search by hex / reg / callsign / type / airline / airport, with history
- Multi-select (Ctrl+click), side-by-side comparison panel
- Advanced filter whitelist (URL-shareable, clamped lat/lon/zoom)

### Playback & export
- Historical playback with scrubber, play/pause, speed
- Time Machine (past position browse)
- Trail export: KML, GPX, GeoJSON, CSV (XML-escaped, filename-sanitized)
- URL deep-linking: `?hex=A12345&lat=...&lon=...&zoom=...&filter=all`
- Share link generator
- Screenshot + screen-recording capture

### UI
- Themes: Dark / Midnight / Light / High-Contrast / Color-blind
- Dashboard layout manager (Default / Minimal / Analyst presets)
- Mobile optimized (touch, swipe, responsive sheets)
- Compact mode
- Keyboard shortcuts (press `?` to list)

---

## Tier 1 — Next (high ROI, low-to-medium effort)

### Data / overlays
| # | Feature | Source | Effort | Rationale |
|---|---------|--------|--------|-----------|
| 1 | **Real airspace polygons** (replace hardcoded Class B circles) | OpenAIP `/api/airspaces?bbox=...` (free key, 1k req/day, CORS ✅) | M | The current circle placeholder is the app's weakest overlay. Real polygons = credibility. |
| 2 | **FAA ARTCC / TRACON / airway overlay** | `adds-faa.opendata.arcgis.com` — `ARTCC-Boundaries.geojson`, `Low-Altitude-Airways.geojson`, `High-Altitude-Airways.geojson` (CORS ✅) | S | Static GeoJSON — one fetch + Leaflet layer toggle. |
| 3 | **Active-fire + firefighting-tanker correlation** | NIFC `WFIGS_Incident_Locations_Current` (CORS ✅, GeoJSON) | S | Lights up when tankers are airborne — unique story no other free tracker shows. |
| 4 | **NHC hurricane cones + hunter aircraft correlation** | `nhc.noaa.gov/gis/CurrentStorms.json` (CORS ✅) | S | Auto-highlights N42RF / N43RF / N49RF when over a named storm. |
| 5 | **CelesTrak ISS / Starlink in Cesium 3D** | `celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json`; propagate with satellite.js | M | Cheap wow-factor for 3D mode — satellites drift overhead while aircraft fly. |
| 6 | **OpenSky historical tracks** (replace dead adsb.lol archive) | `opensky-network.org/tracks/all` (CORS ✅, OAuth2 client_credentials gives 4k/day) | M | The adsb.lol archive died Q2 2025 — OpenSky's relaunched v2 API is the only free replay path. |
| 7 | **airport_wx_stations.csv** | OurAirports new 2025 dataset | XS | Kills the current fuzzy airport↔METAR-station match — direct lookup. |
| 8 | **Oceanic FIR overlay** (Shanwick / Gander / NY / Oakland) | `mwgg/FIRs` GeoJSON or OpenAIP `?type=FIR` | S | Useful context when zoomed out over oceans — shows WHY aircraft line up on specific NATs. |

### UX / viz
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|
| 9 | **Category-specific SVG sprites** ported from `wiedehopf/tar1090/html/markers.js` — A1 light / A2 small / A3 large / A5 heavy / A7 rotorcraft / B1 glider / B2 balloon / B4 UAV / B6 space. Inline `<symbol>` sheet, `<use>` per plane. | M | Current icons scale by size but don't distinguish shape. Single biggest readability win. |
| 10 | **Range rings from user location** (dashed circles at 50 / 100 / 150 / 200 nm, labeled at NE bearing — tar1090 `SiteCirclesDistances` pattern) | S | Mature ADS-B convention, ~30 lines of `L.circle`. |
| 11 | **Emergency squawk triple-ring pulse** — expanding CSS ring animation at 1 Hz, 7500 red / 7600 yellow / 7700 orange. Audible chime once per new occurrence. | S | tar1090 just colors the marker — pulsing rings are much more urgent. |
| 12 | **Canvas / WebGL marker layer** swap above ~800 aircraft — `L.canvas()` baseline, DivIcon only for selected. `Leaflet.glify` or `deck.gl ScatterplotLayer` as an optional high-volume renderer. | M | DivIcon stalls past ~1000 planes on global zoom-out. |
| 13 | **`supercluster` (Mapbox) in place of `Leaflet.markercluster`** | S | ~10× faster above 1000 points; used by FlightAware free tier. |
| 14 | **Virtualized aircraft list** (`@tanstack/virtual` or hand-rolled) for the dense sidebar list | M | Current DOM approach stalls past ~500 rows. |
| 15 | **Country-flag badge next to registration** (emoji from hex prefix lookup) | S | Visual scan beats reading ICAO codes. |
| 16 | **PIA / LADD dashed-outline rendering** with `?` badge | S | Educational and a visible differentiator vs other trackers. |
| 17 | **Vertical altitude-tape gauge** in selected-aircraft panel (thin strip, tick marks, trend arrow) instead of only numeric text | S | FR24 pattern — reads at a glance. |
| 18 | **Time-airborne chip** ("2h 14m") with progress ring when route known | S | Pair with existing progress bar. |
| 19 | **Leaflet plugins:** `Leaflet.VectorGrid` for airspace PBF tiles · `Leaflet.PolylineOffset` for parallel tracks on same airway · `leaflet-edgebuffer` for pre-render beyond viewport | M | Cumulative polish — each a small drop-in. |
| 20 | **Cesium glow trails** (`PolylineGlowMaterialProperty`) + optional night SkyBox swap at civil twilight | S | Free eye candy for 3D mode. |
| 21 | **ARIA `role="status" aria-live="polite"`** on the alerts panel + `prefers-reduced-motion` respect + `inert` attribute focus traps on modals | S | Low-effort accessibility; disables trail/pulse animation for sensitive users. |
| 22 | **`/` fuzzy-search jump-to-callsign** with Fuse.js (pan + select) | S | tar1090 signature shortcut. |
| 23 | **`followRandom` mode** — cycles to a random visible aircraft every N seconds. Toggle as a "demo / kiosk" mode. | S | Surprisingly compelling for ambient display use. |

### Analytics
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|
| 24 | **Surveillance-orbit detector** — small radius (<3 nm), sustained bank, AGL <5000 ft, >15 min → "possible LEO / ISR" badge | S | Top-3 ROI per research. No competitor OSS tracker does this well. |
| 25 | **Conflict / CPA (Closest Point of Approach) prediction** — pairwise 5-min forward projection, flag pairs within 5 nm + 1000 ft. O(n²) bounded by viewport aircraft count. | M | Top-3 ROI — visually striking red pairs, genuine operational value. |
| 26 | **Personal IndexedDB logbook + achievements** — store `ICAO24 → { firstSeen, lastSeen, count, photo }`, toast on new sightings, simple achievement tree | M | Top-3 ROI — turns SkyTrack into a *return-visit* app. |
| 27 | **Holding-pattern detection** on selected trail — 2+ loops with <500 ft alt variance, heading sweeps 360° twice in <8 min | M | "Why is this plane flying in circles?" answer. |
| 28 | **Phase-of-flight classifier** (taxi / takeoff / climb / cruise / descent / approach / landing) from pure alt+gs+VS rules | S | Useful label on every aircraft row; rules beat ML here. |
| 29 | **Go-around detector** — descent <2000 ft AGL near airport, then climb >500 fpm within 60 s | S | Niche but memorable. |
| 30 | **Speed anomaly** — ship a per-ICAO-type speed envelope JSON, flag >2σ deviations | S | Catches hijacked transponders or data glitches. |

### Hardening & platform (round-2 research)
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|
| 31 | **Web Worker DB parsing** — move `registrationDB` / `airportDB` / `routesDB` / `civilianDB` / `badgersBestDB` / `categoriesDB` CSV+JSON parsing off the main thread. Worker defined as a blob URL (preserves single-file shipping). Fetch as `ArrayBuffer`, transfer to worker, decode with `TextDecoder`. | M | Biggest first-load UX unlock — ~30 MB currently blocks the main thread before the first paint. |
| 32 | **`registrations.json.gz` shipped alongside `.json`** — extend the existing `pako.inflate` path used for the tar1090-db fallback to prefer the gzipped self-hosted copy. | S | ~80% transfer reduction on the heaviest DB. |
| 33 | **IDB-backed DB caching** — verify `routesDB` / `categoriesDB` / `civilianDB` / `badgersBestDB` / `preloadedImagesDB` all cache parsed form with 24 h TTL (the two heavies already do). | S | Several DBs re-parse every session today. |
| 34 | **CSP + SRI + Permissions-Policy meta trio** — one-commit hardening. `default-src 'self'` + allowlisted CDNs, `connect-src *` (unavoidable due to rotating ADS-B + weather APIs), SRI `integrity` on the four pinned CDN scripts, and `Permissions-Policy` meta disabling USB / serial / Bluetooth / MIDI / camera / mic / payment / interest-cohort. | S | Free lasting security posture. |
| 35 | **`BroadcastChannel` tab dedup** — elect the oldest-`timeOrigin` tab as leader; follower tabs read from IDB only. | S | Two open tabs currently make 2× ADS-B fetches every 6 s. |
| 36 | **`loading="lazy" decoding="async"`** audit on every `<img>` (photos, flags, banners, silhouettes — currently only one match in the source). | S | Mobile battery / data win, 5-min scan. |
| 37 | **`navigator.storage.persist()` prompt** on first watchlist add — grants persistent storage, mitigates Safari's 7-day third-party eviction. | S | User data survives long enough to matter. |
| 38 | **Diagnostic "copy report" button** in settings — serializes `errorHandler.errors`, circuit-breaker state, DB version, UA, viewport to clipboard as JSON. | S | Kills the "please describe the bug" round-trip. |
| 39 | **`?debug=1` power-user HUD** — rAF delta, `performance.memory.usedJSHeapSize`, per-source health from `circuitBreakers`. | M | Self-diagnosing is already 80% of our support surface. |
| 40 | **Prefer CORS-native sources, deprecate public proxies** — drop `codetabs` / `allorigins` / `corsproxy.io` from the hot path now that three of four position feeds are CORS-native. Keep as last-resort fallback only. | S | Third-party proxies are the single flakiest link in the chain. |
| 41 | **"Bring-your-own Cloudflare Worker" proxy** — 20-line worker script in `tools/`, README "paste your worker URL here" field. | M | Zero recurring cost for power users; zero shared-proxy abuse. |
| 42 | **Stale-but-recent fallback UI** — when all sources go red, render last IDB snapshot with a "STALE · 04:17Z" banner instead of an empty map. | S | `dataSourceManager` / `circuitBreakers` already exist; this is the UI tail. |
| 43 | **CI workflow** (`.github/workflows/build.yml`) — `node build.mjs --check` + html-validate + Lighthouse CI. Zero-dep compatible. | S | Catches the "forgot to rebuild before commit" regression class. |
| 44 | **`build.mjs` auto-bumps `data/aircraft/dbversion.txt`** on every run. | XS | Lets the SW detect DB freshness without re-parsing. |
| 45 | **JSON-LD `WebApplication` schema in `<head>`** | XS | Real SEO payoff, no other cost. |

---

## Tier 2 — Candidate features

### Data
- **OpenAIP `/obstacles`** — tall structures, towers, wind turbines; flash warning when GA aircraft < 1000 ft AGL near one
- **OpenAIP `/hotspots`** (glider thermals) — toggle for glider/sailplane enthusiasts
- **Marine AIS via AISStream.io** WebSocket — optional "show ships" toggle; out of SkyTrack's aviation core but a natural extension
- **BirdCast migration overlay** (Cornell Lab) — spring/fall bird migration intensity as a semi-transparent tile layer; correlates with bird-strike risk
- **theairtraffic.com** as 5th redundant position feed (2025 aggregator, CORS ✅, generous beta limits)

### UX
- **h3-js hex-binned density** at zoom <7 — extruded hex columns (count = height, avg altitude = color). Research-rated one of the highest-impact visual upgrades.
- **Flow map** — curved Bezier arcs aggregating origin→dest pairs over 24h, weighted by count (Kiln migration-map aesthetic)
- **Jumbotron / broadcast mode** — full-screen auto-cycling selected events (intercepts, emergencies, VIPs) with large callout cards; for streamers / event ops rooms
- **Approach cones / STAR** — render 10 nm final cone + FAF marker for selected airport (real operational value)
- **Military-only color ramp** — distinct amber/olive palette when `mil` flag set; flashing outline when converging with another mil target
- **CRT / "radar sweep" optional theme** — nostalgic aesthetic, not default (actively degrades readability per research)

### Analytics
- **Traffic-flow vector field** — average track vector per 0.5° tile, render as arrows
- **Alt-by-region kriging-lite** — colored mesh of average altitude across viewport
- **Airline viewport dashboard** — group by callsign prefix, counts + avg FL per operator
- **Airport arrival-rush histogram** — rolling 24 h from IndexedDB, "peak arrival hour" per airport
- **Touch-and-go / pattern-work detector** — repeat low passes over same runway >2× in 30 min
- **"First time seen" / "Spotted today" toasts** driven by the Tier-1 logbook
- **Flight-of-the-day shareable card** — Canvas → PNG with callsign, route, max alt, peak speed
- **Route-divergence anomaly** — >X nm off great-circle origin→dest (once route is known)

### Storytelling & content creation
- **Aircraft dossier compiler** — per-hex printable HTML/PDF: owner chain, top routes from IDB, hours flown, notable squawks, photos. No free tracker exports this.
- **"Why is this plane here?" natural-language explainer** — rule-based templating from category + registration + nearest-airport + phase-of-flight ("N425AA is a Cessna 172, currently in pattern work at KPDK…"). No LLM needed.
- **Event-ticker marquee** — bottom-of-screen strip reading out alert-engine events in real time. Streamer-friendly.
- **"Day in the life of {airport}" replay** — IDB-driven timelapse of ops within 40 nm of chosen ICAO, with time-of-day Cesium skybox blend.
- **Annotated trails** — click-drop pins/text on a flight path, saved into trail GeoJSON `properties.annotations[]`. Extends existing export format.
- **Flight card image to clipboard** — offscreen `<canvas>` → `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`.
- **Scene URLs** — serialize `{lat, lng, zoom, filters, theme, time}` to a hash fragment for shareable link scenes.
- **Callsign-lore pop-ups** — curated JSON of ~300 famous callsigns (AF1 / SAM28000 / NIGHTWATCH / JANET / BOXER / SPAR / REACH / EVAC / PAT / DOOM) with history + operator. Ships as a small static DB.
- **"Read the METAR" / ATC-speak decoder** — plain-English decode for any raw METAR and for common clearance phrases.
- **Print-to-postcard PDF** — `jsPDF` snapshot of "my sky today" with 24 h IDB traffic.

### Audio & voice
- **TTS alerts via `speechSynthesis`** ("Emergency squawk detected on November four two five") — gated behind user gesture.
- **Inline LiveATC mini-player** for the ~30% of feeds that allow cross-origin `<audio>`; mapped by ICAO → stream URL for top 300 airports. Fallback to the existing external link for blocked feeds.
- **Sonification ambient mode** — each visible aircraft = a Web Audio tone, pitch=altitude, pan=bearing, gain=range. Niche but unique.
- **Viewport blip sounds** on enter/leave (aggressively throttled, off by default).
- **Whisper-WASM on-demand transcription** of captured 30 s clip (live transcription still too slow). Strictly opt-in, heavy.

### Integrations
- **Discord / Slack / HA / IFTTT / Zapier webhook poster** — single user-supplied URL, off by default, localStorage only; same payload shape works across all four targets.
- **OBS WebSocket control** (`obs-websocket-js` to `ws://localhost:4455`) — auto-scene-switch on watchlist hit. Streamer killer feature.
- **Web Serial / Web Bluetooth output** — push nearest-aircraft text to a user's Arduino/ESP32 LED matrix or BLE buzzer. Flagship "nobody else does this" niche.
- **Gamepad API → Cesium camera** — fly the 3D globe with a joystick.

### Ambient & dashboard modes
- **Kiosk full-screen rotation** — Fullscreen API + timed view cycling. Useful for airport / lobby displays.
- **Streamer overlay mode** — `body.streamer` class hides chrome, sets non-map background to `#00FF00` for chromakey. Fullscreen-ready recording.
- **Cockpit / glassmorphic OLED theme** — pure black + neon accents, dedicated to OLED displays.
- **Widget mode** (`?widget=nearest`) — 300 px sidebar clock + nearest-aircraft chip for docking in a Vue/Obsidian/Emacs sidebar.
- **"CRT" optional theme** — phosphor green + scanlines; bling but fun.

---

## Tier 3 — Bigger bets

- **Full WebGL marker layer** via deck.gl overlay (replaces DivIcon entirely; handles 10K+ aircraft at 60fps)
- **Approach-plate (IAP) viewer** — FAA d-TPP plates are PDFs; an in-app pane with the plate for the selected airport
- **Dependency on no external API for baseline use** — bundle 24h of a single continent's traffic as an offline demo/kiosk mode
- **VATSIM / IVAO overlay** — online pilots + ATC positions; requires WebSocket client and unlikely to be zero-dep
- **Trajectory ML model** — browser-side LSTM (TF.js) predicting 30-min trajectory from current state + trail; heavy, use ort-web with a pre-trained ONNX model
- **Jumbotron / broadcast mode** — fullscreen rotating "interesting traffic" auto-cycle for displays/events (intercepts, emergencies, VIPs)

---

## Signature / "wow-factor" candidates

These are the top-ranked differentiating features from round-2 research — each scored high on novelty × implementability × user demand. They cluster here rather than under Tier 1/2 so they can be picked up as **signature projects** when we want to ship something shareable rather than grind through incremental tier work.

| Feature | Why it stands out |
|---------|------|
| **"Plane over my house" + shadow tracker** — set home coord, get a persistent ticker of aircraft passing within N nm plus a live sun-position shadow projection on the ground. Sun azimuth/elevation ≈ 30 lines (NOAA solar calc); shadow = great-circle offset by `altitude / tan(elevation)`. | Nobody ships this. Insanely sticky — people check it daily like weather. Afternoon project. |
| **"Why is this plane here?" explainer + callsign lore bundled** — one-paragraph plain-English story per aircraft, plus curated pop-up for ~300 notable callsigns (AF1, SAM, DOOM, JANET, NIGHTWATCH…). No LLM, just rules + a static JSON. | Transforms the app from "another radar" into "the tracker that tells you a story." |
| **Sonification ambient mode** — each tracked aircraft = a pan/pitch-modulated tone. Minimize tab, listen to the sky. | Surreal, genuinely first-of-its-kind among OSS trackers. |
| **WebRTC "party URL" spotter room** — host generates a code, friends join peer-to-peer (STUN + manual SDP exchange, no signaling server), everyone sees the host's selection + shared annotations. | Zero OSS tracker has multi-user. Implementability is the only question. |
| **Web Serial / Bluetooth output** — push nearest-aircraft text to an Arduino + WS2812 matrix or BLE buzzer. | Niche but viral — maker-community catnip. |
| **Satellite overlay (ISS + Starlink) in Cesium** — SGP4.js + CelesTrak TLEs (already on Tier 1 but emphasized here as a headline feature). | Wildly cool when an ISS pass crosses tracked traffic. |
| **Gamification / personal logbook + achievements** — IDB stats, first-seen toasts, rarity badges. (Tier-1 already; flagged again because it's the retention multiplier.) | Turns one-time visitors into daily users for zero server cost. |

---

## Explicitly not doing

Marked with **why** so this doesn't get re-litigated:

| Rejected | Why |
|----------|-----|
| **OpenSky `/states/all`** browser-direct | CORS-locked to `https://opensky-network.org` only. Only viable via proxy. |
| **FAA registry (`registry.faa.gov/.../ReleasableAircraft.zip`)** | Akamai 403 on cross-origin. Must mirror; plane-alert-db and tar1090-db already contain FAA-derived data. |
| **FR24 `data-live.flightradar24.com/zones/fcgi/feed.js`** | Deprecated redirect since late 2024 + Cloudflare challenge. |
| **FlightAware public ajax endpoints** | Cloudflare-gated; no unauth JSON surface. |
| **GeoFS / VirtualSkies public ADS-B feed** | No public ADS-B surface exposed. GeoFS multiplayer feed is sim players — toggle possible but novelty only. |
| **Airframes.org / airnav.com / airliners.net APIs** | HTML-only, CORS-blocked, or hotlink-protected. Planespotters already covers photo lookups. |
| **ICAO DATA+ / EuroControl B2B / FlightAware AeroAPI paid tiers** | Paywalled — out of scope for a zero-dep client-only app. |
| **Adsb.lol `/v2/hex/{icao}/archive` historical replay** | Removed Q2 2025 for storage cost reasons. Use OpenSky `/tracks/all` instead. |
| **Backend server / user accounts** | Project identity is "single HTML file, GitHub Pages." If a feature needs a server, it belongs in a different project. |
| **Tests** | Explicit scope choice (per CLAUDE.md). |
| **Dynamic Open Graph images per aircraft** | Needs SSR / Cloudflare-Worker backend. Static OG tags only. |
| **Hosted RSS/Atom feed of alerts** | Needs a backend. Could ship as File System Access API → local serve, but niche. |
| **Discord Rich Presence** | Needs native helper (web cannot talk to the Discord RPC named pipe). |
| **VATSIM / IVAO overlay** (re-evaluated) | Still requires WebSocket client with authenticated tier; not zero-dep friendly. Deferred to Tier 3. |
| **sitemap.xml** | Aircraft/airport data isn't crawlable content, it's just filter state. No SEO value. |
| **SharedArrayBuffer / COOP-COEP threading** | GitHub Pages does not send the required COOP/COEP headers. Worker + transferable `ArrayBuffer` is the right tool instead. |
| **In-repo stdlib-only JS minifier** | No safe stdlib path exists for 12k-line minification. Only real option is vendoring `terser` at build time, which violates the zero-devDep principle. Ship pre-gzipped `index.html.gz` instead if transfer size becomes a concern. |
| **Protobuf / FlatBuffers for bundled DBs** | Overkill for a one-shot 34 MB download that's IDB-cached after first parse. |
| **VR / WebXR Cesium mode** | Cesium WebXR is experimental, headset users are a rounding error, and the weight budget matters. |
| **n2yo.com / OpenSky `/states/all` / FR24 `feed.js` / FlightAware ajax** | CORS-locked, paywalled, or deprecated. See "Data sources — verified dead" below. |

---

## Data sources — live & verified (2026-04)

### Position feeds
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| ADSB One | `api.adsb.one/v2/point/{lat}/{lon}/{r}` | ❌ (proxy) | In use |
| ADSB.lol | `api.adsb.lol/v2/point/{lat}/{lon}/{r}` | ❌ (proxy) | In use |
| ADSB.fi | `opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{r}` | ✅ | In use (v0.18.0) |
| Airplanes.live | `api.airplanes.live/v2/point/{lat}/{lon}/{r}` | ✅ | In use |
| theairtraffic.com | `api.theairtraffic.com/v1/...` | ✅ | 2025 entrant, candidate |

### Enrichment & lookup
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| adsbdb.com v2 | `api.adsbdb.com/v2/callsign/{cs}` · `/aircraft/{hex}` | ✅ | In use for route fallback |
| hexdb.io | `hexdb.io/api/v1/{aircraft,airport,route}/...` | ✅ | In use as secondary fallback |
| Planespotters | `api.planespotters.net/pub/photos/hex/{hex}` | ✅ | In use for photos |
| Wikipedia REST | `en.wikipedia.org/api/rest_v1/page/summary/{title}` | ✅ | In use for airport summaries |

### Weather & hazards
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| AviationWeather.gov | `/api/data/{metar,taf,isigmet,gairmet,cwa,pirep,notam}` | ✅ | In use |
| Open-Meteo | `api.open-meteo.com/v1/forecast?...` | ✅ | Wind barbs |
| RainViewer | `api.rainviewer.com/public/weather-maps.json` | ✅ | Animated radar (v0.18.0) |
| NIFC active fires | `services3.arcgis.com/.../WFIGS_Incident_Locations_Current/FeatureServer/0/query?f=geojson` | ✅ | Tier 1 candidate |
| NHC hurricane | `nhc.noaa.gov/gis/CurrentStorms.json` | ✅ | Tier 1 candidate |
| BirdCast | `birdcast.info/assets/...` tiles | ✅ | Tier 2 candidate |

### Airspace & navigation
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| OpenAIP core v2 | `api.core.openaip.net/api/{airspaces,navaids,obstacles,hotspots,reporting-points}?bbox=...` | ✅ (API key) | Tier 1 — replace hardcoded Class B circles |
| FAA ARTCC / airways | `adds-faa.opendata.arcgis.com/datasets/faa::{artcc-boundaries,low/high-altitude-airways}.geojson` | ✅ | Tier 1 |
| mwgg/FIRs | GitHub raw `fir-boundaries.geojson` | ✅ | Tier 1 (oceanic) |

### Satellites
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| CelesTrak | `celestrak.org/NORAD/elements/gp.php?GROUP={stations,starlink}&FORMAT=json` | ✅ | Tier 1 (3D only) |

### Historical
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| OpenSky v2 REST | `opensky-network.org/api/tracks/all?icao24=...&time=...` (OAuth2) | ✅ | Tier 1 — replaces dead adsb.lol archive |

### Non-aviation overlays (candidate)
| Source | Endpoint | CORS | Notes |
|--------|----------|------|-------|
| AISStream.io | `wss://stream.aisstream.io/v0/stream` (free key) | ✅ (WebSocket) | Tier 2 — marine AIS toggle |
| OpenSeaMap | `tiles.openseamap.org/seamark/{z}/{x}/{y}.png` | ✅ | Tier 2 — nav-aids tile overlay |
| BirdCast | `birdcast.info/assets/…` tiles | ✅ | Tier 2 — spring/fall migration intensity |
| GeoFS multiplayer | `mps.geo-fs.com/map` | ✅ | Novelty-only toggle — sim players, not real traffic |

---

## Data sources — verified dead / do-not-integrate

See the **Explicitly not doing** section above. Each rejection includes the *why* so we don't re-evaluate them on every review cycle.

**Proxy status (2026-04):**
- `api.codetabs.com` — sporadic, slow; drop from hot path
- `corsproxy.io` — requires paid key for heavy use; drop from hot path
- `api.allorigins.win` — rate-limited; last-resort only

Since three of four position feeds are now CORS-native (ADSB One, ADSB.fi, Airplanes.live), the proxy chain can be demoted to "fallback only for ADSB.lol."

---

## Ground rules for picking what to build next

1. **Zero-dependency, single-file discipline.** If it needs npm, a build step, or a server, it's in Tier 3 or rejected.
2. **Every new feature has a kill switch.** Toggle in settings or the feature button fails soft.
3. **Every new data source fails quietly.** Primary → fallback → empty. No broken UI when a third-party is down.
4. **No telemetry, no accounts, no tracking.** User data stays in `localStorage` / IndexedDB on their device.
5. **Dark theme is the default.** New UI must look good in Midnight before anywhere else.
6. **Version bump on every ship.** `package.json`, title-bar span, SW `CACHE_NAME`, README badge all move together.

## Open-Source Research (Round 2)

### Related OSS Projects
- **FlightAirMap (Ysurac)** — https://github.com/Ysurac/FlightAirMap — AGPLv3 PHP/JS; 2D/3D maps, SBS1/VRS/VATSIM/IVAO/APRS/AIS sources, statistics, per-aircraft/airline/airport drilldowns
- **readsb** — https://github.com/wiedehopf/readsb — Mode-S/ADSB decoder with TypeScript + Leaflet + IndexedDB frontend
- **tar1090** — https://github.com/wiedehopf/tar1090 — hugely-popular dump1090 web frontend; feature-rich map UI
- **dump1090-fa (FlightAware)** — https://github.com/flightaware/dump1090 — canonical ADSB decoder with web viewer
- **Thom-x/docker-fr24feed-piaware-dump1090** — https://github.com/Thom-x/docker-fr24feed-piaware-dump1090 — all-in-one multi-feeder Docker image
- **ketilmo/balena-ads-b** — https://github.com/ketilmo/balena-ads-b — 15+ feed targets (FlightAware, FR24, OpenSky, adsb.fi, airplanes.live, Wingbits…); reference for multi-feeder config UX
- **awesome-adsb (rickstaa)** — https://github.com/rickstaa/awesome-adsb — curated index; tile sources, registration DBs, historical feeds
- **OpenSky Network API** — https://github.com/openskynetwork/opensky-api — free-tier global ADS-B feed; good public fallback when local SDR not available

### Features to Borrow
- Multi-source fusion: OpenSky + local dump1090 + adsb.fi + VATSIM/IVAO overlay toggles (FlightAirMap, balena-ads-b)
- Aircraft detail panel with registration, operator, type, photos from Planespotters.net + history from ADSBExchange (awesome-adsb indexes)
- 3D globe mode with altitude extrusion using Cesium (you already have Cesium — add flight-path extrusion and time-scrubber) (FlightAirMap 3D)
- Alert rules: notify when a specific tail/callsign/ICAO is within N nm of a point or at altitude < X (community pattern)
- Emergency-squawk-code highlight (7500/7600/7700) with audio chime (tar1090 feature)
- Dark-mode basemap swap + optional MRMS radar overlay for weather-vs-flight correlation (FlightAirMap)
- Per-flight trail coloring by altitude, speed, or climb rate with legend (tar1090)
- "Playback" mode that replays last N minutes using IndexedDB ring buffer (readsb already does this)
- SBS1-over-network input so power users can point SkyTrack at their Pi's 30003 port (FlightAirMap, tar1090)
- VATSIM/IVAO pilot overlay with distinct icon and "sim" badge (FlightAirMap)
- "Feed back" mode: if SkyTrack has a local receiver, opt-in to forward to adsb.fi/airplanes.live/adsbhub for community benefit (balena-ads-b)

### Patterns & Architectures Worth Studying
- IndexedDB ring buffer for N-minute history without hammering memory (readsb) — 1 row per aircraft per tick, auto-expire
- Source plugin pattern: each feed type (SBS1/JSON/API/VATSIM) implements a normalize() to a common AircraftState schema (FlightAirMap)
- Tile-server abstraction: user can swap OSM/Carto/MapTiler/Stadia keys without code changes (tar1090, FlightAirMap)
- Multi-feeder container: one decoder, fan-out to many upstreams via standard formats (balena-ads-b, Thom-x docker)
- Offline-first mode where the browser drives everything from IndexedDB while the network tab shows "waiting for SBS1…" (readsb)

## Implementation Deep Dive (Round 3)

### Reference Implementations to Study
- **Ycarus/FlightAirMap** — https://github.com/Ycarus/FlightAirMap — mature open-source 2D+3D flight tracker; ingests ADS-B SBS1 (dump1090), VRS, VATSIM, ACARS; use as the gold reference for multi-source ingestion architecture.
- **srothst1/cesium_flight_tracker** — https://github.com/srothst1/cesium_flight_tracker — quick-start CesiumJS flight tracker; good minimal reference for entity creation + interpolation.
- **itanand/Flight-Tracker-with-CesiumJs** — https://github.com/itanand/Flight-Tracker-with-CesiumJs — Cesium Ion + 3D aircraft models (glTF); how to load binary glTF and orient by heading.
- **WilliamAvHolmberg/cesium-flight-simulator** — https://github.com/WilliamAvHolmberg/cesium-flight-simulator — camera control patterns for following an entity in Cesium; useful for our "follow aircraft" mode.
- **CesiumJS official repo** — https://github.com/CesiumGS/cesium — sandcastle examples for `SampledPositionProperty` + `CallbackProperty` interpolation (the right way to do smooth motion between ADS-B updates ~1Hz).
- **OpenSky Network API** — https://openskynetwork.github.io/opensky-api/ — free live ADS-B feed; rate-limited, requires fallback to paid feeds (ADSBExchange, FlightAware Firehose) for production.
- **RadrView** (weather overlay pattern) — https://github.com/cwdaniel/RadrView — WebSocket push for real-time frame notifications; pattern we'd reuse if we add NEXRAD overlay.
- **rainviewer-api-example** — https://github.com/rainviewer/rainviewer-api-example — animated radar overlay on Leaflet/Mapbox; directly reusable for weather layer.

### Known Pitfalls from Similar Projects
- **ADS-B update rate is 1Hz, not 60Hz** — naive `entity.position = newPos` creates jerky animation; use `SampledPositionProperty` with `InterpolationAlgorithm.LAGRANGE` for smooth paths. Ref: CesiumJS sandcastle `Interpolation`.
- **Entity count scaling** — 5K+ live aircraft tanks Cesium's picking; use `PointPrimitiveCollection` for dots and swap to full glTF model only when camera is close. See FlightAirMap perf threads.
- **OpenSky rate limits** — 400 anonymous credits, 4000 w/ account; implement client-side cache + gracefully degrade to lower refresh rate on throttling.
- **Coordinate system gotchas** — ADS-B gives WGS84 lat/lon/alt; Cesium wants radians or `Cartesian3.fromDegrees`. Document unit everywhere in code.
- **Heading != course** — ADS-B `track` field is ground course, not aircraft heading (magnetic). For 3D model orientation this is "good enough" in still air; document the approximation.
- **Terrain clipping** — aircraft at low altitude can render below Cesium terrain with default `heightReference`; use `HeightReference.NONE` + clamp-to-height only on ground trail.
- **WebGL2 required for Cesium 1.100+** — older mobile GPUs fall back and fail silently; detect `WEBGL_CONTEXT_VERSION` up front.
- **Tile cache eviction** — Cesium's default tile cache grows unbounded in long sessions; set `TileProviderCollection.maximumCacheSize` on each imagery layer.

### Library Integration Checklist
- **cesium** pin `>=1.120`; entrypoint `new Viewer("container", { terrain: Terrain.fromWorldTerrain() })`; gotcha: requires `CESIUM_BASE_URL` set + static assets copied to public — Vite plugin helps.
- **@cesium/vite-plugin** or manual `vite-plugin-static-copy` for Cesium assets; gotcha: 45MB asset copy — exclude from dev HMR.
- **leaflet** pin `>=1.9.4`; entrypoint `L.map`; gotcha: for dual 2D/3D UI, keep separate DOM containers and sync viewstate via shared store.
- **rainviewer-api** (if weather) — free, public; entrypoint `https://api.rainviewer.com/public/weather-maps.json`; gotcha: URL format changed in v2 — check for `host` field.
- **opensky-network client** — no official package; entrypoint `GET /api/states/all`; gotcha: auth via HTTP Basic; respect 5-10s polling floor.
- **socket.io / native WebSocket** for push updates; entrypoint native `WebSocket`; gotcha: reconnect/backoff exponential + jitter to avoid thundering herds after upstream hiccups.
- **glTF aircraft models** — CesiumJS has free FA18 / 707 in sandcastle; licensed commercial models via Cesium ion; gotcha: check license before shipping.
- **Turf.js** pin `>=7.x` (if we do great-circle paths or waypoint calc); entrypoint `turf.greatCircle`; gotcha: returns GeoJSON, convert to Cesium positions.
