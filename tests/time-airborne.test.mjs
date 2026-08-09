import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A10-time-airborne.js', import.meta.url), 'utf8');

function summaryFor(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__summary = timeAirborneSummary;`, context);
    return JSON.parse(JSON.stringify(context.__summary(...args)));
}

test('finds the latest airborne segment and reports route progress', () => {
    const now = 1700000000000;
    const summary = summaryFor({
        alt_baro: 28000,
        lastSeen: now,
        routeProgress: 42.4,
        history: [
            [0, 0, 0, now - 3 * 3600000],
            [0, 0, 12000, now - 2 * 3600000],
            [0, 0, 25000, now - 90 * 60000]
        ]
    }, now);
    assert.equal(summary.durationLabel, '2h 0m');
    assert.equal(summary.routeProgress, 42.4);
});

test('handles ground and sparse history without inventing a flight', () => {
    assert.equal(summaryFor({ alt_baro: 'ground', lastSeen: 1700000000000 }, 1700000000000), null);
    assert.equal(summaryFor({ alt_baro: 12000 }, 1700000000000), null);
    const summary = summaryFor({ alt_baro: 12000, firstSeen: 1700000000000, lastSeen: 1700000000000 }, 1700000000000);
    assert.equal(summary.durationLabel, '<1m');
    assert.equal(summary.routeProgress, null);
});
