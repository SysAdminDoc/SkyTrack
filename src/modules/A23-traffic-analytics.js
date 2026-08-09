    // ============ TRAFFIC ANALYTICS ============
    // Small, dependency-free aggregations power the vector and altitude
    // overlays as well as the stats panel's viewport dashboard.
    function flowVectorBins(aircraft, cellSize = 0.5, limit = 180) {
        const size = Math.max(0.1, Number(cellSize) || 0.5);
        const bins = new Map();
        for (const ac of Object.values(aircraft || {})) {
            const lat = Number(ac?.lat), lon = Number(ac?.lon), track = Number(ac?.track);
            if (![lat, lon, track].every(Number.isFinite)) continue;
            const row = Math.floor(lat / size), column = Math.floor(lon / size);
            const key = row + ':' + column;
            const bin = bins.get(key) || { row, column, count: 0, latSum: 0, lonSum: 0, east: 0, north: 0, speedSum: 0 };
            const speed = Math.max(1, Number(ac.gs) || 1);
            const radians = track * Math.PI / 180;
            bin.count++;
            bin.latSum += lat;
            bin.lonSum += lon;
            bin.east += Math.sin(radians) * speed;
            bin.north += Math.cos(radians) * speed;
            bin.speedSum += speed;
            bins.set(key, bin);
        }
        return Array.from(bins.values()).map(bin => ({
            row: bin.row,
            column: bin.column,
            count: bin.count,
            lat: bin.latSum / bin.count,
            lon: bin.lonSum / bin.count,
            track: (Math.atan2(bin.east, bin.north) * 180 / Math.PI + 360) % 360,
            speed: Math.hypot(bin.east, bin.north) / bin.count,
            meanSpeed: bin.speedSum / bin.count
        })).sort((a, b) => b.count - a.count).slice(0, Math.max(1, limit));
    }

    function flowVectorEndpoint(lat, lon, track, lengthDeg = 0.35) {
        const radians = Math.PI / 180;
        const angle = Number(track) * radians;
        const length = Number(lengthDeg) || 0.35;
        const cosLat = Math.max(0.2, Math.cos(Number(lat) * radians));
        return [Number(lat) + Math.cos(angle) * length, Number(lon) + Math.sin(angle) * length / cosLat];
    }

    function altitudeMeshCells(aircraft, cellSize = 1, limit = 220) {
        const size = Math.max(0.25, Number(cellSize) || 1);
        const cells = new Map();
        for (const ac of Object.values(aircraft || {})) {
            const lat = Number(ac?.lat), lon = Number(ac?.lon), alt = Number(ac?.alt_baro);
            if (![lat, lon, alt].every(Number.isFinite) || alt < 0) continue;
            const row = Math.floor(lat / size), column = Math.floor(lon / size);
            const key = row + ':' + column;
            const cell = cells.get(key) || { row, column, count: 0, latSum: 0, lonSum: 0, altitudeSum: 0 };
            cell.count++;
            cell.latSum += lat;
            cell.lonSum += lon;
            cell.altitudeSum += alt;
            cells.set(key, cell);
        }
        return Array.from(cells.values()).map(cell => ({
            row: cell.row,
            column: cell.column,
            count: cell.count,
            lat: cell.latSum / cell.count,
            lon: cell.lonSum / cell.count,
            altitude: cell.altitudeSum / cell.count
        })).sort((a, b) => b.count - a.count).slice(0, Math.max(1, limit));
    }

    function altitudeMeshColor(altitude, maxAltitude = 42000) {
        const ratio = Math.max(0, Math.min(1, Number(altitude) / Math.max(1, Number(maxAltitude) || 42000)));
        return 'hsl(' + Math.round(215 - ratio * 205) + ' 82% 55%)';
    }

    function airlineViewportRows(aircraft, limit = 6) {
        const rows = new Map();
        for (const ac of Object.values(aircraft || {})) {
            const flight = String(ac?.flight || '').trim().toUpperCase();
            const name = String(ac?.airlineName || (flight.length >= 3 ? flight.slice(0, 3) : 'Unknown')).trim() || 'Unknown';
            const row = rows.get(name) || { name, count: 0, flightLevelSum: 0, flightLevelCount: 0 };
            row.count++;
            const altitude = Number(ac.alt_baro);
            if (Number.isFinite(altitude) && altitude >= 0) {
                row.flightLevelSum += altitude / 100;
                row.flightLevelCount++;
            }
            rows.set(name, row);
        }
        return Array.from(rows.values()).map(row => ({
            name: row.name,
            count: row.count,
            averageFlightLevel: row.flightLevelCount ? row.flightLevelSum / row.flightLevelCount : null
        })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, Math.max(1, limit));
    }

    function geoDistanceNm(first, second) {
        const radians = Math.PI / 180;
        const lat1 = Number(first?.lat) * radians, lat2 = Number(second?.lat) * radians;
        const dLat = lat2 - lat1, dLon = (Number(second?.lon) - Number(first?.lon)) * radians;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    }

    function initialBearing(first, second) {
        const radians = Math.PI / 180;
        const lat1 = Number(first?.lat) * radians, lat2 = Number(second?.lat) * radians;
        const dLon = (Number(second?.lon) - Number(first?.lon)) * radians;
        return Math.atan2(Math.sin(dLon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon));
    }

    function routeDivergenceNm(position, origin, destination) {
        const values = [position, origin, destination];
        if (values.some(point => !Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lon)))) return null;
        const earth = 3440.065;
        const d13 = geoDistanceNm(origin, position) / earth;
        const theta13 = initialBearing(origin, position), theta12 = initialBearing(origin, destination);
        const crossTrack = Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(theta13 - theta12)))) * earth);
        const total = geoDistanceNm(origin, destination);
        return Number.isFinite(crossTrack) && Number.isFinite(total) && total > 1 ? crossTrack : null;
    }

    function routeDivergenceCandidates(aircraft, airportLookup, thresholdNm = 40, limit = 30) {
        const lookup = typeof airportLookup === 'function' ? airportLookup : code => airportLookup?.[code];
        const result = [];
        for (const ac of Object.values(aircraft || {})) {
            const fromCode = String(ac?.from || '').trim().toUpperCase(), toCode = String(ac?.to || '').trim().toUpperCase();
            if (!fromCode || !toCode) continue;
            const distanceNm = routeDivergenceNm(ac, lookup(fromCode), lookup(toCode));
            if (Number.isFinite(distanceNm) && distanceNm >= thresholdNm) result.push({ ac, from: fromCode, to: toCode, distanceNm });
        }
        return result.sort((a, b) => b.distanceNm - a.distanceNm).slice(0, Math.max(1, limit));
    }

    function arrivalRushHistogram(aircraft, airportCode = '', now = Date.now()) {
        const hours = new Array(24).fill(0);
        const code = String(airportCode || '').trim().toUpperCase();
        const cutoff = now - 86400000;
        for (const ac of Object.values(aircraft || {})) {
            if (code && String(ac?.to || '').trim().toUpperCase() !== code) continue;
            if (!code && !ac?.to) continue;
            const samples = Array.isArray(ac.history) ? ac.history : [];
            const timestamp = Number(samples.at(-1)?.[3] || ac.lastSeen);
            if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > now + 300000) continue;
            hours[new Date(timestamp).getUTCHours()]++;
        }
        return hours;
    }

    const trafficVectors = {
        map: null,
        layer: null,
        enabled: false,
        init(mapInstance) {
            if (this.map || !mapInstance || typeof L === 'undefined') return;
            this.map = mapInstance;
            this.layer = L.layerGroup();
        },
        toggle() {
            this.enabled = !this.enabled;
            document.getElementById('vectorsBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) this.update(aircraftCache);
            else this.layer?.clearLayers();
            return this.enabled;
        },
        update(aircraft) {
            if (!this.map || !this.layer || !this.enabled) return;
            this.layer.clearLayers();
            const bounds = this.map.getBounds?.();
            const visible = bounds ? Object.fromEntries(Object.entries(aircraft || {}).filter(([, ac]) => bounds.contains([Number(ac.lat), Number(ac.lon)]))) : aircraft;
            const cellSize = this.map.getZoom?.() < 5 ? 1 : 0.5;
            const length = this.map.getZoom?.() < 5 ? 0.7 : 0.32;
            flowVectorBins(visible, cellSize).forEach(bin => {
                const end = flowVectorEndpoint(bin.lat, bin.lon, bin.track, length);
                const line = L.polyline([[bin.lat, bin.lon], end], { color: '#22d3ee', weight: 2, opacity: 0.75, interactive: true });
                line.bindTooltip('Average flow ' + Math.round(bin.track) + '° · ' + bin.count + ' aircraft · ' + Math.round(bin.meanSpeed) + ' kt', { sticky: true });
                line.addTo(this.layer);
            });
            if (!this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
        }
    };

    const altitudeMesh = {
        map: null,
        layer: null,
        enabled: false,
        init(mapInstance) {
            if (this.map || !mapInstance || typeof L === 'undefined') return;
            this.map = mapInstance;
            this.layer = L.layerGroup();
        },
        toggle() {
            this.enabled = !this.enabled;
            document.getElementById('altitudeMeshBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) this.update(aircraftCache);
            else this.layer?.clearLayers();
            return this.enabled;
        },
        update(aircraft) {
            if (!this.map || !this.layer || !this.enabled) return;
            this.layer.clearLayers();
            if ((this.map.getZoom?.() || 0) > 8) return;
            const bounds = this.map.getBounds?.();
            const visible = bounds ? Object.fromEntries(Object.entries(aircraft || {}).filter(([, ac]) => bounds.contains([Number(ac.lat), Number(ac.lon)]))) : aircraft;
            const cellSize = (this.map.getZoom?.() || 0) < 5 ? 2 : 1;
            altitudeMeshCells(visible, cellSize).forEach(cell => {
                const half = cellSize / 2;
                const polygon = L.polygon([[cell.lat - half, cell.lon - half], [cell.lat - half, cell.lon + half], [cell.lat + half, cell.lon + half], [cell.lat + half, cell.lon - half]], {
                    color: altitudeMeshColor(cell.altitude), fillColor: altitudeMeshColor(cell.altitude), fillOpacity: 0.12, weight: 1, opacity: 0.45, interactive: true
                });
                polygon.bindTooltip('Avg altitude ' + Math.round(cell.altitude).toLocaleString() + ' ft · ' + cell.count + ' aircraft', { sticky: true });
                polygon.addTo(this.layer);
            });
            if (!this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
        }
    };

    const trafficAnalytics = {
        updateDashboard(aircraft) {
            const section = document.getElementById('viewportAnalytics');
            if (!section || !document.getElementById('statsPanel')?.classList.contains('show')) return;
            const bounds = typeof map !== 'undefined' ? map?.getBounds?.() : null;
            const visible = bounds ? Object.fromEntries(Object.entries(aircraft || {}).filter(([, ac]) => bounds.contains([Number(ac.lat), Number(ac.lon)]))) : aircraft;
            const esc = value => typeof _escHtml === 'function' ? _escHtml(String(value ?? '')) : String(value ?? '');
            const airlineContainer = document.getElementById('viewportAirlineRows');
            const rows = airlineViewportRows(visible);
            if (airlineContainer) airlineContainer.innerHTML = rows.length ? rows.map(row => '<div class="stats-list-item"><span class="list-item-name">' + esc(row.name) + '</span><span class="list-item-count">' + row.count + ' · ' + (row.averageFlightLevel === null ? 'FL—' : 'FL' + Math.round(row.averageFlightLevel)) + '</span></div>').join('') : '<div class="stats-list-item"><span class="list-item-name">No viewport data</span></div>';
            const airportPanel = document.getElementById('airportPanel');
            const code = airportPanel?._airport?.icao || airportPanel?._airport?.iata || '';
            const histogram = arrivalRushHistogram(visible, code);
            const max = Math.max(...histogram, 1);
            const histogramContainer = document.getElementById('arrivalRushHistogram');
            if (histogramContainer) histogramContainer.innerHTML = histogram.map((count, hour) => '<span class="analytics-histogram-bar" style="height:' + Math.max(4, Math.round(count / max * 100)) + '%" title="' + hour + ':00 UTC · ' + count + ' observed arrival' + (count === 1 ? '' : 's') + '"></span>').join('');
            const anomalyContainer = document.getElementById('routeDivergenceSummary');
            const anomalies = routeDivergenceCandidates(visible, codeValue => typeof airportDB !== 'undefined' ? airportDB.getByCode(codeValue) : null);
            if (anomalyContainer) anomalyContainer.textContent = anomalies.length ? anomalies.length + ' route divergence' + (anomalies.length === 1 ? '' : 's') + ' · max ' + Math.round(anomalies[0].distanceNm) + ' nm off great-circle' : 'No route divergence above 40 nm';
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => {
            trafficVectors.init(event.detail?.map);
            altitudeMesh.init(event.detail?.map);
        }, { once: true });
    }
