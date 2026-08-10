import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A35-gamepad.js', import.meta.url), 'utf8');

test('applies stick deadzones and preserves connected state', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__input = gamepadInput;`, context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.__input({ axes: [0.05, -0.4, 0, 0.8], connected: true }))), { yaw: 0, pitch: -0.4, zoom: 0.8, active: true });
});
