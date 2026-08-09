    // ============ ANNOTATED TRAILS ============
    function annotationGeoJson(trail = [], annotations = [], properties = {}) {
        const coordinates = (Array.isArray(trail) ? trail : []).filter(point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon))).map(point => [Number(point.lon), Number(point.lat), Number(point.alt) || 0]);
        const points = (Array.isArray(annotations) ? annotations : []).filter(point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon)) && point.text).map(point => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [Number(point.lon), Number(point.lat)] },
            properties: { text: String(point.text), timestamp: point.timestamp || null }
        }));
        return {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { ...properties, annotations: annotations || [] } },
                ...points
            ]
        };
    }

    const trailAnnotations = {
        map: null,
        layer: null,
        enabled: false,
        hex: null,
        annotations: [],
        init(mapInstance) {
            if (this.map || !mapInstance || typeof L === 'undefined') return;
            this.map = mapInstance;
            this.layer = L.layerGroup();
        },
        _storageKey(hex) { return 'skytrack_trail_annotations_' + String(hex || '').toUpperCase(); },
        load(hex) {
            this.hex = hex;
            try {
                const raw = localStorage.getItem(this._storageKey(hex));
                this.annotations = raw ? JSON.parse(raw) : [];
                if (!Array.isArray(this.annotations)) this.annotations = [];
            } catch (_) { this.annotations = []; }
            this.render();
        },
        save() {
            try { localStorage.setItem(this._storageKey(this.hex), JSON.stringify(this.annotations.slice(-100))); } catch (_) {}
        },
        _setButton() {
            const button = document.getElementById('annotateTrailBtn');
            button?.classList.toggle('active', this.enabled);
            button?.setAttribute('aria-pressed', String(this.enabled));
        },
        toggle(hex) {
            if (!this.map || !hex) return false;
            if (this.enabled) { this.stop(); return false; }
            this.enabled = true;
            this.load(hex);
            this.map.on('click', this._handleClick, this);
            document.body.classList.add('annotation-mode');
            this._setButton();
            return true;
        },
        stop() {
            this.enabled = false;
            this.map?.off('click', this._handleClick, this);
            document.body.classList.remove('annotation-mode');
            this._setButton();
        },
        _handleClick(event) {
            if (!this.enabled) return;
            const text = window.prompt('Annotation for this trail point:');
            if (!text?.trim()) return;
            this.add({ lat: event.latlng.lat, lon: event.latlng.lng, text: text.trim(), timestamp: Date.now() });
            if (event.originalEvent) event.originalEvent.stopPropagation();
        },
        add(annotation) {
            if (!annotation?.text || !Number.isFinite(Number(annotation.lat)) || !Number.isFinite(Number(annotation.lon))) return false;
            this.annotations.push({ lat: Number(annotation.lat), lon: Number(annotation.lon), text: String(annotation.text).slice(0, 240), timestamp: annotation.timestamp || Date.now() });
            this.save();
            this.render();
            return true;
        },
        render() {
            if (!this.layer) return;
            this.layer.clearLayers();
            const esc = value => typeof _escHtml === 'function' ? _escHtml(value) : String(value);
            for (const annotation of this.annotations) {
                const marker = L.marker([annotation.lat, annotation.lon], { icon: L.divIcon({ className: 'annotation-marker', html: '<span>✎</span>', iconSize: [24, 24], iconAnchor: [12, 12] }) });
                marker.bindTooltip(esc(annotation.text), { direction: 'top' });
                marker.addTo(this.layer);
            }
            if (this.map && this.annotations.length && !this.map.hasLayer(this.layer)) this.layer.addTo(this.map);
            if (this.map && !this.annotations.length && this.map.hasLayer(this.layer)) this.map.removeLayer(this.layer);
        },
        exportGeoJSON(hex) {
            const target = hex || this.hex;
            if (!target) return false;
            const ac = typeof aircraftCache !== 'undefined' ? aircraftCache[target] : null;
            const trail = (ac?.history || []).map(point => ({ lat: point[0], lon: point[1], alt: point[2] }));
            const data = annotationGeoJson(trail, this.annotations, { hex: target, callsign: ac?.flight?.trim() || target });
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url; link.download = 'skytrack-trail-' + String(target).toUpperCase() + '.geojson'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            if (typeof toast === 'function') toast('Annotated trail exported');
            return true;
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => trailAnnotations.init(event.detail?.map), { once: true });
    }
