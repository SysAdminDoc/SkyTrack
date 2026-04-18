
    // CONFIG and DATA_URLS now live in src/modules/00-config.js (loaded first
    // by build.mjs). All downstream code references them at script scope.

    // Debug logging, escape helper, errorHandler, perfUtils,
    // and pausable-interval scaffolding now live in src/modules/10-utils.js.


    // Connection monitor, offline mode, data-source manager, auto-retry,
    // error recovery, and circuit breaker now live in src/modules/20-reliability.js.

    // IndexedDB storage (skytrackDB) now lives in src/modules/30-storage.js.


    // ============ ALERT SYSTEM ============
    const alertSystem = {
        enabled: true,
        soundEnabled: true,
        notificationsEnabled: false,
        watchlist: new Map(),
        alertHistory: new Set(),
        militaryAlertRadius: 50,
        userLocation: null,
        lastAlertTime: {},
        
        ALERT_TYPES: {
            EMERGENCY: { icon: '!', color: '#ef4444', sound: 'emergency', priority: 1, cooldown: 60000 },
            WATCHLIST: { icon: '*', color: '#ffd700', sound: 'chime', priority: 2, cooldown: 300000 },
            MILITARY: { icon: '#', color: '#4a90d9', sound: 'blip', priority: 3, cooldown: 600000 },
            INTERESTING: { icon: '+', color: '#a855f7', sound: 'soft', priority: 4, cooldown: 600000 }
        },
        
        async init() {
            // Load watchlist from IndexedDB, with localStorage as a belt-and-suspenders
            // fallback. Both parse paths have to tolerate corrupt/malformed payloads
            // without throwing — a bad entry here previously wedged the entire alert
            // subsystem and, transitively, squawk/military/watchlist notifications.
            const loadFromLs = () => {
                let parsed;
                try {
                    const ls = localStorage.getItem('skytrack_watchlist');
                    if (!ls) return;
                    parsed = JSON.parse(ls);
                } catch (_) { return; }
                if (!Array.isArray(parsed)) return;
                for (const item of parsed) {
                    const hex = item?.hex;
                    if (typeof hex !== 'string' || hex.length === 0) continue;
                    this.watchlist.set(hex.toUpperCase(), item);
                }
            };
            try {
                const saved = await skytrackDB.loadUserData('watchlist');
                if (Array.isArray(saved)) {
                    for (const item of saved) {
                        const hex = item?.hex;
                        if (typeof hex !== 'string' || hex.length === 0) continue;
                        this.watchlist.set(hex.toUpperCase(), item);
                    }
                } else {
                    loadFromLs();
                }
            } catch (_) {
                loadFromLs();
            }

            let settings = {};
            try {
                const raw = localStorage.getItem('skytrack_alert_settings');
                if (raw) settings = JSON.parse(raw) || {};
                if (typeof settings !== 'object' || settings === null) settings = {};
            } catch (_) { settings = {}; }
            this.enabled = settings.enabled !== false;
            this.soundEnabled = settings.soundEnabled !== false;
            this.militaryAlertRadius = Number.isFinite(settings.militaryAlertRadius) && settings.militaryAlertRadius > 0 ? settings.militaryAlertRadius : 50;
            this.notificationsEnabled = settings.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted';
            
            this.startLocationTracking();
            _dbg('Alert system initialized:', this.watchlist.size, 'watched aircraft');
            this.updateWatchlistUI();
        },
        
        async startLocationTracking() {
            // Guards:
            // 1. Require the browser to support geolocation
            // 2. Only track if military alerts are actually in use — no point in
            //    prompting otherwise.
            // 3. Don't trigger a permission prompt unless already granted. The
            //    previous implementation showed a permission prompt on every
            //    page load, which is noisy and a privacy smell.
            if (!navigator.geolocation) return;
            if (!(this.militaryAlertRadius > 0)) return;
            if (this._locationWatchId != null || this._locationInterval != null) return; // already tracking

            try {
                if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                    const res = await navigator.permissions.query({ name: 'geolocation' });
                    if (res.state !== 'granted') return;
                }
            } catch (_) { /* permissions API may not be available — fall through */ }

            const update = pos => {
                if (pos && pos.coords) {
                    this.userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                }
            };
            const fail = () => {}; // silent — user may have just revoked permission

            // Prefer watchPosition (event-driven) over polling on a timer.
            if (typeof navigator.geolocation.watchPosition === 'function') {
                try {
                    this._locationWatchId = navigator.geolocation.watchPosition(update, fail, {
                        enableHighAccuracy: false,
                        maximumAge: 60000,
                        timeout: 15000
                    });
                    return;
                } catch (_) { /* fall through to polling */ }
            }

            // Fallback: poll, keeping a handle so we can stop cleanly.
            navigator.geolocation.getCurrentPosition(update, fail, { enableHighAccuracy: false });
            this._locationInterval = setInterval(() => {
                navigator.geolocation.getCurrentPosition(update, fail, { enableHighAccuracy: false });
            }, 60000);
        },

        stopLocationTracking() {
            if (this._locationWatchId != null && navigator.geolocation?.clearWatch) {
                navigator.geolocation.clearWatch(this._locationWatchId);
                this._locationWatchId = null;
            }
            if (this._locationInterval != null) {
                clearInterval(this._locationInterval);
                this._locationInterval = null;
            }
        },
        
        async saveWatchlist() {
            const data = Array.from(this.watchlist.values());
            try {
                await skytrackDB.saveUserData('watchlist', data);
            } catch (e) {
                localStorage.setItem('skytrack_watchlist', JSON.stringify(data));
            }
        },
        
        saveSettings() {
            localStorage.setItem('skytrack_alert_settings', JSON.stringify({
                enabled: this.enabled,
                soundEnabled: this.soundEnabled,
                militaryAlertRadius: this.militaryAlertRadius,
                notificationsEnabled: this.notificationsEnabled
            }));
        },
        
        addToWatchlist(hex, name = '', notes = '') {
            const upperHex = hex.toUpperCase();
            const entry = { hex: upperHex, name: name || hex, notes, addedAt: Date.now() };
            this.watchlist.set(upperHex, entry);
            this.saveWatchlist();
            this.updateWatchlistUI();
            toast('Added to watchlist: ' + entry.name);
            return entry;
        },
        
        removeFromWatchlist(hex) {
            const upperHex = hex.toUpperCase();
            const entry = this.watchlist.get(upperHex);
            if (entry) {
                this.watchlist.delete(upperHex);
                this.saveWatchlist();
                this.updateWatchlistUI();
                toast('Removed: ' + entry.name);
            }
        },
        
        isWatched(hex) { return this.watchlist.has(hex?.toUpperCase()); },
        getWatchedEntry(hex) { return this.watchlist.get(hex?.toUpperCase()); },
        
        checkAircraft(ac) {
            if (!this.enabled || !ac?.hex) return;
            
            if (['7500', '7600', '7700'].includes(ac.squawk)) {
                this.triggerAlert(ac, 'EMERGENCY', this.getEmergencyMessage(ac.squawk));
            }
            
            if (this.isWatched(ac.hex)) {
                const entry = this.getWatchedEntry(ac.hex);
                this.triggerAlert(ac, 'WATCHLIST', entry.name + ' is active');
            }
            
            if (this.userLocation && this.militaryAlertRadius > 0) {
                if (ac.militaryInfo || ac.militaryRangeInfo) {
                    const distance = haversineDistance(this.userLocation.lat, this.userLocation.lon, ac.lat, ac.lon);
                    if (distance <= this.militaryAlertRadius) {
                        this.triggerAlert(ac, 'MILITARY', 'Military aircraft ' + Math.round(distance) + 'km away');
                    }
                }
            }
        },
        
        getEmergencyMessage(squawk) {
            switch (squawk) {
                case '7500': return 'HIJACK - Squawk 7500';
                case '7600': return 'RADIO FAILURE - Squawk 7600';
                case '7700': return 'EMERGENCY - Squawk 7700';
                default: return 'Emergency';
            }
        },
        
        triggerAlert(ac, type, message) {
            const alertType = this.ALERT_TYPES[type];
            const alertKey = type + '_' + ac.hex;
            const lastTime = this.lastAlertTime[alertKey] || 0;
            if (Date.now() - lastTime < alertType.cooldown) return;
            this.lastAlertTime[alertKey] = Date.now();
            const alert = {
                type, alertType, aircraft: ac, message,
                callsign: ac.flight?.trim() || ac.r || ac.hex,
                timestamp: Date.now()
            };
            this.showAlert(alert);
        },
        
        showAlert(alert) {
            this.showInAppNotification(alert);
            if (this.soundEnabled) this.playSound(alert.alertType.sound);
            if (this.notificationsEnabled) this.showBrowserNotification(alert);
        },
        
        showInAppNotification(alert) {
            let container = document.getElementById('alertContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'alertContainer';
                container.className = 'alert-container';
                document.body.appendChild(container);
            }
            
            const el = document.createElement('div');
            el.className = 'alert-notification';
            el.style.borderLeftColor = alert.alertType.color;
            el.innerHTML = '<div class="alert-icon" style="color:' + _escHtml(alert.alertType.color) + '">' + _escHtml(alert.alertType.icon) + '</div>' +
                '<div class="alert-body"><div class="alert-title">' + _escHtml(alert.callsign) + '</div><div class="alert-message">' + _escHtml(alert.message) + '</div></div>' +
                '<button class="alert-close">&times;</button>';
            
            el.querySelector('.alert-body').addEventListener('click', () => {
                selectAircraft(alert.aircraft.hex);
                el.remove();
            });
            el.querySelector('.alert-close').addEventListener('click', (e) => {
                e.stopPropagation();
                el.classList.add('dismissing');
                setTimeout(() => el.remove(), 200);
            });
            
            container.appendChild(el);
            setTimeout(() => {
                if (el.parentNode) {
                    el.classList.add('dismissing');
                    setTimeout(() => el.remove(), 200);
                }
            }, alert.type === 'EMERGENCY' ? 30000 : 10000);
        },
        
        playSound(type) {
            // Route through the shared AudioContext (10-utils.js). Previously we
            // built a fresh context per alert, and Chromium caps concurrent
            // contexts at ~6 — so after the first handful of alerts, audio went
            // silently dead for the rest of the session.
            const ctx = _sharedAudio();
            if (!ctx) return;
            try {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                switch (type) {
                    case 'emergency':
                        osc.frequency.setValueAtTime(880, ctx.currentTime);
                        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
                        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
                        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.45);
                        gain.gain.setValueAtTime(0.25, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.6);
                        break;
                    case 'chime':
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(523, ctx.currentTime);
                        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
                        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
                        gain.gain.setValueAtTime(0.15, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.4);
                        break;
                    case 'blip':
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(600, ctx.currentTime);
                        gain.gain.setValueAtTime(0.12, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.15);
                        break;
                    default:
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(440, ctx.currentTime);
                        gain.gain.setValueAtTime(0.08, ctx.currentTime);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                        osc.start(ctx.currentTime);
                        osc.stop(ctx.currentTime + 0.1);
                }
            } catch (e) {
                console.warn('Sound playback failed:', e);
            }
        },
        
        showBrowserNotification(alert) {
            if (Notification.permission !== 'granted') return;
            const notification = new Notification('SkyTrack: ' + alert.callsign, {
                body: alert.message,
                icon: 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/refs/heads/main/assets/logo/SkyTrack_Logo-128x128.png',
                tag: alert.aircraft.hex,
                requireInteraction: alert.type === 'EMERGENCY'
            });
            notification.onclick = () => {
                window.focus();
                selectAircraft(alert.aircraft.hex);
                notification.close();
            };
        },
        
        async requestNotificationPermission() {
            if (!('Notification' in window)) {
                toast('Notifications not supported');
                return false;
            }
            const permission = await Notification.requestPermission();
            this.notificationsEnabled = permission === 'granted';
            this.saveSettings();
            if (this.notificationsEnabled) {
                toast('Notifications enabled');
            } else {
                toast('Notification permission denied');
            }
            return this.notificationsEnabled;
        },
        
        updateWatchlistUI() {
            const container = document.getElementById('watchlistItems');
            const countEl = document.getElementById('watchlistCount');
            
            if (countEl) countEl.textContent = this.watchlist.size;
            if (!container) return;
            
            if (this.watchlist.size === 0) {
                container.innerHTML = '<div class="watchlist-empty">No watched aircraft yet<br><span>Select an aircraft and choose Watch to keep it close.</span></div>';
                return;
            }
            
            const items = Array.from(this.watchlist.values())
                .sort((a, b) => b.addedAt - a.addedAt)
                .map(entry => {
                    const ac = aircraftCache[entry.hex];
                    const isActive = !!ac;
                    const safeHex = _escHtml(entry.hex);
                    const safeName = _escHtml(entry.name);
                    return '<div class="watchlist-item ' + (isActive ? 'active' : '') + '" data-hex="' + safeHex + '">' +
                        '<div class="watchlist-info"><div class="watchlist-name">' + safeName + '</div>' +
                        '<div class="watchlist-hex">' + safeHex + (isActive ? ' · Live Now' : ' · Waiting') + '</div></div>' +
                        '<button class="watchlist-remove" data-hex="' + safeHex + '" title="Remove from Watchlist" aria-label="Remove ' + safeName + ' from Watchlist">×</button></div>';
                }).join('');
            
            container.innerHTML = items;
            
            container.querySelectorAll('.watchlist-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.classList.contains('watchlist-remove')) return;
                    const hex = el.dataset.hex;
                    if (aircraftCache[hex]) {
                        selectAircraft(hex);
                    } else {
                        toast('Aircraft not currently visible');
                    }
                });
            });
            
            container.querySelectorAll('.watchlist-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeFromWatchlist(btn.dataset.hex);
                });
            });
        }
    };

    // Weather system (METAR/TAF per-airport) now lives in src/modules/35-weather.js.


    // ============ AIRCRAFT DATA ENRICHMENT ============
    const aircraftDataEnricher = {
        // Calculate aircraft age from year
        getAge(year) {
            if (!year) return null;
            const currentYear = new Date().getFullYear();
            const age = currentYear - parseInt(year);
            if (age < 0 || age > 100) return null;
            return age;
        },
        
        formatAge(year) {
            const age = this.getAge(year);
            if (age === null) return null;
            if (age === 0) return 'New this year';
            if (age === 1) return '1 year old';
            return age + ' years old';
        },
        
        // Estimate fuel burn based on aircraft type and distance
        estimateFuelBurn(typeCode, distanceKm) {
            if (!typeCode || !distanceKm) return null;
            
            // Fuel burn rates in kg/km (approximate averages)
            const fuelRates = {
                // Widebody
                'A380': 13.0, 'B747': 11.5, 'B777': 8.5, 'B787': 6.5, 'A350': 6.2, 'A330': 7.0, 'A340': 8.5,
                // Narrowbody
                'A320': 3.0, 'A321': 3.2, 'A319': 2.8, 'A220': 2.4, 'B737': 3.0, 'B738': 3.0, 'B739': 3.2, 'B38M': 2.7,
                // Regional
                'E190': 2.5, 'E195': 2.6, 'E170': 2.3, 'CRJ9': 2.4, 'CRJ7': 2.2, 'AT72': 1.2, 'DH8D': 1.3,
                // Business jets
                'GLF5': 1.8, 'GLF6': 2.0, 'G650': 2.0, 'CL60': 1.5, 'C680': 1.2, 'C560': 0.9, 'LJ45': 0.8,
                // Props/GA
                'C172': 0.04, 'C182': 0.05, 'SR22': 0.06, 'PA28': 0.04, 'BE36': 0.06, 'PC12': 0.25, 'TBM9': 0.20
            };
            
            // Find matching rate
            const type = (typeCode || '').toUpperCase();
            let rate = null;
            
            for (const [key, value] of Object.entries(fuelRates)) {
                if (type.includes(key) || type.startsWith(key.substring(0, 3))) {
                    rate = value;
                    break;
                }
            }
            
            if (!rate) {
                // Default estimates by category
                if (type.startsWith('A3') || type.startsWith('B7')) rate = 7.0; // Widebody
                else if (type.startsWith('A') || type.startsWith('B')) rate = 3.0; // Narrowbody
                else if (type.startsWith('E') || type.startsWith('CRJ')) rate = 2.4; // Regional
                else if (type.match(/^(G|CL|C[5-7]|LJ|FA)/)) rate = 1.2; // Bizjet
                else rate = 0.1; // Small GA
            }
            
            const fuelKg = distanceKm * rate;
            return {
                fuelKg: Math.round(fuelKg),
                fuelGal: Math.round(fuelKg / 3.04), // Jet-A density
                fuelLiters: Math.round(fuelKg / 0.8)
            };
        },
        
        // Estimate CO2 emissions
        estimateCO2(fuelKg) {
            if (!fuelKg) return null;
            // 1 kg jet fuel = ~3.16 kg CO2
            return Math.round(fuelKg * 3.16);
        },
        
        // Estimate flight time
        estimateFlightTime(distanceKm, typeCode, currentSpeed) {
            if (!distanceKm) return null;
            
            // Use current speed if available, otherwise estimate by type
            let avgSpeed = currentSpeed;
            
            if (!avgSpeed) {
                const type = (typeCode || '').toUpperCase();
                if (type.match(/^(A38|B74|B77|B78|A35|A33|A34)/)) avgSpeed = 490; // Widebody
                else if (type.match(/^(A3|B73|B38|A22)/)) avgSpeed = 450; // Narrowbody
                else if (type.match(/^(E1|E2|CRJ|AT|DH8)/)) avgSpeed = 380; // Regional
                else if (type.match(/^(G|CL|C[5-7]|LJ|FA)/)) avgSpeed = 480; // Bizjet
                else if (type.match(/^(H|EC|A1|R[246]|S7|B4)/)) avgSpeed = 140; // Helicopter
                else avgSpeed = 250; // Default (prop/GA)
            }
            
            // Convert to hours
            const hours = (distanceKm * 0.539957) / avgSpeed; // km to nm, divide by knots
            return {
                hours: hours,
                formatted: this.formatDuration(hours * 60)
            };
        },
        
        formatDuration(minutes) {
            if (!minutes || minutes < 0) return null;
            const h = Math.floor(minutes / 60);
            const m = Math.round(minutes % 60);
            if (h === 0) return m + 'm';
            return h + 'h ' + m + 'm';
        },
        
        // Calculate flight progress
        calculateProgress(ac, fromAirport, toAirport) {
            // Mirror the hardening applied to flightTracker.calculateProgress:
            // `ac?.lat` is falsy at the equator (0°), and haversine inputs may
            // arrive as strings from airport DB rows. Validate every coord so
            // the info panel doesn't render `NaN km`/`Infinity%`.
            if (!ac || !fromAirport || !toAirport) return null;
            if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) return null;
            const fLat = parseFloat(fromAirport.lat);
            const fLon = parseFloat(fromAirport.lon);
            const tLat = parseFloat(toAirport.lat);
            const tLon = parseFloat(toAirport.lon);
            if (![fLat, fLon, tLat, tLon].every(Number.isFinite)) return null;

            const totalDist = haversineDistance(fLat, fLon, tLat, tLon);
            if (!Number.isFinite(totalDist) || totalDist <= 0) return null;
            const fromDist = haversineDistance(fLat, fLon, ac.lat, ac.lon);
            const toDist = haversineDistance(ac.lat, ac.lon, tLat, tLon);

            const progress = Math.min(100, Math.max(0, (fromDist / totalDist) * 100));

            return {
                progress: Math.round(progress),
                distanceFlown: Math.round(fromDist),
                distanceRemaining: Math.round(toDist),
                totalDistance: Math.round(totalDist)
            };
        },
        
        // Get military unit info
        getMilitaryInfo(ac) {
            if (!ac.militaryInfo && !ac.militaryRangeInfo) return null;
            
            const info = ac.militaryInfo || {};
            const rangeInfo = ac.militaryRangeInfo || {};
            
            return {
                branch: info.category || rangeInfo.country || 'Military',
                operator: info.operator || '',
                type: info.type || ac.t || '',
                description: info.description || info.tag || ''
            };
        }
    };

    // Helper function to fetch with automatic failover
    async function fetchWithFailover(urlConfig, options = {}) {
        const urls = typeof urlConfig === 'string' 
            ? [urlConfig] 
            : [urlConfig.primary, urlConfig.fallback].filter(Boolean);
        
        for (const url of urls) {
            try {
                const isGzipped = url.endsWith('.gz');
                const resp = await fetch(url, options);
                
                if (!resp.ok) {
                    console.warn('Fetch failed for ' + url + ': HTTP ' + resp.status);
                    continue;
                }
                
                if (isGzipped) {
                    try {
                        const buffer = await resp.arrayBuffer();
                        const decompressed = pako.inflate(new Uint8Array(buffer), { to: 'string' });
                        return { ok: true, text: () => Promise.resolve(decompressed), json: () => Promise.resolve(JSON.parse(decompressed)), url };
                    } catch (e) {
                        console.warn('Decompression failed for ' + url + ':', e);
                        continue;
                    }
                }
                
                return { ok: true, resp, url, text: () => resp.text(), json: () => resp.json() };
            } catch (e) {
                console.warn('Fetch error for ' + url + ':', e.message);
                continue;
            }
        }
        
        return { ok: false };
    }

    // ============ CATEGORIES DATABASE (v3.3) ============
    const categoriesDB = {
        categories: new Map(),
        loaded: false,
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.categories);
                if (!result.ok) return false;
                const text = await result.text();
                this.parseCSV(text);
                this.loaded = true;
                _dbg('Categories DB loaded from', result.url?.includes('SysAdminDoc') ? 'self-hosted' : 'fallback');
                return true;
            } catch (e) { console.warn('Categories DB failed:', e); return false; }
        },
        parseCSV(text) {
            const lines = text.trim().split('\n').slice(1);
            for (const line of lines) {
                const match = line.match(/^"?([^",]+)"?,\s*"?([^"]+)"?,?\s*(\d+)?/);
                if (match) {
                    const category = match[1].trim(), description = match[2].trim(), count = parseInt(match[3]) || 0;
                    this.categories.set(category.toLowerCase(), { name: category, description, count, color: this.getCategoryColor(category) });
                }
            }
        },
        getCategoryColor(category) {
            const colorMap = {
                'usaf': '#DC2626', 'raf': '#B91C1C', 'gaf': '#991B1B', 'united states navy': '#1E40AF', 'united states marine corps': '#1E3A8A',
                'other air forces': '#EF4444', 'gunship': '#7F1D1D', 'zoomies': '#F97316', 'special forces': '#4B5563',
                'governments': '#2563EB', 'dictator alert': '#7C3AED', 'oligarch': '#A855F7', 'quango': '#6366F1',
                'police forces': '#3B82F6', 'coastguard': '#0EA5E9', 'flying doctors': '#EC4899', 'aerial firefighter': '#F59E0B',
                'historic': '#84CC16', 'distinctive': '#22C55E', 'joe cool': '#10B981', 'bizjets': '#14B8A6', 'gas bags': '#06B6D4',
                'oxcart': '#8B5CF6', 'uav': '#A78BFA', 'pia': '#C084FC',
                'as seen on tv': '#F472B6', "don't you know who i am?": '#FB7185', 'aerobatic teams': '#FB923C', 'football': '#34D399',
                'royal aircraft': '#F59E0B', 'radiohead': '#DC2626', 'cap': '#60A5FA'
            };
            return colorMap[category.toLowerCase()] || '#6B7280';
        },
        getCategory(categoryName) { if (!categoryName) return null; return this.categories.get(categoryName.toLowerCase()); },
        getDescription(categoryName) { const cat = this.getCategory(categoryName); return cat ? cat.description : null; },
        getColor(categoryName) { const cat = this.getCategory(categoryName); return cat ? cat.color : this.getCategoryColor(categoryName); }
    };

    // ============ BADGER'S BEST (VIP) DATABASE (v3.3) ============
    const badgersBestDB = {
        aircraft: new Map(),
        loaded: false,
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.badgersBest);
                if (!result.ok) return false;
                const text = await result.text();
                this.parseCSV(text);
                this.loaded = true;
                _dbg("Badger's Best DB loaded:", this.aircraft.size, 'VIP aircraft');
                return true;
            } catch (e) { console.warn("Badger's Best DB failed:", e); return false; }
        },
        parseCSV(text) {
            const lines = text.trim().split('\n').slice(1);
            for (const line of lines) {
                const parts = this.parseLine(line);
                if (parts.length >= 5) {
                    const hex = parts[0].replace(/[$"]/g, '').trim().toUpperCase();
                    if (hex && /^[A-F0-9]{6}$/i.test(hex)) {
                        this.aircraft.set(hex, {
                            registration: parts[1]?.replace(/"/g, '').trim() || '',
                            operator: parts[2]?.replace(/"/g, '').trim() || '',
                            type: parts[3]?.replace(/"/g, '').trim() || '',
                            typeCode: parts[4]?.replace(/"/g, '').trim() || '',
                            category: parts[9]?.replace(/"/g, '').trim() || 'VIP',
                            link: parts[10]?.replace(/"/g, '').trim() || ''
                        });
                    }
                }
            }
        },
        parseLine(line) { const result = []; let current = '', inQuotes = false; for (const char of line) { if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current); current = ''; } else current += char; } result.push(current); return result; },
        isVIP(hex) { return this.aircraft.has(hex?.toUpperCase()); },
        getByHex(hex) { return this.aircraft.get(hex?.toUpperCase()); }
    };

    // ============ CIVILIAN INTERESTING DATABASE (v3.3) ============
    const civilianDB = {
        aircraft: new Map(),
        loaded: false,
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.civilianInteresting);
                if (!result.ok) return false;
                const text = await result.text();
                this.parseCSV(text);
                this.loaded = true;
                _dbg('Civilian Interesting DB loaded:', this.aircraft.size, 'aircraft');
                return true;
            } catch (e) { console.warn('Civilian Interesting DB failed:', e); return false; }
        },
        parseCSV(text) {
            const lines = text.trim().split('\n').slice(1);
            for (const line of lines) {
                const parts = this.parseLine(line);
                if (parts.length >= 5) {
                    const hex = parts[0].replace(/[$"]/g, '').trim().toUpperCase();
                    if (hex && /^[A-F0-9]{6}$/i.test(hex)) {
                        this.aircraft.set(hex, {
                            registration: parts[1]?.replace(/"/g, '').trim() || '',
                            operator: parts[2]?.replace(/"/g, '').trim() || '',
                            type: parts[3]?.replace(/"/g, '').trim() || '',
                            typeCode: parts[4]?.replace(/"/g, '').trim() || '',
                            category: parts[9]?.replace(/"/g, '').trim() || 'Civilian',
                            link: parts[10]?.replace(/"/g, '').trim() || ''
                        });
                    }
                }
            }
        },
        parseLine(line) { const result = []; let current = '', inQuotes = false; for (const char of line) { if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current); current = ''; } else current += char; } result.push(current); return result; },
        getByHex(hex) { return this.aircraft.get(hex?.toUpperCase()); },
        isCivilianInteresting(hex) { return this.aircraft.has(hex?.toUpperCase()); }
    };

    // ============ FAST AIRPORT COORDINATES (v3.3) ============
    const airportCoordsDB = {
        airports: new Map(),
        loaded: false,
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.airportCoords);
                if (!result.ok) return false;
                const data = await result.json();
                for (const [code, coords] of Object.entries(data)) {
                    if (Array.isArray(coords) && coords.length >= 2) {
                        this.airports.set(code.toUpperCase(), { lat: coords[0], lon: coords[1] });
                    }
                }
                this.loaded = true;
                _dbg('Airport Coords DB loaded:', this.airports.size, 'airports');
                return true;
            } catch (e) { console.warn('Airport Coords DB failed:', e); return false; }
        },
        getCoords(icao) { return this.airports.get(icao?.toUpperCase()); },
        findNearest(lat, lon, maxDistKm = 50) {
            let nearest = null, nearestDist = Infinity;
            for (const [code, coords] of this.airports) {
                const dist = this.quickDistance(lat, lon, coords.lat, coords.lon);
                if (dist < nearestDist && dist <= maxDistKm) { nearestDist = dist; nearest = { code, ...coords, distance: dist }; }
            }
            return nearest;
        },
        quickDistance(lat1, lon1, lat2, lon2) { const R = 6371, x = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2 * Math.PI / 180), y = lat2 - lat1; return Math.sqrt(x * x + y * y) * R * Math.PI / 180; }
    };

    // ============ PRELOADED IMAGES DATABASE (v3.3) ============
    const preloadedImagesDB = {
        images: new Map(),
        loaded: false,
        async init() {
            const sources = [DATA_URLS.planeImages, DATA_URLS.militaryImages, DATA_URLS.governmentImages, DATA_URLS.policeImages, DATA_URLS.civilianImages];
            for (const urlConfig of sources) {
                try {
                    const result = await fetchWithFailover(urlConfig);
                    if (result.ok) {
                        const text = await result.text();
                        this.parseCSV(text);
                    }
                } catch (e) { /* continue */ }
            }
            this.loaded = true;
            _dbg('Preloaded Images DB loaded:', this.images.size, 'aircraft with images');
            return true;
        },
        parseCSV(text) {
            const lines = text.trim().split('\n').slice(1);
            for (const line of lines) {
                const parts = line.split(',');
                const hex = parts[0]?.replace(/[$"]/g, '').trim().toUpperCase();
                if (hex && /^[A-F0-9]{6}$/i.test(hex)) {
                    const urls = [];
                    for (let i = 1; i < parts.length && i <= 4; i++) {
                        const url = parts[i]?.replace(/"/g, '').trim();
                        if (url && (url.startsWith('http') || url.startsWith('//'))) urls.push(url);
                    }
                    if (urls.length > 0) {
                        const existing = this.images.get(hex);
                        this.images.set(hex, existing ? [...new Set([...existing, ...urls])].slice(0, 4) : urls);
                    }
                }
            }
        },
        getImages(hex) { return this.images.get(hex?.toUpperCase()) || []; },
        getFirstImage(hex) { const images = this.getImages(hex); return images.length > 0 ? images[0] : null; },
        hasImage(hex) { return this.images.has(hex?.toUpperCase()); }
    };
    
    // ============ AIRPORT DATABASE ============
    const airportDB = {
        airports: new Map(), iataIndex: new Map(), loaded: false,
        async init() {
            // Try IndexedDB first
            try {
                const cached = await skytrackDB.loadDatabase('airports');
                if (cached) {
                    this.loadFromData(cached);
                    _dbg('Loaded', this.airports.size, 'airports from IndexedDB');
                    return true;
                }
            } catch (e) {}
            
            // Fallback to localStorage
            const lsCached = localStorage.getItem('skytrack_airports_v3');
            if (lsCached) {
                try {
                    const data = JSON.parse(lsCached);
                    if (Date.now() - data.ts < 86400000) {
                        this.loadFromData(data.airports);
                        return true;
                    }
                } catch(e) {}
            }
            
            try {
                const result = await fetchWithFailover(DATA_URLS.airports);
                if (result.ok) {
                    const csv = await result.text();
                    this.parseCSV(csv);
                    await this.saveToCache();
                    return true;
                }
            } catch(e) { console.error('Airport DB failed:', e); }
            return false;
        },
        parseCSV(csv) {
            const lines = csv.split('\n'), headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i]); if (values.length < headers.length) continue;
                const apt = {}; headers.forEach((h, idx) => { apt[h] = values[idx]; });
                if (!apt.ident || !apt.latitude_deg || !apt.longitude_deg) continue;
                if (apt.type === 'closed' || apt.type === 'heliport') continue;
                const airport = { icao: apt.ident, iata: apt.iata_code || '', name: apt.name || '', lat: parseFloat(apt.latitude_deg), lon: parseFloat(apt.longitude_deg), elevation: parseInt(apt.elevation_ft) || 0, country: apt.iso_country || '', city: apt.municipality || '', type: apt.type || '', wiki: apt.wikipedia_link || '', isMilitary: this.checkMilitary(apt.name) };
                this.airports.set(apt.ident, airport); if (apt.iata_code) this.iataIndex.set(apt.iata_code, apt.ident);
            }
            this.loaded = true; _dbg('Loaded ' + this.airports.size + ' airports');
        },
        parseCSVLine(line) { const result = []; let current = '', inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += char; } result.push(current.trim()); return result; },
        checkMilitary(name) { if (!name) return false; const n = name.toUpperCase(); return n.includes('AIR FORCE BASE') || n.includes(' AFB') || n.includes('NAVAL AIR') || n.includes(' NAS ') || n.includes('MCAS ') || n.includes('MARINE CORPS') || n.includes(' RAF ') || n.includes('MILITARY') || n.includes('AIR BASE'); },
        loadFromData(data) { data.forEach(apt => { this.airports.set(apt.icao, apt); if (apt.iata) this.iataIndex.set(apt.iata, apt.icao); }); this.loaded = true; },
        async saveToCache() {
            const data = Array.from(this.airports.values());
            try {
                await skytrackDB.saveDatabase('airports', data, 86400000);
            } catch (e) {
                // Fallback to localStorage
                try { localStorage.setItem('skytrack_airports_v3', JSON.stringify({ ts: Date.now(), airports: data })); } catch(e2) {}
            }
        },
        getByICAO(icao) { return this.airports.get(icao); },
        getByIATA(iata) { const icao = this.iataIndex.get(iata); return icao ? this.airports.get(icao) : null; },
        getByCode(code) { if (!code) return null; code = code.toUpperCase(); return this.getByICAO(code) || this.getByIATA(code); },
        findNearby(lat, lon, radiusKm = 15) { const results = [], latDeg = radiusKm / 111, lonDeg = radiusKm / (111 * Math.cos(lat * Math.PI / 180)); this.airports.forEach(apt => { if (Math.abs(apt.lat - lat) < latDeg && Math.abs(apt.lon - lon) < lonDeg) { const dist = haversineDistance(lat, lon, apt.lat, apt.lon); if (dist < radiusKm) results.push({ ...apt, distance: dist }); } }); return results.sort((a, b) => a.distance - b.distance); },
        findInBounds(bounds) { const results = [], sw = bounds.getSouthWest(), ne = bounds.getNorthEast(); this.airports.forEach(apt => { if (apt.lat >= sw.lat && apt.lat <= ne.lat && apt.lon >= sw.lng && apt.lon <= ne.lng) results.push(apt); }); return results; }
    };

    // ============ AIRCRAFT REGISTRATION DATABASE ============
    const registrationDB = {
        aircraft: new Map(), loaded: false, loading: false,
        async init() {
            // Try IndexedDB first (can store larger data)
            try {
                const cached = await skytrackDB.loadDatabase('registrations');
                if (cached) {
                    this.loadFromData(cached);
                    _dbg('Loaded', this.aircraft.size, 'registrations from IndexedDB');
                    return true;
                }
            } catch (e) {
                console.warn('IndexedDB load failed, trying localStorage:', e);
            }
            
            // Fallback to localStorage
            const lsCached = localStorage.getItem('skytrack_registrations_v1');
            if (lsCached) {
                try {
                    const data = JSON.parse(lsCached);
                    if (Date.now() - data.ts < 86400000) {
                        this.loadFromData(data.aircraft);
                        _dbg('Loaded', this.aircraft.size, 'registrations from localStorage');
                        return true;
                    }
                } catch (e) {}
            }
            
            return this.fetchFromSource();
        },
        async fetchFromSource() {
            if (this.loading) return false;
            this.loading = true;
            try {
                const result = await fetchWithFailover(DATA_URLS.registrations);
                if (!result.ok) throw new Error('All sources failed');
                const data = await result.json();
                this.loadFromData(data);
                
                // Save to IndexedDB (can handle larger data)
                try {
                    await skytrackDB.saveDatabase('registrations', data, 86400000);
                    _dbg('Saved registrations to IndexedDB');
                } catch (e) {
                    // Fallback to localStorage
                    this.saveToLocalStorage(data);
                }
                
                _dbg('Loaded', this.aircraft.size, 'registrations from', result.url?.includes('SysAdminDoc') ? 'self-hosted' : 'fallback');
                return true;
            }
            catch(e) { console.warn('Registration DB failed:', e); return false; }
            finally { this.loading = false; }
        },
        loadFromData(data) {
            if (data instanceof Map) {
                this.aircraft = data;
            } else {
                this.aircraft.clear();
                Object.entries(data).forEach(([hex, info]) => {
                    this.aircraft.set(hex.toUpperCase(), info);
                });
            }
            this.loaded = true;
        },
        saveToLocalStorage(data) {
            try {
                const str = JSON.stringify({ ts: Date.now(), aircraft: data });
                if (str.length < 5000000) {
                    localStorage.setItem('skytrack_registrations_v1', str);
                }
            } catch(e) { console.warn('Could not cache registrations:', e); }
        },
        getByHex(hex) { if (!hex) return null; return this.aircraft.get(hex.toUpperCase()) || null; },
        enrich(ac) { if (!ac?.hex) return ac; const regData = this.getByHex(ac.hex); if (regData) { if (!ac.r && regData.r) ac.r = regData.r; if (!ac.t && regData.t) ac.t = regData.t; if (!ac.desc && regData.d) ac.desc = regData.d; if (!ac.ownOp && regData.o) ac.ownOp = regData.o; if (!ac.year && regData.y) ac.year = regData.y; } return ac; }
    };

    // ============ AIRCRAFT TYPE DATABASE ============
    const aircraftTypeDB = {
        types: new Map(), loaded: false,
        fallbackSpecs: {
            // Boeing Narrowbody
            'B731': { manufacturer: 'Boeing', model: '737-100', engines: '2x JT8D', wingspan: '28.4m', length: '28.6m', range: '2850km', speed: '780km/h', pax: '101' },
            'B732': { manufacturer: 'Boeing', model: '737-200', engines: '2x JT8D', wingspan: '28.4m', length: '30.5m', range: '4200km', speed: '780km/h', pax: '115-130' },
            'B733': { manufacturer: 'Boeing', model: '737-300', engines: '2x CFM56', wingspan: '28.9m', length: '33.4m', range: '4400km', speed: '800km/h', pax: '128-149' },
            'B734': { manufacturer: 'Boeing', model: '737-400', engines: '2x CFM56', wingspan: '28.9m', length: '36.4m', range: '5000km', speed: '800km/h', pax: '146-168' },
            'B735': { manufacturer: 'Boeing', model: '737-500', engines: '2x CFM56', wingspan: '28.9m', length: '31.0m', range: '5200km', speed: '800km/h', pax: '108-132' },
            'B736': { manufacturer: 'Boeing', model: '737-600', engines: '2x CFM56', wingspan: '34.3m', length: '31.2m', range: '5648km', speed: '823km/h', pax: '108-132' },
            'B737': { manufacturer: 'Boeing', model: '737-700', engines: '2x CFM56', wingspan: '34.3m', length: '33.6m', range: '6370km', speed: '823km/h', pax: '126-149' },
            'B738': { manufacturer: 'Boeing', model: '737-800', engines: '2x CFM56', wingspan: '35.8m', length: '39.5m', range: '5765km', speed: '842km/h', pax: '162-189' },
            'B739': { manufacturer: 'Boeing', model: '737-900', engines: '2x CFM56', wingspan: '35.8m', length: '42.1m', range: '5925km', speed: '842km/h', pax: '177-220' },
            'B37M': { manufacturer: 'Boeing', model: '737 MAX 7', engines: '2x LEAP-1B', wingspan: '35.9m', length: '35.6m', range: '7130km', speed: '839km/h', pax: '138-172' },
            'B38M': { manufacturer: 'Boeing', model: '737 MAX 8', engines: '2x LEAP-1B', wingspan: '35.9m', length: '39.5m', range: '6570km', speed: '839km/h', pax: '162-210' },
            'B39M': { manufacturer: 'Boeing', model: '737 MAX 9', engines: '2x LEAP-1B', wingspan: '35.9m', length: '42.1m', range: '6570km', speed: '839km/h', pax: '178-220' },
            'B3XM': { manufacturer: 'Boeing', model: '737 MAX 10', engines: '2x LEAP-1B', wingspan: '35.9m', length: '43.8m', range: '5920km', speed: '839km/h', pax: '188-230' },
            // Boeing 757
            'B752': { manufacturer: 'Boeing', model: '757-200', engines: '2x RB211/PW2000', wingspan: '38.1m', length: '47.3m', range: '7250km', speed: '850km/h', pax: '200-239' },
            'B753': { manufacturer: 'Boeing', model: '757-300', engines: '2x RB211/PW2000', wingspan: '38.1m', length: '54.4m', range: '6421km', speed: '850km/h', pax: '243-295' },
            'B75F': { manufacturer: 'Boeing', model: '757-200F', engines: '2x RB211/PW2000', wingspan: '38.1m', length: '47.3m', range: '5834km', speed: '850km/h', pax: 'Freighter' },
            // Boeing 767
            'B762': { manufacturer: 'Boeing', model: '767-200', engines: '2x CF6/PW4000', wingspan: '47.6m', length: '48.5m', range: '7200km', speed: '851km/h', pax: '181-255' },
            'B763': { manufacturer: 'Boeing', model: '767-300', engines: '2x CF6/PW4000', wingspan: '47.6m', length: '54.9m', range: '9700km', speed: '851km/h', pax: '218-351' },
            'B764': { manufacturer: 'Boeing', model: '767-400ER', engines: '2x CF6', wingspan: '51.9m', length: '61.4m', range: '10415km', speed: '851km/h', pax: '245-375' },
            'B76F': { manufacturer: 'Boeing', model: '767-300F', engines: '2x CF6/PW4000', wingspan: '47.6m', length: '54.9m', range: '6025km', speed: '851km/h', pax: 'Freighter' },
            // Boeing 777
            'B772': { manufacturer: 'Boeing', model: '777-200', engines: '2x GE90/PW4000/Trent', wingspan: '60.9m', length: '63.7m', range: '9700km', speed: '905km/h', pax: '305-440' },
            'B773': { manufacturer: 'Boeing', model: '777-300', engines: '2x GE90/PW4000/Trent', wingspan: '60.9m', length: '73.9m', range: '11135km', speed: '905km/h', pax: '368-550' },
            'B77L': { manufacturer: 'Boeing', model: '777-200LR', engines: '2x GE90-115B', wingspan: '64.8m', length: '63.7m', range: '15843km', speed: '905km/h', pax: '301-440' },
            'B77W': { manufacturer: 'Boeing', model: '777-300ER', engines: '2x GE90-115B', wingspan: '64.8m', length: '73.9m', range: '13650km', speed: '905km/h', pax: '365-550' },
            'B77F': { manufacturer: 'Boeing', model: '777F', engines: '2x GE90-110B', wingspan: '64.8m', length: '63.7m', range: '9200km', speed: '896km/h', pax: 'Freighter' },
            'B778': { manufacturer: 'Boeing', model: '777-8', engines: '2x GE9X', wingspan: '71.8m', length: '69.8m', range: '16170km', speed: '905km/h', pax: '350-395' },
            'B779': { manufacturer: 'Boeing', model: '777-9', engines: '2x GE9X', wingspan: '71.8m', length: '76.7m', range: '13940km', speed: '905km/h', pax: '400-426' },
            // Boeing 787 Dreamliner
            'B788': { manufacturer: 'Boeing', model: '787-8', engines: '2x GEnx/Trent 1000', wingspan: '60.1m', length: '56.7m', range: '13621km', speed: '903km/h', pax: '242-359' },
            'B789': { manufacturer: 'Boeing', model: '787-9', engines: '2x GEnx/Trent 1000', wingspan: '60.1m', length: '62.8m', range: '14140km', speed: '903km/h', pax: '290-420' },
            'B78X': { manufacturer: 'Boeing', model: '787-10', engines: '2x GEnx/Trent 1000', wingspan: '60.1m', length: '68.3m', range: '11910km', speed: '903km/h', pax: '330-440' },
            // Boeing Widebody Legacy
            'B742': { manufacturer: 'Boeing', model: '747-200', engines: '4x JT9D/CF6/RB211', wingspan: '59.6m', length: '70.7m', range: '12700km', speed: '907km/h', pax: '366-550' },
            'B743': { manufacturer: 'Boeing', model: '747-300', engines: '4x JT9D/CF6/RB211', wingspan: '59.6m', length: '70.7m', range: '12400km', speed: '907km/h', pax: '400-608' },
            'B744': { manufacturer: 'Boeing', model: '747-400', engines: '4x CF6/PW4000/RB211', wingspan: '64.4m', length: '70.7m', range: '13450km', speed: '913km/h', pax: '416-660' },
            'B748': { manufacturer: 'Boeing', model: '747-8', engines: '4x GEnx-2B67', wingspan: '68.4m', length: '76.3m', range: '14320km', speed: '920km/h', pax: '410-605' },
            'B74F': { manufacturer: 'Boeing', model: '747-400F', engines: '4x CF6/PW4000/RB211', wingspan: '64.4m', length: '70.7m', range: '8230km', speed: '913km/h', pax: 'Freighter' },
            // Airbus Narrowbody
            'A318': { manufacturer: 'Airbus', model: 'A318', engines: '2x CFM56/PW6000', wingspan: '34.1m', length: '31.4m', range: '5750km', speed: '829km/h', pax: '107-132' },
            'A319': { manufacturer: 'Airbus', model: 'A319', engines: '2x CFM56/V2500', wingspan: '35.8m', length: '33.8m', range: '6850km', speed: '829km/h', pax: '124-156' },
            'A320': { manufacturer: 'Airbus', model: 'A320', engines: '2x CFM56/V2500', wingspan: '35.8m', length: '37.6m', range: '6100km', speed: '840km/h', pax: '150-180' },
            'A321': { manufacturer: 'Airbus', model: 'A321', engines: '2x CFM56/V2500', wingspan: '35.8m', length: '44.5m', range: '5930km', speed: '840km/h', pax: '185-236' },
            'A19N': { manufacturer: 'Airbus', model: 'A319neo', engines: '2x LEAP-1A/PW1100G', wingspan: '35.8m', length: '33.8m', range: '6850km', speed: '828km/h', pax: '120-160' },
            'A20N': { manufacturer: 'Airbus', model: 'A320neo', engines: '2x LEAP-1A/PW1100G', wingspan: '35.8m', length: '37.6m', range: '6500km', speed: '833km/h', pax: '150-194' },
            'A21N': { manufacturer: 'Airbus', model: 'A321neo', engines: '2x LEAP-1A/PW1100G', wingspan: '35.8m', length: '44.5m', range: '7400km', speed: '833km/h', pax: '180-244' },
            // Airbus Widebody
            'A332': { manufacturer: 'Airbus', model: 'A330-200', engines: '2x CF6/PW4000/Trent', wingspan: '60.3m', length: '59.0m', range: '13450km', speed: '871km/h', pax: '247-406' },
            'A333': { manufacturer: 'Airbus', model: 'A330-300', engines: '2x CF6/PW4000/Trent', wingspan: '60.3m', length: '63.7m', range: '11750km', speed: '871km/h', pax: '277-440' },
            'A338': { manufacturer: 'Airbus', model: 'A330-800neo', engines: '2x Trent 7000', wingspan: '64.0m', length: '58.8m', range: '15094km', speed: '871km/h', pax: '220-406' },
            'A339': { manufacturer: 'Airbus', model: 'A330-900neo', engines: '2x Trent 7000', wingspan: '64.0m', length: '63.7m', range: '13334km', speed: '871km/h', pax: '260-460' },
            'A342': { manufacturer: 'Airbus', model: 'A340-200', engines: '4x CFM56', wingspan: '60.3m', length: '59.4m', range: '14800km', speed: '871km/h', pax: '261-303' },
            'A343': { manufacturer: 'Airbus', model: 'A340-300', engines: '4x CFM56', wingspan: '60.3m', length: '63.7m', range: '13500km', speed: '871km/h', pax: '295-440' },
            'A345': { manufacturer: 'Airbus', model: 'A340-500', engines: '4x Trent 500', wingspan: '63.5m', length: '67.9m', range: '16670km', speed: '871km/h', pax: '313-375' },
            'A346': { manufacturer: 'Airbus', model: 'A340-600', engines: '4x Trent 500', wingspan: '63.5m', length: '75.4m', range: '14600km', speed: '871km/h', pax: '380-475' },
            'A359': { manufacturer: 'Airbus', model: 'A350-900', engines: '2x Trent XWB-84', wingspan: '64.8m', length: '66.8m', range: '15000km', speed: '903km/h', pax: '300-440' },
            'A35K': { manufacturer: 'Airbus', model: 'A350-1000', engines: '2x Trent XWB-97', wingspan: '64.8m', length: '73.8m', range: '16100km', speed: '903km/h', pax: '350-480' },
            'A388': { manufacturer: 'Airbus', model: 'A380-800', engines: '4x Trent 900/GP7200', wingspan: '79.8m', length: '72.7m', range: '14800km', speed: '903km/h', pax: '525-853' },
            // Embraer
            'E135': { manufacturer: 'Embraer', model: 'ERJ-135', engines: '2x AE3007', wingspan: '20.0m', length: '26.3m', range: '3019km', speed: '833km/h', pax: '37' },
            'E145': { manufacturer: 'Embraer', model: 'ERJ-145', engines: '2x AE3007', wingspan: '20.0m', length: '29.9m', range: '2873km', speed: '833km/h', pax: '50' },
            'E170': { manufacturer: 'Embraer', model: 'E170', engines: '2x CF34-8E', wingspan: '26.0m', length: '29.9m', range: '3889km', speed: '870km/h', pax: '66-78' },
            'E175': { manufacturer: 'Embraer', model: 'E175', engines: '2x CF34-8E', wingspan: '28.7m', length: '31.7m', range: '3704km', speed: '870km/h', pax: '76-88' },
            'E190': { manufacturer: 'Embraer', model: 'E190', engines: '2x CF34-10E', wingspan: '28.7m', length: '36.2m', range: '4537km', speed: '870km/h', pax: '96-114' },
            'E195': { manufacturer: 'Embraer', model: 'E195', engines: '2x CF34-10E', wingspan: '28.7m', length: '38.7m', range: '4074km', speed: '870km/h', pax: '108-132' },
            'E290': { manufacturer: 'Embraer', model: 'E190-E2', engines: '2x PW1900G', wingspan: '33.7m', length: '36.2m', range: '5278km', speed: '870km/h', pax: '97-114' },
            'E295': { manufacturer: 'Embraer', model: 'E195-E2', engines: '2x PW1900G', wingspan: '35.1m', length: '41.5m', range: '4815km', speed: '870km/h', pax: '120-146' },
            // Bombardier/Canadair Regional Jets
            'CRJ1': { manufacturer: 'Bombardier', model: 'CRJ-100', engines: '2x CF34-3A', wingspan: '21.2m', length: '26.8m', range: '2491km', speed: '786km/h', pax: '50' },
            'CRJ2': { manufacturer: 'Bombardier', model: 'CRJ-200', engines: '2x CF34-3B', wingspan: '21.2m', length: '26.8m', range: '3148km', speed: '786km/h', pax: '50' },
            'CRJ7': { manufacturer: 'Bombardier', model: 'CRJ-700', engines: '2x CF34-8C1', wingspan: '23.2m', length: '32.3m', range: '3620km', speed: '829km/h', pax: '66-78' },
            'CRJ9': { manufacturer: 'Bombardier', model: 'CRJ-900', engines: '2x CF34-8C5', wingspan: '24.9m', length: '36.4m', range: '2876km', speed: '850km/h', pax: '76-90' },
            'CRJX': { manufacturer: 'Bombardier', model: 'CRJ-1000', engines: '2x CF34-8C5A1', wingspan: '26.2m', length: '39.1m', range: '2761km', speed: '850km/h', pax: '97-104' },
            // Bombardier/De Havilland Dash 8
            'DH8A': { manufacturer: 'De Havilland', model: 'Dash 8-100', engines: '2x PW120A', wingspan: '25.9m', length: '22.3m', range: '1889km', speed: '490km/h', pax: '37-39' },
            'DH8B': { manufacturer: 'De Havilland', model: 'Dash 8-200', engines: '2x PW123C', wingspan: '25.9m', length: '22.3m', range: '1713km', speed: '537km/h', pax: '37-39' },
            'DH8C': { manufacturer: 'De Havilland', model: 'Dash 8-300', engines: '2x PW123', wingspan: '27.4m', length: '25.7m', range: '1558km', speed: '528km/h', pax: '50-56' },
            'DH8D': { manufacturer: 'De Havilland', model: 'Dash 8-400', engines: '2x PW150A', wingspan: '28.4m', length: '32.8m', range: '2040km', speed: '667km/h', pax: '68-90' },
            // ATR
            'AT43': { manufacturer: 'ATR', model: 'ATR 42-300', engines: '2x PW120', wingspan: '24.6m', length: '22.7m', range: '1165km', speed: '556km/h', pax: '42-50' },
            'AT45': { manufacturer: 'ATR', model: 'ATR 42-500', engines: '2x PW127E', wingspan: '24.6m', length: '22.7m', range: '1326km', speed: '556km/h', pax: '42-50' },
            'AT46': { manufacturer: 'ATR', model: 'ATR 42-600', engines: '2x PW127M', wingspan: '24.6m', length: '22.7m', range: '1326km', speed: '556km/h', pax: '42-50' },
            'AT72': { manufacturer: 'ATR', model: 'ATR 72-200', engines: '2x PW124B', wingspan: '27.1m', length: '27.2m', range: '1324km', speed: '510km/h', pax: '64-74' },
            'AT75': { manufacturer: 'ATR', model: 'ATR 72-500', engines: '2x PW127F', wingspan: '27.1m', length: '27.2m', range: '1528km', speed: '510km/h', pax: '68-74' },
            'AT76': { manufacturer: 'ATR', model: 'ATR 72-600', engines: '2x PW127M', wingspan: '27.1m', length: '27.2m', range: '1528km', speed: '556km/h', pax: '68-78' },
            // Business Jets
            'C56X': { manufacturer: 'Cessna', model: 'Citation Excel/XLS', engines: '2x PW545', wingspan: '17.0m', length: '16.0m', range: '3889km', speed: '815km/h', pax: '8-12' },
            'C680': { manufacturer: 'Cessna', model: 'Citation Sovereign', engines: '2x PW306C', wingspan: '19.3m', length: '19.4m', range: '5463km', speed: '848km/h', pax: '9-12' },
            'C750': { manufacturer: 'Cessna', model: 'Citation X', engines: '2x AE3007C', wingspan: '19.5m', length: '22.0m', range: '5686km', speed: '972km/h', pax: '8-12' },
            'CL30': { manufacturer: 'Bombardier', model: 'Challenger 300', engines: '2x HTF7000', wingspan: '19.5m', length: '20.9m', range: '5926km', speed: '870km/h', pax: '8-16' },
            'CL35': { manufacturer: 'Bombardier', model: 'Challenger 350', engines: '2x HTF7350', wingspan: '21.0m', length: '20.9m', range: '5926km', speed: '870km/h', pax: '8-10' },
            'CL60': { manufacturer: 'Bombardier', model: 'Challenger 600', engines: '2x CF34-3A', wingspan: '19.6m', length: '20.9m', range: '6130km', speed: '870km/h', pax: '10-19' },
            'GL5T': { manufacturer: 'Bombardier', model: 'Global 5000', engines: '2x BR710', wingspan: '28.7m', length: '29.5m', range: '9630km', speed: '904km/h', pax: '13-17' },
            'GL7T': { manufacturer: 'Bombardier', model: 'Global 7500', engines: '2x Passport', wingspan: '31.7m', length: '33.8m', range: '14260km', speed: '904km/h', pax: '14-19' },
            'GLEX': { manufacturer: 'Bombardier', model: 'Global Express', engines: '2x BR710', wingspan: '28.7m', length: '29.5m', range: '11112km', speed: '904km/h', pax: '8-19' },
            'G280': { manufacturer: 'Gulfstream', model: 'G280', engines: '2x HTF7250G', wingspan: '19.0m', length: '20.3m', range: '6667km', speed: '850km/h', pax: '10' },
            'GLF4': { manufacturer: 'Gulfstream', model: 'G450', engines: '2x Tay 611-8C', wingspan: '23.7m', length: '27.2m', range: '8061km', speed: '850km/h', pax: '14-19' },
            'GLF5': { manufacturer: 'Gulfstream', model: 'G550', engines: '2x BR710', wingspan: '28.5m', length: '29.4m', range: '12501km', speed: '904km/h', pax: '14-19' },
            'GLF6': { manufacturer: 'Gulfstream', model: 'G650', engines: '2x BR725', wingspan: '30.4m', length: '30.4m', range: '12964km', speed: '956km/h', pax: '11-18' },
            'GL6T': { manufacturer: 'Gulfstream', model: 'G650ER', engines: '2x BR725', wingspan: '30.4m', length: '30.4m', range: '13890km', speed: '956km/h', pax: '11-18' },
            'FA7X': { manufacturer: 'Dassault', model: 'Falcon 7X', engines: '3x PW307A', wingspan: '26.2m', length: '23.4m', range: '11019km', speed: '900km/h', pax: '12-16' },
            'F8X': { manufacturer: 'Dassault', model: 'Falcon 8X', engines: '3x PW307D', wingspan: '26.3m', length: '24.5m', range: '11945km', speed: '900km/h', pax: '12-16' },
            'FA50': { manufacturer: 'Dassault', model: 'Falcon 50', engines: '3x TFE731', wingspan: '18.9m', length: '18.5m', range: '5695km', speed: '870km/h', pax: '8-9' },
            'F900': { manufacturer: 'Dassault', model: 'Falcon 900', engines: '3x TFE731', wingspan: '19.3m', length: '20.2m', range: '7408km', speed: '870km/h', pax: '12-14' },
            'E50P': { manufacturer: 'Embraer', model: 'Phenom 100', engines: '2x PW617F', wingspan: '12.3m', length: '12.8m', range: '2148km', speed: '722km/h', pax: '4-6' },
            'E55P': { manufacturer: 'Embraer', model: 'Phenom 300', engines: '2x PW535E', wingspan: '16.2m', length: '15.9m', range: '3334km', speed: '839km/h', pax: '6-10' },
            'E545': { manufacturer: 'Embraer', model: 'Legacy 450', engines: '2x HTF7500E', wingspan: '20.3m', length: '19.7m', range: '5556km', speed: '870km/h', pax: '7-9' },
            'E550': { manufacturer: 'Embraer', model: 'Legacy 500', engines: '2x HTF7500E', wingspan: '20.3m', length: '20.7m', range: '5788km', speed: '863km/h', pax: '8-12' },
            'E35L': { manufacturer: 'Embraer', model: 'Legacy 650', engines: '2x AE3007', wingspan: '21.2m', length: '26.3m', range: '7223km', speed: '834km/h', pax: '13-14' },
            // Cargo Aircraft
            'A30B': { manufacturer: 'Airbus', model: 'A300B4F', engines: '2x CF6/JT9D', wingspan: '44.8m', length: '54.1m', range: '5375km', speed: '833km/h', pax: 'Freighter' },
            'A306': { manufacturer: 'Airbus', model: 'A300-600F', engines: '2x CF6/PW4000', wingspan: '44.8m', length: '54.1m', range: '7500km', speed: '833km/h', pax: 'Freighter' },
            'A310': { manufacturer: 'Airbus', model: 'A310-300F', engines: '2x CF6/PW4000', wingspan: '43.9m', length: '46.7m', range: '8050km', speed: '850km/h', pax: 'Freighter' },
            'MD11': { manufacturer: 'McDonnell Douglas', model: 'MD-11', engines: '3x CF6/PW4000', wingspan: '51.7m', length: '61.2m', range: '12455km', speed: '876km/h', pax: '293-410' },
            'MD1F': { manufacturer: 'McDonnell Douglas', model: 'MD-11F', engines: '3x CF6/PW4000', wingspan: '51.7m', length: '61.2m', range: '7242km', speed: '876km/h', pax: 'Freighter' },
            'DC10': { manufacturer: 'McDonnell Douglas', model: 'DC-10', engines: '3x CF6', wingspan: '50.4m', length: '55.5m', range: '10622km', speed: '908km/h', pax: '250-380' },
            // Military Transport
            'C17': { manufacturer: 'Boeing', model: 'C-17 Globemaster III', engines: '4x F117-PW-100', wingspan: '51.7m', length: '53.0m', range: '4482km', speed: '833km/h', pax: 'Military Transport' },
            'C130': { manufacturer: 'Lockheed', model: 'C-130 Hercules', engines: '4x T56-A-15', wingspan: '40.4m', length: '29.8m', range: '3800km', speed: '592km/h', pax: 'Military Transport' },
            'C5': { manufacturer: 'Lockheed', model: 'C-5 Galaxy', engines: '4x TF39-GE-1C', wingspan: '67.9m', length: '75.3m', range: '4440km', speed: '833km/h', pax: 'Military Transport' },
            'C135': { manufacturer: 'Boeing', model: 'KC-135 Stratotanker', engines: '4x CFM56', wingspan: '39.9m', length: '41.5m', range: '2419km', speed: '853km/h', pax: 'Tanker' },
            'KC10': { manufacturer: 'McDonnell Douglas', model: 'KC-10 Extender', engines: '3x CF6-50C2', wingspan: '50.4m', length: '55.4m', range: '7032km', speed: '908km/h', pax: 'Tanker' },
            // General Aviation
            'C172': { manufacturer: 'Cessna', model: '172 Skyhawk', engines: '1x Lycoming O-360', wingspan: '11.0m', length: '8.3m', range: '1185km', speed: '226km/h', pax: '4' },
            'C182': { manufacturer: 'Cessna', model: '182 Skylane', engines: '1x Lycoming O-540', wingspan: '11.0m', length: '8.8m', range: '1574km', speed: '267km/h', pax: '4' },
            'C206': { manufacturer: 'Cessna', model: '206 Stationair', engines: '1x Continental IO-520', wingspan: '11.0m', length: '8.6m', range: '1352km', speed: '280km/h', pax: '6' },
            'C208': { manufacturer: 'Cessna', model: '208 Caravan', engines: '1x PT6A-114A', wingspan: '15.9m', length: '11.5m', range: '1982km', speed: '344km/h', pax: '9-14' },
            'PC12': { manufacturer: 'Pilatus', model: 'PC-12', engines: '1x PT6A-67P', wingspan: '16.3m', length: '14.4m', range: '3417km', speed: '528km/h', pax: '6-9' },
            'TBM7': { manufacturer: 'Daher', model: 'TBM 700', engines: '1x PT6A-64', wingspan: '12.7m', length: '10.6m', range: '2780km', speed: '555km/h', pax: '4-6' },
            'TBM8': { manufacturer: 'Daher', model: 'TBM 850', engines: '1x PT6A-66D', wingspan: '12.7m', length: '10.7m', range: '2780km', speed: '611km/h', pax: '4-6' },
            'TBM9': { manufacturer: 'Daher', model: 'TBM 900', engines: '1x PT6A-66D', wingspan: '12.8m', length: '10.7m', range: '3167km', speed: '611km/h', pax: '4-6' },
            'PA28': { manufacturer: 'Piper', model: 'PA-28 Cherokee', engines: '1x Lycoming O-360', wingspan: '10.7m', length: '7.3m', range: '1056km', speed: '227km/h', pax: '4' },
            'PA32': { manufacturer: 'Piper', model: 'PA-32 Saratoga', engines: '1x Lycoming IO-540', wingspan: '11.0m', length: '8.4m', range: '1574km', speed: '296km/h', pax: '6' },
            'PA46': { manufacturer: 'Piper', model: 'PA-46 Malibu', engines: '1x Continental TSIO-520', wingspan: '13.1m', length: '8.7m', range: '2778km', speed: '426km/h', pax: '6' },
            'SR20': { manufacturer: 'Cirrus', model: 'SR20', engines: '1x Continental IO-390', wingspan: '11.7m', length: '7.9m', range: '1352km', speed: '296km/h', pax: '4' },
            'SR22': { manufacturer: 'Cirrus', model: 'SR22', engines: '1x Continental IO-550', wingspan: '11.7m', length: '7.9m', range: '1685km', speed: '341km/h', pax: '4' },
            'SF50': { manufacturer: 'Cirrus', model: 'SF50 Vision Jet', engines: '1x Williams FJ33', wingspan: '11.8m', length: '9.4m', range: '2222km', speed: '556km/h', pax: '5-7' },
            'BE36': { manufacturer: 'Beechcraft', model: 'Bonanza 36', engines: '1x Continental IO-550', wingspan: '10.2m', length: '8.4m', range: '1685km', speed: '326km/h', pax: '6' },
            'BE58': { manufacturer: 'Beechcraft', model: 'Baron 58', engines: '2x Continental IO-550', wingspan: '11.5m', length: '9.1m', range: '2778km', speed: '370km/h', pax: '6' },
            'BE9L': { manufacturer: 'Beechcraft', model: 'King Air C90', engines: '2x PT6A-21', wingspan: '15.3m', length: '10.8m', range: '2446km', speed: '461km/h', pax: '7-8' },
            'BE20': { manufacturer: 'Beechcraft', model: 'King Air 200', engines: '2x PT6A-42', wingspan: '16.6m', length: '13.3m', range: '3338km', speed: '536km/h', pax: '7-13' },
            'B350': { manufacturer: 'Beechcraft', model: 'King Air 350', engines: '2x PT6A-60A', wingspan: '17.7m', length: '14.2m', range: '3200km', speed: '578km/h', pax: '9-11' },
            // Helicopters
            'EC35': { manufacturer: 'Airbus', model: 'EC135', engines: '2x PW206B/Arrius', wingspan: '10.2m', length: '10.2m', range: '635km', speed: '254km/h', pax: '6-7' },
            'EC45': { manufacturer: 'Airbus', model: 'EC145/H145', engines: '2x Arriel 1E2', wingspan: '11.0m', length: '13.0m', range: '680km', speed: '268km/h', pax: '9-11' },
            'AS50': { manufacturer: 'Airbus', model: 'AS350/H125', engines: '1x Arriel 2D', wingspan: '10.7m', length: '10.9m', range: '666km', speed: '287km/h', pax: '5-6' },
            'A109': { manufacturer: 'Leonardo', model: 'AW109', engines: '2x PW206C', wingspan: '11.0m', length: '11.4m', range: '932km', speed: '285km/h', pax: '6-8' },
            'A139': { manufacturer: 'Leonardo', model: 'AW139', engines: '2x PT6C-67C', wingspan: '13.8m', length: '16.7m', range: '1061km', speed: '306km/h', pax: '12-15' },
            'S76': { manufacturer: 'Sikorsky', model: 'S-76', engines: '2x Arriel 2S2', wingspan: '13.4m', length: '16.0m', range: '761km', speed: '287km/h', pax: '12-13' },
            'S92': { manufacturer: 'Sikorsky', model: 'S-92', engines: '2x CT7-8A', wingspan: '17.2m', length: '20.9m', range: '999km', speed: '280km/h', pax: '19-22' },
            'B06': { manufacturer: 'Bell', model: '206 JetRanger', engines: '1x Allison 250', wingspan: '10.2m', length: '11.8m', range: '693km', speed: '225km/h', pax: '4' },
            'B407': { manufacturer: 'Bell', model: '407', engines: '1x Allison 250-C47B', wingspan: '10.7m', length: '12.7m', range: '598km', speed: '259km/h', pax: '6' },
            'B412': { manufacturer: 'Bell', model: '412', engines: '2x PT6T-3B', wingspan: '14.0m', length: '17.1m', range: '656km', speed: '259km/h', pax: '13-15' },
            'R22': { manufacturer: 'Robinson', model: 'R22', engines: '1x Lycoming O-360', wingspan: '7.7m', length: '8.8m', range: '370km', speed: '180km/h', pax: '2' },
            'R44': { manufacturer: 'Robinson', model: 'R44', engines: '1x Lycoming IO-540', wingspan: '10.1m', length: '11.7m', range: '563km', speed: '209km/h', pax: '4' },
            'R66': { manufacturer: 'Robinson', model: 'R66', engines: '1x RR300', wingspan: '10.7m', length: '11.7m', range: '602km', speed: '241km/h', pax: '5' }
        },
        async init() {
            Object.entries(this.fallbackSpecs).forEach(([code, data]) => { this.types.set(code, { ...data, source: 'fallback' }); });
            try { const resp = await fetch(DATA_URLS.types); if (!resp.ok) throw new Error('HTTP ' + resp.status); const data = await resp.json(); this.parseTypesJSON(data); _dbg('Loaded ' + this.types.size + ' aircraft types'); }
            catch(e) { console.warn('Types DB load failed, using fallbacks:', e); }
            this.loaded = true; return true;
        },
        parseTypesJSON(data) {
            if (typeof data === 'object' && !Array.isArray(data)) {
                Object.entries(data).forEach(([code, info]) => {
                    if (Array.isArray(info)) { this.types.set(code.toUpperCase(), { manufacturer: info[0] || '', model: info[1] || '', source: 'external' }); }
                    else if (typeof info === 'object') { this.types.set(code.toUpperCase(), { ...info, source: 'external' }); }
                    else if (typeof info === 'string') { const parts = info.split(' '); this.types.set(code.toUpperCase(), { manufacturer: parts[0] || '', model: parts.slice(1).join(' ') || '', source: 'external' }); }
                });
            }
        },
        getByDesignator(code) { if (!code) return null; return this.types.get(code.toUpperCase()) || null; },
        getDescription(code) { const t = this.getByDesignator(code); if (!t) return code; return t.manufacturer && t.model ? t.manufacturer + ' ' + t.model : (t.model || t.manufacturer || code); }
    };

    // ============ INTERESTING AIRCRAFT DATABASE ============
    const interestingDB = {
        aircraft: new Map(), loaded: false,
        categoryColors: { 'Military': '#4a90d9', 'Gov': '#9333ea', 'Police': '#3b82f6', 'Medical': '#ef4444', 'Historic': '#f59e0b', 'Distinctive': '#10b981', 'PIA': '#ec4899', 'default': '#6b7280' },
        categoryIcons: { 'Military': '*', 'Gov': '#', 'Police': '!', 'Medical': '+', 'Historic': '@', 'Distinctive': '*', 'PIA': '!', 'default': '*' },
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.interesting);
                if (!result.ok) throw new Error('All sources failed');
                const csv = await result.text();
                this.parseCSV(csv);
                _dbg('Loaded', this.aircraft.size, 'interesting aircraft');
                return true;
            }
            catch(e) { console.warn('Interesting aircraft DB failed:', e); return false; }
        },
        parseCSV(csv) {
            const lines = csv.split('\n');
            for (let i = 1; i < lines.length; i++) { const line = lines[i].trim(); if (!line) continue; const fields = this.parseCSVLine(line); if (fields.length < 6) continue; const hex = fields[0].replace('$', '').toUpperCase(); if (!hex) continue;
                this.aircraft.set(hex, { registration: fields[1] || '', operator: fields[2] || '', type: fields[3] || '', icaoType: fields[4] || '', category: fields[5]?.replace('#', '') || '', tag: fields[6]?.replace('#', '') || '', link: fields[7]?.replace('#', '') || '' });
            }
            this.loaded = true;
        },
        parseCSVLine(line) { const result = []; let current = '', inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += char; } result.push(current.trim()); return result; },
        getByHex(hex) { if (!hex) return null; return this.aircraft.get(hex.toUpperCase()) || null; },
        isInteresting(hex) { return this.aircraft.has(hex?.toUpperCase()); },
        getCategoryColor(category) { return this.categoryColors[category] || this.categoryColors.default; },
        getCategoryIcon(category) { return this.categoryIcons[category] || this.categoryIcons.default; }
    };

    // ============ AIRLINES DATABASE ============
    const airlineDB = {
        byICAO: new Map(), byIATA: new Map(), loaded: false,
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.airlines);
                if (!result.ok) throw new Error('All sources failed');
                const csv = await result.text();
                this.parseCSV(csv);
                _dbg('Loaded', this.byICAO.size, 'airlines');
                return true;
            }
            catch(e) { console.warn('Airlines DB failed:', e); return false; }
        },
        parseCSV(csv) {
            const lines = csv.split('\n');
            for (const line of lines) { if (!line.trim()) continue; const fields = this.parseCSVLine(line); if (fields.length < 7) continue;
                const airline = { id: fields[0], name: fields[1]?.replace(/"/g, '') || '', alias: fields[2]?.replace(/"/g, '') || '', iata: fields[3], icao: fields[4], callsign: fields[5], country: fields[6], active: fields[7] === 'Y' };
                if (airline.icao && airline.icao !== '\\N' && airline.icao !== 'N/A') this.byICAO.set(airline.icao.toUpperCase(), airline);
                if (airline.iata && airline.iata !== '\\N' && airline.iata !== '-') this.byIATA.set(airline.iata.toUpperCase(), airline);
            }
            this.loaded = true;
        },
        parseCSVLine(line) { const result = []; let current = '', inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += char; } result.push(current.trim()); return result; },
        getByICAO(code) { if (!code) return null; return this.byICAO.get(code.toUpperCase()) || null; },
        getFromCallsign(callsign) { if (!callsign || callsign.length < 3) return null; const code = callsign.substring(0, 3).toUpperCase(); if (!/^[A-Z]{3}$/.test(code)) return null; return this.getByICAO(code); },
        getAirlineName(callsign) { const airline = this.getFromCallsign(callsign); return airline?.name || null; }
    };

    // ============ MILITARY DATABASE ============
    const militaryDB = {
        military: new Map(), government: new Map(), police: new Map(), loaded: false,
        async init() {
            const sources = [
                { url: DATA_URLS.military, map: this.military, type: 'military' },
                { url: DATA_URLS.government, map: this.government, type: 'government' },
                { url: DATA_URLS.police, map: this.police, type: 'police' }
            ];
            for (const source of sources) {
                try {
                    const result = await fetchWithFailover(source.url);
                    if (result.ok) {
                        const csv = await result.text();
                        this.parseCSV(csv, source.map, source.type);
                    }
                } catch (e) {
                    console.warn('Military DB (' + source.type + ') failed:', e);
                }
            }
            this.loaded = true;
            _dbg('Military DB loaded:', this.getTotalCount(), 'total aircraft');
            return this.getTotalCount() > 0;
        },
        parseCSV(csv, targetMap, category) {
            const lines = csv.split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const fields = this.parseCSVLine(line);
                if (fields.length < 2) continue;
                const hex = fields[0].replace('$', '').toUpperCase();
                if (!hex) continue;
                targetMap.set(hex, { registration: fields[1] || '', operator: fields[2] || '', type: fields[3] || '', icaoType: fields[4] || '', category: category === 'military' ? 'Military' : category === 'government' ? 'Gov' : 'Police', tag: fields[6]?.replace('#', '') || '' });
            }
        },
        parseCSVLine(line) { const result = []; let current = '', inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += char; } result.push(current.trim()); return result; },
        getByHex(hex) { if (!hex) return null; hex = hex.toUpperCase(); return this.military.get(hex) || this.government.get(hex) || this.police.get(hex) || null; },
        getTotalCount() { return this.military.size + this.government.size + this.police.size; }
    };

    // ============ PIA DATABASE (Privacy ICAO Address) ============
    const piaDB = {
        aircraft: new Map(),
        loaded: false,
        
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.pia);
                if (!result.ok) throw new Error('All sources failed');
                const csv = await result.text();
                this.parseCSV(csv);
                _dbg('Loaded', this.aircraft.size, 'PIA aircraft');
                return true;
            } catch (e) {
                console.warn('PIA DB failed:', e);
                return false;
            }
        },
        
        parseCSV(csv) {
            const lines = csv.split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const fields = this.parseCSVLine(line);
                if (fields.length < 2) continue;
                const hex = fields[0].replace('$', '').toUpperCase();
                if (!hex) continue;
                this.aircraft.set(hex, {
                    registration: fields[1] || '',
                    operator: fields[2] || '',
                    type: fields[3] || '',
                    category: 'PIA',
                    tag: fields[6]?.replace('#', '') || 'Privacy ICAO Address'
                });
            }
            this.loaded = true;
        },
        
        parseCSVLine(line) { const result = []; let current = '', inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += char; } result.push(current.trim()); return result; },
        
        getByHex(hex) {
            if (!hex) return null;
            return this.aircraft.get(hex.toUpperCase()) || null;
        },
        
        isPIA(hex) {
            return this.aircraft.has(hex?.toUpperCase());
        }
    };

    // ============ AIRPORT FREQUENCIES DATABASE ============
    const frequencyDB = {
        frequencies: new Map(),
        loaded: false,
        
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.frequencies);
                if (!result.ok) throw new Error('All sources failed');
                const csv = await result.text();
                this.parseCSV(csv);
                _dbg('Loaded frequencies for', this.frequencies.size, 'airports');
                return true;
            } catch (e) {
                console.warn('Frequencies DB failed:', e);
                return false;
            }
        },
        
        parseCSV(csv) {
            const lines = csv.split('\n');
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            
            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i]);
                if (values.length < headers.length) continue;
                
                const freq = {};
                headers.forEach((h, idx) => { freq[h] = values[idx]; });
                
                if (!freq.airport_ident || !freq.frequency_mhz) continue;
                
                const ident = freq.airport_ident.toUpperCase();
                if (!this.frequencies.has(ident)) {
                    this.frequencies.set(ident, []);
                }
                
                this.frequencies.get(ident).push({
                    type: freq.type || '',
                    description: freq.description || '',
                    frequency: parseFloat(freq.frequency_mhz) || 0
                });
            }
            this.loaded = true;
        },
        
        parseCSVLine(line) { const result = []; let current = '', inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') inQuotes = !inQuotes; else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; } else current += char; } result.push(current.trim()); return result; },
        
        getByAirport(icao) {
            if (!icao) return [];
            return this.frequencies.get(icao.toUpperCase()) || [];
        },
        
        getTower(icao) {
            return this.getByAirport(icao).filter(f => 
                f.type.includes('TWR') || f.description.toLowerCase().includes('tower')
            );
        },
        
        getATIS(icao) {
            return this.getByAirport(icao).filter(f => 
                f.type.includes('ATIS') || f.description.toLowerCase().includes('atis')
            );
        },
        
        getApproach(icao) {
            return this.getByAirport(icao).filter(f => 
                f.type.includes('APP') || f.description.toLowerCase().includes('approach')
            );
        }
    };

    // ============ CALLSIGN PREFIX DATABASE ============
    const callsignPrefixDB = {
        prefixes: new Map(),
        loaded: false,
        
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.callsignPrefix);
                if (!result.ok) {
                    _dbg('Building callsign prefixes from airlines DB...');
                    this.buildFromAirlines();
                    return this.loaded;
                }
                const data = await result.json();
                Object.entries(data).forEach(([prefix, name]) => {
                    this.prefixes.set(prefix.toUpperCase(), name);
                });
                this.loaded = true;
                _dbg('Loaded', this.prefixes.size, 'callsign prefixes');
                return true;
            } catch (e) {
                _dbg('Building callsign prefixes from airlines DB...');
                this.buildFromAirlines();
                return this.loaded;
            }
        },
        
        buildFromAirlines() {
            // Build prefix map from loaded airlines
            if (airlineDB.loaded) {
                airlineDB.byICAO.forEach((airline, icao) => {
                    if (icao && icao.length >= 2) {
                        this.prefixes.set(icao.toUpperCase(), airline.name);
                    }
                });
                this.loaded = true;
                _dbg('Built', this.prefixes.size, 'callsign prefixes from airlines');
            }
        },
        
        getAirline(callsign) {
            if (!callsign || callsign.length < 3) return null;
            const prefix3 = callsign.substring(0, 3).toUpperCase();
            if (this.prefixes.has(prefix3)) return this.prefixes.get(prefix3);
            const prefix2 = callsign.substring(0, 2).toUpperCase();
            if (this.prefixes.has(prefix2)) return this.prefixes.get(prefix2);
            return null;
        }
    };

    // ============ ALLIANCE DATABASE ============
    const allianceDB = {
        airlines: new Map(),
        alliances: {
            'Star Alliance': { color: '#CFB53B', airlines: [] },
            'OneWorld': { color: '#E31937', airlines: [] },
            'SkyTeam': { color: '#073590', airlines: [] }
        },
        loaded: false,
        
        // Built-in alliance memberships (major airlines)
        builtInAlliances: {
            // Star Alliance members
            'UAL': 'Star Alliance', 'ACA': 'Star Alliance', 'DLH': 'Star Alliance', 'SAS': 'Star Alliance',
            'THA': 'Star Alliance', 'SIA': 'Star Alliance', 'ANA': 'Star Alliance', 'NZM': 'Star Alliance',
            'TAP': 'Star Alliance', 'LOT': 'Star Alliance', 'SWR': 'Star Alliance', 'AUA': 'Star Alliance',
            'TUR': 'Star Alliance', 'ETH': 'Star Alliance', 'EVA': 'Star Alliance', 'AIR': 'Star Alliance',
            'TAM': 'Star Alliance', 'CCA': 'Star Alliance', 'CSN': 'Star Alliance', 'ASA': 'Star Alliance',
            'United': 'Star Alliance', 'Lufthansa': 'Star Alliance', 'Air Canada': 'Star Alliance',
            'Singapore Airlines': 'Star Alliance', 'ANA': 'Star Alliance', 'Thai Airways': 'Star Alliance',
            'Swiss': 'Star Alliance', 'Austrian': 'Star Alliance', 'Turkish Airlines': 'Star Alliance',
            'Ethiopian Airlines': 'Star Alliance', 'EVA Air': 'Star Alliance', 'Air India': 'Star Alliance',
            'Scandinavian Airlines': 'Star Alliance', 'TAP Portugal': 'Star Alliance', 'LOT Polish': 'Star Alliance',
            
            // OneWorld members
            'AAL': 'OneWorld', 'BAW': 'OneWorld', 'QFA': 'OneWorld', 'CPA': 'OneWorld', 'JAL': 'OneWorld',
            'IBE': 'OneWorld', 'MAS': 'OneWorld', 'FJI': 'OneWorld', 'QTR': 'OneWorld', 'RJA': 'OneWorld',
            'SRI': 'OneWorld', 'FIN': 'OneWorld', 'ALK': 'OneWorld',
            'American Airlines': 'OneWorld', 'British Airways': 'OneWorld', 'Qantas': 'OneWorld',
            'Cathay Pacific': 'OneWorld', 'Japan Airlines': 'OneWorld', 'Iberia': 'OneWorld',
            'Malaysia Airlines': 'OneWorld', 'Qatar Airways': 'OneWorld', 'Finnair': 'OneWorld',
            'Royal Jordanian': 'OneWorld', 'SriLankan Airlines': 'OneWorld',
            
            // SkyTeam members
            'DAL': 'SkyTeam', 'AFR': 'SkyTeam', 'KLM': 'SkyTeam', 'KAL': 'SkyTeam', 'CES': 'SkyTeam',
            'CSC': 'SkyTeam', 'AZA': 'SkyTeam', 'MEA': 'SkyTeam', 'SVA': 'SkyTeam', 'ARG': 'SkyTeam',
            'VIR': 'SkyTeam', 'KQA': 'SkyTeam', 'AEE': 'SkyTeam', 'VNM': 'SkyTeam', 'GAR': 'SkyTeam',
            'Delta': 'SkyTeam', 'Air France': 'SkyTeam', 'KLM': 'SkyTeam', 'Korean Air': 'SkyTeam',
            'China Eastern': 'SkyTeam', 'China Southern': 'SkyTeam', 'Alitalia': 'SkyTeam',
            'Saudia': 'SkyTeam', 'Aerolineas Argentinas': 'SkyTeam', 'Virgin Atlantic': 'SkyTeam',
            'Kenya Airways': 'SkyTeam', 'Vietnam Airlines': 'SkyTeam', 'Garuda Indonesia': 'SkyTeam'
        },
        
        async init() {
            // Use built-in alliance data
            for (const [code, alliance] of Object.entries(this.builtInAlliances)) {
                this.airlines.set(code.toUpperCase(), alliance);
                this.airlines.set(code.toLowerCase(), alliance);
            }
            this.loaded = true;
            _dbg('Loaded ' + this.airlines.size + ' alliance memberships');
            return true;
        },
        
        getAlliance(airlineNameOrCode) {
            if (!airlineNameOrCode) return null;
            // Try exact match first
            let alliance = this.airlines.get(airlineNameOrCode);
            if (alliance) return alliance;
            // Try uppercase
            alliance = this.airlines.get(airlineNameOrCode.toUpperCase());
            if (alliance) return alliance;
            // Try partial match for airline names
            const search = airlineNameOrCode.toLowerCase();
            for (const [key, val] of this.airlines.entries()) {
                if (key.toLowerCase().includes(search) || search.includes(key.toLowerCase())) {
                    return val;
                }
            }
            return null;
        },
        
        getAllianceColor(alliance) {
            return this.alliances[alliance]?.color || '#666';
        }
    };

    // ============ MILITARY HEX RANGES DATABASE ============
    const milRangesDB = {
        ranges: [],
        loaded: false,
        
        // Built-in military hex ranges — ONLY ranges that are EXCLUSIVELY military
        // Most countries mix civilian/military in the same ICAO allocation block,
        // so we CANNOT use broad country ranges (they catch airlines).
        // Only the US has dedicated military-only hex blocks (AE/AF).
        builtInRanges: {
            'US': [
                ['AE0000', 'AEFFFF'],  // US DoD - exclusively military
                ['AF0000', 'AFFFFF']   // US DoD - exclusively military
            ],
            'UK': [
                ['43C000', '43CFFF']   // UK MoD - targeted military sub-block
            ]
            // REMOVED: France (3A/3B), Germany (3E), Russia (14-15), China (78-7B),
            // Australia (7CF8), Canada (C0CD), Israel (738), Italy (33E)
            // These were entire national ICAO blocks catching Air France, Lufthansa,
            // Aeroflot, Air China, etc. as military. Non-US/UK military aircraft
            // are identified via the CSV databases (militaryDB, interestingDB) instead.
        },
        
        async init() {
            // Use built-in ranges (external mil-ranges.json no longer available)
            _dbg('Using built-in military hex ranges...');
            this.parseRanges(this.builtInRanges);
            _dbg('Loaded ' + this.ranges.length + ' built-in military hex ranges');
            return this.ranges.length > 0;
        },
        
        parseRanges(data) {
            this.ranges = [];
            for (const [country, ranges] of Object.entries(data)) {
                for (const range of ranges) {
                    if (Array.isArray(range) && range.length >= 2) {
                        this.ranges.push({
                            start: parseInt(range[0].replace(/\s/g, ''), 16),
                            end: parseInt(range[1].replace(/\s/g, ''), 16),
                            country: country
                        });
                    }
                }
            }
            this.loaded = this.ranges.length > 0;
        },
        
        isMilitary(hex) {
            if (!hex || !this.loaded) return null;
            const hexVal = parseInt(hex, 16);
            
            for (const range of this.ranges) {
                if (hexVal >= range.start && hexVal <= range.end) {
                    return { country: range.country, category: 'Military' };
                }
            }
            return null;
        }
    };

    // ============ ROUTES DATABASE ============
    const routesDB = {
        routes: new Map(),
        byAirline: new Map(),
        loaded: false,
        
        async init() {
            try {
                const result = await fetchWithFailover(DATA_URLS.routes);
                if (!result.ok) throw new Error('All sources failed');
                const csv = await result.text();
                this.parseCSV(csv);
                _dbg('Loaded routes for', this.byAirline.size, 'airlines');
                return true;
            } catch (e) {
                console.warn('Routes DB failed:', e);
                return false;
            }
        },
        
        parseCSV(csv) {
            const lines = csv.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const fields = line.split(',');
                if (fields.length < 5) continue;
                
                const airline = fields[0].replace(/"/g, '').trim();
                const source = fields[2].replace(/"/g, '').trim();
                const dest = fields[4].replace(/"/g, '').trim();
                
                if (!airline || !source || !dest) continue;
                if (source === '\\N' || dest === '\\N') continue;
                
                if (!this.byAirline.has(airline)) {
                    this.byAirline.set(airline, []);
                }
                this.byAirline.get(airline).push({ from: source, to: dest });
            }
            this.loaded = true;
        },
        
        findRoutes(airlineCode, fromAirport) {
            if (!this.loaded || !airlineCode) return [];
            const routes = this.byAirline.get(airlineCode.toUpperCase()) || [];
            if (fromAirport) {
                return routes.filter(r => r.from.toUpperCase() === fromAirport.toUpperCase());
            }
            return routes;
        },
        
        getDestinations(airlineCode, fromAirport) {
            return this.findRoutes(airlineCode, fromAirport).map(r => r.to);
        }
    };

    // Route API lookup (adsbdb + hexdb fallback) now lives in src/modules/50-route-lookup.js.


    // ============ FLIGHT ORIGIN DETECTION ============
    const flightTracker = {
        // Detect origin airport from trail data
        detectOrigin(ac) {
            if (!ac.history || ac.history.length < 5) return null;
            for (let i = 0; i < Math.min(20, ac.history.length); i++) {
                const point = ac.history[i];
                const lat = point[0], lon = point[1], alt = point[2] || 0;
                if (alt < 2000) {
                    const nearby = airportDB.findNearby(lat, lon, 15);
                    if (nearby.length > 0) {
                        const sorted = nearby.sort((a, b) => {
                            const typeOrder = { 'large_airport': 0, 'medium_airport': 1, 'small_airport': 2 };
                            return (typeOrder[a.type] || 3) - (typeOrder[b.type] || 3);
                        });
                        return sorted[0];
                    }
                }
            }
            return null;
        },
        
        // Detect origin from loaded trace data
        detectOriginFromTrace(trace) {
            if (!trace || trace.length < 5) return null;
            for (let i = 0; i < Math.min(30, trace.length); i++) {
                const point = trace[i];
                const lat = point[1], lon = point[2], alt = point[3] || 0, gs = point[4] || 0;
                if ((alt === 'ground' || alt < 1500) || (alt < 3000 && gs < 150)) {
                    const nearby = airportDB.findNearby(lat, lon, 15);
                    if (nearby.length > 0) {
                        const sorted = nearby.sort((a, b) => {
                            const typeOrder = { 'large_airport': 0, 'medium_airport': 1, 'small_airport': 2 };
                            return (typeOrder[a.type] || 3) - (typeOrder[b.type] || 3);
                        });
                        return sorted[0];
                    }
                }
            }
            return null;
        },
        
        // Infer destination using routes database
        inferDestination(airlineCode, originCode) {
            if (!routesDB.loaded || !airlineCode || !originCode) return null;
            const possibleRoutes = routesDB.findRoutes(airlineCode, originCode);
            if (possibleRoutes.length === 0) return null;
            if (possibleRoutes.length === 1) return possibleRoutes[0].to;
            return possibleRoutes.map(r => r.to);
        },
        
        // Calculate flight progress
        calculateProgress(ac, originAirport, destAirport) {
            if (!originAirport || !destAirport || !ac || !Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) return null;
            const originLat = parseFloat(originAirport.lat);
            const originLon = parseFloat(originAirport.lon);
            const destLat = parseFloat(destAirport.lat);
            const destLon = parseFloat(destAirport.lon);
            if (![originLat, originLon, destLat, destLon].every(Number.isFinite)) return null;
            const totalDist = haversineDistance(originLat, originLon, destLat, destLon);
            if (!Number.isFinite(totalDist) || totalDist <= 0) return null;
            const flownDist = haversineDistance(originLat, originLon, ac.lat, ac.lon);
            const remainDist = haversineDistance(ac.lat, ac.lon, destLat, destLon);
            let etaMinutes = null;
            if (ac.gs && ac.gs > 50) {
                const gsKmh = ac.gs * 1.852;
                etaMinutes = Math.round((remainDist / gsKmh) * 60);
            }
            const progress = Math.min(100, Math.max(0, (flownDist / totalDist) * 100));
            return {
                totalDistance: Math.round(totalDist),
                flownDistance: Math.round(flownDist),
                remainingDistance: Math.round(remainDist),
                progress: Math.round(progress),
                etaMinutes: etaMinutes
            };
        },
        
        // Format time duration
        formatDuration(minutes) {
            if (!minutes || minutes < 0) return '---';
            const hrs = Math.floor(minutes / 60);
            const mins = minutes % 60;
            if (hrs > 0) return hrs + 'h ' + mins + 'm';
            return mins + ' min';
        }
    };

    // ============ STATISTICS SYSTEM ============
    const statsSystem = {
        sessionStart: Date.now(),
        refreshCount: 0,
        uniqueAircraft: new Set(),
        todayAircraft: new Set(),
        lastTodayReset: new Date().toDateString(),
        
        init() {
            // Load today's aircraft from storage
            const stored = localStorage.getItem('skytrack_today_aircraft');
            const storedDate = localStorage.getItem('skytrack_today_date');
            
            if (storedDate === this.lastTodayReset && stored) {
                try {
                    this.todayAircraft = new Set(JSON.parse(stored));
                } catch(e) { /* ignore */ }
            }
            
            // Set session start time
            const sessionStartEl = document.getElementById('sessionStart');
            if (sessionStartEl) {
                sessionStartEl.textContent = new Date(this.sessionStart).toLocaleTimeString();
            }
            
            // Button handler
            _el('statsBtn')?.addEventListener('click', () => this.toggle());
            document.getElementById('statsClose')?.addEventListener('click', () => this.close());
            
            // Click handlers for records
            document.querySelectorAll('.record-item').forEach(el => {
                el.addEventListener('click', () => {
                    const hex = el.dataset.hex;
                    if (hex && aircraftCache[hex]) {
                        selectAircraft(hex);
                        this.close();
                    }
                });
            });
        },
        
        toggle() {
            const panel = _el('statsPanel');
            if (panel?.classList.contains('show')) {
                this.close();
            } else {
                this.open();
            }
        },
        
        open() {
            _el('statsPanel')?.classList.add('show');
            _el('statsBtn')?.classList.add('active');
            _el('settingsPanel')?.classList.remove('show');
            _el('infoPanel')?.classList.remove('show');
            this.update();
        },
        
        close() {
            _el('statsPanel')?.classList.remove('show');
            _el('statsBtn')?.classList.remove('active');
        },
        
        // Called after each aircraft data load
        recordRefresh(aircraft) {
            this.refreshCount++;
            const refreshEl = document.getElementById('sessionRefreshes');
            if (refreshEl) refreshEl.textContent = this.refreshCount;
            
            // Check for day change
            const today = new Date().toDateString();
            if (today !== this.lastTodayReset) {
                this.todayAircraft.clear();
                this.lastTodayReset = today;
            }
            
            // Record unique aircraft
            aircraft.forEach(ac => {
                if (ac.hex) {
                    this.uniqueAircraft.add(ac.hex);
                    this.todayAircraft.add(ac.hex);
                }
            });
            
            const uniqueEl = document.getElementById('sessionUnique');
            if (uniqueEl) uniqueEl.textContent = this.uniqueAircraft.size;
            
            // Save today's aircraft
            try {
                localStorage.setItem('skytrack_today_aircraft', JSON.stringify([...this.todayAircraft]));
                localStorage.setItem('skytrack_today_date', today);
            } catch(e) { /* ignore storage errors */ }
            
            // Update stats if panel is open
            if (_el('statsPanel')?.classList.contains('show')) {
                this.update();
            }
        },
        
        update() {
            const aircraft = Object.values(aircraftCache);
            
            // Summary stats
            const totalEl = document.getElementById('statTotalAircraft');
            if (totalEl) totalEl.textContent = aircraft.length;
            
            const todayEl = document.getElementById('statTotalToday');
            if (todayEl) todayEl.textContent = this.todayAircraft.size;
            
            const interestingEl = document.getElementById('statInteresting');
            if (interestingEl) {
                interestingEl.textContent = aircraft.filter(ac => ac.interesting || ac.isVIP).length;
            }
            
            const militaryEl = document.getElementById('statMilitary');
            if (militaryEl) {
                militaryEl.textContent = aircraft.filter(ac => ac.militaryInfo || ac.militaryRangeInfo).length;
            }
            
            // Type distribution
            this.updateTypeChart(aircraft);
            
            // Altitude histogram
            this.updateAltitudeHistogram(aircraft);
            
            // Speed histogram
            this.updateSpeedHistogram(aircraft);
            
            // Top airlines
            this.updateTopAirlines(aircraft);
            
            // Busiest airports
            this.updateBusiestAirports(aircraft);
            
            // Records
            this.updateRecords(aircraft);
        },
        
        updateTypeChart(aircraft) {
            const types = {};
            aircraft.forEach(ac => {
                const type = ac.category_type || 'unknown';
                types[type] = (types[type] || 0) + 1;
            });
            
            const total = aircraft.length || 1;
            const sorted = Object.entries(types)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6);
            
            const container = document.getElementById('typeChart');
            if (!container) return;
            
            container.innerHTML = sorted.map(([type, count]) => {
                const pct = (count / total * 100).toFixed(0);
                return '<div class="chart-row">' +
                    '<span class="chart-label">' + this.formatTypeName(type) + '</span>' +
                    '<div class="chart-bar-container">' +
                    '<div class="chart-bar ' + type + '" style="width: ' + pct + '%"></div>' +
                    '</div>' +
                    '<span class="chart-count">' + count + '</span>' +
                    '</div>';
            }).join('');
        },
        
        formatTypeName(type) {
            const names = {
                commercial: 'Commercial',
                cargo: 'Cargo',
                military: 'Military',
                private: 'Private',
                helicopter: 'Helicopter',
                government: 'Government',
                medical: 'Medical',
                police: 'Police',
                ground: 'Ground',
                unknown: 'Unknown',
                vip: 'VIP'
            };
            return names[type] || type;
        },
        
        updateAltitudeHistogram(aircraft) {
            // Create 10 buckets: 0-5k, 5-10k, 10-15k, etc.
            const buckets = new Array(10).fill(0);
            
            aircraft.forEach(ac => {
                if (ac.alt_baro === 'ground' || ac.alt_baro === undefined) {
                    buckets[0]++;
                } else {
                    const bucket = Math.min(9, Math.floor(ac.alt_baro / 5000));
                    buckets[bucket]++;
                }
            });
            
            const max = Math.max(...buckets, 1);
            
            const container = document.getElementById('altitudeHistogram');
            if (!container) return;
            
            container.innerHTML = buckets.map(count => {
                const height = (count / max * 100).toFixed(0);
                return '<div class="histogram-bar" style="height: ' + height + '%" title="' + count + ' aircraft"></div>';
            }).join('');
        },
        
        updateSpeedHistogram(aircraft) {
            // Create 8 buckets: 0-100, 100-200, etc.
            const buckets = new Array(8).fill(0);
            
            aircraft.forEach(ac => {
                if (ac.gs !== undefined) {
                    const bucket = Math.min(7, Math.floor(ac.gs / 100));
                    buckets[bucket]++;
                }
            });
            
            const max = Math.max(...buckets, 1);
            
            const container = document.getElementById('speedHistogram');
            if (!container) return;
            
            container.innerHTML = buckets.map(count => {
                const height = (count / max * 100).toFixed(0);
                return '<div class="histogram-bar" style="height: ' + height + '%" title="' + count + ' aircraft"></div>';
            }).join('');
        },
        
        updateTopAirlines(aircraft) {
            const airlines = {};
            
            aircraft.forEach(ac => {
                if (ac.airlineName) {
                    airlines[ac.airlineName] = (airlines[ac.airlineName] || 0) + 1;
                }
            });
            
            const sorted = Object.entries(airlines)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            const container = document.getElementById('topAirlines');
            if (!container) return;
            
            if (sorted.length === 0) {
                container.innerHTML = '<div class="stats-list-item"><span class="list-item-name">No airline data</span></div>';
                return;
            }
            
            container.innerHTML = sorted.map(([name, count]) =>
                '<div class="stats-list-item" data-airline="' + _escHtml(name) + '">' +
                '<span class="list-item-name">' + _escHtml(name) + '</span>' +
                '<span class="list-item-count">' + count + '</span>' +
                '</div>'
            ).join('');
            
            // Click to filter
            container.querySelectorAll('.stats-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    if (typeof searchSystem !== 'undefined') {
                        searchSystem.filterByAirline(el.dataset.airline);
                    }
                    this.close();
                });
            });
        },
        
        updateBusiestAirports(aircraft) {
            const airports = {};
            
            aircraft.forEach(ac => {
                if (ac.from) airports[ac.from] = (airports[ac.from] || 0) + 1;
                if (ac.to) airports[ac.to] = (airports[ac.to] || 0) + 1;
            });
            
            const sorted = Object.entries(airports)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            const container = document.getElementById('busiestAirports');
            if (!container) return;
            
            if (sorted.length === 0) {
                container.innerHTML = '<div class="stats-list-item"><span class="list-item-name">No route data</span></div>';
                return;
            }
            
            container.innerHTML = sorted.map(([code, count]) => {
                const apt = airportDB.getByCode(code);
                const name = apt ? apt.name : code;
                const displayName = name.length > 25 ? name.substring(0, 25) + '...' : name;
                return '<div class="stats-list-item" data-airport="' + _escHtml(code) + '">' +
                    '<span class="list-item-name">' + _escHtml(code) + ' - ' + _escHtml(displayName) + '</span>' +
                    '<span class="list-item-count">' + count + '</span>' +
                    '</div>';
            }).join('');
            
            // Click to filter
            container.querySelectorAll('.stats-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    if (typeof searchSystem !== 'undefined') {
                        searchSystem.filterByAirport(el.dataset.airport);
                    }
                    this.close();
                });
            });
        },
        
        updateRecords(aircraft) {
            const airborne = aircraft.filter(ac => 
                ac.alt_baro !== 'ground' && ac.alt_baro > 500 && ac.gs > 50
            );
            
            // Highest
            const highest = airborne.reduce((max, ac) => 
                (ac.alt_baro || 0) > (max?.alt_baro || 0) ? ac : max
            , null);
            
            if (highest) {
                const highestEl = document.getElementById('recordHighest');
                const highestAcEl = document.getElementById('recordHighestAc');
                if (highestEl) highestEl.textContent = Math.round(highest.alt_baro).toLocaleString() + ' ft';
                if (highestAcEl) highestAcEl.textContent = highest.flight?.trim() || highest.r || highest.hex;
                const highestItem = highestEl?.closest('.record-item');
                if (highestItem) highestItem.dataset.hex = highest.hex;
            }
            
            // Fastest
            const fastest = airborne.reduce((max, ac) => 
                (ac.gs || 0) > (max?.gs || 0) ? ac : max
            , null);
            
            if (fastest) {
                const fastestEl = document.getElementById('recordFastest');
                const fastestAcEl = document.getElementById('recordFastestAc');
                if (fastestEl) fastestEl.textContent = Math.round(fastest.gs) + ' kt';
                if (fastestAcEl) fastestAcEl.textContent = fastest.flight?.trim() || fastest.r || fastest.hex;
                const fastestItem = fastestEl?.closest('.record-item');
                if (fastestItem) fastestItem.dataset.hex = fastest.hex;
            }
            
            // Slowest (airborne, >1000ft, >30kt to exclude ground)
            const slowestCandidates = airborne.filter(ac => ac.alt_baro > 1000 && ac.gs > 30);
            const slowest = slowestCandidates.reduce((min, ac) => 
                (ac.gs || 999) < (min?.gs || 999) ? ac : min
            , null);
            
            if (slowest) {
                const slowestEl = document.getElementById('recordSlowest');
                const slowestAcEl = document.getElementById('recordSlowestAc');
                if (slowestEl) slowestEl.textContent = Math.round(slowest.gs) + ' kt';
                if (slowestAcEl) slowestAcEl.textContent = slowest.flight?.trim() || slowest.r || slowest.hex;
                const slowestItem = slowestEl?.closest('.record-item');
                if (slowestItem) slowestItem.dataset.hex = slowest.hex;
            }
            
            // Oldest aircraft (by year)
            const withYear = aircraft.filter(ac => ac.year && ac.year > 1900);
            const oldest = withYear.reduce((min, ac) => 
                (ac.year || 9999) < (min?.year || 9999) ? ac : min
            , null);
            
            if (oldest) {
                const age = new Date().getFullYear() - oldest.year;
                const oldestEl = document.getElementById('recordOldest');
                const oldestAcEl = document.getElementById('recordOldestAc');
                if (oldestEl) oldestEl.textContent = age + ' years';
                if (oldestAcEl) oldestAcEl.textContent = (oldest.flight?.trim() || oldest.r || oldest.hex) + ' (' + oldest.year + ')';
                const oldestItem = oldestEl?.closest('.record-item');
                if (oldestItem) oldestItem.dataset.hex = oldest.hex;
            }
        }
    };

    // ============ DATA SOURCES ============
    const DATA_SOURCES = {
        airplaneslive: { name: 'Airplanes.live', buildUrl: (b, c, r) => 'https://api.airplanes.live/v2/point/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + r, parseResponse: d => d?.ac?.length ? d.ac : null },
        adsbone: { name: 'ADSB One', buildUrl: (b, c, r) => 'https://api.adsb.one/v2/point/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + r, parseResponse: d => d?.ac?.length ? d.ac : null },
        adsblol: { name: 'ADSB.lol', buildUrl: (b, c, r) => 'https://api.adsb.lol/v2/point/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + r, parseResponse: d => d?.ac?.length ? d.ac : null },
        adsbfi: { name: 'ADSB.fi', buildUrl: (b, c, r) => 'https://opendata.adsb.fi/api/v2/lat/' + c.lat.toFixed(4) + '/lon/' + c.lng.toFixed(4) + '/dist/' + r, parseResponse: d => d?.ac?.length ? d.ac : null }
    };
    const SOURCE_ORDER = ['adsbone', 'adsblol', 'adsbfi', 'airplaneslive'];

    // ============ STATE ============
    let apiCredentials = { clientId: '', clientSecret: '' };
    let map, currentBaseMap, aircraftCache = {}, markers = {}, trailLine = null, selectedHex = null, airportLayer = null, radarLayer = null;
    
    // Cached DOM references for hot-path access
    const _dom = {};
    // Cached DOM lookup. Only caches successful hits so a transient `null`
    // (e.g. from a call before DOMContentLoaded) does not get memoised and
    // wedge every future lookup of the same id.
    function _el(id) {
        const cached = _dom[id];
        if (cached && cached.isConnected) return cached;
        const found = document.getElementById(id);
        if (found) _dom[id] = found;
        return found;
    }
    let lastFetchTime = 0, fetchInProgress = false, lastSuccessfulSource = null, lastSuccessfulProxy = 0, animationRunning = false;
    const aircraftAnimation = {}, photoCache = {}, photoFailCache = {};
    let bookmarks = [];
    const settings = { mapStyle: 'google-streets', showLabels: false, showAirports: false, showRadar: true, altitudeColors: true, showWiki: true, showInterestingBadges: false, filter: 'all', followMode: false, compactMode: false };
    const baseMaps = {};
    const MILITARY_TYPES = ['F16', 'F15', 'F18', 'F22', 'F35', 'KC35', 'K35R', 'KC10', 'B52', 'A400', 'EUFI', 'RFAL', 'TORD', 'P8', 'U2', 'RC35', 'E6', 'E8', 'EA18', 'EP3', 'T38', 'T45'];
    const MILITARY_TYPES_EXACT = ['C17', 'C130', 'C5', 'C5M', 'B1', 'B1B', 'B2', 'A10', 'A10A', 'E3CF', 'E3TF', 'E3', 'V22', 'C2', 'C12', 'C30J', 'H60', 'C295', 'CN35', 'HAWK', 'MIAG', 'TUCA', 'F117', 'U28A', 'C146', 'C37A', 'C37B', 'C40A', 'C40B', 'P3', 'P8A', 'T6', 'T6A', 'T6B'];
    const BEECHCRAFT_TYPES = ['B190', 'B200', 'B250', 'B300', 'B350', 'BE20', 'BE30', 'BE40', 'B18T', 'B19T'];
    const HELI_TYPES = ['R22', 'R44', 'R66', 'EC35', 'EC45', 'EC55', 'EC75', 'AS50', 'AS55', 'AS65', 'B06', 'B105', 'B206', 'B212', 'B222', 'B230', 'B407', 'B412', 'B429', 'B430', 'BK17', 'S76', 'S92', 'MD50', 'MD52', 'MD60', 'MD90', 'A109', 'A119', 'A139', 'A149', 'A169', 'AW09', 'AW39', 'AW69', 'AW89', 'AW101', 'AW109', 'AW119', 'AW139', 'AW149', 'AW169', 'AW189', 'H125', 'H130', 'H135', 'H145', 'H155', 'H160', 'H175', 'H215', 'H225', 'AS32', 'AS33', 'AS35', 'AS36', 'EC20', 'EC30', 'EC65', 'UH1', 'UH60', 'AH1', 'AH64', 'CH47', 'CH53', 'MH6', 'MH47', 'MH53', 'MH60', 'HH60', 'SH60'];
    const CESSNA_TYPES = ['C120', 'C140', 'C150', 'C152', 'C162', 'C170', 'C172', 'C175', 'C177', 'C180', 'C182', 'C185', 'C188', 'C190', 'C195', 'C205', 'C206', 'C207', 'C208', 'C210', 'C303', 'C310', 'C320', 'C335', 'C336', 'C337', 'C340', 'C402', 'C404', 'C406', 'C411', 'C414', 'C421', 'C425', 'C441', 'C500', 'C501', 'C510', 'C525', 'C526', 'C550', 'C551', 'C560', 'C650', 'C680', 'C700', 'C750', 'C25A', 'C25B', 'C25C', 'C25M', 'C56X', 'C68A'];
    const PRIVATE_TYPES = ['BE35', 'BE36', 'BE55', 'BE58', 'BE76', 'BE95', 'BE99', 'PA18', 'PA22', 'PA23', 'PA24', 'PA28', 'PA30', 'PA31', 'PA32', 'PA34', 'PA38', 'PA44', 'PA46', 'SR20', 'SR22', 'DA20', 'DA40', 'DA42', 'DA50', 'DA62', 'M20', 'AA1', 'AA5', 'TB9', 'TB10', 'TB20', 'TB21', 'RV6', 'RV7', 'RV8', 'RV10', 'RV12', 'RV14', 'TRIN', 'SIRA', 'COLT', 'CHER', 'WARR', 'ARCH', 'ARRW'];
    const CARGO_CALLSIGNS = ['FDX', 'UPS', 'GTI', 'ABX', 'ATN', 'CLX', 'BOX', 'DHL', 'BCS', 'CKS', 'WGN', 'PAC', 'AZG', 'ABR', 'MPH', 'SQC', 'CAO', 'CLU', 'ICL', 'GEC', 'MAS'];
    const MEDICAL_CALLSIGNS = ['MEDEVAC', 'LIFELN', 'MERCY', 'ANGEL', 'LIFGRD', 'MEDIC', 'AIRAMB', 'FLYNRS', 'LIFESV', 'ORNGE', 'STAR', 'REACH', 'PHI', 'AIRMETHODS'];
    const POLICE_CALLSIGNS = ['POLICE', 'PATROL', 'TROOPER', 'SHERIFF', 'COPTER', 'EAGLE', 'N911'];

    // ============ UTILITIES ============
    function haversineDistance(lat1, lon1, lat2, lon2) { const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); }
    function getAltitudeColor(alt) { if (alt === 'ground' || !alt || alt <= 0) return '#00ff00'; if (alt < 1000) return '#00ff00'; if (alt < 5000) return '#7fff00'; if (alt < 10000) return '#ffff00'; if (alt < 20000) return '#ffa500'; if (alt < 30000) return '#ff4500'; if (alt < 40000) return '#ff0000'; return '#9400d3'; }
    
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
    
    // ============ PHASE 10: ENHANCED ALTITUDE CHART ============
    const enhancedAltitudeChart = {
        canvas: null,
        ctx: null,
        data: [],
        maxPoints: 100,
        
        init(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
        },
        
        resize() {
            if (!this.canvas) return;
            const rect = this.canvas.parentElement.getBoundingClientRect();
            this.canvas.width = rect.width || 200;
            this.canvas.height = rect.height || 60;
            this.draw();
        },
        
        update(ac) {
            if (!ac) {
                this.data = [];
                this.draw();
                return;
            }
            
            // Add new data point
            this.data.push({
                time: Date.now(),
                alt: ac.alt_baro === 'ground' ? 0 : (ac.alt_baro || 0),
                speed: ac.gs || 0,
                vspeed: ac.baro_rate || 0
            });
            
            // Trim to max points
            if (this.data.length > this.maxPoints) {
                this.data.shift();
            }
            
            this.draw();
        },
        
        loadFromHistory(ac) {
            if (!ac || !ac.history) {
                this.data = [];
                this.draw();
                return;
            }
            
            this.data = ac.history.slice(-this.maxPoints).map(h => ({
                time: h[3] || Date.now(),
                alt: typeof h[2] === 'number' ? h[2] : 0,
                speed: 0,
                vspeed: 0
            }));
            
            // Add current state
            if (ac.alt_baro !== undefined) {
                this.data.push({
                    time: Date.now(),
                    alt: ac.alt_baro === 'ground' ? 0 : (ac.alt_baro || 0),
                    speed: ac.gs || 0,
                    vspeed: ac.baro_rate || 0
                });
            }
            
            this.draw();
        },
        
        draw() {
            if (!this.ctx || !this.canvas) return;
            
            const w = this.canvas.width;
            const h = this.canvas.height;
            const padding = { top: 8, right: 35, bottom: 5, left: 5 };
            
            // Clear with background
            const bgColor = getComputedStyle(document.body).getPropertyValue('--bg-darker') || 'rgba(0,0,0,0.3)';
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(0, 0, w, h);
            
            if (this.data.length < 2) {
                this.ctx.fillStyle = '#666';
                this.ctx.font = '11px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('No altitude data', w / 2, h / 2);
                return;
            }
            
            // Calculate scales
            const altitudes = this.data.map(d => d.alt);
            const minAlt = Math.min(...altitudes);
            const maxAlt = Math.max(...altitudes);
            const altRange = Math.max(1000, maxAlt - minAlt + 1000);
            const altMin = Math.max(0, minAlt - 500);
            
            const chartW = w - padding.left - padding.right;
            const chartH = h - padding.top - padding.bottom;
            
            // Draw grid
            this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            this.ctx.lineWidth = 1;
            
            // Horizontal grid lines (altitude)
            const altStep = this.niceStep(altRange / 3);
            for (let alt = Math.ceil(altMin / altStep) * altStep; alt <= altMin + altRange; alt += altStep) {
                const y = padding.top + chartH - ((alt - altMin) / altRange * chartH);
                
                this.ctx.beginPath();
                this.ctx.moveTo(padding.left, y);
                this.ctx.lineTo(w - padding.right, y);
                this.ctx.stroke();
                
                // Label
                this.ctx.fillStyle = '#666';
                this.ctx.font = '9px sans-serif';
                this.ctx.textAlign = 'right';
                this.ctx.fillText((alt / 1000).toFixed(0) + 'k', w - 3, y + 3);
            }
            
            // Draw altitude line
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#00ffff';
            this.ctx.lineWidth = 2;
            
            this.data.forEach((d, i) => {
                const x = padding.left + (i / (this.data.length - 1)) * chartW;
                const y = padding.top + chartH - ((d.alt - altMin) / altRange * chartH);
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            });
            
            this.ctx.stroke();
            
            // Fill under line
            const lastX = padding.left + chartW;
            const lastY = padding.top + chartH - ((this.data[this.data.length - 1].alt - altMin) / altRange * chartH);
            this.ctx.lineTo(lastX, padding.top + chartH);
            this.ctx.lineTo(padding.left, padding.top + chartH);
            this.ctx.closePath();
            
            const gradient = this.ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
            gradient.addColorStop(0, 'rgba(0,255,255,0.3)');
            gradient.addColorStop(1, 'rgba(0,255,255,0)');
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            // Current value
            const current = this.data[this.data.length - 1];
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 10px sans-serif';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(
                `${Math.round(current.alt).toLocaleString()} ft`,
                padding.left + 3,
                padding.top + 10
            );
        },
        
        getFlightPhase(data) {
            if (!data) return { name: 'UNKNOWN', color: '#888' };
            if (data.alt < 500) return { name: 'GROUND', color: '#888' };
            if (data.vspeed > 500) return { name: 'CLIMBING', color: '#4ade80' };
            if (data.vspeed < -500) return { name: 'DESCENDING', color: '#f97316' };
            return { name: 'CRUISE', color: '#3b82f6' };
        },
        
        niceStep(range) {
            const steps = [1000, 2000, 5000, 10000, 20000];
            for (const step of steps) {
                if (range / step <= 5) return step;
            }
            return 10000;
        }
    };
    
    // Category badge helper for v3.3
    function getCategoryBadge(ac) {
        const category = ac.category || ac.interesting?.category;
        if (!category) return '';
        const catInfo = categoriesDB.getCategory(category);
        const color = catInfo?.color || categoriesDB.getCategoryColor(category);
        const description = catInfo?.description || category;
        return `<span class="category-badge" style="background-color: ${color}20; color: ${color}; border-color: ${color}40;" title="${description}">${category}</span>`;
    }
    function classifyAircraft(ac) {
        const hex = (ac.hex || '').toUpperCase(), type = (ac.t || '').toUpperCase(), cs = (ac.flight || '').toUpperCase(), alt = ac.alt_baro, cat = ac.category || '';
        // Ground check: only if explicitly 'ground' string, or BOTH very slow AND very low
        // alt===0 from API means "unknown" not "on ground", so don't use it alone
        // gs<30 alone catches hovering helicopters — require altitude confirmation
        if (alt === 'ground' || (typeof alt === 'number' && alt <= 50 && (ac.gs || 0) < 30)) return 'ground';
        
        // VIP check (highest priority)
        if (ac.isVIP || badgersBestDB.isVIP(hex)) return 'vip';
        
        // Cessna aircraft - classify as private (before any military checks)
        if (CESSNA_TYPES.some(t => type === t || type.startsWith(t + 'P') || type.startsWith(t + 'T'))) return 'private';
        
        // Beechcraft King Air / 1900 - classify as private (before military checks)
        if (BEECHCRAFT_TYPES.some(t => type === t || type.startsWith(t))) return 'private';
        
        // CSV database checks (high confidence — take priority over type-based heuristics)
        // This ensures military helicopters (UH-60, CH-47 etc.) get 'military' not 'helicopter'
        if (ac.interesting) { 
            const category = ac.interesting.category?.toLowerCase(); 
            if (category === 'military' || category === 'mil') return 'military';
            if (category === 'gov' || category === 'government') return 'government'; 
            if (category === 'police' || category === 'pol') return 'police'; 
            if (category === 'medical') return 'medical';
            if (category === 'pia') return 'pia';
        }
        if (ac.militaryInfo) { 
            const milCat = ac.militaryInfo.category?.toLowerCase(); 
            if (milCat === 'military' || milCat === 'mil') return 'military';
            if (milCat === 'gov' || milCat === 'government') return 'government'; 
            if (milCat === 'police' || milCat === 'pol') return 'police'; 
        }
        if (ac.piaInfo) return 'pia';
        if (ac.civilianInteresting) return 'interesting';
        
        // Military hex ranges (known ICAO allocations)
        if (ac.militaryRangeInfo) return 'military';
        
        // Helicopter check — AFTER database checks, BEFORE type-based military heuristics
        // This prevents Bell 212/A109/etc from hitting military prefix matches
        if (cat === 'A7' || HELI_TYPES.some(t => type === t || type.startsWith(t))) return 'helicopter';
        
        // NOTE: dbFlags bit 0 ("military") is NOT used for classification.
        // Tar1090-db sets this flag for government, contractor, and charter aircraft
        // used by military — it's too broad and causes false positives.
        // Real military aircraft are caught by the CSV databases and hex ranges above.
        
        // Military type codes (exact match — no false positives)
        if (MILITARY_TYPES_EXACT.includes(type)) return 'military';
        // Military type codes (prefix match — safe prefixes only, no civilian conflicts)
        if (MILITARY_TYPES.some(t => type.startsWith(t))) return 'military';
        
        if (CARGO_CALLSIGNS.some(c => cs.startsWith(c))) return 'cargo';
        if (MEDICAL_CALLSIGNS.some(c => cs.startsWith(c))) return 'medical';
        if (POLICE_CALLSIGNS.some(c => cs.startsWith(c))) return 'police';
        if (PRIVATE_TYPES.some(t => type.startsWith(t))) return 'private';
        return 'commercial';
    }
    function getAirlineCode(cs) { return cs?.length >= 3 && /^[A-Z]{3}$/.test(cs.substring(0, 3)) ? cs.substring(0, 3) : null; }
    async function fetchWithProxy(url, options = {}, proxyOnly = false) { if (!proxyOnly) { try { const r = await fetchWithTimeout(url, options); if (r?.ok) return r; } catch(e) {} } for (let i = 0; i < CONFIG.corsProxies.length; i++) { const idx = (lastSuccessfulProxy + i) % CONFIG.corsProxies.length; try { const r = await fetchWithTimeout(CONFIG.corsProxies[idx](url), {}); if (r?.ok) { lastSuccessfulProxy = idx; return r; } } catch(e) {} } return null; }
    async function fetchWithTimeout(url, options, timeout = 10000) { const controller = new AbortController(); const id = setTimeout(() => controller.abort(), timeout); try { const r = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); return r; } catch (e) { clearTimeout(id); throw e; } }
    function saveMapPosition() {
        if (!map) return;
        try {
            const c = map.getCenter();
            localStorage.setItem('skytrack_map', JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() }));
        } catch (e) { /* quota or privacy mode — not fatal */ }
    }
    function loadMapPosition() {
        try {
            const s = localStorage.getItem('skytrack_map');
            if (!s) return false;
            const p = JSON.parse(s);
            if (!p || typeof p !== 'object') return false;
            // Validate stored values so a corrupt entry cannot push the map
            // off-world or past Leaflet's zoom range.
            const lat = Number(p.lat), lng = Number(p.lng), zoom = Number(p.zoom);
            if (!Number.isFinite(lat) || lat < -85 || lat > 85) return false;
            if (!Number.isFinite(lng) || lng < -180 || lng > 180) return false;
            if (!Number.isFinite(zoom) || zoom < 2 || zoom > 19) return false;
            CONFIG.center = [lat, lng];
            CONFIG.zoom = zoom;
            return true;
        } catch (e) { /* corrupt storage */ }
        return false;
    }
    function saveAircraftCache() { try { const d = { ts: Date.now(), ac: {} }; const keys = Object.keys(aircraftCache); for (let i = 0; i < keys.length; i++) { const h = keys[i], a = aircraftCache[h]; d.ac[h] = { hex: a.hex, flight: a.flight, r: a.r, t: a.t, desc: a.desc, ownOp: a.ownOp, lat: a.lat, lon: a.lon, alt_baro: a.alt_baro, gs: a.gs, track: a.track, baro_rate: a.baro_rate, squawk: a.squawk, category: a.category, dbFlags: a.dbFlags, from: a.from, to: a.to, lastSeen: a.lastSeen, history: a.history?.slice(-50) || [] }; } localStorage.setItem('skytrack_aircraft', JSON.stringify(d)); } catch(e){} }
    function loadAircraftCache() { try { const s = localStorage.getItem('skytrack_aircraft'); if (s) { const d = JSON.parse(s); if (Date.now() - d.ts < CONFIG.cacheExpiry) { aircraftCache = d.ac; return true; } } } catch(e){} return false; }
    function saveSettings() { localStorage.setItem('skytrack_settings_v3', JSON.stringify(settings)); }
    function normalizeUiText(text) { return String(text ?? '').replace(/\.{3}/g, '…'); }
    function setToggleState(el, isOn) {
        if (!el) return;
        const enabled = !!isOn;
        el.classList.toggle('on', enabled);
        el.setAttribute('aria-checked', String(enabled));
    }
    function setExpandedState(el, expanded) {
        if (!el) return;
        el.setAttribute('aria-expanded', String(!!expanded));
    }
    function openOverlayModal(overlay) {
        if (!overlay) return;
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }
    function closeOverlayModal(overlay) {
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal-overlay.show')) {
            document.body.classList.remove('modal-open');
        }
    }
    const uiDialogs = {
        overlay: null,
        titleEl: null,
        messageEl: null,
        eyebrowEl: null,
        fieldEl: null,
        labelEl: null,
        inputEl: null,
        noteEl: null,
        closeBtn: null,
        cancelBtn: null,
        confirmBtn: null,
        active: null,
        lastFocused: null,
        init() {
            this.overlay = document.getElementById('systemDialog');
            if (!this.overlay) return;
            this.titleEl = document.getElementById('systemDialogTitle');
            this.messageEl = document.getElementById('systemDialogMessage');
            this.eyebrowEl = document.getElementById('systemDialogEyebrow');
            this.fieldEl = document.getElementById('systemDialogField');
            this.labelEl = document.getElementById('systemDialogLabel');
            this.inputEl = document.getElementById('systemDialogInput');
            this.noteEl = document.getElementById('systemDialogNote');
            this.closeBtn = document.getElementById('systemDialogClose');
            this.cancelBtn = document.getElementById('systemDialogCancel');
            this.confirmBtn = document.getElementById('systemDialogConfirm');

            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.cancel();
            });
            this.overlay.addEventListener('keydown', (e) => this.onKeydown(e));
            this.closeBtn?.addEventListener('click', () => this.cancel());
            this.cancelBtn?.addEventListener('click', () => this.cancel());
            this.confirmBtn?.addEventListener('click', () => this.confirm());
            this.inputEl?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.confirm();
                }
            });
        },
        onKeydown(e) {
            if (!this.active) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
                return;
            }
            if (e.key !== 'Tab') return;
            const focusables = Array.from(this.overlay.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])'))
                .filter(el => !el.closest('[hidden]'));
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        },
        resetValidation() {
            if (!this.fieldEl || !this.noteEl || !this.inputEl) return;
            this.fieldEl.classList.remove('has-error');
            this.inputEl.removeAttribute('aria-invalid');
            const note = this.active?.note ? normalizeUiText(this.active.note) : '';
            this.noteEl.textContent = note;
            this.noteEl.hidden = !note;
        },
        showValidation(message) {
            if (!this.fieldEl || !this.noteEl || !this.inputEl) return;
            this.fieldEl.classList.add('has-error');
            this.inputEl.setAttribute('aria-invalid', 'true');
            this.noteEl.hidden = false;
            this.noteEl.textContent = normalizeUiText(message);
            this.inputEl.focus();
            this.inputEl.select?.();
        },
        open(options = {}) {
            const kind = options.kind || 'prompt';
            if (!this.overlay) {
                return Promise.resolve(kind === 'confirm' ? false : kind === 'info' ? undefined : null);
            }
            // Capture the caller's focus BEFORE closing any prior dialog —
            // otherwise finish() re-focuses the previous trigger and we'd
            // record that element as "lastFocused" for the new dialog.
            const caller = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            if (this.active) this.finish(this.active.kind === 'confirm' ? false : this.active.kind === 'info' ? undefined : null);
            return new Promise(resolve => {
                this.lastFocused = caller;
                this.active = {
                    kind,
                    title: options.title || 'Confirm Action',
                    message: options.message || '',
                    eyebrow: options.eyebrow || '',
                    label: options.label || 'Value',
                    note: options.note || '',
                    placeholder: options.placeholder || '',
                    defaultValue: options.defaultValue ?? '',
                    inputType: options.inputType || 'text',
                    inputMode: options.inputMode || '',
                    min: options.min,
                    max: options.max,
                    step: options.step,
                    confirmLabel: options.confirmLabel || (kind === 'info' ? 'Done' : 'Continue'),
                    cancelLabel: options.cancelLabel || 'Cancel',
                    showCancel: options.showCancel ?? (kind !== 'info'),
                    tone: options.tone || 'accent',
                    validate: options.validate,
                    validationMessage: options.validationMessage || 'Check the value and try again.',
                    resolve
                };

                this.titleEl.textContent = normalizeUiText(this.active.title);
                this.messageEl.textContent = normalizeUiText(this.active.message);
                this.eyebrowEl.textContent = normalizeUiText(this.active.eyebrow);
                this.eyebrowEl.hidden = !this.active.eyebrow;
                this.fieldEl.hidden = kind !== 'prompt';
                this.labelEl.textContent = normalizeUiText(this.active.label);
                this.inputEl.type = this.active.inputType;
                this.inputEl.inputMode = this.active.inputMode || '';
                this.inputEl.value = String(this.active.defaultValue);
                this.inputEl.placeholder = normalizeUiText(this.active.placeholder);
                this.inputEl.autocomplete = 'off';
                this.inputEl.spellcheck = false;
                if (this.active.min !== undefined) this.inputEl.min = String(this.active.min); else this.inputEl.removeAttribute('min');
                if (this.active.max !== undefined) this.inputEl.max = String(this.active.max); else this.inputEl.removeAttribute('max');
                if (this.active.step !== undefined) this.inputEl.step = String(this.active.step); else this.inputEl.removeAttribute('step');
                this.cancelBtn.hidden = !this.active.showCancel;
                this.cancelBtn.textContent = normalizeUiText(this.active.cancelLabel);
                this.confirmBtn.textContent = normalizeUiText(this.active.confirmLabel);
                this.confirmBtn.dataset.tone = this.active.tone;
                this.resetValidation();

                openOverlayModal(this.overlay);
                setTimeout(() => {
                    if (!this.active) return;
                    if (kind === 'prompt') {
                        this.inputEl.focus();
                        this.inputEl.select?.();
                    } else {
                        this.confirmBtn.focus();
                    }
                }, 0);
            });
        },
        confirm() {
            if (!this.active) return;
            let result = true;
            if (this.active.kind === 'prompt') {
                const raw = this.inputEl.value.trim();
                if (!raw) {
                    this.showValidation(this.active.validationMessage);
                    return;
                }
                if (typeof this.active.validate === 'function') {
                    const validated = this.active.validate(raw);
                    if (validated === false || validated === null || validated === undefined) {
                        this.showValidation(this.active.validationMessage);
                        return;
                    }
                    result = validated === true ? raw : validated;
                } else {
                    result = raw;
                }
            }
            this.finish(result);
        },
        cancel() {
            if (!this.active) return;
            const fallback = this.active.kind === 'confirm' ? false : this.active.kind === 'info' ? undefined : null;
            this.finish(fallback);
        },
        finish(result) {
            if (!this.active) return;
            const { resolve } = this.active;
            this.active = null;
            closeOverlayModal(this.overlay);
            this.confirmBtn.removeAttribute('data-tone');
            resolve?.(result);
            if (this.lastFocused && document.contains(this.lastFocused)) {
                this.lastFocused.focus();
            }
        },
        prompt(options = {}) {
            return this.open({ ...options, kind: 'prompt' });
        },
        confirmDialog(options = {}) {
            return this.open({ ...options, kind: 'confirm' });
        },
        info(options = {}) {
            return this.open({ ...options, kind: 'info', showCancel: false });
        }
    };
    // Whitelist of filter values that are valid (mirrors marker filter logic
    // in _updateMarkersCore). Anything else in saved settings is dropped so a
    // stale/corrupt storage value cannot put the UI in an inconsistent state
    // where no filter chip matches what's currently applied.
    const _VALID_FILTERS = new Set(['all','commercial','cargo','military','government','police','medical','private','helicopter','interesting','pia','vip']);
    function loadSettings() {
        try {
            const s = localStorage.getItem('skytrack_settings_v3');
            if (!s) return;
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object') Object.assign(settings, parsed);
            if (!_VALID_FILTERS.has(settings.filter)) settings.filter = 'all';
        } catch (e) { /* corrupt storage → stick with defaults */ }
    }
    function loadBookmarks() { try { const s = localStorage.getItem('skytrack_bookmarks'); if (s) bookmarks = JSON.parse(s); } catch(e) { bookmarks = []; } renderBookmarks(); }
    function saveBookmarks() { localStorage.setItem('skytrack_bookmarks', JSON.stringify(bookmarks)); renderBookmarks(); }
    function addBookmark(name) { const c = map.getCenter(); bookmarks.push({ id: Date.now(), name, lat: c.lat, lng: c.lng, zoom: map.getZoom() }); saveBookmarks(); toast('Saved View: ' + name, 'success'); }
    function deleteBookmark(id) { bookmarks = bookmarks.filter(b => b.id !== id); saveBookmarks(); }
    function goToBookmark(id) { const b = bookmarks.find(x => x.id === id); if (b) { map.setView([b.lat, b.lng], b.zoom); toast('Opened View: ' + b.name); } }
    function renderBookmarks() {
        const list = document.getElementById('bookmarksList');
        if (!list) return;
        if (!bookmarks.length) { list.innerHTML = '<div class="bookmarks-empty">No saved views yet</div>'; return; }
        list.innerHTML = bookmarks.map(b => '<div class="bookmark-item" data-id="' + _escHtml(b.id) + '"><span class="bookmark-name">' + _escHtml(b.name) + '</span><button class="bookmark-delete" data-id="' + _escHtml(b.id) + '" aria-label="Delete saved view ' + _escHtml(b.name) + '">&times;</button></div>').join('');
        list.querySelectorAll('.bookmark-item').forEach(item => item.addEventListener('click', e => { if (!e.target.classList.contains('bookmark-delete')) goToBookmark(parseInt(item.dataset.id, 10)); }));
        list.querySelectorAll('.bookmark-delete').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); deleteBookmark(parseInt(btn.dataset.id, 10)); }));
    }
    function openBookmarkModal() {
        const overlay = document.getElementById('bookmarkModal');
        const input = document.getElementById('bookmarkNameInput');
        if (!overlay || !input) return;
        openOverlayModal(overlay);
        input.value = '';
        setTimeout(() => input.focus(), 0);
    }
    function closeBookmarkModal() {
        closeOverlayModal(document.getElementById('bookmarkModal'));
    }
    function loadApiCredentials() { try { const s = localStorage.getItem('skytrack_api_credentials'); apiCredentials = s ? JSON.parse(s) : { ...CONFIG.defaultCredentials }; } catch(e) { apiCredentials = { ...CONFIG.defaultCredentials }; } updateApiUI(); }
    function saveApiCredentials() { const cid = document.getElementById('apiClientId').value.trim(), cs = document.getElementById('apiClientSecret').value.trim(); if (!cid || !cs) { toast('Enter both fields'); return; } apiCredentials = { clientId: cid, clientSecret: cs }; localStorage.setItem('skytrack_api_credentials', JSON.stringify(apiCredentials)); updateApiUI(); toast('Saved'); }
    function clearApiCredentials() { apiCredentials = { ...CONFIG.defaultCredentials }; localStorage.removeItem('skytrack_api_credentials'); updateApiUI(); toast('Reset'); }
    function updateApiUI() {
        const idEl = document.getElementById('apiClientId');
        const secEl = document.getElementById('apiClientSecret');
        const s = document.getElementById('apiStatus');
        if (!idEl || !secEl || !s) return;
        idEl.value = apiCredentials.clientId || '';
        secEl.value = apiCredentials.clientSecret || '';
        const hasCustom = !!(apiCredentials.clientId && apiCredentials.clientId !== CONFIG.defaultCredentials.clientId);
        s.textContent = hasCustom ? 'Custom set' : 'Not configured';
        s.className = 'api-status ' + (hasCustom ? 'connected' : '');
    }
    async function getWikipediaSummary(url) { if (!settings.showWiki || !url) return null; try { const m = url.match(/wikipedia\.org\/wiki\/(.+)$/); if (!m) return null; const r = await fetchWithTimeout('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(decodeURIComponent(m[1])), {}, 5000); if (!r?.ok) return null; const d = await r.json(); return { title: d.title, extract: d.extract, thumbnail: d.thumbnail?.source, url }; } catch(e) { return null; } }
    function setLoadingProgress(pct, status) {
        document.getElementById('loadingProgress').style.width = pct + '%';
        document.getElementById('loadingStatus').textContent = normalizeUiText(status);
    }
    async function getInitialLocation() { if (loadMapPosition()) { setLoadingProgress(5, 'Restoring View…'); return; } if (!navigator.geolocation) { setLoadingProgress(5, 'Using Default View…'); return; } setLoadingProgress(3, 'Finding Your Location…'); return new Promise(resolve => { navigator.geolocation.getCurrentPosition(pos => { CONFIG.center = [pos.coords.latitude, pos.coords.longitude]; CONFIG.zoom = CONFIG.localZoom; setLoadingProgress(5, 'Location Ready'); resolve(); }, () => { setLoadingProgress(5, 'Using Default View…'); resolve(); }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }); }); }

    // ============ INITIALIZATION ============
    document.addEventListener('DOMContentLoaded', async () => {
        // Initialize IndexedDB first
        try {
            await skytrackDB.init();
            _dbg('IndexedDB initialized');
            
            // Clean up old trail history data
            await skytrackDB.clearOldData(7);
        } catch (e) {
            console.warn('IndexedDB not available, using localStorage fallback');
        }
        
        uiDialogs.init();
        loadSettings(); loadApiCredentials(); loadBookmarks();
        const hadCache = loadAircraftCache();
        await getInitialLocation();
        
        // Load databases in parallel batches for faster startup
        let dbsLoaded = 0;
        const totalDbs = 16;
        const trackDb = (name) => { dbsLoaded++; const pct = 5 + Math.round((dbsLoaded / totalDbs) * 73); setLoadingProgress(pct, name + '...'); };
        
        // Batch 1: Core databases (airports, types, registrations) - needed by enrichment
        setLoadingProgress(5, 'Loading core databases...');
        await Promise.allSettled([
            airportDB.init().then(() => trackDb('Airports')),
            frequencyDB.init().then(() => trackDb('Frequencies')),
            aircraftTypeDB.init().then(() => trackDb('Aircraft types')),
            registrationDB.init().then(() => trackDb('Registrations')),
            airportCoordsDB.init().then(() => trackDb('Airport coords'))
        ]);
        
        // Batch 2: Classification databases (military, interesting, categories)
        setLoadingProgress(40, 'Loading classification data...');
        await Promise.allSettled([
            interestingDB.init().then(() => trackDb('Interesting')),
            categoriesDB.init().then(() => trackDb('Categories')),
            badgersBestDB.init().then(() => trackDb('VIP')),
            piaDB.init().then(() => trackDb('PIA')),
            militaryDB.init().then(() => trackDb('Military')),
            milRangesDB.init().then(() => trackDb('Military ranges')),
            civilianDB.init().then(() => trackDb('Civilian'))
        ]);
        
        // Batch 3: Supplementary databases (airlines, routes, images)
        setLoadingProgress(65, 'Loading supplementary data...');
        await Promise.allSettled([
            airlineDB.init().then(() => trackDb('Airlines')),
            callsignPrefixDB.init().then(() => trackDb('Callsign prefixes')),
            allianceDB.init().then(() => trackDb('Alliances')),
            routesDB.init().then(() => trackDb('Routes')),
            preloadedImagesDB.init().then(() => trackDb('Images'))
        ]);
        
        setLoadingProgress(80, 'Initializing map...');
        initMap(); initUI();
        
        // Phase 6: Initialize mini-map after main map
        miniMap.init();
        
        // Initialize keyboard shortcuts
        keyboardShortcuts.init();
        
        // Initialize theme manager
        themeManager.init();
        
        // Check URL params for shared flight links
        shareManager.checkUrlParams();
        shareManager.initPopstate();
        
        // Connectivity monitoring
        const _connDot = document.querySelector('#connectivityIndicator .connectivity-dot');
        const _connEl = document.getElementById('connectivityIndicator');
        let _lastDataTime = Date.now();
        function updateConnectivity(state) {
            if (!_connDot) return;
            _connDot.className = 'connectivity-dot ' + state;
            _connEl.title = state === 'online' ? 'Live' : state === 'stale' ? 'Data stale' : 'Offline - using cached data';
        }
        window.addEventListener('online', () => updateConnectivity('online'));
        window.addEventListener('offline', () => updateConnectivity('offline'));
        _setPausableInterval(() => {
            if (!navigator.onLine) { updateConnectivity('offline'); return; }
            if (Date.now() - _lastDataTime > 30000) updateConnectivity('stale');
        }, 10000, 'connectivity');
        // Hook into loadAircraft to track data freshness
        const _origLoadAircraft = loadAircraft;
        loadAircraft = async function() {
            try { 
                await _origLoadAircraft(); 
                _lastDataTime = Date.now(); 
                if (navigator.onLine) updateConnectivity('online'); 
            } catch(e) { 
                if (!navigator.onLine) updateConnectivity('offline'); 
                else updateConnectivity('stale');
                _dbg('loadAircraft error:', e.message);
            }
        };
        
        // Initialize statistics system
        statsSystem.init();
        
        // Load compact mode setting
        if (settings.compactMode) {
            document.body.classList.add('compact-mode');
        }
        
        // Load follow mode button state
        if (settings.followMode) {
            document.getElementById('followBtn')?.classList.add('active');
        }
        
        // Initialize alert system
        setLoadingProgress(82, 'Initializing alerts...');
        await alertSystem.init();
        
        // Set alert toggle states
        setToggleState(document.getElementById('toggleAlerts'), alertSystem.enabled);
        setToggleState(document.getElementById('toggleAlertSounds'), alertSystem.soundEnabled);
        setToggleState(document.getElementById('toggleNotifications'), alertSystem.notificationsEnabled);
        if (document.getElementById('militaryAlertRadius')) {
            document.getElementById('militaryAlertRadius').value = alertSystem.militaryAlertRadius;
        }
        
        if (hadCache && Object.keys(aircraftCache).length) {
            setLoadingProgress(85, 'Restoring aircraft...');
            Object.values(aircraftCache).forEach(ac => { ac._enriched = false; _enrichAircraft(ac, ac.hex); });
            updateCounts(); updateMarkersSync();
        }
        
        setLoadingProgress(95, 'Loading aircraft...');
        await loadAircraft();
        
        setLoadingProgress(100, 'Ready!');
        setTimeout(() => document.getElementById('loading').classList.add('hidden'), 300);
        
        _startFetchInterval();
        _setPausableInterval(saveAircraftCache, 30000, 'saveCache');
        // Update route progress every 10 seconds for selected aircraft
        _setPausableInterval(() => {
            if (selectedHex) {
                const ac = aircraftCache[selectedHex];
                if (ac && (ac.from || ac.to)) {
                    updateRouteDisplay(ac);
                }
            }
        }, 10000, 'routeProgress');
        
        // Phase 6: Periodic updates for visual features
        _setPausableInterval(() => {
            if (heatmapLayer.enabled) heatmapLayer.update();
        }, 15000, 'heatmap');
        _setPausableInterval(() => airportBoard.refresh(), 10000, 'airportBoard');
        _setPausableInterval(() => {
            if (view3D.enabled) view3D.updateAircraft();
        }, 6000, '3dView');
    });

    function initMap() {
        map = L.map('map', { center: CONFIG.center, zoom: CONFIG.zoom, zoomControl: true, preferCanvas: true, worldCopyJump: true });
        baseMaps['dark'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 });
        baseMaps['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
        baseMaps['google-streets'] = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] });
        baseMaps['google-satellite'] = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] });
        baseMaps['google-hybrid'] = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] });
        baseMaps['google-terrain'] = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] });
        currentBaseMap = settings.mapStyle && baseMaps[settings.mapStyle] ? settings.mapStyle : 'google-hybrid'; baseMaps[currentBaseMap].addTo(map); document.getElementById('mapStyleSelect').value = currentBaseMap;
        airportLayer = L.layerGroup().addTo(map);
        let moveTimeout; map.on('moveend', () => { clearTimeout(moveTimeout); moveTimeout = setTimeout(() => { loadAircraft(); if (settings.showAirports) updateAirportMarkers(); }, 800); saveMapPosition(); });
        map.on('zoomend', () => { if (settings.showAirports) updateAirportMarkers(); });
        map.on('click', () => { deselectAircraft(); _el('settingsPanel').classList.remove('show'); _el('airportPanel').classList.remove('show'); _el('statsPanel').classList.remove('show'); _el('statsBtn')?.classList.remove('active'); document.getElementById('comparisonPanel')?.classList.remove('show'); });
        if (settings.showAirports) updateAirportMarkers();
        // Notify feature modules that the Leaflet map is live. Modules defined
        // under src/modules/9x-*.js listen for this event to bootstrap.
        try {
            document.dispatchEvent(new CustomEvent('skytrack:map-ready', { detail: { map, baseMaps } }));
        } catch (_) { /* very old browsers */ }
    }

    function updateAirportMarkers() {
        if (!airportDB.loaded || !settings.showAirports) { airportLayer.clearLayers(); return; }
        const zoom = map.getZoom(); airportLayer.clearLayers(); if (zoom < 6) return;
        const bounds = map.getBounds(), airports = airportDB.findInBounds(bounds);
        const filtered = airports.filter(apt => { if (zoom >= 10) return true; if (zoom >= 8) return apt.type === 'large_airport' || apt.type === 'medium_airport'; return apt.type === 'large_airport'; }).slice(0, zoom >= 10 ? 200 : 100);
        filtered.forEach(apt => {
            const size = apt.type === 'large_airport' ? 24 : 18;
            const icon = L.divIcon({ className: 'airport-marker', html: '<div class="airport-icon ' + (apt.isMilitary ? 'military' : '') + ' ' + (apt.type !== 'large_airport' ? 'small' : '') + '"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>' + (zoom >= 9 ? '<div class="airport-label">' + (apt.iata || apt.icao) + '</div>' : ''), iconSize: [size, size], iconAnchor: [size/2, size/2] });
            const marker = L.marker([apt.lat, apt.lon], { icon }); marker.on('click', e => { L.DomEvent.stopPropagation(e); showAirportPanel(apt); }); airportLayer.addLayer(marker);
        });
    }

    function showAirportPanel(apt) {
        const panel = _el('airportPanel');
        panel._airport = apt; // Store for Flight Board access
        document.getElementById('airportHeader').className = 'airport-header' + (apt.isMilitary ? ' military' : '');
        document.getElementById('airportName').textContent = apt.name; document.getElementById('airportCodes').textContent = (apt.iata || '---') + ' / ' + apt.icao;
        document.getElementById('airportElev').textContent = apt.elevation ? apt.elevation + ' ft' : '---'; document.getElementById('airportCity').textContent = apt.city || '---'; document.getElementById('airportCountry').textContent = apt.country || '---';
        const typeMap = { large_airport: 'Large', medium_airport: 'Medium', small_airport: 'Small', seaplane_base: 'Seaplane' }; document.getElementById('airportType').textContent = typeMap[apt.type] || apt.type || '---';
        const offset = Math.round(apt.lon / 15); const now = new Date(); now.setHours(now.getUTCHours() + offset); document.getElementById('airportTime').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        
        // Flag loading with self-hosted fallback
        const flagImg = document.querySelector('#airportFlag img');
        if (apt.country) {
            const countryCode = apt.country.toLowerCase();
            const selfHostedUrl = CONFIG.flagUrl + countryCode + '.png';
            const externalUrl = 'https://flagcdn.com/w40/' + countryCode + '.png';
            flagImg.onerror = function() {
                if (this.src !== externalUrl) {
                    this.src = externalUrl;
                } else {
                    this.style.display = 'none';
                }
            };
            flagImg.onload = () => flagImg.style.display = 'block';
            flagImg.src = selfHostedUrl;
        } else {
            flagImg.style.display = 'none';
        }
        
        // Show frequencies
        const freqSection = document.getElementById('airportFrequencies');
        const freqList = document.getElementById('freqList');
        if (frequencyDB.loaded) {
            const freqs = frequencyDB.getByAirport(apt.icao);
            if (freqs.length > 0) {
                freqList.innerHTML = freqs.slice(0, 8).map(f =>
                    '<div class="freq-item"><div class="freq-type">' + _escHtml(f.type || f.description || '') + '</div><div class="freq-value">' + _escHtml(Number(f.frequency || 0).toFixed(3)) + '</div></div>'
                ).join('');
                freqSection.style.display = 'block';
            } else {
                freqSection.style.display = 'none';
            }
        } else {
            freqSection.style.display = 'none';
        }
        
        const photoDiv = document.getElementById('airportPhoto'); photoDiv.innerHTML = '<div class="no-photo">Loading Photo…</div>';
        const wikiSection = document.getElementById('airportWikiSection'); wikiSection.style.display = 'none';
        if (apt.wiki && settings.showWiki) {
            getWikipediaSummary(apt.wiki).then(wiki => {
                if (wiki) {
                    if (wiki.thumbnail) photoDiv.innerHTML = '<img src="' + _escHtml(wiki.thumbnail) + '" alt="' + _escHtml(apt.name) + '">';
                    document.getElementById('airportWikiSummary').textContent = wiki.extract ? wiki.extract.substring(0, 200) + '...' : '';
                    document.getElementById('airportWikiLink').href = wiki.url;
                    wikiSection.style.display = 'block';
                } else {
                    photoDiv.innerHTML = '<div class="no-photo">No Photo Available</div>';
                }
            });
        } else {
                photoDiv.innerHTML = '<div class="no-photo">No Photo Available</div>';
        }
        
        // Fetch and display weather
        const weatherDiv = document.getElementById('airportWeather');
        if (weatherDiv) {
            weatherDiv.innerHTML = '<div class="weather-loading">Loading weather...</div>';
            
            weatherSystem.getMETAR(apt.icao).then(metar => {
                if (metar) {
                    const catColor = weatherSystem.getFlightCategoryColor(metar.flightCategory);
                    let weatherHtml = '<div class="weather-header">' +
                        '<span class="weather-category" style="background:' + catColor + '">' + metar.flightCategory + '</span>' +
                        '<span class="weather-time">' + (metar.time ? new Date(metar.time).toLocaleTimeString() : '') + '</span>' +
                    '</div>' +
                    '<div class="weather-grid">' +
                        '<div class="weather-item"><span class="weather-label">Temperature</span><span class="weather-value">' + (metar.temp !== null ? metar.temp + ' C' : '---') + '</span></div>' +
                        '<div class="weather-item"><span class="weather-label">Dewpoint</span><span class="weather-value">' + (metar.dewpoint !== null ? metar.dewpoint + ' C' : '---') + '</span></div>' +
                        '<div class="weather-item"><span class="weather-label">Wind</span><span class="weather-value">' + weatherSystem.formatWind(metar.wind) + '</span></div>' +
                        '<div class="weather-item"><span class="weather-label">Visibility</span><span class="weather-value">' + (metar.visibility !== null ? metar.visibility + ' mi' : '---') + '</span></div>' +
                        '<div class="weather-item"><span class="weather-label">Altimeter</span><span class="weather-value">' + (metar.altimeter ? (metar.altimeter / 100).toFixed(2) + '"' : '---') + '</span></div>' +
                        '<div class="weather-item"><span class="weather-label">Ceiling</span><span class="weather-value">' + (metar.ceiling ? metar.ceiling.toLocaleString() + ' ft' : 'None') + '</span></div>' +
                    '</div>';
                    if (metar.weather) {
                        weatherHtml += '<div class="weather-alert">Weather: ' + _escHtml(metar.weather) + '</div>';
                    }
                    weatherHtml += '<div class="weather-raw">' + _escHtml(metar.raw) + '</div>';
                    weatherDiv.innerHTML = weatherHtml;
                } else {
                    weatherDiv.innerHTML = '<div class="weather-loading">Weather unavailable</div>';
                }
            });
        }
        
        // Phase 11: Load NOTAMs
        const notamsContainer = document.getElementById('airportNotams');
        if (notamsContainer) {
            notamsContainer.innerHTML = '<div class="notams-empty">Loading NOTAMs...</div>';
            notamsSystem.getForAirport(apt.icao).then(notams => {
                notamsContainer.innerHTML = notamsSystem.renderForPanel(notams);
            });
        }
        
        // Phase 11: Load LiveATC feeds
        liveATCSystem.renderForAirport(apt.icao);
        
        // Phase 11: Show runways
        runwayDisplay.show(apt);
        
        panel._airport = apt; panel.classList.add('show'); _el('infoPanel').classList.remove('show'); _el('settingsPanel').classList.remove('show');
    }

    // ============ AIRCRAFT DATA ============
    const gridFetch = {
        inProgress: false, abortController: null,
        generateGrid(bounds) {
            const center = bounds.getCenter();
            const n = bounds.getNorth(), s = bounds.getSouth(), e = bounds.getEast(), w = bounds.getWest();
            const latSpan = n - s, lonSpan = (e >= w) ? (e - w) : (360 - w + e);
            const spacingLat = 350/60, midLat = (n+s)/2;
            const spacingLon = 350 / (60 * Math.max(Math.cos(midLat * Math.PI/180), 0.1));
            if (latSpan < spacingLat && lonSpan < spacingLon) return [{lat:center.lat,lng:center.lng}];
            const pts=[], rows=Math.ceil(latSpan/spacingLat), cols=Math.ceil(lonSpan/spacingLon);
            const tot=(rows+1)*(cols+1), skip=tot>32?Math.ceil(tot/32):1;
            for(let r=0;r<=rows;r++){const lat=s+r*spacingLat;if(lat<-85||lat>85)continue;
                for(let cc=0;cc<=cols;cc++){if(skip>1&&((r*(cols+1)+cc)%skip)!==0)continue;
                    let lon=w+cc*spacingLon;if(lon>180)lon-=360;pts.push({lat,lng:lon});}}
            pts.sort((a,b)=>(Math.abs(a.lat-center.lat)+Math.abs(a.lng-center.lng))-(Math.abs(b.lat-center.lat)+Math.abs(b.lng-center.lng)));
            return pts;
        },
        async fetchPoint(source, point, signal) {
            const url=source.buildUrl(point,250);
            try{let r;if(source.cors!==false){try{r=await fetch(url,{signal,cache:'no-cache'});}catch(e){if(e.name==='AbortError')throw e;r=null;}}
                if(!r||!r.ok){r=await fetchWithProxy(url,{},true);}
                if(r?.ok){const d=await r.json();return source.parseResponse(d)||[];}}catch(e){if(e.name==='AbortError')throw e;}return[];
        }
    };
    async function loadAircraft() {
        if(!map)return; // Guard: map not yet initialized
        if(gridFetch.inProgress){if(gridFetch.abortController)gridFetch.abortController.abort();return;}
        if(Date.now()-lastFetchTime<2000)return;
        if(!offlineManager.isOnline){offlineManager.showCachedPositions();return;}
        gridFetch.abortController=new AbortController();const signal=gridFetch.abortController.signal;
        gridFetch.inProgress=true;fetchInProgress=true;
        const grid=gridFetch.generateGrid(map.getBounds()),single=grid.length===1;
        const corsSrc=dataSourceManager.sources.filter(s=>s.cors!==false&&s.status!=='unhealthy');
        let allSrc=[...corsSrc,...dataSourceManager.sources.filter(s=>s.cors===false&&s.status!=='unhealthy')];
        if(!allSrc.length){
            // All sources marked unhealthy — reset and retry rather than giving up
            dataSourceManager.sources.forEach(s=>{s.status='degraded';s.errorCount=Math.min(s.errorCount,3);});
            allSrc=[...dataSourceManager.sources];
        }
        if(!allSrc.length){_el('dataSource').textContent='No sources';gridFetch.inProgress=false;fetchInProgress=false;lastFetchTime=Date.now();return;}
        let success=false;const names=new Set();
        try{
            if(single){for(const src of allSrc){try{const ac=await gridFetch.fetchPoint(src,grid[0],signal);
                if(ac.length){processAircraftData(ac);const n=Object.keys(markers).length;
                    _el('dataSource').textContent=src.name+' - '+n+' aircraft';lastSuccessfulSource=src.key;success=true;
                    connectionMonitor.recordSuccess();dataSourceManager.recordSuccess(src);offlineManager.cachePositions();break;}}catch(e){if(e.name==='AbortError')break;dataSourceManager.recordFailure(src);}}}
            else{const nc=corsSrc.length||1;
                await Promise.all(grid.map((pt,i)=>{const src=corsSrc[i%nc]||allSrc[0];const delay=Math.floor(i/nc)*1050;
                    return new Promise(async resolve=>{if(delay>0)await new Promise(r=>setTimeout(r,delay));if(signal.aborted){resolve([]);return;}
                        try{const ac=await gridFetch.fetchPoint(src,pt,signal);names.add(src.name);
                            if(ac.length){processAircraftData(ac);success=true;dataSourceManager.recordSuccess(src);}
                            const n=Object.keys(markers).length;
                            _el('dataSource').textContent=[...names].join(' + ')+' - '+n+' aircraft';resolve(ac);
                        }catch(e){if(e.name!=='AbortError')dataSourceManager.recordFailure(src);resolve([]);}});}));
                if(success){connectionMonitor.recordSuccess();offlineManager.cachePositions();}}
            if(!success){_el('dataSource').textContent='No sources';connectionMonitor.recordFailure();}
        }catch(e){if(e.name!=='AbortError')connectionMonitor.recordFailure();}
        finally{lastFetchTime=Date.now();gridFetch.inProgress=false;fetchInProgress=false;}
    }

    // Enrich aircraft from static CSV databases (only runs once per aircraft)
    function _enrichAircraft(cached, hex) {
        if (cached._enriched) return;
        
        // Registration DB
        if (registrationDB.loaded) registrationDB.enrich(cached);
        
        // VIP (Badger's Best)
        if (badgersBestDB.loaded) {
            const vipData = badgersBestDB.getByHex(hex);
            if (vipData) {
                cached.isVIP = true;
                cached.interesting = vipData;
                if (!cached.ownOp && vipData.operator) cached.ownOp = vipData.operator;
            }
        }
        
        // Interesting aircraft
        if (interestingDB.loaded) {
            const interesting = interestingDB.getByHex(hex);
            if (interesting) {
                cached.interesting = cached.interesting || interesting;
                if (!cached.ownOp && interesting.operator) cached.ownOp = interesting.operator;
                if (!cached.desc && interesting.type) cached.desc = interesting.type;
            }
        }
        
        // PIA
        if (piaDB.loaded) {
            const piaInfo = piaDB.getByHex(hex);
            if (piaInfo) { cached.piaInfo = piaInfo; if (!cached.interesting) cached.interesting = piaInfo; }
        }
        
        // Military/Gov/Police
        if (militaryDB.loaded) {
            const milInfo = militaryDB.getByHex(hex);
            if (milInfo) {
                cached.militaryInfo = milInfo;
                if (!cached.interesting) cached.interesting = milInfo;
                if (!cached.ownOp && milInfo.operator) cached.ownOp = milInfo.operator;
            }
        }
        
        // Civilian interesting
        if (civilianDB.loaded) {
            const civData = civilianDB.getByHex(hex);
            if (civData) {
                cached.civilianInteresting = civData;
                if (!cached.interesting) cached.interesting = civData;
                if (!cached.ownOp && civData.operator) cached.ownOp = civData.operator;
            }
        }
        
        // Military hex ranges
        if (!cached.militaryInfo && milRangesDB.loaded) {
            const rangeInfo = milRangesDB.isMilitary(hex);
            if (rangeInfo) cached.militaryRangeInfo = rangeInfo;
        }
        
        // Airline name from callsign
        if (cached.flight) {
            if (callsignPrefixDB.loaded) {
                const prefixAirline = callsignPrefixDB.getAirline(cached.flight);
                if (prefixAirline) cached.airlineName = prefixAirline;
            }
            if (!cached.airlineName && airlineDB.loaded) cached.airlineName = airlineDB.getAirlineName(cached.flight);
            if (cached.airlineName && allianceDB.loaded) cached.alliance = allianceDB.getAlliance(cached.airlineName);
        }
        
        // Preloaded images
        if (preloadedImagesDB.hasImage(hex)) cached.preloadedImage = preloadedImagesDB.getFirstImage(hex);
        
        // Classify
        cached.category_type = classifyAircraft(cached);
        cached._enriched = true;
    }

    function processAircraftData(aircraft) {
        const now = Date.now();
        aircraft.forEach(ac => {
            try {
            if (!ac.hex) return; const hex = ac.hex.toUpperCase(); const existing = aircraftCache[hex];
            
            if (existing) {
                // Update mutable fields in-place (no object allocation)
                const callsignChanged = ac.flight?.trim() && ac.flight.trim() !== existing.flight;
                if (ac.flight?.trim()) existing.flight = ac.flight.trim();
                if (ac.r) existing.r = ac.r;
                if (ac.t) existing.t = ac.t;
                if (ac.desc) existing.desc = ac.desc;
                if (ac.ownOp || ac.operator) existing.ownOp = ac.ownOp || ac.operator || existing.ownOp;
                if (ac.lat !== undefined) existing.lat = ac.lat;
                if (ac.lon !== undefined) existing.lon = ac.lon;
                if (ac.alt_baro !== undefined) existing.alt_baro = ac.alt_baro;
                if (ac.gs !== undefined) existing.gs = ac.gs;
                if (ac.track !== undefined) existing.track = ac.track;
                if (ac.baro_rate !== undefined) existing.baro_rate = ac.baro_rate;
                if (ac.squawk) existing.squawk = ac.squawk;
                if (ac.category) existing.category = ac.category;
                if (ac.dbFlags !== undefined) existing.dbFlags = ac.dbFlags;
                if (ac.from) existing.from = ac.from;
                if (ac.to) existing.to = ac.to;
                existing.lastSeen = now;
                
                // Append to position history
                if (ac.lat !== undefined && ac.lon !== undefined) {
                    const last = existing.history[existing.history.length - 1];
                    if (!last || last[0] !== ac.lat || last[1] !== ac.lon) {
                        existing.history.push([ac.lat, ac.lon, ac.alt_baro || 0, now]);
                        if (existing.history.length > 300) existing.history.shift();
                    }
                }
                
                // Re-resolve airline if callsign changed
                if (callsignChanged && existing.flight) {
                    existing.airlineName = null; existing.alliance = null;
                    if (callsignPrefixDB.loaded) { const a = callsignPrefixDB.getAirline(existing.flight); if (a) existing.airlineName = a; }
                    if (!existing.airlineName && airlineDB.loaded) existing.airlineName = airlineDB.getAirlineName(existing.flight);
                    if (existing.airlineName && allianceDB.loaded) existing.alliance = allianceDB.getAlliance(existing.airlineName);
                }
                
                // Re-classify (depends on mutable fields like altitude, squawk)
                existing.category_type = classifyAircraft(existing);
                alertSystem.checkAircraft(existing);
            } else {
                // New aircraft — full initialization + enrichment
                const history = [];
                if (ac.lat !== undefined && ac.lon !== undefined) history.push([ac.lat, ac.lon, ac.alt_baro || 0, now]);
                const cached = { hex, flight: (ac.flight?.trim()) || '', r: ac.r || '', t: ac.t || '', desc: ac.desc || '', ownOp: ac.ownOp || ac.operator || '',
                    lat: ac.lat, lon: ac.lon, alt_baro: ac.alt_baro, gs: ac.gs, track: ac.track, baro_rate: ac.baro_rate,
                    squawk: ac.squawk || '', category: ac.category || '', dbFlags: ac.dbFlags, from: ac.from || '', to: ac.to || '',
                    lastSeen: now, history, category_type: null, interesting: null, airlineName: null, militaryInfo: null, piaInfo: null, alliance: null, militaryRangeInfo: null, year: null, isVIP: false, civilianInteresting: null, _enriched: false };
                aircraftCache[hex] = cached;
                
                // Full enrichment (only runs once per aircraft)
                _enrichAircraft(cached, hex);
            }
            } catch(e) { _dbg('Error processing aircraft', ac?.hex, e); }
        });
        const staleTime = now - 300000; Object.keys(aircraftCache).forEach(hex => { if (aircraftCache[hex].lastSeen < staleTime) { delete aircraftCache[hex]; if (markers[hex]) { map.removeLayer(markers[hex]); delete markers[hex]; } delete _iconCache[hex]; delete aircraftAnimation[hex]; delete photoCache[hex]; delete photoFailCache[hex]; } });
        updateCounts(); updateMarkersSync();
        
        // Update watchlist active status
        alertSystem.updateWatchlistUI();
        
        // Follow mode - keep selected aircraft centered
        if (settings.followMode && selectedHex) {
            const ac = aircraftCache[selectedHex];
            if (ac?.lat !== undefined) {
                const currentCenter = map.getCenter();
                const distance = map.distance(currentCenter, [ac.lat, ac.lon]);
                if (distance > 500) {
                    map.panTo([ac.lat, ac.lon], { animate: true, duration: 0.5 });
                }
            }
        }
        
        // Phase 6: Update mini-map aircraft positions
        miniMap.updateAircraft();
        
        // Phase 9: Record statistics
        statsSystem.recordRefresh(aircraft);
    }

    function updateCounts() {
        const counts = { all: 0, commercial: 0, military: 0, government: 0, police: 0, medical: 0, cargo: 0, private: 0, helicopter: 0, ground: 0, interesting: 0, pia: 0, vip: 0 };
        Object.values(aircraftCache).forEach(ac => { 
            counts.all++; 
            if (counts[ac.category_type] !== undefined) counts[ac.category_type]++; 
            if (ac.interesting || ac.militaryInfo || ac.civilianInteresting) counts.interesting++;
            if (ac.piaInfo) counts.pia++;
            if (ac.isVIP) counts.vip++;
        });
        _el('countAll').textContent = counts.all; _el('countComm').textContent = counts.commercial; _el('countMil').textContent = counts.military;
        _el('countGov').textContent = counts.government; _el('countCargo').textContent = counts.cargo; _el('countPrivate').textContent = counts.private;
        _el('countHeli').textContent = counts.helicopter; _el('countInteresting').textContent = counts.interesting;
        _el('countPIA').textContent = counts.pia;
        _el('countVIP').textContent = counts.vip;
    }

    let _updateMarkersRaf = 0;
    function _updateMarkersCore() {
        if (!map) return;
        const bounds = map.getBounds();
        const zoom = map.getZoom();
        
        // Grid-based decimation at low zoom to prevent rendering thousands of markers
        let decimationGrid = null;
        if (zoom < 7) {
            decimationGrid = {};
            const cellSize = zoom < 4 ? 2.0 : zoom < 5 ? 1.0 : zoom < 6 ? 0.5 : 0.25;
            Object.values(aircraftCache).forEach(ac => {
                if (ac.lat === undefined || ac.lon === undefined) return;
                // Always show selected, VIP, military, interesting
                if (ac.hex === selectedHex || ac.isVIP || ac.interesting || ac.militaryInfo || ac.piaInfo) return;
                const key = Math.floor(ac.lat / cellSize) + ',' + Math.floor(ac.lon / cellSize);
                if (!decimationGrid[key]) decimationGrid[key] = ac.hex;
                else {
                    // Keep the one with higher altitude (more visible/interesting)
                    const existing = aircraftCache[decimationGrid[key]];
                    if (existing && (ac.alt_baro || 0) > (existing.alt_baro || 0)) {
                        decimationGrid[key] = ac.hex;
                    }
                }
            });
            // Build set of hexes that won the grid cell
            const winners = new Set(Object.values(decimationGrid));
            // Decorate: mark losers
            decimationGrid._winners = winners;
        }
        
        Object.values(aircraftCache).forEach(ac => {
            if (ac.lat === undefined || ac.lon === undefined) return;
            // Check search filters first
            if (typeof searchSystem !== 'undefined' && !searchSystem.passesFilters(ac)) {
                if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; }
                return;
            }
            if (settings.filter !== 'all') { 
                if (settings.filter === 'vip') {
                    if (!ac.isVIP && !badgersBestDB.isVIP(ac.hex)) { if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; } return; }
                } else if (settings.filter === 'interesting') { 
                    if (!ac.interesting && !ac.militaryInfo && !ac.civilianInteresting) { if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; } return; } 
                } else if (settings.filter === 'pia') {
                    if (!ac.piaInfo) { if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; } return; }
                } else if (ac.category_type !== settings.filter) { if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; } return; } 
            }
            if (!bounds.pad(0.2).contains([ac.lat, ac.lon])) { if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; } return; }
            // Decimation: skip non-priority aircraft that lost their grid cell
            if (decimationGrid && ac.hex !== selectedHex && !ac.isVIP && !ac.interesting && !ac.militaryInfo && !ac.piaInfo) {
                if (!decimationGrid._winners.has(ac.hex)) {
                    if (markers[ac.hex]) { map.removeLayer(markers[ac.hex]); delete markers[ac.hex]; delete aircraftAnimation[ac.hex]; }
                    return;
                }
            }
            if (markers[ac.hex]) updateMarker(ac); else createMarker(ac);
        });
    }
    // Coalesced wrapper: multiple rapid calls collapse to one rAF
    function updateMarkers() { if (_updateMarkersRaf) return; _updateMarkersRaf = requestAnimationFrame(() => { _updateMarkersRaf = 0; _updateMarkersCore(); }); }
    // Synchronous version for processAircraftData (needs immediate update after new data)
    function updateMarkersSync() { if (_updateMarkersRaf) { cancelAnimationFrame(_updateMarkersRaf); _updateMarkersRaf = 0; } _updateMarkersCore(); }

    function createMarker(ac) { const marker = L.marker([ac.lat, ac.lon], { icon: createIcon(ac), zIndexOffset: getZIndex(ac) }); marker.on('click', e => { L.DomEvent.stopPropagation(e); if (e.originalEvent?.ctrlKey || e.originalEvent?.metaKey) { if (!multiSelect.enabled) { multiSelect.enabled = true; document.getElementById('multiSelectBtn')?.classList.add('active'); document.body.classList.add('multi-select-mode'); multiSelect.showToolbar(); toast('Multi-select ON - Ctrl+click to select more'); } multiSelect.toggleSelection(ac.hex); return; } selectAircraft(ac.hex); }); marker.addTo(map); markers[ac.hex] = marker; }
    function updateMarker(ac) { const marker = markers[ac.hex]; if (!marker) return; const hash = _iconHash(ac); const cached = _iconCache[ac.hex]; const iconChanged = !cached || cached.hash !== hash; const pos = marker.getLatLng(); if (Math.abs(pos.lat - ac.lat) + Math.abs(pos.lng - ac.lon) < 0.00001) { if (iconChanged) { marker.setIcon(createIcon(ac)); marker.setZIndexOffset(getZIndex(ac)); } return; } aircraftAnimation[ac.hex] = { startLat: pos.lat, startLon: pos.lng, targetLat: ac.lat, targetLon: ac.lon, startTime: performance.now(), duration: CONFIG.refreshInterval * 0.95 }; if (iconChanged) { marker.setIcon(createIcon(ac)); marker.setZIndexOffset(getZIndex(ac)); } if (!animationRunning) { animationRunning = true; requestAnimationFrame(animateAircraft); } }
    function animateAircraft(ts) { let active = false; Object.entries(aircraftAnimation).forEach(([hex, a]) => { const m = markers[hex]; if (!m) { delete aircraftAnimation[hex]; return; } const p = Math.min((ts - a.startTime) / a.duration, 1); if (p < 1) { active = true; const lat = a.startLat + (a.targetLat - a.startLat) * p, lon = a.startLon + (a.targetLon - a.startLon) * p; m.setLatLng([lat, lon]); if (hex === selectedHex && trailLine?._lastSegment) { const ll = trailLine._lastSegment.getLatLngs(); if (ll.length) { ll[ll.length - 1] = L.latLng(lat, lon); trailLine._lastSegment.setLatLngs(ll); } } } else { m.setLatLng([a.targetLat, a.targetLon]); delete aircraftAnimation[hex]; } }); if (active) requestAnimationFrame(animateAircraft); else animationRunning = false; }
    // ============ TAR1090 SPRITE ICON SYSTEM ============
    const SPRITE_URL = 'https://raw.githubusercontent.com/SysAdminDoc/SkyTrack/refs/heads/main/assets/silhouettes/aircraft.png';
    
    // Sprite sheet: 16 cols x 6 rows, 86x86px each
    const SPRITE_INDEX = {
        'a319':0,'a320':1,'a321':2,'p8':3,'e737':4,'b737':5,'b738':6,'b739':7,
        'airliner':8,'blimp':9,'balloon':10,'cessna':11,'a359':12,'a332':13,'heavy_2e':14,'md11':15,
        'c130':16,'hi_perf':17,'f18':18,'e3awacs':19,'heavy_4e':20,'single_turbo':21,'jet_nonswept':22,'jet_swept':23,
        'twin_large':24,'twin_small':25,'alpha_jet':26,'a225':27,'a400':28,'v22_slow':29,'v22_fast':30,'t38':31,
        'f35':32,'l159':33,'mirage':34,'sb39':35,'md_a4':36,'tornado':37,'uav':38,'typhoon':39,
        'rafale':40,'hunter':41,'lancaster':42,'beluga':43,'c17':44,'c5':45,'super_guppy':46,'wb57':47,
        'a380':48,'il_62':49,'u2':50,'glider':51,'p3_orion':52,'cirrus_sr22':53,'verhees':54,'gyrocopter':55,
        'helicopter':56,'pa24':57,'bae_hawk':58,'a10':59,'chinook':60,'apache':61,'blackhawk':62,'s61':63,
        'f5_tiger':64,'c2':65,'b52':66,'b707':67,'rutan_veze':68,'pumpkin':69,'witchr':70,'witchl':71,
        'm326':72,'miragef1':73,'unknown':74,'ground_square':75,'ground_emergency':76,'ground_service':77,'ground_unknown':78,'ground_fixed':79,
        'ground_tower':80,'puma':81,'tiger':82,'mil24':83,'dauphin':84,'gazelle':85,'md_f15':86,'strato':87,
        'asterisk':88,'b1b_lancer':89,'para':90,'e390':91
    };
    const NO_ROTATE_ICONS = new Set(['balloon','blimp','ground_square','ground_emergency','ground_service','ground_unknown','ground_fixed','ground_tower','asterisk']);

    const TYPE_DESIGNATOR_ICONS = {
        'SHIP':'blimp','BALL':'balloon','A318':'a319','A319':'a319','A19N':'a319','A320':'a320','A20N':'a320','A321':'a321','A21N':'a321',
        'A306':'heavy_2e','A330':'a332','A332':'a332','A333':'a332','A338':'a332','A339':'a332','DC10':'md11','MD11':'md11',
        'A359':'a359','A35K':'a359','A388':'a380','B731':'b737','B732':'b737','B735':'b737','B733':'b737','B734':'b737',
        'B736':'b737','B737':'b737','B738':'b738','B739':'b739','B37M':'b737','B38M':'b738','B39M':'b739','B3XM':'b739',
        'P8':'p8','E737':'e737','J328':'airliner','E170':'airliner','E75S':'airliner','E75L':'airliner','A148':'airliner',
        'RJ70':'b707','RJ85':'b707','RJ1H':'b707','B461':'b707','B462':'b707','B463':'b707',
        'E190':'airliner','E195':'airliner','E290':'airliner','E295':'airliner','BCS1':'airliner','BCS3':'airliner',
        'B741':'heavy_4e','B742':'heavy_4e','B743':'heavy_4e','B744':'heavy_4e','B74D':'heavy_4e','B74S':'heavy_4e','B74R':'heavy_4e','BLCF':'heavy_4e','BSCA':'heavy_4e','B748':'heavy_4e',
        'B752':'heavy_2e','B753':'heavy_2e','B772':'heavy_2e','B773':'heavy_2e','B77L':'heavy_2e','B77W':'heavy_2e',
        'B701':'b707','B703':'b707','K35R':'b707','K35E':'b707',
        'FA20':'jet_swept','C680':'jet_swept','C68A':'jet_swept','C750':'jet_swept','F2TH':'jet_swept','FA50':'jet_swept','CL30':'jet_swept','CL35':'jet_swept',
        'F900':'jet_swept','CL60':'jet_swept','G200':'jet_swept','G280':'jet_swept','HA4T':'jet_swept','FA7X':'jet_swept','FA8X':'jet_swept',
        'GLF2':'jet_swept','GLF3':'jet_swept','GLF4':'jet_swept','GA5C':'jet_swept','GL5T':'jet_swept','GLF5':'jet_swept','GA6C':'jet_swept',
        'GLEX':'jet_swept','GL6T':'jet_swept','GLF6':'jet_swept','GA7C':'jet_swept','GA8C':'jet_swept','GL7T':'jet_swept',
        'E135':'jet_swept','E35L':'jet_swept','E145':'jet_swept','E45X':'jet_swept','E390':'e390',
        'CRJ1':'jet_swept','CRJ2':'jet_swept','CRJ7':'jet_swept','CRJ9':'jet_swept','CRJX':'jet_swept','F100':'jet_swept',
        'F28':'jet_swept','F70':'jet_swept','DC91':'jet_swept','DC92':'jet_swept','DC93':'jet_swept','DC94':'jet_swept','DC95':'jet_swept',
        'MD80':'jet_swept','MD81':'jet_swept','MD82':'jet_swept','MD83':'jet_swept','MD87':'jet_swept','MD88':'jet_swept','MD90':'jet_swept',
        'B712':'jet_swept','B721':'jet_swept','B722':'jet_swept','T154':'jet_swept',
        'BE40':'jet_nonswept','FA10':'jet_nonswept','C501':'jet_nonswept','C510':'jet_nonswept','C25A':'jet_nonswept','C25B':'jet_nonswept','C25C':'jet_nonswept',
        'C525':'jet_nonswept','C550':'jet_nonswept','C560':'jet_nonswept','C56X':'jet_nonswept',
        'LJ23':'jet_nonswept','LJ24':'jet_nonswept','LJ25':'jet_nonswept','LJ28':'jet_nonswept','LJ31':'jet_nonswept','LJ35':'jet_nonswept','LR35':'jet_nonswept',
        'LJ40':'jet_nonswept','LJ45':'jet_nonswept','LR45':'jet_nonswept','LJ55':'jet_nonswept','LJ60':'jet_nonswept','LJ70':'jet_nonswept','LJ75':'jet_nonswept','LJ85':'jet_nonswept',
        'C650':'jet_nonswept','ASTR':'jet_nonswept','G150':'jet_nonswept','H25A':'jet_nonswept','H25B':'jet_nonswept','H25C':'jet_nonswept',
        'PRM1':'jet_nonswept','E55P':'jet_nonswept','E50P':'jet_nonswept','EA50':'jet_nonswept','HDJT':'jet_nonswept','SF50':'jet_nonswept',
        'C97':'super_guppy','SGUP':'super_guppy','A3ST':'beluga','A337':'beluga','WB57':'wb57',
        'A37':'hi_perf','A700':'hi_perf','LEOP':'hi_perf','ME62':'hi_perf','T2':'hi_perf','T37':'hi_perf','T38':'t38','F104':'t38','A10':'a10',
        'A3':'hi_perf','A6':'hi_perf','AJET':'alpha_jet','AT3':'hi_perf','CKUO':'hi_perf','EUFI':'typhoon','SB39':'sb39',
        'MIR2':'mirage','KFIR':'mirage','F1':'hi_perf','F111':'hi_perf','F117':'hi_perf','F14':'hi_perf',
        'F15':'md_f15','F16':'hi_perf','F18':'f18','F18H':'f18','F18S':'f18','F22':'f35','F22A':'f35','F35':'f35','VF35':'f35',
        'L159':'l159','L39':'l159','F4':'hi_perf','F5':'f5_tiger','HUNT':'hunter','LANC':'lancaster','B17':'lancaster','B29':'lancaster',
        'J8A':'hi_perf','J8B':'hi_perf','JH7':'hi_perf','LTNG':'hi_perf','M346':'hi_perf','METR':'hi_perf',
        'MG19':'hi_perf','MG25':'hi_perf','MG29':'hi_perf','MG31':'hi_perf','MG44':'hi_perf','MIR4':'hi_perf',
        'RFAL':'rafale','S3':'hi_perf','SR71':'hi_perf','SU15':'hi_perf','SU24':'hi_perf','SU25':'hi_perf','SU27':'hi_perf',
        'T22M':'hi_perf','T4':'hi_perf','TOR':'tornado','A4':'md_a4','TU22':'hi_perf','VAUT':'hi_perf',
        'MRF1':'miragef1','M326':'m326','M339':'m326','FOUG':'m326','T33':'m326',
        'A225':'a225','A124':'b707','SLCH':'strato','WHK2':'strato','C130':'c130','C30J':'c130','P3':'p3_orion','PARA':'para',
        'DRON':'uav','Q1':'uav','Q4':'uav','Q9':'uav','Q25':'uav','HRON':'uav','A400':'a400',
        'V22F':'v22_fast','V22':'v22_slow','H64':'apache','H60':'blackhawk','S92':'blackhawk','NH90':'blackhawk',
        'AS32':'puma','AS3B':'puma','PUMA':'puma','TIGR':'tiger','MI24':'mil24',
        'AS65':'dauphin','S76':'dauphin','GAZL':'gazelle','AS50':'gazelle','AS55':'gazelle','ALO2':'gazelle','ALO3':'gazelle',
        'R22':'helicopter','R44':'helicopter','R66':'helicopter',
        'EC55':'s61','A169':'s61','H160':'s61','A139':'s61','EC75':'s61','A189':'s61','A149':'s61','S61':'s61','S61R':'s61','EC25':'s61','EH10':'s61','H53':'s61','H53S':'s61',
        'U2':'u2','C2':'c2','E2':'c2','H47':'chinook','H46':'chinook','HAWK':'bae_hawk',
        'GYRO':'gyrocopter','DLTA':'verhees','B1':'b1b_lancer','B52':'b52','C17':'c17','C5M':'c5','E3TF':'e3awacs','E3CF':'e3awacs',
        'GLID':'glider','S6':'glider','S10S':'glider','S12':'glider',
        'BE20':'twin_large','IL62':'il_62','SR20':'cirrus_sr22','SR22':'cirrus_sr22','S22T':'cirrus_sr22',
        'VEZE':'rutan_veze','VELO':'rutan_veze','PA24':'pa24',
        'B752':'heavy_2e','B753':'heavy_2e','B762':'heavy_2e','B763':'heavy_2e','B764':'heavy_2e',
        'B788':'heavy_2e','B789':'heavy_2e','B78X':'heavy_2e',
        'GND':'ground_unknown','GRND':'ground_unknown','SERV':'ground_service','EMER':'ground_emergency','TWR':'ground_tower'
    };

    const TYPE_DESC_ICONS = {
        'H':'helicopter','G':'gyrocopter','L1P':'cessna','A1P':'cessna','L1T':'single_turbo','L1J':'hi_perf',
        'L2P':'twin_small','A2P':'twin_large','L2T':'twin_large','A2T':'twin_large',
        'L2J-L':'jet_nonswept','L2J-M':'airliner','L2J-H':'heavy_2e','L3J-H':'md11',
        'L4T-M':'c130','L4T-H':'c130','L4T':'c130','L4J-H':'b707','L4J-M':'b707','L4J':'b707'
    };

    const CATEGORY_ICONS = {
        'A1':'cessna','A2':'jet_swept','A3':'airliner','A4':'airliner','A5':'heavy_2e','A6':'hi_perf','A7':'helicopter',
        'B1':'glider','B2':'balloon','B4':'cessna','B6':'uav',
        'C0':'ground_unknown','C1':'ground_emergency','C2':'ground_service','C3':'ground_tower'
    };

    // Preload sprite sheet
    const spriteImg = new Image();
    spriteImg.src = SPRITE_URL;

    function getSpriteIcon(ac) {
        const type = (ac.t || '').toUpperCase();
        const cat = ac.category || '';
        const desc = ac.desc || '';
        
        if (type && TYPE_DESIGNATOR_ICONS[type]) {
            const n = TYPE_DESIGNATOR_ICONS[type];
            return { idx: SPRITE_INDEX[n] ?? 74, name: n, noRotate: NO_ROTATE_ICONS.has(n) };
        }
        // Type description lookup - only for ICAO format strings (L2J, H, L1P, etc.)
        const isIcaoDesc = desc.length <= 4 && /^[LAGHS]\d?[PJTEHR]?$/.test(desc);
        if (isIcaoDesc) {
            const wtcMap = { 'A5':'H','A4':'M','A3':'M','A2':'L','A1':'L' };
            const wtc = wtcMap[cat] || '';
            if (wtc && desc.length === 3) {
                const k = desc + '-' + wtc;
                if (TYPE_DESC_ICONS[k]) { const n = TYPE_DESC_ICONS[k]; return { idx: SPRITE_INDEX[n] ?? 74, name: n, noRotate: NO_ROTATE_ICONS.has(n) }; }
            }
            if (TYPE_DESC_ICONS[desc]) { const n = TYPE_DESC_ICONS[desc]; return { idx: SPRITE_INDEX[n] ?? 74, name: n, noRotate: NO_ROTATE_ICONS.has(n) }; }
            const b = desc.charAt(0);
            if (TYPE_DESC_ICONS[b]) { const n = TYPE_DESC_ICONS[b]; return { idx: SPRITE_INDEX[n] ?? 74, name: n, noRotate: NO_ROTATE_ICONS.has(n) }; }
        }
        if (cat && CATEGORY_ICONS[cat]) {
            const n = CATEGORY_ICONS[cat];
            return { idx: SPRITE_INDEX[n] ?? 74, name: n, noRotate: NO_ROTATE_ICONS.has(n) };
        }
        if (ac.alt_baro === 'ground' || ac.alt_baro === 0) {
            return { idx: SPRITE_INDEX['ground_square'], name: 'ground_square', noRotate: true };
        }
        return { idx: 74, name: 'unknown', noRotate: false };
    }

    function getAltitudeCSSFilter(alt, selected) {
        if (selected) return 'brightness(0) invert(1) sepia(1) saturate(10) hue-rotate(140deg) brightness(1.2) drop-shadow(0 0 6px cyan) drop-shadow(0 0 12px cyan)';
        if (alt === 'ground' || alt === 0) return 'brightness(0) invert(0.55) sepia(0.3) saturate(0.5)';
        if (typeof alt !== 'number') return 'brightness(0) invert(0.85)';
        const a = Math.max(0, Math.min(alt, 50000));
        if (a < 1000) return 'brightness(0) invert(0.6) sepia(1) saturate(4) hue-rotate(65deg)';
        if (a < 5000) return 'brightness(0) invert(0.7) sepia(1) saturate(5) hue-rotate(50deg)';
        if (a < 10000) return 'brightness(0) invert(0.8) sepia(1) saturate(5) hue-rotate(30deg)';
        if (a < 15000) return 'brightness(0) invert(0.85) sepia(1) saturate(5) hue-rotate(10deg)';
        if (a < 20000) return 'brightness(0) invert(0.7) sepia(1) saturate(8) hue-rotate(0deg)';
        if (a < 25000) return 'brightness(0) invert(0.6) sepia(1) saturate(8) hue-rotate(340deg)';
        if (a < 30000) return 'brightness(0) invert(0.5) sepia(1) saturate(10) hue-rotate(325deg)';
        if (a < 35000) return 'brightness(0) invert(0.55) sepia(1) saturate(8) hue-rotate(310deg)';
        if (a < 40000) return 'brightness(0) invert(0.5) sepia(1) saturate(6) hue-rotate(280deg)';
        return 'brightness(0) invert(0.6) sepia(1) saturate(5) hue-rotate(260deg)';
    }

    const _iconCache = {};
    function _iconHash(ac) {
        const alt = ac.alt_baro;
        let altBand = 0;
        if (alt === 'ground' || alt === 0) altBand = -1;
        else if (typeof alt === 'number') altBand = Math.floor(Math.min(alt, 50000) / 5000);
        const rot = Math.round((ac.track || 0) / 5) * 5;
        const sel = ac.hex === selectedHex ? 1 : 0;
        const dim = (selectedHex && !sel) ? 1 : 0;
        const lbl = settings.showLabels ? 1 : 0;
        const bdg = settings.showInterestingBadges ? 1 : 0;
        return ac.hex + '|' + altBand + '|' + rot + '|' + sel + dim + lbl + bdg + '|' + (ac.flight || '') + '|' + (ac.t || '');
    }

    function createIcon(ac) {
        const hash = _iconHash(ac);
        if (_iconCache[ac.hex] && _iconCache[ac.hex].hash === hash) return _iconCache[ac.hex].icon;
        
        const color = getAltitudeColor(ac.alt_baro);
        const rot = ac.track || 0;
        const sel = ac.hex === selectedHex;
        const size = sel ? 36 : 28;
        const isInteresting = ac.interesting || ac.militaryInfo || ac.piaInfo;
        const isVIP = ac.isVIP || badgersBestDB.isVIP(ac.hex);
        const isDimmed = selectedHex && ac.hex !== selectedHex;
        const interestingCategory = ac.piaInfo ? 'PIA' : (ac.interesting?.category || ac.militaryInfo?.category);
        
        const spriteInfo = getSpriteIcon(ac);
        const col = spriteInfo.idx % 16;
        const row = Math.floor(spriteInfo.idx / 16);
        
        let label = '';
        if (settings.showLabels && (ac.flight || ac.hex)) {
            const labelColor = sel ? '#00ffff' : color;
            label = '<div class="aircraft-label" style="color:' + labelColor + '">' + (ac.flight || ac.hex) + '</div>';
        }
        
        let badge = '';
        if (isInteresting && !sel && settings.showInterestingBadges) {
            const badgeColor = interestingDB.getCategoryColor(interestingCategory);
            const badgeIcon = interestingDB.getCategoryIcon(interestingCategory);
            badge = '<div class="interesting-badge" style="background:' + badgeColor + '">' + badgeIcon + '</div>';
        }
        
        const cssFilter = getAltitudeCSSFilter(ac.alt_baro, sel);
        const bgW = (1376 * size / 86);
        const bgH = (516 * size / 86);
        
        const sprite = '<div class="sprite-icon" style="' +
            'width:' + size + 'px;height:' + size + 'px;' +
            'background:url(' + SPRITE_URL + ') -' + (col * size) + 'px -' + (row * size) + 'px/' + bgW + 'px ' + bgH + 'px no-repeat;' +
            'filter:' + cssFilter + ';' +
            (spriteInfo.noRotate ? '' : 'transform:rotate(' + rot + 'deg);') +
            '"></div>';
        
        const className = 'aircraft-marker' + 
            (sel ? ' selected' : '') + 
            (isInteresting ? ' interesting' : '') + 
            (isVIP ? ' vip' : '') + 
            (isDimmed ? ' dimmed' : '');
        
        const icon = L.divIcon({
            className: className,
            html: sprite + badge + label,
            iconSize: [size, size],
            iconAnchor: [size/2, size/2]
        });
        
        _iconCache[ac.hex] = { hash, icon };
        return icon;
    }
    
    function getAircraftShape(ac) {
        const type = (ac.t || '').toUpperCase();
        const category = ac.category || '';
        
        // Helicopter
        if (type.startsWith('H') || type.includes('HELI') || 
            ['A109', 'A139', 'A149', 'A169', 'A189', 'B06', 'B105', 'B206', 'B212', 'B222', 'B230', 'B407', 'B412', 'B429', 'B430', 'B505', 'EC20', 'EC25', 'EC30', 'EC35', 'EC45', 'EC55', 'EC75', 'EC90', 'R22', 'R44', 'R66', 'S76', 'S92', 'UH1', 'UH60', 'AH64', 'CH47', 'CH53', 'V22', 'AS50', 'AS55', 'AS65', 'AS32', 'S70', 'S61'].includes(type) ||
            category.includes('A7')) {
            return {
                type: 'helicopter',
                path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 8 L18 28 M10 12 L26 12 M14 12 L14 8 L22 8 L22 12 M18 28 L14 32 L22 32 L18 28 M12 18 L8 18 L8 16 L12 16 M24 18 L28 18 L28 16 L24 16"/>'
            };
        }
        
        // Military fighter/attack
        if (['F15', 'F16', 'F18', 'F22', 'F35', 'F4', 'FA18', 'F117', 'A10', 'AV8', 'EF2K', 'EUFI', 'RFAL', 'TORN', 'GROB', 'HAWK', 'MIG', 'SU27', 'SU30', 'SU35', 'J10', 'J11', 'J20', 'B1', 'B2', 'B52'].some(m => type.includes(m))) {
            return {
                type: 'fighter',
                path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 4 L20 12 L28 16 L28 18 L20 18 L20 28 L24 32 L24 34 L18 30 L12 34 L12 32 L16 28 L16 18 L8 18 L8 16 L16 12 Z"/>'
            };
        }
        
        // Military transport/tanker
        if (['C17', 'C130', 'C5', 'C141', 'KC10', 'KC135', 'KC46', 'A400', 'AN12', 'AN22', 'AN124', 'AN225', 'IL76', 'Y20', 'C2', 'C160', 'C27', 'C295', 'CN35'].some(m => type.includes(m))) {
            return {
                type: 'military-transport',
                path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 3 L20 10 L32 16 L32 18 L20 19 L20 28 L26 32 L26 33 L18 30 L10 33 L10 32 L16 28 L16 19 L4 18 L4 16 L16 10 Z"/>'
            };
        }
        
        // Private/GA props
        if (['C172', 'C182', 'C206', 'C208', 'C210', 'C310', 'C340', 'C402', 'C414', 'C421', 'C425', 'P28A', 'P28B', 'P28R', 'PA24', 'PA28', 'PA30', 'PA31', 'PA32', 'PA34', 'PA44', 'PA46', 'BE33', 'BE35', 'BE36', 'BE55', 'BE58', 'BE76', 'M20', 'DA40', 'DA42', 'SR20', 'SR22', 'TBM', 'PC12', 'PC24', 'P210', 'P180', 'BE9L', 'BE20', 'B350', 'C152', 'C150', 'C177', 'C185'].some(m => type.startsWith(m))) {
            return {
                type: 'prop',
                path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 6 L19 14 L28 18 L19 20 L19 28 L22 31 L22 32 L18 30 L14 32 L14 31 L17 28 L17 20 L8 18 L17 14 Z"/>'
            };
        }
        
        // Widebody jets
        if (['A380', 'A350', 'A330', 'A340', 'B747', 'B777', 'B787', 'B767', 'B748', 'B77L', 'B77W', 'B788', 'B789', 'B78X', 'A359', 'A35K', 'A338', 'A339', 'A342', 'A343', 'A345', 'A346', 'A388', 'B744', 'B772', 'B773', 'B762', 'B763', 'B764', 'MD11', 'DC10', 'L101', 'IL86', 'IL96', 'A300', 'A310'].some(m => type.includes(m))) {
            return {
                type: 'widebody',
                path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 2 L21 14 L34 18 L21 21 L21 30 L26 34 L26 35 L18 31 L10 35 L10 34 L15 30 L15 21 L2 18 L15 14 Z"/>'
            };
        }
        
        // Business jets
        if (['C525', 'C550', 'C560', 'C56X', 'C650', 'C680', 'C700', 'C750', 'CL30', 'CL35', 'CL60', 'CRJ1', 'CRJ2', 'E135', 'E145', 'E35L', 'E50P', 'E55P', 'FA10', 'FA20', 'FA50', 'FA7X', 'FA8X', 'G150', 'G200', 'G280', 'G3', 'G4', 'G5', 'G6', 'GALX', 'GLEX', 'GLF3', 'GLF4', 'GLF5', 'GLF6', 'H25', 'HA4T', 'HDJT', 'LJ23', 'LJ24', 'LJ25', 'LJ31', 'LJ35', 'LJ40', 'LJ45', 'LJ55', 'LJ60', 'LJ70', 'LJ75', 'PRM1', 'BE40', 'WW24', 'C25A', 'C25B', 'C25C', 'C500', 'C501', 'C510', 'C525', 'CL30', 'CL35', 'CL60', 'CL85', 'CL90', 'G150', 'G200', 'G280', 'GL5T', 'GL7T'].some(m => type.includes(m))) {
            return {
                type: 'bizjet',
                path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 4 L20 13 L30 17 L30 19 L20 20 L20 29 L24 33 L24 34 L18 31 L12 34 L12 33 L16 29 L16 20 L6 19 L6 17 L16 13 Z"/>'
            };
        }
        
        // Ground vehicles
        if (ac.alt_baro === 'ground' || ac.alt_baro === 0 || (ac.gs && ac.gs < 30 && (!ac.alt_baro || ac.alt_baro < 500))) {
            if (!type || type === '') {
                return {
                    type: 'ground',
                    path: '<rect x="12" y="12" width="12" height="12" rx="2" fill="FILL" stroke="STROKE" stroke-width="0.5"/>'
                };
            }
        }
        
        // Default jet shape (narrowbody)
        return {
            type: 'jet',
            path: '<path fill="FILL" stroke="STROKE" stroke-width="0.5" d="M18 3 L20 14 L32 18 L20 20 L20 30 L24 33 L24 34 L18 32 L12 34 L12 33 L16 30 L16 20 L4 18 L16 14 Z"/>'
        };
    }
    function getZIndex(ac) { if (ac.hex === selectedHex) return 50000; if (ac.interesting || ac.militaryInfo || ac.piaInfo) return 5000 + (ac.alt_baro || 0); return ac.alt_baro === 'ground' ? 0 : (ac.alt_baro || 0); }

    // ============ TRAILS ============
    async function loadTrail(hex) {
        const status = document.getElementById('trailStatus'); status.textContent = 'Loading trail...';
        if (trailLine) { if (trailLine._originMarker) map.removeLayer(trailLine._originMarker); if (trailLine._group) map.removeLayer(trailLine._group); else map.removeLayer(trailLine); trailLine = null; }
        const ac = aircraftCache[hex]; if (!ac) return;
        const hexSuffix = hex.slice(-2).toLowerCase(), hexLower = hex.toLowerCase();
        const endpoints = [{ url: CONFIG.traceUrl + hexSuffix + '/trace_full_' + hexLower + '.json', name: 'full' }, { url: CONFIG.traceUrl + hexSuffix + '/trace_recent_' + hexLower + '.json', name: 'recent' }];
        for (const ep of endpoints) {
            status.textContent = 'Loading ' + ep.name + ' trail...'; const resp = await fetchWithProxy(ep.url); if (!resp) continue;
            try { 
                const data = await resp.json(); 
                if (data?.trace?.length > 1) { 
                    const filtered = filterToCurrentFlight(data.trace);
                    // Detect origin airport from trace data
                    const originAirport = flightTracker.detectOriginFromTrace(filtered);
                    if (originAirport && !ac.detectedOrigin) {
                        ac.detectedOrigin = originAirport;
                        ac.from = originAirport.icao || originAirport.ident;
                        _dbg('Detected origin:', ac.from, originAirport.name);
                        // Try to infer destination
                        if (ac.flight && routesDB.loaded) {
                            const airlineCode = getAirlineCode(ac.flight);
                            if (airlineCode) {
                                const possibleDest = flightTracker.inferDestination(airlineCode, ac.from);
                                if (possibleDest) {
                                    if (Array.isArray(possibleDest)) {
                                        ac.possibleDestinations = possibleDest;
                                        ac.to = possibleDest[0];
                                        ac.destinationInferred = true;
                                    } else {
                                        ac.to = possibleDest;
                                        ac.destinationInferred = true;
                                    }
                                    _dbg('Inferred destination:', ac.to);
                                }
                            }
                        }
                        updateRouteDisplay(ac);
                    }
                    if (settings.altitudeColors) drawAltitudeColoredTrail(filtered, ac); 
                    else drawSimpleTrail(filtered, ac); 
                    status.textContent = 'Trail: ' + filtered.length + ' pts'; 
                    return; 
                } 
            } catch(e) { continue; }
        }
        if (ac.history?.length > 1) { 
            const trace = ac.history.map(p => [0, p[0], p[1], p[2] || 0, 0]); 
            // Try to detect origin from local history
            const originAirport = flightTracker.detectOrigin(ac);
            if (originAirport && !ac.detectedOrigin) {
                ac.detectedOrigin = originAirport;
                ac.from = originAirport.icao || originAirport.ident;
                updateRouteDisplay(ac);
            }
            if (settings.altitudeColors) drawAltitudeColoredTrail(trace, ac); 
            else drawSimpleTrail(trace, ac); 
            status.textContent = 'Trail: ' + ac.history.length + ' pts (local)'; 
        } else status.textContent = 'Trail: Building...';
    }
    function drawAltitudeColoredTrail(trace, ac) {
        const group = L.layerGroup().addTo(map); let lastSeg = null;
        for (let i = 1; i < trace.length; i++) { const prev = trace[i-1], curr = trace[i]; if (prev[1] && prev[2] && curr[1] && curr[2]) { lastSeg = L.polyline([[prev[1], prev[2]], [curr[1], curr[2]]], { color: getAltitudeColor(curr[3] || 0), weight: 3, opacity: 0.9 }); group.addLayer(lastSeg); } }
        if (ac.lat && ac.lon && trace.length) { const last = trace[trace.length - 1]; if (last[1] && last[2]) { lastSeg = L.polyline([[last[1], last[2]], [ac.lat, ac.lon]], { color: getAltitudeColor(ac.alt_baro || 0), weight: 3, opacity: 0.9 }); group.addLayer(lastSeg); } }
        if (trace.length && trace[0][1] && trace[0][2]) { const origin = createOriginMarker(trace[0][1], trace[0][2]); group.addLayer(origin); trailLine = group; trailLine._originMarker = origin; } else trailLine = group;
        trailLine._group = group; trailLine._lastSegment = lastSeg;
    }
    function drawSimpleTrail(trace, ac) { const points = trace.filter(p => p[1] && p[2]).map(p => [p[1], p[2]]); if (ac.lat && ac.lon) { const last = points[points.length - 1]; if (!last || last[0] !== ac.lat || last[1] !== ac.lon) points.push([ac.lat, ac.lon]); } if (points.length > 1) { trailLine = L.polyline(points, { color: getAltitudeColor(ac.alt_baro || 0), weight: 3, opacity: 0.85 }).addTo(map); const origin = createOriginMarker(points[0][0], points[0][1]); origin.addTo(map); trailLine._originMarker = origin; trailLine._lastSegment = trailLine; } }
    function createOriginMarker(lat, lon) { const m = L.circleMarker([lat, lon], { radius: 8, color: '#fff', fillColor: '#00ff00', fillOpacity: 1, weight: 2 }); m.on('click', e => { L.DomEvent.stopPropagation(e); const nearby = airportDB.findNearby(lat, lon, 15); if (nearby.length) showAirportPanel(nearby[0]); else toast('No airport found near origin'); }); m.bindTooltip('Takeoff - Click for airport', { permanent: false, direction: 'top' }); return m; }
    function filterToCurrentFlight(trace) { if (!trace || trace.length < 2) return trace; let idx = 0; for (let i = trace.length - 1; i >= 0; i--) { const alt = trace[i][3], gs = trace[i][4]; if (alt === 'ground' || alt === null || (typeof alt === 'number' && alt < 500 && gs < 50)) { for (let j = i; j < trace.length; j++) { if (typeof trace[j][3] === 'number' && trace[j][3] > 500 && trace[j][4] > 80) { idx = Math.max(0, i - 2); break; } } break; } if (i > 0 && trace[i][0] - trace[i-1][0] > 1800) { idx = i; break; } } return trace.slice(idx); }
    function renderAltitudeChart(history) { const canvas = document.getElementById('altitudeChart'); if (!canvas || !history || history.length < 2) return; const ctx = canvas.getContext('2d'); canvas.width = canvas.offsetWidth; canvas.height = 60; const alts = history.map(p => typeof p[2] === 'number' ? p[2] : 0); const maxAlt = Math.max(...alts, 1000), minAlt = Math.min(...alts, 0), range = maxAlt - minAlt || 1000; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.beginPath(); const step = canvas.width / (alts.length - 1); alts.forEach((alt, i) => { const x = i * step, y = canvas.height - ((alt - minAlt) / range) * (canvas.height - 10) - 5; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.lineTo(canvas.width, canvas.height); ctx.lineTo(0, canvas.height); ctx.closePath(); ctx.fillStyle = 'rgba(255, 165, 0, 0.3)'; ctx.fill(); ctx.beginPath(); alts.forEach((alt, i) => { const x = i * step, y = canvas.height - ((alt - minAlt) / range) * (canvas.height - 10) - 5; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.strokeStyle = '#ffa500'; ctx.lineWidth = 2; ctx.stroke(); }

    // ============ ROUTE DISPLAY ============
    function updateRouteDisplay(ac) {
        if (!ac) return;
        const routeSection = document.getElementById('routeSection');
        const hasRoute = ac.from || ac.to;
        if (hasRoute) {
            document.getElementById('routeFrom').textContent = ac.from || '???';
            document.getElementById('routeTo').textContent = ac.to || '???';
            document.getElementById('routeFromFull').textContent = ac.from || '???';
            document.getElementById('routeToFull').textContent = ac.to || '???';
            const fromApt = ac.detectedOrigin || airportDB.getByCode(ac.from);
            const toApt = airportDB.getByCode(ac.to);
            document.getElementById('routeFromName').textContent = fromApt?.city || fromApt?.name || 'Departure';
            document.getElementById('routeToName').textContent = toApt?.city || toApt?.name || (ac.destinationInferred ? 'Likely Arrival' : 'Arrival');
            document.getElementById('routeFromNameFull').textContent = fromApt?.city || fromApt?.name || 'Departure';
            document.getElementById('routeToNameFull').textContent = toApt?.city || toApt?.name || (ac.destinationInferred ? 'Likely Arrival' : 'Arrival');
            if (fromApt && toApt) {
                const progress = flightTracker.calculateProgress(ac, fromApt, toApt);
                if (progress) {
                    document.getElementById('routeDistFlown').textContent = progress.flownDistance + ' km';
                    document.getElementById('routeDistRemain').textContent = progress.remainingDistance + ' km';
                    document.getElementById('routeFlightTime').textContent = flightTracker.formatDuration(progress.etaMinutes) + ' remaining';
                    const progressBar = document.querySelector('.route-progress');
                    if (progressBar) progressBar.style.width = progress.progress + '%';
                    const planeIcon = document.querySelector('.route-plane-icon');
                    if (planeIcon) planeIcon.style.left = progress.progress + '%';
                }
            } else {
                document.getElementById('routeDistFlown').textContent = ac.from ? 'Tracking...' : '---';
                document.getElementById('routeDistRemain').textContent = ac.to ? 'Calculating...' : '---';
                document.getElementById('routeFlightTime').textContent = '---';
            }
            const destNote = document.getElementById('routeDestNote');
            if (destNote && ac.possibleDestinations && ac.possibleDestinations.length > 1) {
                document.getElementById('routeDestNoteValue').textContent = ac.possibleDestinations.slice(0, 5).join(', ');
                destNote.style.display = 'flex';
            } else if (destNote) {
                destNote.style.display = 'none';
            }
            routeSection.style.display = 'block';
        } else {
            routeSection.style.display = 'none';
        }
    }

    // ============ PHOTOS ============
    async function loadAircraftPhoto(hex, reg, type) {
        const div = document.getElementById('aircraftPhoto');
        
        // Check memory cache first
        if (photoCache[hex]) { displayPhoto(photoCache[hex]); return; }
        if (photoFailCache[hex]) { showFallbackPhoto(type, div); return; }
        
        div.innerHTML = '<div class="no-photo">Loading Photo…</div>';
        
        // PRIORITY 1: Check preloaded images database (fastest - no API call)
        if (preloadedImagesDB.loaded && preloadedImagesDB.hasImage(hex)) {
            const preloadedUrl = preloadedImagesDB.getFirstImage(hex);
            if (preloadedUrl) {
                // Verify the image loads
                const img = new Image();
                img.onload = () => {
                    photoCache[hex] = { url: preloadedUrl, source: 'preloaded' };
                    displayPhoto(photoCache[hex]);
                };
                img.onerror = () => {
                    // Preloaded URL failed, try next source
                    loadPhotoFromSelfHosted(hex, reg, type, div);
                };
                img.src = preloadedUrl;
                return;
            }
        }
        
        // PRIORITY 2: Try self-hosted photos
        await loadPhotoFromSelfHosted(hex, reg, type, div);
    }

    async function loadPhotoFromSelfHosted(hex, reg, type, div) {
        // Try self-hosted aircraft photo
        const selfHostedUrl = DATA_URLS.aircraftPhotos + hex.toUpperCase() + '.jpg';
        
        const img = new Image();
        img.onload = () => {
            photoCache[hex] = { url: selfHostedUrl, source: 'self-hosted' };
            displayPhoto(photoCache[hex]);
        };
        img.onerror = () => {
            // Self-hosted not available, try Planespotters API
            loadPhotoFromPlanespotters(hex, reg, type, div);
        };
        img.src = selfHostedUrl;
    }

    async function loadPhotoFromPlanespotters(hex, reg, type, div) {
        // PRIORITY 3: Planespotters API (slowest, rate-limited)
        try {
            const resp = await fetchWithProxy('https://api.planespotters.net/pub/photos/hex/' + hex);
            if (resp) {
                const data = await resp.json();
                if (data.photos?.length) {
                    const photo = data.photos[0];
                    const url = photo.thumbnail_large?.src || photo.thumbnail?.src;
                    if (url) {
                        photoCache[hex] = { url, source: 'planespotters' };
                        displayPhoto(photoCache[hex]);
                        return;
                    }
                }
            }
        } catch(e) {
            console.warn('Planespotters API error:', e);
        }
        
        // All sources failed
        photoFailCache[hex] = true;
        showFallbackPhoto(type, div);
    }
    function showFallbackPhoto(type, div) { 
        if (type) {
            const typeUpper = type.toUpperCase();
            const selfHostedUrl = CONFIG.silhouetteUrl + typeUpper + '.png';
            const externalUrl = 'https://globe.airplanes.live/aircraft_sil/' + typeUpper + '.png';
            const img = document.createElement('img');
            img.style.cssText = 'object-fit:contain;background:#1a1a2e;padding:20px;width:100%;height:100%;';
            img.onerror = function() {
                if (this.src !== externalUrl) {
                    this.src = externalUrl;
                } else {
            div.innerHTML = '<div class="no-photo">No Photo Available</div>';
                }
            };
            img.src = selfHostedUrl;
            div.innerHTML = '';
            div.appendChild(img);
        } else {
            div.innerHTML = '<div class="no-photo"><svg width="48" height="48" viewBox="0 0 24 24" fill="#666"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg></div>';
        }
    }
    function displayPhoto(photo) {
        const div = document.getElementById('aircraftPhoto');
        if (!div || !photo || !photo.url) return;
        div.innerHTML = '';
        const img = document.createElement('img');
        img.alt = '';
        img.style.cssText = photo.isSilhouette ? 'object-fit:contain;background:#1a1a2e;padding:20px;' : 'object-fit:cover;';
        img.onerror = () => { div.innerHTML = '<div class="no-photo">No Photo Available</div>'; };
        img.src = photo.url;
        div.appendChild(img);
    }
    function loadAirlineBanner(cs) { 
        const div = document.getElementById('airlineBanner'), code = getAirlineCode(cs); 
        if (!code) { div.style.display = 'none'; return; } 
        const selfHostedUrl = CONFIG.airlineBannerUrl + code + '.png';
        const externalUrl = 'https://globe.airplanes.live/airline_banners/' + code + '.png';
        const img = div.querySelector('img'); 
        img.onload = () => div.style.display = 'flex'; 
        img.onerror = function() {
            if (this.src !== externalUrl) {
                this.src = externalUrl;
            } else {
                div.style.display = 'none';
            }
        }; 
        img.src = selfHostedUrl; 
    }

    // ============ SELECTION ============
    function selectAircraft(hex) {
        if (trailLine) { if (trailLine._originMarker) map.removeLayer(trailLine._originMarker); if (trailLine._group) map.removeLayer(trailLine._group); else map.removeLayer(trailLine); trailLine = null; }
        selectedHex = hex; const ac = aircraftCache[hex]; if (!ac) return;
        // Callsign + phase-of-flight chip + surveillance-orbit chip
        // (v0.19.0/v0.20.0 — modules 91-phase-of-flight.js, 94-surveillance-orbit.js)
        phaseClassifier.annotate(ac);
        surveillanceOrbit.annotate(ac);
        const callsignEl = document.getElementById('infoCallsign');
        if (callsignEl) {
            callsignEl.innerHTML = _escHtml(ac.flight || 'N/A') +
                phaseClassifier.chipHtml(ac) +
                surveillanceOrbit.chipHtml(ac);
        }
        // Hex + country flag badge (v0.19.0 — module 92-country-flag.js)
        const hexEl = document.getElementById('infoHex');
        if (hexEl) {
            hexEl.innerHTML = _escHtml(ac.hex) + countryFlag.badgeHtml(ac.hex);
        }
        document.getElementById('infoReg').textContent = ac.r || 'N/A';
        const typeDesc = aircraftTypeDB.getDescription(ac.t); document.getElementById('infoType').textContent = typeDesc || ac.t || 'N/A';
        const descRow = document.getElementById('infoDescRow'); if (ac.desc) { document.getElementById('infoDesc').textContent = ac.desc; descRow.style.display = 'flex'; } else descRow.style.display = 'none';
        const opRow = document.getElementById('infoOperatorRow'); if (ac.ownOp) { document.getElementById('infoOperator').textContent = ac.ownOp; opRow.style.display = 'flex'; } else opRow.style.display = 'none';
        
        // Airline with alliance badge
        const airlineRow = document.getElementById('infoAirlineRow');
        if (ac.airlineName) {
            let airlineHtml = _escHtml(ac.airlineName);
            if (ac.alliance && allianceDB.loaded) {
                const allianceColor = allianceDB.getAllianceColor(ac.alliance);
                airlineHtml += ' <span class="alliance-badge" style="background:' + _escHtml(allianceColor) + '">' + _escHtml(ac.alliance) + '</span>';
            }
            document.getElementById('infoAirline').innerHTML = airlineHtml;
            airlineRow.style.display = 'flex';
        } else {
            airlineRow.style.display = 'none';
        }
        
        // Handle VIP/interesting/PIA badge
        const interestingSection = document.getElementById('interestingSection'), badge = document.getElementById('infoCategoryBadge');
        const intHeader = document.getElementById('interestingHeader');
        const intIcon = document.getElementById('interestingIcon');
        const intTitle = document.getElementById('interestingTitle');
        const categoryBadgeRow = document.getElementById('categoryBadgeRow');
        
        if (ac.isVIP || badgersBestDB.isVIP(hex)) {
            // VIP aircraft display (highest priority)
            const vipData = badgersBestDB.getByHex(hex) || ac.interesting;
            if (badge) { badge.textContent = '* VIP'; badge.className = 'info-category-badge vip'; badge.style.display = 'inline-flex'; }
            if (interestingSection) {
                interestingSection.className = 'info-section interesting-section vip';
                if (intHeader) intHeader.className = 'interesting-header vip';
                if (intIcon) intIcon.textContent = '*';
                if (intTitle) intTitle.textContent = "Badger's Best - VIP Aircraft";
                document.getElementById('interestingCategory').textContent = vipData?.category || 'VIP';
                document.getElementById('interestingTag').textContent = vipData?.type || 'Must-See Aircraft';
                document.getElementById('interestingOperator').textContent = vipData?.operator || ac.ownOp || 'N/A';
                if (categoryBadgeRow && vipData?.category) categoryBadgeRow.innerHTML = getCategoryBadge({ category: vipData.category });
                else if (categoryBadgeRow) categoryBadgeRow.innerHTML = '';
                interestingSection.style.display = 'block';
            }
        } else if (ac.piaInfo) {
            // PIA aircraft display
            if (badge) { badge.textContent = '! PIA'; badge.className = 'info-category-badge pia'; badge.style.display = 'inline-flex'; }
            if (interestingSection) {
                interestingSection.className = 'info-section interesting-section pia';
                if (intHeader) intHeader.className = 'interesting-header pia';
                if (intIcon) intIcon.textContent = '!';
                if (intTitle) intTitle.textContent = 'Privacy ICAO Address';
                document.getElementById('interestingCategory').textContent = 'PIA';
                document.getElementById('interestingTag').textContent = ac.piaInfo.tag || 'Privacy ICAO Address';
                document.getElementById('interestingOperator').textContent = ac.piaInfo.operator || 'N/A';
                if (categoryBadgeRow) categoryBadgeRow.innerHTML = '';
                interestingSection.style.display = 'block';
            }
        } else if (ac.interesting || ac.militaryInfo || ac.civilianInteresting) { 
            const info = ac.interesting || ac.militaryInfo || ac.civilianInteresting, category = info.category, tag = info.tag;
            if (badge) { badge.textContent = interestingDB.getCategoryIcon(category) + ' ' + category; badge.className = 'info-category-badge ' + (category || '').toLowerCase(); badge.style.display = 'inline-flex'; }
            if (interestingSection) { 
                interestingSection.className = 'info-section interesting-section';
                if (intHeader) intHeader.className = 'interesting-header';
                if (intIcon) intIcon.textContent = interestingDB.getCategoryIcon(category);
                if (intTitle) intTitle.textContent = 'Flagged Aircraft';
                document.getElementById('interestingCategory').textContent = category || 'N/A'; 
                document.getElementById('interestingTag').textContent = tag || 'N/A'; 
                document.getElementById('interestingOperator').textContent = info.operator || 'N/A';
                if (categoryBadgeRow && category) categoryBadgeRow.innerHTML = getCategoryBadge({ category });
                else if (categoryBadgeRow) categoryBadgeRow.innerHTML = '';
                interestingSection.style.display = 'block'; 
            }
        } else { 
            if (badge) badge.style.display = 'none'; 
            if (interestingSection) interestingSection.style.display = 'none';
            if (categoryBadgeRow) categoryBadgeRow.innerHTML = '';
        }
        
        // Update route display
        updateRouteDisplay(ac);
        // If no route yet and we have a trail, try to detect origin
        if (!ac.from && !ac.detectedOrigin && ac.history?.length > 5) {
            const originAirport = flightTracker.detectOrigin(ac);
            if (originAirport) {
                ac.detectedOrigin = originAirport;
                ac.from = originAirport.icao || originAirport.ident;
                if (ac.flight && routesDB.loaded) {
                    const airlineCode = getAirlineCode(ac.flight);
                    if (airlineCode) {
                        const possibleDest = flightTracker.inferDestination(airlineCode, ac.from);
                        if (possibleDest) {
                            if (Array.isArray(possibleDest)) {
                                ac.possibleDestinations = possibleDest;
                                ac.to = possibleDest[0];
                            } else {
                                ac.to = possibleDest;
                            }
                            ac.destinationInferred = true;
                        }
                    }
                }
                updateRouteDisplay(ac);
            }
        }
        // External API route fallback — adsbdb/hexdb cover ~400k callsigns beyond
        // the static routes DB. Only query when we still have no from/to and
        // we haven't already looked up this callsign for the current aircraft.
        if ((!ac.from || !ac.to) && ac.flight && !ac.routeApiTried) {
            const cs = ac.flight.trim();
            ac.routeApiTried = true;
            routeApiLookup.get(cs).then(rec => {
                if (!rec || selectedHex !== ac.hex) return;
                let changed = false;
                if (!ac.from && rec.from) { ac.from = rec.from; changed = true; }
                if (!ac.to && rec.to)     { ac.to = rec.to;     changed = true; }
                if (changed) {
                    ac.destinationInferred = false; // this is a definitive route
                    ac.routeApiSource = rec.source;
                    updateRouteDisplay(ac);
                }
            }).catch(() => { /* silent — fallback only */ });
        }
        const catMap = { commercial: 'Commercial', military: 'Military', government: 'Government', police: 'Police', medical: 'Medical', cargo: 'Cargo', private: 'Private', helicopter: 'Helicopter', ground: 'Ground', pia: 'PIA' }; document.getElementById('infoCat').textContent = catMap[ac.category_type] || 'Unknown';
        const alt = ac.alt_baro === 'ground' ? 'Ground' : (ac.alt_baro ? ac.alt_baro.toLocaleString() + ' ft' : '---'); document.getElementById('infoAlt').textContent = alt;
        document.getElementById('infoSpeed').textContent = ac.gs ? Math.round(ac.gs) + ' kts' : '---'; document.getElementById('infoTrack').textContent = ac.track ? Math.round(ac.track) + '\u00B0' : '---'; document.getElementById('infoVRate').textContent = ac.baro_rate ? (ac.baro_rate > 0 ? '+' : '') + ac.baro_rate + ' fpm' : '---';
        const sqEl = document.getElementById('infoSquawk'); sqEl.textContent = ac.squawk || '----'; sqEl.className = 'squawk-code squawk-' + (['7500', '7600', '7700'].includes(ac.squawk) ? ac.squawk : 'normal');
        const typeData = aircraftTypeDB.getByDesignator(ac.t);
        if (typeData) { document.getElementById('acManufacturer').textContent = typeData.manufacturer || '---'; document.getElementById('acModel').textContent = typeData.model || '---'; document.getElementById('acTypeCode').textContent = ac.t || '---'; document.getElementById('specWingspan').textContent = typeData.wingspan || '---'; document.getElementById('specLength').textContent = typeData.length || '---'; document.getElementById('specRange').textContent = typeData.range || '---'; document.getElementById('specSpeed').textContent = typeData.speed || '---'; document.getElementById('specEngines').textContent = typeData.engines || '---'; document.getElementById('specPax').textContent = typeData.pax || '---'; }
        else { document.getElementById('acManufacturer').textContent = '---'; document.getElementById('acModel').textContent = ac.t || '---'; document.getElementById('acTypeCode').textContent = ac.t || '---'; ['specWingspan', 'specLength', 'specRange', 'specSpeed', 'specEngines', 'specPax'].forEach(id => document.getElementById(id).textContent = '---'); }
        const yearRow = document.getElementById('acYearRow'); if (ac.year) { document.getElementById('acYear').textContent = ac.year; yearRow.style.display = 'flex'; } else yearRow.style.display = 'none';
        
        // === Flight Statistics Section ===
        const flightStatsSection = document.getElementById('flightStats');
        const acAgeRow = document.getElementById('acAgeRow');
        const flightDistRow = document.getElementById('flightDistRow');
        const flightTimeRow = document.getElementById('flightTimeRow');
        const fuelEstRow = document.getElementById('fuelEstRow');
        const co2EstRow = document.getElementById('co2EstRow');
        
        let showFlightStats = false;
        
        // Aircraft age
        const ageText = aircraftDataEnricher.formatAge(ac.year);
        if (ageText && acAgeRow) {
            document.getElementById('acAge').textContent = ageText;
            acAgeRow.style.display = 'flex';
            showFlightStats = true;
        } else if (acAgeRow) {
            acAgeRow.style.display = 'none';
        }
        
        // Flight statistics (if route is known)
        if (ac.from && ac.to) {
            const fromApt = ac.detectedOrigin || airportDB.getByCode(ac.from);
            const toApt = airportDB.getByCode(ac.to);
            
            if (fromApt && toApt) {
                const progress = aircraftDataEnricher.calculateProgress(ac, fromApt, toApt);
                
                if (progress) {
                    // Distance
                    if (flightDistRow) {
                        document.getElementById('flightDist').innerHTML = 
                            '<span class="stat-highlight">' + progress.distanceFlown.toLocaleString() + '</span> / ' + 
                            progress.totalDistance.toLocaleString() + ' km <span class="stat-muted">(' + progress.progress + '%)</span>';
                        flightDistRow.style.display = 'flex';
                        showFlightStats = true;
                    }
                    
                    // Flight time estimate
                    const timeEst = aircraftDataEnricher.estimateFlightTime(progress.totalDistance, ac.t, ac.gs);
                    if (timeEst && flightTimeRow) {
                        document.getElementById('flightTimeEst').textContent = '~' + timeEst.formatted;
                        flightTimeRow.style.display = 'flex';
                        showFlightStats = true;
                    } else if (flightTimeRow) {
                        flightTimeRow.style.display = 'none';
                    }
                    
                    // Fuel estimate
                    const fuelEst = aircraftDataEnricher.estimateFuelBurn(ac.t, progress.totalDistance);
                    if (fuelEst && fuelEstRow) {
                        document.getElementById('fuelEst').textContent = 
                            '~' + fuelEst.fuelKg.toLocaleString() + ' kg (' + fuelEst.fuelGal.toLocaleString() + ' gal)';
                        fuelEstRow.style.display = 'flex';
                        showFlightStats = true;
                        
                        // CO2 estimate
                        const co2 = aircraftDataEnricher.estimateCO2(fuelEst.fuelKg);
                        if (co2 && co2EstRow) {
                            document.getElementById('co2Est').innerHTML = '~' + co2.toLocaleString() + ' kg <span class="co2-warning">CO2</span>';
                            co2EstRow.style.display = 'flex';
                        } else if (co2EstRow) {
                            co2EstRow.style.display = 'none';
                        }
                    } else {
                        if (fuelEstRow) fuelEstRow.style.display = 'none';
                        if (co2EstRow) co2EstRow.style.display = 'none';
                    }
                } else {
                    if (flightDistRow) flightDistRow.style.display = 'none';
                    if (flightTimeRow) flightTimeRow.style.display = 'none';
                    if (fuelEstRow) fuelEstRow.style.display = 'none';
                    if (co2EstRow) co2EstRow.style.display = 'none';
                }
            } else {
                if (flightDistRow) flightDistRow.style.display = 'none';
                if (flightTimeRow) flightTimeRow.style.display = 'none';
                if (fuelEstRow) fuelEstRow.style.display = 'none';
                if (co2EstRow) co2EstRow.style.display = 'none';
            }
        } else {
            if (flightDistRow) flightDistRow.style.display = 'none';
            if (flightTimeRow) flightTimeRow.style.display = 'none';
            if (fuelEstRow) fuelEstRow.style.display = 'none';
            if (co2EstRow) co2EstRow.style.display = 'none';
        }
        
        // Show/hide flight stats section
        if (flightStatsSection) {
            flightStatsSection.style.display = showFlightStats ? 'block' : 'none';
        }
        
        // === Military Info Section ===
        const milSection = document.getElementById('militaryInfoSection');
        if (milSection) {
            if (ac.militaryInfo || ac.militaryRangeInfo) {
                const milData = aircraftDataEnricher.getMilitaryInfo(ac);
                if (milData) {
                    document.getElementById('milBranch').textContent = milData.branch;
                    
                    const milOpRow = document.getElementById('milOperatorRow');
                    if (milData.operator && milOpRow) {
                        document.getElementById('milOperator').textContent = milData.operator;
                        milOpRow.style.display = 'flex';
                    } else if (milOpRow) {
                        milOpRow.style.display = 'none';
                    }
                    
                    const milDescRow = document.getElementById('milDescRow');
                    if (milData.description && milDescRow) {
                        document.getElementById('milDesc').textContent = milData.description;
                        milDescRow.style.display = 'flex';
                    } else if (milDescRow) {
                        milDescRow.style.display = 'none';
                    }
                    
                    milSection.style.display = 'block';
                } else {
                    milSection.style.display = 'none';
                }
            } else {
                milSection.style.display = 'none';
            }
        }
        
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); document.querySelector('.tab-btn[data-tab="overview"]').classList.add('active'); document.getElementById('tabOverview').classList.add('active');
        _el('infoPanel').classList.add('show'); _el('settingsPanel').classList.remove('show'); _el('airportPanel').classList.remove('show');
        
        // Update watch button state
        const watchBtn = document.getElementById('watchBtn');
        if (watchBtn) {
            const isWatched = alertSystem.isWatched(hex);
            watchBtn.classList.toggle('watched', isWatched);
            watchBtn.querySelector('.star').textContent = isWatched ? '★' : '☆';
            watchBtn.querySelector('.watch-text').textContent = isWatched ? 'Watching' : 'Watch';
        }
        
        loadAircraftPhoto(hex, ac.r, ac.t); loadAirlineBanner(ac.flight); loadTrail(hex); if (ac.history?.length > 1) setTimeout(() => renderAltitudeChart(ac.history), 100);
        
        // Phase 10: Update ETA display and enhanced altitude chart
        routePredictor.updateETADisplay(ac);
        enhancedAltitudeChart.loadFromHistory(ac);
        
        // Phase 11: Update external tracking links
        updateExternalLinks(ac);
        
        updateMarkers();
        shareManager.updateUrl();
    }
    function deselectAircraft() { if (trailLine) { if (trailLine._originMarker) map.removeLayer(trailLine._originMarker); if (trailLine._group) map.removeLayer(trailLine._group); else map.removeLayer(trailLine); trailLine = null; } selectedHex = null; _el('infoPanel').classList.remove('show'); routePredictor.clearAll(); updateMarkers(); shareManager.updateUrl(); }

    // ============ UI HANDLERS ============
    function initUI() {
        document.getElementById('infoClose').addEventListener('click', deselectAircraft);
        document.getElementById('airportClose').addEventListener('click', () => _el('airportPanel').classList.remove('show'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); btn.classList.add('active'); document.getElementById('tab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active'); }));
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => { 
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); 
                btn.classList.add('active'); 
                settings.filter = btn.dataset.filter; 
                updateMarkers(); 
                shareManager.updateUrl();
                const shareBtn = document.getElementById('filterShareBtn');
                if (shareBtn) shareBtn.style.display = btn.dataset.filter === 'all' ? 'none' : 'flex';
            });
            // Long-press to copy shareable filter link
            let pressTimer;
            btn.addEventListener('pointerdown', () => {
                pressTimer = setTimeout(() => {
                    if (btn.dataset.filter !== 'all') {
                        shareManager.shareFilter(btn.dataset.filter);
                    }
                }, 600);
            });
            btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
            btn.addEventListener('pointerleave', () => clearTimeout(pressTimer));
        });
        document.getElementById('filterShareBtn')?.addEventListener('click', () => {
            if (settings.filter && settings.filter !== 'all') shareManager.shareFilter(settings.filter);
        });
        document.getElementById('dayNightBtn').addEventListener('click', () => { const styles = ['dark', 'satellite', 'google-streets', 'google-satellite', 'google-hybrid', 'google-terrain']; const next = styles[(styles.indexOf(currentBaseMap) + 1) % styles.length]; changeBasemap(next); });
        document.getElementById('labelBtn').addEventListener('click', function() { settings.showLabels = !settings.showLabels; this.classList.toggle('active', settings.showLabels); setToggleState(document.getElementById('toggleLabels'), settings.showLabels); saveSettings(); updateMarkers(); });
        document.getElementById('airportsBtn').addEventListener('click', function() { settings.showAirports = !settings.showAirports; this.classList.toggle('active', settings.showAirports); setToggleState(document.getElementById('toggleAirports'), settings.showAirports); saveSettings(); updateAirportMarkers(); });
        document.getElementById('radarBtn').addEventListener('click', toggleRadar);
        document.getElementById('locateBtn').addEventListener('click', geolocate);
        document.getElementById('followBtn')?.addEventListener('click', function() {
            settings.followMode = !settings.followMode;
            this.classList.toggle('active', settings.followMode);
            saveSettings();
            
            // Disable multi-select if it's enabled - they are mutually exclusive
            if (settings.followMode && typeof multiSelect !== 'undefined' && multiSelect.enabled) {
                multiSelect.enabled = false;
                document.getElementById('multiSelectBtn')?.classList.remove('active');
                document.body.classList.remove('multi-select-mode');
                multiSelect.hideToolbar();
                multiSelect.clearAll();
                toast('Multi-select disabled');
            }
            
            toast(settings.followMode ? 'Follow mode ON' : 'Follow mode OFF');
            if (settings.followMode && selectedHex) {
                const ac = aircraftCache[selectedHex];
                if (ac?.lat !== undefined) map.panTo([ac.lat, ac.lon]);
            }
        });
        document.getElementById('settingsBtn').addEventListener('click', () => { _el('settingsPanel').classList.toggle('show'); _el('infoPanel').classList.remove('show'); _el('airportPanel').classList.remove('show'); });
        setToggleState(document.getElementById('toggleLabels'), settings.showLabels); document.getElementById('toggleLabels').addEventListener('click', function() { settings.showLabels = !settings.showLabels; setToggleState(this, settings.showLabels); document.getElementById('labelBtn').classList.toggle('active', settings.showLabels); saveSettings(); updateMarkers(); });
        setToggleState(document.getElementById('toggleAirports'), settings.showAirports); document.getElementById('toggleAirports').addEventListener('click', function() { settings.showAirports = !settings.showAirports; setToggleState(this, settings.showAirports); document.getElementById('airportsBtn').classList.toggle('active', settings.showAirports); saveSettings(); updateAirportMarkers(); });
        setToggleState(document.getElementById('toggleRadar'), settings.showRadar);
        document.getElementById('toggleRadar').addEventListener('click', toggleRadar);
        setToggleState(document.getElementById('toggleAltColors'), settings.altitudeColors); document.getElementById('toggleAltColors').addEventListener('click', function() { settings.altitudeColors = !settings.altitudeColors; setToggleState(this, settings.altitudeColors); saveSettings(); if (selectedHex) loadTrail(selectedHex); });
        setToggleState(document.getElementById('toggleWiki'), settings.showWiki); document.getElementById('toggleWiki').addEventListener('click', function() { settings.showWiki = !settings.showWiki; setToggleState(this, settings.showWiki); saveSettings(); });
        setToggleState(document.getElementById('toggleInterestingBadges'), settings.showInterestingBadges); document.getElementById('toggleInterestingBadges').addEventListener('click', function() { settings.showInterestingBadges = !settings.showInterestingBadges; setToggleState(this, settings.showInterestingBadges); saveSettings(); updateMarkers(); });
        document.getElementById('toggleWeatherOverlay')?.addEventListener('click', function() { weatherOverlay.toggle(); setToggleState(this, weatherOverlay.enabled); });
        document.getElementById('mapStyleSelect').addEventListener('change', function() { changeBasemap(this.value); });
        document.getElementById('saveApiBtn').addEventListener('click', saveApiCredentials); document.getElementById('clearApiBtn').addEventListener('click', clearApiCredentials);
        document.getElementById('addBookmarkBtn').addEventListener('click', openBookmarkModal);
        document.getElementById('bookmarkCancelBtn').addEventListener('click', closeBookmarkModal);
        document.getElementById('bookmarkSaveBtn').addEventListener('click', () => { const name = document.getElementById('bookmarkNameInput').value.trim(); if (name) { addBookmark(name); closeBookmarkModal(); } else toast('Enter a name'); });
        document.getElementById('bookmarkNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const name = e.target.value.trim(); if (name) { addBookmark(name); closeBookmarkModal(); } } });
        document.getElementById('bookmarkModal').addEventListener('click', e => { if (e.target.id === 'bookmarkModal') closeBookmarkModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('bookmarkModal')?.classList.contains('show')) closeBookmarkModal(); });
        document.getElementById('btnZoomAirport').addEventListener('click', () => { const p = _el('airportPanel'); if (p._airport) map.setView([p._airport.lat, p._airport.lon], 14); });
        document.getElementById('btnShowDepartures').addEventListener('click', () => { const p = _el('airportPanel'); if (p._airport) { const deps = Object.values(aircraftCache).filter(ac => ac.from === p._airport.icao || ac.from === p._airport.iata); if (deps.length) { toast('Found ' + deps.length + ' departures'); selectAircraft(deps[0].hex); } else toast('No departures found'); } });
        document.getElementById('btnShowArrivals').addEventListener('click', () => { const p = _el('airportPanel'); if (p._airport) { const arrs = Object.values(aircraftCache).filter(ac => ac.to === p._airport.icao || ac.to === p._airport.iata); if (arrs.length) { toast('Found ' + arrs.length + ' arrivals'); selectAircraft(arrs[0].hex); } else toast('No arrivals found'); } });
        
        // Initialize enhanced search system
        searchSystem.init();
        
        // Watch button handler
        document.getElementById('watchBtn')?.addEventListener('click', function() {
            if (!selectedHex) return;
            const ac = aircraftCache[selectedHex];
            const isWatched = alertSystem.isWatched(selectedHex);
            if (isWatched) {
                alertSystem.removeFromWatchlist(selectedHex);
                this.classList.remove('watched');
                this.querySelector('.star').textContent = '☆';
                this.querySelector('.watch-text').textContent = 'Watch';
            } else {
                const name = ac?.flight?.trim() || ac?.r || selectedHex;
                alertSystem.addToWatchlist(selectedHex, name);
                this.classList.add('watched');
                this.querySelector('.star').textContent = '★';
                this.querySelector('.watch-text').textContent = 'Watching';
            }
        });
        
        // Alert settings handlers
        document.getElementById('toggleAlerts')?.addEventListener('click', function() {
            alertSystem.enabled = !alertSystem.enabled;
            setToggleState(this, alertSystem.enabled);
            alertSystem.saveSettings();
            toast(alertSystem.enabled ? 'Alerts enabled' : 'Alerts disabled');
        });
        document.getElementById('toggleAlertSounds')?.addEventListener('click', function() {
            alertSystem.soundEnabled = !alertSystem.soundEnabled;
            setToggleState(this, alertSystem.soundEnabled);
            alertSystem.saveSettings();
        });
        document.getElementById('toggleNotifications')?.addEventListener('click', async function() {
            if (!alertSystem.notificationsEnabled) {
                const granted = await alertSystem.requestNotificationPermission();
                setToggleState(this, granted);
            } else {
                alertSystem.notificationsEnabled = false;
                setToggleState(this, false);
                alertSystem.saveSettings();
                toast('Notifications disabled');
            }
        });
        document.getElementById('militaryAlertRadius')?.addEventListener('change', function() {
            const parsed = parseInt(this.value, 10);
            alertSystem.militaryAlertRadius = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
            alertSystem.saveSettings();
            // Stop tracking if user disabled alerts, try to (re)start if enabled.
            if (alertSystem.militaryAlertRadius === 0) alertSystem.stopLocationTracking();
            else alertSystem.startLocationTracking();
            toast(alertSystem.militaryAlertRadius === 0 ? 'Military alerts disabled' : 'Military alerts: ' + alertSystem.militaryAlertRadius + 'km radius');
        });
        
        // Phase 16: Data source and reliability handlers
        document.getElementById('checkSourcesBtn')?.addEventListener('click', async () => {
            toast('Checking all data sources…');
            await dataSourceManager.checkAllSources();
            updateDataSourceList();
            toast('Source check complete');
        });
        
        document.getElementById('clearOfflineCacheBtn')?.addEventListener('click', async () => {
            try {
                await skytrackDB.saveDatabase('offlineCache', null, 0);
                offlineManager.offlineData = null;
                toast('Offline cache cleared');
            } catch (e) {
                toast('Failed to clear cache');
            }
        });
        
        // Phase 16: Update data source list in settings
        function updateDataSourceList() {
            const list = document.getElementById('dataSourceList');
            if (!list) return;
            
            const stats = dataSourceManager.getStats();
            list.innerHTML = stats.map(s => {
                const statusColor = s.status === 'healthy' ? 'var(--success)' : 
                                   s.status === 'degraded' ? '#fbbf24' : 'var(--danger)';
                return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">' +
                    '<span>' + s.name + '</span>' +
                    '<span style="color:' + statusColor + '">' + s.status + ' (' + (s.latency < 9999 ? s.latency + 'ms' : '--') + ')</span>' +
                    '</div>';
            }).join('');
        }
        
        // Update list when settings panel opens
        const settingsPanel = _el('settingsPanel');
        if (settingsPanel) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.target.classList.contains('show')) {
                        updateDataSourceList();
                    }
                });
            });
            observer.observe(settingsPanel, { attributes: true, attributeFilter: ['class'] });
        }
        
        // Phase 5: New button handlers
        document.getElementById('measureBtn')?.addEventListener('click', () => measureTool.toggle());
        // Range rings (v0.19.0 — module 90-range-rings.js)
        const rangeRingsBtn = document.getElementById('rangeRingsBtn');
        if (rangeRingsBtn) {
            rangeRingsBtn.classList.toggle('active', rangeRings.enabled);
            rangeRingsBtn.addEventListener('click', async () => {
                const on = await rangeRings.toggle();
                rangeRingsBtn.classList.toggle('active', on);
                if (!on && !rangeRings.center) {
                    // Permission not granted — offer to use the current map center as fallback.
                    toast('Geolocation unavailable — using map center');
                    rangeRings.useMapCenter();
                    await rangeRings.enable();
                    rangeRingsBtn.classList.add('active');
                } else {
                    toast(on ? 'Range rings on' : 'Range rings off');
                }
            });
        }
        // Fires + hurricanes overlay (v0.20.0 — module 95-fires-hurricanes.js)
        const firesBtn = document.getElementById('firesBtn');
        if (firesBtn) {
            firesBtn.classList.toggle('active', firesHurricanes.enabled);
            firesBtn.addEventListener('click', async () => {
                toast('Loading fires & storms…');
                const on = await firesHurricanes.toggle();
                firesBtn.classList.toggle('active', on);
                if (on) {
                    const fc = firesHurricanes.fireLayer?.getLayers()?.length || 0;
                    const sc = firesHurricanes.stormLayer?.getLayers()?.length || 0;
                    toast('Fires: ' + fc + ' · Storms: ' + sc);
                } else {
                    toast('Overlay off');
                }
            });
        }
        // Plane Over My House widget (v0.20.0 — module 96-plane-over-my-house.js)
        const homeWidgetBtn = document.getElementById('homeWidgetBtn');
        if (homeWidgetBtn) {
            homeWidgetBtn.classList.toggle('active', planeOverHome.enabled);
            homeWidgetBtn.addEventListener('click', () => {
                const on = planeOverHome.toggle();
                homeWidgetBtn.classList.toggle('active', on);
            });
        }
        document.getElementById('exportKMLBtn')?.addEventListener('click', () => { if (selectedHex) exportTrail(selectedHex, 'kml'); });
        document.getElementById('shareFlightBtn')?.addEventListener('click', () => { if (selectedHex) shareManager.share(selectedHex); });
        document.getElementById('playbackBtn')?.addEventListener('click', () => { if (selectedHex) playbackController.start(selectedHex); });
        
        // Phase 10: Prediction and Route button handlers
        document.getElementById('showPredictionBtn')?.addEventListener('click', () => {
            if (selectedHex) {
                const ac = aircraftCache[selectedHex];
                routePredictor.togglePrediction(ac);
            }
        });
        document.getElementById('showRouteBtn')?.addEventListener('click', () => {
            if (selectedHex) {
                const ac = aircraftCache[selectedHex];
                routePredictor.toggleRoute(ac);
            }
        });
        
        // Phase 6: Visual feature handlers
        document.getElementById('miniMapBtn')?.addEventListener('click', () => miniMap.toggle());
        document.getElementById('heatmapBtn')?.addEventListener('click', () => heatmapLayer.toggle());
        document.getElementById('airspaceBtn')?.addEventListener('click', () => airspaceLayer.toggle());
        document.getElementById('view3DBtn')?.addEventListener('click', () => view3D.toggle());
        document.getElementById('showBoardBtn')?.addEventListener('click', () => {
            const panel = _el('airportPanel');
            if (panel._airport) airportBoard.show(panel._airport);
        });
    }
    function changeBasemap(style) { Object.values(baseMaps).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); }); baseMaps[style].addTo(map); currentBaseMap = style; settings.mapStyle = style; document.getElementById('mapStyleSelect').value = style; saveSettings(); updateMarkers(); if (typeof miniMap !== 'undefined' && miniMap.updateMapStyle) miniMap.updateMapStyle(style); }
    // Animated RainViewer radar: cycles past frames + short-term nowcast.
    // Replaces the single-frame implementation so the radar visibly moves.
    const radarAnimator = {
        frames: [],       // [{ path, time }, ...] past → present → nowcast
        layers: [],       // parallel Leaflet tileLayers, only one visible at a time
        host: '',
        idx: 0,
        timer: null,
        active: false,

        async load() {
            const resp = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
                cache: 'no-cache'
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            this.host = data.host;
            const past = Array.isArray(data?.radar?.past) ? data.radar.past : [];
            const now  = Array.isArray(data?.radar?.nowcast) ? data.radar.nowcast : [];
            // Keep the most recent 10 past frames + all nowcast frames so the
            // loop feels responsive but stays well under ~15 tile layers.
            this.frames = past.slice(-10).concat(now);
            if (this.frames.length === 0) throw new Error('No radar frames');
            this._buildLayers();
        },

        _buildLayers() {
            this._tearDownLayers();
            for (const f of this.frames) {
                const layer = L.tileLayer(
                    this.host + f.path + '/256/{z}/{x}/{y}/4/1_1.png',
                    { opacity: 0, maxNativeZoom: 12, updateWhenIdle: true }
                );
                layer.setZIndex(50);
                layer.addTo(map);
                this.layers.push(layer);
            }
            // Start with the most recent past frame visible (last "real" frame).
            const lastPastIdx = Math.min(9, this.frames.length - 1);
            this.idx = lastPastIdx;
            if (this.layers[this.idx]) this.layers[this.idx].setOpacity(0.45);
        },

        _tearDownLayers() {
            for (const l of this.layers) {
                try { map.removeLayer(l); } catch (_) {}
            }
            this.layers = [];
        },

        start() {
            if (!this.active || this.frames.length < 2) return;
            this.stop();
            this.timer = setInterval(() => this._advance(), 700);
        },

        stop() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        },

        _advance() {
            if (this.layers.length < 2) return;
            const prev = this.idx;
            this.idx = (this.idx + 1) % this.layers.length;
            if (this.layers[prev]) this.layers[prev].setOpacity(0);
            // Nowcast frames (indices 10+, since we keep the last 10 past frames)
            // render at lower opacity so forecasts read as "less certain".
            const opacity = (this.idx > 9) ? 0.35 : 0.45;
            if (this.layers[this.idx]) this.layers[this.idx].setOpacity(opacity);
        },

        async enable() {
            this.active = true;
            await this.load();
            this.start();
        },

        disable() {
            this.active = false;
            this.stop();
            this._tearDownLayers();
            this.frames = [];
        }
    };

    async function toggleRadar() {
        settings.showRadar = !settings.showRadar;
        document.getElementById('radarBtn')?.classList.toggle('active', settings.showRadar);
        setToggleState(document.getElementById('toggleRadar'), settings.showRadar);
        saveSettings();
        if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; } // legacy cleanup
        if (settings.showRadar) {
            try {
                await radarAnimator.enable();
                toast('Radar: ' + radarAnimator.frames.length + ' frames loaded');
            } catch (e) {
                toast('Radar unavailable');
            }
        } else {
            radarAnimator.disable();
        }
    }
    function geolocate() { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(pos => { map.setView([pos.coords.latitude, pos.coords.longitude], CONFIG.localZoom); toast('Location updated'); }, () => toast('Location denied', 'warning')); } }
    let toastTimer = null;
    function toast(msg, tone = 'info') {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = normalizeUiText(msg);
        el.dataset.tone = tone;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), tone === 'error' ? 4200 : 3200);
    }

    // ============ PHASE 8: ENHANCED SEARCH SYSTEM ============
    const searchSystem = {
        isOpen: false,
        activeTab: 'results',
        filters: {},
        history: [],
        maxHistory: 20,
        debounceTimer: null,
        
        init() {
            // Load history from storage
            this.history = JSON.parse(localStorage.getItem('skytrack_search_history') || '[]');
            
            const input = document.getElementById('searchInput');
            const container = document.getElementById('searchContainer');
            const dropdown = document.getElementById('searchDropdown');
            
            // Input events
            input?.addEventListener('focus', () => this.open());
            input?.addEventListener('input', (e) => this.onInput(e.target.value));
            input?.addEventListener('keydown', (e) => this.onKeydown(e));
            
            // Clear button
            document.getElementById('searchClearBtn')?.addEventListener('click', () => {
                input.value = '';
                document.getElementById('searchClearBtn').style.display = 'none';
                this.updateResults('');
            });
            
            // Filter button
            document.getElementById('searchFilterBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.open();
                this.switchTab('filters');
            });
            
            // Tab switching
            document.querySelectorAll('.search-tab').forEach(tab => {
                tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
            });
            
            // Filter chips
            document.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    chip.classList.toggle('active');
                });
            });
            
            // Filter buttons
            document.getElementById('applyFiltersBtn')?.addEventListener('click', () => this.applyFilters());
            document.getElementById('clearFiltersBtn')?.addEventListener('click', () => this.clearFilters());
            document.getElementById('clearHistoryBtn')?.addEventListener('click', () => this.clearHistory());
            
            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-container')) {
                    this.close();
                }
            });
            
            this.renderHistory();
        },
        
        open() {
            this.isOpen = true;
            document.getElementById('searchDropdown')?.classList.add('show');
            setExpandedState(document.getElementById('searchFilterBtn'), true);
        },
        
        close() {
            this.isOpen = false;
            document.getElementById('searchDropdown')?.classList.remove('show');
            setExpandedState(document.getElementById('searchFilterBtn'), false);
        },
        
        switchTab(tab) {
            this.activeTab = tab;
            document.querySelectorAll('.search-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === tab);
            });
            document.querySelectorAll('.search-tab-panel').forEach(p => {
                p.classList.toggle('active', p.id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
            });
        },
        
        onInput(value) {
            // Show/hide clear button
            document.getElementById('searchClearBtn').style.display = value ? 'flex' : 'none';
            
            // Debounce search
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.updateResults(value);
            }, 150);
        },
        
        onKeydown(e) {
            if (e.key === 'Enter') {
                const value = e.target.value.trim();
                if (value) {
                    this.executeSearch(value);
                }
            } else if (e.key === 'Escape') {
                this.close();
                e.target.blur();
            }
        },
        
        updateResults(query) {
            const container = document.getElementById('searchResults');
            if (!container) return;
            
            const q = query.toLowerCase().trim();
            
            if (!q) {
                // Show interesting aircraft when empty
                const interesting = Object.values(aircraftCache)
                    .filter(ac => ac.isVIP || ac.interesting || ac.militaryInfo)
                    .slice(0, 8);
                
                if (interesting.length > 0) {
                    container.innerHTML = 
                        '<div class="search-section-header">Interesting Aircraft</div>' +
                        interesting.map(ac => this.renderAircraftResult(ac)).join('');
                    this.attachResultHandlers(container);
                } else {
                    container.innerHTML = '<div class="search-placeholder">Type to search flights, aircraft, and airports…</div>';
                }
                return;
            }
            
            const results = { aircraft: [], airports: [], airlines: [] };
            
            // Search aircraft
            Object.values(aircraftCache).forEach(ac => {
                const searchStr = [ac.flight, ac.r, ac.hex, ac.t, ac.ownOp, ac.airlineName]
                    .filter(Boolean).join(' ').toLowerCase();
                
                if (searchStr.includes(q)) {
                    results.aircraft.push(ac);
                }
            });
            
            // Search airports (if airportDB has data)
            if (airportDB.loaded && q.length >= 2) {
                airportDB.airports.forEach((apt, icao) => {
                    const searchStr = [icao, apt.iata, apt.name, apt.city]
                        .filter(Boolean).join(' ').toLowerCase();
                    
                    if (searchStr.includes(q)) {
                        results.airports.push(apt);
                    }
                });
            }
            
            // Search airlines
            const matchedAirlines = new Map();
            Object.values(aircraftCache).forEach(ac => {
                if (ac.airlineName?.toLowerCase().includes(q)) {
                    const count = matchedAirlines.get(ac.airlineName) || 0;
                    matchedAirlines.set(ac.airlineName, count + 1);
                }
            });
            results.airlines = Array.from(matchedAirlines.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
            
            // Render results
            let html = '';
            
            if (results.aircraft.length > 0) {
                html += '<div class="search-section-header">Aircraft (' + results.aircraft.length + ')</div>';
                html += results.aircraft.slice(0, 10).map(ac => this.renderAircraftResult(ac)).join('');
            }
            
            if (results.airports.length > 0) {
                html += '<div class="search-section-header">Airports (' + results.airports.length + ')</div>';
                html += results.airports.slice(0, 5).map(apt => this.renderAirportResult(apt)).join('');
            }
            
            if (results.airlines.length > 0) {
                html += '<div class="search-section-header">Airlines (' + results.airlines.length + ')</div>';
                html += results.airlines.slice(0, 5).map(a => this.renderAirlineResult(a)).join('');
            }
            
            if (!html) {
            html = '<div class="search-placeholder">No matches in the current view. Try a broader search or fewer filters.</div>';
            }
            
            container.innerHTML = html;
            this.attachResultHandlers(container);
        },
        
        renderAircraftResult(ac) {
            // All string fields below come from live ADS-B feeds / third-party DBs,
            // so escape every one before splicing into innerHTML.
            const iconClass = ac.isVIP ? 'interesting' : (ac.militaryInfo ? 'military' : 'aircraft');
            const icon = ac.isVIP ? '*' : (ac.militaryInfo ? '#' : '>');
            const title = ac.flight?.trim() || ac.r || ac.hex;
            const subtitle = [ac.t, ac.ownOp || ac.airlineName].filter(Boolean).join(' - ') || 'Unknown';
            const alt = ac.alt_baro === 'ground' ? 'GND' : (ac.alt_baro ? Math.round(ac.alt_baro).toLocaleString() + ' ft' : '');

            return '<div class="search-result-item" data-type="aircraft" data-hex="' + _escHtml(ac.hex) + '">' +
                '<div class="search-result-icon ' + iconClass + '">' + icon + '</div>' +
                '<div class="search-result-content">' +
                    '<div class="search-result-title">' + _escHtml(title) + '</div>' +
                    '<div class="search-result-subtitle">' + _escHtml(subtitle) + '</div>' +
                '</div>' +
                '<div class="search-result-meta">' + _escHtml(alt) + '</div>' +
            '</div>';
        },

        renderAirportResult(apt) {
            const arrivals = Object.values(aircraftCache).filter(ac => ac.to === apt.icao || ac.to === apt.iata).length;
            const departures = Object.values(aircraftCache).filter(ac => ac.from === apt.icao || ac.from === apt.iata).length;

            return '<div class="search-result-item" data-type="airport" data-icao="' + _escHtml(apt.icao) + '">' +
                '<div class="search-result-icon airport">A</div>' +
                '<div class="search-result-content">' +
                    '<div class="search-result-title">' + _escHtml(apt.icao) + ' - ' + _escHtml(apt.name) + '</div>' +
                    '<div class="search-result-subtitle">' + _escHtml(apt.city || '') + ', ' + _escHtml(apt.country || '') + '</div>' +
                '</div>' +
                '<div class="search-result-meta">' + arrivals + 'in/' + departures + 'out</div>' +
            '</div>';
        },

        renderAirlineResult(airline) {
            return '<div class="search-result-item" data-type="airline" data-name="' + _escHtml(airline.name) + '">' +
                '<div class="search-result-icon airline">+</div>' +
                '<div class="search-result-content">' +
                    '<div class="search-result-title">' + _escHtml(airline.name) + '</div>' +
                    '<div class="search-result-subtitle">' + airline.count + ' active flights</div>' +
                '</div>' +
            '</div>';
        },
        
        attachResultHandlers(container) {
            container.querySelectorAll('.search-result-item').forEach(el => {
                el.addEventListener('click', () => {
                    const type = el.dataset.type;
                    
                    if (type === 'aircraft') {
                        selectAircraft(el.dataset.hex);
                        this.addToHistory(el.querySelector('.search-result-title').textContent, 'aircraft');
                    } else if (type === 'airport') {
                        this.filterByAirport(el.dataset.icao);
                        this.addToHistory(el.dataset.icao, 'airport');
                    } else if (type === 'airline') {
                        this.filterByAirline(el.dataset.name);
                        this.addToHistory(el.dataset.name, 'airline');
                    }
                    
                    this.close();
                    document.getElementById('searchInput').value = '';
                    document.getElementById('searchClearBtn').style.display = 'none';
                });
            });
        },
        
        executeSearch(query) {
            // Check for regex pattern
            if (query.startsWith('/') && query.endsWith('/')) {
                try {
                    this.filters.regex = new RegExp(query.slice(1, -1), 'i');
                    this.applyActiveFilters();
                    this.addToHistory(query, 'regex');
                    toast('Regex filter applied');
                    this.close();
                    return;
                } catch (e) {
                    toast('Invalid regex pattern');
                    return;
                }
            }
            
            // Try exact matches
            const q = query.toUpperCase();
            
            // Check hex
            if (aircraftCache[q]) {
                selectAircraft(q);
                this.addToHistory(query, 'aircraft');
                this.close();
                return;
            }
            
            // Check callsign/registration
            const byFlight = Object.values(aircraftCache).find(ac => 
                ac.flight?.trim().toUpperCase() === q || ac.r?.toUpperCase() === q
            );
            if (byFlight) {
                selectAircraft(byFlight.hex);
                this.addToHistory(query, 'aircraft');
                this.close();
                return;
            }
            
            // Check airport
            if (q.length <= 4 && airportDB.loaded) {
                const apt = airportDB.getByCode(q);
                if (apt) {
                    this.filterByAirport(q);
                    this.addToHistory(query, 'airport');
                    this.close();
                    return;
                }
            }
            
            // Apply as text filter
            this.filters.text = query.toLowerCase();
            this.applyActiveFilters();
            this.addToHistory(query, 'search');
            this.close();
        },
        
        filterByAirport(code) {
            this.filters.airport = code.toUpperCase();
            this.applyActiveFilters();
            toast('Showing flights to/from ' + code);
        },
        
        filterByAirline(name) {
            this.filters.airline = name;
            this.applyActiveFilters();
            toast('Showing ' + name + ' flights');
        },
        
        applyFilters() {
            this.filters = {};
            
            // Type chips
            const activeTypes = [];
            document.querySelectorAll('.filter-chip.active').forEach(chip => {
                activeTypes.push(chip.dataset.type);
            });
            if (activeTypes.length > 0) this.filters.types = activeTypes;
            
            // Altitude — explicit radix, and require a finite number so the
            // filter state doesn't land as NaN and later compare-silently-false
            // against every aircraft.
            const altMin = parseInt(document.getElementById('altMin')?.value ?? '', 10);
            const altMax = parseInt(document.getElementById('altMax')?.value ?? '', 10);
            if (Number.isFinite(altMin)) this.filters.altMin = altMin;
            if (Number.isFinite(altMax)) this.filters.altMax = altMax;

            // Speed
            const speedMin = parseInt(document.getElementById('speedMin')?.value ?? '', 10);
            const speedMax = parseInt(document.getElementById('speedMax')?.value ?? '', 10);
            if (Number.isFinite(speedMin)) this.filters.speedMin = speedMin;
            if (Number.isFinite(speedMax)) this.filters.speedMax = speedMax;
            
            // Airport
            const airport = document.getElementById('filterAirport')?.value?.trim().toUpperCase();
            if (airport) this.filters.airport = airport;
            
            // Airline
            const airline = document.getElementById('filterAirline')?.value?.trim();
            if (airline) this.filters.airline = airline;
            
            // Checkboxes
            if (document.getElementById('filterEmergency')?.checked) this.filters.emergency = true;
            if (document.getElementById('filterInteresting')?.checked) this.filters.interesting = true;
            if (document.getElementById('filterGrounded')?.checked) this.filters.grounded = true;
            if (document.getElementById('filterNoCallsign')?.checked) this.filters.noCallsign = true;
            
            // Regex
            const regex = document.getElementById('filterRegex')?.value?.trim();
            if (regex) {
                try {
                    this.filters.regex = new RegExp(regex, 'i');
                } catch (e) {
                    toast('Invalid regex pattern');
                    return;
                }
            }
            
            this.applyActiveFilters();
            this.close();
            
            const count = Object.keys(this.filters).length;
            toast(count + ' filter' + (count !== 1 ? 's' : '') + ' applied');
        },
        
        applyActiveFilters() {
            // Update badge
            const count = Object.keys(this.filters).length;
            const badge = document.getElementById('filterBadge');
            if (badge) {
                badge.style.display = count > 0 ? 'flex' : 'none';
                badge.textContent = count;
            }
            
            // Store globally for marker updates
            window.searchFilters = this.filters;
            updateMarkers();
        },
        
        clearFilters() {
            this.filters = {};
            window.searchFilters = {};
            
            // Clear UI
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            const altMinEl = document.getElementById('altMin');
            const altMaxEl = document.getElementById('altMax');
            const speedMinEl = document.getElementById('speedMin');
            const speedMaxEl = document.getElementById('speedMax');
            const filterAirportEl = document.getElementById('filterAirport');
            const filterAirlineEl = document.getElementById('filterAirline');
            const filterEmergencyEl = document.getElementById('filterEmergency');
            const filterInterestingEl = document.getElementById('filterInteresting');
            const filterGroundedEl = document.getElementById('filterGrounded');
            const filterNoCallsignEl = document.getElementById('filterNoCallsign');
            const filterRegexEl = document.getElementById('filterRegex');
            
            if (altMinEl) altMinEl.value = '';
            if (altMaxEl) altMaxEl.value = '';
            if (speedMinEl) speedMinEl.value = '';
            if (speedMaxEl) speedMaxEl.value = '';
            if (filterAirportEl) filterAirportEl.value = '';
            if (filterAirlineEl) filterAirlineEl.value = '';
            if (filterEmergencyEl) filterEmergencyEl.checked = false;
            if (filterInterestingEl) filterInterestingEl.checked = false;
            if (filterGroundedEl) filterGroundedEl.checked = false;
            if (filterNoCallsignEl) filterNoCallsignEl.checked = false;
            if (filterRegexEl) filterRegexEl.value = '';
            
            const badge = document.getElementById('filterBadge');
            if (badge) badge.style.display = 'none';
            
            updateMarkers();
            toast('Filters cleared');
        },
        
        // Check if aircraft passes current filters
        passesFilters(ac) {
            const f = this.filters;
            if (!f || Object.keys(f).length === 0) return true;
            
            // Text filter
            if (f.text) {
                const searchStr = [ac.flight, ac.r, ac.hex, ac.t, ac.ownOp].join(' ').toLowerCase();
                if (!searchStr.includes(f.text)) return false;
            }
            
            // Type filter
            if (f.types && f.types.length > 0) {
                const acType = ac.category_type;
                if (!f.types.includes(acType)) return false;
            }
            
            // Altitude
            if (f.altMin !== undefined) {
                const alt = ac.alt_baro === 'ground' ? 0 : (ac.alt_baro || 0);
                if (alt < f.altMin) return false;
            }
            if (f.altMax !== undefined) {
                const alt = ac.alt_baro === 'ground' ? 0 : (ac.alt_baro || 0);
                if (alt > f.altMax) return false;
            }
            
            // Speed
            if (f.speedMin !== undefined && (ac.gs || 0) < f.speedMin) return false;
            if (f.speedMax !== undefined && (ac.gs || 0) > f.speedMax) return false;
            
            // Airport
            if (f.airport && ac.from !== f.airport && ac.to !== f.airport) return false;
            
            // Airline
            if (f.airline && !ac.airlineName?.toLowerCase().includes(f.airline.toLowerCase())) return false;
            
            // Emergency
            if (f.emergency && !['7500', '7600', '7700'].includes(ac.squawk)) return false;
            
            // Interesting
            if (f.interesting && !ac.interesting && !ac.militaryInfo && !ac.isVIP) return false;
            
            // Grounded
            if (f.grounded && ac.alt_baro !== 'ground' && ac.alt_baro > 100) return false;
            
            // No callsign
            if (f.noCallsign && ac.flight?.trim()) return false;
            
            // Regex
            if (f.regex) {
                const testStr = [ac.flight, ac.r].filter(Boolean).join(' ');
                if (!f.regex.test(testStr)) return false;
            }
            
            return true;
        },
        
        addToHistory(text, type) {
            // Remove duplicate
            this.history = this.history.filter(h => h.text !== text);
            
            // Add to front
            this.history.unshift({ text, type, time: Date.now() });
            
            // Limit size
            this.history = this.history.slice(0, this.maxHistory);
            
            // Save
            localStorage.setItem('skytrack_search_history', JSON.stringify(this.history));
            
            this.renderHistory();
        },
        
        renderHistory() {
            const container = document.getElementById('searchHistory');
            if (!container) return;
            
            if (this.history.length === 0) {
                container.innerHTML = '<div class="search-placeholder">Recent searches appear here.</div>';
                return;
            }
            
            container.innerHTML = this.history.map((h, i) =>
                '<div class="history-item" data-index="' + i + '">' +
                    '<span class="history-text">' + _escHtml(h.text) + '</span>' +
                    '<span class="history-time">' + _escHtml(this.formatTime(h.time)) + '</span>' +
                    '<button class="history-remove" data-index="' + i + '" aria-label="Remove search from history">×</button>' +
                '</div>'
            ).join('');
            
            // Click handlers
            container.querySelectorAll('.history-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.classList.contains('history-remove')) {
                        this.removeFromHistory(parseInt(e.target.dataset.index, 10));
                        e.stopPropagation();
                    } else {
                        const h = this.history[parseInt(el.dataset.index, 10)];
                        document.getElementById('searchInput').value = h.text;
                        this.executeSearch(h.text);
                    }
                });
            });
        },
        
        removeFromHistory(index) {
            this.history.splice(index, 1);
            localStorage.setItem('skytrack_search_history', JSON.stringify(this.history));
            this.renderHistory();
        },
        
        clearHistory() {
            this.history = [];
            localStorage.removeItem('skytrack_search_history');
            this.renderHistory();
            toast('History cleared');
        },
        
        formatTime(ts) {
            const diff = Date.now() - ts;
            if (diff < 60000) return 'now';
            if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
            if (diff < 86400000) return Math.floor(diff / 3600000) + 'h';
            return new Date(ts).toLocaleDateString();
        }
    };

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

    // ============ PHASE 5: TRAIL EXPORT ============
    const trailExporter = {
        // Escape live-feed strings before embedding them inside XML text
        // content or attributes. KML/GPX parsers treat `<`, `>`, `&`, `"`
        // specially, so an unusual callsign like `</name><script>` (or
        // anything containing `&`) would produce a malformed file.
        _xml(v) {
            if (v === null || v === undefined) return '';
            return String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        },
        // Collapse anything outside `[A-Za-z0-9._-]` to `_` so the filename
        // is safe on Windows/macOS/Linux and in browser download dialogs.
        _safeName(v) {
            return String(v || 'trail').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'trail';
        },
        // ISO timestamp from a trace time that might arrive as a number of
        // seconds (airplanes.live/tar1090 convention) or a pre-formatted
        // string. Returns '' on garbage so we don't emit `Invalid Date`.
        _isoTime(t) {
            if (t === null || t === undefined || t === '') return '';
            const n = Number(t);
            let d;
            if (Number.isFinite(n)) d = new Date((n > 1e11 ? n : n * 1000));
            else d = new Date(t);
            return Number.isNaN(d.getTime()) ? '' : d.toISOString();
        },

        async exportKML(hex) {
            const ac = aircraftCache[hex];
            if (!ac) {
                toast('No aircraft selected');
                return;
            }

            const trailData = await this.getTrailData(hex);
            if (!trailData || trailData.length < 2) {
                toast('No trail data available');
                return;
            }

            const name = ac.flight?.trim() || ac.r || hex;
            const timestamp = new Date().toISOString().split('T')[0];
            const xName = this._xml(name);
            const xReg = this._xml(ac.r || 'N/A');
            const xType = this._xml(ac.t || 'N/A');
            const xHex = this._xml(hex);

            const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>${xName} - ${timestamp}</name>
        <description>Flight track exported from SkyTrack</description>
        <Style id="flightPath">
            <LineStyle>
                <color>ff00ffff</color>
                <width>3</width>
            </LineStyle>
        </Style>
        <Placemark>
            <name>${xName}</name>
            <description>
                Registration: ${xReg}
                Type: ${xType}
                Hex: ${xHex}
            </description>
            <styleUrl>#flightPath</styleUrl>
            <LineString>
                <altitudeMode>absolute</altitudeMode>
                <coordinates>
${trailData.map(p => `                    ${p.lon},${p.lat},${(p.alt || 0) * 0.3048}`).join('\n')}
                </coordinates>
            </LineString>
        </Placemark>
        <Placemark>
            <name>Origin</name>
            <Point>
                <coordinates>${trailData[0].lon},${trailData[0].lat},0</coordinates>
            </Point>
        </Placemark>
        <Placemark>
            <name>Current Position</name>
            <Point>
                <coordinates>${trailData[trailData.length-1].lon},${trailData[trailData.length-1].lat},0</coordinates>
            </Point>
        </Placemark>
    </Document>
</kml>`;

            this.download(kml, `${this._safeName(name)}_${timestamp}.kml`, 'application/vnd.google-earth.kml+xml');
            toast('KML exported');
        },

        async exportGPX(hex) {
            const ac = aircraftCache[hex];
            if (!ac) {
                toast('No aircraft selected');
                return;
            }

            const trailData = await this.getTrailData(hex);
            if (!trailData || trailData.length < 2) {
                toast('No trail data available');
                return;
            }

            const name = ac.flight?.trim() || ac.r || hex;
            const timestamp = new Date().toISOString().split('T')[0];
            const xName = this._xml(name);
            const xReg = this._xml(ac.r || 'N/A');
            const xType = this._xml(ac.t || 'N/A');

            const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SkyTrack"
    xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
    <metadata>
        <name>${xName}</name>
        <desc>Flight track exported from SkyTrack</desc>
        <time>${new Date().toISOString()}</time>
    </metadata>
    <trk>
        <name>${xName}</name>
        <desc>Registration: ${xReg}, Type: ${xType}</desc>
        <trkseg>
${trailData.map(p => {
                const iso = this._isoTime(p.time);
                return `            <trkpt lat="${p.lat}" lon="${p.lon}">
                <ele>${Math.round((p.alt || 0) * 0.3048)}</ele>
                ${iso ? `<time>${iso}</time>` : ''}
            </trkpt>`;
            }).join('\n')}
        </trkseg>
    </trk>
</gpx>`;

            this.download(gpx, `${this._safeName(name)}_${timestamp}.gpx`, 'application/gpx+xml');
            toast('GPX exported');
        },
        
        async getTrailData(hex) {
            if (trailLine && selectedHex === hex) {
                const latlngs = trailLine._group ? 
                    trailLine._group.getLayers().flatMap(l => l.getLatLngs ? l.getLatLngs() : []) :
                    trailLine.getLatLngs();
                
                return latlngs.map(ll => ({
                    lat: ll.lat,
                    lon: ll.lng,
                    alt: ll.alt || 0
                }));
            }
            
            const ac = aircraftCache[hex];
            if (!ac) return null;
            
            const hexSuffix = hex.slice(-2).toLowerCase();
            const hexLower = hex.toLowerCase();
            
            try {
                const resp = await fetchWithProxy(CONFIG.traceUrl + hexSuffix + '/trace_full_' + hexLower + '.json');
                if (resp) {
                    const data = await resp.json();
                    if (data?.trace) {
                        return data.trace.map(t => ({
                            lat: t[1],
                            lon: t[2],
                            alt: t[3] || 0,
                            time: t[0]
                        }));
                    }
                }
            } catch (e) {}
            
            return null;
        },
        
        download(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        
        exportCSV(hex) {
            const ac = aircraftCache[hex];
            if (!ac?.history?.length) {
                toast('No history data available');
                return;
            }

            const name = ac.flight?.trim() || ac.r || hex;
            const timestamp = new Date().toISOString().split('T')[0];

            // processAircraftData pushes history entries as tuples:
            //   [lat, lon, alt, timestampMs]
            // The previous implementation treated each entry as an object
            // (`h.lat`, `h.time`, ...) which meant every exported row was
            // empty, and `new Date(undefined).toISOString()` threw on the
            // first iteration so the file was never saved.
            const headers = ['Timestamp', 'Latitude', 'Longitude', 'Altitude (ft)'];
            const rows = ac.history.map(h => {
                if (!Array.isArray(h)) return ['', '', '', ''];
                const [lat, lon, alt, ts] = h;
                const t = Number(ts);
                const tsStr = Number.isFinite(t) ? new Date(t).toISOString() : '';
                return [
                    tsStr,
                    Number.isFinite(lat) ? lat.toFixed(6) : '',
                    Number.isFinite(lon) ? lon.toFixed(6) : '',
                    (alt === 'ground') ? 'ground' : (Number.isFinite(alt) ? String(alt) : '')
                ];
            });

            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            this.download(csv, `${this._safeName(name)}_${timestamp}.csv`, 'text/csv');
            toast('CSV exported');
        }
    };

    function exportTrail(hex, format = 'kml') {
        if (format === 'gpx') {
            trailExporter.exportGPX(hex);
        } else if (format === 'csv') {
            trailExporter.exportCSV(hex);
        } else {
            trailExporter.exportKML(hex);
        }
    }

    // ============ PHASE 5: URL DEEP LINKING & SHARE ============
    const shareManager = {
        _suppressPopstate: false,
        
        // Build URL from current state
        buildUrl(overrides = {}) {
            const params = new URLSearchParams();
            const hex = overrides.hex !== undefined ? overrides.hex : selectedHex;
            const filter = overrides.filter !== undefined ? overrides.filter : settings.filter;
            
            if (hex) params.set('hex', hex);
            if (filter && filter !== 'all') params.set('filter', filter);
            
            // Include map position for shared links
            if (overrides.includeMap) {
                const c = map.getCenter();
                params.set('lat', c.lat.toFixed(4));
                params.set('lon', c.lng.toFixed(4));
                params.set('zoom', map.getZoom());
            }
            
            const qs = params.toString();
            return window.location.pathname + (qs ? '?' + qs : '');
        },
        
        // Update browser URL without reload
        updateUrl() {
            const url = this.buildUrl();
            this._suppressPopstate = true;
            history.replaceState({ hex: selectedHex, filter: settings.filter }, '', url);
            setTimeout(() => { this._suppressPopstate = false; }, 50);
        },
        
        // Generate a shareable link (includes map position)
        generateLink(hex) {
            const ac = aircraftCache[hex];
            if (!ac) return null;
            const params = new URLSearchParams();
            params.set('hex', hex);
            // `ac.lat && ac.lon` treats lat=0 / lon=0 as missing, which would
            // silently drop coordinates for any aircraft at the equator or
            // prime meridian. Use an explicit finite-number check.
            if (Number.isFinite(ac.lat) && Number.isFinite(ac.lon)) {
                params.set('lat', ac.lat.toFixed(4));
                params.set('lon', ac.lon.toFixed(4));
            }
            params.set('zoom', map.getZoom());
            if (settings.filter !== 'all') params.set('filter', settings.filter);
            return window.location.origin + window.location.pathname + '?' + params.toString();
        },
        
        // Generate a shareable link for a filter category
        generateFilterLink(filter) {
            const params = new URLSearchParams();
            params.set('filter', filter);
            const c = map.getCenter();
            params.set('lat', c.lat.toFixed(4));
            params.set('lon', c.lng.toFixed(4));
            params.set('zoom', map.getZoom());
            return window.location.origin + window.location.pathname + '?' + params.toString();
        },
        
        async share(hex) {
            const link = this.generateLink(hex);
            if (!link) { toast('No aircraft selected'); return; }
            const ac = aircraftCache[hex];
            const title = 'Track ' + (ac.flight?.trim() || ac.r || hex) + ' on SkyTrack';
            if (navigator.share) {
                try { await navigator.share({ title, text: 'Follow this flight: ' + (ac.flight?.trim() || hex), url: link }); return; }
                catch (e) { if (e.name !== 'AbortError') console.warn('Share failed:', e); }
            }
            await this.copyToClipboard(link);
        },
        
        async shareFilter(filter) {
            const link = this.generateFilterLink(filter);
            const labels = { military: 'Military', vip: 'VIP', government: 'Government', police: 'Police', interesting: 'Flagged', pia: 'PIA', helicopter: 'Helicopter', cargo: 'Cargo', commercial: 'Commercial', private: 'Private' };
            const title = (labels[filter] || filter) + ' Aircraft on SkyTrack';
            if (navigator.share) {
                try { await navigator.share({ title, text: 'View ' + (labels[filter] || filter) + ' aircraft live', url: link }); return; }
                catch (e) { if (e.name !== 'AbortError') console.warn('Share failed:', e); }
            }
            await this.copyToClipboard(link);
        },
        
        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                toast('Link copied to clipboard!');
            } catch (e) {
                const input = document.createElement('input');
                input.value = text;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                toast('Link copied!');
            }
        },
        
        // Whitelist of filter values the URL param is allowed to set. Anything
        // else is ignored so that an unknown/attacker-supplied filter cannot
        // push the UI into an inconsistent state.
        _validFilters: new Set(['all','commercial','cargo','military','government','police','medical','private','helicopter','interesting','pia','vip']),

        // Aircraft hex is 6 uppercase hex chars (tar1090 convention). Some
        // providers emit lowercase, so accept either and uppercase.
        _normalizeHex(raw) {
            if (!raw) return null;
            const v = String(raw).trim().toUpperCase();
            return /^[0-9A-F]{6}$/.test(v) ? v : null;
        },

        checkUrlParams() {
            if (!map) return;
            const params = new URLSearchParams(window.location.search);
            const hex = this._normalizeHex(params.get('hex'));
            const rawLat = params.get('lat');
            const rawLon = params.get('lon');
            const rawZoom = params.get('zoom');
            const rawFilter = params.get('filter');

            // Clamp lat/lon/zoom and reject NaN so a malformed URL cannot push
            // the map off-world or blow past Leaflet's zoom limits.
            const lat = rawLat !== null ? parseFloat(rawLat) : NaN;
            const lon = rawLon !== null ? parseFloat(rawLon) : NaN;
            if (Number.isFinite(lat) && Number.isFinite(lon) &&
                lat >= -85 && lat <= 85 && lon >= -180 && lon <= 180) {
                let zoom = parseInt(rawZoom, 10);
                if (!Number.isFinite(zoom)) zoom = 10;
                zoom = Math.min(19, Math.max(2, zoom));
                map.setView([lat, lon], zoom);
            }

            // Apply filter from URL (whitelisted).
            if (rawFilter && rawFilter !== 'all' && this._validFilters.has(rawFilter)) {
                settings.filter = rawFilter;
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.filter === rawFilter);
                });
                const shareBtn = document.getElementById('filterShareBtn');
                if (shareBtn) shareBtn.style.display = 'flex';
                updateMarkers();
            }

            if (hex) {
                let attempts = 0;
                const checkAndSelect = () => {
                    if (aircraftCache[hex]) {
                        selectAircraft(hex);
                    } else if (attempts < 30) {
                        attempts++;
                        setTimeout(checkAndSelect, 1000);
                    } else {
                        toast('Aircraft ' + hex + ' not found in current feed');
                    }
                };
                setTimeout(checkAndSelect, 2000);
                toast('Looking for aircraft ' + hex + '...');
            }
        },
        
        initPopstate() {
            window.addEventListener('popstate', (e) => {
                if (this._suppressPopstate) return;
                const params = new URLSearchParams(window.location.search);
                const hex = this._normalizeHex(params.get('hex'));
                const rawFilter = params.get('filter');
                const filter = (rawFilter && this._validFilters.has(rawFilter)) ? rawFilter : 'all';

                // Apply filter
                if (filter !== settings.filter) {
                    settings.filter = filter;
                    document.querySelectorAll('.filter-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.filter === filter);
                    });
                }

                // Apply selection
                if (hex && hex !== selectedHex) {
                    if (aircraftCache[hex]) selectAircraft(hex);
                } else if (!hex && selectedHex) {
                    deselectAircraft();
                }

                updateMarkers();
            });
        }
    };

    // ============ PHASE 5: HISTORICAL PLAYBACK ============
    const playbackController = {
        active: false,
        playing: false,
        speed: 1,
        currentIndex: 0,
        trailData: [],
        playbackMarker: null,
        interval: null,
        
        async start(hex) {
            try {
                const trailData = await trailExporter.getTrailData(hex);

                if (!trailData || trailData.length < 2) {
                    toast('No trail history available for playback');
                    return;
                }

                // Starting a new session while another is running would leak
                // the previous interval + marker and desync the UI. Reset
                // cleanly first.
                if (this.interval) { clearInterval(this.interval); this.interval = null; }
                this.playing = false;
                const playBtn = document.getElementById('playbackPlay');
                if (playBtn) playBtn.innerHTML = '&#9654;';

                this.trailData = trailData;
                this.currentIndex = 0;
                this.active = true;
                
                this.showControls();
                
                const ac = aircraftCache[hex];
                if (this.playbackMarker) {
                    map.removeLayer(this.playbackMarker);
                }
                
                this.playbackMarker = L.marker([trailData[0].lat, trailData[0].lon], {
                    icon: L.divIcon({
                        className: 'playback-marker',
                        html: '<div class="playback-aircraft">&#9650;</div>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                }).addTo(map);
                
                this.updatePosition();
                toast(`Playback ready: ${trailData.length} positions`);
                
            } catch (e) {
                errorHandler.log('Playback', e.message, 'error');
                toast('Failed to load playback data');
            }
        },
        
        showControls() {
            let controls = document.getElementById('playbackControls');
            if (!controls) {
                controls = document.createElement('div');
                controls.id = 'playbackControls';
                controls.className = 'playback-controls';
                controls.innerHTML = `
                    <button class="playback-btn" id="playbackStart" title="Start">|&lt;</button>
                    <button class="playback-btn" id="playbackBack" title="Back 10">&lt;&lt;</button>
                    <button class="playback-btn play" id="playbackPlay" title="Play/Pause">&#9654;</button>
                    <button class="playback-btn" id="playbackForward" title="Forward 10">&gt;&gt;</button>
                    <button class="playback-btn" id="playbackEnd" title="End">&gt;|</button>
                    <div class="playback-slider-container">
                        <input type="range" id="playbackSlider" min="0" max="100" value="0">
                    </div>
                    <div class="playback-time" id="playbackTime">0%</div>
                    <select id="playbackSpeed">
                        <option value="0.5">0.5x</option>
                        <option value="1" selected>1x</option>
                        <option value="2">2x</option>
                        <option value="5">5x</option>
                        <option value="10">10x</option>
                    </select>
                    <button class="playback-btn close" id="playbackClose" title="Close">x</button>
                `;
                document.body.appendChild(controls);
                
                document.getElementById('playbackPlay').addEventListener('click', () => this.togglePlay());
                document.getElementById('playbackStart').addEventListener('click', () => this.goToStart());
                document.getElementById('playbackEnd').addEventListener('click', () => this.goToEnd());
                document.getElementById('playbackBack').addEventListener('click', () => this.step(-10));
                document.getElementById('playbackForward').addEventListener('click', () => this.step(10));
                document.getElementById('playbackSlider').addEventListener('input', (e) => this.seekTo(e.target.value));
                document.getElementById('playbackSpeed').addEventListener('change', (e) => {
                    this.speed = parseFloat(e.target.value);
                });
                document.getElementById('playbackClose').addEventListener('click', () => this.stop());
            }
            
            controls.style.display = 'flex';
            document.getElementById('playbackSlider').max = this.trailData.length - 1;
        },
        
        togglePlay() {
            this.playing = !this.playing;
            document.getElementById('playbackPlay').innerHTML = this.playing ? '&#10074;&#10074;' : '&#9654;';
            
            if (this.playing) {
                this.interval = setInterval(() => {
                    if (this.currentIndex < this.trailData.length - 1) {
                        this.currentIndex++;
                        this.updatePosition();
                    } else {
                        this.togglePlay();
                    }
                }, 100 / this.speed);
            } else {
                clearInterval(this.interval);
            }
        },
        
        goToStart() {
            this.currentIndex = 0;
            this.updatePosition();
        },
        
        goToEnd() {
            this.currentIndex = this.trailData.length - 1;
            this.updatePosition();
        },
        
        step(amount) {
            this.currentIndex = Math.max(0, Math.min(this.trailData.length - 1, this.currentIndex + amount));
            this.updatePosition();
        },
        
        seekTo(index) {
            // parseInt('') or parseInt('abc') → NaN. Setting currentIndex to
            // NaN would cascade into the slider and break subsequent seeks.
            const n = parseInt(index, 10);
            if (!Number.isFinite(n) || !this.trailData?.length) return;
            this.currentIndex = Math.max(0, Math.min(this.trailData.length - 1, n));
            this.updatePosition();
        },
        
        updatePosition() {
            if (!this.trailData[this.currentIndex]) return;
            
            const point = this.trailData[this.currentIndex];
            
            this.playbackMarker.setLatLng([point.lat, point.lon]);
            
            if (this.currentIndex > 0) {
                const prev = this.trailData[this.currentIndex - 1];
                const heading = measureTool.calculateBearing(prev.lat, prev.lon, point.lat, point.lon);
                const el = this.playbackMarker.getElement()?.querySelector('.playback-aircraft');
                if (el) el.style.transform = `rotate(${heading}deg)`;
            }
            
            document.getElementById('playbackSlider').value = this.currentIndex;
            
            const elapsed = this.currentIndex;
            const total = this.trailData.length - 1;
            const percent = ((elapsed / total) * 100).toFixed(0);
            document.getElementById('playbackTime').textContent = `${percent}%`;
            
            if (this.playing) {
                map.panTo([point.lat, point.lon], { animate: true, duration: 0.1 });
            }
        },
        
        stop() {
            this.active = false;
            this.playing = false;
            clearInterval(this.interval);
            
            if (this.playbackMarker) {
                map.removeLayer(this.playbackMarker);
                this.playbackMarker = null;
            }
            
            const controls = document.getElementById('playbackControls');
            if (controls) {
                controls.style.display = 'none';
            }
            
            this.trailData = [];
            this.currentIndex = 0;
        }
    };

    // ============ KEYBOARD SHORTCUTS ============
    const keyboardShortcuts = {
        enabled: true,
        showHelp: false,
        
        shortcuts: {
            'Escape': { action: 'deselect', description: 'Deselect aircraft / Close panels' },
            '/': { action: 'search', description: 'Focus search box' },
            'f': { action: 'follow', description: 'Toggle follow mode' },
            'l': { action: 'labels', description: 'Toggle labels' },
            'a': { action: 'airports', description: 'Toggle airports' },
            'r': { action: 'radar', description: 'Toggle weather radar' },
            'c': { action: 'compact', description: 'Toggle compact mode' },
            'm': { action: 'cycleMap', description: 'Cycle map style' },
            'g': { action: 'geolocate', description: 'Go to my location' },
            '?': { action: 'help', description: 'Show keyboard shortcuts' },
            'ArrowUp': { action: 'panUp', description: 'Pan map up' },
            'ArrowDown': { action: 'panDown', description: 'Pan map down' },
            'ArrowLeft': { action: 'panLeft', description: 'Pan map left' },
            'ArrowRight': { action: 'panRight', description: 'Pan map right' },
            '+': { action: 'zoomIn', description: 'Zoom in' },
            '=': { action: 'zoomIn', description: 'Zoom in' },
            '-': { action: 'zoomOut', description: 'Zoom out' },
            '[': { action: 'prevAircraft', description: 'Select previous aircraft' },
            ']': { action: 'nextAircraft', description: 'Select next aircraft' },
            's': { action: 'settings', description: 'Toggle settings panel' },
            'i': { action: 'info', description: 'Toggle info panel (if aircraft selected)' },
            't': { action: 'trail', description: 'Toggle trail visibility' },
            'w': { action: 'watchlist', description: 'Add/remove from watchlist' },
            'e': { action: 'export', description: 'Export trail (KML)' },
            'd': { action: 'measure', description: 'Toggle distance measure tool' },
            'n': { action: 'minimap', description: 'Toggle mini-map' },
            'h': { action: 'heatmap', description: 'Toggle traffic heatmap' },
            'p': { action: 'airspace', description: 'Toggle airspace overlay' },
            '3': { action: 'view3d', description: 'Toggle 3D view' },
            'b': { action: 'stats', description: 'Toggle statistics panel' },
            'P': { action: 'prediction', description: 'Toggle flight prediction' },
            'G': { action: 'route', description: 'Toggle great circle route' },
            'o': { action: 'weatherOverlay', description: 'Toggle weather overlay (SIGMETs/Wind)' },
            'M': { action: 'multiSelect', description: 'Toggle multi-select mode' },
            'C': { action: 'compare', description: 'Compare selected aircraft' },
            'T': { action: 'timeMachine', description: 'Open Time Machine' },
            'K': { action: 'cluster', description: 'Toggle clustering' },
            'Z': { action: 'geofence', description: 'Toggle geofence panel' },
            'S': { action: 'screenshot', description: 'Take screenshot' },
        },
        
        init() {
            this._throttledHandler = perfUtils.throttle((e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                    if (e.key === 'Escape') e.target.blur();
                    return;
                }
                if (!this.enabled) return;
                
                // Handle CTRL+Z for measure tool undo
                if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                    if (typeof measureTool !== 'undefined' && measureTool.active) {
                        e.preventDefault();
                        measureTool.undo();
                        return;
                    }
                }
                
                const shortcut = this.shortcuts[e.key];
                if (!shortcut) return;
                e.preventDefault();
                this.executeAction(shortcut.action);
            }, 100);
            document.addEventListener('keydown', this._throttledHandler);
        },
        
        handleKeydown(e) {
            // Legacy method - now handled by throttled version in init
            if (this._throttledHandler) {
                this._throttledHandler(e);
            }
        },
        
        executeAction(action) {
            switch (action) {
                case 'deselect':
                    deselectAircraft();
                    _el('settingsPanel').classList.remove('show');
                    _el('airportPanel').classList.remove('show');
                    _el('statsPanel')?.classList.remove('show');
                    _el('statsBtn')?.classList.remove('active');
                    keyboardShortcuts.hideHelp();
                    document.getElementById('comparisonPanel')?.classList.remove('show');
                    if (multiSelect.enabled) multiSelect.clearAll();
                    break;
                case 'search':
                    document.getElementById('searchInput').focus();
                    break;
                case 'follow':
                    settings.followMode = !settings.followMode;
                    document.getElementById('followBtn')?.classList.toggle('active', settings.followMode);
                    
                    // Disable multi-select if it's enabled - they are mutually exclusive
                    if (settings.followMode && typeof multiSelect !== 'undefined' && multiSelect.enabled) {
                        multiSelect.enabled = false;
                        document.getElementById('multiSelectBtn')?.classList.remove('active');
                        document.body.classList.remove('multi-select-mode');
                        multiSelect.hideToolbar();
                        multiSelect.clearAll();
                        toast('Multi-select disabled');
                    }
                    
                    toast(settings.followMode ? 'Follow mode ON' : 'Follow mode OFF');
                    if (settings.followMode && selectedHex) {
                        const ac = aircraftCache[selectedHex];
                        if (ac?.lat !== undefined) map.panTo([ac.lat, ac.lon]);
                    }
                    saveSettings();
                    break;
                case 'labels':
                    settings.showLabels = !settings.showLabels;
                    document.getElementById('labelBtn').classList.toggle('active', settings.showLabels);
                    setToggleState(document.getElementById('toggleLabels'), settings.showLabels);
                    saveSettings();
                    updateMarkers();
                    toast(settings.showLabels ? 'Labels ON' : 'Labels OFF');
                    break;
                case 'airports':
                    settings.showAirports = !settings.showAirports;
                    document.getElementById('airportsBtn').classList.toggle('active', settings.showAirports);
                    setToggleState(document.getElementById('toggleAirports'), settings.showAirports);
                    saveSettings();
                    updateAirportMarkers();
                    toast(settings.showAirports ? 'Airports ON' : 'Airports OFF');
                    break;
                case 'radar':
                    toggleRadar();
                    break;
                case 'compact':
                    document.body.classList.toggle('compact-mode');
                    settings.compactMode = document.body.classList.contains('compact-mode');
                    saveSettings();
                    toast(settings.compactMode ? 'Compact mode ON' : 'Compact mode OFF');
                    break;
                case 'cycleMap':
                    const styles = ['dark', 'satellite', 'google-streets', 'google-satellite', 'google-hybrid', 'google-terrain'];
                    const nextIndex = (styles.indexOf(currentBaseMap) + 1) % styles.length;
                    changeBasemap(styles[nextIndex]);
                    toast('Map: ' + styles[nextIndex]);
                    break;
                case 'geolocate':
                    geolocate();
                    break;
                case 'help':
                    this.toggleHelp();
                    break;
                case 'panUp':
                    map.panBy([0, -100]);
                    break;
                case 'panDown':
                    map.panBy([0, 100]);
                    break;
                case 'panLeft':
                    map.panBy([-100, 0]);
                    break;
                case 'panRight':
                    map.panBy([100, 0]);
                    break;
                case 'zoomIn':
                    map.zoomIn();
                    break;
                case 'zoomOut':
                    map.zoomOut();
                    break;
                case 'prevAircraft':
                case 'nextAircraft':
                    this.cycleAircraft(action === 'nextAircraft' ? 1 : -1);
                    break;
                case 'settings':
                    document.getElementById('settingsBtn').click();
                    break;
                case 'info':
                    if (selectedHex) _el('infoPanel').classList.toggle('show');
                    break;
                case 'trail':
                    if (trailLine) {
                        if (map.hasLayer(trailLine._group || trailLine)) {
                            map.removeLayer(trailLine._group || trailLine);
                            toast('Trail hidden');
                        } else {
                            map.addLayer(trailLine._group || trailLine);
                            toast('Trail shown');
                        }
                    }
                    break;
                case 'watchlist':
                    if (selectedHex) {
                        document.getElementById('watchBtn')?.click();
                    }
                    break;
                case 'export':
                    if (selectedHex) {
                        exportTrail(selectedHex, 'kml');
                    }
                    break;
                case 'measure':
                    measureTool.toggle();
                    break;
                case 'minimap':
                    miniMap.toggle();
                    break;
                case 'heatmap':
                    heatmapLayer.toggle();
                    break;
                case 'airspace':
                    airspaceLayer.toggle();
                    break;
                case 'view3d':
                    view3D.toggle();
                    break;
                case 'stats':
                    statsSystem.toggle();
                    break;
                case 'prediction':
                    if (selectedHex) {
                        const ac = aircraftCache[selectedHex];
                        routePredictor.togglePrediction(ac);
                    } else {
                        toast('Select an aircraft first');
                    }
                    break;
                case 'route':
                    if (selectedHex) {
                        const ac = aircraftCache[selectedHex];
                        routePredictor.toggleRoute(ac);
                    } else {
                        toast('Select an aircraft first');
                    }
                    break;
                case 'weatherOverlay':
                    weatherOverlay.toggle();
                    break;
                case 'multiSelect':
                    multiSelect.toggle();
                    break;
                case 'compare':
                    if (multiSelect.selected.size >= 2) {
                        multiSelect.showComparison();
                    } else if (multiSelect.selected.size === 1 && selectedHex) {
                        multiSelect.add(selectedHex);
                        multiSelect.showComparison();
                    } else {
                        toast('Select at least 2 aircraft to compare (use M for multi-select mode)');
                    }
                    break;
                // Phase 14 actions
                case 'timeMachine':
                    if (timeMachine.active) {
                        timeMachine.exit();
                    } else {
                        timeMachine.showLoadDialog();
                    }
                    break;
                case 'cluster':
                    clusterManager.toggle();
                    break;
                case 'geofence':
                    geofencing.togglePanel();
                    break;
                case 'screenshot':
                    captureSystem.takeScreenshot();
                    break;
            }
        },
        
        cycleAircraft(direction) {
            const hexList = Object.keys(aircraftCache).filter(hex => {
                const ac = aircraftCache[hex];
                return ac.lat !== undefined && ac.lon !== undefined;
            }).sort();
            if (hexList.length === 0) return;
            let currentIndex = selectedHex ? hexList.indexOf(selectedHex) : -1;
            let newIndex = currentIndex + direction;
            if (newIndex < 0) newIndex = hexList.length - 1;
            if (newIndex >= hexList.length) newIndex = 0;
            selectAircraft(hexList[newIndex]);
        },
        
        toggleHelp() {
            let helpPanel = document.getElementById('keyboardHelp');
            if (!helpPanel) helpPanel = this.createHelpPanel();
            const nextOpen = !helpPanel.classList.contains('show');
            helpPanel.classList.toggle('show', nextOpen);
            helpPanel.setAttribute('aria-hidden', String(!nextOpen));
            if (nextOpen) {
                helpPanel.querySelector('.keyboard-help-close')?.focus();
            }
        },

        hideHelp() {
            const helpPanel = document.getElementById('keyboardHelp');
            if (!helpPanel) return;
            helpPanel.classList.remove('show');
            helpPanel.setAttribute('aria-hidden', 'true');
        },
        
        createHelpPanel() {
            const panel = document.createElement('div');
            panel.id = 'keyboardHelp';
            panel.className = 'keyboard-help';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'false');
            panel.setAttribute('aria-hidden', 'true');
            panel.setAttribute('aria-labelledby', 'keyboardHelpTitle');
            const shortcuts = Object.entries(this.shortcuts)
                .filter(([key]) => !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '='].includes(key))
                .map(([key, info]) => '<div class="shortcut-item"><kbd>' + (key === ' ' ? 'Space' : key) + '</kbd><span>' + info.description + '</span></div>').join('');
            panel.innerHTML = '<div class="keyboard-help-header"><span id="keyboardHelpTitle">Keyboard Shortcuts</span><button type="button" class="keyboard-help-close" aria-label="Close Keyboard Shortcuts">×</button></div><div class="keyboard-help-content">' + shortcuts + '<div class="shortcut-item"><kbd>Arrows</kbd><span>Pan map</span></div></div>';
            panel.querySelector('.keyboard-help-close').addEventListener('click', () => this.hideHelp());
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.hideHelp();
                }
            });
            document.body.appendChild(panel);
            return panel;
        }
    };

    // ============ THEME MANAGER ============
    const themeManager = {
        defaults: { accent: '#ffd700', trail: '#00ffff', selection: '#00ffff' },
        currentTheme: null,
        
        init() {
            this.load();
            this.setupListeners();
        },
        
        load() {
            const saved = JSON.parse(localStorage.getItem('skytrack_theme') || '{}');
            const theme = { ...this.defaults, ...saved };
            this.apply(theme);
            const accentPicker = document.getElementById('accentColorPicker');
            const selectionPicker = document.getElementById('selectionColorPicker');
            if (accentPicker) accentPicker.value = theme.accent;
            if (selectionPicker) selectionPicker.value = theme.selection;
        },
        
        save(theme) {
            localStorage.setItem('skytrack_theme', JSON.stringify(theme));
        },
        
        apply(theme) {
            document.documentElement.style.setProperty('--accent', theme.accent);
            document.documentElement.style.setProperty('--selected', theme.selection);
            this.currentTheme = theme;
        },
        
        setupListeners() {
            document.getElementById('accentColorPicker')?.addEventListener('input', (e) => {
                const theme = this.getTheme();
                theme.accent = e.target.value;
                this.apply(theme);
                this.save(theme);
            });
            document.getElementById('trailColorPicker')?.addEventListener('input', (e) => {
                const theme = this.getTheme();
                theme.trail = e.target.value;
                this.apply(theme);
                this.save(theme);
                if (selectedHex) loadTrail(selectedHex);
            });
            document.getElementById('selectionColorPicker')?.addEventListener('input', (e) => {
                const theme = this.getTheme();
                theme.selection = e.target.value;
                this.apply(theme);
                this.save(theme);
                updateMarkers();
            });
            document.getElementById('resetThemeBtn')?.addEventListener('click', () => {
                this.apply(this.defaults);
                this.save(this.defaults);
                const accentPicker = document.getElementById('accentColorPicker');
                const selectionPicker = document.getElementById('selectionColorPicker');
                if (accentPicker) accentPicker.value = this.defaults.accent;
                if (selectionPicker) selectionPicker.value = this.defaults.selection;
                toast('Theme reset to default');
            });
        },
        
        getTheme() {
            return {
                accent: document.getElementById('accentColorPicker')?.value || this.defaults.accent,
                selection: document.getElementById('selectionColorPicker')?.value || this.defaults.selection
            };
        }
    };

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

    // ============ PHASE 6: TRAFFIC HEATMAP ============
    const heatmapLayer = {
        layer: null,
        enabled: false,
        updateInterval: null,
        // Plugin loader state: prevents re-appending the <script> tag on every
        // update() call while the plugin is still downloading, and prevents
        // retry storms when the CDN is unreachable. Values:
        //   null     — not yet attempted
        //   Promise  — load in flight, update() waits on this
        //   true     — plugin loaded
        //   'failed' — load failed; subsequent update()s skip without retry
        _pluginState: null,

        toggle() {
            this.enabled = !this.enabled;
            document.getElementById('heatmapBtn')?.classList.toggle('active', this.enabled);

            if (this.enabled) {
                this.update();
                // Set up interval but only update when tab is visible
                this.updateInterval = setInterval(() => {
                    if (perfUtils.isTabVisible()) {
                        this.update();
                    }
                }, 15000);
            } else {
                this.remove();
                if (this.updateInterval) {
                    clearInterval(this.updateInterval);
                    this.updateInterval = null;
                }
            }
        },

        _loadPlugin() {
            if (typeof L.heatLayer === 'function') { this._pluginState = true; return Promise.resolve(true); }
            if (this._pluginState === 'failed') return Promise.resolve(false);
            if (this._pluginState && typeof this._pluginState.then === 'function') return this._pluginState;
            this._pluginState = new Promise(resolve => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.heat/0.2.0/leaflet-heat.js';
                script.async = true;
                script.onload = () => { this._pluginState = true; resolve(true); };
                script.onerror = () => {
                    this._pluginState = 'failed';
                    errorHandler.log('Heatmap', 'leaflet-heat failed to load', 'warn');
                    resolve(false);
                };
                document.head.appendChild(script);
            });
            return this._pluginState;
        },

        async update() {
            if (!this.enabled) return;

            const points = Object.values(aircraftCache)
                .filter(ac => Number.isFinite(ac.lat) && Number.isFinite(ac.lon))
                .map(ac => [ac.lat, ac.lon, 1]);

            if (points.length === 0) return;

            const ok = await this._loadPlugin();
            // The user may have disabled the heatmap while we were loading.
            if (!this.enabled || !ok) return;
            this.remove();
            this.createLayer(points);
        },
        
        createLayer(points) {
            this.layer = L.heatLayer(points, {
                radius: 25,
                blur: 15,
                maxZoom: 12,
                gradient: {
                    0.0: 'transparent',
                    0.2: '#3b82f6',
                    0.4: '#22c55e',
                    0.6: '#ffd700',
                    0.8: '#f97316',
                    1.0: '#ef4444'
                }
            }).addTo(map);
        },
        
        remove() {
            if (this.layer) {
                map.removeLayer(this.layer);
                this.layer = null;
            }
        }
    };

    // ============ PHASE 6: ARRIVAL/DEPARTURE BOARDS ============
    const airportBoard = {
        visible: false,
        currentAirport: null,
        
        show(airport) {
            this.currentAirport = airport;
            this.visible = true;
            this.render();
        },
        
        hide() {
            this.visible = false;
            document.getElementById('airportBoard')?.classList.remove('visible');
        },
        
        render() {
            if (!this.currentAirport) return;
            
            let board = document.getElementById('airportBoard');
            if (!board) {
                board = document.createElement('div');
                board.id = 'airportBoard';
                board.className = 'airport-board';
                document.body.appendChild(board);
            }
            
            const apt = this.currentAirport;
            const icao = apt.icao;
            
            const arrivals = Object.values(aircraftCache).filter(ac => 
                ac.to === icao || ac.to === apt.iata
            ).slice(0, 10);
            
            const departures = Object.values(aircraftCache).filter(ac => 
                ac.from === icao || ac.from === apt.iata
            ).slice(0, 10);
            
            board.innerHTML = `
                <div class="board-header">
                    <div class="board-title">${_escHtml(apt.name)}</div>
                    <div class="board-codes">${_escHtml(apt.iata || '---')} / ${_escHtml(apt.icao)}</div>
                    <button class="board-close" id="boardClose">x</button>
                </div>
                <div class="board-content">
                    <div class="board-section">
                        <div class="board-section-title arrivals">ARRIVALS (${arrivals.length})</div>
                        <div class="board-list">
                            ${arrivals.length ? arrivals.map(ac => this.renderFlight(ac, 'arrival')).join('') : '<div class="board-empty">No inbound flights</div>'}
                        </div>
                    </div>
                    <div class="board-section">
                        <div class="board-section-title departures">DEPARTURES (${departures.length})</div>
                        <div class="board-list">
                            ${departures.length ? departures.map(ac => this.renderFlight(ac, 'departure')).join('') : '<div class="board-empty">No outbound flights</div>'}
                        </div>
                    </div>
                </div>
            `;
            
            board.classList.add('visible');
            
            document.getElementById('boardClose')?.addEventListener('click', () => this.hide());
            
            board.querySelectorAll('.board-flight').forEach(el => {
                el.addEventListener('click', () => selectAircraft(el.dataset.hex));
            });
        },
        
        renderFlight(ac, type) {
            const callsign = ac.flight?.trim() || ac.hex;
            const origin = type === 'arrival' ? (ac.from || '---') : this.currentAirport.icao;
            const dest = type === 'arrival' ? this.currentAirport.icao : (ac.to || '---');
            const alt = ac.alt_baro === 'ground' ? 'GND' : (ac.alt_baro ? Math.round(ac.alt_baro / 100) * 100 + 'ft' : '---');
            let dist = '---';
            if (type === 'arrival' && this.currentAirport && ac.lat !== undefined) {
                dist = Math.round(haversineDistance(ac.lat, ac.lon, this.currentAirport.lat, this.currentAirport.lon)) + 'km';
            }
            
            return `
                <div class="board-flight" data-hex="${_escHtml(ac.hex)}">
                    <div class="flight-callsign">${_escHtml(callsign)}</div>
                    <div class="flight-route">${_escHtml(origin)} - ${_escHtml(dest)}</div>
                    <div class="flight-type">${_escHtml(ac.t || '---')}</div>
                    <div class="flight-alt">${_escHtml(alt)}</div>
                    ${type === 'arrival' ? `<div class="flight-dist">${_escHtml(dist)}</div>` : '<div class="flight-dist"></div>'}
                </div>
            `;
        },
        
        refresh() {
            if (this.visible && this.currentAirport) this.render();
        }
    };

    // ============ PHASE 6: AIRSPACE OVERLAY ============
    const airspaceLayer = {
        layer: null,
        enabled: false,
        
        async toggle() {
            this.enabled = !this.enabled;
            document.getElementById('airspaceBtn')?.classList.toggle('active', this.enabled);
            
            if (this.enabled) {
                await this.load();
            } else {
                this.remove();
            }
        },
        
        async load() {
            if (this.layer) {
                this.layer.addTo(map);
                return;
            }
            
            toast('Loading airspace...');
            const airspaces = this.getCommonAirspaces();
            this.createLayer(airspaces);
            toast('Airspace loaded');
        },
        
        getCommonAirspaces() {
            return [
                // Class B (major airports)
                { name: 'LAX Class B', type: 'B', center: [33.9425, -118.408], radius: 50, color: '#3b82f6' },
                { name: 'JFK Class B', type: 'B', center: [40.6413, -73.7781], radius: 40, color: '#3b82f6' },
                { name: 'ORD Class B', type: 'B', center: [41.9742, -87.9073], radius: 45, color: '#3b82f6' },
                { name: 'DFW Class B', type: 'B', center: [32.8998, -97.0403], radius: 45, color: '#3b82f6' },
                { name: 'ATL Class B', type: 'B', center: [33.6407, -84.4277], radius: 45, color: '#3b82f6' },
                { name: 'DEN Class B', type: 'B', center: [39.8561, -104.6737], radius: 45, color: '#3b82f6' },
                { name: 'SFO Class B', type: 'B', center: [37.6213, -122.3790], radius: 40, color: '#3b82f6' },
                { name: 'SEA Class B', type: 'B', center: [47.4502, -122.3088], radius: 40, color: '#3b82f6' },
                { name: 'PHX Class B', type: 'B', center: [33.4373, -112.0078], radius: 40, color: '#3b82f6' },
                { name: 'MIA Class B', type: 'B', center: [25.7959, -80.2870], radius: 40, color: '#3b82f6' },
                { name: 'BOS Class B', type: 'B', center: [42.3656, -71.0096], radius: 35, color: '#3b82f6' },
                { name: 'LAS Class B', type: 'B', center: [36.0840, -115.1537], radius: 40, color: '#3b82f6' },
                // Restricted areas
                { name: 'R-2508 Edwards AFB', type: 'R', center: [34.9, -117.9], radius: 80, color: '#ef4444' },
                { name: 'R-4807 White Sands', type: 'R', center: [33.0, -106.5], radius: 60, color: '#ef4444' },
                { name: 'R-2301 Eglin AFB', type: 'R', center: [30.5, -86.5], radius: 50, color: '#ef4444' },
                { name: 'R-4808 Nevada Test', type: 'R', center: [37.2, -116.0], radius: 50, color: '#ef4444' },
                { name: 'R-2903 Twentynine Palms', type: 'R', center: [34.3, -116.0], radius: 40, color: '#ef4444' },
                // Prohibited areas
                { name: 'DC FRZ (P-56)', type: 'P', center: [38.8977, -77.0365], radius: 15, color: '#a855f7' },
                { name: 'Camp David (P-40)', type: 'P', center: [39.6479, -77.4649], radius: 5, color: '#a855f7' },
            ];
        },
        
        createLayer(airspaces) {
            this.layer = L.layerGroup();
            
            airspaces.forEach(a => {
                const circle = L.circle(a.center, {
                    radius: a.radius * 1852,
                    color: a.color,
                    fillColor: a.color,
                    fillOpacity: 0.08,
                    weight: 2,
                    dashArray: a.type === 'R' || a.type === 'P' ? '8,4' : null
                });
                
                circle.bindPopup(`<strong>${a.name}</strong><br>Class ${a.type} Airspace<br>Radius: ${a.radius} nm`);
                this.layer.addLayer(circle);
                
                const label = L.marker(a.center, {
                    icon: L.divIcon({
                        className: 'airspace-label',
                        html: `<div style="color:${a.color}">${a.type}</div>`,
                        iconSize: [24, 24]
                    })
                });
                this.layer.addLayer(label);
            });
            
            this.layer.addTo(map);
        },
        
        remove() {
            if (this.layer) map.removeLayer(this.layer);
        }
    };

    // ============ PHASE 6: 3D VIEW TOGGLE ============
    const view3D = {
        enabled: false,
        cesiumViewer: null,
        entityMap: new Map(),
        trailMap: new Map(),
        modelUri: null,
        updateTimer: null,
        
        createAirplaneGLB() {
            // Build proper 3D airplane with tubular fuselage, swept wings, tail, engines
            const verts = [];
            const indices = [];
            let vi = 0;
            function addV(x,y,z) { verts.push(x,y,z); return vi++; }
            function tri(a,b,c) { indices.push(a,b,c); }
            function quad(a,b,c,d) { tri(a,b,c); tri(a,c,d); }
            
            // Fuselage - 8-sided tube with nose cone and tail taper
            const stations = [
                {z:-6.0, rx:0.00, ry:0.00},  // nose tip
                {z:-4.5, rx:0.20, ry:0.18},  // nose cone
                {z:-3.0, rx:0.35, ry:0.32},  // cockpit
                {z:-1.0, rx:0.42, ry:0.38},  // forward cabin
                {z: 0.0, rx:0.44, ry:0.40},  // mid (widest)
                {z: 1.5, rx:0.43, ry:0.39},  // aft cabin
                {z: 3.0, rx:0.35, ry:0.32},  // taper begin
                {z: 4.2, rx:0.22, ry:0.20},  // tail taper
                {z: 5.5, rx:0.08, ry:0.07},  // tail tip
            ];
            const sides = 8;
            const noseTip = addV(0, 0, -6.0);
            const rings = [];
            for (let si = 1; si < stations.length; si++) {
                const s = stations[si]; const ring = [];
                for (let j = 0; j < sides; j++) {
                    const a = (j/sides) * Math.PI * 2;
                    ring.push(addV(Math.cos(a)*s.rx, Math.sin(a)*s.ry, s.z));
                }
                rings.push(ring);
            }
            // Nose cone
            for (let j=0; j<sides; j++) tri(noseTip, rings[0][j], rings[0][(j+1)%sides]);
            // Fuselage body
            for (let ri=0; ri<rings.length-1; ri++)
                for (let j=0; j<sides; j++) { const j2=(j+1)%sides; quad(rings[ri][j], rings[ri][j2], rings[ri+1][j2], rings[ri+1][j]); }
            // Tail cap
            const tailTip = addV(0, 0, 5.5);
            const lr = rings[rings.length-1];
            for (let j=0; j<sides; j++) tri(lr[j], tailTip, lr[(j+1)%sides]);
            
            // Wings - swept, tapered, with airfoil thickness
            const wt = 0.055;
            function wing(sign) {
                const s = sign;
                const rl = addV(s*0.44, wt, -0.3);   // root leading top
                const rlb= addV(s*0.44,-wt, -0.3);   // root leading bottom
                const rt = addV(s*0.44, wt,  2.0);   // root trailing top
                const rtb= addV(s*0.44,-wt,  2.0);   // root trailing bottom
                const ml = addV(s*2.5, wt*0.7, 0.5);  // mid leading top
                const mlb= addV(s*2.5,-wt*0.7, 0.5);  // mid leading bottom
                const mt = addV(s*2.5, wt*0.5, 2.5);  // mid trailing top
                const mtb= addV(s*2.5,-wt*0.5, 2.5);  // mid trailing bottom
                const tl = addV(s*5.2, wt*0.25, 1.4); // tip leading top
                const tlb= addV(s*5.2,-wt*0.25, 1.4); // tip leading bottom
                const tt = addV(s*5.2, wt*0.15, 2.8); // tip trailing top
                const ttb= addV(s*5.2,-wt*0.15, 2.8); // tip trailing bottom
                // Top surface
                quad(rl, ml, mt, rt); quad(ml, tl, tt, mt);
                // Bottom surface
                quad(rlb, rtb, mtb, mlb); quad(mlb, mtb, ttb, tlb);
                // Leading edge
                quad(rl, rlb, mlb, ml); quad(ml, mlb, tlb, tl);
                // Trailing edge
                quad(rt, mt, mtb, rtb); quad(mt, tt, ttb, mtb);
                // Wingtip cap
                quad(tl, tt, ttb, tlb);
            }
            wing(-1); wing(1);
            
            // Vertical stabilizer (fin)
            const ft = 0.028;
            const fl=addV(-ft,0.20,3.2), fr=addV(ft,0.20,3.2);
            const ftl=addV(-ft,1.55,3.8), ftr=addV(ft,1.55,3.8);
            const frl=addV(-ft,1.40,5.1), frr=addV(ft,1.40,5.1);
            const fbl=addV(-ft,0.07,5.3), fbr=addV(ft,0.07,5.3);
            quad(fl,ftl,frl,fbl); quad(fr,fbr,frr,ftr); // sides
            quad(fl,fr,ftr,ftl); quad(ftl,ftr,frr,frl); // leading + top
            quad(frl,frr,fbr,fbl); // trailing
            
            // Horizontal stabilizer
            const ht = 0.035;
            function htail(sign) {
                const s = sign;
                const rf=addV(s*0.15, ht, 4.0), rfb=addV(s*0.15,-ht, 4.0);
                const rr=addV(s*0.15, ht, 5.1), rrb=addV(s*0.15,-ht, 5.1);
                const tf=addV(s*1.9, ht*0.4, 4.7), tfb=addV(s*1.9,-ht*0.4, 4.7);
                const tr_=addV(s*1.9, ht*0.25, 5.4), trb=addV(s*1.9,-ht*0.25, 5.4);
                quad(rf,tf,tr_,rr); quad(rfb,rrb,trb,tfb); // top/bottom
                quad(rf,rfb,tfb,tf); quad(rr,tr_,trb,rrb); // leading/trailing
                quad(tf,tr_,trb,tfb); // tip
            }
            htail(-1); htail(1);
            
            // Engine nacelles (6-sided cylinders under wings)
            function engine(cx,cy,cz,len,rad) {
                const ns=6, fc=addV(cx,cy,cz-len/2), rc=addV(cx,cy,cz+len/2);
                const fr_=[],rr_=[];
                for(let j=0;j<ns;j++){const a=(j/ns)*Math.PI*2;
                    fr_.push(addV(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad,cz-len/2));
                    rr_.push(addV(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad,cz+len/2));}
                for(let j=0;j<ns;j++){const j2=(j+1)%ns;
                    tri(fc,fr_[j2],fr_[j]); tri(rc,rr_[j],rr_[j2]);
                    quad(fr_[j],fr_[j2],rr_[j2],rr_[j]);}
            }
            engine(-1.6,-0.32,0.9,2.0,0.17);
            engine( 1.6,-0.32,0.9,2.0,0.17);
            
            // Build GLB binary
            const nV=verts.length/3, nI=indices.length;
            const posBL=nV*3*4, idxBL=nI*2, idxPad=(4-(idxBL%4))%4, binLen=posBL+idxBL+idxPad;
            let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
            for(let i=0;i<verts.length;i+=3)for(let j=0;j<3;j++){mn[j]=Math.min(mn[j],verts[i+j]);mx[j]=Math.max(mx[j],verts[i+j]);}
            const gj=JSON.stringify({
                asset:{version:"2.0",generator:"SkyTrack"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
                meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],
                materials:[{pbrMetallicRoughness:{baseColorFactor:[0.88,0.90,0.93,1],metallicFactor:0.65,roughnessFactor:0.28},doubleSided:true,emissiveFactor:[0.1,0.1,0.14]}],
                accessors:[{bufferView:0,componentType:5126,count:nV,type:"VEC3",max:mx,min:mn},{bufferView:1,componentType:5123,count:nI,type:"SCALAR"}],
                bufferViews:[{buffer:0,byteOffset:0,byteLength:posBL,target:34962},{buffer:0,byteOffset:posBL,byteLength:idxBL,target:34963}],
                buffers:[{byteLength:binLen}]
            });
            const jp=(4-(gj.length%4))%4, je=new TextEncoder().encode(gj+' '.repeat(jp));
            const total=12+8+je.length+8+binLen, glb=new ArrayBuffer(total), dv=new DataView(glb);
            let o=0;
            dv.setUint32(o,0x46546C67,true);o+=4;dv.setUint32(o,2,true);o+=4;dv.setUint32(o,total,true);o+=4;
            dv.setUint32(o,je.length,true);o+=4;dv.setUint32(o,0x4E4F534A,true);o+=4;
            new Uint8Array(glb,o,je.length).set(je);o+=je.length;
            dv.setUint32(o,binLen,true);o+=4;dv.setUint32(o,0x004E4942,true);o+=4;
            for(let i=0;i<verts.length;i++){dv.setFloat32(o,verts[i],true);o+=4;}
            for(let i=0;i<indices.length;i++){dv.setUint16(o,indices[i],true);o+=2;}
            return URL.createObjectURL(new Blob([glb],{type:'model/gltf-binary'}));
        },
        
        getAltColor(ac) {
            if (ac.hex===selectedHex) return '#00ffcc';
            if (ac.militaryInfo) return '#ff6b6b';
            if (ac.isVIP||ac.interesting) return '#ffaa00';
            if (ac.piaInfo) return '#e056fd';
            const alt=ac.alt_baro;
            if (!alt||alt==='ground'||alt<500) return '#4ecdc4';
            if (alt<10000) return '#45b7d1';
            if (alt<25000) return '#96ceb4';
            if (alt<35000) return '#c8e6a0';
            if (alt<40000) return '#ffeaa7';
            return '#fdcb6e';
        },
        
        async toggle() {
            if (!this.enabled) {
                if (typeof Cesium==='undefined') {
                    toast('Loading 3D engine...');
                    try{await this.loadCesium();}catch(e){errorHandler.log('3D',e.message,'error');toast('Failed to load 3D engine');return;}
                }
                try{this.enable();}catch(e){errorHandler.log('3D',e.message,'error');toast('3D init failed');this.disable();}
            } else this.disable();
        },
        
        async loadCesium() {
            return new Promise((resolve,reject)=>{
                const timeout=setTimeout(()=>reject(new Error('timeout')),30000);
                const css=document.createElement('link');css.rel='stylesheet';
                css.href='https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Widgets/widgets.css';
                document.head.appendChild(css);
                window.CESIUM_BASE_URL='https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/';
                const s=document.createElement('script');
                s.src='https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Cesium.js';
                s.onload=()=>{clearTimeout(timeout);resolve();};
                s.onerror=()=>{clearTimeout(timeout);reject(new Error('Cesium load failed'));};
                document.head.appendChild(s);
            });
        },
        
        enable() {
            this.enabled=true;
            document.getElementById('view3DBtn')?.classList.add('active');
            let container=document.getElementById('cesiumContainer');
            if(!container){container=document.createElement('div');container.id='cesiumContainer';document.body.appendChild(container);}
            container.style.display='block';
            document.getElementById('map').style.display='none';
            
            if (!this.cesiumViewer) {
                Cesium.Ion.defaultAccessToken='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0ODU4Y2UzOS00YTM3LTRjMDQtOWIzYy0yM2FjYzMyMjM3YmMiLCJpZCI6MzgzOTMyLCJpYXQiOjE3Njk1MTExMDZ9.ufhWemohfJfWo62Nc7k9YfzEtW4N-B4pqx2VJFiou9k';
                this.cesiumViewer=new Cesium.Viewer('cesiumContainer',{
                    terrain:Cesium.Terrain.fromWorldTerrain(),
                    animation:false,timeline:false,baseLayerPicker:false,
                    geocoder:false,homeButton:false,sceneModePicker:false,
                    navigationHelpButton:false,fullscreenButton:false,
                    shouldAnimate:true
                });
                this.modelUri=this.createAirplaneGLB();
                const scene=this.cesiumViewer.scene;
                scene.backgroundColor=Cesium.Color.fromCssColorString('#05050f');
                scene.globe.baseColor=Cesium.Color.fromCssColorString('#0a0a1a');
                scene.globe.showGroundAtmosphere=true;
                scene.fog.enabled=true; scene.fog.density=0.0002;
                if(scene.skyAtmosphere){scene.skyAtmosphere.hueShift=-0.05;scene.skyAtmosphere.saturationShift=-0.2;scene.skyAtmosphere.brightnessShift=-0.3;}
                try{this.cesiumViewer.cesiumWidget.creditContainer.style.display='none';}catch(e){}
                
                // Click to select aircraft
                const handler=new Cesium.ScreenSpaceEventHandler(scene.canvas);
                handler.setInputAction((click)=>{
                    const picked=scene.pick(click.position);
                    if(Cesium.defined(picked)&&picked.id&&picked.id._skytrackHex){selectAircraft(picked.id._skytrackHex);this.updateAircraft();}
                },Cesium.ScreenSpaceEventType.LEFT_CLICK);
            }
            
            const center=map.getCenter();
            const alt=Math.pow(2,20-map.getZoom())*500;
            this.cesiumViewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(center.lng,center.lat,alt),duration:0});
            
            this.updateAircraft();
            if(this.updateTimer)clearInterval(this.updateTimer);
            this.updateTimer=setInterval(()=>this.updateAircraft(),2000);
            toast('3D Globe active');
        },
        
        disable() {
            this.enabled=false;
            document.getElementById('view3DBtn')?.classList.remove('active');
            if(this.updateTimer){clearInterval(this.updateTimer);this.updateTimer=null;}
            if(this.cesiumViewer){try{
                const carto=this.cesiumViewer.scene.globe.ellipsoid.cartesianToCartographic(this.cesiumViewer.camera.position);
                map.setView([Cesium.Math.toDegrees(carto.latitude),Cesium.Math.toDegrees(carto.longitude)],
                    Math.max(2,Math.min(18,Math.round(Math.log2(38000000/Math.max(carto.height,100))))),{animate:false});
            }catch(e){}}
            const container=document.getElementById('cesiumContainer');
            if(container)container.style.display='none';
            document.getElementById('map').style.display='block';
            if(typeof map!=='undefined'&&map){setTimeout(()=>{map.invalidateSize();if(typeof updateMarkers==='function')updateMarkers();},100);}
            toast('2D view restored');
        },
        
        updateAircraft() {
            if(!this.enabled||!this.cesiumViewer)return;
            const now=Date.now();
            const jNow=this.cesiumViewer.clock.currentTime.clone();
            const activeHexes=new Set();
            
            Object.entries(aircraftCache).forEach(([hex,ac])=>{
                if(ac.lat===undefined||ac.lon===undefined)return;
                if(now-ac.lastSeen>120000)return;
                activeHexes.add(hex);
                
                const altFt=(typeof ac.alt_baro==='number')?ac.alt_baro:0;
                const altM=altFt<200?80:altFt*0.3048;
                const newPos=Cesium.Cartesian3.fromDegrees(ac.lon,ac.lat,altM);
                const color=Cesium.Color.fromCssColorString(this.getAltColor(ac));
                const isHeavy=ac.t&&/A38|B74|B77|A34|C5|C17|AN[12]|IL7|B78|A35/.test(ac.t);
                const isMed=ac.t&&/A3[12]|B73|B75|B76|E[17][9]|A22|MD|CRJ|E7/.test(ac.t);
                const scale=isHeavy?7.5:isMed?5:3.5;
                
                let entity=this.entityMap.get(hex);
                if(entity){
                    // Add position sample - VelocityOrientationProperty auto-derives heading from movement
                    const pp=entity.position;
                    if(pp instanceof Cesium.SampledPositionProperty) pp.addSample(jNow,newPos);
                    entity.model.color=color;
                    entity.model.scale=scale;
                    if(entity.label)entity.label.text=ac.flight?.trim()||ac.r||hex;
                } else {
                    // SampledPositionProperty for smooth interpolation between updates
                    const posP=new Cesium.SampledPositionProperty();
                    posP.setInterpolationOptions({interpolationDegree:1,interpolationAlgorithm:Cesium.LinearApproximation});
                    posP.forwardExtrapolationType=Cesium.ExtrapolationType.EXTRAPOLATE;
                    posP.forwardExtrapolationDuration=10;
                    
                    // Seed a back-position along track so VelocityOrientationProperty has immediate direction
                    const trackRad=(ac.track||0)*Math.PI/180;
                    const backDist=0.008; // ~800m back along track
                    const prevLat=ac.lat-Math.cos(trackRad)*backDist;
                    const prevLon=ac.lon-Math.sin(trackRad)*backDist;
                    const prevTime=Cesium.JulianDate.addSeconds(jNow,-3,new Cesium.JulianDate());
                    posP.addSample(prevTime,Cesium.Cartesian3.fromDegrees(prevLon,prevLat,altM));
                    posP.addSample(jNow,newPos);
                    
                    // Orientation derived from movement direction - always faces where it's flying
                    const velOri=new Cesium.VelocityOrientationProperty(posP);
                    
                    entity=this.cesiumViewer.entities.add({
                        position:posP,
                        orientation:velOri,
                        model:{
                            uri:this.modelUri,
                            scale:scale,
                            color:color,
                            colorBlendMode:Cesium.ColorBlendMode.MIX,
                            colorBlendAmount:0.6,
                            minimumPixelSize:14,
                            maximumScale:1500,
                            silhouetteColor:Cesium.Color.WHITE.withAlpha(0.15),
                            silhouetteSize:0.8
                        },
                        label:{
                            text:ac.flight?.trim()||ac.r||hex,
                            font:'11px "Segoe UI",sans-serif',
                            fillColor:Cesium.Color.WHITE.withAlpha(0.9),
                            outlineColor:Cesium.Color.BLACK,
                            outlineWidth:2,
                            style:Cesium.LabelStyle.FILL_AND_OUTLINE,
                            pixelOffset:new Cesium.Cartesian2(0,-22),
                            scaleByDistance:new Cesium.NearFarScalar(5e3,1.0,1.5e6,0.2),
                            distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,800000),
                            showBackground:true,
                            backgroundColor:Cesium.Color.fromCssColorString('#0a0a1acc'),
                            backgroundPadding:new Cesium.Cartesian2(5,3)
                        }
                    });
                    entity._skytrackHex=hex;
                    this.entityMap.set(hex,entity);
                }
                
                // History trails
                if(ac.history&&ac.history.length>1){
                    const pts=[];
                    for(let i=Math.max(0,ac.history.length-200);i<ac.history.length;i++){
                        const h=ac.history[i];
                        const hAlt=(typeof h[2]==='number'&&h[2]>200)?h[2]*0.3048:80;
                        pts.push(Cesium.Cartesian3.fromDegrees(h[1],h[0],hAlt));
                    }
                    pts.push(newPos);
                    
                    let trail=this.trailMap.get(hex);
                    if(trail){
                        trail.polyline.positions=pts;
                        trail.polyline.material=color.withAlpha(0.55);
                        trail.polyline.width=hex===selectedHex?3:1.5;
                    } else {
                        trail=this.cesiumViewer.entities.add({
                            polyline:{positions:pts,width:hex===selectedHex?3:1.5,material:color.withAlpha(0.55),clampToGround:false}
                        });
                        trail._skytrackTrail=hex;
                        this.trailMap.set(hex,trail);
                    }
                }
            });
            
            // Remove stale
            for(const[hex,e]of this.entityMap){if(!activeHexes.has(hex)){this.cesiumViewer.entities.remove(e);this.entityMap.delete(hex);}}
            for(const[hex,t]of this.trailMap){if(!activeHexes.has(hex)){this.cesiumViewer.entities.remove(t);this.trailMap.delete(hex);}}
        }
    };


    // ============ PHASE 12: DASHBOARD LAYOUT MANAGER ============
    const dashboardLayout = {
        panels: {
            infoPanel: { visible: true, position: 'left', order: 1 },
            statsPanel: { visible: false, position: 'right', order: 1 },
            settingsPanel: { visible: false, position: 'right', order: 2 },
            airportPanel: { visible: false, position: 'left', order: 2 },
            watchlist: { visible: true, position: 'bottom', order: 1 },
            bookmarks: { visible: true, position: 'bottom', order: 2 }
        },
        
        presets: {
            default: {
                infoPanel: { visible: true, position: 'left' },
                statsPanel: { visible: false, position: 'right' },
                watchlist: { visible: true, position: 'bottom' },
                bookmarks: { visible: true, position: 'bottom' }
            },
            minimal: {
                infoPanel: { visible: true, position: 'left' },
                statsPanel: { visible: false },
                watchlist: { visible: false },
                bookmarks: { visible: false }
            },
            analyst: {
                infoPanel: { visible: true, position: 'left' },
                statsPanel: { visible: true, position: 'right' },
                watchlist: { visible: true, position: 'bottom' },
                bookmarks: { visible: true, position: 'bottom' }
            }
        },
        
        currentPreset: 'default',
        
        init() {
            const saved = localStorage.getItem('skytrack_layout');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    this.panels = { ...this.panels, ...data.panels };
                    this.currentPreset = data.preset || 'default';
                } catch(e) {}
            }
            this.apply();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.querySelectorAll('.layout-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.applyPreset(btn.dataset.preset);
                });
            });
        },
        
        save() {
            localStorage.setItem('skytrack_layout', JSON.stringify({
                panels: this.panels,
                preset: this.currentPreset
            }));
        },
        
        apply() {
            // Update preset button states
            document.querySelectorAll('.layout-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === this.currentPreset);
            });
            
            // Apply panel visibility
            Object.entries(this.panels).forEach(([id, config]) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.dataset.position = config.position || 'left';
                el.style.order = config.order || 1;
            });
            
            // Handle bottom panels visibility
            const bottomPanels = document.querySelector('.bottom-panels');
            if (bottomPanels) {
                const watchlistPanel = bottomPanels.querySelector('.watchlist-panel');
                const bookmarksPanel = bottomPanels.querySelector('.bookmarks-panel');
                if (watchlistPanel) watchlistPanel.style.display = this.panels.watchlist?.visible !== false ? '' : 'none';
                if (bookmarksPanel) bookmarksPanel.style.display = this.panels.bookmarks?.visible !== false ? '' : 'none';
            }
        },
        
        applyPreset(presetName) {
            const preset = this.presets[presetName];
            if (!preset) return;
            
            this.currentPreset = presetName;
            this.panels = { ...this.panels };
            Object.entries(preset).forEach(([key, val]) => {
                if (this.panels[key]) {
                    this.panels[key] = { ...this.panels[key], ...val };
                }
            });
            
            this.apply();
            this.save();
            toast('Applied ' + presetName + ' layout');
        },
        
        togglePanel(panelId) {
            if (this.panels[panelId]) {
                this.panels[panelId].visible = !this.panels[panelId].visible;
                this.apply();
                this.save();
            }
        }
    };

    // ============ PHASE 12: ENHANCED THEME SYSTEM ============
    const themeSystem = {
        themes: {
            dark: {
                name: 'Dark',
                bg: '#1a1a2e',
                bgPanel: 'rgba(26, 26, 46, 0.95)',
                text: '#eee',
                textDim: '#aaa',
                accent: '#ffd700',
                selected: '#00ffff'
            },
            midnight: {
                name: 'Midnight',
                bg: '#0a0a14',
                bgPanel: 'rgba(10, 10, 20, 0.95)',
                text: '#e0e0e0',
                textDim: '#888',
                accent: '#00d4ff',
                selected: '#ff00ff'
            },
            light: {
                name: 'Light',
                bg: '#f5f5f5',
                bgPanel: 'rgba(255, 255, 255, 0.95)',
                text: '#222',
                textDim: '#555',
                accent: '#0066cc',
                selected: '#ff6600'
            },
            highContrast: {
                name: 'High Contrast',
                bg: '#000000',
                bgPanel: 'rgba(0, 0, 0, 0.95)',
                text: '#ffffff',
                textDim: '#cccccc',
                accent: '#ffff00',
                selected: '#00ff00'
            },
            colorBlind: {
                name: 'Color Blind',
                bg: '#1a1a2e',
                bgPanel: 'rgba(26, 26, 46, 0.95)',
                text: '#eee',
                textDim: '#aaa',
                accent: '#f0e442',
                selected: '#56b4e9'
            }
        },
        
        currentTheme: 'midnight',
        customColors: {},
        autoMode: false,
        
        init() {
            const saved = localStorage.getItem('skytrack_theme_v2');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    this.currentTheme = data.theme || 'midnight';
                    this.customColors = data.custom || {};
                    this.autoMode = data.autoMode || false;
                } catch(e) {}
            }
            
            if (this.autoMode) {
                this.checkAutoTheme();
                setInterval(() => this.checkAutoTheme(), 60000);
            } else {
                this.apply(this.currentTheme);
            }
            
            setToggleState(document.getElementById('toggleAutoTheme'), this.autoMode);
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // Theme option clicks
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    this.apply(opt.dataset.theme);
                });
            });
            
            // Auto theme toggle
            document.getElementById('toggleAutoTheme')?.addEventListener('click', () => {
                themeSystem.toggleAutoMode();
            });
            
            // Custom color pickers
            document.getElementById('accentColorPicker')?.addEventListener('input', (e) => {
                this.setCustomColor('accent', e.target.value);
            });
            document.getElementById('selectionColorPicker')?.addEventListener('input', (e) => {
                this.setCustomColor('selected', e.target.value);
            });
        },
        
        apply(themeName) {
            const theme = this.themes[themeName];
            if (!theme) return;
            
            this.currentTheme = themeName;
            
            const root = document.documentElement;
            root.style.setProperty('--bg', this.customColors.bg || theme.bg);
            root.style.setProperty('--bg-panel', this.customColors.bgPanel || theme.bgPanel);
            root.style.setProperty('--text', this.customColors.text || theme.text);
            root.style.setProperty('--text-dim', this.customColors.textDim || theme.textDim);
            root.style.setProperty('--accent', this.customColors.accent || theme.accent);
            root.style.setProperty('--selected', this.customColors.selected || theme.selected);
            
            document.body.classList.toggle('day-mode', themeName === 'light');
            
            // Update minimap theme
            const isDark = themeName !== 'light';
            if (typeof miniMap !== 'undefined' && miniMap.updateTheme) {
                miniMap.updateTheme(isDark);
            }
            
            // Update theme option UI
            document.querySelectorAll('.theme-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.theme === themeName);
            });
            
            // Update color pickers
            const accentPicker = document.getElementById('accentColorPicker');
            const selectionPicker = document.getElementById('selectionColorPicker');
            if (accentPicker) accentPicker.value = this.customColors.accent || theme.accent;
            if (selectionPicker) selectionPicker.value = this.customColors.selected || theme.selected;
            
            this.save();
        },
        
        setCustomColor(property, value) {
            this.customColors[property] = value;
            document.documentElement.style.setProperty('--' + property, value);
            this.save();
        },
        
        resetCustomColors() {
            this.customColors = {};
            this.apply(this.currentTheme);
            toast('Theme colors reset');
        },
        
        checkAutoTheme() {
            const hour = new Date().getHours();
            const isDaytime = hour >= 6 && hour < 20;
            this.apply(isDaytime ? 'light' : 'dark');
        },
        
        toggleAutoMode() {
            this.autoMode = !this.autoMode;
            setToggleState(document.getElementById('toggleAutoTheme'), this.autoMode);
            if (this.autoMode) {
                this.checkAutoTheme();
                toast('Auto day/night enabled');
            } else {
                toast('Auto day/night disabled');
            }
            this.save();
        },
        
        save() {
            localStorage.setItem('skytrack_theme_v2', JSON.stringify({
                theme: this.currentTheme,
                custom: this.customColors,
                autoMode: this.autoMode
            }));
        },
        
        exportTheme() {
            return JSON.stringify({
                base: this.currentTheme,
                custom: this.customColors
            });
        },
        
        importTheme(jsonStr) {
            try {
                const data = JSON.parse(jsonStr);
                if (data.base) this.currentTheme = data.base;
                if (data.custom) this.customColors = data.custom;
                this.apply(this.currentTheme);
                toast('Theme imported');
            } catch (e) {
                toast('Invalid theme data');
            }
        }
    };

    // ============ PHASE 12: ENHANCED TRAIL VISUALIZATION ============
    const trailRenderer = {
        options: {
            colorBy: 'altitude',
            showDirection: true,
            trailWidth: 3,
            opacity: 0.8
        },
        
        altitudeColors: [
            { value: 0, color: '#22c55e' },
            { value: 10000, color: '#3b82f6' },
            { value: 20000, color: '#ffd700' },
            { value: 30000, color: '#f97316' },
            { value: 40000, color: '#ef4444' }
        ],
        
        speedColors: [
            { value: 0, color: '#666' },
            { value: 150, color: '#22c55e' },
            { value: 300, color: '#3b82f6' },
            { value: 450, color: '#ffd700' },
            { value: 600, color: '#ef4444' }
        ],
        
        timeColors: [
            { value: 0, color: '#ef4444' },
            { value: 0.5, color: '#ffd700' },
            { value: 1, color: '#22c55e' }
        ],
        
        init() {
            const saved = localStorage.getItem('skytrack_trail_options');
            if (saved) {
                try {
                    this.options = { ...this.options, ...JSON.parse(saved) };
                } catch(e) {}
            }
            setToggleState(document.getElementById('toggleTrailArrows'), this.options.showDirection);
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('trailColorBy')?.addEventListener('change', (e) => {
                this.options.colorBy = e.target.value;
                this.save();
                if (selectedHex && trailLine) {
                    const ac = aircraftCache[selectedHex];
                    if (ac && ac.trailPoints) {
                        this.updateTrail(ac);
                    }
                }
            });
            
            document.getElementById('toggleTrailArrows')?.addEventListener('click', function() {
                const next = !this.classList.contains('on');
                setToggleState(this, next);
                trailRenderer.options.showDirection = next;
                trailRenderer.save();
            });
        },
        
        save() {
            localStorage.setItem('skytrack_trail_options', JSON.stringify(this.options));
        },
        
        createGradientTrail(points, aircraft) {
            if (!points || points.length < 2) return null;
            
            const segments = [];
            
            for (let i = 1; i < points.length; i++) {
                const p1 = points[i - 1];
                const p2 = points[i];
                
                let color;
                switch (this.options.colorBy) {
                    case 'altitude':
                        color = this.getColorForValue(p2[2] || 0, this.altitudeColors);
                        break;
                    case 'speed':
                        const speed = this.estimateSpeed(p1, p2);
                        color = this.getColorForValue(speed, this.speedColors);
                        break;
                    case 'time':
                        const progress = i / (points.length - 1);
                        color = this.getColorForValue(progress, this.timeColors);
                        break;
                    default:
                        color = getComputedStyle(document.documentElement).getPropertyValue('--selected').trim() || '#00ffff';
                }
                
                segments.push({
                    coords: [[p1[0], p1[1]], [p2[0], p2[1]]],
                    color: color,
                    weight: this.options.trailWidth
                });
            }
            
            const group = L.layerGroup();
            
            segments.forEach(seg => {
                const line = L.polyline(seg.coords, {
                    color: seg.color,
                    weight: seg.weight,
                    opacity: this.options.opacity,
                    lineCap: 'round',
                    lineJoin: 'round'
                });
                group.addLayer(line);
            });
            
            // Add direction arrows if enabled
            if (this.options.showDirection && points.length > 5) {
                const arrowInterval = Math.floor(points.length / 5);
                for (let i = arrowInterval; i < points.length - 1; i += arrowInterval) {
                    const p1 = points[i - 1];
                    const p2 = points[i];
                    const bearing = this.calculateBearing(p1[0], p1[1], p2[0], p2[1]);
                    
                    const arrow = L.marker([p2[0], p2[1]], {
                        icon: L.divIcon({
                            className: 'trail-arrow',
                            html: '<div style="transform: rotate(' + bearing + 'deg); color: rgba(255,255,255,0.7); font-size: 12px;">&#9654;</div>',
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        })
                    });
                    group.addLayer(arrow);
                }
            }
            
            return group;
        },
        
        getColorForValue(value, scale) {
            for (let i = 1; i < scale.length; i++) {
                if (value <= scale[i].value) {
                    const low = scale[i - 1];
                    const high = scale[i];
                    const ratio = (value - low.value) / (high.value - low.value);
                    return this.interpolateColor(low.color, high.color, ratio);
                }
            }
            return scale[scale.length - 1].color;
        },
        
        interpolateColor(color1, color2, ratio) {
            const hex = (c) => parseInt(c.slice(1), 16);
            const r1 = (hex(color1) >> 16) & 255;
            const g1 = (hex(color1) >> 8) & 255;
            const b1 = hex(color1) & 255;
            const r2 = (hex(color2) >> 16) & 255;
            const g2 = (hex(color2) >> 8) & 255;
            const b2 = hex(color2) & 255;
            
            const r = Math.round(r1 + (r2 - r1) * ratio);
            const g = Math.round(g1 + (g2 - g1) * ratio);
            const b = Math.round(b1 + (b2 - b1) * ratio);
            
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        },
        
        estimateSpeed(p1, p2) {
            const dist = haversineDistance(p1[0], p1[1], p2[0], p2[1]);
            const time = ((p2[3] || 0) - (p1[3] || 0)) / 3600000;
            return time > 0 ? dist / time * 0.539957 : 0;
        },
        
        calculateBearing(lat1, lon1, lat2, lon2) {
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
            const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                      Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        },
        
        updateTrail(aircraft) {
            if (!aircraft || !aircraft.trailPoints) return;
            
            if (trailLine) {
                map.removeLayer(trailLine);
            }
            
            if (this.options.colorBy === 'solid') {
                // Use simple solid color trail
                const coords = aircraft.trailPoints.map(p => [p[0], p[1]]);
                const color = getComputedStyle(document.documentElement).getPropertyValue('--selected').trim() || '#00ffff';
                trailLine = L.polyline(coords, { color: color, weight: 3, opacity: 0.8 }).addTo(map);
            } else {
                // Use gradient trail
                trailLine = this.createGradientTrail(aircraft.trailPoints, aircraft);
                if (trailLine) trailLine.addTo(map);
            }
        }
    };

    // ============ PHASE 12: NOTIFICATION CENTER ============
    const notificationCenter = {
        notifications: [],
        maxNotifications: 100,
        unreadCount: 0,
        currentFilter: 'all',
        
        init() {
            const saved = localStorage.getItem('skytrack_notifications');
            if (saved) {
                try {
                    this.notifications = JSON.parse(saved);
                } catch(e) {
                    this.notifications = [];
                }
            }
            this.updateUnreadCount();
            this.setupEventListeners();
            this.render();
        },
        
        setupEventListeners() {
            document.getElementById('notifBtn')?.addEventListener('click', () => this.toggle());
            document.getElementById('notifClose')?.addEventListener('click', () => this.close());
            document.getElementById('markAllRead')?.addEventListener('click', () => this.markAllRead());
            document.getElementById('clearNotifs')?.addEventListener('click', () => this.clearAll());
            
            document.querySelectorAll('.notif-filter').forEach(btn => {
                btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
            });
        },
        
        add(notification) {
            const notif = {
                id: Date.now(),
                ...notification,
                timestamp: Date.now(),
                read: false
            };
            
            this.notifications.unshift(notif);
            
            if (this.notifications.length > this.maxNotifications) {
                this.notifications = this.notifications.slice(0, this.maxNotifications);
            }
            
            this.save();
            this.updateUnreadCount();
            this.render();
        },
        
        markAsRead(id) {
            const notif = this.notifications.find(n => n.id === id);
            if (notif) {
                notif.read = true;
                this.save();
                this.updateUnreadCount();
                this.render();
            }
        },
        
        markAllRead() {
            this.notifications.forEach(n => n.read = true);
            this.save();
            this.updateUnreadCount();
            this.render();
        },
        
        clearAll() {
            this.notifications = [];
            this.save();
            this.updateUnreadCount();
            this.render();
        },
        
        setFilter(filter) {
            this.currentFilter = filter;
            document.querySelectorAll('.notif-filter').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            this.render();
        },
        
        toggle() {
            const panel = document.getElementById('notificationCenter');
            if (panel.classList.contains('show')) {
                this.close();
            } else {
                this.open();
            }
        },
        
        open() {
            document.getElementById('notificationCenter')?.classList.add('show');
            document.getElementById('notifBtn')?.classList.add('active');
            setExpandedState(document.getElementById('notifBtn'), true);
        },
        
        close() {
            document.getElementById('notificationCenter')?.classList.remove('show');
            document.getElementById('notifBtn')?.classList.remove('active');
            setExpandedState(document.getElementById('notifBtn'), false);
        },
        
        updateUnreadCount() {
            this.unreadCount = this.notifications.filter(n => !n.read).length;
            
            const badge = document.getElementById('notifBadge');
            if (badge) {
                badge.style.display = this.unreadCount > 0 ? 'flex' : 'none';
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
            }
        },
        
        render() {
            const container = document.getElementById('notificationList');
            if (!container) return;
            
            let filtered = this.notifications;
            if (this.currentFilter !== 'all') {
                filtered = this.notifications.filter(n => n.type === this.currentFilter);
            }
            
            if (filtered.length === 0) {
                container.innerHTML = '<div class="notif-empty">Alerts, saves, and notable flight events will appear here.</div>';
                return;
            }
            
            container.innerHTML = filtered.map(n => {
                // n.title and n.message can originate from ADS-B feed alerts; persist
                // across sessions in localStorage, so we escape on every render.
                const safeType = _escHtml(n.type || '');
                return '<div class="notif-item ' + safeType + ' ' + (n.read ? '' : 'unread') + '" data-id="' + _escHtml(n.id) + '" data-hex="' + _escHtml(n.hex || '') + '">' +
                    '<div class="notif-icon" style="background: ' + _escHtml(this.getTypeColor(n.type)) + '">' + _escHtml(this.getTypeIcon(n.type)) + '</div>' +
                    '<div class="notif-content">' +
                        '<div class="notif-text"><strong>' + _escHtml(n.title) + '</strong> - ' + _escHtml(n.message) + '</div>' +
                        '<div class="notif-time">' + _escHtml(this.formatTime(n.timestamp)) + '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
            
            container.querySelectorAll('.notif-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = parseInt(el.dataset.id, 10);
                    const hex = el.dataset.hex;
                    
                    this.markAsRead(id);
                    
                    if (hex && aircraftCache[hex]) {
                        selectAircraft(hex);
                        this.close();
                    }
                });
            });
        },
        
        getTypeColor(type) {
            const colors = {
                emergency: '#ef4444',
                watchlist: '#ffd700',
                military: '#4a90d9',
                system: '#888'
            };
            return colors[type] || '#888';
        },
        
        getTypeIcon(type) {
            const icons = {
                emergency: '!',
                watchlist: '*',
                military: '#',
                system: 'i'
            };
            return icons[type] || '?';
        },
        
        formatTime(timestamp) {
            const diff = Date.now() - timestamp;
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
            if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
            return new Date(timestamp).toLocaleDateString();
        },
        
        save() {
            localStorage.setItem('skytrack_notifications', JSON.stringify(this.notifications));
        }
    };

    // ============ PHASE 11: EXTERNAL LINKS ============
    function updateExternalLinks(ac) {
        if (!ac) return;

        // Every field below is spliced into the <a href> of a link the user
        // will click, so URL-encode each one. Unencoded `?`, `#`, spaces, or
        // `&` in an ADS-B callsign produced bogus URLs; worse, a callsign
        // containing a quote or angle bracket broke the anchor's attribute
        // in older browsers.
        const hex = ac.hex ? encodeURIComponent(String(ac.hex).toLowerCase()) : '';
        const hexUpper = ac.hex ? encodeURIComponent(String(ac.hex).toUpperCase()) : '';
        const reg = ac.r ? encodeURIComponent(String(ac.r).replace(/-/g, '')) : '';
        const flight = ac.flight ? encodeURIComponent(String(ac.flight).trim()) : '';
        const type = (ac.t || '').replace(/[0-9]/g, ' ').trim();
        const typeEnc = type ? encodeURIComponent(type) : '';

        // FlightAware
        const linkFA = document.getElementById('linkFA');
        if (linkFA) {
            linkFA.href = flight
                ? `https://flightaware.com/live/flight/${flight}`
                : reg
                    ? `https://flightaware.com/live/flight/${reg}`
                    : 'https://flightaware.com/';
        }

        // FlightRadar24
        const linkFR24 = document.getElementById('linkFR24');
        if (linkFR24) linkFR24.href = hex ? `https://www.flightradar24.com/${hex}` : 'https://www.flightradar24.com/';

        // ADS-B Exchange
        const linkADSBx = document.getElementById('linkADSBx');
        if (linkADSBx) linkADSBx.href = hex ? `https://globe.adsbexchange.com/?icao=${hex}` : 'https://globe.adsbexchange.com/';

        // Planespotters
        const linkPS = document.getElementById('linkPS');
        if (linkPS) {
            linkPS.href = reg
                ? `https://www.planespotters.net/search?q=${reg}`
                : hexUpper
                    ? `https://www.planespotters.net/hex/${hexUpper}`
                    : 'https://www.planespotters.net/';
        }

        // JetPhotos
        const linkJP = document.getElementById('linkJP');
        if (linkJP) {
            linkJP.href = reg
                ? `https://www.jetphotos.com/registration/${reg}`
                : 'https://www.jetphotos.com/';
        }

        // Wikipedia (aircraft type)
        const linkWiki = document.getElementById('linkWiki');
        if (linkWiki) {
            linkWiki.href = typeEnc
                ? `https://en.wikipedia.org/wiki/${typeEnc}`
                : 'https://en.wikipedia.org/';
        }
    }

    // Weather overlay (SIGMET/G-AIRMET/CWA/PIREP/wind/radar anim)
    // now lives in src/modules/36-weather-overlay.js.


    // ============ PHASE 11: RUNWAY VISUALIZATION ============
    const runwayDisplay = {
        layer: null,
        runwayCache: new Map(),
        
        async show(airport) {
            this.clear();
            
            if (!airport || !airport.icao) return;
            
            // For now, create a simple runway indicator based on the airport's location
            // Real runway data would need to be loaded from a database
            this.layer = L.layerGroup();
            
            // Create a runway indicator at the airport
            const runwayMarker = L.circleMarker([airport.lat, airport.lon], {
                radius: 10,
                fillColor: '#4ade80',
                fillOpacity: 0.3,
                color: '#fff',
                weight: 1
            });
            
            runwayMarker.bindTooltip(`${airport.icao} - Click airport for details`);
            this.layer.addLayer(runwayMarker);
            
            this.layer.addTo(map);
        },
        
        clear() {
            if (this.layer) {
                map.removeLayer(this.layer);
                this.layer = null;
            }
        }
    };

    // ============ PHASE 11: NOTAMS SYSTEM ============
    const notamsSystem = {
        cache: new Map(),
        cacheExpiry: 1800000, // 30 minutes
        
        async getForAirport(icao) {
            if (!icao) return [];
            
            // Check cache
            const cached = this.cache.get(icao);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.data;
            }
            
            try {
                // Aviation Weather Center NOTAM API
                const url = `https://aviationweather.gov/api/data/notam?icao=${icao}&format=json`;
                
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                
                const data = await resp.json();
                
                const notams = (Array.isArray(data) ? data : []).map(n => ({
                    id: n.id || n.notamId || Math.random().toString(36),
                    type: n.type || 'NOTAM',
                    text: n.text || n.traditionalMessage || n.raw || 'No details available',
                    effective: n.effectiveStart,
                    expires: n.effectiveEnd,
                    category: this.categorize(n.text || n.traditionalMessage || '')
                }));
                
                this.cache.set(icao, { data: notams, timestamp: Date.now() });
                return notams;
                
            } catch (e) {
                errorHandler.log('NOTAMs', `Failed for ${icao}: ${e.message}`);
                return [];
            }
        },
        
        categorize(text) {
            const t = (text || '').toUpperCase();
            if (t.includes('RWY') || t.includes('RUNWAY')) return 'runway';
            if (t.includes('TWY') || t.includes('TAXIWAY')) return 'taxiway';
            if (t.includes('OBST') || t.includes('OBSTACLE')) return 'obstacle';
            if (t.includes('NAV') || t.includes('VOR') || t.includes('ILS')) return 'navaid';
            if (t.includes('SVC') || t.includes('SERVICE')) return 'service';
            if (t.includes('AIRSPACE') || t.includes('TFR')) return 'airspace';
            return 'other';
        },
        
        renderForPanel(notams) {
            if (!notams || notams.length === 0) {
                return '<div class="notams-empty">No active NOTAMs</div>';
            }

            // NOTAM text comes from an external API, so escape every field.
            // `category` is our own enum (see categorize), safe to class-name,
            // but we escape it anyway as cheap defense in depth.
            return notams.slice(0, 5).map(n => `
                <div class="notam-item ${_escHtml(n.category)}">
                    <div class="notam-header">
                        <span class="notam-type">${_escHtml(n.type)}</span>
                        <span class="notam-category">${_escHtml(n.category)}</span>
                    </div>
                    <div class="notam-text">${_escHtml(this.truncate(n.text, 150))}</div>
                    ${n.expires ? `<div class="notam-expires">Expires: ${_escHtml(new Date(n.expires).toLocaleDateString())}</div>` : ''}
                </div>
            `).join('') + (notams.length > 5 ? `<div class="notams-more">+${notams.length - 5} more NOTAMs</div>` : '');
        },
        
        truncate(text, len) {
            if (!text) return '';
            return text.length > len ? text.substring(0, len) + '...' : text;
        }
    };

    // ============ PHASE 11: LIVEATC INTEGRATION ============
    const liveATCSystem = {
        baseUrl: 'https://www.liveatc.net',
        
        // Major airports with known LiveATC feeds
        majorAirports: [
            'KJFK', 'KLAX', 'KORD', 'KATL', 'KDFW', 'KDEN', 'KSFO', 'KLAS', 'KMIA', 'KBOS',
            'KSEA', 'KMSP', 'KPHX', 'KDTW', 'KEWR', 'KLGA', 'KPHL', 'KIAH', 'KFLL', 'KMCO',
            'EGLL', 'EGKK', 'EGLC', 'LFPG', 'LFPO', 'EDDF', 'EDDM', 'LEMD', 'LEBL', 'LIRF',
            'EHAM', 'LFBO', 'LSZH', 'LOWW', 'EKCH', 'ESSA', 'ENGM', 'EFHK', 'EPWA', 'LKPR',
            'CYYZ', 'CYVR', 'CYUL', 'CYYC', 'CYOW', 'VHHH', 'WSSS', 'RJTT', 'RJAA', 'RKSI',
            'OMDB', 'VABB', 'VIDP', 'YSSY', 'YMML', 'NZAA'
        ],
        
        async checkAvailability(icao) {
            // Check if it's a major airport with known feeds
            return this.majorAirports.includes(icao.toUpperCase());
        },
        
        async renderForAirport(icao) {
            const container = document.getElementById('atcFeeds');
            if (!container) return;

            // Defensive: drop anything that isn't a plain ICAO code so we
            // cannot inject into the href/innerHTML even if the airport DB
            // returns something unexpected.
            const safeIcao = /^[A-Z0-9]{1,5}$/i.test(String(icao || '')) ? String(icao).toUpperCase() : '';
            if (!safeIcao) {
                container.innerHTML = '<div class="atc-unavailable">No LiveATC feeds available</div>';
                return;
            }
            const available = await this.checkAvailability(safeIcao);

            if (!available) {
                container.innerHTML = `
                    <div class="atc-unavailable">
                        No LiveATC feeds available for ${safeIcao}
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="atc-available">
                    <a href="https://www.liveatc.net/search/?icao=${encodeURIComponent(safeIcao)}"
                       target="_blank" rel="noopener noreferrer" class="atc-link">
                        <span class="atc-icon">ATC</span>
                        <span>Listen on LiveATC</span>
                    </a>
                </div>
            `;
        }
    };

    // ============ PHASE 13: MULTI-SELECT SYSTEM ============
    const multiSelect = {
        enabled: false,
        selected: new Set(),
        maxSelection: 10,
        
        init() {
            document.getElementById('multiSelectBtn')?.addEventListener('click', () => this.toggle());
        },
        
        toggle() {
            this.enabled = !this.enabled;
            document.getElementById('multiSelectBtn')?.classList.toggle('active', this.enabled);
            document.body.classList.toggle('multi-select-mode', this.enabled);
            
            if (this.enabled) {
                // Disable follow mode if it's enabled - they are mutually exclusive
                if (settings.followMode) {
                    settings.followMode = false;
                    document.getElementById('followBtn')?.classList.remove('active');
                    toast('Follow mode disabled');
                }
                toast('Multi-select ON - Ctrl+click to select multiple aircraft');
                this.showToolbar();
            } else {
                this.hideToolbar();
                this.clearAll();
            }
        },
        
        add(hex) {
            if (this.selected.size >= this.maxSelection) {
                toast(`Maximum ${this.maxSelection} aircraft can be selected`);
                return false;
            }
            
            this.selected.add(hex);
            this.updateMarkerStyle(hex, true);
            this.updateToolbar();
            return true;
        },
        
        remove(hex) {
            this.selected.delete(hex);
            this.updateMarkerStyle(hex, false);
            this.updateToolbar();
        },
        
        toggleSelection(hex) {
            if (this.selected.has(hex)) {
                this.remove(hex);
            } else {
                this.add(hex);
            }
        },
        
        isSelected(hex) {
            return this.selected.has(hex);
        },
        
        clearAll() {
            this.selected.forEach(hex => this.updateMarkerStyle(hex, false));
            this.selected.clear();
            this.updateToolbar();
        },
        
        updateMarkerStyle(hex, isMultiSelected) {
            const marker = markers[hex];
            if (!marker) return;
            
            const el = marker.getElement ? marker.getElement() : marker._icon;
            if (el) {
                el.classList.toggle('multi-selected', isMultiSelected);
            }
        },
        
        showToolbar() {
            let toolbar = document.getElementById('multiSelectToolbar');
            if (!toolbar) {
                toolbar = document.createElement('div');
                toolbar.id = 'multiSelectToolbar';
                toolbar.className = 'multi-select-toolbar';
                toolbar.innerHTML = `
                    <div class="toolbar-count"><span id="selectedCount">0</span> selected</div>
                    <div class="toolbar-actions">
                        <button class="toolbar-btn" id="compareBtn" title="Compare">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="7" height="18" rx="1"/>
                                <rect x="14" y="3" width="7" height="18" rx="1"/>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="bulkWatchBtn" title="Add all to watchlist">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="showTrailsBtn" title="Show all trails">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 17l6-6 4 4L21 7"/>
                            </svg>
                        </button>
                        <button class="toolbar-btn" id="fitSelectedBtn" title="Fit map to selected">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                            </svg>
                        </button>
                        <button class="toolbar-btn danger" id="clearSelectionBtn" title="Clear selection">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                `;
                document.body.appendChild(toolbar);
                
                document.getElementById('compareBtn')?.addEventListener('click', () => this.showComparison());
                document.getElementById('bulkWatchBtn')?.addEventListener('click', () => this.bulkAddToWatchlist());
                document.getElementById('showTrailsBtn')?.addEventListener('click', () => this.showAllTrails());
                document.getElementById('fitSelectedBtn')?.addEventListener('click', () => this.fitMapToSelected());
                document.getElementById('clearSelectionBtn')?.addEventListener('click', () => this.clearAll());
            }
            
            toolbar.classList.add('show');
        },
        
        hideToolbar() {
            document.getElementById('multiSelectToolbar')?.classList.remove('show');
        },
        
        updateToolbar() {
            const countEl = document.getElementById('selectedCount');
            if (countEl) countEl.textContent = this.selected.size;
            
            const hasSelection = this.selected.size > 0;
            document.querySelectorAll('#multiSelectToolbar .toolbar-btn:not(.danger)').forEach(btn => {
                btn.disabled = !hasSelection;
            });
        },
        
        showComparison() {
            if (this.selected.size < 2) {
                toast('Select at least 2 aircraft to compare');
                return;
            }
            
            comparisonPanel.show(Array.from(this.selected));
        },
        
        bulkAddToWatchlist() {
            let added = 0;
            this.selected.forEach(hex => {
                const ac = aircraftCache[hex];
                if (ac && !alertSystem.isWatched(hex)) {
                    alertSystem.addToWatchlist(hex, ac.flight?.trim() || ac.r || hex);
                    added++;
                }
            });
            toast(`Added ${added} aircraft to watchlist`);
        },
        
        showAllTrails() {
            toast('Loading trails for selected aircraft...');
            this.selected.forEach(hex => {
                const ac = aircraftCache[hex];
                if (ac?.lat && ac?.lon) {
                    // If there's a trail loading function, call it here
                    // For now, just indicate functionality
                }
            });
        },
        
        fitMapToSelected() {
            const positions = [];
            this.selected.forEach(hex => {
                const ac = aircraftCache[hex];
                if (ac?.lat && ac?.lon) {
                    positions.push([ac.lat, ac.lon]);
                }
            });
            
            if (positions.length > 0) {
                const bounds = L.latLngBounds(positions);
                map.fitBounds(bounds.pad(0.2));
                toast(`Fit to ${positions.length} aircraft`);
            }
        },
        
        getSelectedAircraft() {
            return Array.from(this.selected).map(hex => aircraftCache[hex]).filter(Boolean);
        }
    };

    // ============ PHASE 13: COMPARISON PANEL ============
    const comparisonPanel = {
        show(hexes) {
            const aircraft = hexes.map(hex => aircraftCache[hex]).filter(Boolean);
            if (aircraft.length < 2) return;
            
            const content = document.getElementById('comparisonContent');
            content.innerHTML = this.generateTable(aircraft);
            
            document.getElementById('comparisonPanel').classList.add('show');
            document.getElementById('comparisonClose').onclick = () => this.close();
            
            content.querySelectorAll('.comparison-select-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectAircraft(btn.dataset.hex);
                    this.close();
                });
            });
        },
        
        close() {
            document.getElementById('comparisonPanel').classList.remove('show');
        },
        
        generateTable(aircraft) {
            const rows = [
                { label: 'Photo', key: 'photo', format: this.formatPhoto },
                { label: 'Callsign', key: 'flight', format: v => v?.trim() || '---' },
                { label: 'Registration', key: 'r', format: v => v || '---' },
                { label: 'Type', key: 't', format: v => v || '---' },
                { label: 'Type Description', key: 'desc', format: v => v || '---' },
                { label: 'Operator', key: 'ownOp', format: v => v || '---' },
                { label: 'Altitude', key: 'alt_baro', format: this.formatAltitude, compare: 'max' },
                { label: 'Speed', key: 'gs', format: this.formatSpeed, compare: 'max' },
                { label: 'Vertical Speed', key: 'baro_rate', format: this.formatVSpeed },
                { label: 'Heading', key: 'track', format: v => v !== undefined ? Math.round(v) + ' deg' : '---' },
                { label: 'Squawk', key: 'squawk', format: v => v || '---' },
                { label: 'Origin', key: 'from', format: v => v || '---' },
                { label: 'Destination', key: 'to', format: v => v || '---' },
                { label: 'Category', key: 'category_type', format: v => v || '---' },
                { label: 'Distance', key: 'distance', format: this.formatDistance, compare: 'min' },
                { label: 'ICAO Hex', key: 'hex', format: v => v?.toUpperCase() || '---' }
            ];
            
            const stats = {};
            rows.forEach(row => {
                if (row.compare) {
                    const values = aircraft.map(ac => {
                        const val = ac[row.key];
                        if (val === undefined || val === 'ground' || val === null) return null;
                        return typeof val === 'number' ? val : parseFloat(val);
                    }).filter(v => v !== null && !isNaN(v));
                    
                    if (values.length > 0) {
                        stats[row.key] = {
                            max: Math.max(...values),
                            min: Math.min(...values)
                        };
                    }
                }
            });
            
            let html = '<table class="comparison-table">';

            html += '<tr><th></th>';
            aircraft.forEach(ac => {
                const name = ac.flight?.trim() || ac.r || ac.hex;
                html += `<td><button class="comparison-select-btn" data-hex="${_escHtml(ac.hex)}">Select ${_escHtml(name)}</button></td>`;
            });
            html += '</tr>';

            rows.forEach(row => {
                html += `<tr><th>${_escHtml(row.label)}</th>`;
                aircraft.forEach(ac => {
                    const value = ac[row.key];
                    let formatted = row.format ? row.format(value, ac) : (value || '---');

                    let className = 'comparison-value';
                    if (row.compare && stats[row.key]) {
                        const numVal = typeof value === 'number' ? value : parseFloat(value);
                        if (!isNaN(numVal) && value !== 'ground') {
                            if (row.compare === 'max') {
                                if (numVal === stats[row.key].max) className += ' best';
                                else if (numVal === stats[row.key].min && aircraft.length > 2) className += ' worst';
                            } else if (row.compare === 'min') {
                                if (numVal === stats[row.key].min) className += ' best';
                                else if (numVal === stats[row.key].max && aircraft.length > 2) className += ' worst';
                            }
                        }
                    }

                    // The `formatPhoto` formatter deliberately returns markup,
                    // and all non-photo formatters return already-escaped plain
                    // text (numbers, enums). Everything else must be escaped.
                    const safeFormatted = (row.key === 'photo') ? formatted : _escHtml(formatted);
                    html += `<td><span class="${className}">${safeFormatted}</span></td>`;
                });
                html += '</tr>';
            });

            html += '</table>';
            return html;
        },

        formatPhoto(value, ac) {
            if (ac.preloadedImage) {
                return `<img class="comparison-photo" src="${_escHtml(ac.preloadedImage)}" alt="" loading="lazy">`;
            }
            return '<div class="comparison-photo"></div>';
        },
        
        formatAltitude(value) {
            if (value === 'ground') return 'Ground';
            if (value === undefined || value === null) return '---';
            return Math.round(value).toLocaleString() + ' ft';
        },
        
        formatSpeed(value) {
            if (value === undefined || value === null) return '---';
            return Math.round(value) + ' kt';
        },
        
        formatVSpeed(value) {
            if (value === undefined || value === null) return '---';
            const prefix = value > 0 ? '+' : '';
            return prefix + Math.round(value).toLocaleString() + ' ft/min';
        },
        
        formatDistance(value) {
            if (value === undefined || value === null) return '---';
            return value.toFixed(1) + ' nm';
        }
    };

    // ============ PHASE 14: TIME MACHINE ============
    const timeMachine = {
        active: false,
        data: null,
        currentIndex: 0,
        playSpeed: 1,
        playing: false,
        playInterval: null,
        originalMarkers: {},
        
        init() {
            document.getElementById('timeMachineBtn')?.addEventListener('click', () => this.showLoadDialog());
            document.getElementById('tmExit')?.addEventListener('click', () => this.exit());
            document.getElementById('playPauseBtn')?.addEventListener('click', () => this.togglePlay());
            document.getElementById('speedDownBtn')?.addEventListener('click', () => this.adjustSpeed(-1));
            document.getElementById('speedUpBtn')?.addEventListener('click', () => this.adjustSpeed(1));
            document.getElementById('tmRewind')?.addEventListener('click', () => this.setTime(0));
            document.getElementById('tmStepBack')?.addEventListener('click', () => this.step(-1));
            document.getElementById('tmStepForward')?.addEventListener('click', () => this.step(1));
            document.getElementById('tmFastForward')?.addEventListener('click', () => this.setTime(this.data?.timestamps.length - 1 || 0));
            
            document.getElementById('timeSlider')?.addEventListener('input', (e) => {
                this.setTime(parseInt(e.target.value));
            });
        },
        
        async showLoadDialog() {
            const hours = await uiDialogs.prompt({
                eyebrow: 'Time Machine',
                title: 'Load Recent History',
                message: 'Choose how much cached traffic to rebuild into playback.',
                label: 'Hours to Load',
                note: 'SkyTrack can rebuild between 1 and 24 hours from the local cache.',
                placeholder: '6',
                defaultValue: '6',
                inputType: 'number',
                inputMode: 'numeric',
                min: 1,
                max: 24,
                step: 1,
                confirmLabel: 'Load History',
                cancelLabel: 'Not Now',
                validationMessage: 'Enter a whole number between 1 and 24.',
                validate: (raw) => {
                    const parsed = parseInt(raw, 10);
                    return Number.isFinite(parsed) ? Math.min(24, Math.max(1, parsed)) : null;
                }
            });
            if (hours !== null) {
                this.loadHistory(hours);
            }
        },
        
        async loadHistory(hours = 6) {
            toast('Building historical data from cache…');
            
            try {
                this.data = this.buildFromCache(hours);
                
                if (this.data.timestamps.length < 5) {
                    toast('Not enough historical data is available yet. Keep SkyTrack running a little longer.', 'warning');
                    return false;
                }
                
                this.currentIndex = 0;
                this.active = true;
                this.storeCurrentState();
                this.showControls();
                this.updateDisplay();
                
                toast(`Loaded ${this.data.timestamps.length} time points across ${hours} hours`, 'success');
                return true;
                
            } catch (e) {
                errorHandler.log('TimeMachine', e.message);
                toast('History could not be loaded right now', 'error');
                return false;
            }
        },
        
        buildFromCache(hours) {
            const cutoff = Date.now() - (hours * 3600000);
            const timestampMap = new Map();
            
            // Build from aircraft history
            Object.values(aircraftCache).forEach(ac => {
                if (!ac.history || ac.history.length < 2) return;
                
                ac.history.forEach(h => {
                    const ts = h[3] || h.time;
                    if (ts && ts > cutoff) {
                        const roundedTs = Math.floor(ts / 30000) * 30000; // Round to 30 seconds
                        
                        if (!timestampMap.has(roundedTs)) {
                            timestampMap.set(roundedTs, []);
                        }
                        
                        timestampMap.get(roundedTs).push({
                            hex: ac.hex,
                            lat: h[0],
                            lon: h[1],
                            alt: h[2],
                            flight: ac.flight,
                            t: ac.t,
                            track: ac.track
                        });
                    }
                });
            });
            
            const timestamps = Array.from(timestampMap.keys()).sort((a, b) => a - b);
            
            return {
                timestamps,
                positions: timestampMap
            };
        },
        
        storeCurrentState() {
            // Store reference to current markers for restoration
            this.originalMarkers = { ...markers };
        },
        
        showControls() {
            document.getElementById('timeMachineControls')?.classList.add('show');
            document.getElementById('timeMachineControls')?.setAttribute('aria-hidden', 'false');
            document.getElementById('historyIndicator')?.classList.add('show');
            document.getElementById('timeMachineBtn')?.classList.add('active');
            
            // Update slider
            const slider = document.getElementById('timeSlider');
            if (slider && this.data) {
                slider.min = 0;
                slider.max = this.data.timestamps.length - 1;
                slider.value = 0;
            }
            
            // Update time range display
            if (this.data && this.data.timestamps.length > 0) {
                document.getElementById('tmStartTime').textContent = 
                    new Date(this.data.timestamps[0]).toLocaleTimeString();
                document.getElementById('tmEndTime').textContent = 
                    new Date(this.data.timestamps[this.data.timestamps.length - 1]).toLocaleTimeString();
            }
        },
        
        hideControls() {
            document.getElementById('timeMachineControls')?.classList.remove('show');
            document.getElementById('timeMachineControls')?.setAttribute('aria-hidden', 'true');
            document.getElementById('historyIndicator')?.classList.remove('show');
            document.getElementById('timeMachineBtn')?.classList.remove('active');
        },
        
        setTime(index) {
            if (!this.data || index < 0 || index >= this.data.timestamps.length) return;
            
            this.currentIndex = index;
            const slider = document.getElementById('timeSlider');
            if (slider) slider.value = index;
            this.updateDisplay();
        },
        
        step(direction) {
            this.setTime(this.currentIndex + direction);
        },
        
        updateDisplay() {
            if (!this.data) return;
            
            const currentTime = this.data.timestamps[this.currentIndex];
            
            // Update time label
            const timeLabel = document.getElementById('currentTimeLabel');
            if (timeLabel) {
                timeLabel.textContent = new Date(currentTime).toLocaleString();
            }
            
            // Get aircraft at this time
            const positions = this.data.positions.get(currentTime) || [];
            
            // Clear current markers
            Object.keys(markers).forEach(hex => {
                map.removeLayer(markers[hex]);
                delete markers[hex];
            });
            
            // Show historical positions
            positions.forEach(pos => {
                const rotation = pos.track || 0;
                const marker = L.marker([pos.lat, pos.lon], {
                    icon: L.divIcon({
                        className: 'aircraft-marker historical',
                        html: `<div style="transform: rotate(${rotation}deg)">
                            <svg viewBox="0 0 36 36" width="24" height="24">
                                <path fill="#ffa500" d="M18 3 L20 14 L32 18 L20 20 L20 30 L24 33 L24 34 L18 32 L12 34 L12 33 L16 30 L16 20 L4 18 L16 14 Z"/>
                            </svg>
                        </div>
                        <div class="aircraft-label">${pos.flight?.trim() || pos.hex}</div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    }),
                    interactive: true
                });
                
                marker.bindTooltip(`${pos.flight?.trim() || pos.hex}<br>${pos.t || 'Unknown'}<br>${pos.alt?.toLocaleString() || '---'} ft`, {
                    direction: 'top',
                    offset: [0, -10]
                });
                
                marker.addTo(map);
                markers[pos.hex] = marker;
            });
            
            // Update aircraft count
            document.getElementById('historicalCount').textContent = positions.length;
        },
        
        togglePlay() {
            if (this.playing) {
                this.pause();
            } else {
                this.play();
            }
        },
        
        play() {
            if (this.playing || !this.data) return;

            this.playing = true;
            const btn = document.getElementById('playPauseBtn');
            if (btn) btn.innerHTML = '&#10074;&#10074;';

            const interval = Math.max(50, 1000 / this.playSpeed);

            this.playInterval = setInterval(() => {
                const nextIndex = this.currentIndex + 1;

                if (nextIndex >= this.data.timestamps.length) {
                    this.pause();
                    return;
                }

                this.setTime(nextIndex);
            }, interval);
        },

        pause() {
            this.playing = false;
            const btn = document.getElementById('playPauseBtn');
            if (btn) btn.innerHTML = '&#9654;';

            if (this.playInterval) {
                clearInterval(this.playInterval);
                this.playInterval = null;
            }
        },
        
        adjustSpeed(delta) {
            const speeds = [0.25, 0.5, 1, 2, 4, 8, 16];
            const currentIdx = speeds.indexOf(this.playSpeed);
            const newIdx = Math.max(0, Math.min(speeds.length - 1, currentIdx + delta));
            this.playSpeed = speeds[newIdx];
            
            document.getElementById('speedLabel').textContent = this.playSpeed + 'x';
            
            if (this.playing) {
                this.pause();
                this.play();
            }
        },
        
        exit() {
            this.pause();
            this.active = false;
            this.data = null;
            this.hideControls();
            
            // Clear historical markers
            Object.keys(markers).forEach(hex => {
                map.removeLayer(markers[hex]);
                delete markers[hex];
            });
            
            // Restore live view
            updateMarkers();
            toast('Returned to live view');
        }
    };

    // ============ PHASE 14: AIRCRAFT CLUSTERING ============
    const clusterManager = {
        enabled: false,
        clusterLayer: null,
        pluginLoaded: false,
        
        init() {
            document.getElementById('clusterBtn')?.addEventListener('click', () => this.toggle());
        },
        
        async loadPlugin() {
            if (this.pluginLoaded) return true;
            
            return new Promise((resolve) => {
                // Add CSS
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.4.1/MarkerCluster.css';
                document.head.appendChild(link);
                
                const link2 = document.createElement('link');
                link2.rel = 'stylesheet';
                link2.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.4.1/MarkerCluster.Default.css';
                document.head.appendChild(link2);
                
                // Add JS
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.4.1/leaflet.markercluster.js';
                script.onload = () => {
                    this.pluginLoaded = true;
                    resolve(true);
                };
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
        },
        
        async toggle() {
            if (!this.pluginLoaded) {
                toast('Loading clustering plugin...');
                const loaded = await this.loadPlugin();
                if (!loaded) {
                    toast('Failed to load clustering plugin');
                    return;
                }
            }
            
            this.enabled = !this.enabled;
            document.getElementById('clusterBtn')?.classList.toggle('active', this.enabled);
            
            if (this.enabled) {
                this.enable();
            } else {
                this.disable();
            }
            
            toast(this.enabled ? 'Clustering ON' : 'Clustering OFF');
        },
        
        enable() {
            if (typeof L.markerClusterGroup === 'undefined') {
                console.error('MarkerCluster not loaded');
                return;
            }
            
            this.clusterLayer = L.markerClusterGroup({
                maxClusterRadius: 60,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                disableClusteringAtZoom: 11,
                iconCreateFunction: (cluster) => {
                    const count = cluster.getChildCount();
                    let size, className;
                    
                    if (count < 10) {
                        size = 32; className = 'cluster-small';
                    } else if (count < 50) {
                        size = 40; className = 'cluster-medium';
                    } else if (count < 100) {
                        size = 50; className = 'cluster-large';
                    } else {
                        size = 60; className = 'cluster-xlarge';
                    }
                    
                    return L.divIcon({
                        html: `<div class="cluster-icon ${className}">${count}</div>`,
                        className: 'marker-cluster',
                        iconSize: [size, size]
                    });
                }
            });
            
            // Hide regular markers and add to cluster
            Object.entries(markers).forEach(([hex, marker]) => {
                map.removeLayer(marker);
            });
            
            map.addLayer(this.clusterLayer);
            this.updateClusters();
        },
        
        disable() {
            if (this.clusterLayer) {
                map.removeLayer(this.clusterLayer);
                this.clusterLayer = null;
            }
            
            // Restore regular markers
            updateMarkers();
        },
        
        updateClusters() {
            if (!this.enabled || !this.clusterLayer) return;
            
            this.clusterLayer.clearLayers();
            
            Object.values(aircraftCache).forEach(ac => {
                if (ac.lat === undefined || ac.lon === undefined) return;
                
                const color = getAltitudeColor(ac.alt_baro);
                const rotation = ac.track || 0;
                
                const marker = L.marker([ac.lat, ac.lon], {
                    icon: L.divIcon({
                        className: 'aircraft-marker clustered',
                        html: `<div style="transform: rotate(${rotation}deg)">
                            <svg viewBox="0 0 36 36" width="20" height="20">
                                <path fill="${color}" d="M18 3 L20 14 L32 18 L20 20 L20 30 L24 33 L24 34 L18 32 L12 34 L12 33 L16 30 L16 20 L4 18 L16 14 Z"/>
                            </svg>
                        </div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                });
                
                marker._skytrackHex = ac.hex;
                marker.on('click', () => selectAircraft(ac.hex));
                
                this.clusterLayer.addLayer(marker);
            });
        }
    };

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

    // ============ PHASE 14: SCREENSHOT & RECORDING ============
    const captureSystem = {
        recording: false,
        mediaRecorder: null,
        chunks: [],
        
        init() {
            document.getElementById('captureBtn')?.addEventListener('click', () => this.toggleMenu());
            document.getElementById('captureScreenshot')?.addEventListener('click', () => {
                this.hideMenu();
                this.takeScreenshot();
            });
            document.getElementById('captureRecord')?.addEventListener('click', () => {
                this.hideMenu();
                this.toggleRecording();
            });
            document.getElementById('captureTimelapse')?.addEventListener('click', () => {
                this.hideMenu();
                this.createTimelapse();
            });
            
            // Close menu on outside click
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('captureMenu');
                const btn = document.getElementById('captureBtn');
                if (menu?.classList.contains('show') && !menu.contains(e.target) && !btn?.contains(e.target)) {
                    this.hideMenu();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && document.getElementById('captureMenu')?.classList.contains('show')) {
                    this.hideMenu();
                }
            });
        },
        
        toggleMenu() {
            const menu = document.getElementById('captureMenu');
            const isOpen = menu ? !menu.classList.contains('show') : false;
            menu?.classList.toggle('show', isOpen);
            menu?.setAttribute('aria-hidden', String(!isOpen));
            setExpandedState(document.getElementById('captureBtn'), isOpen);
            document.getElementById('captureBtn')?.classList.toggle('active', isOpen);
            if (isOpen) {
                menu?.querySelector('.capture-menu-item')?.focus();
            }
        },
        
        hideMenu() {
            document.getElementById('captureMenu')?.classList.remove('show');
            document.getElementById('captureMenu')?.setAttribute('aria-hidden', 'true');
            setExpandedState(document.getElementById('captureBtn'), false);
            document.getElementById('captureBtn')?.classList.remove('active');
        },
        
        async takeScreenshot() {
            toast('Preparing screenshot…');
            
            try {
                // Load html2canvas if not available
                if (typeof html2canvas === 'undefined') {
                    await this.loadHtml2Canvas();
                }
                
                // Hide UI elements we don't want in screenshot
                const elementsToHide = [
                    document.getElementById('loading'),
                    document.getElementById('captureMenu')
                ];
                elementsToHide.forEach(el => { if (el) el.style.visibility = 'hidden'; });
                
                // Wait for any pending tile loads
                await new Promise(r => setTimeout(r, 500));
                
                // Capture the entire page using html2canvas
                // Note: Map tiles may or may not render depending on CORS headers
                const canvas = await html2canvas(document.body, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#1a1a2e',
                    scale: Math.min(window.devicePixelRatio || 1, 2), // Cap at 2x for performance
                    logging: false,
                    imageTimeout: 5000,
                    onclone: (clonedDoc) => {
                        // Force map tiles to be visible in clone
                        const mapTiles = clonedDoc.querySelectorAll('.leaflet-tile');
                        mapTiles.forEach(tile => {
                            tile.style.visibility = 'visible';
                        });
                    }
                });
                
                // Restore hidden elements
                elementsToHide.forEach(el => { if (el) el.style.visibility = ''; });
                
                // Check if map area is mostly empty (tiles didn't render)
                const ctx = canvas.getContext('2d');
                const mapEl = document.getElementById('map');
                const rect = mapEl.getBoundingClientRect();
                const sampleX = Math.floor(rect.left + rect.width / 2);
                const sampleY = Math.floor(rect.top + rect.height / 2);
                const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                const isMostlyBackground = (pixel[0] < 50 && pixel[1] < 50 && pixel[2] < 70);
                
                if (isMostlyBackground) {
                    // Map tiles didn't render, add overlay with info
                    await this.addMapInfoOverlay(canvas);
                }
                
                this.downloadCanvas(canvas, `skytrack-screenshot-${Date.now()}.png`);
                toast('Screenshot saved!');
            } catch (e) {
                console.error('Screenshot error:', e);
                errorHandler.log('Screenshot', e.message);
                // Fallback to info-only capture
                await this.captureWithOverlay();
            }
        },
        
        async addMapInfoOverlay(canvas) {
            const ctx = canvas.getContext('2d');
            const scale = canvas.width / window.innerWidth;
            const mapEl = document.getElementById('map');
            const rect = mapEl.getBoundingClientRect();
            
            // Draw semi-transparent overlay on map area
            ctx.fillStyle = 'rgba(26, 26, 46, 0.9)';
            ctx.fillRect(rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
            
            // Draw aircraft positions
            const bounds = map.getBounds();
            Object.values(aircraftCache).forEach(ac => {
                if (ac.lat !== undefined && bounds.contains([ac.lat, ac.lon])) {
                    const point = map.latLngToContainerPoint([ac.lat, ac.lon]);
                    const x = (rect.left + point.x) * scale;
                    const y = (rect.top + point.y) * scale;
                    
                    ctx.beginPath();
                    const radius = (ac.hex === selectedHex ? 8 : 4) * scale;
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = ac.hex === selectedHex ? '#00ffff' : 
                                   (ac.interesting || ac.militaryInfo || ac.isVIP) ? '#ffd700' : '#ffffff';
                    ctx.fill();
                }
            });
            
            // Draw info box
            const boxX = (rect.left + 10) * scale;
            const boxY = (rect.top + 10) * scale;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(boxX, boxY, 220 * scale, 70 * scale);
            
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${16 * scale}px -apple-system, sans-serif`;
            ctx.fillText('SkyTrack', boxX + 10 * scale, boxY + 25 * scale);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = `${12 * scale}px -apple-system, sans-serif`;
            ctx.fillText(new Date().toLocaleString(), boxX + 10 * scale, boxY + 45 * scale);
            ctx.fillText(`${Object.keys(aircraftCache).length} aircraft tracked`, boxX + 10 * scale, boxY + 60 * scale);
            
            // Note about tiles
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = `${10 * scale}px -apple-system, sans-serif`;
            const note = 'Map tiles blocked by browser security';
            ctx.fillText(note, (rect.left + rect.width / 2 - 100) * scale, (rect.top + rect.height - 15) * scale);
        },
        
        async loadHtml2Canvas() {
            return new Promise((resolve, reject) => {
                if (typeof html2canvas !== 'undefined') { resolve(); return; }
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Failed to load html2canvas'));
                document.head.appendChild(script);
            });
        },
        
        async captureWithOverlay() {
            toast('Using fallback capture...');
            try {
                // Create canvas with map info overlay
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = window.innerWidth * 2;
                canvas.height = window.innerHeight * 2;
                ctx.scale(2, 2);
                
                // Draw background
                ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#1a1a2e';
                ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
                
                // Draw SkyTrack header
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(10, 10, 280, 100);
                
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 20px -apple-system, sans-serif';
                ctx.fillText('SkyTrack', 20, 40);
                
                ctx.fillStyle = '#fff';
                ctx.font = '14px -apple-system, sans-serif';
                ctx.fillText(new Date().toLocaleString(), 20, 65);
                ctx.fillText(`${Object.keys(aircraftCache).length} aircraft tracked`, 20, 85);
                
                const center = map.getCenter();
                ctx.font = '12px monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText(`Location: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`, 20, 100);
                
                // Draw aircraft positions as dots
                ctx.fillStyle = '#ffd700';
                const bounds = map.getBounds();
                Object.values(aircraftCache).forEach(ac => {
                    if (ac.lat !== undefined && bounds.contains([ac.lat, ac.lon])) {
                        const point = map.latLngToContainerPoint([ac.lat, ac.lon]);
                        ctx.beginPath();
                        ctx.arc(point.x, point.y, ac.hex === selectedHex ? 8 : 4, 0, Math.PI * 2);
                        ctx.fillStyle = ac.hex === selectedHex ? '#00ffff' : 
                                       (ac.interesting || ac.militaryInfo) ? '#ffd700' : '#fff';
                        ctx.fill();
                    }
                });
                
                // Add note about map tiles
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '11px -apple-system, sans-serif';
                ctx.fillText('Note: Map tiles could not be captured due to browser security', 10, window.innerHeight - 10);
                
                this.downloadCanvas(canvas, `skytrack-screenshot-${Date.now()}.png`);
                toast('Screenshot saved (simplified view)');
            } catch (e) {
                errorHandler.log('Screenshot', e.message);
                toast('Screenshot failed');
            }
        },
        
        async captureMapOnly() {
            toast('Capturing map...');
            
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const mapEl = document.getElementById('map');
                const rect = mapEl.getBoundingClientRect();
                
                canvas.width = rect.width * 2;
                canvas.height = rect.height * 2;
                ctx.scale(2, 2);
                
                // Draw background
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, rect.width, rect.height);
                
                // Draw map info overlay
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(10, 10, 200, 80);
                
                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 16px -apple-system, sans-serif';
                ctx.fillText('SkyTrack', 20, 35);
                
                ctx.fillStyle = '#fff';
                ctx.font = '12px -apple-system, sans-serif';
                ctx.fillText(new Date().toLocaleString(), 20, 55);
                ctx.fillText(`${Object.keys(aircraftCache).length} aircraft tracked`, 20, 75);
                
                // Add current view center
                const center = map.getCenter();
                ctx.font = '10px monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText(`${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`, rect.width - 150, rect.height - 15);
                
                this.downloadCanvas(canvas, `skytrack-map-${Date.now()}.png`);
                toast('Map screenshot saved!');
            } catch (e) {
                errorHandler.log('MapCapture', e.message);
                toast('Map capture failed');
            }
        },
        
        async createInfoScreenshot() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = 800;
            canvas.height = 600;
            
            // Background
            const gradient = ctx.createLinearGradient(0, 0, 800, 600);
            gradient.addColorStop(0, '#1a1a2e');
            gradient.addColorStop(1, '#0f0f1e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 800, 600);
            
            // Title
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 32px -apple-system, sans-serif';
            ctx.fillText('SkyTrack Flight Tracker', 40, 60);
            
            // Stats
            ctx.fillStyle = '#fff';
            ctx.font = '18px -apple-system, sans-serif';
            ctx.fillText(`Total Aircraft: ${Object.keys(aircraftCache).length}`, 40, 120);
            ctx.fillText(`Time: ${new Date().toLocaleString()}`, 40, 150);
            
            const center = map.getCenter();
            ctx.fillText(`View Center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`, 40, 180);
            ctx.fillText(`Zoom Level: ${map.getZoom()}`, 40, 210);
            
            // Aircraft list
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 16px -apple-system, sans-serif';
            ctx.fillText('Top Aircraft:', 40, 270);
            
            ctx.fillStyle = '#aaa';
            ctx.font = '14px monospace';
            
            let y = 300;
            const aircraft = Object.values(aircraftCache).slice(0, 10);
            aircraft.forEach(ac => {
                const line = `${(ac.flight?.trim() || ac.hex).padEnd(10)} | ${(ac.t || '---').padEnd(8)} | ${(ac.alt_baro?.toLocaleString() || '---').padStart(7)} ft`;
                ctx.fillText(line, 40, y);
                y += 25;
            });
            
            this.downloadCanvas(canvas, `skytrack-info-${Date.now()}.png`);
            toast('Info screenshot saved!');
        },
        
        downloadCanvas(canvas, filename) {
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        },
        
        async toggleRecording() {
            if (this.recording) {
                this.stopRecording();
            } else {
                await this.startRecording();
            }
        },
        
        async startRecording() {
            try {
                toast('Select the window/screen to record...');
                
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { mediaSource: 'screen' },
                    audio: false
                });
                
                this.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'video/webm;codecs=vp9'
                });
                
                this.chunks = [];
                
                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        this.chunks.push(e.data);
                    }
                };
                
                this.mediaRecorder.onstop = () => {
                    this.saveRecording();
                    stream.getTracks().forEach(t => t.stop());
                };
                
                // Handle stream ending (user clicks stop share)
                stream.getVideoTracks()[0].onended = () => {
                    if (this.recording) {
                        this.stopRecording();
                    }
                };
                
                this.mediaRecorder.start(1000);
                this.recording = true;
                
                document.getElementById('captureBtn')?.classList.add('recording');
                document.getElementById('captureRecord').innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
                    </svg>
                    <span>Stop Recording</span>
                `;
                document.getElementById('captureRecord')?.setAttribute('aria-label', 'Stop Screen Recording');
                
                toast('Recording started - click again to stop');
                
            } catch (e) {
                errorHandler.log('Recording', e.message);
                toast('Recording cancelled or not supported');
            }
        },
        
        stopRecording() {
            if (this.mediaRecorder && this.recording) {
                this.mediaRecorder.stop();
                this.recording = false;
                
                document.getElementById('captureBtn')?.classList.remove('recording');
                document.getElementById('captureRecord').innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="4" fill="currentColor"/>
                    </svg>
                    <span>Start Recording</span>
                `;
                document.getElementById('captureRecord')?.setAttribute('aria-label', 'Start Screen Recording');
                
                toast('Recording stopped - saving…');
            }
        },
        
        saveRecording() {
            if (this.chunks.length === 0) {
                toast('No recording data');
                return;
            }
            
            const blob = new Blob(this.chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.download = `skytrack-recording-${Date.now()}.webm`;
            link.href = url;
            link.click();
            
            URL.revokeObjectURL(url);
            this.chunks = [];
            toast('Recording saved!');
        },
        
        async createTimelapse() {
            if (!timeMachine.data || timeMachine.data.timestamps.length < 10) {
                const hours = await uiDialogs.prompt({
                    eyebrow: 'Capture',
                    title: 'Load History for Timelapse',
                    message: 'Timelapse capture needs at least 10 time points. Choose how many hours of history to rebuild first.',
                    label: 'Hours to Load',
                    note: 'A longer range gives you a richer playback sequence.',
                    placeholder: '6',
                    defaultValue: '6',
                    inputType: 'number',
                    inputMode: 'numeric',
                    min: 1,
                    max: 24,
                    step: 1,
                    confirmLabel: 'Load & Prepare',
                    cancelLabel: 'Cancel',
                    validationMessage: 'Enter a whole number between 1 and 24.',
                    validate: (raw) => {
                        const parsed = parseInt(raw, 10);
                        return Number.isFinite(parsed) ? Math.min(24, Math.max(1, parsed)) : null;
                    }
                });
                if (hours !== null) {
                    const loaded = await timeMachine.loadHistory(hours);
                    if (loaded && timeMachine.data && timeMachine.data.timestamps.length >= 10) {
                        await this.generateTimelapseInfo();
                    }
                }
                return;
            }
            
            await this.generateTimelapseInfo();
        },
        
        async generateTimelapseInfo() {
            const data = timeMachine.data;
            const frames = data.timestamps.length;
            const duration = (data.timestamps[frames - 1] - data.timestamps[0]) / 1000;
            const format = new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });

            const info = `Frames ready: ${frames}
Covers about ${Math.round(duration / 3600)} hours
Start: ${format.format(new Date(data.timestamps[0]))}
End: ${format.format(new Date(data.timestamps[frames - 1]))}

To capture a clean timelapse:
1. Start screen recording
2. Press Play in Time Machine
3. Set speed to 8x or 16x
4. Stop recording when playback finishes`;

            await uiDialogs.info({
                eyebrow: 'Capture',
                title: 'Timelapse Ready',
                message: info,
                confirmLabel: 'Close'
            });
            toast('Use Time Machine + Recording for timelapse');
        }
    };

    // Add weather overlay button handler
    document.getElementById('weatherOverlayBtn')?.addEventListener('click', () => weatherOverlay.toggle());

    // Phase 12: Initialize new systems
    dashboardLayout.init();
    themeSystem.init();
    trailRenderer.init();
    notificationCenter.init();
    
    // Phase 13: Initialize multi-select system
    multiSelect.init();
    
    // Phase 14: Initialize advanced tools
    timeMachine.init();
    clusterManager.init();
    geofencing.init();
    captureSystem.init();
    
    // Phase 14: Integrate geofencing with aircraft updates
    const originalUpdateMarkers = typeof updateMarkers !== 'undefined' ? updateMarkers : null;
    if (typeof updateMarkers === 'function') {
        const wrappedUpdateMarkers = updateMarkers;
        window.updateMarkersWithGeofencing = function() {
            wrappedUpdateMarkers();
            // Check aircraft against geofences
            if (geofencing.zones.length > 0 && !timeMachine.active) {
                Object.values(aircraftCache).forEach(ac => {
                    geofencing.checkAircraft(ac);
                });
            }
            // Update clusters if enabled
            if (clusterManager.enabled) {
                clusterManager.updateClusters();
            }
        };
    }
    
    // Phase 14: Periodic geofence check
    _setPausableInterval(() => {
        if (geofencing.zones.length > 0 && !timeMachine.active) {
            Object.values(aircraftCache).forEach(ac => {
                geofencing.checkAircraft(ac);
            });
        }
    }, 10000, 'geofence');
    
    // ============ PHASE 15: MOBILE EXPERIENCE ============
    
    // Mobile Detection & Support
    const mobileSupport = {
        isMobile: false,
        isTablet: false,
        isTouchDevice: false,
        screenSize: 'desktop',
        orientation: 'landscape',
        
        init() {
            this.detect();
            this.setupOrientationListener();
            
            if (this.isTouchDevice) {
                document.body.classList.add('touch-device');
                this.initTouchHandlers();
            }
            
            if (this.isMobile) {
                document.body.classList.add('mobile-view');
                this.initMobileUI();
            }
            
            _dbg('Mobile support initialized:', {
                mobile: this.isMobile,
                tablet: this.isTablet,
                touch: this.isTouchDevice,
                screen: this.screenSize,
                orientation: this.orientation
            });
        },
        
        detect() {
            // Check for touch support
            this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            
            // Check screen size
            const width = window.innerWidth;
            if (width < 768) {
                this.isMobile = true;
                this.screenSize = 'mobile';
            } else if (width < 1024) {
                this.isTablet = true;
                this.screenSize = 'tablet';
            } else {
                this.isMobile = false;
                this.isTablet = false;
                this.screenSize = 'desktop';
            }
            
            // Check orientation
            this.orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        },
        
        setupOrientationListener() {
            const handleResize = perfUtils.debounce(() => {
                const wasMobile = this.isMobile;
                this.detect();
                this.updateLayout();
                
                // Handle transition between mobile and desktop
                if (wasMobile !== this.isMobile) {
                    if (this.isMobile) {
                        document.body.classList.add('mobile-view');
                        this.initMobileUI();
                    } else {
                        document.body.classList.remove('mobile-view');
                        this.removeMobileUI();
                    }
                }
            }, 200);
            
            window.addEventListener('resize', handleResize);
            
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.detect();
                    this.updateLayout();
                }, 100);
            });
        },
        
        updateLayout() {
            document.body.classList.toggle('mobile-view', this.isMobile);
            document.body.classList.toggle('tablet-view', this.isTablet);
            document.body.classList.toggle('portrait', this.orientation === 'portrait');
            document.body.classList.toggle('landscape', this.orientation === 'landscape');
            
            // Resize map
            if (map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        },
        
        initMobileUI() {
            if (!document.querySelector('.mobile-bottom-nav')) {
                this.createBottomNav();
            }
            if (!document.querySelector('.mobile-fab')) {
                this.createFAB();
            }
            this.convertPanelsToSheets();
        },
        
        removeMobileUI() {
            document.querySelector('.mobile-bottom-nav')?.remove();
            document.querySelector('.mobile-fab')?.remove();
            document.querySelector('.quick-actions-menu')?.remove();
            document.querySelectorAll('.bottom-sheet').forEach(sheet => {
                sheet.classList.remove('bottom-sheet', 'collapsed', 'half', 'expanded', 'peek');
            });
        },
        
        initTouchHandlers() {
            document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
            document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
            document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        },
        
        touchStartY: 0,
        touchStartX: 0,
        activeSheet: null,
        
        handleTouchStart(e) {
            this.touchStartY = e.touches[0].clientY;
            this.touchStartX = e.touches[0].clientX;
            this._infoDrag = false;
            this._infoPending = false;
            this._infoOffset = 0;
            this._infoBaseHeight = 0;

            // Check if touching info panel bottom-sheet (pull-to-dismiss)
            const infoSheet = e.target.closest('#infoPanel.bottom-sheet');
            if (infoSheet) {
                if (e.target.closest('.sheet-handle')) {
                    this._infoDrag = true;
                    this._infoOffset = 0;
                    this._infoBaseHeight = infoSheet.offsetHeight;
                } else {
                    this._infoPending = true;
                    this._infoScrollEl = infoSheet.querySelector('.info-content') || infoSheet;
                }
                return;
            }

            // Check if touching a bottom sheet handle
            const sheet = e.target.closest('.bottom-sheet');
            if (sheet && e.target.closest('.sheet-handle')) {
                this.activeSheet = sheet;
            }
        },

        handleTouchMove(e) {
            const currentY = e.touches[0].clientY;
            const deltaFromStart = currentY - this.touchStartY;

            // Info panel pending: activate drag when scrolled to top and swiping down
            if (this._infoPending && !this._infoDrag) {
                const scrollEl = this._infoScrollEl;
                const atTop = !scrollEl || scrollEl.scrollTop <= 0;
                if (atTop && deltaFromStart > 5) {
                    this._infoDrag = true;
                    this._infoPending = false;
                    this._infoOffset = 0;
                    const infoPanel = _el('infoPanel');
                    this._infoBaseHeight = infoPanel ? infoPanel.offsetHeight : window.innerHeight * 0.5;
                    this.touchStartY = currentY;
                } else if (deltaFromStart < -5) {
                    this._infoPending = false;
                }
            }

            // Active info panel drag: follow finger
            if (this._infoDrag) {
                e.preventDefault();
                this._infoOffset = currentY - this.touchStartY;
                const offset = Math.max(-20, this._infoOffset);
                const infoPanel = _el('infoPanel');
                if (infoPanel) {
                    const newHeight = Math.max(0, this._infoBaseHeight - offset);
                    infoPanel.style.height = newHeight + 'px';
                    infoPanel.style.transition = 'none';
                    const ratio = newHeight / this._infoBaseHeight;
                    infoPanel.style.opacity = Math.max(0.3, ratio);
                }
                return;
            }

            if (!this.activeSheet) return;

            const deltaY = currentY - this.touchStartY;
            const sheet = this.activeSheet;

            // Prevent default to stop page scroll
            e.preventDefault();

            // Move sheet with finger
            const currentHeight = sheet.offsetHeight;
            const newHeight = Math.max(60, Math.min(window.innerHeight * 0.9, currentHeight - deltaY));
            sheet.style.height = newHeight + 'px';

            this.touchStartY = currentY;
        },

        handleTouchEnd(e) {
            // Info panel drag end
            if (this._infoDrag) {
                this._infoDrag = false;
                this._infoPending = false;
                const infoPanel = _el('infoPanel');
                const dismissed = this._infoOffset > 80;
                if (infoPanel) {
                    infoPanel.style.transition = '';
                    infoPanel.style.opacity = '';
                    if (dismissed) {
                        infoPanel.style.height = '0px';
                        infoPanel.style.opacity = '0';
                        setTimeout(() => {
                            infoPanel.style.height = '';
                            infoPanel.style.opacity = '';
                            deselectAircraft();
                        }, 200);
                    } else {
                        infoPanel.style.height = '';
                    }
                }
                return;
            }
            this._infoPending = false;

            if (!this.activeSheet) return;

            const sheet = this.activeSheet;
            const height = sheet.offsetHeight;
            const maxHeight = window.innerHeight * 0.9;

            // Snap to positions
            if (height < 100) {
                this.collapseSheet(sheet);
            } else if (height > maxHeight * 0.7) {
                this.expandSheet(sheet);
            } else {
                this.halfExpandSheet(sheet);
            }

            this.activeSheet = null;
        },
        
        collapseSheet(sheet) {
            sheet.style.height = '';
            sheet.classList.remove('expanded', 'half', 'peek');
            sheet.classList.add('collapsed');
        },
        
        peekSheet(sheet) {
            sheet.style.height = '';
            sheet.classList.remove('expanded', 'half', 'collapsed');
            sheet.classList.add('peek');
        },
        
        halfExpandSheet(sheet) {
            sheet.style.height = '';
            sheet.classList.remove('expanded', 'collapsed', 'peek');
            sheet.classList.add('half');
        },
        
        expandSheet(sheet) {
            sheet.style.height = '';
            sheet.classList.remove('collapsed', 'half', 'peek');
            sheet.classList.add('expanded');
        },
        
        createBottomNav() {
            const nav = document.createElement('nav');
            nav.className = 'mobile-bottom-nav';
            nav.setAttribute('aria-label', 'Mobile Navigation');
            nav.innerHTML = `
                <button type="button" class="nav-item active" data-panel="map" aria-label="Show Map" aria-pressed="true">
                    <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                    <span>Map</span>
                </button>
                <button type="button" class="nav-item" data-panel="list" aria-label="Show Aircraft List" aria-pressed="false">
                    <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
                    <span>List</span>
                </button>
                <button type="button" class="nav-item" data-panel="watchlist" aria-label="Show Watchlist" aria-pressed="false">
                    <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span>Watchlist</span>
                </button>
                <button type="button" class="nav-item" data-panel="settings" aria-label="Show Preferences" aria-pressed="false">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>Preferences</span>
                </button>
            `;
            document.body.appendChild(nav);
            
            // Handle nav clicks
            nav.querySelectorAll('.nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    nav.querySelectorAll('.nav-item').forEach(i => {
                        i.classList.remove('active');
                        i.setAttribute('aria-pressed', 'false');
                    });
                    item.classList.add('active');
                    item.setAttribute('aria-pressed', 'true');
                    this.showMobilePanel(item.dataset.panel);
                    haptics.light();
                });
            });
        },
        
        createFAB() {
            const fab = document.createElement('button');
            fab.className = 'mobile-fab';
            fab.type = 'button';
            fab.setAttribute('aria-label', 'Open Quick Actions');
            fab.setAttribute('aria-haspopup', 'menu');
            fab.setAttribute('aria-expanded', 'false');
            fab.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
            fab.title = 'Quick Actions';
            fab.addEventListener('click', () => {
                this.toggleQuickActions();
                haptics.medium();
            });
            document.body.appendChild(fab);
            
            // Create quick actions menu
            const menu = document.createElement('div');
            menu.id = 'quickActionsMenu';
            menu.className = 'quick-actions-menu';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', 'Quick Actions');
            menu.setAttribute('aria-hidden', 'true');
            menu.innerHTML = `
                <button type="button" class="quick-action-item" data-action="locate" role="menuitem" aria-label="Center on My Location">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    Center on Me
                </button>
                <button type="button" class="quick-action-item" data-action="screenshot" role="menuitem" aria-label="Capture Screenshot">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Capture View
                </button>
                <button type="button" class="quick-action-item" data-action="geofence" role="menuitem" aria-label="Draw Alert Zone">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>
                    Draw Alert Zone
                </button>
                <button type="button" class="quick-action-item" data-action="search" role="menuitem" aria-label="Search Flights">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    Search Flights
                </button>
            `;
            document.body.appendChild(menu);
            
            menu.querySelectorAll('.quick-action-item').forEach(item => {
                item.addEventListener('click', () => {
                    const action = item.dataset.action;
                    this.handleQuickAction(action);
                    menu.classList.remove('show');
                    haptics.light();
                });
            });
            
            // Close menu on tap elsewhere
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.mobile-fab') && !e.target.closest('.quick-actions-menu')) {
                    menu.classList.remove('show');
                    menu.setAttribute('aria-hidden', 'true');
                    setExpandedState(fab, false);
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && menu.classList.contains('show')) {
                    menu.classList.remove('show');
                    menu.setAttribute('aria-hidden', 'true');
                    setExpandedState(fab, false);
                }
            });
        },
        
        toggleQuickActions() {
            const menu = document.querySelector('.quick-actions-menu');
            if (menu) {
                const isOpen = !menu.classList.contains('show');
                menu.classList.toggle('show', isOpen);
                menu.setAttribute('aria-hidden', String(!isOpen));
                setExpandedState(document.querySelector('.mobile-fab'), isOpen);
                if (isOpen) {
                    menu.querySelector('.quick-action-item')?.focus();
                }
            }
        },
        
        handleQuickAction(action) {
            switch (action) {
                case 'locate':
                    if (typeof locateUser === 'function') {
                        locateUser();
                    } else if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            pos => map.setView([pos.coords.latitude, pos.coords.longitude], 10),
                            () => toast('Location access denied', 'error')
                        );
                    }
                    break;
                case 'screenshot':
                    if (typeof captureSystem !== 'undefined' && captureSystem.takeScreenshot) {
                        captureSystem.takeScreenshot();
                    } else {
                        toast('Screenshot not available');
                    }
                    break;
                case 'geofence':
                    if (typeof geofencing !== 'undefined' && geofencing.startDrawing) {
                        geofencing.startDrawing();
                    }
                    break;
                case 'search':
                    const searchBox = document.querySelector('.search-box');
                    if (searchBox) {
                        searchBox.focus();
                        searchSystem.open?.();
                        this.hideAllPanels();
                    }
                    break;
            }
        },
        
        convertPanelsToSheets() {
            // Convert info panel to bottom sheet
            const infoPanel = _el('infoPanel');
            if (infoPanel && !infoPanel.classList.contains('bottom-sheet')) {
                infoPanel.classList.add('bottom-sheet', 'collapsed');
                const handle = document.createElement('div');
                handle.className = 'sheet-handle';
                handle.innerHTML = '<div class="handle-bar"></div>';
                infoPanel.insertBefore(handle, infoPanel.firstChild);
            }
            
            // Convert settings panel to bottom sheet
            const settingsPanel = _el('settingsPanel');
            if (settingsPanel && !settingsPanel.classList.contains('bottom-sheet')) {
                settingsPanel.classList.add('bottom-sheet', 'collapsed');
                if (!settingsPanel.querySelector('.sheet-handle')) {
                    const handle = document.createElement('div');
                    handle.className = 'sheet-handle';
                    handle.innerHTML = '<div class="handle-bar"></div>';
                    settingsPanel.insertBefore(handle, settingsPanel.firstChild);
                }
            }
        },
        
        showMobilePanel(panelName) {
            switch (panelName) {
                case 'map':
                    this.hideAllPanels();
                    break;
                case 'list':
                    this.showAircraftList();
                    break;
                case 'watchlist':
                    this.showWatchlistSheet();
                    break;
                case 'settings':
                    this.showSettingsSheet();
                    break;
            }
        },
        
        hideAllPanels() {
            document.querySelectorAll('.bottom-sheet').forEach(sheet => {
                this.collapseSheet(sheet);
            });
        },
        
        showAircraftList() {
            this.hideAllPanels();
            let list = document.getElementById('aircraftListSheet');
            if (!list) {
                list = this.createAircraftListSheet();
            }
            this.halfExpandSheet(list);
            this.updateAircraftList();
        },
        
        createAircraftListSheet() {
            const sheet = document.createElement('div');
            sheet.id = 'aircraftListSheet';
            sheet.className = 'bottom-sheet collapsed';
            sheet.innerHTML = `
                <div class="sheet-handle"><div class="handle-bar"></div></div>
                <div class="sheet-header">
                    <span class="sheet-title">Aircraft (<span id="listCount">0</span>)</span>
                    <div class="sheet-sort">
                        <select id="listSort">
                            <option value="distance">Distance</option>
                            <option value="altitude">Altitude</option>
                            <option value="speed">Speed</option>
                            <option value="callsign">Callsign</option>
                        </select>
                    </div>
                </div>
                <div class="sheet-content" id="aircraftListContent"></div>
            `;
            document.body.appendChild(sheet);
            
            document.getElementById('listSort').addEventListener('change', () => this.updateAircraftList());
            
            return sheet;
        },
        
        updateAircraftList() {
            const content = document.getElementById('aircraftListContent');
            if (!content) return;
            
            const sortBy = document.getElementById('listSort')?.value || 'distance';
            
            let aircraft = Object.values(aircraftCache).filter(ac => ac.lat !== undefined);
            
            // Calculate distances
            const center = map.getCenter();
            aircraft.forEach(ac => {
                ac._distance = haversineDistance(center.lat, center.lng, ac.lat, ac.lon);
            });
            
            // Sort
            switch (sortBy) {
                case 'distance':
                    aircraft.sort((a, b) => a._distance - b._distance);
                    break;
                case 'altitude':
                    aircraft.sort((a, b) => (b.alt_baro || 0) - (a.alt_baro || 0));
                    break;
                case 'speed':
                    aircraft.sort((a, b) => (b.gs || 0) - (a.gs || 0));
                    break;
                case 'callsign':
                    aircraft.sort((a, b) => (a.flight || '').localeCompare(b.flight || ''));
                    break;
            }
            
            const listCountEl = document.getElementById('listCount');
            if (listCountEl) listCountEl.textContent = aircraft.length;
            
            const getIconClass = (ac) => {
                if (ac.militaryInfo) return 'military';
                if (ac.interestingInfo?.category === 'Government') return 'gov';
                if (ac.interestingInfo?.category === 'Police') return 'police';
                if (ac.interestingInfo?.category === 'Medical') return 'medical';
                if (ac.vipInfo) return 'vip';
                return '';
            };
            
            const getIconSymbol = (ac) => {
                if (ac.militaryInfo) return '#';
                if (ac.interestingInfo?.category === 'Government') return 'G';
                if (ac.interestingInfo?.category === 'Police') return 'P';
                if (ac.interestingInfo?.category === 'Medical') return '+';
                if (ac.vipInfo) return '*';
                return '>';
            };
            
            content.innerHTML = aircraft.slice(0, 100).map(ac => `
                <div class="list-aircraft-item" data-hex="${_escHtml(ac.hex)}">
                    <div class="list-ac-icon ${getIconClass(ac)}">${getIconSymbol(ac)}</div>
                    <div class="list-ac-info">
                        <div class="list-ac-callsign">${_escHtml(ac.flight?.trim() || ac.r || ac.hex)}</div>
                        <div class="list-ac-detail">${_escHtml(ac.t || '---')} | ${_escHtml(ac.ownOp || ac.airline?.name || '---')}</div>
                    </div>
                    <div class="list-ac-data">
                        <div class="list-ac-alt">${ac.alt_baro === 'ground' ? 'GND' : ((ac.alt_baro || 0) / 1000).toFixed(1) + 'k'}</div>
                        <div class="list-ac-speed">${_escHtml(ac.gs || '---')} kt</div>
                    </div>
                </div>
            `).join('');
            
            content.querySelectorAll('.list-aircraft-item').forEach(item => {
                item.addEventListener('click', () => {
                    selectAircraft(item.dataset.hex);
                    this.showInfoPanel();
                    haptics.medium();
                });
            });
        },
        
        showInfoPanel() {
            this.hideAllPanels();
            const infoPanel = _el('infoPanel');
            if (infoPanel) {
                infoPanel.classList.add('bottom-sheet');
                this.halfExpandSheet(infoPanel);
            }
            // Update nav state
            const nav = document.querySelector('.mobile-bottom-nav');
            if (nav) {
                nav.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                nav.querySelector('[data-panel="map"]')?.classList.add('active');
            }
        },
        
        showWatchlistSheet() {
            this.hideAllPanels();
            let sheet = document.getElementById('watchlistSheet');
            if (!sheet) {
                sheet = this.createWatchlistSheet();
            }
            this.halfExpandSheet(sheet);
            this.updateWatchlistSheet();
        },
        
        createWatchlistSheet() {
            const sheet = document.createElement('div');
            sheet.id = 'watchlistSheet';
            sheet.className = 'bottom-sheet collapsed';
            sheet.innerHTML = `
                <div class="sheet-handle"><div class="handle-bar"></div></div>
                <div class="sheet-header">
                    <span class="sheet-title">Watchlist (<span id="watchlistSheetCount">0</span>)</span>
                </div>
                <div class="sheet-content" id="watchlistSheetContent">
                    <div class="watchlist-items"></div>
                </div>
            `;
            document.body.appendChild(sheet);
            return sheet;
        },
        
        updateWatchlistSheet() {
            const content = document.querySelector('#watchlistSheetContent .watchlist-items');
            const count = document.getElementById('watchlistSheetCount');
            if (!content) return;
            
            const watchedItems = Object.values(aircraftCache).filter(ac => ac.watched);
            if (count) count.textContent = watchedItems.length;
            
            if (watchedItems.length === 0) {
                content.innerHTML = '<div class="watchlist-empty" style="padding: 20px; text-align: center; color: var(--text-muted);">No watched aircraft</div>';
                return;
            }
            
            content.innerHTML = watchedItems.map(ac => `
                <div class="list-aircraft-item" data-hex="${_escHtml(ac.hex)}">
                    <div class="list-ac-icon" style="color: var(--accent);">*</div>
                    <div class="list-ac-info">
                        <div class="list-ac-callsign">${_escHtml(ac.flight?.trim() || ac.r || ac.hex)}</div>
                        <div class="list-ac-detail">${_escHtml(ac.t || '---')}</div>
                    </div>
                    <div class="list-ac-data">
                        <div class="list-ac-alt">${ac.alt_baro === 'ground' ? 'GND' : ((ac.alt_baro || 0) / 1000).toFixed(1) + 'k'}</div>
                        <div class="list-ac-speed">${_escHtml(ac.gs || '---')} kt</div>
                    </div>
                </div>
            `).join('');
            
            content.querySelectorAll('.list-aircraft-item').forEach(item => {
                item.addEventListener('click', () => {
                    selectAircraft(item.dataset.hex);
                    this.showInfoPanel();
                    haptics.medium();
                });
            });
        },
        
        showSettingsSheet() {
            this.hideAllPanels();
            const settings = _el('settingsPanel');
            if (settings) {
                settings.classList.add('bottom-sheet');
                this.expandSheet(settings);
            }
        }
    };
    
    // Touch Gestures
    const touchGestures = {
        lastTap: 0,
        longPressTimer: null,
        
        init() {
            if (!mobileSupport.isTouchDevice) return;
            
            const mapEl = document.getElementById('map');
            if (!mapEl) return;
            
            // Double tap zoom
            mapEl.addEventListener('touchend', (e) => {
                if (e.target.closest('.leaflet-control') || e.target.closest('.aircraft-marker')) return;
                
                const now = Date.now();
                if (now - this.lastTap < 300) {
                    const touch = e.changedTouches[0];
                    const containerPoint = L.point(touch.clientX, touch.clientY - 50);
                    const latlng = map.containerPointToLatLng(containerPoint);
                    map.setView(latlng, map.getZoom() + 1);
                    haptics.light();
                }
                this.lastTap = now;
            });
            
        }
    };
    
    // Haptic Feedback System
    const haptics = {
        enabled: true,
        
        light() {
            if (!this.enabled || !navigator.vibrate) return;
            navigator.vibrate(10);
        },
        
        medium() {
            if (!this.enabled || !navigator.vibrate) return;
            navigator.vibrate(25);
        },
        
        heavy() {
            if (!this.enabled || !navigator.vibrate) return;
            navigator.vibrate(50);
        },
        
        success() {
            if (!this.enabled || !navigator.vibrate) return;
            navigator.vibrate([20, 50, 20]);
        },
        
        error() {
            if (!this.enabled || !navigator.vibrate) return;
            navigator.vibrate([50, 30, 50, 30, 50]);
        },
        
        alert() {
            if (!this.enabled || !navigator.vibrate) return;
            navigator.vibrate([100, 50, 100]);
        }
    };
    
    // Phase 15: Initialize mobile systems
    mobileSupport.init();
    touchGestures.init();
    
    // Phase 15: Integrate haptics with existing systems
    const originalSelectAircraft = typeof selectAircraft === 'function' ? selectAircraft : null;
    if (originalSelectAircraft) {
        const wrappedSelectAircraft = window.selectAircraft;
        window.selectAircraft = function(hex) {
            wrappedSelectAircraft(hex);
            haptics.medium();
            
            // Show info panel on mobile
            if (mobileSupport.isMobile) {
                mobileSupport.showInfoPanel();
            }
        };
    }
    
    // Phase 15: Integrate haptics with alert system
    if (typeof alertSystem !== 'undefined' && alertSystem.show) {
        const originalAlertShow = alertSystem.show.bind(alertSystem);
        alertSystem.show = function(options) {
            originalAlertShow(options);
            haptics.alert();
        };
    }
    
    // Phase 15: Update aircraft list periodically on mobile
    _setPausableInterval(() => {
        if (mobileSupport.isMobile && document.getElementById('aircraftListSheet')?.classList.contains('half')) {
            mobileSupport.updateAircraftList();
        }
        if (mobileSupport.isMobile && document.getElementById('watchlistSheet')?.classList.contains('half')) {
            mobileSupport.updateWatchlistSheet();
        }
    }, 5000, 'mobileList');
    
    // ============ PHASE 16: INITIALIZE RELIABILITY SYSTEMS ============
    offlineManager.init();
    dataSourceManager.init();
    errorRecovery.init();
    
    // Phase 16: Cache positions periodically when online
    setInterval(() => {
        if (offlineManager.isOnline) {
            offlineManager.cachePositions();
        }
    }, 60000);
    
    // Phase 16: Log circuit breaker states periodically for debugging
    setInterval(() => {
        const states = Object.entries(circuitBreakers).map(([name, cb]) => {
            const state = cb.getState();
            return name + ':' + state.state;
        }).join(', ');
        _dbg('Circuit breakers:', states);
    }, 120000);
    
    // Phase 16: Keyboard shortcut for data source stats (Ctrl+Shift+D)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            console.table(dataSourceManager.getStats());
            toast('Data source stats logged to console');
        }
    });
    
    // Phase 12: Reset theme button handler
    document.getElementById('resetThemeBtn')?.addEventListener('click', () => themeSystem.resetCustomColors());
    
    // Phase 12: Integrate notifications with alert system
    const originalShowAlert = typeof alertSystem !== 'undefined' ? alertSystem.show : null;
    if (typeof alertSystem !== 'undefined' && alertSystem.show) {
        const originalShow = alertSystem.show.bind(alertSystem);
        alertSystem.show = function(options) {
            originalShow(options);
            // Also add to notification center for persistence
            notificationCenter.add({
                type: options.type || 'system',
                title: options.title,
                message: options.message,
                hex: options.hex
            });
        };
    }

    window.addEventListener('beforeunload', () => { saveAircraftCache(); saveMapPosition(); });

    // PWA Install Prompt Handler
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install prompt after 30 seconds if not dismissed
        setTimeout(() => {
            if (deferredPrompt && !localStorage.getItem('skytrack_install_dismissed')) {
                document.getElementById('installPrompt').classList.add('show');
            }
        }, 30000);
    });

    document.getElementById('installBtn')?.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            toast('SkyTrack installed!');
        }
        
        deferredPrompt = null;
        document.getElementById('installPrompt').classList.remove('show');
    });

    document.getElementById('installDismiss')?.addEventListener('click', () => {
        document.getElementById('installPrompt').classList.remove('show');
        localStorage.setItem('skytrack_install_dismissed', 'true');
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        document.getElementById('installPrompt').classList.remove('show');
        toast('SkyTrack installed successfully!');
    });

    // ============ UI OVERHAUL: INITIALIZATION ============
    (function initUIOverhaul() {
        // --- Status Dock Updates ---
        function updateStatusDock() {
            const count = Object.keys(aircraftCache).filter(h => aircraftCache[h].lat !== undefined && Date.now() - aircraftCache[h].lastSeen < 120000).length;
            const el = document.getElementById('dockCount');
            if (el) el.textContent = count.toLocaleString();
            
            const srcEl = document.getElementById('dockSource');
            const dotEl = document.getElementById('dockDot');
            if (srcEl) {
                const ds = _el('dataSource');
                const txt = ds ? ds.textContent : '';
                const srcName = txt.split(' - ')[0] || 'Connecting';
                srcEl.textContent = normalizeUiText(srcName);
            }
            if (dotEl) {
                const healthy = dataSourceManager.sources.filter(s => s.status === 'healthy').length;
                dotEl.className = 'status-dock-dot ' + (healthy >= 2 ? 'green' : healthy >= 1 ? 'yellow' : count > 0 ? 'yellow' : 'red');
            }
            
            const timeEl = document.getElementById('dockTime');
            if (timeEl && lastFetchTime) {
                const ago = Math.round((Date.now() - lastFetchTime) / 1000);
                timeEl.textContent = ago < 5 ? 'Live' : ago < 60 ? ago + 's ago' : Math.round(ago / 60) + 'm ago';
            }
        }
        _setPausableInterval(updateStatusDock, 1500, "statusDock");
        
        // --- Dropdown Menus ---
        document.querySelectorAll('.hv2-dropdown-trigger').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const panel = trigger.nextElementSibling;
                const wasOpen = panel.classList.contains('show');
                // Close all
                document.querySelectorAll('.hv2-panel.show').forEach(p => p.classList.remove('show'));
                document.querySelectorAll('.hv2-dropdown-trigger.open').forEach(t => { t.classList.remove('open'); setExpandedState(t, false); });
                if (!wasOpen) {
                    panel.classList.add('show');
                    trigger.classList.add('open');
                    setExpandedState(trigger, true);
                }
            });
        });
        document.addEventListener('click', () => {
            document.querySelectorAll('.hv2-panel.show').forEach(p => p.classList.remove('show'));
            document.querySelectorAll('.hv2-dropdown-trigger.open').forEach(t => { t.classList.remove('open'); setExpandedState(t, false); });
        });
        document.querySelectorAll('.hv2-panel').forEach(p => p.addEventListener('click', e => e.stopPropagation()));
        
        // Wire dropdown items to original button handlers
        document.querySelectorAll('.hv2-item[data-btn]').forEach(item => {
            item.addEventListener('click', () => {
                const btnId = item.getAttribute('data-btn');
                const btn = document.getElementById(btnId);
                if (btn) btn.click();
                // Update active state
                setTimeout(() => {
                    item.classList.toggle('is-active', btn && btn.classList.contains('active'));
                }, 100);
            });
        });
        
        // Sync active states periodically
        function syncDropdownStates() {
            document.querySelectorAll('.hv2-item[data-btn]').forEach(item => {
                const btn = document.getElementById(item.getAttribute('data-btn'));
                if (btn) item.classList.toggle('is-active', btn.classList.contains('active'));
            });
            // Update dropdown badges
            document.querySelectorAll('.hv2-dropdown').forEach(dd => {
                const activeCount = dd.querySelectorAll('.hv2-item.is-active').length;
                const badge = dd.querySelector('.hv2-dd-badge');
                if (badge) badge.style.display = activeCount > 0 ? '' : 'none';
            });
        }
        _setPausableInterval(syncDropdownStates, 2000, "dropdownSync");
        setTimeout(syncDropdownStates, 500);
        
        // --- Filter Chips ---
        const chipsBar = document.getElementById('filterChipsBar');
        const chipsToggle = document.getElementById('filterChipsToggle');
        let chipsVisible = false;
        if (chipsToggle) {
            chipsToggle.addEventListener('click', () => {
                chipsVisible = !chipsVisible;
                chipsBar.classList.toggle('show', chipsVisible);
                chipsToggle.classList.toggle('active', chipsVisible);
                setExpandedState(chipsToggle, chipsVisible);
            });
        }
        document.querySelectorAll('.filter-chip-btn').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                applyChipFilters();
            });
        });
        function applyChipFilters() {
            const activeChips = [...document.querySelectorAll('.filter-chip-btn.active')].map(c => c.dataset.filter);
            // If no chips active, show all
            if (activeChips.length === 0) {
                if (typeof updateMarkers === 'function') updateMarkers();
                return;
            }
            // Update marker visibility
            Object.entries(markers).forEach(([hex, marker]) => {
                const ac = aircraftCache[hex];
                if (!ac) return;
                let show = false;
                const ct = ac.category_type || '';
                if (activeChips.includes('military') && (ct === 'military' || ct === 'government' || ct === 'police')) show = true;
                if (activeChips.includes('commercial') && (ct === 'commercial' || ct === 'cargo')) show = true;
                if (activeChips.includes('cargo') && ct === 'cargo') show = true;
                if (activeChips.includes('private') && ct === 'private') show = true;
                if (activeChips.includes('helicopter') && ct === 'helicopter') show = true;
                if (activeChips.includes('interesting') && (ac.interesting || ac.isVIP || ac.piaInfo || ct === 'interesting' || ct === 'vip' || ct === 'pia')) show = true;
                marker.setOpacity(show ? 1 : 0.08);
            });
        }
        
        // --- 3D HUD ---
        const origToggle3D = view3D.toggle.bind(view3D);
        const hud3d = document.getElementById('hud3d');
        if (hud3d) {
            const origEnable = view3D.enable.bind(view3D);
            const origDisable = view3D.disable.bind(view3D);
            const patchedEnable = view3D.enable;
            const patchedDisable = view3D.disable;
            const showHud = () => { if (hud3d) hud3d.classList.add('show'); };
            const hideHud = () => { if (hud3d) hud3d.classList.remove('show'); };
            // Patch enable/disable to show/hide HUD
            const origEnableFn = view3D.enable;
            view3D.enable = function() {
                origEnableFn.call(this);
                showHud();
            };
            const origDisableFn = view3D.disable;
            view3D.disable = function() {
                origDisableFn.call(this);
                hideHud();
            };
        }
        
        // --- Onboarding ---
        if (!localStorage.getItem('skytrack_onboarded')) {
            const overlay = document.getElementById('onboardOverlay');
            if (overlay) {
                setTimeout(() => overlay.classList.add('show'), 1500);
                document.getElementById('onboardDismiss')?.addEventListener('click', () => {
                    overlay.classList.remove('show');
                    localStorage.setItem('skytrack_onboarded', '1');
                });
            }
        }
        
        // --- Loading Overlay ---
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            const checkLoaded = setInterval(() => {
                const count = Object.keys(aircraftCache).filter(h => aircraftCache[h].lat !== undefined).length;
                const loadText = document.getElementById('loadingText');
                if (count > 0) {
                    if (loadText) loadText.textContent = count.toLocaleString() + ' aircraft in view';
                    setTimeout(() => loadingOverlay.classList.add('hidden'), 800);
                    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 1300);
                    clearInterval(checkLoaded);
                }
            }, 500);
            // Force hide after 15s
            setTimeout(() => { loadingOverlay.classList.add('hidden'); setTimeout(() => { loadingOverlay.style.display = 'none'; }, 500); }, 15000);
        }
        
        // --- Info Panel QuickGlance ---
        const origSelectAircraft = window.selectAircraft;
        const qg = document.getElementById('infoQuickGlance');
        function updateQuickGlance(hex) {
            if (!qg) return;
            const ac = aircraftCache[hex];
            if (!ac) return;
            const cs = document.getElementById('qgCallsign');
            const alt = document.getElementById('qgAlt');
            const spd = document.getElementById('qgSpeed');
            const dest = document.getElementById('qgDest');
            if (cs) cs.textContent = ac.flight?.trim() || ac.r || hex.toUpperCase();
            if (alt) alt.textContent = (typeof ac.alt_baro === 'number') ? Math.round(ac.alt_baro).toLocaleString() + "'" : '---';
            if (spd) spd.textContent = ac.gs ? Math.round(ac.gs) + 'kt' : '---';
            if (dest) dest.textContent = ac.to || ac.destination || '---';
        }
        // Patch selectAircraft to update quickglance
        const origSelect = selectAircraft;
        window.selectAircraft = function(hex) {
            origSelect(hex);
            updateQuickGlance(hex);
        };
        // Also update periodically for selected aircraft
        _setPausableInterval(() => { if (selectedHex) updateQuickGlance(selectedHex); }, 2000, 'quickGlance');
        
        // --- Wide Screen Sidebar Pin ---
        if (window.innerWidth >= 1400) {
            const observer = new MutationObserver(() => {
                const panel = _el('infoPanel');
                document.body.classList.toggle('panel-pinned', panel && panel.classList.contains('show'));
            });
            const panel = _el('infoPanel');
            if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        }
    })();
