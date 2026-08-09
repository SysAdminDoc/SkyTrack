    // ============ FLIGHT OF THE DAY ============
    function flightOfDayScore(ac = {}) {
        const altitude = Math.max(0, Number(ac.alt_baro) || 0) / 1000;
        const speed = Math.max(0, Number(ac.gs) || 0) / 100;
        const history = Array.isArray(ac.history) ? Math.min(10, ac.history.length) : 0;
        const notable = (ac.isVIP ? 8 : 0) + (ac.militaryInfo || ac.militaryRangeInfo ? 5 : 0) + (ac.interesting ? 3 : 0) + (['7500', '7600', '7700'].includes(String(ac.squawk)) ? 20 : 0);
        const route = ac.from && ac.to ? 2 : 0;
        return altitude + speed + history + notable + route;
    }

    function chooseFlightOfDay(aircraft) {
        return Object.values(aircraft || {})
            .filter(ac => ac?.hex && Number.isFinite(Number(ac.lat)) && Number.isFinite(Number(ac.lon)))
            .map(ac => ({ ac, score: flightOfDayScore(ac) }))
            .sort((a, b) => b.score - a.score || String(a.ac.flight || a.ac.hex).localeCompare(String(b.ac.flight || b.ac.hex)))[0]?.ac || null;
    }

    const flightOfDay = {
        choose: chooseFlightOfDay,
        share() {
            const ac = chooseFlightOfDay(typeof aircraftCache !== 'undefined' ? aircraftCache : {});
            if (!ac) { if (typeof toast === 'function') toast('No live aircraft available for Flight of the Day', 'warning'); return false; }
            if (typeof flightCard?.copy !== 'function') return false;
            if (typeof toast === 'function') toast('Flight of the Day: ' + (ac.flight?.trim() || ac.hex));
            return flightCard.copy(ac.hex);
        }
    };
