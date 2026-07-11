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
    if (!html.includes('tiinex:build-source') || !html.includes('Tiinex/site')) fail('public index must include stable source identity metadata.');
    if (html.includes('id="viewer-entrypoint-notice"')) fail('public index must not restore the removed visible viewer entrypoint notice.');
    if (!/<section\s+id="tiinex-llm-entrypoint"[\s\S]*?\bhidden\b/u.test(html)) fail('public index must preserve the hidden Tiinex LLM entrypoint.');
    if (!html.includes('data-tiinex-llm-entrypoint="./llms.txt"')) fail('public index hidden Tiinex LLM entrypoint must retain the llms.txt binding.');
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
    if (!bundle.includes("repository: 'Tiinex/site'") || !bundle.includes("channel: 'source'") || !bundle.includes('buildIdentityReport') || !bundle.includes('routeLoadPresentationReport')) fail('public bundle must include stable source identity and route-load diagnostics.');
    if (!bundle.includes('workspace-config-save') || bundle.includes('workspace-config-download')) fail('public bundle must save workspace configuration through local draft persistence.');
    if (!bundle.includes('await saveNodeEdit(ws, node, markdown)')) fail('public bundle workspace configuration save must reuse local artifact draft persistence.');
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
  console.log('✓ public build preserves CNAME, favicon, and stable source identity');
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
