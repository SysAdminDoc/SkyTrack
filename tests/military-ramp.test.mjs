import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A21-military-ramp.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__mil = { isMilitaryAircraft, militaryConflict, militaryRampStyle };`, context);
    return {
        isMilitaryAircraft: (...args) => context.__mil.isMilitaryAircraft(...args),
        militaryConflict: (...args) => context.__mil.militaryConflict(...args),
        militaryRampStyle: (...args) => JSON.parse(JSON.stringify(context.__mil.militaryRampStyle(...args)))
    };
}

test('recognizes enriched military records and CPA conflicts', () => {
    const { isMilitaryAircraft, militaryConflict } = helpers();
    const aircraft = { hex: 'MIL123', militaryRangeInfo: { country: 'US' } };
    assert.equal(isMilitaryAircraft(aircraft), true);
    assert.equal(militaryConflict(aircraft, [{ firstHex: 'MIL123', secondHex: 'CIV456' }]), true);
    assert.equal(militaryConflict({ hex: 'CIV456' }, []), false);
});

test('returns amber styling and a conflict class for military targets', () => {
    const { militaryRampStyle } = helpers();
    const style = militaryRampStyle({ hex: 'MIL123', militaryInfo: {} }, [{ secondHex: 'MIL123' }]);
    assert.equal(style.isMilitary, true);
    assert.equal(style.conflict, true);
    assert.match(style.filter, /hue-rotate/);
    assert.match(style.className, /military-ramp/);
    assert.match(style.className, /military-conflict/);
});
