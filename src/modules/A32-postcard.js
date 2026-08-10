    // ============ SKY POSTCARD ============
    function postcardData(aircraft, now = Date.now()) {
        const values = Object.values(aircraft || {}).filter(ac => ac?.hex);
        const airborne = values.filter(ac => ac.alt_baro !== 'ground' && Number.isFinite(Number(ac.alt_baro)));
        const highest = airborne.reduce((best, ac) => Number(ac.alt_baro) > Number(best?.alt_baro || 0) ? ac : best, null);
        const fastest = values.reduce((best, ac) => Number(ac.gs) > Number(best?.gs || 0) ? ac : best, null);
        return {
            generated: new Date(now).toISOString(),
            total: values.length,
            airborne: airborne.length,
            interesting: values.filter(ac => ac.isVIP || ac.interesting || ac.militaryInfo || ac.militaryRangeInfo).length,
            military: values.filter(ac => ac.militaryInfo || ac.militaryRangeInfo).length,
            highest: highest ? { callsign: highest.flight?.trim() || highest.hex, altitude: Number(highest.alt_baro) } : null,
            fastest: fastest ? { callsign: fastest.flight?.trim() || fastest.hex, speed: Number(fastest.gs) } : null
        };
    }

    function postcardHtml(data) {
        const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const highest = data.highest ? Math.round(data.highest.altitude).toLocaleString() + ' ft · ' + escape(data.highest.callsign) : '—';
        const fastest = data.fastest ? Math.round(data.fastest.speed) + ' kt · ' + escape(data.fastest.callsign) : '—';
        return '<!doctype html><html><head><meta charset="utf-8"><title>SkyTrack · My Sky Today</title><style>@page{size:landscape;margin:0}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#e2e8f0;font:16px system-ui,sans-serif}.card{width:min(980px,88vw);padding:56px;border:2px solid #38bdf8;border-radius:24px;background:linear-gradient(135deg,#0b1d35,#102b3f);box-shadow:0 24px 70px #0008}.eyebrow{color:#7dd3fc;letter-spacing:.2em;font-size:12px;font-weight:800}.title{font-size:64px;margin:12px 0 34px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.metric{padding-top:14px;border-top:1px solid #38bdf866}.value{font-size:28px;font-weight:800}.label{color:#94a3b8;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.records{display:flex;gap:30px;margin-top:36px;color:#bae6fd}.footer{margin-top:36px;color:#94a3b8;font-size:12px}@media print{body{background:#07111f}.card{box-shadow:none}}</style></head><body><main class="card"><div class="eyebrow">SKYTRACK · LOCAL OBSERVATIONS</div><h1 class="title">My Sky Today</h1><div class="grid"><div class="metric"><div class="value">' + data.total + '</div><div class="label">Tracked</div></div><div class="metric"><div class="value">' + data.airborne + '</div><div class="label">Airborne</div></div><div class="metric"><div class="value">' + data.interesting + '</div><div class="label">Notable</div></div><div class="metric"><div class="value">' + data.military + '</div><div class="label">Military</div></div></div><div class="records"><span>Highest: ' + highest + '</span><span>Fastest: ' + fastest + '</span></div><div class="footer">Generated ' + escape(data.generated) + ' · Print this page to PDF for a postcard-sized sky report.</div></main></body></html>';
    }

    const skyPostcard = {
        data: postcardData,
        html: postcardHtml,
        print(aircraft) {
            const popup = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
            if (!popup) { if (typeof toast === 'function') toast('Allow pop-ups to print the postcard', 'warning'); return false; }
            popup.document.write(postcardHtml(postcardData(aircraft)));
            popup.document.close();
            popup.addEventListener('load', () => { popup.focus(); popup.print(); }, { once: true });
            return true;
        }
    };
