# Changelog

All notable changes to SkyTrack will be documented in this file.

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
