import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A18-hex-density.js', import.meta.url), 'utf8');

function helpers() {
    const context = { Math, Object, Map, Array, Number, String, document: undefined };
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__density = { densityBinAircraft, densityBinCenter, densityHexPoints };`, context);
    return context.__density;
}

test('hex density bins nearby aircraft and preserves aggregate altitude', () => {
    const { densityBinAircraft } = helpers();
    const result = densityBinAircraft({
        a: { lat: 40, lon: -74, alt_baro: 10000 },
        b: { lat: 40.02, lon: -74.01, alt_baro: 20000 },
        c: { lat: 42, lon: -74, alt_baro: 30000 }
    }, 5);
    assert.equal(result.bins.length, 2);
    const nearby = result.bins.find(bin => bin.count === 2);
    assert.equal(nearby.altitude / nearby.altitudeCount, 15000);
});

test('hex density polygons contain six valid Leaflet coordinates', () => {
    const { densityBinCenter, densityHexPoints } = helpers();
    const center = densityBinCenter({ q: 2, r: -1 }, 0.8);
    const points = densityHexPoints(center, 0.8);
    assert.equal(points.length, 6);
    points.forEach(([lat, lon]) => {
        assert.ok(Number.isFinite(lat));
        assert.ok(Number.isFinite(lon));
    });
});
