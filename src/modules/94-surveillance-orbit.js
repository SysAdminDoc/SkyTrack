
    // ============ SURVEILLANCE-ORBIT DETECTOR ============
    // Flags aircraft that have been holding a tight circular orbit at low
    // altitude for an extended period — the ISR/LEO/photo-recon signature.
    // Heuristic (tuned to be conservative so civilian pattern work doesn't
    // trigger it):
    //
    //   * Trail covers ≥ 15 real minutes
    //   * Trail points stay within a ≤ 3 nm bounding radius
    //   * Min numeric altitude < 12,000 ft MSL (ground-tagged points do NOT
    //     satisfy the gate — a trail that is 100 % on-the-ground should not
    //     be flagged as "loiter")
    //   * Track heading has swept ≥ 720° cumulatively (two full turns)
    //
    // When all four fire, the aircraft gets `ac.surveillanceOrbit = true`
    // and the info panel shows a purple "LOITER" chip. The detector runs
    // lazily — only when `selectAircraft` is called, so there's no per-poll
    // O(n·history) cost.
    const surveillanceOrbit = {
        minMinutes: 15,
        maxRadiusNm: 3,
        minSweepDeg: 720,
        maxAltFt: 12000,
        minPoints: 30,

        // `ac.history` is an array of [lat, lon, alt, tsMs] tuples where `alt`
        // may be a number or the string 'ground'. Returns true if the trail
        // matches the ISR orbit signature.
        check(ac) {
            if (!ac) return false;
            const history = ac.history;
            if (!Array.isArray(history) || history.length < this.minPoints) return false;

            // 1. Duration gate. Require monotonic timestamps on both ends.
            const t0 = Number(history[0]?.[3]);
            const t1 = Number(history[history.length - 1]?.[3]);
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) return false;
            const durationMin = (t1 - t0) / 60000;
            if (durationMin < this.minMinutes) return false;

            // 2. Bounding radius + altitude gate.
            //    Track numeric altitudes *and* whether we saw any numeric
            //    reading at all; a trail that is entirely ground-tagged has
            //    no real altitude signal and must not clear the gate by
            //    `Infinity` slipping past `>= maxAltFt`.
            let sumLat = 0, sumLon = 0, n = 0;
            let minAlt = Infinity;
            let sawNumericAlt = false;
            for (const p of history) {
                const lat = Number(p?.[0]);
                const lon = Number(p?.[1]);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                sumLat += lat;
                sumLon += lon;
                n++;
                const a = p[2];
                if (typeof a === 'number' && Number.isFinite(a)) {
                    sawNumericAlt = true;
                    if (a < minAlt) minAlt = a;
                }
            }
            if (n < 10) return false;
            if (!sawNumericAlt) return false; // trail was entirely ground-tagged
            if (minAlt > this.maxAltFt) return false;

            const cLat = sumLat / n;
            const cLon = sumLon / n;
            let maxR = 0;
            for (const p of history) {
                const lat = Number(p?.[0]);
                const lon = Number(p?.[1]);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
                const d = this._distanceNm(cLat, cLon, lat, lon);
                if (d > maxR) maxR = d;
            }
            if (maxR > this.maxRadiusNm) return false;

            // 3. Cumulative heading sweep — track must rotate ≥ minSweepDeg.
            let prevBearing = null;
            let sweep = 0;
            for (let i = 1; i < history.length; i++) {
                const a = history[i - 1];
                const b = history[i];
                const aLat = Number(a?.[0]);
                const aLon = Number(a?.[1]);
                const bLat = Number(b?.[0]);
                const bLon = Number(b?.[1]);
                if (!Number.isFinite(aLat) || !Number.isFinite(aLon) ||
                    !Number.isFinite(bLat) || !Number.isFinite(bLon)) continue;
                const bearing = this._bearing(aLat, aLon, bLat, bLon);
                if (!Number.isFinite(bearing)) continue;
                if (prevBearing !== null) {
                    let delta = bearing - prevBearing;
                    if (delta > 180) delta -= 360;
                    else if (delta < -180) delta += 360;
                    sweep += Math.abs(delta);
                }
                prevBearing = bearing;
            }
            return sweep >= this.minSweepDeg;
        },

        annotate(ac) {
            const isOrbit = this.check(ac);
            if (ac) ac.surveillanceOrbit = isOrbit;
            return isOrbit;
        },

        chipHtml(ac) {
            return (ac && ac.surveillanceOrbit)
                ? '<span class="loiter-chip" title="Aircraft has been orbiting at low altitude for &gt;15 min">LOITER</span>'
                : '';
        },

        _distanceNm(lat1, lon1, lat2, lon2) {
            const R = 3440.065; // Earth radius in nautical miles
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) *
                Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        },

        _bearing(lat1, lon1, lat2, lon2) {
            const φ1 = lat1 * Math.PI / 180;
            const φ2 = lat2 * Math.PI / 180;
            const Δλ = (lon2 - lon1) * Math.PI / 180;
            const y = Math.sin(Δλ) * Math.cos(φ2);
            const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        }
    };
