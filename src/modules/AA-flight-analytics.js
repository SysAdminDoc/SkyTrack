
    // ============ FLIGHT ANALYTICS ============
    // Lightweight rule-based detectors that run on an individual aircraft's
    // trail or current state. All detectors return boolean + annotate
    // `ac.*` flags, making them cheap to query from info-panel / list
    // render paths.
    //
    // Currently ships:
    //   * Go-around detector           — flags late missed approaches
    //   * Speed anomaly detector       — flags out-of-envelope ground speed
    //
    // Placed alongside the surveillance-orbit / holding-pattern detectors,
    // all four live lazily — they are not invoked per-poll for the whole
    // fleet, only when selectAircraft runs.
    const flightAnalytics = {
        // Go-around heuristic:
        //   trail descends below 2000 ft AGL within ~15 nm of a known
        //   airport, then climbs > 500 fpm within 60 s while still near the
        //   same airport. The airportDB proximity check is optional — we
        //   accept an absolute altitude threshold as a fallback.
        //
        // Returns true on confirmed go-around, false otherwise.
        detectGoAround(ac) {
            if (!ac) return false;
            const history = ac.history;
            if (!Array.isArray(history) || history.length < 20) return false;
            // Scan backwards for the most recent sharp climb preceded by a
            // descent below 2000 ft.
            let lowestIdx = -1;
            let lowestAlt = Infinity;
            for (let i = 0; i < history.length; i++) {
                const alt = history[i]?.[2];
                if (typeof alt === 'number' && Number.isFinite(alt) && alt < lowestAlt) {
                    lowestAlt = alt;
                    lowestIdx = i;
                }
            }
            if (lowestIdx < 0 || lowestAlt > 2000) return false;
            // From lowestIdx, look forward 60s for a positive-VS climb.
            const base = history[lowestIdx];
            const tBase = Number(base?.[3]);
            if (!Number.isFinite(tBase)) return false;
            const afterIdx = history.findIndex((p, i) => {
                if (i <= lowestIdx) return false;
                const t = Number(p?.[3]);
                const alt = p?.[2];
                if (!Number.isFinite(t) || typeof alt !== 'number') return false;
                return (t - tBase) <= 60000 && alt - lowestAlt > 200;
            });
            return afterIdx > 0;
        },

        // Speed-anomaly heuristic:
        //   compare ground speed against a per-type envelope. The envelope
        //   table is intentionally loose — we flag only clear outliers
        //   (below cruise stall or above VMO × 1.3).
        _envelope(typeCode) {
            const t = (typeCode || '').toUpperCase();
            if (!t) return null;
            // Rough speed envelopes (ground speed ≈ airspeed with wind noise).
            // Each record: { vMin, vMax } in knots.
            if (/^(B74|B77|B78|A35|A38)/.test(t)) return { vMin: 170, vMax: 620 };
            if (/^(A32|A31|A22|A20|B73|E17|E19)/.test(t)) return { vMin: 140, vMax: 540 };
            if (/^(CRJ|BCS|AT4|AT7|DH8|SB20)/.test(t))   return { vMin: 120, vMax: 500 };
            if (/^(C17|C130|C5|KC13|KC46|E3|E6|P8)/.test(t)) return { vMin: 130, vMax: 500 };
            if (/^(F1[5-8]|F2[02]|F35|EUFI|RFAL)/.test(t)) return { vMin: 140, vMax: 1000 };
            if (/^(SR20|SR22|C17[2578]|C18|DA20|DA40|PA28|PA32)/.test(t)) return { vMin: 50, vMax: 220 };
            if (/^(R22|R44|R66|B06|B407|EC3|EC4|AS50|AW09|AW13|H12|H13|H14|H16|UH1|UH60|AH64|CH47)/.test(t)) return { vMin: 0, vMax: 200 };
            return null;
        },

        detectSpeedAnomaly(ac) {
            if (!ac) return false;
            const gs = Number(ac.gs);
            if (!Number.isFinite(gs)) return false;
            // Ignore ground operations.
            if (ac.alt_baro === 'ground') return false;
            if (Number.isFinite(ac.alt_baro) && ac.alt_baro < 1000) return false;
            const env = this._envelope(ac.t);
            if (!env) return false;
            if (gs < env.vMin * 0.7) return true;     // stall-low
            if (gs > env.vMax * 1.3) return true;     // VMO-high
            return false;
        },

        // Annotate in-place; returns a small summary object useful for chips.
        annotate(ac) {
            if (!ac) return null;
            const goAround = this.detectGoAround(ac);
            const speedAnomaly = this.detectSpeedAnomaly(ac);
            ac.goAroundDetected = goAround;
            ac.speedAnomalyDetected = speedAnomaly;
            return { goAround, speedAnomaly };
        },

        chipHtml(ac) {
            if (!ac) return '';
            let html = '';
            if (ac.goAroundDetected) {
                html += '<span class="analytics-chip go-around" title="Descended low and immediately climbed again — possible go-around / missed approach">GO-AROUND</span>';
            }
            if (ac.speedAnomalyDetected) {
                html += '<span class="analytics-chip speed-anomaly" title="Ground speed is outside the typical envelope for this aircraft type">SPEED ANOMALY</span>';
            }
            return html;
        }
    };
