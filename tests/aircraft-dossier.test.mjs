import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A28-aircraft-dossier.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__dossier = { aircraftDossierData, dossierHtml };`, context);
    return {
        data: (...args) => JSON.parse(JSON.stringify(context.__dossier.aircraftDossierData(...args))),
        html: (...args) => context.__dossier.dossierHtml(...args)
    };
}

test('compiles observations, notable flags, and a printable escaped report', () => {
    const { data, html } = helpers();
    const result = data({ hex: 'abc123', flight: '<TEST>', r: 'N123', t: 'C172', from: 'KAAA', to: 'KBBB', alt_baro: 4500, gs: 110, isVIP: true, history: [[1, 2, 1000, 1700000000000], [1.1, 2.1, 4500, 1700003600000]] }, { count: 4 }, 1700003600000);
    assert.equal(result.route, 'KAAA → KBBB');
    assert.equal(result.hoursObserved, '1.0');
    assert.ok(result.notable.includes('VIP classification'));
    assert.match(html(result), /&lt;TEST&gt;/);
    assert.match(html(result), /Printable/i);
});
