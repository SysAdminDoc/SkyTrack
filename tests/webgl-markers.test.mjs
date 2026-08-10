import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A38-webgl-markers.js', import.meta.url), 'utf8');

test('GPU marker color mapping stays bounded and highlights selected traffic', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__color = webglPointColor;`, context);
    assert.deepEqual([...context.__color(32000)], [0.95, 0.08, 0.08, 0.95]);
    assert.deepEqual([...context.__color(12000, true)], [0.05, 0.92, 1, 1]);
    for (const value of context.__color('ground')) assert.ok(value >= 0 && value <= 1);
});
