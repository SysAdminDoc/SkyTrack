import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A33-airport-replay.js', import.meta.url), 'utf8');

function frames(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__frames = airportReplayFrames;`, context);
    return JSON.parse(JSON.stringify(context.__frames(...args)));
}

test('groups retained nearby traffic into replay frames', () => {
    const now = 1700000000000;
    const result = frames({
        a: { hex: 'A', flight: 'TEST1', from: 'KAAA', to: 'KBBB', history: [[0, 0.1, 1000, now - 1800000], [0, 0.2, 1200, now]] },
        b: { hex: 'B', flight: 'TEST2', to: 'KBBB', history: [[0.1, 0.1, 900, now]] },
        far: { hex: 'FAR', history: [[10, 10, 1000, now]] }
    }, { icao: 'KBBB', lat: 0, lon: 0 }, 40, 1800000, now);
    assert.equal(result.length, 2);
    assert.equal(result[1].aircraft.length, 2);
    assert.equal(result[1].arrivals, 2);
});
