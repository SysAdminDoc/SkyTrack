
    // ============ PHASE-OF-FLIGHT CLASSIFIER ============
    // Pure rule-based classifier. No ML, no network. Labels every aircraft
    // with one of: ground | taxi | takeoff | climb | cruise | descent |
    // approach | landing. Used to:
    //   - render a colored chip next to the callsign in the info panel
    //   - populate `ac.phase` so other modules (holding-pattern detector,
    //     airport arrival-rush histogram) can key off it later.
    //
    // Thresholds follow FAA guidance loosely but are tuned for the noisy
    // ADS-B-derived alt/gs/vs triplet rather than certified FDR data.
    const phaseClassifier = {
        // Vertical-speed threshold (fpm) that separates level flight from
        // climbs/descents. ADS-B-reported VS is noisy at ±100 fpm even on
        // steady level flight, so 300 is deliberately loose.
        _VS_LEVEL_FPM: 300,

        // Ground-speed (kt) thresholds while on the ground.
        _GS_STOPPED: 5,
        _GS_TAXI_MAX: 40,

        // Returns a lowercase phase string, or `null` if there isn't enough
        // signal to classify (e.g. no altitude reading).
        classify(ac) {
            if (!ac) return null;
            const altRaw = (ac.alt_baro !== undefined) ? ac.alt_baro : ac.alt;
            const gs = Number(ac.gs);
            const vs = Number(ac.baro_rate); // fpm, positive = climb

            // On-ground branch: the source feeds emit the string 'ground'
            // for ground-bit-set records. `0` is NOT a reliable ground
            // signal on its own — many feeds clamp small positive AGL
            // values to 0 at low resolution — so we require the explicit
            // string token here.
            if (altRaw === 'ground') {
                if (!Number.isFinite(gs) || gs < this._GS_STOPPED) return 'ground';
                if (gs < this._GS_TAXI_MAX) return 'taxi';
                return 'takeoff';
            }

            const alt = Number(altRaw);
            if (!Number.isFinite(alt)) return null;

            // Level flight — VS known and near zero.
            if (Number.isFinite(vs) && Math.abs(vs) < this._VS_LEVEL_FPM) {
                // Low + level typically means pattern / final approach.
                return alt >= 3000 ? 'cruise' : 'approach';
            }

            // Climbing — VS known and positive.
            if (Number.isFinite(vs) && vs >= this._VS_LEVEL_FPM) {
                // Low + fast climb = takeoff roll-out; everything else is a climb.
                if (alt < 3000 && Number.isFinite(gs) && gs > 80) return 'takeoff';
                return 'climb';
            }

            // Descending — VS known and negative.
            if (Number.isFinite(vs) && vs <= -this._VS_LEVEL_FPM) {
                if (alt < 3000) {
                    return Number.isFinite(gs) && gs < 180 ? 'landing' : 'approach';
                }
                if (alt < 10000) return 'approach';
                return 'descent';
            }

            // Fallback: VS unknown or missing — classify by altitude only.
            if (alt > 25000) return 'cruise';
            if (alt > 10000) return 'climb';
            return 'approach';
        },

        // Annotate an aircraft record in-place with `ac.phase`. Returns the phase.
        annotate(ac) {
            if (!ac) return null;
            const p = this.classify(ac);
            if (p) ac.phase = p;
            return p;
        },

        // Annotate every aircraft in an array or object-map.
        annotateAll(acs) {
            if (!acs) return;
            if (Array.isArray(acs)) {
                for (const ac of acs) this.annotate(ac);
            } else {
                for (const key in acs) this.annotate(acs[key]);
            }
        },

        chipHtml(ac) {
            const p = (ac && ac.phase) || this.classify(ac);
            if (!p) return '';
            return '<span class="phase-chip phase-' + p + '">' + p + '</span>';
        },

        label(ac) {
            const p = (ac && ac.phase) || this.classify(ac);
            return p ? p.charAt(0).toUpperCase() + p.slice(1) : '---';
        }
    };
