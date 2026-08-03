import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A2-satellite-3d.js', import.meta.url), 'utf8');

function createHarness(overrides = {}) {
    const context = {
        AbortSignal: { timeout: () => ({}) },
        document: { getElementById() { return null; } },
        errorHandler: { log() {} },
        _escHtml: value => String(value ?? ''),
        setInterval,
        clearInterval,
        fetch: async () => ({ ok: true, json: async () => [] })
    };
    Object.assign(context, overrides);
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__satellite3D = satellite3D;`, context);
    return context.__satellite3D;
}

test('samples Starlink OMM records evenly while keeping the ISS record', () => {
    const overlay = createHarness();
    overlay.satelliteLib = { json2satrec: record => ({ object: record.OBJECT_NAME }) };
    overlay.starlinkLimit = 3;
    const stations = [
        { OBJECT_NAME: 'CSS (TIANHE)', NORAD_CAT_ID: 48274 },
        { OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544 }
    ];
    const starlink = Array.from({ length: 10 }, (_, index) => ({
        OBJECT_NAME: 'STARLINK-' + index,
        NORAD_CAT_ID: 50000 + index
    }));
    const catalog = overlay._buildCatalog(stations, starlink);
    assert.equal(catalog.length, 4);
    assert.equal(catalog[0].kind, 'iss');
    assert.deepEqual(JSON.parse(JSON.stringify(catalog.slice(1).map(record => record.name))), [
        'STARLINK-0', 'STARLINK-3', 'STARLINK-6'
    ]);
});

test('converts satellite.js geodetic output to Cesium degrees and metres', () => {
    const overlay = createHarness({
        Cesium: {
            Cartesian3: { fromDegrees: (lon, lat, height) => ({ lon, lat, height }) }
        }
    });
    overlay.satelliteLib = {
        propagate: () => ({ position: { x: 1, y: 2, z: 3 } }),
        gstime: () => 1,
        eciToGeodetic: () => ({ longitude: Math.PI / 2, latitude: Math.PI / 6, height: 0.4 }),
        degreesLong: radians => radians * 180 / Math.PI,
        degreesLat: radians => radians * 180 / Math.PI
    };
    const position = overlay._positionFor({});
    assert.equal(position.lon, 90);
    assert.ok(Math.abs(position.lat - 30) < 1e-9);
    assert.equal(position.height, 400);
});

test('reports separate ISS and Starlink catalog counts', () => {
    const overlay = createHarness();
    overlay.catalog = [
        { kind: 'iss' },
        { kind: 'starlink' },
        { kind: 'starlink' }
    ];
    assert.equal(overlay._statusText(), 'Satellites: ISS 1 · Starlink 2');
    assert.deepEqual(JSON.parse(JSON.stringify(overlay.stats())), {
        enabled: false,
        catalog: 3,
        iss: 1,
        starlink: 2,
        entities: 0
    });
});
