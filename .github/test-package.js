#!/usr/bin/env node

/**
 * Packs the module as `npm publish` would, installs the tarball into an empty project and loads it
 * with import and with require - a check of `files`, `exports` and the typings, not of the code.
 *
 *   npm run test:package
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // .github/..
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artnet-package-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit']});

try {
    // npm up to 11 prints an array, npm 12 an object keyed by package name
    const [{filename, files}] = Object.values(
        JSON.parse(run('npm', ['pack', '--json', '--pack-destination', dir], root)),
    );
    const packed = files.map((f) => f.path).sort();
    console.log(filename + '\n  ' + packed.join('\n  '));
    for (const file of ['lib/artnet.js', 'index.d.ts', 'README.md', 'CHANGELOG.md', 'LICENSE', 'package.json']) {
        assert.ok(packed.includes(file), file + ' is missing in the package');
    }
    assert.ok(!packed.some((f) => /^(test|types-test|\.github)\//.test(f)), 'development files in the package');

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'consumer', private: true}));
    run('npm', ['install', '--no-audit', '--no-fund', '--silent', path.join(dir, filename)], dir);

    const check = `
        assert.equal(typeof Artnet, 'function');
        const artnet = Artnet({host: '127.0.0.1'});
        assert.ok(artnet instanceof Artnet);
        artnet.set(1, 255, (err, bytes) => {
            assert.equal(err, null);
            assert.equal(bytes, 20);
            artnet.close(() => console.log('  ' + kind + ' ok'));
        });`;
    fs.writeFileSync(
        path.join(dir, 'esm.mjs'),
        `import assert from 'node:assert/strict';\nimport Artnet, {Artnet as Named} from 'artnet';\n` +
            `const kind = 'import';\nassert.equal(Named, Artnet);${check}\n`,
    );
    fs.writeFileSync(
        path.join(dir, 'cjs.cjs'),
        `const assert = require('node:assert/strict');\nconst Artnet = require('artnet');\n` +
            `const kind = 'require';\nassert.equal(require('artnet/lib/artnet.js'), Artnet);${check}\n`,
    );
    process.stdout.write(run('node', ['esm.mjs'], dir));
    process.stdout.write(run('node', ['cjs.cjs'], dir));

    // the typings as a TypeScript consumer resolves them, from ESM and from CommonJS
    const tsconfig = {
        compilerOptions: {noEmit: true, strict: true, module: 'nodenext', types: ['node'], skipLibCheck: true},
        files: ['esm.mts', 'cjs.cts'],
    };
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
    const use = `const artnet: Artnet = new Artnet({host: '127.0.0.1'});\nartnet.set(1, 255);\nartnet.close();\n`;
    fs.writeFileSync(path.join(dir, 'esm.mts'), `import Artnet from 'artnet';\n${use}`);
    fs.writeFileSync(path.join(dir, 'cjs.cts'), `import {Artnet} from 'artnet';\n${use}`);
    fs.symlinkSync(path.join(root, 'node_modules', '@types'), path.join(dir, 'node_modules', '@types'));
    run(path.join(root, 'node_modules', '.bin', 'tsc'), ['-p', dir], dir);
    console.log('  types ok');
} finally {
    fs.rmSync(dir, {recursive: true, force: true});
}
