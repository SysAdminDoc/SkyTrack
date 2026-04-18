
    // ============ FAA ARTCC + AIRWAY OVERLAYS ============
    // Static GeoJSON overlays served CORS-enabled by the FAA open-data
    // ArcGIS hub:
    //   * ARTCC (Air Route Traffic Control Center) boundaries
    //   * Low-altitude Victor airways
    //   * High-altitude Jet airways
    //
    // Each overlay toggles independently; the whole subsystem fits under
    // one "FAA" tool button with a lightweight dropdown of the three
    // layers. Data is fetched once per session and cached in IndexedDB
    // (via skytrackDB.saveDatabase/loadDatabase) so repeat page-loads
    // don't re-pay the transfer.
    //
    // Footprint: ARTCC polygon file is ~40 KB; low-altitude airways
    // are ~2 MB — we paint them only when toggled on.
    const faaOverlays = {
        _inited: false,
        map: null,
        // Per-layer state: fetching promise, leaflet layer, enabled flag.
        layers: {
            artcc: {
                label: 'ARTCC',
                url: 'https://opendata.arcgis.com/api/v3/datasets/57f8221881ff4272a3ce8fbed4ed7a05_0/downloads/data?format=geojson&spatialRefId=4326',
                dbKey: 'faa-artcc',
                style: { color: '#38bdf8', weight: 1, fillOpacity: 0.05, opacity: 0.8 },
                labelProp: 'NAME',
                enabled: false, layer: null, pending: null
            },
            lowAirways: {
                label: 'V-airways',
                url: 'https://opendata.arcgis.com/api/v3/datasets/d13a6a4d9a7a4e6cb5e99a4d5f65d2b0_0/downloads/data?format=geojson&spatialRefId=4326',
                dbKey: 'faa-low-airways',
                style: { color: '#c084fc', weight: 0.7, opacity: 0.6 },
                labelProp: 'IDENT',
                enabled: false, layer: null, pending: null
            },
            highAirways: {
                label: 'J-airways',
                url: 'https://opendata.arcgis.com/api/v3/datasets/c4d5d6a3c1404a01b5f6e78f4e10b1e0_0/downloads/data?format=geojson&spatialRefId=4326',
                dbKey: 'faa-high-airways',
                style: { color: '#fbbf24', weight: 0.7, opacity: 0.6 },
                labelProp: 'IDENT',
                enabled: false, layer: null, pending: null
            }
        },

        async init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            // Restore any previously-enabled overlays from localStorage
            // (we persist enabled-state there rather than in IDB because
            // it's a tiny boolean tuple; the heavy GeoJSON blobs go to IDB).
            try {
                const saved = JSON.parse(localStorage.getItem('skytrack_faa_overlays') || '{}');
                for (const k of Object.keys(this.layers)) {
                    if (saved[k] === true) this.toggle(k).catch(() => {});
                }
            } catch (_) { /* corrupt storage */ }
        },

        save() {
            try {
                const out = {};
                for (const k of Object.keys(this.layers)) out[k] = !!this.layers[k].enabled;
                localStorage.setItem('skytrack_faa_overlays', JSON.stringify(out));
            } catch (_) {}
        },

        async toggle(key) {
            const slot = this.layers[key];
            if (!slot || !this.map) return false;
            if (slot.enabled) {
                this._remove(slot);
                slot.enabled = false;
                this.save();
                return false;
            }
            slot.enabled = true;
            this.save();
            try {
                await this._ensureLayer(slot);
                if (slot.layer && !this.map.hasLayer(slot.layer)) {
                    slot.layer.addTo(this.map);
                }
            } catch (e) {
                slot.enabled = false;
                this.save();
                try { errorHandler.log('FAA ' + slot.label, e?.message || e); } catch (_) {}
                return false;
            }
            return true;
        },

        _remove(slot) {
            if (slot.layer && this.map.hasLayer(slot.layer)) {
                try { this.map.removeLayer(slot.layer); } catch (_) {}
            }
        },

        async _ensureLayer(slot) {
            if (slot.layer) return;
            if (slot.pending) return slot.pending;
            slot.pending = (async () => {
                // IDB cache first — these blobs are static, a weekly TTL is plenty.
                let geo = null;
                try {
                    if (typeof skytrackDB === 'object') {
                        geo = await skytrackDB.loadDatabase(slot.dbKey);
                    }
                } catch (_) {}
                if (!geo) {
                    const resp = await fetch(slot.url, { signal: AbortSignal.timeout(30000) });
                    if (!resp.ok) throw new Error(slot.label + ' HTTP ' + resp.status);
                    geo = await resp.json();
                    try {
                        if (typeof skytrackDB === 'object') {
                            // 7-day TTL; these datasets change rarely.
                            await skytrackDB.saveDatabase(slot.dbKey, geo, 7 * 86400000);
                        }
                    } catch (_) {}
                }
                slot.layer = L.geoJSON(geo, {
                    style: slot.style,
                    interactive: true,
                    onEachFeature: (feature, layer) => {
                        const name = feature?.properties?.[slot.labelProp];
                        if (name) layer.bindTooltip(String(name), { sticky: true, direction: 'center' });
                    }
                });
                _dbg('FAA overlay loaded:', slot.label, geo?.features?.length);
            })();
            try { await slot.pending; }
            finally { slot.pending = null; }
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) faaOverlays.init(map);
    });
