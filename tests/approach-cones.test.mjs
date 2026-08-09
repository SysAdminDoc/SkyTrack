import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A22-approach-cones.js', import.meta.url), 'utf8');

function helpers() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__approach = { approachDestination, approachConePoints };`, context);
    return {
        approachDestination: (...args) => JSON.parse(JSON.stringify(context.__approach.approachDestination(...args))),
        approachConePoints: (...args) => JSON.parse(JSON.stringify(context.__approach.approachConePoints(...args)))
    };
}

test('builds a ten-nautical-mile cone with a centered north endpoint', () => {
    const { approachConePoints } = helpers();
    const points = approachConePoints({ lat: 0, lon: 0 }, 0, 10, 12, 4);
    assert.equal(points.length, 6);
    assert.deepEqual(points[0], [0, 0]);
    assert.ok(points[1][1] < 0 && points.at(-1)[1] > 0);
    assert.ok(points[3][0] > 0.15 && Math.abs(points[3][1]) < 0.01);
});

test('rejects invalid airport geometry', () => {
    const { approachConePoints } = helpers();
    assert.deepEqual(approachConePoints({ lat: 'not-a-lat', lon: 0 }), []);
});
