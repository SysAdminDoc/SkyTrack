import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A14-fuzzy-search.js', import.meta.url), 'utf8');

function search() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__search = { fuzzyScore, rankFuzzy };`, context);
    return context.__search;
}

test('ranks contiguous callsign matches above gapped matches', () => {
    const { fuzzyScore, rankFuzzy } = search();
    assert.ok(fuzzyScore('DAL', 'DAL123') > fuzzyScore('DAL', 'D0A1L2'));
    assert.equal(fuzzyScore('XYZ', 'DAL123'), 0);
    assert.deepEqual(JSON.parse(JSON.stringify(rankFuzzy(['D0A1L2', 'DAL123', 'SWA418'], 'DAL'))), [
        { item: 'DAL123', index: 1, score: 1030 },
        { item: 'D0A1L2', index: 0, score: 128 }
    ]);
});

test('supports multi-field records and limits results', () => {
    const { rankFuzzy } = search();
    const ranked = rankFuzzy([
        { flight: 'UAL42', reg: 'N42UA' },
        { flight: 'DAL15', reg: 'N15DL' },
        { flight: 'SWA20', reg: 'N20SW' }
    ], 'N15', record => [record.flight, record.reg], 1);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].item.flight, 'DAL15');
});
