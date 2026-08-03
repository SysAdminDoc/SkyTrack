
    // ============ DIAGNOSTICS COPY-REPORT ============
    // Builds a JSON-formatted diagnostic report and copies it to the
    // clipboard (or downloads it as .json if the clipboard is blocked).
    // The aim: kill the "please describe the bug" round-trip — a user
    // hitting a glitch can click one button and paste a single blob
    // that captures enough state for a remote debug.
    //
    // The report deliberately excludes user-identifying data:
    //   * No watchlist contents, no bookmark locations, no home coord.
    //   * Geolocation-derived `userLocation` is omitted.
    // What IS included: build / module inventory, recent error ring,
    // circuit-breaker state, data-source health, browser fingerprint
    // (UA + viewport + language), feature-toggle snapshot.
    const diagnostics = {
        build() {
            const report = {
                schema: 1,
                generatedAt: new Date().toISOString(),
                version: this._versionString(),
                userAgent: navigator.userAgent,
                platform: navigator.platform || null,
                language: navigator.language || null,
                viewport: {
                    w: window.innerWidth,
                    h: window.innerHeight,
                    dpr: window.devicePixelRatio || 1,
                    online: !!navigator.onLine
                },
                modules: this._modules(),
                errors: this._recentErrors(),
                circuitBreakers: this._circuitState(),
                dataSources: this._sourceHealth(),
                settings: this._safeSettings(),
                features: this._featureToggles(),
                storage: this._storageSummary()
            };
            return report;
        },

        _versionString() {
            try {
                const titleVer = document.querySelector('.version');
                return titleVer?.textContent || null;
            } catch (_) { return null; }
        },

        _modules() {
            // Enumerate known module symbols at script scope. This is a
            // manual list rather than a reflection loop because script-scope
            // `const` bindings aren't enumerable on `window`.
            const known = [
                'CONFIG','DATA_URLS','errorHandler','perfUtils',
                'connectionMonitor','offlineManager','dataSourceManager','autoRetry','errorRecovery','circuitBreakers',
                'skytrackDB','weatherSystem','weatherOverlay','alertSystem',
                'rangeRings','phaseClassifier','countryFlag','emergencyPulse','surveillanceOrbit','firesHurricanes','planeOverHome',
                'callsignLore','whyHere','logbook','faaOverlays','issTracker','satellite3D','openSkyTracks',
                'measureTool','playbackController','geofences','routePredictor','miniMap',
                'flightCard','sceneUrl','diagnostics'
            ];
            const loaded = {};
            for (const sym of known) {
                try {
                    // eval is the script-scope escape hatch; typeof is the
                    // only way to probe without throwing a ReferenceError.
                    loaded[sym] = new Function('try{return typeof ' + sym + "!=='undefined';}catch(_){return false;}")();
                } catch (_) {
                    loaded[sym] = false;
                }
            }
            return loaded;
        },

        _recentErrors() {
            try {
                if (typeof errorHandler === 'object' && typeof errorHandler.getRecent === 'function') {
                    return errorHandler.getRecent(20);
                }
            } catch (_) {}
            return [];
        },

        _circuitState() {
            try {
                if (typeof circuitBreakers !== 'object') return null;
                const out = {};
                for (const key in circuitBreakers) {
                    const cb = circuitBreakers[key];
                    if (!cb) continue;
                    out[key] = {
                        state: cb.state || null,
                        failureCount: cb.failureCount || 0,
                        lastFailTime: cb.lastFailTime || null
                    };
                }
                return out;
            } catch (_) { return null; }
        },

        _sourceHealth() {
            try {
                if (typeof dataSourceManager !== 'object') return null;
                return (dataSourceManager.sources || []).map(s => ({
                    key: s.key, name: s.name, status: s.status,
                    latency: s.latency, errorCount: s.errorCount,
                    lastSuccess: s.lastSuccess, lastError: s.lastError
                }));
            } catch (_) { return null; }
        },

        _safeSettings() {
            // `settings` contains map/theme preferences, no PII.
            try {
                if (typeof settings !== 'object') return null;
                const allow = ['mapStyle','showLabels','showAirports','showRadar',
                    'altitudeColors','showWiki','showInterestingBadges','filter',
                    'followMode','compactMode'];
                const out = {};
                for (const k of allow) if (k in settings) out[k] = settings[k];
                return out;
            } catch (_) { return null; }
        },

        _featureToggles() {
            const out = {};
            try { out.rangeRings = !!rangeRings?.enabled; } catch (_) {}
            try { out.firesHurricanes = !!firesHurricanes?.enabled; } catch (_) {}
            try { out.planeOverHome = !!planeOverHome?.enabled; } catch (_) {}
            try { out.issTracker = !!issTracker?.enabled; } catch (_) {}
            try { out.satellite3D = satellite3D?.stats?.() || null; } catch (_) {}
            try { out.openSkyTracks = openSkyTracks?.stats?.() || null; } catch (_) {}
            try { out.faaArtcc = !!faaOverlays?.layers?.artcc?.enabled; } catch (_) {}
            try { out.faaTracon = !!faaOverlays?.layers?.tracon?.enabled; } catch (_) {}
            try { out.faaAirways = !!faaOverlays?.layers?.airways?.enabled; } catch (_) {}
            return out;
        },

        _storageSummary() {
            const out = { idbVersion: null, keys: [] };
            try {
                if (typeof skytrackDB === 'object' && skytrackDB?.db) {
                    out.idbVersion = skytrackDB.db.version;
                    out.keys = Array.from(skytrackDB.db.objectStoreNames || []);
                }
            } catch (_) {}
            try {
                if (navigator.storage?.estimate) {
                    navigator.storage.estimate().then(est => {
                        // We can't block on this — but attaching a `_later` sentinel
                        // signals the caller to ignore quota if absent.
                        out._quotaEstimate = est;
                    }).catch(() => {});
                }
            } catch (_) {}
            return out;
        },

        async copy() {
            const report = this.build();
            const text = JSON.stringify(report, null, 2);
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    if (typeof toast === 'function') toast('Diagnostic report copied to clipboard');
                    return true;
                }
            } catch (_) {}
            // Fallback: download as .json.
            try {
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'skytrack-diagnostics.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                if (typeof toast === 'function') toast('Diagnostic report downloaded');
                return true;
            } catch (_) {
                if (typeof toast === 'function') toast('Diagnostic copy failed');
                return false;
            }
        }
    };
