import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A8-privacy-markers.js', import.meta.url), 'utf8');

function createHarness() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__privacy = { isPrivacyAircraft, privacyMarkerInfo };`, context);
    return context.__privacy;
}

test('recognizes PIA and optional LADD privacy flags without using dbFlags', () => {
    const privacy = createHarness();
    assert.equal(privacy.isPrivacyAircraft({ piaInfo: { category: 'PIA' } }), true);
    assert.equal(privacy.isPrivacyAircraft({ ladd: true }), true);
    assert.equal(privacy.isPrivacyAircraft({ privacy: '1' }), true);
    assert.equal(privacy.isPrivacyAircraft({ dbFlags: 1 }), false);
    assert.equal(privacy.privacyMarkerInfo({ isLadd: true }).badge, '?');
    assert.equal(privacy.privacyMarkerInfo({}), null);
});
