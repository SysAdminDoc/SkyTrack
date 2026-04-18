
    // ============ PHASE 10: ROUTE PREDICTION SYSTEM ============
    const routePredictor = {
        predictionLine: null,
        etaMarkers: null,
        greatCircleLine: null,
        predictionActive: false,
        routeActive: false,
        
        // Predict future position based on current heading and speed
        predictPath(ac, minutes = 30) {
            if (!ac || ac.lat === undefined || !ac.gs || !ac.track) return null;
            
            const points = [];
            const speedKmPerMin = ac.gs * 1.852 / 60; // knots to km/min
            const heading = ac.track * Math.PI / 180;
            
            let lat = ac.lat;
            let lon = ac.lon;
            
            // Generate prediction points every minute
            for (let i = 1; i <= minutes; i++) {
                const distance = speedKmPerMin * i;
                const newPos = this.destinationPoint(lat, lon, heading, distance);
                points.push({
                    lat: newPos.lat,
                    lon: newPos.lon,
                    minutesAhead: i,
                    estimatedAlt: this.predictAltitude(ac, i)
                });
            }
            
            return points;
        },
        
        // Calculate destination point given start, bearing, and distance
        destinationPoint(lat, lon, bearing, distanceKm) {
            const R = 6371; // Earth radius in km
            const d = distanceKm / R;
            
            const lat1 = lat * Math.PI / 180;
            const lon1 = lon * Math.PI / 180;
            
            const lat2 = Math.asin(
                Math.sin(lat1) * Math.cos(d) +
                Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
            );
            
            const lon2 = lon1 + Math.atan2(
                Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
                Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
            );
            
            return {
                lat: lat2 * 180 / Math.PI,
                lon: lon2 * 180 / Math.PI
            };
        },
        
        // Predict altitude based on vertical speed
        predictAltitude(ac, minutesAhead) {
            if (!ac.baro_rate) return ac.alt_baro;
            const altChange = ac.baro_rate * minutesAhead;
            return Math.max(0, (ac.alt_baro || 0) + altChange);
        },
        
        // Calculate ETA to destination airport
        calculateETA(ac) {
            if (!ac || !ac.to || ac.lat === undefined || !ac.gs) return null;
            
            const destAirport = airportDB.getByCode(ac.to);
            if (!destAirport) return null;
            
            const distance = haversineDistance(ac.lat, ac.lon, destAirport.lat, destAirport.lon);
            const speedKmPerHour = ac.gs * 1.852;
            
            if (speedKmPerHour < 50) return null; // Too slow, probably not in flight
            
            const hoursRemaining = distance / speedKmPerHour;
            const eta = new Date(Date.now() + hoursRemaining * 3600000);
            
            return {
                distance: distance,
                hoursRemaining: hoursRemaining,
                eta: eta,
                airport: destAirport
            };
        },
        
        // Draw prediction line on map
        showPrediction(ac) {
            this.clearPrediction();
            
            const points = this.predictPath(ac, 30);
            if (!points || points.length < 2) {
                toast('Unable to predict - no speed/heading data');
                return;
            }
            
            // Create gradient line
            const latlngs = [[ac.lat, ac.lon], ...points.map(p => [p.lat, p.lon])];
            
            this.predictionLine = L.polyline(latlngs, {
                color: '#ffffff',
                weight: 2,
                opacity: 0.5,
                dashArray: '8, 8',
                className: 'prediction-line'
            }).addTo(map);
            
            this.etaMarkers = [];
            
            // Add time markers every 10 minutes
            [10, 20, 30].forEach(min => {
                const point = points[min - 1];
                if (point) {
                    const marker = L.circleMarker([point.lat, point.lon], {
                        radius: 4,
                        fillColor: '#fff',
                        fillOpacity: 0.7,
                        color: '#fff',
                        weight: 1
                    }).addTo(map);
                    
                    marker.bindTooltip(`+${min} min`, {
                        permanent: true,
                        direction: 'top',
                        className: 'prediction-tooltip'
                    });
                    
                    this.etaMarkers.push(marker);
                }
            });
            
            this.predictionActive = true;
            document.getElementById('showPredictionBtn')?.classList.add('active');
        },
        
        // Draw great circle route to destination
        showGreatCircle(ac) {
            this.clearGreatCircle();
            
            if (!ac || !ac.to) {
                toast('No destination known');
                return;
            }
            
            const destAirport = airportDB.getByCode(ac.to);
            if (!destAirport) {
                toast('Destination airport not found');
                return;
            }
            
            // Calculate great circle path points
            const points = this.greatCirclePoints(
                ac.lat, ac.lon,
                destAirport.lat, destAirport.lon,
                50 // number of intermediate points
            );
            
            this.greatCircleLine = L.polyline(points, {
                color: '#4ade80',
                weight: 2,
                opacity: 0.6,
                dashArray: '4, 8'
            }).addTo(map);
            
            // Add destination marker
            const destMarker = L.marker([destAirport.lat, destAirport.lon], {
                icon: L.divIcon({
                    className: 'destination-marker',
                    html: '<div class="dest-icon">D</div>',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(map);
            
            destMarker.bindTooltip(destAirport.name, { direction: 'top' });
            
            this.etaMarkers = this.etaMarkers || [];
            this.etaMarkers.push(destMarker);
            
            this.routeActive = true;
            document.getElementById('showRouteBtn')?.classList.add('active');
        },
        
        // Generate great circle path points
        greatCirclePoints(lat1, lon1, lat2, lon2, numPoints) {
            const points = [];
            
            const phi1 = lat1 * Math.PI / 180;
            const phi2 = lat2 * Math.PI / 180;
            const lambda1 = lon1 * Math.PI / 180;
            const lambda2 = lon2 * Math.PI / 180;
            
            const d = Math.acos(
                Math.sin(phi1) * Math.sin(phi2) +
                Math.cos(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1)
            );
            
            // Handle very short distances
            if (d < 0.0001) {
                return [[lat1, lon1], [lat2, lon2]];
            }
            
            for (let i = 0; i <= numPoints; i++) {
                const f = i / numPoints;
                
                const A = Math.sin((1 - f) * d) / Math.sin(d);
                const B = Math.sin(f * d) / Math.sin(d);
                
                const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
                const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
                const z = A * Math.sin(phi1) + B * Math.sin(phi2);
                
                const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
                const lon = Math.atan2(y, x) * 180 / Math.PI;
                
                points.push([lat, lon]);
            }
            
            return points;
        },
        
        clearPrediction() {
            if (this.predictionLine) {
                map.removeLayer(this.predictionLine);
                this.predictionLine = null;
            }
            if (this.etaMarkers && !this.routeActive) {
                this.etaMarkers.forEach(m => map.removeLayer(m));
                this.etaMarkers = null;
            }
            this.predictionActive = false;
            document.getElementById('showPredictionBtn')?.classList.remove('active');
        },
        
        clearGreatCircle() {
            if (this.greatCircleLine) {
                map.removeLayer(this.greatCircleLine);
                this.greatCircleLine = null;
            }
            if (this.etaMarkers && !this.predictionActive) {
                this.etaMarkers.forEach(m => map.removeLayer(m));
                this.etaMarkers = null;
            }
            this.routeActive = false;
            document.getElementById('showRouteBtn')?.classList.remove('active');
        },
        
        clearAll() {
            if (this.predictionLine) {
                map.removeLayer(this.predictionLine);
                this.predictionLine = null;
            }
            if (this.greatCircleLine) {
                map.removeLayer(this.greatCircleLine);
                this.greatCircleLine = null;
            }
            if (this.etaMarkers) {
                this.etaMarkers.forEach(m => map.removeLayer(m));
                this.etaMarkers = null;
            }
            this.predictionActive = false;
            this.routeActive = false;
            document.getElementById('showPredictionBtn')?.classList.remove('active');
            document.getElementById('showRouteBtn')?.classList.remove('active');
        },
        
        togglePrediction(ac) {
            if (this.predictionActive) {
                this.clearPrediction();
                toast('Prediction hidden');
            } else {
                this.showPrediction(ac);
                toast('Showing 30-minute prediction');
            }
        },
        
        toggleRoute(ac) {
            if (this.routeActive) {
                this.clearGreatCircle();
                toast('Route hidden');
            } else {
                this.showGreatCircle(ac);
                if (this.routeActive) toast('Showing route to ' + ac.to);
            }
        },
        
        // Update ETA display in info panel
        updateETADisplay(ac) {
            const etaSection = document.getElementById('etaSection');
            if (!etaSection) return;
            
            const eta = this.calculateETA(ac);
            
            if (eta) {
                etaSection.style.display = 'block';
                // The ETA panel renders differently between desktop and mobile
                // layouts; child elements can legitimately be absent. Null-guard
                // each write so a missing sub-element doesn't throw and bring
                // the entire info-panel update with it.
                const etaTimeEl = document.getElementById('etaTime');
                if (etaTimeEl) etaTimeEl.textContent =
                    eta.eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const etaDistEl = document.getElementById('etaDistance');
                if (etaDistEl) etaDistEl.textContent = Math.round(eta.distance) + ' km';

                const hours = Math.floor(eta.hoursRemaining);
                const mins = Math.round((eta.hoursRemaining - hours) * 60);
                const etaRemainEl = document.getElementById('etaRemaining');
                if (etaRemainEl) etaRemainEl.textContent =
                    hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                // Calculate progress
                const progressBar = document.getElementById('etaProgressBar');
                if (progressBar) {
                    let progressPct = 0;
                    if (ac.from) {
                        const originAirport = ac.detectedOrigin || airportDB.getByCode(ac.from);
                        if (originAirport && eta.airport) {
                            const totalDist = haversineDistance(
                                originAirport.lat, originAirport.lon,
                                eta.airport.lat, eta.airport.lon
                            );
                            if (Number.isFinite(totalDist) && totalDist > 0) {
                                progressPct = Math.min(100, Math.max(0, (totalDist - eta.distance) / totalDist * 100));
                            }
                        }
                    }
                    progressBar.style.width = progressPct.toFixed(0) + '%';
                }
            } else {
                etaSection.style.display = 'none';
            }
        }
    };
    
