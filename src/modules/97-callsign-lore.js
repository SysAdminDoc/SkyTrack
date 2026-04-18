
    // ============ CALLSIGN LORE ============
    // Curated lookup table of notable aviation callsigns — the ones with
    // actual stories behind them (heads of state, spec-ops, reconnaissance,
    // test flights, famous paint schemes). When a tracked aircraft's
    // callsign matches the table, `selectAircraft` renders a compact
    // "lore" card above the route section.
    //
    // Match strategy:
    //   1. Exact callsign (`AF1`, `SAM28000`)
    //   2. Callsign with trailing digits stripped (`DOOM12` → `DOOM`)
    //   3. Known prefix at the start of the callsign (`REACH`, `EVAC`)
    // The table is authored with the most-specific matches first so that
    // `SAM28000` beats a generic `SAM` prefix if both would match.
    //
    // Zero external data / network — the table ships as a static const
    // inside the build. Entries deliberately stay *operator-level* rather
    // than tail-specific; pairing this with the plane-alert-db VIP flag
    // gives the full picture without duplicating that DB here.
    const callsignLore = {
        // Each entry: {
        //   id: unique token
        //   kind: 'exact' | 'prefix' | 'stem'
        //   match: string or RegExp
        //   title: short headline
        //   tag: one-word chip label (GOV / MIL / ISR / SAR / MED ...)
        //   tagColor: CSS color for the chip
        //   body: paragraph-length explanation
        //   link?: optional "read more" URL (Wikipedia, FAS, etc.)
        // }
        _table: [
            { id: 'AF1',       kind: 'exact',  match: 'AF1',       title: 'Air Force One',
              tag: 'POTUS', tagColor: '#3b82f6',
              body: 'Callsign assigned to any US Air Force aircraft carrying the President of the United States. Typically VC-25A (SAM 28000 / 29000) or, on shorter hops, a C-32A.',
              link: 'https://en.wikipedia.org/wiki/Air_Force_One' },
            { id: 'AF2',       kind: 'exact',  match: 'AF2',       title: 'Air Force Two',
              tag: 'VP', tagColor: '#60a5fa',
              body: 'Callsign used when the Vice President is aboard an Air Force aircraft. Also swaps to the VC-25A / C-32A fleet.',
              link: 'https://en.wikipedia.org/wiki/Air_Force_Two' },
            { id: 'SAM',       kind: 'prefix', match: 'SAM',       title: 'Special Air Mission',
              tag: 'GOV', tagColor: '#2563eb',
              body: 'USAF 89th Airlift Wing. Moves cabinet secretaries, congressional delegations, and military leadership. SAM28000/29000 are the two VC-25As that fly as Air Force One.',
              link: 'https://en.wikipedia.org/wiki/89th_Airlift_Wing' },
            { id: 'EXEC1',     kind: 'exact',  match: 'EXEC1F',    title: 'Executive One Foxtrot',
              tag: 'GOV', tagColor: '#2563eb',
              body: 'Used by civilian aircraft carrying the US President\'s family when they fly separately.' },
            { id: 'MARINE1',   kind: 'prefix', match: 'MARINE',    title: 'Marine One',
              tag: 'POTUS', tagColor: '#1d4ed8',
              body: 'Callsign for any US Marine Corps aircraft carrying the President. Usually a VH-3D / VH-92A helicopter from HMX-1.',
              link: 'https://en.wikipedia.org/wiki/Marine_One' },
            { id: 'NIGHTWATCH', kind: 'prefix', match: 'NIGHTWATCH', title: 'Nightwatch',
              tag: 'NAOC', tagColor: '#7c3aed',
              body: 'E-4B National Airborne Operations Center. The "doomsday plane" — hardened flying command post for the Secretary of Defense and wartime continuity of government.',
              link: 'https://en.wikipedia.org/wiki/Boeing_E-4' },
            { id: 'JANET',     kind: 'prefix', match: 'WWW',       title: 'Janet Airlines',
              tag: 'RAVEN', tagColor: '#334155',
              body: 'Unmarked Boeing 737-600s operating out of a private terminal at Las Vegas — shuttle flights to Groom Lake (Area 51) and the Tonopah Test Range for cleared personnel.',
              link: 'https://en.wikipedia.org/wiki/Janet_(airline)' },
            { id: 'DOOM',      kind: 'prefix', match: 'DOOM',      title: 'Doom',
              tag: 'MIL', tagColor: '#dc2626',
              body: 'US B-52 Stratofortress strike flights. Often visible during strategic deterrence patrols and bomber task force missions.' },
            { id: 'REACH',     kind: 'prefix', match: 'REACH',     title: 'Reach',
              tag: 'MIL', tagColor: '#b91c1c',
              body: 'USAF Air Mobility Command airlift flights — C-5, C-17, C-130, KC-135 global logistics.' },
            { id: 'PAT',       kind: 'prefix', match: 'PAT',       title: 'Priority Air Transport',
              tag: 'ARMY', tagColor: '#047857',
              body: 'US Army transport flights (historically for senior officers). Fixed-wing and rotorcraft both use this prefix.' },
            { id: 'SPAR',      kind: 'prefix', match: 'SPAR',      title: 'Special Priority Airlift',
              tag: 'MIL', tagColor: '#b91c1c',
              body: 'USAF flights for DoD senior leaders and congressional delegations. Usually C-40B/C or C-32A out of Joint Base Andrews.' },
            { id: 'EVAC',      kind: 'prefix', match: 'EVAC',      title: 'Evac',
              tag: 'MED', tagColor: '#ec4899',
              body: 'Medical evacuation flights — typically KC-135 aeromedical or C-17 critical-care missions moving patients from forward areas.' },
            { id: 'MEDEVAC',   kind: 'prefix', match: 'MEDEVAC',   title: 'Medevac',
              tag: 'MED', tagColor: '#ec4899',
              body: 'Air medical evacuation. Often civilian helicopter EMS services; the FAA grants MEDEVAC priority handling from ATC.' },
            { id: 'LIFELN',    kind: 'prefix', match: 'LIFELN',    title: 'Lifeline',
              tag: 'MED', tagColor: '#f472b6',
              body: 'Organ-transport flights — small jets rushing donor organs between hospitals. Given ATC priority similar to MEDEVAC.' },
            { id: 'STAR',      kind: 'prefix', match: 'STAR',      title: 'Star',
              tag: 'MED', tagColor: '#ec4899',
              body: 'Regional HEMS operator callsign prefix — usually Bell 407 / EC-135 helicopter air ambulance flights.' },
            { id: 'ORNGE',     kind: 'prefix', match: 'ORNGE',     title: 'Ornge',
              tag: 'MED', tagColor: '#fb923c',
              body: 'Ornge is Ontario\'s province-wide air ambulance — fixed-wing PC-12s and AW139 helicopters.',
              link: 'https://en.wikipedia.org/wiki/Ornge' },
            { id: 'PHI',       kind: 'prefix', match: 'PHI',       title: 'PHI',
              tag: 'MED', tagColor: '#ec4899',
              body: 'PHI Air Medical + PHI Inc. — major US HEMS operator and Gulf-of-Mexico oil-platform shuttle.' },
            { id: 'BOXER',     kind: 'prefix', match: 'BOXER',     title: 'Boxer',
              tag: 'ISR', tagColor: '#7c3aed',
              body: 'E-8C Joint STARS ground-surveillance flights (now retired, but the callsign periodically reappears on drone or manned-replacement missions).',
              link: 'https://en.wikipedia.org/wiki/Northrop_Grumman_E-8_Joint_STARS' },
            { id: 'MAGMA',     kind: 'prefix', match: 'MAGMA',     title: 'Magma',
              tag: 'ISR', tagColor: '#8b5cf6',
              body: 'RC-135W Rivet Joint SIGINT — intelligence, surveillance, and reconnaissance orbits.' },
            { id: 'RCH',       kind: 'prefix', match: 'RCH',       title: 'Reach',
              tag: 'MIL', tagColor: '#b91c1c',
              body: 'Alternate prefix form of REACH — USAF Air Mobility Command airlift flights.' },
            { id: 'FORGE',     kind: 'prefix', match: 'FORGE',     title: 'Forge',
              tag: 'MIL', tagColor: '#b91c1c',
              body: 'Heavy-lift aerial refueling flights; often KC-46A Pegasus.' },
            { id: 'GLDWN',     kind: 'prefix', match: 'GLDWN',     title: 'Goldwing',
              tag: 'MIL', tagColor: '#b45309',
              body: 'USAF Gulfstream-class distinguished visitor transport missions.' },
            { id: 'KING',      kind: 'prefix', match: 'KING',      title: 'King',
              tag: 'SAR', tagColor: '#0ea5e9',
              body: 'HC-130J King — long-range fixed-wing combat search and rescue, and Coast Guard long-range SAR.' },
            { id: 'PEDRO',     kind: 'prefix', match: 'PEDRO',     title: 'Pedro',
              tag: 'SAR', tagColor: '#0284c7',
              body: 'USAF HH-60G Pave Hawk combat search and rescue rotorcraft.',
              link: 'https://en.wikipedia.org/wiki/Sikorsky_HH-60_Pave_Hawk' },
            { id: 'JOLLY',     kind: 'prefix', match: 'JOLLY',     title: 'Jolly',
              tag: 'SAR', tagColor: '#0284c7',
              body: 'HH-60W Jolly Green II — next-gen combat search and rescue helicopter. Callsign carries over from the Vietnam-era HH-53 Jolly Green Giant.' },
            { id: 'COAST',     kind: 'prefix', match: 'COAST',     title: 'Coast Guard',
              tag: 'SAR', tagColor: '#2563eb',
              body: 'US Coast Guard fixed-wing and rotary flights — fisheries patrol, maritime SAR, counter-narcotics.' },
            { id: 'RESCUE',    kind: 'prefix', match: 'RESCUE',    title: 'Rescue',
              tag: 'SAR', tagColor: '#0ea5e9',
              body: 'Generic search-and-rescue prefix, used by many national coast guards and regional SAR authorities.' },
            { id: 'PPLR',      kind: 'prefix', match: 'NOAA',      title: 'NOAA',
              tag: 'RES', tagColor: '#10b981',
              body: 'NOAA research aircraft — hurricane hunters (P-3, G-IV), atmospheric research, snow survey. N42RF / N43RF / N49RF are the hurricane-hunter tail numbers.',
              link: 'https://en.wikipedia.org/wiki/NOAA_Hurricane_Hunters' },
            { id: 'TEAL',      kind: 'prefix', match: 'TEAL',      title: 'Teal',
              tag: 'RES', tagColor: '#14b8a6',
              body: 'USAF 53rd Weather Reconnaissance Squadron — WC-130J Hurricane Hunters out of Keesler AFB.',
              link: 'https://en.wikipedia.org/wiki/53rd_Weather_Reconnaissance_Squadron' },
            { id: 'N42RF',     kind: 'exact',  match: 'N42RF',     title: 'Kermit',
              tag: 'RES', tagColor: '#10b981',
              body: 'NOAA Lockheed WP-3D "Kermit" — one of two hurricane-penetrator P-3s, named after the Muppets.' },
            { id: 'N43RF',     kind: 'exact',  match: 'N43RF',     title: 'Miss Piggy',
              tag: 'RES', tagColor: '#10b981',
              body: 'NOAA Lockheed WP-3D "Miss Piggy" — sibling to Kermit, the second hurricane-penetrator P-3.' },
            { id: 'N49RF',     kind: 'exact',  match: 'N49RF',     title: 'Gonzo',
              tag: 'RES', tagColor: '#10b981',
              body: 'NOAA Gulfstream IV-SP "Gonzo" — high-altitude weather research, flies the storm environment rather than the eye.' },
            { id: 'GTMO',      kind: 'prefix', match: 'GTMO',      title: 'Guantanamo',
              tag: 'MIL', tagColor: '#991b1b',
              body: 'Callsign commonly used by US Navy shuttle flights to Naval Station Guantánamo Bay.' },
            { id: 'BLUE',      kind: 'prefix', match: 'BLUE',      title: 'Blue Angels',
              tag: 'DEMO', tagColor: '#1d4ed8',
              body: 'US Navy Flight Demonstration Squadron — F/A-18E/F Super Hornets. Typically seen transiting between air shows.',
              link: 'https://en.wikipedia.org/wiki/Blue_Angels' },
            { id: 'THNDR',     kind: 'prefix', match: 'THNDR',     title: 'Thunderbirds',
              tag: 'DEMO', tagColor: '#dc2626',
              body: 'USAF Air Demonstration Squadron — F-16C/D. Sister team to the Blue Angels.',
              link: 'https://en.wikipedia.org/wiki/United_States_Air_Force_Thunderbirds' },
            { id: 'SNOWBIRD',  kind: 'prefix', match: 'SNOWBIRD',  title: 'Snowbirds',
              tag: 'DEMO', tagColor: '#dc2626',
              body: 'Royal Canadian Air Force 431 Air Demonstration Squadron — CT-114 Tutors.',
              link: 'https://en.wikipedia.org/wiki/Canadian_Forces_Snowbirds' },
            { id: 'CANFORCE',  kind: 'prefix', match: 'CANFORCE',  title: 'CanForce',
              tag: 'MIL', tagColor: '#ef4444',
              body: 'Royal Canadian Air Force military flights.' },
            { id: 'RRR',       kind: 'prefix', match: 'RRR',       title: 'Ascot',
              tag: 'MIL', tagColor: '#ef4444',
              body: 'RAF Brize Norton transport flights (Voyager, A400M, C-17). Spoken "Ascot" on radio despite the written prefix.' },
            { id: 'GAF',       kind: 'prefix', match: 'GAF',       title: 'German Air Force',
              tag: 'MIL', tagColor: '#ef4444',
              body: 'Luftwaffe military flights.' },
            { id: 'NATO',      kind: 'prefix', match: 'NATO',      title: 'NATO',
              tag: 'MIL', tagColor: '#1e40af',
              body: 'NATO Airborne Early Warning Force — E-3A Sentry (AWACS) out of Geilenkirchen.' },
            { id: 'UKRN',      kind: 'prefix', match: 'UKRN',      title: 'Ukrainian Government',
              tag: 'GOV', tagColor: '#fbbf24',
              body: 'Ukrainian government aircraft.' },
            { id: 'RSD',       kind: 'prefix', match: 'RSD',       title: 'Russian State',
              tag: 'GOV', tagColor: '#dc2626',
              body: 'Rossiya Special Flight Detachment — Russian government VIP transport, including the presidential fleet.' },
            { id: 'ROMEO',     kind: 'prefix', match: 'ROMEO',     title: 'Italian Air Force',
              tag: 'MIL', tagColor: '#ef4444',
              body: 'Italian Aeronautica Militare flights.' },
            { id: 'GXA',       kind: 'prefix', match: 'GXA',       title: 'French Military',
              tag: 'MIL', tagColor: '#1e40af',
              body: 'French Armée de l\'air et de l\'espace flights.' },
            { id: 'CAF',       kind: 'prefix', match: 'CAF',       title: 'Canadian Air Force',
              tag: 'MIL', tagColor: '#ef4444',
              body: 'Royal Canadian Air Force call-area flights.' },
            { id: 'CHINA',     kind: 'prefix', match: 'CHINA',     title: 'China Government',
              tag: 'GOV', tagColor: '#dc2626',
              body: 'Chinese government aircraft (CAAC, PLAAF).' },
            { id: 'NAVY',      kind: 'prefix', match: 'NAVY',      title: 'US Navy',
              tag: 'NAVY', tagColor: '#1e3a8a',
              body: 'US Navy fixed-wing and rotorcraft flights. Covers E-6B, P-8, C-40, MH-60R and others.' },
            { id: 'CNV',       kind: 'prefix', match: 'CNV',       title: 'Convoy',
              tag: 'NAVY', tagColor: '#1e3a8a',
              body: 'US Navy transport flights (C-40, C-130T).' },
            { id: 'VENUS',     kind: 'prefix', match: 'VENUS',     title: 'Swedish State',
              tag: 'GOV', tagColor: '#f59e0b',
              body: 'Swedish Air Force government VIP flights (C-130, Gulfstream IV).' },
            { id: 'RAFAIR',    kind: 'prefix', match: 'RAFAIR',    title: 'Royal Air Force',
              tag: 'MIL', tagColor: '#1e40af',
              body: 'RAF transport and refueling flights.' },
            { id: 'SWAT',      kind: 'prefix', match: 'SWAT',      title: 'Swat',
              tag: 'SOF', tagColor: '#4b5563',
              body: 'Generic US special-operations transport callsign prefix.' },
            { id: 'RCH01ZY',   kind: 'exact',  match: 'RCH01ZY',   title: 'Reach 01ZY',
              tag: 'MIL', tagColor: '#b91c1c',
              body: 'Notable C-17 callsign seen during high-profile operations and VIP evacuations.' }
        ],
        _byExact: null,
        _prefixes: null,

        // Build the fast lookup indexes lazily on first call.
        _ensureIndex() {
            if (this._byExact) return;
            this._byExact = new Map();
            this._prefixes = [];
            for (const e of this._table) {
                if (e.kind === 'exact') {
                    this._byExact.set(String(e.match).toUpperCase(), e);
                } else {
                    this._prefixes.push({ prefix: String(e.match).toUpperCase(), entry: e });
                }
            }
            // Sort prefixes longest-first so 'NIGHTWATCH' wins over 'NIGHT'.
            this._prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
        },

        // Return a lore entry for a given callsign, or null.
        lookup(callsign) {
            if (!callsign) return null;
            const cs = String(callsign).trim().toUpperCase();
            if (cs.length < 2) return null;
            this._ensureIndex();
            // 1. Exact match
            const exact = this._byExact.get(cs);
            if (exact) return exact;
            // 2. Stem match — strip a trailing digit run (e.g. DOOM12 → DOOM).
            const stem = cs.replace(/\d+$/, '');
            if (stem && stem !== cs && this._byExact.has(stem)) return this._byExact.get(stem);
            // 3. Prefix match — longest-first.
            for (const { prefix, entry } of this._prefixes) {
                if (cs === prefix || cs.startsWith(prefix)) return entry;
            }
            return null;
        },

        // Render a small "card" summarizing the lore entry; returns an
        // empty string when no match (caller can safely splice into HTML).
        cardHtml(callsign) {
            const entry = this.lookup(callsign);
            if (!entry) return '';
            const linkHtml = entry.link
                ? '<a class="lore-link" href="' + _escHtml(entry.link) + '" target="_blank" rel="noopener noreferrer">Read more ↗</a>'
                : '';
            return '<div class="lore-card">' +
                '<div class="lore-header">' +
                    '<span class="lore-chip" style="background:' + _escHtml(entry.tagColor) + '">' + _escHtml(entry.tag) + '</span>' +
                    '<span class="lore-title">' + _escHtml(entry.title) + '</span>' +
                '</div>' +
                '<p class="lore-body">' + _escHtml(entry.body) + '</p>' +
                linkHtml +
                '</div>';
        },

        // Tiny inline chip — for watchlist / list rows.
        chipHtml(callsign) {
            const entry = this.lookup(callsign);
            if (!entry) return '';
            return '<span class="lore-chip inline" style="background:' + _escHtml(entry.tagColor) + '" title="' + _escHtml(entry.title) + '">' + _escHtml(entry.tag) + '</span>';
        }
    };
