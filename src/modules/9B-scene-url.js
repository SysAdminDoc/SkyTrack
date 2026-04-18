
    // ============ SCENE URL (shareable view state) ============
    // Serializes the current "view state" of SkyTrack — map position +
    // zoom + selected-aircraft hex + active theme + filter — into a
    // compact, URL-safe base64 payload that lives in the hash fragment.
    // Recipients opening the link land on the same scene.
    //
    // Hash fragment (rather than query string) keeps the scene token
    // out of server logs, and — unlike shareManager's deep-link which
    // names individual params — one opaque token survives future schema
    // changes behind a single version byte.
    //
    // Public API:
    //   sceneUrl.capture()     → string URL  (call from a "Copy scene" button)
    //   sceneUrl.restore()     → boolean     (call once at startup)
    //   sceneUrl.copy()        → Promise<bool> (writes to clipboard, toasts)
    //
    // This is complementary to `shareManager` (module in app.js): that
    // handles `?hex=...&lat=...&lon=...&zoom=...` deep links for a
    // single aircraft selection. This module captures the *whole view*
    // (filter, theme, selection) as one token so you can share "the
    // exact state I'm looking at right now".
    const sceneUrl = {
        _VERSION: 1,

        // Build a JSON blob describing the current scene.
        _snapshot() {
            const snap = { v: this._VERSION, t: Date.now() };
            try {
                if (typeof map !== 'undefined' && map) {
                    const c = map.getCenter();
                    if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
                        snap.lat = +c.lat.toFixed(4);
                        snap.lon = +c.lng.toFixed(4);
                        snap.z = map.getZoom();
                    }
                }
            } catch (_) {}
            try {
                if (typeof selectedHex === 'string' && /^[A-F0-9]{6}$/i.test(selectedHex)) {
                    snap.hex = selectedHex.toUpperCase();
                }
            } catch (_) {}
            try {
                if (typeof settings === 'object' && settings) {
                    if (settings.mapStyle) snap.ms = String(settings.mapStyle);
                    if (settings.filter)   snap.f  = String(settings.filter);
                }
            } catch (_) {}
            try {
                const theme = localStorage.getItem('skytrack_theme');
                if (theme) snap.th = JSON.parse(theme);
            } catch (_) {}
            return snap;
        },

        // Base64url encode a JSON string — small, URL-safe, no padding.
        _encode(obj) {
            const json = JSON.stringify(obj);
            try {
                return btoa(unescape(encodeURIComponent(json)))
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            } catch (_) {
                return null;
            }
        },

        _decode(token) {
            if (!token) return null;
            try {
                const s = token.replace(/-/g, '+').replace(/_/g, '/');
                const pad = s + '='.repeat((4 - s.length % 4) % 4);
                return JSON.parse(decodeURIComponent(escape(atob(pad))));
            } catch (_) { return null; }
        },

        capture() {
            const token = this._encode(this._snapshot());
            if (!token) return window.location.href;
            const url = new URL(window.location.href);
            url.hash = 'scene=' + token;
            return url.toString();
        },

        // Restore from the hash fragment on boot. Returns true if a scene
        // was applied.
        restore() {
            if (!window.location.hash) return false;
            const m = window.location.hash.match(/scene=([A-Za-z0-9_\-]+)/);
            if (!m) return false;
            const snap = this._decode(m[1]);
            if (!snap || typeof snap !== 'object') return false;
            if (snap.v !== this._VERSION) return false;
            // Clamp + sanity-check every restored value. A crafted scene URL
            // should not be able to push the map off-world.
            if (Number.isFinite(snap.lat) && Number.isFinite(snap.lon) && Number.isFinite(snap.z)) {
                const lat = Math.max(-85, Math.min(85, snap.lat));
                const lon = Math.max(-180, Math.min(180, snap.lon));
                const z   = Math.max(2, Math.min(20, snap.z));
                try { if (typeof map !== 'undefined' && map) map.setView([lat, lon], z); } catch (_) {}
            }
            if (typeof snap.ms === 'string') {
                try { if (typeof settings === 'object') settings.mapStyle = snap.ms; } catch (_) {}
            }
            if (typeof snap.f === 'string') {
                try { if (typeof settings === 'object') settings.filter = snap.f; } catch (_) {}
            }
            if (typeof snap.hex === 'string' && /^[A-F0-9]{6}$/.test(snap.hex)) {
                // Delay-select: aircraftCache may not be populated yet.
                setTimeout(() => {
                    try {
                        if (typeof selectAircraft === 'function' &&
                            typeof aircraftCache === 'object' &&
                            aircraftCache[snap.hex]) {
                            selectAircraft(snap.hex);
                        }
                    } catch (_) {}
                }, 2500);
            }
            return true;
        },

        async copy() {
            const url = this.capture();
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    if (typeof toast === 'function') toast('Scene URL copied to clipboard');
                    return true;
                }
            } catch (_) {}
            // Fallback: temporary textarea select-copy path.
            try {
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.setAttribute('readonly', '');
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok && typeof toast === 'function') toast('Scene URL copied');
                return ok;
            } catch (_) {
                if (typeof toast === 'function') toast('Copy failed — long-press the URL bar');
                return false;
            }
        }
    };
