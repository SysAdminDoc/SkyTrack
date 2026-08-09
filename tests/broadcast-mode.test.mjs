import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A20-broadcast-mode.js', import.meta.url), 'utf8');

function candidates(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__candidates = broadcastCandidates;`, context);
    return JSON.parse(JSON.stringify(context.__candidates(...args)));
}

test('ranks fresh broadcast-worthy events by urgency and signal', () => {
    const now = 1700000000000;
    const result = candidates({
        normal: { hex: 'NORMAL', lat: 1, lon: 2, lastSeen: now },
        emerg: { hex: 'EMERG', lat: 1, lon: 2, lastSeen: now, squawk: '7700', flight: 'MAYDAY' },
        vip: { hex: 'VIP', lat: 1, lon: 2, lastSeen: now, isVIP: true },
        mil: { hex: 'MIL', lat: 1, lon: 2, lastSeen: now, militaryInfo: { category: 'Military' } },
        stale: { hex: 'STALE', lat: 1, lon: 2, lastSeen: now - 181000, isVIP: true }
    }, [{ firstHex: 'MIL', secondHex: 'NORMAL' }], now);
    assert.deepEqual(result.map(item => item.hex), ['EMERG', 'MIL', 'VIP', 'NORMAL']);
    assert.deepEqual(result[0].reasons, ['EMERGENCY 7700']);
    assert.ok(result[1].reasons.includes('CPA CONFLICT'));
});

test('ignores entries without coordinates', () => {
    const result = candidates({ missing: { hex: 'MISSING', isVIP: true } }, [], 1700000000000);
    assert.deepEqual(result, []);
});
