import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A7-virtual-list.js', import.meta.url), 'utf8');

function windowFor(...args) {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__windowFor = virtualWindowFor;`, context);
    return context.__windowFor(...args);
}

test('returns a bounded virtual window with overscan', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(windowFor(1000, 640, 320))), {
        start: 2,
        end: 23,
        totalHeight: 64000
    });
    assert.deepEqual(JSON.parse(JSON.stringify(windowFor(4, 99999, 320))), {
        start: 4,
        end: 4,
        totalHeight: 256
    });
});
