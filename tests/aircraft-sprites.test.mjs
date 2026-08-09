import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/modules/A5-aircraft-sprites.js', import.meta.url), 'utf8');

function createHarness() {
    const context = {};
    vm.createContext(context);
    vm.runInContext(`${source}\n globalThis.__aircraftSprites = { categories: AIRCRAFT_SPRITE_CATEGORIES, sprites: AIRCRAFT_SPRITES, categoryFor: aircraftSpriteCategory, svg: aircraftSpriteSvg };`, context);
    return context.__aircraftSprites;
}

test('maps ADS-B categories to distinct inline sprite symbols', () => {
    const sprites = createHarness();
    const categories = ['A1', 'A2', 'A3', 'A5', 'A7', 'B1', 'B2', 'B4', 'B6', 'B7'];
    assert.deepEqual(JSON.parse(JSON.stringify(sprites.categories)), categories);
    for (const category of categories) {
        assert.equal(sprites.categoryFor({ category }), category);
        assert.match(sprites.sprites[category].body, /</);
    }
    assert.equal(sprites.categoryFor({ category: 'A4' }), 'A3');
    assert.equal(sprites.categoryFor({ category: 'A6' }), 'A2');
});

test('uses type and ground fallbacks without losing marker rotation semantics', () => {
    const sprites = createHarness();
    assert.equal(sprites.categoryFor({ t: 'R44' }), 'A7');
    assert.equal(sprites.categoryFor({ t: 'GLID' }), 'B1');
    assert.equal(sprites.categoryFor({ t: 'DRON' }), 'B6');
    assert.equal(sprites.categoryFor({ t: 'SAT' }), 'B7');
    assert.equal(sprites.categoryFor({ alt_baro: 'ground' }), 'GROUND');

    const rotated = sprites.svg({ category: 'A5' }, { size: 36, rotation: 135, filter: 'brightness(0)' });
    assert.match(rotated, /data-sprite-category="A5"/);
    assert.match(rotated, /href="#skytrack-aircraft-A5"/);
    assert.match(rotated, /transform:rotate\(135deg\)/);
    assert.match(rotated, /<use /);
    assert.match(rotated, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

    const balloon = sprites.svg({ category: 'B2' }, { rotation: 270 });
    assert.doesNotMatch(balloon, /transform:rotate/);
});
