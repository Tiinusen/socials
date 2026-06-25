(function () {
  'use strict';

  const TiinexCore = window.TiinexCore || {};
  const TiinexServicesStorage = window.TiinexServicesStorage || {};
  const TiinexUi = window.TiinexUi || {};
  const TiinexStateLocal = window.TiinexStateLocal || {};
  const {
    canonicalWorkspacePath,
    dirname,
    extractBodySections,
    fileNameFromPath,
    isFetchableHttpUrl,
    joinPath,
    normalizeAssetPath,
    normalizeLineEndings: normalizeNewlines,
    parseMarkdownLink,
    plainBlock,
    relativePath,
    schemaBadgeClass,
    schemaIdFromText,
    schemaKey,
    sectionMap,
    shortText,
    singleFieldFromBullet,
    slugify,
    sourceUrlDirectory,
    stripBodyTitle,
    stripMarkdownInline,
    stripTrailingBodySeparator,
  } = TiinexCore;
  const {
    readJson: storageReadJson,
    removeKeysWithPrefix: storageRemoveKeysWithPrefix,
    textByteLength: storageTextByteLength,
    writeJson: storageWriteJson,
  } = TiinexServicesStorage;
  const {
    localStateAssetIsPersistent: stateLocalStateAssetIsPersistent,
    localStateAssets: stateLocalStateAssets,
    localStateDataKey: stateLocalStateDataKey,
    localStateFileIsPersistent: stateLocalStateFileIsPersistent,
    localStateFiles: stateLocalStateFiles,
    localStateJsonSize: stateLocalStateJsonSize,
    localStateSlug: stateLocalStateSlug,
    localStateSourcesForWorkspace: stateLocalStateSourcesForWorkspace,
    makeLocalStateId: stateMakeLocalStateId,
    serializeAssetForLocalState: stateSerializeAssetForLocalState,
    serializeFileForLocalState: stateSerializeFileForLocalState,
    sourceSerializable: stateSourceSerializable,
    workspaceHasLocalStateContent: stateWorkspaceHasLocalStateContent,
  } = TiinexStateLocal;
  const {
    attachmentFileExtension,
    attachmentMetaChips,
    escapeAttr,
    escapeHtml,
    humanSize,
    renderPreviewSections,
    safeUrl,
    shortMime,
  } = TiinexUi;

  if (!normalizeNewlines || !canonicalWorkspacePath || !parseMarkdownLink || !schemaKey) {
    throw new Error('Tiinex core runtime did not load.');
  }
  if (!storageReadJson || !storageWriteJson || !storageTextByteLength || !stateLocalStateDataKey || !stateLocalStateFiles) {
    throw new Error('Tiinex services/state runtime did not load.');
  }
  if (!escapeHtml || !escapeAttr || !safeUrl || !attachmentMetaChips || !renderPreviewSections) {
    throw new Error('Tiinex UI runtime did not load.');
  }


  /*
   * Code map for human maintainers
   * --------------------------------
   * This package intentionally remains a static client-side app. The main
   * runtime flows below are grouped by semantics rather than by historical
   * patch layers:
   *
   * - Core utilities and source loading
   * - Markdown parsing and Tiinex artifact indexing
   * - Workspace state and persistence
   * - Rendering entrypoints and explicit wrapper registration seams
   * - User action dispatch
   * - Artifact creation, reference, export, and mobile surfaces
   *
   * Avoid adding app-level V####/v#### names or late override chains. Schema
   * IDs and checksum format versions are domain data and may remain versioned.
   */

  const app = {
    workspaces: [],
    activeWorkspaceId: null,
    sourceOpen: false,
    modal: null,
    toasts: [],
    isBootingFromUrl: false
  };

  const STORAGE_KEYS = Object.freeze({
    authors: 'tiinex.viewer.authors',
    localWorkspaceRegistry: 'tiinex.localWorkspace.registry',
    localWorkspaceStatePrefix: 'tiinex.localWorkspace.state.',
    localWorkspaceCurrent: 'tiinex.localWorkspace.current',
    browserScrollStatePrefix: 'tiinex.routeScroll.state.',
    anchorScrollPrefix: 'tiinex.scroll.anchor.',
    lensSessionPrefix: 'tiinex.lens.'
  });

  const $ = (id) => document.getElementById(id);
  const uid = (prefix) => prefix + '-' + Math.random().toString(36).slice(2, 10);
  const nowStamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  };

  function b64UrlEncode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64UrlDecode(text) {
    const s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const bytes = new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  }

  async function sha256Base64Url(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const arr = Array.from(new Uint8Array(digest));
    let bin = '';
    arr.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function convertSourceUrl(input) {
    const original = String(input || '').trim();
    if (!original) return null;
    let url;
    try { url = new URL(original); } catch (_) { return { rawUrl: original, browseUrl: original, path: fileNameFromPath(original) }; }
    const host = url.hostname.toLowerCase();
    if (host === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const blobIndex = parts.indexOf('blob');
      if (parts.length >= 5 && blobIndex === 2) {
        const owner = parts[0];
        const repo = parts[1];
        const ref = parts[3];
        const path = parts.slice(4).join('/');
        return {
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
          browseUrl: original,
          repo: `${owner}/${repo}`,
          ref,
          path
        };
      }
    }
    if (host === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const owner = parts[0];
        const repo = parts[1];
        const ref = parts[2];
        const path = parts.slice(3).join('/');
        return {
          rawUrl: original,
          browseUrl: `https://github.com/${owner}/${repo}/blob/${ref}/${path}`,
          repo: `${owner}/${repo}`,
          ref,
          path
        };
      }
    }
    return { rawUrl: original, browseUrl: original, path: fileNameFromPath(url.pathname) || 'remote.trace.md' };
  }

  function repoPolicyRawUrl(repo, ref, fileName) {
    if (!repo || !ref) return '';
    return `https://raw.githubusercontent.com/${repo}/${ref}/${fileName}`;
  }


  function sourceNeedsPolicyDecision(ws) {
    return Boolean(ws && ws.repo && ws.ref && ws.policy && ws.policy.status === 'missing');
  }

  function extractEnvelopeFields(envelopeText) {
    const out = { root: {}, parent: {}, parentOrigin: {}, current: {}, repairs: [] };
    if (!envelopeText) return out;
    let block = 'root';
    let inOrigin = false;
    for (const rawLine of normalizeNewlines(envelopeText).split('\n')) {
      const line = rawLine.replace(/\t/g, '  ');
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ')) continue;
      const indent = line.search(/\S/);
      const content = trimmed.slice(2).trim();
      if (indent <= 1 && /^Parent\s*$/i.test(content)) { block = 'parent'; inOrigin = false; continue; }
      if (indent <= 1 && /^Current\s*$/i.test(content)) { block = 'current'; inOrigin = false; continue; }
      if (indent <= 1 && /^Repairs\s*$/i.test(content)) { block = 'repairs'; inOrigin = false; continue; }
      if (block === 'parent' && /^Origin\s*:??\s*$/i.test(content)) { inOrigin = true; continue; }
      const pair = content.match(/^([^:]+):\s*(.*)$/);
      if (!pair) {
        if (block === 'repairs') out.repairs.push(content);
        continue;
      }
      const key = pair[1].trim();
      const value = pair[2].trim();
      if (block === 'parent' && inOrigin) out.parentOrigin[key] = value;
      else if (block === 'parent') out.parent[key] = value;
      else if (block === 'current') out.current[key] = value;
      else out.root[key] = value;
    }
    return out;
  }

  function parseIntegrity(text) {
    const idx = normalizeNewlines(text).search(/^# Continuity Integrity\s*$/m);
    if (idx < 0) return null;
    const tail = normalizeNewlines(text).slice(idx);
    const method = (tail.match(/^-\s+([^\n]+)$/m) || [null, ''])[1].trim();
    const towards = (tail.match(/^\s+-\s+Towards:\s+(.+)$/m) || [null, ''])[1].trim();
    const value = (tail.match(/^\s+-\s+Value:\s+(.+)$/m) || [null, ''])[1].trim();
    return { method, towards, value };
  }

  function inferSummary(body) {
    const lines = normalizeNewlines(body).split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('- ')) continue;
      return shortText(stripMarkdownInline(t), 220);
    }
    return '';
  }

  function compareNodesDesc(a, b) {
    return sortableDate(b.createdAt) - sortableDate(a.createdAt) || a.path.localeCompare(b.path);
  }

  function sortableDate(value) {
    const s = String(value || '').trim();
    if (!s) return 0;
    const iso = s.replace(' ', 'T') + 'Z';
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }


  // --- Source loading ---

  async function loadUrlsIntoWorkspace(ws, urls) {
    ws.loading = true;
    render();
    let count = 0;
    for (const raw of urls) {
      const item = convertSourceUrl(raw);
      if (!item) continue;
      try {
        if (/\.json($|[?#])/i.test(item.rawUrl)) {
          const text = await fetchText(item.rawUrl);
          const manifest = JSON.parse(text);
          const nested = manifest.traceUrls || manifest.urls || manifest.files || [];
          const nestedUrls = nested.map((entry) => typeof entry === 'string' ? entry : entry.url).filter(Boolean);
          if (nestedUrls.length) {
            ws.logs.push(`Manifest loaded ${nestedUrls.length} trace URLs from ${item.rawUrl}`);
            await loadUrlsIntoWorkspace(ws, nestedUrls);
          }
          continue;
        }
        const content = await fetchText(item.rawUrl);
        addFileToWorkspace(ws, { ...item, content });
        count += 1;
      } catch (error) {
        ws.logs.push(`Could not fetch ${item.rawUrl}: ${error.message}`);
      }
    }
    computeWorkspaceIndex(ws);
    await discoverWorkspacePolicy(ws);
    ws.loading = false;
    if (!count) toast(`No trace files loaded for ${ws.label}.`, 'warn');
    render();
  }

  function getWorkspace(id) {
    return app.workspaces.find((ws) => ws.id === id) || null;
  }

  function selectedNode(ws) {
    return ws?.nodeById.get(ws.selectedNodeId) || null;
  }

  function shortSchema(schema) {
    return String(schema || '').replace(/^tiinex\./, '').replace(/\.v\d+$/, '').replace(/\.schema\.md$/, '') || 'unknown';
  }

  function renderSafeMarkdown(markdown) {
    const lines = normalizeNewlines(markdown).split('\n');
    let html = '';
    let inList = false;
    let inFence = false;
    let fence = [];
    const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
    for (const raw of lines) {
      const line = raw.replace(/\t/g, '    ');
      const trimmed = line.trim();
      if (/^```/.test(trimmed)) {
        if (inFence) {
          html += `<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`;
          fence = [];
          inFence = false;
        } else {
          closeList();
          inFence = true;
        }
        continue;
      }
      if (inFence) { fence.push(raw); continue; }
      if (!trimmed) { closeList(); continue; }
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html += `<h${level}>${renderInline(heading[2])}</h${level}>`;
        continue;
      }
      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${renderInline(bullet[1])}</li>`;
        continue;
      }
      const quote = trimmed.match(/^>\s*(.+)$/);
      if (quote) {
        closeList();
        html += `<blockquote>${renderInline(quote[1])}</blockquote>`;
        continue;
      }
      closeList();
      html += `<p>${renderInline(trimmed)}</p>`;
    }
    closeList();
    if (inFence) html += `<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`;
    return html || '<p>No readable markdown body.</p>';
  }

  function renderInline(text) {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const safe = safeUrl(href);
        const text = escapeHtml(label);
        if (!safe) return text;
        return `<a href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      });
  }


  // Intent helpers for create/continue/reference flow resolution.
  function workspaceById(wsId) {
    let ws = null;
    try { if (wsId && typeof getWorkspace === 'function') ws = getWorkspace(wsId); } catch (_) {}
    try { if (!ws && Array.isArray(app?.workspaces)) ws = app.workspaces.find((item) => item?.id === wsId) || null; } catch (_) {}
    return ws;
  }

  function nodeByContext(ws, nodeId, nodePath = '') {
    if (!ws) return null;
    let node = null;
    try { if (nodeId) node = ws.nodeById?.get?.(nodeId) || null; } catch (_) {}
    try { if (!node && Array.isArray(ws.nodes)) node = ws.nodes.find((candidate) => candidate && ((nodeId && candidate.id === nodeId) || (nodePath && candidate.path === nodePath))) || null; } catch (_) {}
    try { if (!node && ws.nodeById?.values) node = Array.from(ws.nodeById.values()).find((candidate) => candidate && ((nodeId && candidate.id === nodeId) || (nodePath && candidate.path === nodePath))) || null; } catch (_) {}
    return node;
  }


  // --- Artifact creation defaults ---

  function createMode(input = {}, fallback = '') {
    if (input.mode === 'reference' || fallback === 'reference') return 'reference';
    if (input.mode === 'continue' || fallback === 'continue') return 'continue';
    const label = String(input.label || input.title || '').toLowerCase();
    if (label.includes('reference')) return 'reference';
    if (label.includes('continue')) return 'continue';
    return '';
  }

  function schemaIdFromCreate(value, fallback) {
    const raw = String(value || '').trim();
    if (!raw) return fallback || 'tiinex.topic.v1';
    const map = {
      topic: 'tiinex.topic.v1',
      task: 'tiinex.task.v1',
      decision: 'tiinex.decision.v1',
      evidence: 'tiinex.evidence.v1',
      feedback: 'tiinex.feedback.v1',
      pointer: 'tiinex.pointer.v1',
      signal: 'tiinex.signal.v1',
      raw: 'raw'
    };
    return map[raw] || raw;
  }

  function resolveCreateTarget(input = {}) {
    const wsId = input.wsId || input.ws || input.sourceWsId || input.destWsId || '';
    const nodeId = input.nodeId || input.node || input.sourceNodeId || input.parentNodeId || input.referencedNodeId || '';
    const nodePath = input.nodePath || input.path || '';
    let ws = workspaceById(wsId);
    let node = nodeByContext(ws, nodeId, nodePath);
    try {
      if ((!ws || !node) && Array.isArray(app?.workspaces)) {
        for (const candidateWs of app.workspaces) {
          const candidateNode = nodeByContext(candidateWs, nodeId, nodePath);
          if (candidateNode) { ws = candidateWs; node = candidateNode; break; }
        }
      }
    } catch (_) {}
    return { ws, node };
  }

  function selectedNodeSafe(ws) {
    try { return typeof selectedNode === 'function' ? selectedNode(ws) : null; } catch (_) { return null; }
  }

  function openArtifactCreateIntent(input = {}) {
    const mode = createMode(input);
    if (mode !== 'continue' && mode !== 'reference') return false;

    const providedWs = input.ws || null;
    const providedNode = input.node || null;
    const resolved = providedWs && providedNode ? { ws: providedWs, node: providedNode } : resolveCreateTarget(input);
    const ws = providedWs || resolved.ws;
    const node = providedNode || resolved.node;
    if (!ws || !node) {
      toast(mode === 'reference' ? 'No node selected to reference.' : 'No node selected to continue.', 'warn');
      return false;
    }

    if (mode === 'reference') {
      enterReferenceParentPicker(ws, node);
      return true;
    }

    const schemaId = schemaIdFromCreate(
      input.schemaId || input.schema || node.currentSchemaText || node.currentSchema,
      node.currentSchemaText || node.currentSchema || 'tiinex.topic.v1'
    );
    openArtifactWizard(ws, {
      mode: 'continue',
      parentNodeId: node.id,
      schemaId,
      wizardStep: input.wizardStep || 'type',
      title: input.title || `${node.title || 'Selected artifact'} continuation`,
      summary: input.summary || ''
    });
    return true;
  }




  function onModalField(event) {
    if (!app.modal) return;
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    app.modal[field] = event.currentTarget.type === 'checkbox'
      ? event.currentTarget.checked
      : event.currentTarget.value;
  }

  function downloadText(filename, text, type) {
    downloadBlob(filename, new Blob([text], { type }));
  }

  function downloadBlob(filename, blob) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function toast(text, type) {
    const item = { id: uid('toast'), text, type: type || '' };
    app.toasts.push(item);
    render();
    setTimeout(() => {
      app.toasts = app.toasts.filter((t) => t.id !== item.id);
      render();
    }, 4200);
  }

  function reportRuntimeError(context, error) {
    const detail = error && error.message ? error.message : String(error || 'Unknown error');
    try { console.error(`[Tiinex] ${context}: ${detail}`, error); } catch (_) {}
  }



  function relationLabel(node, index, lineageMode) {
    if (node.isGenerated) return 'draft';
    if (lineageMode && index === 0) return 'selected leaf';
    if (lineageMode) return node.parentNode ? 'parent context' : 'root context';
    if (!node.parentHref) return 'root';
    if (node.children?.length) return `${node.children.length} child${node.children.length === 1 ? '' : 'ren'}`;
    return 'leaf candidate';
  }

  function toggleNodeExpand(wsId, nodeId) {
    const ws = getWorkspace(wsId);
    const node = ws?.nodeById.get(nodeId);
    if (!node) return;
    node.expanded = !node.expanded;
    app.activeWorkspaceId = ws.id;
    render();
  }

  function workspaceIndex(wsId) {
    return Math.max(0, app.workspaces.findIndex((ws) => ws.id === wsId));
  }

  function ensureWorkspaceWindow() {
    app.workspaceOffset = Number.isFinite(app.workspaceOffset) ? app.workspaceOffset : 0;
    const count = visibleWorkspaceCount();
    const maxOffset = Math.max(0, app.workspaces.length - count);
    app.workspaceOffset = Math.max(0, Math.min(app.workspaceOffset, maxOffset));
    const activeIndex = workspaceIndex(app.activeWorkspaceId);
    if (activeIndex >= 0) {
      if (activeIndex < app.workspaceOffset) app.workspaceOffset = activeIndex;
      if (activeIndex >= app.workspaceOffset + count) app.workspaceOffset = Math.max(0, activeIndex - count + 1);
    }
  }

  function focusWorkspaceWindow(wsId) {
    const index = workspaceIndex(wsId);
    if (index < 0) return;
    const count = visibleWorkspaceCount();
    if (index < app.workspaceOffset || index >= app.workspaceOffset + count) {
      app.workspaceOffset = Math.max(0, Math.min(index, Math.max(0, app.workspaces.length - count)));
    }
  }

  function visibleWorkspaces() {
    ensureWorkspaceWindow();
    return app.workspaces.slice(app.workspaceOffset, app.workspaceOffset + visibleWorkspaceCount());
  }

  function workspaceDisplayLabel(ws) {
    const files = Array.from(ws.files?.values?.() || []);
    const repos = [...new Set(files.map((f) => f.repo).filter(Boolean))];
    if (repos.length === 1) return repos[0];
    if (repos.length > 1) return `mixed/workspace-${workspaceIndex(ws.id) + 1}`;
    const label = String(ws.label || '').trim();
    if (label && !/^local lineage workspace$/i.test(label)) return label;
    return `local/workspace-${workspaceIndex(ws.id) + 1}`;
  }

  function isCommitRef(ref) {
    return /^[0-9a-f]{40}$/i.test(String(ref || ''));
  }

  function workspaceRefBadge(ws) {
    const files = Array.from(ws.files?.values?.() || []);
    const repos = [...new Set(files.map((f) => f.repo).filter(Boolean))];
    const refs = [...new Set(files.map((f) => f.ref).filter(Boolean))];
    if (repos.length !== 1 || refs.length !== 1) return '';
    const ref = refs[0];
    if (!ref || ref === 'master' || ref === 'main') return '';
    const repo = repos[0];
    const href = isCommitRef(ref) ? `https://github.com/${repo}/commit/${ref}` : `https://github.com/${repo}/tree/${encodeURIComponent(ref)}`;
    const label = isCommitRef(ref) ? 'commit' : ref;
    const title = isCommitRef(ref) ? `commit: ${ref}` : `ref: ${ref}`;
    return `<a class="ref-sup" href="${escapeAttr(href)}" target="_blank" rel="noopener" title="${escapeAttr(title)}">${escapeHtml(shortText(label, 18))}</a>`;
  }


  async function loadDemo() {
    if (app.workspaces.some((ws) => ws.label.startsWith('Tiinex/docs') || ws.repo === 'Tiinex/docs')) {
      toast('Demo workspaces are already loaded.', 'warn');
      return;
    }
    for (const source of DEMO_SOURCES) {
      const ws = createWorkspace(source.label, 'Built-in demo source list. Fetches raw trace links directly, not GitHub API.');
      await loadUrlsIntoWorkspace(ws, source.urls);
    }
    app.activeWorkspaceId = app.workspaces[0]?.id || null;
    app.workspaceOffset = 0;
    updateUrlState();
    render();
  }

  function selectNode(wsId, nodeId) {
    const ws = getWorkspace(wsId);
    if (!ws || !ws.nodeById.get(nodeId)) return;
    app.activeWorkspaceId = ws.id;
    ws.selectedNodeId = nodeId;
    focusWorkspaceWindow(ws.id);
    updateUrlState();
    render();
  }

  function cleanupWorkspaceRuntimeState(ws) {
    if (!ws) return;
    if (ws.assetUrls && typeof ws.assetUrls.forEach === 'function') {
      ws.assetUrls.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      });
      ws.assetUrls.clear();
    }
    if (app.pendingImport?.wsId === ws.id) app.pendingImport = null;
    if (app.modal?.wsId === ws.id) app.modal = null;
  }

  function removeWorkspace(wsId) {
    const ws = getWorkspace(wsId);
    if (!ws) return;

    const assets = Array.from(ws.assets?.values?.() || []);
    const localAssetCount = assets.filter((asset) => asset.sourceId === 'local' || asset.source === 'upload' || asset.source === 'zip' || asset.source === 'local').length;
    const generatedCount = ws.generated?.length || 0;
    const sources = typeof sourceCount === 'function'
      ? sourceCount(ws)
      : (ws.sources && typeof ws.sources.size === 'number' ? ws.sources.size : 0);
    const details = [
      `${ws.nodes?.length || 0} trace(s)`,
      `${sources || 0} source(s)`,
      localAssetCount ? `${localAssetCount} local/preserved asset(s)` : '',
      generatedCount ? `${generatedCount} draft/generated trace(s)` : ''
    ].filter(Boolean).join(', ');

    const hasVolatile = Boolean(localAssetCount || generatedCount || assets.length);
    const message =
      `Close workspace "${workspaceDisplayLabel(ws)}"?

` +
      `${details || 'This workspace will be removed from the current view.'}

` +
      (hasVolatile
        ? `This will discard this workspace's live browser memory for local uploads, preserved assets, and unsaved/generated content unless you export/save first. Copy link will not preserve them.`
        : `This removes the workspace from the current view. Remote sources may be loaded again from their source links.`);

    if (!window.confirm(message)) return;

    cleanupWorkspaceRuntimeState(ws);
    app.workspaces = app.workspaces.filter((item) => item.id !== wsId);
    if (app.activeWorkspaceId === wsId) app.activeWorkspaceId = app.workspaces[0]?.id || null;
    if (typeof ensureWorkspaceWindow === 'function') ensureWorkspaceWindow();
    if (typeof updateUrlState === 'function') updateUrlState({ replace: true });
    render();
  }

  window.addEventListener('resize', () => {
    ensureWorkspaceWindow();
    render();
  }, { passive: true });





  app.settings = Object.assign({
    lineagePrefetchDepth: 3,
    maxConcurrentParentFetchesPerWorkspace: 1
  }, app.settings || {});

  function ensureLineageWindow(ws, selectedId) {
    ws.lineageWindows = ws.lineageWindows || {};
    if (!ws.lineageWindows[selectedId]) {
      ws.lineageWindows[selectedId] = {
        visibleCount: computeInitialLineageVisibleCount()
      };
    }
    return ws.lineageWindows[selectedId];
  }

  function originValueUrl(value) {
    const parsed = parseMarkdownLink(value || '');
    const raw = parsed.href || parsed.text || '';
    return isFetchableHttpUrl(raw) ? raw : '';
  }







  app.searchDebounceTimers = app.searchDebounceTimers || {};

  function normalizeSearchText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function nodeSearchCorpus(node) {
    return normalizeSearchText([
      node.title,
      node.summary,
      node.why,
      node.path,
      node.currentSchemaText || node.currentSchema,
      node.body
    ].filter(Boolean).join(' '));
  }

  function nodeMatchesSearch(node, query) {
    const q = normalizeSearchText(query);
    if (!q) return true;
    return nodeSearchCorpus(node).includes(q);
  }

  function renderSearchInput(ws, mode) {
    const value = mode === 'lineage' ? (ws.lineageSearch || '') : (ws.discoverySearch || '');
    const placeholder = mode === 'lineage' ? 'Search lineage…' : 'Search discovery…';
    return `<label class="search-box ${value ? 'active' : ''}">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}" data-search="${escapeAttr(mode)}" data-ws="${escapeAttr(ws.id)}" autocomplete="off" spellcheck="false">
      ${value ? `<button class="search-clear" data-action="clear-search" data-mode="${escapeAttr(mode)}" data-ws="${escapeAttr(ws.id)}" title="Clear search"><i class="fa-solid fa-xmark"></i></button>` : ''}
    </label>`;
  }



  function renderLineageSearchLegend(ws, traversal, nodes, query) {
    if (!normalizeSearchText(query)) return '';
    const matches = nodes.filter((node) => nodeMatchesSearch(node, query)).length;
    return `<div class="lineage-search-legend">
      <i class="fa-solid fa-filter"></i>
      <span>${matches} match${matches === 1 ? '' : 'es'} across ${nodes.length} loaded lineage node${nodes.length === 1 ? '' : 's'}.</span>
      <span class="muted-mini">Non-matching nodes collapse to continuity marks.</span>
    </div>`;
  }

  function renderLineageSkimLine(node, index) {
    return `<div class="lineage-skim-line" title="${escapeAttr(node.title)}">
      <span class="skim-index">${index + 1}</span>
      <span class="skim-rule"></span>
    </div>`;
  }






  function captureFeedScroll(el, reason = 'render') {
    if (!el) return;
    app.pendingFeedScrollRestore = {
      wsId: el.dataset.ws || '',
      selectedId: el.dataset.selected || '',
      scrollTop: el.scrollTop || 0,
      reason
    };
    scrollFlightRecord('feedSnapshot:capture', {
      reason,
      pending: Object.assign({}, app.pendingFeedScrollRestore),
      target: scrollRestoreDebugTargetState(el),
      workspace: scrollRestoreDebugWorkspaceState(getWorkspace(el.dataset.ws || ''))
    });
  }

  function restorePendingFeedScroll() {
    const pending = app.pendingFeedScrollRestore;
    if (!pending) return;
    app.pendingFeedScrollRestore = null;
    scrollFlightRecord('feedSnapshot:restore-pending-schedule', { pending: Object.assign({}, pending) });
    requestAnimationFrame(() => {
      const selector = `.post-feed.lineage[data-ws="${CSS.escape(pending.wsId)}"][data-selected="${CSS.escape(pending.selectedId)}"]`;
      const feed = document.querySelector(selector);
      const before = scrollRestoreDebugTargetState(feed);
      if (feed) feed.scrollTop = pending.scrollTop;
      scrollFlightRecord('feedSnapshot:restore-pending-apply', {
        pending: Object.assign({}, pending),
        selector,
        before,
        after: scrollRestoreDebugTargetState(feed)
      });
    });
  }







  app.settings = Object.assign({
    lineagePrefetchDepth: 8,
    lineageFetchAheadThresholdPx: 900,
    lineageFetchAheadThresholdViewportRatio: 1.35,
    lineageSearchHydrateFull: true
  }, app.settings || {});

  function feedSelectorForSnapshot(item) {
    const selected = item.selectedId || '';
    return `.post-feed.${CSS.escape(item.mode)}[data-ws="${CSS.escape(item.wsId)}"][data-selected="${CSS.escape(selected)}"]`;
  }

  function firstVisibleLineageAnchor(feed) {
    if (!feed) return null;
    const feedRect = feed.getBoundingClientRect();
    const posts = Array.from(feed.querySelectorAll('.lineage-post[data-node]'));
    let best = null;
    for (const post of posts) {
      const rect = post.getBoundingClientRect();
      if (rect.bottom >= feedRect.top + 8) {
        best = post;
        break;
      }
    }
    if (!best) best = posts[0] || null;
    if (!best) return null;
    const rect = best.getBoundingClientRect();
    return {
      nodeId: best.dataset.node || '',
      offsetTop: rect.top - feedRect.top
    };
  }

  function snapshotVisibleFeedScrolls() {
    const feeds = Array.from(document.querySelectorAll('.post-feed[data-ws]')).map((feed) => {
      const mode = feed.classList.contains('lineage') ? 'lineage' : 'discovery';
      return {
        type: 'feed',
        wsId: feed.dataset.ws || '',
        selectedId: feed.dataset.selected || '',
        mode,
        scrollTop: feed.scrollTop || 0,
        scrollHeight: feed.scrollHeight || 0,
        clientHeight: feed.clientHeight || 0,
        anchor: mode === 'lineage' ? firstVisibleLineageAnchor(feed) : null
      };
    }).filter((item) => item.wsId);

    const workspaces = Array.from(document.querySelectorAll('.workspace[data-ws]')).map((wsEl) => ({
      type: 'workspace',
      wsId: wsEl.dataset.ws || '',
      scrollTop: wsEl.scrollTop || 0
    })).filter((item) => item.wsId);

    return feeds.concat(workspaces);
  }

  function restoreOneFeedSnapshot(item) {
    const feed = document.querySelector(feedSelectorForSnapshot(item));
    if (!feed) {
      scrollFlightRecord('feedSnapshot:restore-one-miss', { item });
      return;
    }
    const before = scrollRestoreDebugTargetState(feed);
    feed.scrollTop = item.scrollTop || 0;
    let anchorApplied = false;
    if (item.mode === 'lineage' && item.anchor?.nodeId) {
      const anchor = feed.querySelector(`.lineage-post[data-node="${CSS.escape(item.anchor.nodeId)}"]`);
      if (anchor) {
        const feedRect = feed.getBoundingClientRect();
        const anchorRect = anchor.getBoundingClientRect();
        const newOffset = anchorRect.top - feedRect.top;
        const delta = newOffset - item.anchor.offsetTop;
        if (Math.abs(delta) > 1) {
          feed.scrollTop += delta;
          anchorApplied = true;
        }
      }
    }
    scrollFlightRecord('feedSnapshot:restore-one-apply', {
      item,
      before,
      after: scrollRestoreDebugTargetState(feed),
      anchorApplied
    });
  }

  function restoreVisibleFeedScrolls(snapshots) {
    if (!snapshots || !snapshots.length) {
      restorePendingFeedScroll();
      return;
    }
    requestAnimationFrame(() => {
      snapshots.forEach((item) => {
        if (item.type === 'feed') restoreOneFeedSnapshot(item);
        if (item.type === 'workspace') {
          const wsEl = document.querySelector(`.workspace[data-ws="${CSS.escape(item.wsId)}"]`);
          if (wsEl) wsEl.scrollTop = item.scrollTop || 0;
        }
      });
      requestAnimationFrame(() => {
        snapshots.forEach((item) => {
          if (item.type === 'feed') restoreOneFeedSnapshot(item);
        });
        restorePendingFeedScroll();
      });
    });
  }







  app.settings = Object.assign({
    lineagePrefetchDepth: 16,
    lineageFetchAheadThresholdPx: 1800,
    lineageFetchAheadThresholdViewportRatio: 2.35,
    lineageScrollIdleRenderDelayMs: 150
  }, app.settings || {});

  app.renderTimers = app.renderTimers || {};
  app.lineageLazyRenderTimers = app.lineageLazyRenderTimers || {};

  function requestBufferedRender(reason = 'async', delay = 90) {
    clearTimeout(app.renderTimers.main);
    app.renderTimers.main = setTimeout(() => {
      app.renderTimers.main = null;
      render();
    }, delay);
  }

  function computeInitialLineageVisibleCount() {
    const h = window.innerHeight || document.documentElement.clientHeight || 900;
    const approximatePostHeight = h < 760 ? 110 : 132;
    const chromeReserve = h < 760 ? 160 : 190;
    const visible = Math.max(4, Math.ceil(Math.max(360, h - chromeReserve) / approximatePostHeight));
    return visible + Math.max(10, Number(app.settings.lineagePrefetchDepth || 16));
  }

  function lineageGrowthCount(container) {
    const h = container?.clientHeight || window.innerHeight || 900;
    const approximatePostHeight = h < 760 ? 110 : 132;
    return Math.max(8, Math.ceil(Math.max(420, h) / approximatePostHeight), Number(app.settings.lineagePrefetchDepth || 16));
  }
  async function fetchParentCandidate(wsId, candidate) {
    const ws = getWorkspace(wsId);
    if (!ws || !candidate) return false;
    ws.parentFetches = ws.parentFetches || {};
    try {
      const content = await fetchText(candidate.rawUrl);
      addFileToWorkspace(ws, {
        path: candidate.path,
        content,
        rawUrl: candidate.rawUrl,
        browseUrl: candidate.browseUrl,
        repo: candidate.repo,
        ref: candidate.ref
      });
      ws.parentFetches[candidate.key] = {
        status: 'loaded',
        candidate,
        finishedAt: new Date().toISOString()
      };
      computeWorkspaceIndex(ws);
      requestBufferedRender('parent-loaded', 120);
      return true;
    } catch (error) {
      ws.parentFetches[candidate.key] = {
        status: 'failed',
        candidate,
        error: error.message,
        finishedAt: new Date().toISOString()
      };
      requestBufferedRender('parent-failed', 120);
      return false;
    }
  }




  // Discovery is a browsing surface: clicking card text sets the viewer target.
  // Lineage is a reading surface: clicking card text expands/collapses that post.





  // Discovery first action slot: More/Less.
  // Lineage first action slot: Anchor.
  // Remaining actions keep stable placement across both modes.









  function renderCollapsedWorkspace(ws, active) {
    const displayLabel = workspaceDisplayLabel(ws);
    const shortLabel = displayLabel.split('/').pop() || displayLabel;
    return `
      <section class="workspace workspace-shell collapsed-workspace ${active ? 'active' : ''}" data-ws="${escapeAttr(ws.id)}" title="${escapeAttr(displayLabel)}">
        <div class="collapsed-workspace-inner">
          <button class="collapsed-workspace-button" data-action="toggle-workspace-mode" data-mode="expanded" data-ws="${escapeAttr(ws.id)}" title="Expand ${escapeAttr(displayLabel)}" aria-label="Expand ${escapeAttr(displayLabel)}">
            <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
          </button>
          <div class="collapsed-workspace-title">
            <span>${escapeHtml(shortLabel)}</span>
          </div>
          <div class="collapsed-workspace-stats" aria-label="${escapeAttr(ws.nodes.length + ' traces, ' + ws.leaves.length + ' leaves')}">
            <span title="Trace files"><i class="fa-regular fa-file-lines"></i>${ws.nodes.length}</span>
            <span title="Leaf candidates"><i class="fa-solid fa-seedling"></i>${ws.leaves.length}</span>
          </div>
          ${ws.policy?.status === 'missing' ? '<div class="collapsed-warning" title="No policy/license found"><i class="fa-solid fa-triangle-exclamation"></i></div>' : ''}
          <button class="collapsed-workspace-button subtle" data-action="remove-workspace" data-ws="${escapeAttr(ws.id)}" title="Remove workspace" aria-label="Remove workspace">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </section>`;
  }





  function visibleWorkspaceCount() {
    const w = window.innerWidth || document.documentElement.clientWidth || 1920;
    if (w < 640) return 1;
    if (w >= 1500) return 3;
    if (w >= 980) return 2;
    return 1;
  }


  function renderWorkspacePager(count) {
    const from = Math.min(app.workspaceOffset + 1, app.workspaces.length);
    const to = Math.min(app.workspaceOffset + count, app.workspaces.length);
    return `
      <nav class="workspace-pager workspace-pager" aria-label="Workspace navigation">
        <button class="pager-btn" data-action="workspace-prev" ${app.workspaceOffset <= 0 ? 'disabled' : ''} title="Previous workspace" aria-label="Previous workspace"><i class="fa-solid fa-chevron-left"></i></button>
        <span class="pager-label">Workspaces ${from}-${to} of ${app.workspaces.length}</span>
        <button class="pager-btn" data-action="workspace-next" ${to >= app.workspaces.length ? 'disabled' : ''} title="Next workspace" aria-label="Next workspace"><i class="fa-solid fa-chevron-right"></i></button>
      </nav>`;
  }




  function hashFast(text) {
    const source = String(text || '');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function artifactTraversalKey(node) {
    if (!node) return '';
    if (node.browseUrl) return `browse:${node.browseUrl}`;
    if (node.rawUrl) return `raw:${node.rawUrl}`;
    if (node.repo && node.ref && node.path) return `repo:${node.repo}@${node.ref}:${node.path}`;
    if (node.path) return `path:${node.path}`;
    if (node.rawMarkdown) return `content:${hashFast(node.rawMarkdown)}`;
    return `id:${node.id}`;
  }






  app.routing = Object.assign({
    restoring: false,
    suppressNext: false
  }, app.routing || {});

  function workspaceSourceUrls(ws) {
    return Array.from(ws.files.values())
      .filter((f) => f.rawUrl && !f.isGenerated)
      .map((f) => f.rawUrl);
  }

  function encodeRouteState(state) {
    return b64UrlEncode(JSON.stringify(state));
  }

  function decodeRouteStateFromHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const encoded = params.get('state');
    if (!encoded) return null;
    return JSON.parse(b64UrlDecode(encoded));
  }

  function routeUrl(state) {
    return `${location.pathname}${location.search}#state=${encodeRouteState(state)}`;
  }

  function routeSourcesMatch(state) {
    return routeSourcesSignature(state) === currentSourcesSignature();
  }

  function setWorkspacePageOffset(nextOffset) {
    const count = visibleWorkspaceCount();
    const maxOffset = Math.max(0, app.workspaces.length - count);
    app.workspaceOffset = Math.max(0, Math.min(nextOffset, maxOffset));
    const visible = app.workspaces.slice(app.workspaceOffset, app.workspaceOffset + count);
    if (visible.length) app.activeWorkspaceId = visible[0].id;
    setRouteState('push');
    render();
  }







  app.settings = Object.assign({
    repoDiscoveryBatchRenderEvery: 20,
    repoDiscoveryFetchDelayMs: 0
  }, app.settings || {});

  function normalizeRepoPath(path) {
    return String(path || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function parseGitHubRepoSpec(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
      return { repo: raw, ref: '', rootPath: '' };
    }

    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    const host = url.hostname.toLowerCase();

    if (host === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const repoName = parts[1].replace(/\.git$/i, '');
        const treeIndex = parts.indexOf('tree');
        const blobIndex = parts.indexOf('blob');
        if (treeIndex === 2 && parts.length >= 4) {
          return { repo: `${owner}/${repoName}`, ref: parts[3], rootPath: parts.slice(4).join('/') };
        }
        if (blobIndex === 2 && parts.length >= 4) {
          return { repo: `${owner}/${repoName}`, ref: parts[3], rootPath: dirname(parts.slice(4).join('/')) };
        }
        return { repo: `${owner}/${repoName}`, ref: '', rootPath: '' };
      }
    }

    if (host === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 3) {
        return { repo: `${parts[0]}/${parts[1]}`, ref: parts[2], rootPath: dirname(parts.slice(3).join('/')) };
      }
    }

    return null;
  }


  function githubRawUrl(repo, ref, path) {
    return `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
  }

  function githubBrowseUrl(repo, ref, path) {
    return `https://github.com/${repo}/blob/${ref}/${path}`;
  }

  function maybeLeafByNumericName(path, allTracePaths) {
    const name = fileNameFromPath(path).replace(/\.trace\.md$/i, '');
    if (!/^\d+(?:-\d+)*$/.test(name)) return true;
    const prefix = `${dirname(path)}/${name}-`.replace(/^\//, '');
    return !allTracePaths.some((other) => other !== path && other.startsWith(prefix));
  }





  app.repoDiscoveryInFlight = app.repoDiscoveryInFlight || new Set();





  function parseRootPaths(value) {
    return String(value || '.topics')
      .split(/[\n,]+/)
      .map((item) => normalizeRepoPath(item))
      .filter(Boolean);
  }

  function rootPathsLabel(paths) {
    const roots = (paths || []).filter(Boolean);
    if (!roots.length) return '.topics';
    if (roots.length === 1) return roots[0];
    return `${roots.length} roots`;
  }

  function stripDiscoveryRootPrefix(path, roots) {
    const normalized = normalizeRepoPath(path);
    const sorted = (roots || []).map(normalizeRepoPath).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const root of sorted) {
      if (normalized === root) return '';
      if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1);
    }
    return normalized;
  }

  function discoveryRootsForWorkspace(ws) {
    if (Array.isArray(ws.discoverySource?.rootPaths) && ws.discoverySource.rootPaths.length) return ws.discoverySource.rootPaths;
    if (ws.discoverySource?.rootPath) return [ws.discoverySource.rootPath];
    return ['.topics'];
  }

  function repoDiscoveryKey(repo, ref, rootPath) {
    const roots = Array.isArray(rootPath) ? rootPath : parseRootPaths(rootPath || '.topics');
    return `${repo}@${ref || ''}:${roots.map(normalizeRepoPath).join('|')}`;
  }

  function renderDiscoveryViewToggle(ws) {
    const view = ws.discoveryView || 'feed';
    return `<div class="view-toggle" role="group" aria-label="Discovery view mode">
      <button class="view-toggle-btn ${view === 'feed' ? 'active' : ''}" data-action="set-discovery-view" data-view="feed" data-ws="${escapeAttr(ws.id)}" title="Show discovery as cards">Feed</button>
      <button class="view-toggle-btn ${view === 'tree' ? 'active' : ''}" data-action="set-discovery-view" data-view="tree" data-ws="${escapeAttr(ws.id)}" title="Show discovery grouped by folder">Tree</button>
    </div>`;
  }

  function buildDiscoveryTree(ws, nodes) {
    const roots = discoveryRootsForWorkspace(ws);
    const root = { name: '', path: '', folders: new Map(), nodes: [], traceCount: 0, leafCount: 0 };
    const leaves = new Set(ws.leaves.map((node) => node.id));

    for (const node of nodes) {
      const relative = stripDiscoveryRootPrefix(node.path, roots);
      const parts = relative.split('/').filter(Boolean);
      const file = parts.pop() || fileNameFromPath(node.path);
      let cursor = root;
      cursor.traceCount += 1;
      if (leaves.has(node.id)) cursor.leafCount += 1;
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!cursor.folders.has(part)) cursor.folders.set(part, { name: part, path: currentPath, folders: new Map(), nodes: [], traceCount: 0, leafCount: 0 });
        cursor = cursor.folders.get(part);
        cursor.traceCount += 1;
        if (leaves.has(node.id)) cursor.leafCount += 1;
      }
      cursor.nodes.push({ node, file });
    }
    return root;
  }

  function treeFolderExpanded(ws, path) {
    ws.treeExpandedFolders = ws.treeExpandedFolders || {};
    if (Object.prototype.hasOwnProperty.call(ws.treeExpandedFolders, path)) return Boolean(ws.treeExpandedFolders[path]);
    return false;
  }

  function renderDiscoveryTree(ws, nodes) {
    const tree = buildDiscoveryTree(ws, nodes);
    const roots = discoveryRootsForWorkspace(ws);
    const rootFolder = normalizedFolderPath(roots?.[0] || '.topics');
    return `<div class="discovery-tree has-folder-add">
      <div class="tree-root-note root-add">
        <span><i class="fa-solid fa-folder-tree"></i> Root${roots.length === 1 ? '' : 's'}: ${escapeHtml(roots.join(', '))}</span>
        ${folderAddButton(ws, rootFolder, `Add local artifact in ${rootFolder}`)}
      </div>
      ${renderTreeFolderChildren(ws, tree, 0)}
    </div>`;
  }

  function renderTreeFolderChildren(ws, folder, depth) {
    const folders = Array.from(folder.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
    const files = folder.nodes.sort((a, b) => a.file.localeCompare(b.file));
    return [
      ...folders.map((child) => renderTreeFolder(ws, child, depth)),
      ...files.map(({ node, file }) => renderTreeFile(ws, node, file, depth))
    ].join('');
  }

  function renderTreeFolder(ws, folder, depth) {
    const expanded = treeFolderExpanded(ws, folder.path);
    const actualPath = treeFolderActualPath(ws, folder.path);
    return `<div class="tree-folder" style="--tree-depth:${depth}">
      <div class="tree-row tree-folder-row folder-add-row">
        <button class="tree-folder-toggle" data-action="toggle-tree-folder" data-ws="${escapeAttr(ws.id)}" data-folder="${escapeAttr(folder.path)}" title="${expanded ? 'Collapse folder' : 'Expand folder'}">
          <i class="fa-solid ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
          <i class="fa-regular fa-folder"></i>
          <span class="tree-name">${escapeHtml(folder.name)}</span>
          <span class="tree-count">${folder.traceCount} traces</span>
          <span class="tree-count">${folder.leafCount} leaves</span>
        </button>
        ${folderAddButton(ws, actualPath, `Add local artifact in ${actualPath}`)}
      </div>
      ${expanded ? `<div class="tree-children">${renderTreeFolderChildren(ws, folder, depth + 1)}</div>` : ''}
    </div>`;
  }


  function routeSourcesSignature(state) {
    return (state.sources || []).map((source) => {
      if (source.kind === 'github-tree') return `github-tree:${source.repo}@${source.ref || ''}:${(source.rootPaths || [source.rootPath || '.topics']).map(normalizeRepoPath).join('|')}`;
      return `urls:${(source.urls || []).join('\n')}`;
    }).join('\n---workspace---\n');
  }

  function currentSourcesSignature() {
    return app.workspaces.map((ws) => {
      if (ws.discoverySource?.kind === 'github-tree') return `github-tree:${ws.discoverySource.repo}@${ws.discoverySource.ref || ws.ref || ''}:${(ws.discoverySource.rootPaths || [ws.discoverySource.rootPath || '.topics']).map(normalizeRepoPath).join('|')}`;
      return `urls:${workspaceSourceUrls(ws).join('\n')}`;
    }).join('\n---workspace---\n');
  }

  async function applyRouteState(state, recreate = false) {
    if (!state || !Array.isArray(state.sources)) return false;
    app.routing.restoring = true;
    app.isBootingFromUrl = true;
    try {
      if (recreate || !routeSourcesMatch(state)) {
        app.workspaces = [];
        app.activeWorkspaceId = null;
        app.workspaceOffset = 0;
        for (const source of state.sources) {
          const ws = createWorkspace(source.label || 'Shared lineage workspace', 'Loaded from URL route state.');
          if (source.kind === 'github-tree') {
            await discoverGitHubRepoIntoWorkspace(ws, {
              repo: source.repo,
              ref: source.ref || '',
              rootPaths: source.rootPaths || [source.rootPath || '.topics']
            });
          } else {
            await loadUrlsIntoWorkspace(ws, source.urls || []);
          }
          applyViewStateToWorkspace(ws, source);
        }
      } else {
        state.sources.forEach((source, index) => applyViewStateToWorkspace(app.workspaces[index], source));
      }

      const activeIndex = Math.max(0, Math.min(Number(state.activeIndex || 0), app.workspaces.length - 1));
      const count = visibleWorkspaceCount();
      const maxOffset = Math.max(0, app.workspaces.length - count);
      app.activeWorkspaceId = app.workspaces[activeIndex]?.id || app.workspaces[0]?.id || null;
      app.workspaceOffset = Math.max(0, Math.min(Number(state.workspaceOffset || activeIndex || 0), maxOffset));
      return true;
    } finally {
      app.routing.restoring = false;
      app.isBootingFromUrl = false;
    }
  }




  // Keep lineage as the primary artifact model. Referenced material is supporting
  // context: images/text/markdown can preview, .trace.md is handled as lineage,
  // and other files stay source-only.

  app.materialPreviewCache = app.materialPreviewCache || {};
  app.settings = Object.assign({
    materialPreviewMaxChars: 120000,
    materialCompactLimit: 5
  }, app.settings || {});

  function cleanMaterialHref(href) {
    return String(href || '')
      .trim()
      .replace(/\s+["'][^"']*["']\s*$/, '')
      .replace(/^<|>$/g, '');
  }

  function stripUrlDecorations(value) {
    return String(value || '').split('#')[0].split('?')[0];
  }

  function fileExtension(path) {
    const clean = stripUrlDecorations(path).toLowerCase();
    const name = fileNameFromPath(clean);
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i) : '';
  }

  function isTracePath(path) {
    return /\.trace\.md(?:$|[?#])/i.test(String(path || ''));
  }

  function isImagePath(path) {
    return /\.(png|jpe?g|gif|webp|svg)(?:$|[?#])/i.test(String(path || ''));
  }

  function isTextPreviewPath(path) {
    const clean = String(path || '');
    if (isTracePath(clean)) return false;
    return /\.(txt|md|markdown)(?:$|[?#])/i.test(clean);
  }

  function materialRefIndex(ws, node, ref) {
    const refs = extractMaterialRefs(ws, node);
    const key = `${ref.kind}|${ref.path}|${ref.rawUrl}|${ref.href}`;
    const index = refs.findIndex((item) => `${item.kind}|${item.path}|${item.rawUrl}|${item.href}` === key);
    return Math.max(0, index);
  }

  function materialRefFromEvent(el) {
    const ws = getWorkspace(el.dataset.ws);
    const node = ws?.nodeById.get(el.dataset.node);
    if (!ws || !node) return { ws: null, node: null, ref: null };
    const refs = extractMaterialRefs(ws, node);
    const ref = refs[Number(el.dataset.ref || 0)] || null;
    return { ws, node, ref };
  }

  async function loadMaterialTrace(ws, node, ref) {
    if (!ws || !node || !ref || ref.kind !== 'trace') return;
    if (ref.loadedNodeId) {
      selectNode(ws.id, ref.loadedNodeId);
      setRouteState('push');
      return;
    }
    if (!ref.rawUrl) {
      toast('Trace reference is not resolvable from this workspace.', 'warn');
      return;
    }
    try {
      const content = await fetchText(ref.rawUrl);
      addFileToWorkspace(ws, {
        path: ref.path || fileNameFromPath(ref.rawUrl),
        content,
        rawUrl: ref.rawUrl,
        browseUrl: ref.browseUrl || ref.sourceUrl || '',
        repo: ref.repo || ws.repo || '',
        ref: ref.ref || ws.ref || ''
      });
      computeWorkspaceIndex(ws);
      const loaded = sameWorkspacePathLookup(ws, ref.path) || Array.from(ws.nodeById.values()).find((candidate) => candidate.rawUrl === ref.rawUrl);
      if (loaded) ws.selectedNodeId = loaded.id;
      setRouteState('push');
      render();
    } catch (error) {
      toast(`Could not load trace reference: ${error.message}`, 'warn');
    }
  }

  function renderMaterialPreviewModal(modal) {
    const ws = getWorkspace(modal.wsId);
    const node = ws?.nodeById.get(modal.nodeId);
    const ref = node ? extractMaterialRefs(ws, node)[Number(modal.refIndex || 0)] : null;
    if (!ws || !node || !ref) return '';
    const isMd = ref.kind === 'markdown';
    return `
      <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
        <div class="modal-panel read-modal-panel material-preview-panel">
          <div class="modal-header-lite sticky-modal-head">
            <div>
              <p class="kicker">${isMd ? 'Markdown attachment' : 'Text attachment'}</p>
              <h2 class="modal-title-lite">${escapeHtml(ref.label || fileNameFromPath(ref.path || ref.href))}</h2>
              <p class="text-secondary mb-0">${escapeHtml(ref.path || ref.href)}</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-read-body">
            ${modal.status === 'loading' ? '<div class="empty-state">Loading preview…</div>' : ''}
            ${modal.status === 'failed' ? `<div class="policy-callout danger"><strong>Preview unavailable</strong><br>${escapeHtml(modal.error || 'Could not preview this attachment.')}</div>` : ''}
            ${modal.status === 'loaded' ? `
              ${modal.truncated ? '<div class="policy-callout"><strong>Preview truncated.</strong> Open source for the full file.</div>' : ''}
              ${isMd ? `<div class="markdown-rendered">${renderSafeMarkdown(modal.content || '')}</div>` : `<pre class="source-block modal-source"><code>${escapeHtml(modal.content || '')}</code></pre>`}
            ` : ''}
          </div>
          <div class="modal-footer-actions">
            ${ref.sourceUrl ? `<a class="tv-btn subtle" href="${escapeAttr(safeUrl(ref.sourceUrl) || ref.sourceUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open source</a>` : ''}
            <button class="tv-btn subtle" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>`;
  }

  function renderNonLineageOriginCard(ws, origin) {
    if (!origin) return '';
    const source = origin.sourceUrl || origin.browseUrl || origin.rawUrl || origin.href;
    return `
      <article class="lineage-post origin-artifact-card">
        <div class="post-main">
          <div class="post-chips">
            <span class="badge-soft muted-chip"><i class="fa-solid fa-ban"></i>non-lineage origin</span>
            <span class="badge-soft muted-chip">${escapeHtml(fileExtension(origin.path || origin.href) || 'artifact')}</span>
          </div>
          <h3 class="post-title">Origin is not Tiinex lineage</h3>
          <p class="post-summary">This parent/origin is a supporting artifact, not a .trace.md file. Integrity may still refer to the artifact, but lineage traversal stops here.</p>
        </div>
        <div class="origin-artifact-body">
          <span class="material-icon"><i class="${escapeAttr(materialIcon(origin.kind || 'file'))}"></i></span>
          <div>
            <strong>${escapeHtml(origin.label || fileNameFromPath(origin.path || origin.href))}</strong>
            <p>${escapeHtml(origin.path || origin.href)}</p>
          </div>
        </div>
        <div class="post-actions">
          ${source ? `<a class="icon-action anchor" href="${escapeAttr(safeUrl(source) || source)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Open source</span></a>` : ''}
        </div>
      </article>`;
  }

  function lineageTraversal(node) {
    const nodes = [];
    const seen = new Set();
    let cursor = node;
    let cycleNode = null;
    while (cursor) {
      const key = artifactTraversalKey(cursor);
      if (seen.has(key)) {
        cycleNode = cursor;
        break;
      }
      seen.add(key);
      nodes.push(cursor);
      cursor = cursor.parentNode || null;
    }
    const last = nodes[nodes.length - 1];
    const nonLineageOrigin = last ? nonLineageParentOrigin(getWorkspace(last.workspaceId), last) : null;
    const parentUnavailable = Boolean(last && last.parentHref && !last.parentNode && !nonLineageOrigin);
    const endReached = Boolean(last && !last.parentHref && !nonLineageOrigin);
    return { nodes, cycleNode, parentUnavailable, endReached, nonLineageOrigin };
  }

  function renderContinuityPreview(node, ws = null) {
    const key = schemaKey(node.currentSchemaText || node.currentSchema);
    const sections = extractBodySections(node.body || node.rawMarkdown);
    let html = '';
    if (key === 'topic') html = renderPreviewSections(sections, ['Current Read', 'Design Direction', 'Next Artifacts', 'Good Child Candidates']);
    else if (key === 'evidence' || key === 'feedback') html = renderPreviewSections(sections, ['Supported Claim', 'Provenance', 'Evidence Material', 'Supports', 'Interpretation Limits', 'Interpretation Notes and Limits', 'Feedback Signal']);
    else if (key === 'decision') html = renderPreviewSections(sections, ['Decision', 'Basis', 'Consequences', 'Review Conditions', 'Immediate Next Questions']);
    else if (key === 'task') html = renderPreviewSections(sections, ['Objective', 'Done Criteria', 'Scope', 'Dependencies', 'Grounding', 'Non-Goals']);
    else if (key === 'reduction') html = renderPreviewSections(sections, ['Carry-Forward State', 'Loss And Uncertainty', 'Validation', 'Review Checklist']);
    else {
      const picked = Object.keys(sections).slice(0, 5);
      html = picked.length ? renderPreviewSections(sections, picked) : '<p class="preview-note">No schema-specific preview available. Open detail or markdown for the full artifact.</p>';
    }
    return html + (ws ? renderMaterialSection(ws, node, { compact: true }) : '');
  }


  function renderDetailReadView(ws, node) {
    const schema = node.currentSchemaText || (node.hasModernEnvelope ? 'unknown schema' : 'plain markdown');
    return `
      <div class="detail-read-head">
        <div class="post-chips">
          <span class="badge-soft badge-schema ${schemaBadgeClass(schema)}">${escapeHtml(shortSchema(schema))}</span>
          ${node.createdAt ? `<span class="badge-soft muted-chip">${escapeHtml(node.createdAt)}</span>` : ''}
          ${materialSchemaBadges(ws, node)}
          ${integrityBadge(node)}
        </div>
        <p>${escapeHtml(node.summary || '')}</p>
      </div>
      ${renderContinuityPreview(node)}
      ${renderMaterialSection(ws, node, { compact: false })}
      <hr class="soft-rule">
      <div class="markdown-rendered">${renderSafeMarkdown(node.body || node.rawMarkdown)}</div>`;
  }




  // Keep the material strip useful: only show references the viewer can open or
  // act on, and collapse duplicate/local shadow origins. This prevents local
  // absolute paths like C:/Users/... from appearing next to the resolvable repo
  // artifact.

  function isLocalAbsolutePath(value) {
    const text = String(value || '').trim();
    return /^[a-zA-Z]:[\\/]/.test(text) || /^\/(Users|home|mnt|var|tmp|private)\//.test(text) || /^file:\/\//i.test(text);
  }

  function materialDedupKey(ref) {
    const clean = stripUrlDecorations(ref.path || ref.rawUrl || ref.href || '').replace(/\\/g, '/');
    const file = fileNameFromPath(clean).toLowerCase();
    if (file) return `${ref.kind}:${file}`;
    return `${ref.kind}:${clean.toLowerCase()}`;
  }

  function filterMaterialRefs(refs) {
    const out = [];
    const seen = new Set();

    for (const ref of refs) {
      if (!materialHasOpenableSource(ref)) continue;
      const key = materialDedupKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }

    return out;
  }

  function extractMaterialRefs(ws, node) {
    const source = normalizeNewlines(node.body || node.rawMarkdown || '');
    const found = [];
    const seen = new Set();

    function add(label, href, image = false) {
      const ref = resolveMaterialHref(ws, node, href, image, label);
      if (!ref) return;
      const key = `${ref.kind}|${ref.path}|${ref.rawUrl}|${ref.href}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push(ref);
    }

    source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, label, href) => {
      add(label || 'image', href, true);
      return '';
    });

    source.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      add(label, href, false);
      return '';
    });

    source.replace(/\bhttps?:\/\/[^\s<>)]+/g, (url) => {
      add(fileNameFromPath(new URL(url).pathname) || url, url, false);
      return '';
    });

    return filterMaterialRefs(found).filter((ref) => !isParentLikeMaterialRef(ws, node, ref));
  }

  function renderMaterialSection(ws, node, opts = {}) {
    const refs = extractMaterialRefs(ws, node);
    if (!refs.length) return '';
    const compact = Boolean(opts.compact);
    const limit = compact ? Number(app.settings.materialCompactLimit || 5) : 9999;
    const shown = refs.slice(0, limit);
    const more = refs.length - shown.length;
    const groups = groupMaterialRefs(shown);
    return `
      <section class="material-section ${compact ? 'compact' : 'full'}">
        <div class="material-head">
          <h4><i class="fa-solid fa-paperclip"></i>Referenced material</h4>
          <span class="material-count">${escapeHtml(materialSummary(refs).join(' · ') || 'references')}</span>
        </div>
        <div class="material-groups">
          ${groups.map((group) => `
            <div class="material-group">
              ${compact ? '' : `<div class="material-group-title">${escapeHtml(previewMaterialKindLabel(group.kind))}</div>`}
              <div class="material-items">
                ${group.items.map((ref) => renderMaterialItem(ws, node, ref, compact)).join('')}
              </div>
            </div>`).join('')}
        </div>
        ${more > 0 ? `<div class="material-more-note">+ ${more} more in Open view</div>` : ''}
      </section>`;
  }

  function materialSchemaBadges(ws, node) {
    const refs = extractMaterialRefs(ws, node);
    if (!refs.length) return '';
    return materialSummary(refs).slice(0, 2).map((label) => `<span class="badge-soft material-chip"><i class="fa-solid fa-paperclip"></i>${escapeHtml(label)}</span>`).join('');
  }




  // .trace.md references are lineage navigation, not generic attachments.
  // The user sees "Open trace"; the viewer decides whether to anchor, load into
  // the same workspace, or ask before opening an external lineage workspace.

  function traceRefSameLineageContext(ws, node, ref) {
    const currentRepo = node.repo || ws?.repo || '';
    const currentRef = node.ref || ws?.ref || '';
    if (!ref.repo || !ref.ref || !currentRepo || !currentRef) return true;
    return ref.repo === currentRepo && ref.ref === currentRef;
  }

  function traceRefStatusLabel(ws, node, ref) {
    if (ref.loadedNodeId) return 'loaded';
    if (!ref.rawUrl) return 'unresolved';
    if (!traceRefSameLineageContext(ws, node, ref)) return 'external lineage';
    return 'loadable';
  }

  function renderTraceRefStatus(ws, node, ref) {
    if (ref.kind !== 'trace') return '';
    const status = traceRefStatusLabel(ws, node, ref);
    return `<span class="trace-ref-status ${escapeAttr(status.replace(/\s+/g, '-'))}">${escapeHtml(status)}</span>`;
  }

  async function loadTraceReferenceIntoWorkspace(targetWs, ref, selectAfterLoad = true) {
    if (!targetWs || !ref || !ref.rawUrl) throw new Error('Trace reference is not resolvable.');
    const content = await fetchText(ref.rawUrl);
    addFileToWorkspace(targetWs, {
      path: ref.path || fileNameFromPath(ref.rawUrl),
      content,
      rawUrl: ref.rawUrl,
      browseUrl: ref.browseUrl || ref.sourceUrl || '',
      repo: ref.repo || targetWs.repo || '',
      ref: ref.ref || targetWs.ref || ''
    });
    computeWorkspaceIndex(targetWs);
    const loaded = sameWorkspacePathLookup(targetWs, ref.path)
      || Array.from(targetWs.nodeById.values()).find((candidate) => candidate.rawUrl === ref.rawUrl || candidate.browseUrl === ref.browseUrl);
    if (loaded && selectAfterLoad) {
      targetWs.selectedNodeId = loaded.id;
      app.activeWorkspaceId = targetWs.id;
      focusWorkspaceWindow(targetWs.id);
    }
    return loaded;
  }

  async function openTraceReference(ws, node, ref) {
    if (!ws || !node || !ref || ref.kind !== 'trace') return;

    if (ref.loadedNodeId) {
      selectNode(ws.id, ref.loadedNodeId);
      setRouteState('push');
      return;
    }

    if (!ref.rawUrl) {
      toast('Trace reference is not resolvable from this workspace.', 'warn');
      return;
    }

    if (traceRefSameLineageContext(ws, node, ref)) {
      try {
        await loadTraceReferenceIntoWorkspace(ws, ref, true);
        setRouteState('push');
        render();
      } catch (error) {
        toast(`Could not open trace: ${error.message}`, 'warn');
      }
      return;
    }

    app.modal = {
      type: 'external-trace',
      sourceWsId: ws.id,
      sourceNodeId: node.id,
      refIndex: materialRefIndex(ws, node, ref)
    };
    render();
  }

  async function openExternalTraceWorkspace(modal) {
    const sourceWs = getWorkspace(modal.sourceWsId);
    const sourceNode = sourceWs?.nodeById.get(modal.sourceNodeId);
    const ref = sourceNode ? extractMaterialRefs(sourceWs, sourceNode)[Number(modal.refIndex || 0)] : null;
    if (!sourceWs || !sourceNode || !ref) {
      toast('Trace reference no longer exists.', 'warn');
      app.modal = null;
      render();
      return;
    }

    const label = `${ref.repo || 'External lineage'} · trace`;
    const ws = createWorkspace(label, `Opened from trace reference in ${sourceWs.label}.`);
    ws.discoverySource = ref.repo ? { kind: 'trace-reference', repo: ref.repo, ref: ref.ref || '', rootPath: dirname(ref.path || '') } : { kind: 'trace-reference' };
    ws.repo = ref.repo || '';
    ws.ref = ref.ref || '';
    app.modal = null;
    app.activeWorkspaceId = ws.id;
    focusWorkspaceWindow(ws.id);
    render();

    try {
      await loadTraceReferenceIntoWorkspace(ws, ref, true);
      await discoverWorkspacePolicy(ws);
      setRouteState('push');
      render();
    } catch (error) {
      toast(`Could not open external trace: ${error.message}`, 'warn');
      render();
    }
  }

  function renderExternalTraceModal(modal) {
    const sourceWs = getWorkspace(modal.sourceWsId);
    const sourceNode = sourceWs?.nodeById.get(modal.sourceNodeId);
    const ref = sourceNode ? extractMaterialRefs(sourceWs, sourceNode)[Number(modal.refIndex || 0)] : null;
    if (!sourceWs || !sourceNode || !ref) return '';
    const source = ref.sourceUrl || ref.browseUrl || ref.rawUrl || ref.href;
    return `
      <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
        <div class="modal-panel external-trace-panel">
          <div class="modal-header-lite">
            <div>
              <p class="kicker">External lineage reference</p>
              <h2 class="modal-title-lite">Open this trace in a new workspace?</h2>
              <p class="text-secondary mb-0">This .trace.md reference appears to belong to a different repo/ref than the current workspace.</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="external-trace-summary">
            <span class="material-icon"><i class="fa-solid fa-code-branch"></i></span>
            <div>
              <strong>${escapeHtml(ref.label || fileNameFromPath(ref.path || ref.href))}</strong>
              <p>${escapeHtml(ref.repo ? `${ref.repo}${ref.ref ? '@' + ref.ref : ''}` : 'External trace')}</p>
              <p>${escapeHtml(ref.path || ref.href)}</p>
            </div>
          </div>
          <div class="policy-callout">
            The current workspace stays unchanged. A new workspace keeps the lineage context separate and avoids mixing unrelated repos by accident.
          </div>
          <div class="modal-footer-actions">
            <button class="tv-btn primary" data-action="confirm-open-external-trace"><i class="fa-solid fa-layer-group"></i>Open in new workspace</button>
            ${source ? `<a class="tv-btn subtle" href="${escapeAttr(safeUrl(source) || source)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open source</a>` : ''}
            <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  async function onAction(event) {
    const action = event.currentTarget.dataset.action;
    const wsId = event.currentTarget.dataset.ws;
    const nodeId = event.currentTarget.dataset.node;

    if (action === 'open-trace-reference') {
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) await openTraceReference(ws, node, ref);
      return;
    }

    if (action === 'confirm-open-external-trace') {
      if (app.modal?.type === 'external-trace') await openExternalTraceWorkspace(app.modal);
      return;
    }

    if (action === 'open-material-lightbox') {
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) {
        app.modal = { type: 'material-lightbox', wsId: ws.id, nodeId: node.id, refIndex: materialRefIndex(ws, node, ref) };
        render();
      }
      return;
    }

    if (action === 'open-material-preview') {
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) await openMaterialPreview(ws, node, ref);
      return;
    }

    if (action === 'load-material-trace') {
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) await loadMaterialTrace(ws, node, ref);
      return;
    }

    if (action === 'copy-material-ref') {
      const { ref } = materialRefFromEvent(event.currentTarget);
      const text = ref?.sourceUrl || ref?.rawUrl || ref?.href || ref?.path || '';
      if (text && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast('Reference copied.', 'ok');
      }
      return;
    }

    if (action === 'toggle-tree-folder') {
      const ws = getWorkspace(wsId);
      const folder = event.currentTarget.dataset.folder || '';
      if (ws) {
        ws.treeExpandedFolders = ws.treeExpandedFolders || {};
        ws.treeExpandedFolders[folder] = !treeFolderExpanded(ws, folder);
        setRouteState('replace');
        render();
      }
      return;
    }

    if (action === 'set-discovery-view') {
      const ws = getWorkspace(wsId);
      if (ws) {
        ws.discoveryView = event.currentTarget.dataset.view || 'feed';
        setRouteState('push');
        render();
      }
      return;
    }

    if (action === 'workspace-prev') {
      event.preventDefault();
      event.stopPropagation();
      setWorkspacePageOffset((app.workspaceOffset || 0) - 1);
      return;
    }
    if (action === 'workspace-next') {
      event.preventDefault();
      event.stopPropagation();
      setWorkspacePageOffset((app.workspaceOffset || 0) + 1);
      return;
    }
    if (action === 'lineage-load-more') {
      const ws = getWorkspace(wsId);
      if (ws && nodeId) {
        const feed = document.querySelector(`.post-feed.lineage[data-ws="${CSS.escape(wsId)}"]`);
        const beforeState = nodeId ? Object.assign({}, ensureLineageWindow(ws, nodeId)) : null;
        scrollFlightRecord('more:lineage-before', {
          workspace: scrollRestoreDebugWorkspaceState(ws),
          nodeId,
          beforeState,
          feed: scrollRestoreDebugTargetState(feed)
        });
        captureFeedScroll(feed, 'manual-lineage-load-more');
        const state = ensureLineageWindow(ws, nodeId);
        state.visibleCount += lineageGrowthCount(feed);
        scrollFlightRecord('more:lineage-after-state', {
          workspace: scrollRestoreDebugWorkspaceState(ws),
          nodeId,
          beforeState,
          afterState: Object.assign({}, state),
          feed: scrollRestoreDebugTargetState(feed)
        });
        setRouteState('replace');
        render();
      }
      return;
    }
    if (action === 'clear-search') {
      const ws = getWorkspace(wsId);
      const mode = event.currentTarget.dataset.mode || 'discovery';
      if (ws) {
        if (mode === 'lineage') ws.lineageSearch = '';
        else ws.discoverySearch = '';
        setRouteState('replace');
        render();
      }
      return;
    }
    if (action === 'set-discovery-filter' || action === 'set-filter') {
      const ws = getWorkspace(wsId);
      if (ws) {
        ws.discoveryFilterSchema = event.currentTarget.dataset.filter || 'all';
        ws.filterSchema = ws.discoveryFilterSchema;
        setRouteState('push');
        render();
      }
      return;
    }
    if (action === 'open-source-modal') { openSourceModal(wsId || ''); return; }
    if (action === 'load-demo') { await loadDemo(); setRouteState('push'); return; }
    if (action === 'create-workspace') { await createWorkspaceFromInputs(); setRouteState('push'); return; }
    if (action === 'select-node') { selectNode(wsId, nodeId); setRouteState('push'); return; }
    if (action === 'clear-selection') {
      const ws = getWorkspace(wsId);
      if (ws) {
        ws.selectedNodeId = null;
        setRouteState('push');
        render();
      }
      return;
    }
    if (action === 'remove-workspace') { removeWorkspace(wsId); setRouteState('push'); return; }
    if (action === 'toggle-workspace-mode') {
      const ws = getWorkspace(wsId);
      if (ws) {
        ws.layoutMode = event.currentTarget.dataset.mode || 'expanded';
        setRouteState('push');
        render();
      }
      return;
    }
    if (action === 'save-workspace') { await saveWorkspace(wsId); return; }
    if (action === 'copy-share') { setRouteState('replace'); copyShareLink(); return; }
    if (action === 'toggle-node-expand') { toggleNodeExpand(wsId, nodeId); setRouteState('replace'); return; }
    if (action === 'open-detail-modal') { app.modal = { type: 'detail', wsId, nodeId }; render(); return; }
    if (action === 'open-markdown-modal') { app.modal = { type: 'markdown', wsId, nodeId }; render(); return; }
    if (action === 'open-create') {
      openArtifactCreateIntent({ mode: event.currentTarget.dataset.mode, wsId, nodeId, schemaId: event.currentTarget.dataset.schemaId || event.currentTarget.dataset.schema || '' });
      return;
    }
    if (action === 'close-modal') { app.modal = null; render(); return; }
  }




  // This override constrains the actual grid columns instead.

  function workspaceGridStyleVar(visible) {
    const w = window.innerWidth || document.documentElement.clientWidth || 1920;
    if (w < 760) return '';
    const expanded = 'minmax(min(100%, var(--workspace-expanded-min)), var(--workspace-expanded-max))';
    const cols = visible.map((ws) => ws.layoutMode === 'compact'
      ? 'var(--collapsed-workspace-width)'
      : expanded
    );
    return `style="--workspace-columns:${escapeAttr(cols.join(' '))};"`;
  }




  // There was no intended 1s backend throttle in the viewer. Repo discovery was
  // sequentially fetching raw traces and re-rendering in small batches, which can
  // feel like lag on a second/large load. Use modest concurrency and fewer
  // intermediate renders instead.

  app.settings = Object.assign({
    repoDiscoveryFetchConcurrency: 8,
    repoDiscoveryBatchRenderEvery: 80,
    repoDiscoveryBatchRenderDelayMs: 16
  }, app.settings || {});

  async function runWithConcurrency(items, limit, worker) {
    const queue = Array.from(items || []);
    const concurrency = Math.max(1, Math.min(Number(limit || 1), queue.length || 1));
    let next = 0;

    async function runner() {
      while (next < queue.length) {
        const index = next++;
        await worker(queue[index], index);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => runner()));
  }

  async function discoverGitHubRepoIntoWorkspace(ws, options) {
    const repo = options.repo;
    const ref = options.ref || '';
    const rootPaths = Array.isArray(options.rootPaths) ? options.rootPaths : parseRootPaths(options.rootPath || '.topics');
    const key = repoDiscoveryKey(repo, ref, rootPaths);

    if (ws.discoverySource?.kind === 'github-tree'
      && repoDiscoveryKey(ws.discoverySource.repo, ws.discoverySource.ref || '', ws.discoverySource.rootPaths || ws.discoverySource.rootPath || '.topics') === key
      && ws.nodes.length) {
      toast(`${ws.label} already has discovery results for ${key}.`, 'warn');
      return;
    }

    if (app.repoDiscoveryInFlight.has(key)) {
      toast(`Discovery already running for ${key}.`, 'warn');
      return;
    }

    app.repoDiscoveryInFlight.add(key);
    ws.loading = true;
    ws.repo = repo;
    if (ref) ws.ref = ref;
    ws.discoverySource = { kind: 'github-tree', repo, ref: ref || '', rootPath: rootPaths[0] || '.topics', rootPaths };
    ws.sourceNote = `GitHub repo discovery: ${repo}${ref ? '@' + ref : ''} / ${rootPathsLabel(rootPaths)}`;
    ws.logs.push(`Discovering ${repo}${ref ? '@' + ref : ''} under ${rootPaths.join(', ')} via GitHub tree API.`);
    render();

    let count = 0;
    let failed = 0;
    try {
      const discovery = await discoverGitHubTracePaths(repo, ref, rootPaths);
      ws.repo = repo;
      ws.ref = discovery.ref;
      ws.discoverySource.ref = discovery.ref;
      ws.discoverySource.rootPath = discovery.rootPath;
      ws.discoverySource.rootPaths = discovery.rootPaths;
      ws.logs.push(`Tree discovery found ${discovery.tracePaths.length} .trace.md file(s).`);
      if (discovery.truncated) {
        ws.logs.push('GitHub tree response was truncated. Results may be incomplete; use a manifest for this repo.');
        toast(`Tree response for ${repo} was truncated; discovery may be incomplete.`, 'warn');
      }
      if (discovery.numericLeafGuess.length && discovery.numericLeafGuess.length !== discovery.tracePaths.length) {
        ws.logs.push(`Filename heuristic suggests ${discovery.numericLeafGuess.length} likely leaf candidate path(s), but full parsing still loads all traces for correctness.`);
      }

      const paths = discovery.tracePaths.filter((path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        return !Array.from(ws.files.values()).some((file) => file.rawUrl === rawUrl || file.path === path);
      });

      const concurrency = Number(app.settings.repoDiscoveryFetchConcurrency || 8);
      const batchEvery = Number(app.settings.repoDiscoveryBatchRenderEvery || 80);
      const batchDelay = Number(app.settings.repoDiscoveryBatchRenderDelayMs || 16);

      await runWithConcurrency(paths, concurrency, async (path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        try {
          const content = await fetchText(rawUrl);
          addFileToWorkspace(ws, {
            path,
            content,
            rawUrl,
            browseUrl: githubBrowseUrl(repo, discovery.ref, path),
            repo,
            ref: discovery.ref
          });
          count += 1;
          if (batchEvery > 0 && count % batchEvery === 0) {
            computeWorkspaceIndex(ws);
            requestBufferedRender('repo-discovery-batch', batchDelay);
          }
        } catch (error) {
          failed += 1;
          ws.logs.push(`Could not fetch discovered trace ${path}: ${error.message}`);
        }
      });

      computeWorkspaceIndex(ws);
      await discoverWorkspacePolicy(ws);

      if (!count && !failed) toast(`No new trace files loaded from ${repo}.`, 'warn');
      if (failed) toast(`${failed} trace file(s) could not be fetched from ${repo}.`, 'warn');
    } catch (error) {
      ws.logs.push(`Repo discovery failed for ${repo}: ${error.message}`);
      toast(`Repo discovery failed for ${repo}: ${error.message}`, 'warn');
    } finally {
      app.repoDiscoveryInFlight.delete(key);
      ws.loading = false;
      computeWorkspaceIndex(ws);
      render();
    }
  }




  // Policy lookup is about the lineage origin, not arbitrary fallback documents.
  // Only these root files count. No README/VALIDATION_NOTES/artifact fallback.

  function repoPolicyCandidates(repo, ref) {
    const names = [
      'LINEAGE_LICENSE.md',
      'LINEAGE_LICENSE',
      'LINEAGE_POLICY.md',
      'LINEAGE_POLICY',
      'LICENSE.md',
      'LICENSE',
      'POLICY.md',
      'POLICY'
    ];
    return names.map((name) => ({ kind: name, url: repoPolicyRawUrl(repo, ref, name) }));
  }

  function isLineagePolicyKind(kind) {
    return /^LINEAGE_(LICENSE|POLICY)(\.md)?$/i.test(String(kind || ''));
  }







  // understand it, so LICENSE could render as "Policy unknown". Fix the badge
  // renderer and add a separate NOTICE signal when the origin repo has NOTICE.

  function repoNoticeCandidates(repo, ref) {
    return ['NOTICE', 'NOTICE.md'].map((name) => ({ kind: name, url: repoPolicyRawUrl(repo, ref, name) }));
  }

  async function discoverWorkspaceNotice(ws) {
    if (!ws || !ws.repo || !ws.ref) {
      if (ws) ws.notice = { status: 'local', kind: '', text: '', url: '', note: '' };
      return;
    }

    for (const attempt of repoNoticeCandidates(ws.repo, ws.ref)) {
      try {
        const text = await fetchText(attempt.url);
        ws.notice = {
          status: 'found',
          kind: attempt.kind,
          text,
          url: attempt.url,
          note: `${attempt.kind} found at origin root for ${ws.repo}@${ws.ref}.`
        };
        return;
      } catch (_) {}
    }

    ws.notice = { status: 'missing', kind: '', text: '', url: '', note: 'No NOTICE file found at origin root.' };
  }

  async function discoverWorkspacePolicy(ws) {
    if (!ws || !ws.repo || !ws.ref) {
      if (ws) {
        ws.policy = {
          status: 'local',
          kind: '',
          text: '',
          url: '',
          note: 'Local or uploaded workspace. No remote origin policy lookup available.'
        };
        ws.notice = { status: 'local', kind: '', text: '', url: '', note: '' };
      }
      return;
    }

    let foundPolicy = false;
    for (const attempt of repoPolicyCandidates(ws.repo, ws.ref)) {
      try {
        const text = await fetchText(attempt.url);
        ws.policy = {
          status: isLineagePolicyKind(attempt.kind) ? 'found' : 'origin-fallback',
          kind: attempt.kind,
          text,
          url: attempt.url,
          note: `${attempt.kind} found at origin root for ${ws.repo}@${ws.ref}.`
        };
        foundPolicy = true;
        break;
      } catch (_) {}
    }

    if (!foundPolicy) {
      ws.policy = {
        status: 'missing',
        kind: '',
        text: '',
        url: `https://github.com/${ws.repo}/tree/${ws.ref}`,
        note: `No origin lineage policy/license found. Checked LINEAGE_LICENSE(.md), LINEAGE_POLICY(.md), LICENSE(.md), and POLICY(.md) at the repository root only.`
      };
    }

    await discoverWorkspaceNotice(ws);
  }





  // The source modal imports lineage material into the viewer without owning
  // artifact edit behavior.

  function sourceModalSnapshot() {
    if (!app.modal || app.modal.type !== 'source') return;
    app.modal.label = $('source-label')?.value ?? app.modal.label ?? '';
    app.modal.repo = $('source-repo')?.value ?? app.modal.repo ?? '';
    app.modal.ref = $('source-ref')?.value ?? app.modal.ref ?? '';
    app.modal.rootPaths = $('source-root')?.value ?? app.modal.rootPaths ?? '.topics';
    app.modal.urls = $('source-urls')?.value ?? app.modal.urls ?? '';
  }

  function activeElementIsTextInput() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  function ensureSourceModalCollections() {
    if (!app.modal || app.modal.type !== 'source') return null;
    app.modal.droppedFiles = app.modal.droppedFiles || [];
    app.modal.pastedFiles = app.modal.pastedFiles || [];
    return app.modal;
  }

  function makePastedTraceFile(text) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `pasted-trace-${stamp}.trace.md`;
    if (typeof File !== 'undefined') {
      return new File([text], name, { type: 'text/markdown' });
    }
    return {
      name,
      webkitRelativePath: name,
      async text() { return text; }
    };
  }

  function looksLikeTraceMarkdown(text) {
    const body = String(text || '');
    if (!body.trim()) return false;
    if (/^#\s+Continuity Context\s*$/m.test(body)) return true;
    if (/^\s*Current Schema\s*:/mi.test(body) && /^#\s+Continuity Integrity\s*$/m.test(body)) return true;
    return false;
  }

  function extractUrlLines(text) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const urls = [];
    for (const line of lines) {
      const matches = line.match(/https?:\/\/[^\s<>)]+/g);
      if (matches) urls.push(...matches);
    }
    return [...new Set(urls)];
  }

  function looksLikeRepoSpec(text) {
    const value = String(text || '').trim();
    if (!value || /\s/.test(value)) return false;
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/tree\/[^/]+(?:\/.*)?)?$/.test(value);
  }

  function appendSourceUrls(urls) {
    const box = $('source-urls');
    if (!box || !urls.length) return;
    const existing = box.value.trim();
    const next = [...new Set([...(existing ? existing.split(/\n+/).map((s) => s.trim()).filter(Boolean) : []), ...urls])];
    box.value = next.join('\n');
  }

  function applySmartPastedText(text) {
    const modal = ensureSourceModalCollections();
    if (!modal) return false;
    const body = String(text || '').trim();
    if (!body) return false;

    sourceModalSnapshot();

    if (looksLikeTraceMarkdown(body)) {
      modal.pastedFiles.push(makePastedTraceFile(body));
      modal.intakeNote = `Pasted trace markdown is ready as ${modal.pastedFiles[modal.pastedFiles.length - 1].name}.`;
      render();
      return true;
    }

    const urls = extractUrlLines(body);
    if (urls.length) {
      appendSourceUrls(urls);
      sourceModalSnapshot();
      modal.intakeNote = `${urls.length} URL${urls.length === 1 ? '' : 's'} added.`;
      render();
      return true;
    }

    if (looksLikeRepoSpec(body)) {
      const repo = $('source-repo');
      if (repo) repo.value = body;
      sourceModalSnapshot();
      modal.intakeNote = `Repo target set to ${body}.`;
      render();
      return true;
    }

    modal.intakeNote = 'Clipboard text did not look like trace markdown, a GitHub URL, or owner/repo.';
    render();
    return false;
  }

  function handleSourcePaste(event) {
    if (!app.modal || app.modal.type !== 'source') return;
    if (activeElementIsTextInput()) return;

    const files = Array.from(event.clipboardData?.files || []);
    if (files.length) {
      event.preventDefault();
      const count = addIntakeFiles(files, 'clipboard');
      render();
      if (!count) toast('Clipboard did not contain supported trace files.', 'warn');
      return;
    }

    const text = event.clipboardData?.getData('text/plain') || '';
    if (text.trim()) {
      event.preventDefault();
      const ok = applySmartPastedText(text);
      if (!ok) toast('Clipboard content was not recognized as lineage input.', 'warn');
    }
  }


  function sourceIntakeSummary(modal) {
    const dropped = modal.droppedFiles?.length || 0;
    const pasted = modal.pastedFiles?.length || 0;
    const total = dropped + pasted;
    if (!total && !modal.intakeNote) return '';
    const parts = [];
    if (dropped) parts.push(`${dropped} dropped file${dropped === 1 ? '' : 's'}`);
    if (pasted) parts.push(`${pasted} pasted trace${pasted === 1 ? '' : 's'}`);
    if (modal.intakeNote) parts.push(modal.intakeNote);
    return `<div class="source-intake-status"><i class="fa-solid fa-circle-check"></i>${escapeHtml(parts.join(' · '))}</div>`;
  }




  // discovery search, lineage search, and filter controls. Keep the source
  // drop/paste additions, but reattach all viewer input handlers.






  // Previous patch still depended on exact selectors. Use event delegation so
  // future render-layer overrides do not break discovery/lineage search again.

  function eventTargetWorkspace(target) {
    const wsId = target?.dataset?.ws || target?.closest?.('[data-ws]')?.dataset?.ws || '';
    return getWorkspace(wsId);
  }





  // Desktop drag/drop can include a whole folder. Traverse directory entries,
  // keep relative paths, and stage supported trace material just like zip
  // internals preserve structure.

  function intakeRelativePath(file) {
    return file?.tiinexRelativePath || file?.webkitRelativePath || file?.name || 'uploaded.trace.md';
  }

  function attachRelativePath(file, relativePath) {
    const normalized = String(relativePath || file?.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!file || !normalized) return file;
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        value: normalized,
        configurable: true
      });
    } catch (_) {}
    try {
      Object.defineProperty(file, 'tiinexRelativePath', {
        value: normalized,
        configurable: true
      });
    } catch (_) {
      file.tiinexRelativePath = normalized;
    }
    return file;
  }

  async function readDirectoryEntry(entry, prefix = '') {
    if (!entry) return [];
    const currentPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isFile) {
      return await new Promise((resolve) => {
        entry.file(
          (file) => resolve([attachRelativePath(file, currentPath)]),
          () => resolve([])
        );
      });
    }

    if (!entry.isDirectory) return [];

    const reader = entry.createReader();
    const entries = [];

    async function readBatch() {
      const batch = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
      if (!batch.length) return;
      entries.push(...batch);
      await readBatch();
    }

    await readBatch();

    const files = [];
    for (const child of entries) {
      files.push(...await readDirectoryEntry(child, currentPath));
    }
    return files;
  }

  function supportedIntakeFile(file) {
    const path = intakeRelativePath(file);
    return Boolean(file && /\.(trace\.md|md|zip)$/i.test(path || file.name || ''));
  }

  function addIntakeFiles(files, source = 'dropped') {
    const modal = ensureSourceModalCollections();
    if (!modal) return 0;
    const incoming = Array.from(files || []);
    const accepted = incoming.filter(supportedIntakeFile);
    const rejected = incoming.length - accepted.length;

    if (!accepted.length) {
      modal.intakeNote = incoming.length
        ? `No supported .trace.md, .md, or .zip files found in ${source}.`
        : `No files found in ${source}.`;
      return 0;
    }

    sourceModalSnapshot();
    modal.droppedFiles.push(...accepted);
    const folderHint = accepted.some((file) => /\//.test(intakeRelativePath(file))) ? ' Relative paths preserved.' : '';
    modal.intakeNote = `${accepted.length} file${accepted.length === 1 ? '' : 's'} ready from ${source}.${rejected ? ` ${rejected} unsupported skipped.` : ''}${folderHint}`;
    return accepted.length;
  }

  function bindSourceDropzone(root) {
    root.querySelectorAll('.source-dropzone').forEach((zone) => {
      zone.addEventListener('dragenter', (event) => {
        event.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', (event) => {
        if (!zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', async (event) => {
        event.preventDefault();
        zone.classList.remove('drag-over');
        sourceModalSnapshot();

        const files = await filesFromDataTransfer(event.dataTransfer);
        const hasDirectory = Array.from(event.dataTransfer?.items || []).some((item) => item.webkitGetAsEntry?.()?.isDirectory);
        const count = addIntakeFiles(files, hasDirectory ? 'folder drop' : 'drop');
        render();
        if (!count) toast('Drop did not contain supported .trace.md, .md, or .zip files.', 'warn');
      });
    });
  }




  // Some desktop drops do not expose usable webkit entries. Support modern
  // getAsFileSystemHandle() and add an explicit webkitdirectory folder picker.

  async function filesFromFileSystemHandle(handle, prefix = '') {
    if (!handle) return [];
    const currentPath = prefix ? `${prefix}/${handle.name}` : handle.name;

    if (handle.kind === 'file') {
      try {
        const file = await handle.getFile();
        return [attachRelativePath(file, currentPath)];
      } catch (_) {
        return [];
      }
    }

    if (handle.kind !== 'directory') return [];

    const files = [];
    try {
      for await (const child of handle.values()) {
        files.push(...await filesFromFileSystemHandle(child, currentPath));
      }
    } catch (_) {}

    return files;
  }

  async function filesFromDataTransfer(dataTransfer) {
    const items = Array.from(dataTransfer?.items || []);
    const files = Array.from(dataTransfer?.files || []);
    const collected = [];

    // Modern Chromium / File System Access API path.
    if (items.length && items.some((item) => typeof item.getAsFileSystemHandle === 'function')) {
      for (const item of items) {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (handle) {
            collected.push(...await filesFromFileSystemHandle(handle));
            continue;
          }
        } catch (_) {}
        const file = item.getAsFile?.();
        if (file) collected.push(file);
      }
    }

    // Chromium webkitGetAsEntry folder-upload path.
    if (!collected.length && items.length && items.some((item) => typeof item.webkitGetAsEntry === 'function')) {
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          collected.push(...await readDirectoryEntry(entry));
        } else {
          const file = item.getAsFile?.();
          if (file) collected.push(file);
        }
      }
    }

    // Last-resort file list fallback.
    if (!collected.length && files.length) {
      collected.push(...files);
    }

    return collected;
  }

  function materialHasOpenableSource(ref) {
    if (!ref) return false;
    if (ref.loadedNodeId) return true;
    if (ref.localAsset) return true;
    const source = ref.sourceUrl || ref.browseUrl || ref.rawUrl || ref.href || '';
    if (!source) return false;
    if (isLocalAbsolutePath(source) || isLocalAbsolutePath(ref.href) || isLocalAbsolutePath(ref.path)) return false;
    if (/^https?:\/\//i.test(source)) return true;
    if (ref.rawUrl && /^https?:\/\//i.test(ref.rawUrl)) return true;
    return false;
  }

  function renderMaterialItem(ws, node, ref, compact = false) {
    const source = ref.sourceUrl || ref.browseUrl || ref.rawUrl || ref.href;
    const previewable = ref.kind === 'image' || ref.kind === 'text' || ref.kind === 'markdown';
    const title = ref.label || fileNameFromPath(ref.path || ref.href);
    const subtitle = ref.localAsset ? `${ref.path} · local asset` : (ref.path || ref.href);
    const imageSrc = ref.localUrl || ref.rawUrl;
    const thumbnail = ref.kind === 'image' && imageSrc
      ? `<button class="material-thumb" data-action="open-material-lightbox" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" data-ref="${escapeAttr(materialRefIndex(ws, node, ref))}" title="Preview image"><img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(title)}" loading="lazy" onerror="this.closest('.material-thumb').classList.add('broken')"></button>`
      : `<span class="material-icon"><i class="${escapeAttr(materialIcon(ref.kind))}"></i></span>`;

    return `
      <div class="material-item kind-${escapeAttr(ref.kind)} ${ref.localAsset ? 'local-asset' : ''}">
        ${thumbnail}
        <div class="material-meta">
          <div class="material-title">${escapeHtml(shortText(title, compact ? 44 : 90))}${ref.localAsset ? '<span class="trace-ref-status loaded">local asset</span>' : ''}${renderTraceRefStatus(ws, node, ref)}</div>
          <div class="material-subtitle">${escapeHtml(shortText(subtitle, compact ? 58 : 140))}</div>
          <div class="material-actions">
            ${renderMaterialPrimaryAction(ws, node, ref)}
            ${previewable && ref.kind !== 'image' ? `<button class="mini-action" data-action="open-material-preview" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" data-ref="${escapeAttr(materialRefIndex(ws, node, ref))}">Preview</button>` : ''}
            ${source ? `<a class="mini-action anchor" href="${escapeAttr(safeUrl(source) || source)}" target="_blank" rel="noopener noreferrer">${ref.localAsset ? 'Open asset' : 'Open source'}</a>` : ''}
            <button class="mini-action subtle" data-action="copy-material-ref" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" data-ref="${escapeAttr(materialRefIndex(ws, node, ref))}">Copy</button>
          </div>
        </div>
      </div>`;
  }

  async function openMaterialPreview(ws, node, ref) {
    if (!ws || !node || !ref) return;
    if (!['text', 'markdown'].includes(ref.kind)) return;
    const cacheKey = ref.localAsset ? `asset:${ref.localAsset.path}:${ref.localAsset.updatedAt}` : (ref.rawUrl || ref.href || ref.path);
    app.modal = { type: 'material-preview', wsId: ws.id, nodeId: node.id, refIndex: materialRefIndex(ws, node, ref), status: 'loading', content: '', truncated: false, error: '' };
    render();

    if (app.materialPreviewCache[cacheKey]) {
      Object.assign(app.modal, app.materialPreviewCache[cacheKey]);
      render();
      return;
    }

    try {
      let text = '';
      if (ref.localAsset) {
        text = ref.localAsset.content != null ? ref.localAsset.content : await ref.localAsset.blob.text();
      } else {
        if (!ref.rawUrl) throw new Error('No fetchable source URL.');
        text = await fetchText(ref.rawUrl);
      }
      const max = Number(app.settings.materialPreviewMaxChars || 120000);
      const payload = {
        status: 'loaded',
        content: text.length > max ? text.slice(0, max) : text,
        truncated: text.length > max,
        error: ''
      };
      app.materialPreviewCache[cacheKey] = payload;
      if (app.modal?.type === 'material-preview' && app.modal.wsId === ws.id && app.modal.nodeId === node.id && Number(app.modal.refIndex) === materialRefIndex(ws, node, ref)) {
        Object.assign(app.modal, payload);
        render();
      }
    } catch (error) {
      const payload = { status: 'failed', content: '', truncated: false, error: error.message };
      app.materialPreviewCache[cacheKey] = payload;
      if (app.modal?.type === 'material-preview') {
        Object.assign(app.modal, payload);
        render();
      }
    }
  }

  function renderMaterialLightbox(modal) {
    const ws = getWorkspace(modal.wsId);
    const node = ws?.nodeById.get(modal.nodeId);
    const ref = node ? extractMaterialRefs(ws, node)[Number(modal.refIndex || 0)] : null;
    if (!ws || !node || !ref) return '';
    const src = ref.localUrl || ref.rawUrl || ref.sourceUrl;
    return `
      <div class="modal-backdrop-custom focus-modal material-lightbox-modal" role="dialog" aria-modal="true">
        <div class="modal-panel lightbox-panel">
          <div class="modal-header-lite sticky-modal-head">
            <div>
              <p class="kicker">${ref.localAsset ? 'Local image asset' : 'Image attachment'}</p>
              <h2 class="modal-title-lite">${escapeHtml(ref.label || fileNameFromPath(ref.path || src))}</h2>
              <p class="text-secondary mb-0">${escapeHtml(ref.path || ref.href)}</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="lightbox-body">
            <img src="${escapeAttr(src)}" alt="${escapeAttr(ref.label || 'attachment image')}" loading="eager">
          </div>
          <div class="modal-footer-actions">
            ${src ? `<a class="tv-btn subtle" href="${escapeAttr(safeUrl(src) || src)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>${ref.localAsset ? 'Open asset' : 'Open source'}</a>` : ''}
            <button class="tv-btn subtle" data-action="close-modal">Close</button>
          </div>
        </div>
      </div>`;
  }

  async function saveWorkspace(wsId) {
    const ws = getWorkspace(wsId);
    if (!ws) return toast('No workspace selected.', 'warn');
    app.modal = defaultExportModal(ws.id);
    render();
  }



  // Preserve all assets, but index only real Tiinex traces.
  // .trace.md conflicts use dimension slots, not full filename/slug.

  function looksLikeTiinexTraceContent(content) {
    const text = String(content || '');
    if (/^#\s+Continuity Context\s*$/m.test(text)) return true;
    if (/^#\s+Continuity Integrity\s*$/m.test(text) && /^\s*Current Schema\s*:/mi.test(text)) return true;
    return false;
  }

  function traceDimensionFromPath(path) {
    const name = fileNameFromPath(path || '');
    const match = name.match(/^(\d{3}(?:-\d+)*)/);
    return match ? match[1] : '';
  }

  function traceDimensionSlot(path) {
    const dim = traceDimensionFromPath(path);
    if (!dim) return '';
    return `${dirname(path || '')}::${dim}`;
  }

  function replaceDimensionPrefix(path, oldDim, newDim) {
    const dir = dirname(path || '');
    const name = fileNameFromPath(path || '');
    if (!oldDim || !newDim || !name.startsWith(oldDim)) return path;
    return normalizeAssetPath(joinPath(dir, newDim + name.slice(oldDim.length)));
  }

  function siblingBaseAndIndex(dim) {
    const parts = String(dim || '').split('-').filter(Boolean);
    const index = Number(parts.pop() || 0);
    return { parent: parts.join('-'), index };
  }

  function formatSiblingDimension(parent, index) {
    return parent ? `${parent}-${index}` : String(index).padStart(3, '0');
  }

  function occupiedSiblingIndices(ws, dir, parentDim) {
    const indices = new Set();
    const parentPrefix = parentDim ? `${parentDim}-` : '';
    const sources = [
      ...Array.from(ws.files?.keys?.() || []),
      ...Array.from(ws.assets?.keys?.() || [])
    ];
    for (const path of sources) {
      if (dirname(path) !== dir) continue;
      if (!/\.trace\.md$/i.test(path)) continue;
      const dim = traceDimensionFromPath(path);
      if (!dim) continue;
      if (parentDim) {
        if (!dim.startsWith(parentPrefix)) continue;
        if (dim.slice(parentPrefix.length).includes('-')) continue;
        indices.add(Number(dim.slice(parentPrefix.length)));
      } else {
        if (dim.includes('-')) continue;
        indices.add(Number(dim));
      }
    }
    return indices;
  }

  function nextSiblingDimension(ws, conflictingTracePath) {
    const dir = dirname(conflictingTracePath || '');
    const dim = traceDimensionFromPath(conflictingTracePath);
    const { parent, index } = siblingBaseAndIndex(dim);
    const occupied = occupiedSiblingIndices(ws, dir, parent);
    let next = Math.max(index + 1, 1);
    while (occupied.has(next)) next += 1;
    return formatSiblingDimension(parent, next);
  }

  function pathStartsWithDimension(path, dim) {
    return Boolean(dim && fileNameFromPath(path || '').startsWith(dim));
  }

  function importEntryKind(path, content) {
    return shouldIndexAsTrace(path, content) ? 'trace' : 'asset';
  }

  async function fileToImportEntries(file) {
    const entries = [];
    const relativePath = normalizeAssetPath(intakeRelativePath(file));

    if (/\.zip$/i.test(file.name || relativePath)) {
      if (!window.JSZip) throw new Error('JSZip CDN was not available.');
      const zip = await window.JSZip.loadAsync(file);
      const zipEntries = Object.values(zip.files).filter((entry) => !entry.dir);
      for (const entry of zipEntries) {
        const path = normalizeAssetPath(entry.name);
        const blob = await entry.async('blob');
        let content = null;
        if (/\.(trace\.md|md|txt)$/i.test(path)) content = await entry.async('string');
        entries.push({
          path,
          blob,
          content,
          type: blob.type || '',
          size: blob.size || 0,
          source: 'zip',
          kind: importEntryKind(path, content)
        });
      }
      return entries;
    }

    let content = null;
    if (/\.(trace\.md|md|txt)$/i.test(relativePath)) content = await file.text();
    entries.push({
      path: relativePath,
      blob: file,
      content,
      type: file.type || '',
      size: file.size || 0,
      source: 'upload',
      kind: importEntryKind(relativePath, content)
    });
    return entries;
  }

  async function collectImportEntries(fileList) {
    const files = Array.from(fileList || []);
    const entries = [];
    for (const file of files) {
      try {
        entries.push(...await fileToImportEntries(file));
      } catch (error) {
        toast(`Could not read ${file.name || 'file'}: ${error.message}`, 'warn');
      }
    }
    return entries.filter((entry) => entry.path);
  }

  function importConflictSummary(conflicts) {
    const trace = conflicts.filter((c) => c.type === 'trace-slot').length;
    const path = conflicts.filter((c) => c.type === 'path').length;
    const bits = [];
    if (trace) bits.push(`${trace} lineage slot conflict${trace === 1 ? '' : 's'}`);
    if (path) bits.push(`${path} file path conflict${path === 1 ? '' : 's'}`);
    return bits.join(' · ') || 'conflicts';
  }

  function renderImportConflictModal(modal) {
    const pending = app.pendingImport;
    const ws = getWorkspace(modal.wsId || pending?.wsId);
    if (!pending || !ws) return '';

    const examples = pending.conflicts.slice(0, 5).map((conflict) => {
      const label = conflict.type === 'trace-slot' ? 'same lineage slot' : 'same file path';
      return `<li><strong>${escapeHtml(label)}</strong><br><span>${escapeHtml(conflict.incoming)} → ${escapeHtml(conflict.existing)}</span></li>`;
    }).join('');

    return `
      <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
        <div class="modal-panel import-conflict-panel">
          <div class="modal-header-lite">
            <div>
              <p class="kicker">Merge conflict</p>
              <h2 class="modal-title-lite">Incoming files overlap this workspace</h2>
              <p class="text-secondary mb-0">${escapeHtml(importConflictSummary(pending.conflicts))}</p>
            </div>
            <button class="tv-btn small subtle" data-action="cancel-import"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div class="policy-callout">
            <strong>.trace.md conflicts use lineage slot numbers.</strong><br>
            Slugs are ignored for trace conflict detection, so <code>001-old.trace.md</code> conflicts with <code>001-new.trace.md</code>.
          </div>

          <ul class="conflict-list">${examples}</ul>
          ${pending.conflicts.length > 5 ? `<p class="text-secondary small">+ ${pending.conflicts.length - 5} more conflict(s)</p>` : ''}

          <div class="modal-footer-actions">
            <button class="tv-btn primary" data-action="import-as-sibling"><i class="fa-solid fa-code-branch"></i>Import as sibling</button>
            <button class="tv-btn subtle" data-action="replace-import"><i class="fa-solid fa-arrows-rotate"></i>Replace existing</button>
            <button class="tv-btn subtle" data-action="cancel-import">Cancel import</button>
          </div>
        </div>
      </div>`;
  }

  async function handleImportConflictAction(action) {
    const pending = app.pendingImport;
    const ws = getWorkspace(pending?.wsId);
    if (!pending || !ws) {
      app.pendingImport = null;
      app.modal = null;
      render();
      return;
    }

    if (action === 'cancel-import') {
      app.pendingImport = null;
      app.modal = null;
      render();
      return;
    }

    const pathMap = action === 'import-as-sibling'
      ? buildSiblingPathMap(ws, pending.entries, pending.conflicts)
      : new Map();

    app.pendingImport = null;
    app.modal = null;
    await applyImportEntries(ws, pending.entries, { pathMap });
    setRouteState('replace');
  }




  function ensureWorkspaceSources(ws) {
    if (!ws.sources || !(ws.sources instanceof Map)) ws.sources = new Map();
    if (!Array.isArray(ws.sourceOrder)) ws.sourceOrder = [];
    return ws.sources;
  }

  function sourceSafe(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 140);
  }

  function makeSourceId(kind, key) {
    return `${kind}:${sourceSafe(key || kind).toLowerCase()}`;
  }

  function registerWorkspaceSource(ws, source) {
    ensureWorkspaceSources(ws);
    const id = source.id || makeSourceId(source.kind || 'local', source.key || source.repo || source.label);
    if (!ws.sources.has(id)) {
      ws.sources.set(id, Object.assign({ id, kind: 'local', label: id, origin: '', repo: '', ref: '', createdAt: new Date().toISOString() }, source, { id }));
      ws.sourceOrder.push(id);
    } else {
      Object.assign(ws.sources.get(id), source, { id });
    }
    return ws.sources.get(id);
  }

  function localSource(ws) {
    return registerWorkspaceSource(ws, { id: 'local', kind: 'local', label: 'Local', origin: 'Local uploads, folders, zips, and pasted traces' });
  }

  function draftSource(ws) {
    return registerWorkspaceSource(ws, { id: 'draft', kind: 'draft', label: 'Drafts', origin: 'Generated inside this workspace' });
  }

  function sourceFromFileMeta(ws, file = {}) {
    if (file.isGenerated) return draftSource(ws);
    if (file.sourceId) return registerWorkspaceSource(ws, {
      id: file.sourceId,
      kind: file.sourceKind || 'local',
      label: file.sourceLabel || file.sourceId,
      origin: file.sourceOrigin || file.rawUrl || file.browseUrl || '',
      repo: file.repo || '',
      ref: file.ref || ''
    });
    if (file.repo) {
      const ref = file.ref || ws.ref || '';
      return registerWorkspaceSource(ws, {
        id: makeSourceId('github', `${file.repo}@${ref}`),
        kind: 'github',
        label: `${file.repo}${ref ? '@' + ref : ''}`,
        origin: file.browseUrl || file.rawUrl || '',
        repo: file.repo,
        ref
      });
    }
    if (file.rawUrl || file.browseUrl) {
      let label = 'URL source';
      try { label = new URL(file.browseUrl || file.rawUrl).hostname; } catch (_) {}
      return registerWorkspaceSource(ws, {
        id: makeSourceId('url', file.rawUrl || file.browseUrl || label),
        kind: 'url',
        label,
        origin: file.browseUrl || file.rawUrl || ''
      });
    }
    return localSource(ws);
  }

  function sourceById(ws, sourceId) {
    ensureWorkspaceSources(ws);
    return ws.sources.get(sourceId || '') || null;
  }

  function sourceShortLabel(ws, sourceId) {
    const source = sourceById(ws, sourceId);
    if (!source) return '';
    if (source.kind === 'github') return source.repo || source.label;
    return source.label || source.kind;
  }

  function sourceBadgeClass(source) {
    if (!source) return 'source-unknown';
    if (source.kind === 'github') return 'source-github';
    if (source.kind === 'local') return 'source-local';
    if (source.kind === 'draft') return 'source-draft';
    return 'source-url';
  }

  function renderSourceBadge(ws, nodeOrFile) {
    const source = sourceById(ws, nodeOrFile?.sourceId);
    if (!source) return '';
    const icon = source.kind === 'github' ? 'fa-brands fa-github'
      : source.kind === 'local' ? 'fa-solid fa-laptop-file'
      : source.kind === 'draft' ? 'fa-solid fa-pen-nib'
      : 'fa-solid fa-link';
    return `<span class="badge-soft source-chip ${sourceBadgeClass(source)}" title="${escapeAttr(source.origin || source.label || source.id)}"><i class="${icon}"></i>${escapeHtml(shortText(sourceShortLabel(ws, source.id), 34))}</span>`;
  }

  function sourceCount(ws) {
    ensureWorkspaceSources(ws);
    return Array.from(ws.sources.values()).filter((s) => s.kind !== 'draft' || ws.generated?.length).length;
  }

  function sourceFileKey(sourceId, path, isGenerated = false) {
    const clean = normalizeAssetPath(path);
    return (isGenerated || !sourceId) ? clean : `${sourceId}::${clean}`;
  }

  function addFileToWorkspace(ws, file) {
    ensureWorkspaceSources(ws);
    const path = normalizeAssetPath(file.path || fileNameFromPath(file.name || file.rawUrl || 'artifact.trace.md'));
    if (file.repo && !ws.repo) ws.repo = file.repo;
    if (file.ref && !ws.ref) ws.ref = file.ref;
    const source = sourceFromFileMeta(ws, file);
    const sourceId = source?.id || '';
    const content = normalizeNewlines(file.content || '');
    const key = sourceFileKey(sourceId, path, Boolean(file.isGenerated));
    ws.files.set(key, {
      workspaceId: ws.id,
      path,
      sourceId,
      sourceLabel: source?.label || '',
      storageKey: key,
      name: fileNameFromPath(path),
      content,
      rawUrl: file.rawUrl || '',
      browseUrl: file.browseUrl || '',
      repo: file.repo || '',
      ref: file.ref || '',
      isGenerated: Boolean(file.isGenerated),
      generatedAt: file.generatedAt || ''
    });
    if (file.isGenerated || file.preserveAsAsset) {
      storeWorkspaceAsset(ws, path, content, { type: 'text/markdown;charset=utf-8', source: file.isGenerated ? 'generated' : 'trace', sourceId });
    }
    scheduleLocalStateSaveAfterWorkspaceMutation();
  }


  // --- Trace parsing and artifact indexing ---

  function parseTraceFile(file) {
    const text = normalizeNewlines(file.content);
    const topHeading = (text.match(/^#\s+(.+)\s*$/m) || [null, 'Untitled artifact'])[1].trim();
    const hasModernEnvelope = /^# Continuity Context\s*$/m.test(text);
    const envelopeText = hasModernEnvelope ? text.slice(0, text.indexOf('\n---') >= 0 ? text.indexOf('\n---') : Math.min(text.length, 2400)) : '';
    const bodyStart = text.indexOf('\n---') >= 0 ? text.indexOf('\n---') + 4 : 0;
    const integrityIndex = text.search(/^# Continuity Integrity\s*$/m);
    const body = stripTrailingBodySeparator(text.slice(bodyStart, integrityIndex >= 0 ? integrityIndex : text.length));
    const bodyTitle = (body.match(/^#\s+(.+)\s*$/m) || [null, topHeading])[1].trim();
    const fields = extractEnvelopeFields(envelopeText);
    const currentSchema = fields.current['Current Schema'] || fields.current['Schema'] || '';
    const summary = fields.current['Summary'] || inferSummary(body) || topHeading;
    const parentTraceLink = parseMarkdownLink(fields.parent.Trace || '');
    const parentHref = parentTraceLink.href || parentTraceLink.text;
    const parentResolvedPath = parentHref ? joinPath(dirname(file.path), parentHref) : '';
    const integrity = parseIntegrity(text);
    return {
      id: `${file.workspaceId}:${file.sourceId || ''}:${file.path}`,
      path: file.path,
      sourceId: file.sourceId || '',
      sourceLabel: file.sourceLabel || '',
      storageKey: file.storageKey || sourceFileKey(file.sourceId, file.path, file.isGenerated),
      file,
      isGenerated: Boolean(file.isGenerated),
      title: bodyTitle || summary || topHeading,
      topHeading,
      bodyTitle,
      summary,
      why: fields.current.Why || '',
      authors: fields.current.Authors || '',
      createdAt: fields.current['Created At'] || '',
      currentSchema,
      currentSchemaText: stripMarkdownInline(currentSchema),
      parentSchema: fields.parent['Parent Schema'] || '',
      parentTrace: fields.parent.Trace || '',
      parentHref,
      parentResolvedPath,
      parentOrigin: fields.parentOrigin,
      parentOriginBrowse: fields.parentOrigin['browse + git'] || '',
      hasModernEnvelope,
      body,
      integrity,
      rawMarkdown: text,
      browseUrl: file.browseUrl || '',
      rawUrl: file.rawUrl || '',
      repo: file.repo || '',
      ref: file.ref || '',
      envelopeReason: hasModernEnvelope ? '' : 'No # Continuity Context envelope found.'
    };
  }

  function sourcePathLookupKey(sourceId, path) {
    return sourceFileKey(sourceId, canonicalWorkspacePath(path), false);
  }

  function sameWorkspacePathLookup(ws, path, sourceId = '') {
    if (!ws || !path) return null;
    const canonical = canonicalWorkspacePath(path);
    if (sourceId) {
      return ws.nodeByPath?.get(sourcePathLookupKey(sourceId, canonical))
        || ws.nodeByPath?.get(sourceFileKey(sourceId, path, false))
        || null;
    }
    return ws.nodeByPath?.get(canonical)
      || ws.nodeByPath?.get(path)
      || Array.from(ws.nodeById?.values?.() || []).find((node) => canonicalWorkspacePath(node.path) === canonical)
      || null;
  }

  function ensureWorkspaceAssets(ws) {
    if (!ws) return null;
    if (!ws.assets || !(ws.assets instanceof Map)) ws.assets = new Map();
    if (!ws.assetUrls || !(ws.assetUrls instanceof Map)) ws.assetUrls = new Map();
    ensureWorkspaceSources(ws);
    return ws.assets;
  }

  function storeWorkspaceAsset(ws, path, blobOrContent, meta = {}) {
    const assets = ensureWorkspaceAssets(ws);
    if (!assets) return null;
    const sourceId = meta.sourceId || (meta.source === 'generated' ? draftSource(ws).id : localSource(ws).id);
    const assetPath = normalizeAssetPath(path || meta.name || 'asset');
    if (!assetPath) return null;
    let blob = null;
    let content = null;
    if (blobOrContent instanceof Blob) blob = blobOrContent;
    else if (typeof blobOrContent === 'string') content = blobOrContent;
    else if (blobOrContent != null) blob = new Blob([blobOrContent], { type: meta.type || 'application/octet-stream' });
    const key = sourceFileKey(sourceId, assetPath, false);
    const asset = {
      key,
      path: assetPath,
      sourceId,
      sourceLabel: sourceShortLabel(ws, sourceId),
      name: fileNameFromPath(assetPath),
      blob,
      content,
      type: meta.type || blob?.type || '',
      size: meta.size || blob?.size || (content ? content.length : 0),
      source: meta.source || 'local',
      preserved: true,
      updatedAt: meta.updatedAt || new Date().toISOString()
    };
    assets.set(key, asset);
    if (ws.assetUrls?.has(key)) {
      try { URL.revokeObjectURL(ws.assetUrls.get(key)); } catch (_) {}
      ws.assetUrls.delete(key);
    }
    scheduleLocalStateSaveAfterWorkspaceMutation();
    return asset;
  }


  function assetObjectUrl(ws, asset) {
    if (!ws || !asset) return '';
    ensureWorkspaceAssets(ws);
    const key = asset.key || sourceFileKey(asset.sourceId, asset.path, false);
    if (ws.assetUrls.has(key)) return ws.assetUrls.get(key);
    const blob = asset.blob || new Blob([asset.content || ''], { type: asset.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    ws.assetUrls.set(key, url);
    return url;
  }

  function buildSiblingPathMap(ws, entries, conflicts) {
    const map = new Map();
    const traceConflicts = conflicts.filter((c) => c.type === 'trace-slot');
    const localId = localSource(ws).id;
    for (const conflict of traceConflicts) {
      const oldDim = traceDimensionFromPath(conflict.incoming);
      const newDim = nextSiblingDimension(ws, conflict.existing || conflict.incoming);
      if (!oldDim || !newDim || oldDim === newDim) continue;
      for (const entry of entries) {
        if ((entry.sourceId || localId) !== (conflict.sourceId || localId)) continue;
        if (dirname(entry.path) !== dirname(conflict.incoming)) continue;
        if (pathStartsWithDimension(entry.path, oldDim)) map.set(entry.path, replaceDimensionPrefix(entry.path, oldDim, newDim));
      }
    }
    for (const entry of entries) {
      const sourceId = entry.sourceId || localId;
      const current = map.get(entry.path) || entry.path;
      if (!workspaceHasPathInSource(ws, sourceId, current)) continue;
      if (entry.kind === 'trace') continue;
      const dir = dirname(current);
      const name = fileNameFromPath(current);
      const dot = name.lastIndexOf('.');
      const stem = dot >= 0 ? name.slice(0, dot) : name;
      const ext = dot >= 0 ? name.slice(dot) : '';
      let n = 2;
      let candidate = normalizeAssetPath(joinPath(dir, `${stem}-sibling-${n}${ext}`));
      while (workspaceHasPathInSource(ws, sourceId, candidate)) {
        n += 1;
        candidate = normalizeAssetPath(joinPath(dir, `${stem}-sibling-${n}${ext}`));
      }
      map.set(entry.path, candidate);
    }
    return map;
  }

  async function applyImportEntries(ws, entries, options = {}) {
    const pathMap = options.pathMap || new Map();
    const localId = localSource(ws).id;
    let traceCount = 0;
    let assetCount = 0;
    for (const entry of entries) {
      const sourceId = entry.sourceId || localId;
      const targetPath = normalizeAssetPath(pathMap.get(entry.path) || entry.path);
      storeWorkspaceAsset(ws, targetPath, entry.blob || entry.content || '', {
        type: entry.type || '',
        size: entry.size || 0,
        source: entry.source || 'upload',
        sourceId
      });
      assetCount += 1;
      if (shouldIndexAsTrace(targetPath, entry.content)) {
        const content = entry.content != null ? entry.content : (entry.blob ? await entry.blob.text() : '');
        addFileToWorkspace(ws, { path: targetPath, content, preserveAsAsset: true, sourceId, sourceKind: 'local', sourceLabel: 'Local' });
        traceCount += 1;
      }
    }
    computeWorkspaceIndex(ws);
    if (!ws.repo) ws.policy = { status: 'local', kind: '', text: '', url: '', note: 'Local or uploaded workspace. No remote lineage policy lookup available.' };
    ws.logs.push(`Imported ${traceCount} Tiinex trace file(s) and preserved ${assetCount} asset file(s) into Local source.`);
    if (!traceCount) toast('No Tiinex trace files were indexed. Assets were preserved under Local.', 'warn');
    render();
  }


  bindWorkspaceDropDelegation();




  function openSourceModal(appendWsId) {
    const append = appendWsId ? getWorkspace(appendWsId) : null;
    app.modal = {
      type: 'source',
      appendWsId: append ? append.id : '',
      label: append ? append.label : '',
      urls: '',
      repo: '',
      ref: '',
      root: '.topics',
      addMode: '',
      openSections: {}
    };
    render();
  }

  function renderAddChoiceCard(icon, title, body, actionAttrs, extraClass = '') {
    return `
      <button class="add-choice-card ${extraClass}" type="button" ${actionAttrs}>
        <span class="add-choice-icon">${icon}</span>
        <span class="add-choice-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(body)}</small></span>
        <i class="fa-solid fa-chevron-right"></i>
      </button>`;
  }


  // --- Source/import modal rendering ---

  function renderSourceModal(modal) {
    const append = modal.appendWsId ? getWorkspace(modal.appendWsId) : null;
    if (!append) {
      return `
        <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
          <div class="modal-panel source-modal-panel create-workspace-modal">
            <div class="modal-header-lite source-modal-head">
              <div>
                <p class="kicker">Create</p>
                <h2 class="modal-title-lite">Create workspace</h2>
                <p class="text-secondary mb-0">Start with an empty workspace. Add material afterwards from inside the workspace.</p>
              </div>
              <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="create-workspace-body">
              <label>
                <span>Local workspace name <em>required</em></span>
                <input class="form-control" id="source-label" value="${escapeAttr(modal.label || '')}" placeholder="Name this workspace">
              </label>
              <p class="create-workspace-note">Name the local workspace first. Sources, files, folders, GitHub repo roots, and future root nodes are added after the workspace exists.</p>
            </div>
            <div class="modal-footer-actions">
              <button class="tv-btn primary" data-action="create-workspace"><i class="fa-solid fa-plus"></i>Create</button>
              <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
            </div>
          </div>
        </div>`;
    }

    const mode = modal.addMode || '';
    const title = `Add to ${escapeHtml(workspaceDisplayLabel(append))}`;

    if (!mode) {
      return `
        <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
          <div class="modal-panel source-modal-panel add-flow-modal">
            <div class="modal-header-lite source-modal-head">
              <div>
                <p class="kicker">Add</p>
                <h2 class="modal-title-lite">${title}</h2>
                <p class="text-secondary mb-0">Choose what you want to add. Manual upload opens the file picker directly.</p>
              </div>
              <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="add-choice-grid">
              <label class="add-choice-card manual-choice" for="source-files">
                <span class="add-choice-icon"><i class="fa-regular fa-file-lines"></i></span>
                <span class="add-choice-copy"><strong>Manual files</strong><small>Pick one or many trace/markdown/zip files.</small></span>
                <i class="fa-solid fa-arrow-up-from-bracket"></i>
                <input class="visually-hidden-file" id="source-files" type="file" multiple accept=".md,.trace.md,.zip">
              </label>

              <label class="add-choice-card manual-choice" for="source-folder">
                <span class="add-choice-icon"><i class="fa-regular fa-folder-open"></i></span>
                <span class="add-choice-copy"><strong>Manual folder</strong><small>Pick a folder when the browser supports it.</small></span>
                <i class="fa-solid fa-folder-plus"></i>
                <input class="visually-hidden-file" id="source-folder" type="file" multiple webkitdirectory directory>
              </label>

              ${renderAddChoiceCard('<i class="fa-brands fa-github"></i>', 'Git source', 'Discover .trace.md files from public GitHub roots.', 'data-action="choose-add-mode" data-mode="git"')}
              ${renderAddChoiceCard('<i class="fa-solid fa-link"></i>', 'Explicit URLs', 'Paste raw/blob trace URLs or manifests.', 'data-action="choose-add-mode" data-mode="urls"')}
              ${renderAddChoiceCard('<i class="fa-solid fa-hand-pointer"></i>', 'Drag and drop', 'Turn the dialog into a focused drop target for this workspace.', 'data-action="choose-add-mode" data-mode="drop"', 'desktop-only-choice')}
            </div>

            <div class="modal-footer-actions">
              <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
            </div>
          </div>
        </div>`;
    }

    if (mode === 'git') {
      return `
        <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
          <div class="modal-panel source-modal-panel add-flow-modal">
            <div class="modal-header-lite source-modal-head">
              <div>
                <p class="kicker">Git source</p>
                <h2 class="modal-title-lite">${title}</h2>
                <p class="text-secondary mb-0">Discover public GitHub repo roots and import matching <code>.trace.md</code> files.</p>
              </div>
              <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="add-source-form">
              <label>
                <span>Repo URL or owner/name</span>
                <input class="form-control" id="source-repo" value="${escapeAttr(modal.repo || '')}" placeholder="Tiinex/docs or https://github.com/Tiinex/docs/tree/master/.topics">
              </label>
              <label>
                <span>Ref <em>optional</em></span>
                <input class="form-control" id="source-ref" value="${escapeAttr(modal.ref || '')}" placeholder="default branch">
              </label>
              <label>
                <span>Root paths</span>
                <textarea class="form-control source-root-box" id="source-root" placeholder=".topics&#10;.github/agents/.topics">${escapeHtml(modal.root || '.topics')}</textarea>
              </label>
            </div>

            <div class="modal-footer-actions">
              <button class="tv-btn subtle" data-action="choose-add-mode" data-mode=""><i class="fa-solid fa-arrow-left"></i>Back</button>
              <button class="tv-btn primary" data-action="create-workspace"><i class="fa-brands fa-github"></i>Add Git source</button>
            </div>
          </div>
        </div>`;
    }

    if (mode === 'urls') {
      return `
        <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
          <div class="modal-panel source-modal-panel add-flow-modal">
            <div class="modal-header-lite source-modal-head">
              <div>
                <p class="kicker">Explicit URLs</p>
                <h2 class="modal-title-lite">${title}</h2>
                <p class="text-secondary mb-0">Paste trace URLs or manifest URLs, one per line.</p>
              </div>
              <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="add-source-form">
              <label>
                <span>URLs</span>
                <textarea class="form-control source-url-box" id="source-urls" placeholder="https://github.com/Tiinex/docs/blob/master/.topics/.../001.trace.md&#10;https://raw.githubusercontent.com/Tiinex/docs/master/.topics/.../001.trace.md">${escapeHtml(modal.urls || '')}</textarea>
              </label>
              <p>No GitHub API. Blob links are converted to raw links before fetch.</p>
            </div>

            <div class="modal-footer-actions">
              <button class="tv-btn subtle" data-action="choose-add-mode" data-mode=""><i class="fa-solid fa-arrow-left"></i>Back</button>
              <button class="tv-btn primary" data-action="create-workspace"><i class="fa-solid fa-link"></i>Add URLs</button>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="modal-backdrop-custom focus-modal add-drop-backdrop" role="dialog" aria-modal="true">
        <div class="modal-panel source-modal-panel add-flow-modal drop-mode-modal">
          <div class="modal-header-lite source-modal-head">
            <div>
              <p class="kicker">Drag and drop</p>
              <h2 class="modal-title-lite">${title}</h2>
              <p class="text-secondary mb-0">Drop anywhere in this highlighted area. Material is staged for this workspace only.</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div class="source-dropzone add-full-dropzone" tabindex="0" aria-label="Drop source material here">
            <div class="source-drop-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <div>
              <strong>Drop folder, trace files, markdown, or zip</strong>
              <p>Drag and drop is intentionally scoped to this open dialog and workspace.</p>
              ${typeof sourceIntakeSummary === 'function' ? sourceIntakeSummary(modal) : ''}
            </div>
          </div>

          <div class="modal-footer-actions">
            <button class="tv-btn subtle" data-action="choose-add-mode" data-mode=""><i class="fa-solid fa-arrow-left"></i>Back</button>
            <label class="tv-btn subtle file-label-inline" for="source-files"><i class="fa-regular fa-file-lines"></i>Choose files<input class="visually-hidden-file" id="source-files" type="file" multiple accept=".md,.trace.md,.zip"></label>
            <button class="tv-btn primary" data-action="create-workspace"><i class="fa-solid fa-file-circle-plus"></i>Add staged material</button>
          </div>
        </div>
      </div>`;
  }


  // --- Workspace indexing and relationship graph ---

  function computeWorkspaceIndex(ws) {
    ensureWorkspaceSources(ws);
    const previousSelected = ws.selectedNodeId;
    const previousWindows = ws.lineageWindows || {};
    const previousIntegrity = ws.integrityCache || {};
    const previousParentFetches = ws.parentFetches || {};
    ws.nodes = Array.from(ws.files.values()).map((file) => parseTraceFile(file));
    ws.nodeById = new Map(ws.nodes.map((n) => [n.id, n]));
    ws.nodeByPath = new Map();

    ws.nodes.forEach((node) => {
      const canonical = canonicalWorkspacePath(node.path);
      ws.nodeByPath.set(sourcePathLookupKey(node.sourceId, canonical), node);
      ws.nodeByPath.set(sourceFileKey(node.sourceId, node.path, false), node);
      if (!ws.nodeByPath.has(canonical)) ws.nodeByPath.set(canonical, node);
      if (!ws.nodeByPath.has(node.path)) ws.nodeByPath.set(node.path, node);
    });

    ws.nodes.forEach((node) => {
      node.children = [];
      node.parentNode = null;
      node.integrityStatus = previousIntegrity[node.storageKey || node.path]?.status || previousIntegrity[node.path]?.status || (node.integrity ? 'pending' : 'missing');
      node.integrityStatusLabel = previousIntegrity[node.storageKey || node.path]?.label || previousIntegrity[node.path]?.label || '';
    });

    ws.nodes.forEach((node) => {
      if (!node.parentResolvedPath) return;
      const parent = sameWorkspacePathLookup(ws, node.parentResolvedPath, node.sourceId)
        || sameWorkspacePathLookup(ws, node.parentResolvedPath, '');

      // A flat manual upload can collapse ../001.trace.md to 001.trace.md,
      // which may equal the current file path. That is not proof of a cycle;
      // it means the parent is not available in this workspace context.
      if (parent && parent !== node) {
        node.parentNode = parent;
        parent.children.push(node);
      }
    });

    for (const node of ws.nodes || []) {
      if (!node.parentHref || node.parentNode) continue;
      const parent = resolveParentNode(ws, node);
      if (parent && parent !== node) {
        node.parentNode = parent;
        parent.children = parent.children || [];
        if (!parent.children.includes(node)) parent.children.push(node);
      }
    }

    ws.leaves = ws.nodes.filter((node) => !node.children.length);
    ws.leaves.sort(compareNodesDesc);
    ws.nodes.sort(compareNodesDesc);
    ws.selectedNodeId = previousSelected && ws.nodeById.get(previousSelected) ? previousSelected : null;
    ws.filterSchema = ws.filterSchema || 'all';
    ws.discoveryFilterSchema = ws.discoveryFilterSchema || ws.filterSchema || 'all';
    ws.layoutMode = ws.layoutMode || 'expanded';
    ws.lineageWindows = previousWindows;
    ws.integrityCache = previousIntegrity;
    ws.parentFetches = previousParentFetches;
    if (typeof scheduleIntegrityVerification === 'function') scheduleIntegrityVerification(ws);
    if (typeof resolvePendingSelectedRoutes === 'function') resolvePendingSelectedRoutes();
  }




  function workspaceDropTargetFromEvent(event) {
    const target = event?.target?.closest?.('.workspace-drop-target');
    if (target) return target;
    const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
    return path.find((item) => item?.classList?.contains?.('workspace-drop-target')) || null;
  }

  function bindWorkspaceDropDelegation() {
    if (app.workspaceDropDelegationBound) return;
    app.workspaceDropDelegationBound = true;

    document.addEventListener('dragenter', (event) => {
      if (app.modal?.type === 'source') return;
      const zone = workspaceDropTargetFromEvent(event);
      if (!zone) return;
      event.preventDefault();
      zone.classList.add('drag-over');
    });

    document.addEventListener('dragover', (event) => {
      if (app.modal?.type === 'source') return;
      const zone = workspaceDropTargetFromEvent(event);
      if (!zone) return;
      event.preventDefault();
      zone.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (event) => {
      if (app.modal?.type === 'source') return;
      const zone = workspaceDropTargetFromEvent(event);
      if (!zone) return;
      if (!zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
    });

    document.addEventListener('drop', async (event) => {
      if (app.modal?.type === 'source') return;
      const zone = workspaceDropTargetFromEvent(event);
      if (!zone) return;
      const ws = zone.dataset.ws ? getWorkspace(zone.dataset.ws) : null;
      await handleWorkspaceDrop(event, ws, zone);
    });
  }

  function canRemoveNodeForNow(ws, node) {
    if (!ws || !node) return false;
    const file = node.file || ws.files?.get?.(node.storageKey);
    return Boolean(node.isGenerated || node.sourceId === 'local' || file?.sourceId === 'local' || file?.isGenerated);
  }



  async function handleSourceModalDrop(event) {
    if (app.modal?.type !== 'source' || app.modal.addMode !== 'drop') return false;
    const zone = event.target?.closest?.('.add-drop-backdrop, .drop-mode-modal, .add-full-dropzone');
    if (!zone) return false;
    event.preventDefault();
    event.stopPropagation();

    const visual = document.querySelector('.add-full-dropzone');
    visual?.classList?.remove?.('drag-over');

    const files = await filesFromDataTransfer(event.dataTransfer);
    const count = addIntakeFiles(files, 'drop');
    render();
    if (!count) toast('Drop did not contain supported .trace.md, .md, or .zip files.', 'warn');
    return true;
  }









  function cleanViewerUrl() {
    return `${location.pathname}${location.search}`;
  }

  function replaceWithCleanViewerUrl() {
    const next = cleanViewerUrl();
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (current !== next) history.replaceState({ v: 'empty', sources: [] }, '', next);
  }



  // Optional markdown-based shell identity. Default is intentionally symbol-only.
  app.viewerIdentity = Object.assign({
    label: '',
    icon: '',
    home: 'https://github.com/Tiinex',
    configUrl: '',
    noWorkspaceSubtitle: 'Everything starts from somewhere.',
    noWorkspaceSubtitles: [
      'Every handoff starts somewhere.',
      'Start where the last thread ends.',
      'Leave enough for the next mind.',
      'A thread is waiting.',
      'Nothing starts from nothing.'
    ],
    noWorkspaceSubtitleCursor: 0,
    noWorkspaceSubtitleCurrent: '',
    customCss: '',
    cssUrl: '',
    loaded: false,
    error: ''
  }, app.viewerIdentity || {});


  function normalizeViewerConfigUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
      const item = typeof convertSourceUrl === 'function' ? convertSourceUrl(value) : null;
      return item?.rawUrl || value;
    }
    try {
      return new URL(value, location.href).toString();
    } catch (_) {
      return value;
    }
  }

  function markdownConfigValue(value, baseUrl) {
    const parsed = typeof parseMarkdownLink === 'function' ? parseMarkdownLink(value || '') : { href: '', text: value || '' };
    const raw = parsed.href || parsed.text || value || '';
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
      const item = typeof convertSourceUrl === 'function' ? convertSourceUrl(raw) : null;
      return item?.rawUrl || raw;
    }
    if (/^(data:|blob:)/i.test(raw)) return '';
    try {
      return new URL(raw, baseUrl || location.href).toString();
    } catch (_) {
      return raw;
    }
  }

  function extractViewerCustomCss(markdown) {
    const text = normalizeNewlines(markdown || '');
    const headingMatch = text.match(/^#{1,3}\s+Custom CSS\s*$/mi);
    if (!headingMatch) return '';
    const afterHeading = text.slice(headingMatch.index + headingMatch[0].length);
    const fence = afterHeading.match(/```(?:css)?\s*\n([\s\S]*?)\n```/i);
    return fence ? fence[1].trim() : '';
  }

  async function fetchViewerCss(url) {
    if (!url) return '';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    return await response.text();
  }

  function applyViewerCustomCss(cssText) {
    let style = document.getElementById('viewer-config-custom-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'viewer-config-custom-css';
      document.head.appendChild(style);
    }
    style.textContent = cssText || '';

    let guard = document.getElementById('tiinex-origin-footer-guard');
    if (!guard) {
      guard = document.createElement('style');
      guard.id = 'tiinex-origin-footer-guard';
      document.head.appendChild(guard);
    }
    guard.textContent = `
      .app-footer {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      .app-footer a[href*="github.com/Tiinex"] {
        display: inline !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
    `;
  }





  function cleanConfigListValue(value) {
    return stripMarkdownInline(String(value || '')
      .replace(/^["']|["']$/g, '')
      .trim());
  }


  function extractConfigListSection(markdown, headingNames) {
    const lines = normalizeNewlines(markdown || '').split('\n');
    const wanted = new Set((headingNames || []).map((name) => String(name).toLowerCase()));
    const out = [];
    let inSection = false;

    for (const raw of lines) {
      const line = raw.trim();
      const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
      if (heading) {
        const name = heading[1].trim().toLowerCase();
        inSection = wanted.has(name);
        continue;
      }
      if (!inSection || !line) continue;
      const item = line.match(/^[-*]\s+(.+)$/);
      if (item) {
        const value = cleanConfigListValue(item[1]);
        if (value) out.push(value);
      }
    }
    return out;
  }

  function viewerSubtitlePool() {
    const cfg = app.viewerIdentity || {};
    const pool = [];
    if (Array.isArray(cfg.noWorkspaceSubtitles)) {
      cfg.noWorkspaceSubtitles.forEach((item) => {
        const text = cleanConfigListValue(item);
        if (text) pool.push(text);
      });
    }
    const single = cleanConfigListValue(cfg.noWorkspaceSubtitle || '');
    if (single && !pool.includes(single)) pool.unshift(single);
    return pool.length ? pool : ['Everything starts from somewhere.'];
  }

  function nextNoWorkspaceSubtitle() {
    const cfg = app.viewerIdentity || {};
    const pool = viewerSubtitlePool();

    // Keep the text stable while the same empty stage is visible. Rotate when
    // workspaces appear and later return to empty, or after reload.
    if (cfg.noWorkspaceSubtitleCurrent && pool.includes(cfg.noWorkspaceSubtitleCurrent)) {
      return cfg.noWorkspaceSubtitleCurrent;
    }

    const cursor = Number.isFinite(cfg.noWorkspaceSubtitleCursor) ? cfg.noWorkspaceSubtitleCursor : 0;
    const text = pool[Math.abs(cursor) % pool.length];
    cfg.noWorkspaceSubtitleCursor = (cursor + 1) % pool.length;
    cfg.noWorkspaceSubtitleCurrent = text;
    return text;
  }

  function clearNoWorkspaceSubtitleCycle() {
    if (app.viewerIdentity) app.viewerIdentity.noWorkspaceSubtitleCurrent = '';
  }

  function renderNoWorkspace() {
    const text = nextNoWorkspaceSubtitle();
    return `<section class="quiet-empty-workspace workspace-drop-target empty-drop-target empty-stage-watermark" aria-label="No workspace loaded" title="Drop handoff/source material here to create a local workspace">
      ${text ? `<p>${escapeHtml(text)}</p>` : ''}
    </section>`;
  }

  function configSourceSignature(source) {
    if (!source) return '';
    if (source.kind === 'github-tree') {
      const roots = (source.rootPaths || [source.rootPath || '.topics']).map((p) => typeof normalizeRepoPath === 'function' ? normalizeRepoPath(p) : String(p || '')).join('|');
      return `github-tree:${source.repo || ''}@${source.ref || ''}:${roots}`;
    }
    return `urls:${(source.urls || []).join('\n')}`;
  }

  function workspaceConfigSignature(ws) {
    if (!ws) return '';
    if (ws.discoverySource?.kind === 'github-tree') {
      return configSourceSignature({
        kind: 'github-tree',
        repo: ws.discoverySource.repo,
        ref: ws.discoverySource.ref || ws.ref || '',
        rootPaths: ws.discoverySource.rootPaths || [ws.discoverySource.rootPath || '.topics']
      });
    }
    return configSourceSignature({ kind: 'urls', urls: workspaceSourceUrls(ws) });
  }

  function findWorkspaceForConfigSource(source) {
    const sig = configSourceSignature(source);
    if (!sig) return null;
    return app.workspaces.find((ws) => workspaceConfigSignature(ws) === sig) || null;
  }

  async function applyViewerStatePreservingLocal(state, options = {}) {
    const sources = Array.isArray(state?.sources) ? state.sources : [];
    if (!sources.length) return 0;

    let opened = 0;
    let firstWs = null;
    for (const source of sources) {
      if (!source || (source.kind !== 'github-tree' && !(source.urls || []).length)) continue;

      let ws = findWorkspaceForConfigSource(source);
      if (!ws) {
        ws = createWorkspace(source.label || 'Config workspace', 'Loaded from .workspace.md workspace state.');
        opened += 1;
        if (source.kind === 'github-tree' && typeof discoverGitHubRepoIntoWorkspace === 'function') {
          await discoverGitHubRepoIntoWorkspace(ws, {
            repo: source.repo,
            ref: source.ref || '',
            rootPaths: source.rootPaths || [source.rootPath || '.topics']
          });
        } else {
          await loadUrlsIntoWorkspace(ws, source.urls || []);
        }
      }
      if (!firstWs) firstWs = ws;
      if (typeof applyViewStateToWorkspace === 'function') applyViewStateToWorkspace(ws, source);
      if (typeof computeWorkspaceIndex === 'function') computeWorkspaceIndex(ws);
    }

    if (firstWs) {
      app.activeWorkspaceId = firstWs.id;
      if (typeof focusWorkspaceWindow === 'function') focusWorkspaceWindow(firstWs.id);
    }
    if (Number.isFinite(state.workspaceOffset)) app.workspaceOffset = Math.max(0, Number(state.workspaceOffset) || 0);
    if (typeof setRouteState === 'function') setRouteState('replace');
    return opened || sources.length;
  }

  async function applyParsedViewerConfig(parsed, configUrl, options = {}) {
    const merged = Object.assign({}, app.viewerIdentity || {}, parsed || {}, {
      loaded: true,
      error: '',
      configUrl
    });

    if (merged.cssUrl) {
      try {
        merged.customCss = [merged.customCss || '', await fetchViewerCss(merged.cssUrl)].filter(Boolean).join('\n\n');
      } catch (cssError) {
        merged.cssError = cssError.message || String(cssError);
      }
    }

    app.viewerIdentity = merged;
    applyViewerCustomCss(app.viewerIdentity.customCss || '');

    if (parsed?.viewerStateError) {
      toast(`Workspace state could not be parsed: ${parsed.viewerStateError}`, 'warn');
    } else if (parsed?.viewerState && options.applyWorkspaceState !== false) {
      await applyViewerStatePreservingLocal(parsed.viewerState, options);
    }
  }

  function workspaceExportDescriptor(ws, index, stateSources) {
    const sig = workspaceConfigSignature(ws);
    const source = (stateSources || []).find((item) => configSourceSignature(item) === sig);
    const localAssets = Array.from(ws.assets?.values?.() || []).filter((asset) => !asset.rawUrl && asset.sourceId === 'local').length;
    const localFiles = Array.from(ws.files?.values?.() || []).filter((file) => !file.rawUrl && (file.sourceId === 'local' || file.isGenerated)).length;
    return {
      index: index + 1,
      label: ws.label || `Workspace ${index + 1}`,
      shareable: Boolean(source),
      sourceKind: source?.kind || 'local-only',
      localOnlyItems: localAssets + localFiles,
      selectedPath: selectedNode(ws)?.path || '',
      source
    };
  }


  function viewerStateForExport() {
    const state = typeof routeState === 'function' ? routeState() : { v: 1, sources: [] };
    state.exportedAt = new Date().toISOString();
    state.exportedBy = 'tiinex-lineage-viewer';
    return state;
  }

  async function createWorkspaceFromInputs() {
    const modal = app.modal?.type === 'source' ? app.modal : {};
    const appendWs = modal.appendWsId ? getWorkspace(modal.appendWsId) : null;

    const repoInput = $('source-repo')?.value?.trim() || '';
    const parsedRepo = repoInput && typeof parseGitHubRepoSpec === 'function' ? parseGitHubRepoSpec(repoInput) : null;
    const refInput = $('source-ref')?.value?.trim() || '';
    const rootPaths = typeof parseRootPaths === 'function' ? parseRootPaths($('source-root')?.value || '.topics') : ['.topics'];
    const urls = ($('source-urls')?.value || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const files = [
      ...Array.from($('source-files')?.files || []),
      ...Array.from($('source-folder')?.files || []),
      ...Array.from(modal.droppedFiles || []),
      ...Array.from(modal.pastedFiles || [])
    ];

    const configFiles = files.filter(isWorkspaceFile);
    const nonConfigFiles = files.filter((file) => !isWorkspaceFile(file));

    if (!appendWs && configFiles.length && !parsedRepo && !urls.length && !nonConfigFiles.length) {
      app.modal = null;
      await openWorkspaceFiles(configFiles, { applyWorkspaceState: true });
      render();
      return;
    }

    if (appendWs && !parsedRepo && !urls.length && !files.length) {
      toast('Choose files, paste URLs, enter a repo, or drop material before adding.', 'warn');
      return;
    }

    const label = appendWs
      ? appendWs.label
      : ($('source-label')?.value?.trim() || 'New workspace');
    const ws = appendWs || createWorkspace(label, 'Empty workspace. Add material with the Add button or drag/drop.');

    app.modal = null;
    app.activeWorkspaceId = ws.id;
    if (typeof focusWorkspaceWindow === 'function') focusWorkspaceWindow(ws.id);
    render();

    if (configFiles.length) await openWorkspaceFiles(configFiles, { applyWorkspaceState: true });

    if (parsedRepo && typeof discoverGitHubRepoIntoWorkspace === 'function') {
      await discoverGitHubRepoIntoWorkspace(ws, {
        repo: parsedRepo.repo,
        ref: refInput || parsedRepo.ref || '',
        rootPaths: rootPaths.length ? rootPaths : (typeof parseRootPaths === 'function' ? parseRootPaths(parsedRepo.rootPath || '.topics') : ['.topics'])
      });
    }
    if (urls.length) await loadUrlsIntoWorkspace(ws, urls);
    if (nonConfigFiles.length) await readUploadedFilesIntoWorkspace(ws, nonConfigFiles);

    if (typeof computeWorkspaceIndex === 'function') computeWorkspaceIndex(ws);
    app.activeWorkspaceId = ws.id;
    if (typeof focusWorkspaceWindow === 'function') focusWorkspaceWindow(ws.id);
    if (typeof updateUrlState === 'function') updateUrlState();
    render();
  }

  function viewerStateSourceCount(parsed) {
    return Array.isArray(parsed?.viewerState?.sources) ? parsed.viewerState.sources.length : 0;
  }

  function viewerStatePresence(parsed) {
    if (!parsed?.viewerState) return 'missing';
    if (parsed.viewerStateError) return 'invalid';
    return viewerStateSourceCount(parsed) ? 'sources' : 'empty';
  }





  app.localState = Object.assign({
    registryKey: STORAGE_KEYS.localWorkspaceRegistry,
    currentId: '',
    currentDisplayName: '',
    saveTimer: null,
    restoring: false,
    createIntent: false,
    promptShown: false,
    lastSaveErrorKey: ''
  }, app.localState || {});

  function localStateDataKey(id) {
    return stateLocalStateDataKey(STORAGE_KEYS.localWorkspaceStatePrefix, id);
  }

  function localStateSlug(text) {
    return stateLocalStateSlug(text);
  }

  function localStateId(displayName) {
    return stateMakeLocalStateId(displayName);
  }

  function readLocalStateRegistry() {
    const parsed = storageReadJson(localStorage, app.localState.registryKey, []);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id) : [];
  }

  function writeLocalStateRegistry(entries) {
    try {
      storageWriteJson(localStorage, app.localState.registryKey, entries || []);
    } catch (error) {
      reportRuntimeError('Could not write local workspace registry', error);
      toast(`Could not write local workspace registry: ${error.message}`, 'warn');
    }
  }

  function upsertLocalStateRegistry(entry) {
    const list = readLocalStateRegistry().filter((item) => item.id !== entry.id);
    list.unshift(Object.assign({}, entry, { updatedAt: new Date().toISOString() }));
    writeLocalStateRegistry(list.slice(0, 30));
  }

  function connectLocalStateProfile(displayName, options = {}) {
    const name = String(displayName || 'Local workspace').trim() || 'Local workspace';
    const id = localStateId(name);
    app.localState.currentId = id;
    app.localState.currentDisplayName = name;
    upsertLocalStateRegistry({ id, displayName: name, createdAt: new Date().toISOString() });
    if (!options.silent) toast(`Local workspace state connected: ${name}.`, 'ok');
    rememberCurrentLocalStateId(id);
    return id;
  }

  function ensureLocalStateProfile(displayName) {
    if (app.localState.currentId) return app.localState.currentId;
    return connectLocalStateProfile(displayName);
  }

  function sourceSerializable(source) {
    return stateSourceSerializable(source);
  }

  function workspaceHasRemoteContent(ws) {
    if (!ws) return false;
    const sources = Array.from(ws.sources?.values?.() || []);
    if (sources.some((source) => source && !['local', 'draft'].includes(source.kind) && !['local', 'draft'].includes(source.id))) return true;
    const files = Array.from(ws.files?.values?.() || []);
    return files.some((file) => file?.rawUrl || file?.browseUrl || file?.repo || (file?.sourceId && !['local', 'draft'].includes(file.sourceId) && !file.isGenerated));
  }

  function localStateFileIsPersistent(file) {
    return stateLocalStateFileIsPersistent(file);
  }

  function localStateAssetIsPersistent(asset, savedFilePaths = new Set()) {
    return stateLocalStateAssetIsPersistent(asset, savedFilePaths);
  }

  function localStateFiles(ws) {
    return stateLocalStateFiles(ws);
  }

  function localStateAssets(ws, files = localStateFiles(ws)) {
    return stateLocalStateAssets(ws, files);
  }

  function workspaceHasLocalStateContent(ws) {
    return stateWorkspaceHasLocalStateContent(ws);
  }

  function localStateSourcesForWorkspace(ws, files = localStateFiles(ws), assets = localStateAssets(ws, files)) {
    return stateLocalStateSourcesForWorkspace(ws, files, assets);
  }

  function serializeFileForLocalState(file) {
    return stateSerializeFileForLocalState(file);
  }

  function serializeAssetForLocalState(asset) {
    return stateSerializeAssetForLocalState(asset);
  }

  function serializeWorkspaceForLocalState(ws) {
    const files = localStateFiles(ws);
    const assets = localStateAssets(ws, files);
    return {
      label: ws.label || '',
      sourceNote: ws.sourceNote || '',
      selectedPath: selectedNode(ws)?.path || '',
      layoutMode: ws.layoutMode || 'expanded',
      discoveryView: ws.discoveryView || 'feed',
      discoveryFilterSchema: ws.discoveryFilterSchema || ws.filterSchema || 'all',
      discoverySearch: ws.discoverySearch || '',
      lineageSearch: ws.lineageSearch || '',
      repo: ws.repo || '',
      ref: ws.ref || '',
      discoverySource: ws.discoverySource || null,
      policy: ws.policy || null,
      notice: ws.notice || null,
      overlay: workspaceHasRemoteContent(ws),
      sources: localStateSourcesForWorkspace(ws, files, assets),
      sourceOrder: Array.from(ws.sourceOrder || []).filter((id) => ['local', 'draft'].includes(id) || files.some((file) => file.sourceId === id) || assets.some((asset) => asset.sourceId === id)),
      files: files.map(serializeFileForLocalState),
      assets: assets.map(serializeAssetForLocalState).filter(Boolean)
    };
  }

  function localStateSerializableWorkspaces() {
    return app.workspaces.filter(workspaceHasLocalStateContent).map(serializeWorkspaceForLocalState);
  }

  function serializeLocalState() {
    return {
      v: 2,
      id: app.localState.currentId,
      displayName: app.localState.currentDisplayName,
      updatedAt: new Date().toISOString(),
      viewerIdentity: {
        displayName: app.viewerIdentity?.displayName || '',
        heading: app.viewerIdentity?.heading || '',
        label: app.viewerIdentity?.label || '',
        icon: app.viewerIdentity?.icon || '',
        home: app.viewerIdentity?.home || '',
        accent: app.viewerIdentity?.accent || '',
        noWorkspaceSubtitle: app.viewerIdentity?.noWorkspaceSubtitle || '',
        noWorkspaceSubtitles: app.viewerIdentity?.noWorkspaceSubtitles || []
      },
      activeWorkspaceLabel: getWorkspace(app.activeWorkspaceId)?.label || '',
      workspaceOffset: app.workspaceOffset || 0,
      workspaces: localStateSerializableWorkspaces()
    };
  }

  function localStateAutoDisplayName() {
    const active = getWorkspace(app.activeWorkspaceId || '') || app.workspaces.find(workspaceHasLocalStateContent) || app.workspaces[0];
    return active?.label || 'Unsaved local workspace';
  }

  function ensureLocalStateAutosaveProfile() {
    if (app.localState.currentId || app.localState.restoring || app.isBootingFromUrl) return app.localState.currentId || '';
    if (!app.workspaces.some(workspaceHasLocalStateContent)) return '';
    return connectLocalStateProfile(localStateAutoDisplayName(), { silent: true });
  }

  function scheduleLocalStateSave() {
    if (app.localState.restoring) return;
    ensureLocalStateAutosaveProfile();
    if (!app.localState.currentId) return;
    clearTimeout(app.localState.saveTimer);
    app.localState.saveTimer = setTimeout(saveLocalStateNow, 350);
  }

  function scheduleLocalStateSaveAfterWorkspaceMutation() {
    if (app.localState.restoring || app.isBootingFromUrl) return;
    window.setTimeout(() => {
      if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
    }, 0);
  }

  function workspaceMatchesLocalStateSnapshot(ws, saved) {
    if (!ws || !saved) return false;
    if (saved.repo && ws.repo && saved.repo === ws.repo && (saved.ref || '') === (ws.ref || '')) return true;
    if (saved.label && ws.label && saved.label === ws.label) return true;
    return false;
  }

  function applyLocalStateWorkspaceSnapshot(ws, saved) {
    if (!ws || !saved) return false;
    app.localState.restoring = true;
    try {
      ensureWorkspaceSources(ws);
      (saved.sources || []).forEach((source) => registerWorkspaceSource(ws, source));
      (saved.files || []).forEach((file) => {
        const path = canonicalWorkspacePath(file.path || file.name || 'artifact.trace.md');
        addFileToWorkspace(ws, Object.assign({}, file, {
          path,
          content: file.content || file.text || '',
          sourceId: file.sourceId || 'local',
          sourceKind: file.sourceKind || 'local',
          sourceLabel: file.sourceLabel || 'Local',
          rawUrl: '',
          browseUrl: '',
          repo: '',
          ref: ''
        }));
      });
      (saved.assets || []).forEach((asset) => {
        if (!asset || typeof asset.content !== 'string') return;
        storeWorkspaceAsset(ws, asset.path, asset.content, Object.assign({}, asset, {
          sourceId: asset.sourceId || 'local',
          source: asset.source || 'local'
        }));
      });
      ws.layoutMode = saved.layoutMode || ws.layoutMode;
      ws.discoveryView = saved.discoveryView || ws.discoveryView;
      ws.discoveryFilterSchema = saved.discoveryFilterSchema || ws.discoveryFilterSchema || ws.filterSchema;
      ws.filterSchema = ws.discoveryFilterSchema || ws.filterSchema;
      ws.discoverySearch = saved.discoverySearch || ws.discoverySearch || '';
      ws.lineageSearch = saved.lineageSearch || ws.lineageSearch || '';
      computeWorkspaceIndex(ws);
      if (saved.selectedPath) {
        const selected = ws.nodes.find((node) => node.path === saved.selectedPath);
        if (selected) ws.selectedNodeId = selected.id;
      }
      return true;
    } finally {
      app.localState.restoring = false;
    }
  }

  function restoreLocalStateIntoCurrentWorkspaces(state) {
    if (!state || !Array.isArray(state.workspaces) || !state.workspaces.length) return false;
    let restored = false;
    app.localState.restoring = true;
    try {
      for (const saved of state.workspaces) {
        const target = app.workspaces.find((ws) => workspaceMatchesLocalStateSnapshot(ws, saved));
        if (target) {
          restored = applyLocalStateWorkspaceSnapshot(target, saved) || restored;
        } else {
          restoreWorkspaceFromLocalState(saved);
          restored = true;
        }
      }
      if (state.viewerIdentity) app.viewerIdentity = Object.assign(app.viewerIdentity || {}, state.viewerIdentity);
    } finally {
      app.localState.restoring = false;
    }
    if (state.activeWorkspaceLabel) {
      const active = app.workspaces.find((ws) => ws.label === state.activeWorkspaceLabel);
      if (active) app.activeWorkspaceId = active.id;
    }
    return restored;
  }

  function restoreWorkspaceFromLocalState(saved) {
    app.localState.restoring = true;
    try {
      const ws = createWorkspace(saved.label || 'Local workspace', saved.sourceNote || 'Restored local workspace.');
      ws.repo = saved.repo || '';
      ws.ref = saved.ref || '';
      ws.discoverySource = saved.discoverySource || null;
      ws.policy = saved.policy || ws.policy;
      ws.notice = saved.notice || ws.notice;
      ws.layoutMode = saved.layoutMode || 'expanded';
      ws.discoveryView = saved.discoveryView || 'feed';
      ws.discoveryFilterSchema = saved.discoveryFilterSchema || 'all';
      ws.filterSchema = ws.discoveryFilterSchema;
      ws.discoverySearch = saved.discoverySearch || '';
      ws.lineageSearch = saved.lineageSearch || '';
      ws.sources = new Map();
      ws.sourceOrder = [];
      (saved.sources || []).forEach((source) => registerWorkspaceSource(ws, source));
      ws.sourceOrder = Array.from(saved.sourceOrder || ws.sourceOrder || []);
      ws.files = new Map();
      (saved.files || []).forEach((file) => {
        const sourceId = file.sourceId || '';
        const path = normalizeAssetPath(file.path || file.name || 'artifact.trace.md');
        const key = file.storageKey || sourceFileKey(sourceId, path, Boolean(file.isGenerated));
        ws.files.set(key, Object.assign({}, file, {
          workspaceId: ws.id,
          path,
          storageKey: key,
          name: file.name || fileNameFromPath(path)
        }));
      });
      ws.assets = new Map();
      ws.assetUrls = new Map();
      (saved.assets || []).forEach((asset) => {
        if (!asset || typeof asset.content !== 'string') return;
        storeWorkspaceAsset(ws, asset.path, asset.content, asset);
      });
      computeWorkspaceIndex(ws);
      if (saved.selectedPath) {
        const selected = ws.nodes.find((node) => node.path === saved.selectedPath);
        if (selected) ws.selectedNodeId = selected.id;
      }
      return ws;
    } finally {
      app.localState.restoring = false;
    }
  }

  function renderLocalStateRestoreModal(modal) {
    const entries = modal.entries || [];
    return `
      <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
        <div class="modal-panel source-modal-panel local-state-modal">
          <div class="modal-header-lite source-modal-head">
            <div>
              <p class="kicker">Local workspace</p>
              <h2 class="modal-title-lite">Open a local workspace?</h2>
              <p class="text-secondary mb-0">This browser has named local workspace state. Open one to connect this tab, or close to start empty.</p>
            </div>
            <button class="tv-btn small subtle" data-action="dismiss-local-state" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="local-state-list">
            ${entries.map((entry) => `
              <button class="local-state-card" data-action="open-local-state" data-local-state="${escapeAttr(entry.id)}" title="${escapeAttr(entry.id)}">
                <strong>${escapeHtml(entry.displayName || entry.id)}</strong>
                <small>${escapeHtml([entry.workspaceCount ? `${entry.workspaceCount} workspace${entry.workspaceCount === 1 ? '' : 's'}` : '', entry.updatedAt ? `updated ${entry.updatedAt.slice(0, 19).replace('T', ' ')}` : ''].filter(Boolean).join(' · '))}</small>
              </button>
            `).join('')}
          </div>
          <div class="modal-footer-actions">
            <button class="tv-btn subtle" data-action="dismiss-local-state">Start empty</button>
          </div>
        </div>
      </div>`;
  }

  function localStateRestoreEntries() {
    return readLocalStateRegistry()
      .map((entry) => {
        const snapshot = localStateStoredSnapshot(entry.id);
        if (!snapshot || !Array.isArray(snapshot.workspaces) || !snapshot.workspaces.length) return null;
        return Object.assign({}, entry, {
          workspaceCount: snapshot.workspaces.length,
          updatedAt: snapshot.updatedAt || entry.updatedAt || ''
        });
      })
      .filter(Boolean);
  }

  function maybeOfferLocalStateRestore() {
    if (app.localState.promptShown || app.workspaces.length || app.modal || app.isBootingFromUrl) return false;
    const entries = localStateRestoreEntries();
    if (!entries.length) return false;
    app.localState.promptShown = true;
    app.modal = { type: 'local-state-restore', entries };
    return true;
  }

  function closeWorkspaceSource(wsId, sourceId) {
    const ws = getWorkspace(wsId);
    const source = sourceById(ws, sourceId);
    if (!ws || !source) return;
    const fileCount = Array.from(ws.files?.values?.() || []).filter((file) => file.sourceId === sourceId).length;
    const assetCount = Array.from(ws.assets?.values?.() || []).filter((asset) => asset.sourceId === sourceId).length;
    const ok = confirm(`Close source "${source.label || source.id}" from this workspace?\n\nThis removes ${fileCount} trace/material file(s) and ${assetCount} preserved asset(s) from this workspace view. Export first if you need a copy.`);
    if (!ok) return;

    for (const [key, file] of Array.from(ws.files?.entries?.() || [])) {
      if (file.sourceId === sourceId) ws.files.delete(key);
    }
    for (const [key, asset] of Array.from(ws.assets?.entries?.() || [])) {
      if (asset.sourceId === sourceId) {
        if (ws.assetUrls?.has(key)) {
          try { URL.revokeObjectURL(ws.assetUrls.get(key)); } catch (_) {}
          ws.assetUrls.delete(key);
        }
        ws.assets.delete(key);
      }
    }
    ws.sources?.delete?.(sourceId);
    ws.sourceOrder = (ws.sourceOrder || []).filter((id) => id !== sourceId);
    if (source.kind === 'github' && ws.discoverySource?.repo === source.repo) {
      ws.discoverySource = null;
      if (!Array.from(ws.sources?.values?.() || []).some((s) => s.kind === 'github')) {
        ws.repo = '';
        ws.ref = '';
      }
    }
    computeWorkspaceIndex(ws);
    if (ws.selectedNodeId && !ws.nodeById.has(ws.selectedNodeId)) ws.selectedNodeId = null;
    toast(`Closed source: ${source.label || source.id}.`, 'ok');
    render();
    scheduleLocalStateSave();
  }

  function createWorkspace(label, sourceNote) {
    clearNoWorkspaceSubtitleCycle?.();
    if (app.localState.createIntent && !app.localState.currentId && !app.workspaces.length && !app.localState.restoring && !app.isBootingFromUrl) {
      ensureLocalStateProfile(label || 'Local workspace');
    }
    const ws = {
      id: uid('ws'),
      label: label || 'Local lineage workspace',
      sourceNote: sourceNote || '',
      files: new Map(),
      assets: new Map(),
      assetUrls: new Map(),
      nodes: [],
      nodeById: new Map(),
      nodeByPath: new Map(),
      leaves: [],
      selectedNodeId: null,
      generated: [],
      exportWithTree: true,
      layoutMode: 'expanded',
      repo: '',
      ref: '',
      policy: { status: 'unknown', kind: '', text: '', url: '', note: 'Policy not checked.' },
      notice: { status: 'unknown', kind: '', text: '', url: '', note: '' },
      sources: new Map(),
      sourceOrder: [],
      logs: [],
      loading: false
    };
    app.workspaces.push(ws);
    app.activeWorkspaceId = ws.id;
    return ws;
  }






  function localStateStoredSnapshot(id) {
    try {
      return JSON.parse(localStorage.getItem(localStateDataKey(id)) || 'null');
    } catch (_) {
      return null;
    }
  }


  function removeLocalStateRegistryEntry(id) {
    const list = readLocalStateRegistry().filter((item) => item.id !== id);
    writeLocalStateRegistry(list);
    if (id && app.localState.currentId === id) rememberCurrentLocalStateId('');
  }
  async function openLocalState(id) {
    const state = localStateStoredSnapshot(id);
    const entry = readLocalStateRegistry().find((item) => item.id === id);
    if (!state || !Array.isArray(state.workspaces) || !state.workspaces.length) {
      removeLocalStateRegistryEntry(id);
      app.modal = null;
      toast('That local workspace entry had no workspace snapshot and was ignored.', 'warn');
      render();
      return;
    }

    app.modal = null;
    app.localState.currentId = id;
    app.localState.currentDisplayName = entry?.displayName || state.displayName || 'Local workspace';
    app.localState.restoring = true;
    try {
      app.workspaces = [];
      app.activeWorkspaceId = null;
      app.workspaceOffset = Number(state.workspaceOffset || 0);
      (state.workspaces || []).forEach(restoreWorkspaceFromLocalState);
      if (state.viewerIdentity) {
        app.viewerIdentity = Object.assign(app.viewerIdentity || {}, state.viewerIdentity);
      }
    } finally {
      app.localState.restoring = false;
    }

    if (state.activeWorkspaceLabel) {
      const active = app.workspaces.find((ws) => ws.label === state.activeWorkspaceLabel);
      if (active) app.activeWorkspaceId = active.id;
    }
    if (!app.activeWorkspaceId) app.activeWorkspaceId = app.workspaces[0]?.id || null;
    toast(`Opened local workspace state: ${app.localState.currentDisplayName}.`, 'ok');
    render();
    scheduleLocalStateSave();
  }

  function localStateJsonSize(json) {
    return storageTextByteLength(json);
  }

  function pruneLocalStateStorage(keepId) {
    const prefix = STORAGE_KEYS.localWorkspaceStatePrefix;
    const keepKey = keepId ? localStateDataKey(keepId) : '';
    try {
      storageRemoveKeysWithPrefix(localStorage, prefix, keepKey);
    } catch (_) {}
    if (keepId) {
      const entry = readLocalStateRegistry().find((item) => item.id === keepId);
      writeLocalStateRegistry(entry ? [entry] : []);
    }
  }

  function reportLocalStateSaveError(error) {
    const message = error?.message || String(error || 'Unknown error');
    const currentId = app.localState.currentId || 'no-current-local-state';
    if (app.localState.lastSaveErrorKey === `${currentId}:${message}`) return;
    app.localState.lastSaveErrorKey = `${currentId}:${message}`;
    reportRuntimeError('Could not save local workspace state', error);
    toast(`Could not save local workspace state: ${message}`, 'warn');
  }

  function saveLocalStateNow() {
    if (!app.localState.currentId && !app.localState.restoring && !app.isBootingFromUrl && app.workspaces?.some(workspaceHasLocalStateContent)) {
      ensureLocalStateAutosaveProfile();
    }
    if (app.localState.currentId) rememberCurrentLocalStateId(app.localState.currentId);
    if (!app.localState.currentId || app.localState.restoring) return;
    const key = localStateDataKey(app.localState.currentId);
    try {
      const state = serializeLocalState();
      if (!state.workspaces.length) {
        localStorage.removeItem(key);
        removeLocalStateRegistryEntry(app.localState.currentId);
        app.localState.lastSaveErrorKey = '';
        rememberCurrentLocalStateId('');
        return;
      }
      const json = storageWriteJson(localStorage, key, state);
      upsertLocalStateRegistry({
        id: app.localState.currentId,
        displayName: app.localState.currentDisplayName || state.displayName || 'Local workspace',
        workspaceCount: state.workspaces.length,
        bytes: localStateJsonSize(json),
        updatedAt: state.updatedAt
      });
      app.localState.lastSaveErrorKey = '';
    } catch (error) {
      if (error && (error.name === 'QuotaExceededError' || /quota/i.test(error.message || ''))) {
        try {
          try { localStorage.removeItem(key); } catch (_) {}
          pruneLocalStateStorage(app.localState.currentId);
          const retryState = serializeLocalState();
          const retryJson = storageWriteJson(localStorage, key, retryState);
          upsertLocalStateRegistry({
            id: app.localState.currentId,
            displayName: app.localState.currentDisplayName || retryState.displayName || 'Local workspace',
            workspaceCount: retryState.workspaces.length,
            bytes: localStateJsonSize(retryJson),
            updatedAt: retryState.updatedAt
          });
          app.localState.lastSaveErrorKey = '';
          return;
        } catch (retryError) {
          reportLocalStateSaveError(retryError);
          return;
        }
      }
      reportLocalStateSaveError(error);
    }
  }

  function localCreateNeedsName() {
    const modal = app.modal?.type === 'source' ? app.modal : null;
    if (!modal || modal.appendWsId) return false;
    if (app.localState.currentId || app.workspaces.length || app.localState.restoring || app.isBootingFromUrl) return false;
    return true;
  }





  const TIINEX_ROOT_SCHEMA_URL = 'https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md';

  function continuityTimestamp() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  async function continuitySha256Base64Url(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!crypto?.subtle) return '';
    const bytes = new TextEncoder().encode(normalized);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    let binary = '';
    for (const byte of new Uint8Array(hash)) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function appendContinuityIntegrity(markdown, towards) {
    const base = String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
      + '\n\n---\n\n# Continuity Integrity\n\n';
    const value = await continuitySha256Base64Url(base);
    return base + `- sha256-base64url-c14n-v1\n  - Towards: ${towards || 'this config document'}\n  - Value: ${value || 'unavailable'}\n`;
  }




  // data-discovery-filter-select, while older binders watched data-mode /
  // data-search-mode and other filter markers. Re-unify the runtime contract.

  function targetLooksSearchInput(target) {
    if (!target || target.tagName !== 'INPUT') return false;
    const placeholder = String(target.getAttribute('placeholder') || '').toLowerCase();
    return Boolean(
      target.dataset.search
      || target.dataset.mode
      || target.dataset.searchMode
      || target.closest?.('.search-box')
      || placeholder.includes('search discovery')
      || placeholder.includes('search lineage')
    );
  }
  function targetLooksDiscoveryFilter(target) {
    if (!target || target.tagName !== 'SELECT') return false;
    const action = target.dataset.action || '';
    return action === 'set-discovery-filter'
      || target.hasAttribute('data-discovery-filter-select')
      || target.classList.contains('discovery-filter-select')
      || Boolean(target.dataset.filterMode)
      || target.closest?.('.filter-select-wrap');
  }

  function applyDiscoveryFilter(target) {
    const ws = typeof eventTargetWorkspace === 'function' ? eventTargetWorkspace(target) : getWorkspace(target.dataset.ws);
    if (!ws) return false;
    ws.discoveryFilterSchema = target.value || target.dataset.filter || 'all';
    ws.filterSchema = ws.discoveryFilterSchema;
    if (typeof setRouteState === 'function') setRouteState('replace');
    else if (typeof updateUrlState === 'function') updateUrlState({ replace: true });
    render();
    return true;
  }


  // --- DOM event binding ---

  function bindEvents(root) {
    hideCreateWorkspaceButtons(root);
    root.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', handleAction);
    });

    root.querySelectorAll('input[data-field], textarea[data-field], select[data-field]').forEach((el) => {
      el.addEventListener('input', onModalField);
      el.addEventListener('change', onModalField);
    });


    root.querySelectorAll('.search-box input, input[data-search], input[data-mode], input[data-search-mode]').forEach((el) => {
      if (targetLooksSearchInput(el)) el.addEventListener('input', onSearchInput);
    });

    root.querySelectorAll('select[data-discovery-filter-select], select[data-action="set-discovery-filter"], select.discovery-filter-select, select[data-filter-mode], .filter-select-wrap select').forEach((el) => {
      el.addEventListener('change', (event) => applyDiscoveryFilter(event.currentTarget));
    });

    root.querySelectorAll('#source-files, #source-folder').forEach((el) => {
      el.addEventListener('change', async () => {
        if (app.modal?.type === 'source' && app.modal.appendWsId && el.files && el.files.length) {
          await createWorkspaceFromInputs();
        }
      });
    });

    root.querySelectorAll('.add-drop-backdrop, .drop-mode-modal, .add-full-dropzone').forEach((el) => {
      el.addEventListener('dragenter', (event) => {
        if (app.modal?.addMode !== 'drop') return;
        event.preventDefault();
        document.querySelector('.add-full-dropzone')?.classList?.add?.('drag-over');
      });
      el.addEventListener('dragover', (event) => {
        if (app.modal?.addMode !== 'drop') return;
        event.preventDefault();
        document.querySelector('.add-full-dropzone')?.classList?.add?.('drag-over');
      });
      el.addEventListener('dragleave', (event) => {
        if (app.modal?.addMode !== 'drop') return;
        if (!el.contains(event.relatedTarget)) document.querySelector('.add-full-dropzone')?.classList?.remove?.('drag-over');
      });
      el.addEventListener('drop', handleSourceModalDrop);
    });

    if (typeof bindSourceDropzone === 'function') bindSourceDropzone(root);

    if (!app.sourcePasteBound && typeof handleSourcePaste === 'function') {
      document.addEventListener('paste', handleSourcePaste);
      app.sourcePasteBound = true;
    }

    if (!app.delegatedViewerInputBound) {
      document.addEventListener('input', (event) => {
        const target = event.target;
        if (targetLooksSearchInput(target)) onSearchInput({ currentTarget: target });
      });
      document.addEventListener('change', (event) => {
        const target = event.target;
        if (targetLooksDiscoveryFilter(target)) applyDiscoveryFilter(target);
      });
      app.delegatedViewerInputBound = true;
    }
  }




  const TIINEX_VIEWER_DEFAULT_SUBTITLES = [
    'Every handoff starts somewhere',
    'Start where the last thread ends',
    'Leave enough for the next mind',
    'A thread is waiting',
    'Nothing starts from nothing'
  ];

  if (app.viewerIdentity) {
    app.viewerIdentity.noWorkspaceSubtitle = 'Everything starts from somewhere';
    app.viewerIdentity.noWorkspaceSubtitles = TIINEX_VIEWER_DEFAULT_SUBTITLES.slice();
  }

  function normalizeMarkdown(markdown) {
    return String(markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function markdownSectionContent(markdown, heading, level = 2) {
    const lines = normalizeMarkdown(markdown).split('\n');
    const wanted = String(heading || '').trim().toLowerCase();
    const out = [];
    let inSection = false;
    for (const raw of lines) {
      const h = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
      if (h) {
        const depth = h[1].length;
        const name = h[2].trim().toLowerCase();
        if (inSection && depth <= level) break;
        if (!inSection && depth === level && name === wanted) {
          inSection = true;
          continue;
        }
      }
      if (inSection) out.push(raw);
    }
    return out.join('\n').trim();
  }

  function parseFenceJson(sectionText) {
    const match = normalizeMarkdown(sectionText || '').match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      return { __parseError: error.message || String(error) };
    }
  }

  function extractMachineStateJson(markdown) {
    return parseFenceJson(markdownSectionContent(markdown, 'Machine State', 2));
  }

  function extractViewerStateJson(markdown) {
    const viewerState = parseFenceJson(markdownSectionContent(markdown, 'Workspace State', 2));
    if (viewerState) return viewerState;
    return null;
  }

  function keyValuePair(line) {
    const pair = String(line || '').trim().match(/^[-*]\s+([^:]+):\s*(.*)$/) || String(line || '').trim().match(/^([^:]+):\s*(.*)$/);
    if (!pair) return null;
    return { key: pair[1].trim(), value: pair[2].trim() };
  }

  function pushMultiValue(map, key, value) {
    const clean = stripMarkdownInline(value || '').trim();
    if (!clean) return;
    const lower = key.toLowerCase();
    if (!map[lower]) map[lower] = [];
    map[lower].push(clean);
  }

  function sectionKeyValueMap(sectionText) {
    const map = {};
    for (const line of normalizeMarkdown(sectionText).split('\n')) {
      const kv = keyValuePair(line);
      if (!kv) continue;
      pushMultiValue(map, kv.key, kv.value);
    }
    return map;
  }

  function firstKv(map, names, fallback = '') {
    for (const name of names) {
      const list = map[String(name).toLowerCase()];
      if (list && list.length) return list[0];
    }
    return fallback;
  }

  function allKv(map, names) {
    const out = [];
    for (const name of names) {
      const list = map[String(name).toLowerCase()];
      if (list) out.push(...list);
    }
    return out;
  }

  function isAffirmative(value, fallback = true) {
    const clean = String(value || '').trim().toLowerCase();
    if (!clean) return fallback;
    if (['no', 'false', 'disabled', 'disable', 'off', '0'].includes(clean)) return false;
    if (['yes', 'true', 'enabled', 'enable', 'on', '1'].includes(clean)) return true;
    return fallback;
  }

  function splitCsv(values) {
    const out = [];
    (values || []).forEach((value) => {
      String(value || '').split(',').forEach((item) => {
        const clean = item.trim();
        if (clean) out.push(clean);
      });
    });
    return out;
  }

  function parseWorkspaceEntrypoints(markdown, configUrl, machineState = null) {
    const section = markdownSectionContent(markdown, 'Workspace Entrypoints', 2);
    if (!section) return null;

    const lines = normalizeMarkdown(section).split('\n');
    const groups = [];
    let current = null;
    for (const raw of lines) {
      const h = raw.match(/^###\s+(.+?)\s*$/);
      if (h) {
        if (current) groups.push(current);
        current = { title: stripMarkdownInline(h[1].trim()), lines: [] };
        continue;
      }
      if (!current) current = { title: 'Config workspace', lines: [] };
      current.lines.push(raw);
    }
    if (current) groups.push(current);

    const state = {
      v: 6,
      activeIndex: 0,
      workspaceOffset: Number(machineState?.workspaceOffset || 0) || 0,
      sources: []
    };
    const machineWorkspaces = Array.isArray(machineState?.workspaces) ? machineState.workspaces : [];

    groups.forEach((group) => {
      const map = sectionKeyValueMap(group.lines.join('\n'));
      if (!isAffirmative(firstKv(map, ['Open On Apply']), true)) return;

      const kindRaw = firstKv(map, ['Source Kind', 'Kind'], '').toLowerCase();
      const label = firstKv(map, ['Label'], group.title) || group.title;
      const selectedPath = firstKv(map, ['Selected Path'], '');
      const defaultView = firstKv(map, ['Default View'], 'feed').toLowerCase();
      const defaultFilter = firstKv(map, ['Default Filter', 'Filter'], 'all').toLowerCase();
      const defaultSearch = firstKv(map, ['Default Search', 'Search'], '');
      const source = {
        label,
        selectedPath,
        layoutMode: 'expanded',
        discoveryView: defaultView === 'tree' ? 'tree' : 'feed',
        discoveryFilterSchema: defaultFilter || 'all',
        discoverySearch: defaultSearch,
        lineageSearch: '',
        treeExpandedFolders: {},
        expandedPaths: []
      };

      if (kindRaw.includes('github')) {
        source.kind = 'github-tree';
        source.repo = firstKv(map, ['Repository', 'Repo'], '');
        source.ref = firstKv(map, ['Ref', 'Branch'], '');
        source.rootPaths = splitCsv(allKv(map, ['Root Path', 'Root Paths']));
        if (!source.rootPaths.length) source.rootPaths = ['.topics'];
        if (!source.repo) return;
      } else if (kindRaw === 'urls' || kindRaw === 'url' || kindRaw.includes('direct')) {
        source.kind = 'urls';
        source.urls = allKv(map, ['URL', 'URLs']).map((item) => markdownConfigValue(item, configUrl));
        if (!source.urls.length) return;
      } else if (kindRaw === 'local') {
        return;
      } else {
        const urls = allKv(map, ['URL', 'URLs']).map((item) => markdownConfigValue(item, configUrl));
        if (urls.length) {
          source.kind = 'urls';
          source.urls = urls;
        } else {
          const repo = firstKv(map, ['Repository', 'Repo'], '');
          if (!repo) return;
          source.kind = 'github-tree';
          source.repo = repo;
          source.ref = firstKv(map, ['Ref', 'Branch'], '');
          source.rootPaths = splitCsv(allKv(map, ['Root Path', 'Root Paths']));
          if (!source.rootPaths.length) source.rootPaths = ['.topics'];
        }
      }

      const machine = machineWorkspaces.find((item) => String(item?.label || '') === label);
      if (machine) {
        if (machine.treeExpandedFolders && typeof machine.treeExpandedFolders === 'object') source.treeExpandedFolders = machine.treeExpandedFolders;
        if (Array.isArray(machine.expandedPaths)) source.expandedPaths = machine.expandedPaths;
        if (machine.selectedPath && !source.selectedPath) source.selectedPath = machine.selectedPath;
      }

      state.sources.push(source);
    });

    const active = String(machineState?.activeWorkspace || '').trim();
    if (active) {
      const index = state.sources.findIndex((source) => source.label === active);
      if (index >= 0) state.activeIndex = index;
    }
    return state.sources.length ? state : null;
  }

  function parseEmptyStage(markdown) {
    const out = {};
    const section = markdownSectionContent(markdown, 'Empty Stage', 2);
    const map = sectionKeyValueMap(section);
    const subtitles = allKv(map, ['Subtitle', 'Subtitles']);
    if (subtitles.length) {
      out.noWorkspaceSubtitles = subtitles;
      out.noWorkspaceSubtitle = subtitles[0];
    }

    const fallbackList = extractConfigListSection(markdown, [
      'No workspace subtitles',
      'No-workspace subtitles',
      'Empty workspace subtitles',
      'Empty stage subtitles',
      'Stage subtitles'
    ]);
    if (!out.noWorkspaceSubtitles && fallbackList.length) {
      out.noWorkspaceSubtitles = fallbackList;
      out.noWorkspaceSubtitle = fallbackList[0];
    }

    const single = firstKv(map, ['No workspace subtitle', 'Empty subtitle', 'Stage subtitle'], '');
    if (single) {
      out.noWorkspaceSubtitle = single;
      if (!out.noWorkspaceSubtitles) out.noWorkspaceSubtitles = [single];
    }
    return out;
  }

  function configDisplayName(parsed) {
    return String(parsed?.displayName || parsed?.heading || fileNameFromPath(parsed?.configUrl || '') || 'config').trim();
  }

  function configLine(key, value, defaultValue = undefined) {
    const clean = String(value ?? '').trim();
    if (!clean) return '';
    if (defaultValue !== undefined && clean === String(defaultValue)) return '';
    return `- ${key}: ${clean}`;
  }

  function subtitleForExport(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    if (clean.endsWith('.') && !clean.endsWith('...')) return clean.slice(0, -1).trim();
    return clean;
  }

  function uniqueNonEmpty(items) {
    const out = [];
    (items || []).forEach((item) => {
      const clean = String(item || '').trim();
      if (clean && !out.includes(clean)) out.push(clean);
    });
    return out;
  }

  function linesOrEmpty(lines) {
    return (lines || []).filter(Boolean).join('\n').trim();
  }

  function sectionBlock(title, body) {
    const clean = String(body || '').trim();
    return clean ? `## ${title}\n\n${clean}` : '';
  }

  function workspaceEntrypointsMarkdown(descriptors) {
    const sections = [];
    (descriptors || []).forEach((item) => {
      const source = item.source || {};
      const lines = [];
      if (item.shareable && source.kind === 'github-tree') {
        lines.push('- Source Kind: github-tree');
        if (source.repo) lines.push(`- Repository: ${source.repo}`);
        if (source.ref) lines.push(`- Ref: ${source.ref}`);
        (source.rootPaths || [source.rootPath || '.topics']).filter(Boolean).forEach((root) => lines.push(`- Root Path: ${root}`));
      } else if (item.shareable && (source.urls || []).length) {
        lines.push('- Source Kind: urls');
        (source.urls || []).forEach((url) => lines.push(`- URL: ${url}`));
      } else {
        lines.push('- Source Kind: local');
        lines.push('- Open On Apply: no');
      }
      if (source.discoveryView && source.discoveryView !== 'feed') lines.push(`- Default View: ${source.discoveryView}`);
      if ((source.discoveryFilterSchema || source.filterSchema || 'all') !== 'all') lines.push(`- Default Filter: ${source.discoveryFilterSchema || source.filterSchema}`);
      if (source.discoverySearch) lines.push(`- Default Search: ${source.discoverySearch}`);
      if (item.selectedPath) lines.push(`- Selected Path: ${item.selectedPath}`);
      if (item.localOnlyItems) lines.push(`- Local-only items omitted from portable config: ${item.localOnlyItems}`);
      sections.push(`### ${item.label}\n\n${lines.join('\n')}`);
    });
    return sections.join('\n\n');
  }

  function machineStateForExport(descriptors) {
    const state = {
      schema: 'tiinex.workspace.machineState.v1',
      workspaceOffset: Number(app.workspaceOffset || 0) || 0,
      activeWorkspace: getActiveWorkspace()?.label || '',
      workspaces: []
    };
    (app.workspaces || []).forEach((ws) => {
      const item = { label: ws.label || '' };
      if (ws.treeExpandedFolders && Object.keys(ws.treeExpandedFolders).length) item.treeExpandedFolders = ws.treeExpandedFolders;
      const expandedPaths = (ws.nodes || []).filter((node) => node.expanded).map((node) => node.path).filter(Boolean);
      if (expandedPaths.length) item.expandedPaths = expandedPaths;
      const selected = selectedNode(ws);
      if (selected?.path) item.selectedPath = selected.path;
      if (Object.keys(item).length > 1) state.workspaces.push(item);
    });
    if (!state.workspaceOffset && !state.activeWorkspace && !state.workspaces.length) return null;
    return state;
  }




  function helpMarkdownFromConfig(markdown) {
    return markdownSectionContent(markdown, 'Help', 2);
  }

  function configHasHelp() {
    return Boolean(String(app.viewerIdentity?.helpMarkdown || '').trim());
  }

  function renderModal(modal) {
    if (modal.type === 'config-help') return renderConfigHelpModal();
    if (modal.type === 'local-state-restore') return renderLocalStateRestoreModal(modal);
    if (modal.type === 'import-conflict') return renderImportConflictModal(modal);
    if (modal.type === 'create') return renderCreateModal(modal);
    if (modal.type === 'source') return renderSourceModal(modal);
    if (modal.type === 'detail') return renderNodeModal(modal, 'detail');
    if (modal.type === 'markdown') return renderNodeModal(modal, 'markdown');
    if (modal.type === 'material-lightbox') return renderMaterialLightbox(modal);
    if (modal.type === 'material-preview') return renderMaterialPreviewModal(modal);
    if (modal.type === 'external-trace') return renderExternalTraceModal(modal);
    return '';
  }


  // --- Canonical action dispatcher ---

  function handleAction(event) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'open-config-help') {
      event.preventDefault();
      app.modal = { type: 'config-help' };
      render();
      return;
    }
    if (action === 'open-local-state') {
      event.preventDefault();
      return openLocalState(event.currentTarget.dataset.localState);
    }
    if (action === 'dismiss-local-state') {
      event.preventDefault();
      app.modal = null;
      render();
      return;
    }
    if (action === 'close-source') {
      event.preventDefault();
      return closeWorkspaceSource(event.currentTarget.dataset.ws, event.currentTarget.dataset.source);
    }
    if (action === 'create-workspace') {
      const name = String($('source-label')?.value || '').trim();
      if (localCreateNeedsName() && !name) {
        toast('Name this local workspace first.', 'warn');
        $('source-label')?.focus?.();
        return;
      }
      app.localState.createIntent = true;
      return Promise.resolve(createWorkspaceFromInputs()).finally(() => { app.localState.createIntent = false; scheduleLocalStateSave(); });
    }
    if (action === 'export-config') {
      event.preventDefault();
      return exportCurrentLensConfig();
    }
    if (action === 'replace-import' || action === 'import-as-sibling' || action === 'cancel-import') {
      return handleImportConflictAction(action);
    }
    if (action === 'remove-local-node') {
      return removeNodeFromWorkspace(event.currentTarget.dataset.ws, event.currentTarget.dataset.node);
    }
    if (action === 'choose-add-mode') {
      if (app.modal?.type === 'source') {
        app.modal.addMode = event.currentTarget.dataset.mode || '';
        render();
      }
      return;
    }
    if (action === 'toggle-source-section') {
      if (app.modal?.type === 'source') {
        const key = event.currentTarget.dataset.section || 'main';
        app.modal.openSections = app.modal.openSections || {};
        app.modal.openSections[key] = !app.modal.openSections[key];
        render();
      }
      return;
    }
    const result = onAction(event);
    scheduleLocalStateSave();
    return result;
  }

  function registerActionHandler(handler) {
    const next = handleAction;
    handleAction = function registeredActionHandler(event) {
      return handler(event, next);
    };
  }

  function registerRenderWrapper(wrapper) {
    const next = render;
    render = function registeredRenderWrapper(...args) {
      // Render wrappers are registered as (next, ...args). Passing render's
      // Promise/DOM callback argument before `next` can make wrappers receive
      // a non-function as their first parameter during startup.
      return wrapper(next, ...args);
    };
  }

  function registerRenderModalWrapper(wrapper) {
    const next = renderModal;
    renderModal = function registeredRenderModalWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerRenderExportModalWrapper(wrapper) {
    const next = renderExportModal;
    renderExportModal = function registeredRenderExportModalWrapper(modal) {
      return wrapper(modal, next);
    };
  }

  function registerRenderWorkspaceWrapper(wrapper) {
    const next = renderWorkspace;
    renderWorkspace = function registeredRenderWorkspaceWrapper(ws) {
      return wrapper(ws, next);
    };
  }

  function registerRenderWorkspaceFeedWrapper(wrapper) {
    const next = renderWorkspaceFeed;
    renderWorkspaceFeed = function registeredRenderWorkspaceFeedWrapper(ws, selected) {
      return wrapper(ws, selected, next);
    };
  }

  function registerRenderNodePostWrapper(wrapper) {
    const next = renderNodePost;
    renderNodePost = function registeredRenderNodePostWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerNodeMaterialRefsWrapper(wrapper) {
    const next = nodeMaterialRefs;
    nodeMaterialRefs = function registeredNodeMaterialRefsWrapper(ws, node) {
      return wrapper(ws, node, next);
    };
  }

  function registerFilteredDiscoveryNodesWrapper(wrapper) {
    const next = filteredDiscoveryNodes;
    filteredDiscoveryNodes = function registeredFilteredDiscoveryNodesWrapper(ws) {
      return wrapper(ws, next);
    };
  }

  function registerComputeWorkspaceIndexWrapper(wrapper) {
    const next = computeWorkspaceIndex;
    computeWorkspaceIndex = function registeredComputeWorkspaceIndexWrapper(ws) {
      return wrapper(ws, next);
    };
  }

  function registerOpenArtifactWizardWrapper(wrapper) {
    const next = openArtifactWizard;
    openArtifactWizard = function registeredOpenArtifactWizardWrapper(ws, options = {}) {
      return wrapper(ws, options, next);
    };
  }

  function registerWizardPathForWrapper(wrapper) {
    const next = wizardPathFor;
    wizardPathFor = function registeredWizardPathForWrapper(ws, modal, option, title) {
      return wrapper(ws, modal, option, title, next);
    };
  }



  function registerWizardDescribeStepWrapper(wrapper) {
    const next = wizardDescribeStep;
    wizardDescribeStep = function registeredWizardDescribeStepWrapper(ws, modal, selected, title, summary, body) {
      return wrapper(ws, modal, selected, title, summary, body, next);
    };
  }

  function registerScheduleMobileDensityWrapper(wrapper) {
    const next = scheduleMobileDensity;
    scheduleMobileDensity = function registeredScheduleMobileDensityWrapper() {
      return wrapper(next);
    };
  }

  function registerEnsureMobileTopRailWrapper(wrapper) {
    const next = ensureMobileTopRail;
    ensureMobileTopRail = function registeredEnsureMobileTopRailWrapper() {
      return wrapper(next);
    };
  }

  function registerSyncMobileEmptyWorkspaceHintsWrapper(wrapper) {
    const next = syncMobileEmptyWorkspaceHintsInitial;
    syncMobileEmptyWorkspaceHintsInitial = function registeredSyncMobileEmptyWorkspaceHintsWrapper() {
      return wrapper(next);
    };
  }

  function registerCompactMobilePostChipsWrapper(wrapper) {
    const next = compactMobilePostChips;
    compactMobilePostChips = function registeredCompactMobilePostChipsWrapper() {
      return wrapper(next);
    };
  }

  function registerRouteStateWrapper(wrapper) {
    const next = routeState;
    routeState = function registeredRouteStateWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerViewRouteStateWrapper(wrapper) {
    const next = viewRouteState;
    viewRouteState = function registeredViewRouteStateWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerApplyViewStateToWorkspaceWrapper(wrapper) {
    const next = applyViewStateToWorkspace;
    applyViewStateToWorkspace = function registeredApplyViewStateToWorkspaceWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerApplyViewRouteStateWrapper(wrapper) {
    const next = applyViewRouteState;
    applyViewRouteState = function registeredApplyViewRouteStateWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerSetRouteStateWrapper(wrapper) {
    const next = setRouteState;
    setRouteState = function registeredSetRouteStateWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerApplyLensSourceWrapper(wrapper) {
    const next = applyLensSource;
    applyLensSource = function registeredApplyLensSourceWrapper(...args) {
      return wrapper(...args, next);
    };
  }

  function registerCopyShareLinkWrapper(wrapper) {
    const next = copyShareLink;
    copyShareLink = function registeredCopyShareLinkWrapper(...args) {
      return wrapper(...args, next);
    };
  }





  // --- Main render entrypoint ---

  function render() {
    const snapshots = typeof snapshotVisibleFeedScrolls === 'function' ? snapshotVisibleFeedScrolls() : [];
    const root = $('app');
    ensureWorkspaceWindow();
    const count = visibleWorkspaceCount();
    const visible = visibleWorkspaces();
    const total = app.workspaces.length;
    const canPage = total > count;
    root.innerHTML = `
      <div class="app-shell app-shell-foundation app-shell-main app-shell-layout app-shell-grid app-shell-mobile-safe-area app-shell-mobile-compact app-shell-branded">
        <header class="topbar topbar-foundation topbar-shell topbar-layout topbar-actions topbar-branded">
          ${renderViewerBrand()}
          <div class="top-actions workspace-top-actions-layout workspace-top-actions-toolbar">
            <button class="tv-btn primary" data-action="open-source-modal" title="Create or add a workspace/source"><i class="fa-solid fa-plus"></i>Create</button>
            <button class="tv-btn subtle" data-action="export-config" title="Download current view/lens as a portable .workspace.md file. Local-only material is noted but not embedded."><i class="fa-regular fa-floppy-disk"></i>Export</button>
            <button class="tv-btn subtle" data-action="copy-share" title="Copies the current view only. Local uploads, preserved assets, and unsaved workspace contents are not included." aria-label="Copies the current view only. Local uploads, preserved assets, and unsaved workspace contents are not included."><i class="fa-solid fa-link"></i>Copy link</button>
          </div>
          ${renderHelpButton()}
        </header>
        ${canPage ? renderWorkspacePager(count) : ''}
        <main class="workspace-grid workspace-foundation-grid workspace-shell-grid workspace-grid-layout workspace-grid-columns columns-${Math.max(1, Math.min(count, visible.length || 1))}" id="workspace-grid" ${workspaceGridStyleVar(visible)}>
          ${visible.length ? visible.map(renderWorkspace).join('') : renderNoWorkspace()}
        </main>
      </div>
      <footer class="app-footer">Powered by <a href="https://github.com/Tiinex" target="_blank" rel="noopener">Tiinex</a></footer>
      <div id="toasts" class="toasts">${app.toasts.map((t) => `<div class="toast-item ${t.type || 'info'}">${escapeHtml(t.text)}</div>`).join('')}</div>
      ${app.modal ? renderModal(app.modal) : ''}
    `;
    bindEvents(root);
    if (typeof restoreVisibleFeedScrolls === 'function') restoreVisibleFeedScrolls(snapshots);
    else if (typeof restorePendingFeedScroll === 'function') restorePendingFeedScroll();
    scheduleLocalStateSave();
  }




  function firstBodyH1AfterEnvelope(markdown) {
    const text = normalizeMarkdown(markdown);
    const lines = text.split('\n');
    let start = 0;
    const firstHr = lines.findIndex((line) => /^---+\s*$/.test(line.trim()));
    if (firstHr >= 0) start = firstHr + 1;
    for (let i = start; i < lines.length; i += 1) {
      const match = lines[i].match(/^#\s+(.+?)\s*$/);
      if (match) return stripMarkdownInline(match[1].trim());
    }
    return '';
  }

  function topLevelViewerConfigMap(markdown) {
    const lines = normalizeMarkdown(markdown || '').split('\n');
    const map = {};
    let afterEnvelope = false;
    let inBody = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^---+\s*$/.test(line)) {
        afterEnvelope = true;
        continue;
      }
      if (!afterEnvelope) continue;
      if (/^#\s+/.test(line)) {
        if (!inBody) {
          inBody = true;
          continue;
        }
        break;
      }
      if (/^##\s+/.test(line)) break;
      const kv = keyValuePair(line);
      if (kv) pushMultiValue(map, kv.key, kv.value);
    }
    return map;
  }

  function renderHelpButton() {
    if (!configHasHelp()) return '<span class="topbar-side-spacer" aria-hidden="true"></span>';
    return `<button class="tv-btn subtle top-help-btn" data-action="open-config-help" aria-label="Open help">?</button>`;
  }









  function isWorkspaceFile(file) {
    const name = String(file?.name || file?.path || '').toLowerCase();
    return name.endsWith('.workspace.md');
  }

  function parseConfigDiscovery(markdown) {
    return markdownSectionContent(markdown, 'Workspace Discovery', 2);
  }

  function workspaceArtifactFilenameSafe(text) {
    const base = String(text || 'current-view')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/\.config\.md$/i, '')
      .replace(/\.workspace\.md$/i, '')
      .slice(0, 80) || 'current-view';
    return `${base}.workspace.md`;
  }


  async function exportCurrentLensConfig() {
    const markdown = await buildCurrentLensConfigMarkdown();
    const parsed = parseViewerConfigMarkdown(markdown, location.href);
    const filename = workspaceArtifactFilenameSafe(parsed.displayName || 'current-view');
    downloadText(filename, markdown, 'text/markdown;charset=utf-8');
    const localOnly = /Local-only items omitted/.test(markdown);
    toast(localOnly ? 'Exported .workspace.md. Local-only items are noted but not embedded.' : 'Exported current view as .workspace.md.', localOnly ? 'warn' : 'ok');
  }

  async function openWorkspaceFiles(files, options = {}) {
    const workspaces = Array.from(files || []).filter(isWorkspaceFile);
    for (const file of workspaces) {
      const text = await file.text();
      await openViewerConfigMarkdown(text, intakeRelativePath?.(file) || file.name || 'dropped.workspace.md', options);
    }
    return workspaces.length;
  }

  async function openViewerConfigMarkdown(markdown, configUrl, options = {}) {
    const url = configUrl || 'dropped.workspace.md';
    const parsed = parseViewerConfigMarkdown(markdown, url);
    parsed.configUrl = url;

    await applyParsedViewerConfig(parsed, url, Object.assign({ applyWorkspaceState: true }, options));

    const name = configDisplayName(parsed);
    const state = viewerStatePresence(parsed);
    if (parsed.viewerStateError) {
      toast(`Applied workspace: ${name}. Workspace state could not be parsed.`, 'warn');
    } else if (state === 'sources') {
      toast(`Opened workspace: ${name}. Workspace entrypoints applied.`, 'ok');
    } else if (state === 'empty') {
      toast(`Applied workspace: ${name}. Workspace state has no shareable workspaces.`, 'warn');
    } else {
      toast(`Applied workspace: ${name}. No workspace entrypoints found.`, 'warn');
    }

    render();
  }

  async function buildCurrentLensConfigMarkdown() {
    const cfg = app.viewerIdentity || {};
    const state = viewerStateForExport();
    const displayName = cfg.displayName || cfg.heading || 'Current Tiinex View';
    const descriptors = app.workspaces.map((ws, index) => workspaceExportDescriptor(ws, index, state.sources));
    const omitted = descriptors.filter((item) => !item.shareable || item.localOnlyItems);
    const subtitles = uniqueNonEmpty((viewerSubtitlePool?.() || []).map(subtitleForExport));
    const css = String(cfg.customCss || '').trim();
    const help = String(cfg.helpMarkdown || '').trim();

    const identityLines = linesOrEmpty([
      configLine('Label', cfg.label),
      configLine('Home', cfg.home, 'https://github.com/Tiinex'),
      configLine('Icon', cfg.icon),
      configLine('Accent', cfg.accent),
      configLine('Theme', cfg.theme)
    ]);

    const emptyStageLines = linesOrEmpty(subtitles.map((item) => `- Subtitle: ${item}`));
    const discovery = String(cfg.configDiscoveryMarkdown || '').trim();
    const workspaceEntrypoints = workspaceEntrypointsMarkdown(descriptors);
    const machineState = machineStateForExport(descriptors);

    const bodySections = [
      sectionBlock('Viewer Identity', identityLines),
      sectionBlock('Empty Stage', emptyStageLines),
      sectionBlock('Workspace Discovery', discovery),
      sectionBlock('Workspace Entrypoints', workspaceEntrypoints),
      help ? sectionBlock('Help', help) : '',
      css ? sectionBlock('Custom CSS', `\`\`\`css\n${css}\n\`\`\``) : '',
      machineState ? sectionBlock('Machine State', `\`\`\`json\n${JSON.stringify(machineState, null, 2)}\n\`\`\``) : ''
    ].filter(Boolean).join('\n\n');

    const summary = omitted.length
      ? `Portable workspace export for ${displayName}; local-only material is omitted.`
      : `Portable workspace export for ${displayName}.`;

    const markdown = `# Continuity Context

- Envelope Schema: [tiinex.root.v1](${TIINEX_ROOT_SCHEMA_URL})
- Current
  - Current Schema: [tiinex.workspace.v1](.topics/.schemas/tiinex.workspace.v1.schema.md)
  - Created At: ${continuityTimestamp()}
  - Why: Captures the current Tiinex viewer lens as a portable workspace entrypoint.
  - Summary: ${summary}

---

# ${displayName}

${bodySections}
`;

    return appendContinuityIntegrity(markdown, 'this exported workspace');
  }




  function helpMarkdownBaseUrl() {
    const cfgUrl = String(app.viewerIdentity?.configUrl || '').trim();
    if (!cfgUrl) return location.href;
    try {
      return new URL(cfgUrl, location.href).href;
    } catch (_) {
      return location.href;
    }
  }

  function helpAssetUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    const direct = safeUrl(raw);
    if (direct) return direct;
    try {
      return new URL(raw, helpMarkdownBaseUrl()).href;
    } catch (_) {
      return '';
    }
  }
  function renderConfigHelpModal() {
    const cfg = app.viewerIdentity || {};
    const display = String(cfg.displayName || cfg.heading || cfg.label || 'Tiinex').trim();
    const help = String(cfg.helpMarkdown || '').trim();
    return `<div class="modal-backdrop help-modal-backdrop">
      <section class="modal-card help-modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="modal-head help-modal-head">
          <div>
            <div class="kicker-inline">Workspace help</div>
            <h2 id="help-title">${escapeHtml(display)}</h2>
          </div>
          <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="help-body scan-first-help">
          ${renderWorkspaceHelpMarkdown(help)}
        </div>
      </section>
    </div>`;
  }




  function workspaceArtifactBaseUrl(configUrl) {
    const raw = String(configUrl || app.viewerIdentity?.configUrl || '').trim();
    if (!raw) return location.href;
    try {
      return new URL(raw, location.href).href;
    } catch (_) {
      return location.href;
    }
  }

  function viewerWorkspaceUrlFromLocation() {
    const params = new URLSearchParams(location.search);
    const explicit = params.get('viewerWorkspace') || params.get('workspace') || params.get('viewerConfig') || params.get('config') || params.get('identity');
    if (explicit) return explicit;

    const host = window.TiinexWorkspace || window.tiinexWorkspace || window.TIINEX_WORKSPACE || {};
    if (typeof host === 'string') return host;
    return host.defaultWorkspace || host.workspace || host.viewerWorkspace || '';
  }






  function isFileProtocolUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;
    try {
      return new URL(raw, location.href).protocol === 'file:';
    } catch (_) {
      return /^file:/i.test(raw);
    }
  }

  function assetPageFallback(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const match = raw.match(/(?:^|\/)(assets\/[^?#]+)/i);
    if (match) return match[1];
    const file = raw.split(/[?#]/)[0].split('/').filter(Boolean).pop();
    if (file && /\.(png|jpe?g|webp|gif|svg)$/i.test(file)) return `assets/${file}`;
    return '';
  }

  async function fetchText(url, label = 'resource') {
    const resolved = (() => {
      try { return new URL(url, location.href).href; } catch (_) { return String(url || ''); }
    })();

    if (isFileProtocolUrl(resolved) && location.protocol === 'file:') {
      throw new Error(`${label} is local-only in file:// mode; drop the file or host the viewer over http://localhost.`);
    }

    const response = await fetch(resolved, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    return response.text();
  }




  const EMBEDDED_DEFAULT_WORKSPACE_MD = "# Continuity Context\n\n- Envelope Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md)\n- Current\n  - Current Schema: [tiinex.workspace.v1](../.schemas/tiinex.workspace.v1.schema.md)\n  - Created At: 2026-06-16 00:00:00\n  - Why: Defines a portable multi-lineage workspace entrypoint.\n  - Summary: Opens the Tiinex docs workspace and declares the default viewer discovery lens.\n\n---\n\n# Tiinex Viewer\n\n## Viewer Identity\n\n- Icon: ../../assets/tiinex-logo-white-transparent.png\n- Home: https://github.com/Tiinex\n\n## Empty Stage\n\n- Subtitle: Every handoff starts somewhere\n- Subtitle: Start where the last thread ends\n- Subtitle: Leave enough for the next mind\n- Subtitle: A thread is waiting\n- Subtitle: Nothing starts from nothing\n\n## Workspace Discovery\n\n- [Tiinex docs workspaces](https://github.com/Tiinex/docs)\n  - Kind: github-tree\n  - Ref: master\n  - Root Path: .topics\n  - Match: *.workspace.md\n  - Label: Tiinex docs workspaces\n  - Open Behavior: chooser\n\n## Workspace Entrypoints\n\n### Tiinex docs\n\n- Source Kind: github-tree\n- Repository: Tiinex/docs\n- Ref: master\n- Root Path: .topics\n- Default View: feed\n- Default Filter: all\n\n## Help\n\n### What is this view?\n\nThis workspace opens Tiinex markdown artifacts so an external reviewer and their LLM helpers can inspect continuity, source material, integrity signals, and continuation paths.\n\n### What should I check first?\n\nStart with what is loaded.\n\nCheck the workspace source, then inspect the visible badges. Treat integrity mismatch, missing integrity, unknown schema, and local-only material as review signals, not automatic failure.\n\n### What should I trust?\n\nTrust only what the artifact and its sources actually show.\n\nUse `Source` to inspect where material came from, `Markdown` to read the artifact, `Open` to inspect the selected node, and `Continue` only when the next step is clear enough to preserve.\n\n### What should an LLM preserve?\n\nDo not collapse Parent and Origin.\n\nParent is the declared continuity edge. Origin is provenance for where the material came from. If either is missing or weak, say so rather than filling the gap.\n\n### What should I send back?\n\nA useful validation note names the selected artifact, the source inspected, the observed signal, and the smallest next correction or continuation.\n\n---\n\n# Continuity Integrity\n\n- sha256-base64url-c14n-v1\n  - Towards: [viewer.workspace.md](viewer.workspace.md)\n  - Value: 6vM2gDbZwBwAFL5ZsH8hVXRnsdLd3gpyHcIetgRS7GQ\n";

  function pageHasExplicitWorkspaceQuery() {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get('viewerWorkspace') || params.get('workspace') || params.get('viewerConfig') || params.get('config') || params.get('identity'));
  }






  function shouldUseEmbeddedDefaultWorkspace() {
    // Hash state describes current opened sources; it should not block loading
    // the default workspace shell/identity in static disk mode.
    return location.protocol === 'file:' && !pageHasExplicitWorkspaceQuery();
  }

  function workspaceAssetUrl(value, configUrl) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const pageFallback = assetPageFallback(raw);

    // In file:// mode, never prefer a resolved file URL that may walk outside
    // the app folder. Packaged assets should resolve relative to index.html.
    if (location.protocol === 'file:') {
      if (pageFallback) return pageFallback;
      if (/^file:/i.test(raw)) return DEFAULT_TIINEX_BRAND_ASSET;
    }

    if (/^(data:|blob:)/i.test(raw)) return pageFallback || '';

    const direct = safeUrl(raw);
    if (direct) return direct;

    try {
      return new URL(raw, workspaceArtifactBaseUrl(configUrl)).href;
    } catch (_) {
      return pageFallback || '';
    }
  }










  function staticDiskMode() {
    return location.protocol === 'file:';
  }

  function cleanHashOnly() {
    if (!location.hash) return;
    try {
      history.replaceState({ v: 'static-disk', sources: [] }, '', `${location.pathname}${location.search}`);
    } catch (_) {}
  }





  const DEFAULT_TIINEX_BRAND_ASSET = 'assets/tiinex-logo-white-transparent.png';

  function packagedAssetUrlFromAnyPath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const clean = raw.split(/[?#]/)[0].replace(/\\/g, '/');
    const idx = clean.toLowerCase().lastIndexOf('/assets/');
    if (idx >= 0) return clean.slice(idx + 1);
    const idx2 = clean.toLowerCase().indexOf('assets/');
    if (idx2 >= 0) return clean.slice(idx2);
    const file = clean.split('/').filter(Boolean).pop();
    if (file && /^tiinex-.*\.(png|jpe?g|webp|gif|svg)$/i.test(file)) return `assets/${file}`;
    return '';
  }




  // --- Workspace/config markdown parsing ---

  function parseViewerConfigMarkdown(markdown, configUrl) {
    const out = {};
    const text = normalizeMarkdown(markdown || '');
    const h1 = firstBodyH1AfterEnvelope(text);
    if (h1) {
      out.heading = h1;
      out.displayName = h1;
    }

    const identity = sectionKeyValueMap(markdownSectionContent(text, 'Viewer Identity', 2));
    const topLevelConfig = topLevelViewerConfigMap(text);

    function readIdentityField(names) {
      return firstKv(identity, names) || firstKv(topLevelConfig, names);
    }

    const topLevelDisplay = readIdentityField(['Display Name', 'Display-name']);
    if (!out.displayName && topLevelDisplay) out.displayName = topLevelDisplay;

    const label = readIdentityField(['Label']);
    if (label) out.label = label;
    const icon = readIdentityField(['Icon', 'Logo', 'Mark']);
    if (icon) {
      out.iconRaw = icon;
      out.icon = workspaceAssetUrl(icon, configUrl);
    }
    const home = readIdentityField(['Home', 'Href', 'Link', 'URL']);
    if (home) out.home = markdownConfigValue(home, configUrl);
    const accent = readIdentityField(['Accent']);
    if (accent) out.accent = accent;
    const theme = readIdentityField(['Theme']);
    if (theme) out.theme = theme;
    const css = readIdentityField(['CSS', 'Stylesheet', 'Style']);
    if (css) out.cssUrl = workspaceAssetUrl(css, configUrl);

    Object.assign(out, parseEmptyStage(text));
    out.configDiscoveryMarkdown = parseConfigDiscovery(text);
    const help = helpMarkdownFromConfig(text);
    if (help) out.helpMarkdown = help;

    const viewerState = extractViewerStateJson(text);
    const machineState = extractMachineStateJson(text);
    if (viewerState?.__parseError) out.viewerStateError = viewerState.__parseError;
    else if (viewerState) out.viewerState = viewerState;
    else {
      const generated = parseWorkspaceEntrypoints(text, configUrl, machineState && !machineState.__parseError ? machineState : null);
      if (generated) out.viewerState = generated;
    }
    if (machineState?.__parseError) out.machineStateError = machineState.__parseError;
    else if (machineState) out.machineState = machineState;

    out.customCss = extractViewerCustomCss(text);
    return out;
  }

  async function applyEmbeddedDefaultWorkspace() {
    app.viewerIdentity.configUrl = '.topics/.workspaces/viewer.workspace.md';
    const parsed = parseViewerConfigMarkdown(EMBEDDED_DEFAULT_WORKSPACE_MD, app.viewerIdentity.configUrl);
    await applyParsedViewerConfig(parsed, app.viewerIdentity.configUrl, { applyWorkspaceState: true });
  }

  async function loadViewerConfig() {
    const explicitOrHost = viewerWorkspaceUrlFromLocation();
    const configuredByUrl = pageHasExplicitWorkspaceQuery();
    const configuredByHost = Boolean(explicitOrHost) && !configuredByUrl;
    const defaultCandidates = ['.topics/.workspaces/viewer.workspace.md', 'viewer.workspace.md'];

    if (shouldUseEmbeddedDefaultWorkspace()) {
      try {
        await applyEmbeddedDefaultWorkspace();
      } catch (error) {
        app.viewerIdentity.error = error?.message || String(error || '');
        applyViewerCustomCss('');
      }
      return;
    }

    const candidates = (configuredByUrl || configuredByHost) ? [explicitOrHost] : defaultCandidates;

    let lastError = null;
    for (const candidate of candidates) {
      const url = normalizeViewerConfigUrl(candidate);
      app.viewerIdentity.configUrl = url;
      try {
        if (location.protocol === 'file:' && isFileProtocolUrl(url)) {
          throw new Error('Cannot fetch a .workspace.md file from file://. Use embedded default, drag/drop, or host over http://localhost.');
        }
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
        const markdown = await response.text();
        const parsed = parseViewerConfigMarkdown(markdown, url);
        await applyParsedViewerConfig(parsed, url, { applyWorkspaceState: true });
        return;
      } catch (error) {
        lastError = error;
        if (configuredByUrl || configuredByHost || location.protocol === 'file:') break;
      }
    }

    app.viewerIdentity.error = lastError?.message || String(lastError || '');
    applyViewerCustomCss('');
  }




  function resolveWorkspaceIconForRender() {
    const cfg = app.viewerIdentity || {};
    const configured = String(cfg.icon || cfg.iconRaw || '').trim();
    const candidates = [
      configured,
      DEFAULT_TIINEX_BRAND_ASSET
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (/^https?:/i.test(candidate)) return candidate;
      const packaged = packagedAssetUrlFromAnyPath(candidate);
      if (packaged) return packaged;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) && /\.(png|jpe?g|webp|gif|svg)$/i.test(candidate)) {
        return candidate.replace(/^(\.\/)+/, '');
      }
    }

    return DEFAULT_TIINEX_BRAND_ASSET;
  }






  // --- Branding and viewer chrome ---

  function renderViewerBrand() {
    const cfg = app.viewerIdentity || {};
    const label = String(cfg.label || '').trim();
    const display = String(cfg.displayName || cfg.heading || label || 'Tiinex').trim();
    const summary = String(cfg.summaryText || '').trim();
    const home = cfg.home || 'https://github.com/Tiinex';
    const href = safeUrl(home) || 'https://github.com/Tiinex';
    const title = summary ? `${display}\n${summary}` : display;
    const iconUrl = resolveWorkspaceIconForRender();
    const fallbackIcon = DEFAULT_TIINEX_BRAND_ASSET;
    const onerror = "if(this.dataset.fallbackSrc&&!this.dataset.fallbackUsed){this.dataset.fallbackUsed='1';this.src=this.dataset.fallbackSrc}else{this.style.display='none';this.parentElement&&this.parentElement.classList.add('show-letter-fallback')}";

    return `<a class="brand-inline viewer-brand viewer-brand-link ${label ? 'has-label' : 'symbol-only'}" href="${escapeAttr(href)}" target="_blank" rel="noopener" title="${escapeAttr(title)}" aria-label="${escapeAttr(display)}">
      <span class="viewer-brand-link-slot">
        <span class="viewer-brand-link-letter" aria-hidden="true">T</span>
        <img class="viewer-brand-link-img" src="${escapeAttr(iconUrl)}" data-fallback-src="${escapeAttr(fallbackIcon)}" onerror="${escapeAttr(onerror)}" alt="" aria-hidden="true" loading="eager">
      </span>
      ${label ? `<span class="brand-label">${escapeHtml(label)}</span>` : ''}
    </a>`;
  }




  function activeSearchSnapshot(input) {
    if (!input) return null;
    return {
      wsId: input.dataset.ws || '',
      mode: input.dataset.search || input.dataset.mode || input.dataset.searchMode || 'discovery',
      value: input.value || '',
      start: Number(input.selectionStart ?? (input.value || '').length),
      end: Number(input.selectionEnd ?? (input.value || '').length)
    };
  }

  function restoreSearchFocus(snapshot) {
    if (!snapshot?.wsId) return;
    requestAnimationFrame(() => {
      const selector = `input[data-ws="${CSS.escape(snapshot.wsId)}"][data-search="${CSS.escape(snapshot.mode)}"]`;
      const next = document.querySelector(selector);
      if (!next) return;
      next.focus({ preventScroll: true });
      const len = (next.value || '').length;
      const start = Math.max(0, Math.min(snapshot.start, len));
      const end = Math.max(start, Math.min(snapshot.end, len));
      try {
        next.setSelectionRange(start, end);
      } catch (_) {}
    });
  }

  function scheduleSearchRender(snapshot) {
    const key = `${snapshot.wsId}:${snapshot.mode}`;
    app.searchDebounceTimers = app.searchDebounceTimers || {};
    clearTimeout(app.searchDebounceTimers[key]);
    app.searchDebounceTimers[key] = setTimeout(() => {
      render();
      restoreSearchFocus(snapshot);
    }, 180);
  }

  function onSearchInput(event) {
    const input = event.currentTarget || event.target;
    if (!targetLooksSearchInput(input)) return;
    const ws = getWorkspace(input.dataset.ws);
    const mode = input.dataset.search || input.dataset.mode || input.dataset.searchMode || 'discovery';
    if (!ws) return;

    const value = input.value || '';
    if (mode === 'lineage') ws.lineageSearch = value;
    else ws.discoverySearch = value;

    const wrapper = input.closest?.('.search-box');
    if (wrapper) wrapper.classList.toggle('active', Boolean(value));

    scheduleSearchRender(activeSearchSnapshot(input));
  }




  function isSchemaPath(path) {
    return /\.schema\.md(?:$|[?#])/i.test(String(path || ''));
  }

  function schemaFilenameFromText(schemaText) {
    let text = stripMarkdownInline(String(schemaText || '')).trim();
    text = text.replace(/^schema:\s*/i, '').replace(/^[`'"]|[`'"]$/g, '');
    if (!text || /unknown|plain/i.test(text)) return '';

    const file = fileNameFromPath(stripUrlDecorations(text));
    if (/\.schema\.md$/i.test(file)) return file;

    let key = schemaKey(text);
    if (!key || key === 'unknown') {
      key = text.replace(/^tiinex\./i, '').replace(/\.schema\.md$/i, '').replace(/\.v\d+$/i, '');
    }
    key = String(key || '').trim().toLowerCase();
    if (!key) return '';

    if (/^tiinex\.[a-z0-9._-]+\.v\d+$/i.test(text)) return `${text}.schema.md`;
    if (/^tiinex\./i.test(text)) return `${text.replace(/\.schema\.md$/i, '')}.schema.md`.replace(/^.*\//, '');
    return `tiinex.${key}.v1.schema.md`;
  }

  function schemaPathCandidatesForNode(ws, node) {
    const rawSchema = String(node?.currentSchema || node?.currentSchemaText || '').trim();
    const schemaText = node?.currentSchemaText || rawSchema;
    const candidates = [];
    const add = (path) => {
      const clean = normalizeRepoPath(stripUrlDecorations(path || ''));
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };

    const link = parseMarkdownLink(rawSchema);
    if (link.href) add(joinPath(dirname(node.path || ''), link.href));

    const filename = schemaFilenameFromText(schemaText);
    if (filename) {
      add(filename);
      add(`.topics/.schemas/${filename}`);
      add(`.schemas/${filename}`);
      if (node.path) add(joinPath(dirname(node.path), filename));
      if (node.path) add(joinPath(dirname(node.path), '../.schemas', filename));
      const topicsIndex = String(node.path || '').indexOf('.topics/');
      if (topicsIndex >= 0) add(`${String(node.path).slice(0, topicsIndex)}.topics/.schemas/${filename}`);
    }

    return candidates;
  }

  function loadedSchemaNodeForCandidates(ws, candidates, schemaText = '') {
    if (!ws) return null;
    const wantedNames = new Set(candidates.map(fileNameFromPath).filter(Boolean).map((name) => name.toLowerCase()));
    const schemaFile = schemaFilenameFromText(schemaText).toLowerCase();
    if (schemaFile) wantedNames.add(schemaFile);
    for (const candidate of candidates) {
      const found = sameWorkspacePathLookup(ws, candidate);
      if (found) return found;
    }
    for (const node of ws.nodes || []) {
      const name = fileNameFromPath(node.path || '').toLowerCase();
      if (wantedNames.has(name)) return node;
      if (isSchemaPath(node.path) && schemaFile && schemaFile === name) return node;
    }
    return null;
  }

  function schemaFetchCandidateForNode(ws, node) {
    const candidates = schemaPathCandidatesForNode(ws, node);
    const existing = loadedSchemaNodeForCandidates(ws, candidates, node?.currentSchemaText || node?.currentSchema || '');
    if (existing) return { existing, candidates };

    const path = candidates.find((item) => isSchemaPath(item)) || '';
    if (!path) return { existing: null, candidates };

    const repo = node?.repo || ws?.repo || '';
    const ref = node?.ref || ws?.ref || '';
    if (repo && ref && !/^[a-z]+:/i.test(path)) {
      return {
        existing: null,
        candidates,
        path,
        rawUrl: githubRawUrl(repo, ref, path),
        browseUrl: githubBrowseUrl(repo, ref, path),
        repo,
        ref
      };
    }

    if (node?.rawUrl) {
      try {
        return {
          existing: null,
          candidates,
          path,
          rawUrl: new URL(path, sourceUrlDirectory(node.rawUrl)).toString(),
          browseUrl: '',
          repo,
          ref
        };
      } catch (_) {}
    }

    return { existing: null, candidates, path };
  }

  async function openSchemaNode(ws, schemaNode, reason = 'schema') {
    if (!ws || !schemaNode) return;
    app.activeWorkspaceId = ws.id;
    ws.selectedNodeId = schemaNode.id;
    focusWorkspaceWindow(ws.id);
    toast(`Opened ${reason}: ${shortSchema(schemaNode.currentSchemaText || schemaNode.currentSchema || schemaNode.path)}.`, 'ok');
    setRouteState('push');
    render();
  }

  async function openSchemaForNode(ws, node) {
    if (!ws || !node) return;
    const candidate = schemaFetchCandidateForNode(ws, node);
    if (candidate.existing) return openSchemaNode(ws, candidate.existing, 'reading contract');

    if (!candidate.rawUrl) {
      toast('Schema is not loaded or resolvable from this workspace.', 'warn');
      return;
    }

    try {
      const content = await fetchText(candidate.rawUrl, 'schema');
      addFileToWorkspace(ws, {
        path: candidate.path || fileNameFromPath(candidate.rawUrl),
        content,
        rawUrl: candidate.rawUrl,
        browseUrl: candidate.browseUrl || '',
        repo: candidate.repo || ws.repo || '',
        ref: candidate.ref || ws.ref || ''
      });
      computeWorkspaceIndex(ws);
      const loaded = loadedSchemaNodeForCandidates(ws, candidate.candidates, node.currentSchemaText || node.currentSchema)
        || Array.from(ws.nodeById.values()).find((item) => item.rawUrl === candidate.rawUrl);
      if (loaded) return openSchemaNode(ws, loaded, 'reading contract');
      toast('Schema was fetched but could not be indexed as a lineage artifact.', 'warn');
      render();
    } catch (error) {
      toast(`Could not open schema: ${error.message}`, 'warn');
    }
  }

  function schemaRefLoadedNode(ws, ref) {
    if (!ws || !ref) return null;
    const candidates = [ref.path, fileNameFromPath(ref.path || ref.rawUrl || ref.href)].filter(Boolean);
    return loadedSchemaNodeForCandidates(ws, candidates, ref.path || ref.href || '')
      || Array.from(ws.nodeById?.values?.() || []).find((node) => node.rawUrl === ref.rawUrl || node.browseUrl === ref.browseUrl);
  }

  async function openSchemaReference(ws, node, ref) {
    if (!ws || !node || !ref) return;
    const existing = schemaRefLoadedNode(ws, ref);
    if (existing) return openSchemaNode(ws, existing, 'schema reference');

    const rawUrl = ref.rawUrl || '';
    if (!rawUrl) {
      toast('Schema reference is not resolvable from this workspace.', 'warn');
      return;
    }

    try {
      const content = await fetchText(rawUrl, 'schema reference');
      addFileToWorkspace(ws, {
        path: ref.path || fileNameFromPath(rawUrl),
        content,
        rawUrl,
        browseUrl: ref.browseUrl || ref.sourceUrl || '',
        repo: ref.repo || ws.repo || '',
        ref: ref.ref || ws.ref || ''
      });
      computeWorkspaceIndex(ws);
      const loaded = schemaRefLoadedNode(ws, ref) || Array.from(ws.nodeById.values()).find((candidate) => candidate.rawUrl === rawUrl);
      if (loaded) return openSchemaNode(ws, loaded, 'schema reference');
      toast('Schema reference was fetched but could not be indexed.', 'warn');
      render();
    } catch (error) {
      toast(`Could not open schema reference: ${error.message}`, 'warn');
    }
  }

  function schemaBadgeHtml(ws, node, schema) {
    const label = shortSchema(schema);
    if (!schema || /unknown|plain/i.test(schema)) {
      return `<span class="badge-soft badge-schema ${schemaBadgeClass(schema)}">${escapeHtml(label)}</span>`;
    }
    return `<button type="button" class="badge-soft badge-schema schema-nav-badge ${schemaBadgeClass(schema)}" data-action="open-schema-badge" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" title="Open the reading contract schema lineage" aria-label="Open the reading contract schema lineage">${escapeHtml(label)}</button>`;
  }

  function materialKindFor(ref) {
    const path = ref.path || ref.href || ref.rawUrl || ref.sourceUrl || '';
    if (isSchemaPath(path)) return 'schema';
    if (isTracePath(path)) return 'trace';
    if (ref.image || isImagePath(path)) return 'image';
    if (isTextPreviewPath(path)) return /\.md|\.markdown/i.test(fileExtension(path)) ? 'markdown' : 'text';
    if (/^https?:\/\//i.test(ref.href || ref.sourceUrl || '')) return 'external';
    return 'file';
  }

  function previewMaterialKindLabel(kind) {
    return {
      schema: 'Schema reference',
      trace: 'Trace reference',
      image: 'Image',
      markdown: 'Markdown',
      text: 'Text',
      file: 'File',
      external: 'External URL',
      unresolved: 'Unresolved'
    }[kind] || 'Reference';
  }

  function materialIcon(kind) {
    return {
      schema: 'fa-solid fa-scale-balanced',
      trace: 'fa-solid fa-code-branch',
      image: 'fa-regular fa-image',
      markdown: 'fa-brands fa-markdown',
      text: 'fa-regular fa-file-lines',
      file: 'fa-regular fa-file',
      external: 'fa-solid fa-arrow-up-right-from-square',
      unresolved: 'fa-solid fa-circle-question'
    }[kind] || 'fa-regular fa-file';
  }

  function materialSummary(refs) {
    const counts = refs.reduce((acc, ref) => {
      acc[ref.kind] = (acc[ref.kind] || 0) + 1;
      return acc;
    }, {});
    const total = refs.length;
    const bits = [];
    if (total) bits.push(`${total} ref${total === 1 ? '' : 's'}`);
    if (counts.schema) bits.push(`${counts.schema} schema${counts.schema === 1 ? '' : 's'}`);
    if (counts.image) bits.push(`${counts.image} image${counts.image === 1 ? '' : 's'}`);
    if (counts.trace) bits.push(`${counts.trace} trace`);
    return bits;
  }

  function groupMaterialRefs(refs) {
    const order = ['schema', 'trace', 'image', 'markdown', 'text', 'file', 'external', 'unresolved'];
    const groups = new Map(order.map((key) => [key, []]));
    refs.forEach((ref) => {
      const key = groups.has(ref.kind) ? ref.kind : 'file';
      groups.get(key).push(ref);
    });
    return order.map((kind) => ({ kind, items: groups.get(kind) || [] })).filter((group) => group.items.length);
  }

  function renderMaterialPrimaryAction(ws, node, ref) {
    const idx = materialRefIndex(ws, node, ref);
    if (ref.kind === 'schema') {
      const existing = schemaRefLoadedNode(ws, ref);
      return `<button class="mini-action primary schema-mini-action" data-action="open-schema-reference" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" data-ref="${escapeAttr(idx)}">${existing ? 'Open schema' : 'Load schema'}</button>`;
    }
    if (ref.kind === 'trace') {
      if (ref.loadedNodeId) {
        return `<button class="mini-action primary" data-action="select-node" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(ref.loadedNodeId)}">Anchor</button>`;
      }
      if (ref.rawUrl) {
        return `<button class="mini-action primary" data-action="load-material-trace" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" data-ref="${escapeAttr(idx)}">Load trace</button>`;
      }
      return `<span class="mini-action disabled">Unresolved trace</span>`;
    }
    if (ref.kind === 'image' && ref.rawUrl) {
      return `<button class="mini-action primary" data-action="open-material-lightbox" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" data-ref="${escapeAttr(idx)}">Preview</button>`;
    }
    return '';
  }

  function resolveMaterialHref(ws, node, href, image = false, label = '') {
    const rawHref = cleanMaterialHref(href);
    if (!rawHref) return null;
    if (/^(mailto:|#)/i.test(rawHref)) return null;

    const base = {
      id: '',
      href: rawHref,
      label: label || fileNameFromPath(stripUrlDecorations(rawHref)) || rawHref,
      image,
      path: '',
      rawUrl: '',
      browseUrl: '',
      sourceUrl: '',
      repo: node.repo || ws?.repo || '',
      ref: node.ref || ws?.ref || '',
      loadedNodeId: '',
      kind: ''
    };

    if (/^https?:\/\//i.test(rawHref)) {
      const item = convertSourceUrl(rawHref);
      base.rawUrl = item?.rawUrl || rawHref;
      base.browseUrl = item?.browseUrl || rawHref;
      base.sourceUrl = base.browseUrl || base.rawUrl || rawHref;
      base.path = item?.path || fileNameFromPath(new URL(rawHref).pathname);
      base.repo = item?.repo || base.repo;
      base.ref = item?.ref || base.ref;
    } else {
      const cleanNoDecor = stripUrlDecorations(rawHref);
      const targetPath = canonicalWorkspacePath(joinPath(dirname(node.path), cleanNoDecor));
      base.path = targetPath || cleanNoDecor;
      if (base.repo && base.ref && targetPath) {
        base.rawUrl = githubRawUrl(base.repo, base.ref, targetPath);
        base.browseUrl = githubBrowseUrl(base.repo, base.ref, targetPath);
        base.sourceUrl = base.browseUrl;
      } else if (node.rawUrl) {
        try {
          base.rawUrl = new URL(rawHref, sourceUrlDirectory(node.rawUrl)).toString();
          base.sourceUrl = base.rawUrl;
        } catch (_) {}
      }
    }

    base.kind = materialKindFor(base);
    if ((base.kind === 'trace' || base.kind === 'schema') && ws) {
      const existing = sameWorkspacePathLookup(ws, base.path)
        || Array.from(ws.nodeById?.values?.() || []).find((candidate) => candidate.rawUrl === base.rawUrl || candidate.browseUrl === base.browseUrl);
      if (existing) base.loadedNodeId = existing.id;
    }

    base.id = `${base.kind}:${base.path || base.rawUrl || base.href}`;
    return base;
  }
  registerActionHandler(async function schemaNavAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'open-schema-badge') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws);
      const node = ws?.nodeById.get(event.currentTarget.dataset.node);
      if (ws && node) await openSchemaForNode(ws, node);
      return;
    }
    if (action === 'open-schema-reference') {
      event.preventDefault();
      event.stopPropagation();
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) await openSchemaReference(ws, node, ref);
      return;
    }
    return next(event);
  });




  function encodeJsonBase64Url(value) {
    const json = JSON.stringify(value || {});
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeJsonBase64Url(value) {
    const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }


  function viewRouteUrl(state) {
    return `${location.pathname}${location.search}#view=${encodeJsonBase64Url(state)}`;
  }

  function decodeViewRouteFromHash() {
    const match = String(location.hash || '').match(/^#view=([A-Za-z0-9_-]+)$/);
    if (!match) return null;
    try {
      const state = decodeJsonBase64Url(match[1]);
      return state?.kind === 'view' ? state : null;
    } catch (_) {
      return null;
    }
  }


  function setRouteState(kind = 'push') {
    if (app.routing?.restoring || app.isBootingFromUrl) return;

    if (staticDiskMode()) {
      if (!app.workspaces.length) {
        if (location.hash) cleanHashOnly();
        return;
      }
      const state = viewRouteState();
      const next = viewRouteUrl(state);
      const current = `${location.pathname}${location.search}${location.hash}`;
      if (next === current) return;
      if (kind === 'replace') history.replaceState(state, '', next);
      else history.pushState(state, '', next);
      return;
    }

    const state = routeState();
    if (!app.workspaces.length || !state.sources?.length) {
      replaceWithCleanViewerUrl();
      return;
    }

    const next = routeUrl(state);
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (next === current) return;
    if (kind === 'replace') history.replaceState(state, '', next);
    else history.pushState(state, '', next);
  }

  function updateUrlState(options = {}) {
    setRouteState(options.replace ? 'replace' : 'push');
  }

  async function bootFromUrl() {
    const params = new URLSearchParams(location.search);
    const direct = params.get('url');
    app.isBootingFromUrl = true;
    try {
      if (staticDiskMode()) {
        const viewState = decodeViewRouteFromHash();
        if (viewState) applyViewRouteState(viewState);
        else if (/^#state=/i.test(location.hash || '')) cleanHashOnly();
        return;
      }

      const state = decodeRouteStateFromHash();
      if (state && Array.isArray(state.sources) && state.sources.length) {
        const restored = await applyRouteState(state, true);
        if (restored) return;
      }

      if (state && Array.isArray(state.sources) && !state.sources.length) {
        replaceWithCleanViewerUrl();
        return;
      }

      if (direct) {
        const ws = createWorkspace('Shared trace URL', 'Loaded from ?url=.');
        await loadUrlsIntoWorkspace(ws, [direct]);
        app.activeWorkspaceId = ws.id;
        return;
      }

      if (location.hash) replaceWithCleanViewerUrl();
    } catch (error) {
      toast(`Could not restore URL state: ${error.message}`, 'warn');
      if (!staticDiskMode()) replaceWithCleanViewerUrl();
    } finally {
      app.isBootingFromUrl = false;
    }
  }

  async function restoreRouteFromBrowserHistory() {
    try {
      if (staticDiskMode()) {
        const state = decodeViewRouteFromHash();
        if (state) {
          applyViewRouteState(state);
          render();
        }
        return;
      }

      const state = decodeRouteStateFromHash();
      if (!state) return;
      const restored = await applyRouteState(state, !routeSourcesMatch(state));
      if (restored) render();
    } catch (error) {
      toast(`Could not restore browser history state: ${error.message}`, 'warn');
      render();
    }
  }






  function nodeActionDatasetAttrs(dataset = {}) {
    return Object.entries(dataset).map(([key, value]) => {
      if (value === undefined || value === null || value === '') return '';
      const attr = `data-${String(key).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
      return ` ${attr}="${escapeAttr(String(value))}"`;
    }).join('');
  }

  function nodeActionItems(ws, node, opts = {}) {
    const base = { ws: ws.id, node: node.id };
    const expanded = Boolean(node.expanded);
    const inLineage = Boolean(opts.lineage);
    const isTarget = ws.selectedNodeId === node.id;
    const items = [];

    items.push(inLineage
      ? {
        label: 'Anchor',
        icon: 'fa-solid fa-anchor',
        className: `anchor-action ${isTarget ? 'active-target' : ''}`,
        dataset: Object.assign({ action: 'select-node' }, base),
        title: 'Anchor this trace as the viewer target and redraw the parent lineage from here'
      }
      : {
        label: expanded ? 'Less' : 'More',
        icon: `fa-solid ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`,
        dataset: Object.assign({ action: 'toggle-node-expand' }, base),
        title: expanded ? 'Collapse continuity preview' : 'Expand continuity preview'
      });

    items.push(
      { label: 'Open', icon: 'fa-regular fa-window-maximize', dataset: Object.assign({ action: 'open-detail-modal' }, base), title: 'Open focused schema read view' },
      { label: 'Markdown', icon: 'fa-brands fa-markdown', dataset: Object.assign({ action: 'open-markdown-modal' }, base), title: 'Open raw markdown source' },
      { label: 'Continue', icon: 'fa-solid fa-code-branch', dataset: Object.assign({ action: 'open-create', mode: 'continue' }, base), disabled: node.hasModernEnvelope === false, title: 'Create a continuation leaf from this trace' },
      { label: 'Reference', icon: 'fa-solid fa-link', className: 'gold', dataset: Object.assign({ action: 'open-create', mode: 'reference' }, base), title: 'Create a reference leaf pointing at this trace' }
    );

    if (node.browseUrl) {
      items.push({ label: 'Source', icon: 'fa-brands fa-github', className: 'anchor', href: safeUrl(node.browseUrl) || node.browseUrl, title: 'Open original source location' });
    }
    if (typeof canEditNode === 'function' && canEditNode(ws, node)) {
      items.push({ label: 'Edit', icon: 'fa-solid fa-pen-to-square', className: 'constructive compact-tail-action edit-action', dataset: Object.assign({ action: 'open-node-edit' }, base), title: 'Edit local markdown' });
    }
    if (typeof canRemoveNodeForNow === 'function' && canRemoveNodeForNow(ws, node)) {
      items.push({ label: 'Remove', icon: 'fa-regular fa-trash-can', className: 'danger compact-tail-action remove-action', dataset: Object.assign({ action: 'remove-local-node' }, base), danger: true, title: 'Remove this local/uploaded node from the current workspace' });
    }

    return items;
  }

  function renderNodeActionItem(action) {
    const classes = `icon-action ${action.className || ''}`.trim();
    const title = action.title || action.label || 'Action';
    const icon = `<i class="${escapeAttr(action.icon || 'fa-solid fa-circle-dot')}"></i>`;
    const body = `${icon}<span>${escapeHtml(action.label || 'Action')}</span>`;
    if (action.href) {
      return `<a class="${escapeAttr(classes)}" href="${escapeAttr(action.href)}" target="_blank" rel="noopener" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${body}</a>`;
    }
    return `<button class="${escapeAttr(classes)}"${nodeActionDatasetAttrs(action.dataset)}${action.disabled ? ' disabled' : ''} title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${body}</button>`;
  }

  function renderNodePost(ws, node, opts = {}) {
    const schema = node.currentSchemaText || (node.hasModernEnvelope ? 'unknown schema' : 'plain markdown');
    const relation = relationLabel(node, opts.index || 0, opts.lineage);
    const expanded = Boolean(node.expanded);
    const isTarget = ws.selectedNodeId === node.id;
    const inLineage = Boolean(opts.lineage);
    const mainAction = inLineage ? 'toggle-node-expand' : 'select-node';
    const mainTitle = inLineage ? (expanded ? 'Collapse continuity preview' : 'Expand continuity preview') : 'Set this card as the viewer lineage target';
    const mainClass = inLineage ? 'post-main-toggle' : 'post-main-target';
    const actionHtml = nodeActionItems(ws, node, opts).map(renderNodeActionItem).join('');

    return `
      <article class="lineage-post ${expanded ? 'expanded' : ''} ${node.isGenerated ? 'generated' : ''} ${typeof isSchemaPath === 'function' && isSchemaPath(node.path) ? 'schema-lineage-post' : ''}" data-node="${escapeAttr(node.id)}" data-source="${escapeAttr(node.sourceId || '')}">
        <div class="post-main ${mainClass}" data-action="${mainAction}" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" title="${escapeAttr(mainTitle)}" aria-label="${escapeAttr(mainTitle)}">
          <div class="post-chips">
            ${integrityBadge(node)}
            ${typeof schemaBadgeHtml === 'function' ? schemaBadgeHtml(ws, node, schema) : `<span class="badge-soft badge-schema ${schemaBadgeClass(schema)}">${escapeHtml(shortSchema(schema))}</span>`}
            ${node.createdAt ? `<span class="badge-soft muted-chip">${escapeHtml(node.createdAt.slice(0, 10))}</span>` : ''}
            ${relationChipHtml(ws, node, relation, isTarget, inLineage)}
            ${typeof materialSchemaBadges === 'function' ? materialSchemaBadges(ws, node) : ''}
            ${renderSourceBadge(ws, node)}
            ${node.isGenerated ? '<span class="badge-soft"><i class="fa-solid fa-pen-nib"></i>draft</span>' : ''}
          </div>
          <h3 class="post-title">${escapeHtml(node.title)}</h3>
          <p class="post-summary">${escapeHtml(shortText(node.summary || node.why || 'No summary extracted.', 280))}</p>
        </div>
        ${expanded ? `<div class="continuity-preview">${renderContinuityPreview(node, ws)}</div>` : ''}
        <div class="post-actions">${actionHtml}</div>
      </article>`;
  }




  function discoveryFilterLabel(key) {
    const labels = {
      all: 'All',
      topic: 'Topics',
      decision: 'Decisions',
      evidence: 'Evidence',
      feedback: 'Feedback',
      task: 'Tasks',
      reduction: 'Reductions',
      draft: 'Drafts',
      schema: 'Schemas'
    };
    if (labels[key]) return labels[key];
    return String(key || '').split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Other';
  }

  function discoveryFilterSortKey(key) {
    const order = ['all', 'topic', 'decision', 'evidence', 'feedback', 'task', 'reduction', 'schema', 'draft'];
    const index = order.indexOf(key);
    return index >= 0 ? `${String(index).padStart(3, '0')}:${key}` : `999:${key}`;
  }

  function workspaceAvailableDiscoveryFilters(ws) {
    const keys = new Set();
    for (const node of ws?.nodes || []) {
      if (node.isGenerated) keys.add('draft');
      const key = schemaKey(node.currentSchemaText || node.currentSchema);
      if (key && key !== 'unknown' && !/plain/i.test(key)) keys.add(key);
    }

    const sorted = Array.from(keys).sort((a, b) => discoveryFilterSortKey(a).localeCompare(discoveryFilterSortKey(b)));
    return [['all', 'All'], ...sorted.map((key) => [key, discoveryFilterLabel(key)])];
  }

  function normalizeDiscoveryFilterForWorkspace(ws) {
    const current = ws.discoveryFilterSchema || ws.filterSchema || 'all';
    const options = workspaceAvailableDiscoveryFilters(ws).map(([key]) => key);
    if (!options.includes(current)) {
      ws.discoveryFilterSchema = 'all';
      ws.filterSchema = 'all';
      return 'all';
    }
    return current;
  }






  // Root contract: when Towards is not self, hash the artifact identified by
  // Towards, not the current node and not automatically the parent node.
  app.integrityTargetHashCache = app.integrityTargetHashCache || {};

  function cleanIntegrityTowards(value) {
    return String(value || '').trim().replace(/^["']|["']$/g, '');
  }

  function integrityTowardsRef(node) {
    const raw = cleanIntegrityTowards(node?.integrity?.towards || '');
    const link = parseMarkdownLink(raw);
    return {
      raw,
      text: cleanIntegrityTowards(link.text || raw),
      href: cleanIntegrityTowards(link.href || '')
    };
  }

  function integrityTargetPathCandidates(ws, node, target) {
    const candidates = [];
    const add = (value) => {
      const clean = normalizeRepoPath(stripUrlDecorations(value || ''));
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };

    const href = target.href || target.text || '';
    if (!href) return candidates;

    if (/^https?:\/\//i.test(href)) {
      const converted = convertSourceUrl(href);
      if (converted?.path) add(converted.path);
      const file = fileNameFromPath(converted?.path || href);
      if (file) {
        add(file);
        add(`.topics/.schemas/${file}`);
        add(`.schemas/${file}`);
      }
      return candidates;
    }

    add(href);
    if (node?.path) add(joinPath(dirname(node.path), href));
    if (node?.path) add(joinPath(dirname(node.path), '../.schemas', fileNameFromPath(href)));
    const file = fileNameFromPath(href);
    if (file && file !== href) {
      add(file);
      add(`.topics/.schemas/${file}`);
      add(`.schemas/${file}`);
    }

    return candidates;
  }

  function loadedIntegrityTarget(ws, node, target, converted = null) {
    const candidates = integrityTargetPathCandidates(ws, node, target);

    if (converted?.rawUrl || converted?.browseUrl) {
      const exact = Array.from(ws?.nodeById?.values?.() || []).find((item) =>
        (converted.rawUrl && item.rawUrl === converted.rawUrl)
        || (converted.browseUrl && item.browseUrl === converted.browseUrl)
      );
      if (exact) return exact;
    }

    if (converted?.path) {
      const sameRef = Array.from(ws?.nodeById?.values?.() || []).find((item) =>
        item.path === converted.path
        && (!converted.repo || !item.repo || item.repo === converted.repo)
        && (!converted.ref || !item.ref || item.ref === converted.ref)
      );
      if (sameRef) return sameRef;
    }

    for (const candidate of candidates) {
      const found = sameWorkspacePathLookup(ws, candidate);
      if (found) return found;
    }

    const wantedNames = new Set(candidates.map(fileNameFromPath).filter(Boolean).map((name) => name.toLowerCase()));
    for (const item of ws?.nodes || []) {
      const name = fileNameFromPath(item.path || '').toLowerCase();
      if (wantedNames.has(name)) return item;
    }

    return null;
  }

  function remoteIntegrityTarget(ws, node, target) {
    const href = target.href || target.text || '';
    if (!href || /^self$/i.test(href)) return null;

    if (/^https?:\/\//i.test(href)) {
      const converted = convertSourceUrl(href);
      return {
        rawUrl: converted?.rawUrl || href,
        browseUrl: converted?.browseUrl || href,
        path: converted?.path || fileNameFromPath(href),
        repo: converted?.repo || node?.repo || ws?.repo || '',
        ref: converted?.ref || node?.ref || ws?.ref || ''
      };
    }

    const path = normalizeRepoPath(joinPath(dirname(node?.path || ''), href));
    const repo = node?.repo || ws?.repo || '';
    const ref = node?.ref || ws?.ref || '';
    if (repo && ref && path) {
      return {
        rawUrl: githubRawUrl(repo, ref, path),
        browseUrl: githubBrowseUrl(repo, ref, path),
        path,
        repo,
        ref
      };
    }

    if (node?.rawUrl) {
      try {
        return {
          rawUrl: new URL(href, sourceUrlDirectory(node.rawUrl)).toString(),
          browseUrl: '',
          path,
          repo,
          ref
        };
      } catch (_) {}
    }

    return null;
  }

  async function scheduleIntegrityVerification(ws) {
    if (!ws || ws.integrityInFlight) return;
    ws.integrityInFlight = true;
    let changed = false;
    const cache = ws.integrityCache || {};
    try {
      for (const node of ws.nodes || []) {
        node.workspace = ws;
        const cacheKey = node.storageKey || node.path;
        const previous = cache[cacheKey]?.status || node.integrityStatus || '';
        const result = await verifyNodeIntegrity(node, ws);
        cache[cacheKey] = result;
        cache[node.path] = result;
        node.integrityStatus = result.status;
        node.integrityStatusLabel = result.label;
        if (previous !== result.status) changed = true;
      }
    } catch (error) {
      ws.logs = ws.logs || [];
      ws.logs.push(`Integrity verification failed: ${error.message}`);
    } finally {
      ws.integrityCache = cache;
      ws.integrityInFlight = false;
      if (changed) render();
    }
  }




  // A mismatch is only a mismatch when the hashed bytes are from the exact declared
  // target. Filename-only fallback may prove a match, but must not prove mismatch.
  function targetHrefKind(target) {
    const href = String(target?.href || target?.text || '').trim();
    if (!href) return 'empty';
    if (/^self$/i.test(href)) return 'self';
    if (/^https?:\/\//i.test(href)) return 'remote-url';
    return 'relative-path';
  }

  function loadedTargetConfidence(loaded, remote, target) {
    if (!loaded) return 'none';
    const kind = targetHrefKind(target);

    if (kind === 'self') return 'exact';

    if (remote?.rawUrl) {
      if (loaded.rawUrl && loaded.rawUrl === remote.rawUrl) return 'exact';
      if (loaded.browseUrl && remote.browseUrl && loaded.browseUrl === remote.browseUrl) return 'exact';
      if (loaded.repo && remote.repo && loaded.ref && remote.ref && loaded.path && remote.path
        && loaded.repo === remote.repo && loaded.ref === remote.ref && loaded.path === remote.path) return 'exact';
      return 'candidate';
    }

    if (kind === 'relative-path') {
      const href = normalizeRepoPath(stripUrlDecorations(target?.href || target?.text || ''));
      const loadedPath = normalizeRepoPath(loaded.path || '');
      if (href && loadedPath && (loadedPath === href || loadedPath.endsWith(`/${href}`))) return 'exact';
      return 'candidate';
    }

    return 'candidate';
  }





  function matchingIntegrityHash(result, expected) {
    const hashes = Array.isArray(result?.hashes)
      ? result.hashes
      : (result?.hash ? [{ variant: result.variant || 'single', hash: result.hash }] : []);
    return hashes.find((item) => item.hash === expected) || null;
  }




  function isHelpDividerLine(line) {
    return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(String(line || ''));
  }

  function cleanHelpMarkdownBlock(markdown) {
    const lines = normalizeNewlines(markdown || '').split('\n');

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    // Trim trailing markdown dividers such as "---" that were intended as section separators.
    while (lines.length && isHelpDividerLine(lines[lines.length - 1])) {
      lines.pop();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    }

    return lines.join('\n').trim();
  }

  function headingMatch(line) {
    const match = String(line || '').match(/^(#{3,6})\s+(.+?)\s*$/);
    if (!match) return null;
    return {
      level: match[1].length,
      title: stripMarkdownInline(match[2])
    };
  }

  function buildHelpTree(markdown) {
    const root = { level: 2, title: '', body: [], children: [] };
    const stack = [root];
    const lines = normalizeNewlines(markdown || '').split('\n');

    for (const raw of lines) {
      const heading = headingMatch(raw);
      if (heading) {
        while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
        const parent = stack[stack.length - 1] || root;
        const node = { level: heading.level, title: heading.title, body: [], children: [] };
        parent.children.push(node);
        stack.push(node);
        continue;
      }
      stack[stack.length - 1].body.push(raw);
    }

    return root;
  }

  function renderHelpInline(text) {
    const escaped = escapeHtml(text || '');
    return escaped
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const safe = helpAssetUrl(href);
        const text = escapeHtml(label);
        if (!safe) return text;
        return `<a href="${escapeAttr(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      });
  }

  function renderHelpBlockMarkdown(markdown) {
    const lines = cleanHelpMarkdownBlock(markdown || '').split('\n');
    let html = '';
    let inList = false;
    let inFence = false;
    let fence = [];

    const closeList = () => {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    };

    for (const raw of lines) {
      const line = raw.replace(/\t/g, '    ');
      const trimmed = line.trim();

      if (/^```/.test(trimmed)) {
        if (inFence) {
          html += `<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`;
          fence = [];
          inFence = false;
        } else {
          closeList();
          inFence = true;
        }
        continue;
      }
      if (inFence) {
        fence.push(raw);
        continue;
      }
      if (!trimmed) {
        closeList();
        continue;
      }

      if (isHelpDividerLine(trimmed)) {
        closeList();
        html += '<hr class="help-rule">';
        continue;
      }

      const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      if (image) {
        closeList();
        const src = helpAssetUrl(image[2]);
        if (src) {
          html += `<figure class="help-figure"><img src="${escapeAttr(src)}" alt="${escapeAttr(image[1] || '')}" loading="lazy"></figure>`;
        }
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(6, Math.max(4, heading[1].length + 1));
        html += `<h${level}>${renderHelpInline(heading[2])}</h${level}>`;
        continue;
      }

      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${renderHelpInline(bullet[1])}</li>`;
        continue;
      }

      const quote = trimmed.match(/^>\s*(.+)$/);
      if (quote) {
        closeList();
        html += `<blockquote>${renderHelpInline(quote[1])}</blockquote>`;
        continue;
      }

      closeList();
      html += `<p>${renderHelpInline(trimmed)}</p>`;
    }

    closeList();
    if (inFence) html += `<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`;
    return html;
  }

  function renderHelpTreeNode(node, depth = 0) {
    const body = cleanHelpMarkdownBlock(node.body.join('\n'));
    const bodyHtml = body ? renderHelpBlockMarkdown(body) : '';
    const childrenHtml = node.children.length
      ? `<div class="help-section-list nested depth-${Math.min(depth + 1, 4)}">${node.children.map((child) => renderHelpTreeNode(child, depth + 1)).join('')}</div>`
      : '';
    const open = depth === 0 ? '' : '';
    return `<details class="help-section help-section-depth-${Math.min(depth, 4)}"${open}>
      <summary>${escapeHtml(node.title)}</summary>
      <div class="help-section-body">${bodyHtml}${childrenHtml}</div>
    </details>`;
  }

  function renderWorkspaceHelpMarkdown(markdown) {
    const tree = buildHelpTree(markdown || '');
    const intro = cleanHelpMarkdownBlock(tree.body.join('\n'));
    const introHtml = intro ? `<div class="help-intro">${renderHelpBlockMarkdown(intro)}</div>` : '';
    const sectionHtml = tree.children.map((section) => renderHelpTreeNode(section, 0)).join('');

    return introHtml || sectionHtml
      ? `${introHtml}<div class="help-section-list">${sectionHtml}</div>`
      : '<p>No workspace help content.</p>';
  }




  function findNodeWorkspace(nodeId) {
    for (const ws of app.workspaces || []) {
      const node = ws.nodeById?.get?.(nodeId);
      if (node) return { ws, node };
    }
    return { ws: null, node: null };
  }

  function shortHash(value) {
    const text = String(value || '');
    if (text.length <= 18) return text;
    return `${text.slice(0, 10)}…${text.slice(-8)}`;
  }

  function renderIntegrityKv(label, value, mono = false) {
    const safeValue = value === undefined || value === null || value === '' ? '—' : String(value);
    return `<div class="integrity-kv">
      <dt>${escapeHtml(label)}</dt>
      <dd class="${mono ? 'mono' : ''}">${escapeHtml(safeValue)}</dd>
    </div>`;
  }

  function renderIntegrityHashTable(diagnostics) {
    const expected = diagnostics.expected || '';
    const hashes = Array.isArray(diagnostics.hashes) ? diagnostics.hashes : [];
    if (!hashes.length) {
      return '<p class="empty-small">No computed hash variants are available for this target.</p>';
    }

    return `<div class="integrity-hash-table" role="table" aria-label="Computed integrity hashes">
      <div class="integrity-hash-row head" role="row">
        <div role="columnheader">Variant</div>
        <div role="columnheader">Computed</div>
        <div role="columnheader">Result</div>
      </div>
      ${hashes.map((item) => {
        const match = item.hash === expected;
        return `<div class="integrity-hash-row ${match ? 'match' : ''}" role="row">
          <div role="cell">${escapeHtml(item.variant || 'unknown')}</div>
          <div role="cell" class="mono" title="${escapeAttr(item.hash || '')}">${escapeHtml(shortHash(item.hash || ''))}</div>
          <div role="cell">${match ? '<span class="diag-ok">match</span>' : '<span class="diag-muted">no match</span>'}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function integrityDiagnosticsText(diagnostics) {
    const hashes = Array.isArray(diagnostics.hashes) ? diagnostics.hashes : [];
    return [
      'Tiinex Integrity Diagnostics',
      '',
      `Artifact: ${diagnostics.title || ''}`,
      `Path: ${diagnostics.path || ''}`,
      `Schema: ${diagnostics.schema || ''}`,
      `Status: ${diagnostics.status || ''}`,
      `Status Label: ${diagnostics.statusLabel || ''}`,
      '',
      `Method: ${diagnostics.method || ''}`,
      `Towards: ${diagnostics.towards || ''}`,
      `Expected: ${diagnostics.expected || ''}`,
      '',
      `Target Status: ${diagnostics.targetStatus || ''}`,
      `Target Label: ${diagnostics.targetLabel || ''}`,
      `Confidence: ${diagnostics.confidence || ''}`,
      `Authority: ${diagnostics.authority || ''}`,
      '',
      'Computed Hashes:',
      ...(hashes.length ? hashes.map((item) => `- ${item.variant}: ${item.hash}`) : ['- none']),
      '',
      `Viewer Note: ${diagnostics.note || ''}`
    ].join('\n');
  }

  function renderIntegrityDiagnosticsModal(modal) {
    const { ws, node } = findNodeWorkspace(modal.nodeId || '');
    const title = node?.title || 'Integrity diagnostics';
    const diagnostics = modal.diagnostics || null;

    return `<div class="modal-backdrop integrity-modal-backdrop">
      <section class="modal-card integrity-modal-card" role="dialog" aria-modal="true" aria-labelledby="integrity-title">
        <div class="modal-head integrity-modal-head">
          <div>
            <div class="kicker-inline">Integrity diagnostics</div>
            <h2 id="integrity-title">${escapeHtml(title)}</h2>
          </div>
          <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="integrity-diagnostics-body">
          ${modal.loading ? '<p class="empty-small">Computing browser-side integrity diagnostics…</p>' : ''}
          ${diagnostics ? `
            <div class="integrity-summary ${escapeAttr(diagnostics.status || '')}">
              <strong>${escapeHtml(diagnostics.status || 'unknown')}</strong>
              <span>${escapeHtml(diagnostics.statusLabel || diagnostics.note || '')}</span>
            </div>
            <dl class="integrity-kv-grid">
              ${renderIntegrityKv('Method', diagnostics.method, true)}
              ${renderIntegrityKv('Towards', diagnostics.towards, true)}
              ${renderIntegrityKv('Expected', diagnostics.expected, true)}
              ${renderIntegrityKv('Target', diagnostics.targetLabel)}
              ${renderIntegrityKv('Target status', diagnostics.targetStatus)}
              ${renderIntegrityKv('Authority', diagnostics.authority)}
              ${renderIntegrityKv('Confidence', diagnostics.confidence)}
              ${renderIntegrityKv('Artifact path', diagnostics.path)}
            </dl>
            <h3>Computed variants</h3>
            ${renderIntegrityHashTable(diagnostics)}
            <details class="integrity-raw">
              <summary>Raw diagnostic text</summary>
              <pre><code>${escapeHtml(integrityDiagnosticsText(diagnostics))}</code></pre>
            </details>
            <div class="modal-actions">
              <button class="tv-btn subtle" data-action="copy-integrity-diagnostics">Copy diagnostics</button>
            </div>
          ` : ''}
        </div>
      </section>
    </div>`;
  }

  async function computeIntegrityDiagnostics(ws, node) {
    const target = integrityTowardsRef(node);
    let result = null;
    try {
      result = await hashIntegrityTarget(ws, node, target);
    } catch (error) {
      result = {
        status: 'unavailable',
        label: `diagnostic computation failed: ${error.message}`,
        hashes: [],
        confidence: '',
        authority: ''
      };
    }

    const hashes = Array.isArray(result?.hashes)
      ? result.hashes
      : (result?.hash ? [{ variant: result.variant || 'single', hash: result.hash }] : []);
    const expected = node.integrity?.value || '';
    const match = hashes.find((item) => item.hash === expected);

    return {
      title: node.title || '',
      path: node.path || '',
      schema: node.currentSchemaText || node.currentSchema || '',
      status: match ? 'verified' : (node.integrityStatus || result?.status || 'unresolved'),
      statusLabel: match ? `Matched ${match.variant}` : (node.integrityStatusLabel || result?.label || ''),
      method: node.integrity?.method || 'sha256-base64url-c14n-v1',
      towards: target.raw || '',
      expected,
      targetStatus: result?.status || '',
      targetLabel: result?.label || '',
      confidence: result?.confidence || '',
      authority: result?.authority || '',
      hashes,
      note: match
        ? 'Browser verifier found a matching canonical variant.'
        : 'Browser verifier could not prove a match. Compare this output with the VS Code validator before treating it as a hard failure.'
    };
  }


  async function copyIntegrityDiagnostics() {
    if (app.modal?.type !== 'integrity-diagnostics' || !app.modal.diagnostics) return;
    const text = integrityDiagnosticsText(app.modal.diagnostics);
    try {
      await navigator.clipboard.writeText(text);
      toast('Integrity diagnostics copied.', 'ok');
    } catch (_) {
      toast('Could not copy diagnostics from this browser context.', 'warn');
    }
  }
  registerRenderModalWrapper(function renderModalWithIntegrityDiagnostics(modal, next) {
    if (modal?.type === 'integrity-diagnostics') return renderIntegrityDiagnosticsModal(modal);
    return next(modal);
  });
  registerActionHandler(async function integrityDiagnosticsAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'open-integrity-diagnostics') {
      event.preventDefault();
      event.stopPropagation();
      return openIntegrityDiagnostics(event.currentTarget.dataset.node || '');
    }
    if (action === 'copy-integrity-diagnostics') {
      event.preventDefault();
      event.stopPropagation();
      return copyIntegrityDiagnostics();
    }
    return next(event);
  });





  // Ported from Tiinex/ai-provenance:
  // ides/vscode/src/traceableContinuityValidation.js
  // canonicalizeTraceableContinuityChecksumSource()
  function canonicalizeTraceableContinuityChecksumSource(markdown) {
    const normalizedNewlines = String(markdown || '').replace(/\r\n?/gu, '\n');
    const withoutTrailingWhitespace = normalizedNewlines.replace(/[ \t]+$/gmu, '').trimEnd();
    const lines = withoutTrailingWhitespace.split('\n');
    const integrityHeadingIndex = lines.findIndex((line) => line.trim() === '# Continuity Integrity');
    if (integrityHeadingIndex >= 0) {
      return lines.slice(0, integrityHeadingIndex).join('\n');
    }
    return withoutTrailingWhitespace;
  }

  function stripIntegritySection(markdown) {
    return canonicalizeTraceableContinuityChecksumSource(markdown);
  }

  async function traceableContinuityChecksumSha256(markdown) {
    return sha256Base64Url(canonicalizeTraceableContinuityChecksumSource(markdown));
  }

  async function integrityHashesForMarkdown(markdown) {
    return [{
      variant: 'sha256-base64url-c14n-v1',
      hash: await traceableContinuityChecksumSha256(markdown)
    }];
  }

  async function hashLoadedTarget(loaded) {
    const hashes = await integrityHashesForMarkdown(loaded.rawMarkdown || '');
    return {
      status: 'ok',
      hashes,
      label: loaded.path || loaded.rawUrl || 'loaded target'
    };
  }

  async function hashRemoteTarget(remote) {
    if (!remote?.rawUrl) return null;
    const cacheKey = `integrity-target:${remote.rawUrl}:sha256-base64url-c14n-v1`;
    if (!app.integrityTargetHashCache[cacheKey]) {
      app.integrityTargetHashCache[cacheKey] = (async () => {
        const text = await fetchText(remote.rawUrl, 'integrity target');
        return integrityHashesForMarkdown(text);
      })();
    }
    return app.integrityTargetHashCache[cacheKey];
  }


  async function verifyNodeIntegrity(node, ws = null) {
    if (!node.integrity) return { status: 'missing', label: 'integrity missing' };
    if (!node.integrity.value) return { status: 'malformed', label: 'integrity malformed' };
    const target = integrityTowardsRef(node);
    if (!target.raw) return { status: 'malformed', label: 'integrity target missing' };

    try {
      const result = await hashIntegrityTarget(ws || node.workspace || null, node, target);
      if (result.status === 'unavailable') return { status: 'unavailable', label: result.label };
      if (result.status === 'unresolved') return { status: 'unresolved', label: result.label };

      const match = matchingIntegrityHash(result, node.integrity.value);
      if (match) return { status: 'verified', label: `integrity verified against ${result.label || 'target'} using ${match.variant}` };

      if (result.confidence === 'exact' && (result.authority === 'local-exact' || result.authority === 'remote-exact')) {
        return { status: 'mismatch', label: `integrity mismatch against exact target ${result.label || ''}`.trim() };
      }

      return {
        status: 'unresolved',
        label: `integrity unresolved for ${result.label || 'target'}`
      };
    } catch (error) {
      return { status: 'unavailable', label: `integrity target unavailable: ${error.message}` };
    }
  }

  function effectiveIntegrityStatus(node) {
    return node.integrityStatus || (node.integrity ? 'pending' : 'missing');
  }




  function integrityStatusLabel(status) {
    const labels = {
      verified: 'verified',
      pending: 'open',
      unavailable: 'open',
      unresolved: 'open',
      missing: 'missing',
      malformed: 'malformed',
      mismatch: 'mismatch',
      'schema-unverified': 'open'
    };
    return labels[status] || 'open';
  }




  function isSelfIntegrityTarget(target) {
    const raw = cleanIntegrityTowards(target?.raw || '').toLowerCase();
    const text = cleanIntegrityTowards(target?.text || '').toLowerCase();
    const href = cleanIntegrityTowards(target?.href || '').toLowerCase();
    return raw === 'self' || text === 'self' || href === 'self';
  }

  async function hashIntegrityTarget(ws, node, target) {
    if (isSelfIntegrityTarget(target)) {
      return {
        status: 'ok',
        confidence: 'exact',
        authority: 'local-exact',
        hashes: await integrityHashesForMarkdown(node.rawMarkdown || ''),
        label: 'self'
      };
    }

    const remote = remoteIntegrityTarget(ws, node, target);
    const loaded = loadedIntegrityTarget(ws, node, target, remote);

    if (loaded) {
      const confidence = loadedTargetConfidence(loaded, remote, target);
      const loadedResult = await hashLoadedTarget(loaded);
      const loadedMatch = matchingIntegrityHash(loadedResult, node.integrity.value);
      if (loadedMatch) {
        return {
          status: 'ok',
          confidence,
          authority: confidence === 'exact' ? 'local-exact' : 'local-candidate-match',
          hashes: loadedResult.hashes,
          matchVariant: loadedMatch.variant,
          label: `${loadedResult.label} (${loadedMatch.variant})`
        };
      }

      if (confidence === 'exact' && !remote?.rawUrl) {
        return {
          status: 'ok',
          confidence: 'exact',
          authority: 'local-exact',
          hashes: loadedResult.hashes,
          label: loadedResult.label
        };
      }
    }

    if (remote?.rawUrl) {
      try {
        const remoteHashes = await hashRemoteTarget(remote);
        const remoteMatch = matchingIntegrityHash({ hashes: remoteHashes }, node.integrity.value);
        if (remoteMatch) {
          return {
            status: 'ok',
            confidence: 'exact',
            authority: 'remote-match',
            hashes: remoteHashes,
            matchVariant: remoteMatch.variant,
            label: `${remote.rawUrl} (${remoteMatch.variant})`
          };
        }
        return {
          status: 'ok',
          confidence: 'exact',
          authority: 'remote-exact',
          hashes: remoteHashes || [],
          label: remote.rawUrl
        };
      } catch (error) {
        return {
          status: 'unavailable',
          confidence: 'exact',
          authority: 'remote-unavailable',
          hashes: [],
          label: `integrity target unavailable: ${error.message}`
        };
      }
    }

    if (loaded) {
      return {
        status: 'unresolved',
        confidence: 'candidate',
        authority: 'local-candidate',
        hashes: [],
        label: `integrity target ambiguous; loaded candidate did not verify (${loaded.path || 'candidate'})`
      };
    }

    return { status: 'unavailable', confidence: 'none', authority: 'none', hashes: [], label: 'integrity target unavailable' };
  }








  function syncIntegrityDiagnosticsToNode(ws, node, diagnostics) {
    if (!ws || !node || !diagnostics) return;

    const status = diagnostics.status || '';
    const accepted = new Set(['verified', 'mismatch', 'open', 'unavailable', 'unresolved', 'missing', 'malformed']);
    if (!accepted.has(status)) return;

    const normalized = status === 'open' ? 'unresolved' : status;
    const label = diagnostics.statusLabel || diagnostics.note || node.integrityStatusLabel || '';

    node.integrityStatus = normalized;
    node.integrityStatusLabel = label;

    const cacheValue = { status: normalized, label };
    ws.integrityCache = ws.integrityCache || {};
    if (node.storageKey) ws.integrityCache[node.storageKey] = cacheValue;
    if (node.path) ws.integrityCache[node.path] = cacheValue;
  }

  async function openIntegrityDiagnostics(nodeId) {
    const { ws, node } = findNodeWorkspace(nodeId);
    if (!ws || !node) {
      toast('Could not find integrity target node.', 'warn');
      return;
    }
    app.modal = { type: 'integrity-diagnostics', nodeId, loading: true };
    render();

    const diagnostics = await computeIntegrityDiagnostics(ws, node);
    syncIntegrityDiagnosticsToNode(ws, node, diagnostics);

    if (app.modal?.type === 'integrity-diagnostics' && app.modal.nodeId === nodeId) {
      app.modal.loading = false;
      app.modal.diagnostics = diagnostics;
      render();
    } else {
      render();
    }
  }

  async function refreshVisibleIntegrityAfterLineageLoad(ws) {
    if (!ws || ws.integrityRefreshInFlight) return;
    ws.integrityRefreshInFlight = true;
    try {
      const selected = ws.selectedNodeId ? ws.nodeById.get(ws.selectedNodeId) : null;
      const nodes = selected ? lineageTraversal(selected).nodes : filteredDiscoveryNodes(ws);
      let changed = false;

      for (const node of nodes || []) {
        const before = node.integrityStatus || '';
        const result = await verifyNodeIntegrity(node, ws);
        node.integrityStatus = result.status;
        node.integrityStatusLabel = result.label;
        ws.integrityCache = ws.integrityCache || {};
        const cacheValue = { status: result.status, label: result.label };
        if (node.storageKey) ws.integrityCache[node.storageKey] = cacheValue;
        if (node.path) ws.integrityCache[node.path] = cacheValue;
        if (before !== result.status) changed = true;
      }

      if (changed) render();
    } finally {
      ws.integrityRefreshInFlight = false;
    }
  }
  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWithIntegrityRefresh(ws, selected, next) {
    const html = next(ws, selected);
    // Defer verification refresh until after render call stack. This keeps typing/search
    // responsive while letting lazy-loaded lineage parents update badge state.
    if (selected) setTimeout(() => refreshVisibleIntegrityAfterLineageLoad(ws), 0);
    return html;
  });




  // Remove relation/position badges that mostly describe UI state rather than signal.
  function relationChipHtml(ws, node, relation, isTarget, inLineage) {
    return '';
  }

  function integrityBadge(node) {
    const status = effectiveIntegrityStatus(node);
    const map = {
      verified: { cls: 'ok', icon: 'fa-circle-check', title: node.integrityStatusLabel || 'Verified within the current viewer scope.' },
      pending: { cls: 'pending', icon: 'fa-hourglass-half', title: 'Verification is still pending.' },
      unavailable: { cls: 'pending', icon: 'fa-clock', title: node.integrityStatusLabel || 'No breakage found, but this browser could not complete verification for the current scope.' },
      unresolved: { cls: 'pending unresolved', icon: 'fa-circle-question', title: node.integrityStatusLabel || 'No breakage found, but verification remains open in this browser context.' },
      'schema-unverified': { cls: 'pending schema-unverified', icon: 'fa-scale-balanced', title: node.integrityStatusLabel || 'Schema continuity is declared but not fully audited in this viewer scope.' },
      missing: { cls: 'danger missing', icon: 'fa-circle-xmark', title: 'No Continuity Integrity footer was parsed.' },
      malformed: { cls: 'warn', icon: 'fa-triangle-exclamation', title: node.integrityStatusLabel || 'Integrity footer was present but incomplete.' },
      mismatch: { cls: 'danger', icon: 'fa-circle-xmark', title: node.integrityStatusLabel || 'Checksum does not match the exact target in the current verification scope.' }
    };
    const item = map[status] || map.unresolved;
    const label = integrityStatusLabel(status);
    const actionable = node.integrity ? ' data-action="open-integrity-diagnostics"' : '';
    const nodeAttr = node.id ? ` data-node="${escapeAttr(node.id)}"` : '';
    const tag = node.integrity ? 'button' : 'span';
    const type = node.integrity ? ' type="button"' : '';
    return `<${tag}${type} class="badge-soft integrity-badge ${item.cls} integrity-diagnostic-trigger" title="${escapeAttr(item.title)}"${actionable}${nodeAttr}><i class="fa-solid ${item.icon}"></i>${escapeHtml(label)}</${tag}>`;
  }






  // Tree rows are rendered as <button>. Avoid nesting integrity <button> elements
  // inside them, otherwise browsers split the DOM and badges drift out of row.
  function treeIntegrityBadge(node) {
    const status = effectiveIntegrityStatus(node);
    const map = {
      verified: { cls: 'ok', icon: 'fa-circle-check', title: node.integrityStatusLabel || 'Verified within the current viewer scope.' },
      pending: { cls: 'pending', icon: 'fa-hourglass-half', title: 'Verification is still pending.' },
      unavailable: { cls: 'pending', icon: 'fa-clock', title: node.integrityStatusLabel || 'No breakage found, but this browser could not complete verification for the current scope.' },
      unresolved: { cls: 'pending unresolved', icon: 'fa-circle-question', title: node.integrityStatusLabel || 'No breakage found, but verification remains open in this browser context.' },
      'schema-unverified': { cls: 'pending schema-unverified', icon: 'fa-scale-balanced', title: node.integrityStatusLabel || 'Schema continuity is declared but not fully audited in this viewer scope.' },
      missing: { cls: 'danger missing', icon: 'fa-circle-xmark', title: 'No Continuity Integrity footer was parsed.' },
      malformed: { cls: 'warn', icon: 'fa-triangle-exclamation', title: node.integrityStatusLabel || 'Integrity footer was present but incomplete.' },
      mismatch: { cls: 'danger', icon: 'fa-circle-xmark', title: node.integrityStatusLabel || 'Checksum does not match the exact target in the current verification scope.' }
    };
    const item = map[status] || map.unresolved;
    const label = integrityStatusLabel(status);
    return `<span class="badge-soft integrity-badge ${item.cls} tree-integrity-badge" title="${escapeAttr(item.title)}"><i class="fa-solid ${item.icon}"></i>${escapeHtml(label)}</span>`;
  }

  function renderTreeFile(ws, node, file, depth) {
    const isSelected = ws.selectedNodeId === node.id;
    const childBadge = node.children.length
      ? `<span class="tree-count">${node.children.length} child${node.children.length === 1 ? '' : 'ren'}</span>`
      : '';
    return `<button class="tree-row tree-file-row ${isSelected ? 'selected' : ''}" style="--tree-depth:${depth}" data-action="select-node" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" title="${escapeAttr(node.path)}">
      <span class="tree-primary">
        <i class="fa-regular fa-file-lines"></i>
        <span class="tree-name">${escapeHtml(file)}</span>
      </span>
      <span class="tree-badges">
        <span class="badge-soft badge-schema ${schemaBadgeClass(node.currentSchemaText || node.currentSchema)}">${escapeHtml(shortSchema(node.currentSchemaText || node.currentSchema || 'trace'))}</span>
        ${childBadge}
        ${treeIntegrityBadge(node)}
      </span>
    </button>`;
  }




  // Host/page-level option, intentionally not part of workspace config.
  // Example before app.js:
  //   window.TIINEX_VIEWER_OPTIONS = { createWorkspace: false };
  function createWorkspaceEnabled() {
    const opts = window.TIINEX_VIEWER_OPTIONS || {};
    if (opts.createWorkspace === false || opts.allowCreateWorkspace === false) return false;
    const params = new URLSearchParams(window.location.search || '');
    const value = params.get('createWorkspace') ?? params.get('create');
    if (value && /^(0|false|no|off|disabled)$/i.test(value)) return false;
    return true;
  }

  function hideCreateWorkspaceButtons(root = document) {
    if (createWorkspaceEnabled()) return;
    root.querySelectorAll('[data-action="open-create"], [data-action="create-workspace"]').forEach((el) => {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-create-disabled', 'true');
    });
    root.querySelectorAll('.create-workspace-action, .create-workspace-only').forEach((el) => {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-create-disabled', 'true');
    });
  }

  registerActionHandler(async function createWorkspaceVisibilityAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (!createWorkspaceEnabled() && (action === 'open-create' || action === 'create-workspace')) {
      event.preventDefault();
      event.stopPropagation();
      toast('Create workspace is disabled for this viewer.', 'warn');
      return;
    }
    return next(event);
  });




  function policySourceUrl(doc) {
    return safeUrl(doc?.url || '') || doc?.url || '';
  }

  function policyDocumentForModal(ws, kind) {
    const policy = ws?.policy || { status: 'unknown', kind: '', text: '', url: '', note: 'Policy state unknown.' };
    const notice = ws?.notice || { status: 'unknown', kind: '', text: '', url: '', note: 'Notice state unknown.' };
    if (kind === 'notice') {
      return {
        kind: 'notice',
        label: notice.kind || 'NOTICE',
        title: notice.kind || 'Origin NOTICE',
        status: notice.status || 'unknown',
        text: notice.text || '',
        url: notice.url || '',
        note: notice.note || 'No NOTICE file is loaded for this workspace.',
        icon: 'fa-regular fa-file-lines'
      };
    }

    const title = policy.status === 'found'
      ? (policy.kind || 'Lineage policy')
      : policy.status === 'origin-fallback'
        ? (policy.kind || 'Origin policy')
        : policy.status === 'missing'
          ? 'No origin policy/license'
          : policy.status === 'local'
            ? 'Local workspace'
            : 'Policy unknown';

    return {
      kind: 'policy',
      label: policy.kind || title,
      title,
      status: policy.status || 'unknown',
      text: policy.text || '',
      url: policy.url || '',
      note: policy.note || 'Policy state unknown.',
      icon: policy.status === 'found'
        ? 'fa-solid fa-scroll'
        : policy.status === 'origin-fallback'
          ? 'fa-solid fa-scale-balanced'
          : policy.status === 'missing'
            ? 'fa-solid fa-triangle-exclamation'
            : policy.status === 'local'
              ? 'fa-solid fa-laptop-file'
              : 'fa-regular fa-circle-question'
    };
  }

  function renderPolicyDocumentBody(doc) {
    if (doc.text) {
      return `<div class="policy-document-rendered markdown-rendered">${renderSafeMarkdown(doc.text)}</div>`;
    }
    return `<div class="policy-empty-note">
      <p>${escapeHtml(doc.note || 'No policy document text is available.')}</p>
    </div>`;
  }



  function policyStatusLoading(ws, status) {
    return status === 'unknown' || status === 'loading' || Boolean(ws?.loading && (!status || status === 'unknown'));
  }

  function noticeBadge(ws) {
    const notice = ws?.notice || { status: 'unknown' };
    if (notice.status === 'found') {
      return policyBadgeButton(ws, 'notice', 'fa-regular fa-file-lines', notice.kind || 'NOTICE', notice.note || 'Origin NOTICE found', 'notice');
    }
    if (policyStatusLoading(ws, notice.status)) {
      return policyBadgeButton(ws, 'notice pending', 'fa-regular fa-file-lines', 'Notice loading', notice.note || 'NOTICE status not loaded yet', 'notice');
    }
    return '';
  }

  function renderPolicyBadge(ws) {
    const p = ws?.policy || { status: 'unknown' };
    let badge = '';

    if (p.status === 'found') {
      badge = policyBadgeButton(ws, 'ok', 'fa-solid fa-scroll', p.kind || 'Lineage policy', p.note || 'Lineage policy found', 'policy');
    } else if (p.status === 'origin-fallback') {
      badge = policyBadgeButton(ws, 'warn', 'fa-solid fa-scale-balanced', p.kind || 'Origin policy', p.note || 'Origin license/policy found', 'policy');
    } else if (p.status === 'missing') {
      badge = policyBadgeButton(ws, 'danger', 'fa-solid fa-triangle-exclamation', 'No origin policy/license', p.note || 'No origin policy/license found', 'policy');
    } else if (p.status === 'local') {
      badge = policyBadgeButton(ws, 'local', 'fa-solid fa-laptop-file', 'Local workspace', p.note || 'Local workspace', 'policy');
    } else {
      badge = policyBadgeButton(ws, 'pending', 'fa-solid fa-scale-balanced', 'Policy loading', p.note || 'Policy/license status not loaded yet', 'policy');
    }

    return badge + noticeBadge(ws);
  }
  registerRenderModalWrapper(function renderModalWithPolicyDocument(modal, next) {
    if (modal?.type === 'policy-document') return renderPolicyDocumentModal(modal);
    return next(modal);
  });
  registerActionHandler(async function policyDocumentAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'open-policy-document') {
      event.preventDefault();
      event.stopPropagation();
      app.modal = {
        type: 'policy-document',
        wsId: event.currentTarget.dataset.ws || '',
        kind: event.currentTarget.dataset.policyKind || 'policy'
      };
      render();
      return;
    }
    return next(event);
  });




  function policyBadgeButton(ws, cls, icon, label, title, kind) {
    const text = label || '';
    return `<button type="button" class="stat-pill policy legal-icon-only ${cls}" data-action="open-policy-document" data-ws="${escapeAttr(ws?.id || '')}" data-policy-kind="${escapeAttr(kind || 'policy')}" title="${escapeAttr(title || text || '')}" aria-label="${escapeAttr(text || title || 'Policy document')}"><i class="${escapeAttr(icon)}"></i><span class="policy-badge-text">${escapeHtml(text)}</span></button>`;
  }





  // while the active implementation expects renderDetailReadView(ws, node).
  function renderNodeModal(modal, kind) {
    const ws = getWorkspace(modal.wsId);
    const node = ws?.nodeById.get(modal.nodeId);
    if (!node) return '';
    const isMarkdown = kind === 'markdown';
    return `
      <div class="modal-backdrop-custom focus-modal read-modal-backdrop" role="dialog" aria-modal="true">
        <div class="modal-panel read-modal-panel">
          <div class="modal-header-lite sticky-modal-head read-modal-head">
            <div>
              <p class="kicker">${isMarkdown ? 'Raw markdown' : 'Schema read view'}</p>
              <h2 class="modal-title-lite">${escapeHtml(node.title)}</h2>
              <p class="text-secondary mb-0">${escapeHtml(node.path)}</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-read-scroll">
            ${isMarkdown ? `<pre class="source-block modal-source"><code>${escapeHtml(node.rawMarkdown || '')}</code></pre>` : `<div class="modal-read-body">${renderDetailReadView(ws, node)}</div>`}
          </div>
        </div>
      </div>`;
  }




  function renderCreateModal(modal) {
    if (modal?.mode === 'workspace') {
      if (typeof mobileCreateSheetActive === 'function' && mobileCreateSheetActive()) {
        return `
        <div class="modal-backdrop-custom focus-modal create-workspace-backdrop create-workspace-sheet-backdrop" role="dialog" aria-modal="true" aria-label="Create workspace">
          <div class="modal-panel create-workspace-panel create-workspace-sheet">
            <div class="create-workspace-grabber" aria-hidden="true"></div>
            <div class="create-workspace-head">
              <div>
                <p class="kicker">Create</p>
                <h2 class="modal-title-lite">New workspace</h2>
              </div>
              <button class="tv-btn small subtle create-workspace-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="create-workspace-body">
              <label class="field-label" for="workspace-name">Workspace name</label>
              <input id="workspace-name" class="form-control tv-input" data-field="workspaceName" placeholder="Example: Tiinex/docs" value="${escapeAttr(modal.workspaceName || '')}" autofocus>
              <p class="form-text create-workspace-hint">Empty now. Add files, folders, or GitHub sources after creation.</p>
            </div>
            <div class="create-workspace-actions">
              <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
              <button class="tv-btn primary" data-action="create-workspace"><i class="fa-solid fa-plus"></i>Create</button>
            </div>
          </div>
        </div>`;
      }
      return `
      <div class="modal-backdrop-custom focus-modal create-workspace-backdrop create-workspace-sheet-backdrop" role="dialog" aria-modal="true">
        <div class="modal-panel create-workspace-panel create-workspace-sheet">
          <div class="create-workspace-grabber" aria-hidden="true"></div>
          <div class="modal-header-lite create-workspace-head">
            <div>
              <p class="kicker">Workspace</p>
              <h2 class="modal-title-lite">Create workspace</h2>
              <p class="text-secondary mb-0">Name a local workspace. Add sources and files after it opens.</p>
            </div>
            <button class="tv-btn small subtle create-workspace-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="create-workspace-body">
            <label class="field-label" for="workspace-name">Name</label>
            <input id="workspace-name" class="form-control tv-input" data-field="workspaceName" placeholder="Example: Tiinex/docs" value="${escapeAttr(modal.workspaceName || '')}" autofocus>
            <p class="form-text"><i class="fa-solid fa-lock"></i> Local to this browser until exported.</p>
            <div class="modal-footer-actions create-workspace-actions">
              <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
              <button class="tv-btn primary" data-action="create-workspace"><i class="fa-solid fa-plus"></i>Create</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    return '';
  }




  // .schema.md and .workspace.md are lineage/workspace materials too; do not
  // restrict them to discovery/config handling only.

  function isIndexableTiinexMarkdownPath(path) {
    const value = String(path || '');
    return /\.(trace|schema|workspace)\.md$/i.test(value);
  }

  function shouldIndexAsTrace(path, content) {
    if (isIndexableTiinexMarkdownPath(path)) return true;
    if (/\.md$/i.test(path || '')) return looksLikeTiinexTraceContent(content);
    return false;
  }

  async function handleWorkspaceDrop(event, ws, explicitZone = null) {
    event.preventDefault();
    event.stopPropagation();

    const target = explicitZone || workspaceDropTargetFromEvent(event);
    target?.classList?.remove?.('drag-over');

    const files = await filesFromDataTransfer(event.dataTransfer);
    if (!files.length) {
      toast('No files were available from the drop.', 'warn');
      return;
    }

    const datasetWs = target?.dataset?.ws ? getWorkspace(target.dataset.ws) : null;
    const workspace = ws || datasetWs || createWorkspace('Local workspace', 'Local source workspace.');
    app.activeWorkspaceId = workspace.id;
    if (typeof focusWorkspaceWindow === 'function') focusWorkspaceWindow(workspace.id);
    render();

    await readUploadedFilesIntoWorkspace(workspace, files);

    if (typeof setRouteState === 'function') setRouteState('replace');
    else if (typeof updateUrlState === 'function') updateUrlState();
  }




  function isLineageArtifactPath(value) {
    return /\.(trace|schema|workspace)\.md(?:$|[?#])/i.test(String(value || ''));
  }

  function candidateLooksTrace(candidate) {
    if (!candidate) return false;
    return isLineageArtifactPath(candidate.path || '')
      || isLineageArtifactPath(candidate.rawUrl || '')
      || isLineageArtifactPath(candidate.browseUrl || '');
  }

  function nonLineageParentOrigin(ws, node) {
    if (!ws || !node || node.parentNode) return null;
    const explicitBrowse = originValueUrl(node.parentOriginBrowse);
    const absoluteOrigin = originValueUrl(node.parentOrigin?.absolute || '');
    const candidateHref = explicitBrowse || absoluteOrigin || node.parentHref || '';
    if (!candidateHref) return null;

    const ref = resolveMaterialHref(ws, node, candidateHref, false, 'Parent origin');
    if (!ref) return null;
    const path = ref.path || ref.href || ref.sourceUrl || ref.rawUrl || '';
    if (isLineageArtifactPath(path)) return null;
    return Object.assign(ref, { kind: ref.kind === 'trace' ? 'file' : ref.kind, origin: true });
  }

  function parentFetchCandidate(ws, node) {
    if (!ws || !node || node.parentNode || !node.parentHref) return null;

    const relativeParentPath = canonicalWorkspacePath(node.parentResolvedPath || joinPath(dirname(node.path), node.parentHref));
    const explicitBrowse = originValueUrl(node.parentOriginBrowse);
    const absoluteOrigin = originValueUrl(node.parentOrigin?.absolute || '');

    function done(candidate) {
      return candidateLooksTrace(candidate) ? candidate : null;
    }

    function remoteCandidate(url, reason, keyPrefix) {
      if (!url) return null;
      const item = convertSourceUrl(url);
      if (!item?.rawUrl) return null;
      return done({
        key: `${keyPrefix}:${item.rawUrl}`,
        rawUrl: item.rawUrl,
        browseUrl: item.browseUrl || url,
        repo: item.repo || node.repo || ws.repo || '',
        ref: item.ref || node.ref || ws.ref || '',
        path: item.path || fileNameFromPath(url),
        reason
      });
    }

    const fromExplicit = remoteCandidate(explicitBrowse, 'browse + git', 'browse');
    if (fromExplicit) return fromExplicit;

    if (isFetchableHttpUrl(node.parentHref)) {
      const fromParentUrl = remoteCandidate(node.parentHref, 'parent URL', 'parent-url');
      if (fromParentUrl) return fromParentUrl;
    }

    const fromAbsolute = remoteCandidate(absoluteOrigin, 'absolute origin', 'absolute');
    if (fromAbsolute) return fromAbsolute;

    if (node.repo && node.ref && relativeParentPath && !/^[a-z]+:/i.test(relativeParentPath)) {
      return done({
        key: `repo-relative:${node.repo}:${node.ref}:${relativeParentPath}`,
        rawUrl: `https://raw.githubusercontent.com/${node.repo}/${node.ref}/${relativeParentPath}`,
        browseUrl: `https://github.com/${node.repo}/blob/${node.ref}/${relativeParentPath}`,
        repo: node.repo,
        ref: node.ref,
        path: relativeParentPath,
        reason: 'repo-relative parent path'
      });
    }

    if (ws.repo && ws.ref && relativeParentPath && !/^[a-z]+:/i.test(relativeParentPath)) {
      return done({
        key: `workspace-relative:${ws.repo}:${ws.ref}:${relativeParentPath}`,
        rawUrl: `https://raw.githubusercontent.com/${ws.repo}/${ws.ref}/${relativeParentPath}`,
        browseUrl: `https://github.com/${ws.repo}/blob/${ws.ref}/${relativeParentPath}`,
        repo: ws.repo,
        ref: ws.ref,
        path: relativeParentPath,
        reason: 'workspace-relative parent path'
      });
    }

    if (node.rawUrl && relativeParentPath && !/^[a-z]+:/i.test(node.parentHref)) {
      try {
        const rawUrl = new URL(node.parentHref, sourceUrlDirectory(node.rawUrl)).toString();
        return done({
          key: `raw-relative:${rawUrl}`,
          rawUrl,
          browseUrl: '',
          repo: node.repo || ws.repo || '',
          ref: node.ref || ws.ref || '',
          path: relativeParentPath,
          reason: 'raw-url relative parent path'
        });
      } catch (_) {}
    }

    return null;
  }

  function lineageScopeKey(ws, node) {
    const source = sourceById(ws, node?.sourceId);
    const repo = node?.repo || source?.repo || '';
    const ref = node?.ref || source?.ref || '';
    if (repo || ref) return `github:${repo}@${ref || 'unknown-ref'}`;
    if (source?.id) return `${source.kind || 'source'}:${source.id}`;
    return `workspace:${ws?.id || 'local'}`;
  }

  function lineageScopeLabel(ws, node) {
    const source = sourceById(ws, node?.sourceId);
    const repo = node?.repo || source?.repo || '';
    const ref = node?.ref || source?.ref || '';
    if (repo) return `${repo}${ref ? '@' + shortText(ref, 12) : ''}`;
    if (source?.label) return source.label;
    return ws?.label || 'Current workspace';
  }

  function lineageScopeDivider(ws, previous, node) {
    if (!previous || !node) return '';
    const beforeKey = lineageScopeKey(ws, previous);
    const afterKey = lineageScopeKey(ws, node);
    if (beforeKey === afterKey) return '';

    return `<div class="lineage-scope-divider" role="separator" aria-label="Lineage scope transition">
      <span class="lineage-scope-line"></span>
      <span class="lineage-scope-label">
        <i class="fa-solid fa-right-left"></i>
        <strong>Scope transition</strong>
        <small>${escapeHtml(lineageScopeLabel(ws, previous))} → ${escapeHtml(lineageScopeLabel(ws, node))}</small>
      </span>
      <span class="lineage-scope-line"></span>
    </div>`;
  }

  function renderLineageNodeList(ws, nodes, mode, searchActive, lineageQuery) {
    return nodes.map((node, index) => {
      const previous = index > 0 ? nodes[index - 1] : null;
      const divider = mode === 'lineage' ? lineageScopeDivider(ws, previous, node) : '';
      if (mode === 'lineage' && searchActive && !nodeMatchesSearch(node, lineageQuery)) {
        return divider + renderLineageSkimLine(node, index);
      }
      return divider + renderNodePost(ws, node, { lineage: mode === 'lineage', index });
    }).join('');
  }

  function renderLineageTraversalFooter(ws, selected, traversal, visibleCount) {
    if (!traversal) return '';
    if (traversal.cycleNode) {
      return `<div class="lineage-terminal danger"><i class="fa-solid fa-triangle-exclamation"></i>Lineage cycle detected at ${escapeHtml(traversal.cycleNode.title || traversal.cycleNode.path)}.</div>`;
    }
    if (traversal.parentUnavailable) {
      const last = traversal.nodes[traversal.nodes.length - 1];
      const candidate = parentFetchCandidate(ws, last);
      const state = parentFetchState(ws, last);

      if (state?.status === 'loading') {
        return `<div class="lineage-terminal open"><i class="fa-solid fa-spinner fa-spin"></i>Loading parent across scope boundary: ${escapeHtml(state.candidate?.path || last.parentHref || 'parent')}.</div>`;
      }
      if (state?.status === 'failed') {
        return `<div class="lineage-terminal warn"><i class="fa-solid fa-clock"></i>Parent is outside the loaded workspace and could not be fetched yet: ${escapeHtml(state.candidate?.browseUrl || state.candidate?.rawUrl || last.parentHref || 'unknown parent')}. ${escapeHtml(state.error || '')}</div>`;
      }
      if (candidate) {
        return `<div class="lineage-terminal open"><i class="fa-solid fa-arrow-down-long"></i>Parent is outside the loaded workspace. It can be lazy-loaded from ${escapeHtml(candidate.reason || 'remote source')}: ${escapeHtml(candidate.path || candidate.browseUrl || candidate.rawUrl)}.</div>`;
      }
      return `<div class="lineage-terminal warn"><i class="fa-solid fa-clock"></i>Parent is outside the loaded workspace and no fetchable lineage target was resolved: ${escapeHtml(last.parentHref || 'unknown parent')}.</div>`;
    }
    if (traversal.nonLineageOrigin) return '';
    if (traversal.endReached) {
      return `<div class="lineage-terminal"><i class="fa-solid fa-circle-check"></i>Lineage root reached.</div>`;
    }
    return '';
  }





  function dedupeImportEntries(entries) {
    const seen = new Set();
    const result = [];
    for (const entry of entries || []) {
      const key = `${entry.sourceId || ''}:${canonicalWorkspacePath(entry.path || entry.name || '')}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(entry);
    }
    return result;
  }

  async function commitImportEntries(ws, entries, options = {}) {
    return applyImportEntries(ws, dedupeImportEntries(entries), options);
  }

  async function readUploadedFilesIntoWorkspace(ws, fileList) {
    ensureWorkspaceSources(ws);
    const source = localSource(ws);
    const entries = dedupeImportEntries((await collectImportEntries(fileList)).map((entry) => Object.assign(entry, {
      sourceId: source.id,
      sourceKind: source.kind,
      sourceLabel: source.label
    })));

    if (!entries.length) {
      toast('No files were available to import.', 'warn');
      return;
    }

    const conflicts = detectImportConflicts(ws, entries);
    if (conflicts.length) {
      app.pendingImport = { wsId: ws.id, entries, conflicts };
      app.modal = { type: 'import-conflict', wsId: ws.id };
      render();
      return;
    }

    await commitImportEntries(ws, entries);
  }


  async function auditLineageBoundary(ws, selected, options = {}) {
    const boundary = firstOpenLineageBoundary(ws, selected);
    if (!boundary) {
      if (options.userInitiated) toast('No fetchable parent boundary is currently open.', 'info');
      return false;
    }
    await fetchParentTrace(ws, boundary.last, boundary.candidate);
    return true;
  }
  registerActionHandler(async function lineageAuditAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'audit-lineage') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get(event.currentTarget.dataset.node || '');
      if (!ws || !node) return toast('No selected lineage to audit.', 'warn');
      const loaded = await auditLineageBoundary(ws, node, { userInitiated: true });
      if (!loaded) render();
      return;
    }
    return next(event);
  });




  async function fetchParentTrace(ws, last, candidate) {
    if (!ws || !candidate) return false;
    // Current parent-fetch implementation is fetchParentCandidate(wsId, candidate).
    return fetchParentCandidate(ws.id, candidate);
  }




  function staticFileOrigin() {
    return window.location?.protocol === 'file:' || window.location?.origin === 'null';
  }

  function githubTreeApiCorsUnsafe() {
    // GitHub API tree endpoint does not reliably allow origin:null. Static viewer
    // mode must not depend on it.
    return staticFileOrigin();
  }

  function pathLooksUsefulLineageArtifact(path) {
    return /\.(trace|schema|workspace)\.md$/i.test(String(path || ''));
  }

  async function fetchJson(url) {
    // Guard direct accidental GitHub API tree calls in static mode too.
    if (githubTreeApiCorsUnsafe() && /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/git\/trees\//i.test(String(url || ''))) {
      throw new Error('GitHub API tree discovery is disabled in static file mode; use raw file links, hosted mode, or an explicit workspace entrypoint.');
    }
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  }




  function parentLinkCandidates(ws, node) {
    const candidates = [];
    const add = (value) => {
      const clean = String(value || '').trim();
      if (clean && !candidates.includes(clean)) candidates.push(clean);
    };

    const parentHref = node?.parentHref || '';
    const parentResolvedPath = node?.parentResolvedPath || '';
    const browseOrigin = originValueUrl(node?.parentOriginBrowse || '');
    const absoluteOrigin = originValueUrl(node?.parentOrigin?.absolute || '');

    add(parentResolvedPath);
    add(parentHref);
    add(browseOrigin);
    add(absoluteOrigin);

    for (const value of [parentHref, browseOrigin, absoluteOrigin]) {
      const converted = convertSourceUrl(value || '');
      if (converted) {
        add(converted.path);
        add(converted.rawUrl);
        add(converted.browseUrl);
      }
    }

    if (node?.repo && node?.ref && parentHref && !/^[a-z]+:/i.test(parentHref)) {
      const rel = canonicalWorkspacePath(joinPath(dirname(node.path), parentHref));
      add(rel);
      add(`https://raw.githubusercontent.com/${node.repo}/${node.ref}/${rel}`);
      add(`https://github.com/${node.repo}/blob/${node.ref}/${rel}`);
    }

    if (ws?.repo && ws?.ref && parentHref && !/^[a-z]+:/i.test(parentHref)) {
      const rel = canonicalWorkspacePath(joinPath(dirname(node.path), parentHref));
      add(rel);
      add(`https://raw.githubusercontent.com/${ws.repo}/${ws.ref}/${rel}`);
      add(`https://github.com/${ws.repo}/blob/${ws.ref}/${rel}`);
    }

    return candidates.filter(Boolean);
  }

  function nodeMatchesParentCandidate(parent, candidate) {
    if (!parent || !candidate) return false;
    const raw = String(candidate || '').trim();
    const converted = convertSourceUrl(raw);
    const candidatePath = canonicalWorkspacePath(converted?.path || raw);
    const candidateRaw = converted?.rawUrl || raw;
    const candidateBrowse = converted?.browseUrl || raw;

    return canonicalWorkspacePath(parent.path) === candidatePath
      || canonicalWorkspacePath(parent.rawUrl || '') === canonicalWorkspacePath(candidateRaw)
      || canonicalWorkspacePath(parent.browseUrl || '') === canonicalWorkspacePath(candidateBrowse)
      || (parent.rawUrl && parent.rawUrl === candidateRaw)
      || (parent.browseUrl && parent.browseUrl === candidateBrowse)
      || (converted?.rawUrl && parent.rawUrl === converted.rawUrl)
      || (converted?.browseUrl && parent.browseUrl === converted.browseUrl);
  }

  function resolveParentNode(ws, node) {
    if (!ws || !node) return null;

    for (const candidate of parentLinkCandidates(ws, node)) {
      const direct = sameWorkspacePathLookup(ws, candidate, node.sourceId)
        || sameWorkspacePathLookup(ws, candidate, '')
        || Array.from(ws.nodeById?.values?.() || []).find((parent) => parent !== node && nodeMatchesParentCandidate(parent, candidate));
      if (direct && direct !== node) return direct;
    }

    const fetchCandidate = parentFetchCandidate(ws, node);
    if (fetchCandidate) {
      return Array.from(ws.nodeById?.values?.() || []).find((parent) =>
        parent !== node &&
        (
          canonicalWorkspacePath(parent.path) === canonicalWorkspacePath(fetchCandidate.path)
          || (parent.rawUrl && parent.rawUrl === fetchCandidate.rawUrl)
          || (parent.browseUrl && parent.browseUrl === fetchCandidate.browseUrl)
        )
      ) || null;
    }

    return null;
  }





  function workspaceDisplayOptions(ws) {
    ws.displayOptions = ws.displayOptions || {};
    if (typeof ws.displayOptions.leavesOnly !== 'boolean') ws.displayOptions.leavesOnly = true;
    if (typeof ws.displayOptions.showTrace !== 'boolean') ws.displayOptions.showTrace = true;
    if (typeof ws.displayOptions.showSchema !== 'boolean') ws.displayOptions.showSchema = true;
    if (typeof ws.displayOptions.showWorkspace !== 'boolean') ws.displayOptions.showWorkspace = true;
    if (typeof ws.displayOptions.showAssets !== 'boolean') ws.displayOptions.showAssets = false;
    return ws.displayOptions;
  }

  function artifactDisplayKind(node) {
    const path = String(node?.path || '');
    if (/\.workspace\.md$/i.test(path)) return 'workspace';
    if (/\.schema\.md$/i.test(path)) return 'schema';
    if (/\.trace\.md$/i.test(path)) return 'trace';
    const schema = schemaKey(node?.currentSchemaText || node?.currentSchema || '');
    if (schema === 'workspace') return 'workspace';
    if (/schema/i.test(String(node?.currentSchemaText || node?.currentSchema || ''))) return 'schema';
    return 'trace';
  }

  function displayOptionAllowsNode(ws, node) {
    const opts = workspaceDisplayOptions(ws);
    const kind = artifactDisplayKind(node);
    if (kind === 'workspace') return opts.showWorkspace;
    if (kind === 'schema') return opts.showSchema;
    return opts.showTrace;
  }

  function filteredDiscoveryNodes(ws) {
    const filter = typeof normalizeDiscoveryFilterForWorkspace === 'function'
      ? normalizeDiscoveryFilterForWorkspace(ws)
      : (ws.discoveryFilterSchema || ws.filterSchema || 'all');
    const query = ws.discoverySearch || '';
    const opts = typeof workspaceDisplayOptions === 'function'
      ? workspaceDisplayOptions(ws)
      : { leavesOnly: true };

    let base = opts.leavesOnly ? ((ws.leaves && ws.leaves.length) ? ws.leaves : ws.nodes) : ws.nodes;
    if (typeof displayOptionAllowsNode === 'function') {
      base = base.filter((node) => displayOptionAllowsNode(ws, node));
    }

    if (filter === 'draft') {
      base = (ws.nodes || []).filter((node) => node.isGenerated && (!displayOptionAllowsNode || displayOptionAllowsNode(ws, node)));
    } else if (filter !== 'all') {
      base = base.filter((node) => schemaKey(node.currentSchemaText || node.currentSchema) === filter);
    }

    if (normalizeSearchText(query)) {
      base = base.filter((node) => nodeMatchesSearch(node, query));
    }

    return base;
  }

  function displayOptionsActiveCount(ws) {
    const opts = workspaceDisplayOptions(ws);
    let count = 0;
    if (opts.leavesOnly) count += 1;
    if (!opts.showTrace) count += 1;
    if (!opts.showSchema) count += 1;
    if (!opts.showWorkspace) count += 1;
    if (opts.showAssets) count += 1;
    return count;
  }
  registerRenderModalWrapper(function renderModalWithDisplayOptions(modal, next) {
    if (modal?.type === 'display-options') return renderDisplayOptionsModal(modal);
    return next(modal);
  });


  // --- Workspace shell rendering ---

  function renderWorkspace(ws) {
    const active = app.activeWorkspaceId === ws.id;
    const compact = ws.layoutMode === 'compact';
    if (compact) return renderCollapsedWorkspace(ws, active);
    const generatedCount = ws.generated.length;
    const selected = selectedNode(ws);
    const displayLabel = workspaceDisplayLabel(ws);
    const sources = countWorkspaceSources(ws);
    const localName = ws.localStateKey ? `<span class="badge-soft muted-chip" title="${escapeAttr(ws.localStateKey)}">local state</span>` : '';
    const displayCount = displayOptionsActiveCount(ws);
    const displayTitle = displayCount ? `${displayCount} display option${displayCount === 1 ? '' : 's'} active` : 'Display options';

    return `
      <section class="workspace workspace-foundation workspace-shell workspace-drop-target ${active ? 'active' : ''}" data-ws="${escapeAttr(ws.id)}">
        <div class="workspace-strip workspace-shell-strip">
          <div class="workspace-identity" title="${escapeAttr(ws.sourceNote || ws.label || '')}">
            <h2 class="workspace-title">${escapeHtml(displayLabel)} ${workspaceRefBadge(ws)} ${localName} ${active ? '<span class="badge-soft active-chip"><i class="fa-solid fa-circle-dot"></i>active</span>' : ''}</h2>
          </div>
          <div class="workspace-actions workspace-actions-foundation workspace-actions-shell">
            <span class="stat-pill" title="Trace files"><i class="fa-regular fa-file-lines"></i>${ws.nodes.length}</span>
            <span class="stat-pill" title="Sources"><i class="fa-solid fa-database"></i>${sources}</span>
            <span class="stat-pill" title="Leaf candidates"><i class="fa-solid fa-seedling"></i>${ws.leaves.length}</span>
            <span class="stat-pill" title="Drafts"><i class="fa-solid fa-pen-nib"></i>${generatedCount}</span>
            <button class="tv-btn small subtle display-options-action ${displayCount ? 'active' : ''}" data-action="open-display-options" data-ws="${escapeAttr(ws.id)}" title="${escapeAttr(displayTitle)}" aria-label="Display options"><i class="fa-solid fa-sliders"></i>${displayCount ? `<small>${displayCount}</small>` : ''}</button>
            ${renderPolicyBadge(ws)}
            <button class="tv-btn small" data-action="save-workspace" data-ws="${escapeAttr(ws.id)}" ${generatedCount || (ws.assets && ws.assets.size) ? '' : 'disabled'} title="Save workspace bundle"><i class="fa-solid fa-download"></i></button>
            <button class="tv-btn small primary workspace-add-btn icon-only" data-action="open-source-modal" data-ws="${escapeAttr(ws.id)}" title="Add material, source, or local root node to this workspace" aria-label="Add material, source, or local root node to this workspace"><i class="fa-solid fa-plus"></i></button>
            <button class="tv-btn small subtle" data-action="toggle-workspace-mode" data-mode="compact" data-ws="${escapeAttr(ws.id)}" title="Collapse workspace into a narrow board column"><i class="fa-solid fa-down-left-and-up-right-to-center"></i></button>
            <button class="tv-btn small subtle" data-action="remove-workspace" data-ws="${escapeAttr(ws.id)}" title="Remove workspace"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        ${renderWorkspaceSourceStrip(ws)}
        ${ws.policy?.status === 'missing' ? `<div class="policy-note danger workspace-policy-foundation workspace-policy-shell"><strong>No policy/license found.</strong> Derived work will create a decision leaf first if you choose to continue.</div>` : ''}
        ${ws.policy?.status === 'found' ? `<div class="policy-note workspace-policy-foundation workspace-policy-shell"><strong>${escapeHtml(ws.policy.kind)}:</strong> ${escapeHtml(shortText((ws.policy.text || '').split('\n').find(Boolean) || ws.policy.note, 140))}</div>` : ''}
        ${!ws.nodes.length && !ws.loading ? '<div class="workspace-drop-hint">Drop lineage files, configs, folders, or zips into this workspace · or use the source button above.</div>' : ''}
        ${renderWorkspaceFeed(ws, selected)}
      </section>`;
  }
  registerActionHandler(async function displayOptionsAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'open-display-options') {
      event.preventDefault();
      event.stopPropagation();
      app.modal = { type: 'display-options', wsId: event.currentTarget.dataset.ws || '' };
      render();
      return;
    }
    if (action === 'toggle-display-option') {
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const key = event.currentTarget.dataset.key || '';
      if (!ws || !key) return;
      const opts = workspaceDisplayOptions(ws);
      opts[key] = Boolean(event.currentTarget.checked);
      render();
      return;
    }
    return next(event);
  });




  function countWorkspaceSources(ws) {
    if (typeof sourceCount === 'function') return sourceCount(ws);
    ensureWorkspaceSources(ws);
    return Array.from(ws.sources?.values?.() || []).filter((source) =>
      source.kind !== 'draft' ||
      ws.generated?.length ||
      Array.from(ws.files?.values?.() || []).some((file) => file.sourceId === source.id)
    ).length;
  }

  function filteredDiscoverySources(ws) {
    ensureWorkspaceSources(ws);
    return Array.from(ws.sources?.values?.() || []).filter((source) =>
      source.kind !== 'draft' ||
      ws.generated?.length ||
      Array.from(ws.files?.values?.() || []).some((file) => file.sourceId === source.id)
    );
  }

  function discoverySchemaOptions(ws) {
    const seen = new Map();
    const add = (key, label) => {
      if (!key || seen.has(key)) return;
      seen.set(key, label || key);
    };
    add('all', 'All');
    for (const node of ws.nodes || []) {
      if (node.isGenerated) continue;
      const schema = node.currentSchemaText || node.currentSchema || '';
      const key = schemaKey(schema);
      if (key && key !== 'all' && key !== 'draft') add(key, shortSchema(schema));
    }
    if ((ws.nodes || []).some((node) => node.isGenerated)) add('draft', 'Drafts');
    return Array.from(seen.entries()).map(([key, label]) => [key, label]);
  }

  function renderDiscoveryFilterSelect(ws) {
    const value = ws.discoveryFilterSchema || ws.filterSchema || 'all';
    const options = discoverySchemaOptions(ws);
    return `<label class="filter-select-wrap display-options-filter" title="Discovery filter">
      <span>Filter</span>
      <select data-discovery-filter-select data-ws="${escapeAttr(ws.id)}">
        ${options.map(([key, label]) => `<option value="${escapeAttr(key)}" ${value === key ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
      </select>
    </label>`;
  }

  function renderDisplayOptionsModal(modal) {
    const ws = getWorkspace(modal.wsId);
    if (!ws) return '';
    const opts = workspaceDisplayOptions(ws);
    const row = (key, label, help, checked) => `
      <label class="display-option-row">
        <span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(help)}</small>
        </span>
        <input type="checkbox" data-action="toggle-display-option" data-ws="${escapeAttr(ws.id)}" data-key="${escapeAttr(key)}" ${checked ? 'checked' : ''}>
      </label>`;

    return `
      <div class="modal-backdrop-custom focus-modal display-options-backdrop" role="dialog" aria-modal="true" aria-labelledby="display-options-title">
        <div class="modal-panel display-options-panel">
          <div class="modal-header-lite display-options-head">
            <div>
              <p class="kicker">Display</p>
              <h2 class="modal-title-lite" id="display-options-title">Display options</h2>
              <p class="text-secondary mb-0">Choose which workspace artifacts discovery should show.</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="display-options-body">
            <div class="display-options-section-label">Discovery filter</div>
            <div class="display-options-filter-card">
              ${renderDiscoveryFilterSelect(ws)}
              <small>Filter by the artifact types currently loaded in this workspace.</small>
            </div>
            ${row('leavesOnly', 'Leaves only', 'Show only leaf candidates in discovery. Turn off to include parents and intermediate nodes.', opts.leavesOnly)}
            <div class="display-options-section-label">Artifact suffixes</div>
            ${row('showTrace', 'Show .trace.md', 'Regular trace lineage artifacts.', opts.showTrace)}
            ${row('showSchema', 'Show .schema.md', 'Schema lineage artifacts and format rules.', opts.showSchema)}
            ${row('showWorkspace', 'Show .workspace.md', 'Workspace entrypoints as lineage artifacts.', opts.showWorkspace)}
            ${row('showAssets', 'Show assets', 'Imported non-lineage files such as images, PDFs, zip files, and supporting material.', opts.showAssets)}
          </div>
        </div>
      </div>`;
  }





  function normalizeJsdelivrFlatPath(name) {
    return canonicalWorkspacePath(String(name || '').replace(/^\/+/, ''));
  }

  async function discoverGitHubTracePathsViaJsdelivr(repo, ref, rootPaths) {
    const resolvedRef = ref || 'master';
    const url = `https://data.jsdelivr.com/v1/package/gh/${repo}@${encodeURIComponent(resolvedRef)}/flat`;
    const data = await fetchJson(url);
    const files = Array.isArray(data.files) ? data.files : [];
    const effectiveRoots = (rootPaths && rootPaths.length ? rootPaths : ['.topics']).map(normalizeRepoPath).filter(Boolean);
    const allPaths = files
      .map((file) => normalizeJsdelivrFlatPath(file.name || file.path || ''))
      .filter((path) => pathLooksUsefulLineageArtifact(path))
      .filter((path) => effectiveRoots.some((root) => !root || path === root || path.startsWith(`${root}/`)))
      .sort((a, b) => a.localeCompare(b));
    const traceOnly = allPaths.filter((path) => /\.trace\.md$/i.test(path));

    return {
      repo,
      ref: resolvedRef,
      rootPath: effectiveRoots[0] || '',
      rootPaths: effectiveRoots,
      truncated: false,
      tracePaths: allPaths,
      schemaPaths: allPaths.filter((path) => /\.schema\.md$/i.test(path)),
      workspacePaths: allPaths.filter((path) => /\.workspace\.md$/i.test(path)),
      numericLeafGuess: traceOnly.filter((path) => maybeLeafByNumericName(path, traceOnly)),
      discoverySource: 'jsdelivr-flat'
    };
  }

  async function discoverGitHubTracePaths(repo, ref, rootPath = '.topics') {
    const resolvedRef = ref || 'master';
    const roots = Array.isArray(rootPath) ? rootPath.map(normalizeRepoPath).filter(Boolean) : parseRootPaths(rootPath);
    const effectiveRoots = roots.length ? roots : ['.topics'];

    if (githubTreeApiCorsUnsafe()) {
      try {
        return await discoverGitHubTracePathsViaJsdelivr(repo, resolvedRef, effectiveRoots);
      } catch (error) {
        return {
          repo,
          ref: resolvedRef,
          rootPath: effectiveRoots[0] || '',
          rootPaths: effectiveRoots,
          truncated: false,
          tracePaths: [],
          schemaPaths: [],
          workspacePaths: [],
          numericLeafGuess: [],
          note: `Static Git discovery fallback failed: ${error.message}`
        };
      }
    }

    const api = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(resolvedRef)}?recursive=1`;
    const data = await fetchJson(api);
    const tree = Array.isArray(data.tree) ? data.tree : [];
    const allPaths = tree
      .filter((item) => item && item.type === 'blob' && pathLooksUsefulLineageArtifact(item.path || ''))
      .map((item) => item.path)
      .filter((path) => effectiveRoots.some((root) => !root || path === root || path.startsWith(`${root}/`)))
      .sort((a, b) => a.localeCompare(b));
    const traceOnly = allPaths.filter((path) => /\.trace\.md$/i.test(path));

    return {
      repo,
      ref: resolvedRef,
      rootPath: effectiveRoots[0] || '',
      rootPaths: effectiveRoots,
      truncated: Boolean(data.truncated),
      tracePaths: allPaths,
      schemaPaths: allPaths.filter((path) => /\.schema\.md$/i.test(path)),
      workspacePaths: allPaths.filter((path) => /\.workspace\.md$/i.test(path)),
      numericLeafGuess: traceOnly.filter((path) => maybeLeafByNumericName(path, traceOnly)),
      discoverySource: 'github-api'
    };
  }

  function renderPolicyDocumentModal(modal) {
    const ws = getWorkspace(modal.wsId);
    const doc = policyDocumentForModal(ws, modal.kind || 'policy');
    const sourceUrl = policySourceUrl(doc);
    const sourceAction = sourceUrl
      ? `<a class="tv-btn subtle" href="${escapeAttr(sourceUrl)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open source</a>`
      : '';
    const hasText = Boolean((doc.text || '').trim());

    return `
      <div class="modal-backdrop-custom focus-modal policy-document-backdrop" role="dialog" aria-modal="true" aria-labelledby="policy-document-title">
        <div class="modal-panel read-modal-panel policy-document-panel ${hasText ? '' : 'empty-policy-document-panel'}">
          <div class="modal-header-lite sticky-modal-head read-modal-head policy-document-head">
            <div>
              <p class="kicker">${doc.kind === 'notice' ? 'Notice' : 'License / policy'}</p>
              <h2 class="modal-title-lite" id="policy-document-title"><i class="${escapeAttr(doc.icon)}"></i>${escapeHtml(doc.title)}</h2>
              <p class="text-secondary mb-0">${escapeHtml(doc.note || '')}</p>
            </div>
            <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-read-scroll policy-document-scroll">
            <div class="policy-document-meta compact">
              <span><strong>Workspace</strong>${escapeHtml(ws?.label || 'Unknown workspace')}</span>
              <span><strong>Status</strong>${escapeHtml(doc.status || 'unknown')}</span>
              <span><strong>Document</strong>${escapeHtml(doc.label || doc.title || 'Policy')}</span>
            </div>
            ${hasText ? renderPolicyDocumentBody(doc) : `<div class="policy-empty-note compact"><i class="${escapeAttr(doc.icon)}"></i><div><strong>${escapeHtml(doc.title)}</strong><p>${escapeHtml(doc.note || 'No policy document text is available.')}</p></div></div>`}
            ${sourceAction ? `<div class="modal-actions policy-document-actions">${sourceAction}</div>` : ''}
          </div>
        </div>
      </div>`;
  }




  function sameImportedPath(a, b) {
    return normalizeAssetPath(canonicalWorkspacePath(a || '')) === normalizeAssetPath(canonicalWorkspacePath(b || ''));
  }




  function renderWorkspaceSourceStrip(ws) {
    ensureWorkspaceSources(ws);
    const sources = Array.from(ws.sources?.values?.() || [])
      .filter((source) => {
        const count = sourceDisplayCount(ws, source);
        if (source.kind === 'draft') return Boolean(ws.generated?.length || count);
        return count > 0;
      });
    if (!sources.length) return '';
    return `<div class="workspace-source-strip" aria-label="Workspace sources">
      ${sources.map((source) => {
        const icon = source.kind === 'github' ? 'fa-brands fa-github' : (source.kind === 'draft' ? 'fa-solid fa-pen-nib' : (source.kind === 'local' ? 'fa-solid fa-folder-open' : 'fa-solid fa-link'));
        const count = sourceDisplayCount(ws, source);
        return `<span class="workspace-source-pill ${sourceBadgeClass(source)}" title="${escapeAttr(source.origin || source.label || source.id)}">
          <i class="${icon}"></i>
          <span>${escapeHtml(shortText(sourceShortLabel(ws, source.id), 34))}</span>
          <small>${count}</small>
          <button class="source-close-btn" data-action="close-source" data-ws="${escapeAttr(ws.id)}" data-source="${escapeAttr(source.id)}" title="Close this source from the workspace" aria-label="Close source ${escapeAttr(source.label || source.id)}"><i class="fa-solid fa-xmark"></i></button>
        </span>`;
      }).join('')}
    </div>`;
  }

  function removeNodeFromWorkspace(wsId, nodeId) {
    const ws = getWorkspace(wsId);
    const node = ws?.nodeById?.get?.(nodeId);
    if (!ws || !node) return;
    if (!canRemoveNodeForNow(ws, node)) {
      toast('Only local/uploaded or generated nodes can be removed in this basic mode.', 'warn');
      return;
    }

    const childCount = node.children?.length || 0;
    const message = childCount
      ? `Remove local node "${node.title}"?\n\nIt has ${childCount} child node(s) in this workspace. This removes the imported file and its preserved local asset copy from the current workspace; it does not rewrite descendants.`
      : `Remove local node "${node.title}"?\n\nThis removes the imported file and its preserved local asset copy from the current workspace.`;
    if (!window.confirm(message)) return;

    const keys = [
      node.storageKey,
      node.file?.storageKey,
      node.file?.path,
      sourceFileKey(node.sourceId || '', node.path, Boolean(node.isGenerated)),
      sourceFileKey(node.sourceId || '', node.path, false),
      node.path
    ].filter(Boolean);

    let removedFiles = 0;
    keys.forEach((key) => {
      if (ws.files?.delete?.(key)) removedFiles += 1;
    });

    for (const [key, file] of Array.from(ws.files || [])) {
      if (
        file === node.file ||
        (sameImportedPath(file.path, node.path) && (!node.sourceId || file.sourceId === node.sourceId)) ||
        (file.storageKey && keys.includes(file.storageKey))
      ) {
        ws.files.delete(key);
        removedFiles += 1;
      }
    }

    const removedAssets = removeWorkspaceAssetMatches(ws, node);
    clearParentFetchStateForNode(ws, node);

    if (Array.isArray(ws.generated)) {
      ws.generated = ws.generated.filter((item) => item.path !== node.path && item.storageKey !== node.storageKey);
    }

    if (ws.selectedNodeId === node.id) ws.selectedNodeId = null;
    if (typeof clearFetchedParentForRemovedLocalBoundary === 'function') clearFetchedParentForRemovedLocalBoundary(ws, node);
    if (typeof pruneOrphanLineageAssets === 'function') pruneOrphanLineageAssets(ws);
    computeWorkspaceIndex(ws);
    if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
    if (typeof setRouteState === 'function') setRouteState('replace');
    else if (typeof updateUrlState === 'function') updateUrlState();
    render();

    const total = removedFiles + removedAssets;
    toast(total ? 'Removed local node and preserved import residue.' : 'Node was not found in workspace files/assets.', total ? 'ok' : 'warn');
  }




  function collectTreeFolderPaths(folder, out = []) {
    if (!folder?.folders) return out;
    for (const child of folder.folders.values()) {
      if (child?.path) out.push(child.path);
      collectTreeFolderPaths(child, out);
    }
    return out;
  }

  function treeFolderPathsForNodes(ws, nodes) {
    const tree = buildDiscoveryTree(ws, nodes || []);
    return collectTreeFolderPaths(tree, []);
  }

  function treeAllControlState(ws, nodes) {
    const paths = treeFolderPathsForNodes(ws, nodes);
    const expanded = paths.filter((path) => treeFolderExpanded(ws, path)).length;
    return {
      paths,
      expanded,
      collapsed: Math.max(0, paths.length - expanded),
      action: expanded ? 'collapse' : 'expand'
    };
  }

  function renderTreeAllControl(ws, nodes) {
    const discoveryView = ws.discoveryView || 'feed';
    if (discoveryView !== 'tree') return '';
    const state = treeAllControlState(ws, nodes);
    if (!state.paths.length) {
      return `<button class="tv-btn tiny subtle tree-all-toggle disabled-placeholder" type="button" disabled aria-disabled="true" title="No tree folders in current result">
        <i class="fa-solid fa-expand"></i>
      </button>`;
    }
    const collapse = state.action === 'collapse';
    return `<button class="tv-btn tiny subtle tree-all-toggle" data-action="toggle-tree-all" data-ws="${escapeAttr(ws.id)}" data-mode="${collapse ? 'collapse' : 'expand'}" title="${collapse ? 'Collapse all folders' : 'Expand all folders'}" aria-label="${collapse ? 'Collapse all folders' : 'Expand all folders'}">
      <i class="fa-solid ${collapse ? 'fa-compress' : 'fa-expand'}"></i>
    </button>`;
  }

  function setTreeAllExpanded(ws, nodes, expanded) {
    const paths = treeFolderPathsForNodes(ws, nodes);
    ws.treeExpandedFolders = ws.treeExpandedFolders || {};
    for (const path of paths) ws.treeExpandedFolders[path] = Boolean(expanded);
    return paths.length;
  }


  // --- Discovery feed rendering ---

  function renderWorkspaceFeed(ws, selected) {
    const mode = selected ? 'lineage' : 'discovery';
    const traversal = selected ? lineageTraversal(selected) : null;
    const windowState = selected ? ensureLineageWindow(ws, selected.id) : null;
    const lineageQuery = ws.lineageSearch || '';
    const searchActive = selected && normalizeSearchText(lineageQuery);
    const allNodes = traversal ? traversal.nodes : filteredDiscoveryNodes(ws);
    const visibleCount = traversal ? (searchActive ? allNodes.length : Math.min(allNodes.length, windowState.visibleCount)) : allNodes.length;
    if (selected && traversal && !searchActive) scheduleLineageParentPrefetch(ws, selected, traversal, windowState.visibleCount);
    const nodes = traversal ? allNodes.slice(0, visibleCount) : allNodes;
    const discoveryView = ws.discoveryView || 'feed';
    const showOriginCard = traversal?.nonLineageOrigin && visibleCount >= traversal.nodes.length && !searchActive;
    const openBoundary = selected ? firstOpenLineageBoundary(ws, selected) : null;

    const bodyHtml = mode === 'discovery' && discoveryView === 'tree'
      ? renderDiscoveryTree(ws, nodes)
      : (nodes.length ? renderLineageNodeList(ws, nodes, mode, searchActive, lineageQuery) : '<div class="empty-state">No nodes match this view.</div>');

    const html = `
      <div class="feed-toolbar feed-toolbar-foundation feed-toolbar-shell feed-toolbar-layout ${mode}">
        <div class="feed-mode${selected ? ' mobile-lineage-actions' : ' view-toggle'}">
          <span class="kicker-inline">${mode === 'lineage' ? 'Lineage mode' : 'Discovery mode'}</span>
          ${selected ? `<button class="tv-btn tiny subtle back-button" data-action="clear-selection" data-ws="${escapeAttr(ws.id)}" title="Back to discovery"><i class="fa-solid fa-arrow-left"></i>Back</button>` : renderDiscoveryViewToggle(ws)}
          ${selected ? `<button class="tv-btn tiny subtle audit-lineage-btn ${openBoundary ? 'open' : ''}" data-action="audit-lineage" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(selected.id)}" title="${openBoundary ? 'Load the next fetchable parent boundary' : 'No open fetchable parent boundary'}"><i class="fa-solid fa-shield-halved"></i>Audit</button>` : ''}
        </div>
        ${mode === 'lineage' ? `
          <div class="lineage-search-wrap">
            ${renderSearchInput(ws, 'lineage')}
          </div>` : `
          <div class="discovery-tools discovery-tools-foundation discovery-tools-layout display-filter-in-dialog tree-toolbar-tools">
            ${renderTreeAllControl(ws, nodes)}
            ${renderSearchInput(ws, 'discovery')}
          </div>`}
      </div>
      <div class="post-feed ${mode} ${mode === 'discovery' ? `view-${discoveryView}` : ''}" data-ws="${escapeAttr(ws.id)}" data-selected="${selected ? escapeAttr(selected.id) : ''}">
        ${mode === 'lineage' ? renderLineageSearchLegend(ws, traversal, allNodes, lineageQuery) : ''}
        ${bodyHtml}
        ${showOriginCard ? renderNonLineageOriginCard(ws, traversal.nonLineageOrigin) : ''}
        ${traversal ? renderLineageTraversalFooter(ws, selected, traversal, visibleCount) : ''}
      </div>`;

    if (selected && typeof refreshVisibleIntegrityAfterLineageLoad === 'function') {
      setTimeout(() => refreshVisibleIntegrityAfterLineageLoad(ws), 0);
    }
    return html;
  }
  registerActionHandler(async function treeAllAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'toggle-tree-all') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      const nodes = filteredDiscoveryNodes(ws);
      const mode = event.currentTarget.dataset.mode || 'collapse';
      const count = setTreeAllExpanded(ws, nodes, mode === 'expand');
      if (count && typeof setRouteState === 'function') setRouteState('replace');
      render();
      return;
    }
    return next(event);
  });




  function isLineageMarkdownPath(path) {
    return /\.(trace|schema|workspace)\.md$/i.test(String(path || ''));
  }

  function fileMatchesSourcePath(file, sourceId, path) {
    if (!file || !path) return false;
    const samePath = sameImportedPath(file.path, path) || sameImportedPath(file.storageKey, path);
    if (!samePath) return false;
    if (!sourceId) return true;
    return file.sourceId === sourceId || file.storageKey === sourceFileKey(sourceId, path, Boolean(file.isGenerated));
  }

  function workspaceHasIndexedFileInSource(ws, sourceId, path) {
    const key = sourceFileKey(sourceId || '', path, false);
    if (ws.files?.has?.(key)) return true;
    return Array.from(ws.files?.values?.() || []).some((file) => fileMatchesSourcePath(file, sourceId, path));
  }

  function pruneOrphanLineageAssets(ws) {
    if (!ws?.assets) return 0;
    let removed = 0;
    for (const [key, asset] of Array.from(ws.assets.entries())) {
      const path = asset?.path || key;
      if (!isLineageMarkdownPath(path)) continue;
      const sourceId = asset?.sourceId || (key.includes('::') ? key.split('::')[0] : '');
      const hasIndexed = workspaceHasIndexedFileInSource(ws, sourceId, path)
        || (!sourceId && Array.from(ws.files?.values?.() || []).some((file) => sameImportedPath(file.path, path)));
      if (hasIndexed) continue;

      ws.assets.delete(key);
      removed += 1;
      if (ws.assetUrls?.has?.(key)) {
        try { URL.revokeObjectURL(ws.assetUrls.get(key)); } catch (_) {}
        ws.assetUrls.delete(key);
      }
      if (ws.assetUrls?.has?.(path)) {
        try { URL.revokeObjectURL(ws.assetUrls.get(path)); } catch (_) {}
        ws.assetUrls.delete(path);
      }
    }
    return removed;
  }

  function workspaceHasPathInSource(ws, sourceId, path) {
    pruneOrphanLineageAssets(ws);
    const clean = normalizeAssetPath(path || '');
    const key = sourceFileKey(sourceId || '', clean, false);
    if (isLineageMarkdownPath(clean)) {
      return workspaceHasIndexedFileInSource(ws, sourceId, clean);
    }
    return Boolean(ws.assets?.has?.(key) || ws.files?.has?.(key));
  }

  function detectImportConflicts(ws, entries) {
    pruneOrphanLineageAssets(ws);
    const conflicts = [];
    const traceSlots = new Map();
    const localId = localSource(ws).id;

    for (const file of ws.files?.values?.() || []) {
      if (file.sourceId !== localId) continue;
      if (/\.trace\.md$/i.test(file.path)) {
        const slot = traceDimensionSlot(file.path);
        if (slot) traceSlots.set(slot, file.path);
      }
    }

    for (const entry of entries) {
      const sourceId = entry.sourceId || localId;
      if (entry.kind === 'trace' && sourceId === localId) {
        const slot = traceDimensionSlot(entry.path);
        const existingPath = slot ? traceSlots.get(slot) : '';
        if (existingPath) {
          conflicts.push({ type: 'trace-slot', incoming: entry.path, existing: existingPath, slot, sourceId });
          continue;
        }
      }

      if (workspaceHasPathInSource(ws, sourceId, entry.path)) {
        conflicts.push({ type: 'path', incoming: entry.path, existing: entry.path, slot: '', sourceId });
      }
    }

    return conflicts;
  }

  function removeWorkspaceAssetMatches(ws, node) {
    if (!ws?.assets || !node) return 0;
    const nodePath = normalizeAssetPath(node.path || '');
    const sourceId = node.sourceId || '';
    const paths = [
      nodePath,
      node.storageKey,
      node.file?.path,
      node.file?.storageKey,
      sourceFileKey(sourceId, nodePath, false),
      sourceFileKey(sourceId, nodePath, Boolean(node.isGenerated))
    ].filter(Boolean);

    let removed = 0;
    for (const [key, asset] of Array.from(ws.assets.entries())) {
      const assetPath = normalizeAssetPath(asset?.path || key);
      const samePath = paths.some((path) =>
        key === path ||
        sameImportedPath(assetPath, path) ||
        sameImportedPath(key, path)
      );
      const sameSource =
        !sourceId ||
        !asset?.sourceId ||
        asset.sourceId === sourceId ||
        key === sourceFileKey(sourceId, nodePath, false) ||
        key.startsWith(`${sourceId}::`);

      // Local uploaded lineage assets may have raw paths with no source id.
      const samePathLocalLineageCopy =
        sourceId === 'local' &&
        isLineageMarkdownPath(assetPath) &&
        sameImportedPath(assetPath, nodePath) &&
        (!asset?.sourceId || asset.sourceId === 'local');

      if ((samePath && sameSource) || samePathLocalLineageCopy) {
        ws.assets.delete(key);
        removed += 1;
        for (const urlKey of [key, assetPath]) {
          if (ws.assetUrls?.has?.(urlKey)) {
            try { URL.revokeObjectURL(ws.assetUrls.get(urlKey)); } catch (_) {}
            ws.assetUrls.delete(urlKey);
          }
        }
      }
    }
    return removed;
  }

  function sourceDisplayCount(ws, source) {
    pruneOrphanLineageAssets(ws);
    const files = Array.from(ws.files?.values?.() || []).filter((file) => file.sourceId === source.id);
    const assets = Array.from(ws.assets?.values?.() || []).filter((asset) => {
      if (asset.sourceId !== source.id) return false;
      if (isLineageMarkdownPath(asset.path)) return !workspaceHasIndexedFileInSource(ws, source.id, asset.path);
      return true;
    });
    return files.length || assets.length;
  }





  function autoParentFetchKey(ws, last, candidate) {
    return `${ws?.id || ''}:${candidate?.key || candidate?.rawUrl || candidate?.browseUrl || candidate?.path || ''}`;
  }

  function clearAutoParentFetchCacheForNode(ws, node) {
    if (!app.autoParentFetches || !ws || !node) return;

    const candidateKeys = [];
    try {
      const candidate = parentFetchCandidate(ws, node);
      if (candidate) candidateKeys.push(autoParentFetchKey(ws, node, candidate));
    } catch (_) {}

    const transientPrefix = `${ws.id}:${node.id}:`;
    const parentHref = String(node.parentHref || '');
    const parentPath = String(node.parentResolvedPath || '');
    const parentAbsolute = String(originValueUrl(node.parentOrigin?.absolute || ''));
    const parentBrowse = String(originValueUrl(node.parentOriginBrowse || ''));

    for (const key of Array.from(app.autoParentFetches)) {
      if (
        key.startsWith(transientPrefix) ||
        candidateKeys.includes(key) ||
        (parentHref && key.includes(parentHref)) ||
        (parentPath && key.includes(parentPath)) ||
        (parentAbsolute && key.includes(parentAbsolute)) ||
        (parentBrowse && key.includes(parentBrowse))
      ) {
        app.autoParentFetches.delete(key);
      }
    }
  }

  function clearParentFetchStateForNode(ws, node) {
    if (!ws || !node) return;
    clearAutoParentFetchCacheForNode(ws, node);
    if (!ws.parentFetches) return;

    for (const [key, state] of Object.entries(ws.parentFetches)) {
      const candidate = state?.candidate || {};
      const sameFetchedParent =
        sameImportedPath(candidate.path, node.path) ||
        (candidate.rawUrl && node.rawUrl && candidate.rawUrl === node.rawUrl) ||
        (candidate.browseUrl && node.browseUrl && candidate.browseUrl === node.browseUrl);

      const sameOpenBoundary =
        (node.parentHref && key.includes(node.parentHref)) ||
        (node.parentResolvedPath && key.includes(node.parentResolvedPath)) ||
        (node.parentOrigin?.absolute && key.includes(originValueUrl(node.parentOrigin.absolute))) ||
        (node.parentOriginBrowse && key.includes(originValueUrl(node.parentOriginBrowse)));

      if (sameFetchedParent || sameOpenBoundary) delete ws.parentFetches[key];
    }
  }

  // IMPORTANT: use assignment override, not `async function commitImportEntries(...)`.
  const commitImportEntriesBeforeAutoParentCache = commitImportEntries;
  commitImportEntries = async function commitImportEntriesWithAutoParentCache(ws, entries, options = {}) {
    const result = await commitImportEntriesBeforeAutoParentCache(ws, entries, options);

    if (ws) {
      for (const entry of entries || []) {
        const mappedPath = normalizeAssetPath(options.pathMap?.get?.(entry.path) || entry.path || '');
        const node = Array.from(ws.nodeById?.values?.() || []).find((candidate) => sameImportedPath(candidate.path, mappedPath));
        if (node) clearAutoParentFetchCacheForNode(ws, node);
      }
    }

    return result;
  };




  function parentCandidateCurrentlyLoaded(ws, candidate) {
    if (!ws || !candidate) return false;
    return Array.from(ws.nodeById?.values?.() || []).some((node) =>
      node &&
      (
        (candidate.path && sameImportedPath(node.path, candidate.path)) ||
        (candidate.rawUrl && node.rawUrl && node.rawUrl === candidate.rawUrl) ||
        (candidate.browseUrl && node.browseUrl && node.browseUrl === candidate.browseUrl)
      )
    );
  }

  function parentFetchState(ws, node) {
    const candidate = parentFetchCandidate(ws, node);
    if (!candidate) return null;
    ws.parentFetches = ws.parentFetches || {};
    const state = ws.parentFetches[candidate.key] || null;

    // A previous lazy-load may have been removed from the workspace while its cache
    // state still says "loaded". Do not let that stale state block re-fetch.
    if (state?.status === 'loaded' && !parentCandidateCurrentlyLoaded(ws, candidate)) {
      delete ws.parentFetches[candidate.key];
      if (app.autoParentFetches) {
        app.autoParentFetches.delete(autoParentFetchKey(ws, node, candidate));
        app.autoParentFetches.delete(`${ws.id}:${node.id}:${candidate.key}`);
      }
      return null;
    }

    return state;
  }

  function firstOpenLineageBoundary(ws, selected) {
    if (!ws || !selected) return null;
    const traversal = lineageTraversal(selected);
    if (!traversal?.parentUnavailable) return null;
    const last = traversal.nodes[traversal.nodes.length - 1];
    const candidate = parentFetchCandidate(ws, last);
    if (!last || !candidate) return null;
    const state = parentFetchState(ws, last);
    if (state?.status === 'loading' || state?.status === 'loaded') return null;
    return { last, candidate, traversal };
  }

  function scheduleLineageParentPrefetch(ws, selected, traversal, visibleCount) {
    if (!ws || !selected || !traversal?.parentUnavailable) return;
    const last = traversal.nodes[traversal.nodes.length - 1];
    const candidate = parentFetchCandidate(ws, last);
    if (!candidate) return;

    const state = parentFetchState(ws, last);
    if (state?.status === 'loading' || state?.status === 'loaded') return;

    const key = autoParentFetchKey(ws, last, candidate);
    app.autoParentFetches = app.autoParentFetches || new Set();

    const parentState = ws.parentFetches?.[candidate.key];
    if (app.autoParentFetches.has(key) && parentState?.status !== 'failed') return;

    app.autoParentFetches.add(key);
    setTimeout(() => {
      const latestState = parentFetchState(ws, last);
      if (latestState?.status === 'loading' || latestState?.status === 'loaded') return;
      fetchParentTrace(ws, last, candidate);
    }, 0);
  }

  function clearFetchedParentForRemovedLocalBoundary(ws, removedNode) {
    // When a local/uploaded leaf is removed, also remove parent nodes that were only
    // lazy-loaded as that leaf's external boundary and are not referenced by any
    // remaining node. This avoids a half-cached "loaded" boundary after reimport.
    if (!ws || !removedNode) return 0;
    const candidate = parentFetchCandidate(ws, removedNode);
    if (!candidate) return 0;

    const parent = Array.from(ws.nodeById?.values?.() || []).find((node) =>
      node &&
      node !== removedNode &&
      (
        (candidate.path && sameImportedPath(node.path, candidate.path)) ||
        (candidate.rawUrl && node.rawUrl && node.rawUrl === candidate.rawUrl) ||
        (candidate.browseUrl && node.browseUrl && node.browseUrl === candidate.browseUrl)
      )
    );
    if (!parent) return 0;

    const stillReferenced = Array.from(ws.nodeById?.values?.() || []).some((node) => {
      if (!node || node === removedNode || node === parent) return false;
      const pc = parentFetchCandidate(ws, node);
      return pc && (
        (pc.path && sameImportedPath(parent.path, pc.path)) ||
        (pc.rawUrl && parent.rawUrl && parent.rawUrl === pc.rawUrl) ||
        (pc.browseUrl && parent.browseUrl && parent.browseUrl === pc.browseUrl)
      );
    });

    if (stillReferenced) return 0;

    const keys = [
      parent.storageKey,
      parent.file?.storageKey,
      parent.file?.path,
      sourceFileKey(parent.sourceId || '', parent.path, Boolean(parent.isGenerated)),
      sourceFileKey(parent.sourceId || '', parent.path, false),
      parent.path
    ].filter(Boolean);

    for (const key of keys) ws.files?.delete?.(key);
    removeWorkspaceAssetMatches(ws, parent);
    clearParentFetchStateForNode(ws, parent);
    return 1;
  }




  function defaultArtifactTemplate(kind, path, title) {
    const safeTitle = title || (kind === 'schema' ? 'New Schema' : kind === 'workspace' ? 'New Workspace' : 'New Trace');
    const schema = kind === 'schema'
      ? 'tiinex.root.v1'
      : kind === 'workspace'
        ? 'tiinex.workspace.v1'
        : 'tiinex.topic.v1';
    const body = kind === 'workspace' ? schemaTemplate('tiinex.workspace.v1').body : schemaTemplate(schema).body;
    return `# Continuity Context

- Envelope Schema: ${envelopeSchemaReference(path)}
${currentBlockForPath(schema, 'Draft created in Tiinex Viewer.', path)}
---

# ${safeTitle}

${body}

---

${integrityFooter('self', 'pending')}`;
  }
  registerRenderModalWrapper(function renderModalWithEditAdd(modal, next) {
    if (modal?.type === 'edit-node') return renderEditNodeModal(modal);
    if (modal?.type === 'add-artifact') return renderAddArtifactModal(modal);
    return next(modal);
  });


  function updateModalField(field, value) {
    if (!app.modal) return false;
    if (app.modal.type === 'artifact-wizard') {
      if (field === 'wizardTitle') { app.modal.title = value; return true; }
      if (field === 'wizardSummary') { app.modal.summary = value; return true; }
      if (field === 'wizardBody') { app.modal.body = value; return true; }
    }
    if (field === 'editNodeText') {
      app.modal.text = value;
      return true;
    }
    if (field === 'addArtifactKind') {
      const oldKind = app.modal.kind || 'trace';
      app.modal.kind = value || 'trace';
      const currentPath = app.modal.path || '';
      if (!currentPath || currentPath.endsWith(`.${oldKind}.md`) || currentPath === '.topics/new.trace.md' || currentPath === '.topics/.schemas/new.schema.md' || currentPath === '.topics/workspaces/new.workspace.md') {
        app.modal.path = app.modal.kind === 'schema' ? '.topics/.schemas/new.schema.md' : app.modal.kind === 'workspace' ? '.topics/workspaces/new.workspace.md' : '.topics/new.trace.md';
      }
      app.modal.text = defaultArtifactTemplate(app.modal.kind, app.modal.path, app.modal.title || '');
      render();
      return true;
    }
    if (field === 'addArtifactPath') {
      app.modal.path = value;
      return true;
    }
    if (field === 'addArtifactTitle') {
      app.modal.title = value;
      return true;
    }
    if (field === 'addArtifactText') {
      app.modal.text = value;
      return true;
    }
    return false;
  }


  function upsertWorkspaceTextFile(ws, path, text, sourceId = 'local') {
    ensureWorkspaceSources(ws);
    const source = ws.sources.get(sourceId) || localSource(ws);
    const cleanPath = canonicalWorkspacePath(path || '');
    const storageKey = sourceFileKey(source.id, cleanPath, false);
    const normalized = normalizeNewlines(text || '');
    const file = {
      workspaceId: ws.id,
      path: cleanPath,
      name: fileNameFromPath(cleanPath),
      content: normalized,
      text: normalized,
      sourceId: source.id,
      sourceKind: source.kind,
      sourceLabel: source.label,
      storageKey,
      isGenerated: false
    };
    ws.files.set(storageKey, file);
    scheduleLocalStateSaveAfterWorkspaceMutation();
    return file;
  }

  function saveNodeEdit(ws, node, text) {
    const path = node.path || node.file?.path || 'edited.trace.md';
    const sourceId = node.sourceId || node.file?.sourceId || 'local';
    const file = upsertWorkspaceTextFile(ws, path, text, sourceId);
    // Replace preserved markdown asset too so export/preview sees the edited text.
    const assetKey = sourceFileKey(sourceId, path, false);
    ws.assets = ws.assets || new Map();
    ws.assets.set(assetKey, {
      path,
      sourceId,
      sourceKind: file.sourceKind,
      sourceLabel: file.sourceLabel,
      text,
      mime: 'text/markdown',
      kind: 'text'
    });
    computeWorkspaceIndex(ws);
    const edited = Array.from(ws.nodeById?.values?.() || []).find((candidate) => sameImportedPath(candidate.path, path));
    if (edited) ws.selectedNodeId = edited.id;
  }

  function validateNewArtifactPath(path, kind) {
    const clean = canonicalWorkspacePath(path || '');
    if (!clean) return 'Path is required.';
    if (!/\.md$/i.test(clean)) return 'Path must end with .md.';
    if (kind === 'trace' && !/\.trace\.md$/i.test(clean)) return 'Trace path must end with .trace.md.';
    if (kind === 'schema' && !/\.schema\.md$/i.test(clean)) return 'Schema path must end with .schema.md.';
    if (kind === 'workspace' && !/\.workspace\.md$/i.test(clean)) return 'Workspace path must end with .workspace.md.';
    return '';
  }
  registerActionHandler(async function editAddAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'open-node-edit') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      if (!ws || !node) return toast('No editable node selected.', 'warn');
      if (!canEditNode(ws, node)) return toast('Only local/uploaded workspace nodes can be edited in this pass.', 'warn');
      app.modal = { type: 'edit-node', wsId: ws.id, nodeId: node.id, text: node.rawMarkdown || node.file?.text || '' };
      render();
      return;
    }

    if (action === 'save-node-edit') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || app.modal?.nodeId || '');
      if (!ws || !node) return toast('No editable node selected.', 'warn');
      saveNodeEdit(ws, node, app.modal?.text || '');
      app.modal = null;
      if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      toast('Saved local markdown edit.', 'ok');
      return;
    }

    if (action === 'open-add-artifact') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return toast('No workspace selected.', 'warn');
      app.modal = { type: 'add-artifact', wsId: ws.id, kind: 'trace', path: '.topics/new.trace.md', title: '', text: defaultArtifactTemplate('trace', '.topics/new.trace.md', '') };
      render();
      return;
    }

    if (action === 'save-new-artifact') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (!ws) return toast('No workspace selected.', 'warn');
      const kind = app.modal?.kind || 'trace';
      const path = canonicalWorkspacePath(app.modal?.path || '');
      const error = validateNewArtifactPath(path, kind);
      if (error) return toast(error, 'warn');
      const text = app.modal?.text || defaultArtifactTemplate(kind, path, app.modal?.title || '');
      if (workspaceHasPathInSource(ws, 'local', path)) return toast('That local path already exists. Edit or remove it first.', 'warn');
      upsertWorkspaceTextFile(ws, path, text, 'local');
      computeWorkspaceIndex(ws);
      const node = Array.from(ws.nodeById?.values?.() || []).find((candidate) => sameImportedPath(candidate.path, path));
      if (node) ws.selectedNodeId = node.id;
      app.modal = null;
      if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      toast('Added local markdown artifact.', 'ok');
      return;
    }

    return next(event);
  });


  // Avoid relying on global onInput/onChange symbols; this app chain has several
  // late event wrappers and not every build exposes those names.
  window.addEventListener('input', handleEditAddFieldEvent, true);
  window.addEventListener('change', handleEditAddFieldEvent, true);
  function nextSiblingTracePath(node, ws = null) {
    const path = canonicalWorkspacePath(node?.path || '.topics/new.trace.md');
    const dir = dirname(path) || '.topics';
    const dim = traceDimensionFromPath(path);

    if (dim) {
      const occupied = ws ? occupiedSiblingIndices(ws, dir, dim) : new Set();
      let next = 1;
      while (occupied.has(next)) next += 1;
      for (let guard = 0; guard < 9999; guard += 1, next += 1) {
        const childDim = formatSiblingDimension(dim, next);
        const candidate = replaceDimensionPrefix(path, dim, childDim);
        if (!ws || !workspaceAnyHasPath(ws, candidate)) return candidate;
      }
    }

    const parentSlug = slugifyTitle(node?.title || fileNameFromPath(path).replace(/\.trace\.md$/i, '') || 'new');
    return ws
      ? uniquePathInFolder(ws, dir, `${parentSlug}-continuation`, '.trace.md')
      : joinPath(dir, `${parentSlug}-continuation.trace.md`);
  }

  function canEditNode(ws, node) {
    if (!ws || !node) return false;
    // Edit is a local authoring fallback. Remote/committed GitHub material should not
    // expose raw edit unless an explicit future advanced-edit mode is enabled.
    if (node.isGenerated) return true;
    if (node.sourceKind === 'local' || node.sourceId === 'local') return true;
    if (node.file?.sourceKind === 'local' || node.file?.sourceId === 'local') return true;
    return false;
  }

  function markdownPreviewInline(text) {
    return escapeHtml(text || '')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function renderSimpleMarkdownPreview(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const html = [];
    let inCode = false;
    let listOpen = false;

    const closeList = () => {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^```/.test(line.trim())) {
        closeList();
        if (!inCode) {
          html.push('<pre><code>');
          inCode = true;
        } else {
          html.push('</code></pre>');
          inCode = false;
        }
        continue;
      }
      if (inCode) {
        html.push(escapeHtml(raw) + '\n');
        continue;
      }
      if (!line.trim()) {
        closeList();
        html.push('<br>');
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = Math.min(6, heading[1].length);
        html.push(`<h${level}>${markdownPreviewInline(heading[2])}</h${level}>`);
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        closeList();
        html.push('<hr>');
        continue;
      }

      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      if (bullet) {
        if (!listOpen) {
          html.push('<ul>');
          listOpen = true;
        }
        html.push(`<li>${markdownPreviewInline(bullet[1])}</li>`);
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        closeList();
        html.push(`<blockquote>${markdownPreviewInline(quote[1])}</blockquote>`);
        continue;
      }

      closeList();
      html.push(`<p>${markdownPreviewInline(line)}</p>`);
    }
    closeList();
    if (inCode) html.push('</code></pre>');
    return html.join('\n');
  }

  function addModalMode(modal) {
    if (modal?.continuationOf) return 'continue';
    if (modal?.referenceOf) return 'reference';
    return 'new';
  }

  function addModalCopy(modal) {
    const mode = addModalMode(modal);
    if (mode === 'continue') {
      return {
        kicker: 'Continue',
        title: 'Create continuation leaf',
        lead: 'Create a new local child leaf that continues the selected lineage.',
        button: 'Create continuation',
        icon: 'fa-code-branch',
        className: 'mode-continue'
      };
    }
    if (mode === 'reference') {
      return {
        kicker: 'Reference',
        title: 'Create reference leaf',
        lead: 'Create a new local leaf that points at the selected artifact without becoming its child.',
        button: 'Create reference',
        icon: 'fa-link',
        className: 'mode-reference'
      };
    }
    return {
      kicker: 'Add',
      title: 'New Tiinex artifact',
      lead: 'Create a local Tiinex artifact. This does not commit to Git.',
      button: 'Add artifact',
      icon: 'fa-plus',
      className: 'mode-new'
    };
  }

  function relationCardForAddModal(ws, modal) {
    const mode = addModalMode(modal);
    if (mode === 'new') return '';
    const nodeId = modal.continuationOf || modal.referenceOf;
    const node = ws?.nodeById?.get?.(nodeId);
    if (!node) return '';

    const relation = mode === 'continue'
      ? 'Parent continuity edge'
      : 'Referenced material';
    const relationHelp = mode === 'continue'
      ? 'This draft belongs after the selected artifact in the same lineage path.'
      : 'This draft stays independent but carries a pointer to the selected artifact.';

    return `<div class="add-relation-card ${mode === 'continue' ? 'continue' : 'reference'}">
      <div class="add-relation-icon"><i class="fa-solid ${mode === 'continue' ? 'fa-code-branch' : 'fa-link'}"></i></div>
      <div>
        <strong>${escapeHtml(relation)}</strong>
        <p>${escapeHtml(relationHelp)}</p>
        <small>${escapeHtml(node.title || node.path || 'Selected artifact')}</small>
      </div>
    </div>`;
  }

  function markdownEditorToolbar(targetField) {
    const buttons = [
      ['h1', 'fa-heading', 'Heading 1'],
      ['h2', 'fa-heading', 'Heading 2'],
      ['bold', 'fa-bold', 'Bold'],
      ['italic', 'fa-italic', 'Italic'],
      ['link', 'fa-link', 'Link'],
      ['list', 'fa-list-ul', 'Bullet list'],
      ['quote', 'fa-quote-left', 'Quote'],
      ['code', 'fa-code', 'Code block']
    ];
    return `<div class="markdown-studio-toolbar" role="toolbar" aria-label="Markdown tools">
      ${buttons.map(([cmd, icon, label]) => `<button type="button" class="tv-btn tiny subtle markdown-tool" data-action="markdown-tool" data-field="${escapeAttr(targetField)}" data-command="${escapeAttr(cmd)}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"><i class="fa-solid ${icon}"></i></button>`).join('')}
    </div>`;
  }


  function renderEditNodeModal(modal) {
    const ws = getWorkspace(modal.wsId);
    const node = ws?.nodeById?.get?.(modal.nodeId);
    if (!ws || !node) return '';
    const text = typeof modal.text === 'string' ? modal.text : (node.rawMarkdown || node.file?.text || '');
    return `
      <div class="modal-backdrop-custom focus-modal edit-node-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-node-title">
        <div class="modal-panel edit-node-panel markdown-studio-panel authoring-dialog-panel">
          <div class="modal-header-lite edit-node-head authoring-dialog-head">
            <div class="authoring-dialog-title">
              <p class="kicker">Local edit</p>
              <h2 class="modal-title-lite" id="edit-node-title">Edit local markdown</h2>
              <p class="text-secondary mb-0">${escapeHtml(node.title || node.path || '')}</p>
            </div>
            <button class="tv-btn small subtle authoring-dialog-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="edit-node-body authoring-dialog-body">
            <div class="add-relation-card local-edit">
              <div class="add-relation-icon"><i class="fa-solid fa-pen-to-square"></i></div>
              <div>
                <strong>Local workspace copy</strong>
                <p>This edit changes only the local workspace material. Export to preserve or share it.</p>
                <small>${escapeHtml(node.path || '')}</small>
              </div>
            </div>
            ${markdownStudio({ field: 'editNodeText', text, textareaId: 'edit-node-markdown', label: 'Markdown' })}
          </div>
          <div class="modal-footer-actions edit-node-actions authoring-dialog-actions">
            <button class="tv-btn primary" data-action="save-node-edit" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}"><i class="fa-solid fa-floppy-disk"></i>Save local edit</button>
            <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  function renderAddArtifactModal(modal) {
    const ws = getWorkspace(modal.wsId);
    if (!ws) return '';
    const kind = modal.kind || 'trace';
    const path = modal.path || (kind === 'schema' ? '.topics/.schemas/new.schema.md' : kind === 'workspace' ? '.topics/workspaces/new.workspace.md' : '.topics/new.trace.md');
    const title = modal.title || '';
    const text = typeof modal.text === 'string' ? modal.text : defaultArtifactTemplate(kind, path, title);
    const copy = addModalCopy(modal);

    return `
      <div class="modal-backdrop-custom focus-modal add-artifact-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-artifact-title">
        <div class="modal-panel add-artifact-panel markdown-studio-panel authoring-dialog-panel ${escapeAttr(copy.className)}">
          <div class="modal-header-lite add-artifact-head authoring-dialog-head">
            <div class="authoring-dialog-title">
              <p class="kicker">${escapeHtml(copy.kicker)}</p>
              <h2 class="modal-title-lite" id="add-artifact-title"><i class="fa-solid ${escapeAttr(copy.icon)}"></i>${escapeHtml(copy.title)}</h2>
              <p class="text-secondary mb-0">${escapeHtml(copy.lead)}</p>
            </div>
            <button class="tv-btn small subtle authoring-dialog-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="add-artifact-body authoring-dialog-body">
            ${relationCardForAddModal(ws, modal)}
            <div class="add-artifact-grid">
              <label class="field-label">Kind
                <select class="form-control tv-input" data-field="addArtifactKind">
                  <option value="trace" ${kind === 'trace' ? 'selected' : ''}>.trace.md</option>
                  <option value="schema" ${kind === 'schema' ? 'selected' : ''}>.schema.md</option>
                  <option value="workspace" ${kind === 'workspace' ? 'selected' : ''}>.workspace.md</option>
                </select>
              </label>
              <label class="field-label">Path
                <input class="form-control tv-input" data-field="addArtifactPath" placeholder=".topics/new.trace.md" value="${escapeAttr(path)}">
              </label>
              <label class="field-label">Title
                <input class="form-control tv-input" data-field="addArtifactTitle" placeholder="Artifact title" value="${escapeAttr(title)}">
              </label>
            </div>
            ${markdownStudio({ field: 'addArtifactText', text, textareaId: 'add-artifact-markdown', label: 'Markdown' })}
            <p class="form-text add-artifact-hint">The file is added to the current local workspace source. Use Export to preserve it outside this browser.</p>
          </div>
          <div class="modal-footer-actions add-artifact-actions authoring-dialog-actions">
            <button class="tv-btn primary" data-action="save-new-artifact" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid ${escapeAttr(copy.icon)}"></i>${escapeHtml(copy.button)}</button>
            <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  function markdownSnippet(command, selected) {
    const text = selected || '';
    switch (command) {
      case 'h1': return `# ${text || 'Heading'}\n`;
      case 'h2': return `## ${text || 'Heading'}\n`;
      case 'bold': return `**${text || 'bold text'}**`;
      case 'italic': return `*${text || 'italic text'}*`;
      case 'link': return `[${text || 'label'}](url)`;
      case 'list': return text ? text.split('\n').map((line) => `- ${line}`).join('\n') : '- item\n- item';
      case 'quote': return text ? text.split('\n').map((line) => `> ${line}`).join('\n') : '> quote';
      case 'code': return `\`\`\`\n${text || 'code'}\n\`\`\``;
      default: return text;
    }
  }
  registerActionHandler(async function markdownStudioAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'markdown-tool') {
      event.preventDefault();
      event.stopPropagation();
      applyMarkdownTool(event.currentTarget);
      return;
    }
    return next(event);
  });
  registerActionHandler(async function editorModeActionOpen(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'set-editor-mode') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal) return;
      app.modal.editorMode = event.currentTarget.dataset.mode === 'raw' ? 'raw' : 'markdown';
      render();
      return;
    }
    return next(event);
  });




  function currentEditorMode() {
    const mode = app.modal?.editorMode || 'rich';
    return mode === 'raw' ? 'raw' : 'rich';
  }

  function editorModeToggle() {
    const mode = currentEditorMode();
    return `<div class="markdown-editor-mode-toggle" role="group" aria-label="Editor mode">
      <button type="button" class="tv-btn tiny ${mode === 'rich' ? 'primary' : 'subtle'}" data-action="set-editor-mode" data-mode="rich" title="Rich markdown editor"><i class="fa-solid fa-wand-magic-sparkles"></i>Rich</button>
      <button type="button" class="tv-btn tiny ${mode === 'raw' ? 'primary' : 'subtle'}" data-action="set-editor-mode" data-mode="raw" title="Raw markdown textarea"><i class="fa-solid fa-code"></i>Raw</button>
    </div>`;
  }

  function markdownRichHtml(text) {
    return renderSimpleMarkdownPreview(text || '')
      .replace(/<a /g, '<a contenteditable="false" ');
  }

  function htmlInlineToMarkdown(root) {
    const walk = (node) => {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const tag = node.tagName.toLowerCase();
      const inner = Array.from(node.childNodes).map(walk).join('');

      if (tag === 'strong' || tag === 'b') return `**${inner}**`;
      if (tag === 'em' || tag === 'i') return `*${inner}*`;
      if (tag === 'code') return `\`${inner}\``;
      if (tag === 'a') {
        const href = node.getAttribute('href') || 'url';
        return `[${inner || href}](${href})`;
      }
      if (tag === 'br') return '\n';
      return inner;
    };
    return Array.from(root.childNodes).map(walk).join('');
  }

  function richBlockToMarkdown(el) {
    if (!el) return '';
    const tag = el.tagName?.toLowerCase?.() || '';

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return `${'#'.repeat(level)} ${htmlInlineToMarkdown(el).trim()}`;
    }

    if (tag === 'hr') return '---';

    if (tag === 'ul') {
      return Array.from(el.children || [])
        .filter((li) => li.tagName?.toLowerCase?.() === 'li')
        .map((li) => `- ${htmlInlineToMarkdown(li).trim()}`)
        .join('\n');
    }

    if (tag === 'ol') {
      return Array.from(el.children || [])
        .filter((li) => li.tagName?.toLowerCase?.() === 'li')
        .map((li, index) => `${index + 1}. ${htmlInlineToMarkdown(li).trim()}`)
        .join('\n');
    }

    if (tag === 'blockquote') {
      return htmlInlineToMarkdown(el)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    }

    if (tag === 'pre') {
      return `\`\`\`\n${el.textContent || ''}\n\`\`\``;
    }

    const text = htmlInlineToMarkdown(el).trim();
    return text;
  }

  function richHtmlToMarkdown(element) {
    if (!element) return '';
    const blocks = Array.from(element.children || []);
    if (!blocks.length) return (element.textContent || '').trim();
    return blocks
      .map(richBlockToMarkdown)
      .filter((part, index, arr) => part || (index > 0 && index < arr.length - 1))
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
  }

  function markdownStudio({ field, text, textareaId, label }) {
    const mode = currentEditorMode();
    const raw = mode === 'raw';
    return `<div class="markdown-studio ${raw ? 'raw-mode' : 'rich-mode'}">
      <div class="markdown-studio-topline">
        <label class="field-label" for="${escapeAttr(textareaId)}">${escapeHtml(label || 'Markdown')}</label>
        <div class="markdown-studio-controls">
          ${editorModeToggle()}
          ${markdownEditorToolbar(field)}
        </div>
      </div>
      <div class="markdown-studio-surface ${raw ? 'raw-only' : 'rich-only'}">
        ${raw ? `<div class="markdown-editor-pane">
          <textarea id="${escapeAttr(textareaId)}" class="form-control tv-textarea markdown-studio-textarea" data-field="${escapeAttr(field)}" spellcheck="false">${escapeHtml(text || '')}</textarea>
        </div>` : `<div class="markdown-rich-pane" aria-label="Rich markdown editor">
          <div class="markdown-rich-title"><i class="fa-solid fa-wand-magic-sparkles"></i>Rich markdown editor</div>
          <div class="markdown-rich-editor" contenteditable="true" data-rich-field="${escapeAttr(field)}" spellcheck="true">${markdownRichHtml(text || '')}</div>
        </div>`}
      </div>
    </div>`;
  }




  function handleEditAddFieldEvent(event) {
    const richField = event.target?.dataset?.richField || '';
    if (richField) {
      handleRichMarkdownInput(event);
      return;
    }

    const field = event.target?.dataset?.field || '';
    if (!field) return;
    if (
      field === 'editNodeText' ||
      field === 'addArtifactKind' ||
      field === 'addArtifactPath' ||
      field === 'addArtifactTitle' ||
      field === 'addArtifactText'
    ) {
      updateModalField(field, event.target.value);
    }
  }
  registerActionHandler(async function editorModeActionSave(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'set-editor-mode') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal) return;
      app.modal.editorMode = event.currentTarget.dataset.mode === 'raw' ? 'raw' : 'rich';
      render();
      return;
    }
    return next(event);
  });




  // Continue/Reference do not need editor-mode wrappers. currentEditorMode defaults to
  // Rich, and Raw can be selected inside the dialog. Keeping these functions
  // unwrapped avoids function-hoisting self-recursion.
  function ensureAddModalRichDefault() {
    if (app.modal?.type === 'add-artifact' && !app.modal.editorMode) {
      app.modal.editorMode = 'rich';
    }
  }
  registerRenderWrapper(function renderWithRichDefault(next) {
    ensureAddModalRichDefault();
    return next();
  });




  function richEditorForField(field) {
    if (!field || typeof CSS === 'undefined' || !CSS.escape) {
      return document.querySelector(`[data-rich-field="${String(field || '').replace(/"/g, '\\"')}"]`);
    }
    return document.querySelector(`[data-rich-field="${CSS.escape(field)}"]`);
  }

  function selectionInside(root) {
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount || !root) return false;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    return root.contains(anchor) || root === anchor || root.contains(focus) || root === focus;
  }

  function placeCaretAtEnd(root) {
    if (!root) return;
    root.focus();
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const selection = window.getSelection?.();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function ensureRichSelection(root) {
    if (!root) return;
    if (!selectionInside(root)) {
      placeCaretAtEnd(root);
    } else {
      root.focus();
    }
  }

  function applyFormatBlock(tag) {
    // Browser support differs; try modern tag first, then bracketed fallback form.
    try { document.execCommand('formatBlock', false, tag); } catch (_) {}
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount) return;
    const node = selection.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode?.parentElement;
    const current = node?.closest?.('h1,h2,h3,h4,h5,h6,blockquote,pre,p,div,li');
    if (!current || current.tagName?.toLowerCase() === tag.toLowerCase()) return;
    try { document.execCommand('formatBlock', false, `<${tag}>`); } catch (_) {}
  }

  function applyRichCommand(command) {
    switch (command) {
      case 'h1':
        applyFormatBlock('h1');
        return;
      case 'h2':
        applyFormatBlock('h2');
        return;
      case 'bold':
        document.execCommand('bold', false);
        return;
      case 'italic':
        document.execCommand('italic', false);
        return;
      case 'link': {
        const url = window.prompt('Link URL');
        if (url) document.execCommand('createLink', false, url);
        return;
      }
      case 'list':
        document.execCommand('insertUnorderedList', false);
        return;
      case 'quote':
        applyFormatBlock('blockquote');
        return;
      case 'code':
        applyFormatBlock('pre');
        return;
      default:
        return;
    }
  }

  function applyMarkdownTool(button) {
    const field = button?.dataset?.field || '';
    const command = button?.dataset?.command || '';
    if (!field || !command) return;

    const rich = richEditorForField(field);
    if (currentEditorMode() === 'rich' && rich) {
      ensureRichSelection(rich);
      applyRichCommand(command);
      updateModalField(field, richHtmlToMarkdown(rich));
      // Do not render here. Rendering replaces the editable surface, loses cursor,
      // and makes Rich feel like a preview that must be refreshed via Raw.
      return;
    }

    const textarea = document.querySelector(`textarea[data-field="${CSS.escape(field)}"]`);
    if (!textarea) return;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    const current = textarea.value || '';
    const selected = current.slice(start, end);
    const snippet = markdownSnippet(command, selected);
    textarea.value = current.slice(0, start) + snippet + current.slice(end);
    textarea.focus();
    const cursor = start + snippet.length;
    textarea.setSelectionRange(cursor, cursor);
    updateModalField(field, textarea.value);
    return;
  }

  function handleMarkdownToolMouseDown(event) {
    const button = event.target?.closest?.('[data-action="markdown-tool"]');
    if (!button) return;
    // Keep the contenteditable selection alive while toolbar buttons are clicked.
    event.preventDefault();
  }

  window.addEventListener('mousedown', handleMarkdownToolMouseDown, true);

  function handleRichMarkdownInput(event) {
    const field = event.target?.dataset?.richField || '';
    if (!field) return;
    updateModalField(field, richHtmlToMarkdown(event.target));
  }




  function rootTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }

  function pathDirParts(path) {
    const clean = canonicalWorkspacePath(path || '');
    const parts = clean.split('/').filter(Boolean);
    parts.pop();
    return parts;
  }

  function relativePathFromTo(fromPath, toPath) {
    const fromDir = pathDirParts(fromPath);
    const to = canonicalWorkspacePath(toPath || '').split('/').filter(Boolean);
    const toFile = to.pop() || '';
    let i = 0;
    while (i < fromDir.length && i < to.length && fromDir[i] === to[i]) i += 1;
    const ups = fromDir.slice(i).map(() => '..');
    const downs = to.slice(i);
    return [...ups, ...downs, toFile].filter(Boolean).join('/') || toFile || toPath || '';
  }

  function displayFileName(path) {
    return fileNameFromPath(path || '') || path || 'artifact';
  }

  function linkForPath(label, href) {
    const safeLabel = label || displayFileName(href);
    return `[${safeLabel}](${href || safeLabel})`;
  }

  function parentContinuityBlock(node, childPath) {
    if (!node) return '';
    const trace = parentTraceReferenceForPath(node, childPath);
    const schema = parentSchemaReferenceForPath(node, childPath);
    const created = node.createdAt || node.created || '';
    const rel = relativePathFromTo(childPath, node.path || '');
    const originLines = [];
    if (rel) originLines.push(`    - [relative](${rel})`);
    if (node.browseUrl) originLines.push(`    - [browse + git](${node.browseUrl})`);
    else if (node.rawUrl) originLines.push(`    - [raw](${node.rawUrl})`);
    return `- Parent
  - Parent Schema: ${schema}
${created ? `  - Created At: ${created}\n` : ''}  - Trace: ${trace}
${originLines.length ? `  - Origin:\n${originLines.join('\n')}\n` : ''}`;
  }

  function integrityFooter(towards = 'self', value = 'pending') {
    return `# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: ${towards}
  - Value: ${value}
`;
  }




  function selectedNodeRouteDescriptor(ws) {
    const node = selectedNode(ws);
    if (!node) return { selectedNodeId: '', selectedPath: '', selectedTitle: '', mode: 'discovery' };
    return {
      selectedNodeId: node.id || '',
      selectedPath: node.path || '',
      selectedTitle: node.title || '',
      mode: 'lineage'
    };
  }

  function resolveRouteSelectedNode(ws, source) {
    if (!ws || !source) return null;
    const selectedId = source.selectedNodeId || '';
    const selectedPath = source.selectedPath || '';
    const selectedTitle = source.selectedTitle || '';

    return (selectedId && ws.nodeById?.get?.(selectedId))
      || (selectedPath && ws.nodes?.find?.((node) => node.path === selectedPath))
      || (selectedPath && Array.from(ws.nodeById?.values?.() || []).find((node) => node.path === selectedPath))
      || (selectedPath && Array.from(ws.nodeById?.values?.() || []).find((node) => fileNameFromPath(node.path) === fileNameFromPath(selectedPath)))
      || (selectedTitle && Array.from(ws.nodeById?.values?.() || []).find((node) => node.title === selectedTitle))
      || null;
  }

  function applySelectedRouteState(ws, source) {
    if (!ws || !source) return;
    const wantsLineage = source.mode === 'lineage' || Boolean(source.selectedNodeId || source.selectedPath || source.selectedTitle);
    const selected = resolveRouteSelectedNode(ws, source);
    if (selected) {
      ws.selectedNodeId = selected.id;
      return;
    }
    if (wantsLineage) {
      // Preserve the unresolved selection so it can be retried after async source
      // loading or parent lazy-load. Do not silently fall back to discovery.
      ws.pendingSelectedRoute = {
        selectedNodeId: source.selectedNodeId || '',
        selectedPath: source.selectedPath || '',
        selectedTitle: source.selectedTitle || '',
        mode: 'lineage'
      };
      return;
    }
    ws.selectedNodeId = null;
    ws.pendingSelectedRoute = null;
  }

  function resolvePendingSelectedRoutes() {
    for (const ws of app.workspaces || []) {
      if (!ws?.pendingSelectedRoute) continue;
      const selected = resolveRouteSelectedNode(ws, ws.pendingSelectedRoute);
      if (selected) {
        ws.selectedNodeId = selected.id;
        ws.pendingSelectedRoute = null;
      }
    }
  }

  function viewRouteState() {
    const activeIndex = Math.max(0, app.workspaces.findIndex((ws) => ws.id === app.activeWorkspaceId));
    return {
      v: 156,
      kind: 'view',
      activeIndex,
      workspaceOffset: Number(app.workspaceOffset || 0),
      workspaces: app.workspaces.map((ws) => {
        const selected = selectedNodeRouteDescriptor(ws);
        return {
          label: workspaceDisplayLabel(ws),
          selectedNodeId: selected.selectedNodeId,
          selectedPath: selected.selectedPath,
          selectedTitle: selected.selectedTitle,
          mode: selected.mode,
          discoveryView: ws.discoveryView || 'feed',
          discoveryFilterSchema: ws.discoveryFilterSchema || ws.filterSchema || 'all',
          discoverySearch: ws.discoverySearch || '',
          lineageSearch: ws.lineageSearch || ''
        };
      })
    };
  }

  function applyViewRouteState(state) {
    if (!state || state.kind !== 'view') return false;
    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    app.pendingViewRouteState = state;

    workspaces.forEach((source, index) => {
      const ws = app.workspaces[index];
      if (!ws) return;
      ws.discoveryView = source.discoveryView || ws.discoveryView || 'feed';
      ws.discoveryFilterSchema = source.discoveryFilterSchema || source.filterSchema || ws.discoveryFilterSchema || 'all';
      ws.filterSchema = ws.discoveryFilterSchema;
      ws.discoverySearch = source.discoverySearch || '';
      ws.lineageSearch = source.lineageSearch || '';
      applySelectedRouteState(ws, source);
    });

    const count = visibleWorkspaceCount();
    const activeIndex = Math.max(0, Math.min(Number(state.activeIndex || 0), app.workspaces.length - 1));
    const maxOffset = Math.max(0, app.workspaces.length - count);
    app.activeWorkspaceId = app.workspaces[activeIndex]?.id || app.workspaces[0]?.id || null;
    app.workspaceOffset = Math.max(0, Math.min(Number(state.workspaceOffset || activeIndex || 0), maxOffset));
    if (app.activeWorkspaceId) focusWorkspaceWindow(app.activeWorkspaceId);
    return true;
  }

  function routeState() {
    return {
      v: 156,
      activeIndex: Math.max(0, workspaceIndex(app.activeWorkspaceId)),
      workspaceOffset: app.workspaceOffset || 0,
      sources: app.workspaces.map((ws) => {
        const selected = selectedNodeRouteDescriptor(ws);
        return {
          label: ws.label,
          urls: workspaceSourceUrls(ws),
          selectedNodeId: selected.selectedNodeId,
          selectedPath: selected.selectedPath,
          selectedTitle: selected.selectedTitle,
          mode: selected.mode,
          layoutMode: ws.layoutMode || 'expanded',
          discoveryFilterSchema: ws.discoveryFilterSchema || ws.filterSchema || 'all',
          discoverySearch: ws.discoverySearch || '',
          lineageSearch: ws.lineageSearch || '',
          expandedPaths: ws.nodes.filter((node) => node.expanded).map((node) => node.path)
        };
      }).filter((source) => source.urls.length)
    };
  }

  function applyViewStateToWorkspace(ws, source) {
    if (!ws || !source) return;
    ws.layoutMode = source.layoutMode || 'expanded';
    ws.discoveryView = source.discoveryView || ws.discoveryView || 'feed';
    ws.discoveryFilterSchema = source.discoveryFilterSchema || source.filterSchema || 'all';
    ws.filterSchema = ws.discoveryFilterSchema;
    ws.discoverySearch = source.discoverySearch || '';
    ws.lineageSearch = source.lineageSearch || '';
    const expanded = new Set(source.expandedPaths || []);
    ws.nodes.forEach((node) => {
      node.expanded = expanded.has(node.path);
    });
    applySelectedRouteState(ws, source);
  }

  registerRenderWrapper(function renderWithRouteSelection(next) {
    resolvePendingSelectedRoutes();
    return next();
  });

  function copyShareLink() {
    setRouteState('replace');
    const hasLocalOnly = app.workspaces.some((ws) => !Array.from(ws.files?.values?.() || []).some((f) => f.rawUrl && !f.isGenerated));
    const isEmpty = !app.workspaces.length;
    navigator.clipboard?.writeText(location.href).then(
      () => toast(
        isEmpty
          ? 'Copied empty viewer link.'
          : (hasLocalOnly ? 'Copied link. Local/uploaded workspaces are not fully shareable until exported or published.' : 'Copied current viewer link including selected lineage.'),
        isEmpty ? 'ok' : (hasLocalOnly ? 'warn' : 'ok')
      ),
      () => toast('Could not copy automatically. Copy the address bar URL.', 'warn')
    );
  }




  function addArtifactLauncherButton(wsId) {
    return `<button class="tv-btn subtle add-artifact-launcher" data-action="open-artifact-wizard" data-ws="${escapeAttr(wsId || '')}" title="Create a new Tiinex artifact"><i class="fa-solid fa-file-circle-plus"></i>New Tiinex artifact</button>`;
  }
  registerRenderModalWrapper(function renderModalWithAddLauncher(modal, next) {
    const html = next(modal);
    if (!modal || modal.type !== 'source') return html;
    const wsId = modal.wsId || app.activeWorkspaceId || '';
    const launcher = addArtifactLauncherButton(wsId);

    if (html.includes('data-action="open-add-artifact"')) return html;

    if (html.includes('data-action="close-modal"')) {
      return html.replace(/(<button[^>]+data-action="close-modal"[\s\S]*?<\/button>)/, `${launcher}$1`);
    }
    return html.replace('</div></div>', `${launcher}</div></div>`);
  });




  const WIZARD_SCHEMA_ORDER = Object.freeze([
    'tiinex.topic.v1',
    'tiinex.evidence.v1',
    'tiinex.feedback.v1',
    'tiinex.reduction.v1',
    'tiinex.task.v1',
    'tiinex.decision.v1',
    'tiinex.pointer.v1',
    'tiinex.lineage.upgrade.deferral.v1',
    'tiinex.workspace.v1',
    'raw'
  ]);

  const WIZARD_SCHEMA_REGISTRY = Object.freeze({
    'tiinex.topic.v1': {
      id: 'tiinex.topic.v1',
      label: 'Topic',
      icon: 'fa-diagram-project',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'A bounded topic thread with current read, design direction, and next artifacts.',
      bodyLabel: 'Topic body',
      body: 'This topic captures the current direction for the work.\n\n## Current Read\n\nDescribe the present topic state.\n\n## Design Direction\n\nState where this topic should move next.\n\n## Next Artifacts\n\n- ',
      fields: [
        { key: 'currentRead', label: 'Current read', type: 'textarea', placeholder: 'What is true or useful to know right now?', required: true },
        { key: 'designDirection', label: 'Design direction', type: 'textarea', placeholder: 'Where should this thread move next?' },
        { key: 'nextArtifacts', label: 'Next artifacts', type: 'list', placeholder: 'One continuation or artifact idea per line' }
      ],
      defaults: () => ({ currentRead: '', designDirection: '', nextArtifacts: '' }),
      bodyFromForm: (f) => `${paragraph(f.currentRead, 'Describe the present topic state.')}

## Design Direction

${paragraph(f.designDirection, 'State where this topic should move next.')}

## Next Artifacts

${listBlock(f.nextArtifacts)}`,
      formStateFromSections: (sections) => ({
        currentRead: plainBlock(sections._intro || sections['current read'] || ''),
        designDirection: plainBlock(sections['design direction'] || ''),
        nextArtifacts: plainBlock(sections['next artifacts'] || '')
      })
    },
    'tiinex.evidence.v1': {
      id: 'tiinex.evidence.v1',
      label: 'Evidence',
      icon: 'fa-paperclip',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Preserved supporting material with claim, provenance, evidence, and limits.',
      describeStep: renderEvidenceWizardDescribeStep,
      bodyLabel: 'Evidence body',
      body: '## Supported Claim\n\n- State what this evidence bears on.\n\n## Provenance\n\n- Source: \n- Representation: \n\n## Evidence Material\n\nPreserve the readable supporting material here.\n\n## Interpretation Limits\n\n- State fidelity, scope, excerpting, transformation, or uncertainty limits.',
      fields: [
        { key: 'supportedClaim', label: 'Supported claim', type: 'textarea', placeholder: 'What does this evidence bear on?', required: true },
        { key: 'source', label: 'Source', type: 'input', placeholder: 'URL, path, file, screenshot, or local source' },
        { key: 'representation', label: 'Representation', type: 'input', placeholder: 'quote, screenshot, generated image, observation, etc.' },
        { key: 'evidenceMaterial', label: 'Evidence material', type: 'textarea', placeholder: 'Paste or summarize the material to preserve.' },
        { key: 'interpretationLimits', label: 'Interpretation limits', type: 'list', placeholder: 'One limit per line' }
      ],
      defaults: (modal, option) => ({
        supportedClaim: defaultWizardSummary(modal || {}, option || schemaOptionById('tiinex.evidence.v1')),
        source: '',
        representation: '',
        evidenceMaterial: '',
        interpretationLimits: ''
      }),
      bodyFromForm: (f, context = {}) => {
        const artifactPath = context.path || app.modal?.path || '.topics/evidence.trace.md';
        const attachments = evidenceAttachments(context.modal || app.modal);
        const blocks = evidenceAttachmentsMarkdown(artifactPath, attachments);
        return `## Supported Claim

${listBlock(f.supportedClaim)}

## Provenance

${blocks.provenance}

## Evidence Material

${blocks.material}

## Interpretation Limits

${blocks.limits}`;
      },
      formStateFromSections: (sections) => ({
        supportedClaim: plainBlock(sections['supported claim'] || ''),
        evidenceMaterial: plainBlock(sections['evidence material'] || ''),
        interpretationLimits: plainBlock(sections['interpretation limits'] || '')
      })
    },
    'tiinex.feedback.v1': {
      id: 'tiinex.feedback.v1',
      label: 'Feedback',
      icon: 'fa-comment-dots',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Directed feedback with target, received feedback, disposition, and limits.',
      bodyLabel: 'Feedback body',
      body: '## Feedback Target\n\n- Target: \n\n## Feedback Received\n\n- Preserve or summarize the feedback.\n\n## Disposition\n\n- State: pending\n- Follow-Up: \n\n## Limits\n\n- State fidelity, scope, or interpretation limits.',
      fields: [
        { key: 'feedbackTarget', label: 'Feedback target', type: 'input', placeholder: 'What artifact, claim, UI, or action is this feedback about?', required: true },
        { key: 'feedbackReceived', label: 'Feedback received', type: 'textarea', placeholder: 'What was said or observed?' },
        { key: 'dispositionState', label: 'Disposition', type: 'select', options: ['pending', 'accepted', 'rejected', 'deferred', 'narrowed'] },
        { key: 'followUp', label: 'Follow-up', type: 'textarea', placeholder: 'Smallest next correction or continuation.' },
        { key: 'limits', label: 'Limits', type: 'list', placeholder: 'One uncertainty or scope limit per line' }
      ],
      defaults: () => ({ feedbackTarget: '', feedbackReceived: '', dispositionState: 'pending', followUp: '', limits: '' }),
      bodyFromForm: (f) => `## Feedback Target

- Target: ${paragraph(f.feedbackTarget)}

## Feedback Received

${paragraph(f.feedbackReceived, 'Preserve or summarize the feedback.')}

## Disposition

- State: ${paragraph(f.dispositionState, 'pending')}
- Follow-Up: ${paragraph(f.followUp)}

## Limits

${listBlock(f.limits, 'State fidelity, scope, or interpretation limits.')}`,
      formStateFromSections: (sections) => ({
        feedbackTarget: singleFieldFromBullet(sections['feedback target'] || '', 'Target'),
        feedbackReceived: plainBlock(sections['feedback received'] || ''),
        dispositionState: singleFieldFromBullet(sections.disposition || '', 'State') || 'pending',
        followUp: singleFieldFromBullet(sections.disposition || '', 'Follow-Up'),
        limits: plainBlock(sections.limits || '')
      })
    },
    'tiinex.reduction.v1': {
      id: 'tiinex.reduction.v1',
      label: 'Reduction',
      icon: 'fa-compress',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Observable reduction with source, carry-forward state, loss, and validation.',
      bodyLabel: 'Reduction body',
      body: '## Source Context\n\n- Source: \n\n## Carry-Forward State\n\n- State what later work may rely on.\n\n## Loss And Uncertainty\n\n- State what was omitted, compressed, degraded, or remains uncertain.\n\n## Validation\n\n- State human review, runtime validation, source checks, or explicit limits.',
      fields: [
        { key: 'sourceContext', label: 'Source context', type: 'textarea', placeholder: 'What was reduced, summarized, or carried forward?' },
        { key: 'carryForwardState', label: 'Carry-forward state', type: 'textarea', placeholder: 'What later work may rely on?', required: true },
        { key: 'lossAndUncertainty', label: 'Loss and uncertainty', type: 'list', placeholder: 'What was omitted, compressed, degraded, or remains uncertain?' },
        { key: 'validation', label: 'Validation', type: 'list', placeholder: 'How can a later reader check this reduction?' }
      ],
      defaults: () => ({ sourceContext: '', carryForwardState: '', lossAndUncertainty: '', validation: '' }),
      bodyFromForm: (f) => `## Source Context

${paragraph(f.sourceContext, '- Source: ')}

## Carry-Forward State

${paragraph(f.carryForwardState, '- State what later work may rely on.')}

## Loss And Uncertainty

${listBlock(f.lossAndUncertainty, 'State what was omitted, compressed, degraded, or remains uncertain.')}

## Validation

${listBlock(f.validation, 'State human review, runtime validation, source checks, or explicit limits.')}`,
      formStateFromSections: (sections) => ({
        sourceContext: plainBlock(sections['source context'] || ''),
        carryForwardState: plainBlock(sections['carry-forward state'] || ''),
        lossAndUncertainty: plainBlock(sections['loss and uncertainty'] || ''),
        validation: plainBlock(sections.validation || '')
      })
    },
    'tiinex.task.v1': {
      id: 'tiinex.task.v1',
      label: 'Task',
      icon: 'fa-list-check',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Bounded work with objective, done criteria, scope, and dependencies.',
      bodyLabel: 'Task body',
      body: '## Objective\n\nDescribe the concrete work being asked for.\n\n## Done Criteria\n\n- \n\n## Scope\n\n- In scope: \n- Out of scope: \n\n## Dependencies\n\n- ',
      fields: [
        { key: 'objective', label: 'Objective', type: 'textarea', placeholder: 'What concrete work is being asked for?', required: true },
        { key: 'doneCriteria', label: 'Done criteria', type: 'list', placeholder: 'One completion signal per line' },
        { key: 'inScope', label: 'In scope', type: 'list', placeholder: 'What is allowed or expected?' },
        { key: 'outOfScope', label: 'Out of scope', type: 'list', placeholder: 'What should not be changed?' },
        { key: 'dependencies', label: 'Dependencies', type: 'list', placeholder: 'Required inputs, constraints, or blockers' }
      ],
      defaults: () => ({ objective: '', doneCriteria: '', inScope: '', outOfScope: '', dependencies: '' }),
      bodyFromForm: (f) => `## Objective

${paragraph(f.objective, 'Describe the concrete work being asked for.')}

## Done Criteria

${listBlock(f.doneCriteria)}

## Scope

- In scope:
${listBlock(f.inScope).split('\n').map((line) => `  ${line}`).join('\n')}
- Out of scope:
${listBlock(f.outOfScope).split('\n').map((line) => `  ${line}`).join('\n')}

## Dependencies

${listBlock(f.dependencies)}`,
      formStateFromSections: (sections) => ({
        objective: plainBlock(sections.objective || ''),
        doneCriteria: plainBlock(sections['done criteria'] || ''),
        inScope: plainBlock((sections.scope || '').match(/In scope:\s*([\s\S]*?)(?:\n\s*-\s*Out of scope:|$)/i)?.[1] || ''),
        outOfScope: plainBlock((sections.scope || '').match(/Out of scope:\s*([\s\S]*)$/i)?.[1] || ''),
        dependencies: plainBlock(sections.dependencies || '')
      })
    },
    'tiinex.decision.v1': {
      id: 'tiinex.decision.v1',
      label: 'Decision',
      icon: 'fa-scale-balanced',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Landed decision with operative outcome, basis, and consequences.',
      bodyLabel: 'Decision body',
      body: 'This decision records what now governs.\n\n## Decision\n\n- State: accepted\n- Subject: \n- Decision: \n\n## Basis\n\n- \n\n## Consequences\n\n- ',
      fields: [
        { key: 'state', label: 'State', type: 'select', options: ['accepted', 'pending', 'rejected', 'deferred'] },
        { key: 'subject', label: 'Subject', type: 'input', placeholder: 'What does this decision govern?', required: true },
        { key: 'decision', label: 'Decision', type: 'textarea', placeholder: 'What is the selected path?' },
        { key: 'basis', label: 'Basis', type: 'list', placeholder: 'Why this decision is justified' },
        { key: 'consequences', label: 'Consequences', type: 'list', placeholder: 'What follows from this decision?' }
      ],
      defaults: () => ({ state: 'accepted', subject: '', decision: '', basis: '', consequences: '' }),
      bodyFromForm: (f) => `This decision records what now governs.

## Decision

- State: ${paragraph(f.state, 'accepted')}
- Subject: ${paragraph(f.subject)}
- Decision: ${paragraph(f.decision)}

## Basis

${listBlock(f.basis)}

## Consequences

${listBlock(f.consequences)}`,
      formStateFromSections: (sections) => ({
        state: singleFieldFromBullet(sections.decision || '', 'State') || 'accepted',
        subject: singleFieldFromBullet(sections.decision || '', 'Subject'),
        decision: singleFieldFromBullet(sections.decision || '', 'Decision'),
        basis: plainBlock(sections.basis || ''),
        consequences: plainBlock(sections.consequences || '')
      })
    },
    'tiinex.pointer.v1': {
      id: 'tiinex.pointer.v1',
      label: 'Pointer',
      icon: 'fa-link',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Thin redirect or destination-list artifact with a clear next hop.',
      bodyLabel: 'Pointer body',
      body: 'This pointer keeps one thin hop toward the current target.\n\n## Current Read\n\nExplain what this pointer currently points toward.\n\n## Destinations\n\n- Target: \n\n## Next Artifacts\n\n- ',
      fields: [
        { key: 'currentRead', label: 'Current read', type: 'textarea', placeholder: 'What does this pointer currently tell the reader?' },
        { key: 'destinations', label: 'Destinations', type: 'list', placeholder: 'One target URL/path/artifact per line', required: true },
        { key: 'nextArtifacts', label: 'Next artifacts', type: 'list', placeholder: 'Suggested next hops or follow-ups' }
      ],
      defaults: () => ({ currentRead: '', destinations: '', nextArtifacts: '' }),
      bodyFromForm: (f) => `This pointer keeps one thin hop toward the current target.

## Current Read

${paragraph(f.currentRead, 'Explain what this pointer currently points toward.')}

## Destinations

${listBlock(f.destinations)}

## Next Artifacts

${listBlock(f.nextArtifacts)}`,
      formStateFromSections: (sections) => ({
        currentRead: plainBlock(sections['current read'] || sections._intro || ''),
        destinations: plainBlock(sections.destinations || ''),
        nextArtifacts: plainBlock(sections['next artifacts'] || '')
      })
    },
    'tiinex.lineage.upgrade.deferral.v1': {
      id: 'tiinex.lineage.upgrade.deferral.v1',
      label: 'Lineage Upgrade Deferral',
      icon: 'fa-clock-rotate-left',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary: 'Decision to acknowledge but defer a lineage repair or latest upgrade.',
      bodyLabel: 'Deferral body',
      body: '## Decision\n\n- State: accepted\n- Decision: do not adopt the known upstream repair or latest replacement for this local range yet\n\n## Deferral\n\n- Deferral Type: lineage-upgrade\n- Known Issue: \n- Deferred Upgrade: \n- Affected Local Range: \n- Adoption Decision: deferred\n- Material Impact: unknown\n- Warning Policy: keep-warning\n- Review Condition: \n\n## Basis\n\n- \n\n## Consequences\n\n- ',
      fields: [
        { key: 'knownIssue', label: 'Known issue', type: 'textarea', placeholder: 'What lineage repair or upgrade is known?', required: true },
        { key: 'deferredUpgrade', label: 'Deferred upgrade', type: 'textarea', placeholder: 'What would be adopted later?' },
        { key: 'affectedRange', label: 'Affected local range', type: 'input', placeholder: 'Path, branch, node range, or lineage segment' },
        { key: 'reviewCondition', label: 'Review condition', type: 'textarea', placeholder: 'When or why should this be revisited?' },
        { key: 'basis', label: 'Basis', type: 'list', placeholder: 'Why deferral is acceptable for now' },
        { key: 'consequences', label: 'Consequences', type: 'list', placeholder: 'What warning or limitation remains?' }
      ],
      defaults: () => ({ knownIssue: '', deferredUpgrade: '', affectedRange: '', reviewCondition: '', basis: '', consequences: '' }),
      bodyFromForm: (f) => `## Decision

- State: accepted
- Decision: do not adopt the known upstream repair or latest replacement for this local range yet

## Deferral

- Deferral Type: lineage-upgrade
- Known Issue: ${paragraph(f.knownIssue)}
- Deferred Upgrade: ${paragraph(f.deferredUpgrade)}
- Affected Local Range: ${paragraph(f.affectedRange)}
- Adoption Decision: deferred
- Material Impact: unknown
- Warning Policy: keep-warning
- Review Condition: ${paragraph(f.reviewCondition)}

## Basis

${listBlock(f.basis)}

## Consequences

${listBlock(f.consequences)}`,
      formStateFromSections: (sections) => ({
        knownIssue: singleFieldFromBullet(sections.deferral || '', 'Known Issue'),
        deferredUpgrade: singleFieldFromBullet(sections.deferral || '', 'Deferred Upgrade'),
        affectedRange: singleFieldFromBullet(sections.deferral || '', 'Affected Local Range'),
        reviewCondition: singleFieldFromBullet(sections.deferral || '', 'Review Condition'),
        basis: plainBlock(sections.basis || ''),
        consequences: plainBlock(sections.consequences || '')
      })
    },
    'tiinex.workspace.v1': {
      id: 'tiinex.workspace.v1',
      label: 'Workspace',
      icon: 'fa-folder-tree',
      suffix: '.workspace.md',
      kind: 'workspace',
      humanArtifact: false,
      summary: 'Markdown-first local/review workspace description.',
      bodyLabel: 'Workspace body',
      body: '## Workspace Scope\n\nWhat this workspace contains.\n\n## Sources\n\n- \n\n## Notes\n\nWhat the next reader should know.',
      fields: [
        { key: 'workspaceScope', label: 'Workspace scope', type: 'textarea', placeholder: 'What does this workspace contain?', required: true },
        { key: 'sources', label: 'Sources', type: 'list', placeholder: 'One source per line' },
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What should the next reader know?' }
      ],
      defaults: () => ({ workspaceScope: '', sources: '', notes: '' }),
      bodyFromForm: (f) => `## Workspace Scope

${paragraph(f.workspaceScope, 'What this workspace contains.')}

## Sources

${listBlock(f.sources)}

## Notes

${paragraph(f.notes, 'What the next reader should know.')}`,
      formStateFromSections: (sections) => ({
        workspaceScope: plainBlock(sections['workspace scope'] || ''),
        sources: plainBlock(sections.sources || ''),
        notes: plainBlock(sections.notes || '')
      })
    },
    raw: {
      id: 'raw',
      label: 'Raw Tiinex Artifact',
      icon: 'fa-code',
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: false,
      generatesSchemaId: 'tiinex.topic.v1',
      summary: 'Fallback authoring surface for unusual or not-yet-modeled human artifacts.',
      bodyLabel: 'Raw body',
      body: 'Draft body.',
      fields: null,
      defaults: () => ({}),
      bodyFromForm: () => '',
      formStateFromSections: () => ({})
    }
  });

  const WIZARD_HUMAN_SCHEMA_IDS = new Set(WIZARD_SCHEMA_ORDER.filter((id) => WIZARD_SCHEMA_REGISTRY[id]?.humanArtifact));

  function wizardSchemaDefinition(id) {
    return WIZARD_SCHEMA_REGISTRY[String(id || '').trim()] || WIZARD_SCHEMA_REGISTRY.raw;
  }

  function humanSchemaOptions() {
    return WIZARD_SCHEMA_ORDER.map((id) => {
      const def = wizardSchemaDefinition(id);
      return {
        id: def.id,
        label: def.label,
        icon: def.icon,
        suffix: def.suffix,
        summary: def.summary,
        bodyLabel: def.bodyLabel,
        body: def.body
      };
    });
  }

  function schemaOptionById(id) {
    return humanSchemaOptions().find((option) => option.id === id) || humanSchemaOptions()[0];
  }

  function slugifyTitle(title) {
    return String(title || 'new-artifact')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'new-artifact';
  }

  function wizardModeCopy(modal) {
    const mode = modal?.mode || 'new';
    if (mode === 'edit') {
      return {
        kicker: 'Local edit',
        title: 'Edit Tiinex artifact',
        lead: 'Edit this local artifact through its schema-aware form.',
        icon: 'fa-pen-to-square',
        button: 'Save local edit'
      };
    }
    if (mode === 'continue') {
      return {
        kicker: 'Continue',
        title: 'Create continuation leaf',
        lead: 'Choose the human-authored Tiinex artifact shape for the child leaf.',
        icon: 'fa-code-branch',
        button: 'Continue to content'
      };
    }
    if (mode === 'reference') {
      return {
        kicker: 'Reference',
        title: 'Create reference leaf',
        lead: 'Choose the artifact shape that will carry a reference to the selected material.',
        icon: 'fa-link',
        button: 'Continue to content'
      };
    }
    return {
      kicker: 'Add',
      title: 'Create Tiinex artifact',
      lead: 'Choose a human-authored Tiinex artifact type before editing content.',
      icon: 'fa-file-circle-plus',
      button: 'Continue to content'
    };
  }

  function wizardNodeById(ws, id) {
    return id ? ws?.nodeById?.get?.(id) || null : null;
  }

  function wizardRelationCardInitial(ws, modal) {
    const mode = modal?.mode || 'new';
    const parent = wizardNodeById(ws, modal?.parentNodeId);
    const referenced = wizardNodeById(ws, modal?.referencedNodeId);

    if (mode === 'new' && !parent && !referenced) {
      return `<div class="wizard-relation-card neutral"><div class="wizard-relation-icon"><i class="fa-solid fa-seedling"></i></div><div><strong>New local artifact</strong><p>No parent is selected yet. This can become a root, or you can use Continue/Reference from an existing card.</p></div></div>`;
    }

    const rows = [];
    if (parent) rows.push(`<div><strong>Parent</strong><span>${escapeHtml(parent.title || parent.path)}</span></div>`);
    if (referenced) rows.push(`<div><strong>Reference target</strong><span>${escapeHtml(referenced.title || referenced.path)}</span></div>`);
    const relation = mode === 'continue' ? 'Continuation relation' : mode === 'reference' ? 'Reference relation' : 'Selected relation';
    const icon = mode === 'continue' ? 'fa-code-branch' : mode === 'reference' ? 'fa-link' : 'fa-diagram-project';
    return `<div class="wizard-relation-card ${escapeAttr(mode)}"><div class="wizard-relation-icon"><i class="fa-solid ${icon}"></i></div><div><strong>${escapeHtml(relation)}</strong><p>${escapeHtml(mode === 'reference' ? 'This draft will be placed under the selected parent and point back to the referenced artifact.' : 'This draft will be created as a child of the selected parent artifact.')}</p><div class="wizard-relation-rows">${rows.join('')}</div></div></div>`;
  }

  function defaultWizardTitle(ws, modal, option) {
    const parent = wizardNodeById(ws, modal?.parentNodeId);
    const referenced = wizardNodeById(ws, modal?.referencedNodeId);
    if (modal?.title) return modal.title;
    if (modal?.mode === 'continue' && parent) return `${parent.title || 'Selected artifact'} continuation`;
    if (modal?.mode === 'reference' && referenced) return `${referenced.title || 'Selected artifact'} reference`;
    return `New ${option.label}`;
  }

  function defaultWizardSummary(modal, option) {
    if (modal?.summary) return modal.summary;
    const label = String(option?.label || 'artifact').toLowerCase();
    if (modal?.mode === 'continue') return `Continuation ${label} created in Tiinex Viewer.`;
    if (modal?.mode === 'reference') return `Reference ${label} created in Tiinex Viewer.`;
    return `${option?.label || 'Tiinex'} artifact created in Tiinex Viewer.`;
  }

  function renderArtifactWizardModal(modal) {
    const ws = getWorkspace(modal.wsId);
    if (!ws) return '';
    const options = humanSchemaOptions();
    const selectedId = modal.schemaId || options[0].id;
    const selected = schemaOptionById(selectedId);
    const copy = wizardModeCopy(modal);
    const title = defaultWizardTitle(ws, modal, selected);
    const summary = defaultWizardSummary(modal, selected);
    const body = typeof modal.body === 'string' ? modal.body : selected.body;
    const step = wizardStep(modal);
    const primaryAction = step === 'type' ? 'wizard-next-step' : 'wizard-open-editor';
    const primaryText = step === 'type' ? 'Continue to details' : copy.button;
    const primaryIcon = step === 'type' ? 'fa-arrow-right' : 'fa-pen-nib';
    const primaryButtons = step === 'describe' && wizardDirectArtifactAvailable(modal)
      ? `<button class="tv-btn primary wizard-direct-create" data-action="wizard-create-direct" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-circle-check"></i>${escapeHtml(wizardDirectButtonText(modal))}</button><button class="tv-btn subtle wizard-review-markdown" data-action="wizard-open-editor" data-ws="${escapeAttr(ws.id)}"><i class="fa-brands fa-markdown"></i>Review markdown</button>`
      : `<button class="tv-btn primary" data-action="${escapeAttr(primaryAction)}" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid ${escapeAttr(primaryIcon)}"></i>${escapeHtml(primaryText)}</button>`;

    return `<div class="modal-backdrop-custom focus-modal artifact-wizard-backdrop" role="dialog" aria-modal="true" aria-labelledby="artifact-wizard-title">
      <div class="modal-panel artifact-wizard-panel authoring-dialog-panel paged">
        <div class="modal-header-lite artifact-wizard-head authoring-dialog-head">
          <div class="authoring-dialog-title">
            <p class="kicker">${escapeHtml(copy.kicker)}</p>
            <h2 class="modal-title-lite" id="artifact-wizard-title"><i class="fa-solid ${escapeAttr(copy.icon)}"></i>${escapeHtml(copy.title)}</h2>
            <p class="text-secondary mb-0">${escapeHtml(copy.lead)}</p>
          </div>
          <button class="tv-btn small subtle authoring-dialog-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="artifact-wizard-body authoring-dialog-body paged">
          ${wizardStepIndicator(step)}
          ${step === 'type' ? wizardRelationCardInitial(ws, modal) : ''}
          ${step === 'type'
            ? wizardTypeStep(ws, modal, options, selectedId)
            : wizardDescribeStep(ws, modal, selected, title, summary, body)}
        </div>
        <div class="modal-footer-actions artifact-wizard-actions authoring-dialog-actions paged">
          ${step === 'describe' ? `<button class="tv-btn subtle" data-action="wizard-set-step" data-step="type"><i class="fa-solid fa-arrow-left"></i>Back</button>` : ''}
          ${primaryButtons}
          <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  registerRenderModalWrapper(function renderModalWithArtifactWizard(modal, next) {
    if (modal?.type === 'artifact-wizard') return renderArtifactWizardModal(modal);
    return next(modal);
  });


  // --- Artifact wizard and reference flow ---

  function openArtifactWizard(ws, options = {}) {
    if (!ws) return;
    const schemaId = options.schemaId || 'tiinex.topic.v1';
    const option = schemaOptionById(schemaId);
    app.modal = {
      type: 'artifact-wizard',
      wsId: ws.id,
      mode: options.mode || 'new',
      parentNodeId: options.parentNodeId || '',
      referencedNodeId: options.referencedNodeId || '',
      schemaId,
      title: options.title || '',
      summary: options.summary || '',
      body: typeof options.body === 'string' ? options.body : option.body
    };
    render();
  }

  function wizardPathFor(ws, modal, option, title) {
    const kind = wizardKindForSchema(option.id);
    if (modal.mode === 'continue' && modal.parentNodeId) {
      const parent = wizardNodeById(ws, modal.parentNodeId);
      if (parent && kind === 'trace') return nextSiblingTracePath(parent, ws);
    }
    if (modal.mode === 'reference' && modal.parentNodeId) {
      const parent = wizardNodeById(ws, modal.parentNodeId);
      if (parent && kind === 'trace') return nextSiblingTracePath(parent, ws).replace(/\.trace\.md$/i, '-reference.trace.md');
    }
    const slug = slugifyTitle(title || option.label);
    if (kind === 'workspace') return `.topics/workspaces/${slug}.workspace.md`;
    return `.topics/${slug}.trace.md`;
  }

  function enterReferenceParentPicker(ws, referencedNode) {
    app.modal = null;
    app.parentPicker = {
      wsId: ws.id,
      referencedNodeId: referencedNode.id,
      startedAt: Date.now()
    };
    render();
    toast('Select a parent for the reference leaf.', 'ok');
  }

  function parentPickerActiveFor(ws) {
    return Boolean(app.parentPicker && (!ws || app.parentPicker.wsId === ws.id));
  }

  function renderParentPickerBanner(ws) {
    if (!parentPickerActiveFor(ws)) return '';
    const referenced = wizardNodeById(ws, app.parentPicker.referencedNodeId);
    return `<div class="parent-picker-banner">
      <div><strong><i class="fa-solid fa-link"></i>Select parent for reference</strong><p>Reference target: ${escapeHtml(referenced?.title || referenced?.path || 'selected artifact')}. Choose where the new leaf belongs.</p></div>
      <button class="tv-btn tiny subtle" data-action="cancel-parent-picker" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-xmark"></i>Cancel</button>
    </div>`;
  }
  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWithParentPicker(ws, selected, next) {
    const html = next(ws, selected);
    if (!parentPickerActiveFor(ws)) return html;
    return html.replace('<div class="post-feed', `${renderParentPickerBanner(ws)}<div class="post-feed`);
  });
  function parentPickerSelectActionItem(ws, node) {
    return {
      label: 'Select as parent',
      icon: 'fa-solid fa-location-crosshairs',
      className: 'select-parent-action constructive',
      dataset: { action: 'select-reference-parent', ws: ws?.id || '', node: node?.id || '' },
      title: 'Select as parent for reference leaf'
    };
  }

  registerRenderNodePostWrapper(function renderNodePostWithParentPicker(ws, node, options = {}, next) {
    const html = next(ws, node, options);
    if (!parentPickerActiveFor(ws)) return html;
    const button = renderNodeActionItem(parentPickerSelectActionItem(ws, node));
    if (html.includes('<div class="post-actions">')) {
      return html.replace('<div class="post-actions">', `<div class="post-actions">${button}`);
    }
    return html.replace('</article>', `<div class="post-actions">${button}</div></article>`);
  });
  registerRenderWrapper(function renderWithParentPickerClass(next) {
    const result = next();
    document.body.classList.toggle('parent-picker-active', Boolean(app.parentPicker));
    return result;
  });

  registerActionHandler(async function wizardAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    const label = String(event.currentTarget?.textContent || '').trim().toLowerCase();
    const hasNodeContext = Boolean(event.currentTarget?.dataset?.ws && event.currentTarget?.dataset?.node);

    if (action === 'open-artifact-wizard' || action === 'open-add-artifact') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.activeWorkspaceId || '');
      if (!ws) return toast('No workspace selected.', 'warn');
      openArtifactWizard(ws, { mode: 'new' });
      return;
    }

    if (action === 'wizard-select-schema') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      const option = schemaOptionById(event.currentTarget.dataset.schema || 'tiinex.topic.v1');
      app.modal.schemaId = option.id;
      app.modal.body = option.body;
      render();
      return;
    }

    if (action === 'wizard-open-editor') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (!ws || !app.modal || app.modal.type !== 'artifact-wizard') return;
      const artifact = wizardTemplate(ws, app.modal);
      const previous = app.modal;
      app.modal = {
        type: 'add-artifact',
        wsId: ws.id,
        kind: artifact.kind,
        path: artifact.path,
        title: artifact.title,
        text: artifact.text,
        continuationOf: previous.mode === 'continue' ? previous.parentNodeId : '',
        referenceOf: previous.mode === 'reference' ? previous.referencedNodeId : '',
        parentNodeId: previous.parentNodeId || '',
        schemaId: previous.schemaId || '',
        editorMode: 'rich'
      };
      render();
      return;
    }

    if (action === 'continue' || action === 'continue-node' || (label === 'continue' && hasNodeContext)) {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      openArtifactCreateIntent({ mode: 'continue', ws, node });
      return;
    }

    if ((action === 'reference' || action === 'open-reference' || action === 'add-reference' || (label === 'reference' && hasNodeContext)) && hasNodeContext) {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      openArtifactCreateIntent({ mode: 'reference', ws, node });
      return;
    }

    if (action === 'select-reference-parent') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const parent = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      const referenced = wizardNodeById(ws, app.parentPicker?.referencedNodeId);
      if (!ws || !parent || !referenced) return toast('Could not resolve reference parent.', 'warn');
      const same = parent.id === referenced.id;
      app.parentPicker = null;
      openArtifactWizard(ws, {
        mode: same ? 'continue' : 'reference',
        parentNodeId: parent.id,
        referencedNodeId: same ? '' : referenced.id,
        schemaId: same ? (parent.currentSchemaText || parent.currentSchema || 'tiinex.topic.v1') : 'tiinex.evidence.v1',
        title: same ? `${parent.title || 'Selected artifact'} continuation` : `${referenced.title || 'Selected artifact'} reference`
      });
      return;
    }

    if (action === 'cancel-parent-picker') {
      event.preventDefault();
      event.stopPropagation();
      app.parentPicker = null;
      render();
      return;
    }

    return next(event);
  });




  function wizardStep(modal) {
    const step = modal?.wizardStep || 'type';
    return step === 'describe' ? 'describe' : 'type';
  }

  function wizardStepIndicator(step) {
    const steps = [
      ['type', 'Type'],
      ['describe', 'Details'],
      ['content', 'Content']
    ];
    return `<div class="artifact-wizard-progress" aria-label="Wizard progress">
      ${steps.map(([id, label], index) => {
        const active = id === step;
        const done = (step === 'describe' && id === 'type') || (id === 'content' && false);
        return `<span class="${active ? 'active' : done ? 'done' : ''}"><b>${index + 1}</b>${escapeHtml(label)}</span>`;
      }).join('')}
    </div>`;
  }

  function wizardTypeStep(ws, modal, options, selectedId) {
    return `<section class="wizard-step wizard-step-page wizard-type-step">
      <div class="wizard-step-head"><span>1</span><div><strong>Choose Tiinex artifact type</strong><p>Human-authored artifact shapes only. Runtime-oriented schemas stay hidden here.</p></div></div>
      <div class="wizard-schema-grid paged">
        ${options.map((option) => `<button type="button" class="wizard-schema-card ${option.id === selectedId ? 'selected' : ''}" data-action="wizard-select-schema" data-schema="${escapeAttr(option.id)}" data-ws="${escapeAttr(ws.id)}" title="Use ${escapeAttr(option.label)}">
          <i class="fa-solid ${escapeAttr(option.icon)}"></i>
          <strong>${escapeHtml(option.label)}</strong>
          <small>${escapeHtml(option.suffix)}</small>
          <p>${escapeHtml(option.summary)}</p>
        </button>`).join('')}
      </div>
    </section>`;
  }

  registerOpenArtifactWizardWrapper(function openArtifactWizardPaged(ws, options = {}, next) {
    const result = next(ws, options);
    if (app.modal?.type === 'artifact-wizard') {
      app.modal.wizardStep = options.wizardStep || 'type';
    }
    return result;
  });
  registerActionHandler(async function pagedWizardAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'wizard-set-step') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      app.modal.wizardStep = event.currentTarget.dataset.step === 'describe' ? 'describe' : 'type';
      render();
      return;
    }

    if (action === 'wizard-next-step') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      app.modal.wizardStep = 'describe';
      render();
      return;
    }

    if (action === 'wizard-select-schema') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      const option = schemaOptionById(event.currentTarget.dataset.schema || 'tiinex.topic.v1');
      app.modal.schemaId = option.id;
      app.modal.body = option.body;
      // Selection advances: the Back button makes changing type cheap, and this
      // removes one click on mobile.
      app.modal.wizardStep = 'describe';
      render();
      return;
    }

    return next(event);
  });




  function stripHeaderArtifactLauncher(html) {
    return String(html || '').replace(/<button\b[^>]*\badd-artifact-launcher\b[\s\S]*?<\/button>/g, '');
  }

  function tiinexArtifactChoiceCard(wsId) {
    return `<button type="button" class="add-choice-card tiinex-artifact-choice" data-action="open-artifact-wizard" data-ws="${escapeAttr(wsId || '')}" title="Create a new Tiinex artifact">
      <span class="add-choice-icon"><i class="fa-solid fa-file-circle-plus"></i></span>
      <span class="add-choice-copy"><strong>New Tiinex artifact</strong><small>Create a human-authored Tiinex leaf with the artifact wizard.</small></span>
      <i class="fa-solid fa-arrow-right"></i>
    </button>`;
  }
  registerRenderModalWrapper(function renderModalWithArtifactChoice(modal, next) {
    let html = next(modal);
    if (!modal || modal.type !== 'source') return html;

    // The artifact creator is a peer add-choice on the first Add screen only.
    // It should not appear in Git source / URLs / drop substeps where it looks
    // like a completion or secondary submit action.
    html = stripHeaderArtifactLauncher(html);

    if (modal.addMode) return html;

    const wsId = modal.wsId || app.activeWorkspaceId || '';
    const choice = tiinexArtifactChoiceCard(wsId);
    if (html.includes('tiinex-artifact-choice')) return html;
    return html.replace('<div class="add-choice-grid">', `<div class="add-choice-grid">${choice}`);
  });




  function knownHumanSchemaIds() {
    return new Set(WIZARD_HUMAN_SCHEMA_IDS);
  }

  function schemaArtifactPath(schemaId) {
    const id = String(schemaId || '').trim();
    if (!knownHumanSchemaIds().has(id) && id !== 'tiinex.root.v1') return '';
    return `.topics/.schemas/${id}.schema.md`;
  }

  function schemaReferenceForPath(schemaId, artifactPath) {
    const id = String(schemaId || '').trim() || 'tiinex.topic.v1';
    const schemaPath = schemaArtifactPath(id);
    if (!schemaPath || !artifactPath) return id;
    const relative = relativePathFromTo(artifactPath, schemaPath);
    return `[${id}](${relative || schemaPath})`;
  }

  function envelopeSchemaReference(artifactPath) {
    return schemaReferenceForPath('tiinex.root.v1', artifactPath);
  }

  function currentBlockForPath(schemaValue, summary, artifactPath, why = '') {
    const created = rootTimestamp();
    const schemaId = schemaIdFromText(schemaValue, 'tiinex.topic.v1');
    const schema = schemaReferenceForPath(schemaId, artifactPath);
    return `- Current
  - Current Schema: ${schema}
  - Created At: ${created}
${why ? `  - Why: ${why}\n` : ''}${summary ? `  - Summary: ${summary}\n` : ''}`;
  }

  function parentSchemaReferenceForPath(node, childPath) {
    const id = schemaIdFromText(node?.currentSchemaText || node?.currentSchema || '', 'tiinex.topic.v1');
    return schemaReferenceForPath(id, childPath);
  }

  function parentTraceReferenceForPath(node, childPath) {
    const rel = relativePathFromTo(childPath, node?.path || '');
    return linkForPath(displayFileName(node?.path || 'parent'), rel || node?.path || '');
  }

  function integrityFooterForPath(parent, childPath) {
    const towards = parent ? parentTraceReferenceForPath(parent, childPath) : 'self';
    return integrityFooter(towards, 'pending');
  }

  function schemaTemplate(id) {
    const def = wizardSchemaDefinition(id);
    return { bodyLabel: def.bodyLabel, body: def.body };
  }

  function wizardKindForSchema(schemaId) {
    return wizardSchemaDefinition(schemaId).kind || 'trace';
  }

  function wizardSchemaId(option) {
    const id = typeof option === 'string' ? option : option?.id;
    const def = wizardSchemaDefinition(id);
    return def.generatesSchemaId || def.id;
  }

  function relationReferenceBody(ws, modal, path) {
    const referenced = wizardNodeById(ws, modal.referencedNodeId);
    if (!referenced) return '';
    const targetRel = relativePathFromTo(path, referenced.path || '');
    const href = targetRel || referenced.browseUrl || referenced.rawUrl || referenced.path || '';
    const label = displayFileName(referenced.path || 'reference target');
    return `\n## Linked Artifacts\n\n- Referenced artifact: ${linkForPath(label, href)}\n`;
  }




  function schemaFormFor(schemaId) {
    return wizardSchemaDefinition(schemaId).fields || null;
  }

  function wizardFormState(modal) {
    if (!modal.formFields || typeof modal.formFields !== 'object') modal.formFields = {};
    return modal.formFields;
  }

  function formLines(value) {
    return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }

  function listBlock(value, fallback = '') {
    const lines = formLines(value);
    if (!lines.length) return fallback ? `- ${fallback}` : '- ';
    return lines.map((line) => line.startsWith('- ') ? line : `- ${line}`).join('\n');
  }

  function paragraph(value, fallback = '') {
    return String(value || '').trim() || fallback;
  }

  function defaultFormValues(schemaId, modal, option) {
    const def = wizardSchemaDefinition(schemaId);
    return typeof def.defaults === 'function' ? def.defaults(modal, option) : {};
  }

  function ensureWizardFormDefaults(modal, option) {
    const schemaId = wizardSchemaId(option);
    if (!schemaFormFor(schemaId)) return;
    const state = wizardFormState(modal);
    const defaults = defaultFormValues(schemaId, modal, option);
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof state[key] !== 'string') state[key] = value;
    }
  }

  function bodyFromForm(schemaId, f, context = {}) {
    const def = wizardSchemaDefinition(schemaId);
    return typeof def.bodyFromForm === 'function' ? def.bodyFromForm(f || {}, context) : '';
  }

  function renderWizardField(field, value) {
    const id = `wizard-field-${field.key}`;
    const required = field.required ? `<span class="wizard-required">required</span>` : '';
    const label = `<span>${escapeHtml(field.label)}${required}</span>`;
    if (field.type === 'select') {
      return `<label class="field-label schema-aware-field" for="${escapeAttr(id)}">${label}<select id="${escapeAttr(id)}" class="form-control tv-input" data-wizard-form-field="${escapeAttr(field.key)}">${(field.options || []).map((o) => `<option value="${escapeAttr(o)}" ${String(value || '') === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select></label>`;
    }
    if (field.type === 'input') {
      return `<label class="field-label schema-aware-field" for="${escapeAttr(id)}">${label}<input id="${escapeAttr(id)}" class="form-control tv-input" data-wizard-form-field="${escapeAttr(field.key)}" value="${escapeAttr(value || '')}" placeholder="${escapeAttr(field.placeholder || '')}"></label>`;
    }
    return `<label class="field-label schema-aware-field" for="${escapeAttr(id)}">${label}<textarea id="${escapeAttr(id)}" class="form-control tv-textarea schema-aware-textarea ${field.type === 'list' ? 'list-field' : ''}" data-wizard-form-field="${escapeAttr(field.key)}" placeholder="${escapeAttr(field.placeholder || '')}" spellcheck="true">${escapeHtml(value || '')}</textarea>${field.type === 'list' ? '<small>One item per line. Tiinex formats it as a markdown list.</small>' : ''}</label>`;
  }

  function wizardDescribeStep(ws, modal, selected, title, summary, body) {
    const schemaId = wizardSchemaId(selected);
    const renderer = wizardSchemaDefinition(schemaId).describeStep;
    if (typeof renderer === 'function') return renderer(ws, modal, selected, title, summary, body);
    const fields = schemaFormFor(schemaId);
    ensureWizardFormDefaults(modal, selected);
    const state = wizardFormState(modal);
    return `<section class="wizard-step wizard-step-page wizard-describe-step schema-aware-describe">
      <div class="wizard-step-head"><span>2</span><div><strong>Describe the leaf</strong><p>${fields ? 'Fill only the fields that matter. The viewer assembles the Tiinex markdown.' : 'Use raw markdown for this not-yet-modeled shape.'}</p></div></div>
      <div class="wizard-selected-type-strip">
        <i class="fa-solid ${escapeAttr(selected.icon)}"></i>
        <div><strong>${escapeHtml(selected.label)}</strong><span>${escapeHtml(schemaId)}</span></div>
        <button class="tv-btn tiny subtle" data-action="wizard-set-step" data-step="type"><i class="fa-solid fa-rotate-left"></i>Change</button>
      </div>
      <div class="wizard-fields paged schema-aware-fields">
        <label class="field-label">Title<input class="form-control tv-input" data-field="wizardTitle" value="${escapeAttr(title)}"></label>
        <label class="field-label">Summary<input class="form-control tv-input" data-field="wizardSummary" value="${escapeAttr(summary)}"></label>
        ${fields ? `<div class="schema-aware-form-grid">${fields.map((field) => renderWizardField(field, state[field.key] || '')).join('')}</div>` : `<label class="field-label wizard-body-field">${escapeHtml(selected.bodyLabel || 'Body')}<textarea class="form-control tv-textarea wizard-body-textarea paged" data-field="wizardBody" spellcheck="true">${escapeHtml(body)}</textarea></label>`}
      </div>
    </section>`;
  }

  function wizardBodyForModal(modal, option, context = {}) {
    const schemaId = wizardSchemaId(option);
    const fields = schemaFormFor(schemaId);
    if (!fields) return typeof modal.body === 'string' ? modal.body : schemaTemplate(option.id).body;
    ensureWizardFormDefaults(modal, option);
    return bodyFromForm(schemaId, wizardFormState(modal), context);
  }

  function wizardTemplate(ws, modal) {
    const option = schemaOptionById(modal.schemaId || 'tiinex.topic.v1');
    const schema = wizardSchemaId(option);
    const title = defaultWizardTitle(ws, modal, option);
    const summary = defaultWizardSummary(modal, option);
    const path = wizardPathFor(ws, modal, option, title);
    const body = wizardBodyForModal(modal, option, { modal, path });
    const parent = wizardNodeById(ws, modal.parentNodeId);
    const parentBlock = parent ? parentContinuityBlock(parent, path) : '';
    const referenceBlock = modal.mode === 'reference' ? relationReferenceBody(ws, modal, path) : '';
    return {
      kind: wizardKindForSchema(option.id),
      path,
      title,
      schema,
      text: `# Continuity Context

- Envelope Schema: ${envelopeSchemaReference(path)}
${parentBlock}${currentBlockForPath(schema, summary, path)}
---

# ${title}

${body}${referenceBlock}

---

${integrityFooterForPath(parent, path)}`,
      evidenceAttachments: schema === 'tiinex.evidence.v1' ? evidenceAttachments(modal) : undefined
    };
  }

  function handleWizardFormInput(event) {
    const key = event.target?.dataset?.wizardFormField || '';
    if (!key || !app.modal || app.modal.type !== 'artifact-wizard') return;
    wizardFormState(app.modal)[key] = event.target.value;
  }

  window.addEventListener('input', handleWizardFormInput, true);
  window.addEventListener('change', handleWizardFormInput, true);




  function evidenceAttachments(modal = app.modal) {
    if (!modal) return [];
    if (!Array.isArray(modal.evidenceAttachments)) modal.evidenceAttachments = [];
    return modal.evidenceAttachments;
  }

  function evidenceAttachmentId() {
    return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function safeFileSlug(name) {
    return String(name || 'attachment')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || 'attachment';
  }

  function evidenceAttachmentPath(artifactPath, attachment) {
    const baseDir = dirname(artifactPath || '.topics/evidence.trace.md') || '.topics';
    const fileName = safeFileSlug(attachment.name || attachment.label || 'attachment');
    return joinPath(baseDir, 'assets', fileName);
  }

  function evidenceAttachmentHref(artifactPath, attachment) {
    if (attachment.kind === 'url') return attachment.url || '';
    const path = attachment.path || evidenceAttachmentPath(artifactPath, attachment);
    return relativePathFromTo(artifactPath, path) || path;
  }

  function evidenceAttachmentLabel(attachment) {
    return attachment.label || attachment.name || attachment.url || 'attachment';
  }

  function evidenceAttachmentLine(artifactPath, attachment) {
    const href = evidenceAttachmentHref(artifactPath, attachment);
    const label = evidenceAttachmentLabel(attachment);
    if (!href) return `- ${label}`;
    return `- ${linkForPath(label, href)}`;
  }




  function renderEvidenceAttachmentCollector(modal) {
    const attachments = evidenceAttachments(modal);
    const count = attachments.length;
    return `<section class="evidence-collector compact polished" data-evidence-drop-target="1">
      <div class="evidence-collector-head compact polished">
        <div>
          <strong>Attachments ${count ? `<span class="evidence-count">${count}</span>` : ''}</strong>
          <p>Drop files here or add URLs.</p>
        </div>
        <div class="evidence-collector-actions polished">
          <button type="button" class="tv-btn tiny subtle" data-action="evidence-add-url"><i class="fa-solid fa-link"></i>URL</button>
          <button type="button" class="tv-btn tiny subtle" data-action="evidence-pick-file"><i class="fa-solid fa-file-arrow-up"></i>File</button>
          <input class="visually-hidden evidence-file-input" type="file" multiple data-evidence-file-input="1" aria-hidden="true" tabindex="-1">
        </div>
      </div>
      ${count ? `<div class="evidence-attachment-grid compact polished">${attachments.map(renderEvidenceAttachmentCard).join('')}</div>` : `<div class="evidence-empty-drop compact polished"><i class="fa-solid fa-cloud-arrow-up"></i><strong>Drop files</strong><span>or add URL/file</span></div>`}
    </section>`;
  }

  function renderEvidenceWizardDescribeStep(ws, modal, selected, title, summary, body) {
    const schemaId = wizardSchemaId(selected);
    ensureWizardFormDefaults(modal, selected);
    const state = wizardFormState(modal);
    return `<section class="wizard-step wizard-step-page wizard-describe-step schema-aware-describe evidence-describe compact polished">
      <div class="wizard-step-head compact polished"><span>2</span><div><strong>Collect evidence</strong><p>State the claim, then attach the material.</p></div></div>
      <div class="wizard-selected-type-strip compact polished">
        <i class="fa-solid ${escapeAttr(selected.icon)}"></i>
        <div><strong>${escapeHtml(selected.label)}</strong><span>${escapeHtml(schemaId)}</span></div>
        <button class="tv-btn tiny subtle" data-action="wizard-set-step" data-step="type"><i class="fa-solid fa-rotate-left"></i>Change</button>
      </div>
      <div class="wizard-fields paged schema-aware-fields evidence-fields compact polished">
        <label class="field-label">Title<input class="form-control tv-input compact" data-field="wizardTitle" value="${escapeAttr(title)}"></label>
        <label class="field-label">Summary<input class="form-control tv-input compact" data-field="wizardSummary" value="${escapeAttr(summary)}"></label>
        <label class="field-label evidence-claim-field compact polished">Supported claim <span class="wizard-required">required</span><textarea class="form-control tv-textarea evidence-claim-textarea compact polished" data-wizard-form-field="supportedClaim" placeholder="What does this evidence show or support?">${escapeHtml(state.supportedClaim || '')}</textarea></label>
        ${renderEvidenceAttachmentCollector(modal)}
      </div>
    </section>`;
  }

  function updateEvidenceAttachmentField(id, field, value) {
    const attachment = evidenceAttachments().find((item) => item.id === id);
    if (!attachment) return;
    attachment[field] = value;
  }

  function addEvidenceUrlAttachment() {
    evidenceAttachments().push({
      id: evidenceAttachmentId(),
      kind: 'url',
      url: '',
      label: '',
      representation: 'web page',
      notes: '',
      limits: ''
    });
  }

  function addEvidenceFileAttachment(file) {
    if (!file) return;
    const attachment = {
      id: evidenceAttachmentId(),
      kind: 'file',
      name: file.name || 'attachment',
      label: file.name || 'attachment',
      representation: file.type?.startsWith('image/') ? 'image file' : 'file',
      notes: '',
      limits: '',
      size: file.size || 0,
      type: file.type || '',
      file
    };
    evidenceAttachments().push(attachment);
    readImageMetadata(attachment);
  }

  function storeEvidenceAttachmentFiles(ws, modal, artifactPath) {
    for (const attachment of evidenceAttachments(modal)) {
      if (attachment.kind !== 'file' || !attachment.file) continue;
      const path = evidenceAttachmentPath(artifactPath, attachment);
      attachment.path = path;
      storeWorkspaceAsset(ws, path, attachment.file, {
        type: attachment.type || attachment.file.type || '',
        size: attachment.size || attachment.file.size || 0,
        source: 'evidence-attachment'
      });
    }
  }

  registerActionHandler(async function evidenceAttachmentAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'evidence-add-url') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      addEvidenceUrlAttachment();
      render();
      return;
    }

    if (action === 'evidence-pick-file') {
      event.preventDefault();
      event.stopPropagation();
      const input = document.querySelector('.evidence-file-input');
      if (input) input.click();
      return;
    }

    if (action === 'evidence-remove-attachment') {
      event.preventDefault();
      event.stopPropagation();
      const id = event.currentTarget.dataset.attachmentId || '';
      if (!app.modal) return;
      app.modal.evidenceAttachments = evidenceAttachments().filter((item) => item.id !== id);
      render();
      return;
    }

    if (action === 'wizard-open-editor' && app.modal?.type === 'artifact-wizard') {
      const option = schemaOptionById(app.modal.schemaId || 'tiinex.topic.v1');
      if (wizardSchemaId(option) === 'tiinex.evidence.v1') {
        event.preventDefault();
        event.stopPropagation();
        const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
        if (!ws) return toast('No workspace selected.', 'warn');
        const artifact = wizardTemplate(ws, app.modal);
        const previous = app.modal;
        app.modal = {
          type: 'add-artifact',
          wsId: ws.id,
          kind: artifact.kind,
          path: artifact.path,
          title: artifact.title,
          text: artifact.text,
          continuationOf: previous.mode === 'continue' ? previous.parentNodeId : '',
          referenceOf: previous.mode === 'reference' ? previous.referencedNodeId : '',
          parentNodeId: previous.parentNodeId || '',
          schemaId: previous.schemaId || '',
          editorMode: 'rich',
          evidenceAttachments: artifact.evidenceAttachments || []
        };
        render();
        return;
      }
    }

    if (action === 'save-new-artifact' && app.modal?.type === 'add-artifact' && Array.isArray(app.modal.evidenceAttachments)) {
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (ws) storeEvidenceAttachmentFiles(ws, app.modal, canonicalWorkspacePath(app.modal.path || ''));
      return next(event);
    }

    return next(event);
  });

  function handleEvidenceAttachmentInput(event) {
    const id = event.target?.dataset?.attachmentId || '';
    const field = event.target?.dataset?.evidenceAttachmentField || '';
    if (id && field) {
      updateEvidenceAttachmentField(id, field, event.target.value);
      return;
    }
    if (event.target?.dataset?.evidenceFileInput === '1' && app.modal?.type === 'artifact-wizard') {
      Array.from(event.target.files || []).forEach(addEvidenceFileAttachment);
      event.target.value = '';
      render();
    }
  }

  window.addEventListener('input', handleEvidenceAttachmentInput, true);
  window.addEventListener('change', handleEvidenceAttachmentInput, true);




  function evidenceWizardActive() {
    if (!app.modal || app.modal.type !== 'artifact-wizard') return false;
    const option = schemaOptionById(app.modal.schemaId || 'tiinex.topic.v1');
    return wizardSchemaId(option) === 'tiinex.evidence.v1';
  }

  function addEvidenceDroppedFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length || !evidenceWizardActive()) return false;
    list.forEach(addEvidenceFileAttachment);
    render();
    toast(`${list.length} evidence attachment${list.length === 1 ? '' : 's'} added.`, 'ok');
    return true;
  }

  function evidenceDropIsFileTransfer(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  function handleGlobalEvidenceDrag(event) {
    if (!evidenceWizardActive() || !evidenceDropIsFileTransfer(event)) return;
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.add('evidence-drag-active');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function handleGlobalEvidenceDragLeave(event) {
    if (!evidenceWizardActive()) return;
    if (event.relatedTarget) return;
    document.body.classList.remove('evidence-drag-active');
  }

  function handleGlobalEvidenceDrop(event) {
    if (!evidenceWizardActive() || !evidenceDropIsFileTransfer(event)) return;
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.remove('evidence-drag-active');
    addEvidenceDroppedFiles(event.dataTransfer?.files || []);
  }

  window.addEventListener('dragenter', handleGlobalEvidenceDrag, true);
  window.addEventListener('dragover', handleGlobalEvidenceDrag, true);
  window.addEventListener('dragleave', handleGlobalEvidenceDragLeave, true);
  window.addEventListener('drop', handleGlobalEvidenceDrop, true);




  function evidenceDetailsActive() {
    if (!app.modal || app.modal.type !== 'artifact-wizard') return false;
    const option = schemaOptionById(app.modal.schemaId || 'tiinex.topic.v1');
    return wizardSchemaId(option) === 'tiinex.evidence.v1' && wizardStep(app.modal) === 'describe';
  }
  registerRenderWrapper(function renderWithEvidenceDetailsClass(next) {
    const result = next();
    document.body.classList.toggle('evidence-details-active', evidenceDetailsActive());
    return result;
  });

  function defaultAttachmentLimit(attachment) {
    if (attachment.kind === 'url') return 'Source availability may change; this artifact preserves the provided URL and notes.';
    return 'Attachment is preserved as provided; interpretation depends on the selected supported claim and readable file content.';
  }

  function attachmentLimitsMarkdown(items) {
    const explicit = items.flatMap((attachment) => formLines(attachment.limits || ''));
    if (explicit.length) return explicit.map((line) => `- ${line}`).join('\n');
    if (!items.length) return '- No supporting material has been attached yet.';
    return items.map((attachment) => `- ${defaultAttachmentLimit(attachment)}`).join('\n');
  }
  registerActionHandler(async function evidenceSimplifyAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'evidence-toggle-advanced') {
      event.preventDefault();
      event.stopPropagation();
      const id = event.currentTarget.dataset.attachmentId || '';
      const item = evidenceAttachments().find((attachment) => attachment.id === id);
      if (item) item.expanded = !item.expanded;
      render();
      return;
    }
    return next(event);
  });




  function attachmentMetaMarkdown(attachment) {
    const lines = [];
    if (attachment.kind === 'file') {
      if (attachment.type) lines.push(`  - Media Type: ${attachment.type}`);
      const size = humanSize(attachment.size);
      if (size) lines.push(`  - Size: ${size}`);
      if (attachment.width && attachment.height) lines.push(`  - Dimensions: ${attachment.width}×${attachment.height}`);
    }
    return lines.join('\n');
  }

  function readImageMetadata(attachment) {
    if (!attachment?.file || !String(attachment.type || '').startsWith('image/')) return;
    try {
      const url = URL.createObjectURL(attachment.file);
      const img = new Image();
      img.onload = () => {
        attachment.width = img.naturalWidth || img.width || 0;
        attachment.height = img.naturalHeight || img.height || 0;
        URL.revokeObjectURL(url);
        if (evidenceWizardActive?.()) render();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (_) {}
  }

  function evidenceAttachmentsMarkdown(artifactPath, attachments) {
    const items = (attachments || []).filter((attachment) => attachment && (attachment.url || attachment.name || attachment.label));
    if (!items.length) {
      return {
        provenance: '- Source: \n- Representation: ',
        material: 'Preserve the readable supporting material here.',
        limits: '- No supporting material has been attached yet.'
      };
    }

    const provenance = items.map((attachment) => {
      const line = evidenceAttachmentLine(artifactPath, attachment);
      const representation = attachment.representation ? `\n  - Representation: ${attachment.representation}` : '';
      const meta = attachmentMetaMarkdown(attachment);
      return `${line}${representation}${meta ? `\n${meta}` : ''}`;
    }).join('\n');

    const material = items.map((attachment) => {
      const line = evidenceAttachmentLine(artifactPath, attachment);
      const notes = attachment.notes ? `\n  - Notes: ${attachment.notes}` : '';
      const meta = attachmentMetaMarkdown(attachment);
      return `${line}${notes}${meta ? `\n${meta}` : ''}`;
    }).join('\n');

    return {
      provenance,
      material,
      limits: attachmentLimitsMarkdown(items)
    };
  }







  function evidenceAttachmentIsImage(attachment) {
    return attachment?.kind === 'file' && (
      String(attachment.type || '').startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(String(attachment.name || ''))
    );
  }

  function evidenceAttachmentObjectUrl(attachment) {
    if (!attachment || !attachment.file) return '';
    if (attachment.previewUrl) return attachment.previewUrl;
    try {
      attachment.previewUrl = URL.createObjectURL(attachment.file);
      return attachment.previewUrl;
    } catch (_) {
      return '';
    }
  }

  function evidenceAttachmentThumb(attachment, icon) {
    if (!evidenceAttachmentIsImage(attachment)) {
      return `<span class="evidence-attachment-icon"><i class="fa-solid ${icon}"></i></span>`;
    }
    const src = evidenceAttachmentObjectUrl(attachment);
    if (!src) return `<span class="evidence-attachment-icon"><i class="fa-solid ${icon}"></i></span>`;
    return `<button type="button" class="evidence-image-thumb" data-action="evidence-preview-attachment" data-attachment-id="${escapeAttr(attachment.id || '')}" title="Preview image" aria-label="Preview image">
      <img src="${escapeAttr(src)}" alt="${escapeAttr(evidenceAttachmentLabel(attachment))}" loading="lazy">
    </button>`;
  }

  function renderEvidenceAttachmentCard(attachment) {
    const id = attachment.id || '';
    const isUrl = attachment.kind === 'url';
    const icon = isUrl ? 'fa-link' : 'fa-file-arrow-up';
    const kindLabel = isUrl ? 'URL' : 'File';
    const label = evidenceAttachmentLabel(attachment);
    const expanded = Boolean(attachment.expanded);
    const chips = attachmentMetaChips(attachment);

    return `<article class="evidence-attachment-card simplified meta truthy preview" data-attachment-id="${escapeAttr(id)}">
      <div class="evidence-attachment-top simplified meta">
        ${evidenceAttachmentThumb(attachment, icon)}
        <div>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(kindLabel)}</small>
          ${chips.length ? `<div class="evidence-meta-chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>` : ''}
        </div>
        <button type="button" class="tv-btn tiny subtle evidence-remove-attachment" data-action="evidence-remove-attachment" data-attachment-id="${escapeAttr(id)}" title="Remove attachment" aria-label="Remove attachment"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="evidence-simple-fields">
        ${isUrl ? `<label class="field-label">URL<input class="form-control tv-input" data-evidence-attachment-field="url" data-attachment-id="${escapeAttr(id)}" value="${escapeAttr(attachment.url || '')}" placeholder="https://..."></label>` : ''}
        <label class="field-label evidence-wide">Notes<textarea class="form-control tv-textarea evidence-mini-textarea simplified" data-evidence-attachment-field="notes" data-attachment-id="${escapeAttr(id)}" placeholder="What should this evidence preserve or show?">${escapeHtml(attachment.notes || '')}</textarea></label>
      </div>

      <button type="button" class="tv-btn tiny subtle evidence-advanced-toggle" data-action="evidence-toggle-advanced" data-attachment-id="${escapeAttr(id)}">
        <i class="fa-solid ${expanded ? 'fa-chevron-up' : 'fa-sliders'}"></i>${expanded ? 'Hide details' : 'More details'}
      </button>

      ${expanded ? `<div class="evidence-attachment-fields advanced truthy">
        <label class="field-label evidence-wide">Label<input class="form-control tv-input" data-evidence-attachment-field="label" data-attachment-id="${escapeAttr(id)}" value="${escapeAttr(attachment.label || '')}" placeholder="${escapeAttr(isUrl ? 'Readable source name' : attachment.name || 'Attachment label')}"></label>
        <div class="evidence-derived-row evidence-wide">
          <span>Representation</span>
          <strong>${escapeHtml(attachment.representation || kindLabel.toLowerCase())}</strong>
          <small>Derived from attachment type. Not user-editable.</small>
        </div>
        <label class="field-label evidence-wide">Limits<textarea class="form-control tv-textarea evidence-mini-textarea" data-evidence-attachment-field="limits" data-attachment-id="${escapeAttr(id)}" placeholder="${escapeAttr(defaultAttachmentLimit(attachment))}">${escapeHtml(attachment.limits || '')}</textarea></label>
      </div>` : ''}
    </article>`;
  }

  function evidencePreviewAttachment() {
    const id = app.evidencePreviewAttachmentId || '';
    if (!id) return null;
    const attachments = evidenceAttachments(app.modal);
    return attachments.find((attachment) => attachment.id === id) || null;
  }

  function evidencePreviewOverlayHtml(attachment) {
    if (!attachment || !evidenceAttachmentIsImage(attachment)) return '';
    const src = evidenceAttachmentObjectUrl(attachment);
    if (!src) return '';
    const label = evidenceAttachmentLabel(attachment);
    const chips = attachmentMetaChips(attachment);
    return `<div class="evidence-preview-overlay" role="dialog" aria-modal="true" aria-label="Evidence image preview">
      <div class="evidence-preview-panel">
        <div class="evidence-preview-head">
          <div>
            <p class="kicker">Evidence image preview</p>
            <h2>${escapeHtml(label)}</h2>
            ${chips.length ? `<div class="evidence-meta-chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>` : ''}
          </div>
          <button type="button" class="tv-btn small subtle" data-action="evidence-close-preview" aria-label="Close preview"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="evidence-preview-body">
          <img src="${escapeAttr(src)}" alt="${escapeAttr(label)}">
        </div>
      </div>
    </div>`;
  }

  function renderEvidencePreviewOverlay() {
    document.querySelectorAll('.evidence-preview-overlay').forEach((node) => node.remove());
    const html = evidencePreviewOverlayHtml(evidencePreviewAttachment());
    if (html) document.body.insertAdjacentHTML('beforeend', html);
  }
  registerRenderWrapper(function renderWithEvidencePreview(next) {
    const result = next();
    renderEvidencePreviewOverlay();
    return result;
  });
  registerActionHandler(async function evidencePreviewAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'evidence-preview-attachment') {
      event.preventDefault();
      event.stopPropagation();
      app.evidencePreviewAttachmentId = event.currentTarget.dataset.attachmentId || '';
      render();
      return;
    }

    if (action === 'evidence-close-preview') {
      event.preventDefault();
      event.stopPropagation();
      app.evidencePreviewAttachmentId = '';
      render();
      return;
    }

    return next(event);
  });

  function closeEvidencePreviewOnEscape(event) {
    if (event.key !== 'Escape' || !app.evidencePreviewAttachmentId) return;
    app.evidencePreviewAttachmentId = '';
    render();
  }

  window.addEventListener('keydown', closeEvidencePreviewOnEscape, true);




  function wizardDirectButtonText(modal) {
    const mode = modal?.mode || 'new';
    if (mode === 'edit') return 'Save local edit';
    if (mode === 'continue') return 'Create continuation';
    if (mode === 'reference') return 'Create reference';
    return 'Create artifact';
  }

  function wizardDirectArtifactAvailable(modal) {
    if (!modal || modal.type !== 'artifact-wizard') return false;
    const option = schemaOptionById(modal.schemaId || 'tiinex.topic.v1');
    return option && option.id !== 'raw';
  }



  // --- Artifact wizard output ---

  function createArtifactFromWizard(ws, modal) {
    const artifact = wizardTemplate(ws, modal);
    const kind = artifact.kind || 'trace';
    const path = canonicalWorkspacePath(artifact.path || '');
    const error = validateNewArtifactPath(path, kind);
    if (error) {
      toast(error, 'warn');
      return false;
    }
    if (workspaceHasPathInSource(ws, 'local', path)) {
      toast('That local path already exists. Edit or remove it first.', 'warn');
      return false;
    }

    if (artifact.evidenceAttachments && typeof storeEvidenceAttachmentFiles === 'function') {
      const stash = { evidenceAttachments: artifact.evidenceAttachments };
      storeEvidenceAttachmentFiles(ws, stash, path);
    }

    upsertWorkspaceTextFile(ws, path, artifact.text, 'local');
    computeWorkspaceIndex(ws);
    const node = Array.from(ws.nodeById?.values?.() || []).find((candidate) => sameImportedPath(candidate.path, path));
    if (node) ws.selectedNodeId = node.id;

    app.modal = null;
    if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
    if (typeof setRouteState === 'function') setRouteState('replace');
    render();
    toast(`${wizardDirectButtonText(modal)} added.`, 'ok');
    return true;
  }
  registerActionHandler(async function wizardDirectCreateAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'wizard-create-direct') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (!ws || !app.modal || app.modal.type !== 'artifact-wizard') return toast('No workspace selected.', 'warn');
      createArtifactFromWizard(ws, app.modal);
      return;
    }
    return next(event);
  });




  function repairTextBackedWorkspaceFiles(ws) {
    if (!ws?.files) return;
    for (const file of ws.files.values()) {
      if (!file) continue;
      const text = typeof file.text === 'string' ? file.text : '';
      const content = typeof file.content === 'string' ? file.content : '';
      if (!content && text) file.content = normalizeNewlines(text);
      if (!file.text && content) file.text = normalizeNewlines(content);
      if (!file.workspaceId) file.workspaceId = ws.id;
      if (!file.name) file.name = fileNameFromPath(file.path || file.storageKey || 'artifact.md');
    }
  }

  registerComputeWorkspaceIndexWrapper(function computeWorkspaceIndexWithTextContentRepair(ws, next) {
    repairTextBackedWorkspaceFiles(ws);
    return next(ws);
  });




  function schemaIdForNode(node) {
    return schemaIdFromText(node?.currentSchemaText || node?.currentSchema || '', '');
  }

  function schemaAwareEditAvailable(ws, node) {
    if (!ws || !node || !canEditNode(ws, node)) return false;
    const schemaId = schemaIdForNode(node);
    return Boolean(schemaId && knownHumanSchemaIds().has(schemaId) && schemaFormFor(schemaId));
  }

  function formStateFromNode(node) {
    const schemaId = schemaIdForNode(node);
    const def = wizardSchemaDefinition(schemaId);
    if (typeof def.formStateFromSections !== 'function') return {};
    return def.formStateFromSections(sectionMap(node?.body || ''));
  }

  function openSchemaAwareEditWizard(ws, node) {
    const schemaId = schemaIdForNode(node);
    app.modal = {
      type: 'artifact-wizard',
      mode: 'edit',
      wsId: ws.id,
      editNodeId: node.id,
      schemaId,
      title: node.title || node.bodyTitle || node.topHeading || '',
      summary: node.summary || '',
      path: node.path || node.file?.path || '',
      parentNodeId: node.parentNode?.id || '',
      wizardStep: 'describe',
      formFields: formStateFromNode(node)
    };
    render();
  }

  registerWizardPathForWrapper(function wizardPathForWithEdit(ws, modal, option, title, next) {
    if (modal?.mode === 'edit' && modal.path) return canonicalWorkspacePath(modal.path);
    return next(ws, modal, option, title);
  });



  function saveSchemaAwareEditWizard(ws, modal) {
    const node = ws?.nodeById?.get?.(modal.editNodeId || '');
    if (!ws || !node) {
      toast('No editable node selected.', 'warn');
      return false;
    }
    const artifact = wizardTemplate(ws, modal);
    if (artifact.evidenceAttachments && typeof storeEvidenceAttachmentFiles === 'function') {
      const stash = { evidenceAttachments: artifact.evidenceAttachments };
      storeEvidenceAttachmentFiles(ws, stash, artifact.path || node.path || '');
    }
    saveNodeEdit(ws, node, artifact.text);
    app.modal = null;
    if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
    if (typeof setRouteState === 'function') setRouteState('replace');
    render();
    toast('Saved local schema edit.', 'ok');
    return true;
  }
  registerActionHandler(async function schemaAwareEditAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'open-node-edit') {
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      if (schemaAwareEditAvailable(ws, node)) {
        event.preventDefault();
        event.stopPropagation();
        openSchemaAwareEditWizard(ws, node);
        return;
      }
    }

    if (action === 'wizard-create-direct' && app.modal?.mode === 'edit') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      saveSchemaAwareEditWizard(ws, app.modal);
      return;
    }

    if (action === 'wizard-open-editor' && app.modal?.mode === 'edit') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      const node = ws?.nodeById?.get?.(app.modal?.editNodeId || '');
      if (!ws || !node) return toast('No editable node selected.', 'warn');
      const artifact = wizardTemplate(ws, app.modal);
      app.modal = { type: 'edit-node', wsId: ws.id, nodeId: node.id, text: artifact.text };
      render();
      return;
    }

    return next(event);
  });

  function normalizedFolderPath(path) {
    return canonicalWorkspacePath(path || '').replace(/\/+$/g, '') || '.topics';
  }

  function defaultArtifactFolder(ws, modal) {
    const roots = typeof discoveryRootsForWorkspace === 'function' ? discoveryRootsForWorkspace(ws) : ['.topics'];
    return normalizedFolderPath(modal?.folderPath || roots?.[0] || '.topics');
  }

  function treeFolderActualPath(ws, folderPath = '') {
    const roots = typeof discoveryRootsForWorkspace === 'function' ? discoveryRootsForWorkspace(ws) : ['.topics'];
    const root = normalizedFolderPath(roots?.[0] || '.topics');
    const relative = canonicalWorkspacePath(folderPath || '').replace(/^\.?\//, '').replace(/\/+$/g, '');
    return relative ? joinPath(root, relative) : root;
  }

  function workspaceAnyHasPath(ws, path) {
    const clean = canonicalWorkspacePath(path || '');
    return Array.from(ws?.files?.values?.() || []).some((file) => sameImportedPath(file.path || file.storageKey || '', clean));
  }

  function directChildFileNames(ws, folderPath, suffixRe) {
    const folder = normalizedFolderPath(folderPath);
    return Array.from(ws?.files?.values?.() || [])
      .map((file) => canonicalWorkspacePath(file.path || file.storageKey || ''))
      .filter((path) => dirname(path) === folder && suffixRe.test(path))
      .map((path) => fileNameFromPath(path));
  }

  function nextNumericTracePath(ws, folderPath) {
    const names = directChildFileNames(ws, folderPath, /\.trace\.md$/i);
    const nums = names
      .map((name) => String(name).match(/^(\d+)(?=(?:[-.]|$))/))
      .filter(Boolean)
      .map((m) => ({ n: Number(m[1]), width: m[1].length }))
      .filter((item) => Number.isFinite(item.n));
    if (!nums.length) return '';
    const max = nums.reduce((a, b) => b.n > a.n ? b : a, nums[0]);
    const width = Math.max(3, max.width || 3);
    let next = max.n + 1;
    for (let i = 0; i < 9999; i++, next++) {
      const name = String(next).padStart(width, '0');
      const candidate = joinPath(folderPath, `${name}.trace.md`);
      if (!workspaceAnyHasPath(ws, candidate)) return candidate;
    }
    return '';
  }

  function uniquePathInFolder(ws, folderPath, baseSlug, suffix) {
    const folder = normalizedFolderPath(folderPath);
    const slug = slugifyTitle(baseSlug || 'new-artifact');
    const first = joinPath(folder, `${slug}${suffix}`);
    if (!workspaceAnyHasPath(ws, first)) return first;
    for (let i = 2; i < 10000; i++) {
      const candidate = joinPath(folder, `${slug}-${i}${suffix}`);
      if (!workspaceAnyHasPath(ws, candidate)) return candidate;
    }
    return joinPath(folder, `${slug}-${Date.now().toString(36)}${suffix}`);
  }

  function uniqueWizardRootPath(ws, modal, option, title) {
    const kind = wizardKindForSchema(option.id);
    const folder = defaultArtifactFolder(ws, modal);
    if (kind === 'workspace') return uniquePathInFolder(ws, folder, title || option.label || 'workspace', '.workspace.md');
    const numeric = nextNumericTracePath(ws, folder);
    if (numeric) return numeric;
    return uniquePathInFolder(ws, folder, title || option.label || 'artifact', '.trace.md');
  }

  registerWizardPathForWrapper(function wizardPathForUniqueRoot(ws, modal, option, title, next) {
    if (modal?.mode === 'edit') return next(ws, modal, option, title);
    if (modal?.mode === 'continue' || modal?.mode === 'reference') return next(ws, modal, option, title);
    return uniqueWizardRootPath(ws, modal, option, title);
  });

  registerOpenArtifactWizardWrapper(function openArtifactWizardWithFolder(ws, options = {}, next) {
    const result = next(ws, options);
    if (app.modal?.type === 'artifact-wizard' && options.folderPath) {
      app.modal.folderPath = normalizedFolderPath(options.folderPath);
    }
    return result;
  });

  function folderAddButton(ws, folderPath, label = 'Add artifact in folder') {
    return `<button type="button" class="tree-folder-add" data-action="open-artifact-wizard-folder" data-ws="${escapeAttr(ws.id)}" data-folder="${escapeAttr(folderPath || '')}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">
      <i class="fa-solid fa-plus"></i>
    </button>`;
  }

  registerActionHandler(async function folderAddAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'open-artifact-wizard-folder') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.activeWorkspaceId || '');
      if (!ws) return toast('No workspace selected.', 'warn');
      const folder = normalizedFolderPath(event.currentTarget.dataset.folder || '.topics');
      openArtifactWizard(ws, { mode: 'new', folderPath: folder });
      return;
    }
    return next(event);
  });






  function getActiveWorkspace() {
    return getWorkspace(app.activeWorkspaceId || '') || app.workspaces?.[0] || null;
  }




  function editableElementActive() {
    const el = document.activeElement;
    return Boolean(el && el !== document.body && el.matches?.('input, textarea, select, [contenteditable="true"]'));
  }

  function scrollEventWorkspace(el) {
    if (!el) return null;
    const postFeed = el.closest?.('.post-feed[data-ws]');
    if (postFeed) return getWorkspace(postFeed.dataset.ws || '');
    const workspace = el.closest?.('.workspace[data-ws]');
    if (workspace) return getWorkspace(workspace.dataset.ws || '');
    return null;
  }

  function captureActiveFocus() {
    const el = document.activeElement;
    if (!el || el === document.body || !el.matches?.('input, textarea, select, [contenteditable="true"]')) return null;
    const modalType = app.modal?.type || '';
    const attrs = ['data-field', 'data-wizard-form-field', 'data-evidence-attachment-field', 'data-attachment-id', 'data-subfield', 'name', 'id'];
    const parts = [];
    for (const attr of attrs) {
      const value = el.getAttribute?.(attr);
      if (value) parts.push(`[${attr}="${CSS.escape(value)}"]`);
    }
    const selector = parts.length
      ? `${el.tagName.toLowerCase()}${parts.join('')}`
      : (el.id ? `#${CSS.escape(el.id)}` : '');
    if (!selector) return null;
    return {
      selector,
      modalType,
      start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null
    };
  }

  function restoreActiveFocus(info) {
    if (!info) return;
    if ((app.modal?.type || '') !== info.modalType) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(info.selector);
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
        if (typeof info.start === 'number' && typeof el.setSelectionRange === 'function') {
          el.setSelectionRange(info.start, info.end ?? info.start);
        }
      } catch (_) {}
    });
  }

  registerRenderWrapper(function renderWithFocusPreservation(next) {
    const focus = captureActiveFocus();
    const result = next();
    restoreActiveFocus(focus);
    return result;
  });


  function exportSourceEntries(ws) {
    ensureWorkspaceSources(ws);
    const sources = Array.from(ws.sources?.values?.() || []);
    const seen = new Set();
    for (const file of ws.files?.values?.() || []) {
      const id = file.sourceId || 'local';
      if (!seen.has(id) && !sources.find((source) => source.id === id)) {
        sources.push({ id, kind: file.sourceKind || 'local', label: file.sourceLabel || id, origin: file.rawUrl || file.browseUrl || '' });
      }
      seen.add(id);
    }
    if (!sources.length) sources.push(localSource(ws));
    return sources;
  }

  function defaultExportModal(wsId) {
    return {
      type: 'export-workspace',
      wsId,
      mode: 'all',
      includeAssets: true,
      sourceIds: []
    };
  }

  function renderExportModeButton(modal, mode, label, icon, help) {
    const active = (modal.mode || 'all') === mode;
    return `<button type="button" class="export-mode-card ${active ? 'active' : ''}" data-action="export-set-mode" data-mode="${escapeAttr(mode)}">
      <span><i class="fa-solid ${escapeAttr(icon)}"></i></span>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(help)}</small>
    </button>`;
  }

  function fileSourceId(file) {
    return file?.sourceId || 'local';
  }

  function exportIncludedFiles(ws, modal) {
    const files = Array.from(ws.files?.values?.() || []);
    const mode = modal.mode || 'all';
    if (mode === 'local') return files.filter((file) => fileSourceId(file) === 'local' || file.sourceKind === 'local');
    if (mode === 'sources') {
      const selected = new Set(modal.sourceIds || []);
      return files.filter((file) => selected.has(fileSourceId(file)));
    }
    return files;
  }

  function exportIncludedAssets(ws, modal) {
    if (!modal.includeAssets) return [];
    const assets = Array.from(ws.assets?.values?.() || []);
    if ((modal.mode || 'all') !== 'sources') return assets;
    // Asset source ids are currently less consistently available than file
    // source ids. Include assets for source exports so Evidence attachments
    // are not silently lost.
    return assets;
  }

  function renderExportModal(modal) {
    const ws = getWorkspace(modal.wsId);
    if (!ws) return '';
    const sources = exportSourceEntries(ws);
    const files = exportIncludedFiles(ws, modal);
    const assets = exportIncludedAssets(ws, modal);
    const selected = new Set(modal.sourceIds || []);
    const sourceRows = sources.map((source) => {
      const count = Array.from(ws.files?.values?.() || []).filter((file) => fileSourceId(file) === source.id).length;
      return `<label class="export-source-row">
        <input type="checkbox" data-action="export-toggle-source" data-source="${escapeAttr(source.id)}" ${selected.has(source.id) ? 'checked' : ''}>
        <span>
          <strong>${escapeHtml(source.label || source.id)}</strong>
          <small>${escapeHtml(source.kind || 'source')} · ${count} file${count === 1 ? '' : 's'}${source.repo ? ` · ${source.repo}${source.ref ? '@' + source.ref : ''}` : ''}</small>
        </span>
      </label>`;
    }).join('');

    return `<div class="modal-backdrop-custom focus-modal export-backdrop" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div class="modal-panel export-panel">
        <div class="modal-header-lite export-head">
          <div>
            <p class="kicker">Export</p>
            <h2 class="modal-title-lite" id="export-title"><i class="fa-solid fa-file-zipper"></i>Export workspace</h2>
            <p class="text-secondary mb-0">Write portable files out of Tiinex without mutating the loaded sources.</p>
          </div>
          <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="export-body">
          <div class="export-mode-grid">
            ${renderExportModeButton(modal, 'all', 'All', 'fa-layer-group', 'Export every loaded file.')}
            ${renderExportModeButton(modal, 'local', 'Local', 'fa-pen-to-square', 'Export local edits and created artifacts.')}
            ${renderExportModeButton(modal, 'sources', 'Sources', 'fa-code-merge', 'Pick one or more sources.')}
          </div>

          ${modal.mode === 'sources' ? `<section class="export-section">
            <h3>Sources</h3>
            <div class="export-source-list">${sourceRows}</div>
          </section>` : ''}

          <section class="export-section compact">
            <label class="export-toggle-row">
              <input type="checkbox" data-action="export-toggle-assets" ${modal.includeAssets ? 'checked' : ''}>
              <span><strong>Assets</strong><small>Include preserved images, evidence files, and local attachments when available.</small></span>
            </label>
          </section>

          <section class="export-summary">
            <div><strong>${files.length}</strong><span>markdown/file entries</span></div>
            <div><strong>${assets.length}</strong><span>asset entries</span></div>
            <div><strong>${escapeHtml(modal.mode || 'all')}</strong><span>mode</span></div>
          </section>
        </div>
        <div class="modal-footer-actions export-actions">
          <button class="tv-btn primary" data-action="export-run" data-ws="${escapeAttr(ws.id)}" ${files.length || assets.length ? '' : 'disabled'}><i class="fa-solid fa-download"></i>Export</button>
          <button class="tv-btn subtle" data-action="close-modal">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  registerRenderModalWrapper(function renderModalWithExportDialog(modal, next) {
    if (modal?.type === 'export-workspace') return renderExportModal(modal);
    return next(modal);
  });

  function exportFileOutputPath(file, collisions) {
    const path = normalizeAssetPath(file.path || file.name || 'artifact.md');
    if (!collisions.has(path)) return path;
    const source = sourceSafe(file.sourceLabel || file.sourceId || file.sourceKind || 'source').replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '') || 'source';
    return normalizeAssetPath(`_sources/${source}/${path}`);
  }

  function exportAssetOutputPath(asset, collisions) {
    const path = normalizeAssetPath(asset.path || asset.name || 'asset');
    if (!collisions.has(path)) return path;
    return normalizeAssetPath(`_assets/${path}`);
  }

  async function exportBlobForEntry(entry) {
    if (entry.blob instanceof Blob) return entry.blob;
    if (typeof entry.content === 'string') return new Blob([entry.content], { type: entry.type || 'text/plain;charset=utf-8' });
    if (typeof entry.text === 'string') return new Blob([entry.text], { type: entry.type || 'text/plain;charset=utf-8' });
    return new Blob([''], { type: 'application/octet-stream' });
  }


  // --- Workspace export ---

  async function exportWorkspaceZip(ws, modal, hooks = {}) {
    const emitDownloadBlob = typeof hooks.downloadBlob === 'function' ? hooks.downloadBlob : downloadBlob;
    const emitToast = typeof hooks.toast === 'function' ? hooks.toast : toast;
    const files = exportIncludedFiles(ws, modal);
    const assets = exportIncludedAssets(ws, modal);
    if (!files.length && !assets.length) return emitToast('Nothing selected for export.', 'warn');

    if (!window.JSZip) {
      for (const file of files) {
        downloadText(normalizeAssetPath(file.path || file.name || 'artifact.md'), file.content || file.text || '', 'text/markdown;charset=utf-8');
      }
      emitToast('JSZip unavailable. Downloaded markdown files individually.', 'warn');
      return;
    }

    const pathCounts = new Map();
    for (const item of [...files, ...assets]) {
      const path = normalizeAssetPath(item.path || item.name || '');
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
    }
    const collisions = new Set(Array.from(pathCounts.entries()).filter(([, count]) => count > 1).map(([path]) => path));

    const zip = new window.JSZip();
    const manifest = {
      schema: 'tiinex.export.v1',
      createdAt: new Date().toISOString(),
      workspace: {
        label: ws.label || '',
        sourceNote: ws.sourceNote || ''
      },
      export: {
        mode: modal.mode || 'all',
        includeAssets: Boolean(modal.includeAssets),
        selectedSources: modal.sourceIds || []
      },
      sources: exportSourceEntries(ws).map(sourceSerializable),
      files: [],
      assets: []
    };

    for (const file of files) {
      const outPath = exportFileOutputPath(file, collisions);
      const content = file.content || file.text || '';
      zip.file(outPath, content);
      manifest.files.push({
        path: file.path || '',
        outputPath: outPath,
        sourceId: file.sourceId || '',
        sourceLabel: file.sourceLabel || '',
        rawUrl: file.rawUrl || '',
        browseUrl: file.browseUrl || '',
        repo: file.repo || '',
        ref: file.ref || '',
        isGenerated: Boolean(file.isGenerated)
      });
    }

    for (const asset of assets) {
      const outPath = exportAssetOutputPath(asset, collisions);
      const blob = await exportBlobForEntry(asset);
      zip.file(outPath, blob);
      manifest.assets.push({
        path: asset.path || '',
        outputPath: outPath,
        type: asset.type || '',
        size: asset.size || blob.size || 0,
        source: asset.source || ''
      });
    }

    zip.file('_tiinex/export.manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('_tiinex/README.md', `# Tiinex Export

- Workspace: ${ws.label || 'workspace'}
- Mode: ${modal.mode || 'all'}
- Files: ${files.length}
- Assets: ${assets.length}
- Created At: ${manifest.createdAt}

This export preserves selected workspace files without mutating the loaded source workspaces.

See _tiinex/export.manifest.json for source and output path metadata.
`);

    const blob = await zip.generateAsync({ type: 'blob' });
    const zipName = `${slugify(ws.label) || 'tiinex-workspace'}-${modal.mode || 'all'}-export.zip`;
    emitDownloadBlob(zipName, blob);
    app.modal = null;
    render();
    emitToast(`Downloaded ${zipName}.`, 'ok');
  }
  registerActionHandler(async function exportDialogAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'export-set-mode') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'export-workspace') return;
      app.modal.mode = event.currentTarget.dataset.mode || 'all';
      if (app.modal.mode === 'sources' && !(app.modal.sourceIds || []).length) {
        const ws = getWorkspace(app.modal.wsId);
        app.modal.sourceIds = exportSourceEntries(ws).slice(0, 1).map((source) => source.id);
      }
      render();
      return;
    }

    if (action === 'export-toggle-source') {
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'export-workspace') return;
      const id = event.currentTarget.dataset.source || '';
      const selected = new Set(app.modal.sourceIds || []);
      if (event.currentTarget.checked) selected.add(id);
      else selected.delete(id);
      app.modal.sourceIds = Array.from(selected);
      render();
      return;
    }

    if (action === 'export-toggle-assets') {
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'export-workspace') return;
      app.modal.includeAssets = Boolean(event.currentTarget.checked);
      render();
      return;
    }

    if (action === 'export-run') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (!ws || !app.modal || app.modal.type !== 'export-workspace') return toast('No workspace selected.', 'warn');
      await exportWorkspaceZip(ws, app.modal);
      return;
    }

    return next(event);
  });
  registerRenderWrapper(function renderWithEnabledExport(next) {
    const result = next();
    document.querySelectorAll('[data-action="save-workspace"]').forEach((button) => {
      const ws = getWorkspace(button.dataset.ws || '');
      if (ws && ((ws.files && ws.files.size) || (ws.assets && ws.assets.size))) {
        button.removeAttribute('disabled');
        button.setAttribute('title', 'Export workspace');
        if (!button.textContent.trim()) button.setAttribute('aria-label', 'Export workspace');
      }
    });
    return result;
  });




  const TIINEX_ENC_MAGIC = 'TIINEX-ENC-ZIP-V1';
  const TIINEX_ENC_ITERATIONS_ = 210000;

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(text || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function deriveTiinexExportKey(password, salt, usages) {
    if (!crypto?.subtle) throw new Error('Web Crypto is not available in this browser.');
    const base = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: TIINEX_ENC_ITERATIONS_, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      usages
    );
  }

  async function encryptTiinexZipBlob(blob, password, innerName) {
    if (!password) throw new Error('Password is required.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveTiinexExportKey(password, salt, ['encrypt']);
    const plain = await blob.arrayBuffer();
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    const header = {
      schema: 'tiinex.encrypted-zip.v1',
      kdf: 'PBKDF2-SHA256',
      iterations: TIINEX_ENC_ITERATIONS_,
      cipher: 'AES-GCM-256',
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      innerName: innerName || 'tiinex-export.zip',
      createdAt: new Date().toISOString()
    };
    const prefix = new TextEncoder().encode(`${TIINEX_ENC_MAGIC}\n${JSON.stringify(header)}\n\n`);
    return new Blob([prefix, cipher], { type: 'application/octet-stream' });
  }

  async function isTiinexEncryptedPackage(file) {
    try {
      const head = await file.slice(0, TIINEX_ENC_MAGIC.length + 8).text();
      return head.startsWith(TIINEX_ENC_MAGIC);
    } catch (_) {
      return false;
    }
  }

  function parseEncryptedPackageHeader(bytes) {
    const maxHeader = Math.min(bytes.length, 16384);
    let sep = -1;
    for (let i = 0; i < maxHeader - 1; i++) {
      if (bytes[i] === 10 && bytes[i + 1] === 10) {
        sep = i;
        break;
      }
    }
    if (sep < 0) throw new Error('Encrypted Tiinex package header was not found.');
    const headerText = new TextDecoder().decode(bytes.slice(0, sep));
    const lines = headerText.split('\n');
    if (lines[0] !== TIINEX_ENC_MAGIC) throw new Error('Unsupported encrypted Tiinex package.');
    const header = JSON.parse(lines.slice(1).join('\n'));
    return { header, cipherOffset: sep + 2 };
  }

  async function decryptTiinexZipPackage(file, password) {
    if (!password) throw new Error('Password is required.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { header, cipherOffset } = parseEncryptedPackageHeader(bytes);
    if (header.schema !== 'tiinex.encrypted-zip.v1') throw new Error('Unsupported encrypted Tiinex schema.');
    if (header.cipher !== 'AES-GCM-256') throw new Error('Unsupported encrypted Tiinex cipher.');
    const salt = base64ToBytes(header.salt);
    const iv = base64ToBytes(header.iv);
    const key = await deriveTiinexExportKey(password, salt, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(cipherOffset));
    return new File([plain], header.innerName || 'tiinex-export.zip', { type: 'application/zip' });
  }

  function encryptedExportPasswordInput() {
    return document.querySelector('[data-export-password]')?.value || '';
  }

  registerRenderExportModalWrapper(function renderExportModalWithEncryption(modal, next) {
    let html = next(modal);
    const checked = modal.exportEncrypted ? 'checked' : '';
    const passwordBlock = modal.exportEncrypted ? `<label class="field-label export-password-field">Password<input class="form-control tv-input" type="password" autocomplete="new-password" data-export-password placeholder="Password for this encrypted Tiinex package"></label>
      <p class="export-encryption-note">This creates a Tiinex-encrypted zip package. Drag it back into Tiinex to be prompted for the password.</p>` : '';
    const section = `<section class="export-section compact export-encryption">
      <label class="export-toggle-row">
        <input type="checkbox" data-action="export-toggle-encryption" ${checked}>
        <span><strong>Password</strong><small>Encrypt this export as a Tiinex package.</small></span>
      </label>
      ${passwordBlock}
    </section>`;

    if (html.includes('export-encryption')) return html;
    return html.replace('<section class="export-summary">', `${section}\n          <section class="export-summary">`);
  });

  async function exportWorkspaceZipEncrypted(ws, modal) {
    const password = encryptedExportPasswordInput();
    if (!password) {
      toast('Enter an export password first.', 'warn');
      document.querySelector('[data-export-password]')?.focus();
      return;
    }

    let intercepted = false;

    await exportWorkspaceZip(ws, modal, {
      downloadBlob(name, blob) {
        intercepted = true;
        (async () => {
          const encrypted = await encryptTiinexZipBlob(blob, password, name);
          const encryptedName = String(name || 'tiinex-export.zip').replace(/\.zip$/i, '.tiinex.enc.zip');
          downloadBlob(encryptedName, encrypted);
          toast(`Downloaded encrypted ${encryptedName}.`, 'ok');
        })().catch((error) => toast(`Could not encrypt export: ${error.message}`, 'warn'));
      },
      toast(message, type) {
        if (/^Downloaded\b/i.test(String(message || ''))) return;
        return toast(message, type);
      }
    });

    if (!intercepted) toast('No export blob was produced.', 'warn');
  }
  registerActionHandler(async function encryptedExportAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'export-toggle-encryption') {
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'export-workspace') return;
      app.modal.exportEncrypted = Boolean(event.currentTarget.checked);
      render();
      return;
    }

    if (action === 'export-run' && app.modal?.type === 'export-workspace' && app.modal.exportEncrypted) {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (!ws) return toast('No workspace selected.', 'warn');
      await exportWorkspaceZipEncrypted(ws, app.modal);
      return;
    }

    return next(event);
  });

  const fileToImportEntriesBeforeEncryption = fileToImportEntries;
  fileToImportEntries = async function fileToImportEntriesWithEncryptedTiinex(file) {
    if (await isTiinexEncryptedPackage(file)) {
      const password = window.prompt(`Password for ${file.name || 'encrypted Tiinex package'}`);
      if (!password) throw new Error('Password required for encrypted Tiinex package.');
      const decrypted = await decryptTiinexZipPackage(file, password);
      return fileToImportEntriesBeforeEncryption(decrypted);
    }
    return fileToImportEntriesBeforeEncryption(file);
  };




  function exportArchiveFormat(modal) {
    return modal?.archiveFormat || 'zip';
  }

  function exportPasswordMode(modal) {
    return modal?.passwordMode || (modal?.exportEncrypted ? 'tiinex' : 'none');
  }

  function exportBaseSlug(ws, modal) {
    return `${slugify(ws?.label || 'tiinex-workspace') || 'tiinex-workspace'}-${modal?.mode || 'all'}-export`;
  }

  function safeSourceSerializable(source) {
    if (typeof sourceSerializable === 'function') return sourceSerializable(source);
    return {
      id: source?.id || '',
      kind: source?.kind || '',
      label: source?.label || '',
      repo: source?.repo || '',
      ref: source?.ref || '',
      origin: source?.origin || source?.url || ''
    };
  }

  async function exportPayload(ws, modal) {
    const files = exportIncludedFiles(ws, modal);
    const assets = exportIncludedAssets(ws, modal);
    if (!files.length && !assets.length) throw new Error('Nothing selected for export.');

    const pathCounts = new Map();
    for (const item of [...files, ...assets]) {
      const path = normalizeAssetPath(item.path || item.name || '');
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
    }
    const collisions = new Set(Array.from(pathCounts.entries()).filter(([, count]) => count > 1).map(([path]) => path));

    const entries = [];
    const manifest = {
      schema: 'tiinex.export.v1',
      createdAt: new Date().toISOString(),
      workspace: { label: ws.label || '', sourceNote: ws.sourceNote || '' },
      export: {
        mode: modal.mode || 'all',
        archiveFormat: exportArchiveFormat(modal),
        passwordMode: exportPasswordMode(modal),
        includeAssets: Boolean(modal.includeAssets),
        selectedSources: modal.sourceIds || []
      },
      sources: exportSourceEntries(ws).map(safeSourceSerializable),
      files: [],
      assets: []
    };

    for (const file of files) {
      const outPath = exportFileOutputPath(file, collisions);
      const content = normalizeNewlines(file.content || file.text || '');
      entries.push({ path: outPath, bytes: new TextEncoder().encode(content), type: 'text/markdown;charset=utf-8' });
      manifest.files.push({
        path: file.path || '', outputPath: outPath, sourceId: file.sourceId || '', sourceLabel: file.sourceLabel || '',
        rawUrl: file.rawUrl || '', browseUrl: file.browseUrl || '', repo: file.repo || '', ref: file.ref || '', isGenerated: Boolean(file.isGenerated)
      });
    }

    for (const asset of assets) {
      const outPath = exportAssetOutputPath(asset, collisions);
      const blob = await exportBlobForEntry(asset);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      entries.push({ path: outPath, bytes, type: asset.type || blob.type || 'application/octet-stream' });
      manifest.assets.push({
        path: asset.path || '', outputPath: outPath, type: asset.type || blob.type || '',
        size: asset.size || blob.size || bytes.byteLength || 0, source: asset.source || ''
      });
    }

    const readme = `# Tiinex Export\n\n- Workspace: ${ws.label || 'workspace'}\n- Mode: ${modal.mode || 'all'}\n- Archive: ${exportArchiveFormat(modal)}\n- Password Mode: ${exportPasswordMode(modal)}\n- Files: ${files.length}\n- Assets: ${assets.length}\n- Created At: ${manifest.createdAt}\n\nThis export preserves selected workspace files without mutating the loaded source workspaces.\n\nContent remains rooted where the user expects it, such as .topics/. The _tiinex/ folder contains export metadata only.\n`;

    entries.push({ path: '_tiinex/export.manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)), type: 'application/json' });
    entries.push({ path: '_tiinex/README.md', bytes: new TextEncoder().encode(readme), type: 'text/markdown;charset=utf-8' });
    return { entries, manifest, files, assets };
  }

  async function archiveZipBlob(entries) {
    if (!window.JSZip) throw new Error('JSZip CDN was not available.');
    const zip = new window.JSZip();
    for (const entry of entries) zip.file(entry.path, entry.bytes);
    return zip.generateAsync({ type: 'blob' });
  }

  function octalString(value, width) {
    const text = Math.max(0, Number(value) || 0).toString(8);
    return text.padStart(width - 1, '0').slice(-(width - 1)) + '\0';
  }

  function tarNameFields(path) {
    const clean = normalizeAssetPath(path || 'file').replace(/^\/+/, '');
    const enc = new TextEncoder();
    if (enc.encode(clean).length <= 100) return { name: clean, prefix: '' };
    const parts = clean.split('/');
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      const name = parts.slice(i).join('/');
      if (enc.encode(prefix).length <= 155 && enc.encode(name).length <= 100) return { name, prefix };
    }
    throw new Error(`Path too long for tar header: ${clean}`);
  }

  function writeAscii(buf, offset, width, text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    buf.set(bytes.slice(0, width), offset);
  }

  function tarHeader(path, size, mtime) {
    const header = new Uint8Array(512);
    const { name, prefix } = tarNameFields(path);
    writeAscii(header, 0, 100, name);
    writeAscii(header, 100, 8, octalString(0o644, 8));
    writeAscii(header, 108, 8, octalString(0, 8));
    writeAscii(header, 116, 8, octalString(0, 8));
    writeAscii(header, 124, 12, octalString(size, 12));
    writeAscii(header, 136, 12, octalString(Math.floor(mtime || Date.now() / 1000), 12));
    for (let i = 148; i < 156; i++) header[i] = 32;
    header[156] = 48;
    writeAscii(header, 257, 6, 'ustar');
    header[263] = 0;
    writeAscii(header, 263, 2, '00');
    writeAscii(header, 345, 155, prefix);
    let sum = 0;
    for (const byte of header) sum += byte;
    writeAscii(header, 148, 8, sum.toString(8).padStart(6, '0') + '\0 ');
    return header;
  }

  function archiveTarBlob(entries) {
    const parts = [];
    const mtime = Math.floor(Date.now() / 1000);
    for (const entry of entries) {
      const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
      parts.push(tarHeader(entry.path, bytes.byteLength, mtime));
      parts.push(bytes);
      const pad = (512 - (bytes.byteLength % 512)) % 512;
      if (pad) parts.push(new Uint8Array(pad));
    }
    parts.push(new Uint8Array(512));
    parts.push(new Uint8Array(512));
    return new Blob(parts, { type: 'application/x-tar' });
  }

  async function gzipBlob(blob) {
    if (typeof CompressionStream !== 'function') throw new Error('gzip CompressionStream is not available in this browser.');
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  }

  async function archiveBlob(entries, format) {
    if (format === 'tar') return archiveTarBlob(entries);
    if (format === 'tgz') return gzipBlob(archiveTarBlob(entries));
    return archiveZipBlob(entries);
  }

  function archiveExtension(format) {
    if (format === 'tar') return 'tar';
    if (format === 'tgz') return 'tar.gz';
    return 'zip';
  }

  const CRC_TABLE_ = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32Update(crc, byte) {
    return (CRC_TABLE_[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
  }

  function crc32Bytes(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crc32Update(crc, byte);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
    const day = ((year - 1980) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
    return { time, day };
  }

  function pushU16(out, value) { out.push(value & 0xff, (value >>> 8) & 0xff); }
  function pushU32(out, value) { out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff); }

  function zipCryptoKeys(password) {
    const keys = { k0: 0x12345678 >>> 0, k1: 0x23456789 >>> 0, k2: 0x34567890 >>> 0 };
    const bytes = new TextEncoder().encode(password || '');
    for (const byte of bytes) zipCryptoUpdateKeys(keys, byte);
    return keys;
  }

  function zipCryptoUpdateKeys(keys, byte) {
    keys.k0 = crc32Update(keys.k0, byte);
    keys.k1 = (((keys.k1 + (keys.k0 & 0xff)) * 134775813 + 1) >>> 0);
    keys.k2 = crc32Update(keys.k2, (keys.k1 >>> 24) & 0xff);
  }

  function zipCryptoDecryptByte(keys) {
    const temp = (keys.k2 | 2) >>> 0;
    return (((temp * (temp ^ 1)) >>> 8) & 0xff) >>> 0;
  }

  function zipCryptoEncryptBytes(bytes, password) {
    const keys = zipCryptoKeys(password);
    const out = new Uint8Array(bytes.byteLength);
    for (let i = 0; i < bytes.byteLength; i++) {
      const plain = bytes[i];
      out[i] = plain ^ zipCryptoDecryptByte(keys);
      zipCryptoUpdateKeys(keys, plain);
    }
    return out;
  }

  function archiveZipCryptoBlob(entries, password) {
    if (!password) throw new Error('Password is required.');
    const fileParts = [];
    const centralParts = [];
    let offset = 0;
    const { time, day } = dosDateTime();
    const flag = 0x0801;

    for (const entry of entries) {
      const nameBytes = new TextEncoder().encode(normalizeAssetPath(entry.path || 'file'));
      const data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
      const crc = crc32Bytes(data);
      const header = crypto.getRandomValues(new Uint8Array(12));
      header[11] = (crc >>> 24) & 0xff;
      const allPlain = new Uint8Array(header.byteLength + data.byteLength);
      allPlain.set(header, 0);
      allPlain.set(data, header.byteLength);
      const encrypted = zipCryptoEncryptBytes(allPlain, password);
      const compSize = encrypted.byteLength;
      const uncompSize = data.byteLength;

      const local = [];
      pushU32(local, 0x04034b50); pushU16(local, 20); pushU16(local, flag); pushU16(local, 0);
      pushU16(local, time); pushU16(local, day); pushU32(local, crc); pushU32(local, compSize); pushU32(local, uncompSize);
      pushU16(local, nameBytes.byteLength); pushU16(local, 0);
      const localBytes = new Uint8Array([...local, ...nameBytes, ...encrypted]);
      fileParts.push(localBytes);

      const central = [];
      pushU32(central, 0x02014b50); pushU16(central, 20); pushU16(central, 20); pushU16(central, flag); pushU16(central, 0);
      pushU16(central, time); pushU16(central, day); pushU32(central, crc); pushU32(central, compSize); pushU32(central, uncompSize);
      pushU16(central, nameBytes.byteLength); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0); pushU16(central, 0);
      pushU32(central, 0); pushU32(central, offset);
      centralParts.push(new Uint8Array([...central, ...nameBytes]));
      offset += localBytes.byteLength;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
    const end = [];
    pushU32(end, 0x06054b50); pushU16(end, 0); pushU16(end, 0); pushU16(end, entries.length); pushU16(end, entries.length);
    pushU32(end, centralSize); pushU32(end, centralOffset); pushU16(end, 0);
    return new Blob([...fileParts, ...centralParts, new Uint8Array(end)], { type: 'application/zip' });
  }

  function renderArchiveButton(modal, format, label, help) {
    const active = exportArchiveFormat(modal) === format;
    return `<button type="button" class="export-choice-pill ${active ? 'active' : ''}" data-action="export-set-archive" data-format="${escapeAttr(format)}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></button>`;
  }

  function renderPasswordButton(modal, mode, label, help) {
    const active = exportPasswordMode(modal) === mode;
    const disabled = mode === 'zip' && exportArchiveFormat(modal) !== 'zip';
    return `<button type="button" class="export-choice-pill ${active ? 'active' : ''}" data-action="export-set-password-mode" data-mode="${escapeAttr(mode)}" ${disabled ? 'disabled' : ''}><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></button>`;
  }

  registerRenderExportModalWrapper(function renderExportModalWithArchiveChoices(modal, next) {
    if (!modal.archiveFormat) modal.archiveFormat = 'zip';
    if (!modal.passwordMode) modal.passwordMode = modal.exportEncrypted ? 'tiinex' : 'none';
    let html = next(modal);
    html = html.replace(/<section class="export-section compact export-encryption">[\s\S]*?<\/section>\s*/g, '');
    html = html.replace('<section class="export-summary">', `${renderExportChoices(modal)}\n          <section class="export-summary">`);
    return html;
  });

  async function exportWorkspaceArchive(ws, modal) {
    const format = exportArchiveFormat(modal);
    const passwordMode = exportPasswordMode(modal);
    const password = encryptedExportPasswordInput();
    if (passwordMode !== 'none' && !password) {
      toast('Enter an export password first.', 'warn');
      document.querySelector('[data-export-password]')?.focus();
      return;
    }
    const payload = await exportPayload(ws, modal);
    const base = exportBaseSlug(ws, modal);
    const ext = archiveExtension(format);
    if (passwordMode === 'zip') {
      if (format !== 'zip') return toast('Windows zip password mode requires archive format zip.', 'warn');
      const blob = archiveZipCryptoBlob(payload.entries, password);
      downloadBlob(`${base}.zip`, blob);
      app.modal = null; render(); toast(`Downloaded password zip ${base}.zip.`, 'ok'); return;
    }
    const blob = await archiveBlob(payload.entries, format);
    if (passwordMode === 'tiinex') {
      const encrypted = await encryptTiinexZipBlob(blob, password, `${base}.${ext}`);
      downloadBlob(`${base}.${ext}.tiinex.enc.zip`, encrypted);
      app.modal = null; render(); toast(`Downloaded encrypted ${base}.${ext}.tiinex.enc.zip.`, 'ok'); return;
    }
    downloadBlob(`${base}.${ext}`, blob);
    app.modal = null; render(); toast(`Downloaded ${base}.${ext}.`, 'ok');
  }
  registerActionHandler(async function archiveChoiceAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'export-set-archive') {
      event.preventDefault(); event.stopPropagation();
      if (!app.modal || app.modal.type !== 'export-workspace') return;
      app.modal.archiveFormat = event.currentTarget.dataset.format || 'zip';
      if (app.modal.archiveFormat !== 'zip' && exportPasswordMode(app.modal) === 'zip') app.modal.passwordMode = 'none';
      render(); return;
    }
    if (action === 'export-set-password-mode') {
      event.preventDefault(); event.stopPropagation();
      if (!app.modal || app.modal.type !== 'export-workspace') return;
      const mode = event.currentTarget.dataset.mode || 'none';
      if (mode === 'zip' && exportArchiveFormat(app.modal) !== 'zip') return toast('Zip password mode requires archive format zip.', 'warn');
      app.modal.passwordMode = mode;
      app.modal.exportEncrypted = mode === 'tiinex';
      render(); return;
    }
    if (action === 'export-run' && app.modal?.type === 'export-workspace') {
      event.preventDefault(); event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      if (!ws) return toast('No workspace selected.', 'warn');
      try { await exportWorkspaceArchive(ws, app.modal); }
      catch (error) { toast(`Could not export: ${error.message}`, 'warn'); }
      return;
    }
    return next(event);
  });




  function renderExportChoices(modal) {
    const needsPassword = exportPasswordMode(modal) !== 'none';
    const mode = exportPasswordMode(modal);
    return `<section class="export-section export-format">
      <h3>Archive</h3>
      <div class="export-choice-row">
        ${renderArchiveButton(modal, 'zip', 'zip', 'Common default.')}
        ${renderArchiveButton(modal, 'tar', 'tar', 'Plain archive.')}
        ${renderArchiveButton(modal, 'tgz', 'tar.gz', 'Compressed tar when browser supports gzip.')}
      </div>
    </section>
    <section class="export-section export-password">
      <h3>Password</h3>
      <div class="export-choice-row">
        ${renderPasswordButton(modal, 'none', 'None', 'No encryption.')}
        ${renderPasswordButton(modal, 'tiinex', 'AES-GCM', 'PBKDF2 + AES-GCM package.')}
        ${renderPasswordButton(modal, 'zip', 'ZipCrypto', 'Older ZIP client compatibility.')}
      </div>
      ${needsPassword ? `<label class="field-label export-password-field">Password<input class="form-control tv-input" type="password" autocomplete="new-password" data-export-password placeholder="Password for this export"></label>` : ''}
      <p class="export-encryption-note">${mode === 'zip'
        ? 'ZipCrypto works with older ZIP clients, but is weaker. Use AES-GCM for stronger app-level encryption.'
        : mode === 'tiinex'
          ? 'AES-GCM mode uses PBKDF2-SHA256 + AES-GCM-256 inside a Tiinex encrypted package container.'
          : 'Choose an archive format and optional password mode.'}</p>
    </section>`;
  };

  registerRenderExportModalWrapper(function renderExportModalWithHeaderPolish(modal, next) {
    const html = next(modal);
    return html
      .replace('class="modal-header-lite export-head"', 'class="modal-header-lite export-head"')
      .replace('<h2 class="modal-title-lite" id="export-title"><i class="fa-solid fa-file-zipper"></i>Export workspace</h2>', '<h2 class="modal-title-lite export-title" id="export-title"><span class="export-title-icon"><i class="fa-solid fa-file-zipper"></i></span><span>Export workspace</span></h2>');
  });




  function workspaceAssetEntries(ws) {
    return Array.from(ws?.assets?.values?.() || [])
      .filter(Boolean)
      .sort((a, b) => String(a.path || a.name || '').localeCompare(String(b.path || b.name || '')));
  }

  function assetDisplayName(asset) {
    return asset?.name || fileNameFromPath(asset?.path || '') || 'asset';
  }

  function assetKind(asset) {
    const type = String(asset?.type || '');
    const name = String(asset?.name || asset?.path || '');
    if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) return 'image';
    if (type.startsWith('text/') || /\.(md|txt|json|csv|log|xml|html|css|js)$/i.test(name)) return 'text';
    if (/\.pdf$/i.test(name) || type === 'application/pdf') return 'pdf';
    if (/\.zip$/i.test(name) || type.includes('zip')) return 'zip';
    return 'file';
  }

  function assetIcon(asset) {
    const kind = assetKind(asset);
    if (kind === 'image') return 'fa-image';
    if (kind === 'text') return 'fa-align-left';
    if (kind === 'pdf') return 'fa-file-pdf';
    if (kind === 'zip') return 'fa-file-zipper';
    return 'fa-paperclip';
  }

  function assetSizeLabel(size) {
    const n = Number(size || 0);
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function assetMatchesSearch(asset, query) {
    const q = normalizeSearchText(query || '');
    if (!q) return true;
    const text = normalizeSearchText([
      asset?.path,
      asset?.name,
      asset?.type,
      asset?.source,
      assetKind(asset)
    ].filter(Boolean).join(' '));
    return text.includes(q);
  }

  function visibleAssets(ws) {
    const opts = workspaceDisplayOptions(ws);
    if (!opts.showAssets) return [];
    return workspaceAssetEntries(ws).filter((asset) => assetMatchesSearch(asset, ws.discoverySearch || ''));
  }

  function assetCardHtml(ws, asset) {
    const path = normalizeAssetPath(asset.path || asset.name || 'asset');
    const kind = assetKind(asset);
    const size = assetSizeLabel(asset.size);
    const previewable = kind === 'image' || kind === 'text';
    return `<article class="lineage-post asset-post" data-asset="${escapeAttr(path)}">
      <div class="post-main asset-main">
        <div class="post-chips">
          <span class="badge-soft muted-chip"><i class="fa-solid fa-box-archive"></i>asset</span>
          <span class="badge-soft muted-chip">${escapeHtml(kind)}</span>
          ${size ? `<span class="badge-soft muted-chip">${escapeHtml(size)}</span>` : ''}
          ${asset.source ? `<span class="badge-soft muted-chip">${escapeHtml(asset.source)}</span>` : ''}
        </div>
        <h3 class="post-title"><i class="fa-solid ${assetIcon(asset)}"></i>${escapeHtml(assetDisplayName(asset))}</h3>
        <p class="post-summary">${escapeHtml(path)}</p>
      </div>
      <div class="post-actions asset-actions">
        ${previewable ? `<button class="icon-action" data-action="open-asset-preview" data-ws="${escapeAttr(ws.id)}" data-asset="${escapeAttr(path)}" title="Preview asset"><i class="fa-regular fa-window-maximize"></i><span>Open</span></button>` : ''}
        <button class="icon-action" data-action="download-asset" data-ws="${escapeAttr(ws.id)}" data-asset="${escapeAttr(path)}" title="Download asset"><i class="fa-solid fa-download"></i><span>Download</span></button>
        <button class="icon-action danger-action" data-action="remove-asset" data-ws="${escapeAttr(ws.id)}" data-asset="${escapeAttr(path)}" title="Remove asset"><i class="fa-regular fa-trash-can"></i><span>Remove</span></button>
      </div>
    </article>`;
  }

  function hiddenAssetNotice(ws) {
    const assets = workspaceAssetEntries(ws);
    const opts = workspaceDisplayOptions(ws);
    if (!assets.length || opts.showAssets) return '';
    if (ws.nodes?.length) return '';
    return `<div class="asset-hidden-notice">
      <i class="fa-solid fa-box-archive"></i>
      <span>${assets.length} asset${assets.length === 1 ? '' : 's'} imported but hidden.</span>
      <button class="tv-btn tiny subtle" data-action="enable-assets-display" data-ws="${escapeAttr(ws.id)}">Show assets</button>
    </div>`;
  }

  function assetSectionHtml(ws) {
    const assets = visibleAssets(ws);
    if (!assets.length) return hiddenAssetNotice(ws);
    return `<div class="asset-section">
      <div class="feed-section-title asset-section-title"><span>Assets</span><span>${assets.length}</span></div>
      ${assets.map((asset) => assetCardHtml(ws, asset)).join('')}
    </div>`;
  }
  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWithAssets(ws, selected, next) {
    const html = next(ws, selected);
    if (selected) return html;
    const assetHtml = assetSectionHtml(ws);
    if (!assetHtml) return html;
    return html.replace(/\s*<\/div>\s*$/, `${assetHtml}</div>`);
  });



  function assetByPath(ws, path) {
    const clean = normalizeAssetPath(path || '');
    return ws?.assets?.get?.(clean)
      || Array.from(ws?.assets?.values?.() || []).find((asset) => sameImportedPath(asset.path || asset.name || '', clean));
  }

  function renderAssetPreviewModal(modal) {
    const ws = getWorkspace(modal.wsId);
    const asset = assetByPath(ws, modal.assetPath);
    if (!ws || !asset) return '';
    const kind = assetKind(asset);
    const path = normalizeAssetPath(asset.path || asset.name || 'asset');
    const url = assetObjectUrl(ws, asset);
    const isText = kind === 'text';
    const isImage = kind === 'image';
    const text = typeof asset.content === 'string' ? asset.content : '';
    const displayName = assetDisplayName(asset);
    const previewTitle = displayName === 'relative' ? 'Attachment preview' : displayName;
    return `<div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true" aria-labelledby="asset-preview-title">
      <div class="modal-panel read-modal-panel asset-preview-panel">
        <div class="modal-header-lite sticky-modal-head">
          <div>
            <p class="kicker">Asset</p>
            <h2 class="modal-title-lite" id="asset-preview-title"><i class="fa-solid ${assetIcon(asset)}"></i>${escapeHtml(previewTitle)}</h2>
            <p class="text-secondary mb-0">${escapeHtml(path)}</p>
          </div>
          <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-read-body asset-preview-body">
          ${isImage ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(assetDisplayName(asset))}" data-attachment-preview>` : ''}
          ${isText ? `<pre class="source-block modal-source"><code>${escapeHtml(text || 'Text preview unavailable for this imported asset.')}</code></pre>` : ''}
          ${!isImage && !isText ? `<div class="empty-state">Preview unavailable for this asset type. Use Download instead.</div>` : ''}
        </div>
        <div class="modal-footer-actions">
          <button class="tv-btn subtle" data-action="download-asset" data-ws="${escapeAttr(ws.id)}" data-asset="${escapeAttr(path)}"><i class="fa-solid fa-download"></i>Download</button>
          <button class="tv-btn subtle" data-action="close-modal">Close</button>
        </div>
      </div>
    </div>`;
  }
  registerRenderModalWrapper(function renderModalWithAssets(modal, next) {
    if (modal?.type === 'asset-preview') return renderAssetPreviewModal(modal);
    return next(modal);
  });
  registerActionHandler(async function assetActions(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'enable-assets-display') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      workspaceDisplayOptions(ws).showAssets = true;
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      return;
    }

    if (action === 'open-asset-preview') {
      event.preventDefault();
      event.stopPropagation();
      app.modal = {
        type: 'asset-preview',
        wsId: event.currentTarget.dataset.ws || '',
        assetPath: event.currentTarget.dataset.asset || ''
      };
      render();
      return;
    }

    if (action === 'download-asset') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || app.modal?.wsId || '');
      const asset = assetByPath(ws, event.currentTarget.dataset.asset || app.modal?.assetPath || '');
      if (!asset) return toast('Asset not found.', 'warn');
      const blob = asset.blob || new Blob([asset.content || ''], { type: asset.type || 'application/octet-stream' });
      downloadBlob(assetDisplayName(asset), blob);
      return;
    }

    if (action === 'remove-asset') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const path = normalizeAssetPath(event.currentTarget.dataset.asset || '');
      if (!ws || !path) return;
      ws.assets?.delete?.(path);
      if (ws.assetUrls?.has?.(path)) {
        try { URL.revokeObjectURL(ws.assetUrls.get(path)); } catch (_) {}
        ws.assetUrls.delete(path);
      }
      if (typeof scheduleLocalStateSave === 'function') scheduleLocalStateSave();
      render();
      return;
    }

    return next(event);
  });
  registerRouteStateWrapper(function routeStateWithDisplayAssets(next) {
    const state = next();
    if (state && Array.isArray(state.sources)) {
      state.sources.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (ws?.displayOptions) source.displayOptions = Object.assign({}, ws.displayOptions);
      });
    }
    return state;
  });
  registerViewRouteStateWrapper(function viewRouteStateWithDisplayAssets(next) {
    const state = next();
    if (state && Array.isArray(state.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (ws?.displayOptions) source.displayOptions = Object.assign({}, ws.displayOptions);
      });
    }
    return state;
  });
  registerApplyViewStateToWorkspaceWrapper(function applyViewStateWithDisplayAssets(ws, source, next) {
    next(ws, source);
    if (source?.displayOptions) ws.displayOptions = Object.assign({}, ws.displayOptions || {}, source.displayOptions);
  });
  registerApplyViewRouteStateWrapper(function applyViewRouteStateWithDisplayAssets(state, next) {
    const ok = next(state);
    if (ok && Array.isArray(state?.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (ws && source?.displayOptions) ws.displayOptions = Object.assign({}, ws.displayOptions || {}, source.displayOptions);
      });
    }
    return ok;
  });




  app.settings = Object.assign({
    repoDiscoveryFetchConcurrency: 6,
    repoDiscoveryBatchRenderEvery: 0,
    discoveryFeedInitialCount: 48,
    discoveryFeedGrowCount: 48,
    discoveryFeedAutoGrowMinPx: 240,
    discoveryFeedAutoGrowMaxPx: 720,
    discoveryFeedAutoGrowViewportRatio: 0.65
  }, app.settings || {});

  function microYield() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function discoveryWindowSignature(ws) {
    return [
      ws?.discoveryView || 'feed',
      ws?.discoveryFilterSchema || ws?.filterSchema || 'all',
      ws?.discoverySearch || '',
      workspaceDisplayOptions(ws).leavesOnly ? 'leaf' : 'all',
      workspaceDisplayOptions(ws).showTrace ? 'trace' : '',
      workspaceDisplayOptions(ws).showSchema ? 'schema' : '',
      workspaceDisplayOptions(ws).showWorkspace ? 'workspace' : '',
      workspaceDisplayOptions(ws).showAssets ? 'assets' : ''
    ].join('|');
  }

  function discoveryVisibleCount(ws) {
    const sig = discoveryWindowSignature(ws);
    if (ws.discoveryWindowSig !== sig) {
      ws.discoveryWindowSig = sig;
      ws.discoveryVisibleCount = Number(app.settings.discoveryFeedInitialCount || 48);
    }
    return Math.max(8, Number(ws.discoveryVisibleCount || app.settings.discoveryFeedInitialCount || 48));
  }

  registerFilteredDiscoveryNodesWrapper(function filteredDiscoveryNodesWithWindow(ws, next) {
    const nodes = next(ws);
    const context = app.discoveryWindowContext;
    if (!context || context.wsId !== ws?.id) return nodes;
    if ((ws.discoveryView || 'feed') !== 'feed') return nodes;
    return nodes.slice(0, context.limit);
  });

  function discoveryLoadMoreFooter(ws, total, shown) {
    if (shown >= total) return '';
    const remaining = total - shown;
    return `<div class="lineage-loader discovery-window-loader">
      <button class="tv-btn small" data-action="load-more-discovery" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-arrow-down"></i>Show more</button>
      <span>${shown} / ${total} shown · ${remaining} more</span>
    </div>`;
  }

  function loadingProgressNotice(ws) {
    if (!ws?.loading) return '';
    const pct = discoveryProgressPercent(ws);
    return `<div class="loading-progress" data-discovery-progress="${escapeAttr(ws.id)}" data-progress="${pct}">
      <div class="progress-head">
        <span><i class="fa-solid fa-spinner fa-spin"></i>${escapeHtml(discoveryProgressTitle(ws))}</span>
        <small data-progress-label>${pct}%</small>
      </div>
      <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <span class="progress-fill" data-progress-fill style="width:${pct}%"></span>
      </div>
    </div>`;
  }
  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWindowed(ws, selected, next) {
    if (selected || (ws.discoveryView || 'feed') !== 'feed') {
      const html = next(ws, selected);
      if (!selected && ws?.loading && html.includes('<div class="post-feed')) {
        return html.replace('<div class="post-feed', `${loadingProgressNotice(ws)}<div class="post-feed`);
      }
      return html;
    }

    const all = filteredDiscoveryNodes(ws);
    const limit = discoveryVisibleCount(ws);
    app.discoveryWindowContext = { wsId: ws.id, limit };
    let html = next(ws, selected);
    app.discoveryWindowContext = null;

    const shown = Math.min(limit, all.length);
    const footer = discoveryLoadMoreFooter(ws, all.length, shown);
    if (footer) html = html.replace(/\s*<\/div>\s*$/, `${footer}</div>`);
    if (ws.loading && html.includes('<div class="post-feed')) {
      html = html.replace('<div class="post-feed', `${loadingProgressNotice(ws)}<div class="post-feed`);
    }
    return html;
  });
  function discoveryWindowTotals(ws) {
    let all = [];
    try { all = filteredDiscoveryNodes(ws) || []; } catch (_) { all = ws?.nodes || []; }
    return { all, total: Array.isArray(all) ? all.length : 0 };
  }

  function growDiscoveryWindow(ws, reason = 'manual') {
    if (!ws || (ws.discoveryView || 'feed') !== 'feed') return false;
    const beforeVisibleCount = discoveryVisibleCount(ws);
    const total = discoveryWindowTotals(ws).total;
    if (beforeVisibleCount >= total) return false;
    const growCount = Math.max(8, Number(app.settings.discoveryFeedGrowCount || 48));
    const afterVisibleCount = Math.min(total, beforeVisibleCount + growCount);
    if (afterVisibleCount <= beforeVisibleCount) return false;

    scrollFlightRecord(`more:discovery-${reason}-before`, {
      beforeVisibleCount,
      afterVisibleCount,
      growCount,
      total,
      workspace: scrollRestoreDebugWorkspaceState(ws),
      feed: scrollRestoreDebugTargetState(scrollElementForRole(ws, 'post-feed.discovery', 'discovery'))
    });
    ws.discoveryVisibleCount = afterVisibleCount;
    ws.discoveryWindowSig = discoveryWindowSignature(ws);
    scrollFlightRecord(`more:discovery-${reason}-after-state`, {
      beforeVisibleCount,
      afterVisibleCount: ws.discoveryVisibleCount,
      total,
      workspace: scrollRestoreDebugWorkspaceState(ws)
    });
    render();
    return true;
  }

  registerActionHandler(async function discoveryWindowAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'load-more-discovery') {
      event.preventDefault();
      event.stopPropagation();
      growDiscoveryWindow(getWorkspace(event.currentTarget.dataset.ws || ''), 'manual');
      return;
    }
    return next(event);
  });

  const discoveryAutoMoreState = new WeakMap();

  function discoveryAutoMoreThreshold(feed) {
    const minPx = Math.max(80, Number(app.settings.discoveryFeedAutoGrowMinPx || 240));
    const maxPx = Math.max(minPx, Number(app.settings.discoveryFeedAutoGrowMaxPx || 720));
    const ratio = Number(app.settings.discoveryFeedAutoGrowViewportRatio || 0.65);
    const byViewport = Math.round(Math.max(0, feed?.clientHeight || 0) * Math.max(0.1, ratio));
    return Math.min(maxPx, Math.max(minPx, byViewport));
  }

  function discoveryAutoMoreFeedFromTarget(target) {
    if (!target) return null;
    if (target.classList?.contains('post-feed') && target.classList?.contains('discovery')) return target;
    return target.closest?.('.post-feed.discovery[data-ws]') || null;
  }

  function maybeAutoGrowDiscoveryWindow(feed, reason = 'scroll') {
    if (!feed || app.restoringStoredScroll) return false;
    const ws = getWorkspace(feed.dataset?.ws || '');
    if (!ws || (ws.discoveryView || 'feed') !== 'feed') return false;
    const beforeVisibleCount = discoveryVisibleCount(ws);
    const total = discoveryWindowTotals(ws).total;
    if (beforeVisibleCount >= total) return false;

    const distanceToEnd = Math.max(0, Math.round((feed.scrollHeight || 0) - (feed.clientHeight || 0) - (feed.scrollTop || 0)));
    const threshold = discoveryAutoMoreThreshold(feed);
    if (distanceToEnd > threshold) return false;

    const now = Date.now();
    const last = discoveryAutoMoreState.get(feed);
    if (last && last.visibleCount === beforeVisibleCount && now - last.at < 350) return false;
    discoveryAutoMoreState.set(feed, { visibleCount: beforeVisibleCount, at: now });

    scrollFlightRecord('more:discovery-auto-threshold', {
      beforeVisibleCount,
      total,
      distanceToEnd,
      threshold,
      workspace: scrollRestoreDebugWorkspaceState(ws),
      feed: scrollRestoreDebugTargetState(feed)
    });
    return growDiscoveryWindow(ws, reason);
  }

  function onDiscoveryAutoMoreScroll(event) {
    const feed = discoveryAutoMoreFeedFromTarget(event.target);
    if (!feed) return;
    maybeAutoGrowDiscoveryWindow(feed, 'auto-scroll');
  }

  document.addEventListener('scroll', onDiscoveryAutoMoreScroll, true);

  async function discoverGitHubRepoIntoWorkspaceResponsive(ws, options) {
    const repo = options.repo;
    const ref = options.ref || '';
    const rootPaths = Array.isArray(options.rootPaths) ? options.rootPaths : parseRootPaths(options.rootPath || '.topics');
    const key = repoDiscoveryKey(repo, ref, rootPaths);

    if (ws.discoverySource?.kind === 'github-tree'
      && repoDiscoveryKey(ws.discoverySource.repo, ws.discoverySource.ref || '', ws.discoverySource.rootPaths || ws.discoverySource.rootPath || '.topics') === key
      && ws.nodes.length) {
      toast(`${ws.label} already has discovery results for ${key}.`, 'warn');
      return;
    }

    if (app.repoDiscoveryInFlight?.has?.(key)) {
      toast(`Discovery already running for ${key}.`, 'warn');
      return;
    }

    app.repoDiscoveryInFlight = app.repoDiscoveryInFlight || new Set();
    app.repoDiscoveryInFlight.add(key);
    ws.loading = true;
    ws.repo = repo;
    if (ref) ws.ref = ref;
    ws.discoverySource = { kind: 'github-tree', repo, ref: ref || '', rootPath: rootPaths[0] || '.topics', rootPaths };
    ws.sourceNote = `GitHub repo discovery: ${repo}${ref ? '@' + ref : ''} / ${rootPathsLabel(rootPaths)}`;
    ws.discoveryProgress = { phase: 'tree', loaded: 0, total: 0, failed: 0 };
    ws.logs.push(`Discovering ${repo}${ref ? '@' + ref : ''} under ${rootPaths.join(', ')} via GitHub tree API.`);
    render();
    await microYield();

    let count = 0;
    let failed = 0;

    try {
      const discovery = await discoverGitHubTracePaths(repo, ref, rootPaths);
      ws.repo = repo;
      ws.ref = discovery.ref;
      ws.discoverySource.ref = discovery.ref;
      ws.discoverySource.rootPath = discovery.rootPath;
      ws.discoverySource.rootPaths = discovery.rootPaths;
      ws.logs.push(`Tree discovery found ${discovery.tracePaths.length} .trace.md file(s).`);
      if (discovery.truncated) {
        ws.logs.push('GitHub tree response was truncated. Results may be incomplete; use a manifest for this repo.');
        toast(`Tree response for ${repo} was truncated; discovery may be incomplete.`, 'warn');
      }

      const paths = discovery.tracePaths.filter((path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        return !Array.from(ws.files.values()).some((file) => file.rawUrl === rawUrl || file.path === path);
      });

      ws.discoveryProgress = { phase: 'fetch', loaded: 0, total: paths.length, failed: 0 };
      requestBufferedRender('repo-discovery-start', 60);
      await microYield();

      const concurrency = Math.max(1, Number(app.settings.repoDiscoveryFetchConcurrency || 6));
      const batchEvery = Math.max(0, Number(app.settings.repoDiscoveryBatchRenderEvery || 0));
      const batchDelay = 120;

      await runWithConcurrency(paths, concurrency, async (path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        try {
          const content = await fetchText(rawUrl);
          addFileToWorkspace(ws, {
            path,
            content,
            rawUrl,
            browseUrl: githubBrowseUrl(repo, discovery.ref, path),
            repo,
            ref: discovery.ref
          });
          count += 1;
          ws.discoveryProgress.loaded = count;
          if (batchEvery > 0 && count % batchEvery === 0) {
            computeWorkspaceIndex(ws);
            requestBufferedRender('repo-discovery-batch', batchDelay);
            await microYield();
          }
        } catch (error) {
          failed += 1;
          ws.discoveryProgress.failed = failed;
          ws.logs.push(`Could not fetch discovered trace ${path}: ${error.message}`);
        }
      });

      ws.discoveryProgress.phase = 'index';
      await microYield();
      computeWorkspaceIndex(ws);
      await microYield();
      await discoverWorkspacePolicy(ws);

      if (!count && !failed) toast(`No new trace files loaded from ${repo}.`, 'warn');
      if (failed) toast(`${failed} trace file(s) could not be fetched from ${repo}.`, 'warn');
    } catch (error) {
      ws.logs.push(`Repo discovery failed for ${repo}: ${error.message}`);
      toast(`Repo discovery failed for ${repo}: ${error.message}`, 'warn');
    } finally {
      app.repoDiscoveryInFlight.delete(key);
      ws.loading = false;
      ws.discoveryProgress = null;
      computeWorkspaceIndex(ws);
      render();
    }
  }

  discoverGitHubRepoIntoWorkspace = discoverGitHubRepoIntoWorkspaceResponsive;




  function discoveryProgressPercent(ws) {
    const p = ws?.discoveryProgress || {};
    const total = Math.max(0, Number(p.total || 0));
    const loaded = Math.max(0, Number(p.loaded || 0));
    const failed = Math.max(0, Number(p.failed || 0));
    if (!total) return p.phase === 'tree' ? 5 : 0;
    return Math.max(2, Math.min(100, Math.round(((loaded + failed) / total) * 100)));
  }

  function discoveryProgressTitle(ws) {
    const p = ws?.discoveryProgress || {};
    const total = Math.max(0, Number(p.total || 0));
    const loaded = Math.max(0, Number(p.loaded || 0));
    const failed = Math.max(0, Number(p.failed || 0));
    if (p.phase === 'tree') return 'Discovering file list';
    if (p.phase === 'index') return 'Indexing workspace';
    if (!total) return 'Loading';
    return `${loaded + failed}/${total}`;
  }

  function updateDiscoveryProgressDom(ws) {
    if (!ws) return;
    const el = document.querySelector(`[data-discovery-progress="${CSS.escape(ws.id)}"]`);
    if (!el) return;
    const pct = discoveryProgressPercent(ws);
    const label = el.querySelector('[data-progress-label]');
    const fill = el.querySelector('[data-progress-fill]');
    const head = el.querySelector('.progress-head span');
    const bar = el.querySelector('[role="progressbar"]');
    el.dataset.progress = String(pct);
    if (label) label.textContent = `${pct}%`;
    if (fill) fill.style.width = `${pct}%`;
    if (head) head.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>${escapeHtml(discoveryProgressTitle(ws))}`;
    if (bar) bar.setAttribute('aria-valuenow', String(pct));
  }

  function progressYield(ws) {
    updateDiscoveryProgressDom(ws);
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function discoverGitHubRepoIntoWorkspaceProgress(ws, options) {
    const repo = options.repo;
    const ref = options.ref || '';
    const rootPaths = Array.isArray(options.rootPaths) ? options.rootPaths : parseRootPaths(options.rootPath || '.topics');
    const key = repoDiscoveryKey(repo, ref, rootPaths);

    if (ws.discoverySource?.kind === 'github-tree'
      && repoDiscoveryKey(ws.discoverySource.repo, ws.discoverySource.ref || '', ws.discoverySource.rootPaths || ws.discoverySource.rootPath || '.topics') === key
      && ws.nodes.length) {
      toast(`${ws.label} already has discovery results for ${key}.`, 'warn');
      return;
    }

    if (app.repoDiscoveryInFlight?.has?.(key)) {
      toast(`Discovery already running for ${key}.`, 'warn');
      return;
    }

    app.repoDiscoveryInFlight = app.repoDiscoveryInFlight || new Set();
    app.repoDiscoveryInFlight.add(key);
    ws.loading = true;
    ws.repo = repo;
    if (ref) ws.ref = ref;
    ws.discoverySource = { kind: 'github-tree', repo, ref: ref || '', rootPath: rootPaths[0] || '.topics', rootPaths };
    ws.sourceNote = `GitHub repo discovery: ${repo}${ref ? '@' + ref : ''} / ${rootPathsLabel(rootPaths)}`;
    ws.discoveryProgress = { phase: 'tree', loaded: 0, total: 0, failed: 0 };
    ws.logs.push(`Discovering ${repo}${ref ? '@' + ref : ''} under ${rootPaths.join(', ')} via GitHub tree API.`);
    render();
    await progressYield(ws);

    let count = 0;
    let failed = 0;

    try {
      const discovery = await discoverGitHubTracePaths(repo, ref, rootPaths);
      ws.repo = repo;
      ws.ref = discovery.ref;
      ws.discoverySource.ref = discovery.ref;
      ws.discoverySource.rootPath = discovery.rootPath;
      ws.discoverySource.rootPaths = discovery.rootPaths;
      ws.logs.push(`Tree discovery found ${discovery.tracePaths.length} .trace.md file(s).`);
      if (discovery.truncated) {
        ws.logs.push('GitHub tree response was truncated. Results may be incomplete; use a manifest for this repo.');
        toast(`Tree response for ${repo} was truncated; discovery may be incomplete.`, 'warn');
      }

      const paths = discovery.tracePaths.filter((path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        return !Array.from(ws.files.values()).some((file) => file.rawUrl === rawUrl || file.path === path);
      });

      ws.discoveryProgress = { phase: 'fetch', loaded: 0, total: paths.length, failed: 0 };
      render();
      await progressYield(ws);

      const concurrency = Math.max(1, Number(app.settings.repoDiscoveryFetchConcurrency || 6));
      const progressEvery = Math.max(1, Number(app.settings.repoDiscoveryProgressEvery || 1));

      await runWithConcurrency(paths, concurrency, async (path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        try {
          const content = await fetchText(rawUrl);
          addFileToWorkspace(ws, {
            path,
            content,
            rawUrl,
            browseUrl: githubBrowseUrl(repo, discovery.ref, path),
            repo,
            ref: discovery.ref
          });
          count += 1;
          ws.discoveryProgress.loaded = count;
        } catch (error) {
          failed += 1;
          ws.discoveryProgress.failed = failed;
          ws.logs.push(`Could not fetch discovered trace ${path}: ${error.message}`);
        }

        if (((count + failed) % progressEvery) === 0) {
          await progressYield(ws);
        }
      });

      ws.discoveryProgress.phase = 'index';
      updateDiscoveryProgressDom(ws);
      await progressYield(ws);

      computeWorkspaceIndex(ws);
      await progressYield(ws);
      await discoverWorkspacePolicy(ws);

      if (!count && !failed) toast(`No new trace files loaded from ${repo}.`, 'warn');
      if (failed) toast(`${failed} trace file(s) could not be fetched from ${repo}.`, 'warn');
    } catch (error) {
      ws.logs.push(`Repo discovery failed for ${repo}: ${error.message}`);
      toast(`Repo discovery failed for ${repo}: ${error.message}`, 'warn');
    } finally {
      app.repoDiscoveryInFlight.delete(key);
      ws.loading = false;
      ws.discoveryProgress = null;
      computeWorkspaceIndex(ws);
      render();
    }
  }

  discoverGitHubRepoIntoWorkspace = discoverGitHubRepoIntoWorkspaceProgress;




  function nodeMaterialRefs(ws, node) {
    if (!ws || !node || typeof extractMaterialRefs !== 'function') return [];
    try {
      return extractMaterialRefs(ws, node) || [];
    } catch (_) {
      return [];
    }
  }

  function materialKindKey(ref) {
    const kind = String(ref?.kind || 'file').toLowerCase();
    if (kind === 'markdown') return 'text';
    if (kind === 'image') return 'image';
    if (kind === 'trace') return 'trace';
    if (kind === 'text') return 'text';
    if (kind === 'url' || kind === 'link') return 'url';
    return kind || 'file';
  }

  function attachmentPreviewMaterialKindLabel(kind) {
    if (typeof materialKindLabel === 'function') return materialKindLabel(kind);
    const labels = { all: 'All', image: 'Images', trace: 'Traces', text: 'Text', url: 'URLs', file: 'Files' };
    return labels[kind] || String(kind || 'file').replace(/[-_]+/g, ' ');
  }

  function previewMaterialActive(ws) {
    return Boolean(ws?.previewMaterialMode);
  }


  function nodeHasPreviewMaterial(ws, node) {
    return materialRefsForPreview(ws, node).length > 0;
  }

  function previewMaterialKindsForWorkspace(ws) {
    const counts = new Map();
    for (const node of ws?.nodes || []) {
      for (const ref of nodeMaterialRefs(ws, node)) {
        const kind = materialKindKey(ref);
        counts.set(kind, (counts.get(kind) || 0) + 1);
      }
    }
    const order = ['image', 'trace', 'text', 'url', 'file'];
    return Array.from(counts.entries())
      .sort((a, b) => {
        const ai = order.indexOf(a[0]); const bi = order.indexOf(b[0]);
        if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
        return a[0].localeCompare(b[0]);
      })
      .map(([kind, count]) => ({ kind, count }));
  }

  function renderPreviewToggle(ws) {
    const active = previewMaterialActive(ws);
    return `<button class="tree-all-toggle preview-toggle ${active ? 'active' : ''}" data-action="toggle-material-preview" data-ws="${escapeAttr(ws.id)}" title="${active ? 'Show regular feed' : 'Preview referenced material'}" aria-label="${active ? 'Show regular feed' : 'Preview referenced material'}">
      <i class="fa-solid ${active ? 'fa-eye' : 'fa-images'}"></i>
    </button>`;
  }

  function renderPreviewMaterialSection(ws, node) {
    const refs = materialRefsForPreview(ws, node);
    if (!refs.length) return '';
    const groups = typeof groupMaterialRefs === 'function' ? groupMaterialRefs(refs) : [{ kind: 'material', items: refs }];
    const summary = typeof materialSummary === 'function' ? materialSummary(refs).join(' · ') : `${refs.length} refs`;
    return `<section class="material-section full preview-material-section">
      <div class="material-head">
        <h4><i class="fa-solid fa-paperclip"></i>Preview material</h4>
        <span class="material-count">${escapeHtml(summary || 'references')}</span>
      </div>
      <div class="material-groups">
        ${groups.map((group) => `
          <div class="material-group">
            <div class="material-group-title">${escapeHtml(attachmentPreviewMaterialKindLabel(group.kind))}</div>
            <div class="material-items">
              ${group.items.map((ref) => typeof renderMaterialItem === 'function' ? renderMaterialItem(ws, node, ref, false) : `<div class="material-item">${escapeHtml(ref.path || ref.href || ref.label || 'material')}</div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </section>`;
  }

  registerFilteredDiscoveryNodesWrapper(function filteredDiscoveryNodesWithPreview(ws, next) {
    const nodes = next(ws);
    if (!previewMaterialActive(ws)) return nodes;
    if ((ws?.discoveryView || 'feed') !== 'feed') return nodes;
    return nodes.filter((node) => nodeHasPreviewMaterial(ws, node));
  });
  registerRenderNodePostWrapper(function renderNodePostWithPreviewMaterial(ws, node, options = {}, next) {
    let html = next(ws, node, options);
    if (!previewMaterialActive(ws) || options.lineage) return html;
    if ((ws?.discoveryView || 'feed') !== 'feed') return html;
    const material = renderPreviewMaterialSection(ws, node);
    if (!material) return html;
    html = html.replace('class="lineage-post ', 'class="lineage-post preview-post ');
    const insertAfterMain = html.indexOf('</div>');
    if (insertAfterMain < 0) return html;
    return html.slice(0, insertAfterMain + 6) + material + html.slice(insertAfterMain + 6);
  });
  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWithPreviewMode(ws, selected, next) {
    let html = next(ws, selected);
    if (selected || (ws?.discoveryView || 'feed') !== 'feed') return html;

    const toggle = renderPreviewToggle(ws);
    html = html.replace(/(<div class="discovery-tools[^"]*">)\s*/m, `$1\n            ${toggle}\n            `);

    if (previewMaterialActive(ws)) {
      html = html.replace('<div class="post-feed', `${renderPreviewFilterBar(ws)}<div class="post-feed preview-feed`);
      if (html.includes('<div class="empty-state">No nodes match this view.</div>')) {
        const label = previewMaterialKind(ws) === 'all' ? 'attachments' : attachmentPreviewMaterialKindLabel(previewMaterialKind(ws)).toLowerCase();
        html = html.replace('<div class="empty-state">No nodes match this view.</div>', `<div class="empty-state">No cards with ${escapeHtml(label)} match this view.</div>`);
      }
    }

    return html;
  });
  registerActionHandler(async function previewModeAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'toggle-material-preview') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      ws.discoveryView = 'feed';
      ws.previewMaterialMode = !ws.previewMaterialMode;
      if (!ws.previewMaterialKind) ws.previewMaterialKind = 'all';
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      return;
    }

    if (action === 'set-material-preview-kind') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      ws.previewMaterialKind = event.currentTarget.dataset.kind || 'all';
      ws.previewMaterialMode = true;
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      return;
    }

    return next(event);
  });
  registerRouteStateWrapper(function routeStateWithPreviewMode(next) {
    const state = next();
    if (state && Array.isArray(state.sources)) {
      state.sources.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (!ws) return;
        source.previewMaterialMode = Boolean(ws.previewMaterialMode);
        source.previewMaterialKind = ws.previewMaterialKind || 'all';
      });
    }
    return state;
  });
  registerViewRouteStateWrapper(function viewRouteStateWithPreviewMode(next) {
    const state = next();
    if (state && Array.isArray(state.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (!ws) return;
        source.previewMaterialMode = Boolean(ws.previewMaterialMode);
        source.previewMaterialKind = ws.previewMaterialKind || 'all';
      });
    }
    return state;
  });
  registerApplyViewStateToWorkspaceWrapper(function applyViewStateWithPreviewMode(ws, source, next) {
    next(ws, source);
    if (!ws || !source) return;
    ws.previewMaterialMode = Boolean(source.previewMaterialMode);
    ws.previewMaterialKind = source.previewMaterialKind || 'all';
  });
  registerApplyViewRouteStateWrapper(function applyViewRouteStateWithPreviewMode(state, next) {
    const ok = next(state);
    if (ok && Array.isArray(state?.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (!ws || !source) return;
        ws.previewMaterialMode = Boolean(source.previewMaterialMode);
        ws.previewMaterialKind = source.previewMaterialKind || 'all';
      });
    }
    return ok;
  });




  function previewMaterialKindSet(ws) {
    if (!ws) return new Set();
    if (Array.isArray(ws.previewMaterialKinds)) return new Set(ws.previewMaterialKinds.filter(Boolean));
    const single = ws.previewMaterialKind || 'all';
    return single && single !== 'all' ? new Set(String(single).split(',').filter(Boolean)) : new Set();
  }

  function previewMaterialKind(ws) {
    const set = previewMaterialKindSet(ws);
    return set.size ? Array.from(set).join(',') : 'all';
  }

  function previewKindMatches(ws, ref) {
    const set = previewMaterialKindSet(ws);
    return !set.size || set.has(materialKindKey(ref));
  }

  function materialRefsForPreview(ws, node) {
    return nodeMaterialRefs(ws, node).filter((ref) => previewKindMatches(ws, ref));
  }
  registerRenderNodePostWrapper(function renderNodePostWithPreviewLineage(ws, node, options = {}, next) {
    let html = next(ws, node, options);
    if (!previewMaterialActive(ws)) return html;
    if ((ws?.discoveryView || 'feed') !== 'feed' && !options.lineage) return html;

    const material = renderPreviewMaterialSection(ws, node);
    if (!material) return html;

    if (!html.includes('preview-post')) {
      html = html.replace('class="lineage-post ', 'class="lineage-post preview-post ');
    }

    const firstClose = html.indexOf('</div>');
    if (firstClose < 0 || html.includes('preview-material-section')) return html;
    return html.slice(0, firstClose + 6) + material + html.slice(firstClose + 6);
  });
  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWithPreviewLineage(ws, selected, next) {
    let html = next(ws, selected);
    if (!ws) return html;

    if (selected) {
      const toggle = renderPreviewToggle(ws);
      html = html.replace(/(<div class="lineage-search-wrap">)\s*/m, `$1\n            ${toggle}\n            `);
      if (previewMaterialActive(ws)) {
        html = html.replace('<div class="post-feed lineage', `${renderPreviewFilterBar(ws)}<div class="post-feed lineage preview-feed`);
      }
    }

    return html;
  });
  registerActionHandler(async function previewMultiAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'set-material-preview-kind') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      const kind = event.currentTarget.dataset.kind || 'all';
      ws.previewMaterialMode = true;
      ws.previewMaterialKinds = kind === 'all' ? [] : [kind];
      ws.previewMaterialKind = kind;
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      return;
    }

    if (action === 'toggle-material-preview-kind') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      const kind = event.currentTarget.dataset.kind || '';
      const set = previewMaterialKindSet(ws);
      if (set.has(kind)) set.delete(kind);
      else set.add(kind);
      ws.previewMaterialMode = true;
      ws.previewMaterialKinds = Array.from(set);
      ws.previewMaterialKind = ws.previewMaterialKinds.length ? ws.previewMaterialKinds.join(',') : 'all';
      if (typeof setRouteState === 'function') setRouteState('replace');
      render();
      return;
    }

    return next(event);
  });
  registerRouteStateWrapper(function routeStateWithPreviewMulti(next) {
    const state = next();
    const apply = (source, ws) => {
      if (!ws || !source) return;
      source.previewMaterialMode = Boolean(ws.previewMaterialMode);
      source.previewMaterialKind = previewMaterialKind(ws);
      source.previewMaterialKinds = Array.from(previewMaterialKindSet(ws));
    };
    if (state && Array.isArray(state.sources)) state.sources.forEach((source, index) => apply(source, app.workspaces[index]));
    return state;
  });
  registerViewRouteStateWrapper(function viewRouteStateWithPreviewMulti(next) {
    const state = next();
    const apply = (source, ws) => {
      if (!ws || !source) return;
      source.previewMaterialMode = Boolean(ws.previewMaterialMode);
      source.previewMaterialKind = previewMaterialKind(ws);
      source.previewMaterialKinds = Array.from(previewMaterialKindSet(ws));
    };
    if (state && Array.isArray(state.workspaces)) state.workspaces.forEach((source, index) => apply(source, app.workspaces[index]));
    return state;
  });
  registerApplyViewStateToWorkspaceWrapper(function applyViewStateWithPreviewMulti(ws, source, next) {
    next(ws, source);
    if (!ws || !source) return;
    ws.previewMaterialMode = Boolean(source.previewMaterialMode);
    if (Array.isArray(source.previewMaterialKinds)) {
      ws.previewMaterialKinds = source.previewMaterialKinds;
    } else {
      const single = source.previewMaterialKind || 'all';
      ws.previewMaterialKinds = single && single !== 'all' ? String(single).split(',').filter(Boolean) : [];
    }
    ws.previewMaterialKind = ws.previewMaterialKinds.length ? ws.previewMaterialKinds.join(',') : 'all';
  });
  registerApplyViewRouteStateWrapper(function applyViewRouteStateWithPreviewMulti(state, next) {
    const ok = next(state);
    if (ok && Array.isArray(state?.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (!ws || !source) return;
        ws.previewMaterialMode = Boolean(source.previewMaterialMode);
        if (Array.isArray(source.previewMaterialKinds)) {
          ws.previewMaterialKinds = source.previewMaterialKinds;
        } else {
          const single = source.previewMaterialKind || 'all';
          ws.previewMaterialKinds = single && single !== 'all' ? String(single).split(',').filter(Boolean) : [];
        }
        ws.previewMaterialKind = ws.previewMaterialKinds.length ? ws.previewMaterialKinds.join(',') : 'all';
      });
    }
    return ok;
  });




  function previewKindCountMap(ws) {
    const map = new Map();
    for (const item of previewMaterialKindsForWorkspace(ws)) map.set(item.kind, item.count);
    return map;
  }

  function renderPreviewSelectedChips(ws) {
    const counts = previewKindCountMap(ws);
    const total = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
    const active = previewMaterialKindSet(ws);

    if (!active.size) {
      return `<button class="preview-selected-chip active" data-action="set-material-preview-kind" data-ws="${escapeAttr(ws.id)}" data-kind="all" title="Showing all attachment types">
        <span>All</span><small>${total}</small>
      </button>`;
    }

    return Array.from(active).map((kind) => `<button class="preview-selected-chip active removable" data-action="toggle-material-preview-kind" data-ws="${escapeAttr(ws.id)}" data-kind="${escapeAttr(kind)}" title="Remove ${escapeAttr(attachmentPreviewMaterialKindLabel(kind))} filter">
      <span>${escapeHtml(attachmentPreviewMaterialKindLabel(kind))}</span><small>${counts.get(kind) || 0}</small><i class="fa-solid fa-xmark"></i>
    </button>`).join('');
  }

  function renderPreviewAllTypeOptions(ws) {
    const kinds = previewMaterialKindsForWorkspace(ws);
    const total = kinds.reduce((sum, item) => sum + item.count, 0);
    const active = previewMaterialKindSet(ws);
    const allActive = active.size === 0;
    return [
      `<button class="preview-kind-chip ${allActive ? 'active' : ''}" data-action="set-material-preview-kind" data-ws="${escapeAttr(ws.id)}" data-kind="all">
        <span>All</span><small>${total}</small>
      </button>`,
      ...kinds.map((item) => `<button class="preview-kind-chip ${active.has(item.kind) ? 'active' : ''}" data-action="toggle-material-preview-kind" data-ws="${escapeAttr(ws.id)}" data-kind="${escapeAttr(item.kind)}">
        <span>${escapeHtml(attachmentPreviewMaterialKindLabel(item.kind))}</span><small>${item.count}</small>
      </button>`)
    ].join('');
  }

  function renderPreviewFilterBar(ws) {
    if (!previewMaterialActive(ws)) return '';
    const open = Boolean(ws.previewFilterOpen);
    return `<div class="preview-filter-bar ${open ? 'open' : ''}">
      <div class="preview-filter-compact">
        <div class="preview-filter-title"><i class="fa-solid fa-images"></i><span>Preview</span></div>
        <div class="preview-selected-chips">${renderPreviewSelectedChips(ws)}</div>
        <button class="preview-filter-toggle" data-action="toggle-preview-filter-tray" data-ws="${escapeAttr(ws.id)}" title="${open ? 'Hide attachment type filters' : 'Show attachment type filters'}">
          <i class="fa-solid fa-sliders"></i><span>Types</span>
        </button>
      </div>
      ${open ? `<div class="preview-filter-tray">${renderPreviewAllTypeOptions(ws)}</div>` : ''}
    </div>`;
  }
  registerActionHandler(async function previewTrayAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'toggle-preview-filter-tray') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      if (!ws) return;
      ws.previewFilterOpen = !ws.previewFilterOpen;
      render();
      return;
    }
    return next(event);
  });
  registerRouteStateWrapper(function routeStateWithPreviewTray(next) {
    const state = next();
    if (state && Array.isArray(state.sources)) {
      state.sources.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (ws) source.previewFilterOpen = Boolean(ws.previewFilterOpen);
      });
    }
    return state;
  });
  registerViewRouteStateWrapper(function viewRouteStateWithPreviewTray(next) {
    const state = next();
    if (state && Array.isArray(state.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (ws) source.previewFilterOpen = Boolean(ws.previewFilterOpen);
      });
    }
    return state;
  });
  registerApplyViewStateToWorkspaceWrapper(function applyViewStateWithPreviewTray(ws, source, next) {
    next(ws, source);
    if (ws && source) ws.previewFilterOpen = Boolean(source.previewFilterOpen);
  });
  registerApplyViewRouteStateWrapper(function applyViewRouteStateWithPreviewTray(state, next) {
    const ok = next(state);
    if (ok && Array.isArray(state?.workspaces)) {
      state.workspaces.forEach((source, index) => {
        const ws = app.workspaces[index];
        if (ws && source) ws.previewFilterOpen = Boolean(source.previewFilterOpen);
      });
    }
    return ok;
  });




  function mobileChromeWorkspaceFromFeed(el) {
    const feed = el?.closest?.('.post-feed[data-ws]') || (el?.classList?.contains('post-feed') ? el : null);
    return feed ? getWorkspace(feed.dataset.ws || '') : null;
  }

  function setWorkspaceChromeCompact(ws, compact) {
    if (!ws) return;
    if (ws.mobileChromeCompact === compact) return;
    ws.mobileChromeCompact = compact;
    document.querySelectorAll(`.workspace[data-ws="${CSS.escape(ws.id)}"]`).forEach((el) => {
      el.classList.toggle('mobile-chrome-compact', compact);
    });
  }

  function syncMobileChromeCompactDom() {
    if (!window.matchMedia?.('(max-width: 640px)').matches) return;
    for (const ws of app.workspaces || []) {
      document.querySelectorAll(`.workspace[data-ws="${CSS.escape(ws.id)}"]`).forEach((el) => {
        el.classList.toggle('mobile-chrome-compact', Boolean(ws.mobileChromeCompact));
      });
    }
  }

  let lastScrollTop = new WeakMap();
  function onMobileFeedScroll(event) {
    if (!window.matchMedia?.('(max-width: 640px)').matches) return;
    const el = event.target;
    if (!el?.classList?.contains('post-feed')) return;
    const ws = mobileChromeWorkspaceFromFeed(el);
    if (!ws) return;
    const top = Math.max(0, el.scrollTop || 0);
    const prev = lastScrollTop.get(el) || 0;
    lastScrollTop.set(el, top);
    if (top < 24) return setWorkspaceChromeCompact(ws, false);
    if (top > prev + 4) return setWorkspaceChromeCompact(ws, true);
    if (top < prev - 8) return setWorkspaceChromeCompact(ws, false);
  }

  document.addEventListener('scroll', onMobileFeedScroll, true);
  registerRenderWrapper(function renderWithMobileChromeCompression(next) {
    const result = next();
    requestAnimationFrame(syncMobileChromeCompactDom);
    return result;
  });




  function lensCacheKey() {
    return `${STORAGE_KEYS.lensSessionPrefix}${location.pathname}${location.search}`;
  }

  function selectedRouteDescriptor(ws) {
    return TiinexViewState.routeDescriptorFor(selectedNode(ws), ws?.pendingSelectedRoute || null);
  }

  function activeScrollableFeed(ws) {
    if (!ws) return null;
    const selected = selectedNode(ws);
    const id = CSS.escape(ws.id);
    const feed = selected
      ? document.querySelector(`.post-feed.lineage[data-ws="${id}"]`)
      : (document.querySelector(`.post-feed.discovery[data-ws="${id}"]`) || document.querySelector(`.post-feed[data-ws="${id}"]`));
    if (feed && (feed.scrollHeight - feed.clientHeight) > 8) return feed;
    return document.scrollingElement || document.documentElement || document.body || feed;
  }

  function rememberLensScroll(ws, explicitEl = null) {
    if (!ws) return;
    const el = explicitEl || activeScrollableFeed(ws);
    const selected = selectedRouteDescriptor(ws);
    const before = {
      routeScrollTop: Number(ws.routeScrollTop || 0),
      routeScrollMode: ws.routeScrollMode || '',
      routeScrollSelectedPath: ws.routeScrollSelectedPath || ''
    };
    const top = Math.max(0, Math.round((el?.scrollTop ?? ws.routeScrollTop ?? 0) || 0));
    ws.routeScrollTop = top;
    ws.routeScrollMode = selected.mode || 'discovery';
    ws.routeScrollSelectedPath = selected.selectedPath || '';
    scrollFlightRecord('lens:remember-scroll', {
      before,
      after: {
        routeScrollTop: Number(ws.routeScrollTop || 0),
        routeScrollMode: ws.routeScrollMode || '',
        routeScrollSelectedPath: ws.routeScrollSelectedPath || ''
      },
      selected,
      target: scrollRestoreDebugTargetState(el),
      workspace: scrollRestoreDebugWorkspaceState(ws)
    });
  }

  function enhanceLensSource(source, ws) {
    if (!source || !ws) return source;
    rememberLensScroll(ws);
    const selected = selectedRouteDescriptor(ws);
    return TiinexViewState.decorateLensSource(source, selected, {
      top: ws.routeScrollTop,
      mode: ws.routeScrollMode || selected.mode || 'discovery',
      selectedPath: ws.routeScrollSelectedPath || selected.selectedPath || ''
    });
  }
  registerRouteStateWrapper(function routeStateWithDurableLens(next) {
    const state = next();
    if (state && Array.isArray(state.sources)) {
      state.sources.forEach((source, index) => enhanceLensSource(source, app.workspaces[index]));
    }
    return state;
  });
  registerViewRouteStateWrapper(function viewRouteStateWithDurableLens(next) {
    const state = next();
    if (state && Array.isArray(state.workspaces)) {
      state.workspaces.forEach((source, index) => enhanceLensSource(source, app.workspaces[index]));
    }
    return state;
  });

  function applyLensSource(ws, source) {
    if (!ws || !source) return;
    ws.discoveryView = source.discoveryView || ws.discoveryView || 'feed';
    ws.discoveryFilterSchema = source.discoveryFilterSchema || source.filterSchema || ws.discoveryFilterSchema || 'all';
    ws.filterSchema = ws.discoveryFilterSchema;
    ws.discoverySearch = source.discoverySearch || '';
    ws.lineageSearch = source.lineageSearch || '';

    const wantsLineage = source.mode === 'lineage' || Boolean(source.selectedNodeId || source.selectedPath || source.selectedTitle);
    const selected = typeof resolveRouteSelectedNode === 'function'
      ? resolveRouteSelectedNode(ws, source)
      : ((source.selectedPath && ws.nodes?.find?.((node) => node.path === source.selectedPath)) || null);

    if (selected) {
      ws.selectedNodeId = selected.id;
      ws.pendingSelectedRoute = null;
    } else if (wantsLineage) {
      ws.pendingSelectedRoute = {
        selectedNodeId: source.selectedNodeId || '',
        selectedPath: source.selectedPath || '',
        selectedTitle: source.selectedTitle || '',
        mode: 'lineage'
      };
    } else {
      ws.selectedNodeId = null;
      ws.pendingSelectedRoute = null;
    }

    const beforeRouteScroll = {
      routeScrollTop: Number(ws.routeScrollTop || 0),
      routeScrollMode: ws.routeScrollMode || '',
      routeScrollSelectedPath: ws.routeScrollSelectedPath || ''
    };
    ws.routeScrollTop = Number(source.scrollTop || source.feedScrollTop || ws.routeScrollTop || 0) || 0;
    ws.routeScrollMode = source.scrollMode || (wantsLineage ? 'lineage' : 'discovery');
    ws.routeScrollSelectedPath = source.scrollSelectedPath || source.selectedPath || '';
    scrollFlightRecord('lens:apply-source', {
      source: scrollFlightRouteSourceSummary(source),
      wantsLineage,
      selectedResolved: selected ? { id: selected.id || '', path: selected.path || '' } : null,
      beforeRouteScroll,
      afterRouteScroll: {
        routeScrollTop: Number(ws.routeScrollTop || 0),
        routeScrollMode: ws.routeScrollMode || '',
        routeScrollSelectedPath: ws.routeScrollSelectedPath || ''
      },
      workspace: scrollRestoreDebugWorkspaceState(ws)
    });
  }
  registerApplyViewStateToWorkspaceWrapper(function applyViewStateWithDurableLens(ws, source, next) {
    next(ws, source);
    applyLensSource(ws, source);
  });
  registerApplyViewRouteStateWrapper(function applyViewRouteStateWithDurableLens(state, next) {
    const ok = next(state);
    if (ok && Array.isArray(state?.workspaces)) {
      state.workspaces.forEach((source, index) => applyLensSource(app.workspaces[index], source));
    }
    app.pendingDurableLensState = state || null;
    return ok;
  });

  function currentLensState() {
    return staticDiskMode()
      ? viewRouteState()
      : routeState();
  }

  function currentLensUrl(state) {
    return staticDiskMode()
      ? viewRouteUrl(state)
      : routeUrl(state);
  }

  function persistLensState(kind = 'replace') {
    if (app.routing?.restoring || app.isBootingFromUrl || !app.workspaces?.length) {
      scrollFlightRecord('lens:persist-skip', {
        kind,
        reason: app.routing?.restoring ? 'routing-restoring' : (app.isBootingFromUrl ? 'booting-from-url' : 'no-workspaces')
      });
      return;
    }
    const beforeUrl = `${location.pathname}${location.search}${location.hash}`;
    app.workspaces.forEach((ws) => rememberLensScroll(ws));
    const state = currentLensState();
    let cacheWritten = false;
    try { sessionStorage.setItem(lensCacheKey(), JSON.stringify(state)); cacheWritten = true; } catch (_) {}
    try {
      const next = currentLensUrl(state);
      const current = `${location.pathname}${location.search}${location.hash}`;
      const willWriteHistory = next !== current;
      if (willWriteHistory) {
        if (kind === 'push') history.pushState(state, '', next);
        else history.replaceState(state, '', next);
      }
      scrollFlightRecord('lens:persist', {
        kind,
        beforeUrl,
        afterUrl: `${location.pathname}${location.search}${location.hash}`,
        nextUrl: next,
        cacheWritten,
        willWriteHistory,
        state: scrollFlightRouteStateSummary(state),
        snapshot: scrollFlightSnapshot('lens:persist')
      });
    } catch (error) {
      scrollFlightRecord('lens:persist-error', { kind, beforeUrl, message: error?.message || String(error) });
    }
  }

  function cachedLensState() {
    try {
      const raw = sessionStorage.getItem(lensCacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function decodedLensState() {
    return staticDiskMode() ? decodeViewRouteFromHash() : decodeRouteStateFromHash();
  }

  function applyCurrentOrCachedLens() {
    const state = decodedLensState() || cachedLensState();
    if (!state) return false;

    if (state.kind === 'view' || staticDiskMode()) {
      const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
      workspaces.forEach((source, index) => applyLensSource(app.workspaces[index], source));
      const activeIndex = Math.max(0, Math.min(Number(state.activeIndex || 0), app.workspaces.length - 1));
      app.activeWorkspaceId = app.workspaces[activeIndex]?.id || app.workspaces[0]?.id || app.activeWorkspaceId;
      app.pendingDurableLensState = state;
      return true;
    }

    if (Array.isArray(state.sources)) {
      state.sources.forEach((source, index) => applyLensSource(app.workspaces[index], source));
      const activeIndex = Math.max(0, Math.min(Number(state.activeIndex || 0), app.workspaces.length - 1));
      app.activeWorkspaceId = app.workspaces[activeIndex]?.id || app.workspaces[0]?.id || app.activeWorkspaceId;
      app.pendingDurableLensState = state;
      return true;
    }

    return false;
  }

  function chaseScrollForWorkspace(ws, durationMs = 2200) {
    // Retired for F5 restore in CP92; kept only to avoid broad surgery around
    // older wrapper layering. No render path should call this while routeScroll
    // is the single scroll-restore owner.
    if (!ws) return;
    const target = Math.max(0, Math.round(ws.routeScrollTop || 0));
    if (!target) return;
    const started = performance.now();
    let lastMax = -1;
    let stable = 0;

    const tick = () => {
      const el = activeScrollableFeed(ws);
      if (!el) {
        if (performance.now() - started < durationMs) requestAnimationFrame(tick);
        return;
      }
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const nextTop = Math.min(target, maxTop);
      if (maxTop > 0) el.scrollTop = nextTop;

      if (Math.abs(el.scrollTop - target) <= 2) return;
      if (maxTop === lastMax) stable += 1;
      else stable = 0;
      lastMax = maxTop;

      if (performance.now() - started < durationMs && stable < 16) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
    setTimeout(tick, 80);
    setTimeout(tick, 240);
    setTimeout(tick, 650);
    setTimeout(tick, 1400);
  }

  function chaseAllScroll() {
    for (const ws of app.workspaces || []) chaseScrollForWorkspace(ws);
  }

  registerComputeWorkspaceIndexWrapper(function computeWorkspaceIndexWithDurableLens(ws, next) {
    const result = next(ws);
    const state = app.pendingDurableLensState || decodedLensState() || cachedLensState();
    const sources = state?.workspaces || state?.sources || [];
    const index = app.workspaces.indexOf(ws);
    if (index >= 0 && sources[index]) applyLensSource(ws, sources[index]);
    return result;
  });
  registerRenderWrapper(function renderWithDurableLens(next) {
    if (!app.isBootingFromUrl && !app.routing?.restoring) {
      applyCurrentOrCachedLens();
    }
    const result = next();
    // CP92: durable lens owns route selection/history only. It must not chase
    // scroll after render, because F5 scroll restore is owned by routeScroll.
    return result;
  });
  registerSetRouteStateWrapper(function setRouteStateWithDurableLens(kind = 'push', next) {
    next(kind);
    if (!app.routing?.restoring && !app.isBootingFromUrl) {
      try { sessionStorage.setItem(lensCacheKey(), JSON.stringify(currentLensState())); } catch (_) {}
    }
  });

  function pageScrollTarget(el) {
    return el === document || el === window || el === document.documentElement || el === document.body || el === document.scrollingElement;
  }

  function onScrollPersistLens(event) {
    const el = event.target;
    const pageScroll = pageScrollTarget(el);
    if (!pageScroll && !el?.classList?.contains('post-feed')) return;
    const ws = pageScroll ? activeWorkspace() : getWorkspace(el.dataset.ws || '');
    if (!ws) return;
    const target = pageScroll ? (document.scrollingElement || document.documentElement || document.body) : el;
    scrollFlightRecord('lens:scroll-capture', {
      pageScroll,
      target: scrollRestoreDebugTargetState(target),
      workspace: scrollRestoreDebugWorkspaceState(ws)
    });
    rememberLensScroll(ws, target);
    clearTimeout(app.persistLensTimer);
    app.persistLensTimer = setTimeout(() => persistLensState('replace'), 120);
  }

  document.addEventListener('scroll', onScrollPersistLens, true);

  function flushBrowserStateBeforeLeave() {
    try { writeStoredScrollSnapshot('pagehide'); } catch (_) {}
    persistLensState('replace');
    if (typeof saveLocalStateNow === 'function') saveLocalStateNow();
  }

  window.addEventListener('pagehide', flushBrowserStateBeforeLeave);
  window.addEventListener('beforeunload', flushBrowserStateBeforeLeave);
  registerCopyShareLinkWrapper(function copyShareLinkWithDurableLens(next) {
    persistLensState('replace');
    return next();
  });




  function discoverySignatureForScroll(ws) {
    if (!ws) return '';
    let nodes = [];
    try {
      nodes = typeof filteredDiscoveryNodes === 'function' ? filteredDiscoveryNodes(ws) : (ws.nodes || []);
    } catch (_) {
      nodes = ws.nodes || [];
    }
    return TiinexViewState.discoveryScrollSignature({
      discoveryView: ws.discoveryView || 'feed',
      discoveryFilterSchema: ws.discoveryFilterSchema || ws.filterSchema || 'all',
      discoverySearch: ws.discoverySearch || '',
      previewMaterialMode: ws.previewMaterialMode,
      previewMaterialKind: typeof previewMaterialKind === 'function' ? previewMaterialKind(ws) : '',
      nodeKeys: nodes.map((node) => node?.path || node?.id || ''),
      nodeCount: nodes.length,
      hash: hashFast
    });
  }

  const rememberLensScrollBeforeCancel = rememberLensScroll;
  rememberLensScroll = function rememberLensScrollWithDiscoverySignature(ws, explicitEl = null) {
    rememberLensScrollBeforeCancel(ws, explicitEl);
    const selected = selectedNode(ws);
    ws.routeScrollDiscoverySig = selected ? '' : discoverySignatureForScroll(ws);
  };

  const enhanceLensSourceBeforeCancel = enhanceLensSource;
  enhanceLensSource = function enhanceLensSourceWithDiscoverySignature(source, ws) {
    enhanceLensSourceBeforeCancel(source, ws);
    if (source && ws && !selectedNode(ws)) {
      source.discoveryScrollSignature = discoverySignatureForScroll(ws);
    }
    return source;
  };
  registerApplyLensSourceWrapper(function applyLensSourceWithChaseGuard(ws, source, next) {
    next(ws, source);
    if (!ws || !source) return;

    const wantsLineage = source.mode === 'lineage' || Boolean(source.selectedNodeId || source.selectedPath || source.selectedTitle);
    if (!wantsLineage && source.scrollTop) {
      const currentSig = discoverySignatureForScroll(ws);
      const savedSig = source.discoveryScrollSignature || source.discoverySig || '';
      if (TiinexViewState.shouldRejectDiscoveryScroll(savedSig, currentSig)) {
        ws.routeScrollTop = 0;
      }
    }

    if (Number(ws.routeScrollTop || 0) > 0) {
      ws.scrollRestoreArmed = true;
      ws.scrollRestoreDeadline = performance.now() + 2600;
    }
  });

  function markUserInteraction() {
    if (app.isBootingFromUrl || app.routing?.restoring) return;
    app.userInteracted = true;
    for (const ws of app.workspaces || []) {
      ws.userScrollVersion = (ws.userScrollVersion || 0) + 1;
      ws.scrollRestoreArmed = false;
    }
  }

  document.addEventListener('pointerdown', markUserInteraction, true);
  document.addEventListener('keydown', markUserInteraction, true);
  document.addEventListener('wheel', markUserInteraction, { capture: true, passive: true });
  document.addEventListener('touchmove', markUserInteraction, { capture: true, passive: true });

  const applyCurrentOrCachedLensBeforeCancel = applyCurrentOrCachedLens;
  applyCurrentOrCachedLens = function applyCurrentOrCachedLensOnce() {
    const shouldApply = TiinexViewState.shouldApplyLens({
      userInteracted: app.userInteracted,
      durableLensApplied: app.durableLensApplied,
      isBootingFromUrl: app.isBootingFromUrl,
      routingRestoring: app.routing?.restoring
    });
    if (!shouldApply) return false;
    const ok = applyCurrentOrCachedLensBeforeCancel();
    if (ok) app.durableLensApplied = true;
    return ok;
  };

  chaseScrollForWorkspace = function chaseScrollForWorkspaceGuarded() {
    // CP92: no-op. Durable lens may remember route state, but routeScroll owns
    // all F5 scroll restore. Keeping this as a no-op prevents retired callers from
    // racing routeScroll while avoiding a risky broad removal in app.js.
    return;
  };


  function onManualPostFeedScrollCancelChase(event) {
    const el = event.target;
    if (!el?.classList?.contains('post-feed')) return;
    if (app.isBootingFromUrl || app.routing?.restoring) return;
    const ws = getWorkspace(el.dataset.ws || '');
    if (!ws) return;
    const top = Math.max(0, el.scrollTop || 0);
    const target = Math.max(0, ws.routeScrollTop || 0);
    if (ws.scrollRestoreArmed && Math.abs(top - target) > 12) {
      ws.userScrollVersion = (ws.userScrollVersion || 0) + 1;
      ws.scrollRestoreArmed = false;
    }
  }

  document.addEventListener('scroll', onManualPostFeedScrollCancelChase, true);




  function semanticLensState() {
    let state;
    try {
      state = staticDiskMode() ? viewRouteState() : routeState();
    } catch (_) {
      state = {};
    }
    const clone = JSON.parse(JSON.stringify(state || {}));
    return TiinexViewState.stripVolatileLensState(clone);
  }

  function semanticLensSignature() {
    try {
      return JSON.stringify(semanticLensState());
    } catch (_) {
      return '';
    }
  }

  function normalizeHistoryKind(kind) {
    const sig = semanticLensSignature();
    const decision = TiinexViewState.normalizedHistoryKind({
      kind,
      signature: sig,
      lastSignature: app.lastPushedSemanticLens,
      lastAt: app.lastPushedSemanticLensAt || 0,
      now: performance.now(),
      currentHistorySignature: history.state?.semanticLens,
      windowMs: 1200
    });
    if (decision.shouldRememberPending) app.pendingPushedSemanticLens = sig;
    return decision.kind;
  }
  registerSetRouteStateWrapper(function setRouteStateWithHistoryDedupe(kind = 'push', next) {
    const normalized = normalizeHistoryKind(kind);
    next(normalized);

    const sig = semanticLensSignature();
    if (sig) {
      const state = history.state && typeof history.state === 'object' ? Object.assign({}, history.state) : {};
      if (state.semanticLens !== sig) {
        try {
          history.replaceState(Object.assign(state, { semanticLens: sig }), '', location.href);
        } catch (_) {}
      }
    }

    if (normalized === 'push' && app.pendingPushedSemanticLens) {
      app.lastPushedSemanticLens = app.pendingPushedSemanticLens;
      app.lastPushedSemanticLensAt = performance.now();
      app.pendingPushedSemanticLens = '';
    }
  });

  const persistLensStateBeforeHistoryDedupe = persistLensState;
  persistLensState = function persistLensStateWithHistoryDedupe(kind = 'replace') {
    return persistLensStateBeforeHistoryDedupe(kind === 'push' ? normalizeHistoryKind(kind) : kind);
  };




  function mobileLensActive() {
    return window.matchMedia?.('(max-width: 640px)').matches;
  }

  function activeWorkspace() {
    return getWorkspace(app.activeWorkspaceId) || app.workspaces?.[0] || null;
  }
  registerRenderWrapper(function renderWithMobileLens(next) {
    const result = next();
    requestAnimationFrame(() => {
      const ws = activeWorkspace();
      const root = document.querySelector('.app-shell, .viewer-shell, main, body');
      document.body.classList.toggle('mobile-lens', mobileLensActive());
      document.querySelectorAll('.mobile-global-actions-host').forEach((el) => el.remove());
      if (ws && root) {
        const host = document.createElement('div');
        host.className = 'mobile-global-actions-host';
        host.innerHTML = mobileGlobalActions(ws);
        document.body.appendChild(host);
      }
    });
    return result;
  });

  function openNodeActionSheet(ws, node, card) {
    if (!ws || !node) return;
    const lineage = Boolean(card?.closest?.('.post-feed.lineage'));
    app.mobileActionSheet = {
      wsId: ws.id,
      nodeId: node.id,
      nodePath: node.path || '',
      title: node.title || node.name || 'Artifact',
      actions: mobileNodeActions(ws, node, lineage)
    };
    app.modal = { type: 'mobile-action-sheet', sheet: app.mobileActionSheet };
    render();
  }
  registerRenderModalWrapper(function renderModalWithMobileSheet(modal, next) {
    if (modal?.type === 'mobile-action-sheet') return renderMobileActionSheet(modal.sheet);
    return next(modal);
  });

  function closeMobileActionSheet() {
    app.mobileActionSheet = null;
    if (app.modal?.type === 'mobile-action-sheet') app.modal = null;
  }


  registerActionHandler(async function mobileLensActions(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'toggle-mobile-global-actions') {
      event.preventDefault();
      event.stopPropagation();
      app.mobileGlobalActionsOpen = !app.mobileGlobalActionsOpen;
      render();
      return;
    }

    if (action === 'mobile-card-more') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      const card = event.currentTarget.closest('.lineage-post');
      openNodeActionSheet(ws, node, card);
      app.modal = { type: 'mobile-action-sheet', sheet: app.mobileActionSheet };
      return render();
    }

    if (action === 'close-mobile-action-sheet') {
      event.preventDefault();
      event.stopPropagation();
      closeMobileActionSheet();
      render();
      return;
    }

    if (action === 'mobile-run-node-action') {
      event.preventDefault();
      event.stopPropagation();
      const sheet = app.mobileActionSheet;
      const chosen = sheet?.actions?.[Number(event.currentTarget.dataset.actionIndex || -1)];
      if (!chosen) {
        closeMobileActionSheet();
        render();
        return;
      }
      const ws = getWorkspace(sheet.wsId);
      const node = ws?.nodeById?.get?.(sheet.nodeId) || ws?.nodes?.find?.((n) => n.path === sheet.nodePath);
      if (!ws || !node) {
        closeMobileActionSheet();
        render();
        return toast('Action target not found.', 'warn');
      }
      const chosenDataset = Object.assign({}, chosen.dataset || {});
      const chosenMode = chosenDataset.mode || '';
      if (chosenDataset.action === 'open-create' && (chosenMode === 'continue' || chosenMode === 'reference')) {
        closeMobileActionSheet();
        openArtifactCreateIntent(Object.assign({}, chosenDataset, { mode: chosenMode, ws, node }));
        return;
      }
      closeMobileActionSheet();
      render();
      if (chosen.href) {
        window.open(chosen.href, '_blank', 'noopener');
        return;
      }

      // Re-dispatch through the existing action handler with the original dataset.
      const fake = document.createElement('button');
      Object.entries(chosenDataset).forEach(([key, value]) => { fake.dataset[key] = value; });
      if (!fake.dataset.ws) fake.dataset.ws = ws.id;
      if (!fake.dataset.node) fake.dataset.node = node.id;
      if (!fake.dataset.path) fake.dataset.path = node.path || '';
      document.body.appendChild(fake);
      try {
        await handleAction({ currentTarget: fake, target: fake, preventDefault(){}, stopPropagation(){} });
      } finally {
        fake.remove();
      }
      return;
    }

    if (action !== 'toggle-mobile-global-actions') {
      app.mobileGlobalActionsOpen = false;
    }

    return next(event);
  });
  registerRenderNodePostWrapper(function renderNodePostMobileLens(ws, node, options = {}, next) {
    let html = next(ws, node, options);
    if (!mobileLensActive()) return html;
    if (!ws || !node) return html;

    const parentPickerActive = typeof parentPickerActiveFor === 'function' && parentPickerActiveFor(ws);
    const parentPickerChip = `<button class="badge-soft mobile-card-select-parent-chip select-parent-action" data-action="select-reference-parent" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" title="Select as parent for reference leaf" aria-label="Select as parent"><i class="fa-solid fa-location-crosshairs"></i></button>`;
    const moreChip = `<button class="badge-soft mobile-card-more-chip" data-action="mobile-card-more" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" title="More actions" aria-label="More actions"><i class="fa-solid fa-ellipsis"></i></button>`;
    const actionChip = parentPickerActive ? parentPickerChip : moreChip;

    // Mobile card primary action is the card itself. Keep secondary actions
    // behind the compact More affordance, except during parent picking where
    // the single task is selecting the card as parent and a one-item sheet is
    // unnecessary indirection. In parent-picker mode the Select affordance stays
    // in the same reserved right-side action rail as the normal ellipsis so it
    // does not consume or reorder semantic badges.
    if (!/mobile-card-more-chip|mobile-card-select-parent-chip/u.test(html)) {
      html = html.replace(/(<div class="post-chips)([^"]*)(">)([\s\S]*?)(<\/div>)/u, (_, open, classes, endOpen, body, close) => {
        const baseClasses = /mobile-card-more-row/u.test(classes) ? classes : `${classes} mobile-card-more-row`;
        const nextClasses = parentPickerActive && !/mobile-card-parent-select-row/u.test(baseClasses)
          ? `${baseClasses} mobile-card-parent-select-row`
          : baseClasses;
        return `${open}${nextClasses}${endOpen}${body}${actionChip}${close}`;
      });
    }

    const mobileActions = `<div class="mobile-card-actions" aria-hidden="true"></div>`;
    return html.replace(/<div class="post-actions[\s\S]*?<\/div>/, mobileActions);
  });

  function collapseExpandedNodesForModeChange(ws) {
    if (!ws) return;
    for (const node of ws.nodes || []) node.expanded = false;
  }
  registerActionHandler(async function collapseOnViewChangeActions(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'select-node' || action === 'open-lineage' || action === 'show-lineage') {
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      collapseExpandedNodesForModeChange(ws);
    }
    return next(event);
  });

  // Parent/origin edges are lineage context, not user-facing attachments.
  registerNodeMaterialRefsWrapper(function nodeMaterialRefsWithoutParentOrigin(ws, node, next) {
    return next(ws, node).filter((ref) => {
      const kind = String(ref?.kind || '').toLowerCase();
      const label = String(ref?.label || ref?.title || ref?.path || ref?.href || '').toLowerCase();
      if (kind === 'trace' && /parent|origin/.test(label)) return false;
      if (/parent schema|parent origin|parent trace/.test(label)) return false;
      return true;
    });
  });









  function mobileFabHostClickInitial(event) {
    const button = event.target?.closest?.('.mobile-global-actions-host [data-action]');
    if (!button) return;
    const action = button.dataset.action || '';
    const ws = activeWorkspace();
    if (!ws) return;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'toggle-mobile-global-actions') {
      app.mobileGlobalActionsOpen = !app.mobileGlobalActionsOpen;
      render();
      return;
    }

    app.mobileGlobalActionsOpen = false;

    const fake = document.createElement('button');
    document.body.appendChild(fake);
    try {
      if (action === 'mobile-create') {
        fake.dataset.action = 'open-add-artifact-source';
        fake.dataset.ws = ws.id;
      } else if (action === 'mobile-add-source') {
        fake.dataset.action = 'open-source-modal';
        fake.dataset.ws = ws.id;
      } else if (action === 'mobile-export') {
        fake.dataset.action = 'open-export-workspace';
        fake.dataset.ws = ws.id;
      } else if (action === 'mobile-copy-link') {
        fake.dataset.action = 'copy-link';
      } else if (action === 'mobile-display') {
        fake.dataset.action = 'open-display-options';
        fake.dataset.ws = ws.id;
      } else if (action === 'mobile-help') {
        fake.dataset.action = 'open-help';
      } else {
        fake.dataset.action = action;
        Object.assign(fake.dataset, button.dataset);
        if (!fake.dataset.ws) fake.dataset.ws = ws.id;
      }
      handleAction({ currentTarget: fake, target: fake, preventDefault(){}, stopPropagation(){} });
    } finally {
      fake.remove();
    }
  }

  document.addEventListener('click', mobileFabHostClickInitial, true);


  function collapseAllExpandedNodes() {
    for (const ws of app.workspaces || []) {
      for (const node of ws.nodes || []) node.expanded = false;
    }
  }
  registerApplyLensSourceWrapper(function applyLensSourceWithBackCollapse(ws, source, next) {
    const before = ws ? selectedNode(ws)?.id || '' : '';
    next(ws, source);
    const after = ws ? selectedNode(ws)?.id || '' : '';
    if (before !== after) collapseExpandedNodesForModeChange(ws);
  });

  

  function installMobileBrandFallback() {
    if (!mobileLensActive()) return;
    const topbar = document.querySelector('.topbar, .topbar-foundation, .topbar-shell, .topbar-layout, .topbar-actions, .topbar-branded');
    if (!topbar || topbar.querySelector('.mobile-brand-fallback')) return;
    const firstOrb = topbar.querySelector('button, a, .brand, .brand-mark, .viewer-brand-link-slot, .viewer-brand') || topbar.firstElementChild;
    if (!firstOrb) return;
    firstOrb.classList.add('mobile-brand-orb');
    const mark = document.createElement('span');
    mark.className = 'mobile-brand-fallback';
    mark.textContent = 'T';
    firstOrb.appendChild(mark);
  }

  function applyMobileChromeClass() {
    document.body.classList.toggle('mobile-chrome', mobileLensActive());
    installMobileBrandFallback();
  }
  registerRenderWrapper(function renderWithMobileChrome(next) {
    const result = next();
    requestAnimationFrame(applyMobileChromeClass);
    return result;
  });

  window.addEventListener('resize', applyMobileChromeClass);
  window.addEventListener('orientationchange', applyMobileChromeClass);




  function mobileNodeActions(ws, node, lineage = false) {
    if (!ws || !node || typeof nodeActionItems !== 'function') return [];
    if (typeof parentPickerActiveFor === 'function' && parentPickerActiveFor(ws)) {
      return [parentPickerSelectActionItem(ws, node)];
    }
    const actions = nodeActionItems(ws, node, { lineage });
    return actions.filter((action) => action?.dataset?.action !== 'toggle-node-expand');
  }

  function mobileDispatchActionInitial(dataset, ws) {
    const fake = document.createElement('button');
    Object.entries(dataset || {}).forEach(([key, value]) => { fake.dataset[key] = value; });
    if (ws && !fake.dataset.ws) fake.dataset.ws = ws.id;
    document.body.appendChild(fake);
    try {
      return handleAction({ currentTarget: fake, target: fake, preventDefault(){}, stopPropagation(){} });
    } finally {
      fake.remove();
    }
  }

  function mobileFabActionDatasetInitial(action, ws) {
    if (action === 'mobile-create') return { action: 'open-add-artifact', ws: ws.id };
    if (action === 'mobile-add-source') return { action: 'open-source-modal', ws: ws.id };
    if (action === 'mobile-export') return { action: 'save-workspace', ws: ws.id };
    if (action === 'mobile-copy-link') return { action: 'copy-share' };
    if (action === 'mobile-display') return { action: 'open-display-options', ws: ws.id };
    if (action === 'mobile-help') return { action: 'open-config-help' };
    return { action, ws: ws.id };
  }

  function mobileFabHostClickWithSheet(event) {
    const button = event.target?.closest?.('.mobile-global-actions-host [data-action]');
    if (!button) return;
    const action = button.dataset.action || '';
    const ws = activeWorkspace();
    if (!ws) return;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'toggle-mobile-global-actions') {
      app.mobileGlobalActionsOpen = !app.mobileGlobalActionsOpen;
      render();
      return;
    }

    app.mobileGlobalActionsOpen = false;
    mobileDispatchActionInitial(mobileFabActionDatasetInitial(action, ws), ws);
  }

  document.addEventListener('click', mobileFabHostClickWithSheet, true);
  registerActionHandler(async function mobileRepairActions(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'mobile-card-more') {
      event.preventDefault();
      event.stopPropagation();
      const ws = getWorkspace(event.currentTarget.dataset.ws || '');
      const node = ws?.nodeById?.get?.(event.currentTarget.dataset.node || '');
      const card = event.currentTarget.closest?.('.lineage-post');
      openNodeActionSheet(ws, node, card);
      return;
    }

    if (action === 'mobile-run-node-action') {
      event.preventDefault();
      event.stopPropagation();
      const sheet = app.mobileActionSheet;
      const chosen = sheet?.actions?.[Number(event.currentTarget.dataset.actionIndex || -1)];
      closeMobileActionSheet();
      render();
      if (!chosen) return;
      if (chosen.href) {
        window.open(chosen.href, '_blank', 'noopener');
        return;
      }
      const ws = getWorkspace(sheet.wsId);
      if (!ws) return;
      await mobileDispatchActionInitial(chosen.dataset, ws);
      return;
    }

    return next(event);
  });

  let lastMobileFeedTop = new WeakMap();
  function onMobileChromeScroll(event) {
    if (!mobileLensActive()) return;
    const el = event.target;
    if (!el?.classList?.contains('post-feed')) return;
    const top = Math.max(0, el.scrollTop || 0);
    const prev = lastMobileFeedTop.get(el) || 0;
    lastMobileFeedTop.set(el, top);

    if (top < 18 || top < prev - 8) {
      document.body.classList.remove('mobile-reading');
      return;
    }
    if (top > prev + 4 && top > 42) {
      document.body.classList.add('mobile-reading');
    }
  }

  document.addEventListener('scroll', onMobileChromeScroll, true);




  function mobileIconHtml(icon) {
    const raw = String(icon || '').trim();
    if (!raw) return '<i class="fa-solid fa-circle-dot"></i>';
    if (raw.startsWith('<')) return raw;
    return `<i class="${escapeAttr(raw)}"></i>`;
  }

  function mobileActionButtonAttrs(action = {}, sheet = {}) {
    const data = Object.assign({}, action?.dataset || {});
    if (sheet?.wsId && !data.ws) data.ws = sheet.wsId;
    if (sheet?.nodeId && !data.node) data.node = sheet.nodeId;
    if (sheet?.nodePath && !data.path) data.path = sheet.nodePath;
    const keys = ['action', 'mode', 'ws', 'node', 'path', 'nodePath', 'schema', 'schemaId', 'parentNodeId', 'referencedNodeId', 'sourceWsId', 'sourceNodeId', 'title'];
    return keys.map((key) => {
      const value = data[key];
      if (value === undefined || value === null || value === '') return '';
      const attr = `data-${String(key).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
      return ` ${attr}="${escapeAttr(String(value))}"`;
    }).join('');
  }

  function renderMobileActionSheet(sheet) {
    const ws = getWorkspace(sheet.wsId);
    const node = ws?.nodeById?.get?.(sheet.nodeId) || ws?.nodes?.find?.((n) => n.path === sheet.nodePath);
    if (!ws || !node) return '';
    return `<div class="mobile-action-backdrop" role="dialog" aria-modal="true" aria-label="Artifact actions">
      <div class="mobile-action-sheet">
        <div class="mobile-action-head">
          <div class="mobile-action-title">
            <p class="kicker">Actions</p>
            <h3>${escapeHtml(sheet.title || node.title || 'Artifact')}</h3>
          </div>
          <button class="tv-btn small subtle mobile-action-close" data-mobile-action="close-mobile-action-sheet" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="mobile-action-list">
          ${(sheet.actions || []).map((action, index) => `<button class="${action.danger ? 'danger' : ''}" data-mobile-action="run-node-action" data-action-index="${index}"${mobileActionButtonAttrs(action, sheet)}${action.disabled ? ' disabled' : ''}>
            ${mobileIconHtml(action.icon)}<span>${escapeHtml(action.label || 'Action')}</span>
          </button>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function mobileGlobalActions(ws) {
    if (!ws) return '';
    if (workspaceIsDiscoveryTree(ws)) return '';
    return `<button class="mobile-fab" data-mobile-action="toggle-global-actions" data-ws="${escapeAttr(ws.id)}" aria-label="Workspace actions" title="Workspace actions">
      <i class="fa-solid fa-plus"></i>
    </button>
    ${app.mobileGlobalActionsOpen ? `<div class="mobile-fab-sheet" role="menu" aria-label="Workspace actions">
      <button data-mobile-action="mobile-create" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-file-circle-plus"></i><span>Create</span></button>
      <button data-mobile-action="mobile-add-source" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-folder-plus"></i><span>Add source/material</span></button>
      <button data-mobile-action="mobile-export" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-download"></i><span>Export</span></button>
      <button data-mobile-action="mobile-copy-link"><i class="fa-solid fa-link"></i><span>Copy link</span></button>
      <button data-mobile-action="mobile-display" data-ws="${escapeAttr(ws.id)}"><i class="fa-solid fa-sliders"></i><span>Display</span></button>
      <button data-mobile-action="mobile-help"><i class="fa-regular fa-circle-question"></i><span>Help</span></button>
    </div>` : ''}`;
  }

  function mobileDispatchAction(dataset, ws) {
    const fake = document.createElement('button');
    Object.entries(dataset || {}).forEach(([key, value]) => { fake.dataset[key] = value; });
    if (ws && !fake.dataset.ws) fake.dataset.ws = ws.id;
    document.body.appendChild(fake);
    try {
      return handleAction({ currentTarget: fake, target: fake, preventDefault(){}, stopPropagation(){} });
    } finally {
      fake.remove();
    }
  }

  function mobileFabActionDataset(action, ws) {
    if (action === 'mobile-create') return { action: 'open-add-artifact', ws: ws.id };
    if (action === 'mobile-add-source') return { action: 'open-source-modal', ws: ws.id };
    if (action === 'mobile-export') return { action: 'save-workspace', ws: ws.id };
    if (action === 'mobile-copy-link') return { action: 'copy-share' };
    if (action === 'mobile-display') return { action: 'open-display-options', ws: ws.id };
    if (action === 'mobile-help') return { action: 'open-config-help' };
    return { action, ws: ws.id };
  }

  function genericMobileActionOwnsButton(button) {
    return Boolean(button?.closest?.('.mobile-global-actions-host, .mobile-action-backdrop'));
  }

  function mobileOnlyActionClick(event) {
    const button = event.target?.closest?.('[data-mobile-action]');
    if (!button || !genericMobileActionOwnsButton(button)) return;

    const action = button.dataset.mobileAction || '';
    const ws = activeWorkspace();

    event.preventDefault();
    event.stopPropagation();

    if (action === 'toggle-global-actions') {
      app.mobileGlobalActionsOpen = !app.mobileGlobalActionsOpen;
      render();
      return;
    }

    if (action === 'close-mobile-action-sheet') {
      closeMobileActionSheet();
      render();
      return;
    }

    if (action === 'run-node-action') {
      const sheet = app.mobileActionSheet;
      const chosen = sheet?.actions?.[Number(button.dataset.actionIndex || -1)];
      closeMobileActionSheet();
      render();
      if (!chosen) return;
      if (chosen.href) return window.open(chosen.href, '_blank', 'noopener');
      const actionWs = getWorkspace(sheet.wsId);
      if (actionWs) return mobileDispatchAction(chosen.dataset, actionWs);
      return;
    }

    if (!ws) return;
    app.mobileGlobalActionsOpen = false;
    return mobileDispatchAction(mobileFabActionDataset(action, ws), ws);
  }

  document.addEventListener('click', mobileOnlyActionClick, true);


  document.addEventListener('click', (event) => {
    const btn = event.target?.closest?.('[data-mobile-action="toggle-card-chips"]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const row = btn.closest('.post-chips');
    if (!row) return;
    row.classList.toggle('mobile-chip-expanded');
    row.dataset.mobileChipSignature = '';
    requestAnimationFrame(() => {
      try { compactMobilePostChips(); } catch (_) {}
    });
  }, true);




  function unifySourceAndModeRows() {
    for (const wsEl of document.querySelectorAll('.workspace')) {
      const sourceRow = wsEl.querySelector('.workspace-source-tabs, .source-tabs, .workspace-sources');
      const modeToggle = wsEl.querySelector('.feed-mode');
      if (!sourceRow || !modeToggle) continue;
      sourceRow.classList.add('source-mode-row');
      modeToggle.classList.add('source-row-mode-toggle');
      if (modeToggle.parentElement !== sourceRow) {
        sourceRow.appendChild(modeToggle);
      }
    }
  }

  function tagOpenModalForMobile() {
    const modal = document.querySelector(
      '.modal-backdrop, .modal-overlay, .lightbox, .dialog-backdrop, .source-modal-backdrop, .artifact-modal-backdrop, .mobile-action-backdrop'
    );
    document.body.classList.toggle('has-open-modal', Boolean(modal));
  }
  registerRenderWrapper(function renderWithLayoutPolish(next) {
    const result = next();
    requestAnimationFrame(() => {
      unifySourceAndModeRows();
      tagOpenModalForMobile();
    });
    return result;
  });






  function isParentLikeMaterialRef(ws, node, ref) {
    const kind = String(ref?.kind || '').toLowerCase();
    const label = String(ref?.label || ref?.title || '').toLowerCase();
    const path = canonicalWorkspacePath(String(ref?.path || ref?.href || '').replace(/^https?:\/\/[^/]+\/?/, ''));
    const href = String(ref?.href || ref?.rawUrl || ref?.browseUrl || '').toLowerCase();
    const parentPath = canonicalWorkspacePath(node?.parentResolvedPath || '');
    const parentHref = canonicalWorkspacePath(node?.parentHref || '');
    const parentTrace = String(node?.parentTrace || '').toLowerCase();

    if (/parent|origin/.test(label)) return true;
    if (/parent schema|parent origin|parent trace/.test(`${label} ${href}`)) return true;

    if (kind === 'trace') {
      if (parentPath && path && path.endsWith(parentPath)) return true;
      if (parentPath && path === parentPath) return true;
      if (parentHref && (path === parentHref || path.endsWith(parentHref))) return true;
      if (parentTrace && (label.includes(parentTrace) || href.includes(parentTrace))) return true;
      if (ref.loadedNodeId && node?.parentNode?.id && ref.loadedNodeId === node.parentNode.id) return true;
    }

    return false;
  }

  registerNodeMaterialRefsWrapper(function nodeMaterialRefsWithoutLineageEdges(ws, node, next) {
    return next(ws, node).filter((ref) => !isParentLikeMaterialRef(ws, node, ref));
  });



  function workspaceSourceCountInitial(ws) {
    if (!ws) return 0;
    if (Array.isArray(ws.sources)) return ws.sources.length;
    if (Array.isArray(ws.sourceDescriptors)) return ws.sourceDescriptors.length;
    if (Array.isArray(ws.loadedSources)) return ws.loadedSources.length;
    if (ws.source || ws.sourceName || ws.sourceLabel || ws.id) return 1;
    return 0;
  }

  function markSingleSourceWorkspacesInitial() {
    for (const ws of app.workspaces || []) {
      const single = workspaceSourceCountInitial(ws) <= 1;
      document.querySelectorAll(`.workspace[data-ws="${CSS.escape(ws.id)}"]`).forEach((el) => {
        el.classList.toggle('single-source-state', single);
      });
    }

    // Fallback for older DOM variants that do not carry data-ws on the workspace root.
    document.querySelectorAll('.workspace').forEach((el, index) => {
      if (el.dataset.ws) return;
      const ws = app.workspaces[index] || activeWorkspace?.();
      const single = workspaceSourceCountInitial(ws) <= 1;
      el.classList.toggle('single-source-state', single);
    });
  }
  registerRenderWrapper(function renderWithSingleSource(next) {
    const result = next();
    requestAnimationFrame(markSingleSourceWorkspacesInitial);
    return result;
  });





  function mobileLayoutActive() {
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) return true;
    } catch (_) {}
    return Boolean(document.body?.classList?.contains('mobile-lens') || document.body?.classList?.contains('mobile-chrome'));
  }

  function workspaceDisplaySourceCount(ws) {
    if (!ws) return 0;
    try {
      if (typeof filteredDiscoverySources === 'function') return filteredDiscoverySources(ws).length;
    } catch (_) {}
    try {
      if (typeof countWorkspaceSources === 'function') return countWorkspaceSources(ws);
    } catch (_) {}
    try {
      ensureWorkspaceSources(ws);
      if (ws.sources instanceof Map) {
        return Array.from(ws.sources.values()).filter((source) =>
          source.kind !== 'draft' ||
          ws.generated?.length ||
          Array.from(ws.files?.values?.() || []).some((file) => file.sourceId === source.id)
        ).length;
      }
    } catch (_) {}
    if (Array.isArray(ws.sources)) return ws.sources.length;
    if (Array.isArray(ws.sourceDescriptors)) return ws.sourceDescriptors.length;
    if (Array.isArray(ws.loadedSources)) return ws.loadedSources.length;
    return ws.source || ws.sourceName || ws.sourceLabel ? 1 : 0;
  }



  function collapseMobileBadgeRows() {
    document.querySelectorAll('.post-chips.mobile-chip-expanded').forEach((row) => {
      row.classList.remove('mobile-chip-expanded');
    });
  }

  registerActionHandler(function actionWithMobileBadgeReset(event, next) {
    const action = event?.currentTarget?.dataset?.action || event?.target?.dataset?.action || '';
    if (action === 'clear-selection' || action === 'workspace-prev' || action === 'workspace-next' || action === 'set-discovery-mode' || action === 'set-source') {
      collapseMobileBadgeRows();
      try { collapseAllExpandedNodes(); } catch (_) {}
    }
    return next(event);
  });

  window.addEventListener('popstate', collapseMobileBadgeRows, true);




  function undoMobileSourceModeRows() {
    document.querySelectorAll('.mobile-source-mode-row').forEach((row) => {
      const workspace = row.closest?.('.workspace');
      const toolbar = workspace?.querySelector?.(':scope > .feed-toolbar.discovery, :scope > .feed-toolbar');
      const sourceStrip = row.querySelector?.('.workspace-source-strip');
      const feedMode = row.querySelector?.('.feed-mode');

      if (sourceStrip && workspace) {
        if (toolbar && toolbar.parentElement === workspace) workspace.insertBefore(sourceStrip, toolbar);
        else workspace.appendChild(sourceStrip);
      }
      if (feedMode && toolbar) toolbar.insertBefore(feedMode, toolbar.firstChild);
      toolbar?.classList?.remove?.('mobile-tools-only');
      row.remove();
    });
  }

  function syncMobileSourceModeRows() {
    const active = typeof mobileActive === 'function' ? mobileActive() : window.matchMedia?.('(max-width: 640px)')?.matches;
    if (!active) {
      try { undoMobileSourceModeRows(); } catch (_) {}
      restoreMobileTitleModeRows();
      return;
    }

    document.querySelectorAll('.workspace').forEach((workspace) => {
      const ws = workspace.dataset.ws ? getWorkspace(workspace.dataset.ws) : null;
      const strip = workspace.querySelector(':scope > .workspace-strip');
      const toolbar = workspace.querySelector(':scope > .feed-toolbar.discovery, :scope > .feed-toolbar');
      if (!strip || !toolbar) return;

      const oldRow = workspace.querySelector(':scope > .mobile-source-mode-row');
      const sourceStrip = oldRow?.querySelector?.(':scope > .workspace-source-strip') || workspace.querySelector(':scope > .workspace-source-strip');
      const feedMode = toolbar.querySelector(':scope > .feed-mode') || strip.querySelector(':scope > .feed-mode') || oldRow?.querySelector?.(':scope > .feed-mode');

      if (sourceStrip && sourceStrip.parentElement !== workspace) {
        workspace.insertBefore(sourceStrip, toolbar);
      }
      if (oldRow && oldRow.childElementCount === 0) oldRow.remove();
      if (oldRow && !oldRow.querySelector('.workspace-source-strip') && !oldRow.querySelector('.feed-mode')) oldRow.remove();

      if (feedMode && feedMode.parentElement !== strip) {
        strip.appendChild(feedMode);
      }

      strip.classList.add('mobile-title-mode-row');
      toolbar.classList.add('mobile-tools-only');
      workspace.classList.add('mobile-title-mode-mounted');
      workspace.classList.toggle('empty-mobile-workspace', mobileWorkspaceIsEmpty(ws));
    });
  }

  registerEnsureMobileTopRailWrapper(function ensureMobileTopRailWithCreateCorrection(next) {
    const result = next();
    requestAnimationFrame(syncMobileSourceModeRows);
    return result;
  });

  registerScheduleMobileDensityWrapper(function scheduleMobileDensityWithSourceModeRow(next) {
    const result = next();
    requestAnimationFrame(syncMobileSourceModeRows);
    setTimeout(syncMobileSourceModeRows, 90);
    return result;
  });
  registerRenderWrapper(function renderWithMobileSourceMode(next) {
    const result = next();
    requestAnimationFrame(syncMobileSourceModeRows);
    return result;
  });

  window.addEventListener('resize', () => requestAnimationFrame(syncMobileSourceModeRows), { passive: true });


  function registerScheduleMobileChromeStabilizeWrapper(wrapper) {
    const next = scheduleMobileChromeStabilizeInitial;
    scheduleMobileChromeStabilizeInitial = function registeredScheduleMobileChromeStabilizeWrapper() {
      return wrapper(next);
    };
  }

  let mobileChromeRaf = 0;
  let mobileChromeTimer = 0;
  registerScheduleMobileChromeStabilizeWrapper(function scheduleMobileChromeStabilizeAfterRender(next) {
    if (mobileChromeRaf) return undefined;
    mobileChromeRaf = requestAnimationFrame(() => {
      mobileChromeRaf = 0;
      try { syncMobileSourceModeRows(); } catch (_) {}
      try { syncMobileEmptyWorkspaceHintsInitial(); } catch (_) {}
    });
    if (mobileChromeTimer) clearTimeout(mobileChromeTimer);
    mobileChromeTimer = setTimeout(() => {
      mobileChromeTimer = 0;
      try { syncMobileSourceModeRows(); } catch (_) {}
      try { syncMobileEmptyWorkspaceHintsInitial(); } catch (_) {}
    }, 160);
    return undefined;
  });




  function pruneAnchorScrollStorage() {
    // routeScroll is the single F5 scroll-restore owner. The old anchor-scroll
    // implementation was retired after it raced routeScroll during refresh. Keep
    // only this cache prune so stale pre-CP91 entries cannot affect future runs.
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith(STORAGE_KEYS.anchorScrollPrefix))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch (_) {}
  }

  pruneAnchorScrollStorage();

  function scrollRestoreCompletionKey(kind, ws, saved) {
    return hashFast([
      kind,
      ws?.id || '',
      saved?.mode || '',
      saved?.source || '',
      saved?.selectedPath || '',
      saved?.contentSignature || saved?.discoverySignature || '',
      saved?.targetRole || '',
      saved?.targetKind || ''
    ].join('::'));
  }

  function scrollRestoreCancelledByUser() {
    return Boolean(app.userInteracted && !app.isBootingFromUrl && !app.routing?.restoring);
  }

  function completedScrollRestoreSet() {
    if (!app.completedScrollRestores) app.completedScrollRestores = new Set();
    return app.completedScrollRestores;
  }

  const STORED_SCROLL_RESTORE_WINDOW_MS = 45000;
  const STORED_SCROLL_CHASE_DURATION_MS = 42000;
  const STORED_SCROLL_STABLE_COMPLETION_MS = 350;

  function extendStoredScrollRestoreWindow(durationMs = STORED_SCROLL_RESTORE_WINDOW_MS) {
    const until = performance.now() + durationMs;
    app.storageScrollRestoreUntil = Math.max(app.storageScrollRestoreUntil || 0, until);
    return app.storageScrollRestoreUntil;
  }

window.addEventListener('popstate', () => {
    collapseAllExpandedNodes();
  }, true);

  // Guard against mobile double-tap zoom in engines that ignore viewport/user-scalable on local files.
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd < 320) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });



  function mobileActive() {
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches) return true;
    } catch (_) {}
    return Boolean(document.body?.classList?.contains('mobile-lens') || document.body?.classList?.contains('mobile-chrome'));
  }

  function workspaceDomForRow(row) {
    return row?.closest?.('.workspace') || row?.closest?.('[data-ws]')?.closest?.('.workspace') || null;
  }

  function workspaceForRow(row) {
    const holder = row?.closest?.('[data-ws]');
    const wsId = holder?.dataset?.ws || row?.closest?.('.workspace')?.dataset?.ws || '';
    if (wsId) {
      try { return getWorkspace(wsId); } catch (_) {}
    }
    return null;
  }

  function renderedSourceCount(workspaceEl) {
    if (!workspaceEl) return undefined;
    const strip = workspaceEl.querySelector('.workspace-source-strip');
    if (!strip) return undefined;
    const pills = Array.from(strip.querySelectorAll('.workspace-source-pill, .source-pill, .source-chip'))
      .filter((pill) => !pill.hidden && !pill.closest('[hidden]'));
    return pills.length;
  }

  function workspaceSourceCount(ws, workspaceEl) {
    const domCount = renderedSourceCount(workspaceEl);
    if (Number.isFinite(domCount)) return domCount;
    try {
      if (typeof workspaceDisplaySourceCount === 'function') return workspaceDisplaySourceCount(ws);
    } catch (_) {}
    try {
      if (typeof countWorkspaceSources === 'function') return countWorkspaceSources(ws);
    } catch (_) {}
    try {
      ensureWorkspaceSources(ws);
      if (ws?.sources instanceof Map) return ws.sources.size;
    } catch (_) {}
    return ws ? 1 : 0;
  }

  function markSingleSourceWorkspaces() {
    document.querySelectorAll('.workspace').forEach((el, index) => {
      const ws = el.dataset.ws ? getWorkspace(el.dataset.ws) : ((app.workspaces || [])[index] || null);
      const count = workspaceSourceCount(ws, el);
      const single = count <= 1;
      el.classList.remove('single-source-state');
      el.classList.toggle('single-source-state', single);
      el.dataset.sourceCount = String(count);
    });
  }

  function chipText(chip) {
    return String(chip?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function chipIsDate(chip) {
    return /\b\d{4}-\d{2}-\d{2}\b/.test(chipText(chip));
  }

  function chipIsSchema(chip) {
    const text = chipText(chip);
    const cls = String(chip?.className || '').toLowerCase();
    return /badge-schema|schema-nav-badge/.test(cls) || /\b(topic|task|decision|evidence|feedback|reduction|signal|pointer|runtime|machine runtime|ai runtime|lineage\.upgrade\.deferral|lineage upgrade|root|schema|continuation|capability|archive|broken|encrypted)\b/.test(text);
  }

  function chipIsSource(chip) {
    const text = chipText(chip);
    const cls = String(chip?.className || '').toLowerCase();
    return /source-chip|source-badge|source-github|source-local|source-url|source-draft/.test(cls) || /tiinex\/docs|github|local state|local\b/.test(text);
  }

  function chipPriority(chip, sourceCount) {
    const text = chipText(chip);
    const cls = String(chip?.className || '').toLowerCase();
    const joined = `${text} ${cls}`;
    if (/mismatch|missing|error|fail|danger/.test(joined)) return 0;
    if (/verified|out of date|integrity|ok/.test(joined)) return 1;
    if (/refs?|image|material|attachment|asset|pdf|zip/.test(joined)) return 2;
    if (/selected leaf|parent|child|ancestor|descendant/.test(text)) return 4;
    if (chipIsSource(chip)) return sourceCount <= 1 ? 10 : 6;
    if (chipIsSchema(chip)) return 7;
    if (chipIsDate(chip)) return 8;
    return 5;
  }

  function chipForcedHidden(chip, sourceCount) {
    if (sourceCount <= 1 && chipIsSource(chip)) return true;
    if (chipIsSchema(chip)) return true;
    if (chipIsDate(chip)) return true;
    return false;
  }

  function resetChipRow(row) {
    row.dataset.mobileChipsReadablePacked = '';
    row.dataset.mobileChipsSourceSimplified = '';
    row.dataset.mobileChipsSourceAware = '';
    row.dataset.mobileChipsWidthAware = '';
    row.querySelectorAll('.mobile-chip-more').forEach((el) => el.remove());
    row.querySelectorAll('.mobile-chip-hidden').forEach((el) => {
      el.classList.remove('mobile-chip-hidden');
    });
  }

  function compactMobilePostChips() {
    const rows = Array.from(document.querySelectorAll('.lineage-post .post-chips, article .post-chips'));
    if (!mobileActive()) {
      rows.forEach(resetChipRow);
      return;
    }

    rows.forEach((row) => {
      resetChipRow(row);
      const workspaceEl = workspaceDomForRow(row);
      const ws = workspaceForRow(row) || (workspaceEl?.dataset?.ws ? getWorkspace(workspaceEl.dataset.ws) : null);
      const sourceCount = workspaceSourceCount(ws, workspaceEl);
      row.dataset.mobileChipsWidthAware = '1';
      row.dataset.mobileChipsReadablePacked = '1';
      row.dataset.sourceCount = String(sourceCount);
      row.classList.toggle('single-source-chip-row', sourceCount <= 1);

      const chips = Array.from(row.children).filter((el) => !el.classList.contains('mobile-chip-more'));
      chips.sort((a, b) => chipPriority(a, sourceCount) - chipPriority(b, sourceCount));

      const forcedHidden = [];
      const candidates = [];
      chips.forEach((chip) => {
        if (chipForcedHidden(chip, sourceCount)) forcedHidden.push(chip);
        else candidates.push(chip);
      });

      const keep = row.closest('.preview-post') ? 2 : 3;
      const visible = candidates.slice(0, keep);
      const hidden = candidates.slice(keep).concat(forcedHidden);
      if (!visible.length && hidden.length) visible.push(hidden.shift());

      visible.concat(hidden).forEach((chip) => row.appendChild(chip));
      hidden.forEach((chip) => {
        chip.classList.add('mobile-chip-hidden');
      });

      if (hidden.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'badge-soft mobile-chip-more';
        btn.dataset.mobileAction = 'toggle-card-chips';
        btn.textContent = `+${hidden.length}`;
        btn.title = 'Show hidden badges';
        row.appendChild(btn);
      }
    });
  }

  function renderMobileTopRail() {
    const ws = activeWorkspace?.() || null;
    const count = typeof visibleWorkspaceCount === 'function' ? visibleWorkspaceCount() : 1;
    const total = app.workspaces?.length || 0;
    const to = Math.min((app.workspaceOffset || 0) + count, total);
    const canPage = total > count;
    const prevDisabled = !canPage || (app.workspaceOffset || 0) <= 0;
    const nextDisabled = !canPage || to >= total;
    const brand = typeof renderViewerBrand === 'function' ? renderViewerBrand() : '<span class="mobile-rail-brand-fallback">T</span>';
    const wsAttr = ws?.id ? ` data-ws="${escapeAttr(ws.id)}"` : '';
    return `<div class="mobile-top-rail" role="toolbar" aria-label="Mobile workspace controls">
      <button class="mobile-rail-btn mobile-rail-page" data-mobile-action="workspace-prev" ${prevDisabled ? 'disabled' : ''} title="Previous workspace" aria-label="Previous workspace"><i class="fa-solid fa-chevron-left"></i></button>
      <button class="mobile-rail-btn mobile-rail-create" data-mobile-action="create-workspace" title="Create workspace" aria-label="Create workspace"><i class="fa-solid fa-plus"></i></button>
      <div class="mobile-rail-brand">${brand}</div>
      <button class="mobile-rail-btn mobile-rail-copy" data-mobile-action="copy-link" title="Copy link" aria-label="Copy link"><i class="fa-solid fa-link"></i></button>
      <button class="mobile-rail-btn mobile-rail-page" data-mobile-action="workspace-next" ${nextDisabled ? 'disabled' : ''} title="Next workspace" aria-label="Next workspace"><i class="fa-solid fa-chevron-right"></i></button>
    </div>`;
  }

  function ensureMobileTopRail() {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    const active = mobileActive();
    document.body.classList.toggle('mobile-top-rail-mounted', active);

    const existing = shell.querySelector(':scope > .mobile-top-rail') || shell.querySelector('.mobile-top-rail');
    document.querySelectorAll('.mobile-top-rail').forEach((el) => {
      if (el !== existing && !shell.contains(el)) el.remove();
    });

    if (!active) {
      existing?.remove?.();
      return;
    }

    const html = renderMobileTopRail();
    if (existing) {
      if (existing.outerHTML !== html) existing.outerHTML = html;
      return;
    }

    const topbar = shell.querySelector('.topbar');
    const host = document.createElement('div');
    host.innerHTML = html;
    const rail = host.firstElementChild;
    if (topbar?.nextSibling) shell.insertBefore(rail, topbar.nextSibling);
    else shell.insertBefore(rail, shell.firstChild);
  }

  function dispatchMobileTopAction(dataset, ws) {
    collapseMobileBadgeRows();
    const fake = document.createElement('button');
    Object.entries(dataset || {}).forEach(([key, value]) => { fake.dataset[key] = value; });
    if (ws?.id && !fake.dataset.ws) fake.dataset.ws = ws.id;
    document.body.appendChild(fake);
    try {
      return handleAction({ currentTarget: fake, target: fake, preventDefault(){}, stopPropagation(){} });
    } finally {
      fake.remove();
    }
  }

  function mobileTopRailClick(event) {
    const button = event.target?.closest?.('.mobile-top-rail [data-mobile-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const ws = activeWorkspace?.() || null;
    const action = button.dataset.mobileAction || '';
    if (action === 'workspace-prev') return dispatchMobileTopAction({ action: 'workspace-prev' }, ws);
    if (action === 'workspace-next') return dispatchMobileTopAction({ action: 'workspace-next' }, ws);
    if (action === 'copy-link') return dispatchMobileTopAction({ action: 'copy-share' }, ws);
    if (action === 'create-workspace') return dispatchMobileTopAction({ action: 'open-source-modal' }, null);
  }

  document.addEventListener('click', mobileTopRailClick, true);

  let mobileDensityRaf = 0;
  function scheduleMobileDensity() {
    if (mobileDensityRaf) return;
    mobileDensityRaf = requestAnimationFrame(() => {
      mobileDensityRaf = 0;
      markSingleSourceWorkspaces();
      compactMobilePostChips();
      ensureMobileTopRail();
    });
  }
  registerRenderWrapper(function renderWithMobile(next) {
    const result = next();
    scheduleMobileDensity();
    requestAnimationFrame(scheduleMobileDensity);
    setTimeout(scheduleMobileDensity, 80);
    return result;
  });

  try {
    const mobileMutationObserver = new MutationObserver(() => {
      if (mobileActive()) scheduleMobileDensity();
    });
    mobileMutationObserver.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  window.addEventListener('resize', scheduleMobileDensity, { passive: true });


  function syncMobileEmptyWorkspaceHintsInitial() {
    const active = typeof mobileActive === 'function'
      ? mobileActive()
      : Boolean(window.matchMedia?.('(max-width: 640px)')?.matches);
    if (!active) return;

    document.querySelectorAll('.workspace').forEach((workspace) => {
      const dropHint = workspace.querySelector(':scope > .workspace-drop-hint, .workspace-drop-hint');
      const emptyState = workspace.querySelector('.post-feed .empty-state, .empty-state');
      const hasRenderedCards = Boolean(workspace.querySelector('.lineage-post, article.lineage-post, .post-card, .node-card'));
      if (!emptyState) return;

      if (dropHint && !hasRenderedCards) {
        emptyState.classList.add('empty-state-workspace-instructions');
        emptyState.textContent = 'Drop lineage files, configs, folders, or zips into this workspace · or use the source button above.';
        dropHint.classList.add('workspace-drop-hint-hidden');
      } else {
        emptyState.classList.remove('empty-state-workspace-instructions');
        dropHint?.classList?.remove?.('workspace-drop-hint-hidden');
      }
    });
  }

  function scheduleMobileChromeStabilizeInitial() {
    requestAnimationFrame(() => {
      try { syncMobileSourceModeRows(); } catch (_) {}
      syncMobileEmptyWorkspaceHintsInitial();
    });
    setTimeout(() => {
      try { syncMobileSourceModeRows(); } catch (_) {}
      syncMobileEmptyWorkspaceHintsInitial();
    }, 120);
  }

  registerScheduleMobileDensityWrapper(function scheduleMobileDensityWithChromeStabilize(next) {
    const result = next();
    scheduleMobileChromeStabilizeInitial();
    return result;
  });
  registerRenderWrapper(function renderWithMobileChromeStabilize(next) {
    const result = next();
    scheduleMobileChromeStabilizeInitial();
    return result;
  });

  document.addEventListener('scroll', (event) => {
    if (!mobileActive()) return;
    const target = event.target;
    if (target?.closest?.('.post-feed') || target?.classList?.contains?.('post-feed')) {
      requestAnimationFrame(() => {
        try { syncMobileSourceModeRows(); } catch (_) {}
        syncMobileEmptyWorkspaceHintsInitial();
      });
    }
  }, true);


  function mobileWorkspaceIsEmpty(ws) {
    if (!ws) return false;
    if (ws.loading) return false;
    const nodeCount = Array.isArray(ws.nodes) ? ws.nodes.length : 0;
    const generatedCount = Array.isArray(ws.generated) ? ws.generated.length : 0;
    const fileCount = ws.files?.size || 0;
    const assetCount = ws.assets?.size || 0;
    return nodeCount === 0 && generatedCount === 0 && fileCount === 0 && assetCount === 0;
  }

  function restoreMobileTitleModeRows() {
    document.querySelectorAll('.workspace.mobile-title-mode-mounted').forEach((workspace) => {
      const strip = workspace.querySelector(':scope > .workspace-strip');
      const toolbar = workspace.querySelector(':scope > .feed-toolbar.discovery, :scope > .feed-toolbar');
      const feedMode = strip?.querySelector?.(':scope > .feed-mode');
      if (feedMode && toolbar) toolbar.insertBefore(feedMode, toolbar.firstChild);
      strip?.classList?.remove?.('mobile-title-mode-row');
      toolbar?.classList?.remove?.('mobile-tools-only');
      workspace.classList.remove('mobile-title-mode-mounted');
      workspace.classList.remove('empty-mobile-workspace');
    });
  }



  registerScheduleMobileChromeStabilizeWrapper(function scheduleMobileChromeStabilizeWithTitleMode(next) {
    const result = next();
    requestAnimationFrame(() => {
      try { syncMobileSourceModeRows(); } catch (_) {}
      try { syncMobileEmptyWorkspaceHintsInitial(); } catch (_) {}
    });
    setTimeout(() => {
      try { syncMobileSourceModeRows(); } catch (_) {}
      try { syncMobileEmptyWorkspaceHintsInitial(); } catch (_) {}
    }, 140);
    return result;
  });



  function sourceCountForWorkspace(ws, workspaceEl) {
    try {
      if (typeof workspaceSourceCount === 'function') return workspaceSourceCount(ws, workspaceEl);
    } catch (_) {}
    try {
      if (typeof countWorkspaceSources === 'function') return countWorkspaceSources(ws);
    } catch (_) {}
    try {
      ensureWorkspaceSources(ws);
      if (ws?.sources instanceof Map) return ws.sources.size;
      if (Array.isArray(ws?.sources)) return ws.sources.length;
    } catch (_) {}
    return ws ? 1 : 0;
  }

  function syncSingleSourceWorkspaces() {
    document.querySelectorAll('.workspace').forEach((workspace, index) => {
      let ws = null;
      try {
        ws = workspace.dataset.ws ? getWorkspace(workspace.dataset.ws) : ((app.workspaces || [])[index] || null);
      } catch (_) {}
      const count = sourceCountForWorkspace(ws, workspace);
      const single = Number.isFinite(count) ? count <= 1 : true;
      workspace.classList.toggle('single-source-state', single);
      workspace.dataset.sourceCount = String(count);
    });
  }

  function workspaceIsDiscoveryTree(ws) {
    if (!ws) return false;
    try {
      if (typeof selectedNode === 'function' && selectedNode(ws)) return false;
    } catch (_) {}
    return (ws.discoveryView || 'feed') === 'tree';
  }

  function syncMobileTreeChrome() {
    const active = typeof mobileActive === 'function'
      ? mobileActive()
      : Boolean(window.matchMedia?.('(max-width: 640px)')?.matches);
    let tree = false;
    try {
      const ws = typeof activeWorkspace === 'function' ? activeWorkspace() : null;
      tree = active && workspaceIsDiscoveryTree(ws);
    } catch (_) {}
    document.body.classList.toggle('mobile-discovery-tree', Boolean(tree));
    if (tree) {
      app.mobileGlobalActionsOpen = false;
      document.querySelectorAll('.mobile-global-actions-host').forEach((host) => {
        if (!host.querySelector('.mobile-fab')) return;
        host.classList.add('mobile-global-actions-hidden');
      });
    } else {
      document.querySelectorAll('.mobile-global-actions-host.mobile-global-actions-hidden').forEach((host) => host.classList.remove('mobile-global-actions-hidden'));
    }
  }

  function syncChrome() {
    try { syncSingleSourceWorkspaces(); } catch (_) {}
    try { syncMobileTreeChrome(); } catch (_) {}
  }



  registerScheduleMobileDensityWrapper(function scheduleMobileDensityWithChromeSync(next) {
    const result = next();
    requestAnimationFrame(syncChrome);
    return result;
  });
  registerRenderWrapper(function renderWithMobileChromeSync(next) {
    const result = next();
    requestAnimationFrame(syncChrome);
    setTimeout(syncChrome, 90);
    return result;
  });

  try {
    const observer = new MutationObserver(() => requestAnimationFrame(syncChrome));
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

  window.addEventListener('resize', () => requestAnimationFrame(syncChrome), { passive: true });



  function storageJsonGet(key, fallback = null) {
    return storageReadJson(localStorage, key, fallback);
  }

  function storageKeyLabel(key) {
    const text = String(key || '');
    if (text.length <= 140) return text;
    return `${text.slice(0, 68)}…${text.slice(-28)} (${text.length} chars, id ${hashFast(text)})`;
  }

  function storageJsonSet(key, value) {
    let json = '';
    try {
      json = storageWriteJson(localStorage, key, value);
      return true;
    } catch (error) {
      const bytes = json ? localStateJsonSize(json) : 0;
      reportRuntimeError(`Could not write browser storage key ${storageKeyLabel(key)} (${bytes} bytes)`, error);
      return false;
    }
  }

  function sessionStorageJsonGet(key, fallback = null) {
    return storageReadJson(sessionStorage, key, fallback);
  }

  function sessionStorageJsonSet(key, value) {
    let json = '';
    try {
      json = storageWriteJson(sessionStorage, key, value);
      return true;
    } catch (error) {
      const bytes = json ? localStateJsonSize(json) : 0;
      reportRuntimeError(`Could not write browser session storage key ${storageKeyLabel(key)} (${bytes} bytes)`, error);
      return false;
    }
  }

  function rememberCurrentLocalStateId(id) {
    try {
      if (id) localStorage.setItem(STORAGE_KEYS.localWorkspaceCurrent, id);
      else localStorage.removeItem(STORAGE_KEYS.localWorkspaceCurrent);
    } catch (_) {}
  }

  function currentLocalStateCandidateId() {
    let current = '';
    try { current = localStorage.getItem(STORAGE_KEYS.localWorkspaceCurrent) || ''; } catch (_) {}
    if (current && localStateStoredSnapshot(current)?.workspaces?.length) return current;

    return readLocalStateRegistry()
      .map((entry) => Object.assign({}, entry, { snapshot: localStateStoredSnapshot(entry.id) }))
      .filter((entry) => entry.snapshot?.workspaces?.length)
      .sort((a, b) => String(b.updatedAt || b.snapshot.updatedAt || '').localeCompare(String(a.updatedAt || a.snapshot.updatedAt || '')))[0]?.id || '';
  }

  function startupHasExplicitSharedState() {
    const params = new URLSearchParams(location.search || '');
    if (params.get('url')) return true;
    return /^#(?:state|view)=/i.test(location.hash || '');
  }

  function restoreLocalStateSnapshotSilently(id) {
    const state = localStateStoredSnapshot(id);
    if (!id || !state || !Array.isArray(state.workspaces) || !state.workspaces.length) return false;
    const entry = readLocalStateRegistry().find((item) => item.id === id);
    app.modal = null;
    app.localState.currentId = id;
    app.localState.currentDisplayName = entry?.displayName || state.displayName || 'Local workspace';
    rememberCurrentLocalStateId(id);
    if (app.workspaces.length) {
      const restored = restoreLocalStateIntoCurrentWorkspaces(state);
      if (!app.activeWorkspaceId) app.activeWorkspaceId = app.workspaces[0]?.id || null;
      extendStoredScrollRestoreWindow();
      return restored;
    }
    app.localState.restoring = true;
    try {
      app.workspaces = [];
      app.activeWorkspaceId = null;
      app.workspaceOffset = Number(state.workspaceOffset || 0);
      (state.workspaces || []).forEach(restoreWorkspaceFromLocalState);
      if (state.viewerIdentity) app.viewerIdentity = Object.assign(app.viewerIdentity || {}, state.viewerIdentity);
    } finally {
      app.localState.restoring = false;
    }
    if (state.activeWorkspaceLabel) {
      const active = app.workspaces.find((ws) => ws.label === state.activeWorkspaceLabel);
      if (active) app.activeWorkspaceId = active.id;
    }
    if (!app.activeWorkspaceId) app.activeWorkspaceId = app.workspaces[0]?.id || null;
    extendStoredScrollRestoreWindow();
    return true;
  }

  function maybeRestoreLocalStateAtStartup() {
    if (app.localState.startupRestoreAttempted || app.localState.restoring || app.isBootingFromUrl) return false;
    app.localState.startupRestoreAttempted = true;
    const id = currentLocalStateCandidateId();
    if (!id) return false;

    // A refresh in file:// mode normally carries a compact view hash. That hash
    // restores the remote/default workspace shape, while the local-state profile
    // contains only unsaved local deltas. Do not let the view hash suppress the
    // local-delta merge once workspaces are present.
    if (startupHasExplicitSharedState() && !app.workspaces.length) return false;
    return restoreLocalStateSnapshotSilently(id);
  }



  function scrollSourceSignature(ws) {
    try {
      const urls = typeof workspaceSourceUrls === 'function' ? workspaceSourceUrls(ws).join('\n') : '';
      return urls ? hashFast(urls) : '';
    } catch (_) {
      return '';
    }
  }

  function visibleScrollFeedForMode(ws, mode = 'discovery') {
    if (!ws?.id) return null;
    const selector = `.post-feed.${mode}[data-ws="${CSS.escape(ws.id)}"]`;
    return Array.from(document.querySelectorAll(selector)).find((feed) => {
      const rect = feed.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function scrollModeFromElement(ws, el = null) {
    const feed = el?.classList?.contains?.('post-feed') ? el : el?.closest?.('.post-feed[data-ws]');
    if (feed?.classList?.contains('lineage')) return 'lineage';
    if (feed?.classList?.contains('discovery')) return 'discovery';

    // When the page itself is the scroll container there is no direct feed
    // event target. Prefer the rendered/visible feed for the workspace before
    // falling back to selectedNode. This prevents inactive state from making an
    // F5 restore read/write the wrong mode after view changes.
    const visibleLineage = visibleScrollFeedForMode(ws, 'lineage');
    const visibleDiscovery = visibleScrollFeedForMode(ws, 'discovery');
    if (visibleLineage && !visibleDiscovery) return 'lineage';
    if (visibleDiscovery && !visibleLineage) return 'discovery';
    return selectedNode(ws) ? 'lineage' : 'discovery';
  }

  function scrollContainerCandidatesForMode(ws, mode = 'discovery') {
    if (!ws?.id) return [];
    const id = CSS.escape(ws.id);
    const selected = selectedNode(ws);
    const selectors = mode === 'lineage'
      ? [
        `.post-feed.lineage[data-ws="${id}"]${selected ? `[data-selected="${CSS.escape(selected.id)}"]` : ''}`,
        `.post-feed.lineage[data-ws="${id}"]`,
        `.workspace[data-ws="${id}"] .feed-pane`,
        `.workspace[data-ws="${id}"] .workspace-body`,
        `.workspace[data-ws="${id}"]`
      ]
      : [
        `.post-feed.discovery[data-ws="${id}"]`,
        `.workspace[data-ws="${id}"] .feed-pane`,
        `.workspace[data-ws="${id}"] .workspace-body`,
        `.workspace[data-ws="${id}"]`
      ];
    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter(Boolean);
    const page = document.scrollingElement || document.documentElement || document.body;
    if (page) candidates.push(page);
    return candidates.filter((el, index, arr) => arr.indexOf(el) === index);
  }

  function bestScrollElementForMode(ws, mode = 'discovery') {
    const candidates = scrollContainerCandidatesForMode(ws, mode);
    return candidates.find((el) => !pageScrollTarget(el) && Math.round(el.scrollTop || 0) > 0)
      || candidates.find((el) => !pageScrollTarget(el) && (el.scrollHeight - el.clientHeight) > 8)
      || candidates.find((el) => pageScrollTarget(el) && pageScrollTop() > 0)
      || candidates[0]
      || null;
  }

  function storedScrollContentSignature(ws, mode = 'discovery') {
    if (mode === 'discovery' && typeof discoverySignatureForScroll === 'function') {
      return discoverySignatureForScroll(ws);
    }
    const selected = mode === 'lineage' ? selectedNode(ws) : null;
    const paths = (ws?.nodes || [])
      .map((node) => node?.path || node?.id || '')
      .filter(Boolean)
      .sort()
      .join('\n');
    // Lineage restore must be stable across refresh and workspace/source runtime
    // identity churn. Source signatures remain key material, but the restore
    // guard is the selected artifact plus rendered node set.
    return hashFast([mode || '', selected?.path || '', paths].join('\n'));
  }

  function scrollContentIdentity(ws, modeOverride = '') {
    const mode = modeOverride || scrollModeFromElement(ws);
    const selected = mode === 'lineage' ? selectedNode(ws) : null;
    const contentSignature = storedScrollContentSignature(ws, mode);
    return {
      workspace: ws?.label || ws?.id || 'workspace',
      source: scrollSourceSignature(ws),
      mode,
      selectedPath: selected?.path || '',
      contentSignature,
      discoverySignature: mode === 'discovery' ? contentSignature : ''
    };
  }

  function storedScrollKey(ws, identity = null) {
    const id = identity || scrollContentIdentity(ws);
    // Source-specific key for precise matches. A stable fallback key is written
    // separately below so refresh restore can still find the last scroll even
    // if source signatures are unavailable or re-ordered during startup.
    const scope = [
      location.pathname || '/',
      location.search || '',
      id.workspace || '',
      id.source || '',
      id.mode || '',
      id.selectedPath || ''
    ].join('\n');
    return `${STORAGE_KEYS.browserScrollStatePrefix}${hashFast(scope)}`;
  }

  function storedScrollStableKey(ws, identity = null) {
    const id = identity || scrollContentIdentity(ws);
    const scope = [
      location.pathname || '/',
      location.search || '',
      id.workspace || '',
      id.mode || '',
      id.selectedPath || ''
    ].join('\n');
    return `${STORAGE_KEYS.browserScrollStatePrefix}active.${hashFast(scope)}`;
  }

  function pruneRetiredScrollStorage() {
    const retiredScrollPrefix = 'tiinex.routeScroll.';
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(retiredScrollPrefix))
        .forEach((key) => localStorage.removeItem(key));
    } catch (_) {}
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith(STORAGE_KEYS.browserScrollStatePrefix) && key.length > 140)
        .forEach((key) => sessionStorage.removeItem(key));
    } catch (_) {}
  }

  function documentScrollMax() {
    return Math.max(
      0,
      Math.round(Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      ) - window.innerHeight)
    );
  }

  function pageScrollTop() {
    return Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0));
  }

  function scrollElementTop(el) {
    if (!el) return 0;
    if (pageScrollTarget(el)) return pageScrollTop();
    return Math.max(0, Math.round(el.scrollTop || 0));
  }

  function scrollTargetKind(el) {
    return pageScrollTarget(el) ? 'page' : 'element';
  }

  function scrollTargetRole(ws, el, mode = '') {
    if (!el) return '';
    if (pageScrollTarget(el)) return 'page';
    const root = ws?.id ? document.querySelector(`.workspace[data-ws="${CSS.escape(ws.id)}"]`) : null;
    const checks = [
      ['post-feed.discovery', '.post-feed.discovery'],
      ['post-feed.lineage', '.post-feed.lineage'],
      ['feed-pane', '.feed-pane'],
      ['workspace-body', '.workspace-body'],
      ['detail-pane', '.detail-pane'],
      ['workspace', '.workspace']
    ];
    for (const [role, selector] of checks) {
      try {
        if (el.matches?.(selector)) return role;
        if (root && root.querySelector?.(selector) === el) return role;
      } catch (_) {}
    }
    return mode || 'element';
  }

  function scrollElementForRole(ws, role, mode = 'discovery') {
    if (!ws?.id || !role) return null;
    if (role === 'page') return document.scrollingElement || document.documentElement || document.body;
    const root = document.querySelector(`.workspace[data-ws="${CSS.escape(ws.id)}"]`);
    if (!root) return null;
    const roleSelectors = {
      'post-feed.discovery': '.post-feed.discovery[data-ws]',
      'post-feed.lineage': '.post-feed.lineage[data-ws]',
      'feed-pane': '.feed-pane',
      'workspace-body': '.workspace-body',
      'detail-pane': '.detail-pane',
      'workspace': '.workspace'
    };
    const selector = roleSelectors[role] || '';
    return selector ? root.querySelector(selector) : null;
  }

  function applyScrollTopToTarget(el, top) {
    const targetTop = Math.max(0, Math.round(Number(top || 0)));
    if (!el || !targetTop) {
      scrollFlightRecord('dom:setScrollTop:skip', { reason: !el ? 'no-target' : 'no-target-top', requestedTop: targetTop });
      return false;
    }
    const before = scrollRestoreDebugTargetState(el);
    if (pageScrollTarget(el)) {
      const maxPageTop = documentScrollMax();
      if (maxPageTop <= 0) {
        scrollFlightRecord('dom:setScrollTop:skip', { reason: 'page-not-scrollable', requestedTop: targetTop, before });
        return false;
      }
      const nextTop = Math.min(targetTop, maxPageTop);
      app.restoringStoredScroll = true;
      try {
        window.scrollTo({ top: nextTop, left: window.scrollX || 0, behavior: 'auto' });
      } finally {
        requestAnimationFrame(() => { app.restoringStoredScroll = false; });
      }
      const immediateTop = pageScrollTop();
      const applied = Math.abs(immediateTop - nextTop) <= 4;
      scrollFlightRecord('dom:setScrollTop', {
        requestedTop: targetTop,
        nextTop,
        applied,
        before,
        afterImmediate: scrollRestoreDebugTargetState(el)
      }, { console: true });
      requestAnimationFrame(() => scrollFlightRecord('dom:setScrollTop:after-raf', {
        requestedTop: targetTop,
        nextTop,
        target: scrollRestoreDebugTargetState(el)
      }));
      setTimeout(() => scrollFlightRecord('dom:setScrollTop:after-100ms', {
        requestedTop: targetTop,
        nextTop,
        target: scrollRestoreDebugTargetState(el)
      }), 100);
      return applied;
    }
    const maxTop = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
    if (maxTop <= 0) {
      scrollFlightRecord('dom:setScrollTop:skip', { reason: 'target-not-scrollable', requestedTop: targetTop, before });
      return false;
    }
    const nextTop = Math.min(targetTop, maxTop);
    app.restoringStoredScroll = true;
    try {
      el.scrollTop = nextTop;
    } finally {
      requestAnimationFrame(() => { app.restoringStoredScroll = false; });
    }
    const immediateTop = Math.max(0, Math.round(el.scrollTop || 0));
    const applied = Math.abs(immediateTop - nextTop) <= 4;
    scrollFlightRecord('dom:setScrollTop', {
      requestedTop: targetTop,
      nextTop,
      applied,
      before,
      afterImmediate: scrollRestoreDebugTargetState(el)
    }, { console: true });
    requestAnimationFrame(() => scrollFlightRecord('dom:setScrollTop:after-raf', {
      requestedTop: targetTop,
      nextTop,
      target: scrollRestoreDebugTargetState(el)
    }));
    setTimeout(() => scrollFlightRecord('dom:setScrollTop:after-100ms', {
      requestedTop: targetTop,
      nextTop,
      target: scrollRestoreDebugTargetState(el)
    }), 100);
    return applied;
  }

  function uniqueScrollTargets(items) {
    return items.filter(Boolean).filter((item, index, arr) => arr.indexOf(item) === index);
  }

  function scrollRestoreDebugEnabled() {
    try {
      return sessionStorage.getItem('tiinex.debug.scrollRestore') === '1'
        || new URLSearchParams(location.search || '').has('debugScroll');
    } catch (_) {
      return false;
    }
  }

  function scrollFlightRecorderEnabled() {
    try {
      return sessionStorage.getItem('tiinex.debug.scrollFlight') === '1'
        || new URLSearchParams(location.search || '').has('debugScrollFlight');
    } catch (_) {
      return false;
    }
  }

  function scrollFlightConsoleEnabled() {
    try {
      return sessionStorage.getItem('tiinex.debug.scrollConsole') === '1'
        || new URLSearchParams(location.search || '').has('debugScrollConsole');
    } catch (_) {
      return false;
    }
  }

  function scrollFlightRouteSourceSummary(source) {
    if (!source || typeof source !== 'object') return null;
    return {
      label: source.label || '',
      mode: source.mode || '',
      selectedPath: source.selectedPath || '',
      selectedNodeId: source.selectedNodeId || '',
      selectedTitle: source.selectedTitle || '',
      discoveryView: source.discoveryView || '',
      discoveryFilterSchema: source.discoveryFilterSchema || source.filterSchema || '',
      discoverySearch: source.discoverySearch || '',
      lineageSearch: source.lineageSearch || '',
      scrollTop: Number(source.scrollTop || source.feedScrollTop || 0) || 0,
      scrollMode: source.scrollMode || '',
      scrollSelectedPath: source.scrollSelectedPath || '',
      discoveryScrollSignature: source.discoveryScrollSignature || '',
      urlCount: Array.isArray(source.urls) ? source.urls.length : undefined
    };
  }

  function scrollFlightRouteStateSummary(state) {
    if (!state || typeof state !== 'object') return null;
    const sources = Array.isArray(state.workspaces) ? state.workspaces : (Array.isArray(state.sources) ? state.sources : []);
    return {
      v: state.v,
      kind: state.kind || 'route',
      activeIndex: Number(state.activeIndex || 0),
      workspaceOffset: Number(state.workspaceOffset || 0),
      sourceCount: sources.length,
      sources: sources.map(scrollFlightRouteSourceSummary)
    };
  }

  function scrollFlightDecodedRouteSummary() {
    try { return scrollFlightRouteStateSummary(decodedLensState?.()); } catch (_) { return null; }
  }

  function scrollFlightLensCacheSummary() {
    try { return scrollFlightRouteStateSummary(cachedLensState?.()); } catch (_) { return null; }
  }

  function scrollFlightFirstVisibleAnchor(feed) {
    if (!feed || pageScrollTarget(feed)) return null;
    const feedRect = feed.getBoundingClientRect?.();
    if (!feedRect) return null;
    const posts = Array.from(feed.querySelectorAll('.lineage-post[data-node], .post-card[data-node], .node-card[data-node]'));
    let best = null;
    for (const post of posts) {
      const rect = post.getBoundingClientRect?.();
      if (rect && rect.bottom >= feedRect.top + 8) {
        best = post;
        break;
      }
    }
    if (!best) best = posts[0] || null;
    if (!best) return null;
    const rect = best.getBoundingClientRect?.();
    const ws = getWorkspace(best.closest?.('[data-ws]')?.dataset?.ws || feed.dataset?.ws || '');
    const node = ws?.nodeById?.get?.(best.dataset.node || '') || null;
    return {
      nodeId: best.dataset.node || '',
      path: node?.path || '',
      title: node?.title || '',
      offsetTop: rect && feedRect ? Math.round(rect.top - feedRect.top) : null
    };
  }

  function scrollFlightFeedMetrics(target) {
    if (!target || pageScrollTarget(target)) return {};
    const root = target.closest?.('.workspace[data-ws]') || (target.matches?.('.workspace[data-ws]') ? target : null);
    const ws = getWorkspace(target.dataset?.ws || root?.dataset?.ws || '');
    const isFeed = target.classList?.contains('post-feed');
    const renderedCards = isFeed ? target.querySelectorAll('.lineage-post[data-node], .post-card[data-node], .node-card[data-node]').length : 0;
    const moreButtons = root
      ? Array.from(root.querySelectorAll('[data-action="load-more-discovery"], [data-action="lineage-load-more"]'))
        .map((button) => {
          const rect = button.getBoundingClientRect?.();
          return {
            action: button.dataset?.action || '',
            text: String(button.textContent || '').replace(/\s+/g, ' ').trim(),
            visible: Boolean(rect && rect.width > 0 && rect.height > 0)
          };
        })
      : [];
    return {
      renderedCards,
      dataSelected: target.dataset?.selected || '',
      firstVisibleAnchor: isFeed ? scrollFlightFirstVisibleAnchor(target) : null,
      hasMore: moreButtons.some((button) => button.visible),
      moreButtons,
      workspaceNodeCount: Array.isArray(ws?.nodes) ? ws.nodes.length : null,
      discoveryVisibleCount: Number(ws?.discoveryVisibleCount || 0),
      discoveryInitialCount: Number(app.settings?.discoveryFeedInitialCount || 0),
      discoveryGrowCount: Number(app.settings?.discoveryFeedGrowCount || 0),
      loading: Boolean(ws?.loading)
    };
  }

  function scrollFlightWorkspaceSummary(ws) {
    if (!ws) return null;
    let selected = null;
    try {
      const node = selectedNode(ws);
      selected = node ? { id: node.id || '', path: node.path || '', title: node.title || '' } : null;
    } catch (_) {}
    return {
      id: ws.id || '',
      label: ws.label || '',
      active: ws.id === app.activeWorkspaceId,
      selected,
      routeScrollTop: Number(ws.routeScrollTop || 0),
      routeScrollMode: ws.routeScrollMode || '',
      routeScrollSelectedPath: ws.routeScrollSelectedPath || '',
      discoveryView: ws.discoveryView || 'feed',
      discoveryFilterSchema: ws.discoveryFilterSchema || ws.filterSchema || 'all',
      discoverySearch: ws.discoverySearch || '',
      lineageSearch: ws.lineageSearch || '',
      discoveryVisibleCount: Number(ws.discoveryVisibleCount || 0),
      nodeCount: Array.isArray(ws.nodes) ? ws.nodes.length : 0,
      loading: Boolean(ws.loading),
      discoveryFeed: scrollRestoreDebugTargetState(scrollElementForRole(ws, 'post-feed.discovery', 'discovery')),
      lineageFeed: scrollRestoreDebugTargetState(scrollElementForRole(ws, 'post-feed.lineage', 'lineage')),
      workspace: scrollRestoreDebugTargetState(document.querySelector(`.workspace[data-ws="${CSS.escape(ws.id || '')}"]`))
    };
  }

  function scrollFlightSnapshot(reason = 'snapshot') {
    return {
      reason,
      activeWorkspaceId: app.activeWorkspaceId || '',
      workspaceOffset: Number(app.workspaceOffset || 0),
      url: `${location.pathname}${location.search}${location.hash}`,
      decodedRoute: scrollFlightDecodedRouteSummary(),
      lensCache: scrollFlightLensCacheSummary(),
      page: {
        top: pageScrollTop(),
        max: documentScrollMax(),
        scrollHeight: Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0),
        clientHeight: window.innerHeight
      },
      workspaces: (app.workspaces || []).map(scrollFlightWorkspaceSummary)
    };
  }

  function scrollFlightRecord(label, details = {}, options = {}) {
    if (!scrollFlightRecorderEnabled()) return;
    const entry = Object.assign({
      label,
      t: Math.round(performance.now()),
      href: location.href,
      scrollY: pageScrollTop(),
      activeWorkspaceId: app.activeWorkspaceId || '',
      until: Math.round(app.storageScrollRestoreUntil || 0)
    }, details || {});
    try {
      if (!app.scrollFlightLog) app.scrollFlightLog = [];
      app.scrollFlightLog.push(entry);
      if (app.scrollFlightLog.length > 1800) app.scrollFlightLog.shift();
      window.__tiinexScrollFlight = app.scrollFlightLog;
      if (options.console || scrollFlightConsoleEnabled()) console.warn('[tiinex:scrollFlight]', label, entry);
    } catch (_) {}
  }

  function scrollRestoreDebugSummarySaved(saved) {
    if (!saved) return null;
    return {
      top: Number(saved.top || 0),
      mode: saved.mode || '',
      selectedPath: saved.selectedPath || '',
      source: saved.source || '',
      targetRole: saved.targetRole || '',
      targetKind: saved.targetKind || '',
      reason: saved.reason || '',
      at: Number(saved.at || 0),
      atIso: saved.at ? new Date(saved.at).toISOString() : '',
      contentSignature: saved.contentSignature || saved.discoverySignature || ''
    };
  }

  function scrollRestoreDebugSummaryIdentity(identity) {
    if (!identity) return null;
    return {
      workspace: identity.workspace || '',
      source: identity.source || '',
      mode: identity.mode || '',
      selectedPath: identity.selectedPath || '',
      contentSignature: identity.contentSignature || identity.discoverySignature || ''
    };
  }

  function scrollRestoreDebugTargetLabel(target) {
    if (!target) return '';
    if (pageScrollTarget(target)) return 'page';
    const classes = String(target.className || '').trim().split(/\s+/).filter(Boolean);
    if (classes.includes('post-feed') && classes.includes('discovery')) return 'post-feed.discovery';
    if (classes.includes('post-feed') && classes.includes('lineage')) return 'post-feed.lineage';
    if (classes.includes('feed-pane')) return 'feed-pane';
    if (classes.includes('workspace-body')) return 'workspace-body';
    if (classes.includes('workspace')) return 'workspace';
    return target.tagName || 'element';
  }

  function scrollRestoreDebugTargetState(target) {
    if (!target) return null;
    const rect = target.getBoundingClientRect?.();
    return {
      label: scrollRestoreDebugTargetLabel(target),
      ws: target.dataset?.ws || '',
      top: scrollElementTop(target),
      max: pageScrollTarget(target) ? documentScrollMax() : Math.max(0, Math.round((target.scrollHeight || 0) - (target.clientHeight || 0))),
      scrollHeight: pageScrollTarget(target) ? Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0) : Math.round(target.scrollHeight || 0),
      clientHeight: pageScrollTarget(target) ? window.innerHeight : Math.round(target.clientHeight || 0),
      rectTop: rect ? Math.round(rect.top) : null,
      rectHeight: rect ? Math.round(rect.height) : null,
      visible: pageScrollTarget(target) ? true : Boolean(rect && rect.width > 0 && rect.height > 0),
      metrics: scrollFlightFeedMetrics(target)
    };
  }

  function scrollRestoreDebugWorkspaceState(ws) {
    if (!ws) return null;
    const mode = scrollModeFromElement(ws);
    return {
      id: ws.id || '',
      label: ws.label || '',
      mode,
      selectedPath: mode === 'lineage' ? (selectedNode(ws)?.path || '') : '',
      discoveryFeed: scrollRestoreDebugTargetState(scrollElementForRole(ws, 'post-feed.discovery', 'discovery')),
      lineageFeed: scrollRestoreDebugTargetState(scrollElementForRole(ws, 'post-feed.lineage', 'lineage')),
      bestDiscovery: scrollRestoreDebugTargetState(bestScrollElementForMode(ws, 'discovery')),
      bestLineage: scrollRestoreDebugTargetState(bestScrollElementForMode(ws, 'lineage'))
    };
  }

  function debugScrollRestore(label, details = {}) {
    if (!scrollRestoreDebugEnabled()) return;
    const entry = Object.assign({
      label,
      t: Math.round(performance.now()),
      href: location.href,
      scrollY: pageScrollTop(),
      until: Math.round(app.storageScrollRestoreUntil || 0),
      cancelled: scrollRestoreCancelledByUser()
    }, details || {});
    try {
      if (!app.scrollRestoreDebugLog) app.scrollRestoreDebugLog = [];
      app.scrollRestoreDebugLog.push(entry);
      if (app.scrollRestoreDebugLog.length > 800) app.scrollRestoreDebugLog.shift();
      window.__tiinexScrollRestoreDebugLog = app.scrollRestoreDebugLog;
      scrollFlightRecord(`routeScroll:${label}`, entry);
      if (scrollFlightConsoleEnabled() || /^(apply|chase:complete|chase:deadline|read:fallback-hit|read:key-hit|write:skip|restoreAll:skip)/u.test(label)) {
        console.warn('[tiinex:scrollRestore]', label, entry);
      }
    } catch (_) {}
  }

  function scrollRestoreDebugTickAllowed(doneKey, elapsed = 0) {
    if (!scrollRestoreDebugEnabled()) return false;
    if (!app.scrollRestoreDebugTicks) app.scrollRestoreDebugTicks = new Map();
    const prev = app.scrollRestoreDebugTicks.get(doneKey) || { count: 0, lastElapsed: -1000 };
    const allowed = prev.count < 8 || elapsed - prev.lastElapsed >= 500;
    if (allowed) app.scrollRestoreDebugTicks.set(doneKey, { count: prev.count + 1, lastElapsed: elapsed });
    return allowed;
  }


  function writeStoredScroll(ws, el = null, modeOverride = '', options = {}) {
    if (!ws || app.routing?.restoring || app.isBootingFromUrl) {
      debugScrollRestore('write:skip', { reason: !ws ? 'no-workspace' : (app.routing?.restoring ? 'routing-restoring' : 'booting-from-url') });
      return false;
    }
    const mode = modeOverride || scrollModeFromElement(ws, el);
    const eventTop = scrollElementTop(el);
    const target = el && (eventTop > 0 || !pageScrollTarget(el))
      ? el
      : (bestScrollElementForMode(ws, mode) || activeScrollableFeed(ws));
    if (!target) {
      debugScrollRestore('write:skip', { reason: 'no-target', mode, workspace: scrollRestoreDebugWorkspaceState(ws) });
      return false;
    }
    const identity = scrollContentIdentity(ws, mode);
    const top = scrollElementTop(target);
    const targetRole = scrollTargetRole(ws, target, mode);
    const targetKind = scrollTargetKind(target);
    if (!top && Number(ws.routeScrollTop || 0) > 0 && performance.now() <= (app.storageScrollRestoreUntil || 0)) {
      debugScrollRestore('write:skip-zero-route-top', {
        mode,
        routeScrollTop: ws.routeScrollTop,
        target: scrollRestoreDebugTargetState(target),
        identity: scrollRestoreDebugSummaryIdentity(identity),
        reason: options.reason || 'scroll'
      });
      return false;
    }
    const key = storedScrollKey(ws, identity);
    const stableKey = storedScrollStableKey(ws, identity);
    const existing = sessionStorageJsonGet(key, null) || sessionStorageJsonGet(stableKey, null);
    if (!top && Number(existing?.top || 0) > 0 && !String(targetRole || '').startsWith('post-feed.')) {
      // A mode that is not currently rendered can fall back to the workspace
      // shell at scrollTop 0 during lifecycle flushes. Do not let that inactive
      // shell zero overwrite the last real feed scroll for the mode.
      debugScrollRestore('write:skip-inactive-shell-zero', {
        mode,
        targetRole,
        targetKind,
        existing: scrollRestoreDebugSummarySaved(existing),
        target: scrollRestoreDebugTargetState(target),
        identity: scrollRestoreDebugSummaryIdentity(identity),
        reason: options.reason || 'scroll'
      });
      return false;
    }
    if (TiinexViewState.shouldPreserveStoredScrollOnZeroWrite({
      preserveNonZero: options.preserveNonZero,
      nextTop: top,
      existingTop: existing?.top || 0
    })) {
      debugScrollRestore('write:skip-preserve-nonzero', {
        mode,
        existing: scrollRestoreDebugSummarySaved(existing),
        target: scrollRestoreDebugTargetState(target),
        identity: scrollRestoreDebugSummaryIdentity(identity),
        reason: options.reason || 'scroll'
      });
      return false;
    }
    ws.routeScrollTop = top;
    ws.routeScrollMode = identity.mode;
    ws.routeScrollSelectedPath = identity.selectedPath;
    const value = Object.assign({}, identity, {
      top,
      targetKind,
      targetRole,
      at: Date.now(),
      reason: options.reason || 'scroll'
    });
    const wroteSpecific = sessionStorageJsonSet(key, value);
    const wroteStable = sessionStorageJsonSet(stableKey, value);
    debugScrollRestore('write', {
      key,
      stableKey,
      wroteSpecific,
      wroteStable,
      saved: scrollRestoreDebugSummarySaved(value),
      target: scrollRestoreDebugTargetState(target),
      reason: options.reason || 'scroll'
    });
    return wroteSpecific || wroteStable;
  }

  function storedScrollMatchesIdentity(saved, current) {
    if (!saved || !current || !Number.isFinite(Number(saved.top))) return false;
    if (saved.mode !== current.mode) return false;
    if ((saved.selectedPath || '') !== (current.selectedPath || '')) return false;

    // Source signatures are useful as key material but too brittle as the only
    // lookup guard during refresh. Content signatures decide whether a restore
    // is still valid when workspace runtime ids change between page loads.
    const savedContent = saved.contentSignature || saved.discoverySignature || '';
    const currentContent = current.contentSignature || current.discoverySignature || '';
    if (savedContent && currentContent && savedContent !== currentContent) return false;
    return true;
  }

  function scanStoredScrollFallback(current) {
    // Workspace ids are runtime ids and can legitimately change after F5. Direct
    // keys are preferred, but refresh restore must be able to recover the latest
    // matching scroll by mode + selected path + content signature when the key
    // was written under a previous workspace id.
    try {
      const all = Object.keys(sessionStorage)
        .filter((key) => key.startsWith(STORAGE_KEYS.browserScrollStatePrefix))
        .map((key) => sessionStorageJsonGet(key, null))
        .filter(Boolean);
      const nonzero = all.filter((saved) => Number(saved?.top || 0) > 0);
      const matches = nonzero
        .filter((saved) => storedScrollMatchesIdentity(saved, current))
        .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
      const winner = matches[0] || null;
      debugScrollRestore('scanFallback', {
        current: scrollRestoreDebugSummaryIdentity(current),
        storedCount: all.length,
        nonzeroCount: nonzero.length,
        matchCount: matches.length,
        matches: matches.slice(0, 6).map(scrollRestoreDebugSummarySaved),
        winner: scrollRestoreDebugSummarySaved(winner)
      });
      return winner;
    } catch (error) {
      debugScrollRestore('scanFallback:error', { message: error?.message || String(error) });
      return null;
    }
  }

  function readStoredScroll(ws) {
    if (!ws) {
      debugScrollRestore('read:no-workspace');
      return null;
    }
    const activeMode = scrollModeFromElement(ws);
    const modes = TiinexViewState.preferredStoredScrollModes(activeMode);
    const identities = modes.map((mode) => scrollContentIdentity(ws, mode));
    debugScrollRestore('read:start', {
      workspace: scrollRestoreDebugWorkspaceState(ws),
      activeMode,
      modes,
      identities: identities.map(scrollRestoreDebugSummaryIdentity)
    });
    for (const current of identities) {
      const keys = [storedScrollKey(ws, current), storedScrollStableKey(ws, current)]
        .filter((key, index, arr) => key && arr.indexOf(key) === index);
      for (const key of keys) {
        const saved = sessionStorageJsonGet(key, null);
        const matches = Number(saved?.top || 0) > 0 && storedScrollMatchesIdentity(saved, current);
        debugScrollRestore('read:key', {
          key,
          current: scrollRestoreDebugSummaryIdentity(current),
          saved: scrollRestoreDebugSummarySaved(saved),
          matches
        });
        if (matches) {
          debugScrollRestore('read:key-hit', { key, saved: scrollRestoreDebugSummarySaved(saved) });
          return saved;
        }
      }
      const fallback = scanStoredScrollFallback(current);
      if (fallback) {
        debugScrollRestore('read:fallback-hit', {
          current: scrollRestoreDebugSummaryIdentity(current),
          saved: scrollRestoreDebugSummarySaved(fallback)
        });
        return fallback;
      }
    }
    debugScrollRestore('read:no-match', {
      activeMode,
      identities: identities.map(scrollRestoreDebugSummaryIdentity)
    });
    return null;
  }

  function storedScrollElement(ws, saved) {
    if (!ws) return null;
    const mode = saved?.mode || 'discovery';
    const roleTarget = scrollElementForRole(ws, saved?.targetRole || '', mode);
    if (roleTarget) return roleTarget;
    if (saved?.targetKind === 'page') return document.scrollingElement || document.documentElement || document.body;
    return bestScrollElementForMode(ws, mode) || activeScrollableFeed(ws);
  }

  function scrollTargetMatchesSavedTop(target, saved) {
    if (!target || !saved) return false;
    const top = Math.max(0, Math.round(Number(saved.top || 0)));
    if (!top) return false;
    const maxTop = pageScrollTarget(target) ? documentScrollMax() : Math.max(0, (target.scrollHeight || 0) - (target.clientHeight || 0));
    if (maxTop <= 0) return false;
    const expected = Math.min(top, Math.round(maxTop));
    return Math.abs(scrollElementTop(target) - expected) <= 6;
  }

  function preferredStoredScrollCompletionTarget(ws, saved) {
    if (!ws || !saved) return null;
    const mode = saved.mode || 'discovery';
    if (saved.targetKind === 'page' || saved.targetRole === 'page') {
      return document.scrollingElement || document.documentElement || document.body;
    }
    const roleTarget = scrollElementForRole(ws, saved.targetRole || '', mode);
    if (roleTarget) return roleTarget;
    return storedScrollElement(ws, saved);
  }

  function discoveryRestoreWindowState(ws, savedTop = 0, targetState = null) {
    const visible = discoveryVisibleCount(ws);
    let all = [];
    try { all = filteredDiscoveryNodes(ws) || []; } catch (_) { all = ws?.nodes || []; }
    const total = Array.isArray(all) ? all.length : 0;
    const grow = Math.max(8, Number(app.settings.discoveryFeedGrowCount || 48));
    const top = Math.max(0, Math.round(Number(savedTop || 0)));
    const max = Math.max(0, Math.round(Number(targetState?.max || 0)));
    const canGrow = total > visible;
    return {
      top,
      max,
      visible,
      total,
      grow,
      canGrow,
      nextVisible: canGrow ? Math.min(total, visible + grow) : visible,
      needsMoreForTop: Boolean(top && max > 0 && max < top && canGrow)
    };
  }

  function ensureDiscoveryWindowForStoredScroll(ws, saved, targetState = null) {
    if (!ws || !saved || (saved.mode || 'discovery') !== 'discovery') return false;
    const state = discoveryRestoreWindowState(ws, saved.top, targetState);
    if (!state.needsMoreForTop) {
      if (state.top && state.max > 0 && state.max < state.top && !state.canGrow) {
        debugScrollRestore('apply:discovery-more-unavailable', {
          saved: scrollRestoreDebugSummarySaved(saved),
          windowState: state,
          workspace: scrollRestoreDebugWorkspaceState(ws),
          target: targetState
        });
      }
      return false;
    }

    const previousVisible = Number(ws.discoveryVisibleCount || 0);
    if (previousVisible >= state.nextVisible) return false;
    ws.discoveryVisibleCount = state.nextVisible;
    ws.discoveryWindowSig = discoveryWindowSignature(ws);
    ws.scrollRestoreAutoMoreCount = Number(ws.scrollRestoreAutoMoreCount || 0) + 1;
    extendStoredScrollRestoreWindow();
    scrollFlightRecord('more:discovery-auto-restore', {
      beforeVisibleCount: state.visible,
      afterVisibleCount: ws.discoveryVisibleCount,
      total: state.total,
      saved: scrollRestoreDebugSummarySaved(saved),
      target: targetState,
      workspace: scrollRestoreDebugWorkspaceState(ws)
    }, { console: true });
    debugScrollRestore('apply:discovery-auto-more', {
      saved: scrollRestoreDebugSummarySaved(saved),
      windowState: state,
      afterVisibleCount: ws.discoveryVisibleCount,
      workspace: scrollRestoreDebugWorkspaceState(ws),
      target: targetState
    });
    try { render(); } catch (error) {
      debugScrollRestore('apply:discovery-auto-more-render-error', { message: error?.message || String(error) });
    }
    return true;
  }

  function applyStoredScrollOnce(ws, saved) {
    const top = Math.max(0, Math.round(Number(saved?.top || 0)));
    if (!ws || !top) {
      debugScrollRestore('apply:skip', { reason: !ws ? 'no-workspace' : 'no-top', saved: scrollRestoreDebugSummarySaved(saved) });
      return false;
    }
    const mode = saved?.mode || 'discovery';
    const savedContent = saved?.contentSignature || saved?.discoverySignature || '';
    const currentContent = storedScrollContentSignature(ws, mode);
    if (savedContent && currentContent && savedContent !== currentContent) {
      debugScrollRestore('apply:reject-content', {
        mode,
        saved: scrollRestoreDebugSummarySaved(saved),
        savedContent,
        currentContent,
        workspace: scrollRestoreDebugWorkspaceState(ws)
      });
      return false;
    }

    if (mode === 'discovery') {
      const currentDiscoverySig = discoverySignatureForScroll(ws);
      if (saved.discoverySignature && currentDiscoverySig !== saved.discoverySignature) {
        debugScrollRestore('apply:reject-discovery-signature', {
          saved: scrollRestoreDebugSummarySaved(saved),
          currentDiscoverySig
        });
        return false;
      }

      // Discovery can temporarily make the page/workspace scrollable before the
      // feed finishes laying out. Applying to that interim target is useful, but
      // it must not complete the restore. Complete only once the saved target
      // role itself is present, scrollable and holding the requested position.
      const preferredTarget = preferredStoredScrollCompletionTarget(ws, saved);
      const page = document.scrollingElement || document.documentElement || document.body;
      const targets = uniqueScrollTargets([
        preferredTarget,
        storedScrollElement(ws, saved),
        scrollElementForRole(ws, 'post-feed.discovery', 'discovery'),
        scrollElementForRole(ws, 'feed-pane', 'discovery'),
        scrollElementForRole(ws, 'workspace-body', 'discovery'),
        scrollElementForRole(ws, 'workspace', 'discovery'),
        bestScrollElementForMode(ws, 'discovery'),
        page
      ]);
      const before = targets.map(scrollRestoreDebugTargetState);
      const preferredTargetInitialState = scrollRestoreDebugTargetState(preferredTarget);
      if (!preferredTarget || Number(preferredTargetInitialState?.max || 0) <= 0) {
        // CP94: content-aware restore readiness. Discovery often renders the
        // feed shell before the posts are mounted. Do not apply scroll to an
        // empty feed or a interim page/workspace target; keep the pending
        // restore alive until the saved target role is actually scrollable.
        debugScrollRestore('apply:wait-content-ready', {
          saved: scrollRestoreDebugSummarySaved(saved),
          preferredBefore: preferredTargetInitialState,
          before,
          reason: !preferredTarget ? 'no-preferred-target' : 'preferred-target-not-scrollable'
        });
        return false;
      }
      if (ensureDiscoveryWindowForStoredScroll(ws, saved, preferredTargetInitialState)) {
        return false;
      }
      const attempts = [];
      for (const target of targets) {
        const beforeTop = scrollElementTop(target);
        const applied = applyScrollTopToTarget(target, top);
        attempts.push({
          target: scrollRestoreDebugTargetState(target),
          beforeTop,
          applied
        });
      }
      // Metric contract: return scrollTargetMatchesSavedTop(preferredTarget, saved);
      const done = scrollTargetMatchesSavedTop(preferredTarget, saved);
      debugScrollRestore('apply:discovery', {
        saved: scrollRestoreDebugSummarySaved(saved),
        preferredBefore: preferredTargetInitialState,
        before,
        attempts,
        done
      });
      return done;
    }

    const preferredTarget = preferredStoredScrollCompletionTarget(ws, saved);
    const before = scrollRestoreDebugTargetState(preferredTarget);
    if (!preferredTarget || Number(before?.max || 0) <= 0) {
      debugScrollRestore('apply:wait-content-ready', {
        mode,
        saved: scrollRestoreDebugSummarySaved(saved),
        preferredBefore: before,
        workspace: scrollRestoreDebugWorkspaceState(ws),
        reason: !preferredTarget ? 'no-preferred-target' : 'preferred-target-not-scrollable'
      });
      return false;
    }
    const applied = applyScrollTopToTarget(preferredTarget, top);
    const done = applied && scrollTargetMatchesSavedTop(preferredTarget, saved);
    debugScrollRestore('apply:lineage-primary', {
      saved: scrollRestoreDebugSummarySaved(saved),
      preferredBefore: before,
      preferredAfter: scrollRestoreDebugTargetState(preferredTarget),
      applied,
      done
    });
    if (done) return true;

    // Keep the Lineage fallback narrow: a page fallback may help responsive
    // layouts, but it must not mark restore complete unless page was the saved
    // target. Otherwise a transient early target could mask the real feed later.
    const page = document.scrollingElement || document.documentElement || document.body;
    if (saved?.targetKind === 'page') {
      const pageApplied = applyScrollTopToTarget(page, top);
      const pageDone = pageApplied && scrollTargetMatchesSavedTop(page, saved);
      debugScrollRestore('apply:lineage-page-fallback', {
        saved: scrollRestoreDebugSummarySaved(saved),
        page: scrollRestoreDebugTargetState(page),
        pageApplied,
        pageDone
      });
      return pageDone;
    }
    return false;
  }

  function chaseStoredScrollForWorkspace(ws, durationMs = STORED_SCROLL_CHASE_DURATION_MS) {
    if (!ws) {
      debugScrollRestore('chase:skip', { reason: 'no-workspace' });
      return;
    }
    if (scrollRestoreCancelledByUser()) {
      debugScrollRestore('chase:skip', { reason: 'cancelled', workspace: scrollRestoreDebugWorkspaceState(ws) });
      return;
    }
    const saved = readStoredScroll(ws);
    if (!saved || !Number(saved.top)) {
      debugScrollRestore('chase:no-saved', { workspace: scrollRestoreDebugWorkspaceState(ws), saved: scrollRestoreDebugSummarySaved(saved) });
      return;
    }
    const doneKey = scrollRestoreCompletionKey('stored', ws, saved);
    const completed = completedScrollRestoreSet();
    if (completed.has(doneKey)) {
      const preferred = preferredStoredScrollCompletionTarget(ws, saved);
      const stillHolding = scrollTargetMatchesSavedTop(preferred, saved);
      if (stillHolding) {
        debugScrollRestore('chase:already-complete', { doneKey, saved: scrollRestoreDebugSummarySaved(saved), workspace: scrollRestoreDebugWorkspaceState(ws), preferred: scrollRestoreDebugTargetState(preferred) });
        return;
      }
      // CP96: a restore can be correct for one frame and then be reset by a
      // follow-up render while Discovery/Lineage loading is still settling. A
      // completed marker is only valid while the saved target still holds the
      // requested top; otherwise resume the chase and re-apply.
      completed.delete(doneKey);
      debugScrollRestore('chase:complete-invalidated', { doneKey, saved: scrollRestoreDebugSummarySaved(saved), workspace: scrollRestoreDebugWorkspaceState(ws), preferred: scrollRestoreDebugTargetState(preferred) });
    }
    ws.routeScrollTop = Number(saved.top) || 0;
    ws.routeScrollMode = saved.mode || 'discovery';
    ws.routeScrollSelectedPath = saved.selectedPath || '';
    const started = performance.now();
    let stableSince = 0;
    let lastTickAt = 0;
    debugScrollRestore('chase:start', { doneKey, durationMs, stableMs: STORED_SCROLL_STABLE_COMPLETION_MS, saved: scrollRestoreDebugSummarySaved(saved), workspace: scrollRestoreDebugWorkspaceState(ws) });
    const tick = () => {
      const now = performance.now();
      if (now - lastTickAt < 12) {
        requestAnimationFrame(tick);
        return;
      }
      lastTickAt = now;
      const elapsed = Math.round(now - started);
      const preferred = preferredStoredScrollCompletionTarget(ws, saved);
      const holding = scrollTargetMatchesSavedTop(preferred, saved);
      if (completed.has(doneKey) && holding) {
        debugScrollRestore('chase:tick-skip', { reason: 'complete', elapsed, doneKey, preferred: scrollRestoreDebugTargetState(preferred) });
        return;
      }
      if (completed.has(doneKey) && !holding) {
        completed.delete(doneKey);
        stableSince = 0;
        debugScrollRestore('chase:complete-invalidated', { elapsed, doneKey, saved: scrollRestoreDebugSummarySaved(saved), preferred: scrollRestoreDebugTargetState(preferred), workspace: scrollRestoreDebugWorkspaceState(ws) });
      }
      if (scrollRestoreCancelledByUser()) {
        debugScrollRestore('chase:tick-skip', { reason: 'cancelled', elapsed, doneKey, workspace: scrollRestoreDebugWorkspaceState(ws) });
        return;
      }
      if (scrollRestoreDebugTickAllowed(doneKey, elapsed)) {
        debugScrollRestore('chase:tick', {
          elapsed,
          doneKey,
          stableFor: stableSince ? Math.round(now - stableSince) : 0,
          saved: scrollRestoreDebugSummarySaved(saved),
          workspace: scrollRestoreDebugWorkspaceState(ws),
          preferred: scrollRestoreDebugTargetState(preferred)
        });
      }
      if (holding) {
        if (!stableSince) {
          stableSince = now;
          debugScrollRestore('chase:hold-start', {
            elapsed,
            doneKey,
            stableMs: STORED_SCROLL_STABLE_COMPLETION_MS,
            saved: scrollRestoreDebugSummarySaved(saved),
            preferred: scrollRestoreDebugTargetState(preferred)
          });
        }
        if (now - stableSince >= STORED_SCROLL_STABLE_COMPLETION_MS) {
          completed.add(doneKey);
          debugScrollRestore('chase:complete-stable', {
            elapsed,
            stableFor: Math.round(now - stableSince),
            doneKey,
            saved: scrollRestoreDebugSummarySaved(saved),
            workspace: scrollRestoreDebugWorkspaceState(ws),
            preferred: scrollRestoreDebugTargetState(preferred)
          });
          return;
        }
      } else {
        stableSince = 0;
        const done = applyStoredScrollOnce(ws, saved);
        if (done) {
          stableSince = performance.now();
          debugScrollRestore('chase:hold-start', {
            elapsed,
            doneKey,
            stableMs: STORED_SCROLL_STABLE_COMPLETION_MS,
            saved: scrollRestoreDebugSummarySaved(saved),
            preferred: scrollRestoreDebugTargetState(preferredStoredScrollCompletionTarget(ws, saved)),
            source: 'after-apply'
          });
        }
      }
      if (performance.now() - started < durationMs) requestAnimationFrame(tick);
      else debugScrollRestore('chase:deadline', {
        elapsed,
        doneKey,
        saved: scrollRestoreDebugSummarySaved(saved),
        workspace: scrollRestoreDebugWorkspaceState(ws),
        preferred: scrollRestoreDebugTargetState(preferredStoredScrollCompletionTarget(ws, saved))
      });
    };
    requestAnimationFrame(tick);
    setTimeout(tick, 80);
    setTimeout(tick, 240);
    setTimeout(tick, 700);
    setTimeout(tick, 1500);
    setTimeout(tick, 3200);
    setTimeout(tick, 6500);
  }

  function restoreStoredScrollForAll() {
    if (performance.now() > (app.storageScrollRestoreUntil || 0)) {
      debugScrollRestore('restoreAll:skip', { reason: 'deadline' });
      return;
    }
    if (scrollRestoreCancelledByUser()) {
      debugScrollRestore('restoreAll:skip', { reason: 'cancelled' });
      return;
    }
    debugScrollRestore('restoreAll:start', {
      workspaceCount: (app.workspaces || []).length,
      workspaces: (app.workspaces || []).map(scrollRestoreDebugWorkspaceState)
    });
    for (const ws of app.workspaces || []) chaseStoredScrollForWorkspace(ws);
  }

  pruneRetiredScrollStorage();
  extendStoredScrollRestoreWindow();

  function onStoredScrollCapture(event) {
    if (app.restoringStoredScroll) {
      debugScrollRestore('capture:skip', { reason: 'restoringStoredScroll' });
      return;
    }
    const el = event.target;
    if (!el) {
      debugScrollRestore('capture:skip', { reason: 'no-target' });
      return;
    }
    if (editableElementActive() && (el.matches?.('input, textarea, select, [contenteditable="true"]') || el.closest?.('.modal-panel'))) {
      debugScrollRestore('capture:skip', { reason: 'editable-active' });
      return;
    }
    const pageScroll = pageScrollTarget(el);
    const target = pageScroll ? (document.scrollingElement || document.documentElement || document.body) : el;
    const ws = pageScroll ? activeWorkspace() : (scrollEventWorkspace(el) || getWorkspace(el.dataset?.ws || ''));
    if (!ws) {
      debugScrollRestore('capture:skip', { reason: 'no-workspace', target: scrollRestoreDebugTargetState(target) });
      return;
    }

    // During boot/refresh the browser can emit a zero-position scroll event before
    // the feed has finished rendering. Do not let that erase a valid saved scroll.
    if (performance.now() <= (app.storageScrollRestoreUntil || 0) && scrollElementTop(target) === 0) {
      const saved = readStoredScroll(ws);
      if (saved && Number(saved.top || 0) > 0) {
        debugScrollRestore('capture:skip-zero-during-restore-window', {
          target: scrollRestoreDebugTargetState(target),
          workspace: scrollRestoreDebugWorkspaceState(ws),
          saved: scrollRestoreDebugSummarySaved(saved)
        });
        return;
      }
    }

    debugScrollRestore('capture', { target: scrollRestoreDebugTargetState(target), workspace: scrollRestoreDebugWorkspaceState(ws) });
    writeStoredScroll(ws, target);
  }

  document.addEventListener('scroll', onStoredScrollCapture, true);

  function writeStoredScrollSnapshot(reason = 'snapshot') {
    let wrote = false;
    scrollFlightRecord('routeScroll:snapshot-start', {
      reason,
      snapshot: scrollFlightSnapshot(`before-${reason}`)
    });
    for (const ws of app.workspaces || []) {
      const mode = scrollModeFromElement(ws);
      wrote = writeStoredScroll(ws, null, mode, { preserveNonZero: true, reason }) || wrote;
    }
    scrollFlightRecord('routeScroll:snapshot-end', {
      reason,
      wrote,
      snapshot: scrollFlightSnapshot(`after-${reason}`)
    });
    return wrote;
  }

  window.addEventListener('pagehide', () => {
    writeStoredScrollSnapshot('pagehide');
  });
  window.addEventListener('beforeunload', () => {
    writeStoredScrollSnapshot('beforeunload');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) writeStoredScrollSnapshot('visibilitychange');
  });

  function scheduleStoredScrollRestore() {
    if (!scrollRestoreCancelledByUser()) extendStoredScrollRestoreWindow();
    debugScrollRestore('schedule', {
      workspaceCount: (app.workspaces || []).length,
      workspaces: (app.workspaces || []).map(scrollRestoreDebugWorkspaceState)
    });
    requestAnimationFrame(restoreStoredScrollForAll);
    setTimeout(restoreStoredScrollForAll, 160);
    setTimeout(restoreStoredScrollForAll, 650);
    setTimeout(restoreStoredScrollForAll, 1500);
    setTimeout(restoreStoredScrollForAll, 3200);
    setTimeout(restoreStoredScrollForAll, 6500);
    setTimeout(restoreStoredScrollForAll, 12000);
    setTimeout(restoreStoredScrollForAll, 22000);
    setTimeout(restoreStoredScrollForAll, 36000);
  }

  registerRenderWrapper(function renderWithStoredBrowserState(next) {
    maybeRestoreLocalStateAtStartup();
    const result = next();
    scheduleStoredScrollRestore();
    return result;
  });

  try {
    let storedScrollMutationTimer = 0;
    const storedScrollObserver = new MutationObserver(() => {
      if (performance.now() > (app.storageScrollRestoreUntil || 0)) return;
      clearTimeout(storedScrollMutationTimer);
      storedScrollMutationTimer = setTimeout(scheduleStoredScrollRestore, 40);
    });
    storedScrollObserver.observe(document.body, { childList: true, subtree: true });
  } catch (_) {}

window.addEventListener('popstate', () => {
    if (scrollFlightRecorderEnabled()) {
      scrollFlightRecord('history:popstate', {
        historyState: scrollFlightRouteStateSummary(history.state),
        decodedRoute: scrollFlightDecodedRouteSummary(),
        snapshot: scrollFlightSnapshot('popstate-before')
      });
    }
    restoreRouteFromBrowserHistory();
    if (scrollFlightRecorderEnabled()) {
      scrollFlightRecord('history:popstate-after', { snapshot: scrollFlightSnapshot('popstate-after') });
    }
  });

  registerSetRouteStateWrapper(function setRouteStateWithOptionalScrollFlight(kind = 'push', next) {
    if (!scrollFlightRecorderEnabled()) {
      next(kind);
      return;
    }
    const beforeUrl = `${location.pathname}${location.search}${location.hash}`;
    const beforeDecoded = scrollFlightDecodedRouteSummary();
    const beforeSnapshot = scrollFlightSnapshot('before-setRouteState');
    next(kind);
    scrollFlightRecord('viewState:setRouteState', {
      kind,
      beforeUrl,
      afterUrl: `${location.pathname}${location.search}${location.hash}`,
      beforeDecoded,
      afterDecoded: scrollFlightDecodedRouteSummary(),
      lensCache: scrollFlightLensCacheSummary(),
      beforeSnapshot,
      afterSnapshot: scrollFlightSnapshot('after-setRouteState')
    });
  });

  registerRenderWrapper(function renderWithOptionalScrollFlightRecorder(next) {
    if (!scrollFlightRecorderEnabled()) return next();
    const before = scrollFlightSnapshot('render-before');
    const result = next();
    scrollFlightRecord('render:after', {
      before,
      after: scrollFlightSnapshot('render-after')
    });
    requestAnimationFrame(() => scrollFlightRecord('settle:raf', { snapshot: scrollFlightSnapshot('settle-raf') }));
    setTimeout(() => scrollFlightRecord('settle:100ms', { snapshot: scrollFlightSnapshot('settle-100ms') }), 100);
    setTimeout(() => scrollFlightRecord('settle:1s', { snapshot: scrollFlightSnapshot('settle-1s') }), 1000);
    setTimeout(() => scrollFlightRecord('settle:2s', { snapshot: scrollFlightSnapshot('settle-2s') }), 2000);
    setTimeout(() => scrollFlightRecord('settle:5s', { snapshot: scrollFlightSnapshot('settle-5s') }), 5000);
    return result;
  });

  loadViewerConfig()
    .then(() => bootFromUrl())
    .then(() => { if (typeof maybeOfferLocalStateRestore === 'function') maybeOfferLocalStateRestore(); })
    .then(render)
    .catch((error) => {
      reportRuntimeError('Startup failed', error);
      toast(`Startup failed: ${error.message}`, 'error');
      render();
    });

  function displayOptionsToolbarButton(ws) {
    const displayCount = typeof displayOptionsActiveCount === 'function' ? displayOptionsActiveCount(ws) : 0;
    const displayTitle = displayCount ? `${displayCount} display option${displayCount === 1 ? '' : 's'} active` : 'Display options';
    // Canonical discovery/search-rail display-options button. Keep the helper
    // explicit because renderWorkspaceFeed injects this control after removing
    // the older storage/actions toolbar placement.
    return `<button class="tv-btn tiny subtle display-options-action toolbar-display-options ${displayCount ? 'active' : ''}" data-action="open-display-options" data-ws="${escapeAttr(ws.id)}" title="${escapeAttr(displayTitle)}" aria-label="Display options"><i class="fa-solid fa-sliders"></i>${displayCount ? `<small>${displayCount}</small>` : ''}</button>`;
  }



  registerRenderWorkspaceWrapper(function renderWorkspaceWithStatsAndToolbar(ws, next) {
    let html = next(ws);
    // Source count is more closely tied to workspace identity than trace count, so it reads better first.
    html = html.replace(
      /(<span class="stat-pill" title="Trace files"><i class="fa-regular fa-file-lines"><\/i>[\s\S]*?<\/span>)\s*(<span class="stat-pill" title="Sources"><i class="fa-solid fa-database"><\/i>[\s\S]*?<\/span>)/,
      '$2$1'
    );
    // The display-options control belongs with discovery/search controls, not with workspace storage/actions.
    html = html.replace(
      /\s*<button class="tv-btn small subtle display-options-action[\s\S]*?data-action="open-display-options"[\s\S]*?aria-label="Display options">[\s\S]*?<\/button>/,
      ''
    );
    return html;
  });

  registerRenderWorkspaceFeedWrapper(function renderWorkspaceFeedWithToolbarDisplayOptions(ws, selected, next) {
    let html = next(ws, selected);
    const button = displayOptionsToolbarButton(ws);
    if (!selected) {
      html = html.replace(/(<div class="discovery-tools[^"\n]*">\s*)/, `$1${button}`);
    }
    return html;
  });



  // The mobile density pipeline had accumulated several MutationObserver-driven
  // post-render passes. One of them rebuilt badge rows on every mutation by
  // removing the +N button, appending a probe, re-appending chips, and creating a
  // fresh +N button. DevTools made that visible as a hot DOM update loop. Keep
  // the same visual behavior, but make the post-render passes idempotent: do not
  // write the DOM when the current row already matches the desired packed state.
  function classToggleIfChanged(el, className, enabled) {
    if (!el?.classList) return false;
    const has = el.classList.contains(className);
    if (Boolean(enabled) === has) return false;
    el.classList.toggle(className, Boolean(enabled));
    return true;
  }


  function setTextIfChanged(el, value) {
    if (!el) return false;
    const next = String(value || '');
    if (el.textContent === next) return false;
    el.textContent = next;
    return true;
  }

  function resetChipRowIfDirty(row) {
    if (!row) return;
    const more = Array.from(row.querySelectorAll('.mobile-chip-more'));
    more.forEach((el) => el.remove());
    Array.from(row.children).forEach((el) => {
      el.classList?.remove?.('mobile-chip-hidden');
    });
    row.classList.remove('single-source-chip-row', 'mobile-chip-packed');
    row.dataset.mobileChipsReadablePacked = '';
    row.dataset.mobileChipsWidthAware = '';
    row.dataset.mobileChipsDensityFitted = '';
    row.dataset.mobileChipsStablePacked = '';
    row.dataset.mobileChipSignature = '';
  }

  function mobileChipText(chip) {
    return String(chip?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function mobileChipClass(chip) {
    return String(chip?.className || '').toLowerCase();
  }

  function mobileChipIsDate(chip) {
    return /\b\d{4}-\d{2}-\d{2}\b/u.test(mobileChipText(chip));
  }

  function mobileChipIsSchema(chip) {
    const text = mobileChipText(chip);
    const cls = mobileChipClass(chip);
    return /badge-schema|schema-nav-badge/u.test(cls)
      || /\b(topic|task|decision|evidence|feedback|reduction|signal|pointer|runtime|machine runtime|ai runtime|lineage\.upgrade\.deferral|lineage upgrade|root|schema|continuation|capability|archive|broken|encrypted)\b/u.test(text);
  }

  function mobileChipIsSource(chip) {
    const text = mobileChipText(chip);
    const cls = mobileChipClass(chip);
    return /source-chip|source-badge|source-github|source-local|source-url|source-draft/u.test(cls)
      || /tiinex\/docs|github|local state|local\b/u.test(text);
  }

  function mobileChipPriority(chip, sourceCount) {
    const text = mobileChipText(chip);
    const cls = mobileChipClass(chip);
    const joined = `${text} ${cls}`;
    if (chip?.classList?.contains('mobile-card-more-chip')) return -1;
    if (/mismatch|missing|error|fail|danger/u.test(joined)) return 0;
    if (/verified|open|out of date|integrity|ok/u.test(joined)) return 1;
    if (mobileChipIsSchema(chip)) return 2;
    if (mobileChipIsDate(chip)) return 3;
    if (/refs?|image|material|attachment|asset|pdf|zip/u.test(joined)) return 4;
    if (mobileChipIsSource(chip)) return sourceCount <= 1 ? 10 : 5;
    if (/selected leaf|parent|child|ancestor|descendant/u.test(text)) return 6;
    return 7;
  }

  function mobileChipIsCoreStatus(chip) {
    const text = mobileChipText(chip);
    const cls = mobileChipClass(chip);
    return /mismatch|missing|error|fail|danger|verified|open|out of date|integrity|ok/u.test(`${text} ${cls}`);
  }

  function mobileCollapsedChipPlan(candidates, forcedHidden) {
    const status = candidates.find((chip) => mobileChipIsCoreStatus(chip));
    const schema = candidates.find((chip) => chip !== status && mobileChipIsSchema(chip));
    const date = candidates.find((chip) => chip !== status && chip !== schema && mobileChipIsDate(chip));
    const visible = [];
    if (status) visible.push(status);
    if (schema) visible.push(schema);
    if (date) visible.push(date);
    if (!visible.length && candidates.length) visible.push(candidates[0]);
    const visibleSet = new Set(visible);
    const hidden = candidates.filter((chip) => !visibleSet.has(chip)).concat(forcedHidden);
    return { visible, hidden };
  }

  function mobileChipWidthEstimate(chip) {
    if (!chip) return 0;
    const text = String(chip.textContent || '').replace(/\s+/g, ' ').trim();
    const textChars = Array.from(text).length;

    // Estimate the constrained mobile visual width, not the desktop/natural
    // chip width. The collapsed rail intentionally caps semantic chips so
    // status + schema + date can fit when the rendered mobile row visibly has
    // room for them. Using measured flex-compressed widths creates feedback
    // loops; using desktop-ish natural widths hides the date too early.
    let minWidth = 34;
    let maxWidth = 96;
    let charWidth = 5.1;
    let baseWidth = 22;

    if (mobileChipIsCoreStatus(chip)) {
      minWidth = 54;
      maxWidth = 76;
      charWidth = 4.8;
      baseWidth = 25;
    } else if (mobileChipIsSchema(chip)) {
      minWidth = 48;
      maxWidth = 88;
      charWidth = 4.9;
      baseWidth = 22;
    } else if (mobileChipIsDate(chip)) {
      minWidth = 62;
      maxWidth = 72;
      charWidth = 4.6;
      baseWidth = 24;
    }

    return Math.min(maxWidth, Math.max(minWidth, baseWidth + textChars * charWidth));
  }

  function mobileChipGap(row) {
    const style = window.getComputedStyle?.(row);
    const parsed = parseFloat(style?.columnGap || style?.gap || '');
    return Number.isFinite(parsed) ? parsed : 4;
  }

  function mobileMoreWidth(hiddenCount) {
    const digits = String(Math.max(1, hiddenCount || 1)).length;
    return 34 + Math.max(0, digits - 1) * 8;
  }

  function mobileCardActionChip(row) {
    return row?.querySelector?.(':scope > .mobile-card-select-parent-chip, :scope > .mobile-card-more-chip') || null;
  }

  function mobileActionChipWidthEstimate(row) {
    const actionChip = mobileCardActionChip(row);
    if (!actionChip) return 0;
    const rect = actionChip.getBoundingClientRect?.();
    const measured = rect && Number.isFinite(rect.width) ? Math.ceil(rect.width) : 0;
    const fallback = actionChip.classList?.contains('mobile-card-select-parent-chip') ? 30 : 34;
    return Math.max(measured || 0, fallback) + mobileChipGap(row);
  }

  function mobileChipPackingWidth(row) {
    const rectWidth = Math.floor(row?.getBoundingClientRect?.().width || 0);
    const clientWidth = Math.floor(row?.clientWidth || 0);
    const fallbackWidth = Math.floor(row?.closest?.('.lineage-post, article')?.clientWidth || 300);
    const rawWidth = clientWidth > 0 ? clientWidth : (rectWidth > 0 ? rectWidth : fallbackWidth);
    const style = window.getComputedStyle?.(row);
    const paddingLeft = parseFloat(style?.paddingLeft || '0') || 0;
    const paddingRight = parseFloat(style?.paddingRight || '0') || 0;
    let available = Math.max(0, Math.floor(rawWidth - paddingLeft - paddingRight));

    // Card action chips live in the first-row rail but are not semantic badges.
    // CSS reserves that rail through padding-right on the packed row. Only
    // subtract any action width not already covered by that padding; subtracting
    // both the padding and the action width makes the collapsed packer too
    // conservative and hides date/schema badges that visibly fit.
    const actionWidth = mobileActionChipWidthEstimate(row);
    available -= Math.max(0, actionWidth - paddingRight);
    return Math.max(0, available);
  }

  function packMobileChips(row, candidates, forcedHidden) {
    const gap = mobileChipGap(row);
    const available = mobileChipPackingWidth(row);
    const plan = mobileCollapsedChipPlan(candidates, forcedHidden);
    const hiddenCount = plan.hidden.length;
    const moreWidth = hiddenCount > 0 ? mobileMoreWidth(hiddenCount) : 0;
    const visible = [];
    const hidden = [];
    let used = 0;

    plan.visible.forEach((chip) => {
      const width = mobileChipWidthEstimate(chip);
      const nextGap = visible.length ? gap : 0;
      const reserve = hiddenCount > 0 ? gap + moreWidth : 0;
      const canFit = used + nextGap + width + reserve <= available;
      if (canFit || visible.length === 0) {
        visible.push(chip);
        used += nextGap + width;
      } else {
        hidden.push(chip);
      }
    });

    return { visible, hidden: hidden.concat(plan.hidden), available };
  }

  function rowSignature(visible, hidden, moreText, sourceCount, expanded, available) {
    const chipSignaturePart = (chips) => chips.map((chip) => {
      const className = mobileChipClass(chip).replace(/\bmobile-chip-hidden\b/gu, '').trim();
      return `${mobileChipText(chip)}::${className}`;
    }).join('|');
    return `s=${sourceCount};e=${expanded ? 1 : 0};w=${Math.floor(available || 0)};v=${chipSignaturePart(visible)};h=${chipSignaturePart(hidden)};m=${moreText || ''}`;
  }

  registerCompactMobilePostChipsWrapper(function compactMobilePostChipsIdempotent(next) {
    const rows = Array.from(document.querySelectorAll('.lineage-post .post-chips, article .post-chips'));
    const active = typeof mobileActive === 'function'
      ? mobileActive()
      : Boolean(window.matchMedia?.('(max-width: 640px)')?.matches);
    if (!active) {
      rows.forEach((row) => {
        if (row.dataset.mobileChipsStablePacked || row.querySelector('.mobile-chip-more, .mobile-chip-hidden')) {
          resetChipRowIfDirty(row);
        }
      });
      return;
    }

    rows.forEach((row) => {
      const expanded = row.classList.contains('mobile-chip-expanded');
      const workspaceEl = typeof workspaceDomForRow === 'function' ? workspaceDomForRow(row) : row.closest('.workspace');
      const ws = (typeof workspaceForRow === 'function' ? workspaceForRow(row) : null)
        || (workspaceEl?.dataset?.ws ? getWorkspace(workspaceEl.dataset.ws) : null);
      const sourceCount = typeof workspaceSourceCount === 'function' ? workspaceSourceCount(ws, workspaceEl) : 1;
      const cardActionChip = mobileCardActionChip(row);
      const chips = Array.from(row.children).filter((el) => el?.classList?.contains('badge-soft')
        && !el.classList.contains('mobile-card-more-chip')
        && !el.classList.contains('mobile-card-select-parent-chip')
        && !el.classList.contains('mobile-chip-more'));
      if (!chips.length) return;

      const sorted = chips.map((chip, index) => ({ chip, index })).sort((a, b) => {
        const pa = mobileChipPriority(a.chip, sourceCount);
        const pb = mobileChipPriority(b.chip, sourceCount);
        return pa === pb ? a.index - b.index : pa - pb;
      }).map((entry) => entry.chip);

      const forcedHidden = [];
      const candidates = [];
      sorted.forEach((chip) => {
        if (sourceCount <= 1 && mobileChipIsSource(chip)) forcedHidden.push(chip);
        else candidates.push(chip);
      });
      const collapsedPack = packMobileChips(row, candidates, forcedHidden);
      const packed = expanded ? { visible: candidates.concat(forcedHidden), hidden: [], available: collapsedPack.available } : collapsedPack;
      const visible = packed.visible;
      const hidden = packed.hidden;
      const moreText = hidden.length && !expanded ? `+${hidden.length}` : '';
      const signature = rowSignature(visible, hidden, moreText, sourceCount, expanded, packed.available);

      if (row.dataset.mobileChipSignature === signature) return;

      row.querySelectorAll('.mobile-chip-more').forEach((el) => el.remove());
      visible.concat(hidden).forEach((chip) => {
        chip.classList.remove('mobile-chip-hidden');
        const shouldHide = hidden.includes(chip) && !expanded;
        if (shouldHide) chip.classList.add('mobile-chip-hidden');
        if (chip.parentElement !== row || row.lastElementChild !== chip) row.appendChild(chip);
      });

      if (moreText) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'badge-soft mobile-chip-more';
        btn.dataset.mobileAction = 'toggle-card-chips';
        btn.textContent = moreText;
        btn.title = 'Show hidden badges';
        row.appendChild(btn);
      }
      if (cardActionChip) {
        cardActionChip.classList.remove('mobile-chip-hidden');
        row.classList.add('mobile-card-more-row');
        row.classList.toggle('mobile-card-parent-select-row', cardActionChip.classList.contains('mobile-card-select-parent-chip'));
        if (row.lastElementChild !== cardActionChip) row.appendChild(cardActionChip);
      }
      row.classList.toggle('single-source-chip-row', sourceCount <= 1);
      row.classList.add('mobile-chip-packed');
      row.dataset.mobileChipsReadablePacked = '1';
      row.dataset.mobileChipsWidthAware = '1';
      row.dataset.mobileChipsDensityFitted = '1';
      row.dataset.mobileChipsStablePacked = '1';
      row.dataset.sourceCount = String(sourceCount);
      row.dataset.mobileChipSignature = signature;
    });
  });

  registerEnsureMobileTopRailWrapper(function ensureMobileTopRailStable(next) {
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    const active = typeof mobileActive === 'function' ? mobileActive() : false;
    document.body.classList.toggle('mobile-top-rail-mounted', active);
    const existing = shell.querySelector(':scope > .mobile-top-rail') || shell.querySelector('.mobile-top-rail');
    if (!active) {
      if (existing) existing.remove();
      return;
    }
    const html = typeof renderMobileTopRail === 'function' ? renderMobileTopRail() : '';
    if (!html) return;
    if (existing && existing.dataset.stableHtml === html) return;
    if (existing && existing.outerHTML === html) {
      existing.dataset.stableHtml = html;
      return;
    }
    const host = document.createElement('div');
    host.innerHTML = html;
    const rail = host.firstElementChild;
    rail.dataset.stableHtml = html;
    if (existing) existing.replaceWith(rail);
    else {
      const topbar = shell.querySelector('.topbar');
      if (topbar?.nextSibling) shell.insertBefore(rail, topbar.nextSibling);
      else shell.insertBefore(rail, shell.firstChild);
    }
    shell.querySelectorAll(':scope > .mobile-top-rail').forEach((el) => {
      if (el !== rail) el.remove();
    });
  });

  registerSyncMobileEmptyWorkspaceHintsWrapper(function syncMobileEmptyWorkspaceHintsStable(next) {
    const active = typeof mobileActive === 'function'
      ? mobileActive()
      : Boolean(window.matchMedia?.('(max-width: 640px)')?.matches);
    document.querySelectorAll('.workspace').forEach((workspace) => {
      const ws = workspace.dataset.ws ? getWorkspace(workspace.dataset.ws) : null;
      const empty = active && (typeof mobileWorkspaceIsEmpty === 'function' ? mobileWorkspaceIsEmpty(ws) : false);
      const dropHint = workspace.querySelector('.workspace-drop-hint');
      const emptyState = workspace.querySelector('.post-feed .empty-state');
      classToggleIfChanged(workspace, 'empty-mobile-workspace', empty);
      if (empty && emptyState) {
        classToggleIfChanged(emptyState, 'empty-state-workspace-instructions', true);
        setTextIfChanged(emptyState, 'Add lineage files, configs, folders, or zips with the + button.');
        if (dropHint) classToggleIfChanged(dropHint, 'workspace-drop-hint-hidden', true);
      } else {
        if (emptyState) classToggleIfChanged(emptyState, 'empty-state-workspace-instructions', false);
        if (dropHint) classToggleIfChanged(dropHint, 'workspace-drop-hint-hidden', false);
      }
    });
  });

  let mobileDensityTimer = 0;
  registerScheduleMobileDensityWrapper(function scheduleMobileDensityCoalesced(next) {
    const result = next();
    if (mobileDensityTimer) window.clearTimeout(mobileDensityTimer);
    mobileDensityTimer = window.setTimeout(() => {
      mobileDensityTimer = 0;
      try { compactMobilePostChips(); } catch (_) {}
      try { syncMobileEmptyWorkspaceHintsInitial(); } catch (_) {}
    }, 120);
    return result;
  });

})();
