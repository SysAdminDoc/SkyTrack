
    // ============ HIGH-VOLUME AIRCRAFT RENDERER ============
    // Leaflet DivIcons are expressive but expensive when a global view has
    // thousands of aircraft. Keep the detailed marker path for selected and
    // priority aircraft, and use one canvas-backed circle layer for ordinary
    // traffic once the cache crosses the threshold.
    const HIGH_VOLUME_AIRCRAFT_THRESHOLD = 800;

    function highVolumeModeFor(count, threshold = HIGH_VOLUME_AIRCRAFT_THRESHOLD) {
        return Number.isFinite(count) && count >= threshold;
    }

    const highVolumeRenderer = {
        threshold: HIGH_VOLUME_AIRCRAFT_THRESHOLD,
        _inited: false,
        map: null,
        layer: null,
        renderer: null,
        points: new Map(),
        active: false,
        _seen: new Set(),
        _onClick: null,

        init(map, onClick) {
            if (this._inited || !map || typeof L === 'undefined') return;
            this._inited = true;
            this.map = map;
            this._onClick = typeof onClick === 'function' ? onClick : null;
            this.renderer = L.canvas({ padding: 0.5 });
            this.layer = L.layerGroup().addTo(map);
        },

        begin(count) {
            const next = highVolumeModeFor(count, this.threshold);
            const changed = next !== this.active;
            this.active = next;
            this._seen = new Set();
            if (!next) this.clear();
            return { active: next, changed };
        },

        upsert(ac, options = {}) {
            if (!this.active || !this.layer || !ac?.hex) return;
            const hex = String(ac.hex).toUpperCase();
            const color = String(options.color || '#9ca3af');
            const radius = Number.isFinite(options.radius) ? options.radius : 4;
            let point = this.points.get(hex);
            if (!point) {
                point = L.circleMarker([ac.lat, ac.lon], {
                    renderer: this.renderer,
                    radius,
                    color,
                    weight: 1,
                    opacity: 0.95,
                    fillColor: color,
                    fillOpacity: 0.8,
                    bubblingMouseEvents: false
                });
                point.on('click', event => {
                    L.DomEvent.stopPropagation(event);
                    this._onClick?.(hex, event);
                });
                point.addTo(this.layer);
                this.points.set(hex, point);
            } else {
                point.setLatLng([ac.lat, ac.lon]);
                point.setStyle({ radius, color, fillColor: color });
            }
            this._seen.add(hex);
        },

        end() {
            if (!this.active) return;
            for (const hex of this.points.keys()) {
                if (!this._seen.has(hex)) this.remove(hex);
            }
        },

        remove(hex) {
            const key = String(hex || '').toUpperCase();
            const point = this.points.get(key);
            if (!point) return;
            this.layer?.removeLayer(point);
            this.points.delete(key);
        },

        clear() {
            this.layer?.clearLayers();
            this.points.clear();
        }
    };

    document.addEventListener('skytrack:map-ready', event => {
        try {
            highVolumeRenderer.init(event.detail?.map, (hex, clickEvent) => {
                if (typeof handleAircraftSelection === 'function') {
                    handleAircraftSelection(hex, clickEvent);
                } else if (typeof selectAircraft === 'function') {
                    selectAircraft(hex);
                }
            });
        } catch (_) { /* optional performance layer must fail soft */ }
    }, { once: true });
