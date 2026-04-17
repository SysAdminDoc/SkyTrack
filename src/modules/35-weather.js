
    // ============ WEATHER SYSTEM ============
    const weatherSystem = {
        cache: new Map(),
        cacheExpiry: 600000, // 10 minutes
        
        async getMETAR(icao) {
            if (!icao || icao.length !== 4) return null;
            
            // Check cache
            const cached = this.cache.get(icao);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
            
            try {
                const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
                const resp = await errorHandler.fetchWithTimeout(url, {}, 8000);
                
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}`);
                }
                
                const data = await resp.json();
                if (!data || data.length === 0) {
                    // No data available, cache empty result to prevent repeated requests
                    this.cache.set(icao, { data: null, timestamp: Date.now() });
                    return null;
                }
                
                const metar = this.parseMETAR(data[0]);
                this.cache.set(icao, { data: metar, timestamp: Date.now() });
                return metar;
                
            } catch (e) {
                errorHandler.log('Weather', `METAR fetch failed for ${icao}: ${e.message}`);
                // Return cached data if available (even if expired)
                if (cached) {
                    return cached.data;
                }
                return null;
            }
        },
        
        parseMETAR(raw) {
            if (!raw) return null;
            
            return {
                raw: raw.rawOb || raw.raw || '',
                station: raw.icaoId || '',
                time: raw.obsTime || raw.reportTime || '',
                temp: raw.temp !== undefined ? raw.temp : null,
                dewpoint: raw.dewp !== undefined ? raw.dewp : null,
                humidity: this.calcHumidity(raw.temp, raw.dewp),
                wind: {
                    direction: raw.wdir || null,
                    speed: raw.wspd || null,
                    gust: raw.wgst || null,
                    variable: raw.wdir === 'VRB'
                },
                visibility: raw.visib || null,
                altimeter: raw.altim || null,
                clouds: raw.clouds || [],
                weather: raw.wxString || '',
                flightCategory: raw.fltcat || this.getFlightCategory(raw),
                ceiling: this.getCeiling(raw.clouds)
            };
        },
        
        calcHumidity(temp, dewpoint) {
            if (temp === null || dewpoint === null) return null;
            // Magnus formula approximation
            const h = 100 * Math.pow((112 - (0.1 * temp) + dewpoint) / (112 + (0.9 * temp)), 8);
            return Math.round(Math.min(100, Math.max(0, h)));
        },
        
        getCeiling(clouds) {
            if (!clouds || !Array.isArray(clouds)) return null;
            for (const layer of clouds) {
                if (['BKN', 'OVC', 'VV'].includes(layer.cover)) {
                    return layer.base;
                }
            }
            return null;
        },
        
        getFlightCategory(data) {
            const vis = data.visib;
            const ceil = this.getCeiling(data.clouds);
            
            if (vis === null && ceil === null) return 'UNKN';
            
            // LIFR: Ceiling < 500ft or Visibility < 1mi
            if ((ceil !== null && ceil < 500) || (vis !== null && vis < 1)) return 'LIFR';
            // IFR: Ceiling 500-999ft or Visibility 1-3mi
            if ((ceil !== null && ceil < 1000) || (vis !== null && vis < 3)) return 'IFR';
            // MVFR: Ceiling 1000-3000ft or Visibility 3-5mi
            if ((ceil !== null && ceil < 3000) || (vis !== null && vis <= 5)) return 'MVFR';
            // VFR: Ceiling > 3000ft and Visibility > 5mi
            return 'VFR';
        },
        
        getFlightCategoryColor(cat) {
            switch (cat) {
                case 'VFR': return '#22c55e';
                case 'MVFR': return '#3b82f6';
                case 'IFR': return '#ef4444';
                case 'LIFR': return '#a855f7';
                default: return '#6b7280';
            }
        },
        
        formatWind(wind) {
            if (!wind || (!wind.direction && !wind.speed)) return 'Calm';
            
            let str = '';
            if (wind.variable) {
                str = 'Variable';
            } else if (wind.direction) {
                str = wind.direction + ' deg';
            }
            
            if (wind.speed) {
                str += ' at ' + wind.speed + ' kt';
                if (wind.gust) {
                    str += ' (gusts ' + wind.gust + ')';
                }
            }
            
            return str || 'Unknown';
        },
        
        formatClouds(clouds) {
            if (!clouds || clouds.length === 0) return 'Clear';
            
            const coverMap = { 'SKC': 'Clear', 'CLR': 'Clear', 'FEW': 'Few', 'SCT': 'Scattered', 'BKN': 'Broken', 'OVC': 'Overcast', 'VV': 'Vert Vis' };
            return clouds.map(c => (coverMap[c.cover] || c.cover) + ' at ' + (c.base ? c.base.toLocaleString() : '?') + ' ft').join(', ');
        }
    };
