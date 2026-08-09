
    // ============ CLOSEST POINT OF APPROACH PREDICTION ============
    const CPA_HORIZON_SECONDS = 300;
    const CPA_HORIZONTAL_LIMIT_NM = 5;
    const CPA_VERTICAL_LIMIT_FT = 1000;

    function cpaPoint(ac, referenceLat) {
        const lat = Number(ac?.lat), lon = Number(ac?.lon), speed = Number(ac?.gs), track = Number(ac?.track);
        const altitude = Number(ac?.alt_baro);
        if (![lat, lon, speed, track, altitude].every(Number.isFinite) || speed < 1) return null;
        const radians = Math.PI / 180;
        const cosLat = Math.max(0.1, Math.cos(referenceLat * radians));
        const x = (lon * 60 * cosLat);
        const y = lat * 60;
        const heading = track * radians;
        return {
            x,
            y,
            vx: speed * Math.sin(heading) / 3600,
            vy: speed * Math.cos(heading) / 3600,
            altitude,
            verticalRate: Number.isFinite(Number(ac.baro_rate)) ? Number(ac.baro_rate) : 0
        };
    }

    function cpaForPair(first, second, horizonSeconds = CPA_HORIZON_SECONDS) {
        if (!first || !second || first.hex === second.hex) return null;
        const refLat = (Number(first.lat) + Number(second.lat)) / 2;
        if (!Number.isFinite(refLat)) return null;
        const a = cpaPoint(first, refLat), b = cpaPoint(second, refLat);
        if (!a || !b) return null;
        const rx = b.x - a.x, ry = b.y - a.y;
        const vx = b.vx - a.vx, vy = b.vy - a.vy;
        const speedSquared = vx * vx + vy * vy;
        const rawTime = speedSquared > 1e-9 ? -(rx * vx + ry * vy) / speedSquared : 0;
        const timeSeconds = Math.max(0, Math.min(Number(horizonSeconds) || CPA_HORIZON_SECONDS, rawTime));
        const horizontalNm = Math.hypot(rx + vx * timeSeconds, ry + vy * timeSeconds);
        const verticalFt = (b.altitude - a.altitude) + ((b.verticalRate - a.verticalRate) * timeSeconds / 60);
        return {
            firstHex: first.hex,
            secondHex: second.hex,
            timeSeconds,
            horizontalNm,
            verticalFt,
            conflict: horizontalNm <= CPA_HORIZONTAL_LIMIT_NM && Math.abs(verticalFt) <= CPA_VERTICAL_LIMIT_FT
        };
    }

    function findCpaConflicts(aircraft, options = {}) {
        const now = Number.isFinite(options.now) ? options.now : Date.now();
        const maxAircraft = Number.isFinite(options.maxAircraft) ? Math.max(2, Math.floor(options.maxAircraft)) : 180;
        const values = Object.values(aircraft || {}).filter(ac => {
            if (!ac?.hex || ac.alt_baro === 'ground') return false;
            if (Number.isFinite(ac.lastSeen) && now - ac.lastSeen > 120000) return false;
            return Number.isFinite(Number(ac.lat)) && Number.isFinite(Number(ac.lon));
        }).sort((a, b) => (Number(b.gs) || 0) - (Number(a.gs) || 0)).slice(0, maxAircraft);
        const conflicts = [];
        for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
                const cpa = cpaForPair(values[i], values[j], options.horizonSeconds);
                if (cpa?.conflict) conflicts.push(cpa);
            }
        }
        return conflicts.sort((a, b) => a.timeSeconds - b.timeSeconds);
    }

    const cpaPrediction = {
        enabled: true,
        map: null,
        layer: null,
        conflicts: [],
        init(mapInstance) {
            if (this.map || !mapInstance) return;
            this.map = mapInstance;
            this.layer = L.layerGroup().addTo(mapInstance);
            this._setButton();
        },
        _setButton() {
            const button = document.getElementById('cpaBtn');
            button?.classList.toggle('active', this.enabled);
            button?.setAttribute('aria-pressed', String(this.enabled));
        },
        toggle() {
            this.enabled = !this.enabled;
            this._setButton();
            if (!this.enabled) {
                this.conflicts = [];
                this.layer?.clearLayers();
                this.refreshSelected();
            } else {
                this.update(aircraftCache);
            }
            return this.enabled;
        },
        update(aircraft) {
            if (!this.map || !this.enabled) return;
            const bounds = this.map.getBounds?.();
            const visibleAircraft = bounds ? Object.fromEntries(Object.entries(aircraft || {}).filter(([, ac]) => {
                const lat = Number(ac?.lat), lon = Number(ac?.lon);
                return Number.isFinite(lat) && Number.isFinite(lon) && bounds.contains([lat, lon]);
            })) : aircraft;
            this.conflicts = findCpaConflicts(visibleAircraft, { maxAircraft: 180 });
            this.layer?.clearLayers();
            this.conflicts.slice(0, 40).forEach(conflict => {
                const first = aircraft[conflict.firstHex], second = aircraft[conflict.secondHex];
                if (!first || !second) return;
                const line = L.polyline([[first.lat, first.lon], [second.lat, second.lon]], {
                    color: '#ef4444', weight: 3, opacity: 0.9, dashArray: '7 5', interactive: true
                });
                line.bindTooltip('CPA in ' + Math.round(conflict.timeSeconds) + 's · ' + conflict.horizontalNm.toFixed(1) + ' nm · ' + Math.round(Math.abs(conflict.verticalFt)) + ' ft vertical', { sticky: true });
                line.addTo(this.layer);
            });
            this.refreshSelected();
        },
        _forAircraft(hex) {
            return this.conflicts.find(conflict => conflict.firstHex === hex || conflict.secondHex === hex) || null;
        },
        chipHtml(ac) {
            if (!this.enabled || !ac?.hex) return '';
            const conflict = this._forAircraft(ac.hex);
            if (!conflict) return '';
            return '<span id="cpaChip" class="cpa-chip" title="Predicted closest approach within 5 nm and 1,000 ft">CPA ' + Math.round(conflict.timeSeconds) + 's</span>';
        },
        refreshSelected() {
            if (!selectedHex) return;
            const callsign = document.getElementById('infoCallsign');
            if (!callsign) return;
            const ac = aircraftCache[selectedHex];
            const html = this.chipHtml(ac);
            const chip = document.getElementById('cpaChip');
            if (chip) {
                if (html) chip.outerHTML = html;
                else chip.remove();
            } else if (html) callsign.insertAdjacentHTML('beforeend', html);
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => {
            try { cpaPrediction.init(event.detail?.map); } catch (_) {}
        }, { once: true });
    }
