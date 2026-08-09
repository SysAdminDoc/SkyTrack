import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A15-random-follow.js', import.meta.url), 'utf8');

function candidates(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__candidates = randomFollowCandidates;`, context);
    return JSON.parse(JSON.stringify(context.__candidates(...args)));
}

test('keeps fresh aircraft, applies the active filter, and places the selection last', () => {
    const now = 1700000000000;
    const result = candidates({
        AAA111: { hex: 'AAA111', lat: 1, lon: 2, lastSeen: now, category_type: 'commercial' },
        BBB222: { hex: 'BBB222', lat: 3, lon: 4, lastSeen: now - 180000, category_type: 'commercial' },
        CCC333: { hex: 'CCC333', lat: 5, lon: 6, lastSeen: now, category_type: 'military' },
        DDD444: { hex: 'DDD444', lat: 7, lon: 8, lastSeen: now, category_type: 'commercial' }
    }, 'AAA111', now, ac => ac.category_type === 'commercial');
    assert.deepEqual(result.map(ac => ac.hex), ['DDD444', 'AAA111']);
});
