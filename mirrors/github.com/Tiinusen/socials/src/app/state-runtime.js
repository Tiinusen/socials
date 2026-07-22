(function (global) {
  'use strict';

  const core = global.TiinexCore || {};
  const services = global.TiinexServicesStorage || {};
  const canonicalWorkspacePath = core.canonicalWorkspacePath || ((value) => String(value || ''));
  const fileNameFromPath = core.fileNameFromPath || ((value) => String(value || '').split('/').pop() || 'artifact.trace.md');
  const normalizeLineEndings = core.normalizeLineEndings || ((value) => String(value || '').replace(/\r\n?/g, '\n'));
  const textByteLength = services.textByteLength || ((value) => String(value || '').length);
  const persistentFileKinds = Object.freeze(['local', 'draft', 'upload', 'generated']);
  const persistentAssetKinds = Object.freeze(['local', 'draft', 'upload', 'zip', 'generated']);

  function localStateDataKey(prefix, id) {
    return `${prefix || ''}${id || ''}`;
  }

  function localStateSlug(value) {
    return String(value || 'local-workspace')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'local-workspace';
  }

  function makeLocalStateId(displayName) {
    const entropy = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return `${localStateSlug(displayName)}-${entropy}`;
  }

  function sourceSerializable(source) {
    return Object.assign({}, source || {});
  }

  function localStateFileIsPersistent(file) {
    if (!file) return false;
    const sourceId = String(file.sourceId || '').toLowerCase();
    const sourceKind = String(file.sourceKind || '').toLowerCase();
    if (persistentFileKinds.includes(sourceId) || persistentFileKinds.includes(sourceKind)) return true;
    // Generated remote/source artifacts are adapter cache, not local deltas.
    // Persisting them into localStorage can exhaust quota and drop drafts.
    if (file.isGenerated && !sourceId && !sourceKind && !file.rawUrl && !file.browseUrl && !file.repo && !file.sourceOrigin) return true;
    return false;
  }

  function localStateAssetIsPersistent(asset, savedFilePaths = new Set()) {
    if (!asset || typeof asset.content !== 'string') return false;
    if (savedFilePaths.has(canonicalWorkspacePath(asset.path || ''))) return false;
    const sourceId = String(asset.sourceId || '').toLowerCase();
    const source = String(asset.source || asset.sourceKind || '').toLowerCase();
    return persistentAssetKinds.includes(sourceId) || persistentAssetKinds.includes(source);
  }

  function localStateFiles(workspace) {
    return Array.from(workspace?.files?.values?.() || []).filter(localStateFileIsPersistent);
  }

  function localStateAssets(workspace, files = localStateFiles(workspace)) {
    const savedPaths = new Set(files.map((file) => canonicalWorkspacePath(file.path || '')));
    return Array.from(workspace?.assets?.values?.() || []).filter((asset) => localStateAssetIsPersistent(asset, savedPaths));
  }

  function workspaceHasLocalStateContent(workspace) {
    if (!workspace) return false;
    return Boolean(localStateFiles(workspace).length || localStateAssets(workspace).length);
  }

  function localStateSourcesForWorkspace(workspace, files = localStateFiles(workspace), assets = localStateAssets(workspace, files)) {
    const ids = new Set();
    files.forEach((file) => { if (file.sourceId) ids.add(file.sourceId); });
    assets.forEach((asset) => { if (asset.sourceId) ids.add(asset.sourceId); });
    return Array.from(workspace?.sources?.values?.() || [])
      .filter((source) => ids.has(source.id) || ['local', 'draft'].includes(source.kind) || ['local', 'draft'].includes(source.id))
      .map(sourceSerializable);
  }

  function serializeFileForLocalState(file) {
    return {
      path: canonicalWorkspacePath(file.path || ''),
      sourceId: file.sourceId || 'local',
      sourceKind: file.sourceKind || '',
      sourceLabel: file.sourceLabel || '',
      storageKey: file.storageKey || '',
      name: file.name || fileNameFromPath(file.path),
      content: normalizeLineEndings(file.content || file.text || ''),
      rawUrl: '',
      browseUrl: '',
      repo: '',
      ref: '',
      sourceOrigin: file.sourceOrigin || '',
      shadowSourceNodeId: file.shadowSourceNodeId || '',
      shadowSourceStorageKey: file.shadowSourceStorageKey || '',
      shadowSourceTitle: file.shadowSourceTitle || '',
      shadowSourceSchema: file.shadowSourceSchema || '',
      shadowSourceKey: file.shadowSourceKey || '',
      shadowSourceId: file.shadowSourceId || '',
      shadowSourcePath: file.shadowSourcePath || '',
      shadowSourceOrigin: file.shadowSourceOrigin || '',
      localDraftOf: file.localDraftOf || '',
      localEditDraft: Boolean(file.localEditDraft),
      isGenerated: Boolean(file.isGenerated),
      generatedAt: file.generatedAt || ''
    };
  }

  function serializeAssetForLocalState(asset) {
    if (!asset || typeof asset.content !== 'string') return null;
    return {
      key: asset.key || '',
      path: canonicalWorkspacePath(asset.path || asset.name || 'asset'),
      sourceId: asset.sourceId || 'local',
      sourceLabel: asset.sourceLabel || '',
      name: asset.name || fileNameFromPath(asset.path),
      content: asset.content,
      type: asset.type || asset.mime || 'application/octet-stream',
      size: asset.size || asset.content.length,
      source: asset.source || 'local',
      sourceOrigin: asset.sourceOrigin || '',
      shadowSourceNodeId: asset.shadowSourceNodeId || '',
      shadowSourceStorageKey: asset.shadowSourceStorageKey || '',
      shadowSourceTitle: asset.shadowSourceTitle || '',
      shadowSourceSchema: asset.shadowSourceSchema || '',
      shadowSourceKey: asset.shadowSourceKey || '',
      shadowSourceId: asset.shadowSourceId || '',
      shadowSourcePath: asset.shadowSourcePath || '',
      shadowSourceOrigin: asset.shadowSourceOrigin || '',
      localDraftOf: asset.localDraftOf || '',
      localEditDraft: Boolean(asset.localEditDraft),
      preserved: Boolean(asset.preserved),
      updatedAt: asset.updatedAt || ''
    };
  }

  global.TiinexStateLocal = Object.freeze({
    localStateAssetIsPersistent,
    localStateAssets,
    localStateDataKey,
    localStateFileIsPersistent,
    localStateFiles,
    localStateJsonSize: textByteLength,
    localStateSlug,
    localStateSourcesForWorkspace,
    makeLocalStateId,
    serializeAssetForLocalState,
    serializeFileForLocalState,
    sourceSerializable,
    workspaceHasLocalStateContent,
  });
})(window);
