import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A4-oceanic-firs.js', import.meta.url), 'utf8');

function createHarness(overrides = {}) {
    const context = {
        AbortSignal: { timeout: () => ({}) },
        document: { addEventListener() {} },
        localStorage: { getItem() { return null; }, setItem() {} },
        skytrackDB: {
            async loadDatabase() { return null; },
            async saveDatabase() {}
        },
        errorHandler: { log() {} },
        _escHtml: value => String(value ?? ''),
        fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
    };
    Object.assign(context, overrides);
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__oceanicFirs = oceanicFirs;`, context);
    return context.__oceanicFirs;
}

test('decodes transformed TopoJSON arcs, including reversed arc references', () => {
    const overlay = createHarness();
    const geojson = overlay._decodeTopoJSON({
        type: 'Topology',
        transform: { scale: [0.5, 0.25], translate: [-10, 20] },
        arcs: [
            [[0, 0], [2, 0]],
            [[2, 0], [0, 4]],
            [[0, 4], [-2, 0]],
            [[0, 0], [0, -4]]
        ],
        objects: {
            data: {
                type: 'GeometryCollection',
                geometries: overlay.definitions.map((item, index) => ({
                    type: index === 3 ? 'MultiPolygon' : 'Polygon',
                    arcs: index === 3 ? [[[0, 1, 2, 3]]] : [[0, 1, 2, 3]],
                    properties: { designator: item.code, type: 'FIR', lower: 0, upper: null }
                }))
            }
        }
    });
    assert.equal(geojson.features.length, 4);
    assert.equal(geojson.features[0].geometry.type, 'Polygon');
    assert.deepEqual(JSON.parse(JSON.stringify(geojson.features[0].geometry.coordinates[0][0])), [-10, 20]);
    assert.deepEqual(JSON.parse(JSON.stringify(geojson.features[0].geometry.coordinates[0][2])), [-9, 21]);
    assert.equal(geojson.features[3].geometry.type, 'MultiPolygon');
});

test('keeps only the requested oceanic FIRs and preserves display metadata', () => {
    const overlay = createHarness();
    const geometries = overlay.definitions.map(item => ({
        type: 'Polygon',
        arcs: [[0]],
        properties: { designator: item.code, type: 'FIR', lower: 0, upper: null, name: item.label }
    }));
    geometries.push({
        type: 'Polygon',
        arcs: [[0]],
        properties: { designator: 'KZNY', type: 'UIR', lower: 180, upper: null }
    });
    const geojson = overlay._decodeTopoJSON({
        type: 'Topology',
        arcs: [[[0, 0], [1, 0]]],
        objects: { data: { type: 'GeometryCollection', geometries } }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(geojson.features.map(feature => feature.id))), [
        'EGGX', 'CZQX', 'KZWY', 'KZAK'
    ]);
    assert.equal(geojson.features[1].properties.name, 'Gander Oceanic');
    assert.equal(overlay._validGeoJSON(geojson), true);
});
