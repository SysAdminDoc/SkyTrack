    // ============ AIRPORT DAY-IN-THE-LIFE REPLAY ============
    function replayDistanceNm(first, second) {
        const radians = Math.PI / 180;
        const lat1 = Number(first.lat) * radians, lat2 = Number(second.lat) * radians;
        const dLat = lat2 - lat1, dLon = (Number(second.lon) - Number(first.lon)) * radians;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    }

    function airportReplayFrames(aircraft, airport, radiusNm = 40, bucketMs = 1800000, now = Date.now()) {
        if (!airport || !Number.isFinite(Number(airport.lat)) || !Number.isFinite(Number(airport.lon))) return [];
        const frames = new Map();
        for (const ac of Object.values(aircraft || {})) {
            const samples = Array.isArray(ac.history) && ac.history.length ? ac.history : [[ac.lat, ac.lon, ac.alt_baro, ac.lastSeen]];
            for (const sample of samples) {
                const point = { lat: Number(sample?.[0]), lon: Number(sample?.[1]) }, timestamp = Number(sample?.[3]);
                if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !Number.isFinite(timestamp) || timestamp < now - 86400000 || timestamp > now + 300000) continue;
                if (replayDistanceNm(point, airport) > radiusNm) continue;
                const start = Math.floor(timestamp / bucketMs) * bucketMs;
                const frame = frames.get(start) || { start, end: start + bucketMs, aircraft: [], arrivals: 0, departures: 0 };
                if (!frame.aircraft.some(item => item.hex === ac.hex)) {
                    frame.aircraft.push({ hex: ac.hex, callsign: ac.flight?.trim() || ac.hex, lat: point.lat, lon: point.lon });
                    if (ac.to === airport.icao || ac.to === airport.iata) frame.arrivals++;
                    if (ac.from === airport.icao || ac.from === airport.iata) frame.departures++;
                }
                frames.set(start, frame);
            }
        }
        return Array.from(frames.values()).sort((a, b) => a.start - b.start);
    }

    const airportReplay = {
        airport: null,
        frames: [],
        index: 0,
        timer: null,
        playing: false,
        show(airport) {
            this.airport = airport;
            this.frames = airportReplayFrames(typeof aircraftCache !== 'undefined' ? aircraftCache : {}, airport);
            this.index = 0;
            this.render();
        },
        hide() {
            this.playing = false;
            clearInterval(this.timer);
            this.timer = null;
            document.getElementById('airportReplayPanel')?.remove();
        },
        step(delta = 1) {
            if (!this.frames.length) return;
            this.index = (this.index + delta + this.frames.length) % this.frames.length;
            this.render();
        },
        togglePlay() {
            this.playing = !this.playing;
            clearInterval(this.timer);
            if (this.playing) this.timer = setInterval(() => this.step(1), 1400);
            this.render();
        },
        render() {
            let panel = document.getElementById('airportReplayPanel');
            if (!panel) { panel = document.createElement('div'); panel.id = 'airportReplayPanel'; panel.className = 'airport-replay-panel'; document.body.appendChild(panel); }
            const frame = this.frames[this.index];
            const name = this.airport?.iata || this.airport?.icao || 'airport';
            panel.innerHTML = '<div class="airport-replay-header"><strong>' + _escHtml(name) + ' · Day in the life</strong><button id="airportReplayClose" aria-label="Close airport replay">×</button></div>' + (frame ? '<div class="airport-replay-time">' + new Date(frame.start).toUTCString() + '</div><div class="airport-replay-metrics"><span>' + frame.aircraft.length + ' traffic</span><span>' + frame.arrivals + ' arrivals</span><span>' + frame.departures + ' departures</span></div><div class="airport-replay-list">' + frame.aircraft.slice(0, 12).map(item => '<button data-replay-hex="' + _escHtml(item.hex) + '">' + _escHtml(item.callsign) + '</button>').join('') + '</div>' : '<div class="airport-replay-empty">No retained traffic history within 40 nm.</div>') + '<div class="airport-replay-controls"><button id="airportReplayPrev">‹</button><button id="airportReplayPlay">' + (this.playing ? 'Pause' : 'Play') + '</button><button id="airportReplayNext">›</button><span>' + (this.frames.length ? (this.index + 1) + ' / ' + this.frames.length : '0 / 0') + '</span></div>';
            panel.querySelector('#airportReplayClose').onclick = () => this.hide();
            panel.querySelector('#airportReplayPrev').onclick = () => this.step(-1);
            panel.querySelector('#airportReplayNext').onclick = () => this.step(1);
            panel.querySelector('#airportReplayPlay').onclick = () => this.togglePlay();
            panel.querySelectorAll('[data-replay-hex]').forEach(button => button.onclick = () => { if (typeof selectAircraft === 'function') selectAircraft(button.dataset.replayHex); });
        }
    };
