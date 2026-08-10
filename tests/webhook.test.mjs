import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A34-webhook.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__webhook = { webhookUrl, webhookPayload };`, context);
    return { url: value => context.__webhook.webhookUrl(value), payload: (...args) => JSON.parse(JSON.stringify(context.__webhook.webhookPayload(...args))) };
}

test('validates http(s) webhook endpoints and shapes an alert payload', () => {
    const { url, payload } = helpers();
    assert.equal(url('javascript:alert(1)'), '');
    assert.equal(url('https://example.test/hook'), 'https://example.test/hook');
    const result = payload({ type: 'MILITARY', callsign: 'MIL1', message: 'nearby', aircraft: { hex: 'ABC123', lat: 1, lon: 2, alt_baro: 30000 } }, 1700000000000);
    assert.equal(result.source, 'skytrack');
    assert.deepEqual(result.position, { lat: 1, lon: 2 });
    assert.equal(result.altitude, 30000);
});
