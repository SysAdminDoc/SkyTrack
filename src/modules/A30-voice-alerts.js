    // ============ VOICE ALERTS ============
    function voiceAlertText(alert = {}) {
        const callsign = alert.callsign || alert.aircraft?.flight?.trim() || alert.aircraft?.hex || 'aircraft';
        const message = String(alert.message || 'notable traffic event').replace(/\b(7500|7600|7700)\b/g, (_, code) => code.split('').join(' '));
        return 'SkyTrack alert. ' + callsign + '. ' + message;
    }

    const voiceAlerts = {
        enabled: false,
        unlocked: false,
        init() {
            try { this.enabled = localStorage.getItem('skytrack_voice_alerts') === '1'; } catch (_) {}
            const button = document.getElementById('toggleVoiceAlerts');
            button?.classList.toggle('on', this.enabled);
            button?.setAttribute('aria-checked', String(this.enabled));
            button?.addEventListener('click', () => this.toggle());
        },
        toggle() {
            this.enabled = !this.enabled;
            this.unlocked = true;
            try { localStorage.setItem('skytrack_voice_alerts', this.enabled ? '1' : '0'); } catch (_) {}
            const button = document.getElementById('toggleVoiceAlerts');
            button?.classList.toggle('on', this.enabled);
            button?.setAttribute('aria-checked', String(this.enabled));
            if (this.enabled && typeof speechSynthesis === 'undefined') {
                this.enabled = false;
                if (typeof toast === 'function') toast('Speech synthesis is not supported', 'warning');
            } else if (typeof toast === 'function') toast(this.enabled ? 'Voice alerts ON' : 'Voice alerts OFF');
            return this.enabled;
        },
        speak(alert) {
            if (!this.enabled || !this.unlocked || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false;
            try {
                speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(voiceAlertText(alert));
                utterance.rate = 1.05;
                utterance.volume = 0.72;
                speechSynthesis.speak(utterance);
                return true;
            } catch (_) { return false; }
        }
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => voiceAlerts.init(), { once: true });
        else voiceAlerts.init();
    }
