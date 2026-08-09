import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shell = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('pinned external scripts carry SRI and cross-origin attributes', () => {
    const scripts = [...shell.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)]
        .filter(match => match[1] !== 'app.js');
    assert.equal(scripts.length, 5);
    for (const match of scripts) {
        const tag = match[0];
        assert.match(tag, /integrity="sha384-[^"]+"/);
        assert.match(tag, /crossorigin="anonymous"/);
    }
});

test('the shell keeps the security policy and every image opts into async lazy decoding', () => {
    const csp = shell.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /connect-src \*/);
    assert.match(csp, /worker-src 'self' blob:/);
    assert.match(shell, /http-equiv="Permissions-Policy"/);
    const images = [...shell.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
    assert.ok(images.length > 0);
    for (const tag of images) {
        assert.match(tag, /loading="lazy"/);
        assert.match(tag, /decoding="async"/);
    }
    assert.match(app, /img\.loading\s*=\s*'lazy'/);
    assert.match(app, /img\.decoding\s*=\s*'async'/);
});
