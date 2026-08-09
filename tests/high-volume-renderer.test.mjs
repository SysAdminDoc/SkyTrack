import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A6-high-volume-renderer.js', import.meta.url), 'utf8');

function createHarness() {
    const context = { document: { addEventListener() {} } };
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__highVolume = { threshold: HIGH_VOLUME_AIRCRAFT_THRESHOLD, mode: highVolumeModeFor };`, context);
    return context.__highVolume;
}

test('activates canvas mode only at the high-volume threshold', () => {
    const renderer = createHarness();
    assert.equal(renderer.threshold, 800);
    assert.equal(renderer.mode(799), false);
    assert.equal(renderer.mode(800), true);
    assert.equal(renderer.mode('800'), false);
});
