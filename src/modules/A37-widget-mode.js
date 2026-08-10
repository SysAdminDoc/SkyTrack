    // ============ NEAREST-AIRCRAFT WIDGET MODE ============
    function nearestAircraft(aircraft, center = { lat: 0, lon: 0 }) {
        return Object.values(aircraft || {}).filter(ac => ac?.hex && Number.isFinite(Number(ac.lat)) && Number.isFinite(Number(ac.lon))).map(ac => {
            const dLat = Number(ac.lat) - Number(center.lat || 0), dLon = (Number(ac.lon) - Number(center.lon || 0)) * Math.cos(Number(center.lat || 0) * Math.PI / 180);
            return { ac, distance: Math.hypot(dLat, dLon) };
        }).sort((a, b) => a.distance - b.distance)[0]?.ac || null;
    }

    const nearestWidget = {
        enabled: false,
        panel: null,
        init() {
            const params = new URLSearchParams(location.search);
            if (params.get('widget') !== 'nearest') return;
            this.enabled = true;
            this.panel = document.createElement('aside');
            this.panel.className = 'nearest-widget';
            this.panel.innerHTML = '<div class="nearest-widget-title">NEAREST AIRCRAFT</div><div id="nearestWidgetContent">Waiting for traffic…</div>';
            document.body.appendChild(this.panel);
            document.body.classList.add('widget-mode');
        },
        update(aircraft) {
            if (!this.enabled || !this.panel) return;
            const mapCenter = typeof map !== 'undefined' ? map?.getCenter?.() : { lat: 0, lng: 0 };
            const ac = nearestAircraft(aircraft, { lat: mapCenter?.lat || 0, lon: mapCenter?.lng || 0 });
            const content = this.panel.querySelector('#nearestWidgetContent');
            if (!content) return;
            if (!ac) { content.textContent = 'Waiting for traffic…'; return; }
            content.innerHTML = '<strong>' + _escHtml(ac.flight?.trim() || ac.hex) + '</strong><span>' + _escHtml(ac.t || 'Aircraft') + '</span><span>' + (Number.isFinite(Number(ac.alt_baro)) ? Math.round(Number(ac.alt_baro)).toLocaleString() + ' ft' : 'GROUND') + ' · ' + (Number.isFinite(Number(ac.gs)) ? Math.round(Number(ac.gs)) + ' kt' : '—') + '</span>';
            content.onclick = () => { if (typeof selectAircraft === 'function') selectAircraft(ac.hex); };
        }
    };

    if (typeof document !== 'undefined') nearestWidget.init();
