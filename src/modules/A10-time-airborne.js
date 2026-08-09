
    // ============ TIME-AIRBORNE CHIP ============
    // Derive a conservative airborne duration from the local position trail.
    // The source feeds do not expose a consistent departure timestamp, so we
    // use the latest ground-to-airborne transition and fall back to firstSeen.
    function timeToMs(value) {
        const timestamp = Number(value);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
        return timestamp > 1e11 ? timestamp : timestamp * 1000;
    }

    function isAirborneAltitude(value) {
        if (value === 'ground') return false;
        const altitude = Number(value);
        return Number.isFinite(altitude) && altitude > 100;
    }

    function formatAirborneDuration(durationMs) {
        if (!Number.isFinite(durationMs) || durationMs < 0) return null;
        const minutes = Math.floor(durationMs / 60000);
        if (minutes < 1) return '<1m';
        const hours = Math.floor(minutes / 60);
        const remainder = minutes % 60;
        return hours ? hours + 'h ' + remainder + 'm' : minutes + 'm';
    }

    function timeAirborneSummary(ac, now = Date.now()) {
        if (!ac || !isAirborneAltitude(ac.alt_baro)) return null;
        const history = Array.isArray(ac.history) ? ac.history : [];
        let lastGroundIndex = -1;
        for (let index = 0; index < history.length; index++) {
            if (!isAirborneAltitude(history[index]?.[2])) lastGroundIndex = index;
        }
        const airbornePoints = history.slice(lastGroundIndex + 1).filter(point => isAirborneAltitude(point?.[2]));
        const firstTrailTime = timeToMs(airbornePoints[0]?.[3]);
        const startMs = firstTrailTime || timeToMs(ac.firstSeen) || timeToMs(ac.lastSeen);
        if (!startMs) return null;
        const nowMs = timeToMs(now) || Date.now();
        const lastSeenMs = timeToMs(ac.lastSeen);
        const endMs = lastSeenMs ? Math.min(nowMs, lastSeenMs + 120000) : nowMs;
        const durationMs = Math.max(0, endMs - startMs);
        const routeProgress = Number(ac.routeProgress);
        return {
            durationMs,
            durationLabel: formatAirborneDuration(durationMs),
            routeProgress: Number.isFinite(routeProgress) ? Math.min(100, Math.max(0, routeProgress)) : null
        };
    }

    const timeAirborne = {
        summary: timeAirborneSummary,
        chipHtml(ac) {
            const summary = timeAirborneSummary(ac);
            if (!summary) return '';
            const ring = summary.routeProgress === null ? '' : '<span class="time-airborne-ring" style="--airborne-progress:' + summary.routeProgress + '%" aria-hidden="true"></span>';
            const routeTitle = summary.routeProgress === null ? 'Estimated time airborne from local position history' : 'Estimated time airborne; route progress ' + Math.round(summary.routeProgress) + '%';
            return '<span id="timeAirborneChip" class="time-airborne-chip" title="' + routeTitle + '">' + ring + '<span>' + summary.durationLabel + '</span></span>';
        },
        refresh(ac) {
            const callsign = document.getElementById('infoCallsign');
            if (!callsign) return;
            const html = this.chipHtml(ac);
            const existing = document.getElementById('timeAirborneChip');
            if (existing) {
                if (html) existing.outerHTML = html;
                else existing.remove();
            } else if (html) {
                callsign.insertAdjacentHTML('beforeend', html);
            }
        }
    };
