
    // ============ OCEANIC FIR OVERLAY ============
    // Open Aviation publishes a compact, CC BY 4.0 TopoJSON world FIR
    // snapshot. Keep the client-side layer limited to the four oceanic FIRs
    // that matter most for the North Atlantic and North Pacific routes.
    const oceanicFirs = {
        dataUrl: 'https://static.observableusercontent.com/files/f35567ec50da95d5b9fcbaddb3fc4d7a405a426c04a7888d086a6fc86fe92a0ba299571fbf57332c0689cc24a62ee1884cb637ef51883a1a9c0d0460d5beedec',
        sourceUrl: 'https://observablehq.com/@openaviation/flight-information-regions',
        sourceLabel: 'Open Aviation FIR dataset',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        cacheKey: 'open-aviation-oceanic-firs-v1',
        cacheTtl: 7 * 86400000,
        maxZoom: 8,
        definitions: [
            { code: 'EGGX', label: 'Shanwick Oceanic', color: '#f59e0b' },
            { code: 'CZQX', label: 'Gander Oceanic', color: '#22d3ee' },
            { code: 'KZWY', label: 'New York Oceanic', color: '#a78bfa' },
            { code: 'KZAK', label: 'Oakland Oceanic', color: '#34d399' }
        ],
        _inited: false,
        map: null,
        layer: null,
        geojson: null,
        pending: null,
        enabled: false,
        lastSource: 'none',
        lastError: null,

        init(map) {
            if (this._inited) return;
            this._inited = true;
            this.map = map;
            map.on('zoomend', () => this._updateVisibility());
            try {
                if (localStorage.getItem('skytrack_oceanic_firs') === 'true') {
                    this.toggle().catch(() => {});
                }
            } catch (_) { /* storage unavailable */ }
        },

        _save() {
            try { localStorage.setItem('skytrack_oceanic_firs', String(this.enabled)); } catch (_) {}
        },

        _definition(code) {
            return this.definitions.find(item => item.code === code) || {
                code,
                label: code,
                color: '#38bdf8'
            };
        },

        _decodeTopoJSON(topology) {
            if (!topology || topology.type !== 'Topology' || !topology.objects?.data) {
                throw new Error('Open Aviation FIR response is not TopoJSON');
            }
            const scale = topology.transform?.scale || [1, 1];
            const translate = topology.transform?.translate || [0, 0];
            const arcCache = new Map();

            const decodeArc = index => {
                const reversed = index < 0;
                const absolute = reversed ? ~index : index;
                const cached = arcCache.get(absolute);
                if (cached) return reversed ? cached.slice().reverse() : cached.slice();
                const source = topology.arcs?.[absolute];
                if (!Array.isArray(source)) throw new Error('Open Aviation FIR arc is invalid');
                let x = 0;
                let y = 0;
                const decoded = source.map(pair => {
                    x += Number(pair[0]) || 0;
                    y += Number(pair[1]) || 0;
                    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
                });
                arcCache.set(absolute, decoded);
                return reversed ? decoded.slice().reverse() : decoded.slice();
            };

            const joinArcs = indexes => {
                const coordinates = [];
                for (const index of indexes || []) {
                    const points = decodeArc(index);
                    coordinates.push(...(coordinates.length ? points.slice(1) : points));
                }
                return coordinates;
            };

            const decodeGeometry = geometry => {
                if (geometry.type === 'Polygon') {
                    return { type: 'Polygon', coordinates: (geometry.arcs || []).map(joinArcs) };
                }
                if (geometry.type === 'MultiPolygon') {
                    return {
                        type: 'MultiPolygon',
                        coordinates: (geometry.arcs || []).map(polygon => polygon.map(joinArcs))
                    };
                }
                return null;
            };

            const wanted = new Set(this.definitions.map(item => item.code));
            const features = (topology.objects.data.geometries || [])
                .filter(geometry => wanted.has(geometry.properties?.designator))
                .filter(geometry => geometry.properties?.type === 'FIR')
                .map(geometry => {
                    const code = geometry.properties.designator;
                    const definition = this._definition(code);
                    const decoded = decodeGeometry(geometry);
                    if (!decoded) return null;
                    return {
                        type: 'Feature',
                        id: code,
                        properties: {
                            designator: code,
                            name: definition.label,
                            sourceName: geometry.properties.name || definition.label,
                            type: geometry.properties.type,
                            lower: geometry.properties.lower,
                            upper: geometry.properties.upper
                        },
                        geometry: decoded
                    };
                })
                .filter(Boolean);

            if (features.length !== this.definitions.length) {
                throw new Error('Open Aviation FIR response omitted a requested boundary');
            }
            return { type: 'FeatureCollection', features };
        },

        _validGeoJSON(value) {
            return value?.type === 'FeatureCollection' &&
                Array.isArray(value.features) &&
                value.features.length === this.definitions.length &&
                this.definitions.every(item => value.features.some(feature => feature.id === item.code));
        },

        async _load() {
            if (this.geojson) {
                this.lastSource = 'memory';
                return this.geojson;
            }
            if (this.pending) return this.pending;
            this.pending = (async () => {
                try {
                    try {
                        const cached = await skytrackDB.loadDatabase(this.cacheKey);
                        if (this._validGeoJSON(cached)) {
                            this.geojson = cached;
                            this.lastSource = 'IndexedDB';
                            return cached;
                        }
                    } catch (_) {}

                    const options = { cache: 'no-cache' };
                    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                        options.signal = AbortSignal.timeout(30000);
                    }
                    const response = await fetch(this.dataUrl, options);
                    if (!response.ok) throw new Error('Open Aviation FIR HTTP ' + response.status);
                    const topology = await response.json();
                    const geojson = this._decodeTopoJSON(topology);
                    this.geojson = geojson;
                    this.lastSource = 'Open Aviation';
                    try { await skytrackDB.saveDatabase(this.cacheKey, geojson, this.cacheTtl); } catch (_) {}
                    return geojson;
                } catch (error) {
                    this.lastError = error?.message || String(error);
                    throw error;
                } finally {
                    this.pending = null;
                }
            })();
            return this.pending;
        },

        _style(feature) {
            const definition = this._definition(feature?.properties?.designator);
            return {
                color: definition.color,
                weight: 2,
                opacity: 0.9,
                dashArray: '8 5',
                fillColor: definition.color,
                fillOpacity: 0.08,
                interactive: true
            };
        },

        _popup(feature) {
            const p = feature?.properties || {};
            const lower = Number.isFinite(Number(p.lower)) ? 'FL' + Number(p.lower) : 'SFC';
            const upper = Number.isFinite(Number(p.upper)) ? 'FL' + Number(p.upper) : 'UNL';
            return '<strong>🌊 ' + _escHtml(p.name || p.designator || 'Oceanic FIR') + '</strong><br>' +
                '<span>ICAO: ' + _escHtml(p.designator || '') + ' · ' + lower + '–' + upper + '</span><br>' +
                '<small>Source: <a href="' + this.sourceUrl + '" target="_blank" rel="noopener">' +
                _escHtml(this.sourceLabel) + '</a> · CC BY 4.0</small>';
        },

        _createLayer(geojson) {
            if (this.layer && this.map?.hasLayer?.(this.layer)) this.map.removeLayer(this.layer);
            this.layer = L.geoJSON(geojson, {
                style: feature => this._style(feature),
                onEachFeature: (feature, layer) => {
                    layer.bindPopup(this._popup(feature));
                    layer.bindTooltip(String(feature?.properties?.name || feature?.id || 'Oceanic FIR'), {
                        sticky: true,
                        direction: 'center'
                    });
                }
            });
            this._updateVisibility();
        },

        _updateVisibility() {
            if (!this.layer || !this.map) return;
            const zoom = typeof this.map.getZoom === 'function' ? this.map.getZoom() : 0;
            const visible = this.enabled && zoom <= this.maxZoom;
            const present = typeof this.map.hasLayer === 'function' && this.map.hasLayer(this.layer);
            if (visible && !present) this.layer.addTo(this.map);
            if (!visible && present) this.map.removeLayer(this.layer);
        },

        async toggle() {
            if (!this.map) return false;
            if (this.enabled) {
                this.enabled = false;
                this._save();
                this._updateVisibility();
                return false;
            }
            this.enabled = true;
            this.lastError = null;
            this._save();
            try {
                const geojson = await this._load();
                if (!this.layer) this._createLayer(geojson);
                this._updateVisibility();
                return true;
            } catch (error) {
                this.enabled = false;
                this._save();
                try { errorHandler.log('Oceanic FIR overlay', error?.message || error); } catch (_) {}
                return false;
            }
        },

        stats() {
            return {
                enabled: this.enabled,
                features: this.geojson?.features?.length || 0,
                layer: !!this.layer,
                source: this.lastSource,
                lastError: this.lastError
            };
        }
    };

    document.addEventListener('skytrack:map-ready', e => {
        const map = e?.detail?.map;
        if (map) oceanicFirs.init(map);
    });
