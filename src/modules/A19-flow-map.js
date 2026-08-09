    // ============ ROUTE FLOW MAP ============
    // Aggregates the routes currently visible in the live/IDB-backed cache
    // and draws a small set of curved origin→destination arcs.
    function flowRouteGroups(aircraft, limit = 80) {
        const groups = new Map();
        for (const ac of Object.values(aircraft || {})) {
            const from = String(ac?.from || '').trim().toUpperCase();
            const to = String(ac?.to || '').trim().toUpperCase();
            if (!from || !to || from === to) continue;
            const key = from + '>' + to;
            const group = groups.get(key) || { from, to, count: 0, aircraft: [] };
            group.count++;
            if (group.aircraft.length < 5) group.aircraft.push(ac.hex);
            groups.set(key, group);
        }
        return Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, limit);
    }

    function flowCurvePoints(from, to, segments = 20) {
        const midLat = (from.lat + to.lat) / 2;
        const dx = (to.lon - from.lon) * Math.cos(midLat * Math.PI / 180);
        const dy = to.lat - from.lat;
        const distance = Math.hypot(dx, dy) || 1;
        const bend = Math.min(12, Math.max(1.5, distance * 0.18));
        const control = {
            lat: midLat + (dx / distance) * bend,
            lon: (from.lon + to.lon) / 2 - (dy / distance) * bend / Math.max(0.2, Math.cos(midLat * Math.PI / 180))
        };
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments, inv = 1 - t;
            points.push([
                inv * inv * from.lat + 2 * inv * t * control.lat + t * t * to.lat,
                inv * inv * from.lon + 2 * inv * t * control.lon + t * t * to.lon
            ]);
        }
        return points;
    }

    const flowMap = {
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
            document.getElementById('flowMapBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) this.update(aircraftCache);
            else this.layer?.clearLayers();
            return this.enabled;
        },
        update(aircraft) {
            if (!this.enabled || !this.map || !this.layer || typeof airportDB !== 'object') return;
            this.layer.clearLayers();
            const groups = flowRouteGroups(aircraft);
            const maxCount = Math.max(1, groups[0]?.count || 1);
            groups.forEach(group => {
                const from = airportDB.getByCode(group.from), to = airportDB.getByCode(group.to);
                if (!from || !to) return;
                const line = L.polyline(flowCurvePoints(from, to), {
                    color: '#38bdf8', weight: 1.5 + 3 * group.count / maxCount,
                    opacity: 0.25 + 0.55 * group.count / maxCount, interactive: true
                });
                line.bindTooltip(group.from + ' → ' + group.to + ' · ' + group.count + ' aircraft', { sticky: true });
                line.addTo(this.layer);
            });
            if (!this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => flowMap.init(event.detail?.map), { once: true });
    }
