/**
 * Git source adapter research spine.
 *
 * This module is intentionally implementation-neutral. It defines the source
 * adapter boundary we want before swapping the current GitHub raw-file reader.
 * Browser integrations such as isomorphic-git, local archive ingestion, or
 * future provider-specific transports should implement this contract rather
 * than becoming app-level special cases.
 */

export const GIT_SOURCE_ADAPTER_CONTRACT = Object.freeze({
  id: 'tiinex.git-source-adapter.v1',
  purpose: 'Read Tiinex artifacts from Git source snapshots without making web permalinks the primary material path.',
  principles: Object.freeze([
    'local-object-store-first',
    'time-portal-aware',
    'source-snapshot-before-artifact-scan',
    'permalink-as-recovery-anchor-not-primary-read-path',
    'repo-files-separate-from-social-surfaces',
    'client-side-first-no-hidden-server'
  ]),
  requiredCapabilities: Object.freeze([
    'resolveSource',
    'resolveRef',
    'acquireSnapshot',
    'listFiles',
    'readFile',
    'readBlobAt',
    'getSourceStateAnchor',
    'resolveParentFromLocalObjects',
    'reportCapabilities',
    'reportLimits'
  ]),
  fallbackCapabilities: Object.freeze([
    'permalinkLookup',
    'throttledRawFileRead',
    'manualArchiveRead'
  ]),
  canonicalSurfaces: Object.freeze({
    repoFiles: 'Git tree/blob source material',
    issueSnapshots: 'provider social/source snapshots; not owned by Git repo file discovery'
  })
});

export const GIT_SOURCE_PHASES = Object.freeze([
  'resolve-source',
  'resolve-ref',
  'acquire-snapshot',
  'list-candidates',
  'read-local-objects',
  'scan-artifacts',
  'index-workspace',
  'render-commit'
]);

export function normalizeGitSourceSpec(spec = {}) {
  const remote = String(spec.remote || spec.url || spec.origin || '').trim();
  const repo = String(spec.repo || '').trim();
  const ref = String(spec.ref || spec.branch || spec.tag || 'HEAD').trim() || 'HEAD';
  const rootPaths = Array.isArray(spec.rootPaths)
    ? spec.rootPaths.map(cleanPath).filter(Boolean)
    : splitRootPaths(spec.rootPath || spec.roots || '.topics');
  return Object.freeze({
    kind: 'git-source',
    remote,
    repo,
    ref,
    rootPaths: Object.freeze(rootPaths.length ? rootPaths : ['.topics']),
    provider: String(spec.provider || inferProvider(remote || repo)).trim() || 'generic-git',
    requestedTime: String(spec.requestedTime || spec.asOf || '').trim(),
    sourceId: String(spec.sourceId || '').trim()
  });
}

export function gitSourceStateAnchor(fields = {}) {
  const repo = String(fields.repo || '').trim();
  const remote = String(fields.remote || fields.origin || '').trim();
  const ref = String(fields.ref || '').trim();
  const commit = String(fields.commit || fields.sha || '').trim();
  const tree = String(fields.tree || fields.treeSha || '').trim();
  const asOf = String(fields.asOf || fields.requestedTime || '').trim();
  const basis = [repo || remote, ref, commit || tree, asOf].filter(Boolean).join('@');
  return Object.freeze({
    kind: 'git-source-state-anchor',
    repo,
    remote,
    ref,
    commit,
    tree,
    asOf,
    stableKey: basis || 'unknown-git-source-state'
  });
}

export function classifyGitSourceReadPath(path = '') {
  const clean = cleanPath(path).toLowerCase();
  if (!clean) return 'unknown';
  if (clean.includes('/issues/') || clean.includes('/github-issues/')) return 'social-snapshot';
  if (/\.(trace|schema|workspace|validator)\.md$/i.test(clean)) return 'tiinex-artifact';
  if (/\.md$/i.test(clean)) return 'markdown';
  return 'other';
}

export function shouldUsePermalinkFallback(context = {}) {
  return !context.localObjectAvailable && Boolean(context.permalink || context.originUrl || context.remoteUrl);
}

export function makeGitSourceAdapterSkeleton(overrides = {}) {
  const notImplemented = async (name) => {
    throw new Error(`${name} is not implemented by this GitSourceAdapter prototype.`);
  };
  const adapter = {
    id: overrides.id || 'git-source-adapter-skeleton',
    contract: GIT_SOURCE_ADAPTER_CONTRACT,
    async resolveSource(spec) { return normalizeGitSourceSpec(spec); },
    async resolveRef() { return notImplemented('resolveRef'); },
    async acquireSnapshot() { return notImplemented('acquireSnapshot'); },
    async listFiles() { return notImplemented('listFiles'); },
    async readFile() { return notImplemented('readFile'); },
    async readBlobAt() { return notImplemented('readBlobAt'); },
    async getSourceStateAnchor(fields = {}) { return gitSourceStateAnchor(fields); },
    async resolveParentFromLocalObjects() { return notImplemented('resolveParentFromLocalObjects'); },
    reportCapabilities() { return GIT_SOURCE_ADAPTER_CONTRACT.requiredCapabilities.slice(); },
    reportLimits() { return Object.freeze({ implementation: 'skeleton', hiddenNetwork: false, permalinkFallback: 'explicit-only' }); }
  };
  return Object.freeze(Object.assign(adapter, overrides || {}));
}

function splitRootPaths(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(cleanPath)
    .filter(Boolean);
}

function cleanPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

function inferProvider(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('github.com') || /^[\w.-]+\/[\w.-]+$/.test(raw)) return 'github';
  if (raw.includes('gitlab.com')) return 'gitlab';
  if (raw.includes('codeberg.org')) return 'codeberg';
  return 'generic-git';
}
