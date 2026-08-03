
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
        firefighterLayer: null,
        stormLayer: null,
        fireIncidents: [],
        firefighterAircraft: [],
        enabled: false,
        refreshTimer: null,
        refreshMs: 600000, // 10 min
        correlationRadiusKm: 80,
        NIFC_URL:
            'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
            'WFIGS_Incident_Locations_Current/FeatureServer/0/query?' +
            'f=geojson&where=ActiveFireCandidate%20%3D%201%20AND%20IncidentTypeKind%20%3D%20%27FI%27%20AND%20IncidentTypeCategory%20%3C%3E%20%27RX%27&outFields=*',
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
            if (this.firefighterLayer) {
                try { this.map?.removeLayer(this.firefighterLayer); } catch (_) {}
                this.firefighterLayer = null;
            }
            this.firefighterAircraft = [];
            this.fireIncidents = [];
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
                this.fireIncidents = [];
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
                    const incident = { lat, lon, name, state, acres: acresTxt, containment };
                    this.fireIncidents.push(incident);
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
                this._syncFirefightingAircraft();
                _dbg('NIFC fires loaded:', this.fireLayer.getLayers().length,
                    'nearby firefighting aircraft:', this.firefighterAircraft.length);
            } catch (e) {
                try { errorHandler.log('NIFC fires', e?.message || e); } catch (_) {}
            }
        },

        updateAircraft(aircraft) {
            if (!this.enabled) return;
            this._syncFirefightingAircraft(aircraft);
        },

        _isFirefighting(ac) {
            const values = [
                ac?.flight, ac?.r, ac?.desc, ac?.t, ac?.ownOp,
                ac?.interesting?.operator, ac?.interesting?.type, ac?.interesting?.tag,
                ac?.militaryInfo?.operator, ac?.militaryInfo?.type, ac?.militaryInfo?.tag,
                ac?.civilianInteresting?.operator, ac?.civilianInteresting?.type,
                ac?.civilianInteresting?.tag
            ].filter(Boolean).join(' ').toUpperCase();
            if (!values) return false;
            return /FIRE(FIGHTING|BIRD)?|WILDFIRE|AIR\s*ATTACK|AERIAL\s*FIREFIGHT|FOREST\s*FIRE|CAL\s*FIRE|FIRE\s*(SERVICE|DEPT|DEPARTMENT)|WATER\s*BOMBER|SUPER\s*SCOOPER|SMOKEJUMPER|(?:AIR)?TANKER(?:\s|-)?\d*/.test(values);
        },

        _distanceKm(lat1, lon1, lat2, lon2) {
            const radians = value => value * Math.PI / 180;
            const dLat = radians(lat2 - lat1);
            const dLon = radians(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
            return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
        },

        _nearestFire(ac) {
            let nearest = null;
            for (const incident of this.fireIncidents) {
                const distanceKm = this._distanceKm(ac.lat, ac.lon, incident.lat, incident.lon);
                if (!nearest || distanceKm < nearest.distanceKm) nearest = { incident, distanceKm };
            }
            return nearest;
        },

        _syncFirefightingAircraft(aircraft) {
            if (!this.map || !this.enabled) return;
            if (this.firefighterLayer) {
                try { this.map.removeLayer(this.firefighterLayer); } catch (_) {}
                this.firefighterLayer = null;
            }
            this.firefighterAircraft = [];
            if (!this.fireIncidents.length) return;

            const group = L.layerGroup();
            const list = Array.isArray(aircraft)
                ? aircraft
                : Object.values(aircraft || (typeof aircraftCache === 'object' ? aircraftCache : {}));
            for (const ac of list) {
                const lat = Number(ac?.lat);
                const lon = Number(ac?.lon);
                const altitude = Number(ac?.alt_baro);
                const groundSpeed = Number(ac?.gs);
                const airborne = ac?.alt_baro !== 'ground' &&
                    ((Number.isFinite(altitude) && altitude > 100) ||
                     (Number.isFinite(groundSpeed) && groundSpeed > 35));
                if (!Number.isFinite(lat) || !Number.isFinite(lon) || !airborne || !this._isFirefighting(ac)) continue;
                const nearest = this._nearestFire({ lat, lon });
                if (!nearest || nearest.distanceKm > this.correlationRadiusKm) continue;

                const callsign = String(ac.flight || ac.r || ac.hex || 'Firefighting aircraft').trim();
                const registration = ac.r && ac.r !== callsign ? ' · ' + ac.r : '';
                const type = ac.desc || ac.t || 'aircraft';
                const fire = nearest.incident;
                const distance = Math.round(nearest.distanceKm) + ' km from fire';
                const line = L.polyline([[lat, lon], [fire.lat, fire.lon]], {
                    color: '#facc15', weight: 1, opacity: 0.55, dashArray: '4 5', interactive: false
                });
                const halo = L.circle([lat, lon], {
                    radius: 6000, color: '#facc15', weight: 1, opacity: 0.5,
                    fillColor: '#facc15', fillOpacity: 0.06, interactive: false
                });
                const marker = L.circleMarker([lat, lon], {
                    radius: 9, color: '#fef08a', weight: 2,
                    fillColor: '#f97316', fillOpacity: 0.95
                });
                marker.bindPopup(
                    '<div class="sigmet-popup"><strong>🛩 Firefighting aircraft</strong><br>' +
                    _escHtml(callsign + registration) + '<br>' +
                    _escHtml(type) + '<br>' +
                    _escHtml(distance + ' · ' + (fire.name || 'active fire')) +
                    (fire.state ? '<br>' + _escHtml(fire.state) : '') +
                    '</div>'
                );
                marker.bindTooltip('🛩 ' + _escHtml(callsign) + ' · ' + _escHtml(distance), {
                    sticky: true, direction: 'top'
                });
                marker.on('click', () => {
                    try { if (typeof selectAircraft === 'function' && ac.hex) selectAircraft(ac.hex); } catch (_) {}
                });
                group.addLayer(line);
                group.addLayer(halo);
                group.addLayer(marker);
                this.firefighterAircraft.push({ hex: ac.hex, callsign, fire: fire.name, distanceKm: nearest.distanceKm });
            }
            if (this.firefighterAircraft.length) {
                group.addTo(this.map);
                this.firefighterLayer = group;
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
