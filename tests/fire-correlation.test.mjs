import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/95-fires-hurricanes.js', import.meta.url), 'utf8');

function createLayer() {
    return {
        bindPopup() { return this; },
        bindTooltip() { return this; },
        on() { return this; }
    };
}

function createHarness() {
    const context = {
        AbortSignal: { timeout: () => ({}) },
        L: {
            circle: createLayer,
            circleMarker: createLayer,
            polyline: createLayer,
            layerGroup() {
                const layers = [];
                return {
                    addLayer(layer) { layers.push(layer); return this; },
                    addTo(map) { map.added.push(this); return this; },
                    getLayers() { return layers; }
                };
            }
        },
        _escHtml: value => String(value ?? ''),
        console,
        document: { addEventListener() {} },
        errorHandler: { log() {} },
        localStorage: { getItem() { return null; }, setItem() {} },
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, json: async () => ({ features: [] }) })
    };
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__firesHurricanes = firesHurricanes;`, context);
    return context.__firesHurricanes;
}

test('identifies fire-service aircraft without classifying routine traffic', () => {
    const overlay = createHarness();
    assert.equal(overlay._isFirefighting({ militaryInfo: { operator: 'Cal Fire', tag: 'Firebird' } }), true);
    assert.equal(overlay._isFirefighting({ flight: 'UAL123', ownOp: 'United Airlines', t: 'B738' }), false);
});

test('correlates airborne tankers to the nearest active incident', () => {
    const overlay = createHarness();
    overlay.fireIncidents = [
        { name: 'North Fire', state: 'US-CA', lat: 34.1, lon: -118.1 },
        { name: 'Distant Fire', state: 'US-NV', lat: 36.2, lon: -115.1 }
    ];
    const nearest = overlay._nearestFire({ lat: 34.11, lon: -118.11 });
    assert.equal(nearest.incident.name, 'North Fire');
    assert.ok(nearest.distanceKm < 2);
});

test('only renders nearby airborne firefighting aircraft', () => {
    const overlay = createHarness();
    const map = { added: [], removeLayer() {} };
    overlay.map = map;
    overlay.enabled = true;
    overlay.fireIncidents = [{ name: 'Active Fire', state: 'US-CA', lat: 34, lon: -118 }];
    overlay._syncFirefightingAircraft([
        { hex: 'ABC123', flight: 'TANKER12', r: 'N123FR', t: 'AT8T', desc: 'Air Tractor AT-802', lat: 34.1, lon: -118.1, alt_baro: 2400, gs: 120 },
        { hex: 'DEF456', flight: 'UAL123', t: 'B738', lat: 34.1, lon: -118.1, alt_baro: 2400, gs: 120 },
        { hex: 'FEDCBA', flight: 'TANKER13', t: 'AT8T', lat: 40, lon: -100, alt_baro: 2400, gs: 120 },
        { hex: '654321', flight: 'TANKER14', t: 'AT8T', lat: 34.1, lon: -118.1, alt_baro: 'ground', gs: 0 }
    ]);
    assert.equal(overlay.firefighterAircraft.length, 1);
    assert.equal(overlay.firefighterAircraft[0].hex, 'ABC123');
    assert.equal(map.added.length, 1);
});
