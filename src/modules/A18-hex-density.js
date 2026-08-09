    // ============ LOW-ZOOM HEX DENSITY ============
    // Dependency-free hexagonal aggregation for wide-area views. It keeps
    // the visual idea of an H3 density layer without adding another runtime
    // library to the single-file release.
    function densityCubeRound(q, r) {
        const x = q, z = r, y = -x - z;
        let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
        const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
        if (dx > dy && dx > dz) rx = -ry - rz;
        else if (dy > dz) ry = -rx - rz;
        else rz = -rx - ry;
        return { q: rx, r: rz };
    }

    function densityBinAircraft(aircraft, zoom) {
        const z = Number(zoom);
        const radius = z <= 2 ? 4 : z <= 3 ? 2.5 : z <= 4 ? 1.5 : z <= 5 ? 0.8 : 0.45;
        const bins = new Map();
        for (const ac of Object.values(aircraft || {})) {
            const lat = Number(ac?.lat), lon = Number(ac?.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            const x = lon / (radius * 1.5);
            const y = lat / (radius * Math.sqrt(3));
            const cube = densityCubeRound((2 / 3) * x, (-1 / 3) * x + (Math.sqrt(3) / 3) * y);
            const key = cube.q + ',' + cube.r;
            const bin = bins.get(key) || { q: cube.q, r: cube.r, count: 0, altitude: 0, altitudeCount: 0, military: 0 };
            bin.count++;
            if (Number.isFinite(Number(ac.alt_baro))) { bin.altitude += Number(ac.alt_baro); bin.altitudeCount++; }
            if (ac.militaryInfo || ac.militaryRangeInfo || ac.isMilitary) bin.military++;
            bins.set(key, bin);
        }
        return { radius, bins: Array.from(bins.values()) };
    }

    function densityBinCenter(bin, radius) {
        return {
            lat: Math.sqrt(3) * (bin.r + bin.q / 2) * radius,
            lon: 1.5 * bin.q * radius
        };
    }

    function densityHexPoints(center, radius) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (30 + i * 60);
            points.push([center.lat + radius * Math.sin(angle), center.lon + radius * 1.5 * Math.cos(angle)]);
        }
        return points;
    }

    function densityColor(bin, maxCount) {
        const ratio = Math.min(1, Math.max(0, (bin.count - 1) / Math.max(1, maxCount - 1)));
        const alt = bin.altitudeCount ? bin.altitude / bin.altitudeCount : 0;
        const hue = Math.max(12, 190 - Math.min(1, alt / 40000) * 178);
        return 'hsl(' + Math.round(hue) + ' 88% 56%)';
    }

    const hexDensity = {
        map: null,
        layer: null,
        enabled: false,
        init(mapInstance) {
            if (this.map || !mapInstance || typeof L === 'undefined') return;
            this.map = mapInstance;
            this.layer = L.layerGroup();
            this.map.on('zoomend moveend', () => { if (this.enabled) this.update(aircraftCache); });
        },
        toggle() {
            this.enabled = !this.enabled;
            document.getElementById('densityBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) this.update(aircraftCache);
            else this.layer?.clearLayers();
            return this.enabled;
        },
        update(aircraft) {
            if (!this.enabled || !this.map || !this.layer) return;
            const zoom = this.map.getZoom();
            this.layer.clearLayers();
            if (zoom >= 7) return;
            const { radius, bins } = densityBinAircraft(aircraft, zoom);
            const maxCount = Math.max(1, ...bins.map(bin => bin.count));
            bins.forEach(bin => {
                const center = densityBinCenter(bin, radius);
                const color = densityColor(bin, maxCount);
                const polygon = L.polygon(densityHexPoints(center, radius), {
                    color: bin.military ? '#f59e0b' : color,
                    fillColor: color,
                    fillOpacity: 0.18 + 0.5 * (bin.count / maxCount),
                    opacity: 0.8,
                    weight: bin.military ? 2 : 1,
                    interactive: true
                });
                const avg = bin.altitudeCount ? Math.round(bin.altitude / bin.altitudeCount).toLocaleString() + ' ft' : 'unknown';
                polygon.bindTooltip(bin.count + ' aircraft · avg ' + avg, { sticky: true });
                polygon.addTo(this.layer);
            });
            if (!this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => hexDensity.init(event.detail?.map), { once: true });
    }
