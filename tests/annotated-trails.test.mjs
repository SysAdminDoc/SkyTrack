import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A29-annotated-trails.js', import.meta.url), 'utf8');

function geoJson(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__geo = annotationGeoJson;`, context);
    return JSON.parse(JSON.stringify(context.__geo(...args)));
}

test('stores line metadata and annotation point features in GeoJSON', () => {
    const result = geoJson([{ lat: 1, lon: 2, alt: 3000 }, { lat: 2, lon: 3, alt: 4000 }], [{ lat: 1.5, lon: 2.5, text: 'Turn here', timestamp: 1700000000000 }], { hex: 'ABC123' });
    assert.equal(result.features.length, 2);
    assert.deepEqual(result.features[0].geometry.coordinates[0], [2, 1, 3000]);
    assert.equal(result.features[0].properties.annotations[0].text, 'Turn here');
    assert.equal(result.features[1].geometry.type, 'Point');
});
