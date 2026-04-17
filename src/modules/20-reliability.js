
    // ============ CONNECTION MONITORING ============
    const connectionMonitor = {
        lastSuccess: Date.now(),
        consecutiveFailures: 0,
        status: 'online', // online, stale, offline
        
        recordSuccess() {
            this.lastSuccess = Date.now();
            this.consecutiveFailures = 0;
            this.updateStatus('online');
        },
        
        recordFailure() {
            this.consecutiveFailures++;
            const timeSinceSuccess = Date.now() - this.lastSuccess;
            
            if (this.consecutiveFailures >= 5 || timeSinceSuccess > 60000) {
                this.updateStatus('offline');
            } else if (timeSinceSuccess > 30000) {
                this.updateStatus('stale');
            }
        },
        
        updateStatus(status) {
            if (this.status === status) return;
            this.status = status;
            
            const statusEl = document.getElementById('connectionStatus');
            if (!statusEl) return;
            
            const dot = statusEl.querySelector('.status-dot');
            const text = statusEl.querySelector('.status-text');
            
            dot.className = 'status-dot ' + status;
            
            switch (status) {
                case 'online':
                    text.textContent = 'Live';
                    statusEl.title = 'Receiving live data';
                    break;
                case 'stale':
                    text.textContent = 'Delayed';
                    statusEl.title = 'Data may be delayed';
                    break;
                case 'offline':
                    text.textContent = 'Offline';
                    statusEl.title = 'Unable to connect to data source';
                    break;
            }
        }
    };

    // ============ PHASE 16: OFFLINE MODE MANAGER ============
    const offlineManager = {
        isOnline: navigator.onLine,
        lastOnlineTime: Date.now(),
        offlineData: null,
        syncQueue: [],
        
        init() {
            window.addEventListener('online', () => this.handleOnline());
            window.addEventListener('offline', () => this.handleOffline());
            
            if (!this.isOnline) {
                this.handleOffline();
            }
            
            setInterval(() => this.checkConnection(), 30000);
            this.loadCachedData();
            this.loadSyncQueue();
        },
        
        handleOnline() {
            this.isOnline = true;
            this.lastOnlineTime = Date.now();
            
            document.body.classList.remove('offline-mode');
            connectionMonitor.updateStatus('online');
            toast('Connection restored');
            
            this.processSyncQueue();
            
            if (typeof loadAircraft === 'function' && typeof map !== 'undefined' && map) {
                loadAircraft();
            }
        },
        
        handleOffline() {
            this.isOnline = false;
            
            document.body.classList.add('offline-mode');
            connectionMonitor.updateStatus('offline');
            toast('You are offline - showing cached data');
            
            this.showCachedPositions();
        },
        
        async checkConnection() {
            try {
                const response = await fetchWithProxy('https://api.adsb.one/v2/point/0/0/1', {}, true);

                if (response?.ok && !this.isOnline) {
                    this.handleOnline();
                }
            } catch (e) {
                if (this.isOnline && !navigator.onLine) {
                    this.handleOffline();
                }
            }
        },
        
        cachePositions() {
            if (!this.isOnline) return;
            
            const positions = {};
            Object.entries(aircraftCache).forEach(([hex, ac]) => {
                if (ac.lat !== undefined) {
                    positions[hex] = {
                        lat: ac.lat,
                        lon: ac.lon,
                        alt: ac.alt_baro,
                        track: ac.track,
                        gs: ac.gs,
                        flight: ac.flight,
                        r: ac.r,
                        t: ac.t,
                        timestamp: Date.now()
                    };
                }
            });
            
            this.offlineData = {
                positions,
                timestamp: Date.now(),
                mapCenter: map ? { lat: map.getCenter().lat, lng: map.getCenter().lng } : null,
                mapZoom: map ? map.getZoom() : 8
            };
            
            skytrackDB.saveDatabase('offlineCache', this.offlineData, 86400000).catch(e => {
                console.warn('Failed to save offline cache:', e);
            });
        },
        
        async loadCachedData() {
            try {
                this.offlineData = await skytrackDB.loadDatabase('offlineCache');
            } catch (e) {
                console.warn('Failed to load offline cache:', e);
            }
        },
        
        showCachedPositions() {
            if (!this.offlineData || !this.offlineData.positions) {
                toast('No cached data available');
                return;
            }
            
            const age = Date.now() - this.offlineData.timestamp;
            const ageMinutes = Math.round(age / 60000);
            
            toast('Showing data from ' + ageMinutes + ' minutes ago');
            
            Object.keys(markers).forEach(hex => {
                if (markers[hex] && map) {
                    map.removeLayer(markers[hex]);
                }
                delete markers[hex];
            });
            
            Object.entries(this.offlineData.positions).forEach(([hex, data]) => {
                aircraftCache[hex] = {
                    ...aircraftCache[hex],
                    ...data,
                    hex,
                    _cached: true,
                    lastSeen: data.timestamp
                };
            });
            
            if (typeof updateMarkers === 'function') {
                updateMarkers();
            }
            
            if (this.offlineData.mapCenter && map) {
                map.setView(
                    [this.offlineData.mapCenter.lat, this.offlineData.mapCenter.lng],
                    this.offlineData.mapZoom || 8
                );
            }
        },
        
        queueAction(action, description) {
            this.syncQueue.push({
                action,
                description,
                timestamp: Date.now()
            });
            
            localStorage.setItem('skytrack_sync_queue', JSON.stringify(
                this.syncQueue.map(item => ({ description: item.description, timestamp: item.timestamp }))
            ));
        },
        
        loadSyncQueue() {
            try {
                const saved = localStorage.getItem('skytrack_sync_queue');
                if (saved) {
                    const items = JSON.parse(saved);
                    _dbg('Loaded sync queue with', items.length, 'items');
                }
            } catch (e) {
                console.warn('Failed to load sync queue:', e);
            }
        },
        
        async processSyncQueue() {
            if (this.syncQueue.length === 0) return;
            
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.classList.add('show');
                syncIndicator.querySelector('.sync-text').textContent = 'Syncing ' + this.syncQueue.length + ' items...';
            }
            
            while (this.syncQueue.length > 0) {
                const item = this.syncQueue.shift();
                
                try {
                    if (typeof item.action === 'function') {
                        await item.action();
                    }
                } catch (e) {
                    console.warn('Failed to process queued action:', e);
                }
            }
            
            localStorage.removeItem('skytrack_sync_queue');
            
            if (syncIndicator) {
                syncIndicator.classList.remove('show');
            }
            
            toast('Sync complete');
        }
    };

    // ============ PHASE 16: ENHANCED DATA SOURCE MANAGER ============
    const dataSourceManager = {
        sources: [
            { key: 'adsbone', name: 'ADSB One', buildUrl: (c, r) => 'https://api.adsb.one/v2/point/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + r, parseResponse: d => d?.ac?.length ? d.ac : null, status: 'unknown', lastSuccess: 0, lastError: 0, errorCount: 0, latency: 0, priority: 1, cors: false },
            { key: 'adsblol', name: 'ADSB.lol', buildUrl: (c, r) => 'https://api.adsb.lol/v2/point/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4) + '/' + r, parseResponse: d => d?.ac?.length ? d.ac : null, status: 'unknown', lastSuccess: 0, lastError: 0, errorCount: 0, latency: 0, priority: 2, cors: false },
            { key: 'adsbfi', name: 'ADSB.fi', buildUrl: (c, r) => 'https://opendata.adsb.fi/api/v2/lat/' + c.lat.toFixed(4) + '/lon/' + c.lng.toFixed(4) + '/dist/' + r, parseResponse: d => d?.ac?.length ? d.ac : null, status: 'unknown', lastSuccess: 0, lastError: 0, errorCount: 0, latency: 0, priority: 3, cors: true }
        ],
        
        currentSource: null,
        healthCheckInterval: null,
        
        init() {
            this.healthCheckInterval = setInterval(() => this.checkAllSources(), 60000);
            setTimeout(() => this.checkAllSources(), 5000);
        },
        
        async checkAllSources() {
            for (const source of this.sources) {
                // On GitHub Pages, cors:false sources can't be direct-tested — let actual fetches determine health
                if (source.cors === false && location.hostname.includes('github.io')) { source.status = 'degraded'; source.latency = 9999; continue; }
                await this.checkSource(source);
            }
            
            this.sources.sort((a, b) => {
                if (a.status === 'healthy' && b.status !== 'healthy') return -1;
                if (b.status === 'healthy' && a.status !== 'healthy') return 1;
                if (a.latency !== b.latency) return a.latency - b.latency;
                return a.priority - b.priority;
            });
            
            this.updateUI();
        },
        
        async checkSource(source) {
            const startTime = Date.now();
            
            try {
                const testUrl = source.buildUrl({ lat: 40, lng: -74 }, 10);
                
                let response;
                if (source.cors !== false) { try { response = await fetch(testUrl, { method: 'GET', cache: 'no-cache', signal: AbortSignal.timeout(8000) }); } catch(e) { response = null; } }
                if (!response || !response.ok) { response = await fetchWithProxy(testUrl); if (!response) throw new Error('No proxy'); }
                
                source.latency = Date.now() - startTime;
                
                if (response.ok) {
                    source.status = 'healthy';
                    source.lastSuccess = Date.now();
                    source.errorCount = 0;
                } else {
                    throw new Error('HTTP ' + response.status);
                }
            } catch (e) {
                source.status = source.errorCount > 5 ? 'unhealthy' : 'degraded';
                source.lastError = Date.now();
                source.errorCount++;
                source.latency = 9999;
            }
        },
        
        getBestSource() {
            const healthy = this.sources.find(s => s.status === 'healthy');
            if (healthy) return healthy;
            
            const degraded = this.sources.find(s => s.status === 'degraded');
            if (degraded) return degraded;
            
            return this.sources[0];
        },
        
        getSourcesInOrder() {
            return [...this.sources].sort((a, b) => {
                if (a.status === 'healthy' && b.status !== 'healthy') return -1;
                if (b.status === 'healthy' && a.status !== 'healthy') return 1;
                if (a.latency !== b.latency) return a.latency - b.latency;
                return a.priority - b.priority;
            });
        },
        
        recordSuccess(source) {
            source.status = 'healthy';
            source.lastSuccess = Date.now();
            source.errorCount = 0;
            this.currentSource = source;
            this.updateUI();
        },
        
        recordFailure(source) {
            source.errorCount++;
            source.lastError = Date.now();
            if (source.errorCount > 3) {
                source.status = 'unhealthy';
            } else {
                source.status = 'degraded';
            }
            this.updateUI();
        },
        
        updateUI() {
            const indicator = document.getElementById('dataSourceIndicator');
            if (!indicator) return;
            
            const best = this.getBestSource();
            const healthy = this.sources.filter(s => s.status === 'healthy').length;
            
            indicator.innerHTML = '<span class="source-name">' + best.name + '</span>' +
                '<span class="source-status ' + best.status + '">' + healthy + '/' + this.sources.length + '</span>' +
                '<span class="source-latency">' + (best.latency < 9999 ? best.latency + 'ms' : '--') + '</span>';
        },
        
        getStats() {
            return this.sources.map(s => ({
                name: s.name,
                status: s.status,
                latency: s.latency,
                errorCount: s.errorCount,
                lastSuccess: s.lastSuccess ? new Date(s.lastSuccess).toISOString() : 'never'
            }));
        }
    };

    // ============ PHASE 16: AUTO-RETRY SYSTEM ============
    const retrySystem = {
        defaultConfig: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            retryOn: [408, 429, 500, 502, 503, 504]
        },
        
        async withRetry(fn, config = {}) {
            const options = { ...this.defaultConfig, ...config };
            let lastError;
            let delay = options.baseDelay;
            
            for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
                try {
                    return await fn();
                } catch (error) {
                    lastError = error;
                    
                    const shouldRetry = this.shouldRetry(error, options, attempt);
                    
                    if (!shouldRetry) {
                        throw error;
                    }
                    
                    _dbg('Retry attempt ' + (attempt + 1) + '/' + options.maxRetries + ' after ' + delay + 'ms');
                    
                    await new Promise(r => setTimeout(r, delay));
                    
                    delay = Math.min(
                        options.maxDelay,
                        delay * options.backoffMultiplier * (0.5 + Math.random())
                    );
                }
            }
            
            throw lastError;
        },
        
        shouldRetry(error, options, attempt) {
            if (attempt >= options.maxRetries) return false;
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                return true;
            }
            
            if (error.status && options.retryOn.includes(error.status)) {
                return true;
            }
            
            if (error.name === 'AbortError' || error.message.includes('timeout')) {
                return true;
            }
            
            return false;
        },
        
        async fetch(url, options = {}) {
            return this.withRetry(async () => {
                const response = await fetch(url, {
                    ...options,
                    signal: options.signal || AbortSignal.timeout(options.timeout || 10000)
                });
                
                if (!response.ok) {
                    const error = new Error('HTTP ' + response.status);
                    error.status = response.status;
                    throw error;
                }
                
                return response;
            }, options.retry);
        }
    };

    // ============ PHASE 16: ERROR RECOVERY SYSTEM ============
    const errorRecovery = {
        errorCounts: new Map(),
        recoveryActions: new Map(),
        
        init() {
            this.registerRecovery('data-load', this.recoverDataLoad.bind(this));
            this.registerRecovery('database', this.recoverDatabase.bind(this));
            this.registerRecovery('map', this.recoverMap.bind(this));
        },
        
        registerRecovery(type, action) {
            this.recoveryActions.set(type, action);
        },
        
        async handleError(type, error, context = {}) {
            const count = (this.errorCounts.get(type) || 0) + 1;
            this.errorCounts.set(type, count);
            
            errorHandler.log(type, error.message, count > 5 ? 'error' : 'warn');
            
            const recovery = this.recoveryActions.get(type);
            if (recovery && count <= 3) {
                try {
                    await recovery(error, context);
                    this.errorCounts.set(type, 0);
                    return true;
                } catch (recoveryError) {
                    console.error('Recovery failed:', recoveryError);
                }
            }
            
            if (count === 3) {
                toast('Having trouble with ' + type + '. Will keep trying...');
            } else if (count === 10) {
                toast('Persistent ' + type + ' issues. Check your connection.');
            }
            
            return false;
        },
        
        async recoverDataLoad(error, context) {
            _dbg('Attempting data load recovery...');
            
            const nextSource = dataSourceManager.sources.find(s => 
                s.name !== dataSourceManager.currentSource?.name && s.status !== 'unhealthy'
            );
            
            if (nextSource) {
                toast('Switching to ' + nextSource.name + '...');
                return true;
            }
            
            offlineManager.showCachedPositions();
            return false;
        },
        
        async recoverDatabase(error, context) {
            _dbg('Attempting database recovery...');
            
            try {
                await skytrackDB.init();
                toast('Database reconnected');
                return true;
            } catch (e) {
                _dbg('Falling back to localStorage');
                return false;
            }
        },
        
        async recoverMap(error, context) {
            _dbg('Attempting map recovery...');
            
            if (map) {
                map.invalidateSize();
                
                map.eachLayer(layer => {
                    if (layer._url && typeof layer.redraw === 'function') {
                        layer.redraw();
                    }
                });
            }
            
            return true;
        },
        
        resetCounts() {
            this.errorCounts.clear();
        }
    };

    // ============ PHASE 16: CIRCUIT BREAKER ============
    class CircuitBreaker {
        constructor(options = {}) {
            this.name = options.name || 'unnamed';
            this.failureThreshold = options.failureThreshold || 5;
            this.resetTimeout = options.resetTimeout || 30000;
            this.monitorInterval = options.monitorInterval || 10000;
            
            this.state = 'closed';
            this.failures = 0;
            this.lastFailure = 0;
            this.successCount = 0;
        }
        
        async execute(fn) {
            if (this.state === 'open') {
                if (Date.now() - this.lastFailure > this.resetTimeout) {
                    this.state = 'half-open';
                    _dbg('Circuit breaker ' + this.name + ' half-open');
                } else {
                    const error = new Error('Circuit breaker ' + this.name + ' is open');
                    error.circuitBreakerOpen = true;
                    throw error;
                }
            }
            
            try {
                const result = await fn();
                this.onSuccess();
                return result;
            } catch (error) {
                this.onFailure();
                throw error;
            }
        }
        
        onSuccess() {
            this.failures = 0;
            
            if (this.state === 'half-open') {
                this.successCount++;
                if (this.successCount >= 3) {
                    this.state = 'closed';
                    this.successCount = 0;
                    _dbg('Circuit breaker ' + this.name + ' closed');
                    this.hideWarning();
                }
            }
        }
        
        onFailure() {
            this.failures++;
            this.lastFailure = Date.now();
            this.successCount = 0;
            
            if (this.failures >= this.failureThreshold) {
                this.state = 'open';
                _dbg('Circuit breaker ' + this.name + ' opened');
                this.showWarning();
            }
        }
        
        showWarning() {
            // Disabled per user request - don't show retry popup
            // const warning = document.getElementById('circuitBreakerWarning');
            // if (warning) {
            //     warning.textContent = 'Data source temporarily unavailable - retrying...';
            //     warning.classList.add('show');
            // }
        }
        
        hideWarning() {
            const warning = document.getElementById('circuitBreakerWarning');
            if (warning) {
                warning.classList.remove('show');
            }
        }
        
        getState() {
            return {
                name: this.name,
                state: this.state,
                failures: this.failures,
                lastFailure: this.lastFailure
            };
        }
    }

    const circuitBreakers = {
        aircraft: new CircuitBreaker({ name: 'aircraft', failureThreshold: 5, resetTimeout: 30000 }),
        weather: new CircuitBreaker({ name: 'weather', failureThreshold: 3, resetTimeout: 60000 }),
        database: new CircuitBreaker({ name: 'database', failureThreshold: 10, resetTimeout: 120000 })
    };

    // Reset error counts periodically
    setInterval(() => errorRecovery.resetCounts(), 300000);

