#!/usr/bin/env node
// SkyTrack build script
//
// Authoring layout (all under src/):
//   src/index.html     — HTML shell (references styles.css + app.js)
//   src/styles.css     — all stylesheet rules
//   src/modules/*.js   — feature modules, loaded in lexicographic order
//                        (numeric prefixes like 00-config.js, 10-utils.js
//                        control ordering).
//   src/app.js         — orchestrator / entry point, inlined LAST
//
// The deployable is a single self-contained index.html at the repo root:
// modules + app.js are concatenated back into the single inline <script>
// block so the build runs identically from file:// and from GitHub Pages.
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
const MODULES_DIR = path.join(SRC_DIR, 'modules');
const SHELL = path.join(SRC_DIR, 'index.html');
const CSS = path.join(SRC_DIR, 'styles.css');
const APP = path.join(SRC_DIR, 'app.js');
const DB_VERSION_FILE = path.join(__dirname, 'data', 'aircraft', 'dbversion.txt');

function read(p) {
    if (!fs.existsSync(p)) {
        console.error(`[build] missing source file: ${path.relative(__dirname, p)}`);
        process.exit(1);
    }
    return fs.readFileSync(p, 'utf8');
}

function listModules() {
    if (!fs.existsSync(MODULES_DIR)) return [];
    return fs.readdirSync(MODULES_DIR)
        .filter(name => name.endsWith('.js'))
        .sort()
        .map(name => path.join(MODULES_DIR, name));
}

function buildJs() {
    // Concatenate modules in lexicographic order, then app.js last.
    // Modules are separated by a banner comment so stack traces and
    // view-source-in-browser stay readable.
    const chunks = [];
    for (const modPath of listModules()) {
        const rel = 'modules/' + path.basename(modPath);
        chunks.push(`    // ─── module: ${rel} ───────────────────────────────────────────`);
        chunks.push(read(modPath).replace(/\s+$/, ''));
    }
    chunks.push('    // ─── entry: app.js ───────────────────────────────────────────');
    chunks.push(read(APP).replace(/\s+$/, ''));
    return chunks.join('\n');
}

function bumpDatabaseVersion() {
    if (!fs.existsSync(DB_VERSION_FILE)) {
        console.error('[build] missing data/aircraft/dbversion.txt');
        process.exit(1);
    }
    const current = fs.readFileSync(DB_VERSION_FILE, 'utf8').trim();
    const parts = current.split('.');
    const last = Number(parts[parts.length - 1]);
    if (!parts.length || !Number.isSafeInteger(last) || last < 0) {
        console.error('[build] invalid data/aircraft/dbversion.txt: expected dotted numeric version');
        process.exit(1);
    }
    parts[parts.length - 1] = String(last + 1);
    const next = parts.join('.');
    fs.writeFileSync(DB_VERSION_FILE, next + '\n', 'utf8');
    return next;
}

function build() {
    const shell = read(SHELL);
    const css = read(CSS).replace(/\s+$/, '');
    const js = buildJs();

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
    // such sequence in the CSS or JS payload would corrupt the output.
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
const dbVersion = bumpDatabaseVersion();
const moduleCount = listModules().length;
console.log(`[build] wrote ${path.relative(__dirname, outPath)} (${built.length} bytes, ${built.split(/\r?\n/).length} lines, ${moduleCount} modules + app.js; dbversion ${dbVersion})`);
