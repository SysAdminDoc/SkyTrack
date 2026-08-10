    // ============ OFFLINE CONTINENTAL DEMO / KIOSK MODE ============
    // The demo bundle is deterministic so the generated single-file build
    // remains self-contained and produces the same 24-hour replay on every
    // device. It is intentionally synthetic and clearly labeled as such.
    const DEMO_FRAME_COUNT = 96;
    const DEMO_AIRCRAFT_COUNT = 900;

    function demoFrameAt(frameIndex, count = DEMO_AIRCRAFT_COUNT) {
        const frame = ((Number(frameIndex) || 0) % DEMO_FRAME_COUNT + DEMO_FRAME_COUNT) % DEMO_FRAME_COUNT;
        const phase = frame / DEMO_FRAME_COUNT;
        const aircraft = [];
        for (let i = 0; i < Math.max(1, Math.floor(Number(count) || 1)); i++) {
            const lane = i % 18;
            const route = i % 6;
            const direction = route % 2 ? -1 : 1;
            const progress = (i * 0.037 + phase * direction + route * 0.11) % 1;
            const wobble = Math.sin((i + 1) * 0.71 + frame * 0.08) * 0.7;
            const lat = 35 + lane * 1.45 + Math.sin(progress * Math.PI * 2 + route) * 3.2 + wobble;
            const lon = -10 + progress * 58 + Math.sin(i * 0.17 + route) * 2.2;
            const altitude = 4000 + ((i * 173 + frame * 611) % 36000);
            const track = direction > 0 ? 65 + route * 12 : 245 + route * 9;
            const type = i % 29 === 0 ? 'B738' : i % 17 === 0 ? 'A359' : i % 13 === 0 ? 'B77W' : 'A320';
            aircraft.push({
                hex: 'D' + String(i).padStart(5, '0'),
                flight: 'DEMO' + String(100 + i).slice(-3),
                lat: Math.max(30, Math.min(65, lat)),
                lon: Math.max(-15, Math.min(65, lon)),
                alt_baro: altitude,
                gs: 390 + (i % 80),
                track,
                category: 'A' + (i % 4),
                t: type,
                from: ['EGLL', 'LFPG', 'EDDF', 'EHAM', 'LEMD', 'LIRF'][route],
                to: ['UUEE', 'LOWW', 'LSZH', 'EKCH', 'LPPT', 'GCTS'][(route + 2) % 6]
            });
        }
        return aircraft;
    }

    const demoMode = {
        enabled: false,
        frame: 0,
        timer: null,
        map: null,
        intervalMs: 6000,
        init(map) {
            this.map = map;
            document.getElementById('demoModeBtn')?.addEventListener('click', () => this.toggle());
            if (new URLSearchParams(location.search).get('demo') === '1') this.start();
        },
        toggle() { return this.enabled ? this.stop() : this.start(); },
        start() {
            if (!this.map) { if (typeof toast === 'function') toast('Demo mode is waiting for the map', 'warning'); return false; }
            this.enabled = true;
            this.frame = 0;
            document.body.classList.add('demo-mode');
            document.getElementById('demoModeBtn')?.classList.add('active');
            this.map.setView([50, 10], 5, { animate: false });
            this._clearAircraft();
            this.tick();
            if (this.timer) clearInterval(this.timer);
            this.timer = setInterval(() => this.tick(), this.intervalMs);
            if (typeof toast === 'function') toast('Offline demo ON · 24-hour continental replay');
            return true;
        },
        stop() {
            this.enabled = false;
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
            document.body.classList.remove('demo-mode');
            document.getElementById('demoModeBtn')?.classList.remove('active');
            this._clearAircraft();
            if (typeof updateMarkersSync === 'function') updateMarkersSync();
            if (typeof loadAircraft === 'function') loadAircraft();
            if (typeof toast === 'function') toast('Offline demo OFF · live sources resumed');
            return false;
        },
        tick() {
            if (!this.enabled || typeof processAircraftData !== 'function') return;
            processAircraftData(demoFrameAt(this.frame));
            this.frame = (this.frame + 1) % DEMO_FRAME_COUNT;
            const source = document.getElementById('dataSource');
            if (source) source.textContent = 'Offline Demo · T+' + String(Math.floor(this.frame / 4)).padStart(2, '0') + ':00 · 900 synthetic aircraft';
        },
        _clearAircraft() {
            if (typeof aircraftCache === 'undefined') return;
            Object.keys(markers || {}).forEach(hex => {
                try { if (markers[hex] && this.map) this.map.removeLayer(markers[hex]); } catch (_) {}
                delete markers[hex];
            });
            Object.keys(aircraftCache).forEach(hex => delete aircraftCache[hex]);
        }
    };

    if (typeof document !== 'undefined') {
        document.addEventListener('skytrack:map-ready', event => demoMode.init(event.detail?.map), { once: true });
    }
