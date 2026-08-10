# Changelog

All notable changes to SkyTrack will be documented in this file.

## [v0.25.0] - 2026-08-09

### Added
- **Ambient, sharing, and local integration tools.** Added opt-in voice alerts,
  aircraft sonification with viewport blips, printable Sky Postcards, retained
  airport operations replay, user-configured alert webhooks, Gamepad camera
  control, chroma-key streamer mode, and the `?widget=nearest` docking view.
- **Cockpit and home-context polish.** Added an OLED-safe Cockpit theme and a
  live solar-position shadow projection to the Over My House aircraft widget.
- **GPU traffic rendering.** Added an opt-in WebGL point-sprite layer that
  replaces ordinary map markers at 800+ aircraft while retaining filters and
  click-to-select behavior, with the existing renderer as the fallback.
- **Offline demo kiosk.** Added a deterministic 24-hour continental replay at
  `?demo=1` (or Tools → Offline Demo), with synthetic data clearly labeled and
  all live source checks bypassed while the mode is active.
- **Storytelling and local analysis tools.** Added plain-English METAR and
  ATC phrase explanations, an alert event ticker, pattern-work detection,
  Flight-of-the-Day cards, printable aircraft dossiers, and annotated trail
  GeoJSON export.
- **Viewport traffic analytics.** Added flow-vector and average-altitude mesh
  overlays plus a stats dashboard for visible airline flight levels, observed
  arrival hours, and route-divergence anomalies.
- **Operational map context.** Airport panels can render a 10 nm approach
  cone with an FAF marker, military targets use an amber/olive ramp with CPA
  conflict pulses, and an optional CRT Radar theme adds phosphor scanlines.
- **Presentation overlays.** Added zero-dependency low-zoom hex density bins,
  curved route-flow arcs, and a fullscreen broadcast mode that cycles through
  emergency, VIP, military, flagged, and CPA-conflict traffic.
- **Build and CI guardrails.** Normal builds advance the tracked aircraft
  database version, while GitHub Actions checks the generated release, tests,
  HTML validity, and Lighthouse health.
- **Personal proxy and stale-data recovery.** Cloudflare Worker users can save
  a browser-local proxy URL for blocked feeds, while failed live refreshes now
  keep the latest cached positions visible with a UTC `STALE` banner.
- **Runtime hardening and multi-tab coordination.** Added a restrictive CSP,
  SRI pins for external scripts, a debug HUD enabled by `?debug=1`, persistent
  storage requests for watchlists, lazy image decoding, and leader/follower
  coordination so only one tab refreshes live aircraft data.
- **Worker-backed database startup.** Registration, airport, route, category,
  VIP, and civilian datasets now transfer fetched bytes to a blob worker for
  parsing, prefer the self-hosted compressed registration database, and cache
  parsed results in IndexedDB for 24 hours.
- **FAA airspace polygons.** The Airspace overlay now queries the public FAA
  Class Airspace feature service for viewport-scoped Class B/C/D polygons,
  displays floor/ceiling metadata in each popup, and caches responses in
  IndexedDB for one hour. The previous guessed airport circles are gone.
- **FAA navigation overlays repaired and expanded.** ARTCC, terminal-area
  (`TRSA`/`CTA`) and V/J airway layers now use live FAA Feature Services,
  refresh for the visible map bounds, cache by viewport, and each has its own
  Tools toggle. Retired ArcGIS Hub download URLs are no longer used.
- **Active-fire aircraft correlation.** The NIFC fires overlay now filters to
  active non-prescribed incidents and highlights airborne fire-service and
  air-tanker aircraft within 80 km of the nearest incident, including a
  nearest-fire connector and aircraft details.
- **NHC storm geometry and hurricane hunters.** Fires & Hurricanes now loads
  the NHC forecast-track and cone KMZ products directly, renders their actual
  KML geometry, and highlights airborne NOAA N42RF/N43RF/N49RF aircraft within
  220 km of the nearest named storm with a storm connector and details.
- **3D satellite constellation layer.** Cesium 3D now lazy-loads satellite.js,
  propagates the live ISS and an evenly sampled Starlink catalog from CelesTrak
  OMM data, refreshes positions every five seconds, and exposes a dedicated
  ISS + Starlink control with catalog status in the 3D HUD.
- **OpenSky historical tracks.** Selected-aircraft trails, exports, and playback
  now use OpenSky trajectory data with optional OAuth credentials, normalize
  returned metres to SkyTrack feet, cache recent results, and fall back to the
  local position history when a track is unavailable.
