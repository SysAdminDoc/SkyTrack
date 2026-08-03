
    // ============ CELESTRAK SATELLITES IN CESIUM 3D ============
    // CelesTrak publishes OMM JSON for the ISS and the Starlink constellation.
    // satellite.js performs the SGP4 propagation in the browser; Cesium only
    // receives the resulting Earth-fixed positions. Starlink is intentionally
    // sampled to keep the 3D scene responsive while still showing the orbital
    // shell rather than an arbitrary geographic subset.
    const satellite3D = {
        enabled: false,
        viewer: null,
        satelliteLib: null,
        _satelliteLoad: null,
        _positionTimer: null,
        _catalogTimer: null,
        catalog: [],
        entities: new Map(),
        starlinkLimit: 600,
        positionRefreshMs: 5000,
        catalogRefreshMs: 6 * 60 * 60 * 1000,
        ISS_URL: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
        STARLINK_URL: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json',
        SATELLITE_JS_URL: 'https://cdn.jsdelivr.net/npm/satellite.js@7.0.1/dist/index.js',

        async toggle(viewer) {
            if (this.enabled) {
                this.disable();
                return false;
            }
            return this.enable(viewer);
        },

        async enable(viewer) {
            if (!viewer) return false;
            this.viewer = viewer;
            this.enabled = true;
            this._setUi(true, 'Loading satellite catalog…');
            try {
                await this._ensureSatelliteLibrary();
                if (!this.enabled) return false;
                await this._refreshCatalog();
                if (!this.enabled) return false;
                this._startTimers();
                this._setUi(true, this._statusText());
                return true;
            } catch (error) {
                this.enabled = false;
                this._stopTimers();
                this._clearEntities();
                this._setUi(false, 'Satellites unavailable');
                try { errorHandler.log('3D satellites', error?.message || error); } catch (_) {}
                return false;
            }
        },

        disable() {
            this.enabled = false;
            this._stopTimers();
            this._clearEntities();
            this.catalog = [];
            this._setUi(false, 'Satellites off');
        },

        _setUi(enabled, status) {
            const button = document.getElementById('satellites3dBtn');
            if (button) {
                button.classList.toggle('active', !!enabled);
                button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            }
            const statusEl = document.getElementById('satellite3dStatus');
            if (statusEl && status) statusEl.textContent = status;
        },

        _startTimers() {
            this._stopTimers();
            this._positionTimer = setInterval(() => this._updatePositions(), this.positionRefreshMs);
            this._catalogTimer = setInterval(() => this._refreshCatalog(), this.catalogRefreshMs);
        },

        _stopTimers() {
            if (this._positionTimer) { clearInterval(this._positionTimer); this._positionTimer = null; }
            if (this._catalogTimer) { clearInterval(this._catalogTimer); this._catalogTimer = null; }
        },

        async _ensureSatelliteLibrary() {
            if (this.satelliteLib) return this.satelliteLib;
            if (this._satelliteLoad) return this._satelliteLoad;
            this._satelliteLoad = import(this.SATELLITE_JS_URL).then(module => {
                this.satelliteLib = module;
                return module;
            }).catch(error => {
                this._satelliteLoad = null;
                throw error;
            });
            return this._satelliteLoad;
        },

        async _fetchOmm(url) {
            const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!resp.ok) throw new Error('CelesTrak ' + resp.status);
            const data = await resp.json();
            return Array.isArray(data) ? data : [];
        },

        _sampleEvenly(records, limit) {
            if (records.length <= limit) return records.slice();
            const selected = [];
            for (let i = 0; i < limit; i++) {
                selected.push(records[Math.floor(i * records.length / limit)]);
            }
            return selected;
        },

        _makeRecord(raw, kind) {
            if (!raw || !this.satelliteLib || typeof this.satelliteLib.json2satrec !== 'function') return null;
            try {
                const name = String(raw.OBJECT_NAME || raw.objectName || 'Satellite').trim();
                const norad = String(raw.NORAD_CAT_ID || raw.noradCatId || name).trim();
                return {
                    key: kind + ':' + norad,
                    kind,
                    name,
                    norad,
                    satrec: this.satelliteLib.json2satrec(raw)
                };
            } catch (_) {
                return null;
            }
        },

        _buildCatalog(stations, starlink) {
            const iss = stations.find(record =>
                Number(record?.NORAD_CAT_ID) === 25544 ||
                /^ISS\s*\(/i.test(String(record?.OBJECT_NAME || ''))
            );
            const starlinkSample = this._sampleEvenly(
                starlink.filter(record => /^STARLINK/i.test(String(record?.OBJECT_NAME || ''))),
                this.starlinkLimit
            );
            const records = [];
            const issRecord = this._makeRecord(iss, 'iss');
            if (issRecord) records.push(issRecord);
            for (const raw of starlinkSample) {
                const record = this._makeRecord(raw, 'starlink');
                if (record) records.push(record);
            }
            return records;
        },

        async _refreshCatalog() {
            if (!this.enabled) return;
            const [stationsResult, starlinkResult] = await Promise.allSettled([
                this._fetchOmm(this.ISS_URL),
                this._fetchOmm(this.STARLINK_URL)
            ]);
            if (!this.enabled) return;
            const stations = stationsResult.status === 'fulfilled' ? stationsResult.value : [];
            const starlink = starlinkResult.status === 'fulfilled' ? starlinkResult.value : [];
            const catalog = this._buildCatalog(stations, starlink);
            if (!catalog.length) {
                const reason = stationsResult.reason || starlinkResult.reason || new Error('No satellite records');
                throw reason;
            }
            this._clearEntities();
            this.catalog = catalog;
            this._updatePositions();
            this._setUi(true, this._statusText());
        },

        _positionFor(satrec, date = new Date()) {
            if (!this.satelliteLib || !satrec || typeof Cesium === 'undefined') return null;
            try {
                const propagated = this.satelliteLib.propagate(satrec, date);
                if (!propagated?.position) return null;
                const gmst = this.satelliteLib.gstime(date);
                const geodetic = this.satelliteLib.eciToGeodetic(propagated.position, gmst);
                const toDegrees = (value, helper) => typeof this.satelliteLib[helper] === 'function'
                    ? this.satelliteLib[helper](value)
                    : value * 180 / Math.PI;
                const lon = toDegrees(geodetic.longitude, 'degreesLong');
                const lat = toDegrees(geodetic.latitude, 'degreesLat');
                const height = Number(geodetic.height) * 1000;
                if (![lat, lon, height].every(Number.isFinite)) return null;
                return Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(0, height));
            } catch (_) {
                return null;
            }
        },

        _entityFor(record, position) {
            const iss = record.kind === 'iss';
            const color = Cesium.Color.fromCssColorString(iss ? '#22d3ee' : '#facc15');
            const entity = {
                name: iss ? 'International Space Station (ISS)' : record.name,
                position,
                point: {
                    pixelSize: iss ? 11 : 4,
                    color,
                    outlineColor: iss ? Cesium.Color.WHITE : Cesium.Color.fromCssColorString('#fff7ae'),
                    outlineWidth: iss ? 2 : 1,
                    scaleByDistance: new Cesium.NearFarScalar(5e4, 1.5, 2e7, 0.65)
                },
                description: '<div class="sigmet-popup"><strong>' +
                    (iss ? '🛰 International Space Station' : '✦ Starlink') +
                    '</strong><br>' + _escHtml(record.name) + '<br>NORAD ' +
                    _escHtml(record.norad) + '</div>'
            };
            if (iss) {
                entity.label = {
                    text: 'ISS',
                    font: '12px "Segoe UI",sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cesium.Cartesian2(0, -20),
                    showBackground: true,
                    backgroundColor: Cesium.Color.fromCssColorString('#081525dd'),
                    backgroundPadding: new Cesium.Cartesian2(5, 3),
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3e7)
                };
            }
            return entity;
        },

        _updatePositions() {
            if (!this.enabled || !this.viewer || !this.catalog.length) return 0;
            const active = new Set();
            const now = new Date();
            for (const record of this.catalog) {
                const position = this._positionFor(record.satrec, now);
                if (!position) continue;
                active.add(record.key);
                let entity = this.entities.get(record.key);
                if (!entity) {
                    entity = this.viewer.entities.add(this._entityFor(record, position));
                    entity._skytrackSatelliteKey = record.key;
                    this.entities.set(record.key, entity);
                } else {
                    entity.position = position;
                    entity.show = true;
                }
            }
            for (const [key, entity] of this.entities) {
                if (!active.has(key)) entity.show = false;
            }
            return active.size;
        },

        _clearEntities() {
            if (this.viewer?.entities) {
                for (const entity of this.entities.values()) {
                    try { this.viewer.entities.remove(entity); } catch (_) {}
                }
            }
            this.entities.clear();
        },

        select(key) {
            const entity = this.entities.get(key);
            if (entity && this.viewer) this.viewer.selectedEntity = entity;
        },

        _statusText() {
            const iss = this.catalog.filter(record => record.kind === 'iss').length;
            const starlink = this.catalog.filter(record => record.kind === 'starlink').length;
            return 'Satellites: ISS ' + iss + ' · Starlink ' + starlink;
        },

        stats() {
            return {
                enabled: this.enabled,
                catalog: this.catalog.length,
                iss: this.catalog.filter(record => record.kind === 'iss').length,
                starlink: this.catalog.filter(record => record.kind === 'starlink').length,
                entities: this.entities.size
            };
        }
    };
