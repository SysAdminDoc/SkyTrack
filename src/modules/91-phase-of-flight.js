
    // ============ PHASE-OF-FLIGHT CLASSIFIER (v0.19.0) ============
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
        // Public: returns a string label or null if insufficient signal.
        // ac: { alt_baro, gs, baro_rate } (also accepts alt as alias)
        classify(ac) {
            if (!ac) return null;
            const alt = (ac.alt_baro !== undefined) ? ac.alt_baro : ac.alt;
            const gs = Number(ac.gs);
            const vs = Number(ac.baro_rate); // fpm, positive = climb
            if (alt === 'ground' || alt === 0) {
                if (!Number.isFinite(gs) || gs < 5) return 'ground';
                if (gs < 40) return 'taxi';
                // Rolling on the ground at takeoff speed.
                return 'takeoff';
            }
            if (!Number.isFinite(alt)) return null;
            // Airborne branches.
            if (Number.isFinite(vs) && Math.abs(vs) < 300) {
                // Level flight band.
                if (alt >= 18000) return 'cruise';
                if (alt >= 10000) return 'cruise';
                if (alt >= 3000) return 'cruise';
                return 'approach'; // low + level = pattern / final
            }
            if (Number.isFinite(vs) && vs >= 300) {
                // Climbing.
                if (alt < 3000 && Number.isFinite(gs) && gs > 80) return 'takeoff';
                if (alt < 18000) return 'climb';
                return 'climb';
            }
            if (Number.isFinite(vs) && vs <= -300) {
                // Descending.
                if (alt < 3000) {
                    if (Number.isFinite(gs) && gs < 180) return 'landing';
                    return 'approach';
                }
                if (alt < 10000) return 'approach';
                return 'descent';
            }
            // Fallback: gs + alt only.
            if (alt > 25000) return 'cruise';
            if (alt > 10000) return 'climb';
            return 'approach';
        },

        // Annotate an aircraft record in-place with `ac.phase`.
        annotate(ac) {
            if (!ac) return;
            const p = this.classify(ac);
            if (p) ac.phase = p;
        },

        // Annotate every aircraft in an array / object-map.
        annotateAll(acs) {
            if (!acs) return;
            if (Array.isArray(acs)) {
                for (const ac of acs) this.annotate(ac);
            } else {
                for (const key in acs) this.annotate(acs[key]);
            }
        },

        // Render a compact chip: <span class="phase-chip phase-cruise">CRUISE</span>
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
