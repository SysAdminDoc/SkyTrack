    // ============ ALERT EVENT TICKER ============
    function eventTickerText(alert = {}) {
        const type = String(alert.type || 'EVENT').toUpperCase();
        const callsign = alert.callsign || alert.aircraft?.flight?.trim() || alert.aircraft?.hex || 'Traffic';
        return type + ' · ' + callsign + ' · ' + (alert.message || 'Notable traffic event');
    }

    const eventTicker = {
        enabled: true,
        visible: false,
        events: [],
        maxEvents: 12,
        _bound: false,
        init() {
            if (this._bound) return;
            document.getElementById('eventTickerClose')?.addEventListener('click', () => this.close());
            document.getElementById('eventTickerToggleBtn')?.addEventListener('click', () => this.toggle());
            this._bound = true;
        },
        record(alert) {
            if (!this.enabled) return;
            const item = { text: eventTickerText(alert), time: Date.now() };
            if (this.events[0]?.text === item.text && item.time - this.events[0].time < 5000) return;
            this.events.unshift(item);
            this.events = this.events.slice(0, this.maxEvents);
            this.visible = true;
            this.render();
        },
        close() {
            this.visible = false;
            this.render();
        },
        toggle() {
            this.visible = !this.visible;
            this.render();
            return this.visible;
        },
        render() {
            const ticker = document.getElementById('eventTicker');
            if (!ticker) return;
            ticker.classList.toggle('show', this.visible && this.events.length > 0);
            document.getElementById('eventTickerTrack').textContent = this.events.map(item => item.text).join('   ·   ');
            const button = document.getElementById('eventTickerToggleBtn');
            button?.classList.toggle('active', this.visible);
            button?.setAttribute('aria-pressed', String(this.visible));
        }
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => eventTicker.init(), { once: true });
        else eventTicker.init();
    }
