import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A13-accessibility.js', import.meta.url), 'utf8');

test('normalizes the reduced-motion media preference', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__prefers = prefersReducedMotionFrom;`, context);
    assert.equal(context.__prefers({ matches: true }), true);
    assert.equal(context.__prefers({ matches: false }), false);
    assert.equal(context.__prefers(null), false);
});
