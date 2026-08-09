import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A16-cpa-prediction.js', import.meta.url), 'utf8');

function predictor() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__predictor = { cpaForPair, findCpaConflicts };`, context);
    return context.__predictor;
}

test('flags a head-on pair projected inside both separation limits', () => {
    const { cpaForPair } = predictor();
    const result = cpaForPair(
        { hex: 'AAA111', lat: 0, lon: 0, gs: 300, track: 90, alt_baro: 10000, baro_rate: 0 },
        { hex: 'BBB222', lat: 0, lon: 0.5, gs: 300, track: 270, alt_baro: 10500, baro_rate: 0 }
    );
    assert.equal(Math.round(result.timeSeconds), 180);
    assert.ok(result.horizontalNm < 0.1);
    assert.equal(result.verticalFt, 500);
    assert.equal(result.conflict, true);
});

test('bounds pairwise work and ignores stale or ground traffic', () => {
    const { findCpaConflicts } = predictor();
    const now = 1700000000000;
    const aircraft = {
        A: { hex: 'A', lat: 0, lon: 0, gs: 300, track: 90, alt_baro: 10000, lastSeen: now },
        B: { hex: 'B', lat: 0, lon: 0.5, gs: 300, track: 270, alt_baro: 10000, lastSeen: now },
        C: { hex: 'C', lat: 0, lon: 0.5, gs: 300, track: 270, alt_baro: 'ground', lastSeen: now },
        D: { hex: 'D', lat: 0, lon: 0.5, gs: 300, track: 270, alt_baro: 10000, lastSeen: now - 300000 }
    };
    const conflicts = findCpaConflicts(aircraft, { now, maxAircraft: 2 });
    assert.equal(JSON.stringify(conflicts.map(conflict => [conflict.firstHex, conflict.secondHex])), JSON.stringify([['A', 'B']]));
});
