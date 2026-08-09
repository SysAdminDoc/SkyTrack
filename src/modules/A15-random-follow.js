
    // ============ RANDOM FOLLOW / KIOSK MODE ============
    function randomFollowCandidates(aircraftMap, selectedHex, now = Date.now(), filterFn) {
        return Object.values(aircraftMap || {}).filter(ac => {
            if (!ac?.hex || ac.lat === undefined || ac.lon === undefined) return false;
            if (Number.isFinite(ac.lastSeen) && now - ac.lastSeen > 120000) return false;
            if (typeof filterFn === 'function' && !filterFn(ac)) return false;
            return true;
        }).sort((a, b) => {
            const aSelected = a.hex === selectedHex ? 1 : 0;
            const bSelected = b.hex === selectedHex ? 1 : 0;
            return aSelected - bSelected;
        });
    }

    const randomFollow = {
        enabled: false,
        intervalMs: 15000,
        timer: null,
        _lastHex: null,

        _button() {
            return document.getElementById('randomFollowBtn');
        },

        _setButton() {
            const button = this._button();
            button?.classList.toggle('active', this.enabled);
            button?.setAttribute('aria-pressed', String(this.enabled));
        },

        _pick() {
            const filterFn = typeof searchSystem !== 'undefined' && searchSystem.passesFilters
                ? ac => searchSystem.passesFilters(ac)
                : null;
            const candidates = randomFollowCandidates(aircraftCache, selectedHex, Date.now(), filterFn);
            if (!candidates.length) {
                toast('No fresh aircraft available for Random Follow', 'warning');
                return false;
            }
            const pool = candidates.length > 1 ? candidates.filter(ac => ac.hex !== this._lastHex) : candidates;
            const chosen = pool[Math.floor(Math.random() * pool.length)] || candidates[0];
            this._lastHex = chosen.hex;
            selectAircraft(chosen.hex);
            if (typeof map !== 'undefined' && map && !accessibility.prefersReducedMotion()) {
                map.panTo([chosen.lat, chosen.lon], { animate: true, duration: 0.5 });
            } else if (typeof map !== 'undefined' && map) {
                map.panTo([chosen.lat, chosen.lon], { animate: false });
            }
            return true;
        },

        start() {
            if (this.timer) clearInterval(this.timer);
            this.enabled = true;
            this._setButton();
            this._pick();
            this.timer = setInterval(() => { if (this.enabled) this._pick(); }, this.intervalMs);
        },

        stop() {
            this.enabled = false;
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
            this._setButton();
        },

        toggle() {
            if (this.enabled) this.stop();
            else this.start();
            toast(this.enabled ? 'Random Follow ON · cycling every 15s' : 'Random Follow OFF');
            return this.enabled;
        }
    };
