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

function createHarness(overrides = {}) {
    const context = {
        AbortSignal: { timeout: () => ({}) },
        L: {
            circle: createLayer,
            circleMarker: createLayer,
            polyline: createLayer,
            polygon: createLayer,
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
    Object.assign(context, overrides);
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

test('identifies NOAA hurricane hunters and correlates them to a named storm', () => {
    const overlay = createHarness();
    assert.equal(overlay._isHurricaneHunter({ r: 'N42RF', t: 'WC-130J' }), true);
    assert.equal(overlay._isHurricaneHunter({ flight: 'UAL123', t: 'B738' }), false);
    overlay.map = { added: [], removeLayer() {} };
    overlay.enabled = true;
    overlay.activeStorms = [{ name: 'Storm Alice', lat: 25, lon: -70 }];
    overlay._syncHurricaneHunters([
        { hex: 'HUNTER1', r: 'N42RF', t: 'WC-130J', lat: 25.5, lon: -70.2, alt_baro: 12000, gs: 250 },
        { hex: 'HUNTER2', r: 'N43RF', t: 'WC-130J', lat: 40, lon: -70, alt_baro: 12000, gs: 250 },
        { hex: 'HUNTER3', r: 'N49RF', t: 'WC-130J', lat: 25.5, lon: -70.2, alt_baro: 'ground', gs: 0 }
    ]);
    assert.equal(overlay.hurricaneHunters.length, 1);
    assert.equal(overlay.hurricaneHunters[0].hex, 'HUNTER1');
    assert.equal(overlay.hurricaneHunters[0].storm, 'Storm Alice');
    assert.equal(overlay.map.added.length, 1);
});

test('parses NHC KML line and polygon coordinates into Leaflet order', () => {
    const lineNode = {
        getElementsByTagNameNS(_namespace, tag) {
            return tag === 'coordinates' ? [{ textContent: '-70,25,0 -71,26,0' }] : [];
        }
    };
    const polygonNode = {
        getElementsByTagNameNS(_namespace, tag) {
            if (tag === 'LinearRing') return [{
                getElementsByTagNameNS(_namespace, ringTag) {
                    return ringTag === 'coordinates' ? [{ textContent: '-70,25 -71,25 -71,26 -70,25' }] : [];
                }
            }];
            return [];
        }
    };
    const overlay = createHarness({
        DOMParser: class {
            parseFromString() {
                return {
                    getElementsByTagNameNS(_namespace, tag) {
                        if (tag === 'LineString') return [lineNode];
                        if (tag === 'Polygon') return [polygonNode];
                        return [];
                    }
                };
            }
        }
    });
    const geometry = overlay._parseKml('<kml/>');
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.lines)), [[[25, -70], [26, -71]]]);
    assert.deepEqual(JSON.parse(JSON.stringify(geometry.polygons)), [[[25, -70], [25, -71], [26, -71], [25, -70]]]);
});
