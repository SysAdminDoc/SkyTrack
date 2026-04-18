
    // ============ ISS LIVE-POSITION TRACKER ============
    // Toggle-able overlay that paints the current location of the
    // International Space Station on the 2D map. Uses the public
    // `api.wheretheiss.at/v1/satellites/25544` endpoint (CORS-enabled,
    // no key, returns JSON with latitude/longitude/altitude/velocity).
    //
    // We only update every 10 seconds — the station moves about 72 km/s
    // relative to ground, so a polling cadence that dense would dominate
    // API quota for a feature nobody needs to see animated per-second.
    // Between polls the marker interpolates linearly from the last known
    // fix using a `requestAnimationFrame` loop, so the pin visibly moves
    // on-screen the whole time.
    //
    // Footprint: one marker + one dashed ground-track polyline (rolling
    // buffer of the last 20 minutes of fixes), both in a single
    // LayerGroup that's removed on disable.
    const issTracker = {
        _inited: false,
        map: null,
        enabled: false,
        layer: null,
        marker: null,
        trail: null,

        pollMs: 10000,
        pollTimer: null,
        _rafId: 0,
        _trailMaxMs: 20 * 60 * 1000,
        _lastFix: null,      // { lat, lon, alt, velocity, ts }
        _prevFix: null,

        URL: 'https://api.wheretheiss.at/v1/satellites/25544',

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            try {
                if (localStorage.getItem('skytrack_iss_tracker') === 'on') {
                    this.enable().catch(() => {});
                }
            } catch (_) {}
        },

        async toggle() {
            if (this.enabled) { this.disable(); return false; }
            await this.enable();
            return this.enabled;
        },

        async enable() {
            if (!this.map) return;
            this.enabled = true;
            try { localStorage.setItem('skytrack_iss_tracker', 'on'); } catch (_) {}
            if (!this.layer) this.layer = L.layerGroup().addTo(this.map);
            await this._fetchOnce();
            this._startPoll();
            this._startRaf();
        },

        disable() {
            this.enabled = false;
            try { localStorage.setItem('skytrack_iss_tracker', 'off'); } catch (_) {}
            if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
            if (this.layer) {
                try { this.map.removeLayer(this.layer); } catch (_) {}
                this.layer = null;
            }
            this.marker = null;
            this.trail = null;
            this._lastFix = null;
            this._prevFix = null;
        },

        _startPoll() {
            if (this.pollTimer) return;
            this.pollTimer = setInterval(() => {
                if (!this.enabled) return;
                this._fetchOnce();
            }, this.pollMs);
        },

        async _fetchOnce() {
            try {
                const resp = await fetch(this.URL, { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const data = await resp.json();
                const lat = Number(data?.latitude);
                const lon = Number(data?.longitude);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
                const fix = {
                    lat, lon,
                    alt: Number(data?.altitude) || null,
                    velocity: Number(data?.velocity) || null,
                    ts: Date.now()
                };
                this._prevFix = this._lastFix;
                this._lastFix = fix;
                this._paint(lat, lon, true);
            } catch (e) {
                try { errorHandler.log('ISS tracker', e?.message || e); } catch (_) {}
            }
        },

        _startRaf() {
            const step = () => {
                if (!this.enabled) return;
                // Linear interpolation between the last two fixes.
                const last = this._lastFix, prev = this._prevFix;
                if (!last) { this._rafId = requestAnimationFrame(step); return; }
                if (prev && last.ts !== prev.ts) {
                    const now = Date.now();
                    const dt = (now - last.ts) / this.pollMs; // roughly 0..1 between polls
                    const t = Math.max(0, Math.min(2, dt));
                    // Shortest-path longitude delta (handles anti-meridian crossing).
                    let dLon = last.lon - prev.lon;
                    if (dLon > 180) dLon -= 360;
                    else if (dLon < -180) dLon += 360;
                    const lat = last.lat + (last.lat - prev.lat) * t;
                    let lon = last.lon + dLon * t;
                    if (lon > 180) lon -= 360;
                    else if (lon < -180) lon += 360;
                    this._paint(lat, lon, false);
                }
                this._rafId = requestAnimationFrame(step);
            };
            this._rafId = requestAnimationFrame(step);
        },

        _paint(lat, lon, freshFix) {
            if (!this.layer) return;
            if (!this.marker) {
                this.marker = L.marker([lat, lon], {
                    icon: L.divIcon({
                        className: 'iss-marker',
                        html: '<div class="iss-pin" title="International Space Station">🛰️</div>',
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                    }),
                    interactive: true,
                    keyboard: false
                });
                this.marker.addTo(this.layer);
                this.marker.on('click', () => this._openPopup());
            } else {
                try { this.marker.setLatLng([lat, lon]); } catch (_) {}
            }
            if (freshFix && this._lastFix) {
                if (!this.trail) {
                    this.trail = L.polyline([], {
                        color: '#22d3ee',
                        weight: 1.4,
                        opacity: 0.75,
                        dashArray: '6 6',
                        interactive: false
                    }).addTo(this.layer);
                }
                // Rolling window of recent fixes.
                const latlngs = this.trail.getLatLngs();
                latlngs.push([lat, lon]);
                // Trim by time, not by count — the trail itself carries
                // timestamps through a parallel buffer.
                if (!this._trailTimes) this._trailTimes = [];
                this._trailTimes.push(this._lastFix.ts);
                const cutoff = Date.now() - this._trailMaxMs;
                while (this._trailTimes.length && this._trailTimes[0] < cutoff) {
                    this._trailTimes.shift();
                    latlngs.shift();
                }
                this.trail.setLatLngs(latlngs);
                if (this.marker.isPopupOpen?.()) this._refreshPopup();
            }
        },

        _popupHtml() {
            const last = this._lastFix;
            if (!last) return '<strong>ISS</strong><br>Waiting for first fix…';
            const alt = last.alt ? last.alt.toFixed(1) + ' km' : '—';
            const vel = last.velocity ? last.velocity.toFixed(0) + ' km/h' : '—';
            const ageSec = ((Date.now() - last.ts) / 1000).toFixed(0);
            return '<div class="sigmet-popup"><strong>🛰️ International Space Station</strong><br>' +
                'Altitude ' + _escHtml(alt) + '<br>' +
                'Speed ' + _escHtml(vel) + '<br>' +
                'Last fix ' + _escHtml(ageSec) + 's ago</div>';
        },

        _openPopup() {
            if (!this.marker) return;
            try { this.marker.bindPopup(this._popupHtml()).openPopup(); } catch (_) {}
        },

        _refreshPopup() {
            if (!this.marker) return;
            try { this.marker.setPopupContent(this._popupHtml()); } catch (_) {}
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) issTracker.init(map);
    });
