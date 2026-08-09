import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A12-cesium-effects.js', import.meta.url), 'utf8');

function effects() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__effects = { solarElevationDegrees, isNightSkyboxTime, CESIUM_NIGHT_SKYBOX_SOURCES };`, context);
    return context.__effects;
}

test('detects bright midday and civil night at the same longitude', () => {
    const { solarElevationDegrees, isNightSkyboxTime } = effects();
    const noon = new Date('2026-03-20T12:00:00Z');
    const midnight = new Date('2026-03-20T00:00:00Z');
    assert.ok(solarElevationDegrees(noon, 0, 0) > 80);
    assert.ok(solarElevationDegrees(midnight, 0, 0) < -60);
    assert.equal(isNightSkyboxTime(noon, 0, 0), false);
    assert.equal(isNightSkyboxTime(midnight, 0, 0), true);
});

test('keeps all six Cesium skybox faces pinned to the loaded release', () => {
    const { CESIUM_NIGHT_SKYBOX_SOURCES } = effects();
    assert.equal(Object.keys(CESIUM_NIGHT_SKYBOX_SOURCES).length, 6);
    assert.ok(Object.values(CESIUM_NIGHT_SKYBOX_SOURCES).every(url => url.includes('/releases/1.119/')));
});
