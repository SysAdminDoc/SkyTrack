import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A30-voice-alerts.js', import.meta.url), 'utf8');

function format(alert) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__text = voiceAlertText;`, context);
    return context.__text(alert);
}

test('speaks emergency squawks as spaced digits', () => {
    assert.equal(format({ callsign: 'N425', message: 'EMERGENCY - Squawk 7700' }), 'SkyTrack alert. N425. EMERGENCY - Squawk 7 7 0 0');
});
