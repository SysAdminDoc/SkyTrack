
    // ============ EMERGENCY SQUAWK PULSE ============
    // Triple expanding ring pulse under every aircraft broadcasting an
    // emergency squawk (7500/7600/7700). Sits on its own Leaflet layer so
    // it doesn't perturb the main marker renderer.
    //
    //   7500 — unlawful interference (hijack)  → red
    //   7600 — radio failure                    → amber
    //   7700 — general emergency                → orange
    //
    // Pulse is a CSS animation defined in styles.css. Three <span> rings
    // with staggered delays give the expanding-sonar effect at 1 Hz.
    const emergencyPulse = {
        _inited: false,
        map: null,
        layer: null,
        markers: new Map(), // hex → { marker, squawk }
        refreshMs: 2500,

        SQUAWK_COLORS: {
            '7500': '#ef4444', // hijack
            '7600': '#f59e0b', // radio failure
            '7700': '#fb923c'  // emergency
        },

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            this.layer = L.layerGroup().addTo(map);
            // Prefer the pausable-interval scaffolding from 10-utils.js so
            // the pulse refresh naturally follows the tab-visibility state
            // of the rest of the app. Fall back to setInterval for safety.
            if (typeof _setPausableInterval === 'function') {
                _setPausableInterval(() => this.refresh(), this.refreshMs, 'emergencyPulse');
            } else {
                setInterval(() => this.refresh(), this.refreshMs);
            }
            // One immediate refresh once aircraftCache is populated.
            setTimeout(() => this.refresh(), 1500);
        },

        // Treat squawk as a string so numeric-encoded squawks from some
        // feeds don't miss the equality check.
        _isEmergency(sq) {
            if (sq === null || sq === undefined) return false;
            const s = String(sq);
            return s === '7500' || s === '7600' || s === '7700';
        },

        refresh() {
            if (!this.map || !this.layer) return;
            if (typeof aircraftCache !== 'object' || !aircraftCache) return;
            const seen = new Set();
            for (const hex in aircraftCache) {
                const ac = aircraftCache[hex];
                if (!ac) continue;
                const sq = ac.squawk;
                if (!this._isEmergency(sq)) continue;
                if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
                const sqStr = String(sq);
                seen.add(hex);
                const existing = this.markers.get(hex);
                if (existing) {
                    // Reposition in place; don't tear down — otherwise the
                    // CSS ring animation restarts every refresh tick.
                    try { existing.marker.setLatLng([ac.lat, ac.lon]); } catch (_) {}
                    if (existing.squawk !== sqStr) {
                        existing.squawk = sqStr;
                        this._swapIcon(existing.marker, sqStr);
                    }
                } else {
                    const marker = L.marker([ac.lat, ac.lon], {
                        icon: this._icon(sqStr),
                        interactive: false,
                        keyboard: false,
                        zIndexOffset: -1000
                    }).addTo(this.layer);
                    this.markers.set(hex, { marker, squawk: sqStr });
                }
            }
            // Prune aircraft that are no longer squawking emergency.
            for (const [hex, entry] of this.markers) {
                if (seen.has(hex)) continue;
                try { this.layer.removeLayer(entry.marker); } catch (_) {}
                this.markers.delete(hex);
            }
        },

        _icon(squawk) {
            const color = this.SQUAWK_COLORS[squawk] || '#ef4444';
            const html =
                '<div class="sq-pulse sq-pulse-' + squawk + '" style="--sq-color:' + color + '">' +
                '<span class="sq-ring"></span>' +
                '<span class="sq-ring"></span>' +
                '<span class="sq-ring"></span>' +
                '</div>';
            return L.divIcon({
                className: 'sq-pulse-icon',
                html,
                iconSize: [80, 80],
                iconAnchor: [40, 40]
            });
        },

        _swapIcon(marker, squawk) {
            try { marker.setIcon(this._icon(squawk)); } catch (_) {}
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) emergencyPulse.init(map);
    });
