    // ============ AIRCRAFT DOSSIER ============
    function dossierEscape(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function aircraftDossierData(ac = {}, logbookRecord = null, now = Date.now()) {
        const history = Array.isArray(ac.history) ? ac.history : [];
        const times = history.map(point => Number(point?.[3])).filter(Number.isFinite);
        const first = times[0] || ac.firstSeen, last = times.at(-1) || ac.lastSeen || now;
        const hours = Number.isFinite(first) && Number.isFinite(last) && last >= first ? (last - first) / 3600000 : 0;
        const squawk = String(ac.squawk || '');
        return {
            callsign: ac.flight?.trim() || ac.r || ac.hex || 'Unknown aircraft',
            hex: String(ac.hex || '').toUpperCase(),
            registration: ac.r || 'Not available',
            type: ac.t || ac.desc || 'Unknown type',
            operator: ac.ownOp || ac.airlineName || logbookRecord?.bestCallsign || 'Not available',
            route: [ac.from || '---', ac.to || '---'].join(' → '),
            altitude: ac.alt_baro === 'ground' ? 'GROUND' : (Number.isFinite(Number(ac.alt_baro)) ? Math.round(Number(ac.alt_baro)).toLocaleString() + ' ft' : 'Not available'),
            speed: Number.isFinite(Number(ac.gs)) ? Math.round(Number(ac.gs)) + ' kt' : 'Not available',
            hoursObserved: hours.toFixed(1),
            firstSeen: first ? new Date(first).toISOString() : 'Not available',
            lastSeen: last ? new Date(last).toISOString() : 'Not available',
            notable: [
                ac.isVIP ? 'VIP classification' : '',
                ac.militaryInfo || ac.militaryRangeInfo ? 'Military classification' : '',
                ['7500', '7600', '7700'].includes(squawk) ? 'Emergency squawk ' + squawk : '',
                ac.patternWorkDetected ? 'Pattern-work activity' : ''
            ].filter(Boolean),
            logbookCount: logbookRecord?.count || 0
        };
    }

    function dossierHtml(data) {
        const rows = [
            ['Registration', data.registration], ['ICAO24', data.hex], ['Type', data.type], ['Operator', data.operator],
            ['Route', data.route], ['Current altitude', data.altitude], ['Current speed', data.speed],
            ['Observed span', data.hoursObserved + ' hours'], ['First seen', data.firstSeen], ['Last seen', data.lastSeen],
            ['Logbook observations', data.logbookCount]
        ];
        const notable = data.notable.length ? '<ul>' + data.notable.map(item => '<li>' + dossierEscape(item) + '</li>').join('') + '</ul>' : '<p>None recorded.</p>';
        return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SkyTrack dossier · ' + dossierEscape(data.callsign) + '</title><style>body{font:15px system-ui,sans-serif;max-width:760px;margin:40px auto;color:#172033}h1{margin-bottom:4px}p,td{line-height:1.5}table{border-collapse:collapse;width:100%;margin:24px 0}td{border-bottom:1px solid #d8dee9;padding:9px 4px}td:first-child{font-weight:700;width:34%;color:#4b5563}.stamp{color:#64748b}.notable{padding:14px 18px;background:#f1f5f9;border-left:4px solid #2563eb}@media print{body{margin:0}.no-print{display:none}}</style></head><body><div class="stamp">SKYTRACK PRINTABLE AIRCRAFT DOSSIER</div><h1>' + dossierEscape(data.callsign) + '</h1><p class="stamp">Generated ' + dossierEscape(new Date().toISOString()) + '</p><table>' + rows.map(row => '<tr><td>' + dossierEscape(row[0]) + '</td><td>' + dossierEscape(row[1]) + '</td></tr>').join('') + '</table><section class="notable"><strong>Notable observations</strong>' + notable + '</section><p class="stamp">This local report describes observations available in the current SkyTrack session and personal logbook.</p></body></html>';
    }

    const aircraftDossier = {
        data: aircraftDossierData,
        html: dossierHtml,
        export(hex) {
            const ac = typeof aircraftCache !== 'undefined' ? aircraftCache[hex] : null;
            if (!ac) { if (typeof toast === 'function') toast('Select an aircraft first', 'warning'); return false; }
            const record = typeof logbook !== 'undefined' && typeof logbook.get === 'function' ? logbook.get(hex) : null;
            const data = aircraftDossierData(ac, record);
            const blob = new Blob([dossierHtml(data)], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url;
            link.download = 'skytrack-dossier-' + (data.hex || 'aircraft') + '.html';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            if (typeof toast === 'function') toast('Printable aircraft dossier downloaded');
            return true;
        }
    };
