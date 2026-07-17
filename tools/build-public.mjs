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

function workspaceBootstrapCandidatesFromEnv() {
  const candidates = [];
  const add = (kind, value, role, label) => {
    const url = String(value || '').trim();
    if (!url) return;
    const candidate = { kind, role, label: label || role, source: `env:${role}` };
    if (kind === 'local-path') candidate.path = url;
    else candidate.url = url;
    candidates.push(candidate);
  };

  add('github-issue-pointer', envValue('TIINEX_WORKSPACE_POINTER_PRIMARY'), 'primary', 'Primary workspace pointer');
  add('github-issue-pointer', envValue('TIINEX_WORKSPACE_POINTER_SECONDARY'), 'secondary', 'Secondary workspace pointer');
  envList('TIINEX_WORKSPACE_POINTERS').forEach((value, index) => {
    add('github-issue-pointer', value, `pointer-${index + 1}`, `Workspace pointer ${index + 1}`);
  });

  add('workspace-url', envValue('TIINEX_DEFAULT_WORKSPACE'), 'default-workspace', 'Default workspace');
  add('workspace-url', envValue('TIINEX_FALLBACK_WORKSPACE'), 'fallback-workspace', 'Fallback workspace');
  envList('TIINEX_WORKSPACE_FALLBACKS').forEach((value, index) => {
    add('workspace-url', value, `fallback-${index + 1}`, `Workspace fallback ${index + 1}`);
  });

  add('local-path', envValue('TIINEX_LOCAL_WORKSPACE_PATH'), 'local-packaged-workspace', 'Packaged workspace');
  return candidates;
}

function writeOptionalCname(out) {
  const envCname = envValue('PAGES_CNAME');
  const sourceCname = truthyEnv('TIINEX_USE_SOURCE_CNAME') && existsSync(path('CNAME')) ? readFileSync(path('CNAME'), 'utf8').trim() : '';
  const cname = envCname || sourceCname;
  if (cname) writeFileSync(join(out, 'CNAME'), `${cname}\n`, 'utf8');
  return Boolean(cname);
}


function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function parseRedirectLine(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  let left = '';
  let right = '';
  for (const separator of ['=', '|']) {
    if (raw.includes(separator)) {
      [left, right] = raw.split(separator, 2).map((part) => part.trim());
      break;
    }
  }
  if (!left && !right) {
    const parts = raw.split(/\s+/u);
    if (parts.length < 2) throw new Error(`Invalid TIINEX_PUBLIC_REDIRECTS line: ${raw}`);
    left = parts.shift();
    right = parts.join(' ');
  }
  const target = String(right || '').trim();
  const route = String(left || '').trim().replace(/^\/+|\/+$/gu, '');
  if (!route || route === '.') throw new Error(`Redirect path must not target public root: ${raw}`);
  if (route.split('/').includes('..')) throw new Error(`Unsafe redirect path: ${raw}`);
  if (!/^https?:\/\//iu.test(target)) throw new Error(`Redirect target must be absolute HTTP(S): ${raw}`);
  return { route, target };
}

function writePublicRedirects(out) {
  const redirects = envValue('TIINEX_PUBLIC_REDIRECTS');
  if (!redirects) return 0;
  let count = 0;
  for (const line of redirects.split(/\n/u)) {
    const redirect = parseRedirectLine(line);
    if (!redirect) continue;
    const redirectDir = join(out, redirect.route);
    const escaped = escapeHtml(redirect.target);
    mkdirSync(redirectDir, { recursive: true });
    writeFileSync(join(redirectDir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${escaped}">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${escaped}">
  <title>Redirecting</title>
</head>
<body>
  <p>Redirecting to <a href="${escaped}">${escaped}</a>.</p>
</body>
</html>
`, 'utf8');
    count += 1;
  }
  return count;
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
  const workspaceCandidates = workspaceBootstrapCandidatesFromEnv();
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
  parts.push(`
;/* ---- viewer options ---- */
`);
  parts.push(`(function () {
  const defaultGitNative = ${JSON.stringify(gitNative, null, 2)};
  const workspaceCandidates = ${JSON.stringify(workspaceCandidates, null, 2)};
  const existing = window.TIINEX_VIEWER_OPTIONS || {};
  window.TIINEX_VIEWER_OPTIONS = Object.assign(${JSON.stringify(options, null, 2)}, existing);
  window.TIINEX_VIEWER_OPTIONS.gitNative = Object.assign({}, defaultGitNative, existing.gitNative || existing.gitNativeRuntime || {});
  const existingWorkspace = window.TiinexWorkspace || window.tiinexWorkspace || window.TIINEX_WORKSPACE || {};
  if (workspaceCandidates.length) {
    const existingCandidates = Array.isArray(existingWorkspace.candidates) ? existingWorkspace.candidates : [];
    window.TiinexWorkspace = Object.assign({}, existingWorkspace, { candidates: workspaceCandidates.concat(existingCandidates) });
  }
})();
`);
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
  for (const dir of ['assets', '.topics']) {
    copyPathIfExists(dir, out);
  }

  writeFileSync(join(out, '.nojekyll'), '', 'utf8');
  writeOptionalCname(out);
  const redirectCount = writePublicRedirects(out);
  if (redirectCount) console.log(`Generated ${redirectCount} public redirect(s).`);

  console.log(`Built public site: ${basename(out)}`);
}

main();
