import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const configSource = fs.readFileSync(new URL('../src/modules/00-config.js', import.meta.url), 'utf8');
const reliabilitySource = fs.readFileSync(new URL('../src/modules/20-reliability.js', import.meta.url), 'utf8');
const workerSource = fs.readFileSync(new URL('../tools/skytrack-proxy-worker.js', import.meta.url), 'utf8');

test('custom proxy URLs are validated and receive the target as a query parameter', () => {
    const context = {
        URL,
        URLSearchParams,
        window: { location: { search: '', protocol: 'https:' } }
    };
    vm.createContext(context);
    vm.runInContext(`${configSource}\n globalThis.__proxy = { normalizeCustomProxyUrl, buildCustomProxyUrl };`, context);

    assert.equal(context.__proxy.normalizeCustomProxyUrl('javascript:alert(1)'), '');
    assert.equal(context.__proxy.normalizeCustomProxyUrl('https://user:pass@example.test/'), '');
    assert.equal(context.__proxy.normalizeCustomProxyUrl('https://worker.example/#ignored'), 'https://worker.example/');
    const requestUrl = context.__proxy.buildCustomProxyUrl('https://worker.example/?token=abc', 'https://api.example.test/v2/point/1/2/3');
    const parsed = new URL(requestUrl);
    assert.equal(parsed.searchParams.get('token'), 'abc');
    assert.equal(parsed.searchParams.get('url'), 'https://api.example.test/v2/point/1/2/3');
});

test('stale banner formatting uses a compact UTC timestamp', () => {
    const context = {
        navigator: { onLine: true },
        window: { addEventListener() {} },
        document: { getElementById() { return null; } },
        setInterval() {},
        setTimeout() {},
        clearTimeout() {},
        fetch() {},
        toast() {},
        console
    };
    vm.createContext(context);
    vm.runInContext(`${reliabilitySource}\n globalThis.__formatStaleTimestamp = formatStaleTimestamp;`, context);
    assert.equal(context.__formatStaleTimestamp(Date.parse('2026-08-09T04:17:00Z')), '04:17Z');
    assert.equal(context.__formatStaleTimestamp('not-a-date'), '--:--Z');
});

test('Cloudflare Worker accepts only http(s) targets and adds CORS headers', () => {
    assert.match(workerSource, /searchParams\.get\('url'\)/);
    assert.match(workerSource, /Only http\(s\) targets are allowed/);
    assert.match(workerSource, /Access-Control-Allow-Origin/);
    assert.match(workerSource, /method === 'OPTIONS'/);
});
