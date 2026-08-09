
    // ============ DEBUG HUD (?debug=1) ============
    // A compact, opt-in telemetry panel for support and performance work.
    // It is absent from normal sessions and never sends data anywhere.
    function debugHudRows(sources = [], breakers = {}) {
        const sourceRows = (Array.isArray(sources) ? sources : []).map(source => ({
            name: source?.name || source?.key || 'source',
            status: source?.status || 'unknown',
            latency: Number.isFinite(source?.latency) && source.latency < 9999 ? source.latency + 'ms' : '--',
            errors: Number(source?.errorCount) || 0
        }));
        const breakerRows = Object.entries(breakers || {}).map(([name, breaker]) => ({
            name,
            state: breaker?.state || 'unknown',
            failures: Number(breaker?.failures ?? breaker?.failureCount) || 0
        }));
        return { sourceRows, breakerRows };
    }

    const debugHud = {
        element: null,
        _raf: 0,
        _lastFrame: 0,
        _lastRender: 0,
        _frameDelta: 0,

        init() {
            if (!CONFIG.debug) return;
            this.element = document.getElementById('debugHud');
            if (!this.element || typeof requestAnimationFrame !== 'function') return;
            this.element.hidden = false;
            this._raf = requestAnimationFrame(ts => this.tick(ts));
        },

        tick(timestamp) {
            if (this._lastFrame) this._frameDelta = timestamp - this._lastFrame;
            this._lastFrame = timestamp;
            if (timestamp - this._lastRender >= 250) {
                this._lastRender = timestamp;
                this.render();
            }
            this._raf = requestAnimationFrame(ts => this.tick(ts));
        },

        render() {
            if (!this.element) return;
            const memory = performance.memory?.usedJSHeapSize;
            const sources = typeof dataSourceManager === 'object' ? dataSourceManager.sources : [];
            const breakers = typeof circuitBreakers === 'object' ? circuitBreakers : {};
            const rows = debugHudRows(sources, breakers);
            const sourceHtml = rows.sourceRows.map(row =>
                '<div class="debug-hud-row"><span>' + _escHtml(row.name) + '</span><span class="debug-hud-status ' + _escHtml(row.status) + '">' + _escHtml(row.status) + ' · ' + _escHtml(row.latency) + ' · e' + row.errors + '</span></div>'
            ).join('');
            const breakerHtml = rows.breakerRows.map(row =>
                '<div class="debug-hud-row"><span>' + _escHtml(row.name) + '</span><span class="debug-hud-status ' + _escHtml(row.state) + '">' + _escHtml(row.state) + ' · f' + row.failures + '</span></div>'
            ).join('');
            const count = typeof aircraftCache === 'object' ? Object.keys(aircraftCache).length : 0;
            this.element.innerHTML = '<div class="debug-hud-title">Debug telemetry</div>' +
                '<div class="debug-hud-metrics"><span>rAF ' + (this._frameDelta || 0).toFixed(1) + 'ms</span><span>AC ' + count + '</span><span>Heap ' + (Number.isFinite(memory) ? Math.round(memory / 1048576) + 'MB' : '--') + '</span></div>' +
                '<div class="debug-hud-subtitle">Sources</div>' + sourceHtml +
                '<div class="debug-hud-subtitle">Circuits</div>' + breakerHtml;
        }
    };

    document.addEventListener('DOMContentLoaded', () => debugHud.init(), { once: true });
