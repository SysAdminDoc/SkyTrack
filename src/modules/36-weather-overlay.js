
    // ============ PHASE 11: WEATHER OVERLAY ============
    const weatherOverlay = {
        windLayer: null,
        sigmetLayer: null,
        enabled: false,
        windData: null,
        
        async toggle() {
            this.enabled = !this.enabled;
            document.getElementById('weatherOverlayBtn')?.classList.toggle('active', this.enabled);
            
            if (this.enabled) {
                await this.load();
            } else {
                this.clear();
            }
        },
        
        async load() {
            toast('Loading weather data...');
            
            try {
                // Load wind data from Open-Meteo
                await this.loadWindData();
                this.drawWindBarbs();
                
                // Load SIGMETs / G-AIRMETs / CWAs (combined hazards layer)
                await this.loadSigmets();
                // Load PIREPs (pilot reports) scoped to the current viewport
                await this.loadPireps();

                toast('Weather overlay loaded');
            } catch (e) {
                errorHandler.log('Weather Overlay', e.message);
                toast('Weather data unavailable');
            }
        },
        
        async loadWindData() {
            const bounds = map.getBounds();
            const center = map.getCenter();
            
            // Open-Meteo API for wind data
            const url = `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${center.lat}&longitude=${center.lng}` +
                `&current=wind_speed_10m,wind_direction_10m` +
                `&hourly=wind_speed_180hPa,wind_direction_180hPa` +
                `&forecast_days=1`;
            
            try {
                const resp = await fetch(url);
                const data = await resp.json();
                
                this.windData = {
                    surface: {
                        speed: data.current?.wind_speed_10m || 0,
                        direction: data.current?.wind_direction_10m || 0
                    },
                    upper: {
                        speed: data.hourly?.wind_speed_180hPa?.[0] || 0,
                        direction: data.hourly?.wind_direction_180hPa?.[0] || 0
                    }
                };
            } catch (e) {
                console.warn('Wind data fetch failed:', e);
            }
        },
        
        drawWindBarbs() {
            if (this.windLayer) {
                map.removeLayer(this.windLayer);
            }
            
            if (!this.windData) return;
            
            const center = map.getCenter();
            const wind = map.getZoom() > 8 ? this.windData.surface : this.windData.upper;
            const altLabel = map.getZoom() > 8 ? 'Surface' : 'FL400';
            
            // Convert m/s to knots
            const speedKt = Math.round(wind.speed * 1.944);
            const direction = Math.round(wind.direction);
            
            const barbHtml = this.createWindBarbSVG(speedKt, direction);
            
            this.windLayer = L.marker(center, {
                icon: L.divIcon({
                    className: 'wind-barb',
                    html: barbHtml,
                    iconSize: [60, 60],
                    iconAnchor: [30, 30]
                })
            }).addTo(map);
            
            this.windLayer.bindTooltip(
                `${altLabel} Wind: ${speedKt} kt from ${direction}deg`,
                { direction: 'top' }
            );
        },
        
        createWindBarbSVG(speedKt, direction) {
            const speed = speedKt;
            
            return `
                <svg viewBox="0 0 60 60" style="transform: rotate(${direction}deg)">
                    <line x1="30" y1="50" x2="30" y2="10" stroke="#fff" stroke-width="2"/>
                    ${speed >= 50 ? '<polygon points="30,10 25,20 30,15" fill="#fff"/>' : ''}
                    ${speed >= 10 ? '<line x1="30" y1="15" x2="40" y2="10" stroke="#fff" stroke-width="2"/>' : ''}
                    ${speed >= 20 ? '<line x1="30" y1="20" x2="40" y2="15" stroke="#fff" stroke-width="2"/>' : ''}
                    ${speed >= 30 ? '<line x1="30" y1="25" x2="40" y2="20" stroke="#fff" stroke-width="2"/>' : ''}
                    ${speed >= 40 ? '<line x1="30" y1="30" x2="40" y2="25" stroke="#fff" stroke-width="2"/>' : ''}
                    ${speed >= 5 && speed < 10 ? '<line x1="30" y1="15" x2="35" y2="12" stroke="#fff" stroke-width="2"/>' : ''}
                    <circle cx="30" cy="50" r="3" fill="#fff"/>
                </svg>
            `;
        },
        
        async loadSigmets() {
            // Build a single combined hazards layer with SIGMETs, G-AIRMETs,
            // and CWAs (Center Weather Advisories). AWC serves all three as
            // polygon JSON, CORS-enabled.
            if (this.sigmetLayer) {
                map.removeLayer(this.sigmetLayer);
            }
            this.sigmetLayer = L.layerGroup();

            const addPolygon = (coords, color, label, fill = 0.2) => {
                if (!Array.isArray(coords) || coords.length < 3) return;
                const poly = L.polygon(coords, {
                    color: color,
                    fillColor: color,
                    fillOpacity: fill,
                    weight: 2
                });
                poly.bindPopup('<div class="sigmet-popup">' + label + '</div>');
                this.sigmetLayer.addLayer(poly);
            };

            // 1. International SIGMETs — existing behaviour, preserved.
            try {
                const resp = await fetch('https://aviationweather.gov/api/data/isigmet?format=json');
                if (resp.ok) {
                    const data = await resp.json();
                    for (const s of (Array.isArray(data) ? data : [])) {
                        if (!s?.coords || s.coords.length < 3) continue;
                        const coords = s.coords.map(c => [c.lat, c.lon]);
                        const color = s.hazard === 'TURB' ? '#f97316' :
                                     s.hazard === 'ICE' ? '#3b82f6' :
                                     s.hazard === 'CONVECTIVE' ? '#ef4444' : '#888';
                        const label = '<strong>' + _escHtml(s.hazard || 'SIGMET') + '</strong><br>' +
                            _escHtml(s.qualifier || '') + '<br>FL' + _escHtml(s.altLo || '000') +
                            ' - FL' + _escHtml(s.altHi || '999');
                        addPolygon(coords, color, label);
                    }
                }
            } catch (e) {
                errorHandler?.log('SIGMET', e?.message || e);
            }

            // 2. Graphical AIRMETs — lower-severity turbulence / icing / IFR
            // guidance. Payload uses `latlonpairs`: array of coord rings each
            // "lat1,lon1,lat2,lon2,...".
            try {
                const resp = await fetch('https://aviationweather.gov/api/data/gairmet?format=json');
                if (resp.ok) {
                    const data = await resp.json();
                    for (const g of (Array.isArray(data) ? data : [])) {
                        const rings = Array.isArray(g?.latlonpairs) ? g.latlonpairs : [];
                        const haz = (g?.hazard || '').toUpperCase();
                        const color = haz.includes('TURB') ? '#fbbf24' :
                                     haz.includes('ICE')  ? '#60a5fa' :
                                     haz.includes('IFR')  ? '#a855f7' :
                                     haz.includes('MTN')  ? '#a16207' : '#9ca3af';
                        const label = '<strong>G-AIRMET: ' + _escHtml(g?.hazard || 'Advisory') + '</strong><br>' +
                            _escHtml(g?.forecast || '') +
                            (g?.fcstFromFLB ? '<br>Base FL' + _escHtml(g.fcstFromFLB) : '') +
                            (g?.fcstToFLT ? ' Top FL' + _escHtml(g.fcstToFLT) : '');
                        for (const ring of rings) {
                            if (typeof ring !== 'string') continue;
                            const nums = ring.split(',').map(Number).filter(Number.isFinite);
                            const coords = [];
                            for (let i = 0; i + 1 < nums.length; i += 2) {
                                coords.push([nums[i], nums[i + 1]]);
                            }
                            addPolygon(coords, color, label, 0.15);
                        }
                    }
                }
            } catch (e) {
                errorHandler?.log('G-AIRMET', e?.message || e);
            }

            // 3. Center Weather Advisories (US convective/turbulence short-term).
            try {
                const resp = await fetch('https://aviationweather.gov/api/data/cwa?format=json');
                if (resp.ok) {
                    const data = await resp.json();
                    for (const c of (Array.isArray(data) ? data : [])) {
                        const coords = Array.isArray(c?.coords)
                            ? c.coords.map(p => [p.lat, p.lon])
                            : null;
                        if (!coords) continue;
                        const haz = (c?.hazard || c?.phenomenon || '').toUpperCase();
                        const color = haz.includes('TURB') ? '#f59e0b' :
                                     haz.includes('ICE')  ? '#38bdf8' :
                                     haz.includes('TS')   ? '#ef4444' :
                                     haz.includes('CONV') ? '#dc2626' : '#a3a3a3';
                        const label = '<strong>CWA: ' + _escHtml(c?.cwsu || '') + ' ' +
                            _escHtml(c?.hazard || c?.phenomenon || '') + '</strong><br>' +
                            _escHtml(c?.remarks || c?.text || '');
                        addPolygon(coords, color, label, 0.25);
                    }
                }
            } catch (e) {
                errorHandler?.log('CWA', e?.message || e);
            }

            if (this.sigmetLayer.getLayers().length > 0) {
                this.sigmetLayer.addTo(map);
            }
        },

        async loadPireps() {
            // PIREPs (pilot reports) — scoped to the viewport because the
            // endpoint 400s without a bbox. Refreshed whenever the overlay is
            // toggled or the map pans far.
            if (this.pirepLayer) {
                map.removeLayer(this.pirepLayer);
                this.pirepLayer = null;
            }
            try {
                const b = map.getBounds();
                const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
                    .map(n => n.toFixed(2)).join(',');
                const resp = await fetch(
                    'https://aviationweather.gov/api/data/pirep?format=json&bbox=' + bbox + '&age=2'
                );
                if (!resp.ok) return;
                const data = await resp.json();
                if (!Array.isArray(data) || data.length === 0) return;
                this.pirepLayer = L.layerGroup();
                for (const p of data) {
                    const lat = Number(p?.lat);
                    const lon = Number(p?.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                    const isUrgent = (p?.urgent || '').toString().toUpperCase() === 'Y' ||
                        (p?.rawOb || '').includes('UUA');
                    const color = isUrgent ? '#ef4444' : '#22d3ee';
                    const marker = L.circleMarker([lat, lon], {
                        radius: isUrgent ? 7 : 5,
                        fillColor: color,
                        fillOpacity: 0.85,
                        color: '#111',
                        weight: 1
                    });
                    marker.bindPopup(
                        '<div class="sigmet-popup"><strong>PIREP' +
                        (isUrgent ? ' (URGENT)' : '') + '</strong><br>' +
                        _escHtml(p?.rawOb || p?.raw || 'No report text') +
                        (p?.fltlvl ? '<br>FL' + _escHtml(p.fltlvl) : '') +
                        (p?.acType ? '<br>Aircraft: ' + _escHtml(p.acType) : '') +
                        '</div>'
                    );
                    this.pirepLayer.addLayer(marker);
                }
                if (this.pirepLayer.getLayers().length > 0) {
                    this.pirepLayer.addTo(map);
                }
            } catch (e) {
                errorHandler?.log('PIREP', e?.message || e);
            }
        },

        clear() {
            if (this.windLayer) {
                map.removeLayer(this.windLayer);
                this.windLayer = null;
            }
            if (this.sigmetLayer) {
                map.removeLayer(this.sigmetLayer);
                this.sigmetLayer = null;
            }
            if (this.pirepLayer) {
                map.removeLayer(this.pirepLayer);
                this.pirepLayer = null;
            }
        }
    };
