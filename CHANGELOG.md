# Changelog

All notable changes to SkyTrack will be documented in this file.

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