- **Oceanic FIR context.** A new Tools toggle renders the Shanwick, Gander,
  New York, and Oakland oceanic FIR boundaries from the current Open Aviation
  CC BY 4.0 dataset, with labeled popups, zoom-aware visibility, and IndexedDB
  caching.
- **Category-specific aircraft sprites.** The 2D map now uses an inline SVG
  symbol sheet with distinct ADS-B silhouettes for light, small, large, heavy,
  rotorcraft, glider, balloon, UAV, and space categories, while retaining
  altitude coloring, heading rotation, labels, badges, and selection filters.
- **High-volume canvas rendering.** Once the live cache reaches 800 aircraft,
  ordinary traffic moves to a canvas-backed point layer while selected, VIP,
  military, interesting, and PIA aircraft retain detailed interactive icons.
- **Faster clustering.** The Clustering tool now uses a viewport-scoped
  Supercluster index instead of rebuilding a Leaflet marker-cluster tree,
  with click-to-expand clusters and proper restoration when disabled.
- **Virtualized aircraft list.** The mobile aircraft sheet now sorts the full
  live set but mounts only the visible rows plus overscan, removing the former
  100-aircraft cap and avoiding large DOM rebuilds.
- **PIA/LADD privacy markers.** Aircraft carrying privacy-address metadata now
  receive a dashed magenta outline and `?` badge, with privacy fields retained
  in the offline aircraft cache.
- **Selected-aircraft altitude tape.** The details panel now pairs numeric
  altitude with a compact scale, trend arrow, and vertical-rate readout.
- **Time-airborne chip.** Selected callsigns now show estimated airborne
  duration from the local trail, with a route-progress ring when both airports
  are known.
- **Leaflet overlay rendering.** FAA airway data now uses optional VectorGrid
  slicing and PolylineOffset lane separation, while EdgeBuffer keeps base-map
  tiles warm just beyond the visible viewport; native GeoJSON remains the
  fallback when a plugin is unavailable.
- **Cesium visual polish.** 3D aircraft trails now use glow materials, with a
  selected-flight emphasis, and the scene switches between the daytime
  atmosphere and a pinned star-field skybox at civil twilight.
- **Accessibility hardening.** Dynamic alerts now expose polite live-region
  semantics and keyboard activation, reduced-motion preferences stop aircraft
  interpolation and pulse effects, and modal overlays isolate background focus
  with `inert`.
- **Fuzzy callsign search.** Press `/` to focus search, then type a partial
  callsign or registration; ranked contiguous/subsequence matches now appear
  first and Enter jumps to the closest aircraft match.
- **Random Follow kiosk mode.** A dedicated Tools control now cycles through
  fresh, filter-eligible aircraft every 15 seconds and centers the map without
  changing the existing manual Follow mode.
- **CPA conflict warnings.** A bounded five-minute pairwise projection now
  highlights predicted conflicts within 5 nm and 1,000 ft on the current map
  viewport, with a toggleable red layer and selected-aircraft chip.
- **Holding-pattern detection.** Selected aircraft now show a holding chip when
  their recent trail contains two consistent turns within eight minutes while
  staying within a 500 ft altitude band.

## [v0.24.3] - 2026-05-01

### Fixed
- **Aircraft details panel was invisible after clicking a plane.**
  The `<div role="radiogroup">` opened at the category-filter row in
  `src/index.html` was never closed before its parent `</div>`, so
  the browser left `#filterBar` open and parsed the *entire rest of
  `<body>`* — including `#infoPanel`, modals, scripts, every other
  panel — as children of `#filterBar`. Because filterBar uses
  `backdrop-filter: blur(...)`, it becomes a containing block for
  fixed-positioned descendants, so the panel's `top:50; bottom:32`
  resolved against filterBar's tiny box and the panel collapsed to
  height 0 (visually invisible). Added the missing `</div>` to close
  the radiogroup before the filterBar close.

## [v0.24.2] - 2026-05-01

### Fixed
- **Aircraft trail fails to load when you click a plane.**
  `globe.airplanes.live` (the previous trace host) is currently
  DNS-unreachable, so every `loadTrail` call hit `503 (Offline)`.
  `CONFIG.traceUrl` now points at `globe.adsb.lol`, which
  302-redirects to `adsb.lol` and serves the same tar1090 trace
  JSON shape. The codetabs CORS proxy follows the redirect
  server-side, so the existing `fetchWithProxy` path works
  unchanged. See [src/modules/00-config.js](src/modules/00-config.js).

## [v0.24.1] - 2026-05-01

