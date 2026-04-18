
    // ============ PHASE 5: DISTANCE MEASUREMENT TOOL ============
    const measureTool = {
        active: false,
        points: [],
        line: null,
        markers: [],
        // Bound handler references are created lazily so that `map.off` can
        // actually match what was registered. Previously toggle() passed
        // `this.addPoint.bind(this)` to both `on` and `off`, which yields two
        // different function identities — so the handler was never removed,
        // and every successive toggle stacked another click listener onto the
        // map (every click after that counted multiple points).
        _boundAddPoint: null,
        _boundFinish: null,

        toggle() {
            this.active = !this.active;
            document.getElementById('measureBtn')?.classList.toggle('active', this.active);
            if (!this._boundAddPoint) this._boundAddPoint = this.addPoint.bind(this);
            if (!this._boundFinish) this._boundFinish = this.finish.bind(this);

            if (this.active) {
                document.getElementById('map').style.cursor = 'crosshair';
                toast('Click to measure. Ctrl+Z to undo. Double-click to finish.');
                map.on('click', this._boundAddPoint);
                map.on('dblclick', this._boundFinish);
            } else {
                document.getElementById('map').style.cursor = '';
                map.off('click', this._boundAddPoint);
                map.off('dblclick', this._boundFinish);
                this.clear();
            }
        },
        
        addPoint(e) {
            if (!this.active) return;
            
            const point = { lat: e.latlng.lat, lon: e.latlng.lng };
            this.points.push(point);
            
            const marker = L.circleMarker([point.lat, point.lon], {
                radius: 6,
                fillColor: '#ffd700',
                fillOpacity: 1,
                color: '#000',
                weight: 2
            }).addTo(map);
            this.markers.push(marker);
            
            this.updateLine();
            
            if (this.points.length > 1) {
                this.showDistance();
            }
        },
        
        updateLine() {
            if (this.line) {
                map.removeLayer(this.line);
            }
            
            if (this.points.length < 2) return;
            
            const latlngs = this.points.map(p => [p.lat, p.lon]);
            this.line = L.polyline(latlngs, {
                color: '#ffd700',
                weight: 3,
                dashArray: '10, 5',
                opacity: 0.8
            }).addTo(map);
        },
        
        showDistance() {
            let totalDist = 0;
            for (let i = 1; i < this.points.length; i++) {
                totalDist += haversineDistance(
                    this.points[i-1].lat, this.points[i-1].lon,
                    this.points[i].lat, this.points[i].lon
                );
            }
            
            const last = this.points.length - 1;
            const bearing = this.calculateBearing(
                this.points[last-1].lat, this.points[last-1].lon,
                this.points[last].lat, this.points[last].lon
            );
            
            const distKm = totalDist.toFixed(1);
            const distNm = (totalDist * 0.539957).toFixed(1);
            const distMi = (totalDist * 0.621371).toFixed(1);
            
            toast(`Distance: ${distKm} km (${distNm} nm / ${distMi} mi) | Bearing: ${Math.round(bearing)}`);
        },
        
        calculateBearing(lat1, lon1, lat2, lon2) {
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const lat1Rad = lat1 * Math.PI / 180;
            const lat2Rad = lat2 * Math.PI / 180;
            
            const y = Math.sin(dLon) * Math.cos(lat2Rad);
            const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
            
            let bearing = Math.atan2(y, x) * 180 / Math.PI;
            return (bearing + 360) % 360;
        },
        
        finish(e) {
            if (!this.active) return;
            L.DomEvent.stopPropagation(e);

            this.active = false;
            document.getElementById('measureBtn')?.classList.remove('active');
            document.getElementById('map').style.cursor = '';
            if (this._boundAddPoint) map.off('click', this._boundAddPoint);
            if (this._boundFinish) map.off('dblclick', this._boundFinish);
            
            if (this.points.length > 1 && this.line) {
                let totalDist = 0;
                for (let i = 1; i < this.points.length; i++) {
                    totalDist += haversineDistance(
                        this.points[i-1].lat, this.points[i-1].lon,
                        this.points[i].lat, this.points[i].lon
                    );
                }
                
                const center = this.line.getCenter();
                L.popup()
                    .setLatLng(center)
                    .setContent(`
                        <div style="text-align:center">
                            <strong>${totalDist.toFixed(1)} km</strong><br>
                            ${(totalDist * 0.539957).toFixed(1)} nm / ${(totalDist * 0.621371).toFixed(1)} mi
                        </div>
                    `)
                    .openOn(map);
            }
        },
        
        clear() {
            if (this.line) {
                map.removeLayer(this.line);
                this.line = null;
            }
            
            this.markers.forEach(m => map.removeLayer(m));
            this.markers = [];
            this.points = [];
            map.closePopup();
        },
        
        undo() {
            if (!this.active || this.points.length === 0) return;
            
            // Remove last point
            this.points.pop();
            
            // Remove last marker
            if (this.markers.length > 0) {
                const lastMarker = this.markers.pop();
                map.removeLayer(lastMarker);
            }
            
            // Update line
            this.updateLine();
            
            // Show updated distance or notify if no points left
            if (this.points.length > 1) {
                this.showDistance();
            } else if (this.points.length === 1) {
                toast('1 point remaining. Ctrl+Z to remove.');
            } else {
                toast('All points removed. Click to start measuring.');
            }
        }
    };
