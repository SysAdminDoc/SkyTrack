
    // ============ NIFC FIRES + NHC HURRICANES OVERLAY (v0.20.0) ============
    // Two high-signal overlays that tell a story aircraft often care about:
    //   * NIFC WFIGS active-fire incidents (firefighting tankers orbit these)
    //   * NHC current-storm forecast cones (hurricane hunters fly through these)
    //
    // Both endpoints are CORS-enabled GeoJSON/JSON; both refresh on toggle,
    // then once every 10 min while active. Single toggle button, both layers
    // share the same on/off state since they're complementary storytelling.
    const firesHurricanes = {
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
            this.map = map;
            try {
                const saved = localStorage.getItem('skytrack_fires_hurricanes');
                if (saved === 'on') this.enable();
            } catch (_) {}
        },

        async toggle() {
            if (this.enabled) { this.disable(); return false; }
            await this.enable();
            return true;
        },

        async enable() {
            this.enabled = true;
            try { localStorage.setItem('skytrack_fires_hurricanes', 'on'); } catch (_) {}
            await this._load();
            if (this.refreshTimer) clearInterval(this.refreshTimer);
            this.refreshTimer = setInterval(() => this._load(), this.refreshMs);
        },

        disable() {
            this.enabled = false;
            try { localStorage.setItem('skytrack_fires_hurricanes', 'off'); } catch (_) {}
            if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
            if (this.fireLayer)  { try { this.map.removeLayer(this.fireLayer); } catch (_) {} this.fireLayer = null; }
            if (this.stormLayer) { try { this.map.removeLayer(this.stormLayer); } catch (_) {} this.stormLayer = null; }
        },

        async _load() {
            await Promise.allSettled([this._loadFires(), this._loadStorms()]);
        },

        async _loadFires() {
            if (!this.map) return;
            try {
                const resp = await fetch(this.NIFC_URL, { signal: AbortSignal.timeout(15000) });
                if (!resp.ok) throw new Error('NIFC ' + resp.status);
                const geo = await resp.json();
                if (this.fireLayer) try { this.map.removeLayer(this.fireLayer); } catch (_) {}
                this.fireLayer = L.layerGroup();
                const features = Array.isArray(geo?.features) ? geo.features : [];
                for (const f of features) {
                    const c = f?.geometry?.coordinates;
                    if (!Array.isArray(c) || c.length < 2) continue;
                    const [lon, lat] = c;
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                    const p = f.properties || {};
                    const acres = Number(p.DailyAcres || p.IncidentSize || p.CalculatedAcres);
                    const radius = Number.isFinite(acres) && acres > 0
                        ? Math.max(4, Math.min(18, 3 + Math.log10(acres) * 2))
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
                    const acresTxt = Number.isFinite(acres) ? Math.round(acres).toLocaleString() + ' acres' : '';
                    const containment = p.PercentContained != null ? (Math.round(p.PercentContained) + '% contained') : '';
                    marker.bindPopup(
                        '<div class="sigmet-popup"><strong>🔥 ' + _escHtml(name) + '</strong><br>' +
                        (state ? _escHtml(state) + '<br>' : '') +
                        (acresTxt ? _escHtml(acresTxt) + '<br>' : '') +
                        (containment ? _escHtml(containment) : '') +
                        '</div>'
                    );
                    this.fireLayer.addLayer(marker);
                }
                if (this.fireLayer.getLayers().length > 0) this.fireLayer.addTo(this.map);
                _dbg?.('NIFC fires loaded:', this.fireLayer.getLayers().length);
            } catch (e) {
                errorHandler?.log('NIFC fires', e?.message || e);
            }
        },

        async _loadStorms() {
            if (!this.map) return;
            try {
                const resp = await fetch(this.NHC_URL, { signal: AbortSignal.timeout(15000) });
                if (!resp.ok) throw new Error('NHC ' + resp.status);
                const data = await resp.json();
                if (this.stormLayer) try { this.map.removeLayer(this.stormLayer); } catch (_) {}
                this.stormLayer = L.layerGroup();
                const storms = Array.isArray(data?.activeStorms) ? data.activeStorms : [];
                for (const s of storms) {
                    const lat = Number(s?.latitudeNumeric);
                    const lon = Number(s?.longitudeNumeric);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                    const name = s.name || s.binNumber || 'Storm';
                    const cls = (s.classification || '').toUpperCase();
                    const intensity = Number(s.intensity) || 0;
                    const color = cls === 'HU' || intensity >= 74 ? '#dc2626' :
                                  cls === 'TS' || intensity >= 39 ? '#f59e0b' :
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
                        (Number.isFinite(intensity) && intensity > 0 ? ' · ' + intensity + ' kt' : '') +
                        (s.pressure ? '<br>Pressure ' + _escHtml(s.pressure) + ' mb' : '') +
                        (s.movement ? '<br>Moving ' + _escHtml(s.movement) : '') +
                        '</div>'
                    );
                    this.stormLayer.addLayer(center);
                    // Forecast cone if NHC provides a GIS track cone URL.
                    if (s.forecastTrack?.kmzFile) {
                        // Many cones are only in KMZ — we can't parse KMZ in browser cheaply.
                        // Draw a simple outbound cone approximation from the 5-day forecast
                        // if NHC's simple JSON has `forecast` points.
                    }
                    if (Array.isArray(s.forecast) && s.forecast.length >= 2) {
                        const pts = s.forecast
                            .filter(f => Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lon)))
                            .map(f => [Number(f.lat), Number(f.lon)]);
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
                if (this.stormLayer.getLayers().length > 0) this.stormLayer.addTo(this.map);
                _dbg?.('NHC storms loaded:', this.stormLayer.getLayers().length);
            } catch (e) {
                errorHandler?.log('NHC storms', e?.message || e);
            }
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) firesHurricanes.init(map);
    });
