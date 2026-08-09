
    // ============ SELECTED AIRCRAFT ALTITUDE TAPE ============
    // A compact, dependency-free gauge for the selected-aircraft panel. The
    // model is kept pure so its scale and trend rules can be verified without
    // a browser or a charting library.
    const ALTITUDE_TAPE_ROW_COUNT = 7;

    function altitudeTapeModel(altitude, verticalRate) {
        const isGround = altitude === 'ground' || altitude === 0;
        const parsedAltitude = Number(altitude);
        const current = isGround ? 0 : (Number.isFinite(parsedAltitude) ? Math.max(0, parsedAltitude) : null);
        const rate = Number(verticalRate);
        const trend = Number.isFinite(rate) && rate > 100 ? 'up' : (Number.isFinite(rate) && rate < -100 ? 'down' : 'level');
        const step = current === null ? 5000 : (current < 10000 ? 1000 : (current < 30000 ? 2500 : 5000));
        const center = current === null ? 0 : Math.round(current / step) * step;
        const ticks = Array.from({ length: ALTITUDE_TAPE_ROW_COUNT }, (_, index) => Math.max(0, center + (3 - index) * step));
        const display = current === null ? '---' : (isGround ? 'GROUND' : Math.round(current).toLocaleString() + ' ft');
        const rateLabel = trend === 'level' || !Number.isFinite(rate) ? 'level' : (rate > 0 ? '+' : '') + Math.round(rate).toLocaleString() + ' fpm';
        return { current, isGround, rate: Number.isFinite(rate) ? rate : 0, trend, step, ticks, display, rateLabel };
    }

    function altitudeTapeTickLabel(value) {
        if (value >= 1000) return (value % 1000 === 0 ? (value / 1000) : (value / 1000).toFixed(1)) + 'k';
        return String(value);
    }

    const altitudeTape = {
        model: altitudeTapeModel,
        render(altitude, verticalRate) {
            const element = document.getElementById('altitudeTape');
            if (!element) return;
            const model = altitudeTapeModel(altitude, verticalRate);
            const ticks = model.ticks.map((tick, index) => '<div class="altitude-tape-tick' + (index === 3 ? ' current' : '') + '"><span>' + altitudeTapeTickLabel(tick) + '</span><i></i></div>').join('');
            const arrow = model.trend === 'up' ? '↑' : (model.trend === 'down' ? '↓' : '→');
            element.className = 'altitude-tape trend-' + model.trend + (model.isGround ? ' ground' : '');
            element.setAttribute('aria-label', 'Altitude ' + model.display + ', vertical trend ' + model.rateLabel);
            element.innerHTML = '<div class="altitude-tape-heading">ALT</div>' +
                '<div class="altitude-tape-scale" aria-hidden="true">' + ticks + '</div>' +
                '<div class="altitude-tape-readout"><span class="altitude-tape-arrow" aria-hidden="true">' + arrow + '</span><strong>' + model.display + '</strong></div>' +
                '<div class="altitude-tape-rate">' + model.rateLabel + '</div>';
        }
    };
