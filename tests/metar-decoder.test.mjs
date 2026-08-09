import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A24-metar-decoder.js', import.meta.url), 'utf8');

function decode(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__decode = metarDecode; globalThis.__clearance = atcPhraseDecode;`, context);
    return JSON.parse(JSON.stringify(context.__decode(...args)));
}

test('turns common METAR groups into plain-English lines', () => {
    const result = decode('KJFK 091651Z 18012G20KT 10SM -RA BKN025 OVC040 18/16 A2992', { flightCategory: 'MVFR' });
    assert.equal(result.station, 'KJFK');
    assert.ok(result.lines.some(line => line.includes('Wind 180° at 12 kt, gusting 20 kt')));
    assert.ok(result.lines.some(line => line.includes('light rain')));
    assert.ok(result.lines.some(line => line.toLowerCase().includes('broken cloud layer at 2500 ft')));
    assert.ok(result.lines.some(line => line.includes('Altimeter 29.92 inHg')));
    assert.match(result.summary, /Flight category: MVFR/);
});

test('uses parsed weather fields when the raw report is abbreviated', () => {
    const result = decode('', { station: 'KSEA', wind: { direction: 270, speed: 8 }, visibility: 6, temp: 12, dewpoint: 8, altimeter: 3012, flightCategory: 'VFR' });
    assert.match(result.summary, /Wind 270° at 8 kt/);
    assert.match(result.summary, /Visibility 6 statute miles/);
    assert.match(result.summary, /Flight category: VFR/);
});

test('explains common controller clearance phrases', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__clearance = atcPhraseDecode;`, context);
    assert.match(context.__clearance('line up and wait runway 27'), /Enter the runway/);
    assert.match(context.__clearance('squawk 7600'), /7600/);
});