### Fixed
- **Live aircraft no longer load on the map.** Upstream tar1090 API
  (adsb.fi `/v2/lat/.../lon/.../dist/`, adsb.lol/adsb.one `/v2/point/`)
  silently changed its response schema from `{ ac: [...] }` to
  `{ aircraft: [...] }` for area queries. SkyTrack's parser only
  checked `d.ac` so every successful HTTP 200 was discarded as empty
  and the data-source pill stayed at "0 aircraft". Parser now accepts
  both shapes (`d.aircraft || d.ac`) so the older `/v2/mil`, `/v2/pia`,
  and `/v2/ladd` endpoints (which still return `ac`) keep working.
  Touches both the active definition in
  [src/modules/20-reliability.js](src/modules/20-reliability.js) and
  the legacy `DATA_SOURCES` map in [src/app.js](src/app.js).

## [v0.24.0] - 2026-04-18

Second wide-net pass: two more module extractions, four new feature
modules, a multi-tab coordination primitive, and the first-ever
scene-sharing link. `src/app.js` now sits at ~9,520 lines. Total
modules: 29 + app.js. Built: 1.06 MB / 20,071 lines.

### Project layout
- `routePredictor` + enhanced altitude chart (337 lines) →
  `src/modules/55-route-predictor.js`
- `miniMap` (213 lines) → `src/modules/75-minimap.js`

### Added
- **Flight Card** (module 9A). Offscreen-canvas renderer of the
  currently-selected aircraft — banner, callsign, reg, phase chip,
  emergency/LOITER/VIP/MIL pills, metric grid (alt, speed, heading,
  vertical rate, route, operator, year, position), footer timestamp.
  Copied to clipboard as `image/png` via `ClipboardItem`; falls back
  to a PNG download on browsers that refuse raw-image clipboard
  writes. Canvas 2D draws text directly so XSS is inherently
  blocked. Exposed via `Flight Card` toolbar button.
- **Scene URL** (module 9B). Serializes the current view state —
  map center + zoom + selected hex + active filter + map style +
  theme — into a base64url payload stored in the URL hash
  fragment. Recipients opening the link restore the same scene
  (with lat/lon/zoom clamped to sane ranges so crafted URLs can't
  push the map off-world). Copied to clipboard; scene-token
  automatically restored on boot after the first aircraft fetch.
- **Diagnostics copy-report** (module 9C). Single-click JSON
  snapshot of build/module inventory, recent-error ring, circuit-
  breaker state, data-source health, safe settings subset, active
  feature toggles, and IDB store listing. Excludes all PII
  (watchlist contents, bookmarks, home coord, user location). One
  blob to paste into a bug report.
- **Flight analytics** (module AA). Two rule-based trail
  detectors that annotate the selected aircraft:
  - `detectGoAround` — scans for a descent below 2,000 ft followed
    by a positive-VS climb within 60 s; flagged as an amber
    **GO-AROUND** chip.
  - `detectSpeedAnomaly` — compares ground speed against a loose
    per-type envelope (< 0.7× vMin or > 1.3× vMax) and flags a
    **SPEED ANOMALY** chip. Useful for catching data glitches.
- **Multi-tab coordination** (utility in 10-utils). New `tabLeader`
  helper using `BroadcastChannel` — elects the oldest-`timeOrigin`
  tab as leader. Today it's a primitive only (`tabLeader.isLeader`
  is queryable by anything that cares); follow-ups in 0.25 will
  throttle network loops in non-leader tabs using it.

### Notes
- Four new toolbar buttons: **Flight Card**, **Scene URL**,
  **Diagnostics**. Callsign row now also renders the GO-AROUND /
  SPEED ANOMALY analytics chips alongside the existing phase /
  LOITER chips.
- `sceneUrl.restore()` is called once at startup after the first
  aircraft fetch. No-op if there's no scene token in the URL hash.

### Previous
## [v0.23.0] - 2026-04-18

A wide-net improvement pass: three more modules extracted, three new
features added, and a sweep of small hardening fixes. `src/app.js`
drops to ~10,000 lines. Total modules: 23 + app.js.

### Project layout
- `measureTool` (175 lines)           → `src/modules/60-measure.js`
- `playbackController` (187 lines)    → `src/modules/65-playback.js`
- `geofences` (423 lines)             → `src/modules/70-geofences.js`
- `skytrackDB` gains `loadAllFromStore` / `putMany` / `clearStore`
  generic helpers + a new `logbook` object store (schema v2 upgrade).

### Added
- **Personal aircraft logbook** (module 99). Silent-background IDB
  log of every ICAO24 the user has ever seen: `{ firstSeen, lastSeen,
  count, bestCallsign/Type/Reg, milEver, vipEver, emergencyEver }`.
  "First time seen" toast fires for genuinely new hexes after a 15 s
  grace at load. "Logbook" toolbar button shows totals (unique / mil
  / VIP / emergency). Debounced 3 s flush to IDB; never blocks the
  refresh loop. Falls back to in-memory only if IDB is unavailable.
