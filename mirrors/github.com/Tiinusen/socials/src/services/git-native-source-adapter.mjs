/**
 * Git-native source adapter spine.
 *
 * This module is the first executable boundary for the post-raw Git source
 * direction. It is intentionally dependency-injected: a browser/runtime can
 * provide an isomorphic-git compatible `git`, `fs`, `http`, object `cache`, and
 * optional TREE walker without this package silently pulling a CDN/proxy or
 * hidden server into Tiinex.
 *
 * Design rules:
 * - local Git object store first;
 * - Time Portal reads address commit/tree/blob source states directly;
 * - permalink/origin lookup is a recovery anchor after local capabilities fail;
 * - repo file discovery is separate from GitHub issue/comment surfaces.
 */

import { gitSourceStateAnchor, normalizeGitSourceSpec } from './git-source-adapter.mjs';

export const GIT_NATIVE_ADAPTER_CAPABILITY = Object.freeze({
  id: 'tiinex.git-native-source-adapter.v1',
  runtimeShape: 'isomorphic-git-compatible-injected-runtime',
  hiddenNetwork: false,
  hiddenProxy: false,
  primaryReadPath: 'local-git-object-store',
  fallbackReadPath: 'explicit-provider-fallback-only',
  timePortal: Object.freeze({
    commitAddressable: true,
    blobAtCommit: true,
    ancestryOptional: true,
    remoteLookupOnlyWhenMissingLocalObject: true
  }),
  requiredRuntime: Object.freeze(['git', 'fs', 'dir']),
  optionalRuntime: Object.freeze(['http', 'cache', 'TREE', 'listFiles', 'readText', 'onProgress', 'onEvent'])
});

export function makeGitNativeAdapterRuntime(runtime = {}) {
  const normalized = Object.freeze({
    git: runtime.git || null,
    fs: runtime.fs || null,
    http: runtime.http || null,
    dir: cleanDir(runtime.dir || '/tiinex-git-source'),
    cache: runtime.cache || {},
    TREE: runtime.TREE || runtime.git?.TREE || null,
    onProgress: typeof runtime.onProgress === 'function' ? runtime.onProgress : null,
    onEvent: typeof runtime.onEvent === 'function' ? runtime.onEvent : null,
    listFiles: typeof runtime.listFiles === 'function' ? runtime.listFiles : null,
    readText: typeof runtime.readText === 'function' ? runtime.readText : null,
    remoteUrlFor: typeof runtime.remoteUrlFor === 'function' ? runtime.remoteUrlFor : null,
    corsProxy: String(runtime.corsProxy || '').trim(),
    cloneDepth: Math.max(1, Number(runtime.cloneDepth || 1)),
    cloneBatchSize: Math.max(1, Number(runtime.cloneBatchSize || 100))
  });
  return normalized;
}

