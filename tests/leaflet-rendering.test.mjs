import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A11-leaflet-rendering.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__helpers = { edgeBufferRatioForZoom, bufferedOverlayBounds, airwayOffsetFor };`, context);
    return context.__helpers;
}

test('buffers overlay queries more at low zoom without crossing world limits', () => {
    const { edgeBufferRatioForZoom, bufferedOverlayBounds } = helpers();
    assert.equal(edgeBufferRatioForZoom(4), 0.24);
    assert.ok(edgeBufferRatioForZoom(12) < edgeBufferRatioForZoom(5));
    assert.deepEqual(JSON.parse(JSON.stringify(bufferedOverlayBounds({ west: -10, south: 20, east: 10, north: 40 }, 8))), {
        west: -12.5,
        south: 17.5,
        east: 12.5,
        north: 42.5
    });
});

test('keeps V and J airway lanes visually separated when offset support is loaded', () => {
    const { airwayOffsetFor } = helpers();
    assert.equal(airwayOffsetFor('V12'), -4);
    assert.equal(airwayOffsetFor('J60'), 4);
    assert.equal(airwayOffsetFor(''), 0);
});
