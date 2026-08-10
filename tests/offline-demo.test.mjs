import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A39-offline-demo.js', import.meta.url), 'utf8');

test('offline demo produces deterministic continental frames across a full day', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__frame = demoFrameAt;`, context);
    const first = context.__frame(0, 12);
    const repeat = context.__frame(0, 12);
    const later = context.__frame(95, 12);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(repeat)));
    assert.equal(first.length, 12);
    assert.notDeepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(later)));
    assert.ok(first.every(ac => ac.lat >= 30 && ac.lat <= 65 && ac.lon >= -15 && ac.lon <= 65));
    assert.ok(first.every(ac => ac.alt_baro > 0 && ac.gs > 0));
});
