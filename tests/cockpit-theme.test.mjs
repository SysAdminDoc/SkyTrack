import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('cockpit OLED theme is selectable and keeps the map black with neon controls', () => {
    assert.match(app, /cockpit:\s*\{[\s\S]*?name:\s*'Cockpit OLED'/);
    assert.match(app, /classList\.toggle\('cockpit-theme', themeName === 'cockpit'\)/);
    assert.match(shell, /data-theme="cockpit"/);
    assert.match(css, /body\.cockpit-theme\s*\{[\s\S]*?background:\s*#000/);
    assert.match(css, /body\.cockpit-theme #map/);
});