export function createGitNativeSourceAdapter(runtimeInput = {}) {
  const runtime = makeGitNativeAdapterRuntime(runtimeInput);

  function emit(event, detail = {}) {
    runtime.onEvent?.({ at: new Date().toISOString(), event, detail });
  }

  function requireRuntime(method, keys = GIT_NATIVE_ADAPTER_CAPABILITY.requiredRuntime) {
    const missing = keys.filter((key) => !runtime[key]);
    if (missing.length) {
      throw new Error(`${method} requires Git native runtime: ${missing.join(', ')}`);
    }
  }

  async function resolveSource(spec = {}) {
    const source = normalizeGitSourceSpec(spec);
    const remote = source.remote || runtime.remoteUrlFor?.(source) || gitRemoteUrlFromSource(source);
    return Object.freeze({
      ...source,
      remote,
      sourceStatePreference: 'local-git-object-store-first'
    });
  }

  async function acquireSnapshot(spec = {}, options = {}) {
    requireRuntime('acquireSnapshot');
    const source = await resolveSource(spec);
    const ref = String(options.ref || source.ref || 'HEAD').trim() || 'HEAD';
    const shouldClone = Boolean(options.clone || options.acquire === 'clone');
    const shouldFetch = Boolean(options.fetch || options.acquire === 'fetch');

    if (shouldClone) {
      if (typeof runtime.git.clone !== 'function') throw new Error('acquireSnapshot clone requires git.clone.');
      emit('git.clone.start', { remote: source.remote, ref, depth: options.depth || runtime.cloneDepth });
      await runtime.git.clone({
        fs: runtime.fs,
        http: runtime.http,
        dir: runtime.dir,
        url: source.remote,
        ref,
        singleBranch: options.singleBranch !== false,
        noCheckout: options.noCheckout !== false,
        noTags: options.noTags !== false,
        depth: Math.max(1, Number(options.depth || runtime.cloneDepth)),
        corsProxy: runtime.corsProxy || undefined,
        cache: runtime.cache,
        nonBlocking: true,
        batchSize: runtime.cloneBatchSize,
        onProgress: runtime.onProgress || undefined
      });
      emit('git.clone.complete', { remote: source.remote, ref });
    } else if (shouldFetch) {
      if (typeof runtime.git.fetch !== 'function') throw new Error('acquireSnapshot fetch requires git.fetch.');
      emit('git.fetch.start', { remote: source.remote, ref, depth: options.depth || runtime.cloneDepth });
      await runtime.git.fetch({
        fs: runtime.fs,
        http: runtime.http,
        dir: runtime.dir,
        url: source.remote || undefined,
        ref,
        singleBranch: options.singleBranch !== false,
        depth: Math.max(1, Number(options.depth || runtime.cloneDepth)),
        corsProxy: runtime.corsProxy || undefined,
        cache: runtime.cache,
        onProgress: runtime.onProgress || undefined
      });
      emit('git.fetch.complete', { remote: source.remote, ref });
    }

    const commit = await resolveRef({ ...source, ref }, options);
    const anchor = gitSourceStateAnchor({ repo: source.repo, remote: source.remote, ref, commit, asOf: options.asOf || source.requestedTime || '' });
    emit('git.snapshot.ready', { repo: source.repo, ref, commit, rootPaths: source.rootPaths });
    return Object.freeze({ source, anchor, ref, commit, rootPaths: source.rootPaths, dir: runtime.dir });
  }

  async function resolveRef(spec = {}, _options = {}) {
    requireRuntime('resolveRef');
    if (typeof runtime.git.resolveRef !== 'function') throw new Error('resolveRef requires git.resolveRef.');
    const source = await resolveSource(spec);
    return runtime.git.resolveRef({ fs: runtime.fs, dir: runtime.dir, ref: source.ref || 'HEAD', cache: runtime.cache });
  }

  async function listFiles(snapshotOrSpec = {}, options = {}) {
    requireRuntime('listFiles');
    const snapshot = isSnapshot(snapshotOrSpec)
      ? snapshotOrSpec
      : await acquireSnapshot(snapshotOrSpec, { acquire: 'none', ...options });
    const roots = normalizeRootPaths(options.rootPaths || snapshot.rootPaths || snapshot.source?.rootPaths || ['.topics']);
    const ref = options.ref || snapshot.commit || snapshot.ref || snapshot.source?.ref || 'HEAD';

    let files;
    if (runtime.listFiles) {
      files = await runtime.listFiles({ snapshot, ref, rootPaths: roots, runtime });
    } else if (typeof runtime.git.listFiles === 'function') {
      files = await runtime.git.listFiles({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
    } else {
      throw new Error('listFiles requires runtime.listFiles or git.listFiles.');
    }

    return Array.from(new Set((files || [])
      .map(cleanPath)
      .filter(Boolean)
      .filter((path) => roots.some((root) => path === root || path.startsWith(`${root}/`)))))
      .sort((a, b) => a.localeCompare(b));
  }

  async function readFile(path, snapshotOrSpec = {}, options = {}) {
    requireRuntime('readFile');
    const clean = cleanPath(path);
    if (!clean) throw new Error('readFile requires a path.');
    const snapshot = isSnapshot(snapshotOrSpec)
      ? snapshotOrSpec
      : await acquireSnapshot(snapshotOrSpec, { acquire: 'none', ...options });
    const commit = options.commit || snapshot.commit || snapshot.anchor?.commit || snapshot.ref || 'HEAD';

    if (runtime.readText) {
      return runtime.readText({ path: clean, snapshot, commit, runtime });
    }
    return readBlobAt(clean, { ...snapshot, commit }, options);
  }

  async function readBlobAt(path, snapshotOrSpec = {}, options = {}) {
    requireRuntime('readBlobAt');
    if (typeof runtime.git.readBlob !== 'function') throw new Error('readBlobAt requires git.readBlob.');
    const clean = cleanPath(path);
    const snapshot = isSnapshot(snapshotOrSpec)
      ? snapshotOrSpec
      : await acquireSnapshot(snapshotOrSpec, { acquire: 'none', ...options });
    const commit = options.commit || snapshot.commit || snapshot.anchor?.commit || snapshot.ref || 'HEAD';
    const result = await runtime.git.readBlob({
      fs: runtime.fs,
      dir: runtime.dir,
      oid: commit,
      filepath: clean,
      cache: runtime.cache
    });
    return decodeBlobText(result?.blob);
  }

  async function listArtifactCandidates(snapshotOrSpec = {}, options = {}) {
    const files = await listFiles(snapshotOrSpec, options);
    const match = options.match || defaultArtifactPathMatch;
    return files.filter((path) => match(path));
  }

  async function resolveParentFromLocalObjects(parent = {}, snapshotOrSpec = {}, options = {}) {
    const href = parent.href || parent.origin || parent.permalink || parent.rawUrl || parent.browseUrl || '';
    const parsed = parseGitFilePermalink(href);
    if (!parsed?.path) return Object.freeze({ found: false, reason: 'not-a-git-file-permalink', permalink: href });
    const snapshot = isSnapshot(snapshotOrSpec)
      ? snapshotOrSpec
      : await acquireSnapshot({ ...snapshotOrSpec, repo: parsed.repo || snapshotOrSpec.repo, ref: parsed.ref || snapshotOrSpec.ref }, { acquire: 'none', ...options });
    const commit = parsed.commit || parsed.ref || snapshot.commit;
    try {
      const text = await readFile(parsed.path, { ...snapshot, commit }, { ...options, commit });
      return Object.freeze({ found: true, path: parsed.path, commit, text, source: 'local-git-object-store' });
    } catch (error) {
      return Object.freeze({ found: false, path: parsed.path, commit, reason: error.message || String(error), fallbackAllowed: true });
    }
  }

  function reportCapabilities() {
    return Object.freeze({
      ...GIT_NATIVE_ADAPTER_CAPABILITY,
      runtimeAvailable: Boolean(runtime.git && runtime.fs && runtime.dir),
      canClone: typeof runtime.git?.clone === 'function' && Boolean(runtime.http),
      canFetch: typeof runtime.git?.fetch === 'function' && Boolean(runtime.http),
      canResolveRef: typeof runtime.git?.resolveRef === 'function',
      canListFiles: Boolean(runtime.listFiles || typeof runtime.git?.listFiles === 'function'),
      canReadBlobAt: typeof runtime.git?.readBlob === 'function',
      usesHiddenProxy: false,
      corsProxyConfigured: Boolean(runtime.corsProxy)
    });
  }

  return Object.freeze({
    id: 'git-native-source-adapter',
    capability: GIT_NATIVE_ADAPTER_CAPABILITY,
    resolveSource,
    resolveRef,
    acquireSnapshot,
    listFiles,
    listArtifactCandidates,
    readFile,
    readBlobAt,
    resolveParentFromLocalObjects,
    reportCapabilities,
    reportLimits: () => Object.freeze({ hiddenNetwork: false, hiddenProxy: false, fallback: 'explicit-permalink-or-provider-only' })
  });
}

export function gitRemoteUrlFromSource(source = {}) {
  const remote = String(source.remote || source.url || '').trim();
  if (remote) return remote;
  const repo = String(source.repo || '').trim().replace(/^github:/i, '');
  if (/^[^\s/]+\/[\w.-]+$/u.test(repo)) return `https://github.com/${repo}.git`;
  return repo;
}

export function parseGitFilePermalink(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const blobIndex = parts.indexOf('blob');
      const commitIndex = parts.indexOf('commit');
      if (parts.length >= 5 && blobIndex === 2) {
        const repo = `${parts[0]}/${parts[1]}`;
        const ref = parts[3];
        const path = parts.slice(4).join('/');
        return Object.freeze({ provider: 'github', repo, ref, commit: isCommitRef(ref) ? ref : '', path, original: raw });
      }
      if (parts.length >= 4 && commitIndex === 2) {
        return Object.freeze({ provider: 'github', repo: `${parts[0]}/${parts[1]}`, ref: parts[3], commit: parts[3], path: '', original: raw });
      }
    }
    if (host === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const repo = `${parts[0]}/${parts[1]}`;
        const ref = parts[2];
        const path = parts.slice(3).join('/');
        return Object.freeze({ provider: 'github-raw', repo, ref, commit: isCommitRef(ref) ? ref : '', path, original: raw });
      }
    }
  } catch (_) {}
  return null;
}