- **FAA ARTCC + airway overlay** (module A0). Toggleable GeoJSON
  layer from the FAA open-data ArcGIS hub (CORS-enabled). Cached to
  IDB with 7-day TTL so repeat loads don't re-pay the transfer.
  Exposed via a single toolbar button for ARTCC; low/high airway
  slots are wired and ready for additional buttons.
- **ISS live-position tracker** (module A1). Uses
  `api.wheretheiss.at/v1/satellites/25544` (CORS ✓, no key). Polls
  every 10 s and interpolates between fixes via `requestAnimationFrame`
  so the marker visibly drifts on-screen. Rolling 20-minute dashed
  ground-track trail in a single layer group.

### Improvements / hardening
- JSON-LD `WebApplication` schema.org block + `Permissions-Policy`
  meta disabling USB / serial / bluetooth / MIDI / camera / mic /
  payment / interest-cohort.
- `parseInt` radix explicitly provided at the remaining call sites
  (year, category count, elevation, time-machine slider).
- `mobileExperience.initTouchHandlers` now caches `.bind(this)` for
  each of the three touch handlers, so future teardown paths won't
  silently leak listeners (same class of bug as v0.17 measureTool).
- `connectionMonitor.updateStatus` now null-guards its child
  queries (already in v0.22, re-confirmed).

### Notes
- Total modules after this release: 23 + app.js. `src/app.js`:
  ~10,000 lines. Built size: 1.02 MB / 19,309 lines.
- `build.mjs --check` green; all modules pass `node --check`.

### Previous
## [v0.22.0] - 2026-04-18

### Project layout
- `alertSystem` — its ~385-line implementation — moved into
  `src/modules/40-alerts.js`. `src/app.js` drops to ~10,740 lines.
- Two new feature modules:
  - `97-callsign-lore.js`
  - `98-why-here.js`

### Added
- **Callsign Lore pop-ups.** Curated in-memory table of notable aviation
  callsigns (Air Force One / SAM / Nightwatch / Janet / Jolly / Pedro /
  NOAA hurricane hunters / Thunderbirds / Snowbirds …). When a tracked
  aircraft's callsign matches the table (exact / stem / prefix, longest
  prefix wins), the info panel shows a short "lore card" with a
  categorised chip, one-paragraph explanation, and optional Wikipedia
  link. Zero network — the table ships inside the build.
- **"Why is this plane here?" explainer.** Rule-based natural-language
  summary paragraph that composes what we already know into prose: type
  family (helicopter / business jet / narrowbody / etc.), phase of
  flight, altitude, route or detected origin, operator, plus a
  situation-specific second sentence for surveillance orbits, emergency
  squawks, VIPs, military, and airliner cruise/approach/climb. No LLM,
  no network calls — pure templating on cached aircraft data.

### Improvements / hardening
- `connectionMonitor.updateStatus` in 20-reliability.js now null-guards
  its child queries so variant header layouts can't throw.

### Notes
- Rendering uses a single `<div id="infoInsights">` injected above the
  info-body on first use; cleared on deselect. Missing panel / no
  lore + no why-summary → zero-DOM-cost path.

### Previous
## [v0.21.0] - 2026-04-17

### Production hardening pass

A staff-engineer style audit + fix pass across `src/app.js` and
`src/modules/*.js`. No new features — just defects fixed, dead code
removed, and invariants tightened. `node build.mjs --check` remains green
and all 14 modules pass `node --check`.

#### Critical (functional bugs fixed)
- `alertSystem.init` previously called `JSON.parse` on two localStorage
  values without try/catch. A corrupt `skytrack_watchlist` or
  `skytrack_alert_settings` entry wedged the entire alert subsystem —
  squawk/military/watchlist notifications silently stopped. Now parses
  defensively, validates shape, and tolerates malformed per-item records.
- ETA-panel writes at `selectAircraft` → `renderETA` called `.textContent`
  / `.style.width` on six `getElementById()` results without null guards.
  If the info-panel element (`etaTime` / `etaDistance` / `etaRemaining` /
  `etaProgressBar`) is absent in a given layout, the TypeError propagated
  and blew up the whole info-panel update. All writes now null-guarded;
  progress-bar logic is clamped with a single `Number.isFinite` check.
- `95-fires-hurricanes.js` had a dead-placeholder `if
  (s.forecastTrack?.kmzFile) { /* comments only */ }` block. Removed.

