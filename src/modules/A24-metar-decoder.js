    // ============ METAR / ATC-SPEAK DECODER ============
    const METAR_WEATHER_WORDS = {
        RA: 'rain', SN: 'snow', DZ: 'drizzle', TS: 'thunderstorm', FG: 'fog',
        BR: 'mist', HZ: 'haze', FU: 'smoke', SA: 'sand', DU: 'dust', SQ: 'squall',
        FC: 'funnel cloud', GR: 'hail', GS: 'small hail', PL: 'ice pellets', IC: 'ice crystals'
    };

    function metarTemperature(value) {
        if (!value) return null;
        const match = String(value).match(/^(M?)(\d{2})$/);
        return match ? (match[1] ? -1 : 1) * Number(match[2]) : null;
    }

    function metarDecode(raw = '', parsed = {}) {
        const text = String(raw || '').trim().toUpperCase();
        const tokens = text.split(/\s+/).filter(Boolean);
        const lines = [];
        const station = tokens.find(token => /^[A-Z]{4}$/.test(token));
        if (station) lines.push(station + ' observation');
        const time = tokens.find(token => /^\d{6}Z$/.test(token));
        if (time) lines.push('Observed on day ' + time.slice(0, 2) + ' at ' + time.slice(2, 4) + ':' + time.slice(4, 6) + ' UTC');

        let sawWind = false, sawVisibility = false, sawClouds = false, sawPressure = false, sawTemperature = false;
        for (const token of tokens) {
            const wind = token.match(/^(\d{3}|VRB)(\d{2})(?:G(\d{2}))?KT$/);
            if (wind) {
                const direction = wind[1] === 'VRB' ? 'variable direction' : wind[1] + '°';
                lines.push('Wind ' + direction + ' at ' + Number(wind[2]) + ' kt' + (wind[3] ? ', gusting ' + Number(wind[3]) + ' kt' : ''));
                sawWind = true;
                continue;
            }
            const visibility = token.match(/^(P?\d+(?:\/\d+)?)SM$/);
            if (visibility) {
                lines.push('Visibility ' + (visibility[1].startsWith('P') ? 'greater than ' + visibility[1].slice(1) : visibility[1]) + ' statute miles');
                sawVisibility = true;
                continue;
            }
            const cloud = token.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(?:CB|TCU)?$/);
            if (cloud) {
                const cover = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast', VV: 'vertical visibility' }[cloud[1]];
                const base = cloud[2] === '///' ? 'unknown' : Number(cloud[2]) * 100 + ' ft';
                lines.push(cover[0].toUpperCase() + cover.slice(1) + ' cloud layer at ' + base);
                sawClouds = true;
                continue;
            }
            const temperature = token.match(/^(M?\d{2})\/(M?\d{2})$/);
            if (temperature) {
                lines.push('Temperature ' + metarTemperature(temperature[1]) + '°C, dew point ' + metarTemperature(temperature[2]) + '°C');
                sawTemperature = true;
                continue;
            }
            const pressure = token.match(/^(A|Q)(\d{4})$/);
            if (pressure) {
                const value = pressure[1] === 'A' ? (Number(pressure[2]) / 100).toFixed(2) + ' inHg' : pressure[2] + ' hPa';
                lines.push('Altimeter ' + value);
                sawPressure = true;
                continue;
            }
            const weather = token.match(/^([+-]?)(VC)?(MI|PR|BC|DR|BL|SH|FZ)?(TS|RA|SN|DZ|FG|BR|HZ|FU|SA|DU|SQ|FC|GR|GS|PL|IC)$/);
            if (weather) {
                const intensity = weather[1] === '+' ? 'heavy ' : weather[1] === '-' ? 'light ' : '';
                const vicinity = weather[2] === 'VC' ? 'nearby ' : '';
                lines.push(vicinity + intensity + (METAR_WEATHER_WORDS[weather[4]] || weather[4].toLowerCase()));
            }
        }
        if (!sawWind && parsed.wind?.speed) lines.push('Wind ' + (parsed.wind.variable ? 'variable direction' : (parsed.wind.direction || 'unknown direction') + '°') + ' at ' + parsed.wind.speed + ' kt');
        if (!sawVisibility && parsed.visibility !== null && parsed.visibility !== undefined) lines.push('Visibility ' + parsed.visibility + ' statute miles');
        if (!sawClouds && parsed.clouds?.length) lines.push('Clouds: ' + parsed.clouds.map(cloud => cloud.cover + ' at ' + (cloud.base || '?') + ' ft').join(', '));
        if (!sawTemperature && parsed.temp !== null && parsed.temp !== undefined) lines.push('Temperature ' + parsed.temp + '°C, dew point ' + (parsed.dewpoint ?? '?') + '°C');
        if (!sawPressure && parsed.altimeter) lines.push('Altimeter ' + (Number(parsed.altimeter) / 100).toFixed(2) + ' inHg');
        if (parsed.flightCategory) lines.push('Flight category: ' + parsed.flightCategory + ' (' + ({ VFR: 'visual', MVFR: 'marginal visual', IFR: 'instrument', LIFR: 'low instrument' }[parsed.flightCategory] || 'unknown') + ')');
        return { station: station || parsed.station || '', lines, summary: lines.join(' · ') };
    }

    function atcPhraseDecode(text = '') {
        const phrase = String(text || '').trim();
        if (!phrase) return 'Enter a clearance or controller phrase.';
        const rules = [
            [/cleared to land/i, 'You are authorized to land; continue to monitor the runway and go around if it is not safe.'],
            [/line up and wait/i, 'Enter the runway, align with the centerline, and wait for takeoff clearance.'],
            [/hold short(?: of)?\s+([A-Z0-9-]+)/i, match => 'Stop before ' + match[1].toUpperCase() + ' and do not cross it without clearance.'],
            [/taxi via\s+(.+)/i, match => 'Taxi using the named route: ' + match[1] + '.'],
            [/contact (?:departure|approach|tower|ground)/i, 'Change to the assigned ATC frequency and establish two-way communication.'],
            [/squawk\s+(\d{4})/i, match => 'Set transponder code ' + match[1] + '.'],
            [/(?:climb|descend)\s+(?:and maintain\s+)?(\d[\d,]*)/i, match => 'Change altitude to ' + match[1] + ' feet and maintain it.'],
            [/direct\s+([A-Z0-9-]+)/i, match => 'Proceed directly to fix ' + match[1].toUpperCase() + '.']
        ];
        const match = rules.find(([pattern]) => pattern.test(phrase));
        if (!match) return 'No common clearance phrase recognized; keep the original clearance and ask ATC if unsure.';
        return typeof match[1] === 'function' ? match[1](phrase.match(match[0])) : match[1];
    }

    const metarDecoder = {
        decode: metarDecode,
        explain(raw, parsed) { return metarDecode(raw, parsed).summary || 'No decodable METAR groups found.'; },
        explainClearance: atcPhraseDecode
    };
