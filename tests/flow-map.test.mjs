import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A19-flow-map.js', import.meta.url), 'utf8');

function helpers() {
    const context = { Math, Object, Map, Array, Number, String, document: undefined };
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__flow = { flowRouteGroups, flowCurvePoints };`, context);
    return {
        flowRouteGroups: (...args) => JSON.parse(JSON.stringify(context.__flow.flowRouteGroups(...args))),
        flowCurvePoints: (...args) => JSON.parse(JSON.stringify(context.__flow.flowCurvePoints(...args)))
    };
}

test('flow map groups known routes by direction and count', () => {
    const { flowRouteGroups } = helpers();
    const groups = flowRouteGroups({
        a: { hex: 'A', from: 'KJFK', to: 'KLAX' },
        b: { hex: 'B', from: 'KJFK', to: 'KLAX' },
        c: { hex: 'C', from: 'KLAX', to: 'KJFK' },
        d: { hex: 'D', from: '', to: 'KJFK' }
    });
    assert.deepEqual(groups.map(group => [group.from, group.to, group.count]), [
        ['KJFK', 'KLAX', 2], ['KLAX', 'KJFK', 1]
    ]);
});

test('flow curves include endpoints and bend away from the great-circle chord', () => {
    const { flowCurvePoints } = helpers();
    const points = flowCurvePoints({ lat: 0, lon: 0 }, { lat: 10, lon: 10 }, 10);
    assert.deepEqual(points[0], [0, 0]);
    assert.deepEqual(points.at(-1), [10, 10]);
    assert.notEqual(points[5][0], points[5][1]);
});
