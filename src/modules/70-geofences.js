
    // ============ PHASE 14: GEOFENCING SYSTEM ============
    const geofencing = {
        zones: [],
        activeAlerts: new Map(),
        drawingMode: false,
        currentPolygon: [],
        previewLine: null,
        tempMarkers: [],
        
        init() {
            // Load saved zones
            const saved = localStorage.getItem('skytrack_geofences');
            if (saved) {
                try {
                    this.zones = JSON.parse(saved);
                    this.zones.forEach(z => this.drawZone(z));
                } catch (e) {
                    console.error('Failed to load geofences:', e);
                }
            }
            
            // Button handlers
            document.getElementById('geofenceBtn')?.addEventListener('click', () => this.togglePanel());
            document.getElementById('gfAddNew')?.addEventListener('click', () => this.startDrawing());
            document.getElementById('gfFinish')?.addEventListener('click', () => this.finishDrawing());
            document.getElementById('gfCancel')?.addEventListener('click', () => this.cancelDrawing());

            document.addEventListener('click', (e) => {
                const panel = document.getElementById('geofenceList');
                const btn = document.getElementById('geofenceBtn');
                if (panel?.classList.contains('show') && !panel.contains(e.target) && !btn?.contains(e.target)) {
                    panel.classList.remove('show');
                    panel.setAttribute('aria-hidden', 'true');
                    btn?.classList.remove('active');
                    setExpandedState(btn, false);
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && document.getElementById('geofenceList')?.classList.contains('show')) {
                    document.getElementById('geofenceList')?.classList.remove('show');
                    document.getElementById('geofenceList')?.setAttribute('aria-hidden', 'true');
                    document.getElementById('geofenceBtn')?.classList.remove('active');
                    setExpandedState(document.getElementById('geofenceBtn'), false);
                }
            });
             
            this.updateList();
        },
        
        togglePanel() {
            const panel = document.getElementById('geofenceList');
            const isOpen = panel ? !panel.classList.contains('show') : false;
            panel?.classList.toggle('show', isOpen);
            panel?.setAttribute('aria-hidden', String(!isOpen));
            document.getElementById('geofenceBtn')?.classList.toggle('active', isOpen);
            setExpandedState(document.getElementById('geofenceBtn'), isOpen);
        },
        
        // Cache the bound click handler so that startDrawing/cleanupDrawing can
        // register and unregister *the same* function with Leaflet's `on/off`.
        // Without the cache, each `.bind(this)` call produces a new function
        // identity and `map.off(...)` silently does nothing, leaving a live
        // click listener on the map after the drawing session ends.
        _boundMapClick: null,

        startDrawing() {
            this.drawingMode = true;
            this.currentPolygon = [];
            this.tempMarkers = [];

            map.getContainer().style.cursor = 'crosshair';
            document.getElementById('geofenceControls')?.classList.add('show');
            document.getElementById('geofenceList')?.classList.remove('show');
            document.getElementById('geofenceList')?.setAttribute('aria-hidden', 'true');
            setExpandedState(document.getElementById('geofenceBtn'), false);
            document.getElementById('geofenceBtn')?.classList.remove('active');

            toast('Click on map to add points, then click Finish');

            if (!this._boundMapClick) this._boundMapClick = this.handleMapClick.bind(this);
            map.on('click', this._boundMapClick);
        },
        
        handleMapClick(e) {
            if (!this.drawingMode) return;
            
            this.currentPolygon.push([e.latlng.lat, e.latlng.lng]);
            
            // Add point marker
            const pointMarker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
                radius: 6,
                fillColor: '#ffd700',
                fillOpacity: 1,
                color: '#fff',
                weight: 2
            }).addTo(map);
            this.tempMarkers.push(pointMarker);
            
            // Update preview line
            if (this.previewLine) {
                map.removeLayer(this.previewLine);
            }
            
            if (this.currentPolygon.length > 1) {
                const closedPolygon = [...this.currentPolygon, this.currentPolygon[0]];
                this.previewLine = L.polyline(closedPolygon, {
                    color: '#ffd700',
                    weight: 2,
                    dashArray: '5, 5',
                    fillColor: '#ffd700',
                    fillOpacity: 0.1
                }).addTo(map);
            }
        },
        
        async finishDrawing() {
            if (this.currentPolygon.length < 3) {
                toast('Need at least 3 points to create a zone');
                return;
            }
            
            this.cleanupDrawing();
            
            const suggestedName = 'Zone ' + (this.zones.length + 1);
            const name = await uiDialogs.prompt({
                eyebrow: 'Geofencing',
                title: 'Name This Alert Zone',
                message: 'Choose a short label so entry and exit alerts are easy to recognize later.',
                label: 'Zone Name',
                note: 'You can rename it any time from the zone menu.',
                placeholder: suggestedName,
                defaultValue: suggestedName,
                confirmLabel: 'Save Zone',
                cancelLabel: 'Discard',
                validationMessage: 'Enter a name for this zone.'
            });
            if (!name) {
                this.currentPolygon = [];
                toast('Zone discarded', 'warning');
                return;
            }
            
            const colors = ['#ffd700', '#00ffff', '#ff00ff', '#00ff00', '#ff6600', '#ff0066'];
            
            const zone = {
                id: Date.now(),
                name,
                polygon: this.currentPolygon,
                alertOnEnter: true,
                alertOnExit: false,
                color: colors[this.zones.length % colors.length]
            };
            
            this.zones.push(zone);
            this.save();
            this.drawZone(zone);
            this.updateList();
            
            this.currentPolygon = [];
            toast(`Saved alert zone: ${name}`, 'success');
        },
        
        cancelDrawing() {
            this.cleanupDrawing();
            this.currentPolygon = [];
            toast('Zone drawing cancelled', 'warning');
        },
        
        cleanupDrawing() {
            this.drawingMode = false;
            map.getContainer().style.cursor = '';
            document.getElementById('geofenceControls')?.classList.remove('show');

            if (this._boundMapClick) map.off('click', this._boundMapClick);
            
            // Remove preview
            if (this.previewLine) {
                map.removeLayer(this.previewLine);
                this.previewLine = null;
            }
            
            // Remove temp markers
            this.tempMarkers.forEach(m => map.removeLayer(m));
            this.tempMarkers = [];
        },
        
        drawZone(zone) {
            const polygon = L.polygon(zone.polygon, {
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: 0.15,
                weight: 2
            }).addTo(map);
            
            polygon._zoneId = zone.id;
            polygon.bindTooltip(zone.name, { sticky: true });
            
            polygon.on('contextmenu', (e) => {
                e.originalEvent.preventDefault();
                this.showZoneMenu(zone, e.latlng);
            });
            
            zone._layer = polygon;
        },
        
        showZoneMenu(zone, latlng) {
            // Remove existing menu
            document.querySelectorAll('.zone-context-menu').forEach(m => m.remove());
            
            const menu = document.createElement('div');
            menu.className = 'zone-context-menu';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', `Actions for zone ${zone.name}`);
            menu.innerHTML = `
                <button type="button" class="zone-menu-item" data-action="rename" role="menuitem">Rename Zone</button>
                <button type="button" class="zone-menu-item" data-action="toggle-enter" role="menuitem">
                    ${zone.alertOnEnter ? '&#10003; ' : ''}Alert on Enter
                </button>
                <button type="button" class="zone-menu-item" data-action="toggle-exit" role="menuitem">
                    ${zone.alertOnExit ? '&#10003; ' : ''}Alert on Exit
                </button>
                <button type="button" class="zone-menu-item" data-action="zoom" role="menuitem">Zoom to Zone</button>
                <button type="button" class="zone-menu-item danger" data-action="delete" role="menuitem">Delete Zone</button>
            `;
            
            const point = map.latLngToContainerPoint(latlng);
            menu.style.left = point.x + 'px';
            menu.style.top = point.y + 'px';
            
            document.getElementById('map').appendChild(menu);
            
            // Hoisted close handler so both the outside-click path and the
            // action-click path remove the same listener — otherwise each
            // context-menu session leaked one global click listener.
            const closeMenu = (e) => {
                if (e && menu.contains(e.target)) return;
                document.removeEventListener('click', closeMenu);
                if (menu.isConnected) menu.remove();
            };
            menu.addEventListener('click', async (e) => {
                const item = e.target.closest('.zone-menu-item');
                const action = item?.dataset.action;
                if (!action) return;
                document.removeEventListener('click', closeMenu);
                menu.remove();

                if (action === 'rename') {
                    const newName = await uiDialogs.prompt({
                        eyebrow: 'Alert Zone',
                        title: 'Rename Zone',
                        message: 'Update the label used in the list and in future alerts.',
                        label: 'Zone Name',
                        defaultValue: zone.name,
                        confirmLabel: 'Rename Zone',
                        cancelLabel: 'Keep Current',
                        validationMessage: 'Enter a new name for this zone.'
                    });
                    if (newName) {
                        zone.name = newName;
                        zone._layer?.setTooltipContent(newName);
                        this.save();
                        this.updateList();
                        toast(`Renamed zone to ${newName}`, 'success');
                    }
                } else if (action === 'toggle-enter') {
                    zone.alertOnEnter = !zone.alertOnEnter;
                    this.save();
                    toast(zone.alertOnEnter ? 'Enter alerts ON' : 'Enter alerts OFF');
                } else if (action === 'toggle-exit') {
                    zone.alertOnExit = !zone.alertOnExit;
                    this.save();
                    toast(zone.alertOnExit ? 'Exit alerts ON' : 'Exit alerts OFF');
                } else if (action === 'zoom') {
                    if (zone._layer) {
                        map.fitBounds(zone._layer.getBounds().pad(0.2));
                        toast(`Centered on ${zone.name}`);
                    }
                } else if (action === 'delete') {
                    const confirmed = await uiDialogs.confirmDialog({
                        eyebrow: 'Alert Zone',
                        title: `Delete "${zone.name}"?`,
                        message: 'This removes the zone boundary and its alert settings from SkyTrack.',
                        confirmLabel: 'Delete Zone',
                        cancelLabel: 'Keep Zone',
                        tone: 'danger'
                    });
                    if (confirmed) {
                        this.deleteZone(zone.id);
                    }
                }
            });
            
            // Close on outside click. Deferred so the click that spawned the
            // menu doesn't immediately dismiss it.
            setTimeout(() => {
                if (menu.isConnected) document.addEventListener('click', closeMenu);
            }, 100);
        },
        
        deleteZone(id) {
            const index = this.zones.findIndex(z => z.id === id);
            if (index === -1) return;
            
            const zone = this.zones[index];
            if (zone._layer) {
                map.removeLayer(zone._layer);
            }
            
            this.zones.splice(index, 1);
            this.save();
            this.updateList();
            toast(`Deleted zone: ${zone.name}`, 'warning');
        },
        
        updateList() {
            const content = document.getElementById('gfListContent');
            if (!content) return;
            
            if (this.zones.length === 0) {
                content.innerHTML = '<div class="gf-list-empty">No alert zones yet<br>Use Add to create a monitored area.</div>';
                return;
            }
            
            content.innerHTML = this.zones.map(zone => `
                <button type="button" class="gf-list-item" data-id="${_escHtml(zone.id)}" aria-label="Open zone ${_escHtml(zone.name)}">
                    <div class="gf-zone-meta">
                        <span class="gf-zone-name">${_escHtml(zone.name)}</span>
                        <span class="gf-zone-status">${zone.alertOnEnter ? 'Enter alerts on' : 'Enter alerts off'} · ${zone.alertOnExit ? 'Exit alerts on' : 'Exit alerts off'}</span>
                    </div>
                    <div class="gf-zone-color" style="background:${_escHtml(zone.color)}"></div>
                </button>
            `).join('');
            
            content.querySelectorAll('.gf-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const zone = this.zones.find(z => z.id === parseInt(item.dataset.id, 10));
                    if (zone?._layer) {
                        map.fitBounds(zone._layer.getBounds().pad(0.2));
                    }
                });
                
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const zone = this.zones.find(z => z.id === parseInt(item.dataset.id, 10));
                    if (zone) {
                        const center = zone._layer?.getBounds().getCenter();
                        if (center) this.showZoneMenu(zone, center);
                    }
                });
            });
        },
        
        // Check if aircraft is in any zone
        checkAircraft(ac) {
            if (!ac.lat || !ac.lon) return;
            
            const point = L.latLng(ac.lat, ac.lon);
            
            this.zones.forEach(zone => {
                if (!zone._layer) return;
                
                const isInside = this.isPointInPolygon(point, zone.polygon);
                const key = `${ac.hex}-${zone.id}`;
                const wasInside = this.activeAlerts.get(key);
                
                if (isInside && !wasInside && zone.alertOnEnter) {
                    this.activeAlerts.set(key, true);
                    this.triggerAlert(ac, zone, 'entered');
                } else if (!isInside && wasInside && zone.alertOnExit) {
                    this.activeAlerts.set(key, false);
                    this.triggerAlert(ac, zone, 'exited');
                } else if (isInside) {
                    this.activeAlerts.set(key, true);
                } else {
                    this.activeAlerts.set(key, false);
                }
            });
        },
        
        isPointInPolygon(point, polygon) {
            let inside = false;
            const x = point.lat, y = point.lng;
            
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i][0], yi = polygon[i][1];
                const xj = polygon[j][0], yj = polygon[j][1];
                
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                    inside = !inside;
                }
            }
            
            return inside;
        },
        
        triggerAlert(ac, zone, action) {
            const title = ac.flight?.trim() || ac.r || ac.hex;
            const message = `${action} zone "${zone.name}"`;
            
            notificationCenter.add({
                type: 'geofence',
                title: `Geofence: ${title}`,
                message,
                hex: ac.hex
            });
            
            alertSystem.playSound('soft');
            toast(`${title} ${message}`);
        },
        
        save() {
            const data = this.zones.map(z => ({
                id: z.id,
                name: z.name,
                polygon: z.polygon,
                alertOnEnter: z.alertOnEnter,
                alertOnExit: z.alertOnExit,
                color: z.color
            }));
            localStorage.setItem('skytrack_geofences', JSON.stringify(data));
        }
    };

