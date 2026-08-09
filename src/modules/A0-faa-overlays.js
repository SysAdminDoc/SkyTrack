
    // ============ FAA ARTCC / TERMINAL / AIRWAY OVERLAYS ============
    // FAA's ArcGIS Feature Services are the authoritative public source for
    // these layers.  The old implementation used retired ArcGIS Hub download
    // URLs and exposed only the ARTCC toggle even though it carried three
    // unused layer definitions.  Query the live services by viewport instead
    // so a global map never downloads every airway in the NAS.
    const faaOverlays = {
        _inited: false,
        _moveTimer: null,
        map: null,
        layers: {
            artcc: {
                label: 'ARTCC',
                endpoint: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Boundary_Airspace/FeatureServer/0/query',
                where: "TYPE_CODE = 'ARTCC'",
                fields: 'IDENT,NAME,TYPE_CODE,CLASS,LOCAL_TYPE,UPPER_VAL,UPPER_UOM,UPPER_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,CITY,STATE',
                dbKey: 'faa-artcc-v2',
                style: { color: '#38bdf8', weight: 1, fillOpacity: 0.05, opacity: 0.8 },
                labelProp: 'NAME',
                enabled: false, layer: null, pending: null, cacheKey: null
            },
            tracon: {
                label: 'TRACON / CTA',
                endpoint: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Boundary_Airspace/FeatureServer/0/query',
                where: "TYPE_CODE IN ('TRSA','CTA','CTA-P')",
                fields: 'IDENT,NAME,TYPE_CODE,CLASS,LOCAL_TYPE,UPPER_VAL,UPPER_UOM,UPPER_CODE,LOWER_VAL,LOWER_UOM,LOWER_CODE,CITY,STATE',
                dbKey: 'faa-tracon-v1',
                style: { color: '#34d399', weight: 1, fillOpacity: 0.04, opacity: 0.75 },
                labelProp: 'NAME',
                enabled: false, layer: null, pending: null, cacheKey: null
            },
            airways: {
                label: 'V/J airways',
                endpoint: 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/ATS_Route/FeatureServer/0/query',
                where: "TYPE_CODE = 'CONV' AND (IDENT LIKE 'V%' OR IDENT LIKE 'J%')",
                fields: 'IDENT,TYPE_CODE,LEVEL_,WKHR_CODE,MEA_E_VAL,MEA_W_VAL,MAA_VAL',
                dbKey: 'faa-airways-v2',
                style: null,
                labelProp: 'IDENT',
                enabled: false, layer: null, pending: null, cacheKey: null
            }
        },

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            map.on('moveend', () => {
                clearTimeout(this._moveTimer);
                this._moveTimer = setTimeout(() => this.refreshEnabled(), 700);
            });
            try {
                const saved = JSON.parse(localStorage.getItem('skytrack_faa_overlays') || '{}');
                for (const key of Object.keys(this.layers)) {
                    if (saved[key] === true) this.toggle(key).catch(() => {});
                }
            } catch (_) { /* corrupt storage */ }
        },

        save() {
            try {
                const out = {};
                for (const key of Object.keys(this.layers)) out[key] = !!this.layers[key].enabled;
                localStorage.setItem('skytrack_faa_overlays', JSON.stringify(out));
            } catch (_) {}
        },

        _bounds() {
            if (!this.map || this.map.getZoom() < 4) return null;
            const b = this.map.getBounds();
            const south = Math.max(-60, b.getSouth());
            const north = Math.min(75, b.getNorth());
            if (!(north > south)) return null;
            let west = b.getWest();
            let east = b.getEast();
            while (west < -180) { west += 360; east += 360; }
            while (east > 180) { west -= 360; east -= 360; }
            if (east <= west) { west = -180; east = 180; }
            const round = value => Math.round(value * 4) / 4;
            const visible = {
                west: Math.max(-180, round(west)),
                south: Math.max(-60, round(south)),
                east: Math.min(180, round(east)),
                north: Math.min(75, round(north))
            };
            const buffered = bufferedOverlayBounds(visible, this.map.getZoom());
            return buffered ? {
                west: Math.max(-180, round(buffered.west)),
                south: Math.max(-60, round(buffered.south)),
                east: Math.min(180, round(buffered.east)),
                north: Math.min(75, round(buffered.north))
            } : visible;
        },

        _url(slot, bounds) {
            const params = new URLSearchParams({
                where: slot.where,
                geometry: [bounds.west, bounds.south, bounds.east, bounds.north].join(','),
                geometryType: 'esriGeometryEnvelope',
                inSR: '4326',
                spatialRel: 'esriSpatialRelIntersects',
                outFields: slot.fields,
                returnGeometry: 'true',
                outSR: '4326',
                resultRecordCount: '2000',
                f: 'geojson'
            });
            return slot.endpoint + '?' + params.toString();
        },

        _cacheKey(slot, bounds) {
            return slot.dbKey + '-' + [bounds.west, bounds.south, bounds.east, bounds.north].join('_');
        },

        async _fetch(slot, bounds, cacheKey) {
            let cached = null;
            try {
                if (typeof skytrackDB === 'object') cached = await skytrackDB.loadDatabase(cacheKey);
            } catch (_) {}
            if (cached?.type === 'FeatureCollection') return cached;

            const response = await fetch(this._url(slot, bounds), {
                cache: 'no-cache',
                signal: AbortSignal.timeout(30000)
            });
            if (!response.ok) throw new Error(slot.label + ' HTTP ' + response.status);
            const geo = await response.json();
            if (geo?.error) throw new Error(geo.error.message || slot.label + ' query failed');
            if (geo?.type !== 'FeatureCollection') throw new Error(slot.label + ' returned invalid GeoJSON');
            try {
                if (typeof skytrackDB === 'object') await skytrackDB.saveDatabase(cacheKey, geo, 7 * 86400000);
            } catch (_) {}
            return geo;
        },

        _style(slot, feature) {
            if (slot !== this.layers.airways) return slot.style;
            const ident = String(feature?.properties?.IDENT || '').toUpperCase();
            return {
                color: ident.startsWith('V') ? '#c084fc' : '#fbbf24',
                weight: 0.8,
                opacity: 0.65,
                offset: airwayOffsetFor(ident),
                interactive: true
            };
        },

        _popup(slot, properties) {
            const p = properties || {};
            const name = _escHtml(p[slot.labelProp] || slot.label || 'FAA overlay');
            const kind = _escHtml(p.TYPE_CODE || p.LOCAL_TYPE || '');
            const location = [p.CITY, p.STATE].filter(Boolean).join(', ');
            const detail = [kind, location].filter(Boolean).map(_escHtml).join(' · ');
            const routeLimits = p.LEVEL_ ? '<br>Level: ' + _escHtml(p.LEVEL_) : '';
            return '<strong>' + name + '</strong>' +
                (detail ? '<br>' + detail : '') + routeLimits;
        },

        _createLayer(slot, geo, cacheKey) {
            if (slot.layer && this.map) this.map.removeLayer(slot.layer);
            if (slot === this.layers.airways && L.vectorGrid?.slicer && geo.features?.length > 100) {
                try {
                    slot.layer = L.vectorGrid.slicer(geo, {
                        rendererFactory: L.canvas.tile,
                        vectorTileLayerStyles: { sliced: properties => this._style(slot, { properties }) },
                        interactive: true,
                        getFeatureId: feature => feature?.properties?.IDENT || feature?.id
                    });
                    slot.layer.on('click', event => {
                        const properties = event.layer?.properties || {};
                        L.popup().setLatLng(event.latlng).setContent(this._popup(slot, properties)).openOn(this.map);
                    });
                } catch (_) { slot.layer = null; }
            }
            if (!slot.layer) {
                slot.layer = L.geoJSON(geo, {
                    style: feature => this._style(slot, feature),
                    interactive: true,
                    onEachFeature: (feature, layer) => {
                        if (slot === this.layers.airways && typeof layer.setOffset === 'function') {
                            layer.setOffset(airwayOffsetFor(feature?.properties?.IDENT));
                        }
                        layer.bindPopup(this._popup(slot, feature.properties));
                        const label = feature?.properties?.[slot.labelProp];
                        if (label && slot !== this.layers.airways) {
                            layer.bindTooltip(String(label), { sticky: true, direction: 'center' });
                        }
                    }
                });
            }
            slot.cacheKey = cacheKey;
            if (slot.enabled) slot.layer.addTo(this.map);
            _dbg('FAA overlay loaded:', slot.label, geo.features?.length || 0);
        },

        async _ensureLayer(slot) {
            const bounds = this._bounds();
            if (!bounds) return false;
            const cacheKey = this._cacheKey(slot, bounds);
            if (slot.layer && slot.cacheKey === cacheKey) {
                if (slot.enabled && !this.map.hasLayer(slot.layer)) slot.layer.addTo(this.map);
                return true;
            }
            if (slot.pending) return slot.pending;
            slot.pending = (async () => {
                try {
                    const geo = await this._fetch(slot, bounds, cacheKey);
                    this._createLayer(slot, geo, cacheKey);
                    return true;
                } finally {
                    slot.pending = null;
                }
            })();
            return slot.pending;
        },

        async toggle(key) {
            const slot = this.layers[key];
            if (!slot || !this.map) return false;
            if (slot.enabled) {
                slot.enabled = false;
                if (slot.layer && this.map.hasLayer(slot.layer)) this.map.removeLayer(slot.layer);
                this.save();
                return false;
            }
            slot.enabled = true;
            this.save();
            try {
                await this._ensureLayer(slot);
                return !!slot.layer;
            } catch (error) {
                slot.enabled = false;
                this.save();
                try { errorHandler.log('FAA ' + slot.label, error?.message || error); } catch (_) {}
                return false;
            }
        },

        async refreshEnabled() {
            const active = Object.values(this.layers).filter(slot => slot.enabled);
            await Promise.allSettled(active.map(slot => this._ensureLayer(slot)));
        }
    };

    document.addEventListener('skytrack:map-ready', (e) => {
        const map = e?.detail?.map;
        if (map) faaOverlays.init(map);
    });
