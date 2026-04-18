
    // ============ PHASE 6: MINI-MAP ============
    const miniMap = {
        map: null,
        viewRect: null,
        enabled: false,
        aircraftMarkers: [],
        isDragging: false,
        fixedZoom: 3, // Fixed zoom level for continent overview
        
        init() {
            const container = document.createElement('div');
            container.id = 'miniMap';
            container.className = 'mini-map';
            document.body.appendChild(container);
            
            this.map = L.map('miniMap', {
                zoomControl: false,
                attributionControl: false,
                dragging: true, // Enable dragging
                touchZoom: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false
            });
            
            // Initialize with current map style
            const currentStyle = typeof currentBaseMap !== 'undefined' ? currentBaseMap : 'dark';
            const styleUrls = {
                'dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                'satellite': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                'google-streets': 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
                'google-satellite': 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                'google-hybrid': 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                'google-terrain': 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
            };
            const tileUrl = styleUrls[currentStyle] || styleUrls['dark'];
            const tileOptions = { maxZoom: 19 };
            if (currentStyle.startsWith('google-')) {
                tileOptions.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
            }
            this.tileLayer = L.tileLayer(tileUrl, tileOptions).addTo(this.map);
            
            this.viewRect = L.rectangle([[0, 0], [0, 0]], {
                color: '#ffd700',
                weight: 2,
                fillOpacity: 0.1,
                interactive: true // Make rectangle interactive for dragging
            }).addTo(this.map);
            
            // Double-click to navigate main map
            this.map.on('dblclick', (e) => {
                L.DomEvent.stopPropagation(e);
                map.setView(e.latlng, map.getZoom());
                toast('Navigated to location');
            });
            
            // Drag the view rectangle to move main map
            let dragStartLatLng = null;
            
            this.map.on('mousedown', (e) => {
                if (this.viewRect.getBounds().contains(e.latlng)) {
                    this.isDragging = true;
                    dragStartLatLng = e.latlng;
                    this.map.dragging.disable();
                    L.DomUtil.addClass(this.map.getContainer(), 'leaflet-dragging');
                }
            });
            
            this.map.on('mousemove', (e) => {
                if (this.isDragging && dragStartLatLng) {
                    const newCenter = map.getCenter();
                    const latDiff = e.latlng.lat - dragStartLatLng.lat;
                    const lngDiff = e.latlng.lng - dragStartLatLng.lng;
                    map.setView([newCenter.lat + latDiff, newCenter.lng + lngDiff], map.getZoom(), { animate: false });
                    dragStartLatLng = e.latlng;
                }
            });
            
            this.map.on('mouseup', () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    this.map.dragging.enable();
                    L.DomUtil.removeClass(this.map.getContainer(), 'leaflet-dragging');
                }
            });
            
            // When minimap is dragged (not the rectangle), update center
            this.map.on('dragend', () => {
                if (!this.isDragging) {
                    // User dragged the minimap itself, update view rect position
                    this.updateViewRect();
                }
            });
            
            // Sync view rect when main map moves (but don't change minimap zoom)
            map.on('moveend', () => this.updateViewRect());
            
            // Initial sync
            this.syncCenter();
        },
        
        syncCenter() {
            if (!this.map) return;
            const center = map.getCenter();
            this.map.setView(center, this.fixedZoom, { animate: false });
            this.updateViewRect();
        },
        
        updateViewRect() {
            if (!this.map || !this.viewRect) return;
            const bounds = map.getBounds();
            this.viewRect.setBounds(bounds);
        },
        
        toggle() {
            this.enabled = !this.enabled;
            const container = document.getElementById('miniMap');
            if (container) container.classList.toggle('visible', this.enabled);
            document.getElementById('miniMapBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) {
                this.syncCenter();
                this.updateAircraft();
            }
        },
        
        // Update map style to match main map
        updateMapStyle(styleName) {
            if (!this.map || !this.tileLayer) return;
            this.map.removeLayer(this.tileLayer);
            
            // Map style URLs matching the main map
            const styleUrls = {
                'dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                'satellite': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                'google-streets': 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
                'google-satellite': 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                'google-hybrid': 'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
                'google-terrain': 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
            };
            
            const tileUrl = styleUrls[styleName] || styleUrls['dark'];
            const options = { maxZoom: 19 };
            
            // Google tiles need subdomains
            if (styleName.startsWith('google-')) {
                options.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
            }
            
            this.tileLayer = L.tileLayer(tileUrl, options).addTo(this.map);
        },
        
        // Legacy method for theme system compatibility
        updateTheme(isDark) {
            this.updateMapStyle(isDark ? 'dark' : 'google-streets');
        },
        
        updateAircraft: perfUtils.throttle(function() {
            if (!this.enabled || !this.map) return;
            
            // Build a map of current positions
            const currentPositions = new Map();
            Object.values(aircraftCache).forEach(ac => {
                if (ac.lat !== undefined) {
                    currentPositions.set(ac.hex, {
                        lat: ac.lat,
                        lon: ac.lon,
                        isSelected: ac.hex === selectedHex,
                        isInteresting: ac.interesting || ac.militaryInfo || ac.isVIP
                    });
                }
            });
            
            // Remove markers for aircraft no longer present
            this.aircraftMarkers = this.aircraftMarkers.filter(m => {
                if (!currentPositions.has(m._skytrackHex)) {
                    this.map.removeLayer(m);
                    return false;
                }
                return true;
            });
            
            // Create a set of existing hexes
            const existingHexes = new Set(this.aircraftMarkers.map(m => m._skytrackHex));
            
            // Update existing or add new markers
            currentPositions.forEach((pos, hex) => {
                const color = pos.isSelected ? '#00ffff' :
                             pos.isInteresting ? '#ffd700' : '#666';
                const radius = pos.isSelected ? 4 : 2;
                
                if (existingHexes.has(hex)) {
                    // Update existing marker
                    const marker = this.aircraftMarkers.find(m => m._skytrackHex === hex);
                    if (marker) {
                        marker.setLatLng([pos.lat, pos.lon]);
                        marker.setStyle({ fillColor: color, radius: radius });
                    }
                } else {
                    // Add new marker
                    const marker = L.circleMarker([pos.lat, pos.lon], {
                        radius: radius,
                        fillColor: color,
                        fillOpacity: 1,
                        stroke: false
                    });
                    marker._skytrackHex = hex;
                    marker.addTo(this.map);
                    this.aircraftMarkers.push(marker);
                }
            });
        }, 2000) // Throttle to every 2 seconds
    };