#### High (leaks / races / correctness)
- **AudioContext leak.** `alertSystem.playSound` and
  `planeOverHome._ding` each allocated a fresh `AudioContext` per
  chime. Chromium caps concurrent contexts at ~6; after that, audio
  silently died for the rest of the session. Introduced a single lazy
  `_sharedAudio()` helper in `10-utils.js` and routed both callers
  through it.
- **Re-entrant toggle races.** Rapid double-clicks on Range Rings,
  Fires & Hurricanes, and Plane-Over-My-House toggles could stack
  intervals, leak layers, and desync the `enabled` flag from the UI.
  Added `_pendingEnable` / `_pendingOp` coalescing so re-entrant
  calls wait on the in-flight operation, then observe the final state.
- **Phase-of-flight classifier** had duplicate `return 'cruise'` /
  `return 'climb'` branches (dead code). Collapsed to clean branches
  and added proper `'ground'` vs numeric-`0` handling — `0` is no
  longer treated as a ground token (many feeds clamp small AGL values
  to 0 and this was misclassifying low GA flights as taxiing).
- **Surveillance-orbit detector** left `minAlt = Infinity` when the
  trail was entirely ground-tagged, silently passing the altitude
  gate. Now requires at least one numeric altitude reading before
  flagging LOITER.
- **Geofence context-menu listener leak.** Each zone context-menu
  session added a global `document.click` listener that only removed
  itself on the *next* outside click — so choosing a menu item left
  the listener attached until a stray click later. Hoisted
  `closeMenu` so both paths remove the same reference.
- **`uiDialogs.open` focus restoration race.** Back-to-back dialog
  calls recorded `document.activeElement` *after* `finish()` had
  already re-focused the previous trigger, so the new dialog's
  "caller" was wrong and focus landed on the first trigger on close.
  Fixed by capturing the caller before closing the prior dialog.
- **`parseInt()` radix + `NaN` propagation.** Filter inputs
  (`altMin` / `altMax` / `speedMin` / `speedMax`) used
  `parseInt(...)` + `!isNaN(...)`; on non-numeric input this left
  the filter state as `NaN`, which compares false against everything
  and silently swallowed user-entered filters. Switched to explicit
  base-10 radix + `Number.isFinite`. Also added the missing radix
  to the 7 remaining dataset-index `parseInt` call sites.

#### Medium (UX / reliability)
- `planeOverHome` dinged on first render after page reload (startling).
  Added `_suppressNextDing` so the ding only fires on genuine changes
  of closest aircraft after the widget has already rendered once.
- `planeOverHome` counter was mislabelled "seen today" — it's actually
  a rolling 10-minute window. Renamed to "recent" to match behaviour.
- `planeOverHome` now registers its ticker via `_setPausableInterval`
  when available, so it honours tab-visibility pause like the rest
  of the app.
- `emergencyPulse` now guards against double-init and also uses the
  pausable interval scaffolding.
- `fires-hurricanes._load` drops its fetch result if the user
  disabled the overlay mid-fetch (previously would still render a
  doomed layer onto a map the user just cleared).
- Home-widget container gains `role="region"` + `aria-label`, and
  its buttons carry `aria-label` where icon-only.

#### Tooling
- No build-system changes. `build.mjs --check` clean; all 14 modules
  + app.js pass `node --check`.

### Previous
## [v0.20.0] - 2026-04-17

### Project layout
- Weather stack split out of `src/app.js`: `35-weather.js` (METAR/TAF per-airport
  lookup) and `36-weather-overlay.js` (SIGMET / G-AIRMET / CWA / PIREP / wind
  barbs / animated radar). `app.js` shrinks from ~11000 to ~10600 lines.

### Added
- **Squawk emergency pulse** (module 93). Triple expanding CSS ring under every
  aircraft broadcasting 7500 / 7600 / 7700. Own Leaflet layer, colors by
  squawk (hijack red / radio failure amber / general emergency orange). No
  modification to the main marker renderer — runs as a polled overlay.
- **Surveillance-orbit detector** (module 94). Rule-based loiter detection on
  the selected aircraft's trail: ≥15 min airborne, ≤3 nm bounding radius,
  cumulative heading sweep ≥720°, min altitude <12,000 ft. Renders a purple
  **LOITER** chip next to the callsign when all four gates fire. Tuned
  conservatively so GA pattern work doesn't false-trigger.
- **NIFC fires + NHC hurricane cones overlay** (module 95). Single toolbar
  toggle pulls active-fire incidents from NIFC WFIGS GeoJSON
  (`services3.arcgis.com/.../WFIGS_Incident_Locations_Current`) as acreage-
  sized orange circles, and current-storm centers from NOAA NHC
  (`nhc.noaa.gov/CurrentStorms.json`) colored by intensity (hurricane red /
  TS amber / TD cyan) with dashed forecast tracks. Refreshes every 10 min.
  Both endpoints are CORS-enabled.
