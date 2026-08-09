    // ============ MILITARY MARKER RAMP ============
    // Keep military styling independent from the feed's raw category number:
    // enrichment can identify a military target through several databases.
    function isMilitaryAircraft(ac = {}) {
        const category = String(ac.category_type || '').trim().toLowerCase();
        return !!(ac.militaryInfo || ac.militaryRangeInfo || ac.isMilitary || ac.mil || ac.military || ac.is_military || category === 'military');
    }

    function militaryConflict(ac, conflicts = []) {
        const hex = String(ac?.hex || '').toUpperCase();
        if (!hex) return false;
        return (Array.isArray(conflicts) ? conflicts : []).some(conflict =>
            String(conflict?.firstHex || '').toUpperCase() === hex ||
            String(conflict?.secondHex || '').toUpperCase() === hex
        );
    }

    function militaryRampStyle(ac, conflicts = [], selected = false) {
        if (!isMilitaryAircraft(ac)) return { isMilitary: false, conflict: false, filter: '', className: '' };
        const conflict = militaryConflict(ac, conflicts);
        return {
            isMilitary: true,
            conflict,
            // Selected aircraft retain the high-contrast selection color.
            filter: selected ? '' : (conflict
                ? 'brightness(0) invert(0.68) sepia(1) saturate(7) hue-rotate(350deg) drop-shadow(0 0 8px #ff5533)'
                : 'brightness(0) invert(0.64) sepia(1) saturate(4) hue-rotate(42deg) drop-shadow(0 0 4px #d4a72c)'),
            className: ' military-ramp' + (conflict ? ' military-conflict' : '')
        };
    }
