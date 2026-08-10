import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A32-postcard.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__post = { postcardData, postcardHtml };`, context);
    return { data: (...args) => JSON.parse(JSON.stringify(context.__post.postcardData(...args))), html: (...args) => context.__post.postcardHtml(...args) };
}

test('builds a printable sky summary from current traffic', () => {
    const { data, html } = helpers();
    const result = data({ a: { hex: 'A', alt_baro: 30000, gs: 400 }, b: { hex: 'B', alt_baro: 'ground', gs: 20, militaryInfo: {} } }, 1700000000000);
    assert.equal(result.total, 2);
    assert.equal(result.airborne, 1);
    assert.equal(result.military, 1);
    assert.match(html(result), /My Sky Today/);
});
