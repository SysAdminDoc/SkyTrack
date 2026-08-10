    // ============ STREAMER / CHROMA-KEY OVERLAY ============
    function streamerStatus(aircraft = {}) {
        const values = Object.values(aircraft || {});
        const notable = values.filter(ac => ac.isVIP || ac.interesting || ac.militaryInfo || ac.militaryRangeInfo).length;
        return { total: values.length, notable, updated: Date.now() };
    }

    const streamerOverlay = {
        enabled: false,
        panel: null,
        init() {
            const params = new URLSearchParams(location.search);
            if (params.get('streamer') === '1') this.toggle(true);
            document.getElementById('streamerBtn')?.addEventListener('click', () => this.toggle());
        },
        toggle(force) {
            this.enabled = typeof force === 'boolean' ? force : !this.enabled;
            document.body.classList.toggle('streamer', this.enabled);
            document.getElementById('streamerBtn')?.classList.toggle('active', this.enabled);
            if (this.enabled) this._ensurePanel();
            else this.panel?.remove();
            return this.enabled;
        },
        _ensurePanel() {
            if (this.panel) return;
            this.panel = document.createElement('div');
            this.panel.className = 'streamer-status';
            this.panel.setAttribute('aria-live', 'polite');
            document.body.appendChild(this.panel);
        },
        update(aircraft) {
            if (!this.enabled) return;
            this._ensurePanel();
            const status = streamerStatus(aircraft);
            this.panel.textContent = 'SKYTRACK LIVE · ' + status.total + ' aircraft · ' + status.notable + ' notable';
        }
    };

    if (typeof document !== 'undefined') streamerOverlay.init();
