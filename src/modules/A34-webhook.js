    // ============ USER WEBHOOK POSTER ============
    function webhookUrl(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            if (typeof URL === 'function') {
                const url = new URL(raw);
                return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
            }
        } catch (_) { return ''; }
        return /^https?:\/\/[^\s]+$/i.test(raw) ? raw : '';
    }

    function webhookPayload(alert = {}, now = Date.now()) {
        const ac = alert.aircraft || {};
        return {
            source: 'skytrack',
            version: '0.25.0',
            type: String(alert.type || 'EVENT').toLowerCase(),
            message: String(alert.message || ''),
            callsign: alert.callsign || ac.flight?.trim() || ac.hex || '',
            hex: ac.hex || '',
            position: Number.isFinite(Number(ac.lat)) && Number.isFinite(Number(ac.lon)) ? { lat: Number(ac.lat), lon: Number(ac.lon) } : null,
            altitude: Number.isFinite(Number(ac.alt_baro)) ? Number(ac.alt_baro) : null,
            timestamp: new Date(now).toISOString()
        };
    }

    const webhookPoster = {
        url: '',
        enabled: false,
        init() {
            try { this.url = webhookUrl(localStorage.getItem('skytrack_webhook_url')); this.enabled = localStorage.getItem('skytrack_webhook_enabled') === '1'; } catch (_) {}
            const input = document.getElementById('webhookUrlInput');
            if (input) input.value = this.url;
            const toggle = document.getElementById('toggleWebhook');
            toggle?.classList.toggle('on', this.enabled);
            toggle?.setAttribute('aria-checked', String(this.enabled));
            document.getElementById('saveWebhookBtn')?.addEventListener('click', () => this.save(input?.value));
            toggle?.addEventListener('click', () => this.toggle());
        },
        save(value) {
            const next = webhookUrl(value);
            if (String(value || '').trim() && !next) { if (typeof toast === 'function') toast('Use a valid http(s) webhook URL', 'warning'); return false; }
            this.url = next;
            try { localStorage.setItem('skytrack_webhook_url', next); } catch (_) {}
            if (typeof toast === 'function') toast(next ? 'Webhook URL saved' : 'Webhook disabled');
            return true;
        },
        toggle() {
            this.enabled = !this.enabled;
            try { localStorage.setItem('skytrack_webhook_enabled', this.enabled ? '1' : '0'); } catch (_) {}
            document.getElementById('toggleWebhook')?.classList.toggle('on', this.enabled);
            document.getElementById('toggleWebhook')?.setAttribute('aria-checked', String(this.enabled));
            if (typeof toast === 'function') toast(this.enabled ? 'Webhook posting ON' : 'Webhook posting OFF');
            return this.enabled;
        },
        async post(alert) {
            if (!this.enabled || !this.url || typeof fetch !== 'function') return false;
            try {
                const response = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(webhookPayload(alert)) });
                return response.ok;
            } catch (_) { return false; }
        }
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => webhookPoster.init(), { once: true });
        else webhookPoster.init();
    }
