
    // ============ PLANE OVER MY HOUSE ============
    // Signature feature: persistent floating ticker of aircraft passing
    // within N nautical miles of a user-configured "home" coordinate.
    // Ships as a bottom-right sticky widget that survives panel churn.
    //
    // First-time UX: button in Tools menu opens the widget; the widget's
    // "Use map center" button captures the current map center as home and
    // persists to localStorage. No unsolicited geolocation prompt.
    //
    // The widget reads `aircraftCache` (the canonical live store) every
    // refresh cycle; no extra network traffic. Ticks are registered via
    // `_setPausableInterval` when available so it naturally pauses along
    // with the rest of the app when the tab is backgrounded.
    const planeOverHome = {
        _inited: false,
        enabled: false,
        home: null,            // { lat, lon, label }
        radiusNm: 5,
        maxRows: 6,
        containerEl: null,
        // When `_setPausableInterval` is used we don't need to track the
        // handle for cleanup — the scaffolding clears all tracked intervals
        // on pause. For the fallback path we still track it so hide() can
        // stop the ticker cleanly.
        tickTimer: null,
        tickMs: 4000,
        recent: new Map(),     // hex → { firstSeen, lastSeen, closestNm, callsign }
        lastClosestHex: null,
        _suppressNextDing: false,
        map: null,

        // Radius cycle, in nautical miles.
        RADIUS_OPTIONS: [2, 5, 10, 20, 50],
        RECENT_TTL_MS: 600000, // 10 min

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            try {
                const raw = localStorage.getItem('skytrack_home_widget');
                const saved = raw ? JSON.parse(raw) : null;
                if (saved && Number.isFinite(saved?.home?.lat) && Number.isFinite(saved?.home?.lon)) {
                    this.home = {
                        lat: saved.home.lat,
                        lon: saved.home.lon,
                        label: typeof saved.home.label === 'string' ? saved.home.label : ''
                    };
                    if (Number.isFinite(saved.radiusNm) && saved.radiusNm > 0 && saved.radiusNm <= 200) {
                        this.radiusNm = saved.radiusNm;
                    }
                    if (saved.enabled === true) {
                        // Suppress the first-render ding when the user is
                        // simply reopening the app; the widget bursting an
                        // unexpected tone on page load is startling.
                        this._suppressNextDing = true;
                        this.show();
                    }
                }
            } catch (_) { /* corrupt storage — fall back to defaults */ }
        },

        save() {
            try {
                localStorage.setItem('skytrack_home_widget', JSON.stringify({
                    enabled: this.enabled,
                    home: this.home,
                    radiusNm: this.radiusNm
                }));
            } catch (_) { /* quota / private mode */ }
        },

        toggle() {
            if (this.enabled) { this.hide(); return false; }
            this.show();
            return true;
        },

        show() {
            this.enabled = true;
            this._ensureContainer();
            // Don't ding on the very first render after an explicit user
            // action either — wait for a *change* of closest aircraft.
            this._suppressNextDing = true;
            this._render();
            this._startTicker();
            this.save();
        },

        hide() {
            this.enabled = false;
            this._stopTicker();
            if (this.containerEl) {
                try { this.containerEl.remove(); } catch (_) {}
                this.containerEl = null;
            }
            this.save();
        },

        _startTicker() {
            // Prefer the pausable scaffolding. Fall back to a raw setInterval
            // only if the host hasn't shipped 10-utils.js.
            this._stopTicker();
            if (typeof _setPausableInterval === 'function') {
                _setPausableInterval(() => { if (this.enabled) this._render(); }, this.tickMs, 'planeOverHome');
            } else {
                this.tickTimer = setInterval(() => { if (this.enabled) this._render(); }, this.tickMs);
            }
        },

        _stopTicker() {
            if (this.tickTimer) {
                clearInterval(this.tickTimer);
                this.tickTimer = null;
            }
            // Intervals registered with _setPausableInterval are global and
            // share the tab-visibility lifecycle; stopping them requires the
            // scaffolding to provide a handle. The gate in the tick closure
            // (`if (this.enabled) ...`) is therefore the authoritative
            // control — when hide() sets `enabled=false`, the tick is a
            // no-op.
        },

        setHome(lat, lon, label) {
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            this.home = { lat, lon, label: label || '' };
            this.recent.clear();
            this.lastClosestHex = null;
            this._suppressNextDing = true;
            this.save();
            if (this.enabled) this._render();
        },

        useMapCenter() {
            if (!this.map) return;
            const c = this.map.getCenter();
            this.setHome(c.lat, c.lng, 'Map center');
        },

        _ensureContainer() {
            if (this.containerEl && this.containerEl.isConnected) return;
            const el = document.createElement('div');
            el.id = 'planeOverHomeWidget';
            el.className = 'home-widget';
            el.setAttribute('role', 'region');
            el.setAttribute('aria-label', 'Aircraft passing your home');
            document.body.appendChild(el);
            this.containerEl = el;
            el.addEventListener('click', (e) => {
                const btn = e.target?.closest?.('[data-action]');
                if (!btn) {
                    const row = e.target?.closest?.('[data-hex]');
                    if (row && typeof selectAircraft === 'function') {
                        const hex = row.getAttribute('data-hex');
                        if (hex) selectAircraft(hex);
                    }
                    return;
                }
                const action = btn.getAttribute('data-action');
                if (action === 'set-here')    this.useMapCenter();
                else if (action === 'hide')   this.hide();
                else if (action === 'radius') this._cycleRadius();
                else if (action === 'clear')  {
                    this.home = null;
                    this.recent.clear();
                    this.lastClosestHex = null;
                    this.save();
                    this._render();
                }
            });
        },

        _cycleRadius() {
            const options = this.RADIUS_OPTIONS;
            const idx = options.indexOf(this.radiusNm);
            this.radiusNm = options[(idx + 1) % options.length];
            this.save();
            this._render();
        },

        _distanceNm(lat1, lon1, lat2, lon2) {
            const R = 3440.065;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) *
                Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        },

        _render() {
            if (!this.containerEl) return;
            const h = this.home;
            if (!h) {
                this.containerEl.innerHTML =
                    '<div class="home-widget-header">' +
                        '<span class="home-widget-title">✈️ Over my house</span>' +
                        '<button class="home-widget-x" data-action="hide" title="Hide widget" aria-label="Hide widget">×</button>' +
                    '</div>' +
                    '<div class="home-widget-empty">' +
                        '<p>Set your home location to see aircraft passing nearby.</p>' +
                        '<button class="home-widget-btn primary" data-action="set-here">Use map center</button>' +
                    '</div>';
                return;
            }
            // Scan live cache.
            const nearby = [];
            if (typeof aircraftCache === 'object' && aircraftCache) {
                for (const hex in aircraftCache) {
                    const ac = aircraftCache[hex];
                    if (!ac) continue;
                    if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
                    const d = this._distanceNm(h.lat, h.lon, ac.lat, ac.lon);
                    if (d <= this.radiusNm) nearby.push({ ac, d });
                }
            }
            nearby.sort((a, b) => a.d - b.d);
            const now = Date.now();
            // Update recent history.
            for (const { ac, d } of nearby) {
                const prev = this.recent.get(ac.hex);
                const callsign = (ac.flight || '').trim() || ac.r || ac.hex;
                if (prev) {
                    prev.lastSeen = now;
                    if (d < prev.closestNm) prev.closestNm = d;
                    prev.callsign = callsign;
                } else {
                    this.recent.set(ac.hex, { firstSeen: now, lastSeen: now, closestNm: d, callsign });
                }
            }
            // Ding when the closest-aircraft identity *changes* to a new hex —
            // but never on the very first render after show()/setHome()/init().
            const closest = nearby[0];
            if (closest) {
                if (!this._suppressNextDing && closest.ac.hex !== this.lastClosestHex) {
                    this._ding();
                }
                this.lastClosestHex = closest.ac.hex;
            } else {
                this.lastClosestHex = null;
            }
            this._suppressNextDing = false;
            // Evict recent entries older than the TTL so "seen recently" stays honest.
            for (const [hex, rec] of this.recent) {
                if (now - rec.lastSeen > this.RECENT_TTL_MS) this.recent.delete(hex);
            }
            // Build HTML.
            let rows = '';
            for (let i = 0; i < Math.min(this.maxRows, nearby.length); i++) {
                const { ac, d } = nearby[i];
                const callsign = (ac.flight || '').trim() || ac.r || ac.hex;
                const alt = ac.alt_baro === 'ground' ? 'GND' :
                    (typeof ac.alt_baro === 'number' ? ac.alt_baro.toLocaleString() + 'ft' : '—');
                const type = ac.t || '';
                rows += '<div class="home-widget-row" data-hex="' + _escHtml(ac.hex) + '">' +
                    '<span class="hw-callsign">' + _escHtml(callsign) + '</span>' +
                    (type ? '<span class="hw-type">' + _escHtml(type) + '</span>' : '') +
                    '<span class="hw-alt">' + _escHtml(alt) + '</span>' +
                    '<span class="hw-dist">' + d.toFixed(1) + ' nm</span>' +
                    '</div>';
            }
            if (!rows) {
                rows = '<div class="home-widget-empty-row">No aircraft within ' + this.radiusNm + ' nm.</div>';
            }
            const labelTxt = h.label ? h.label : h.lat.toFixed(3) + ', ' + h.lon.toFixed(3);
            this.containerEl.innerHTML =
                '<div class="home-widget-header">' +
                    '<span class="home-widget-title">✈️ Over my house</span>' +
                    '<button class="home-widget-btn ghost" data-action="radius" title="Cycle radius">' + this.radiusNm + ' nm</button>' +
                    '<button class="home-widget-btn ghost" data-action="set-here" title="Reset home to map center" aria-label="Reset home to map center">⌖</button>' +
                    '<button class="home-widget-x" data-action="hide" title="Hide widget" aria-label="Hide widget">×</button>' +
                '</div>' +
                '<div class="home-widget-sub">' + _escHtml(labelTxt) + ' · recent: ' + this.recent.size + '</div>' +
                '<div class="home-widget-rows">' + rows + '</div>';
        },

        _ding() {
            // One short chime when a new closest aircraft enters the radius.
            // Respects the user-gesture requirement — silently fails on first
            // page load. Uses a single lazy AudioContext (see _sharedAudio)
            // instead of creating a new one per ding — browsers cap ~6
            // concurrent contexts, which the previous impl quickly exhausted.
            const ctx = _sharedAudio();
            if (!ctx) return;
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.06, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.connect(gain).connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            } catch (_) { /* ignore */ }
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) planeOverHome.init(map);
    });
