
    // ============ HOLDING-PATTERN DETECTOR ============
    // Detect two or more consistent turns in the selected aircraft trail.
    // ADS-B history is intentionally sampled and noisy, so this uses the
    // cumulative turn of successive track bearings rather than assuming a
    // particular racetrack orientation. A valid result must fit inside the
    // latest eight minutes and keep its reported altitude within 500 ft.
    const HOLDING_WINDOW_MS = 8 * 60 * 1000;
    // A sampled trail does not include the final bearing transition at the
    // exact loop boundary, so allow a small edge-sampling tolerance while
    // still requiring essentially two complete turns.
    const HOLDING_MIN_SWEEP_DEG = 680;
    const HOLDING_MAX_ALT_VARIANCE_FT = 500;

    function holdingTimeMs(value) {
        const timestamp = Number(value);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
        return timestamp > 1e11 ? timestamp : timestamp * 1000;
    }

    function holdingBearing(lat1, lon1, lat2, lon2) {
        const radians = Math.PI / 180;
        const phi1 = lat1 * radians;
        const phi2 = lat2 * radians;
        const deltaLon = (lon2 - lon1) * radians;
        const y = Math.sin(deltaLon) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    function holdingPatternSummary(ac, options = {}) {
        const history = Array.isArray(ac?.history) ? ac.history : [];
        if (history.length < 16) return null;

        const points = history.map(point => ({
            lat: Number(point?.[0]),
            lon: Number(point?.[1]),
            altitude: Number(point?.[2]),
            time: holdingTimeMs(point?.[3])
        })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
            Number.isFinite(point.altitude) && Number.isFinite(point.time));
        if (points.length < 16) return null;

        const endTime = points[points.length - 1].time;
        const windowMs = Number.isFinite(options.windowMs) ? Math.max(60_000, options.windowMs) : HOLDING_WINDOW_MS;
        const recent = points.filter(point => point.time >= endTime - windowMs && point.time <= endTime + 5000);
        if (recent.length < 16) return null;
        const durationMs = recent[recent.length - 1].time - recent[0].time;
        if (durationMs <= 0 || durationMs > windowMs) return null;

        const altitudes = recent.map(point => point.altitude);
        const altitudeRangeFt = Math.max(...altitudes) - Math.min(...altitudes);
        const maxAltitudeRange = Number.isFinite(options.maxAltitudeRangeFt)
            ? Math.max(0, options.maxAltitudeRangeFt)
            : HOLDING_MAX_ALT_VARIANCE_FT;
        if (altitudeRangeFt > maxAltitudeRange) return null;

        let signedSweep = 0;
        let absoluteSweep = 0;
        let previousBearing = null;
        let directionChanges = 0;
        let previousDirection = 0;
        for (let index = 1; index < recent.length; index++) {
            const previous = recent[index - 1];
            const current = recent[index];
            const bearing = holdingBearing(previous.lat, previous.lon, current.lat, current.lon);
            if (!Number.isFinite(bearing)) continue;
            if (previousBearing !== null) {
                let delta = bearing - previousBearing;
                if (delta > 180) delta -= 360;
                else if (delta < -180) delta += 360;
                if (Math.abs(delta) >= 2) {
                    const direction = Math.sign(delta);
                    if (previousDirection && direction !== previousDirection) directionChanges++;
                    previousDirection = direction;
                    signedSweep += delta;
                    absoluteSweep += Math.abs(delta);
                }
            }
            previousBearing = bearing;
        }

        const consistency = absoluteSweep ? Math.abs(signedSweep) / absoluteSweep : 0;
        if (Math.abs(signedSweep) < HOLDING_MIN_SWEEP_DEG || consistency < 0.65 || directionChanges > 5) return null;
        return {
            loops: Math.max(2, Math.round(Math.abs(signedSweep) / 360)),
            durationMs,
            altitudeRangeFt,
            sweepDeg: Math.abs(signedSweep),
            direction: signedSweep < 0 ? 'left' : 'right'
        };
    }

    const holdingPattern = {
        summary: holdingPatternSummary,
        annotate(ac) {
            const summary = holdingPatternSummary(ac);
            if (ac) {
                ac.holdingPattern = summary;
                ac.holdingPatternDetected = !!summary;
            }
            return summary;
        },
        chipHtml(ac) {
            const summary = ac?.holdingPattern;
            if (!summary) return '';
            return '<span id="holdingPatternChip" class="holding-pattern-chip" title="Two or more consistent turns within eight minutes at nearly level altitude">HOLDING ' + summary.loops + ' LOOPS</span>';
        },
        refresh(ac) {
            const callsign = document.getElementById('infoCallsign');
            if (!callsign) return;
            const html = this.chipHtml(ac);
            const existing = document.getElementById('holdingPatternChip');
            if (existing) {
                if (html) existing.outerHTML = html;
                else existing.remove();
            } else if (html) {
                callsign.insertAdjacentHTML('beforeend', html);
            }
        }
    };
