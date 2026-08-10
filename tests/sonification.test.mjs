import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A31-sonification.js', import.meta.url), 'utf8');

function note(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__note = sonificationNote;`, context);
    return JSON.parse(JSON.stringify(context.__note(...args)));
}

test('maps altitude, speed, bearing, and range to bounded sound controls', () => {
    const result = note({ lat: 0, lon: 45, alt_baro: 25000, gs: 400 }, { lat: 0, lon: 0 });
    assert.ok(result.frequency > 180 && result.frequency < 1000);
    assert.equal(result.pan, 1);
    assert.ok(result.gain > 0 && result.gain <= 0.055);
});
