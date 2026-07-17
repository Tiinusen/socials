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

function copyPathIfExists(source, outDir, target = source) {
  if (!existsSync(path(source))) {
    console.log(`Skipping absent optional publish source: ${source}`);
    return false;
  }
  copyPath(source, outDir, target);
  return true;
}

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim();
}

function envList(name, fallback = []) {
  const raw = envValue(name);
  if (!raw) return fallback;
  return raw.split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
}

function truthyEnv(name) {
  return /^(1|true|yes|on)$/iu.test(envValue(name));
}

function defaultRepositoryName() {
  const repo = envValue('GITHUB_REPOSITORY') || envValue('TIINEX_BUILD_REPOSITORY');
  return repo.split('/').filter(Boolean).slice(-1)[0] || 'Tiinex';
}

function writeOptionalCname(out) {
  const envCname = envValue('PAGES_CNAME');
  const sourceCname = truthyEnv('TIINEX_USE_SOURCE_CNAME') && existsSync(path('CNAME')) ? readFileSync(path('CNAME'), 'utf8').trim() : '';
  const cname = envCname || sourceCname;
  if (cname) writeFileSync(join(out, 'CNAME'), `${cname}\n`, 'utf8');
  return Boolean(cname);
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
  const repository = envValue('TIINEX_VIEWER_GIT_REPO') || envValue('GITHUB_REPOSITORY');
  const ref = envValue('TIINEX_VIEWER_GIT_REF') || envValue('SOURCE_REF') || envValue('GITHUB_REF_NAME');
  const rootPaths = envList('TIINEX_VIEWER_GIT_ROOTS', ['.topics']);
  const browserTitle = envValue('TIINEX_VIEWER_TITLE') || defaultRepositoryName();
  const gitNative = {
    enabled: envValue('TIINEX_VIEWER_GIT_ENABLED', repository ? 'true' : 'false') !== 'false',
    loadFromUnpkg: true,
    allowDefaultVendorUrls: true,
    depth: Number(envValue('TIINEX_VIEWER_GIT_DEPTH', '1')) || 1
  };
  if (repository) gitNative.repo = repository;
  if (ref) gitNative.ref = ref;
  if (rootPaths.length) gitNative.rootPaths = rootPaths;
  const buildSource = envValue('TIINEX_BUILD_REPOSITORY') || envValue('GITHUB_REPOSITORY') || 'local';
  const options = {
    createWorkspace: true,
    browserTitle,
    buildIdentity: {
      repository: buildSource,
      channel: envValue('TIINEX_BUILD_CHANNEL', 'source'),
      builtFor: envValue('TIINEX_BUILD_LABEL', `${buildSource} public build`),
      publicBuildOutputExcluded: true
    }
  };
  parts.push(`\n;/* ---- viewer options ---- */\n`);
  parts.push(`(function () {\n  const defaultGitNative = ${JSON.stringify(gitNative, null, 2)};\n  const existing = window.TIINEX_VIEWER_OPTIONS || {};\n  window.TIINEX_VIEWER_OPTIONS = Object.assign(${JSON.stringify(options, null, 2)}, existing);\n  window.TIINEX_VIEWER_OPTIONS.gitNative = Object.assign({}, defaultGitNative, existing.gitNative || existing.gitNativeRuntime || {});\n})();\n`);
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

  const buildSource = envValue('TIINEX_BUILD_REPOSITORY') || envValue('GITHUB_REPOSITORY') || 'local';
  let publicIndex = stripLocalScripts(read('index.html'));
  publicIndex = publicIndex.replace(/(<meta name=["']tiinex:build-source["'] content=["'])[^"']*(["']>)/u, `$1${buildSource}$2`);
  writeFileSync(join(out, 'index.html'), publicIndex, 'utf8');
  writeFileSync(join(out, 'tiinex.bundle.js'), bundleSource(), 'utf8');

  for (const file of ['styles.css', 'llms.txt', 'tiinex.app.llm.v1.md', 'tiinex.context.v1.md', 'tiinex.orientation.v1.md', 'tiinex.orientation.manifest.v1.json', 'robots.txt', 'favicon.ico']) {
    copyPathIfExists(file, out);
  }
  for (const dir of ['assets', '.topics', 'samples']) {
    copyPathIfExists(dir, out);
  }

  writeFileSync(join(out, '.nojekyll'), '', 'utf8');
  writeOptionalCname(out);

  console.log(`Built public site: ${basename(out)}`);
}

main();
