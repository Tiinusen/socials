import { fileNameFromPath, canonicalWorkspacePath } from '../core/path.mjs';
import { normalizeLineEndings } from '../core/text.mjs';
import { textByteLength } from '../services/storage.mjs';

const PERSISTENT_FILE_KINDS = Object.freeze(['local', 'draft', 'upload', 'generated']);
const PERSISTENT_ASSET_KINDS = Object.freeze(['local', 'draft', 'upload', 'zip', 'generated']);

export function localStateDataKey(prefix, id) {
  return `${prefix || ''}${id || ''}`;
}

export function localStateSlug(value) {
  return String(value || 'local-workspace')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'local-workspace';
}

export function makeLocalStateId(displayName, entropy = defaultLocalStateEntropy()) {
  return `${localStateSlug(displayName)}-${entropy}`;
}

export function defaultLocalStateEntropy() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sourceSerializable(source) {
  return Object.assign({}, source || {});
}

export function localStateFileIsPersistent(file) {
  if (!file) return false;
  const sourceId = String(file.sourceId || '').toLowerCase();
  const sourceKind = String(file.sourceKind || '').toLowerCase();
  if (PERSISTENT_FILE_KINDS.includes(sourceId) || PERSISTENT_FILE_KINDS.includes(sourceKind)) return true;
  // Recovered/source-discovery files may be generated, but they are rebuilt
  // from their source adapters. Persisting every generated remote artifact can
  // fill localStorage and break local draft saves. Keep generated files only
  // when they have no remote/source identity and therefore behave like local
  // generated workspace material.
  if (file.isGenerated && !sourceId && !sourceKind && !file.rawUrl && !file.browseUrl && !file.repo && !file.sourceOrigin) return true;
  return false;
}

export function localStateAssetIsPersistent(asset, savedFilePaths = new Set()) {
  if (!asset || typeof asset.content !== 'string') return false;
  if (savedFilePaths.has(canonicalWorkspacePath(asset.path || ''))) return false;
  const sourceId = String(asset.sourceId || '').toLowerCase();
  const source = String(asset.source || asset.sourceKind || '').toLowerCase();
  return PERSISTENT_ASSET_KINDS.includes(sourceId) || PERSISTENT_ASSET_KINDS.includes(source);
}

export function localStateFiles(workspace) {
  return Array.from(workspace?.files?.values?.() || []).filter(localStateFileIsPersistent);
}

export function localStateAssets(workspace, files = localStateFiles(workspace)) {
  const savedPaths = new Set(files.map((file) => canonicalWorkspacePath(file.path || '')));
  return Array.from(workspace?.assets?.values?.() || []).filter((asset) => localStateAssetIsPersistent(asset, savedPaths));
}

export function workspaceHasLocalStateContent(workspace) {
  if (!workspace) return false;
  return Boolean(localStateFiles(workspace).length || localStateAssets(workspace).length);
}

export function localStateSourcesForWorkspace(workspace, files = localStateFiles(workspace), assets = localStateAssets(workspace, files)) {
  const ids = new Set();
  files.forEach((file) => { if (file.sourceId) ids.add(file.sourceId); });
  assets.forEach((asset) => { if (asset.sourceId) ids.add(asset.sourceId); });
  return Array.from(workspace?.sources?.values?.() || [])
    .filter((source) => ids.has(source.id) || ['local', 'draft'].includes(source.kind) || ['local', 'draft'].includes(source.id))
    .map(sourceSerializable);
}

export function serializeFileForLocalState(file) {
  return {
    path: canonicalWorkspacePath(file.path || ''),
    sourceId: file.sourceId || 'local',
    sourceKind: file.sourceKind || '',
    sourceLabel: file.sourceLabel || '',
    storageKey: file.storageKey || '',
    name: file.name || fileNameFromPath(file.path),
    content: normalizeLineEndings(file.text || file.rawMarkdown || file.content || ''),
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
    updatedAt: file.updatedAt || '',
    isGenerated: Boolean(file.isGenerated),
    generatedAt: file.generatedAt || ''
  };
}

export function serializeAssetForLocalState(asset) {
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

export function localStateJsonSize(json) {
  return textByteLength(json);
}
