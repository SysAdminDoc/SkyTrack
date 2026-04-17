
    // ============ PLANE OVER MY HOUSE (v0.20.0) ============
    // Signature feature: persistent floating ticker of aircraft passing
    // within N nautical miles of a user-configured "home" coordinate.
    // Ship as a bottom-right sticky widget that survives panel churn.
    //
    // First-time UX: button in Tools menu opens the widget; the widget's
    // "Set home" button captures the current map center as home, persists
    // to localStorage. No unsolicited geolocation prompt.
    //
    // The widget polls `aircraftCache` (already the canonical live store)
    // every refresh cycle; no extra network traffic.
    const planeOverHome = {
        enabled: false,
        home: null,            // { lat, lon, label }
        radiusNm: 5,
        maxRows: 6,
        containerEl: null,
        tickTimer: null,
        tickMs: 4000,
        recent: new Map(),     // hex → { firstSeen, lastSeen, closestNm, callsign }
        lastClosestHex: null,
        map: null,

        init(map) {
            this.map = map;
            try {
                const saved = JSON.parse(localStorage.getItem('skytrack_home_widget') || 'null');
                if (saved && Number.isFinite(saved?.home?.lat) && Number.isFinite(saved?.home?.lon)) {
                    this.home = { lat: saved.home.lat, lon: saved.home.lon, label: saved.home.label || '' };
                    if (Number.isFinite(saved.radiusNm) && saved.radiusNm > 0 && saved.radiusNm <= 200) {
                        this.radiusNm = saved.radiusNm;
                    }
                    if (saved.enabled === true) this.show();
                }
            } catch (_) {}
        },

        save() {
            try {
                localStorage.setItem('skytrack_home_widget', JSON.stringify({
                    enabled: this.enabled,
                    home: this.home,
                    radiusNm: this.radiusNm
                }));
            } catch (_) {}
        },

        toggle() {
            if (this.enabled) { this.hide(); return false; }
            this.show();
            return true;
        },

        show() {
            this.enabled = true;
            this._ensureContainer();
            this._render();
            if (this.tickTimer) clearInterval(this.tickTimer);
            this.tickTimer = setInterval(() => this._render(), this.tickMs);
            this.save();
        },

        hide() {
            this.enabled = false;
            if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
            if (this.containerEl) {
                try { this.containerEl.remove(); } catch (_) {}
                this.containerEl = null;
            }
            this.save();
        },

        setHome(lat, lon, label) {
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            this.home = { lat, lon, label: label || '' };
            this.recent.clear();
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
            document.body.appendChild(el);
            this.containerEl = el;
            // Delegate clicks for "Set home / map center" and "Hide".
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
                else if (action === 'clear')  { this.home = null; this.recent.clear(); this.save(); this._render(); }
            });
        },

        _cycleRadius() {
            const options = [2, 5, 10, 20, 50];
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
                        '<button class="home-widget-x" data-action="hide" title="Hide widget">×</button>' +
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
            // Update recent history (for leave-toast + persistence).
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
            // Ding on new closest aircraft (at most once per hex).
            const closest = nearby[0];
            if (closest && closest.ac.hex !== this.lastClosestHex) {
                this.lastClosestHex = closest.ac.hex;
                this._ding();
            } else if (!closest) {
                this.lastClosestHex = null;
            }
            // Evict old entries (> 10 min since last seen).
            for (const [hex, rec] of this.recent) {
                if (now - rec.lastSeen > 600000) this.recent.delete(hex);
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
            if (!rows) rows = '<div class="home-widget-empty-row">No aircraft within ' + this.radiusNm + ' nm.</div>';
            const labelTxt = h.label ? h.label : h.lat.toFixed(3) + ', ' + h.lon.toFixed(3);
            this.containerEl.innerHTML =
                '<div class="home-widget-header">' +
                    '<span class="home-widget-title">✈️ Over my house</span>' +
                    '<button class="home-widget-btn ghost" data-action="radius" title="Cycle radius">' + this.radiusNm + ' nm</button>' +
                    '<button class="home-widget-btn ghost" data-action="set-here" title="Reset home to map center">⌖</button>' +
                    '<button class="home-widget-x" data-action="hide" title="Hide widget">×</button>' +
                '</div>' +
                '<div class="home-widget-sub">' + _escHtml(labelTxt) + ' · seen today: ' + this.recent.size + '</div>' +
                '<div class="home-widget-rows">' + rows + '</div>';
        },

        _ding() {
            // One short chime when a new closest aircraft enters the radius.
            // Respects user-gesture requirement — silently fails on first page load.
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.06, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.connect(gain).connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            } catch (_) {}
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) planeOverHome.init(map);
    });
