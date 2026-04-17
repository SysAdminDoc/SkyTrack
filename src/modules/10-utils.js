
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
