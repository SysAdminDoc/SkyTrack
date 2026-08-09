import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A27-flight-of-day.js', import.meta.url), 'utf8');

function choose(aircraft) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__choose = chooseFlightOfDay;`, context);
    return JSON.parse(JSON.stringify(context.__choose(aircraft)));
}

test('selects the most notable current aircraft for the share card', () => {
    const result = choose({
        quiet: { hex: 'QUIET', lat: 1, lon: 1, alt_baro: 10000, gs: 200 },
        emergency: { hex: 'EMERG', flight: 'MAYDAY', lat: 2, lon: 2, alt_baro: 1000, gs: 80, squawk: '7700' }
    });
    assert.equal(result.hex, 'EMERG');
});
