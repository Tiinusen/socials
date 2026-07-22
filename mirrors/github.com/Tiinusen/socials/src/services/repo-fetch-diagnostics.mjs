/**
 * Pure diagnostics helpers for repo-file adapter discovery.
 * The browser app wires these helpers to runtime storage. Keeping the summary
 * logic here gives tests and future Git-native adapters the same vocabulary.
 */

export function emptyRepoFetchDiagnostics() {
  return {
    sessions: 0,
    treeRequests: 0,
    rawRequests: 0,
    rawSuccess: 0,
    rawFailed: 0,
    rawRateLimited: 0,
    cacheHits: 0,
    totalBytes: 0,
    uniqueRawUrls: 0,
    duplicateFullRawUrlRequests: 0,
    basenameCollisions: 0,
    topDuplicateRawUrls: [],
    topBasenameCollisions: [],
    events: []
  };
}

export function summarizeRepoFetchEvents(events = []) {
  const summary = emptyRepoFetchDiagnostics();
  const list = Array.isArray(events) ? events : [];
  const rawUrlCounts = new Map();
  const basenamePaths = new Map();
  for (const event of list) {
    const kind = String(event?.event || '');
    if (kind === 'session.start') summary.sessions += 1;
    if (kind === 'tree.request') summary.treeRequests += 1;
    if (kind === 'raw.request') {
      summary.rawRequests += 1;
      const detail = event?.detail || event || {};
      const rawUrl = String(detail.rawUrl || detail.url || '');
      const path = String(detail.path || '');
      if (rawUrl) rawUrlCounts.set(rawUrl, (rawUrlCounts.get(rawUrl) || 0) + 1);
      const base = path.split('/').filter(Boolean).pop() || '';
      if (base) {
        const paths = basenamePaths.get(base) || new Set();
        paths.add(path || rawUrl);
        basenamePaths.set(base, paths);
      }
    }
    if (kind === 'raw.success') summary.rawSuccess += 1;
    if (kind === 'raw.failed') summary.rawFailed += 1;
    if (event?.rateLimited || Number(event?.status) === 429) summary.rawRateLimited += 1;
    if (event?.cacheState && /cache/i.test(String(event.cacheState))) summary.cacheHits += 1;
    summary.totalBytes += Math.max(0, Number(event?.bytes || event?.length || 0));
  }
  summary.uniqueRawUrls = rawUrlCounts.size;
  summary.duplicateFullRawUrlRequests = Array.from(rawUrlCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  summary.basenameCollisions = Array.from(basenamePaths.values()).filter((paths) => paths.size > 1).length;
  summary.topDuplicateRawUrls = Array.from(rawUrlCounts.entries()).filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([url, count]) => ({ url, count }));
  summary.topBasenameCollisions = Array.from(basenamePaths.entries()).filter(([, paths]) => paths.size > 1).sort((a, b) => b[1].size - a[1].size).slice(0, 8).map(([basename, paths]) => ({ basename, uniquePaths: paths.size, samplePaths: Array.from(paths).slice(0, 6) }));
  summary.events = list.slice(-80);
  return summary;
}

export function repoFetchDiscoveryVerdict(summary = {}) {
  const rawRequests = Number(summary.rawRequests || 0);
  const rateLimited = Number(summary.rawRateLimited || 0);
  if (rateLimited > 0) return 'rate-limited';
  if (rawRequests > 120) return 'request-heavy';
  if (rawRequests > 0) return 'raw-file-fallback-active';
  return 'not-observed';
}
