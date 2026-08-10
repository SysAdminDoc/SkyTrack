
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

        async requestPersistentStorage() {
            if (!navigator.storage?.persist || !navigator.storage?.persisted) return false;
            try {
                if (await navigator.storage.persisted()) return true;
            } catch (_) {}
            try {
                if (localStorage.getItem('skytrack_persist_prompted') === '1') return false;
                localStorage.setItem('skytrack_persist_prompted', '1');
            } catch (_) {}
            try {
                const granted = await navigator.storage.persist();
                if (granted) toast('Persistent storage enabled for your watchlist');
                return granted;
            } catch (_) {
                return false;
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
            if (this.watchlist.size === 1) this.requestPersistentStorage();
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
            try { eventTicker.record(alert); } catch (_) {}
            try { voiceAlerts.speak(alert); } catch (_) {}
            try { webhookPoster.post(alert); } catch (_) {}
            if (this.soundEnabled) this.playSound(alert.alertType.sound);
            if (this.notificationsEnabled) this.showBrowserNotification(alert);
        },
        
        showInAppNotification(alert) {
            let container = document.getElementById('alertContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'alertContainer';
                container.className = 'alert-container';
                container.setAttribute('role', 'status');
                container.setAttribute('aria-live', 'polite');
                container.setAttribute('aria-atomic', 'false');
                container.setAttribute('aria-relevant', 'additions text');
                document.body.appendChild(container);
            }
            
            const el = document.createElement('div');
            el.className = 'alert-notification';
            el.setAttribute('role', 'status');
            el.style.borderLeftColor = alert.alertType.color;
            el.innerHTML = '<div class="alert-icon" style="color:' + _escHtml(alert.alertType.color) + '">' + _escHtml(alert.alertType.icon) + '</div>' +
                '<div class="alert-body"><div class="alert-title">' + _escHtml(alert.callsign) + '</div><div class="alert-message">' + _escHtml(alert.message) + '</div></div>' +
                '<button class="alert-close" aria-label="Dismiss alert">&times;</button>';
            
            const alertBody = el.querySelector('.alert-body');
            alertBody.setAttribute('role', 'button');
            alertBody.setAttribute('tabindex', '0');
            alertBody.setAttribute('aria-label', 'Open ' + alert.callsign + ' alert');
            const openAlertAircraft = () => {
                selectAircraft(alert.aircraft.hex);
                el.remove();
            };
            alertBody.addEventListener('click', openAlertAircraft);
            alertBody.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openAlertAircraft();
                }
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
