
    // ============ FLIGHT CARD ============
    // Offscreen-canvas renderer that turns the currently-selected
    // aircraft into a 900×470 shareable PNG card: banner + callsign +
    // registration + route + altitude/speed/heading + phase chip +
    // LOITER badge if applicable + "captured from SkyTrack" footer.
    //
    // The card is composed entirely from strings already safe in the
    // aircraft record (no live-feed HTML is rendered — we draw text
    // via Canvas 2D, which is inherently XSS-safe). Result is pushed
    // to the clipboard as `image/png` via `ClipboardItem`. Browsers
    // that refuse raw-image clipboard writes (older Firefox) fall
    // back to a download via <a href="data:..."> click.
    //
    // Public: flightCard.copy(hex) — returns Promise<bool>.
    const flightCard = {
        W: 900,
        H: 470,

        _colors: {
            bg1:     '#0b1220',
            bg2:     '#1f2937',
            border:  '#1e293b',
            accent:  '#3b82f6',
            text:    '#e2e8f0',
            subtext: '#94a3b8',
            rule:    '#1e293b'
        },

        // Pick the most-informative chip color for the aircraft's phase.
        _phaseColor(p) {
            return ({
                ground:'#9ca3af', taxi:'#facc15', takeoff:'#f97316',
                climb:'#22c55e', cruise:'#3b82f6', descent:'#8b5cf6',
                approach:'#ec4899', landing:'#ef4444'
            })[p] || '#64748b';
        },

        // Draw a tag-pill; returns the x pixel after the pill.
        _drawPill(ctx, x, y, text, fill, fg = '#fff') {
            ctx.save();
            ctx.font = 'bold 14px system-ui, sans-serif';
            const pad = 10;
            const w = ctx.measureText(text).width + pad * 2;
            const h = 22;
            ctx.fillStyle = fill;
            // Rounded rect
            const r = 4;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = fg;
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + pad, y + h / 2);
            ctx.restore();
            return x + w + 8;
        },

        _render(ac) {
            const canvas = document.createElement('canvas');
            canvas.width = this.W;
            canvas.height = this.H;
            const ctx = canvas.getContext('2d');

            // Background: vertical gradient.
            const grad = ctx.createLinearGradient(0, 0, 0, this.H);
            grad.addColorStop(0, this._colors.bg1);
            grad.addColorStop(1, this._colors.bg2);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.W, this.H);

            // Accent stripe along the left edge.
            ctx.fillStyle = this._colors.accent;
            ctx.fillRect(0, 0, 6, this.H);

            // SkyTrack wordmark (top-right).
            ctx.fillStyle = this._colors.subtext;
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'right';
            ctx.fillText('SkyTrack', this.W - 28, 24);

            // Callsign (title).
            ctx.textAlign = 'left';
            ctx.fillStyle = this._colors.text;
            ctx.font = 'bold 52px system-ui, sans-serif';
            const callsign = (ac.flight || '').trim() || ac.r || ac.hex;
            ctx.fillText(callsign, 40, 36);

            // Subtitle: type + reg + hex.
            ctx.font = '18px system-ui, sans-serif';
            ctx.fillStyle = this._colors.subtext;
            const subtitleBits = [];
            if (ac.t)   subtitleBits.push(ac.t);
            if (ac.r)   subtitleBits.push(ac.r);
            if (ac.hex) subtitleBits.push(ac.hex.toUpperCase());
            if (subtitleBits.length) ctx.fillText(subtitleBits.join('  ·  '), 40, 106);

            // Pill row: phase + emergency + LOITER + VIP + MIL.
            let pillX = 40;
            const pillY = 150;
            try {
                if (typeof phaseClassifier === 'object') {
                    const phase = phaseClassifier.classify(ac);
                    if (phase) pillX = this._drawPill(ctx, pillX, pillY, phase.toUpperCase(), this._phaseColor(phase));
                }
            } catch (_) {}
            if (ac.squawk === '7500' || ac.squawk === '7600' || ac.squawk === '7700') {
                pillX = this._drawPill(ctx, pillX, pillY, 'EMERGENCY ' + ac.squawk, '#ef4444');
            }
            if (ac.surveillanceOrbit) {
                pillX = this._drawPill(ctx, pillX, pillY, 'LOITER', '#8b5cf6');
            }
            if (ac.isVIP)      pillX = this._drawPill(ctx, pillX, pillY, 'VIP',      '#2563eb');
            if (ac.isMilitary || ac.militaryInfo) pillX = this._drawPill(ctx, pillX, pillY, 'MILITARY', '#b91c1c');

            // Two-column metric grid.
            ctx.font = 'bold 14px system-ui, sans-serif';
            ctx.fillStyle = this._colors.subtext;
            const metrics = [];
            metrics.push(['ALTITUDE',
                ac.alt_baro === 'ground' ? 'GROUND' :
                (Number.isFinite(ac.alt_baro) ? ac.alt_baro.toLocaleString() + ' ft' : '—')]);
            metrics.push(['GROUND SPEED', Number.isFinite(ac.gs) ? Math.round(ac.gs) + ' kt' : '—']);
            metrics.push(['HEADING',      Number.isFinite(ac.track) ? Math.round(ac.track) + '°' : '—']);
            metrics.push(['VERTICAL',
                Number.isFinite(ac.baro_rate) ? ((ac.baro_rate > 0 ? '+' : '') + ac.baro_rate.toLocaleString() + ' fpm') : '—']);

            if (ac.from || ac.to) metrics.push(['ROUTE', (ac.from || '???') + '  →  ' + (ac.to || '???')]);
            if (ac.airlineName)   metrics.push(['OPERATOR', ac.airlineName]);
            if (ac.year)          metrics.push(['YEAR', String(ac.year)]);
            if (Number.isFinite(ac.lat) && Number.isFinite(ac.lon)) {
                metrics.push(['POSITION', ac.lat.toFixed(3) + ',  ' + ac.lon.toFixed(3)]);
            }

            const colX = [40, 470];
            const rowH = 54;
            const startY = 200;
            for (let i = 0; i < metrics.length; i++) {
                const col = i % 2, row = Math.floor(i / 2);
                const x = colX[col], y = startY + row * rowH;
                ctx.fillStyle = this._colors.subtext;
                ctx.font = 'bold 12px system-ui, sans-serif';
                ctx.fillText(metrics[i][0], x, y);
                ctx.fillStyle = this._colors.text;
                ctx.font = 'bold 22px system-ui, sans-serif';
                ctx.fillText(metrics[i][1], x, y + 18);
            }

            // Footer rule + line.
            ctx.strokeStyle = this._colors.rule;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(40, this.H - 44);
            ctx.lineTo(this.W - 40, this.H - 44);
            ctx.stroke();
            ctx.fillStyle = this._colors.subtext;
            ctx.font = '13px system-ui, sans-serif';
            const when = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
            ctx.fillText('Captured ' + when + ' · skytrack', 40, this.H - 30);

            return canvas;
        },

        async copy(hex) {
            const target = hex || (typeof selectedHex === 'string' ? selectedHex : null);
            if (!target || typeof aircraftCache !== 'object' || !aircraftCache[target]) {
                if (typeof toast === 'function') toast('Select an aircraft first');
                return false;
            }
            const ac = aircraftCache[target];
            const canvas = this._render(ac);
            try {
                if (window.ClipboardItem && navigator.clipboard?.write) {
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                    if (!blob) throw new Error('toBlob null');
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    if (typeof toast === 'function') toast('Flight card copied to clipboard');
                    return true;
                }
            } catch (e) {
                try { errorHandler?.log('Flight card copy', e?.message || e); } catch (_) {}
            }
            // Fallback: download the PNG.
            try {
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                const label = (ac.flight?.trim() || ac.r || ac.hex || 'flight').replace(/[^A-Za-z0-9._-]/g, '_');
                a.href = dataUrl;
                a.download = label + '.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                if (typeof toast === 'function') toast('Flight card downloaded');
                return true;
            } catch (_) {
                if (typeof toast === 'function') toast('Card generation failed');
                return false;
            }
        }
    };
