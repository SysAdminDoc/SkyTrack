import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A26-pattern-work.js', import.meta.url), 'utf8');

function summary(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__summary = patternWorkSummary;`, context);
    return JSON.parse(JSON.stringify(context.__summary(...args)));
}

test('detects repeated compact low passes and rejects broad noise', () => {
    const now = 1700000000000;
    const history = [
        [0, 0, 3000, now - 600000], [0.01, 0.01, 900, now - 540000], [0.02, 0, 700, now - 480000],
        [0.08, 0.08, 3000, now - 420000], [0.01, 0.01, 800, now - 360000], [0.02, 0.01, 650, now - 300000],
        [0.08, 0.08, 3000, now - 240000], [0.01, 0, 750, now - 180000], [0.02, 0.01, 600, now - 120000]
    ];
    const result = summary({ history }, { now });
    assert.equal(result.passes, 3);
    assert.ok(result.radiusNm < 3);
    assert.equal(summary({ history: [[0, 0, 500, now - 1000], [10, 10, 600, now]] }, { now }), null);
});
