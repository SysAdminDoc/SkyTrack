
    // ============ OPENSKY HISTORICAL TRACKS ============
    // OpenSky's track endpoint returns a compact path in metres. Keep the
    // browser-facing shape compatible with the existing trail renderer:
    // [unixSeconds, latitude, longitude, altitudeFeet, trueTrack, onGround].
    const openSkyTracks = {
        API_URL: 'https://opensky-network.org/api/tracks/all',
        AUTH_URL: 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
        cache: new Map(),
        cacheTtlMs: 10 * 60 * 1000,
        historicalCacheTtlMs: 24 * 60 * 60 * 1000,
        accessToken: null,
        tokenExpiresAt: 0,
        requestCount: 0,
        lastSource: '',
        lastError: '',

        _credentials() {
            try {
                if (typeof apiCredentials === 'object' && apiCredentials?.clientId && apiCredentials?.clientSecret) {
                    return apiCredentials;
                }
            } catch (_) {}
            try {
                const stored = JSON.parse(localStorage.getItem('skytrack_api_credentials') || 'null');
                if (stored?.clientId && stored?.clientSecret) return stored;
            } catch (_) {}
            return null;
        },

        _requestTimeout(url, options = {}, timeout = 12000) {
            if (typeof errorHandler === 'object' && typeof errorHandler?.fetchWithTimeout === 'function') {
                return errorHandler.fetchWithTimeout(url, options, timeout);
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            return fetch(url, { ...options, signal: controller.signal })
                .finally(() => clearTimeout(timer));
        },

        async _getAccessToken() {
            const credentials = this._credentials();
            if (!credentials) return null;
            if (this.accessToken && Date.now() < this.tokenExpiresAt - 30000) return this.accessToken;

            const body = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: credentials.clientId,
                client_secret: credentials.clientSecret
            });
            const response = await this._requestTimeout(this.AUTH_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            if (!response.ok) throw new Error('OpenSky authentication ' + response.status);
            const payload = await response.json();
            if (!payload?.access_token) throw new Error('OpenSky authentication returned no token');
            this.accessToken = payload.access_token;
            this.tokenExpiresAt = Date.now() + Math.max(60000, Number(payload.expires_in || 300) * 1000);
            return this.accessToken;
        },

        async _requestTrack(url, token) {
            const headers = token ? { Authorization: 'Bearer ' + token } : {};
            let directResponse = null;
            let directError = null;
            try {
                directResponse = await this._requestTimeout(url, { headers });
                if (directResponse.ok || directResponse.status === 404) {
                    this.lastSource = 'direct';
                    return directResponse;
                }
            } catch (error) {
                directError = error;
            }

            // OpenSky's API has historically varied its browser CORS policy.
            // Anonymous requests may use the configured public proxy chain;
            // never send a user's OAuth bearer token through a third party.
            if (!token && typeof fetchWithProxy === 'function') {
                try {
                    const proxied = await fetchWithProxy(url);
                    if (proxied) {
                        this.lastSource = 'proxy';
                        return proxied;
                    }
                } catch (_) {}
            }
            if (directResponse) return directResponse;
            throw directError || new Error('OpenSky request failed');
        },

        _cacheKey(hex, time) {
            return String(hex).toLowerCase() + ':' + String(time || 0);
        },

        _cacheTtl(time) {
            return time ? this.historicalCacheTtlMs : this.cacheTtlMs;
        },

        async _readCache(key, time) {
            const memory = this.cache.get(key);
            if (memory && Date.now() - memory.timestamp < this._cacheTtl(time)) return memory.data;
            if (memory) this.cache.delete(key);
            try {
                if (typeof skytrackDB === 'object' && typeof skytrackDB.loadDatabase === 'function') {
                    const stored = await skytrackDB.loadDatabase('opensky-track-' + key.replace(':', '-'));
                    if (stored) {
                        this.cache.set(key, { data: stored, timestamp: Date.now() });
                        return stored;
                    }
                }
            } catch (_) {}
            return null;
        },

        async _writeCache(key, time, data) {
            const record = { data, timestamp: Date.now() };
            this.cache.set(key, record);
            try {
                if (typeof skytrackDB === 'object' && typeof skytrackDB.saveDatabase === 'function') {
                    await skytrackDB.saveDatabase('opensky-track-' + key.replace(':', '-'), data, this._cacheTtl(time));
                }
            } catch (_) {}
        },

        _normalize(payload) {
            if (!payload || !Array.isArray(payload.path)) return null;
            const path = payload.path.map(point => {
                if (!Array.isArray(point) || point.length < 3) return null;
                if (point[0] === null || point[0] === undefined || point[1] === null || point[1] === undefined || point[2] === null || point[2] === undefined) return null;
                const time = Number(point[0]);
                const lat = Number(point[1]);
                const lon = Number(point[2]);
                if (![time, lat, lon].every(Number.isFinite) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
                const metres = Number(point[3]);
                const altitude = Number.isFinite(metres) ? Math.max(0, metres / 0.3048) : 0;
                const track = Number(point[4]);
                return [time, lat, lon, altitude, Number.isFinite(track) ? track : 0, point[5] === true];
            }).filter(Boolean);
            if (path.length < 2) return null;
            return {
                source: 'opensky',
                icao24: String(payload.icao24 || '').toLowerCase(),
                callsign: String(payload.callsign || '').trim(),
                startTime: Number(payload.startTime) || path[0][0],
                endTime: Number(payload.endTime) || path[path.length - 1][0],
                path
            };
        },

        async _fetchTrack(hex, time) {
            const url = this.API_URL + '?icao24=' + encodeURIComponent(hex) + '&time=' + encodeURIComponent(String(time));
            this.requestCount++;
            let token = null;
            try { token = await this._getAccessToken(); } catch (error) {
                this.lastError = error?.message || String(error);
            }
            let response = await this._requestTrack(url, token);
            if (token && (response?.status === 401 || response?.status === 403)) {
                this.accessToken = null;
                this.tokenExpiresAt = 0;
                response = await this._requestTrack(url, null);
            }
            if (response?.status === 404) return null;
            if (!response?.ok) throw new Error('OpenSky tracks ' + (response?.status || 'unavailable'));
            const normalized = this._normalize(await response.json());
            if (!normalized) return null;
            return normalized;
        },

        async getTrack(hex, options = {}) {
            const normalizedHex = String(hex || '').trim().toLowerCase();
            if (!/^[0-9a-f]{6}$/.test(normalizedHex)) return null;
            const requestedTime = Math.max(0, Math.floor(Number(options.time) || 0));
            const fallbackTime = Math.max(0, Math.floor(Number(options.fallbackTime) || 0));
            const candidates = [...new Set([requestedTime, fallbackTime])];
            let lastError = null;
            for (const time of candidates) {
                const key = this._cacheKey(normalizedHex, time);
                const cached = await this._readCache(key, time);
                if (cached) return cached;
                try {
                    const track = await this._fetchTrack(normalizedHex, time);
                    if (track) {
                        await this._writeCache(key, time, track);
                        this.lastError = '';
                        return track;
                    }
                } catch (error) {
                    lastError = error;
                    this.lastError = error?.message || String(error);
                }
            }
            if (lastError) throw lastError;
            return null;
        },

        stats() {
            return {
                cachedTracks: this.cache.size,
                requests: this.requestCount,
                lastSource: this.lastSource || null,
                lastError: this.lastError || null,
                authenticated: !!this.accessToken
            };
        }
    };
