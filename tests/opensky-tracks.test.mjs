import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A3-opensky-tracks.js', import.meta.url), 'utf8');

function createHarness(overrides = {}) {
    const context = {
        AbortController,
        URLSearchParams,
        console,
        errorHandler: {},
        localStorage: { getItem() { return null; } },
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
    };
    Object.assign(context, overrides);
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__openSkyTracks = openSkyTracks;`, context);
    return context.__openSkyTracks;
}

test('normalizes OpenSky metre altitudes and discards invalid waypoints', () => {
    const service = createHarness();
    const normalized = service._normalize({
        icao24: 'ABC123',
        callsign: ' TEST123 ',
        path: [
            [1700000000, 40, -73, 1000, 90, false],
            [1700000060, null, -72, 1100, 91, false],
            [1700000120, 41, -71, null, null, true]
        ]
    });
    assert.equal(normalized.icao24, 'abc123');
    assert.equal(normalized.callsign, 'TEST123');
    assert.equal(normalized.path.length, 2);
    assert.ok(Math.abs(normalized.path[0][3] - 3280.839895) < 0.001);
    assert.equal(normalized.path[1][5], true);
});

test('tries a recent historical timestamp after the live OpenSky track is absent', async () => {
    const calls = [];
    const responses = [
        { ok: false, status: 404, json: async () => ({}) },
        {
            ok: true,
            status: 200,
            json: async () => ({
                icao24: 'abc123',
                path: [[1700000000, 40, -73, 0, 0, true], [1700000060, 40.1, -72.9, 1000, 5, false]]
            })
        }
    ];
    const service = createHarness({
        fetch: async url => {
            calls.push(String(url));
            return responses.shift();
        }
    });
    const track = await service.getTrack('ABC123', { time: 0, fallbackTime: 1700000000 });
    assert.equal(track.path.length, 2);
    assert.match(calls[0], /time=0/);
    assert.match(calls[1], /time=1700000000/);
});

test('caches normalized tracks without exposing credentials in diagnostics', async () => {
    let requests = 0;
    const service = createHarness({
        fetch: async () => {
            requests++;
            return {
                ok: true,
                status: 200,
                json: async () => ({ path: [[1700000000, 40, -73, 0, 0, true], [1700000060, 40.1, -72.9, 1000, 5, false]] })
            };
        }
    });
    await service.getTrack('abc123');
    await service.getTrack('abc123');
    assert.equal(requests, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(service.stats())), {
        cachedTracks: 1,
        requests: 1,
        lastSource: 'direct',
        lastError: null,
        authenticated: false
    });
});
