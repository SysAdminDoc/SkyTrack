
    // ============ "WHY IS THIS PLANE HERE?" EXPLAINER ============
    // Rule-based natural-language summary of what a specific aircraft is
    // most likely doing *right now*. No LLM, no network — just templated
    // clauses selected from the data the rest of the app already carries:
    //
    //   * ac.flight           callsign           (→ callsignLore + airline DB)
    //   * ac.t                ICAO type code     (→ aircraftTypeDB)
    //   * ac.r                registration
    //   * ac.phase            phase-of-flight    (module 91)
    //   * ac.alt_baro, gs, baro_rate            (derived)
    //   * ac.from / ac.to     route              (→ airportDB)
    //   * ac.detectedOrigin                     (inferred from trail)
    //   * ac.surveillanceOrbit                  (module 94)
    //   * ac.militaryInfo / ac.isVIP / ac.category
    //
    // Rendering: `whyHere.summaryHtml(ac)` returns a short paragraph
    // (already escaped) to splice into the info panel. Returns '' when
    // there isn't enough signal to say something useful.
    const whyHere = {
        // Phase-specific opening clauses.
        _phaseClauses: {
            ground:   'currently on the ground',
            taxi:     'taxiing',
            takeoff:  'departing',
            climb:    'climbing',
            cruise:   'in cruise',
            descent:  'descending',
            approach: 'on approach',
            landing:  'on final'
        },

        // Type-family prose — rough "this is what this aircraft is".
        _typeFamily(code) {
            if (!code) return null;
            const t = String(code).toUpperCase();
            // Helicopters
            if (/^(R22|R44|R66|B06|B407|B412|B429|EC35|EC45|AS50|AS55|AS65|A109|A139|A169|AW09|AW39|AW69|AW89|AW101|AW109|AW119|AW139|AW149|AW169|AW189|H125|H135|H145|H155|H160|H175|H215|H225|S76|S92|UH1|UH60|HH60|MH60|AH64|CH47)/.test(t)) return 'helicopter';
            // Cessna singles
            if (/^C1[2-9][0-9]|C17[2578]|C18[025]|C18[28]|C19[05]|C20[568]/.test(t)) return 'light single-engine piston';
            if (/^C208/.test(t)) return 'Cessna Caravan turboprop';
            // Cirrus / Diamond / Piper singles
            if (/^(SR20|SR22|DA20|DA40|DA42|DA62|PA28|PA32|PA46|M20)/.test(t)) return 'light piston aircraft';
            // Business jets
            if (/^(C25|C56|C68|C70|C750|CL30|CL35|CL60|CL64|CL65|GLEX|GLF\d|G\d|G5|E50P|E55P|E90|PC12|PC24|FA10|FA20|FA50|FA7X|FA8X|H25|HA4T|CRJ)/.test(t)) return 'business jet';
            // Regional jets / turboprops
            if (/^(CRJ[12]|CRJ7|CRJ9|E17[05]|E19[05]|BCS|AT4|AT7|DH8|SB20|AT42|AT72)/.test(t)) return 'regional airliner';
            // Narrowbody airliners
            if (/^(A31[89]|A32[01]|A22N|A20N|A319|A320|A321|B73[37-9]|B73[3-9]G|B73\d|MD8[0-9]|MD9\d)/.test(t)) return 'narrowbody airliner';
            // Widebody
            if (/^(A33[03]|A340|A35[0K]|A380|B74[0-8]|B75\d|B76\d|B77\d|B78\d|B79\d|IL96|TU204)/.test(t)) return 'widebody airliner';
            // Military heavies / transports
            if (/^(C5|C5M|C17|C130|C30J|C40|C32|KC10|KC13|KC46|KC135|P3|P8A|E3|E4|E6|E8|RC13|U2)/.test(t)) return 'military transport/special-mission';
            // Fighters
            if (/^(F1[5-9]|F2[02]|F35|EUFI|RFAL|TORD|MIG|SU2[57-9]|SU3[0-9])/.test(t)) return 'fighter jet';
            return null;
        },

        // Compose a short sentence. Caller is responsible for the
        // surrounding <p>/<div>; we return the text fragment, escaped.
        summaryText(ac) {
            if (!ac) return '';
            const parts = [];

            // Lead: "A {family} ..." or "{callsign}..."
            const callsign = (ac.flight || '').trim();
            const reg = (ac.r || '').trim();
            const family = this._typeFamily(ac.t);
            let subject;
            if (callsign) {
                subject = callsign;
            } else if (reg) {
                subject = reg;
            } else if (ac.hex) {
                subject = ac.hex;
            } else {
                subject = 'This aircraft';
            }
            const lead = family ? `${subject} — a ${family} —` : subject;

            // Phase clause.
            let phase = ac.phase;
            if (!phase && typeof phaseClassifier === 'object') {
                try { phase = phaseClassifier.classify(ac); } catch (_) {}
            }
            const phaseClause = phase ? (this._phaseClauses[phase] || null) : null;

            // Altitude + speed annotation.
            let altClause = '';
            if (typeof ac.alt_baro === 'number' && Number.isFinite(ac.alt_baro) && phase !== 'ground') {
                if (ac.alt_baro >= 18000) altClause = ` at FL${Math.round(ac.alt_baro / 100)}`;
                else if (ac.alt_baro >= 1000) altClause = ` at ${ac.alt_baro.toLocaleString()} ft`;
                else altClause = ` at ${ac.alt_baro.toLocaleString()} ft`;
            } else if (ac.alt_baro === 'ground') {
                altClause = ' on the ground';
            }

            // Route clause.
            let routeClause = '';
            if (ac.from && ac.to) {
                routeClause = `, likely ${ac.from} → ${ac.to}`;
            } else if (ac.from) {
                routeClause = `, out of ${ac.from}`;
            } else if (ac.to) {
                routeClause = `, inbound to ${ac.to}`;
            } else if (ac.detectedOrigin?.icao) {
                routeClause = `, appears to have departed ${ac.detectedOrigin.icao}`;
            }

            // Operator clause — only if we know the airline.
            let operatorClause = '';
            if (ac.airlineName && !/military|government|air force|navy/i.test(ac.airlineName)) {
                operatorClause = ` operated by ${ac.airlineName}`;
            }

            // Assemble main sentence.
            const main = `${lead} is ${phaseClause || 'airborne'}${altClause}${operatorClause}${routeClause}.`;
            parts.push(main);

            // Special-situation second sentence — surveillance orbit wins
            // over generic commentary.
            if (ac.surveillanceOrbit) {
                parts.push('It has been orbiting at low altitude for an extended period — a pattern typical of intelligence, surveillance, reconnaissance, or law-enforcement loiter missions.');
            } else if (ac.squawk === '7500' || ac.squawk === '7600' || ac.squawk === '7700') {
                const reason = ac.squawk === '7500' ? 'unlawful interference (hijack)' :
                    ac.squawk === '7600' ? 'a radio communication failure' :
                    'a general in-flight emergency';
                parts.push(`The transponder is broadcasting ${reason}.`);
            } else if (ac.militaryInfo || ac.isMilitary) {
                parts.push('This is a military aircraft — it is probably on a training sortie, transit flight, or support mission.');
            } else if (ac.isVIP) {
                parts.push('This aircraft is tagged as a VIP / government transport — it is moving a senior official, head of state, or other notable passenger.');
            } else if (phase === 'cruise' && family === 'widebody airliner' && ac.from && ac.to) {
                parts.push(`Cruise between ${ac.from} and ${ac.to} is the ordinary mid-flight segment of a scheduled long-haul service.`);
            } else if (phase === 'approach' || phase === 'landing') {
                const dest = ac.to ? ac.to : (ac.detectedOrigin ? 'a nearby field' : 'a nearby airport');
                parts.push(`It will most likely land at ${dest} within the next few minutes.`);
            } else if (phase === 'climb' && ac.from) {
                parts.push(`Having just departed ${ac.from}, it will continue climbing to its cruising altitude.`);
            }

            // Third, optional callsign lore hook. The call-site also renders
            // the full lore card, so here we keep it to one sentence.
            if (callsign && typeof callsignLore === 'object') {
                try {
                    const entry = callsignLore.lookup(callsign);
                    if (entry) parts.push(`Callsign lore: ${entry.title} — ${entry.body.split('. ')[0]}.`);
                } catch (_) {}
            }

            return parts.join(' ');
        },

        summaryHtml(ac) {
            const txt = this.summaryText(ac);
            if (!txt) return '';
            // `summaryText` already assembled human prose from escaped-safe
            // data (callsigns can contain odd characters), so escape one
            // last time defensively before splicing into innerHTML.
            return '<div class="why-here"><div class="why-here-label">Why this plane is here</div>' +
                '<p>' + _escHtml(txt) + '</p></div>';
        }
    };