- **Plane Over My House widget** (module 96). Sticky bottom-right panel
  listing aircraft passing within a configurable radius (2 / 5 / 10 / 20 /
  50 nm cycle) of a user-set home coordinate. Uses the existing
  `aircraftCache` — no extra network traffic. Auto-plays a soft chime when
  a new closest aircraft enters the radius; click any row to select the
  aircraft. Home coord + radius + enabled state persist via localStorage.
  No unsolicited geolocation prompt — user sets home by clicking "Use map
  center" on the first run.

### Previous
## [v0.19.0] - 2026-04-17

### Project layout
- **Modular source tree.** `src/app.js` split into `src/modules/*.js` authored
  as concatenated chunks, loaded by `build.mjs` in lexicographic order
  (numeric prefixes control ordering) and inlined into the single deployable
  `index.html`. Same runtime scope, same `file://` compatibility — just
  readable. Initial extractions:
  - `00-config.js` — `CONFIG` + `DATA_URLS`
  - `10-utils.js` — `_dbg`, `_escHtml`, `errorHandler`, `perfUtils`, pausable
    interval scaffolding
  - `20-reliability.js` — connection monitor, offline manager, data-source
    manager, auto-retry, error recovery, circuit breaker
  - `30-storage.js` — `skytrackDB` (IndexedDB)
  - `50-route-lookup.js` — adsbdb + hexdb callsign→route fallback
  - `90-range-rings.js`, `91-phase-of-flight.js`, `92-country-flag.js` —
    new feature modules (below)
- `src/app.js` shrinks from ~11900 to ~11000 lines this round; remaining
  sections will follow in later bumps. The module banner comment is emitted
  by `build.mjs` so stack traces stay readable.

### Added
- **Range rings** (module 90). Dashed concentric circles at 50/100/150/200 nm
  centered on the user's geolocation (or map center as fallback). Tar1090
  `SiteCirclesDistances` convention. Toggle from Tools dropdown; persists
  across sessions via localStorage; no unsolicited geolocation prompt
  (honours the same prior-permission gate used by the military-alert feature).
- **Phase-of-flight classifier** (module 91). Pure rule-based labeller
  (`ground` / `taxi` / `takeoff` / `climb` / `cruise` / `descent` /
  `approach` / `landing`) from `alt_baro` + `gs` + `baro_rate`. Renders as
  a colored chip next to the callsign in the info panel and sets `ac.phase`
  so downstream analytics can key off it.
- **Country flag badge** (module 92). ICAO 24-bit hex → ISO-2 country code +
  regional-indicator emoji. Compact in-memory allocation table (~180 rows),
  memoised `Map` cache. Renders next to the hex code in the info panel.
  No image assets — just Unicode emoji.

### Previous
## [v0.18.0] - 2026-04-17

### Added
- **ADSB.fi as 4th position feed.** Europe-strong Finnish ADS-B network joins
  ADSB One / ADSB.lol / Airplanes.live in the round-robin. CORS-enabled, so it
  works without the proxy chain on failover — improves coverage over Scandinavia
  and the Baltics and gives one more independent source during outages.
- **adsbdb.com + hexdb.io callsign → route fallback.** When the selected
  aircraft has a callsign but the bundled routes.csv doesn't know the route,
  SkyTrack now queries `api.adsbdb.com/v2/callsign/{cs}` (400k+ routes,
  CORS-enabled) and falls back to `hexdb.io/api/v1/route/icao/{cs}`. Results
  cached per callsign with 4 h positive / 15 min negative TTL and coalesced
  with `inflight` map so rapid re-selects don't stampede the APIs. Replaces
  the previous behaviour of showing `???` for any callsign missing from the
  static routes DB.
- **G-AIRMET + CWA polygons in the weather overlay.** In addition to the
  existing international SIGMETs, the weather overlay now renders:
  - Graphical AIRMETs from `aviationweather.gov/api/data/gairmet` —
    color-coded by hazard (turbulence/icing/IFR/mountain obscuration) with
    forecast altitude band in the popup.
  - Center Weather Advisories from `/api/data/cwa` — US short-term convective
    / turbulence / icing cells, rendered at higher opacity than G-AIRMET.
- **PIREPs (pilot reports) as circle markers.** Viewport-scoped fetch from
  `/api/data/pirep?bbox=...&age=2` — the endpoint 400s without a bbox, so
  scope is required. Urgent (UUA) reports render larger and in red; routine
  reports in cyan. Raw report text shown in popup.
