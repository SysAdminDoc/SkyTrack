    // ============ BROADCAST / JUMBOTRON MODE ============
    // A focused, keyboard-friendly presentation mode for public displays,
    // streams, and live briefings. The ranking helper stays pure so the
    // mode can be exercised without Leaflet or a browser window.
    function broadcastCandidates(aircraft, conflicts = [], now = Date.now()) {
        const conflictHexes = new Set();
        for (const conflict of Array.isArray(conflicts) ? conflicts : []) {
            if (conflict?.firstHex) conflictHexes.add(String(conflict.firstHex).toUpperCase());
            if (conflict?.secondHex) conflictHexes.add(String(conflict.secondHex).toUpperCase());
        }
        return Object.values(aircraft || {}).filter(ac => {
            if (!ac?.hex || !Number.isFinite(Number(ac.lat)) || !Number.isFinite(Number(ac.lon))) return false;
            if (Number.isFinite(ac.lastSeen) && now - ac.lastSeen > 180000) return false;
            const hex = String(ac.hex).toUpperCase();
            return ac.squawk === '7500' || ac.squawk === '7600' || ac.squawk === '7700' ||
                ac.isVIP || ac.militaryInfo || ac.militaryRangeInfo || ac.interesting ||
                ac.civilianInteresting || ac.piaInfo || conflictHexes.has(hex);
        }).map(ac => {
            const hex = String(ac.hex).toUpperCase();
            const reasons = [];
            let score = 0;
            if (['7500', '7600', '7700'].includes(String(ac.squawk))) {
                reasons.push('EMERGENCY ' + ac.squawk);
                score += 8;
            }
            if (ac.isVIP) { reasons.push('VIP'); score += 4; }
            if (ac.militaryInfo || ac.militaryRangeInfo) { reasons.push('MILITARY'); score += 3; }
            if (ac.interesting || ac.civilianInteresting || ac.piaInfo) { reasons.push('FLAGGED'); score += 2; }
            if (conflictHexes.has(hex)) { reasons.push('CPA CONFLICT'); score += 2; }
            return { ac, hex, score, reasons };
        }).sort((a, b) => b.score - a.score || String(a.ac.flight || a.hex).localeCompare(String(b.ac.flight || b.hex)));
    }

    const broadcastMode = {
        enabled: false,
        timer: null,
        intervalMs: 12000,
        currentHex: null,
        _bound: false,

        _overlay() { return document.getElementById('broadcastOverlay'); },

        _setButton() {
            const button = document.getElementById('broadcastBtn');
            button?.classList.toggle('active', this.enabled);
            button?.setAttribute('aria-pressed', String(this.enabled));
        },

        _candidates() {
            const cache = typeof aircraftCache !== 'undefined' ? aircraftCache : {};
            const conflicts = typeof cpaPrediction !== 'undefined' ? cpaPrediction.conflicts : [];
            return broadcastCandidates(cache, conflicts);
        },

        _bind() {
            if (this._bound) return;
            const overlay = this._overlay();
            if (!overlay) return;
            overlay.addEventListener('click', event => {
                const action = event.target.closest?.('[data-broadcast-action]')?.dataset.broadcastAction;
                if (action === 'next') this.next();
                if (action === 'inspect') {
                    if (this.currentHex && typeof selectAircraft === 'function') selectAircraft(this.currentHex);
                    this.stop();
                }
                if (action === 'close') this.stop();
            });
            this._bound = true;
        },

        _display(candidate) {
            const overlay = this._overlay();
            if (!overlay) return;
            const esc = value => typeof _escHtml === 'function' ? _escHtml(String(value ?? '')) : String(value ?? '');
            if (!candidate) {
                overlay.innerHTML = '<div class="broadcast-card broadcast-empty"><div class="broadcast-kicker">SKYTRACK LIVE</div><h1>No featured traffic</h1><p>Waiting for emergency, VIP, military, flagged, or CPA traffic.</p><button class="broadcast-control" data-broadcast-action="close">Exit broadcast mode</button></div>';
                return;
            }
            const ac = candidate.ac;
            const altitude = ac.alt_baro === 'ground' ? 'GROUND' : (Number.isFinite(Number(ac.alt_baro)) ? Math.round(Number(ac.alt_baro)).toLocaleString() + ' FT' : 'ALT N/A');
            const speed = Number.isFinite(Number(ac.gs)) ? Math.round(Number(ac.gs)) + ' KT' : 'SPEED N/A';
            const lat = Number(ac.lat).toFixed(2), lon = Number(ac.lon).toFixed(2);
            overlay.innerHTML = '<div class="broadcast-card">' +
                '<div class="broadcast-kicker">SKYTRACK LIVE · FEATURED EVENT</div>' +
                '<div class="broadcast-reason">' + esc(candidate.reasons.join(' · ')) + '</div>' +
                '<h1 class="broadcast-callsign">' + esc(ac.flight?.trim() || ac.hex) + '</h1>' +
                '<div class="broadcast-type">' + esc(ac.t || ac.desc || 'Aircraft') + '</div>' +
                '<div class="broadcast-metrics"><span><b>' + esc(altitude) + '</b><small>ALTITUDE</small></span><span><b>' + esc(speed) + '</b><small>GROUND SPEED</small></span><span><b>' + esc(lat + '°, ' + lon + '°') + '</b><small>POSITION</small></span></div>' +
                '<div class="broadcast-footer"><span>' + esc(ac.ownOp || ac.airlineName || 'Operator unavailable') + '</span><span>' + esc(ac.hex) + '</span></div>' +
                '<div class="broadcast-controls"><button class="broadcast-control" data-broadcast-action="next">Next event</button><button class="broadcast-control primary" data-broadcast-action="inspect">Inspect aircraft</button><button class="broadcast-control" data-broadcast-action="close">Exit</button></div>' +
                '</div>';
        },

        render() {
            const candidates = this._candidates();
            let index = candidates.findIndex(item => item.hex === this.currentHex);
            if (index < 0) index = 0;
            const candidate = candidates[index];
            this.currentHex = candidate?.hex || null;
            this._display(candidate);
        },

        next() {
            const candidates = this._candidates();
            if (!candidates.length) { this.currentHex = null; this._display(null); return; }
            const current = candidates.findIndex(item => item.hex === this.currentHex);
            this.currentHex = candidates[(current + 1 + candidates.length) % candidates.length].hex;
            this._display(candidates.find(item => item.hex === this.currentHex));
        },

        start() {
            this._bind();
            this.enabled = true;
            this.currentHex = null;
            document.body.classList.add('broadcast-mode');
            this._setButton();
            this._overlay()?.classList.add('show');
            this.render();
            clearInterval(this.timer);
            this.timer = setInterval(() => { if (this.enabled) this.next(); }, this.intervalMs);
            const requestFullscreen = document.documentElement?.requestFullscreen;
            if (typeof requestFullscreen === 'function') requestFullscreen.call(document.documentElement).catch(() => {});
        },

        stop() {
            this.enabled = false;
            clearInterval(this.timer);
            this.timer = null;
            document.body.classList.remove('broadcast-mode');
            this._overlay()?.classList.remove('show');
            this._setButton();
            if (document.fullscreenElement && typeof document.exitFullscreen === 'function') document.exitFullscreen().catch(() => {});
        },

        toggle() {
            if (this.enabled) this.stop();
            else this.start();
            return this.enabled;
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', event => {
            if (!broadcastMode.enabled) return;
            if (event.key === 'Escape') broadcastMode.stop();
            if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); broadcastMode.next(); }
        });
    }