export function defaultArtifactPathMatch(path = '') {
  const clean = cleanPath(path).toLowerCase();
  return /\.(trace|workspace|schema|validator)\.md$/u.test(clean)
    || /(^|\/)\.topics\//u.test(clean) && /\.md$/u.test(clean);
}

function normalizeRootPaths(value) {
  const list = Array.isArray(value) ? value : String(value || '.topics').split(/[\n,]+/u);
  const roots = list.map(cleanPath).filter(Boolean);
  return roots.length ? roots : ['.topics'];
}

function isSnapshot(value) {
  return Boolean(value && (value.anchor || value.commit || value.source));
}

function cleanDir(value) {
  const clean = String(value || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  return clean.startsWith('/') ? clean : `/${clean || 'tiinex-git-source'}`;
}

function cleanPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//u, '').replace(/^\//u, '').replace(/\/+/g, '/');
}

function decodeBlobText(blob) {
  if (typeof blob === 'string') return blob;
  if (blob instanceof Uint8Array) return new TextDecoder().decode(blob);
  if (Array.isArray(blob)) return new TextDecoder().decode(new Uint8Array(blob));
  if (blob && typeof blob.toString === 'function') return blob.toString('utf8');
  return String(blob || '');
}

function isCommitRef(value) {
  return /^[0-9a-f]{7,40}$/iu.test(String(value || '').trim());
}
