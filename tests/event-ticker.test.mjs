import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A25-event-ticker.js', import.meta.url), 'utf8');

function format(alert) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__text = eventTickerText;`, context);
    return context.__text(alert);
}

test('formats alert events into compact ticker copy', () => {
    assert.equal(format({ type: 'EMERGENCY', callsign: 'DAL123', message: 'Squawk 7700' }), 'EMERGENCY · DAL123 · Squawk 7700');
    assert.match(format({ type: 'MILITARY', aircraft: { hex: 'ABC123' } }), /MILITARY · ABC123/);
});
