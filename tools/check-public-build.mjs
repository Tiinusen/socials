#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function run(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'tiinex-public-build-'));
const out = join(tmpRoot, 'site');
try {
  const build = run(['tools/build-public.mjs', '--out', out]);
  if (build.status !== 0) {
    fail(`build-public failed:\n${build.stderr || build.stdout}`.trim());
  }

  const indexPath = join(out, 'index.html');
  const bundlePath = join(out, 'tiinex.bundle.js');
  const stylesPath = join(out, 'styles.css');

  for (const required of [indexPath, bundlePath, stylesPath, join(out, '.nojekyll'), join(out, 'assets'), join(out, '.topics'), join(out, 'samples'), join(out, 'llms.txt'), join(out, 'tiinex.app.llm.v1.md'), join(out, 'favicon.ico'), join(out, 'CNAME')]) {
    if (!existsSync(required)) fail(`Missing public build output: ${required}`);
  }

  if (existsSync(indexPath)) {
    const html = read(indexPath);
    if (!html.includes('tiinex:build-id') || !html.includes('CP333-github-target-aware-verify-mobile-read')) fail('public index must include CP333 build identity meta.');
    const localScripts = [...html.matchAll(/<script\s+src=["']\.\/[^"']+\.js["']><\/script>/gu)].map((match) => match[0]);
    if (localScripts.length !== 1 || !localScripts[0].includes('tiinex.bundle.js')) {
      fail(`public index must load exactly one local JS bundle, found: ${localScripts.join(', ') || 'none'}`);
    }
    for (const forbidden of ['./src/app/core-runtime.js', './src/app/services-runtime.js', './src/app/state-runtime.js', './src/app/ui-runtime.js', './src/app/viewstate-runtime.js', './app.js']) {
      if (html.includes(forbidden)) fail(`public index must not load development script directly: ${forbidden}`);
    }
  }

  if (existsSync(bundlePath)) {
    const syntax = spawnSync(process.execPath, ['--check', bundlePath], { encoding: 'utf8' });
    if (syntax.status !== 0) fail(`node --check public bundle failed:\n${syntax.stderr || syntax.stdout}`.trim());
    const bundle = read(bundlePath);
    if (!bundle.includes("release: '333'") || !bundle.includes('buildIdentityReport') || !bundle.includes('routeLoadPresentationReport')) fail('public bundle must include release 333 build and route-load diagnostics.');
    const sections = [
      'src/app/core-runtime.js',
      'src/app/services-runtime.js',
      'src/app/state-runtime.js',
      'src/app/ui-runtime.js',
      'src/app/viewstate-runtime.js',
      'viewer options',
      'app.js'
    ];
    let previous = -1;
    for (const section of sections) {
      const index = bundle.indexOf(section);
      if (index === -1) fail(`public bundle missing section marker: ${section}`);
      if (index < previous) fail(`public bundle section order is wrong near: ${section}`);
      previous = index;
    }
    const size = statSync(bundlePath).size;
    if (size < 100000) fail(`public bundle is unexpectedly small: ${size} bytes`);
  }

  if (failures.length) {
    console.error('\nPublic build check failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
  }

  console.log('✓ public build creates bundled site');
  console.log('✓ public index loads one local app bundle');
  console.log('✓ public bundle syntax and section order are valid');
  console.log('✓ public build preserves CNAME, favicon, and CP333 build identity');
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
