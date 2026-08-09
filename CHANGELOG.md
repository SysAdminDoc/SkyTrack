# Changelog

All notable changes to SkyTrack will be documented in this file.

## [Unreleased]

### Added
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
