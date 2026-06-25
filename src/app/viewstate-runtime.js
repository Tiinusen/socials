(function (global) {
  'use strict';

  function routeDescriptorFor(node, pending = null) {
    if (node) {
      return {
        selectedNodeId: node.id || '',
        selectedPath: node.path || '',
        selectedTitle: node.title || '',
        mode: 'lineage'
      };
    }
    if (pending?.mode === 'lineage' || pending?.selectedPath || pending?.selectedTitle || pending?.selectedNodeId) {
      return {
        selectedNodeId: pending.selectedNodeId || '',
        selectedPath: pending.selectedPath || '',
        selectedTitle: pending.selectedTitle || '',
        mode: 'lineage'
      };
    }
    return { selectedNodeId: '', selectedPath: '', selectedTitle: '', mode: 'discovery' };
  }

  function decorateLensSource(source, descriptor, scroll = {}) {
    if (!source) return source;
    const selected = descriptor || { selectedNodeId: '', selectedPath: '', selectedTitle: '', mode: 'discovery' };
    Object.assign(source, selected, {
      scrollTop: Math.max(0, Math.round(scroll.top || 0)),
      scrollMode: scroll.mode || selected.mode || 'discovery',
      scrollSelectedPath: scroll.selectedPath || selected.selectedPath || ''
    });
    return source;
  }

  function discoveryScrollSignature(input = {}) {
    const nodeKeys = Array.isArray(input.nodeKeys) ? input.nodeKeys : [];
    const paths = nodeKeys
      .map((value) => String(value || ''))
      .filter(Boolean)
      .sort()
      .join('\n');
    const hash = typeof input.hash === 'function' ? input.hash(paths) : String(input.hash || '');
    return [
      input.discoveryView || 'feed',
      input.discoveryFilterSchema || input.filterSchema || 'all',
      input.discoverySearch || '',
      input.previewMaterialMode ? 'preview' : 'normal',
      input.previewMaterialKind || '',
      Number(input.nodeCount ?? nodeKeys.length) || 0,
      hash
    ].join('::');
  }

  function stripVolatileLensState(value) {
    if (!value || typeof value !== 'object') return value;
    delete value.scrollTop;
    delete value.feedScrollTop;
    delete value.scrollMode;
    delete value.scrollSelectedPath;
    delete value.discoveryScrollSignature;
    delete value.discoverySig;
    delete value.previewFilterOpen;
    delete value.mobileChromeCompact;
    delete value.timestamp;
    delete value.createdAt;
    Object.keys(value).forEach((key) => stripVolatileLensState(value[key]));
    return value;
  }

  function normalizedHistoryKind(input = {}) {
    const kind = input.kind === 'push' ? 'push' : input.kind || 'replace';
    if (kind !== 'push') return { kind, shouldRememberPending: false };
    const signature = String(input.signature || '');
    const now = Number(input.now || 0);
    const lastAt = Number(input.lastAt || 0);
    const windowMs = Number(input.windowMs || 1200) || 1200;
    const sameAsRecent = Boolean(signature && input.lastSignature === signature && (now - lastAt) < windowMs);
    const sameAsCurrent = Boolean(signature && input.currentHistorySignature === signature);
    if (sameAsRecent || sameAsCurrent) return { kind: 'replace', shouldRememberPending: false };
    return { kind: 'push', shouldRememberPending: Boolean(signature) };
  }

  function shouldApplyLens(input = {}) {
    if (input.userInteracted && !input.isBootingFromUrl && !input.routingRestoring) return false;
    if (input.durableLensApplied && !input.isBootingFromUrl && !input.routingRestoring) return false;
    return true;
  }

  function shouldRejectDiscoveryScroll(savedSignature, currentSignature) {
    return Boolean(savedSignature && currentSignature && savedSignature !== currentSignature);
  }


  function preferredStoredScrollModes(activeMode) {
    return activeMode === 'lineage'
      ? ['lineage', 'discovery']
      : ['discovery', 'lineage'];
  }

  function shouldPreserveStoredScrollOnZeroWrite(input = {}) {
    if (!input.preserveNonZero) return false;
    if (Number(input.nextTop || 0) !== 0) return false;
    return Number(input.existingTop || 0) > 0;
  }

  global.TiinexViewState = Object.freeze({
    decorateLensSource,
    discoveryScrollSignature,
    normalizedHistoryKind,
    preferredStoredScrollModes,
    routeDescriptorFor,
    shouldApplyLens,
    shouldPreserveStoredScrollOnZeroWrite,
    shouldRejectDiscoveryScroll,
    stripVolatileLensState,
  });
})(window);
