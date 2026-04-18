
    // ============ RANGE RINGS (v0.19.0) ============
    // Concentric dashed circles centered on the user's geolocation at
    // 50 / 100 / 150 / 200 nm. Standard ADS-B frontend convention (tar1090
    // SiteCirclesDistances). Self-contained: listens for skytrack:map-ready,
    // reads persistence from localStorage, exposes `rangeRings` at script
    // scope for the UI handler to toggle.
    const rangeRings = {
        _inited: false,
        _pendingEnable: null,             // in-flight enable() — blocks re-entry
        map: null,
        layer: null,
        enabled: false,
        center: null,                     // { lat, lon }
        distancesNm: [50, 100, 150, 200], // standard ring distances in nautical miles
        color: '#58a6ff',

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            try {
                const raw = localStorage.getItem('skytrack_range_rings');
                if (!raw) return;
                const obj = JSON.parse(raw);
                if (!obj || typeof obj !== 'object') return;
                if (Array.isArray(obj.distancesNm)) {
                    this.distancesNm = obj.distancesNm
                        .filter(d => Number.isFinite(d) && d > 0 && d <= 500)
                        .slice(0, 8);
                }
                if (obj.center && Number.isFinite(obj.center.lat) && Number.isFinite(obj.center.lon)) {
                    this.center = { lat: obj.center.lat, lon: obj.center.lon };
                }
                if (obj.enabled === true) {
                    this.enable().catch(() => { /* surfaced inside enable() */ });
                }
            } catch (_) { /* corrupt localStorage — ignore */ }
        },

        save() {
            try {
                localStorage.setItem('skytrack_range_rings', JSON.stringify({
                    enabled: this.enabled,
                    distancesNm: this.distancesNm,
                    center: this.center
                }));
            } catch (_) { /* quota — ignore */ }
        },

        async resolveCenter() {
            if (this.center) return this.center;
            if (!navigator.geolocation) return null;
            // Require prior permission — don't prompt on every ring toggle.
            try {
                if (navigator.permissions?.query) {
                    const res = await navigator.permissions.query({ name: 'geolocation' });
                    if (res.state !== 'granted') return null;
                }
            } catch (_) { /* fall through */ }
            return new Promise(resolve => {
                navigator.geolocation.getCurrentPosition(
                    pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                    () => resolve(null),
                    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
                );
            });
        },

        async enable() {
            // Coalesce concurrent enable() calls (e.g. rapid button clicks,
            // or init restore racing with a user click). Without this, each
            // click would trigger its own geolocation prompt and _draw()
            // race, resulting in stacked layers.
            if (this._pendingEnable) return this._pendingEnable;
            const op = (async () => {
                if (!this.map) return false;
                if (!this.center) {
                    this.center = await this.resolveCenter();
                    if (!this.center) {
                        this.enabled = false;
                        this.save();
                        return false;
                    }
                }
                this.enabled = true;
                this._draw();
                this.save();
                return true;
            })();
            this._pendingEnable = op;
            try { return await op; }
            finally { if (this._pendingEnable === op) this._pendingEnable = null; }
        },

        disable() {
            this.enabled = false;
            if (this.layer) {
                try { this.map?.removeLayer(this.layer); } catch (_) {}
                this.layer = null;
            }
            this.save();
        },

        async toggle() {
            // Wait for any in-flight enable() so the user's second click
            // observes the *final* state and flips it correctly.
            if (this._pendingEnable) {
                try { await this._pendingEnable; } catch (_) { /* already surfaced */ }
            }
            if (this.enabled) { this.disable(); return false; }
            return await this.enable();
        },

        setCenter(lat, lon) {
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            this.center = { lat, lon };
            if (this.enabled) this._draw();
            this.save();
        },

        useMapCenter() {
            if (!this.map) return;
            const c = this.map.getCenter();
            this.setCenter(c.lat, c.lng);
        },

        _draw() {
            if (!this.map || !this.center) return;
            if (this.layer) {
                try { this.map.removeLayer(this.layer); } catch (_) {}
            }
            this.layer = L.layerGroup();
            const NM_TO_M = 1852;
            const { lat, lon } = this.center;
            // Concentric rings, dashed, each labeled at the NE bearing.
            for (const nm of this.distancesNm) {
                const circle = L.circle([lat, lon], {
                    radius: nm * NM_TO_M,
                    color: this.color,
                    weight: 1,
                    opacity: 0.7,
                    fillOpacity: 0,
                    dashArray: '6 6',
                    interactive: false
                });
                this.layer.addLayer(circle);
                // Label at 45° bearing
                const R = 6371000;
                const brg = 45 * Math.PI / 180;
                const d = nm * NM_TO_M / R;
                const φ1 = lat * Math.PI / 180;
                const λ1 = lon * Math.PI / 180;
                const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brg));
                const λ2 = λ1 + Math.atan2(
                    Math.sin(brg) * Math.sin(d) * Math.cos(φ1),
                    Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
                );
                const labelLat = φ2 * 180 / Math.PI;
                const labelLon = ((λ2 * 180 / Math.PI) + 540) % 360 - 180;
                const label = L.marker([labelLat, labelLon], {
                    icon: L.divIcon({
                        className: 'range-ring-label',
                        html: '<span>' + nm + ' nm</span>',
                        iconSize: [60, 16],
                        iconAnchor: [30, 8]
                    }),
                    interactive: false,
                    keyboard: false
                });
                this.layer.addLayer(label);
            }
            // Center pin
            const pin = L.circleMarker([lat, lon], {
                radius: 4,
                color: this.color,
                fillColor: this.color,
                fillOpacity: 0.9,
                weight: 1,
                interactive: false
            });
            this.layer.addLayer(pin);
            this.layer.addTo(this.map);
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) rangeRings.init(map);
    });
