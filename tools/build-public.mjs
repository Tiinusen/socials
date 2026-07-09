#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const scriptOrder = Object.freeze([
  'src/app/core-runtime.js',
  'src/app/services-runtime.js',
  'src/app/git-native-runtime.js',
  'src/app/state-runtime.js',
  'src/app/ui-runtime.js',
  'src/app/viewstate-runtime.js',
]);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function path(...parts) {
  return join(root, ...parts);
}

function read(pathname) {
  return readFileSync(path(pathname), 'utf8');
}

function ensureParent(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function copyPath(source, outDir, target = source) {
  const from = path(source);
  const to = join(outDir, target);
  if (!existsSync(from)) throw new Error(`Missing publish source: ${source}`);
  rmSync(to, { recursive: true, force: true });
  ensureParent(to);
  cpSync(from, to, { recursive: true });
}

function stripLocalScripts(html) {
  let output = html;
  for (const script of scriptOrder) {
    const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`\\n?\\s*<script\\s+src=["']\\./${escaped}["']><\\/script>`, 'u'), '');
  }
  output = output.replace(/\n?\s*<script>\s*\/\/ App-level viewer options[\s\S]*?window\.TIINEX_VIEWER_OPTIONS = window\.TIINEX_VIEWER_OPTIONS \|\| \{[\s\S]*?createWorkspace: true[\s\S]*?\};\s*<\/script>/u, '');
  output = output.replace(/\n?\s*<script\s+src=["']\.\/app\.js["']><\/script>/u, '\n  <script src="./tiinex.bundle.js"></script>');
  return output;
}

function bundleSource() {
  const parts = [];
  for (const script of scriptOrder) {
    parts.push(`\n;/* ---- ${script} ---- */\n`);
    parts.push(read(script));
    parts.push('\n');
  }
  parts.push(`\n;/* ---- viewer options ---- */\n`);
  parts.push(`(function () {\n  const defaultGitNative = {\n    enabled: true,\n    repo: 'Tiinex/docs',\n    ref: 'master',\n    rootPaths: ['.topics'],\n    loadFromUnpkg: true,\n    allowDefaultVendorUrls: true,\n    corsProxy: 'https://cors.isomorphic-git.org',\n    depth: 1,\n    historicalDepth: 64,\n    historicalMaxDepth: 256\n  };\n  const existing = window.TIINEX_VIEWER_OPTIONS || {};\n  window.TIINEX_VIEWER_OPTIONS = Object.assign({ createWorkspace: true, browserTitle: 'Tiinex' }, existing);\n  window.TIINEX_VIEWER_OPTIONS.gitNative = Object.assign({}, defaultGitNative, existing.gitNative || existing.gitNativeRuntime || {});\n})();\n`);
  parts.push(`\n;/* ---- app.js ---- */\n`);
  parts.push(read('app.js'));
  parts.push('\n');
  return parts.join('');
}

function main() {
  const outArg = argValue('--out', '.site-publish');
  const out = isAbsolute(outArg) ? outArg : path(outArg);

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const publicIndex = stripLocalScripts(read('index.html'));
  writeFileSync(join(out, 'index.html'), publicIndex, 'utf8');
  writeFileSync(join(out, 'tiinex.bundle.js'), bundleSource(), 'utf8');

  for (const file of ['styles.css', 'llms.txt', 'tiinex.app.llm.v1.md', 'favicon.ico']) {
    copyPath(file, out);
  }
  for (const dir of ['assets', '.topics', 'samples']) {
    copyPath(dir, out);
  }

  writeFileSync(join(out, '.nojekyll'), '', 'utf8');
  const envCname = (process.env.PAGES_CNAME || '').trim();
  const sourceCname = existsSync(path('CNAME')) ? readFileSync(path('CNAME'), 'utf8').trim() : '';
  const cname = envCname || sourceCname;
  if (cname) writeFileSync(join(out, 'CNAME'), `${cname}\n`, 'utf8');

  console.log(`Built public site: ${basename(out)}`);
}

main();
