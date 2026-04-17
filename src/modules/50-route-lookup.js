
    // ============ ROUTE API LOOKUP (adsbdb + hexdb fallback) ============
    // When the static routes.csv / tar1090-db doesn't know a callsign,
    // fall back to adsbdb.com then hexdb.io, which together cover ~400k routes.
    // Both are CORS-enabled and rate-limit tolerant for on-demand calls.
    const routeApiLookup = {
        cache: new Map(),      // callsign -> { from, to, ts } | null
        negativeTtl: 900000,   // 15 min for misses
        positiveTtl: 14400000, // 4 h for hits
        inflight: new Map(),   // callsign -> Promise

        _key(callsign) {
            return (callsign || '').toString().trim().toUpperCase();
        },

        async get(callsign) {
            const key = this._key(callsign);
            if (!key || !/^[A-Z0-9]{3,8}$/.test(key)) return null;
            const hit = this.cache.get(key);
            if (hit !== undefined) {
                const ttl = hit ? this.positiveTtl : this.negativeTtl;
                if (Date.now() - (hit?.ts || 0) < ttl) return hit || null;
            }
            if (this.inflight.has(key)) return this.inflight.get(key);
            const p = this._fetch(key);
            this.inflight.set(key, p);
            try {
                return await p;
            } finally {
                this.inflight.delete(key);
            }
        },

        async _fetch(key) {
            // Try adsbdb first — returns full origin/midpoint/destination.
            try {
                const resp = await fetch('https://api.adsbdb.com/v2/callsign/' + encodeURIComponent(key), {
                    signal: AbortSignal.timeout(6000)
                });
                if (resp.ok) {
                    const json = await resp.json();
                    const fr = json?.response?.flightroute;
                    if (fr?.origin?.icao_code && fr?.destination?.icao_code) {
                        const rec = { from: fr.origin.icao_code, to: fr.destination.icao_code, ts: Date.now(), source: 'adsbdb' };
                        this.cache.set(key, rec);
                        return rec;
                    }
                }
            } catch (_) { /* fall through */ }
            // hexdb fallback.
            try {
                const resp = await fetch('https://hexdb.io/api/v1/route/icao/' + encodeURIComponent(key), {
                    signal: AbortSignal.timeout(6000)
                });
                if (resp.ok) {
                    const text = (await resp.text()).trim();
                    // hexdb returns "KORD-KLAX" or "unknown"; guard against both.
                    if (text && text !== 'unknown' && text.includes('-')) {
                        const [from, to] = text.split('-').map(s => s.trim().toUpperCase());
                        if (/^[A-Z0-9]{3,4}$/.test(from) && /^[A-Z0-9]{3,4}$/.test(to)) {
                            const rec = { from, to, ts: Date.now(), source: 'hexdb' };
                            this.cache.set(key, rec);
                            return rec;
                        }
                    }
                }
            } catch (_) { /* fall through */ }
            // Cache miss so we don't hammer the APIs on every redraw.
            this.cache.set(key, { ts: Date.now(), from: null, to: null, miss: true });
            return null;
        }
    };