- **Animated RainViewer radar.** The previous implementation rendered only
  the single most-recent past frame. The new `radarAnimator` cycles the last
  10 past frames + all nowcast forecast frames at 700 ms/frame, with nowcast
  frames at lower opacity so forecasts read as less certain. Re-entering the
  overlay reloads the frame manifest.

### Previous
## [v0.17.0] - 2026-04-16

### Project layout
- Split the single 14,000-line `index.html` into three authored files under
  `src/` (`index.html` shell, `styles.css`, `app.js`) so individual subsystems
  are editable without scrolling through the entire app. Added `build.mjs`, a
  dependency-free Node builder that reassembles the files back into a single
  deployable `index.html` (what GitHub Pages serves). `package.json` exposes
  `npm run build` / `npm run check`. CI can gate PRs on `node build.mjs --check`
  so the shipped single-file never drifts from the sources.

### Fixed
- Critical: `_dbg` debug logger called itself recursively, causing a stack
  overflow whenever `?debug` was present in the URL. Now emits to `console.log`.
- Service worker registration tried to widen scope to `/` from a `blob:` script
  URL, which raised a SecurityError in some browsers. Now uses the default
  origin scope, so the offline cache actually registers.
- `flightTracker.calculateProgress` returned `NaN`/`Infinity` when the origin
  and destination airports collapsed to the same point. Now returns `null`
  defensively and input coordinates are validated.
- `playbackController.seekTo` silently propagated `NaN` from an empty/invalid
  slider value into `currentIndex`, desyncing subsequent seeks. Now rejects
  non-finite indexes and clamps to trail bounds.
- `playbackController.start` leaked an active `setInterval` + playback marker
  if the user started a new playback session while another was running. Now
  cleans up the previous interval and resets the play button state before
  loading the new trail.
- `measureTool.toggle` / `.finish` could never unregister their Leaflet click
  handlers: each call to `this.addPoint.bind(this)` returns a *new* function,
  so `map.off(...)` was a no-op and every toggle stacked another click
  listener onto the map. After a couple of toggles, every map click counted
  as multiple measurement points. The bound references are now cached on the
  object and reused by both `on` and `off`.
- Removed a stale manual `[SkyTrack]` prefix in one mobile-init debug call that
  was doubled up after `_dbg` was fixed to add the prefix itself.
- `geofences.startDrawing` / `cleanupDrawing` had the same `bind(this)` issue
  as `measureTool`: the map click handler was never actually removed after a
  zone was drawn. Cached the bound reference so `off` matches `on`.
- `loadMapPosition` now validates the stored `lat/lng/zoom` before applying
  them to `CONFIG`. A corrupt or hand-edited `skytrack_map` entry could
  previously restore the map to an off-world position or an out-of-range zoom
  that Leaflet refused to render from.
- `saveMapPosition` now guards against `map` being null during early
  `beforeunload` and catches `QuotaExceededError` from private-mode storage.
- `trailExporter.exportCSV` was treating each `history` entry as an object
  (`h.lat`, `h.time`, ...), but `processAircraftData` pushes tuples
  (`[lat, lon, alt, timestampMs]`). Every exported row was empty and
  `new Date(undefined).toISOString()` threw on the first iteration — so the
  CSV export has never actually worked. Rewrote to unpack tuples correctly,
  validate finiteness of each numeric field, and preserve `'ground'`.
- `shareManager.generateLink` used `if (ac.lat && ac.lon)` which treats the
  equator / prime meridian as missing coordinates and dropped them from share
  URLs. Switched to `Number.isFinite` checks.
- Time-machine `play`/`pause` crashed with "Cannot set properties of null" if
  the play/pause button was not yet in the DOM (rare timing path). Now
  null-guards the lookup.

### Security
- KML and GPX export now XML-escape callsign, registration, type, and hex
  before splicing them into `<name>`/`<description>`/attributes. Previously an
  ADS-B callsign containing `<`, `>`, `&`, or `"` produced a malformed file;
  worse, a crafted callsign like `</name><...>` could shift subsequent KML
  content into unexpected elements. Also added a filename sanitizer that
  collapses anything outside `[A-Za-z0-9._-]` to `_` so exports can't produce
  filenames with path separators or control characters.
- `trailExporter._isoTime` tolerates both seconds-since-epoch (tar1090
  convention) and already-formatted time strings, returning an empty element
  instead of emitting `Invalid Date` into the GPX stream.
