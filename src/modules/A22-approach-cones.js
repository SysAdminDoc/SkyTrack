    // ============ AIRPORT APPROACH CONE ============
    // A lightweight final-approach sector. Airport datasets do not always
    // carry runway headings, so the geometry accepts an optional heading and
    // uses north as a clearly labelled fallback.
    function approachDestination(airport, bearingDeg, distanceNm) {
        const lat = Number(airport?.lat), lon = Number(airport?.lon);
        const bearing = Number(bearingDeg), distance = Number(distanceNm);
        if (![lat, lon, bearing, distance].every(Number.isFinite)) return null;
        const radius = Math.PI / 180;
        const angular = distance / 60 * radius;
        const lat1 = lat * radius, lon1 = lon * radius, bearingRad = bearing * radius;
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad));
        const lon2 = lon1 + Math.atan2(Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
        return [lat2 / radius, ((lon2 / radius + 540) % 360) - 180];
    }

    function approachConePoints(airport, headingDeg = 0, radiusNm = 10, halfAngleDeg = 12, segments = 16) {
        const apex = approachDestination(airport, 0, 0);
        const heading = Number(headingDeg), radius = Number(radiusNm), halfAngle = Number(halfAngleDeg);
        const count = Math.max(2, Math.floor(Number(segments) || 16));
        if (!apex || ![heading, radius, halfAngle].every(Number.isFinite) || radius <= 0 || halfAngle < 0) return [];
        const points = [apex];
        for (let index = 0; index <= count; index++) {
            const angle = heading - halfAngle + (2 * halfAngle * index / count);
            points.push(approachDestination(airport, angle, radius));
        }
        return points;
    }

    const approachCones = {
        map: null,
        layer: null,
        airport: null,
        enabled: false,

        init(mapInstance) {
            if (this.map || !mapInstance || typeof L === 'undefined') return;
            this.map = mapInstance;
            this.layer = L.layerGroup();
        },

        _setButton() {
            const button = document.getElementById('approachConeBtn');
            button?.classList.toggle('active', this.enabled);
            button?.setAttribute('aria-pressed', String(this.enabled));
        },

        _heading() {
            const value = Number(this.airport?.approachHeading ?? this.airport?.runwayHeading ?? this.airport?.heading ?? 0);
            return Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;
        },

        show(airport) {
            if (airport) this.airport = airport;
            this.enabled = true;
            this._setButton();
            this.render();
        },

        toggle(airport) {
            if (airport) this.airport = airport;
            if (!this.airport) return false;
            this.enabled = !this.enabled;
            this._setButton();
            if (this.enabled) this.render();
            else this.layer?.clearLayers();
            return this.enabled;
        },

        render() {
            if (!this.enabled || !this.map || !this.layer || !this.airport) return;
            const heading = this._heading();
            const points = approachConePoints(this.airport, heading);
            if (points.length < 3) return;
            this.layer.clearLayers();
            const code = this.airport.iata || this.airport.icao || 'airport';
            const cone = L.polygon(points, {
                color: '#a78bfa', fillColor: '#8b5cf6', fillOpacity: 0.14,
                weight: 2, dashArray: '6 5', interactive: true
            });
            cone.bindTooltip(code + ' · 10 nm approach cone · centerline ' + Math.round(heading) + '°', { sticky: true });
            cone.addTo(this.layer);
            const faf = approachDestination(this.airport, heading, 8);
            if (faf) {
                L.circleMarker(faf, { radius: 6, color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2 })
                    .bindTooltip('FAF · 8 nm final approach fix', { direction: 'top' })
                    .addTo(this.layer);
            }
            L.circleMarker([this.airport.lat, this.airport.lon], { radius: 4, color: '#fff', fillColor: '#8b5cf6', fillOpacity: 1, weight: 2 })
                .bindTooltip(code + ' threshold · heading ' + Math.round(heading) + '°', { direction: 'top' })
                .addTo(this.layer);
            if (!this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => approachCones.init(event.detail?.map), { once: true });
    }
