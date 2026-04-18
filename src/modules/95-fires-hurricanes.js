
    // ============ NIFC FIRES + NHC HURRICANES OVERLAY ============
    // Two high-signal overlays that tell a story aircraft often care about:
    //   * NIFC WFIGS active-fire incidents (firefighting tankers orbit these)
    //   * NHC current-storm forecast tracks (hurricane hunters fly through these)
    //
    // Both endpoints are CORS-enabled GeoJSON/JSON; both refresh on toggle,
    // then once every 10 min while active. Single toggle button, both layers
    // share the same on/off state since they're complementary storytelling.
    const firesHurricanes = {
        _inited: false,
        _pendingOp: null,   // in-flight enable()/disable() — blocks re-entry
        map: null,
        fireLayer: null,
        stormLayer: null,
        enabled: false,
        refreshTimer: null,
        refreshMs: 600000, // 10 min
        NIFC_URL:
            'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
            'WFIGS_Incident_Locations_Current/FeatureServer/0/query?' +
            'f=geojson&where=FireCause%20%3D%20FireCause&outFields=*',
        NHC_URL: 'https://www.nhc.noaa.gov/CurrentStorms.json',

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            let savedOn = false;
            try {
                savedOn = localStorage.getItem('skytrack_fires_hurricanes') === 'on';
            } catch (_) { /* storage blocked */ }
            // Kick off restore without blocking init; any failure is swallowed
            // by the same try/catch paths as a user-initiated toggle.
            if (savedOn) {
                this.enable().catch(() => { /* surfaced inside enable() */ });
            }
        },

        async toggle() {
            // Guard against rapid re-entry: if a previous toggle is still in
            // flight we either wait for it (and invert) or cancel. Simpler:
            // queue behind the pending op and then flip based on current
            // state at the time the queue drains.
            if (this._pendingOp) {
                try { await this._pendingOp; } catch (_) { /* prior error already surfaced */ }
            }
            if (this.enabled) {
                this.disable();
                return false;
            }
            await this.enable();
            return this.enabled;
        },

        async enable() {
            if (this.enabled) return;
            this.enabled = true;
            try { localStorage.setItem('skytrack_fires_hurricanes', 'on'); } catch (_) {}
            const op = this._load();
            this._pendingOp = op;
            try {
                await op;
            } finally {
                if (this._pendingOp === op) this._pendingOp = null;
            }
            // If the user raced a disable() in the window, respect that.
            if (!this.enabled) return;
            if (this.refreshTimer) clearInterval(this.refreshTimer);
            this.refreshTimer = setInterval(() => this._load(), this.refreshMs);
        },

        disable() {
            this.enabled = false;
            try { localStorage.setItem('skytrack_fires_hurricanes', 'off'); } catch (_) {}
            if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
            if (this.fireLayer)  {
                try { this.map?.removeLayer(this.fireLayer); } catch (_) {}
                this.fireLayer = null;
            }
            if (this.stormLayer) {
                try { this.map?.removeLayer(this.stormLayer); } catch (_) {}
                this.stormLayer = null;
            }
        },

        async _load() {
            await Promise.allSettled([this._loadFires(), this._loadStorms()]);
        },

        async _loadFires() {
            if (!this.map || !this.enabled) return;
            try {
                const resp = await fetch(this.NIFC_URL, { signal: AbortSignal.timeout(15000) });
                if (!resp.ok) throw new Error('NIFC ' + resp.status);
                const geo = await resp.json();
                // If the user disabled the overlay mid-fetch, drop the result.
                if (!this.enabled) return;
                if (this.fireLayer) {
                    try { this.map.removeLayer(this.fireLayer); } catch (_) {}
                }
                this.fireLayer = L.layerGroup();
                const features = Array.isArray(geo?.features) ? geo.features : [];
                for (const f of features) {
                    const c = f?.geometry?.coordinates;
                    if (!Array.isArray(c) || c.length < 2) continue;
                    const lon = Number(c[0]);
                    const lat = Number(c[1]);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                    const p = f.properties || {};
                    const acresRaw = Number(p.DailyAcres ?? p.IncidentSize ?? p.CalculatedAcres);
                    const hasAcres = Number.isFinite(acresRaw) && acresRaw > 0;
                    const radius = hasAcres
                        ? Math.max(4, Math.min(18, 3 + Math.log10(acresRaw) * 2))
                        : 5;
                    const marker = L.circleMarker([lat, lon], {
                        radius,
                        color: '#b91c1c',
                        weight: 1,
                        fillColor: '#f97316',
                        fillOpacity: 0.75
                    });
                    const name = p.IncidentName || p.FireName || 'Active fire';
                    const state = p.POOState || p.State || '';
                    const acresTxt = hasAcres ? Math.round(acresRaw).toLocaleString() + ' acres' : '';
                    const containmentNum = Number(p.PercentContained);
                    const containment = Number.isFinite(containmentNum)
                        ? Math.round(containmentNum) + '% contained'
                        : '';
                    marker.bindPopup(
                        '<div class="sigmet-popup"><strong>🔥 ' + _escHtml(name) + '</strong><br>' +
                        (state ? _escHtml(state) + '<br>' : '') +
                        (acresTxt ? _escHtml(acresTxt) + '<br>' : '') +
                        (containment ? _escHtml(containment) : '') +
                        '</div>'
                    );
                    this.fireLayer.addLayer(marker);
                }
                if (this.enabled && this.fireLayer.getLayers().length > 0) {
                    this.fireLayer.addTo(this.map);
                }
                _dbg('NIFC fires loaded:', this.fireLayer.getLayers().length);
            } catch (e) {
                try { errorHandler.log('NIFC fires', e?.message || e); } catch (_) {}
            }
        },

        async _loadStorms() {
            if (!this.map || !this.enabled) return;
            try {
                const resp = await fetch(this.NHC_URL, { signal: AbortSignal.timeout(15000) });
                if (!resp.ok) throw new Error('NHC ' + resp.status);
                const data = await resp.json();
                if (!this.enabled) return;
                if (this.stormLayer) {
                    try { this.map.removeLayer(this.stormLayer); } catch (_) {}
                }
                this.stormLayer = L.layerGroup();
                const storms = Array.isArray(data?.activeStorms) ? data.activeStorms : [];
                for (const s of storms) {
                    const lat = Number(s?.latitudeNumeric);
                    const lon = Number(s?.longitudeNumeric);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                    const name = s.name || s.binNumber || 'Storm';
                    const cls = (s.classification || '').toUpperCase();
                    const intensity = Number(s.intensity);
                    const hasIntensity = Number.isFinite(intensity) && intensity > 0;
                    const color = (cls === 'HU' || (hasIntensity && intensity >= 74)) ? '#dc2626' :
                                  (cls === 'TS' || (hasIntensity && intensity >= 39)) ? '#f59e0b' :
                                  '#22d3ee';
                    const center = L.circleMarker([lat, lon], {
                        radius: 10,
                        color: color,
                        weight: 2,
                        fillColor: color,
                        fillOpacity: 0.6
                    });
                    center.bindPopup(
                        '<div class="sigmet-popup"><strong>🌀 ' + _escHtml(name) + '</strong><br>' +
                        _escHtml(cls || 'Tropical system') +
                        (hasIntensity ? ' · ' + intensity + ' kt' : '') +
                        (s.pressure ? '<br>Pressure ' + _escHtml(s.pressure) + ' mb' : '') +
                        (s.movement ? '<br>Moving ' + _escHtml(s.movement) : '') +
                        '</div>'
                    );
                    this.stormLayer.addLayer(center);
                    // Forecast track, if the JSON exposes it. NHC also publishes
                    // a cone-of-uncertainty as KMZ — that format needs an
                    // unzip/XML pipeline this zero-dep app can't cheaply ship,
                    // so we only render the simple polyline here.
                    if (Array.isArray(s.forecast) && s.forecast.length >= 2) {
                        const pts = s.forecast
                            .map(f => [Number(f?.lat), Number(f?.lon)])
                            .filter(([lt, ln]) => Number.isFinite(lt) && Number.isFinite(ln));
                        if (pts.length >= 2) {
                            const path = L.polyline([[lat, lon]].concat(pts), {
                                color: color,
                                weight: 2,
                                opacity: 0.85,
                                dashArray: '8 4'
                            });
                            this.stormLayer.addLayer(path);
                        }
                    }
                }
                if (this.enabled && this.stormLayer.getLayers().length > 0) {
                    this.stormLayer.addTo(this.map);
                }
                _dbg('NHC storms loaded:', this.stormLayer.getLayers().length);
            } catch (e) {
                try { errorHandler.log('NHC storms', e?.message || e); } catch (_) {}
            }
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) firesHurricanes.init(map);
    });
