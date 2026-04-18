
    // ============ PERSONAL AIRCRAFT LOGBOOK ============
    // Quiet-background IndexedDB log of every aircraft hex the user has
    // ever seen in this app. Signature feature from the roadmap: turns
    // SkyTrack into a *return-visit* app without any server.
    //
    // For each ICAO24 hex we store:
    //   { hex, firstSeen, lastSeen, count, bestCallsign, bestType, bestReg,
    //     milEver, vipEver, emergencyEver, homeHit }
    //
    // Ingest pipeline: every refresh cycle, the main aircraft loop calls
    // `logbook.ingest(acMap)` (wired from app.js). We update the in-memory
    // mirror synchronously (for instant achievement toasts) and flush to
    // IndexedDB on a debounced 3s timer (to avoid per-second writes).
    //
    // Public surface:
    //   logbook.ingest(aircraftCache)   — call once per refresh
    //   logbook.totals()                — { uniqueHex, milSeen, vipSeen, emergencySeen }
    //   logbook.get(hex)                — single-record lookup
    //   logbook.export()                — JSON string for backup
    //   logbook.clear()                 — wipe everything (user-initiated)
    //
    // The module silently no-ops when skytrackDB (IDB wrapper) isn't
    // available — falls back to an in-memory ephemeral log so nothing
    // crashes, it just won't persist.
    const logbook = {
        _inited: false,
        _memory: new Map(),    // hex → record
        _dirty: new Set(),     // hex strings queued for flush
        _flushTimer: null,
        _flushMs: 3000,
        _store: 'logbook',
        // Session-scoped detections so we only toast once per aircraft per session.
        _toastedThisSession: new Set(),
        _sessionStart: Date.now(),

        async init() {
            if (this._inited) return;
            this._inited = true;
            // Load the existing log from IDB into the in-memory mirror.
            try {
                if (typeof skytrackDB === 'object' && skytrackDB?.db) {
                    const all = await skytrackDB.loadAllFromStore(this._store).catch(() => []);
                    if (Array.isArray(all)) {
                        for (const rec of all) {
                            if (rec?.hex && typeof rec.hex === 'string') {
                                this._memory.set(rec.hex.toUpperCase(), rec);
                            }
                        }
                    }
                }
            } catch (_) { /* fall through to memory-only */ }
            _dbg('Logbook loaded:', this._memory.size, 'aircraft');
        },

        // Update or insert one record synchronously in the in-memory mirror.
        _touch(ac) {
            if (!ac || typeof ac.hex !== 'string') return null;
            const hex = ac.hex.toUpperCase();
            const now = Date.now();
            const prev = this._memory.get(hex);
            const rec = prev || { hex, firstSeen: now, lastSeen: now, count: 0 };
            rec.lastSeen = now;
            rec.count = (rec.count | 0) + 1;
            // Track best-known enrichment (once we know it, keep it).
            const cs = (ac.flight || '').trim();
            if (cs && !rec.bestCallsign) rec.bestCallsign = cs;
            if (ac.t && !rec.bestType)     rec.bestType = String(ac.t).toUpperCase();
            if (ac.r && !rec.bestReg)      rec.bestReg  = String(ac.r).toUpperCase();
            if (!rec.milEver && (ac.militaryInfo || ac.isMilitary || ac.militaryRangeInfo)) rec.milEver = true;
            if (!rec.vipEver && ac.isVIP) rec.vipEver = true;
            const sq = ac.squawk;
            if (!rec.emergencyEver && (sq === '7500' || sq === '7600' || sq === '7700')) rec.emergencyEver = true;
            this._memory.set(hex, rec);
            this._dirty.add(hex);
            return { rec, isNew: !prev };
        },

        // Called each refresh. Updates the mirror, emits a one-off "first seen"
        // toast for genuinely new hexes, and schedules a debounced IDB flush.
        ingest(acMap) {
            if (!acMap) return;
            const entries = Array.isArray(acMap) ? acMap : Object.values(acMap);
            for (const ac of entries) {
                if (!ac) continue;
                const res = this._touch(ac);
                if (res && res.isNew && !this._toastedThisSession.has(res.rec.hex)) {
                    this._toastedThisSession.add(res.rec.hex);
                    // Don't toast on the very first load — only while the app
                    // is live and the user is looking. A 15-second grace is
                    // enough for the initial batch to settle.
                    if (Date.now() - this._sessionStart > 15000 && typeof toast === 'function') {
                        const label = res.rec.bestCallsign || res.rec.bestReg || res.rec.hex;
                        toast('First time seen: ' + label);
                    }
                }
            }
            this._scheduleFlush();
        },

        _scheduleFlush() {
            if (this._flushTimer) return;
            this._flushTimer = setTimeout(() => {
                this._flushTimer = null;
                this._flush();
            }, this._flushMs);
        },

        async _flush() {
            if (this._dirty.size === 0) return;
            const toWrite = [];
            for (const hex of this._dirty) {
                const rec = this._memory.get(hex);
                if (rec) toWrite.push(rec);
            }
            this._dirty.clear();
            try {
                if (typeof skytrackDB === 'object' && skytrackDB?.db && typeof skytrackDB.putMany === 'function') {
                    await skytrackDB.putMany(this._store, toWrite).catch(() => {});
                }
            } catch (_) { /* memory-only is fine */ }
        },

        get(hex) {
            if (!hex) return null;
            return this._memory.get(String(hex).toUpperCase()) || null;
        },

        totals() {
            let milSeen = 0, vipSeen = 0, emergencySeen = 0;
            for (const rec of this._memory.values()) {
                if (rec.milEver) milSeen++;
                if (rec.vipEver) vipSeen++;
                if (rec.emergencyEver) emergencySeen++;
            }
            return {
                uniqueHex: this._memory.size,
                milSeen, vipSeen, emergencySeen
            };
        },

        export() {
            return JSON.stringify([...this._memory.values()], null, 2);
        },

        async clear() {
            this._memory.clear();
            this._dirty.clear();
            this._toastedThisSession.clear();
            try {
                if (typeof skytrackDB === 'object' && skytrackDB?.db && typeof skytrackDB.clearStore === 'function') {
                    await skytrackDB.clearStore(this._store).catch(() => {});
                }
            } catch (_) {}
        }
    };
