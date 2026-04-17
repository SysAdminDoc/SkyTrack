#!/usr/bin/env node
// SkyTrack build script
//
// The project is authored as a small set of files under src/:
//   src/index.html  — HTML shell (references styles.css + app.js)
//   src/styles.css  — all stylesheet rules
//   src/app.js      — the main application script
//
// GitHub Pages deploys the root index.html as a single, self-contained file
// with no build step or server runtime. This script produces that root
// index.html by inlining styles.css and app.js back into the src shell.
//
// Usage:
//   node build.mjs                # build to ./index.html
//   node build.mjs --out foo.html # build to ./foo.html
//   node build.mjs --check        # fail if the existing index.html differs
//
// No external dependencies — plain Node stdlib only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'src');
const SHELL = path.join(SRC_DIR, 'index.html');
const CSS = path.join(SRC_DIR, 'styles.css');
const JS = path.join(SRC_DIR, 'app.js');

function read(p) {
    if (!fs.existsSync(p)) {
        console.error(`[build] missing source file: ${path.relative(__dirname, p)}`);
        process.exit(1);
    }
    return fs.readFileSync(p, 'utf8');
}

function build() {
    const shell = read(SHELL);
    const css = read(CSS).replace(/\s+$/, '');
    const js = read(JS).replace(/\s+$/, '');

    const linkRe = /<link\s+rel="stylesheet"\s+href="styles\.css"\s*\/?\s*>\s*/i;
    const scriptRe = /<script\s+src="app\.js"\s*>\s*<\/script>\s*/i;

    if (!linkRe.test(shell)) {
        console.error('[build] src/index.html missing <link rel="stylesheet" href="styles.css">');
        process.exit(1);
    }
    if (!scriptRe.test(shell)) {
        console.error('[build] src/index.html missing <script src="app.js"></script>');
        process.exit(1);
    }

    // NOTE: use function replacers, not string replacers. String replacers
    // treat sequences like $&, $', $`, $n as replacement references, so any
    // such sequence in the CSS or JS payload would corrupt the output. Our
    // app.js contains literal "$'" inside string replace calls, which
    // previously caused the build output to splice HTML body markup into the
    // middle of the script. Function replacers return the string verbatim.
    let out = shell.replace(linkRe, () => `<style>\n${css}\n    </style>\n    `);
    out = out.replace(scriptRe, () => `<script>\n${js}\n    </script>\n`);
    return out;
}

const args = process.argv.slice(2);
let outPath = path.join(__dirname, 'index.html');
let checkMode = false;

for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out' || a === '-o') {
        outPath = path.resolve(__dirname, args[++i]);
    } else if (a === '--check') {
        checkMode = true;
    } else if (a === '--help' || a === '-h') {
        console.log('Usage: node build.mjs [--out file] [--check]');
        process.exit(0);
    } else {
        console.error(`[build] unknown arg: ${a}`);
        process.exit(1);
    }
}

const built = build();

if (checkMode) {
    if (!fs.existsSync(outPath)) {
        console.error(`[build] --check: ${path.relative(__dirname, outPath)} does not exist`);
        process.exit(2);
    }
    const current = fs.readFileSync(outPath, 'utf8');
    if (current !== built) {
        console.error(`[build] --check: ${path.relative(__dirname, outPath)} is out of date. Run \`node build.mjs\`.`);
        process.exit(2);
    }
    console.log(`[build] --check: ${path.relative(__dirname, outPath)} is up to date (${built.length} bytes)`);
    process.exit(0);
}

fs.writeFileSync(outPath, built, 'utf8');
console.log(`[build] wrote ${path.relative(__dirname, outPath)} (${built.length} bytes, ${built.split(/\r?\n/).length} lines)`);
