import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const streamer = fs.readFileSync(new URL('../src/modules/A36-streamer-overlay.js', import.meta.url), 'utf8');
const widget = fs.readFileSync(new URL('../src/modules/A37-widget-mode.js', import.meta.url), 'utf8');

test('summarizes streamer traffic and chooses the nearest aircraft', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${streamer}\n${widget}\n globalThis.__helpers = { streamerStatus, nearestAircraft };`, context);
    const aircraft = { a: { hex: 'A', lat: 1, lon: 1, isVIP: true }, b: { hex: 'B', lat: 0.1, lon: 0.1 } };
    assert.deepEqual(JSON.parse(JSON.stringify(context.__helpers.streamerStatus(aircraft))).notable, 1);
    assert.equal(context.__helpers.nearestAircraft(aircraft, { lat: 0, lon: 0 }).hex, 'B');
});
