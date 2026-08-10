import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/96-plane-over-my-house.js', import.meta.url), 'utf8');

function helpers() {
    const context = { document: { addEventListener() {} } };
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__shadow = { sunPosition, shadowEndpoint };`, context);
    return context.__shadow;
}

test('projects a daytime aircraft shadow opposite the sun and rejects night/ground cases', () => {
    const { sunPosition, shadowEndpoint } = helpers();
    const solar = sunPosition(Date.UTC(2026, 5, 21, 17, 0), 40, -75);
    assert.ok(solar.elevation > 0);
    assert.ok(solar.azimuth >= 0 && solar.azimuth < 360);
    const shadow = shadowEndpoint({ lat: 40, lon: -75, alt_baro: 30000 }, solar);
    assert.ok(shadow);
    assert.ok(shadow.distanceM > 0);
    assert.ok(shadow.lat !== 40 || shadow.lon !== -75);
    assert.equal(shadowEndpoint({ lat: 40, lon: -75, alt_baro: 'ground' }, solar), null);
    assert.equal(shadowEndpoint({ lat: 40, lon: -75, alt_baro: 30000 }, { azimuth: 180, elevation: -4 }), null);
});
