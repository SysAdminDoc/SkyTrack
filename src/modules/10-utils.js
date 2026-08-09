
    // ============ DEBUG LOGGING ============
    // Guarded debug logger. Only emits when ?debug is present. Failing silently if
    // console is unavailable. NOTE: previously this function called itself,
    // causing infinite recursion (stack overflow) when debug was enabled.
    function _dbg() {
        if (!CONFIG.debug) return;
        try {
            if (typeof console !== 'undefined' && console.log) {
                console.log.apply(console, ['[SkyTrack]'].concat(Array.prototype.slice.call(arguments)));
            }
        } catch (_) { /* ignore logging failures */ }
    }

    // Small HTML escape helper for interpolating live feed / user-supplied
    // strings into innerHTML. ADS-B payloads and user-entered watchlist names
    // should not be trusted to be plain text.
    function _escHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ============ ERROR HANDLING UTILITY ============
    const errorHandler = {
        errors: [],
        maxErrors: 50,

        log(context, error, severity = 'warn') {
            const entry = {
                time: Date.now(),
                context,
                message: error?.message || String(error),
                severity
            };

            this.errors.unshift(entry);
            if (this.errors.length > this.maxErrors) {
                this.errors.pop();
            }

            if (severity === 'error') {
                console.error(`[SkyTrack ${context}]`, error);
            } else {
                console.warn(`[SkyTrack ${context}]`, error);
            }

            // Update error indicator if visible
            this.updateIndicator();
        },

        updateIndicator() {
            const indicator = document.getElementById('errorIndicator');
            const recentErrors = this.errors.filter(e => Date.now() - e.time < 60000);

            if (indicator) {
                if (recentErrors.length > 0) {
                    indicator.style.display = 'flex';
                    indicator.querySelector('.error-count').textContent = recentErrors.length;
                    indicator.title = recentErrors[0].message;
                } else {
                    indicator.style.display = 'none';
                }
            }
        },

        getRecent(count = 10) {
            return this.errors.slice(0, count);
        },

        clear() {
            this.errors = [];
            this.updateIndicator();
        },

        // Wrapper for async operations with retry
        async withRetry(fn, context, maxRetries = 3, delay = 1000) {
            let lastError;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await fn();
                } catch (error) {
                    lastError = error;
                    this.log(context, `Attempt ${i + 1}/${maxRetries} failed: ${error.message}`, 'warn');
                    if (i < maxRetries - 1) {
                        await new Promise(r => setTimeout(r, delay * (i + 1)));
                    }
                }
            }
            this.log(context, `All ${maxRetries} attempts failed`, 'error');
            throw lastError;
        },

        // Wrapper for fetch with timeout
        async fetchWithTimeout(url, options = {}, timeout = 10000) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after ${timeout}ms`);
                }
                throw error;
            }
        }
    };

    // ============ MULTI-TAB COORDINATION ============
    // Two SkyTrack tabs open in the same browser would each hit every
    // ADS-B endpoint on their own 6-second cadence — doubling traffic
    // and wasting quota against the free aggregators. This helper
    // elects a leader tab based on `performance.timeOrigin` (oldest
    // wins, stable across reloads within the session). Non-leader
    // tabs get `tabLeader.isLeader === false` and can throttle, skip
    // the network loop, or read from IDB-mirrored state instead.
    //
    // BroadcastChannel is widely supported (Chrome, FF, Safari 15.4+).
    // When it's missing we just declare ourselves the leader and move
    // on — single-tab behaviour is unchanged.
    const tabLeader = {
        channelName: 'skytrack-tab-coord',
        myId: (typeof performance === 'object' && performance.timeOrigin)
            ? performance.timeOrigin + '-' + Math.random().toString(36).slice(2, 8)
            : Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        isLeader: true,
        _chan: null,
        _peers: new Map(),   // peerId → timeOrigin
        _onChange: null,
        _onSnapshot: null,
        _lastSnapshotAt: 0,

        init(options = {}) {
            this._onChange = typeof options === 'function' ? options : options.onLeaderChange || options.onChange || null;
            this._onSnapshot = typeof options === 'object' ? options.onSnapshot || null : null;
            if (typeof BroadcastChannel !== 'function') return;
            try {
                this._chan = new BroadcastChannel(this.channelName);
            } catch (_) { return; }
            this._chan.onmessage = (evt) => {
                const m = evt?.data;
                if (!m || typeof m !== 'object') return;
                if (m.type === 'hello' && m.id && m.id !== this.myId) {
                    this._peers.set(m.id, m.timeOrigin || 0);
                    this._chan.postMessage({ type: 'present', id: this.myId, timeOrigin: performance.timeOrigin || 0 });
                    this._recompute();
                    if (this.isLeader && this._lastSnapshotAt) this._chan.postMessage({ type: 'data-updated', timestamp: this._lastSnapshotAt });
                } else if (m.type === 'present' && m.id && m.id !== this.myId) {
                    this._peers.set(m.id, m.timeOrigin || 0);
                    this._recompute();
                } else if (m.type === 'bye' && m.id) {
                    this._peers.delete(m.id);
                    this._recompute();
                } else if (m.type === 'data-updated' && !this.isLeader) {
                    this.syncFromStore(m.timestamp);
                } else if (m.type === 'sync-request' && this.isLeader && this._lastSnapshotAt) {
                    this._chan.postMessage({ type: 'data-updated', timestamp: this._lastSnapshotAt });
                }
            };
            this._chan.postMessage({ type: 'hello', id: this.myId, timeOrigin: performance.timeOrigin || 0 });
            this._chan.postMessage({ type: 'sync-request', id: this.myId });
            window.addEventListener('pagehide', () => {
                try { this._chan?.postMessage({ type: 'bye', id: this.myId }); } catch (_) {}
                try { this._chan?.close(); } catch (_) {}
            });
        },

        _recompute() {
            // Leader = smallest timeOrigin across self + peers.
            const myOrigin = (typeof performance === 'object' && performance.timeOrigin) || 0;
            let minOrigin = myOrigin;
            for (const origin of this._peers.values()) {
                if (origin && origin < minOrigin) minOrigin = origin;
            }
            const newLeader = myOrigin <= minOrigin;
            if (newLeader !== this.isLeader) {
                this.isLeader = newLeader;
                if (typeof this._onChange === 'function') {
                    try { this._onChange(this.isLeader); } catch (_) {}
                }
            }
        },

        async publishSnapshot(snapshot) {
            if (!this.isLeader || !snapshot) return false;
            const payload = { timestamp: Date.now(), ac: snapshot };
            try {
                if (typeof skytrackDB === 'object' && skytrackDB?.saveDatabase) {
                    await skytrackDB.saveDatabase('liveAircraft', payload, 15000);
                }
            } catch (_) {
                return false;
            }
            this._lastSnapshotAt = payload.timestamp;
            try { this._chan?.postMessage({ type: 'data-updated', timestamp: payload.timestamp }); } catch (_) {}
            return true;
        },

        async syncFromStore(minTimestamp = 0) {
            if (this.isLeader || typeof skytrackDB !== 'object' || !skytrackDB?.loadDatabase) return false;
            try {
                const payload = await skytrackDB.loadDatabase('liveAircraft');
                if (!payload?.ac || !Number.isFinite(payload.timestamp) || payload.timestamp <= this._lastSnapshotAt || payload.timestamp < Number(minTimestamp || 0)) return false;
                this._lastSnapshotAt = payload.timestamp;
                if (typeof this._onSnapshot === 'function') this._onSnapshot(payload);
                return true;
            } catch (_) {
                return false;
            }
        }
    };

    // ============ SHARED AUDIO CONTEXT ============
    // Browsers cap the number of concurrent AudioContexts (Chromium ≈ 6 —
    // after that, new `new AudioContext()` calls silently fail and all
    // subsequent alert chimes go quiet). Every module that wants to emit a
    // short beep should route through this lazy singleton so we only ever
    // hold one. Returns `null` when the platform doesn't support Web Audio
    // or the user agent refused to create the context (Safari, iOS without
    // prior gesture).
    let _sharedAudioCtx = null;
    function _sharedAudio() {
        if (_sharedAudioCtx) return _sharedAudioCtx;
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            _sharedAudioCtx = new Ctor();
            return _sharedAudioCtx;
        } catch (_) {
            return null;
        }
    }

    // ============ PERFORMANCE UTILITIES ============
    const perfUtils = {
        // Throttle function - limits how often a function can be called
        throttle(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        // Debounce function - delays execution until after wait period
        debounce(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },

        // Request animation frame throttle
        rafThrottle(func) {
            let ticking = false;
            return function(...args) {
                if (!ticking) {
                    requestAnimationFrame(() => {
                        func.apply(this, args);
                        ticking = false;
                    });
                    ticking = true;
                }
            };
        },

        // Check if tab is visible
        isTabVisible() {
            return document.visibilityState === 'visible';
        }
    };

    // Pause updates when tab is not visible
    let _fetchIntervalId = null;
    let _tabPaused = false;
    const _pausableIntervals = []; // {id, fn, ms, name}
    function _setPausableInterval(fn, ms, name) {
        const entry = { id: setInterval(fn, ms), fn, ms, name: name || '' };
        _pausableIntervals.push(entry);
        return entry;
    }
    function _pauseAllIntervals() {
        _pausableIntervals.forEach(entry => { if (entry.id) { clearInterval(entry.id); entry.id = null; } });
    }
    function _resumeAllIntervals() {
        _pausableIntervals.forEach(entry => { if (!entry.id) { entry.id = setInterval(entry.fn, entry.ms); } });
    }
    function _startFetchInterval() {
        if (_fetchIntervalId) return;
        _fetchIntervalId = setInterval(loadAircraft, CONFIG.refreshInterval);
    }
    function _stopFetchInterval() {
        if (_fetchIntervalId) { clearInterval(_fetchIntervalId); _fetchIntervalId = null; }
    }
    document.addEventListener('visibilitychange', () => {
        if (perfUtils.isTabVisible()) {
            _dbg('Tab visible - resuming updates');
            _tabPaused = false;
            _resumeAllIntervals();
            if (map) {
                _startFetchInterval();
                if (Date.now() - lastFetchTime > CONFIG.refreshInterval * 1.5) loadAircraft();
            }
        } else {
            _dbg('Tab hidden - pausing all intervals');
            _tabPaused = true;
            _stopFetchInterval();
            _pauseAllIntervals();
        }
    });
