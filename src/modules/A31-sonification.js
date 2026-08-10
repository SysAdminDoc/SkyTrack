    // ============ AMBIENT SONIFICATION ============
    function sonificationNote(ac = {}, center = { lat: 0, lon: 0 }) {
        const altitude = Math.max(0, Math.min(50000, Number(ac.alt_baro) || 0));
        const speed = Math.max(0, Number(ac.gs) || 0);
        const frequency = 180 + altitude / 50000 * 620 + Math.min(120, speed / 5);
        const longitudeDelta = (Number(ac.lon) || 0) - (Number(center.lon) || 0);
        const pan = Math.max(-1, Math.min(1, longitudeDelta * Math.max(0.25, Math.cos((Number(center.lat) || 0) * Math.PI / 180)) / 45));
        const gain = Math.max(0.008, Math.min(0.055, 0.05 / (1 + Math.abs(Number(ac.lat || 0) - Number(center.lat || 0)) / 8)));
        return { frequency, pan, gain };
    }

    const sonification = {
        map: null,
        enabled: false,
        blipsEnabled: false,
        tones: new Map(),
        previousVisible: new Set(),
        lastBlip: 0,
        init() {
            document.getElementById('sonificationBtn')?.addEventListener('click', () => this.toggle());
            document.getElementById('blipsBtn')?.addEventListener('click', () => this.toggleBlips());
        },
        _setButtons() {
            document.getElementById('sonificationBtn')?.classList.toggle('active', this.enabled);
            document.getElementById('blipsBtn')?.classList.toggle('active', this.blipsEnabled);
        },
        toggle() {
            this.enabled = !this.enabled;
            this._setButtons();
            if (!this.enabled) this._stopAll();
            else {
                try { _sharedAudio()?.resume?.(); } catch (_) {}
                if (typeof toast === 'function') toast('Ambient sonification ON · up to 12 nearest aircraft');
            }
            return this.enabled;
        },
        toggleBlips() {
            this.blipsEnabled = !this.blipsEnabled;
            this._setButtons();
            if (typeof toast === 'function') toast(this.blipsEnabled ? 'Viewport blips ON' : 'Viewport blips OFF');
            return this.blipsEnabled;
        },
        _stopAll() {
            for (const tone of this.tones.values()) { try { tone.osc.stop(); } catch (_) {} try { tone.gain.disconnect(); } catch (_) {} }
            this.tones.clear();
        },
        _blip() {
            const ctx = _sharedAudio();
            if (!ctx) return;
            try {
                const osc = ctx.createOscillator(), gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
                osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.12);
            } catch (_) {}
        },
        update(aircraft) {
            if (!this.enabled && !this.blipsEnabled) return;
            const bounds = this.map?.getBounds?.();
            const visible = Object.values(aircraft || {}).filter(ac => ac?.hex && Number.isFinite(Number(ac.lat)) && Number.isFinite(Number(ac.lon)) && (!bounds || bounds.contains([Number(ac.lat), Number(ac.lon)]))).sort((a, b) => (Number(a.alt_baro) || 0) - (Number(b.alt_baro) || 0));
            const active = new Set(visible.slice(0, 12).map(ac => ac.hex));
            if (this.blipsEnabled && Date.now() - this.lastBlip > 4000 && [...active].some(hex => !this.previousVisible.has(hex))) { this._blip(); this.lastBlip = Date.now(); }
            this.previousVisible = active;
            if (!this.enabled) return;
            const center = this.map?.getCenter?.() || { lat: 0, lng: 0 };
            for (const ac of visible.slice(0, 12)) {
                const note = sonificationNote(ac, { lat: center.lat, lon: center.lng });
                let tone = this.tones.get(ac.hex);
                if (!tone) {
                    const ctx = _sharedAudio(); if (!ctx) return;
                    try {
                        const osc = ctx.createOscillator(), gain = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
                        osc.type = 'sine'; osc.connect(gain); if (pan) { gain.connect(pan); pan.connect(ctx.destination); } else gain.connect(ctx.destination);
                        gain.gain.setValueAtTime(0, ctx.currentTime); osc.start(); tone = { osc, gain, pan }; this.tones.set(ac.hex, tone);
                    } catch (_) { return; }
                }
                const ctx = tone.osc.context;
                tone.osc.frequency.setTargetAtTime(note.frequency, ctx.currentTime, 0.12);
                tone.gain.gain.setTargetAtTime(note.gain, ctx.currentTime, 0.18);
                tone.pan?.pan.setTargetAtTime(note.pan, ctx.currentTime, 0.18);
            }
            for (const [hex, tone] of this.tones) if (!active.has(hex)) { try { tone.osc.stop(); } catch (_) {} this.tones.delete(hex); }
        }
    };

    if (typeof document !== 'undefined') {
        sonification.init();
        document.addEventListener('skytrack:map-ready', event => { sonification.map = event.detail?.map || null; }, { once: true });
    }