- All six external-link URLs in `updateExternalLinks` now `encodeURIComponent`
  the ADS-B-sourced hex, registration, callsign, and type before splicing
  them into `<a href>`. A callsign with `?`, `&`, `#`, spaces, or quotes
  previously produced a broken URL or broke the anchor attribute.
- Added `rel="noopener noreferrer"` to every `target="_blank"` anchor in the
  info panel and airport panel (7 total). Modern browsers imply noopener for
  `_blank` but older ones and embedded WebViews don't, and shipping explicit
  `noopener` also prevents referrer leakage.

### Performance / reliability
- `heatmapLayer` previously re-appended the `leaflet-heat.js` `<script>` tag
  every time `update()` ran while the plugin was still downloading, and
  retried forever if the CDN was unreachable. Rewrote with a single
  `_pluginState` (null → pending Promise → `true` / `'failed'`) so the load
  happens once. Also switched point filtering to `Number.isFinite(lat/lon)`
  and aborted the layer creation if the user disabled the heatmap while the
  plugin was loading.
- `aircraftDataEnricher.calculateProgress` carried the same bugs as
  `flightTracker.calculateProgress` (equator falsy-check, no string-coord
  coercion, no zero-distance guard). Hardened with `Number.isFinite` + a
  `totalDist <= 0` early return. The info panel no longer renders
  `NaN km / NaN%` for degenerate origin/destination pairs.
- `_el(id)` DOM cache previously memoised `null` if called before the element
  existed, so any later lookup of that id would return `null` forever. It now
  only caches hits and also invalidates stale references via `isConnected`.
- Version strings were inconsistent across the title bar (`v4.6`), loading
  screen (`v4.2`), service worker cache name (`v4.6`), and the README/CHANGELOG
  (`0.16.0`). All unified to the published release version.
- Bookmarks list previously threw if the container was missing (initialization
  race). Guarded with a null check.

### Security
- Removed a publicly-exposed default `clientSecret` from `CONFIG.defaultCredentials`
  (unused in any fetch, but shipped in source nonetheless).
- Hardened innerHTML string interpolation with a new `_escHtml` helper for:
  alert notifications (callsign/message from ADS-B), watchlist entries (user
  name), airline/alliance badge, airport weather (METAR raw), airport Wikipedia
  thumbnail, frequency list, bookmarks list, and aircraft photos.
- Extended the same escaping pass to cover every other innerHTML site that
  splices third-party data: search result rows (aircraft/airport/airline),
  search history, airport arrival/departure board, notification center cards
  (persisted across sessions in localStorage), comparison panel table + inline
  photo, NOTAM panel, mobile aircraft list + watchlist sheet, top-airlines and
  busiest-airports stats rows, and geofence zone names. LiveATC link now also
  validates the ICAO against `[A-Z0-9]{1,5}` and uses `rel="noopener"`.
- Settings loader now clamps `settings.filter` against a whitelist so a stale
  or corrupt value in localStorage cannot wedge the filter UI.
- `shareManager.checkUrlParams` / `popstate` now whitelist the `filter` value,
  require a 6-char uppercase hex, and clamp `lat`/`lon`/`zoom` to valid ranges
  so a crafted URL cannot push the map off-world or set an arbitrary filter.

### Privacy / UX
- Geolocation tracking no longer prompts on page load. It only activates when
  military alerts are enabled *and* the browser already reports
  `geolocation: granted`. Switching the military-alert radius to `0` stops the
  tracker cleanly; raising it above `0` (re-)starts it. The poll-every-60s
  timer was replaced with `watchPosition`, and the interval handle is now
  tracked to prevent accumulating duplicate timers across re-inits.

### Previous
## [v0.16.0] - 2026-04-13
- Fix CORS failures preventing aircraft from loading
- Fix crash when saved map style is invalid
- Change default map to Google Hybrid
- Port VIPTrack mobile optimizations to SkyTrack

## Roadmap archive — 2026-08-10 — ROADMAP.md

<details>
<summary>Original roadmap snapshot</summary>

```markdown
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

### UX / viz
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|

### Analytics
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|

### Hardening & platform (round-2 research)
| # | Feature | Effort | Rationale |
|---|---------|--------|-----------|

---

## Tier 2 — Candidate features

### Data

### UX

### Analytics

### Storytelling & content creation

### Audio & voice

### Integrations

### Ambient & dashboard modes

---

## Tier 3 — Bigger bets


---

## Signature / "wow-factor" candidates

These are the top-ranked differentiating features from round-2 research — each scored high on novelty × implementability × user demand. They cluster here rather than under Tier 1/2 so they can be picked up as **signature projects** when we want to ship something shareable rather than grind through incremental tier work.

| Feature | Why it stands out |
|---------|------|

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
```

</details>
