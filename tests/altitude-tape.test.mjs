import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A9-altitude-tape.js', import.meta.url), 'utf8');

function modelFor(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__model = altitudeTapeModel;`, context);
    return JSON.parse(JSON.stringify(context.__model(...args)));
}

test('uses a readable scale and climbing trend for airborne traffic', () => {
    const model = modelFor(34500, 900);
    assert.equal(model.step, 5000);
    assert.equal(model.trend, 'up');
    assert.equal(model.display, '34,500 ft');
    assert.deepEqual(model.ticks, [50000, 45000, 40000, 35000, 30000, 25000, 20000]);
    assert.equal(model.rateLabel, '+900 fpm');
});

test('handles ground and descending aircraft without invalid labels', () => {
    const ground = modelFor('ground', 0);
    assert.equal(ground.isGround, true);
    assert.equal(ground.display, 'GROUND');
    assert.equal(ground.trend, 'level');

    const descending = modelFor(8400, -650);
    assert.equal(descending.step, 1000);
    assert.equal(descending.trend, 'down');
    assert.equal(descending.ticks[3], 8000);
});
