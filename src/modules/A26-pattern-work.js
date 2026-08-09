    // ============ TOUCH-AND-GO / PATTERN-WORK DETECTOR ============
    function patternDistanceNm(first, second) {
        const radians = Math.PI / 180;
        const lat1 = Number(first.lat) * radians, lat2 = Number(second.lat) * radians;
        const dLat = lat2 - lat1, dLon = (Number(second.lon) - Number(first.lon)) * radians;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    }

    function patternWorkSummary(ac, options = {}) {
        const history = Array.isArray(ac?.history) ? ac.history : [];
        const now = Number(options.now) || Date.now();
        const windowMs = Number(options.windowMs) || 1800000;
        const lowAltitude = Number(options.lowAltitude) || 1800;
        const maxRadiusNm = Number(options.maxRadiusNm) || 3;
        const minPasses = Math.max(2, Number(options.minPasses) || 3);
        const samples = history.map(point => ({ lat: Number(point?.[0]), lon: Number(point?.[1]), altitude: Number(point?.[2]), time: Number(point?.[3]) }))
            .filter(point => [point.lat, point.lon, point.altitude, point.time].every(Number.isFinite) && point.time >= now - windowMs && point.time <= now + 300000)
            .sort((a, b) => a.time - b.time);
        const lowPasses = [];
        let current = [];
        for (const sample of samples) {
            if (sample.altitude <= lowAltitude) current.push(sample);
            else if (current.length) { lowPasses.push(current); current = []; }
        }
        if (current.length) lowPasses.push(current);
        if (lowPasses.length < minPasses) return null;
        const lowSamples = lowPasses.flat();
        const center = { lat: lowSamples.reduce((sum, point) => sum + point.lat, 0) / lowSamples.length, lon: lowSamples.reduce((sum, point) => sum + point.lon, 0) / lowSamples.length };
        const radiusNm = Math.max(...lowSamples.map(point => patternDistanceNm(center, point)));
        if (radiusNm > maxRadiusNm) return null;
        return { passes: lowPasses.length, center, radiusNm, windowMinutes: Math.round(windowMs / 60000) };
    }

    const patternWork = {
        summary: patternWorkSummary,
        annotate(ac) {
            if (!ac) return null;
            ac.patternWork = patternWorkSummary(ac);
            ac.patternWorkDetected = !!ac.patternWork;
            return ac.patternWork;
        },
        chipHtml(ac) {
            const summary = ac?.patternWork;
            if (!summary) return '';
            return '<span id="patternWorkChip" class="pattern-work-chip" title="Repeated low passes in a compact area">PATTERN WORK · ' + summary.passes + ' PASSES</span>';
        },
        refreshSelected() {
            if (typeof selectedHex === 'undefined' || !selectedHex) return;
            const callsign = document.getElementById('infoCallsign');
            const ac = aircraftCache[selectedHex];
            if (!callsign || !ac) return;
            const chip = document.getElementById('patternWorkChip');
            const html = this.chipHtml(ac);
            if (chip) { if (html) chip.outerHTML = html; else chip.remove(); }
            else if (html) callsign.insertAdjacentHTML('beforeend', html);
        }
    };
