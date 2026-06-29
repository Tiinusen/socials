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
    isBootingFromUrl: false,
    closedDialogRouteSessions: new Set()
  };

  const STORAGE_KEYS = Object.freeze({
    authors: 'tiinex.viewer.authors',
    localWorkspaceRegistry: 'tiinex.localWorkspace.registry',
    localWorkspaceStatePrefix: 'tiinex.localWorkspace.state.',
    localWorkspaceCurrent: 'tiinex.localWorkspace.current',
    browserScrollStatePrefix: 'tiinex.routeScroll.state.',
    lensSessionPrefix: 'tiinex.lens.',
    appSettings: 'tiinex.app.settings',
    adapterRateLimitPrefix: 'tiinex.adapter.rateLimit.'
  });

  const APP_SETTING_DEFAULTS = Object.freeze({
    wizardDraftHashState: true
  });

  function appSettingSnapshot() {
    const out = {};
    for (const key of Object.keys(APP_SETTING_DEFAULTS)) out[key] = app.settings?.[key] !== false;
    return out;
  }

  function loadStoredAppSettings() {
    try {
      const stored = storageReadJson(localStorage, STORAGE_KEYS.appSettings, {});
      const clean = {};
      for (const key of Object.keys(APP_SETTING_DEFAULTS)) {
        if (typeof stored?.[key] === 'boolean') clean[key] = stored[key];
      }
      return clean;
    } catch (_) {
      return {};
    }
  }

  app.settings = Object.assign({}, APP_SETTING_DEFAULTS, loadStoredAppSettings(), app.settings || {});


  function adapterHeaderRecord(headers) {
    const record = {};
    try {
      if (headers && typeof headers.forEach === 'function') {
        headers.forEach((value, key) => { record[String(key || '').toLowerCase()] = String(value || ''); });
      }
    } catch (_) {}
    return record;
  }

  function adapterHeaders(record = {}) {
    const normalized = {};
    Object.keys(record || {}).forEach((key) => { normalized[String(key).toLowerCase()] = String(record[key] || ''); });
    return {
      record: normalized,
      get(name) { return normalized[String(name || '').toLowerCase()] || null; },
      has(name) { return Object.prototype.hasOwnProperty.call(normalized, String(name || '').toLowerCase()); }
    };
  }

  function adapterCachePolicyFromHeaders(headers = {}) {
    const h = adapterHeaders(headers);
    const cacheControl = String(h.get('cache-control') || '').toLowerCase();
    const expires = h.get('expires') || '';
    const now = Date.now();
    const maxAgeMatch = cacheControl.match(/(?:^|,|\s)max-age=(\d+)/i);
    let maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 0;
    if (!maxAgeMs && expires) {
      const t = Date.parse(expires);
      if (Number.isFinite(t) && t > now) maxAgeMs = t - now;
    }
    return {
      cacheControl,
      noStore: /(?:^|,|\s)no-store(?:\s|,|$)/i.test(cacheControl),
      noCache: /(?:^|,|\s)no-cache(?:\s|,|$)/i.test(cacheControl),
      private: /(?:^|,|\s)private(?:\s|,|$)/i.test(cacheControl),
      maxAgeMs: Math.max(0, Number(maxAgeMs) || 0),
      etag: h.get('etag') || '',
      lastModified: h.get('last-modified') || '',
      expires,
      vary: h.get('vary') || '',
      retryAfter: h.get('retry-after') || ''
    };
  }

  function adapterPreservationPolicyFromCachePolicy(policy = {}, authMode = 'none') {
    const reasons = [];
    if (policy.noStore) reasons.push('no-store');
    if (policy.private) reasons.push('private');
    if (authMode && authMode !== 'none') reasons.push('auth-scoped');
    let preservationPolicy = 'freelyPreservable';
    if (policy.noStore || (authMode && authMode !== 'none')) preservationPolicy = 'requiresExplicitChoice';
    else if (policy.private || policy.noCache) preservationPolicy = 'caution';
    return { preservationPolicy, preservationReasons: reasons };
  }

  function adapterIdForUrl(url = '') {
    try {
      const host = new URL(String(url || ''), location.href).hostname.toLowerCase();
      if (host === 'api.github.com') return 'github-rest';
      if (host === 'raw.githubusercontent.com') return 'github-raw';
      if (host === 'data.jsdelivr.com') return 'jsdelivr';
      return 'url-fetch';
    } catch (_) {
      return 'url-fetch';
    }
  }

  function adapterRateLimitKeyFor(url = '', adapter = '') {
    if (adapter === 'github-rest') return 'github-rest';
    try {
      const host = new URL(String(url || ''), location.href).hostname.toLowerCase();
      return `${adapter || 'url-fetch'}:${host}`;
    } catch (_) {
      return adapter || 'url-fetch';
    }
  }

  function adapterRateLimitStorageKey(key) {
    return `${STORAGE_KEYS.adapterRateLimitPrefix}${key}`;
  }

  function readAdapterRateLimit(key) {
    try { return storageReadJson(sessionStorage, adapterRateLimitStorageKey(key), null); } catch (_) { return null; }
  }

  function writeAdapterRateLimit(key, state) {
    try { storageWriteJson(sessionStorage, adapterRateLimitStorageKey(key), state || {}); } catch (_) {}
  }

  function clearAdapterRateLimit(key) {
    try { sessionStorage.removeItem(adapterRateLimitStorageKey(key)); } catch (_) {}
  }

  function adapterRetryAfterMs(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) return Number(raw) * 1000;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? Math.max(0, t - Date.now()) : 0;
  }

  function adapterRateLimitUntilFromHeaders(headers = {}) {
    const h = adapterHeaders(headers);
    const retryMs = adapterRetryAfterMs(h.get('retry-after') || '');
    if (retryMs) return Date.now() + retryMs;
    const remaining = h.get('x-ratelimit-remaining');
    const reset = h.get('x-ratelimit-reset');
    if (remaining === '0' && reset && /^\d+$/.test(reset)) return (Number(reset) * 1000) + 1500;
    return 0;
  }

  function adapterRateLimitMessage(label, until, reason = '') {
    const when = until ? new Date(until).toLocaleTimeString() : '';
    return `${label || 'Adapter'} is rate-limited${when ? ` until ${when}` : ''}${reason ? `: ${reason}` : ''}.`;
  }

  function makeAdapterError(message, meta = {}) {
    const error = new Error(message);
    Object.assign(error, meta || {});
    return error;
  }

  function adapterRequestKey(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const adapter = options.adapter || adapterIdForUrl(url);
    const headers = Object.assign({}, options.headers || {});
    const headerSig = Object.keys(headers).sort().map((key) => `${key.toLowerCase()}:${String(headers[key] || '')}`).join('|');
    return `${adapter}:${method}:${url}:${headerSig}`;
  }

  function ensureAdapterRuntime() {
    app.adapterRequests = app.adapterRequests || { inFlight: new Map(), memory: new Map() };
    return app.adapterRequests;
  }

  function clearAdapterRuntimeCache(match = '') {
    const runtime = ensureAdapterRuntime();
    if (!match) {
      runtime.memory.clear();
      return;
    }
    for (const key of Array.from(runtime.memory.keys())) {
      if (key.includes(match)) runtime.memory.delete(key);
    }
  }

  async function adapterRequest(url, options = {}) {
    const adapter = options.adapter || adapterIdForUrl(url);
    const label = options.label || (adapter === 'github-rest' ? 'GitHub API' : adapter === 'github-raw' ? 'GitHub raw' : 'External source');
    const rateLimitKey = options.rateLimitKey || adapterRateLimitKeyFor(url, adapter);
    const key = adapterRequestKey(url, Object.assign({}, options, { adapter }));
    const runtime = ensureAdapterRuntime();
    const now = Date.now();
    const cached = runtime.memory.get(key);
    if (!options.hardRefresh && cached && cached.expiresAt && cached.expiresAt > now) {
      return Object.assign({}, cached.result, { fromRuntimeCache: true, cacheState: 'runtime-cache' });
    }

    const guard = readAdapterRateLimit(rateLimitKey);
    if (guard?.until && Number(guard.until) > now) {
      throw makeAdapterError(adapterRateLimitMessage(label, Number(guard.until), guard.reason || ''), {
        adapter,
        status: 429,
        rateLimited: true,
        rateLimitUntil: Number(guard.until),
        rateLimitKey,
        cacheState: 'rate-limited'
      });
    }

    if (runtime.inFlight.has(key)) return runtime.inFlight.get(key);

    const promise = (async () => {
      const fetchHeaders = Object.assign({}, options.headers || {});
      const cacheMode = options.hardRefresh ? 'reload' : (options.cacheMode || 'default');
      const response = await fetch(url, {
        method: options.method || 'GET',
        mode: options.mode || 'cors',
        credentials: options.credentials || 'omit',
        cache: cacheMode,
        headers: fetchHeaders
      });
      const headerRecord = adapterHeaderRecord(response.headers);
      const headerApi = adapterHeaders(headerRecord);
      const rateUntil = adapterRateLimitUntilFromHeaders(headerRecord);
      if (rateUntil) {
        writeAdapterRateLimit(rateLimitKey, {
          adapter,
          until: rateUntil,
          reason: response.status ? `${response.status} ${response.statusText || ''}`.trim() : 'rate-limit headers',
          updatedAt: new Date().toISOString()
        });
      } else if (response.ok) {
        clearAdapterRateLimit(rateLimitKey);
      }

      const text = await response.text();
      let data = null;
      if (options.parse === 'json') {
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      }
      const policy = adapterCachePolicyFromHeaders(headerRecord);
      const preservation = adapterPreservationPolicyFromCachePolicy(policy, options.authMode || 'none');
      const meta = {
        adapter,
        url,
        status: response.status,
        statusText: response.statusText || '',
        ok: response.ok,
        headers: headerApi,
        headerRecord,
        cachePolicy: policy,
        cacheState: options.hardRefresh ? 'refreshed' : 'cache-aware',
        rateLimitKey,
        rateLimitUntil: rateUntil || 0,
        preservationPolicy: preservation.preservationPolicy,
        preservationReasons: preservation.preservationReasons
      };

      if (!response.ok) {
        const apiMessage = data?.message ? `: ${data.message}` : '';
        const rateHint = rateUntil ? ` (retry after ${new Date(rateUntil).toLocaleTimeString()})` : '';
        throw makeAdapterError(`${response.status} ${response.statusText || ''}${apiMessage}${rateHint}`.trim(), Object.assign(meta, {
          errorBody: text,
          rateLimited: Boolean(rateUntil || response.status === 429)
        }));
      }

      const result = Object.assign({ text, data }, meta);
      const shouldMemoryCache = !policy.noStore && !policy.noCache && policy.maxAgeMs > 0;
      if (shouldMemoryCache) {
        runtime.memory.set(key, { result, expiresAt: Date.now() + policy.maxAgeMs });
      }
      return result;
    })();

    runtime.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      runtime.inFlight.delete(key);
    }
  }

  function githubRestHeaders(extra = {}) {
    return Object.assign({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, extra || {});
  }

  async function adapterFetchText(url, options = {}) {
    const result = await adapterRequest(url, Object.assign({ parse: 'text' }, options));
    return result.text;
  }

  async function adapterFetchJson(url, options = {}) {
    const result = await adapterRequest(url, Object.assign({ parse: 'json' }, options));
    return result;
  }


  function setAppSetting(key, value) {
    if (!(key in APP_SETTING_DEFAULTS)) return false;
    app.settings[key] = Boolean(value);
    persistAppSettings();
    return true;
  }

  function wizardRouteDraftHashEnabled() {
    return app.settings?.wizardDraftHashState !== false;
  }

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

  function repoRootJsdelivrFlatUrl(repo, ref, options = {}) {
    if (!repo) return '';
    const resolvedRef = ref || 'master';
    const bust = options.hardRefresh ? `?tiinexHardRefresh=${Date.now()}` : '';
    return `https://data.jsdelivr.com/v1/package/gh/${repo}@${encodeURIComponent(resolvedRef)}/flat${bust}`;
  }

  async function fetchRepoRootFileMap(repo, ref, options = {}) {
    const url = repoRootJsdelivrFlatUrl(repo, ref, options);
    if (!url) return new Map();
    const data = await fetchJson(url, {
      adapter: 'jsdelivr',
      label: 'jsDelivr root manifest',
      hardRefresh: Boolean(options.hardRefresh)
    });
    const map = new Map();
    for (const file of Array.isArray(data.files) ? data.files : []) {
      const path = normalizeJsdelivrFlatPath(file.name || file.path || '');
      if (!path || path.includes('/')) continue;
      map.set(path.toLowerCase(), path);
    }
    return map;
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

  function placeholderIntegrityValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'to' + 'do') return true;
    return /^(?:pending|placeholder|tbd|test|fill\s*(?:me|in)?|fill-in|fill_in|unavailable|unknown|n\/?a|-+)$/.test(normalized);
  }

  function parseIntegrityEntries(text) {
    const normalized = normalizeNewlines(text || '');
    const heading = normalized.match(/^# Continuity Integrity\s*$/m);
    if (!heading) return [];
    const tail = normalized.slice(heading.index).split('\n').slice(1);
    const entries = [];
    let current = null;
    const finish = () => {
      if (!current) return;
      const methodHref = validationMethodHrefFromLabel(current.methodLabel);
      const method = validationMethodIdFromLabel(current.methodLabel);
      const towards = String(current.fields.Towards || current.fields.towards || '').trim();
      const value = String(current.fields.Value || current.fields.value || '').trim();
      entries.push({
        index: entries.length,
        method,
        methodLabel: current.methodLabel,
        methodHref,
        methodDefinitionUrl: validationMethodDefinitionUrl(method, methodHref),
        towards,
        value,
        placeholderValue: placeholderIntegrityValue(value)
      });
      current = null;
    };

    for (const rawLine of tail) {
      if (/^#\s+/.test(rawLine.trim())) break;
      const methodMatch = rawLine.match(/^-\s+([^\n]+?)\s*$/);
      if (methodMatch) {
        finish();
        current = { methodLabel: methodMatch[1].trim(), fields: {} };
        continue;
      }
      if (!current) continue;
      const fieldMatch = rawLine.match(/^\s+-\s+([^:]+):\s*(.*)$/);
      if (fieldMatch) current.fields[fieldMatch[1].trim()] = fieldMatch[2].trim();
    }
    finish();
    return entries;
  }

  function preferredIntegrityEntry(entries) {
    const list = Array.isArray(entries) ? entries : [];
    return list.find((entry) => entry.method === TIINEX_SHA256_C14N_METHOD_ID && entry.towards && entry.value && !entry.placeholderValue)
      || list.find((entry) => entry.method || entry.towards || entry.value)
      || null;
  }

  function integrityEntryCountLabel(integrity) {
    const entries = Array.isArray(integrity?.entries) ? integrity.entries : [];
    if (!entries.length) return 'No method entries';
    const supported = entries.filter((entry) => entry.method === TIINEX_SHA256_C14N_METHOD_ID).length;
    if (entries.length === 1) return supported ? '1 entry · byte-integrity method' : '1 entry · unsupported method';
    return `${entries.length} entries · ${supported} byte-integrity ${supported === 1 ? 'entry' : 'entries'}`;
  }

  function integrityEntryAuditDetails(integrity) {
    const entries = Array.isArray(integrity?.entries) ? integrity.entries : [];
    const activeIndex = Number.isFinite(integrity?.activeEntryIndex) ? integrity.activeEntryIndex : -1;
    const methodCounts = new Map();
    for (const entry of entries) {
      const key = entry?.method || entry?.methodLabel || 'unknown';
      methodCounts.set(key, (methodCounts.get(key) || 0) + 1);
    }

    const details = entries.map((entry, index) => {
      const method = entry?.method || entry?.methodLabel || 'unknown method';
      const supported = method === TIINEX_SHA256_C14N_METHOD_ID;
      const missing = [];
      if (!entry?.method) missing.push('method');
      if (!entry?.towards) missing.push('Towards');
      if (!entry?.value) missing.push('Value');
      if (entry?.placeholderValue) missing.push('real Value');
      const complete = supported && !missing.length;
      const duplicateMethod = methodCounts.get(method) > 1;
      const active = index === activeIndex && complete;
      const status = active
        ? 'active-byte-integrity-entry'
        : !supported
          ? 'preserved-not-evaluated'
          : missing.length
            ? 'incomplete-entry'
            : 'preserved-not-evaluated';
      const label = active
        ? 'Active byte-integrity entry'
        : !supported
          ? 'Preserved, not evaluated'
          : missing.length
            ? 'Incomplete byte-integrity entry'
            : 'Preserved duplicate byte-integrity entry';
      return {
        index,
        position: index + 1,
        method,
        methodLabel: entry?.methodLabel || method,
        methodDefinitionUrl: entry?.methodDefinitionUrl || validationMethodDefinitionUrl(method, entry?.methodHref || ''),
        towards: entry?.towards || '',
        value: entry?.value || '',
        valueStatus: entry?.placeholderValue ? 'placeholder-like value' : entry?.value ? 'value present' : 'missing value',
        supported,
        complete,
        active,
        duplicateMethod,
        missing,
        status,
        label
      };
    });

    const evaluated = details.filter((entry) => entry.active).length;
    const unsupported = details.filter((entry) => entry.status === 'preserved-not-evaluated' && !entry.supported).length;
    const duplicate = details.filter((entry) => entry.duplicateMethod).length;
    const incomplete = details.filter((entry) => entry.missing.length).length;
    return {
      entries: details,
      evaluated,
      unsupported,
      duplicate,
      incomplete,
      summary: `${evaluated} evaluated · ${unsupported} preserved unsupported · ${incomplete} incomplete · ${duplicate} duplicate ${duplicate === 1 ? 'entry' : 'entries'}`
    };
  }

  function parseIntegrity(text) {
    const normalized = normalizeNewlines(text);
    const heading = normalized.match(/^# Continuity Integrity\s*$/m);
    if (!heading) return null;
    const tail = normalized.slice(heading.index);
    const entries = parseIntegrityEntries(normalized);
    const active = preferredIntegrityEntry(entries);
    const orphanTowards = (tail.match(/^\s+-\s+Towards:\s+(.+)$/m) || [null, ''])[1].trim();
    const orphanValue = (tail.match(/^\s+-\s+Value:\s+(.+)$/m) || [null, ''])[1].trim();
    const method = active?.method || '';
    const methodLabel = active?.methodLabel || '';
    const methodHref = active?.methodHref || '';
    const towards = active?.towards || orphanTowards;
    const value = active?.value || orphanValue;
    return {
      method,
      methodLabel,
      methodHref,
      methodDefinitionUrl: validationMethodDefinitionUrl(method, methodHref),
      towards,
      value,
      entries,
      entryCount: entries.length,
      activeEntryIndex: active ? active.index : -1,
      supportedEntryCount: entries.filter((entry) => entry.method === TIINEX_SHA256_C14N_METHOD_ID).length,
      unsupportedEntryCount: entries.filter((entry) => entry.method && entry.method !== TIINEX_SHA256_C14N_METHOD_ID).length,
      footerPresent: true,
      noClaim: !entries.length && !method && !towards && !value,
      placeholderValue: active ? active.placeholderValue : placeholderIntegrityValue(value)
    };
  }

  function integrityHasClaim(integrity) {
    return Boolean(integrity && !integrity.noClaim && (integrity.method || integrity.towards || integrity.value));
  }

  function initialIntegrityStatusForNode(node) {
    const integrity = node?.integrity || null;
    if (!integrityHasClaim(integrity)) return 'draft-pending';
    if (integrity.placeholderValue || !integrity.method || !integrity.towards || !integrity.value) return 'malformed-claim';
    if (integrity.method !== TIINEX_SHA256_C14N_METHOD_ID) return 'method-unsupported';
    return 'pending';
  }

  function initialIntegrityStatusLabelForNode(node) {
    const status = initialIntegrityStatusForNode(node);
    if (status === 'draft-pending') return 'No integrity claim is declared yet.';
    if (status === 'malformed-claim') return 'Integrity claim is present but incomplete or uses a placeholder value.';
    if (status === 'method-unsupported') return `Unsupported integrity method: ${node?.integrity?.method || 'unknown'}.`;
    return '';
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
    return nodeSortTimestamp(b) - nodeSortTimestamp(a) || a.path.localeCompare(b.path);
  }

  function sortableDate(value) {
    const s = String(value || '').trim();
    if (!s) return 0;
    const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(s);
    const iso = hasZone ? s : `${s.replace(' ', 'T')}Z`;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }

  function createdAtMidnightDate(value) {
    const s = String(value || '').trim();
    const match = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]00:00:00)?$/);
    if (!match) return '';
    return match[1];
  }

  function utcDatePart(value) {
    const t = sortableDate(value);
    if (!t) return '';
    return new Date(t).toISOString().slice(0, 10);
  }

  function nodeSortTimestamp(node) {
    const createdAt = node?.createdAt || '';
    const createdTime = sortableDate(createdAt);
    const midnightDate = createdAtMidnightDate(createdAt);
    const committedAt = node?.gitCommittedAt || node?.file?.gitCommittedAt || '';
    if (!midnightDate || !committedAt) return createdTime;
    if (utcDatePart(committedAt) !== midnightDate) return createdTime;
    return sortableDate(committedAt) || createdTime;
  }


  // --- Source loading ---

  async function loadUrlsIntoWorkspace(ws, urls) {
    const queue = Array.from(urls || []).filter(Boolean);
    ws.loading = true;
    ws.discoveryProgress = { phase: 'fetch', loaded: 0, total: queue.length, failed: 0 };
    render();
    if (typeof progressYield === 'function') await progressYield(ws);

    let count = 0;
    let loaded = 0;
    let failed = 0;
    let indexed = false;

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const raw = queue[index];
        const item = convertSourceUrl(raw);
        if (!item) {
          loaded += 1;
          ws.discoveryProgress.loaded = loaded;
          ws.discoveryProgress.total = queue.length;
          if (typeof progressYield === 'function') await progressYield(ws);
          continue;
        }

        try {
          if (/\.json($|[?#])/i.test(item.rawUrl)) {
            const text = await fetchText(item.rawUrl);
            const manifest = JSON.parse(text);
            const nested = manifest.traceUrls || manifest.urls || manifest.files || [];
            const nestedUrls = nested.map((entry) => typeof entry === 'string' ? entry : entry.url).filter(Boolean);
            if (nestedUrls.length) {
              ws.logs.push(`Manifest loaded ${nestedUrls.length} trace URLs from ${item.rawUrl}`);
              queue.push(...nestedUrls);
              ws.discoveryProgress.total = queue.length;
            }
          } else {
            const content = await fetchText(item.rawUrl);
            addFileToWorkspace(ws, { ...item, content });
            count += 1;
          }
          loaded += 1;
          ws.discoveryProgress.loaded = loaded;
        } catch (error) {
          failed += 1;
          ws.discoveryProgress.failed = failed;
          ws.logs.push(`Could not fetch ${item.rawUrl}: ${error.message}`);
        }

        ws.discoveryProgress.total = queue.length;
        if (typeof progressYield === 'function') await progressYield(ws);
      }

      if (typeof computeWorkspaceIndexWithDiscoveryProgress === 'function') {
        await computeWorkspaceIndexWithDiscoveryProgress(ws);
        indexed = true;
      } else {
        computeWorkspaceIndex(ws);
        indexed = true;
      }

      ws.discoveryProgress = Object.assign({}, ws.discoveryProgress || {}, { phase: 'policy' });
      if (typeof progressYield === 'function') await progressYield(ws);
      await discoverWorkspacePolicy(ws);
    } finally {
      ws.loading = false;
      ws.discoveryProgress = null;
      if (!indexed) computeWorkspaceIndex(ws);
      if (!count) toast(`No trace files loaded for ${ws.label}.`, 'warn');
      render();
    }
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
    const value = event.currentTarget.type === 'checkbox'
      ? event.currentTarget.checked
      : event.currentTarget.value;
    if (typeof updateModalField === 'function' && updateModalField(field, value)) {
      if (app.modal?.type === 'artifact-wizard') scheduleWizardRouteDraftReplace();
      return;
    }
    app.modal[field] = value;
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

  function restoreOneWorkspaceSnapshot(item) {
    const wsEl = document.querySelector(`.workspace[data-ws="${CSS.escape(item.wsId)}"]`);
    if (wsEl) wsEl.scrollTop = item.scrollTop || 0;
  }

  function restoreVisibleFeedScrolls(snapshots) {
    if (!snapshots || !snapshots.length) {
      restorePendingFeedScroll();
      return;
    }
    requestAnimationFrame(() => {
      snapshots.forEach((item) => {
        if (item.type === 'feed') restoreOneFeedSnapshot(item);
        if (item.type === 'workspace') restoreOneWorkspaceSnapshot(item);
      });
      requestAnimationFrame(() => {
        snapshots.forEach((item) => {
          if (item.type === 'feed') restoreOneFeedSnapshot(item);
          if (item.type === 'workspace') restoreOneWorkspaceSnapshot(item);
        });
        restorePendingFeedScroll();
      });
    });
  }

  function modalScrollRestoreKey(el) {
    if (!el) return '';
    if (el.dataset?.scrollRestore) return `data:${el.dataset.scrollRestore}`;
    const modalType = app.modal?.type || 'modal';
    const wsId = app.modal?.wsId || '';
    const step = modalType === 'artifact-wizard' ? wizardStep(app.modal) : '';
    const roles = [
      ['artifact-wizard-body', 'artifact-wizard-body'],
      ['add-artifact-body', 'add-artifact-body'],
      ['edit-node-body', 'edit-node-body'],
      ['modal-read-body', 'modal-read-body'],
      ['markdown-studio-surface', 'markdown-studio-surface'],
      ['markdown-studio', 'markdown-studio'],
      ['authoring-dialog-body', 'authoring-dialog-body'],
      ['modal-panel', 'modal-panel']
    ];
    const match = roles.find(([className]) => el.classList?.contains(className));
    if (!match) return '';
    return `modal:${modalType}:${wsId}:${step}:${match[1]}`;
  }

  function modalScrollRestoreSelector(key) {
    if (!key) return '';
    if (key.startsWith('data:')) {
      return `[data-scroll-restore="${CSS.escape(key.slice(5))}"]`;
    }
    const parts = key.split(':');
    const role = parts[4] || '';
    if (!role) return '';
    return `.${CSS.escape(role)}`;
  }

  function snapshotModalScrolls() {
    if (!app.modal) return [];
    const nodes = Array.from(document.querySelectorAll([
      '[data-scroll-restore]',
      '.artifact-wizard-body',
      '.add-artifact-body',
      '.edit-node-body',
      '.modal-read-body',
      '.markdown-studio-surface',
      '.markdown-studio',
      '.authoring-dialog-body',
      '.modal-panel'
    ].join(',')));
    const seen = new Set();
    return nodes.map((el) => {
      const key = modalScrollRestoreKey(el);
      if (!key || seen.has(key)) return null;
      seen.add(key);
      const scrollTop = el.scrollTop || 0;
      const scrollLeft = el.scrollLeft || 0;
      const scrollable = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1 || scrollTop || scrollLeft;
      if (!scrollable) return null;
      return { key, scrollTop, scrollLeft };
    }).filter(Boolean);
  }

  function restoreModalScrolls(snapshots) {
    if (!snapshots || !snapshots.length) return;
    const apply = () => {
      snapshots.forEach((item) => {
        const selector = modalScrollRestoreSelector(item.key);
        const el = selector ? document.querySelector(selector) : null;
        if (!el) return;
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
        el.scrollTop = Math.min(item.scrollTop || 0, maxTop);
        el.scrollLeft = Math.min(item.scrollLeft || 0, maxLeft);
      });
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  function snapshotRenderScrolls() {
    return {
      feed: typeof snapshotVisibleFeedScrolls === 'function' ? snapshotVisibleFeedScrolls() : [],
      modal: snapshotModalScrolls()
    };
  }

  function restoreRenderScrolls(snapshots) {
    if (typeof restoreVisibleFeedScrolls === 'function') restoreVisibleFeedScrolls(snapshots?.feed || []);
    else if (typeof restorePendingFeedScroll === 'function') restorePendingFeedScroll();
    restoreModalScrolls(snapshots?.modal || []);
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
    suppressNext: false,
    currentEntryIndex: Number(history.state?.__tiinexRouteIndex || 0),
    popDirection: 0,
    skippingClosedDialogHistory: false
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

  function routeHistoryState(state, kind = 'push') {
    const current = Number(app.routing?.currentEntryIndex || history.state?.__tiinexRouteIndex || 0);
    const nextIndex = kind === 'push' ? current + 1 : current;
    app.routing.currentEntryIndex = nextIndex;
    return Object.assign({}, state || {}, { __tiinexRouteIndex: nextIndex });
  }

  function routeHistoryBackAvailable() {
    const index = Number(history.state?.__tiinexRouteIndex ?? app.routing?.currentEntryIndex ?? 0);
    return Number.isFinite(index) && index > 0 && typeof history.back === 'function';
  }

  function runRouteHistoryBackOrFallback(fallback) {
    if (routeHistoryBackAvailable()) {
      try {
        app.routing.pendingUxBackRestore = true;
        history.back();
        return true;
      } catch (_) {
        app.routing.pendingUxBackRestore = false;
      }
    }
    if (typeof fallback === 'function') fallback();
    return false;
  }

  function noteRoutePopState(historyState) {
    const nextIndex = Number(historyState?.__tiinexRouteIndex || app.routing?.currentEntryIndex || 0);
    const current = Number(app.routing?.currentEntryIndex || 0);
    app.routing.popDirection = nextIndex === current ? 0 : (nextIndex < current ? -1 : 1);
    app.routing.currentEntryIndex = nextIndex;
    return app.routing.popDirection;
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
    const root = { name: '', path: '', folders: new Map(), nodes: [], artifactCount: 0, leafCount: 0 };
    const leaves = new Set(ws.leaves.map((node) => node.id));

    for (const node of nodes) {
      const relative = stripDiscoveryRootPrefix(node.path, roots);
      const parts = relative.split('/').filter(Boolean);
      const file = parts.pop() || fileNameFromPath(node.path);
      let cursor = root;
      cursor.artifactCount += 1;
      if (leaves.has(node.id)) cursor.leafCount += 1;
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!cursor.folders.has(part)) cursor.folders.set(part, { name: part, path: currentPath, folders: new Map(), nodes: [], artifactCount: 0, leafCount: 0 });
        cursor = cursor.folders.get(part);
        cursor.artifactCount += 1;
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
          <span class="tree-count">${folder.artifactCount} artifacts</span>
          <span class="tree-count">${folder.leafCount} leaves</span>
        </button>
        ${folderAddButton(ws, actualPath, `Add local artifact in ${actualPath}`)}
      </div>
      ${expanded ? `<div class="tree-children">${renderTreeFolderChildren(ws, folder, depth + 1)}</div>` : ''}
    </div>`;
  }


  function routeSourcesSignature(state) {
    return (state.sources || []).map((source) => {
      if (source.kind === 'github-tree' || source.kind === 'github') return gitHubSourceStateSignature(source);
      return `urls:${(source.urls || []).join('\n')}`;
    }).join('\n---workspace---\n');
  }

  function currentSourcesSignature() {
    return app.workspaces.map((ws) => {
      const githubSource = Array.from(ws.sources?.values?.() || []).find((source) => source.kind === 'github' && source.repo);
      if (githubSource) return gitHubSourceStateSignature(githubSource);
      if (ws.discoverySource?.kind === 'github-tree') {
        return gitHubSourceStateSignature({
          repo: ws.discoverySource.repo,
          ref: ws.discoverySource.ref || ws.ref || '',
          rootPaths: ws.discoverySource.rootPaths || [ws.discoverySource.rootPath || '.topics'],
          enabledSurfaces: ws.discoverySource.enabledSurfaces || { repoFiles: true, issues: false },
          issueUrls: ws.discoverySource.issueUrls || []
        });
      }
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
          if (source.kind === 'github-tree' || source.kind === 'github') {
            await loadGitHubStateSourceIntoWorkspace(ws, source);
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
      applyRouteModalState(state.modal || null);
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
    const refs = nodeMaterialRefs(ws, node);
    const key = `${ref.kind}|${ref.path}|${ref.rawUrl}|${ref.href}`;
    const index = refs.findIndex((item) => `${item.kind}|${item.path}|${item.rawUrl}|${item.href}` === key);
    return Math.max(0, index);
  }

  function materialRefFromEvent(el) {
    const ws = getWorkspace(el.dataset.ws);
    const node = ws?.nodeById.get(el.dataset.node);
    if (!ws || !node) return { ws: null, node: null, ref: null };
    const refs = nodeMaterialRefs(ws, node);
    const ref = refs[Number(el.dataset.ref || 0)] || null;
    return { ws, node, ref };
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

  function sectionValue(map, name) {
    return map[String(name || '').toLowerCase()] || '';
  }

  function bulletValue(block, label) {
    return stripMarkdownInline(singleFieldFromBullet(block, label) || '').trim();
  }

  function firstBulletValue(map, fields) {
    for (const [sectionName, label] of fields) {
      const value = bulletValue(sectionValue(map, sectionName), label);
      if (value) return value;
    }
    return '';
  }

  function renderReadMetric(label, value, options = {}) {
    if (!value) return '';
    const href = options.href ? safeUrl(options.href) : '';
    const valueHtml = href
      ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`
      : escapeHtml(value);
    return `<div class="schema-read-metric"><span>${escapeHtml(label)}</span><strong>${valueHtml}</strong></div>`;
  }

  function renderSchemaActionList(items) {
    const html = items.filter(Boolean).map((item) => `<span class="schema-action-chip">${escapeHtml(item)}</span>`).join('');
    return html ? `<div class="schema-action-list">${html}</div>` : '';
  }

  function renderDiscoveryFindingSummary(node, options = {}) {
    const map = sectionMap(node.body || node.rawMarkdown);
    const context = sectionValue(map, 'Discovery Context');
    const finding = sectionValue(map, 'Finding');
    const provenance = sectionValue(map, 'Provenance');
    const triage = sectionValue(map, 'Triage');
    const limits = sectionValue(map, 'Interpretation Limits');
    const status = bulletValue(finding, 'Finding Status') || bulletValue(context, 'Discovery State') || 'unknown';
    const type = bulletValue(finding, 'Finding Type') || bulletValue(context, 'Source') || 'finding';
    const source = bulletValue(context, 'Source') || bulletValue(provenance, 'Kind') || '';
    const repo = bulletValue(context, 'Repository') || bulletValue(context, 'Target') || bulletValue(provenance, 'Repository') || '';
    const url = bulletValue(context, 'URL') || bulletValue(context, 'Issue URL') || bulletValue(context, 'Comment URL') || bulletValue(provenance, 'URL') || '';
    const author = bulletValue(provenance, 'Author');
    const updated = bulletValue(provenance, 'Updated At') || bulletValue(provenance, 'Created At');
    const candidates = bulletValue(triage, 'Use As Candidates') || bulletValue(triage, 'Candidate Artifact Types');
    const needsInterpretation = bulletValue(triage, 'Needs Interpretation') || bulletValue(triage, 'Promotion Required');
    const canonicalStatus = bulletValue(triage, 'Canonical Status');
    const accepted = bulletValue(triage, 'Accepted By Owner');
    const reason = bulletValue(provenance, 'Unavailable Reason');
    const statusClass = /unavailable|missing|stale|ambiguous/i.test(status) ? 'attention' : 'ok';
    const metrics = [
      renderReadMetric('Status', status),
      renderReadMetric('Type', type),
      renderReadMetric('Source', source),
      renderReadMetric(repo.includes('#') ? 'Target' : 'Repository', repo),
      renderReadMetric('Author', author),
      renderReadMetric('Updated', updated),
      renderReadMetric('Source URL', url ? 'Open source' : '', { href: url })
    ].join('');
    const triageChips = String(candidates || '').split(/,|;/).map((v) => v.trim()).filter(Boolean);
    const limitText = reason || shortText(stripMarkdownInline(limits), 220);
    const compact = options.compact;
    return `
      <section class="schema-presenter discovery-presenter ${statusClass} ${compact ? 'compact' : ''}">
        <div class="schema-presenter-head">
          <span class="schema-presenter-icon"><i class="fa-solid fa-magnifying-glass-location"></i></span>
          <div>
            <p class="schema-presenter-kicker">Discovery finding</p>
            <h3>${escapeHtml(node.title || 'Discovery finding')}</h3>
            <p>${escapeHtml(node.summary || '')}</p>
          </div>
        </div>
        <div class="schema-read-grid">${metrics}</div>
        ${triageChips.length ? `<div class="schema-read-block"><span class="schema-read-label">Can be used as</span>${renderSchemaActionList(triageChips)}</div>` : ''}
        ${(needsInterpretation || accepted || canonicalStatus) ? `<div class="schema-read-block"><span class="schema-read-label">Interpretation</span><p>${escapeHtml([needsInterpretation ? `Needs interpretation: ${needsInterpretation}` : '', canonicalStatus ? `Canonical status: ${canonicalStatus}` : '', accepted ? `Accepted by owner: ${accepted}` : ''].filter(Boolean).join(' · '))}</p></div>` : ''}
        ${limitText ? `<div class="schema-read-block"><span class="schema-read-label">Limit</span><p>${escapeHtml(limitText)}</p></div>` : ''}
      </section>`;
  }

  function renderResourceSummary(node, options = {}) {
    const map = sectionMap(node.body || node.rawMarkdown);
    const schema = node.currentSchemaText || node.currentSchema || '';
    const resourceIdentity = firstBulletValue(map, [['Resource Identity', 'Resource'], ['Need Statement', 'Need'], ['Budget Envelope', 'Budget'], ['Allocation Statement', 'Allocation'], ['Usage Statement', 'Usage'], ['Contribution Statement', 'Contribution'], ['Receipt Statement', 'Receipt']]);
    const state = firstBulletValue(map, [['Resource State', 'Status'], ['Need Status', 'Need Status'], ['Budget Status', 'Budget Status'], ['Allocation Status', 'Allocation Status'], ['Usage Status', 'Usage Status'], ['Contribution Status', 'Contribution Status'], ['Receipt Status', 'Receipt Status']]);
    const boundary = firstBulletValue(map, [['Resource Boundary', 'Boundary'], ['Budget Boundary', 'Boundary'], ['Use Boundary', 'Boundary'], ['Restrictions Or Conditions', 'Restrictions']]);
    return `
      <section class="schema-presenter resource-presenter ${options.compact ? 'compact' : ''}">
        <div class="schema-presenter-head">
          <span class="schema-presenter-icon"><i class="fa-solid fa-layer-group"></i></span>
          <div>
            <p class="schema-presenter-kicker">Resource context</p>
            <h3>${escapeHtml(node.title || shortSchema(schema))}</h3>
            <p>${escapeHtml(node.summary || '')}</p>
          </div>
        </div>
        <div class="schema-read-grid">
          ${renderReadMetric('Resource', resourceIdentity || shortSchema(schema))}
          ${renderReadMetric('State', state || 'unknown')}
          ${renderReadMetric('Boundary', boundary)}
        </div>
      </section>`;
  }

  function renderInstrumentSummary(node, options = {}) {
    const map = sectionMap(node.body || node.rawMarkdown);
    const schema = node.currentSchemaText || node.currentSchema || '';
    const identity = firstBulletValue(map, [['Instrument Identity', 'Instrument'], ['Financial Instrument', 'Instrument'], ['Consent Statement', 'Statement']]);
    const status = firstBulletValue(map, [['Status And Effect', 'Status'], ['Consent Scope', 'Status'], ['Financial Terms', 'Status']]);
    const boundary = firstBulletValue(map, [['Boundaries', 'Boundary'], ['Terms Or Permissions', 'Permission'], ['Use Boundary', 'Boundary'], ['Revocation Or Expiry', 'Expiry']]);
    return `
      <section class="schema-presenter instrument-presenter ${options.compact ? 'compact' : ''}">
        <div class="schema-presenter-head">
          <span class="schema-presenter-icon"><i class="fa-solid fa-file-signature"></i></span>
          <div>
            <p class="schema-presenter-kicker">Instrument boundary</p>
            <h3>${escapeHtml(node.title || shortSchema(schema))}</h3>
            <p>${escapeHtml(node.summary || '')}</p>
          </div>
        </div>
        <div class="schema-read-grid">
          ${renderReadMetric('Instrument', identity || shortSchema(schema))}
          ${renderReadMetric('Status', status || 'declared')}
          ${renderReadMetric('Boundary', boundary)}
        </div>
      </section>`;
  }

  function renderSchemaReadPresenter(ws, node, options = {}) {
    const schema = node.currentSchemaText || node.currentSchema || '';
    if (schema === 'tiinex.discovery.finding.v1') return renderDiscoveryFindingSummary(node, options);
    if (String(schema).startsWith('tiinex.resource.')) return renderResourceSummary(node, options);
    if (String(schema).startsWith('tiinex.instrument.')) return renderInstrumentSummary(node, options);
    return '';
  }

  function renderContinuityPreview(node, ws = null) {
    const presenter = renderSchemaReadPresenter(ws, node, { compact: true });
    if (presenter) return presenter + (ws ? renderMaterialSection(ws, node, { compact: true }) : '');
    const key = schemaKey(node.currentSchemaText || node.currentSchema);
    const sections = extractBodySections(node.body || node.rawMarkdown);
    let html = '';
    if (key === 'topic') html = renderPreviewSections(sections, ['Current Read', 'Design Direction', 'Next Artifacts', 'Good Child Candidates']);
    else if (key === 'evidence' || key === 'feedback') html = renderPreviewSections(sections, ['Supported Claim', 'Provenance', 'Evidence Material', 'Supports', 'Interpretation Limits', 'Interpretation Notes and Limits', 'Feedback Signal']);
    else if (key === 'decision') html = renderPreviewSections(sections, ['Decision', 'Basis', 'Consequences', 'Review Conditions', 'Immediate Next Questions']);
    else if (key === 'task') html = renderPreviewSections(sections, ['Objective', 'Done Criteria', 'Scope', 'Dependencies', 'Grounding', 'Non-Goals']);
    else if (key === 'reduction') html = renderPreviewSections(sections, ['Carry-Forward State', 'Loss And Uncertainty', 'Validation', 'Review Checklist']);
    else {
      const picked = Object.keys(sections).filter((name) => !/^(continuity context|continuity integrity)$/i.test(name)).slice(0, 5);
      html = picked.length ? renderPreviewSections(sections, picked) : '<p class="preview-note">No schema-specific preview available. Open detail or markdown for the full artifact.</p>';
    }
    return html + (ws ? renderMaterialSection(ws, node, { compact: true }) : '');
  }


  function renderDetailReadView(ws, node) {
    const schema = node.currentSchemaText || (node.hasModernEnvelope ? 'unknown schema' : 'plain markdown');
    const presenter = renderSchemaReadPresenter(ws, node, { compact: false });
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
      ${presenter || renderContinuityPreview(node)}
      ${renderMaterialSection(ws, node, { compact: false })}
      <hr class="soft-rule">
      <details class="artifact-body-read">
        <summary>
          <span class="schema-read-label">Artifact body</span>
          <small>Exact body rendered from the artifact. Use Markdown for full source.</small>
        </summary>
        <div class="markdown-rendered">${renderSafeMarkdown(node.body || node.rawMarkdown)}</div>
      </details>`;
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
      if (isStructuralMaterialRef(ref)) continue;
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
    const refs = nodeMaterialRefs(ws, node);
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
    const refs = nodeMaterialRefs(ws, node);
    if (!refs.length) return '';
    return materialSummary(refs).slice(0, 2).map((label) => `<span class="badge-soft material-chip"><i class="fa-solid fa-paperclip"></i>${escapeHtml(label)}</span>`).join('');
  }




  async function onAction(event) {
    const action = event.currentTarget.dataset.action;
    const wsId = event.currentTarget.dataset.ws;
    const nodeId = event.currentTarget.dataset.node;

    if (action === 'open-material-lightbox') {
      event.preventDefault();
      event.stopPropagation();
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) {
        app.modal = { type: 'material-lightbox', wsId: ws.id, nodeId: node.id, refIndex: materialRefIndex(ws, node, ref) };
        render();
      }
      return;
    }

    if (action === 'open-material-preview') {
      event.preventDefault();
      event.stopPropagation();
      const { ws, node, ref } = materialRefFromEvent(event.currentTarget);
      if (ws && node && ref) await openMaterialPreview(ws, node, ref);
      return;
    }

    if (action === 'copy-material-ref') {
      event.preventDefault();
      event.stopPropagation();
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
    if (action === 'edit-source') {
      event.preventDefault();
      event.stopPropagation();
      openEditSourceModal(event.currentTarget.dataset.ws, event.currentTarget.dataset.source);
      return;
    }
    if (action === 'refresh-source' || action === 'hard-refresh-source') {
      event.preventDefault();
      event.stopPropagation();
      await refreshEditedGitHubSource(action === 'hard-refresh-source');
      return;
    }
    if (action === 'load-demo') { await loadDemo(); setRouteState('push'); return; }
    if (action === 'create-workspace') { await createWorkspaceFromInputs(); setRouteState('push'); return; }
    if (action === 'select-node') { selectNode(wsId, nodeId); setRouteState('push'); return; }
    if (action === 'clear-selection') {
      const ws = getWorkspace(wsId);
      if (ws) {
        const clearSelectionFallback = () => {
          ws.selectedNodeId = null;
          ws.pendingSelectedRoute = null;
          setRouteState('push');
          render();
          if (typeof scheduleRouteHistoryScrollRestore === 'function') scheduleRouteHistoryScrollRestore('ux-back-fallback');
        };
        runRouteHistoryBackOrFallback(clearSelectionFallback);
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
    if (action === 'open-detail-modal') { app.modal = { type: 'detail', wsId, nodeId }; updateUrlState({ replace: true }); render(); return; }
    if (action === 'open-markdown-modal') { app.modal = { type: 'markdown', wsId, nodeId }; updateUrlState({ replace: true }); render(); return; }
    if (action === 'open-create') {
      openArtifactCreateIntent({ mode: event.currentTarget.dataset.mode, wsId, nodeId, schemaId: event.currentTarget.dataset.schemaId || event.currentTarget.dataset.schema || '' });
      return;
    }
    if (action === 'close-modal') { closeActiveModalRoute(); return; }
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

  // Policy lookup is about the lineage origin, not arbitrary fallback documents.
  // Only these root files count. No README/VALIDATION_NOTES/artifact fallback.

  function repoPolicyCandidateNames() {
    return [
      'LINEAGE_LICENSE.md',
      'LINEAGE_LICENSE',
      'LINEAGE_POLICY.md',
      'LINEAGE_POLICY',
      'LICENSE.md',
      'LICENSE',
      'POLICY.md',
      'POLICY'
    ];
  }

  function repoPolicyCandidates(repo, ref, rootFileMap = null) {
    return repoPolicyCandidateNames()
      .map((name) => {
        const actual = rootFileMap instanceof Map ? rootFileMap.get(name.toLowerCase()) : name;
        if (!actual) return null;
        return { kind: actual, url: repoPolicyRawUrl(repo, ref, actual) };
      })
      .filter(Boolean);
  }

  function isLineagePolicyKind(kind) {
    return /^LINEAGE_(LICENSE|POLICY)(\.md)?$/i.test(String(kind || ''));
  }







  // understand it, so LICENSE could render as "Policy unknown". Fix the badge
  // renderer and add a separate NOTICE signal when the origin repo has NOTICE.

  function repoNoticeCandidates(repo, ref, rootFileMap = null) {
    return ['NOTICE', 'NOTICE.md']
      .map((name) => {
        const actual = rootFileMap instanceof Map ? rootFileMap.get(name.toLowerCase()) : name;
        if (!actual) return null;
        return { kind: actual, url: repoPolicyRawUrl(repo, ref, actual) };
      })
      .filter(Boolean);
  }

  async function discoverWorkspaceNotice(ws, rootFileMap = null) {
    if (!ws || !ws.repo || !ws.ref) {
      if (ws) ws.notice = { status: 'local', kind: '', text: '', url: '', note: '' };
      return;
    }

    const attempts = repoNoticeCandidates(ws.repo, ws.ref, rootFileMap);
    for (const attempt of attempts) {
      try {
        const text = await fetchText(attempt.url, attempt.kind);
        ws.notice = {
          status: 'found',
          kind: attempt.kind,
          text,
          url: attempt.url,
          note: `${attempt.kind} found at origin root for ${ws.repo}@${ws.ref}.`
        };
        return;
      } catch (error) {
        ws.logs?.push?.(`Could not fetch origin notice ${attempt.kind}: ${error.message}`);
      }
    }

    ws.notice = {
      status: 'missing',
      kind: '',
      text: '',
      url: '',
      note: rootFileMap instanceof Map ? 'No NOTICE file found in the origin root manifest.' : 'No NOTICE file found at origin root.'
    };
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

    let rootFileMap = null;
    try {
      rootFileMap = await fetchRepoRootFileMap(ws.repo, ws.ref);
    } catch (error) {
      const note = `Origin policy lookup deferred: cacheable root manifest could not be loaded without adding fallback probes (${error.message}).`;
      ws.policy = {
        status: 'lookup-deferred',
        kind: '',
        text: '',
        url: `https://github.com/${ws.repo}/tree/${ws.ref}`,
        note
      };
      ws.notice = { status: 'lookup-deferred', kind: '', text: '', url: '', note };
      ws.logs?.push?.(note);
      return;
    }

    let foundPolicy = false;
    const attempts = repoPolicyCandidates(ws.repo, ws.ref, rootFileMap);
    for (const attempt of attempts) {
      try {
        const text = await fetchText(attempt.url, attempt.kind);
        ws.policy = {
          status: isLineagePolicyKind(attempt.kind) ? 'found' : 'origin-fallback',
          kind: attempt.kind,
          text,
          url: attempt.url,
          note: `${attempt.kind} found at origin root for ${ws.repo}@${ws.ref}.`
        };
        foundPolicy = true;
        break;
      } catch (error) {
        ws.logs?.push?.(`Could not fetch origin policy ${attempt.kind}: ${error.message}`);
      }
    }

    if (!foundPolicy) {
      ws.policy = {
        status: 'missing',
        kind: '',
        text: '',
        url: `https://github.com/${ws.repo}/tree/${ws.ref}`,
        note: `No origin lineage policy/license found in the root manifest. Checked known root names only: ${repoPolicyCandidateNames().join(', ')}.`
      };
    }

    await discoverWorkspaceNotice(ws, rootFileMap);
  }





  // The source modal imports lineage material into the viewer without owning
  // artifact edit behavior.

  function sourceModalSnapshot() {
    if (!app.modal || app.modal.type !== 'source') return;
    app.modal.label = $('source-label')?.value ?? app.modal.label ?? '';
    app.modal.repo = $('source-repo')?.value ?? app.modal.repo ?? '';
    app.modal.ref = $('source-ref')?.value ?? app.modal.ref ?? '';
    app.modal.root = $('source-root')?.value ?? app.modal.root ?? '.topics';
    app.modal.rootPaths = app.modal.root;
    app.modal.repoDiscovery = $('source-repo-discovery')?.checked ?? app.modal.repoDiscovery ?? true;
    app.modal.issueDiscovery = $('source-issue-discovery')?.checked ?? app.modal.issueDiscovery ?? true;
    app.modal.issueUrls = $('source-issue-urls')?.value ?? app.modal.issueUrls ?? '';
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

  function isStructuralMaterialRef(ref) {
    const kind = String(ref?.kind || '').toLowerCase();
    const label = String(ref?.label || ref?.title || '').toLowerCase();
    const target = String(ref?.path || ref?.href || ref?.rawUrl || ref?.browseUrl || '').toLowerCase();

    if (['schema', 'validator', 'trace'].includes(kind)) return true;
    if (/\.(schema|validator|trace|workspace)\.md(?:$|[?#])/i.test(target)) return true;
    if (/\b(envelope schema|current schema|parent schema|parent origin|parent trace|method definition|method identifier)\b/i.test(label)) return true;
    if (/^sha256-base64url-c14n-v\d+$/.test(label)) return true;
    if (/commit-pinned permalink|validator artifact|validation method artifact|method definition/.test(target)) return true;
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
          <div class="material-title">${escapeHtml(shortText(title, compact ? 44 : 90))}${ref.localAsset ? '<span class="trace-ref-status loaded">local asset</span>' : ''}</div>
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
    const ref = node ? nodeMaterialRefs(ws, node)[Number(modal.refIndex || 0)] : null;
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

  function zipU16(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
  }

  function zipU32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function zipLocalSignature(bytes, offset) {
    return zipU32(bytes, offset) >>> 0;
  }

  function zipBufferHasEncryptedEntries(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    let offset = 0;
    while (offset + 30 <= bytes.byteLength) {
      const sig = zipLocalSignature(bytes, offset);
      if (sig === 0x02014b50 || sig === 0x06054b50) break;
      if (sig !== 0x04034b50) break;
      const flag = zipU16(bytes, offset + 6);
      const compressedSize = zipU32(bytes, offset + 18);
      const nameLength = zipU16(bytes, offset + 26);
      const extraLength = zipU16(bytes, offset + 28);
      if (flag & 0x0001) return true;
      offset += 30 + nameLength + extraLength + compressedSize;
    }
    return false;
  }

  function promptForZipPassword(file) {
    const password = window.prompt(`Password for ${file?.name || 'password-protected zip'}`);
    if (!password) throw new Error('Password required for password-protected zip.');
    return password;
  }

  function zipCryptoImportEntriesFromBytes(bytes, password) {
    const out = [];
    const decoder = new TextDecoder();
    let offset = 0;
    while (offset + 30 <= bytes.byteLength) {
      const sig = zipLocalSignature(bytes, offset);
      if (sig === 0x02014b50 || sig === 0x06054b50) break;
      if (sig !== 0x04034b50) throw new Error('Unsupported zip structure.');
      const flag = zipU16(bytes, offset + 6);
      const method = zipU16(bytes, offset + 8);
      const crc = zipU32(bytes, offset + 14);
      const compressedSize = zipU32(bytes, offset + 18);
      const uncompressedSize = zipU32(bytes, offset + 22);
      const nameLength = zipU16(bytes, offset + 26);
      const extraLength = zipU16(bytes, offset + 28);
      const nameStart = offset + 30;
      const nameEnd = nameStart + nameLength;
      const dataStart = nameEnd + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (nameEnd > bytes.byteLength || dataEnd > bytes.byteLength) throw new Error('Truncated zip entry.');
      const path = normalizeAssetPath(decoder.decode(bytes.slice(nameStart, nameEnd)));
      if (flag & 0x0008) throw new Error('Encrypted zip imports with data descriptors are not supported.');
      if (!(flag & 0x0001)) throw new Error('Mixed encrypted and unencrypted zip entries are not supported.');
      if (method !== 0) throw new Error('Encrypted zip imports currently support stored entries only.');
      if (compressedSize !== uncompressedSize + 12) throw new Error('Unsupported encrypted zip entry size.');
      if (!path.endsWith('/')) {
        const plain = zipCryptoDecryptBytes(bytes.slice(dataStart, dataEnd), password);
        const verificationByte = (crc >>> 24) & 0xff;
        if (plain.byteLength < 12 || plain[11] !== verificationByte) throw new Error('Incorrect zip password.');
        const data = plain.slice(12);
        if (data.byteLength !== uncompressedSize) throw new Error('Decrypted zip entry size mismatch.');
        if (crc32Bytes(data) !== crc) throw new Error('Incorrect zip password or corrupted zip entry.');
        const blob = new Blob([data]);
        let content = null;
        if (/\.(trace\.md|md|txt)$/i.test(path)) content = decoder.decode(data);
        out.push({
          path,
          blob,
          content,
          type: blob.type || '',
          size: data.byteLength || 0,
          source: 'zip',
          kind: importEntryKind(path, content)
        });
      }
      offset = dataEnd;
    }
    return out;
  }

  async function encryptedZipToImportEntries(file, buffer) {
    const password = promptForZipPassword(file);
    return zipCryptoImportEntriesFromBytes(new Uint8Array(buffer), password);
  }

  async function fileToImportEntries(file) {
    const entries = [];
    const relativePath = normalizeAssetPath(intakeRelativePath(file));

    if (/\.zip$/i.test(file.name || relativePath)) {
      const zipBuffer = await file.arrayBuffer();
      if (zipBufferHasEncryptedEntries(zipBuffer)) return encryptedZipToImportEntries(file, zipBuffer);
      if (!window.JSZip) throw new Error('JSZip CDN was not available.');
      const zip = await window.JSZip.loadAsync(zipBuffer);
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

  function normalizeGithubSurfaceConfig(enabledSurfaces = {}) {
    return {
      repoFiles: enabledSurfaces.repoFiles !== false,
      issues: enabledSurfaces.issues !== false
    };
  }

  function normalizedGitHubIssueUrls(issueUrls = [], repo = '') {
    const out = [];
    (Array.isArray(issueUrls) ? issueUrls : String(issueUrls || '').split(/[\n,]+/)).forEach((item) => {
      const spec = typeof parseGitHubIssueSpec === 'function' ? parseGitHubIssueSpec(item) : null;
      const url = spec && (!repo || spec.repo.toLowerCase() === String(repo || '').toLowerCase()) ? spec.issueUrl : String(item || '').trim();
      if (url && !out.includes(url)) out.push(url);
    });
    return out;
  }

  function normalizeGitHubSourceState(source = {}, ws = null) {
    const repo = String(source.repo || ws?.repo || '').trim();
    const ref = String(source.ref || ws?.ref || '').trim();
    const rootPaths = Array.isArray(source.rootPaths) && source.rootPaths.length
      ? source.rootPaths.map((item) => normalizeRepoPath(item)).filter(Boolean)
      : parseRootPaths(source.rootPath || source.root || '.topics');
    const enabledSurfaces = normalizeGithubSurfaceConfig(source.enabledSurfaces || {
      repoFiles: source.repoDiscovery,
      issues: source.issueDiscovery
    });
    const issueUrls = normalizedGitHubIssueUrls(source.issueUrls || source.issueUrl || [], repo);
    return {
      id: source.id || githubSourceId(repo || source.origin || source.label || 'github'),
      kind: 'github',
      label: source.label || gitHubSourceLabel(repo, ref),
      origin: source.origin || (repo ? `https://github.com/${repo}` : ''),
      repo,
      ref,
      rootPaths: rootPaths.length ? rootPaths : ['.topics'],
      enabledSurfaces,
      issueUrls,
      discoveryDirective: source.discoveryDirective || { kind: 'implicit-workspace-inline', source: 'workspace.md', status: 'bootstrap' },
      adapter: source.adapter || originAdapterSummary('github-file'),
      socialAdapter: source.socialAdapter || originAdapterSummary('github-issue')
    };
  }

  function gitHubSourceStateSignature(source = {}) {
    const normalized = normalizeGitHubSourceState(source);
    const surfaces = normalizeGithubSurfaceConfig(normalized.enabledSurfaces);
    return [
      `github:${normalized.repo || ''}@${normalized.ref || ''}`,
      `roots:${(normalized.rootPaths || ['.topics']).map(normalizeRepoPath).join('|')}`,
      `surfaces:repoFiles=${surfaces.repoFiles ? 'on' : 'off'};issues=${surfaces.issues ? 'on' : 'off'}`,
      `issues:${(normalized.issueUrls || []).join('|')}`
    ].join('::');
  }

  function githubSourceId(repo) {
    return makeSourceId('github', String(repo || '').toLowerCase());
  }

  function gitHubSourceLabel(repo, ref = '') {
    return `GitHub ${repo || 'source'}${ref ? '@' + ref : ''}`;
  }

  function registerGitHubSource(ws, config = {}) {
    const normalized = normalizeGitHubSourceState(config, ws);
    return registerWorkspaceSource(ws, normalized);
  }

  function sourceFromFileMeta(ws, file = {}) {
    if (file.isGenerated) return draftSource(ws);
    if (file.sourceId) {
      const existing = sourceById(ws, file.sourceId) || {};
      const source = {
        id: file.sourceId,
        kind: file.sourceKind || existing.kind || 'local',
        label: file.sourceLabel || existing.label || file.sourceId,
        origin: file.sourceOrigin || existing.origin || file.rawUrl || file.browseUrl || '',
        repo: file.repo || existing.repo || '',
        ref: file.ref || existing.ref || ''
      };
      if (Array.isArray(file.rootPaths)) source.rootPaths = file.rootPaths.slice();
      else if (Array.isArray(existing.rootPaths)) source.rootPaths = existing.rootPaths.slice();
      if (file.enabledSurfaces) source.enabledSurfaces = normalizeGithubSurfaceConfig(file.enabledSurfaces);
      else if (existing.enabledSurfaces) source.enabledSurfaces = normalizeGithubSurfaceConfig(existing.enabledSurfaces);
      if (Array.isArray(file.issueUrls)) source.issueUrls = file.issueUrls.slice();
      else if (Array.isArray(existing.issueUrls)) source.issueUrls = existing.issueUrls.slice();
      if (existing.adapter && !source.adapter) source.adapter = existing.adapter;
      if (existing.socialAdapter && !source.socialAdapter) source.socialAdapter = existing.socialAdapter;
      return registerWorkspaceSource(ws, source);
    }
    if (file.repo) {
      const ref = file.ref || ws.ref || '';
      return registerGitHubSource(ws, {
        repo: file.repo,
        ref,
        origin: file.browseUrl || file.rawUrl || `https://github.com/${file.repo}`,
        rootPaths: Array.isArray(file.rootPaths) ? file.rootPaths : undefined,
        enabledSurfaces: file.enabledSurfaces
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
    if (source.kind === 'github') return source.repo || String(source.label || '').replace(/^GitHub\s+/i, '') || source.label;
    return source.label || source.kind;
  }

  function sourceBadgeClass(source) {
    if (!source) return 'source-unknown';
    if (source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue') return 'source-github';
    if (source.kind === 'local') return 'source-local';
    if (source.kind === 'draft') return 'source-draft';
    return 'source-url';
  }

  function renderSourceBadge(ws, nodeOrFile) {
    const source = sourceById(ws, nodeOrFile?.sourceId);
    if (!source) return '';
    const icon = source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue' ? 'fa-brands fa-github'
      : source.kind === 'local' ? 'fa-solid fa-laptop-file'
      : source.kind === 'draft' ? 'fa-solid fa-pen-nib'
      : 'fa-solid fa-link';
    const editable = source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue';
    const action = editable ? ` data-action="edit-source" data-ws="${escapeAttr(ws.id)}" data-source="${escapeAttr(source.id)}" role="button" tabindex="0"` : '';
    return `<span class="badge-soft source-chip ${sourceBadgeClass(source)}"${action} title="${escapeAttr(source.origin || source.label || source.id)}"><i class="${icon}"></i>${escapeHtml(shortText(sourceShortLabel(ws, source.id), 34))}</span>`;
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
      generatedAt: file.generatedAt || '',
      gitCommittedAt: file.gitCommittedAt || '',
      gitCommitSha: file.gitCommitSha || '',
      gitCommitSortCheckedAt: file.gitCommitSortCheckedAt || '',
      gitCommitSortStatus: file.gitCommitSortStatus || '',
      sourceSurface: file.sourceSurface || file.originSurface || ''
    });
    if (file.isGenerated || file.preserveAsAsset) {
      storeWorkspaceAsset(ws, path, content, { type: 'text/markdown;charset=utf-8', source: file.isGenerated ? 'generated' : 'trace', sourceId, sourceSurface: file.sourceSurface || file.originSurface || '' });
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
      sourceSurface: file.sourceSurface || '',
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
      gitCommittedAt: file.gitCommittedAt || '',
      gitCommitSha: file.gitCommitSha || '',
      gitCommitSortStatus: file.gitCommitSortStatus || '',
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
      sourceSurface: meta.sourceSurface || '',
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
    ws.logs.push(`Imported ${traceCount} Tiinex markdown artifact file(s) and preserved ${assetCount} asset file(s) into Local source.`);
    if (!traceCount) toast('No Tiinex markdown artifacts were indexed. Assets were preserved under Local.', 'warn');
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
      repoDiscovery: true,
      issueDiscovery: true,
      issueUrls: '',
      addMode: '',
      openSections: {}
    };
    render();
  }

  function openEditSourceModal(wsId, sourceId) {
    const ws = getWorkspace(wsId);
    const source = sourceById(ws, sourceId);
    if (!ws || !source) return;
    const surfaces = normalizeGithubSurfaceConfig(source.enabledSurfaces || {});
    app.modal = {
      type: 'source',
      appendWsId: ws.id,
      editSourceId: source.id,
      label: ws.label || '',
      urls: '',
      repo: source.repo || '',
      ref: source.ref || '',
      root: Array.isArray(source.rootPaths) && source.rootPaths.length ? source.rootPaths.join('\n') : (source.rootPath || '.topics'),
      repoDiscovery: surfaces.repoFiles,
      issueDiscovery: surfaces.issues,
      issueUrls: Array.isArray(source.issueUrls) ? source.issueUrls.join('\n') : '',
      addMode: 'git',
      openSections: {}
    };
    render();
  }


  async function refreshEditedGitHubSource(hardRefresh = false) {
    const modal = app.modal?.type === 'source' ? app.modal : null;
    const ws = modal?.appendWsId ? getWorkspace(modal.appendWsId) : null;
    const source = ws && modal?.editSourceId ? sourceById(ws, modal.editSourceId) : null;
    if (!ws || !source || source.kind !== 'github') {
      toast('No editable GitHub source is open.', 'warn');
      return;
    }
    if (hardRefresh) {
      clearAdapterRuntimeCache(source.repo || '');
    }
    const label = hardRefresh ? 'Hard refresh' : 'Refresh';
    toast(`${label} started for ${source.repo || 'GitHub source'}.`, 'info');
    await loadGitHubStateSourceIntoWorkspace(ws, source, {
      refreshExisting: true,
      hardRefresh: Boolean(hardRefresh),
      userInitiated: true
    });
    if (typeof computeWorkspaceIndex === 'function') computeWorkspaceIndex(ws);
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


  const ORIGIN_ADAPTER_CAPABILITY_KEYS = Object.freeze([
    'discover', 'read', 'create', 'append', 'edit', 'replace', 'delete', 'patch', 'resolvePermalink', 'hashContent', 'observeMetadata', 'observeReactions'
  ]);
  const ORIGIN_ADAPTER_GUARANTEE_KEYS = Object.freeze([
    'addressable', 'mutable', 'versioned', 'contentHashable', 'authorKnown', 'timestamped', 'deletable', 'permalinkStable', 'requiresAuth', 'clientSide', 'telemetry'
  ]);
  const ORIGIN_MUTATION_INTENTS = Object.freeze(['add', 'correct', 'comment', 'question', 'review', 'unknown']);
  const ORIGIN_DISCOVERY_STATUS_LABELS = Object.freeze(['discovery finding only', 'feedback/proposal only']);
  const ORIGIN_PARSE_LEVELS = Object.freeze(['structured', 'inferred', 'raw']);
  const ISSUE_BODY_HASH_METHOD_ID = 'sha256-base64url-text-v1';

  function adapterCapabilitySet(values = {}) {
    const out = {};
    for (const key of ORIGIN_ADAPTER_CAPABILITY_KEYS) out[key] = Boolean(values[key]);
    return Object.freeze(out);
  }

  function adapterGuaranteeSet(values = {}) {
    const out = {};
    for (const key of ORIGIN_ADAPTER_GUARANTEE_KEYS) out[key] = values[key] ?? false;
    return Object.freeze(out);
  }

  const ORIGIN_ADAPTER_CONTRACTS = Object.freeze({
    local: Object.freeze({
      id: 'local',
      label: 'Local browser workspace',
      kind: 'local',
      capabilities: adapterCapabilitySet({ discover: true, read: true, create: true, append: true, edit: true, replace: true, delete: true, hashContent: true, observeMetadata: true }),
      guarantees: adapterGuaranteeSet({ addressable: 'browser-local', mutable: true, versioned: false, contentHashable: true, authorKnown: false, timestamped: true, deletable: true, permalinkStable: false, requiresAuth: false, clientSide: true, telemetry: 'none' }),
      editPreconditions: Object.freeze(['hash-match', 'user-confirmed-overwrite'])
    }),
    'github-file': Object.freeze({
      id: 'github-file',
      label: 'GitHub file origin',
      kind: 'github-file',
      capabilities: adapterCapabilitySet({ discover: true, read: true, create: true, edit: true, replace: true, delete: true, resolvePermalink: true, hashContent: true, observeMetadata: true }),
      guarantees: adapterGuaranteeSet({ addressable: true, mutable: 'branch-mutable', versioned: true, contentHashable: true, authorKnown: true, timestamped: true, deletable: true, permalinkStable: 'commit-pinned when ref is a commit', requiresAuth: 'write-only', clientSide: true, telemetry: 'none' }),
      editPreconditions: Object.freeze(['ref-match', 'content-hash-match', 'user-confirmed-overwrite'])
    }),
    'github-issue': Object.freeze({
      id: 'github-issue',
      label: 'GitHub issue social origin',
      kind: 'github-issue',
      capabilities: adapterCapabilitySet({ discover: true, read: true, create: true, append: true, edit: true, replace: true, delete: true, resolvePermalink: true, hashContent: true, observeMetadata: true, observeReactions: true }),
      guarantees: adapterGuaranteeSet({ addressable: true, mutable: true, versioned: 'weak/platform-dependent', contentHashable: true, authorKnown: true, timestamped: true, deletable: true, permalinkStable: true, requiresAuth: 'write-only', clientSide: true, telemetry: 'none' }),
      editPreconditions: Object.freeze(['comment-id-match', 'updated-at-match', 'body-hash-match', 'user-confirmed-overwrite'])
    }),
    'zip-import': Object.freeze({
      id: 'zip-import',
      label: 'Imported archive snapshot',
      kind: 'zip-import',
      capabilities: adapterCapabilitySet({ read: true, hashContent: true, observeMetadata: true }),
      guarantees: adapterGuaranteeSet({ addressable: 'package-local', mutable: false, versioned: false, contentHashable: true, authorKnown: false, timestamped: false, deletable: false, permalinkStable: false, requiresAuth: false, clientSide: true, telemetry: 'none' }),
      editPreconditions: Object.freeze([])
    })
  });

  function originAdapterContract(kind) {
    const key = String(kind || '').trim();
    if (ORIGIN_ADAPTER_CONTRACTS[key]) return ORIGIN_ADAPTER_CONTRACTS[key];
    if (key === 'github' || key === 'github-tree') return ORIGIN_ADAPTER_CONTRACTS['github-file'];
    if (key === 'local' || key === 'draft') return ORIGIN_ADAPTER_CONTRACTS.local;
    if (key.includes('issue')) return ORIGIN_ADAPTER_CONTRACTS['github-issue'];
    return Object.freeze({
      id: key || 'unknown',
      label: key || 'Unknown origin',
      kind: key || 'unknown',
      capabilities: adapterCapabilitySet({ read: true, hashContent: true }),
      guarantees: adapterGuaranteeSet({ addressable: Boolean(key), mutable: 'unknown', versioned: 'unknown', contentHashable: true, clientSide: true, telemetry: 'none' }),
      editPreconditions: Object.freeze(['user-confirmed-overwrite'])
    });
  }

  function originAdapterSummary(kind) {
    const contract = originAdapterContract(kind);
    const caps = Object.entries(contract.capabilities || {}).filter(([, value]) => value).map(([key]) => key);
    const guarantees = contract.guarantees || {};
    return {
      id: contract.id,
      label: contract.label,
      capabilities: caps,
      guarantees,
      editPreconditions: Array.from(contract.editPreconditions || [])
    };
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

              ${renderAddChoiceCard('<i class="fa-brands fa-github"></i>', 'GitHub source', 'Add a GitHub repo/community with repo files and issue discussions as selectable discovery surfaces.', 'data-action="choose-add-mode" data-mode="git"')}
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
      const repoDiscovery = modal.repoDiscovery !== false;
      const issueDiscovery = modal.issueDiscovery !== false;
      const editing = Boolean(modal.editSourceId);
      return `
        <div class="modal-backdrop-custom focus-modal" role="dialog" aria-modal="true">
          <div class="modal-panel source-modal-panel add-flow-modal github-source-modal">
            <div class="modal-header-lite source-modal-head">
              <div>
                <p class="kicker">${editing ? 'Edit GitHub source' : 'GitHub source'}</p>
                <h2 class="modal-title-lite">${title}</h2>
                <p class="text-secondary mb-0">One client-side, read-only GitHub repo/community source.</p>
              </div>
              <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="add-source-form github-source-form">
              <div class="github-source-field-grid">
                <label>
                  <span>Repo URL or owner/name</span>
                  <input class="form-control" id="source-repo" value="${escapeAttr(modal.repo || '')}" placeholder="Tiinex/docs">
                </label>
                <label>
                  <span>Ref <em>optional</em></span>
                  <input class="form-control" id="source-ref" value="${escapeAttr(modal.ref || '')}" placeholder="default branch">
                </label>
              </div>
              <label>
                <span>Root paths</span>
                <textarea class="form-control source-root-box" id="source-root" placeholder=".topics&#10;.github/agents/.topics">${escapeHtml(modal.root || '.topics')}</textarea>
              </label>
              <div class="display-options-section-label">Discovery surfaces</div>
              <div class="github-source-surface-grid">
                <label class="display-option-row source-surface-row">
                  <span><strong>Repo files discovery</strong><small>Tiinex markdown artifacts from the repo tree.</small></span>
                  <input type="checkbox" id="source-repo-discovery" ${repoDiscovery ? 'checked' : ''}>
                </label>
                <label class="display-option-row source-surface-row">
                  <span><strong>Issue discussion discovery</strong><small>Issues/comments as feedback/proposals under this source.</small></span>
                  <input type="checkbox" id="source-issue-discovery" ${issueDiscovery ? 'checked' : ''}>
                </label>
              </div>
              <details class="github-advanced-issues" ${modal.issueUrls ? 'open' : ''}>
                <summary>Issue URLs <em>optional</em></summary>
                <textarea class="form-control source-url-box" id="source-issue-urls" placeholder="Leave empty to sample open issues from this repo.&#10;https://github.com/Tiinex/docs/issues/123">${escapeHtml(modal.issueUrls || '')}</textarea>
              </details>
              <p class="source-safety-note">Read-only: no GitHub write, token, auth prompt, backend, or telemetry.</p>
            </div>

            <div class="modal-footer-actions">
              ${editing ? '<button class="tv-btn subtle" data-action="refresh-source"><i class="fa-solid fa-rotate"></i>Refresh</button><button class="tv-btn subtle" data-action="hard-refresh-source"><i class="fa-solid fa-broom"></i>Hard refresh</button>' : '<button class="tv-btn subtle" data-action="choose-add-mode" data-mode=""><i class="fa-solid fa-arrow-left"></i>Back</button>'}
              <button class="tv-btn primary" data-action="create-workspace"><i class="fa-brands fa-github"></i>${editing ? 'Save GitHub source' : 'Add GitHub source'}</button>
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

  function computeWorkspaceIndex(ws, options = {}) {
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
      const cachedIntegrity = previousIntegrity[node.storageKey || node.path] || previousIntegrity[node.path] || null;
      node.integrityStatus = cachedIntegrity?.status || initialIntegrityStatusForNode(node);
      node.integrityStatusLabel = cachedIntegrity?.label || initialIntegrityStatusLabelForNode(node);
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
    if (!options.skipIntegrity && typeof scheduleIntegrityVerification === 'function') scheduleIntegrityVerification(ws);
    if (!options.skipCommitSortEnrichment && typeof scheduleGitCommitSortEnrichment === 'function') scheduleGitCommitSortEnrichment(ws);
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
    return await adapterFetchText(url, { adapter: adapterIdForUrl(url), label: 'Viewer CSS' });
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
    if (source.kind === 'github-tree' || source.kind === 'github') return gitHubSourceStateSignature(source);
    return `urls:${(source.urls || []).join('\n')}`;
  }

  function workspaceConfigSignature(ws) {
    if (!ws) return '';
    const githubSource = Array.from(ws.sources?.values?.() || []).find((source) => source.kind === 'github' && source.repo);
    if (githubSource) return configSourceSignature(githubSource);
    if (ws.discoverySource?.kind === 'github-tree') {
      return configSourceSignature({
        kind: 'github-tree',
        repo: ws.discoverySource.repo,
        ref: ws.discoverySource.ref || ws.ref || '',
        rootPaths: ws.discoverySource.rootPaths || [ws.discoverySource.rootPath || '.topics'],
        enabledSurfaces: ws.discoverySource.enabledSurfaces || { repoFiles: true, issues: false },
        issueUrls: ws.discoverySource.issueUrls || []
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
      if (!source || ((source.kind !== 'github-tree' && source.kind !== 'github') && !(source.urls || []).length)) continue;

      let ws = findWorkspaceForConfigSource(source);
      if (!ws) {
        ws = createWorkspace(source.label || 'Config workspace', 'Loaded from .workspace.md workspace state.');
        opened += 1;
        if (source.kind === 'github-tree' || source.kind === 'github') {
          await loadGitHubStateSourceIntoWorkspace(ws, source);
        } else {
          await loadUrlsIntoWorkspace(ws, source.urls || []);
        }
      } else if (source.kind === 'github-tree' || source.kind === 'github') {
        await loadGitHubStateSourceIntoWorkspace(ws, source, { refreshExisting: true });
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

  function parseGitHubIssueSpec(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    let url;
    try { url = new URL(raw); } catch (_) { return null; }
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const issueIndex = parts.indexOf('issues');
    if (issueIndex !== 2 || parts.length < 4) return null;
    const number = Number(parts[3]);
    if (!Number.isInteger(number) || number <= 0) return null;
    return {
      owner: parts[0],
      repoName: parts[1],
      repo: `${parts[0]}/${parts[1]}`,
      issueNumber: number,
      issueUrl: `https://github.com/${parts[0]}/${parts[1]}/issues/${number}`,
      apiIssueUrl: `https://api.github.com/repos/${parts[0]}/${parts[1]}/issues/${number}`,
      apiCommentsUrl: `https://api.github.com/repos/${parts[0]}/${parts[1]}/issues/${number}/comments`
    };
  }

  async function fetchGitHubJson(url, options = {}) {
    const result = await adapterFetchJson(url, {
      adapter: 'github-rest',
      label: 'GitHub API',
      rateLimitKey: 'github-rest',
      headers: githubRestHeaders(),
      hardRefresh: Boolean(options.hardRefresh),
      authMode: options.authMode || 'none'
    });
    return { data: result.data, headers: result.headers, request: result };
  }

  function githubNextLink(headers) {
    const link = headers?.get?.('link') || '';
    const match = link.split(',').map((item) => item.trim()).find((item) => /rel="next"/.test(item));
    const url = match?.match(/<([^>]+)>/)?.[1] || '';
    return url || '';
  }

  async function fetchGitHubIssueThread(spec, options = {}) {
    const issue = (await fetchGitHubJson(spec.apiIssueUrl, options)).data;
    const comments = [];
    const limit = Math.max(1, Number(options.commentLimit || 500));
    let url = `${spec.apiCommentsUrl}?per_page=${Math.min(100, limit)}`;
    let pages = 0;
    while (url && pages < 5 && comments.length < limit) {
      const page = await fetchGitHubJson(url, options);
      if (Array.isArray(page.data)) comments.push(...page.data.slice(0, Math.max(0, limit - comments.length)));
      url = comments.length >= limit ? '' : githubNextLink(page.headers);
      pages += 1;
    }
    return { issue, comments, truncated: Boolean(url) };
  }

  async function fetchGitHubRepoIssueSpecs(repo, options = {}) {
    const limit = Math.max(0, Number(options.limit || app.settings.githubIssueDiscoveryLimit || 10));
    if (!repo || !limit) return [];
    const perPage = Math.min(100, Math.max(limit + 5, 10));
    const url = `https://api.github.com/repos/${repo}/issues?state=open&sort=updated&direction=desc&per_page=${perPage}`;
    const result = await fetchGitHubJson(url, options);
    const issues = Array.isArray(result.data) ? result.data : [];
    return issues
      .filter((issue) => issue?.html_url && !issue.pull_request)
      .slice(0, limit)
      .map((issue) => parseGitHubIssueSpec(issue.html_url))
      .filter(Boolean);
  }

  function markdownFence(text, lang = '') {
    const body = String(text || '');
    let fence = '```';
    while (body.includes(fence)) fence += '`';
    return `${fence}${lang}
${body}
${fence}`;
  }

  function issueContributionParseLevel(body) {
    const text = String(body || '');
    if (/<!--\s*tiinex-(contribution|artifact|feedback)[\s-]v?\d*/i.test(text) || /^#\s+Continuity Context\s*$/m.test(text)) return 'structured';
    if (/(Current Schema|Continuity Integrity|Target|Path|Proposal|Correction|Suggested|Feedback)/i.test(text) || /^#{1,3}\s+\S/m.test(text) || /```[\s\S]*```/.test(text)) return 'inferred';
    return 'raw';
  }

  function issueContributionIntent(body) {
    const text = String(body || '').toLowerCase();
    if (/(fix|correct|correction|wrong|typo|bug|fel|korrig|rätta|ändra)/u.test(text)) return 'correct';
    if (/(add|addition|new|append|lägg till|ny|nytt|utöka)/u.test(text)) return 'add';
    if (/(review|approve|looks good|granska|godkänner)/u.test(text)) return 'review';
    if (/[?？]/.test(text) || /(question|fråga|undrar)/u.test(text)) return 'question';
    if (text.trim()) return 'comment';
    return 'unknown';
  }

  async function githubIssueOriginRecord(kind, spec, item, body) {
    const hash = await continuitySha256Base64Url(body || '');
    return {
      kind,
      adapter: 'github-issue',
      repo: spec.repo,
      issueNumber: spec.issueNumber,
      id: item?.id || spec.issueNumber,
      url: item?.html_url || spec.issueUrl,
      author: item?.user?.login || '',
      createdAt: item?.created_at || '',
      updatedAt: item?.updated_at || '',
      bodyHash: hash ? `${ISSUE_BODY_HASH_METHOD_ID}:${hash}` : ''
    };
  }

  function originMarkdownLines(origin) {
    return [
      `- Adapter: ${origin.adapter || 'unknown'}`,
      `- Kind: ${origin.kind || ''}`,
      `- Repository: ${origin.repo || ''}`,
      `- Issue: #${origin.issueNumber || ''}`,
      `- Id: ${origin.id || ''}`,
      `- URL: ${origin.url || ''}`,
      `- Author: ${origin.author || ''}`,
      `- Created At: ${origin.createdAt || ''}`,
      `- Updated At: ${origin.updatedAt || ''}`,
      `- Body Hash: ${origin.bodyHash || ''}`
    ].filter((line) => !/:\s*$/.test(line)).join('\n');
  }

  async function githubIssueRootMarkdown(spec, issue, rootPath) {
    const title = issue?.title || `GitHub issue #${spec.issueNumber}`;
    const body = issue?.body || '';
    const origin = await githubIssueOriginRecord('issue', spec, issue, body);
    const summary = `GitHub issue discovery finding for ${spec.repo}#${spec.issueNumber}: ${title}`;
    const draft = `# Continuity Context

- Envelope Schema: ${envelopeSchemaReference(rootPath)}
${currentBlockForPath('tiinex.discovery.finding.v1', summary, rootPath, 'Normalizes a GitHub issue as a discovery finding candidate, not canonical project truth.')}---

# ${title}

## Discovery Context

- Source: GitHub issue discussion
- Repository: ${spec.repo}
- Issue: #${spec.issueNumber}
- URL: ${spec.issueUrl}
- Adapter: github-issue

## Finding

- Finding Type: external-discussion
- Finding Status: observed
- Title: ${title}

## Provenance

${originMarkdownLines(origin)}

## Triage

- Use As Candidates: task, feedback, evidence, resource need, pointer, external payload
- Canonical Status: discovery finding only
- Needs Interpretation: yes

## Evidence Material

${body ? markdownFence(body, 'md') : '_No issue body was present._'}

## Interpretation Limits

- GitHub issues are mutable and may be edited, transferred, closed, deleted, or converted by authorized users.
- This finding preserves an observed issue snapshot and body hash; it does not prove project acceptance, owner approval, or canonical Tiinex lineage continuity.
- Use this finding explicitly as task, feedback, evidence, resource need, pointer, or other artifact semantics before treating it as one of those meanings.
`;
    return markdownWithSelfIntegrity(draft);
  }

  async function githubIssueUnavailableMarkdown(spec, error, rootPath) {
    const reason = String(error?.message || error || 'unavailable').trim();
    const title = `GitHub Issue #${spec.issueNumber}`;
    const summary = `GitHub issue discovery target for ${spec.repo}#${spec.issueNumber} could not be loaded from the GitHub API.`;
    const draft = `# Continuity Context

- Envelope Schema: ${envelopeSchemaReference(rootPath)}
${currentBlockForPath('tiinex.discovery.finding.v1', summary, rootPath, 'Preserves a configured GitHub issue target as a discovery finding when live issue material is unavailable.')}---

# ${title}

## Discovery Context

- Source: GitHub issue discussion
- Repository: ${spec.repo}
- Issue: #${spec.issueNumber}
- URL: ${spec.issueUrl}
- Adapter: github-issue
- Discovery State: unavailable

## Finding

- Finding Type: external-discussion-target
- Finding Status: unavailable
- Title: ${title}

## Provenance

- Adapter: github-issue
- Kind: issue-target
- Repository: ${spec.repo}
- Issue: #${spec.issueNumber}
- URL: ${spec.issueUrl}
- Unavailable Reason: ${reason}

## Triage

- Use As Candidates: task, feedback, evidence, resource need, pointer, external payload
- Canonical Status: discovery target only
- Needs Interpretation: yes

## Unavailable Material

_Live GitHub issue material was not loaded. Open the source URL or retry discovery after GitHub API access is available._

## Interpretation Limits

- This artifact preserves that the workspace or discovery directive targets the GitHub issue URL.
- It does not preserve the issue body, comments, title, author, timestamps, or current GitHub state.
- Treat this as a lineage/discovery gap until live issue material can be loaded or an external payload is attached.
`;
    return markdownWithSelfIntegrity(draft);
  }

  function addGitHubIssueUnavailableFinding(ws, issueUrl, source, error) {
    const spec = parseGitHubIssueSpec(issueUrl);
    if (!ws || !spec) return false;
    const titleSlug = `issue-${spec.issueNumber}-unavailable`;
    const rootPath = normalizeAssetPath(`.topics/github-issues/${spec.owner}-${spec.repoName}-${spec.issueNumber}-${titleSlug}/issue-unavailable.trace.md`);
    return githubIssueUnavailableMarkdown(spec, error, rootPath).then((markdown) => {
      addFileToWorkspace(ws, {
        path: rootPath,
        content: markdown,
        preserveAsAsset: true,
        sourceId: source?.id || '',
        sourceKind: source?.kind || 'github',
        sourceLabel: source?.label || gitHubSourceLabel(spec.repo, source?.ref || ''),
        sourceOrigin: spec.issueUrl,
        rawUrl: spec.issueUrl,
        browseUrl: spec.issueUrl,
        repo: spec.repo,
        ref: source?.ref || ws.ref || `issue-${spec.issueNumber}`,
        sourceSurface: 'issues'
      });
      return true;
    });
  }

  async function githubIssueCommentMarkdown(spec, comment, commentPath, rootNode) {
    const body = comment?.body || '';
    const origin = await githubIssueOriginRecord('issue-comment', spec, comment, body);
    const parseLevel = issueContributionParseLevel(body);
    const intent = issueContributionIntent(body);
    const summary = `${intent} GitHub issue comment finding from ${origin.author || 'GitHub issue comment'} (${parseLevel})`;
    const parentTrace = parentTraceReferenceForPath(rootNode, commentPath);
    const parentSchema = parentSchemaReferenceForPath(rootNode, commentPath);
    const draft = `# Continuity Context

- Envelope Schema: ${envelopeSchemaReference(commentPath)}
- Parent
  - Parent Schema: ${parentSchema}
  - Trace: ${parentTrace}
  - Origin:
    - github issue: ${spec.issueUrl}
    - issue comment: ${origin.url || ''}
    - body hash: ${origin.bodyHash || ''}
${currentBlockForPath('tiinex.discovery.finding.v1', summary, commentPath, 'Preserves a GitHub issue comment as a discovery finding candidate, not canonical replacement content.')}---

# GitHub Issue Comment ${origin.id || ''}

## Discovery Context

- Source: GitHub issue comment
- Target: ${spec.repo}#${spec.issueNumber}
- Issue URL: ${spec.issueUrl}
- Comment URL: ${origin.url || ''}
- Adapter: github-issue

## Finding

- Finding Type: external-comment
- Finding Status: observed
- Parse Level: ${parseLevel}
- Intent: ${ORIGIN_MUTATION_INTENTS.includes(intent) ? intent : 'unknown'}

## Provenance

${originMarkdownLines(origin)}

## Triage

- Use As Candidates: feedback, task, evidence, resource need, pointer, external payload
- Canonical Status: discovery finding only
- Accepted By Owner: no
- Needs Interpretation: yes

## Evidence Material

${body ? markdownFence(body, 'md') : '_No comment body was present._'}

## Interpretation Limits

- GitHub issue comments are mutable and deletable by authorized users.
- Tiinex preserves the comment body hash so changed comments become visible as lineage signals.
- This finding does not replace any original lineage artifact unless the lineage owner explicitly uses it as a new artifact in their own draft/commit flow.
`;
    return markdownWithParentTargetIntegrity(rootNode, commentPath, draft);
  }

  async function loadGitHubIssueIntoWorkspace(ws, issueUrl, options = {}) {
    const spec = parseGitHubIssueSpec(issueUrl);
    if (!spec) throw new Error('Paste a GitHub issue URL like https://github.com/owner/repo/issues/123.');
    const { issue, comments, truncated } = await fetchGitHubIssueThread(spec, options);
    const issueSlug = slugify(issue?.title || `issue-${spec.issueNumber}`) || `issue-${spec.issueNumber}`;
    const base = normalizeAssetPath(`.topics/github-issues/${spec.owner}-${spec.repoName}-${spec.issueNumber}-${issueSlug}`);
    const source = options.source || registerGitHubSource(ws, {
      repo: spec.repo,
      ref: options.ref || ws.ref || '',
      enabledSurfaces: { repoFiles: false, issues: true },
      issueUrls: [spec.issueUrl]
    });
    if (!source.issueUrls) source.issueUrls = [];
    if (!source.issueUrls.includes(spec.issueUrl)) source.issueUrls.push(spec.issueUrl);

    let rootPath = `${base}/issue-root.trace.md`;
    let rootMarkdown = '';
    let rootNode = null;
    if (options.includeBody !== false) {
      rootMarkdown = await githubIssueRootMarkdown(spec, issue, rootPath);
      addFileToWorkspace(ws, {
        path: rootPath,
        content: rootMarkdown,
        preserveAsAsset: true,
        sourceId: source.id,
        sourceKind: source.kind,
        sourceLabel: source.label,
        sourceOrigin: spec.issueUrl,
        rawUrl: spec.issueUrl,
        browseUrl: spec.issueUrl,
        repo: spec.repo,
        ref: source.ref || options.ref || `issue-${spec.issueNumber}`,
        sourceSurface: 'issues'
      });
      rootNode = { path: rootPath, rawMarkdown: rootMarkdown, currentSchemaText: 'tiinex.discovery.finding.v1', currentSchema: 'tiinex.discovery.finding.v1' };
    } else {
      rootNode = { path: rootPath, rawMarkdown: '', currentSchemaText: 'tiinex.discovery.finding.v1', currentSchema: 'tiinex.discovery.finding.v1' };
    }

    let commentCount = 0;
    for (const comment of comments) {
      const n = String(commentCount + 1).padStart(3, '0');
      const commentPath = `${base}/comment-${n}-${comment.id || n}.trace.md`;
      const commentMarkdown = await githubIssueCommentMarkdown(spec, comment, commentPath, rootNode);
      addFileToWorkspace(ws, {
        path: commentPath,
        content: commentMarkdown,
        preserveAsAsset: true,
        sourceId: source.id,
        sourceKind: source.kind,
        sourceLabel: source.label,
        sourceOrigin: comment.html_url || spec.issueUrl,
        rawUrl: comment.html_url || spec.issueUrl,
        browseUrl: comment.html_url || spec.issueUrl,
        repo: spec.repo,
        ref: source.ref || options.ref || `issue-${spec.issueNumber}`,
        sourceSurface: 'issues'
      });
      commentCount += 1;
    }

    computeWorkspaceIndex(ws);
    if (!ws.discoverySource) ws.discoverySource = { kind: 'github-tree', repo: spec.repo, ref: source.ref || '', rootPath: '.topics', rootPaths: ['.topics'], sourceId: source.id, issueUrls: [spec.issueUrl] };
    ws.logs.push(`Loaded GitHub issue discussion ${spec.repo}#${spec.issueNumber}: ${commentCount} comment node(s)${truncated ? ' (truncated after 500 comments)' : ''}.`);
    if (options.toast !== false) toast(`Loaded GitHub issue discussion: ${commentCount} comment node${commentCount === 1 ? '' : 's'}.`, 'ok');
  }

  function parseSourceIssueUrls(value, repo = '') {
    return String(value || '')
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, arr) => arr.indexOf(item) === index)
      .map((item) => parseGitHubIssueSpec(item))
      .filter((spec) => spec && (!repo || spec.repo.toLowerCase() === repo.toLowerCase()))
      .map((spec) => spec.issueUrl);
  }

  function sourceSurfaceForEntry(entry) {
    const explicit = String(entry?.sourceSurface || entry?.originSurface || '').trim();
    if (explicit) return explicit;
    const kind = String(entry?.sourceKind || entry?.source || '').toLowerCase();
    const path = String(entry?.path || entry?.name || '').toLowerCase();
    if (kind.includes('issue') || path.includes('/github-issues/')) return 'issues';
    return 'repoFiles';
  }

  function removeWorkspaceSourceEntries(ws, sourceId, predicate = () => true) {
    let removed = 0;
    for (const [key, file] of Array.from(ws.files?.entries?.() || [])) {
      if (file.sourceId !== sourceId || !predicate(file)) continue;
      ws.files.delete(key);
      removed += 1;
    }
    for (const [key, asset] of Array.from(ws.assets?.entries?.() || [])) {
      if (asset.sourceId !== sourceId || !predicate(asset)) continue;
      if (ws.assetUrls?.has(key)) {
        try { URL.revokeObjectURL(ws.assetUrls.get(key)); } catch (_) {}
        ws.assetUrls.delete(key);
      }
      ws.assets.delete(key);
      removed += 1;
    }
    return removed;
  }

  function applyGitHubSourceSurfacePruning(ws, source, enabledSurfaces, resetAll = false) {
    if (!ws || !source) return 0;
    return removeWorkspaceSourceEntries(ws, source.id, (entry) => {
      if (resetAll) return true;
      const surface = sourceSurfaceForEntry(entry);
      if (surface === 'issues') return !enabledSurfaces.issues;
      return !enabledSurfaces.repoFiles;
    });
  }

  function setGitHubIssueDiscoveryStatus(ws, source, status = {}) {
    if (!ws || !source) return;
    const entry = Object.assign({ state: 'unknown', message: '', sourceId: source.id || '', repo: source.repo || '', updatedAt: new Date().toISOString() }, status);
    source.issueDiscoveryStatus = entry;
    ws.githubIssueDiscoveryStatus = ws.githubIssueDiscoveryStatus || {};
    if (source.id) ws.githubIssueDiscoveryStatus[source.id] = entry;
  }

  function githubIssueDiscoveryManualHint(source) {
    const repo = source?.repo || 'owner/repo';
    return `Add explicit Issue URLs under this source (for example https://github.com/${repo}/issues/4) or add authenticated GitHub access when that mode is explicitly available.`;
  }

  async function discoverGitHubIssuesIntoWorkspace(ws, source, issueUrls = [], options = {}) {
    if (!ws || !source?.repo) return 0;
    const canonicalSource = registerGitHubSource(ws, source);
    let urls = Array.isArray(issueUrls) ? issueUrls.slice() : [];
    setGitHubIssueDiscoveryStatus(ws, canonicalSource, { state: 'running', message: urls.length ? `Loading ${urls.length} configured issue URL(s).` : 'Sampling latest open issues from GitHub API.' });
    if (typeof render === 'function' && options.renderStatus !== false) render();
    if (!urls.length) {
      try {
        const specs = await fetchGitHubRepoIssueSpecs(source.repo, { limit: app.settings.githubIssueDiscoveryLimit || 10, hardRefresh: Boolean(options.hardRefresh) });
        urls = specs.map((spec) => spec.issueUrl);
      } catch (error) {
        const message = `Issue discovery failed for ${source.repo}: ${error.message}. ${githubIssueDiscoveryManualHint(source)}`;
        setGitHubIssueDiscoveryStatus(ws, canonicalSource, { state: error.rateLimited ? 'rate-limited' : 'failed', message, error: error.message, needsIssueUrls: true, rateLimitUntil: error.rateLimitUntil || 0, cacheState: error.cacheState || '' });
        ws.logs.push(message);
        toast(message, 'warn');
        if (typeof render === 'function' && options.renderStatus !== false) render();
        return 0;
      }
    }
    if (!urls.length) {
      const message = `Issue discovery found no open issues for ${source.repo}. Add Issue URLs to follow specific discussions.`;
      setGitHubIssueDiscoveryStatus(ws, canonicalSource, { state: 'empty', message });
      ws.logs.push(message);
      if (typeof render === 'function' && options.renderStatus !== false) render();
      return 0;
    }
    let loaded = 0;
    const failures = [];
    for (const issueUrl of urls) {
      try {
        await loadGitHubIssueIntoWorkspace(ws, issueUrl, { source: canonicalSource, ref: canonicalSource.ref || ws.ref || '', commentLimit: options.commentLimit || 50, toast: false, hardRefresh: Boolean(options.hardRefresh) });
        loaded += 1;
      } catch (error) {
        const message = `Could not load issue discussion ${issueUrl}: ${error.message}`;
        failures.push(message);
        ws.logs.push(message);
        try {
          const addedFallback = await addGitHubIssueUnavailableFinding(ws, issueUrl, canonicalSource, error);
          if (addedFallback) {
            ws.logs.push(`Added unavailable GitHub issue discovery target for ${issueUrl}.`);
          }
        } catch (fallbackError) {
          ws.logs.push(`Could not add unavailable issue target for ${issueUrl}: ${fallbackError.message}`);
        }
      }
    }
    ws.githubIssueDiscoveryRuns = ws.githubIssueDiscoveryRuns || {};
    ws.githubIssueDiscoveryRuns[canonicalSource.id] = {
      signature: gitHubSourceStateSignature(Object.assign({}, canonicalSource, { issueUrls: urls })),
      loaded,
      failed: failures.length,
      completedAt: new Date().toISOString()
    };
    if (loaded) {
      setGitHubIssueDiscoveryStatus(ws, canonicalSource, { state: failures.length ? 'partial' : 'loaded', message: `Loaded ${loaded} GitHub issue discussion${loaded === 1 ? '' : 's'}${failures.length ? `; ${failures.length} failed` : ''}.`, loaded, failed: failures.length });
      toast(`Loaded ${loaded} GitHub issue discussion${loaded === 1 ? '' : 's'}.`, 'ok');
    } else if (failures.length) {
      const message = `${failures.length} GitHub issue target${failures.length === 1 ? '' : 's'} unavailable; fallback finding added when possible.`;
      setGitHubIssueDiscoveryStatus(ws, canonicalSource, { state: failures.some((item) => /rate-limited|retry after/i.test(item)) ? 'rate-limited' : 'failed', message, error: failures[0], failed: failures.length, needsAuth: true });
      toast(message, 'warn');
    }
    if (typeof render === 'function' && options.renderStatus !== false) render();
    return loaded;
  }

  function workspaceHasGitHubIssueSurface(ws, sourceId) {
    return Array.from(ws?.files?.values?.() || []).some((file) => file.sourceId === sourceId && sourceSurfaceForEntry(file) === 'issues');
  }

  async function runWorkspaceStartupGitHubIssueDiscovery(ws, options = {}) {
    if (!ws || ws.loading) return 0;
    ensureWorkspaceSources(ws);
    const sources = Array.from(ws.sources?.values?.() || []).filter((source) => source?.kind === 'github' && source.repo);
    let loaded = 0;
    for (const source of sources) {
      const canonical = registerGitHubSource(ws, source);
      const surfaces = normalizeGithubSurfaceConfig(canonical.enabledSurfaces || {});
      if (!surfaces.issues) continue;
      if (!options.refreshExisting && workspaceHasGitHubIssueSurface(ws, canonical.id)) continue;
      loaded += await discoverGitHubIssuesIntoWorkspace(ws, canonical, canonical.issueUrls || [], { commentLimit: options.commentLimit || 50 });
    }
    if (loaded && typeof computeWorkspaceIndex === 'function') computeWorkspaceIndex(ws);
    if (loaded && typeof render === 'function') render();
    return loaded;
  }

  function scheduleWorkspaceStartupGitHubIssueDiscovery(ws, reason = 'startup') {
    if (!ws?.id) return false;
    ws.pendingGitHubIssueDiscoveryReason = reason;
    window.setTimeout(() => {
      runWorkspaceStartupGitHubIssueDiscovery(ws, { reason }).catch((error) => {
        ws.logs?.push?.(`Startup issue discovery failed: ${error.message}`);
      });
    }, 0);
    return true;
  }

  async function loadGitHubStateSourceIntoWorkspace(ws, source, options = {}) {
    const normalizedSource = normalizeGitHubSourceState(source || {}, ws);
    if (!ws || !normalizedSource.repo) return null;
    const rootPaths = normalizedSource.rootPaths && normalizedSource.rootPaths.length ? normalizedSource.rootPaths : ['.topics'];
    const enabledSurfaces = normalizeGithubSurfaceConfig(normalizedSource.enabledSurfaces || {});
    const githubSource = registerGitHubSource(ws, normalizedSource);
    applyGitHubSourceSurfacePruning(ws, githubSource, enabledSurfaces, false);
    if (enabledSurfaces.repoFiles && typeof discoverGitHubRepoIntoWorkspace === 'function') {
      await discoverGitHubRepoIntoWorkspace(ws, {
        repo: normalizedSource.repo,
        ref: normalizedSource.ref || '',
        rootPaths,
        refreshExisting: Boolean(options.refreshExisting),
        hardRefresh: Boolean(options.hardRefresh),
        source: githubSource
      });
    } else {
      ws.repo = normalizedSource.repo;
      if (normalizedSource.ref) ws.ref = normalizedSource.ref;
      ws.discoverySource = { kind: 'github-tree', repo: normalizedSource.repo, ref: normalizedSource.ref || '', rootPath: rootPaths[0] || '.topics', rootPaths, sourceId: githubSource.id, enabledSurfaces, issueUrls: githubSource.issueUrls || [], discoveryDirective: githubSource.discoveryDirective || null };
      if (typeof computeWorkspaceIndex === 'function') computeWorkspaceIndex(ws);
    }
    if (enabledSurfaces.issues && typeof discoverGitHubIssuesIntoWorkspace === 'function') {
      await discoverGitHubIssuesIntoWorkspace(ws, githubSource, githubSource.issueUrls || [], { refreshExisting: Boolean(options.refreshExisting), hardRefresh: Boolean(options.hardRefresh) });
    }
    return githubSource;
  }

  async function createWorkspaceFromInputs() {
    const modal = app.modal?.type === 'source' ? app.modal : {};
    const appendWs = modal.appendWsId ? getWorkspace(modal.appendWsId) : null;
    const editingSource = appendWs && modal.editSourceId ? sourceById(appendWs, modal.editSourceId) : null;

    const repoInput = $('source-repo')?.value?.trim() || '';
    const parsedRepo = repoInput && typeof parseGitHubRepoSpec === 'function' ? parseGitHubRepoSpec(repoInput) : null;
    const refInput = $('source-ref')?.value?.trim() || '';
    const rootPaths = typeof parseRootPaths === 'function' ? parseRootPaths($('source-root')?.value || '.topics') : ['.topics'];
    const repoDiscovery = $('source-repo-discovery')?.checked ?? modal.repoDiscovery ?? true;
    const issueDiscovery = $('source-issue-discovery')?.checked ?? modal.issueDiscovery ?? true;
    const urls = ($('source-urls')?.value || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const issueUrlsInput = $('source-issue-urls')?.value || '';
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

    if (appendWs && !parsedRepo && !urls.length && !files.length && !editingSource) {
      toast('Choose files, paste URLs, enter a repo, or drop material before adding.', 'warn');
      return;
    }

    if ((modal.addMode === 'git' || editingSource) && !parsedRepo) {
      toast('Enter a GitHub repo URL or owner/name before saving this source.', 'warn');
      $('source-repo')?.focus?.();
      return;
    }

    const label = appendWs
      ? appendWs.label
      : ($('source-label')?.value?.trim() || 'New workspace');
    const ws = appendWs || createWorkspace(label, 'Empty workspace. Add material with the Add button or drag/drop.');

    const requestedRef = parsedRepo ? (refInput || parsedRepo.ref || '') : '';
    const requestedRoots = parsedRepo ? (rootPaths.length ? rootPaths : (typeof parseRootPaths === 'function' ? parseRootPaths(parsedRepo.rootPath || '.topics') : ['.topics'])) : [];
    const enabledSurfaces = normalizeGithubSurfaceConfig({ repoFiles: repoDiscovery, issues: issueDiscovery });
    const issueUrls = parsedRepo ? parseSourceIssueUrls(issueUrlsInput, parsedRepo.repo) : [];
    let githubSource = null;
    let resetSourceContent = false;

    if (parsedRepo) {
      const old = editingSource || null;
      const oldSourceSnapshot = old ? {
        repo: old.repo || '',
        ref: old.ref || '',
        rootPaths: Array.isArray(old.rootPaths) ? old.rootPaths.slice() : []
      } : null;
      githubSource = registerGitHubSource(ws, {
        id: old?.id || githubSourceId(parsedRepo.repo),
        repo: parsedRepo.repo,
        ref: requestedRef || old?.ref || '',
        rootPaths: requestedRoots,
        enabledSurfaces,
        issueUrls,
        origin: `https://github.com/${parsedRepo.repo}`
      });
      resetSourceContent = Boolean(oldSourceSnapshot && (
        String(oldSourceSnapshot.repo || '').toLowerCase() !== parsedRepo.repo.toLowerCase()
        || String(oldSourceSnapshot.ref || '') !== String(githubSource.ref || '')
        || JSON.stringify(oldSourceSnapshot.rootPaths || []) !== JSON.stringify(requestedRoots || [])
      ));
      applyGitHubSourceSurfacePruning(ws, githubSource, enabledSurfaces, resetSourceContent);
    }

    app.modal = null;
    app.activeWorkspaceId = ws.id;
    if (typeof focusWorkspaceWindow === 'function') focusWorkspaceWindow(ws.id);
    render();

    if (configFiles.length) await openWorkspaceFiles(configFiles, { applyWorkspaceState: true });

    if (githubSource && enabledSurfaces.repoFiles && typeof discoverGitHubRepoIntoWorkspace === 'function') {
      await discoverGitHubRepoIntoWorkspace(ws, {
        repo: githubSource.repo,
        ref: githubSource.ref || '',
        rootPaths: githubSource.rootPaths || requestedRoots,
        refreshExisting: true,
        source: githubSource
      });
    }
    if (githubSource && enabledSurfaces.issues) {
      await discoverGitHubIssuesIntoWorkspace(ws, githubSource, issueUrls);
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
      scheduleWorkspaceStartupGitHubIssueDiscovery(ws, 'local-state-merge');
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
      scheduleWorkspaceStartupGitHubIssueDiscovery(ws, 'local-state-restore');
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
    if ((source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue') && ws.discoverySource?.repo === source.repo) {
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





  const TIINEX_SCHEMA_PERMALINK_COMMIT = '7aecdb99551c4b6850665cdee418f0b9907d9616';
  const TIINEX_SCHEMA_PERMALINK_BASE = `https://github.com/Tiinex/docs/blob/${TIINEX_SCHEMA_PERMALINK_COMMIT}/.topics/.schemas/`;
  const TIINEX_ROOT_SCHEMA_URL = `${TIINEX_SCHEMA_PERMALINK_BASE}tiinex.root.v1.schema.md`;
  const TIINEX_VALIDATOR_PERMALINK_COMMIT = '3466e50d739a9ba65319297cef79c6b09844b1d7';
  const TIINEX_VALIDATOR_PERMALINK_BASE = `https://github.com/Tiinex/docs/blob/${TIINEX_VALIDATOR_PERMALINK_COMMIT}/.topics/.validators/`;
  const TIINEX_SHA256_C14N_METHOD_ID = 'sha256-base64url-c14n-v1';
  const TIINEX_SHA256_C14N_VALIDATOR_URL = `${TIINEX_VALIDATOR_PERMALINK_BASE}${TIINEX_SHA256_C14N_METHOD_ID}.validator.md`;

  function validationMethodIdFromLabel(label) {
    const parsed = parseMarkdownLink(label || '');
    return stripMarkdownInline(parsed.text || label || '').trim();
  }

  function validationMethodHrefFromLabel(label) {
    return parseMarkdownLink(label || '').href || '';
  }

  function validationMethodEntryLabel(methodId = TIINEX_SHA256_C14N_METHOD_ID) {
    const id = String(methodId || TIINEX_SHA256_C14N_METHOD_ID).trim();
    if (id === TIINEX_SHA256_C14N_METHOD_ID) return `[${id}](${TIINEX_SHA256_C14N_VALIDATOR_URL})`;
    return id;
  }

  function validationMethodDefinitionUrl(methodId, methodHref = '') {
    const id = validationMethodIdFromLabel(methodId || '');
    if (methodHref) return methodHref;
    if (id === TIINEX_SHA256_C14N_METHOD_ID) return TIINEX_SHA256_C14N_VALIDATOR_URL;
    return '';
  }

  function methodDefinitionDisplayLabel(methodId, definitionUrl = '') {
    const id = validationMethodIdFromLabel(methodId || '');
    if (id === TIINEX_SHA256_C14N_METHOD_ID) return 'sha256-base64url-c14n-v1.validator.md';
    if (definitionUrl) return fileNameFromPath(stripUrlDecorations(definitionUrl)) || id || 'method definition';
    return id || 'method definition';
  }

  function validationMethodDefinitionStatus(methodId, definitionUrl = '') {
    const id = validationMethodIdFromLabel(methodId || '');
    if (!id) {
      return { status: 'none', label: 'No method entry', message: 'No validation method is declared.' };
    }
    if (definitionUrl) {
      return { status: 'available', label: 'Definition linked', message: 'The method id resolves to an explicit validation method definition.' };
    }
    return { status: 'unavailable', label: 'Definition unavailable', message: 'The method id is readable, but this viewer has no method-definition authority link for it.' };
  }

  function validatorPathFromMethodDefinitionUrl(url = '') {
    const clean = stripUrlDecorations(url || '');
    const marker = '/.topics/.validators/';
    const index = clean.indexOf(marker);
    if (index >= 0) return `.topics/.validators/${clean.slice(index + marker.length)}`;
    const file = fileNameFromPath(clean);
    return isValidatorPath(file) ? file : '';
  }

  function isValidationMethodDefinitionNode(node) {
    if (!node) return false;
    if (isValidatorPath(node.path)) return true;
    return schemaKey(node.currentSchemaText || node.currentSchema || '') === 'validation.method';
  }

  function findValidationMethodDefinitionNode(ws, methodId, definitionUrl = '') {
    if (!ws) return null;
    const id = validationMethodIdFromLabel(methodId || '');
    const expectedPath = validatorPathFromMethodDefinitionUrl(definitionUrl) || (id ? `.topics/.validators/${id}.validator.md` : '');
    const expectedFile = fileNameFromPath(expectedPath || '');
    const safeUrlValue = safeUrl(definitionUrl || '');
    for (const candidate of ws.nodes || []) {
      if (!isValidationMethodDefinitionNode(candidate)) continue;
      if (safeUrlValue && (candidate.browseUrl === safeUrlValue || candidate.rawUrl === safeUrlValue)) return candidate;
      if (expectedPath && normalizeRepoPath(candidate.path || '') === normalizeRepoPath(expectedPath)) return candidate;
      if (expectedFile && fileNameFromPath(candidate.path || '') === expectedFile) return candidate;
      if (id && stripMarkdownInline(candidate.body || '').includes(`Canonical Identifier: ${id}`)) return candidate;
    }
    return null;
  }

  function schemaAuthorityLabelForNode(node) {
    const schemaText = String(node?.currentSchema || node?.currentSchemaText || '').trim();
    if (!schemaText) return 'not declared';
    const link = parseMarkdownLink(schemaText);
    const href = link.href || '';
    if (/github\.com\/Tiinex\/docs\/blob\/[0-9a-f]{40}\//i.test(href)) return 'commit-pinned schema authority';
    if (href) return 'linked schema authority';
    return 'plain schema id';
  }

  function byteIntegrityAuditLabel(status) {
    if (status === 'byte-integrity-verified') return 'byte-integrity match';
    if (status === 'mismatch') return 'byte-integrity mismatch';
    if (status === 'draft-pending') return 'draft/no-claim';
    if (status === 'malformed-claim') return 'malformed integrity claim';
    if (status === 'method-unsupported') return 'unsupported method';
    if (status === 'target-unavailable') return 'target unavailable';
    if (status === 'target-ambiguous') return 'target ambiguous';
    return status || 'open';
  }

  function integrityClaimLifecycleForStatus(status, integrity = null) {
    const hasClaim = integrityHasClaim(integrity);
    if (status === 'draft-pending' || !hasClaim) {
      return {
        status: 'draft-no-claim',
        label: 'Draft / no integrity claim',
        finality: 'not finalized',
        audit: 'valid draft/local state',
        message: 'No byte-integrity claim is being made yet. This is acceptable for local drafts, but it is not a final verified artifact state.'
      };
    }
    if (status === 'malformed-claim') {
      return {
        status: 'claim-malformed',
        label: 'Claim present but malformed',
        finality: 'claim needs repair',
        audit: 'malformed final claim',
        message: 'A claim is present, but it is incomplete or placeholder-like and should be repaired before final/export use.'
      };
    }
    if (status === 'byte-integrity-verified') {
      return {
        status: 'claim-verified',
        label: 'Final integrity claim verified',
        finality: 'verified claim',
        audit: 'final byte-integrity claim',
        message: 'A complete byte-integrity claim is present and this viewer verified it against the declared target.'
      };
    }
    return {
      status: 'claim-open',
      label: 'Integrity claim present',
      finality: 'claim not fully verified',
      audit: 'open integrity claim',
      message: 'A claim is present, but this viewer has not verified a final byte-integrity match for it.'
    };
  }

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
    if (!value) return base;
    return base + `- ${validationMethodEntryLabel()}\n  - Towards: ${towards || 'this config document'}\n  - Value: ${value}\n`;
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
        source.enabledSurfaces = normalizeGithubSurfaceConfig({
          repoFiles: isAffirmative(firstKv(map, ['Repo Files Discovery', 'Repo Discovery'], ''), true),
          issues: isAffirmative(firstKv(map, ['Issue Discussion Discovery', 'Issue Discovery'], ''), true)
        });
        source.issueUrls = uniqueNonEmpty(splitCsv(allKv(map, ['Issue URL', 'Issue URLs'])));
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
          source.enabledSurfaces = normalizeGithubSurfaceConfig({
            repoFiles: isAffirmative(firstKv(map, ['Repo Files Discovery', 'Repo Discovery'], ''), true),
            issues: isAffirmative(firstKv(map, ['Issue Discussion Discovery', 'Issue Discovery'], ''), true)
          });
          source.issueUrls = uniqueNonEmpty(splitCsv(allKv(map, ['Issue URL', 'Issue URLs'])));
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
        const surfaces = normalizeGithubSurfaceConfig(source.enabledSurfaces || {});
        lines.push('- Source Kind: github-tree');
        if (source.repo) lines.push(`- Repository: ${source.repo}`);
        if (source.ref) lines.push(`- Ref: ${source.ref}`);
        (source.rootPaths || [source.rootPath || '.topics']).filter(Boolean).forEach((root) => lines.push(`- Root Path: ${root}`));
        lines.push(`- Repo Files Discovery: ${surfaces.repoFiles ? 'on' : 'off'}`);
        lines.push(`- Issue Discussion Discovery: ${surfaces.issues ? 'on' : 'off'}`);
        if (source.discoveryDirective?.path) lines.push(`- Discovery Directive: ${source.discoveryDirective.path}`);
        (source.issueUrls || []).filter(Boolean).forEach((url) => lines.push(`- Issue URL: ${url}`));
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
    if (action === 'edit-source') {
      event.preventDefault();
      event.stopPropagation();
      return openEditSourceModal(event.currentTarget.dataset.ws, event.currentTarget.dataset.source);
    }
    if (action === 'refresh-source' || action === 'hard-refresh-source') {
      event.preventDefault();
      event.stopPropagation();
      return refreshEditedGitHubSource(action === 'hard-refresh-source');
    }
    if (action === 'close-source') {
      event.preventDefault();
      event.stopPropagation();
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

  function renderChromeSignature(count, canPage) {
    const cfg = app.viewerIdentity || {};
    return JSON.stringify({
      viewerLabel: cfg.label || '',
      viewerDisplay: cfg.displayName || cfg.heading || '',
      viewerHome: cfg.home || '',
      viewerIcon: cfg.icon || cfg.iconRaw || '',
      help: configHasHelp(),
      workspaceCount: app.workspaces.length,
      visibleCount: count,
      canPage
    });
  }

  function renderTopbarHtml() {
    return `
        <header class="topbar topbar-foundation topbar-shell topbar-layout topbar-actions topbar-branded">
          ${renderViewerBrand()}
          <div class="top-actions workspace-top-actions-layout workspace-top-actions-toolbar">
            <button class="tv-btn primary" data-action="open-source-modal" title="Create or add a workspace/source"><i class="fa-solid fa-plus"></i>Create</button>
            <button class="tv-btn subtle" data-action="export-config" title="Save current view/lens as a portable .workspace.md file. Local-only material is noted but not embedded."><i class="fa-regular fa-floppy-disk"></i>Save workspace</button>
            <button class="tv-btn subtle" data-action="copy-share" title="Copies the current view only. Local uploads, preserved assets, and unsaved workspace contents are not included." aria-label="Copies the current view only. Local uploads, preserved assets, and unsaved workspace contents are not included."><i class="fa-solid fa-link"></i>Copy link</button>
          </div>
          ${renderHelpButton()}
        </header>`;
  }

  function renderWorkspaceGridHtml(count, visible) {
    return `
        <main class="workspace-grid workspace-foundation-grid workspace-shell-grid workspace-grid-layout workspace-grid-columns columns-${Math.max(1, Math.min(count, visible.length || 1))}" id="workspace-grid" ${workspaceGridStyleVar(visible)}>
          ${visible.length ? visible.map(renderWorkspace).join('') : renderNoWorkspace()}
        </main>`;
  }

  function renderToastsHtml() {
    return `<div id="toasts" class="toasts">${app.toasts.map((t) => `<div class="toast-item ${t.type || 'info'}">${escapeHtml(t.text)}</div>`).join('')}</div>`;
  }

  function renderModalRootHtml() {
    return `<div id="modal-root" class="modal-root">${app.modal ? renderModal(app.modal) : ''}</div>`;
  }

  function renderFullAppHtml(count, visible, canPage) {
    return `
      <div class="app-shell app-shell-foundation app-shell-main app-shell-layout app-shell-grid app-shell-mobile-safe-area app-shell-mobile-compact app-shell-branded">
        ${renderTopbarHtml()}
        ${canPage ? renderWorkspacePager(count) : ''}
        ${renderWorkspaceGridHtml(count, visible)}
      </div>
      <footer class="app-footer">Powered by <a href="https://github.com/Tiinex" target="_blank" rel="noopener">Tiinex</a></footer>
      ${renderToastsHtml()}
      ${renderModalRootHtml()}
    `;
  }

  function replaceHtmlAndBind(selectorRoot, html, bind = true) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    const nextEl = tmp.firstElementChild;
    if (!selectorRoot || !nextEl) return null;
    selectorRoot.replaceWith(nextEl);
    if (bind) bindEvents(nextEl);
    return nextEl;
  }

  function patchWorkspacePager(root, shell, count, canPage) {
    const oldPager = root.querySelector('.workspace-pager');
    const grid = root.querySelector('#workspace-grid');
    if (!canPage) {
      oldPager?.remove?.();
      return null;
    }
    const html = renderWorkspacePager(count).trim();
    if (oldPager) return replaceHtmlAndBind(oldPager, html, true);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const nextPager = tmp.firstElementChild;
    if (!nextPager) return null;
    shell.insertBefore(nextPager, grid || null);
    bindEvents(nextPager);
    return nextPager;
  }

  function patchRender(root, count, visible, canPage, signature) {
    const shell = root.querySelector('.app-shell');
    const grid = root.querySelector('#workspace-grid');
    const toasts = root.querySelector('#toasts');
    const modalRoot = root.querySelector('#modal-root');
    if (!shell || !grid || !toasts || !modalRoot) return false;

    patchWorkspacePager(root, shell, count, canPage);
    replaceHtmlAndBind(grid, renderWorkspaceGridHtml(count, visible), true);
    replaceHtmlAndBind(toasts, renderToastsHtml(), false);
    modalRoot.innerHTML = app.modal ? renderModal(app.modal) : '';
    bindEvents(modalRoot);
    root.dataset.renderChromeSignature = signature;
    root.dataset.renderBoundary = 'patched';
    return true;
  }

  function render() {
    const snapshots = typeof snapshotRenderScrolls === 'function' ? snapshotRenderScrolls() : { feed: [], modal: [] };
    const root = $('app');
    ensureWorkspaceWindow();
    const count = visibleWorkspaceCount();
    const visible = visibleWorkspaces();
    const total = app.workspaces.length;
    const canPage = total > count;
    const signature = renderChromeSignature(count, canPage);
    const canPatch = root.dataset.renderChromeSignature === signature;
    const patched = canPatch ? patchRender(root, count, visible, canPage, signature) : false;
    if (!patched) {
      root.innerHTML = renderFullAppHtml(count, visible, canPage);
      root.dataset.renderChromeSignature = signature;
      root.dataset.renderBoundary = 'full';
      bindEvents(root);
    }
    if (typeof restoreRenderScrolls === 'function') restoreRenderScrolls(snapshots);
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
  - Current Schema: [tiinex.workspace.v1](${TIINEX_SCHEMA_PERMALINK_BASE}tiinex.workspace.v1.schema.md)
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

  function pageHasExplicitWorkspaceQuery() {
    try {
      const params = new URLSearchParams(location.search || '');
      return ['viewerWorkspace', 'workspace', 'viewerConfig', 'config', 'identity'].some((key) => params.has(key) && String(params.get(key) || '').trim());
    } catch (_) {
      return false;
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

  async function fetchText(url, label = 'resource', options = {}) {
    const resolved = (() => {
      try { return new URL(url, location.href).href; } catch (_) { return String(url || ''); }
    })();

    if (isFileProtocolUrl(resolved) && location.protocol === 'file:') {
      throw new Error(`${label} is local-only in file:// mode; drop the file or host the viewer over http://localhost.`);
    }

    return await adapterFetchText(resolved, {
      adapter: adapterIdForUrl(resolved),
      label,
      hardRefresh: Boolean(options.hardRefresh)
    });
  }




  const EMBEDDED_DEFAULT_WORKSPACE_MD = "# Continuity Context\n\n- Envelope Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/7aecdb99551c4b6850665cdee418f0b9907d9616/.topics/.schemas/tiinex.root.v1.schema.md)\n- Current\n  - Current Schema: [tiinex.workspace.v1](https://github.com/Tiinex/docs/blob/7aecdb99551c4b6850665cdee418f0b9907d9616/.topics/.schemas/tiinex.workspace.v1.schema.md)\n  - Created At: 2026-06-16 00:00:00\n  - Why: Defines a portable multi-lineage workspace entrypoint.\n  - Summary: Opens the Tiinex docs workspace and declares the default viewer discovery lens.\n\n---\n\n# Tiinex Viewer\n\n## Viewer Identity\n\n- Icon: ../../assets/tiinex-logo-white-transparent.png\n- Home: https://github.com/Tiinex\n\n## Empty Stage\n\n- Subtitle: Every handoff starts somewhere\n- Subtitle: Start where the last thread ends\n- Subtitle: Leave enough for the next mind\n- Subtitle: A thread is waiting\n- Subtitle: Nothing starts from nothing\n\n## Workspace Discovery\n\n- [Tiinex docs workspaces](https://github.com/Tiinex/docs)\n  - Kind: github-tree\n  - Ref: master\n  - Root Path: .topics\n  - Match: *.workspace.md\n  - Label: Tiinex docs workspaces\n  - Open Behavior: chooser\n\n## Workspace Entrypoints\n\n### Tiinex docs\n\n- Source Kind: github-tree\n- Repository: Tiinex/docs\n- Ref: master\n- Root Path: .topics\n- Repo Files Discovery: on\n- Issue Discussion Discovery: on\n- Issue URL: https://github.com/Tiinex/docs/issues/4\n- Default View: feed\n- Default Filter: all\n\n## Help\n\n### What is this view?\n\nThis workspace opens Tiinex markdown artifacts so an external reviewer and their LLM helpers can inspect continuity, source material, integrity signals, and continuation paths.\n\n### What should I check first?\n\nStart with what is loaded.\n\nCheck the workspace source, then inspect the visible badges. Treat integrity mismatch, missing integrity, unknown schema, and local-only material as review signals, not automatic failure.\n\n### What should I trust?\n\nTrust only what the artifact and its sources actually show.\n\nUse `Source` to inspect where material came from, `Markdown` to read the artifact, `Open` to inspect the selected node, and `Continue` only when the next step is clear enough to preserve.\n\n### What should an LLM preserve?\n\nDo not collapse Parent and Origin.\n\nParent is the declared continuity edge. Origin is provenance for where the material came from. If either is missing or weak, say so rather than filling the gap.\n\n### What should I send back?\n\nA useful validation note names the selected artifact, the source inspected, the observed signal, and the smallest next correction or continuation.\n\n---\n\n# Continuity Integrity\n\n- [sha256-base64url-c14n-v1](https://github.com/Tiinex/docs/blob/3466e50d739a9ba65319297cef79c6b09844b1d7/.topics/.validators/sha256-base64url-c14n-v1.validator.md)\n  - Towards: [viewer.workspace.md](viewer.workspace.md)\n  - Value: cq_1gsfGZ34oa4EQbEDrpO4Vaq9vYZAdn6Xwkl10blA\n";

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
        const markdown = await fetchText(url, 'viewer workspace');
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

  function isTiinexMarkdownArtifactPath(value) {
    return /\.(trace|schema|workspace|validator)\.md(?:$|[?#])/i.test(String(value || ''));
  }

  function isValidatorPath(path) {
    return /\.validator\.md(?:$|[?#])/i.test(String(path || ''));
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
    if (isValidatorPath(path)) return 'validator';
    if (isTracePath(path)) return 'trace';
    if (ref.image || isImagePath(path)) return 'image';
    if (isTextPreviewPath(path)) return /\.md|\.markdown/i.test(fileExtension(path)) ? 'markdown' : 'text';
    if (/^https?:\/\//i.test(ref.href || ref.sourceUrl || '')) return 'external';
    return 'file';
  }

  function previewMaterialKindLabel(kind) {
    return {
      schema: 'Schema reference',
      validator: 'Validator definition',
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
      validator: 'fa-solid fa-shield-halved',
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
    if (total) bits.push(`${total} attachment${total === 1 ? '' : 's'}`);
    if (counts.image) bits.push(`${counts.image} image${counts.image === 1 ? '' : 's'}`);
    if (counts.markdown) bits.push(`${counts.markdown} markdown${counts.markdown === 1 ? '' : 's'}`);
    if (counts.text) bits.push(`${counts.text} text${counts.text === 1 ? '' : 's'}`);
    return bits;
  }

  function groupMaterialRefs(refs) {
    const order = ['image', 'markdown', 'text', 'file', 'external', 'unresolved'];
    const groups = new Map(order.map((key) => [key, []]));
    refs.forEach((ref) => {
      const key = groups.has(ref.kind) ? ref.kind : 'file';
      groups.get(key).push(ref);
    });
    return order.map((kind) => ({ kind, items: groups.get(kind) || [] })).filter((group) => group.items.length);
  }

  function renderMaterialPrimaryAction(ws, node, ref) {
    const idx = materialRefIndex(ws, node, ref);
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
    if ((base.kind === 'trace' || base.kind === 'schema' || base.kind === 'validator') && ws) {
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
      const historyState = routeHistoryState(state, kind);
      if (kind === 'replace') history.replaceState(historyState, '', next);
      else history.pushState(historyState, '', next);
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
    const historyState = routeHistoryState(state, kind);
    if (kind === 'replace') history.replaceState(historyState, '', next);
    else history.pushState(historyState, '', next);
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
        if (viewState && !dialogRouteSessionClosed(viewState.modal)) applyViewRouteState(viewState);
        else if (/^#state=/i.test(location.hash || '') || dialogRouteSessionClosed(viewState?.modal)) cleanHashOnly();
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
          if (dialogRouteSessionClosed(state.modal)) {
            skipClosedDialogHistoryEntry(state);
            return;
          }
          applyViewRouteState(state);
          render();
          scheduleRouteHistoryScrollRestore('popstate');
        }
        return;
      }

      const state = decodeRouteStateFromHash();
      if (!state) return;
      if (dialogRouteSessionClosed(state.modal)) {
        skipClosedDialogHistoryEntry(state);
        return;
      }
      const restored = await applyRouteState(state, !routeSourcesMatch(state));
      if (restored) {
        render();
        scheduleRouteHistoryScrollRestore('popstate');
      }
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

  function methodDefinitionChipHtml(node) {
    if (!isValidationMethodDefinitionNode(node)) return '';
    return '<span class="badge-soft method-definition-chip"><i class="fa-solid fa-shield-halved"></i>method definition</span>';
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
      <article class="lineage-post ${expanded ? 'expanded' : ''} ${node.isGenerated ? 'generated' : ''} ${typeof isSchemaPath === 'function' && isSchemaPath(node.path) ? 'schema-lineage-post' : ''} ${isValidationMethodDefinitionNode(node) ? 'method-definition-lineage-post' : ''}" data-node="${escapeAttr(node.id)}" data-source="${escapeAttr(node.sourceId || '')}">
        <div class="post-main ${mainClass}" data-action="${mainAction}" data-ws="${escapeAttr(ws.id)}" data-node="${escapeAttr(node.id)}" title="${escapeAttr(mainTitle)}" aria-label="${escapeAttr(mainTitle)}">
          <div class="post-chips">
            ${integrityBadge(node)}
            ${typeof schemaBadgeHtml === 'function' ? schemaBadgeHtml(ws, node, schema) : `<span class="badge-soft badge-schema ${schemaBadgeClass(schema)}">${escapeHtml(shortSchema(schema))}</span>`}
            ${methodDefinitionChipHtml(node)}
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

  async function scheduleIntegrityVerification(ws, options = {}) {
    if (!ws) return;
    const withProgress = Boolean(options.discoveryProgress);
    if (ws.integrityInFlight) {
      if (withProgress && ws.integrityInFlightPromise) await ws.integrityInFlightPromise;
      return;
    }

    let changed = false;
    const cache = ws.integrityCache || {};
    const nodes = Array.from(ws.nodes || []);
    const progressEvery = Math.max(1, Number(app.settings.integrityProgressEvery || 4));

    ws.integrityInFlight = true;
    const work = (async () => {
      try {
        if (withProgress) {
          ws.discoveryProgress = Object.assign({}, ws.discoveryProgress || {}, {
            phase: 'integrity',
            integrityLoaded: 0,
            integrityTotal: nodes.length
          });
          updateDiscoveryProgressDom(ws);
          await progressYield(ws);
        }

        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index];
          node.workspace = ws;
          const cacheKey = node.storageKey || node.path;
          const previous = cache[cacheKey]?.status || node.integrityStatus || '';
          const result = await verifyNodeIntegrity(node, ws);
          cache[cacheKey] = result;
          cache[node.path] = result;
          node.integrityStatus = result.status;
          node.integrityStatusLabel = result.label;
          if (previous !== result.status) changed = true;

          if (withProgress) {
            ws.discoveryProgress.integrityLoaded = index + 1;
            ws.discoveryProgress.integrityTotal = nodes.length;
            updateDiscoveryProgressDom(ws);
            if (((index + 1) % progressEvery) === 0) await progressYield(ws);
          }
        }
      } catch (error) {
        ws.logs = ws.logs || [];
        ws.logs.push(`Integrity verification failed: ${error.message}`);
      } finally {
        ws.integrityCache = cache;
        ws.integrityInFlight = false;
        ws.integrityInFlightPromise = null;
        if (changed) render();
      }
    })();

    ws.integrityInFlightPromise = work;
    await work;
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

  function renderIntegrityLinkKv(label, href, text = '') {
    const safeHref = safeUrl(href || '');
    const labelText = text || href || '';
    return `<div class="integrity-kv">
      <dt>${escapeHtml(label)}</dt>
      <dd>${safeHref ? `<a href="${escapeAttr(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(labelText || safeHref)}</a>` : '—'}</dd>
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

  function renderIntegrityValidationEntries(diagnostics) {
    const entries = Array.isArray(diagnostics?.validationEntries) ? diagnostics.validationEntries : [];
    if (!entries.length) {
      return `<section class="integrity-validation-entries">
        <div class="integrity-validation-entries-head">
          <p class="kicker-inline">Validation entries</p>
          <span>No entries</span>
        </div>
        <p class="empty-small">This artifact does not declare validation method entries yet.</p>
      </section>`;
    }
    const rows = entries.map((entry) => {
      const missing = entry.missing?.length ? `Missing: ${entry.missing.join(', ')}` : 'Complete entry shape';
      const methodLink = entry.methodDefinitionUrl
        ? `<a href="${escapeAttr(entry.methodDefinitionUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.method)}</a>`
        : escapeHtml(entry.method);
      const classes = ['integrity-validation-entry', entry.status || 'open'];
      if (entry.active) classes.push('active');
      if (entry.duplicateMethod) classes.push('duplicate');
      return `<article class="${classes.map(escapeAttr).join(' ')}">
        <header>
          <span>Entry ${entry.position}</span>
          <strong>${escapeHtml(entry.label)}</strong>
        </header>
        <dl>
          <div><dt>Method</dt><dd>${methodLink}</dd></div>
          <div><dt>Towards</dt><dd>${escapeHtml(entry.towards || 'missing')}</dd></div>
          <div><dt>Value</dt><dd>${escapeHtml(entry.valueStatus || 'open')}</dd></div>
          <div><dt>Audit</dt><dd>${escapeHtml(entry.duplicateMethod ? `${missing} · duplicate method entry` : missing)}</dd></div>
        </dl>
      </article>`;
    }).join('');
    return `<section class="integrity-validation-entries">
      <div class="integrity-validation-entries-head">
        <p class="kicker-inline">Validation entries</p>
        <span>${escapeHtml(diagnostics?.validationEntryAuditSummary || '')}</span>
      </div>
      <div class="integrity-validation-entry-list">${rows}</div>
    </section>`;
  }

  function renderIntegrityMethodAuthority(diagnostics) {
    const isDraftNoClaim = diagnostics?.claimLifecycleStatus === 'draft-no-claim';
    const method = isDraftNoClaim ? 'No validation method declared yet' : (diagnostics?.method || '—');
    const definitionUrl = diagnostics?.methodDefinitionUrl || '';
    const definitionStatus = isDraftNoClaim ? 'Not required until a claim exists' : (diagnostics?.methodDefinitionStatusLabel || 'Definition unavailable');
    const definitionMessage = isDraftNoClaim
      ? (diagnostics?.claimLifecycleMessage || 'No byte-integrity claim is being made yet.')
      : (diagnostics?.methodDefinitionMessage || 'No method-definition authority is available in this viewer context.');
    const openButton = !isDraftNoClaim && diagnostics?.methodDefinitionNodeId
      ? `<button class="tv-btn subtle" data-action="open-integrity-method-definition" data-node="${escapeAttr(diagnostics.methodDefinitionNodeId)}"><i class="fa-solid fa-shield-halved"></i>Open in workspace</button>`
      : '';
    const sourceLink = !isDraftNoClaim && safeUrl(definitionUrl)
      ? `<a class="tv-btn subtle" href="${escapeAttr(safeUrl(definitionUrl))}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github"></i>Open source</a>`
      : '';
    const copyButton = !isDraftNoClaim && definitionUrl
      ? `<button class="tv-btn subtle" data-action="copy-integrity-method-definition"><i class="fa-regular fa-copy"></i>Copy method link</button>`
      : '';

    return `<section class="integrity-method-authority ${isDraftNoClaim ? 'draft-finality' : ''}" aria-label="Validation method authority">
      <div class="integrity-method-authority-main">
        <p class="kicker-inline">Validation method authority</p>
        <h3>${escapeHtml(method)}</h3>
        <p>${escapeHtml(definitionMessage)}</p>
      </div>
      <dl class="integrity-authority-signals">
        <div><dt>Claim lifecycle</dt><dd>${escapeHtml(diagnostics?.claimLifecycleLabel || 'Integrity claim present')}</dd></div>
        <div><dt>Finality</dt><dd>${escapeHtml(diagnostics?.finalityStatus || 'open')}</dd></div>
        <div><dt>Byte integrity result</dt><dd>${escapeHtml(diagnostics?.byteIntegrityResult || 'open')}</dd></div>
        <div><dt>Method definition</dt><dd>${escapeHtml(definitionStatus)}</dd></div>
        <div><dt>Validation entries</dt><dd>${escapeHtml(diagnostics?.integrityEntrySummary || 'No method entries')}</dd></div>
        <div><dt>Entry audit</dt><dd>${escapeHtml(diagnostics?.validationEntryAuditSummary || '0 evaluated')}</dd></div>
        <div><dt>Schema authority</dt><dd>${escapeHtml(diagnostics?.schemaAuthority || 'not declared')}</dd></div>
      </dl>
      <div class="integrity-method-authority-actions">${openButton}${sourceLink}${copyButton}</div>
    </section>`;
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
      'Audit Signals:',
      `- Claim Lifecycle: ${diagnostics.claimLifecycleLabel || ''}`,
      `- Finality: ${diagnostics.finalityStatus || ''}`,
      `- Export Readiness: ${diagnostics.exportReadiness || ''}`,
      `- Byte Integrity Result: ${diagnostics.byteIntegrityResult || ''}`,
      `- Method Definition Availability: ${diagnostics.methodDefinitionStatusLabel || ''}`,
      `- Validation Entries: ${diagnostics.integrityEntrySummary || ''}`,
      `- Validation Entry Audit: ${diagnostics.validationEntryAuditSummary || ''}`,
      `- Schema Authority: ${diagnostics.schemaAuthority || ''}`,
      '',
      `Method: ${diagnostics.method || ''}`,
      `Method Definition: ${diagnostics.methodDefinitionUrl || ''}`,
      `Method Definition Status: ${diagnostics.methodDefinitionStatus || ''}`,
      `Method Definition Workspace Node: ${diagnostics.methodDefinitionNodeId || ''}`,
      `Integrity Entry Count: ${diagnostics.integrityEntryCount || 0}`,
      `Active Integrity Entry: ${diagnostics.activeIntegrityEntryIndex >= 0 ? diagnostics.activeIntegrityEntryIndex + 1 : ''}`,
      `Supported Integrity Entries: ${diagnostics.supportedIntegrityEntryCount || 0}`,
      `Unsupported Integrity Entries: ${diagnostics.unsupportedIntegrityEntryCount || 0}`,
      `Duplicate Method Entries: ${diagnostics.integrityEntryAudit?.duplicate || 0}`,
      `Incomplete Integrity Entries: ${diagnostics.integrityEntryAudit?.incomplete || 0}`,
      '',
      'Validation Entry Details:',
      ...((diagnostics.validationEntries || []).length ? diagnostics.validationEntries.map((entry) => `- Entry ${entry.position}: ${entry.label}; method=${entry.method}; towards=${entry.towards || 'missing'}; value=${entry.valueStatus}; ${entry.duplicateMethod ? 'duplicate method entry' : 'not duplicate'}`) : ['- none']),
      '',
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

  function integrityHumanTitle(status) {
    const labels = {
      'byte-integrity-verified': 'Byte integrity verified',
      mismatch: 'Checksum mismatch',
      'draft-pending': 'No integrity claim yet',
      'malformed-claim': 'Malformed integrity claim',
      'target-unavailable': 'Integrity target unavailable',
      'target-ambiguous': 'Integrity target ambiguous',
      'method-unsupported': 'Unsupported integrity method',
      unresolved: 'Integrity not proven yet',
      pending: 'Integrity check pending',
      'schema-unverified': 'Schema validation not proven'
    };
    return labels[status] || 'Integrity status open';
  }

  function integrityHumanMessage(diagnostics) {
    const status = diagnostics?.status || '';
    if (status === 'byte-integrity-verified') {
      return `The declared checksum matches the referenced target${diagnostics?.targetLabel ? `: ${diagnostics.targetLabel}` : ''}.`;
    }
    if (status === 'mismatch') return 'The declared checksum does not match the exact target available to this viewer.';
    if (status === 'draft-pending') return 'This artifact is in a draft/no-claim state: no checksum claim is being made yet, and nothing has failed verification.';
    if (status === 'malformed-claim') return 'This artifact has an integrity method entry, but it is incomplete or contains a placeholder-like value.';
    if (status === 'target-unavailable') return 'The integrity target could not be read in this viewer context.';
    if (status === 'target-ambiguous') return 'A possible target exists, but this viewer cannot treat it as the exact declared target.';
    if (status === 'method-unsupported') return 'The artifact names a validation method this viewer does not support yet.';
    return diagnostics?.statusLabel || diagnostics?.note || 'The browser verifier has not produced a conclusive integrity signal.';
  }

  function renderIntegrityMeaning(diagnostics) {
    const status = diagnostics?.status || '';
    const target = diagnostics?.targetLabel || diagnostics?.towards || 'the declared target';
    const verifiedItems = status === 'byte-integrity-verified'
      ? [
          `The declared checksum matched ${target}.`,
          'The check used the named byte-integrity method.',
          diagnostics?.authority ? `Target authority in this viewer: ${diagnostics.authority}.` : ''
        ]
      : status === 'draft-pending'
        ? ['No integrity claim is being made yet.', 'This is a valid draft/local state.', 'It is not final byte-integrity verified and export/publish should surface it as no-claim.']
        : status === 'malformed-claim'
          ? ['A method entry exists, but it is not a valid claim this viewer can verify.']
          : ['This viewer has not proven a matching byte-integrity claim.'];
    const limitationItems = [
      'This does not verify that the artifact claims are true.',
      'This does not verify authorship, intent, consent, or semantic correctness.',
      'This does not prove full historical provenance beyond the declared target and method.'
    ];
    const list = (items) => items.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    return `<div class="integrity-meaning-grid">
      <section class="integrity-meaning-card positive">
        <h3>What this means</h3>
        <ul>${list(verifiedItems)}</ul>
      </section>
      <section class="integrity-meaning-card limited">
        <h3>What this does not verify</h3>
        <ul>${list(limitationItems)}</ul>
      </section>
    </div>`;
  }

  function renderIntegrityDiagnosticsModal(modal) {
    const { node } = findNodeWorkspace(modal.nodeId || '');
    const title = node?.title || 'Integrity diagnostics';
    const diagnostics = modal.diagnostics || null;
    const status = diagnostics?.status || '';

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
            <div class="integrity-summary ${escapeAttr(status)}">
              <strong>${escapeHtml(integrityHumanTitle(status))}</strong>
              <span>${escapeHtml(integrityHumanMessage(diagnostics))}</span>
            </div>
            ${renderIntegrityMethodAuthority(diagnostics)}
            ${renderIntegrityValidationEntries(diagnostics)}
            ${renderIntegrityMeaning(diagnostics)}
            <details class="integrity-raw integrity-technical">
              <summary>Technical details</summary>
              <dl class="integrity-kv-grid">
                ${renderIntegrityKv('Claim lifecycle', diagnostics.claimLifecycleLabel)}
                ${renderIntegrityKv('Finality', diagnostics.finalityStatus)}
                ${renderIntegrityKv('Export readiness', diagnostics.exportReadiness)}
                ${renderIntegrityKv('Method', diagnostics.method, true)}
                ${renderIntegrityLinkKv('Method definition', diagnostics.methodDefinitionUrl, diagnostics.methodDefinitionLabel || 'Open validator definition')}
                ${renderIntegrityKv('Method definition status', diagnostics.methodDefinitionStatusLabel)}
                ${renderIntegrityKv('Validation entries', diagnostics.integrityEntrySummary)}
                ${renderIntegrityKv('Entry audit', diagnostics.validationEntryAuditSummary)}
                ${renderIntegrityKv('Byte integrity result', diagnostics.byteIntegrityResult)}
                ${renderIntegrityKv('Schema authority', diagnostics.schemaAuthority)}
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
              <details class="integrity-raw-text">
                <summary>Raw diagnostic text</summary>
                <pre><code>${escapeHtml(integrityDiagnosticsText(diagnostics))}</code></pre>
              </details>
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
    const initialStatus = initialIntegrityStatusForNode(node);
    const declaredMethod = node?.integrity?.method || '';
    const declaredDefinitionUrl = validationMethodDefinitionUrl(declaredMethod, node?.integrity?.methodHref || '');
    const declaredDefinitionStatus = validationMethodDefinitionStatus(declaredMethod, declaredDefinitionUrl);
    const declaredDefinitionNode = findValidationMethodDefinitionNode(ws, declaredMethod, declaredDefinitionUrl);
    const entryAudit = integrityEntryAuditDetails(node?.integrity);
    const initialLifecycle = integrityClaimLifecycleForStatus(initialStatus, node?.integrity);
    const base = {
      title: node?.title || '',
      path: node?.path || '',
      schema: node?.currentSchemaText || node?.currentSchema || '',
      schemaAuthority: schemaAuthorityLabelForNode(node),
      method: declaredMethod,
      methodDefinitionUrl: declaredDefinitionUrl,
      methodDefinitionLabel: methodDefinitionDisplayLabel(declaredMethod, declaredDefinitionUrl),
      methodDefinitionStatus: declaredDefinitionStatus.status,
      methodDefinitionStatusLabel: declaredDefinitionStatus.label,
      methodDefinitionMessage: declaredDefinitionStatus.message,
      methodDefinitionNodeId: declaredDefinitionNode?.id || '',
      methodDefinitionWorkspaceAvailable: Boolean(declaredDefinitionNode),
      integrityEntryCount: node?.integrity?.entryCount || 0,
      activeIntegrityEntryIndex: node?.integrity?.activeEntryIndex ?? -1,
      supportedIntegrityEntryCount: node?.integrity?.supportedEntryCount || 0,
      unsupportedIntegrityEntryCount: node?.integrity?.unsupportedEntryCount || 0,
      integrityEntrySummary: integrityEntryCountLabel(node?.integrity),
      integrityEntryAudit: entryAudit,
      validationEntryAuditSummary: entryAudit.summary,
      validationEntries: entryAudit.entries,
      byteIntegrityResult: byteIntegrityAuditLabel(initialStatus),
      claimLifecycleStatus: initialLifecycle.status,
      claimLifecycleLabel: initialLifecycle.label,
      claimLifecycleAudit: initialLifecycle.audit,
      claimLifecycleMessage: initialLifecycle.message,
      finalityStatus: initialLifecycle.finality,
      exportReadiness: initialLifecycle.finality,
      towards: target.raw || node?.integrity?.towards || '',
      expected: node?.integrity?.value || '',
      targetStatus: '',
      targetLabel: '',
      confidence: '',
      authority: '',
      hashes: []
    };

    if (initialStatus === 'draft-pending' || initialStatus === 'malformed-claim' || initialStatus === 'method-unsupported') {
      return Object.assign(base, {
        status: initialStatus,
        statusLabel: initialIntegrityStatusLabelForNode(node),
        note: initialIntegrityStatusLabelForNode(node)
      });
    }

    let result = null;
    try {
      result = await hashIntegrityTarget(ws, node, target);
    } catch (error) {
      result = {
        status: 'target-unavailable',
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
    const exactTarget = result?.confidence === 'exact' && (result?.authority === 'local-exact' || result?.authority === 'remote-exact' || result?.authority === 'remote-match');
    const status = match
      ? 'byte-integrity-verified'
      : result?.status === 'unavailable'
        ? 'target-unavailable'
        : result?.status === 'unresolved'
          ? 'target-ambiguous'
          : exactTarget
            ? 'mismatch'
            : (node.integrityStatus || result?.status || 'unresolved');

    const resultMethod = node.integrity?.method || TIINEX_SHA256_C14N_METHOD_ID;
    const resultDefinitionUrl = validationMethodDefinitionUrl(resultMethod, node.integrity?.methodHref || '');
    const resultDefinitionStatus = validationMethodDefinitionStatus(resultMethod, resultDefinitionUrl);
    const resultDefinitionNode = findValidationMethodDefinitionNode(ws, resultMethod, resultDefinitionUrl);
    const resultLifecycle = integrityClaimLifecycleForStatus(status, node?.integrity);

    return Object.assign(base, {
      status,
      statusLabel: match ? `Matched ${match.variant}` : (node.integrityStatusLabel || result?.label || ''),
      method: resultMethod,
      methodDefinitionUrl: resultDefinitionUrl,
      methodDefinitionLabel: methodDefinitionDisplayLabel(resultMethod, resultDefinitionUrl),
      methodDefinitionStatus: resultDefinitionStatus.status,
      methodDefinitionStatusLabel: resultDefinitionStatus.label,
      methodDefinitionMessage: resultDefinitionStatus.message,
      methodDefinitionNodeId: resultDefinitionNode?.id || '',
      methodDefinitionWorkspaceAvailable: Boolean(resultDefinitionNode),
      integrityEntryCount: node?.integrity?.entryCount || 0,
      activeIntegrityEntryIndex: node?.integrity?.activeEntryIndex ?? -1,
      supportedIntegrityEntryCount: node?.integrity?.supportedEntryCount || 0,
      unsupportedIntegrityEntryCount: node?.integrity?.unsupportedEntryCount || 0,
      integrityEntrySummary: integrityEntryCountLabel(node?.integrity),
      integrityEntryAudit: entryAudit,
      validationEntryAuditSummary: entryAudit.summary,
      validationEntries: entryAudit.entries,
      byteIntegrityResult: byteIntegrityAuditLabel(status),
      claimLifecycleStatus: resultLifecycle.status,
      claimLifecycleLabel: resultLifecycle.label,
      claimLifecycleAudit: resultLifecycle.audit,
      claimLifecycleMessage: resultLifecycle.message,
      finalityStatus: resultLifecycle.finality,
      exportReadiness: resultLifecycle.finality,
      schemaAuthority: schemaAuthorityLabelForNode(node),
      towards: target.raw || '',
      expected,
      targetStatus: result?.status || '',
      targetLabel: result?.label || '',
      confidence: result?.confidence || '',
      authority: result?.authority || '',
      hashes,
      note: match
        ? 'Browser verifier found a matching canonical byte-integrity variant.'
        : 'Browser verifier could not prove a matching byte-integrity claim.'
    });
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

  async function copyIntegrityMethodDefinitionLink() {
    if (app.modal?.type !== 'integrity-diagnostics' || !app.modal.diagnostics?.methodDefinitionUrl) return;
    try {
      await navigator.clipboard.writeText(app.modal.diagnostics.methodDefinitionUrl);
      toast('Method definition link copied.', 'ok');
    } catch (_) {
      toast('Could not copy method definition link from this browser context.', 'warn');
    }
  }

  function openIntegrityMethodDefinitionFromDiagnostics() {
    if (app.modal?.type !== 'integrity-diagnostics' || !app.modal.diagnostics) return;
    const { ws } = findNodeWorkspace(app.modal.nodeId || '');
    const target = ws?.nodeById?.get?.(app.modal.diagnostics.methodDefinitionNodeId || '');
    if (!ws || !target) {
      toast('Method definition is not loaded in this workspace.', 'warn');
      return;
    }
    app.modal = null;
    app.activeWorkspaceId = ws.id;
    ws.selectedNodeId = target.id;
    focusWorkspaceWindow(ws.id);
    setRouteState('push');
    render();
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
    if (action === 'copy-integrity-method-definition') {
      event.preventDefault();
      event.stopPropagation();
      return copyIntegrityMethodDefinitionLink();
    }
    if (action === 'open-integrity-method-definition') {
      event.preventDefault();
      event.stopPropagation();
      return openIntegrityMethodDefinitionFromDiagnostics();
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
    const initialStatus = initialIntegrityStatusForNode(node);
    if (initialStatus === 'draft-pending' || initialStatus === 'malformed-claim' || initialStatus === 'method-unsupported') {
      return { status: initialStatus, label: initialIntegrityStatusLabelForNode(node) };
    }

    const target = integrityTowardsRef(node);
    if (!target.raw) return { status: 'malformed-claim', label: 'Integrity claim target is missing.' };

    try {
      const result = await hashIntegrityTarget(ws || node.workspace || null, node, target);
      if (result.status === 'unavailable') return { status: 'target-unavailable', label: result.label };
      if (result.status === 'unresolved') return { status: 'target-ambiguous', label: result.label };

      const match = matchingIntegrityHash(result, node.integrity.value);
      if (match) return { status: 'byte-integrity-verified', label: `byte integrity verified against ${result.label || 'target'} using ${match.variant}` };

      if (result.confidence === 'exact' && (result.authority === 'local-exact' || result.authority === 'remote-exact')) {
        return { status: 'mismatch', label: `checksum mismatch against exact target ${result.label || ''}`.trim() };
      }

      return {
        status: 'target-ambiguous',
        label: `integrity target ambiguous for ${result.label || 'target'}`
      };
    } catch (error) {
      return { status: 'target-unavailable', label: `integrity target unavailable: ${error.message}` };
    }
  }

  function effectiveIntegrityStatus(node) {
    return node?.integrityStatus || initialIntegrityStatusForNode(node);
  }

  function canOpenIntegrityDiagnostics(node) {
    return Boolean(node?.id);
  }




  function integrityStatusLabel(status) {
    const labels = {
      'byte-integrity-verified': 'byte ok',
      'draft-pending': 'draft',
      pending: 'open',
      'target-unavailable': 'target unavailable',
      'target-ambiguous': 'open',
      'method-unsupported': 'unsupported',
      unavailable: 'open',
      unresolved: 'open',
      missing: 'no claim',
      malformed: 'malformed',
      'malformed-claim': 'malformed',
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
    const accepted = new Set(['byte-integrity-verified', 'mismatch', 'open', 'target-unavailable', 'target-ambiguous', 'method-unsupported', 'draft-pending', 'malformed-claim', 'unavailable', 'unresolved', 'missing', 'malformed']);
    if (!accepted.has(status)) return;

    const normalized = status === 'open' ? 'unresolved' : status === 'unavailable' ? 'target-unavailable' : status === 'malformed' ? 'malformed-claim' : status === 'missing' ? 'draft-pending' : status;
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
      'byte-integrity-verified': { cls: 'ok', icon: 'fa-circle-check', title: node.integrityStatusLabel || 'Byte-integrity claim matches the declared target.' },
      'draft-pending': { cls: 'pending draft', icon: 'fa-pen-nib', title: node.integrityStatusLabel || 'No integrity claim is declared yet.' },
      pending: { cls: 'pending', icon: 'fa-hourglass-half', title: 'Verification is still pending.' },
      'target-unavailable': { cls: 'pending', icon: 'fa-clock', title: node.integrityStatusLabel || 'The declared integrity target is not available in this viewer context.' },
      'target-ambiguous': { cls: 'pending unresolved', icon: 'fa-circle-question', title: node.integrityStatusLabel || 'The target candidate is ambiguous in this viewer context.' },
      'method-unsupported': { cls: 'warn', icon: 'fa-puzzle-piece', title: node.integrityStatusLabel || 'The integrity method is not supported by this viewer.' },
      unavailable: { cls: 'pending', icon: 'fa-clock', title: node.integrityStatusLabel || 'No breakage found, but this browser could not complete verification for the current scope.' },
      unresolved: { cls: 'pending unresolved', icon: 'fa-circle-question', title: node.integrityStatusLabel || 'No breakage found, but verification remains open in this browser context.' },
      'schema-unverified': { cls: 'pending schema-unverified', icon: 'fa-scale-balanced', title: node.integrityStatusLabel || 'Schema continuity is declared but not fully audited in this viewer scope.' },
      missing: { cls: 'pending draft', icon: 'fa-pen-nib', title: 'No integrity claim is declared.' },
      malformed: { cls: 'warn', icon: 'fa-triangle-exclamation', title: node.integrityStatusLabel || 'Integrity footer was present but incomplete.' },
      'malformed-claim': { cls: 'warn', icon: 'fa-triangle-exclamation', title: node.integrityStatusLabel || 'Integrity claim is incomplete or placeholder-like.' },
      mismatch: { cls: 'danger', icon: 'fa-circle-xmark', title: node.integrityStatusLabel || 'Checksum does not match the exact target in the current verification scope.' }
    };
    const item = map[status] || map.unresolved;
    const label = integrityStatusLabel(status);
    const canOpenDiagnostics = canOpenIntegrityDiagnostics(node);
    const actionable = canOpenDiagnostics ? ' data-action="open-integrity-diagnostics"' : '';
    const nodeAttr = node.id ? ` data-node="${escapeAttr(node.id)}"` : '';
    const tag = canOpenDiagnostics ? 'button' : 'span';
    const type = canOpenDiagnostics ? ' type="button"' : '';
    return `<${tag}${type} class="badge-soft integrity-badge ${item.cls} integrity-diagnostic-trigger" title="${escapeAttr(item.title)}"${actionable}${nodeAttr}><i class="fa-solid ${item.icon}"></i>${escapeHtml(label)}</${tag}>`;
  }






  // Tree rows are rendered as <button>. Avoid nesting integrity <button> elements
  // inside them, otherwise browsers split the DOM and badges drift out of row.
  function treeIntegrityBadge(node) {
    const status = effectiveIntegrityStatus(node);
    const map = {
      'byte-integrity-verified': { cls: 'ok', icon: 'fa-circle-check', title: node.integrityStatusLabel || 'Byte-integrity claim matches the declared target.' },
      'draft-pending': { cls: 'pending draft', icon: 'fa-pen-nib', title: node.integrityStatusLabel || 'No integrity claim is declared yet.' },
      pending: { cls: 'pending', icon: 'fa-hourglass-half', title: 'Verification is still pending.' },
      'target-unavailable': { cls: 'pending', icon: 'fa-clock', title: node.integrityStatusLabel || 'The declared integrity target is not available in this viewer context.' },
      'target-ambiguous': { cls: 'pending unresolved', icon: 'fa-circle-question', title: node.integrityStatusLabel || 'The target candidate is ambiguous in this viewer context.' },
      'method-unsupported': { cls: 'warn', icon: 'fa-puzzle-piece', title: node.integrityStatusLabel || 'The integrity method is not supported by this viewer.' },
      unavailable: { cls: 'pending', icon: 'fa-clock', title: node.integrityStatusLabel || 'No breakage found, but this browser could not complete verification for the current scope.' },
      unresolved: { cls: 'pending unresolved', icon: 'fa-circle-question', title: node.integrityStatusLabel || 'No breakage found, but verification remains open in this browser context.' },
      'schema-unverified': { cls: 'pending schema-unverified', icon: 'fa-scale-balanced', title: node.integrityStatusLabel || 'Schema continuity is declared but not fully audited in this viewer scope.' },
      missing: { cls: 'pending draft', icon: 'fa-pen-nib', title: 'No integrity claim is declared.' },
      malformed: { cls: 'warn', icon: 'fa-triangle-exclamation', title: node.integrityStatusLabel || 'Integrity footer was present but incomplete.' },
      'malformed-claim': { cls: 'warn', icon: 'fa-triangle-exclamation', title: node.integrityStatusLabel || 'Integrity claim is incomplete or placeholder-like.' },
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
        ${childBadge}
        <span class="badge-soft badge-schema ${schemaBadgeClass(node.currentSchemaText || node.currentSchema)}">${escapeHtml(shortSchema(node.currentSchemaText || node.currentSchema || 'trace'))}</span>
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
          : policy.status === 'lookup-deferred'
            ? 'Policy lookup deferred'
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
            : policy.status === 'lookup-deferred'
              ? 'fa-solid fa-scale-balanced'
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
    } else if (p.status === 'lookup-deferred') {
      badge = policyBadgeButton(ws, 'pending', 'fa-solid fa-scale-balanced', 'Policy lookup deferred', p.note || 'Policy/license lookup deferred to avoid unnecessary requests', 'policy');
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
    return isTiinexMarkdownArtifactPath(path);
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
    return isTiinexMarkdownArtifactPath(value);
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




  function pathLooksUsefulLineageArtifact(path) {
    return isTiinexMarkdownArtifactPath(path);
  }

  async function fetchJson(url, options = {}) {
    const adapter = options.adapter || adapterIdForUrl(url);
    const result = await adapterFetchJson(url, Object.assign({
      adapter,
      label: adapter === 'github-rest' ? 'GitHub API' : 'JSON source',
      headers: adapter === 'github-rest' ? githubRestHeaders(options.headers || {}) : (options.headers || {}),
      rateLimitKey: adapter === 'github-rest' ? 'github-rest' : undefined
    }, options));
    return result.data;
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
    if (typeof ws.displayOptions.showValidator !== 'boolean') ws.displayOptions.showValidator = true;
    if (typeof ws.displayOptions.showWorkspace !== 'boolean') ws.displayOptions.showWorkspace = true;
    if (typeof ws.displayOptions.showAssets !== 'boolean') ws.displayOptions.showAssets = false;
    return ws.displayOptions;
  }

  function artifactDisplayKind(node) {
    const path = String(node?.path || '');
    if (/\.workspace\.md$/i.test(path)) return 'workspace';
    if (/\.schema\.md$/i.test(path)) return 'schema';
    if (/\.validator\.md$/i.test(path)) return 'validator';
    if (/\.trace\.md$/i.test(path)) return 'trace';
    const schema = schemaKey(node?.currentSchemaText || node?.currentSchema || '');
    if (schema === 'workspace') return 'workspace';
    if (/validation\.method|validator/i.test(String(node?.currentSchemaText || node?.currentSchema || path || ''))) return 'validator';
    if (/schema/i.test(String(node?.currentSchemaText || node?.currentSchema || ''))) return 'schema';
    return 'trace';
  }

  function displayOptionAllowsNode(ws, node) {
    const opts = workspaceDisplayOptions(ws);
    const kind = artifactDisplayKind(node);
    if (kind === 'workspace') return opts.showWorkspace;
    if (kind === 'schema') return opts.showSchema;
    if (kind === 'validator') return opts.showValidator;
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
    if (!opts.showValidator) count += 1;
    if (!opts.showWorkspace) count += 1;
    if (opts.showAssets) count += 1;
    return count;
  }

  registerRenderModalWrapper(function renderModalWithDisplayOptions(modal, next) {
    if (modal?.type === 'display-options') return renderDisplayOptionsModal(modal);
    return next(modal);
  });


  // --- Workspace shell rendering ---


  function schemaFamilyForId(schema = '') {
    const id = String(schema || '').trim();
    if (id.startsWith('tiinex.discovery.')) return 'discovery';
    if (id.startsWith('tiinex.resource.')) return 'resource';
    if (id.startsWith('tiinex.instrument.')) return 'instrument';
    if (id.includes('budget')) return 'budget';
    return '';
  }

  function lineageModuleSummary(ws) {
    const counts = { discovery: 0, resource: 0, budget: 0, usage: 0, instrument: 0, financial: 0, consent: 0, github: 0, githubEnabled: 0, githubRunning: 0, githubFailed: 0, githubStatusMessage: '', githubStatusState: '', githubSourceId: '' };
    for (const node of ws?.nodes || []) {
      const schema = String(node.currentSchema || node.currentSchemaText || '');
      if (schema.startsWith('tiinex.discovery.')) counts.discovery += 1;
      if (schema.startsWith('tiinex.resource.')) counts.resource += 1;
      if (schema === 'tiinex.resource.budget.v1') counts.budget += 1;
      if (schema === 'tiinex.resource.allocation.usage.v1') counts.usage += 1;
      if (schema.startsWith('tiinex.instrument.')) counts.instrument += 1;
      if (schema === 'tiinex.instrument.financial.v1') counts.financial += 1;
      if (schema === 'tiinex.instrument.consent.v1') counts.consent += 1;
    }
    for (const file of ws?.files?.values?.() || []) {
      if (sourceSurfaceForEntry(file) === 'issues') counts.github += 1;
    }
    for (const source of ws?.sources?.values?.() || []) {
      if (source?.kind !== 'github') continue;
      const surfaces = normalizeGithubSurfaceConfig(source.enabledSurfaces || {});
      if (!surfaces.issues) continue;
      counts.githubEnabled += 1;
      const status = source.issueDiscoveryStatus || ws.githubIssueDiscoveryStatus?.[source.id];
      if (status?.state === 'running') counts.githubRunning += 1;
      if (status?.state === 'failed' || status?.state === 'partial' || status?.state === 'rate-limited') {
        counts.githubFailed += 1;
        counts.githubStatusMessage = status.message || status.error || counts.githubStatusMessage;
        counts.githubStatusState = status.state || counts.githubStatusState;
        counts.githubSourceId = source.id || counts.githubSourceId;
      } else if (status?.message && !counts.githubStatusMessage) {
        counts.githubStatusMessage = status.message;
        counts.githubStatusState = status.state || counts.githubStatusState;
        counts.githubSourceId = source.id || counts.githubSourceId;
      }
    }
    return counts;
  }

  function shortGitHubDiscoveryStatus(message = '') {
    const text = String(message || '').trim();
    if (!text) return '';
    const status = text.match(/\b(401|403|404|429|5\d\d)\b/);
    if (status) return `Blocked · ${status[1]}`;
    if (/rate-limited|rate limit|retry after/i.test(text)) return 'Rate-limited';
    if (/unavailable|failed|forbidden|auth/i.test(text)) return 'Needs attention';
    if (/running/i.test(text)) return 'Running';
    return shortText(text, 32);
  }

  function compactGitHubDiscoveryNote(message = '') {
    const text = String(message || '').trim();
    if (!text) return 'Tap source for details';
    if (/rate-limited|rate limit|retry after/i.test(text)) return 'API backoff active; retry later';
    if (/403|forbidden/i.test(text)) return 'GitHub API blocked; source link kept';
    if (/401|auth/i.test(text)) return 'Authentication required later';
    if (/unavailable|failed/i.test(text)) return 'Fallback target kept';
    return 'Read-only source surface';
  }

  function renderLineageModuleCards(ws) {
    const counts = lineageModuleSummary(ws);
    const cards = [];
    if (counts.github || counts.githubEnabled) {
      const value = counts.github
        ? `${counts.github} issue target${counts.github === 1 ? '' : 's'}`
        : (counts.githubRunning ? 'Running' : 'Enabled');
      const compactStatus = counts.githubFailed ? shortGitHubDiscoveryStatus(counts.githubStatusMessage) : '';
      const note = counts.githubFailed
        ? compactGitHubDiscoveryNote(counts.githubStatusMessage)
        : (counts.github ? 'Read-only source surface' : 'Waiting for source data');
      cards.push(['fa-brands fa-github', 'GitHub discovery', compactStatus || value, note, counts.githubFailed ? 'needs-attention' : '', counts.githubSourceId || '', 'github']);
    }
    if (counts.discovery) cards.push(['fa-solid fa-compass', 'Discovery', `${counts.discovery} discovery node${counts.discovery === 1 ? '' : 's'}`, 'Findings stay candidates until promoted', '', '', 'discovery']);
    if (counts.resource) cards.push(['fa-solid fa-boxes-stacked', 'Resources', `${counts.resource} resource node${counts.resource === 1 ? '' : 's'}`, counts.budget || counts.usage ? `${counts.budget} budget · ${counts.usage} usage` : 'Needs, contributions, allocations', '', '', 'resource']);
    if (counts.instrument) cards.push(['fa-solid fa-scroll', 'Instruments', `${counts.instrument} instrument node${counts.instrument === 1 ? '' : 's'}`, `${counts.financial} financial · ${counts.consent} consent`, '', '', 'instrument']);
    if (!cards.length) return '';
    return `<div class="lineage-module-strip" data-ws="${escapeAttr(ws.id)}">${cards.map(([icon, title, value, note, stateClass, sourceId, kind]) => {
      const action = sourceId ? ` data-action="edit-source" data-ws="${escapeAttr(ws.id)}" data-source="${escapeAttr(sourceId)}" role="button" tabindex="0"` : '';
      const mobileLabel = kind === 'github' ? 'GitHub' : title;
      const label = `${title}: ${value}${note ? ` · ${note}` : ''}`;
      return `
      <article class="lineage-module-card ${escapeAttr(stateClass || '')}" data-kind="${escapeAttr(kind || 'module')}" data-mobile-label="${escapeAttr(mobileLabel)}" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}"${action}>
        <i class="${escapeAttr(icon)}"></i>
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(value)}</span><small>${escapeHtml(note)}</small></div>
      </article>`;
    }).join('')}
    </div>`;
  }

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
        ${renderLineageModuleCards(ws)}
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
    if (action === 'toggle-app-setting') {
      event.stopPropagation();
      const key = event.currentTarget.dataset.key || '';
      if (setAppSetting(key, Boolean(event.currentTarget.checked))) {
        if (key === 'wizardDraftHashState' && app.modal?.type === 'artifact-wizard') setRouteState('replace');
        render();
      }
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
    const appRow = (key, label, help, checked) => `
      <label class="display-option-row app-setting-row">
        <span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(help)}</small>
        </span>
        <input type="checkbox" data-action="toggle-app-setting" data-key="${escapeAttr(key)}" ${checked ? 'checked' : ''}>
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
            ${row('showValidator', 'Show .validator.md', 'Validation method definitions used by integrity entries.', opts.showValidator)}
            ${row('showWorkspace', 'Show .workspace.md', 'Workspace entrypoints as lineage artifacts.', opts.showWorkspace)}
            ${row('showAssets', 'Show assets', 'Imported non-lineage files such as images, PDFs, zip files, and supporting material.', opts.showAssets)}
            <div class="display-options-section-label">Link sharing</div>
            ${appRow('wizardDraftHashState', 'Save wizard draft in URL hash', 'Stores bounded wizard text in the client-side #fragment so copied links can reopen the draft. Turn off to keep links to dialog context only.', wizardRouteDraftHashEnabled())}
          </div>
        </div>
      </div>`;
  }





  function normalizeJsdelivrFlatPath(name) {
    return canonicalWorkspacePath(String(name || '').replace(/^\/+/, ''));
  }

  const TIINEX_DOCS_SCHEMA_FRESHNESS_PATHS = Object.freeze([
    '.topics/.schemas/tiinex.discovery.v1.schema.md',
    '.topics/.schemas/tiinex.discovery.follow.v1.schema.md',
    '.topics/.schemas/tiinex.discovery.finding.v1.schema.md',
    '.topics/.schemas/tiinex.discovery.research.v1.schema.md',
    '.topics/.schemas/tiinex.discovery.expedition.v1.schema.md',
    '.topics/.schemas/tiinex.discovery.monitoring.v1.schema.md',
    '.topics/.schemas/tiinex.discovery.surveillance.v1.schema.md',
    '.topics/.schemas/tiinex.resource.v1.schema.md',
    '.topics/.schemas/tiinex.resource.need.v1.schema.md',
    '.topics/.schemas/tiinex.resource.contribution.v1.schema.md',
    '.topics/.schemas/tiinex.resource.contribution.receipt.v1.schema.md',
    '.topics/.schemas/tiinex.resource.allocation.v1.schema.md',
    '.topics/.schemas/tiinex.resource.allocation.usage.v1.schema.md',
    '.topics/.schemas/tiinex.resource.budget.v1.schema.md',
    '.topics/.schemas/tiinex.instrument.v1.schema.md',
    '.topics/.schemas/tiinex.instrument.financial.v1.schema.md',
    '.topics/.schemas/tiinex.instrument.consent.v1.schema.md',
    '.topics/.validators/sha256-base64url-c14n-v2.validator.md'
  ]);

  function rootPathIncludesPath(roots, path) {
    const normalized = normalizeRepoPath(path);
    return (roots || []).some((root) => {
      const clean = normalizeRepoPath(root);
      return !clean || normalized === clean || normalized.startsWith(`${clean}/`);
    });
  }

  function supplementKnownTiinexDocsSchemaPaths(repo, ref, roots, paths) {
    const list = Array.isArray(paths) ? paths.slice() : [];
    if (String(repo || '').toLowerCase() !== 'tiinex/docs') return { paths: list, added: 0 };
    const effectiveRoots = (roots && roots.length ? roots : ['.topics']).map(normalizeRepoPath).filter(Boolean);
    const before = new Set(list.map(normalizeRepoPath));
    let added = 0;
    for (const candidate of TIINEX_DOCS_SCHEMA_FRESHNESS_PATHS) {
      const normalized = normalizeRepoPath(candidate);
      if (before.has(normalized)) continue;
      if (!rootPathIncludesPath(effectiveRoots, normalized)) continue;
      before.add(normalized);
      list.push(normalized);
      added += 1;
    }
    list.sort((a, b) => a.localeCompare(b));
    return { paths: list, added };
  }

  async function discoverGitHubTracePathsViaJsdelivr(repo, ref, rootPaths, options = {}) {
    const resolvedRef = ref || 'master';
    const bust = options.hardRefresh ? `?tiinexHardRefresh=${Date.now()}` : '';
    const url = `https://data.jsdelivr.com/v1/package/gh/${repo}@${encodeURIComponent(resolvedRef)}/flat${bust}`;
    const data = await fetchJson(url, { adapter: 'jsdelivr', label: 'jsDelivr tree', hardRefresh: Boolean(options.hardRefresh) });
    const files = Array.isArray(data.files) ? data.files : [];
    const effectiveRoots = (rootPaths && rootPaths.length ? rootPaths : ['.topics']).map(normalizeRepoPath).filter(Boolean);
    let allPaths = files
      .map((file) => normalizeJsdelivrFlatPath(file.name || file.path || ''))
      .filter((path) => pathLooksUsefulLineageArtifact(path))
      .filter((path) => effectiveRoots.some((root) => !root || path === root || path.startsWith(`${root}/`)))
      .sort((a, b) => a.localeCompare(b));
    const supplement = supplementKnownTiinexDocsSchemaPaths(repo, resolvedRef, effectiveRoots, allPaths);
    allPaths = supplement.paths;
    const traceOnly = allPaths.filter((path) => /\.trace\.md$/i.test(path));

    return {
      repo,
      ref: resolvedRef,
      rootPath: effectiveRoots[0] || '',
      rootPaths: effectiveRoots,
      truncated: false,
      tracePaths: allPaths,
      schemaPaths: allPaths.filter((path) => /\.schema\.md$/i.test(path)),
      validatorPaths: allPaths.filter((path) => /\.validator\.md$/i.test(path)),
      workspacePaths: allPaths.filter((path) => /\.workspace\.md$/i.test(path)),
      numericLeafGuess: traceOnly.filter((path) => maybeLeafByNumericName(path, traceOnly)),
      discoverySource: 'jsdelivr-flat',
      freshnessSupplemented: supplement.added
    };
  }

  async function discoverGitHubTracePaths(repo, ref, rootPath = '.topics', options = {}) {
    const resolvedRef = ref || 'master';
    const roots = Array.isArray(rootPath) ? rootPath.map(normalizeRepoPath).filter(Boolean) : parseRootPaths(rootPath);
    const effectiveRoots = roots.length ? roots : ['.topics'];
    const api = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(resolvedRef)}?recursive=1`;

    try {
      const data = await fetchJson(api, { adapter: 'github-rest', label: 'GitHub tree API', hardRefresh: Boolean(options.hardRefresh) });
      const tree = Array.isArray(data.tree) ? data.tree : [];
      let allPaths = tree
        .filter((item) => item && item.type === 'blob' && pathLooksUsefulLineageArtifact(item.path || ''))
        .map((item) => item.path)
        .filter((path) => effectiveRoots.some((root) => !root || path === root || path.startsWith(`${root}/`)))
        .sort((a, b) => a.localeCompare(b));
      const supplement = supplementKnownTiinexDocsSchemaPaths(repo, resolvedRef, effectiveRoots, allPaths);
      allPaths = supplement.paths;
      const traceOnly = allPaths.filter((path) => /\.trace\.md$/i.test(path));

      return {
        repo,
        ref: resolvedRef,
        rootPath: effectiveRoots[0] || '',
        rootPaths: effectiveRoots,
        truncated: Boolean(data.truncated),
        tracePaths: allPaths,
        schemaPaths: allPaths.filter((path) => /\.schema\.md$/i.test(path)),
        validatorPaths: allPaths.filter((path) => /\.validator\.md$/i.test(path)),
        workspacePaths: allPaths.filter((path) => /\.workspace\.md$/i.test(path)),
        numericLeafGuess: traceOnly.filter((path) => maybeLeafByNumericName(path, traceOnly)),
        discoverySource: 'github-api',
        freshnessSupplemented: supplement.added
      };
    } catch (apiError) {
      try {
        const fallback = options.hardRefresh
          ? await discoverGitHubTracePathsViaJsdelivr(repo, resolvedRef, effectiveRoots, options)
          : await discoverGitHubTracePathsViaJsdelivr(repo, resolvedRef, effectiveRoots);
        fallback.note = `GitHub tree API failed; static flat fallback used: ${apiError.message}`;
        return fallback;
      } catch (fallbackError) {
        return {
          repo,
          ref: resolvedRef,
          rootPath: effectiveRoots[0] || '',
          rootPaths: effectiveRoots,
          truncated: false,
          tracePaths: [],
          schemaPaths: [],
          validatorPaths: [],
          workspacePaths: [],
          numericLeafGuess: [],
          note: `GitHub tree discovery failed: ${apiError.message}; fallback failed: ${fallbackError.message}`
        };
      }
    }
  }


  function gitCommitApiUrl(repo, ref, path) {
    const params = new URLSearchParams({ sha: ref || 'master', path: normalizeRepoPath(path), per_page: '1' });
    return `https://api.github.com/repos/${repo}/commits?${params.toString()}`;
  }

  function nodeNeedsGitCommitSortDate(node) {
    if (!node || node.isGenerated) return false;
    if (!node.repo || !node.path) return false;
    if (!createdAtMidnightDate(node.createdAt)) return false;
    if (node.gitCommitSortStatus || node.file?.gitCommitSortStatus) return false;
    return true;
  }

  function gitCommitSortKeyForNode(node) {
    return `${node.repo || ''}@${node.ref || 'master'}:${normalizeRepoPath(node.path || '')}`;
  }

  async function fetchGitCommitSortDate(node) {
    const url = gitCommitApiUrl(node.repo, node.ref || 'master', node.path);
    const commits = await fetchJson(url, { adapter: 'github-rest', label: 'GitHub commit API' });
    const latest = Array.isArray(commits) ? commits[0] : null;
    const committedAt = latest?.commit?.committer?.date || latest?.commit?.author?.date || '';
    const sha = latest?.sha || '';
    if (!committedAt) throw new Error('No commit date returned for file path.');
    return { committedAt, sha };
  }

  function applyGitCommitSortDate(node, result, status = 'checked') {
    if (!node) return;
    const committedAt = result?.committedAt || '';
    const sha = result?.sha || '';
    const file = node.file || null;
    node.gitCommittedAt = committedAt;
    node.gitCommitSha = sha;
    node.gitCommitSortStatus = status;
    if (file) {
      file.gitCommittedAt = committedAt;
      file.gitCommitSha = sha;
      file.gitCommitSortStatus = status;
      file.gitCommitSortCheckedAt = new Date().toISOString();
    }
  }

  function scheduleGitCommitSortEnrichment(ws) {
    if (!ws || ws.gitCommitSortEnrichmentInFlight) return;
    const limit = Math.max(0, Number(app.settings.repoCommitDateSortFetchLimit || 80));
    if (!limit) return;
    const seen = new Set();
    const candidates = [];
    for (const node of ws.nodes || []) {
      if (!nodeNeedsGitCommitSortDate(node)) continue;
      const key = gitCommitSortKeyForNode(node);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(node);
      if (candidates.length >= limit) break;
    }
    if (!candidates.length) return;

    ws.gitCommitSortEnrichmentInFlight = true;
    setTimeout(async () => {
      try {
        await runWithConcurrency(candidates, 2, async (node) => {
          try {
            const result = await fetchGitCommitSortDate(node);
            const midnightDate = createdAtMidnightDate(node.createdAt);
            const status = midnightDate && utcDatePart(result.committedAt) === midnightDate ? 'matched' : 'different-date';
            applyGitCommitSortDate(node, result, status);
          } catch (error) {
            applyGitCommitSortDate(node, {}, 'unavailable');
            ws.logs?.push?.(`Could not fetch git commit sort date for ${node.path}: ${error.message}`);
          }
        });
        computeWorkspaceIndex(ws, { skipIntegrity: true, skipCommitSortEnrichment: true });
        render();
      } finally {
        ws.gitCommitSortEnrichmentInFlight = false;
      }
    }, 0);
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
        if (source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue') return true;
        return count > 0;
      });
    if (!sources.length) return '';
    return `<div class="workspace-source-strip" aria-label="Workspace sources">
      ${sources.map((source) => {
        const icon = source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue' ? 'fa-brands fa-github'
          : (source.kind === 'draft' ? 'fa-solid fa-pen-nib' : (source.kind === 'local' ? 'fa-solid fa-folder-open' : 'fa-solid fa-link'));
        const count = sourceDisplayCount(ws, source);
        const editable = source.kind === 'github' || source.kind === 'github-tree' || source.kind === 'github-issue';
        const action = editable ? ` data-action="edit-source" data-ws="${escapeAttr(ws.id)}" data-source="${escapeAttr(source.id)}" role="button" tabindex="0"` : '';
        return `<span class="workspace-source-pill ${sourceBadgeClass(source)}"${action} title="${escapeAttr(source.origin || source.label || source.id)}">
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
    return /\.(trace|schema|workspace|validator)\.md$/i.test(String(path || ''));
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

${integrityFooter()}`;
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

  async function saveNodeEdit(ws, node, text) {
    const path = node.path || node.file?.path || 'edited.trace.md';
    const sourceId = node.sourceId || node.file?.sourceId || 'local';
    const finalizedText = await finalizeSavedLocalIntegrity(ws, path, text, { existingNode: node });
    const file = upsertWorkspaceTextFile(ws, path, finalizedText, sourceId);
    // Replace preserved markdown asset too so export/preview sees the edited text.
    const assetKey = sourceFileKey(sourceId, path, false);
    ws.assets = ws.assets || new Map();
    ws.assets.set(assetKey, {
      path,
      sourceId,
      sourceKind: file.sourceKind,
      sourceLabel: file.sourceLabel,
      text: finalizedText,
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
      await saveNodeEdit(ws, node, app.modal?.text || '');
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
      const finalizedText = await finalizeSavedLocalIntegrity(ws, path, text, { parentNodeId: app.modal?.parentNodeId || app.modal?.continuationOf || '' });
      upsertWorkspaceTextFile(ws, path, finalizedText, 'local');
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

  function integrityFooter(towards = '', value = '') {
    if (!String(value || '').trim()) {
      return `# Continuity Integrity
`;
    }
    return `# Continuity Integrity

- ${validationMethodEntryLabel()}
  - Towards: ${towards || 'self'}
  - Value: ${value}
`;
  }

  function markdownWithIntegrityFooter(markdown, footer) {
    const normalized = normalizeNewlines(markdown || '').trimEnd();
    const heading = normalized.match(/^# Continuity Integrity\s*$/m);
    let base = heading ? normalized.slice(0, heading.index).trimEnd() : normalized;
    if (!base.trimEnd().endsWith('---')) base = `${base}\n\n---`.trimStart();
    return `${base}\n\n${String(footer || integrityFooter()).trimEnd()}\n`;
  }

  async function markdownWithSelfIntegrity(markdown) {
    const draft = markdownWithIntegrityFooter(markdown, integrityFooter());
    const value = await traceableContinuityChecksumSha256(draft);
    if (!value) return draft;
    return markdownWithIntegrityFooter(draft, integrityFooter('self', value));
  }

  function markdownDeclaresContinuityParent(markdown) {
    const fields = extractEnvelopeFields(normalizeNewlines(markdown || ''));
    return Boolean(fields.parent?.Trace || fields.parent?.['Parent Trace'] || fields.parent?.Origin);
  }

  function markdownLooksAuthorableTiinexArtifact(markdown) {
    return looksLikeTraceMarkdown(markdown) || /^#\s+Continuity Integrity\s*$/m.test(markdown || '');
  }

  function nodeMarkdownForIntegrity(node) {
    return node?.rawMarkdown || node?.file?.text || node?.file?.content || node?.text || node?.content || '';
  }

  function integrityTowardsIsSelf(towards) {
    const raw = String(towards || '').trim();
    if (!raw) return false;
    const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const value = (link ? link[2] || link[1] : raw).trim().toLowerCase();
    return value === 'self';
  }

  async function markdownWithParentTargetIntegrity(parent, childPath, markdown) {
    const parentMarkdown = nodeMarkdownForIntegrity(parent);
    if (!parent || !parentMarkdown) return markdownWithIntegrityFooter(markdown, integrityFooter());
    const towards = parentTraceReferenceForPath(parent, childPath);
    const value = await traceableContinuityChecksumSha256(parentMarkdown);
    if (!value) return markdownWithIntegrityFooter(markdown, integrityFooter());
    return markdownWithIntegrityFooter(markdown, integrityFooter(towards, value));
  }

  async function finalizeCreatedArtifactIntegrity(ws, artifact, modal) {
    const path = canonicalWorkspacePath(artifact?.path || modal?.path || '');
    const text = artifact?.text || '';
    if (!markdownLooksAuthorableTiinexArtifact(text)) return text;
    const parent = wizardNodeById(ws, modal?.parentNodeId) || null;
    if (parent) return markdownWithParentTargetIntegrity(parent, path, text);
    return markdownWithSelfIntegrity(text);
  }

  async function finalizeSavedLocalIntegrity(ws, path, markdown, context = {}) {
    const text = normalizeNewlines(markdown || '');
    if (!markdownLooksAuthorableTiinexArtifact(text)) return text;

    const parent = context.parentNodeId ? ws?.nodeById?.get?.(context.parentNodeId) : null;
    if (parent) return markdownWithParentTargetIntegrity(parent, path, text);

    const integrity = parseIntegrity(text);
    if (!integrityHasClaim(integrity)) {
      return markdownDeclaresContinuityParent(text) ? markdownWithIntegrityFooter(text, integrityFooter()) : markdownWithSelfIntegrity(text);
    }

    if ((integrity.entryCount || 0) > 1) return text;
    if (integrity.placeholderValue || !integrity.method || !integrity.towards || !integrity.value) return text;
    if (integrity.method !== TIINEX_SHA256_C14N_METHOD_ID) return text;
    if (!integrityTowardsIsSelf(integrity.towards)) return text;
    return markdownWithSelfIntegrity(text);
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


  function workspaceRouteIndex(wsId) {
    const index = app.workspaces.findIndex((ws) => ws.id === wsId);
    return index >= 0 ? index : Math.max(0, workspaceIndex(app.activeWorkspaceId));
  }


  const WIZARD_ROUTE_DRAFT_MAX_CHARS = 9000;
  const WIZARD_ROUTE_DRAFT_MAX_FIELD_CHARS = 1800;
  const WIZARD_ROUTE_DRAFT_MAX_BODY_CHARS = 4200;

  function trimRouteDraftText(value, max = WIZARD_ROUTE_DRAFT_MAX_FIELD_CHARS) {
    const text = String(value || '');
    return text.length > max ? text.slice(0, max) : text;
  }

  function dialogRouteSessionId(modal, prefix = 'dialog') {
    if (!modal || typeof modal !== 'object') return '';
    if (!modal.routeSessionId) modal.routeSessionId = uid(`${prefix}-session`);
    return modal.routeSessionId;
  }

  function markDialogRouteSessionClosed(modal) {
    const id = modal?.routeSessionId || modal?.sessionId || '';
    if (id) app.closedDialogRouteSessions.add(id);
  }

  function dialogRouteSessionClosed(routeModal) {
    const id = routeModal?.sessionId || routeModal?.routeSessionId || '';
    return Boolean(id && app.closedDialogRouteSessions?.has?.(id));
  }

  function safeWizardRouteFormFields(modal) {
    const fields = modal?.formFields && typeof modal.formFields === 'object' ? modal.formFields : null;
    if (!fields) return null;
    const result = {};
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'string') continue;
      result[key] = trimRouteDraftText(value);
    }
    return Object.keys(result).length ? result : null;
  }

  function safeWizardRouteEvidenceAttachments(modal) {
    const items = Array.isArray(modal?.evidenceAttachments) ? modal.evidenceAttachments : [];
    const safe = items
      .filter((item) => item && item.kind === 'url')
      .map((item) => ({
        id: item.id || evidenceAttachmentId(),
        kind: 'url',
        url: trimRouteDraftText(item.url, 1200),
        label: trimRouteDraftText(item.label, 800),
        representation: trimRouteDraftText(item.representation, 400),
        notes: trimRouteDraftText(item.notes, 1200),
        limits: trimRouteDraftText(item.limits, 1200)
      }));
    return safe.length ? safe : null;
  }

  function safeWizardRouteDraft(modal) {
    if (!wizardRouteDraftHashEnabled()) return null;
    if (!modal || modal.type !== 'artifact-wizard') return null;
    const draft = {};
    if (modal.title) draft.title = trimRouteDraftText(modal.title);
    if (modal.summary) draft.summary = trimRouteDraftText(modal.summary);
    if (typeof modal.body === 'string' && modal.body) draft.body = trimRouteDraftText(modal.body, WIZARD_ROUTE_DRAFT_MAX_BODY_CHARS);
    const formFields = safeWizardRouteFormFields(modal);
    if (formFields) draft.formFields = formFields;
    const evidenceAttachments = safeWizardRouteEvidenceAttachments(modal);
    if (evidenceAttachments) draft.evidenceAttachments = evidenceAttachments;
    if (!Object.keys(draft).length) return null;
    return JSON.stringify(draft).length <= WIZARD_ROUTE_DRAFT_MAX_CHARS ? draft : null;
  }

  function applyWizardRouteDraft(modal, draft) {
    if (!modal || !draft || typeof draft !== 'object') return modal;
    if (typeof draft.title === 'string') modal.title = trimRouteDraftText(draft.title);
    if (typeof draft.summary === 'string') modal.summary = trimRouteDraftText(draft.summary);
    if (typeof draft.body === 'string') modal.body = trimRouteDraftText(draft.body, WIZARD_ROUTE_DRAFT_MAX_BODY_CHARS);
    if (draft.formFields && typeof draft.formFields === 'object') {
      modal.formFields = {};
      for (const [key, value] of Object.entries(draft.formFields)) {
        if (typeof value === 'string') modal.formFields[key] = trimRouteDraftText(value);
      }
    }
    if (Array.isArray(draft.evidenceAttachments)) {
      modal.evidenceAttachments = draft.evidenceAttachments
        .filter((item) => item && item.kind === 'url')
        .map((item) => ({
          id: item.id || evidenceAttachmentId(),
          kind: 'url',
          url: trimRouteDraftText(item.url, 1200),
          label: trimRouteDraftText(item.label, 800),
          representation: trimRouteDraftText(item.representation, 400) || 'web page',
          notes: trimRouteDraftText(item.notes, 1200),
          limits: trimRouteDraftText(item.limits, 1200)
        }));
    }
    return modal;
  }

  function scheduleWizardRouteDraftReplace() {
    if (!wizardRouteDraftHashEnabled()) return;
    if (!app.modal || app.modal.type !== 'artifact-wizard') return;
    if (app.routing?.restoring || app.isBootingFromUrl) return;
    clearTimeout(app.wizardRouteDraftTimer);
    app.wizardRouteDraftTimer = setTimeout(() => {
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      setRouteState('replace');
    }, 120);
  }

  function closedDialogCleanRouteState(state) {
    if (!state || typeof state !== 'object') return null;
    return Object.assign({}, state, { modal: null });
  }

  function closedDialogRouteUrl(state) {
    const clean = closedDialogCleanRouteState(state);
    if (!clean) return `${location.pathname}${location.search}`;
    return clean.kind === 'view' ? viewRouteUrl(clean) : routeUrl(clean);
  }

  function skipClosedDialogHistoryEntry(state) {
    const clean = closedDialogCleanRouteState(state);
    if (!clean || app.routing?.skippingClosedDialogHistory) return false;
    app.modal = null;
    app.pendingRouteModal = null;
    app.routing.skippingClosedDialogHistory = true;
    history.replaceState(routeHistoryState(clean, 'replace'), '', closedDialogRouteUrl(state));
    const direction = Number(app.routing?.popDirection || -1) || -1;
    setTimeout(() => {
      try {
        history.go(direction);
      } catch (_) {
        render();
      } finally {
        setTimeout(() => { app.routing.skippingClosedDialogHistory = false; }, 0);
      }
    }, 0);
    return true;
  }

  function closeActiveModalRoute(options = {}) {
    const modal = app.modal;
    if (modal) markDialogRouteSessionClosed(modal);
    app.modal = null;
    app.pendingRouteModal = null;
    clearTimeout(app.wizardRouteDraftTimer);
    if (options.updateRoute !== false) setRouteState('replace');
    if (options.render !== false) render();
  }

  function routeNodeDescriptor(node) {
    if (!node) return null;
    return {
      selectedNodeId: node.id || '',
      selectedPath: node.path || '',
      selectedTitle: node.title || ''
    };
  }

  function resolveRouteNodeDescriptor(ws, descriptor) {
    if (!descriptor) return null;
    return resolveRouteSelectedNode(ws, {
      selectedNodeId: descriptor.selectedNodeId || descriptor.nodeId || '',
      selectedPath: descriptor.selectedPath || descriptor.path || '',
      selectedTitle: descriptor.selectedTitle || descriptor.title || '',
      mode: 'lineage'
    });
  }

  function routeModalState() {
    const modal = app.modal;
    if (!modal || !modal.type) return null;
    const wsIndex = workspaceRouteIndex(modal.wsId || app.activeWorkspaceId || '');
    const ws = app.workspaces[wsIndex] || getWorkspace(modal.wsId || app.activeWorkspaceId || '');

    if ((modal.type === 'detail' || modal.type === 'markdown') && ws) {
      const node = ws.nodeById?.get?.(modal.nodeId || '');
      if (!node) return null;
      return { type: modal.type, sessionId: dialogRouteSessionId(modal, modal.type), wsIndex, node: routeNodeDescriptor(node) };
    }

    if (modal.type === 'artifact-wizard' && ws) {
      const includeDraftState = wizardRouteDraftHashEnabled();
      return {
        type: 'artifact-wizard',
        sessionId: dialogRouteSessionId(modal, 'wizard'),
        wsIndex,
        mode: modal.mode || 'new',
        schemaId: modal.schemaId || 'tiinex.topic.v1',
        wizardStep: wizardStep(modal),
        parent: routeNodeDescriptor(wizardNodeById(ws, modal.parentNodeId)),
        referenced: routeNodeDescriptor(wizardNodeById(ws, modal.referencedNodeId)),
        title: includeDraftState ? (modal.title || '') : '',
        summary: includeDraftState ? (modal.summary || '') : '',
        folderPath: includeDraftState ? (modal.folderPath || '') : '',
        draft: includeDraftState ? safeWizardRouteDraft(modal) : null
      };
    }

    return null;
  }

  function applyRouteModalState(state) {
    if (dialogRouteSessionClosed(state)) {
      app.pendingRouteModal = null;
      app.modal = null;
      return;
    }
    app.pendingRouteModal = state && state.type ? state : null;
    app.modal = null;
    resolvePendingRouteModal();
  }

  function resolvePendingRouteModal() {
    const routeModal = app.pendingRouteModal;
    if (!routeModal || app.modal) return;
    const index = Math.max(0, Math.min(Number(routeModal.wsIndex || 0), app.workspaces.length - 1));
    const ws = app.workspaces[index];
    if (!ws) return;

    if (routeModal.type === 'detail' || routeModal.type === 'markdown') {
      const node = resolveRouteNodeDescriptor(ws, routeModal.node);
      if (!node) return;
      app.modal = { type: routeModal.type, routeSessionId: routeModal.sessionId || '', wsId: ws.id, nodeId: node.id };
      app.pendingRouteModal = null;
      return;
    }

    if (routeModal.type === 'artifact-wizard') {
      const parent = resolveRouteNodeDescriptor(ws, routeModal.parent);
      const referenced = resolveRouteNodeDescriptor(ws, routeModal.referenced);
      if (routeModal.parent && !parent) return;
      if (routeModal.referenced && !referenced) return;
      const schemaId = schemaOptionById(routeModal.schemaId || 'tiinex.topic.v1').id;
      const option = schemaOptionById(schemaId);
      app.modal = applyWizardRouteDraft({
        type: 'artifact-wizard',
        routeSessionId: routeModal.sessionId || '',
        wsId: ws.id,
        mode: routeModal.mode || 'new',
        parentNodeId: parent?.id || '',
        referencedNodeId: referenced?.id || '',
        schemaId,
        title: routeModal.title || '',
        summary: routeModal.summary || '',
        body: option.body,
        wizardStep: normalizeWizardRouteStep(routeModal.wizardStep || 'type'),
        folderPath: routeModal.folderPath ? normalizedFolderPath(routeModal.folderPath) : ''
      }, routeModal.draft);
      app.pendingRouteModal = null;
    }
  }

  function viewRouteState() {
    const activeIndex = Math.max(0, app.workspaces.findIndex((ws) => ws.id === app.activeWorkspaceId));
    return {
      v: 156,
      kind: 'view',
      activeIndex,
      workspaceOffset: Number(app.workspaceOffset || 0),
      modal: routeModalState(),
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
    applyRouteModalState(state.modal || null);
    return true;
  }

  function routeState() {
    return {
      v: 156,
      activeIndex: Math.max(0, workspaceIndex(app.activeWorkspaceId)),
      workspaceOffset: app.workspaceOffset || 0,
      modal: routeModalState(),
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
    resolvePendingRouteModal();
    if (startupHasExplicitRouteModal()) reconcileStartupExplicitRouteModal();
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




  const SCHEMA_CREATE_POLICY_FAMILIES = Object.freeze([
    'continuity-envelope',
    'core-artifact',
    'discovery-family',
    'resource-family',
    'instrument-family',
    'relation-validation-governance',
    'runtime-family',
    'reduction-disclosure-privacy',
    'traversal-runtime',
    'packaging-recovery'
  ]);

  const SCHEMA_CREATE_POLICY_MANUAL_CREATABILITY = Object.freeze([
    'yes',
    'no',
    'advanced',
    'abstract'
  ]);

  const SCHEMA_CREATE_POLICY_RELATIONSHIP_CREATABILITY = Object.freeze([
    'yes',
    'no',
    'advanced'
  ]);

  const SCHEMA_CREATE_POLICY_UI_SURFACES = Object.freeze([
    'ordinary-wizard',
    'workspace-create',
    'advanced-candidate',
    'context-only',
    'not-suitable'
  ]);

  const SCHEMA_CREATE_POLICY_REQUIRED_KEYS = Object.freeze([
    'id',
    'label',
    'family',
    'schemaPath',
    'schemaPermalink',
    'parentSchema',
    'role',
    'manuallyCreatable',
    'creatableAsContinuation',
    'creatableAsReference',
    'uiSurface',
    'rationale'
  ]);

  const SCHEMA_CREATE_POLICY_PUBLIC_KEYS = Object.freeze([
    ...SCHEMA_CREATE_POLICY_REQUIRED_KEYS,
    'dependsOn'
  ]);

  const SCHEMA_CREATE_POLICY_ORDER = Object.freeze([
    'tiinex.root.v1',
    'tiinex.topic.v1',
    'tiinex.task.v1',
    'tiinex.evidence.v1',
    'tiinex.feedback.v1',
    'tiinex.decision.v1',
    'tiinex.pointer.v1',
    'tiinex.signal.v1',
    'tiinex.lineage.upgrade.deferral.v1',
    'tiinex.workspace.v1',
    'tiinex.discovery.v1',
    'tiinex.discovery.follow.v1',
    'tiinex.discovery.finding.v1',
    'tiinex.discovery.research.v1',
    'tiinex.discovery.expedition.v1',
    'tiinex.discovery.monitoring.v1',
    'tiinex.discovery.surveillance.v1',
    'tiinex.resource.v1',
    'tiinex.resource.need.v1',
    'tiinex.resource.contribution.v1',
    'tiinex.resource.contribution.receipt.v1',
    'tiinex.resource.allocation.v1',
    'tiinex.resource.allocation.usage.v1',
    'tiinex.resource.budget.v1',
    'tiinex.instrument.v1',
    'tiinex.instrument.financial.v1',
    'tiinex.instrument.consent.v1',
    'tiinex.relation.v1',
    'tiinex.validation.method.v1',
    'tiinex.schema.family.v1',
    'tiinex.definition.v1',
    'tiinex.capability.v1',
    'tiinex.runtime.v1',
    'tiinex.ai.runtime.v1',
    'tiinex.machine.runtime.v1',
    'tiinex.reduction.v1',
    'tiinex.redaction.v1',
    'tiinex.privacy.boundary.v1',
    'tiinex.consent.v1',
    'tiinex.attestation.v1',
    'tiinex.external.payload.v1',
    'tiinex.traversal.runtime.v1',
    'tiinex.quantum.traversal.runtime.v1',
    'tiinex.archive.v1',
    'tiinex.zip.v1',
    'tiinex.encrypted.v1',
    'tiinex.broken.v1'
  ]);

  function validateSchemaCreatePolicyRegistryContract(registry, order) {
    const ids = new Set(order || []);
    for (const id of order || []) {
      const def = registry?.[id];
      if (!def) throw new Error(`Missing schema create policy entry: ${id}`);
      if (def.id !== id) throw new Error(`Schema create policy id mismatch: ${id}`);
    }
    for (const [id, def] of Object.entries(registry || {})) {
      if (!ids.has(id)) throw new Error(`Schema create policy entry is not listed in SCHEMA_CREATE_POLICY_ORDER: ${id}`);
      for (const key of SCHEMA_CREATE_POLICY_REQUIRED_KEYS) {
        if (!(key in def)) throw new Error(`Schema create policy ${id} is missing required key: ${key}`);
      }
      for (const key of Object.keys(def)) {
        if (!SCHEMA_CREATE_POLICY_PUBLIC_KEYS.includes(key)) throw new Error(`Schema create policy ${id} uses non-canonical key: ${key}`);
      }
      if (!SCHEMA_CREATE_POLICY_FAMILIES.includes(def.family)) throw new Error(`Schema create policy ${id} has unsupported family: ${def.family}`);
      if (!SCHEMA_CREATE_POLICY_MANUAL_CREATABILITY.includes(def.manuallyCreatable)) throw new Error(`Schema create policy ${id} has unsupported manually creatable policy: ${def.manuallyCreatable}`);
      if (!SCHEMA_CREATE_POLICY_RELATIONSHIP_CREATABILITY.includes(def.creatableAsContinuation)) throw new Error(`Schema create policy ${id} has unsupported continuation policy: ${def.creatableAsContinuation}`);
      if (!SCHEMA_CREATE_POLICY_RELATIONSHIP_CREATABILITY.includes(def.creatableAsReference)) throw new Error(`Schema create policy ${id} has unsupported reference policy: ${def.creatableAsReference}`);
      if (!SCHEMA_CREATE_POLICY_UI_SURFACES.includes(def.uiSurface)) throw new Error(`Schema create policy ${id} has unsupported UI surface: ${def.uiSurface}`);
      if (!def.schemaPath || typeof def.schemaPath !== 'string') throw new Error(`Schema create policy ${id} must declare schemaPath`);
      if (!def.schemaPermalink || typeof def.schemaPermalink !== 'string') throw new Error(`Schema create policy ${id} must declare schemaPermalink`);
      if (!def.schemaPermalink.startsWith(TIINEX_SCHEMA_PERMALINK_BASE)) throw new Error(`Schema create policy ${id} must use the pinned Tiinex docs schema permalink base`);
      if (def.parentSchema !== null && typeof def.parentSchema !== 'string') throw new Error(`Schema create policy ${id} parentSchema must be a string or null`);
      if (def.dependsOn !== undefined && !Array.isArray(def.dependsOn)) throw new Error(`Schema create policy ${id} dependsOn must be an array when present`);
    }
  }

  function freezeSchemaCreatePolicyRegistry(registry, order) {
    validateSchemaCreatePolicyRegistryContract(registry, order);
    return deepFreezeWizardValue(registry);
  }

  function schemaFilePath(id) {
    return `.topics/.schemas/${String(id || '').trim()}.schema.md`;
  }

  function schemaPermalink(id) {
    return `${TIINEX_SCHEMA_PERMALINK_BASE}${String(id || '').trim()}.schema.md`;
  }

  function schemaPolicyEntry(id, label, family, parentSchema, role, manuallyCreatable, creatableAsContinuation, creatableAsReference, uiSurface, rationale, dependsOn) {
    const entry = { id, label, family, schemaPath: schemaFilePath(id), schemaPermalink: schemaPermalink(id), parentSchema, role, manuallyCreatable, creatableAsContinuation, creatableAsReference, uiSurface, rationale };
    if (dependsOn) entry.dependsOn = dependsOn;
    return entry;
  }

  const SCHEMA_CREATE_POLICY_REGISTRY = freezeSchemaCreatePolicyRegistry({
    'tiinex.root.v1': schemaPolicyEntry('tiinex.root.v1', 'Root', 'continuity-envelope', null, 'Continuity envelope and integrity surface.', 'abstract', 'no', 'no', 'not-suitable', 'Root is the envelope contract, not an ordinary artifact body.'),
    'tiinex.topic.v1': schemaPolicyEntry('tiinex.topic.v1', 'Topic', 'core-artifact', 'tiinex.root.v1', 'Bounded working or design thread.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Topic is suitable as an ordinary human-authored continuation or reference artifact.'),
    'tiinex.task.v1': schemaPolicyEntry('tiinex.task.v1', 'Task', 'core-artifact', 'tiinex.root.v1', 'Concrete work item with constraints and done criteria.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Task is suitable when the next artifact is actionable work.'),
    'tiinex.evidence.v1': schemaPolicyEntry('tiinex.evidence.v1', 'Evidence', 'core-artifact', 'tiinex.root.v1', 'Preserved supporting material with provenance and limits.', 'yes', 'advanced', 'yes', 'ordinary-wizard', 'Evidence is suitable when the main value is material that supports a bounded claim.'),
    'tiinex.feedback.v1': schemaPolicyEntry('tiinex.feedback.v1', 'Feedback', 'core-artifact', 'tiinex.root.v1', 'Directed feedback with target, received signal, disposition, and limits.', 'yes', 'advanced', 'yes', 'ordinary-wizard', 'Feedback is suitable when the artifact preserves a received response or review signal.'),
    'tiinex.decision.v1': schemaPolicyEntry('tiinex.decision.v1', 'Decision', 'core-artifact', 'tiinex.root.v1', 'Landed decision and what now governs.', 'yes', 'yes', 'advanced', 'ordinary-wizard', 'Decision is suitable when the artifact makes a governing choice explicit.'),
    'tiinex.pointer.v1': schemaPolicyEntry('tiinex.pointer.v1', 'Pointer', 'core-artifact', 'tiinex.root.v1', 'Thin redirect or anchor toward an upstream trace or origin.', 'yes', 'advanced', 'yes', 'ordinary-wizard', 'Pointer is mainly for reference or redirect behavior, not for rich continuation content.'),
    'tiinex.signal.v1': schemaPolicyEntry('tiinex.signal.v1', 'Signal', 'core-artifact', 'tiinex.root.v1', 'Weak bounded observation that should not be overread as feedback.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Signal is useful but should not crowd ordinary create choices until policy UI can explain the boundary.'),
    'tiinex.lineage.upgrade.deferral.v1': schemaPolicyEntry('tiinex.lineage.upgrade.deferral.v1', 'Lineage Upgrade Deferral', 'core-artifact', 'tiinex.root.v1', 'Bounded deferral for lineage-upgrade work that must not hide integrity errors.', 'yes', 'advanced', 'advanced', 'ordinary-wizard', 'Lineage deferral is an ordinary choice only when the current work is explicitly deferring an upgrade.'),
    'tiinex.workspace.v1': schemaPolicyEntry('tiinex.workspace.v1', 'Workspace', 'core-artifact', 'tiinex.root.v1', 'Portable workspace entrypoint.', 'advanced', 'no', 'no', 'workspace-create', 'Workspace creation has its own surface and should not appear as an ordinary trace leaf.'),
    'tiinex.relation.v1': schemaPolicyEntry('tiinex.relation.v1', 'Relation', 'relation-validation-governance', 'tiinex.root.v1', 'Typed non-parent relationship.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Relation should protect Parent by representing typed links only when a relation surface is intentional.'),
    'tiinex.validation.method.v1': schemaPolicyEntry('tiinex.validation.method.v1', 'Validation Method', 'relation-validation-governance', 'tiinex.root.v1', 'Validation method definition with scope and failure modes.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Validation methods define how checks should be read; they are support artifacts, not ordinary narrative leaves.'),
    'tiinex.schema.family.v1': schemaPolicyEntry('tiinex.schema.family.v1', 'Schema Family', 'relation-validation-governance', 'tiinex.root.v1', 'Schema family, governance, and creatability description.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Schema-family artifacts govern schemas and create policy, so ordinary creation should require explicit intent.'),
    'tiinex.definition.v1': schemaPolicyEntry('tiinex.definition.v1', 'Definition', 'relation-validation-governance', 'tiinex.root.v1', 'Shared definition root for schema notes.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Definitions are governance/support surfaces rather than ordinary lineage leaves.'),
    'tiinex.capability.v1': schemaPolicyEntry('tiinex.capability.v1', 'Capability', 'relation-validation-governance', 'tiinex.root.v1', 'Capability manifest for viewers, validators, and runtimes.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Capabilities describe tool behavior and should be created only when capability scope is explicit.'),
    'tiinex.discovery.v1': schemaPolicyEntry('tiinex.discovery.v1', 'Discovery', 'discovery-family', 'tiinex.root.v1', 'Bounded intentional discovery context.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Discovery is suitable when the main value is how something is being searched, explored, or found.'),
    'tiinex.discovery.follow.v1': schemaPolicyEntry('tiinex.discovery.follow.v1', 'Discovery Follow', 'discovery-family', 'tiinex.discovery.v1', 'Bounded ongoing attention.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Follow is useful when a source or target remains relevant but should not become monitoring by accident.'),
    'tiinex.discovery.finding.v1': schemaPolicyEntry('tiinex.discovery.finding.v1', 'Discovery Finding', 'discovery-family', 'tiinex.discovery.v1', 'One observed finding, absence, ambiguity, anomaly, or lead.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Finding captures what was found before it is promoted to evidence, feedback, task, resource need, or pointer.'),
    'tiinex.discovery.research.v1': schemaPolicyEntry('tiinex.discovery.research.v1', 'Discovery Research', 'discovery-family', 'tiinex.discovery.v1', 'Question-driven inquiry.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Research is suitable when source field, method, synthesis, and unresolved gaps matter.'),
    'tiinex.discovery.expedition.v1': schemaPolicyEntry('tiinex.discovery.expedition.v1', 'Discovery Expedition', 'discovery-family', 'tiinex.discovery.v1', 'Exploratory route through a partly unknown field.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Expedition preserves route, terrain, encounters, hazards, and map updates.'),
    'tiinex.discovery.monitoring.v1': schemaPolicyEntry('tiinex.discovery.monitoring.v1', 'Discovery Monitoring', 'discovery-family', 'tiinex.discovery.v1', 'Bounded recurring observation over time.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Monitoring is suitable when cadence, triggers, observations, and stop conditions matter.'),
    'tiinex.discovery.surveillance.v1': schemaPolicyEntry('tiinex.discovery.surveillance.v1', 'Discovery Surveillance', 'discovery-family', 'tiinex.discovery.monitoring.v1', 'High-impact monitoring with safeguards.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Surveillance needs explicit safeguards and should not crowd ordinary authoring.'),
    'tiinex.resource.v1': schemaPolicyEntry('tiinex.resource.v1', 'Resource', 'resource-family', 'tiinex.root.v1', 'Broad enablement resource context.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Resource is suitable when needed, available, contributed, allocated, or bounded resources matter.'),
    'tiinex.resource.need.v1': schemaPolicyEntry('tiinex.resource.need.v1', 'Resource Need', 'resource-family', 'tiinex.resource.v1', 'Needed resource or blocker.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Resource need is suitable when a missing enabler blocks or constrains work.'),
    'tiinex.resource.contribution.v1': schemaPolicyEntry('tiinex.resource.contribution.v1', 'Resource Contribution', 'resource-family', 'tiinex.resource.v1', 'Offered, pledged, provided, returned, or retracted resource.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Contribution is suitable when a resource is offered or provided but receipt is not the main claim.'),
    'tiinex.resource.contribution.receipt.v1': schemaPolicyEntry('tiinex.resource.contribution.receipt.v1', 'Resource Contribution Receipt', 'resource-family', 'tiinex.resource.contribution.v1', 'Received-resource contribution record.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Receipt is suitable when arrival or confirmed availability is the main value.'),
    'tiinex.resource.allocation.v1': schemaPolicyEntry('tiinex.resource.allocation.v1', 'Resource Allocation', 'resource-family', 'tiinex.resource.v1', 'Resource reserved or assigned to a purpose.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Allocation is suitable when resource use has been assigned or reserved.'),
    'tiinex.resource.allocation.usage.v1': schemaPolicyEntry('tiinex.resource.allocation.usage.v1', 'Resource Allocation Usage', 'resource-family', 'tiinex.resource.allocation.v1', 'Actual, estimated, observed, or billed usage.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Usage is suitable when consumed tokens, cost, compute, time, materials, or access are being recorded.'),
    'tiinex.resource.budget.v1': schemaPolicyEntry('tiinex.resource.budget.v1', 'Resource Budget', 'resource-family', 'tiinex.resource.v1', 'Resource cap, quota, reserve, runway, or limit.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Budget is suitable for money, token, API, compute, time, or other resource envelopes.'),
    'tiinex.instrument.v1': schemaPolicyEntry('tiinex.instrument.v1', 'Instrument', 'instrument-family', 'tiinex.root.v1', 'Terms, permission, authority, obligation, access, restriction, or transfer boundary.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Instrument is suitable when the governing form is the main value.'),
    'tiinex.instrument.financial.v1': schemaPolicyEntry('tiinex.instrument.financial.v1', 'Financial Instrument', 'instrument-family', 'tiinex.instrument.v1', 'Financial value-transfer form.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Financial instrument is suitable when donation, grant, loan, SAFE, invoice, subscription, or similar form matters.'),
    'tiinex.instrument.consent.v1': schemaPolicyEntry('tiinex.instrument.consent.v1', 'Consent Instrument', 'instrument-family', 'tiinex.instrument.v1', 'Consent, refusal, revocation, permission, or use-boundary instrument.', 'yes', 'yes', 'yes', 'ordinary-wizard', 'Consent instrument is suitable when permission or refusal boundary is the main value.'),
    'tiinex.runtime.v1': schemaPolicyEntry('tiinex.runtime.v1', 'Runtime', 'runtime-family', 'tiinex.root.v1', 'Broad runtime context, output, and interpretation boundary.', 'advanced', 'yes', 'yes', 'advanced-candidate', 'Runtime artifacts should be created when runtime evidence or execution context is the main value.'),
    'tiinex.ai.runtime.v1': schemaPolicyEntry('tiinex.ai.runtime.v1', 'AI Runtime', 'runtime-family', 'tiinex.runtime.v1', 'AI-runtime specialization for model, prompt, tools, output, and interpretation.', 'advanced', 'yes', 'yes', 'advanced-candidate', 'AI runtime should stay separate from evidence and decisions unless the runtime context is central.'),
    'tiinex.machine.runtime.v1': schemaPolicyEntry('tiinex.machine.runtime.v1', 'Machine Runtime', 'runtime-family', 'tiinex.runtime.v1', 'Machine-shaped runtime context, environment, output, and reproducibility boundary.', 'advanced', 'yes', 'yes', 'advanced-candidate', 'Machine runtime belongs to execution context, not ordinary discussion or evidence by default.'),
    'tiinex.reduction.v1': schemaPolicyEntry('tiinex.reduction.v1', 'Reduction', 'reduction-disclosure-privacy', 'tiinex.root.v1', 'Observable carry-forward state with loss and uncertainty.', 'yes', 'yes', 'advanced', 'ordinary-wizard', 'Reduction is ordinary when the user is intentionally preserving a compacted carry-forward state.'),
    'tiinex.redaction.v1': schemaPolicyEntry('tiinex.redaction.v1', 'Redaction', 'reduction-disclosure-privacy', 'tiinex.reduction.v1', 'Observable removal, masking, transformation, and residual-risk record.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Redaction is a support surface for disclosure-limiting transformation and should not appear without policy context.'),
    'tiinex.privacy.boundary.v1': schemaPolicyEntry('tiinex.privacy.boundary.v1', 'Privacy Boundary', 'reduction-disclosure-privacy', 'tiinex.root.v1', 'Sensitivity, sharing, serialization, and disclosure boundary.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Privacy boundaries guide interpretation and tooling caution without replacing consent or redaction.'),
    'tiinex.consent.v1': schemaPolicyEntry('tiinex.consent.v1', 'Consent (PoC prior placement)', 'reduction-disclosure-privacy', 'tiinex.attestation.v1', 'Previous PoC consent placement; use tiinex.instrument.consent.v1 for new artifacts.', 'no', 'no', 'no', 'not-suitable', 'Consent is now modeled as an instrument child. Keep this id only for reading older artifacts.'),
    'tiinex.attestation.v1': schemaPolicyEntry('tiinex.attestation.v1', 'Attestation', 'reduction-disclosure-privacy', 'tiinex.root.v1', 'Scoped human, role, organizational, legal, witness, lab, or review statement.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'Attestation is useful but should stay distinct from validation, evidence, and consent.'),
    'tiinex.external.payload.v1': schemaPolicyEntry('tiinex.external.payload.v1', 'External Payload', 'reduction-disclosure-privacy', 'tiinex.root.v1', 'Readable reference to large, private, binary, generated, or machine-shaped payloads.', 'advanced', 'advanced', 'yes', 'advanced-candidate', 'External payload references should support other artifacts rather than replace evidence or runtime interpretation.'),
    'tiinex.traversal.runtime.v1': schemaPolicyEntry('tiinex.traversal.runtime.v1', 'Traversal Runtime', 'traversal-runtime', 'tiinex.runtime.v1', 'Compute-agnostic candidate-space traversal runtime.', 'advanced', 'yes', 'yes', 'advanced-candidate', 'Traversal runtime should be created only when search space, verifier, executor, outcome, and failure boundaries are explicit.'),
    'tiinex.quantum.traversal.runtime.v1': schemaPolicyEntry('tiinex.quantum.traversal.runtime.v1', 'Quantum Traversal Runtime', 'traversal-runtime', 'tiinex.traversal.runtime.v1', 'Quantum-specific traversal runtime child.', 'advanced', 'yes', 'yes', 'advanced-candidate', 'Quantum traversal is an executor-specialized runtime surface and must not become generic provenance creation.', ['tiinex.traversal.runtime.v1']),
    'tiinex.archive.v1': schemaPolicyEntry('tiinex.archive.v1', 'Archive', 'packaging-recovery', 'tiinex.root.v1', 'Archive support surface.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Archive creation should remain tied to export or recovery behavior.'),
    'tiinex.zip.v1': schemaPolicyEntry('tiinex.zip.v1', 'Zip', 'packaging-recovery', 'tiinex.root.v1', 'Zip package support surface.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Zip artifacts should be driven by packaging behavior, not ordinary authoring.'),
    'tiinex.encrypted.v1': schemaPolicyEntry('tiinex.encrypted.v1', 'Encrypted', 'packaging-recovery', 'tiinex.root.v1', 'Encrypted package or protected material support surface.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Encrypted artifacts need explicit access and disclosure handling before ordinary creation.'),
    'tiinex.broken.v1': schemaPolicyEntry('tiinex.broken.v1', 'Broken', 'packaging-recovery', 'tiinex.root.v1', 'Broken or degraded artifact support surface.', 'advanced', 'advanced', 'advanced', 'advanced-candidate', 'Broken artifacts should surface recovery state rather than act as ordinary content.')
  }, SCHEMA_CREATE_POLICY_ORDER);

  function schemaCreatePolicy(id) {
    return SCHEMA_CREATE_POLICY_REGISTRY[String(id || '').trim()] || null;
  }

  function policyAllowsOrdinaryWizardSchema(id) {
    const policy = schemaCreatePolicy(id);
    return Boolean(policy && policy.manuallyCreatable === 'yes' && policy.uiSurface === 'ordinary-wizard');
  }

  function policyKnownSchemaId(id) {
    return Boolean(schemaCreatePolicy(id));
  }





  const WIZARD_SCHEMA_REQUIRED_KEYS = Object.freeze([
    'id',
    'label',
    'icon',
    'suffix',
    'kind',
    'summary',
    'bodyLabel',
    'body',
    'defaults',
    'bodyFromForm',
    'formStateFromSections'
  ]);

  const WIZARD_SCHEMA_PUBLIC_KEYS = Object.freeze([
    ...WIZARD_SCHEMA_REQUIRED_KEYS,
    'humanArtifact',
    'generatesSchemaId',
    'fields',
    'describeStep'
  ]);

  function deepFreezeWizardValue(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreezeWizardValue(child, seen);
    return value;
  }

  function validateWizardSchemaRegistryContract(registry, order) {
    const ids = new Set(order || []);
    for (const id of order || []) {
      const def = registry?.[id];
      if (!def) throw new Error(`Missing wizard schema registry entry: ${id}`);
      if (def.id !== id) throw new Error(`Wizard schema registry id mismatch: ${id}`);
    }
    for (const [id, def] of Object.entries(registry || {})) {
      if (!ids.has(id)) throw new Error(`Wizard schema registry entry is not listed in WIZARD_SCHEMA_ORDER: ${id}`);
      for (const key of WIZARD_SCHEMA_REQUIRED_KEYS) {
        if (!(key in def)) throw new Error(`Wizard schema ${id} is missing required key: ${key}`);
      }
      for (const key of Object.keys(def)) {
        if (!WIZARD_SCHEMA_PUBLIC_KEYS.includes(key)) throw new Error(`Wizard schema ${id} uses non-canonical key: ${key}`);
      }
      if (!['trace', 'workspace'].includes(def.kind)) throw new Error(`Wizard schema ${id} has unsupported artifact kind: ${def.kind}`);
      if (def.fields !== null && !Array.isArray(def.fields)) throw new Error(`Wizard schema ${id} fields must be an array or null`);
      if (typeof def.defaults !== 'function') throw new Error(`Wizard schema ${id} defaults must be a function`);
      if (typeof def.bodyFromForm !== 'function') throw new Error(`Wizard schema ${id} bodyFromForm must be a function`);
      if (typeof def.formStateFromSections !== 'function') throw new Error(`Wizard schema ${id} formStateFromSections must be a function`);
      if (def.describeStep && typeof def.describeStep !== 'function') throw new Error(`Wizard schema ${id} describeStep must be a function when present`);
    }
  }

  function freezeWizardSchemaRegistry(registry, order) {
    validateWizardSchemaRegistryContract(registry, order);
    return deepFreezeWizardValue(registry);
  }

  // Canonical extension point for schema-aware authoring.
  // Add a schema here rather than adding parallel switch/case paths elsewhere.
  const WIZARD_SCHEMA_ORDER = Object.freeze([
    'tiinex.topic.v1',
    'tiinex.evidence.v1',
    'tiinex.feedback.v1',
    'tiinex.reduction.v1',
    'tiinex.task.v1',
    'tiinex.decision.v1',
    'tiinex.pointer.v1',
    'tiinex.lineage.upgrade.deferral.v1',
    'tiinex.discovery.v1',
    'tiinex.discovery.follow.v1',
    'tiinex.discovery.finding.v1',
    'tiinex.discovery.research.v1',
    'tiinex.discovery.expedition.v1',
    'tiinex.discovery.monitoring.v1',
    'tiinex.resource.v1',
    'tiinex.resource.need.v1',
    'tiinex.resource.contribution.v1',
    'tiinex.resource.contribution.receipt.v1',
    'tiinex.resource.allocation.v1',
    'tiinex.resource.allocation.usage.v1',
    'tiinex.resource.budget.v1',
    'tiinex.instrument.v1',
    'tiinex.instrument.financial.v1',
    'tiinex.instrument.consent.v1',
    'tiinex.workspace.v1',
    'raw'
  ]);


  function camelKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, ch) => String(ch || '').toUpperCase())
      .replace(/[^a-z0-9]/g, '') || 'field';
  }

  function simpleWizardSchemaDefinition(id, label, icon, summary, sectionNames, options = {}) {
    const defaults = {};
    const fields = sectionNames.map((name, index) => {
      const key = camelKey(name);
      defaults[key] = '';
      return { key, label: name, type: index === 0 ? 'textarea' : 'textarea', placeholder: options.placeholders?.[name] || `Describe ${name.toLowerCase()}.`, required: index === 0 };
    });
    return {
      id,
      label,
      icon,
      suffix: '.trace.md',
      kind: 'trace',
      humanArtifact: true,
      summary,
      bodyLabel: `${label} body`,
      body: sectionNames.map((name) => `## ${name}\n\n- `).join('\n\n'),
      fields,
      defaults: () => Object.assign({}, defaults),
      bodyFromForm: (f) => sectionNames.map((name) => {
        const key = camelKey(name);
        return `## ${name}\n\n${paragraph(f[key], `Describe ${name.toLowerCase()}.`)}`;
      }).join('\n\n'),
      formStateFromSections: (sections) => Object.fromEntries(sectionNames.map((name) => [camelKey(name), plainBlock(sections[name.toLowerCase()] || '')]))
    };
  }

  const WIZARD_SCHEMA_REGISTRY = freezeWizardSchemaRegistry({
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
    'tiinex.discovery.v1': simpleWizardSchemaDefinition('tiinex.discovery.v1', 'Discovery', 'fa-compass', 'Bounded discovery context with intent, field, method, boundary, outcome, and limits.', ['Discovery Intent', 'Discovery Field', 'Discovery Method', 'Discovery Boundaries', 'Discovery Outcome', 'Interpretation Limits']),
    'tiinex.discovery.follow.v1': simpleWizardSchemaDefinition('tiinex.discovery.follow.v1', 'Discovery Follow', 'fa-eye', 'Bounded ongoing attention to a target without upgrading it to monitoring.', ['Follow Target', 'Follow Basis', 'Interest Boundary', 'Update Expectation', 'Stop Or Review Condition', 'Interpretation Limits']),
    'tiinex.discovery.finding.v1': simpleWizardSchemaDefinition('tiinex.discovery.finding.v1', 'Discovery Finding', 'fa-magnifying-glass-location', 'One discovered item, absence, anomaly, ambiguity, contradiction, or lead.', ['Discovery Context', 'Finding', 'Provenance', 'Triage', 'Interpretation Limits']),
    'tiinex.discovery.research.v1': simpleWizardSchemaDefinition('tiinex.discovery.research.v1', 'Discovery Research', 'fa-flask', 'Question-driven inquiry with source field, method, findings, synthesis, and limits.', ['Research Question', 'Source Field', 'Method', 'Findings', 'Synthesis', 'Interpretation Limits']),
    'tiinex.discovery.expedition.v1': simpleWizardSchemaDefinition('tiinex.discovery.expedition.v1', 'Discovery Expedition', 'fa-route', 'Exploratory route through a partly unknown field.', ['Expedition Purpose', 'Terrain', 'Route', 'Encounters', 'Map Update', 'Interpretation Limits']),
    'tiinex.discovery.monitoring.v1': simpleWizardSchemaDefinition('tiinex.discovery.monitoring.v1', 'Discovery Monitoring', 'fa-tower-broadcast', 'Bounded recurring or continued observation over time.', ['Monitoring Purpose', 'Monitoring Field', 'Cadence Or Trigger', 'Observation Boundary', 'Review Or Stop Condition', 'Interpretation Limits']),
    'tiinex.resource.v1': simpleWizardSchemaDefinition('tiinex.resource.v1', 'Resource', 'fa-boxes-stacked', 'Broad resource-enablement context.', ['Resource Identity', 'Resource Role', 'Resource Boundary', 'Resource State', 'Interpretation Limits']),
    'tiinex.resource.need.v1': simpleWizardSchemaDefinition('tiinex.resource.need.v1', 'Resource Need', 'fa-hand-holding-heart', 'Needed resource or blocker.', ['Need Statement', 'Required Resource', 'Required For', 'Constraint Impact', 'Fulfillment Boundary', 'Interpretation Limits']),
    'tiinex.resource.contribution.v1': simpleWizardSchemaDefinition('tiinex.resource.contribution.v1', 'Resource Contribution', 'fa-handshake-angle', 'Offered, pledged, provided, withdrawn, rejected, or returned resource contribution.', ['Contribution Statement', 'Contributor', 'Contributed Resource', 'Target Need Or Purpose', 'Contribution Terms', 'Receipt Or Evidence Boundary', 'Interpretation Limits']),
    'tiinex.resource.contribution.receipt.v1': simpleWizardSchemaDefinition('tiinex.resource.contribution.receipt.v1', 'Contribution Receipt', 'fa-receipt', 'Received-resource contribution record.', ['Receipt Statement', 'Received Resource', 'Source And Recipient', 'Receipt Basis', 'Restrictions Or Conditions', 'Receipt Status', 'Interpretation Limits']),
    'tiinex.resource.allocation.v1': simpleWizardSchemaDefinition('tiinex.resource.allocation.v1', 'Resource Allocation', 'fa-share-nodes', 'Resource reserved or assigned to a purpose.', ['Allocation Statement', 'Allocated Resource', 'Allocated To', 'Use Boundary', 'Allocation Status', 'Interpretation Limits']),
    'tiinex.resource.allocation.usage.v1': simpleWizardSchemaDefinition('tiinex.resource.allocation.usage.v1', 'Allocation Usage', 'fa-gauge-high', 'Actual, estimated, observed, or billed resource usage.', ['Usage Statement', 'Used Resource', 'Usage Target', 'Measured Or Estimated Use', 'Budget Or Allocation Relation', 'Interpretation Limits']),
    'tiinex.resource.budget.v1': simpleWizardSchemaDefinition('tiinex.resource.budget.v1', 'Resource Budget', 'fa-chart-pie', 'Resource cap, quota, reserve, runway, or limit.', ['Budget Statement', 'Budget Target', 'Resource Kind', 'Amount Or Cap', 'Period Or Window', 'Threshold Behavior', 'Interpretation Limits']),
    'tiinex.instrument.v1': simpleWizardSchemaDefinition('tiinex.instrument.v1', 'Instrument', 'fa-scroll', 'Terms, permission, authority, obligation, access, restriction, or value-transfer boundary.', ['Instrument Identity', 'Parties Or Authorities', 'Terms Or Permissions', 'Status And Effect', 'Boundaries', 'Interpretation Limits']),
    'tiinex.instrument.financial.v1': simpleWizardSchemaDefinition('tiinex.instrument.financial.v1', 'Financial Instrument', 'fa-file-invoice-dollar', 'Financial value-transfer form and boundary.', ['Financial Instrument Identity', 'Parties', 'Instrument Type', 'Amount Or Value Boundary', 'Terms Summary', 'Status', 'Legal And Accounting Boundary', 'Interpretation Limits']),
    'tiinex.instrument.consent.v1': simpleWizardSchemaDefinition('tiinex.instrument.consent.v1', 'Consent Instrument', 'fa-user-check', 'Consent, refusal, withdrawal, permission, restriction, or use-boundary instrument.', ['Consent Statement', 'Consenting Party', 'Consent Scope', 'Use Boundary', 'Revocation Or Expiry', 'Interpretation Limits']),
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
  }, WIZARD_SCHEMA_ORDER);

  const WIZARD_HUMAN_SCHEMA_IDS = new Set(WIZARD_SCHEMA_ORDER.filter((id) => WIZARD_SCHEMA_REGISTRY[id]?.humanArtifact));

  function wizardSchemaDefinition(id) {
    return WIZARD_SCHEMA_REGISTRY[String(id || '').trim()] || WIZARD_SCHEMA_REGISTRY.raw;
  }

  function optionFromWizardSchemaDefinition(def) {
    return {
      id: def.id,
      label: def.label,
      icon: def.icon,
      suffix: def.suffix,
      summary: def.summary,
      bodyLabel: def.bodyLabel,
      body: def.body
    };
  }

  function humanSchemaOptions() {
    return WIZARD_SCHEMA_ORDER
      .filter((id) => policyAllowsOrdinaryWizardSchema(id))
      .map((id) => optionFromWizardSchemaDefinition(wizardSchemaDefinition(id)));
  }

  function schemaOptionById(id) {
    const requestedId = String(id || '').trim();
    const def = WIZARD_SCHEMA_REGISTRY[requestedId];
    if (def && policyAllowsOrdinaryWizardSchema(def.id)) return optionFromWizardSchemaDefinition(def);
    return humanSchemaOptions()[0];
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
        lead: 'Update the local artifact through its schema-aware form.',
        icon: 'fa-pen-to-square',
        button: 'Save local edit'
      };
    }
    if (mode === 'continue') {
      return {
        kicker: 'Continue',
        title: 'Create continuation leaf',
        lead: 'Choose the child leaf shape.',
        icon: 'fa-code-branch',
        button: 'Review markdown'
      };
    }
    if (mode === 'reference') {
      return {
        kicker: 'Reference',
        title: 'Create reference leaf',
        lead: 'Choose the reference leaf shape.',
        icon: 'fa-link',
        button: 'Review markdown'
      };
    }
    return {
      kicker: 'Add',
      title: 'Create Tiinex artifact',
      lead: 'Choose a human-authored Tiinex artifact type.',
      icon: 'fa-file-circle-plus',
      button: 'Review markdown'
    };
  }

  function wizardNodeById(ws, id) {
    return id ? ws?.nodeById?.get?.(id) || null : null;
  }

  function wizardHeaderContext(ws, modal) {
    const mode = modal?.mode || 'new';
    const parent = wizardNodeById(ws, modal?.parentNodeId);
    const referenced = wizardNodeById(ws, modal?.referencedNodeId);
    const parts = [];

    if (mode === 'continue' && parent) {
      parts.push(['fa-code-branch', 'Child of', parent.title || parent.path]);
    } else if (mode === 'reference') {
      if (referenced) parts.push(['fa-link', 'Reference target', referenced.title || referenced.path]);
      if (parent) parts.push(['fa-diagram-project', 'Parent', parent.title || parent.path]);
    } else if (mode === 'edit' && modal?.path) {
      parts.push(['fa-pen-to-square', 'Editing', modal.path]);
    }

    if (!parts.length) return '';
    return `<div class="wizard-header-context" aria-label="Wizard relation context">
      ${parts.map(([icon, label, value]) => `<span class="wizard-header-context-chip"><i class="fa-solid ${escapeAttr(icon)}"></i><strong>${escapeHtml(label)}</strong><em>${escapeHtml(value)}</em></span>`).join('')}
    </div>`;
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
            ${wizardHeaderContext(ws, modal)}
          </div>
          <button class="tv-btn small subtle authoring-dialog-close" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="artifact-wizard-body authoring-dialog-body paged" data-scroll-restore="artifact-wizard-body">
          ${wizardStepIndicator(step)}
          ${step === 'type'
            ? wizardTypeStep(ws, modal, options, selectedId)
            : wizardDescribeStep(ws, modal, selected, title, summary, body)}
        </div>
        <div class="modal-footer-actions artifact-wizard-actions authoring-dialog-actions paged">
          ${primaryButtons}
          <button class="tv-btn subtle wizard-cancel-action" data-action="close-modal">Cancel</button>
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
      body: typeof options.body === 'string' ? options.body : option.body,
      wizardStep: normalizeWizardRouteStep(options.wizardStep),
      folderPath: options.folderPath ? normalizedFolderPath(options.folderPath) : ''
    };
    updateUrlState({ replace: false });
    render();
  }

  function wizardPathFor(ws, modal, option, title) {
    const selected = option || schemaOptionById(modal?.schemaId || 'tiinex.topic.v1');
    const kind = wizardKindForSchema(selected.id);

    if (modal?.mode === 'edit' && modal.path) return canonicalWorkspacePath(modal.path);

    if (modal?.mode === 'continue' && modal.parentNodeId && kind === 'trace') {
      const parent = wizardNodeById(ws, modal.parentNodeId);
      if (parent) return nextSiblingTracePath(parent, ws);
    }

    if (modal?.mode === 'reference' && modal.parentNodeId && kind === 'trace') {
      const parent = wizardNodeById(ws, modal.parentNodeId);
      if (parent) return nextSiblingTracePath(parent, ws).replace(/\.trace\.md$/i, '-reference.trace.md');
    }

    if (modal?.mode === 'continue' || modal?.mode === 'reference') {
      const slug = slugifyTitle(title || selected.label);
      if (kind === 'workspace') return `.topics/workspaces/${slug}.workspace.md`;
      return `.topics/${slug}.trace.md`;
    }

    return uniqueWizardRootPath(ws, modal, selected, title);
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




  function normalizeWizardRouteStep(step) {
    const value = String(step || '').trim().toLowerCase();
    if (value === 'describe' || value === 'details') return 'describe';
    return 'type';
  }

  function wizardStep(modal) {
    return normalizeWizardRouteStep(modal?.wizardStep || 'type');
  }

  function wizardStepIndicator(step) {
    const steps = [
      ['type', 'Type'],
      ['describe', 'Details'],
      ['review', 'Review']
    ];
    const currentIndex = step === 'describe' ? 1 : 0;
    return `<div class="artifact-wizard-progress" data-step="${escapeAttr(step)}" aria-label="Wizard progress">
      ${steps.map(([id, label], index) => {
        const active = index === currentIndex;
        const done = index < currentIndex;
        return `<span class="${active ? 'active' : done ? 'done' : ''}" aria-current="${active ? 'step' : 'false'}"><b>${index + 1}</b><em>${escapeHtml(label)}</em></span>`;
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

  registerActionHandler(async function pagedWizardAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';

    if (action === 'wizard-set-step') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      app.modal.wizardStep = normalizeWizardRouteStep(event.currentTarget.dataset.step || 'type');
      setRouteState('replace');
      render();
      return;
    }

    if (action === 'wizard-next-step') {
      event.preventDefault();
      event.stopPropagation();
      if (!app.modal || app.modal.type !== 'artifact-wizard') return;
      app.modal.wizardStep = 'describe';
      setRouteState('replace');
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
      updateUrlState({ replace: true });
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
    // It should not appear in GitHub source / URLs / drop substeps where it looks
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
    if (!policyKnownSchemaId(id)) return '';
    return schemaCreatePolicy(id).schemaPath;
  }

  function schemaReferenceForPath(schemaId, artifactPath) {
    const id = String(schemaId || '').trim() || 'tiinex.topic.v1';
    const policy = policyKnownSchemaId(id) ? schemaCreatePolicy(id) : null;
    if (policy?.schemaPermalink) return `[${id}](${policy.schemaPermalink})`;
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
    return integrityFooter();
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
    scheduleWizardRouteDraftReplace();
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
      scheduleWizardRouteDraftReplace();
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

  async function createArtifactFromWizard(ws, modal) {
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

    const finalizedText = await finalizeCreatedArtifactIntegrity(ws, artifact, modal);
    upsertWorkspaceTextFile(ws, path, finalizedText, 'local');
    computeWorkspaceIndex(ws);
    const node = Array.from(ws.nodeById?.values?.() || []).find((candidate) => sameImportedPath(candidate.path, path));
    if (node) ws.selectedNodeId = node.id;

    markDialogRouteSessionClosed(modal);
    app.modal = null;
    app.pendingRouteModal = null;
    clearTimeout(app.wizardRouteDraftTimer);
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
      await createArtifactFromWizard(ws, app.modal);
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
    updateUrlState({ replace: false });
    render();
  }

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
    markDialogRouteSessionClosed(modal);
    app.modal = null;
    app.pendingRouteModal = null;
    clearTimeout(app.wizardRouteDraftTimer);
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
      sourceIds: [],
      exportPassword: ''
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
    const plan = buildExportPlan(ws, modal);
    const sources = exportSourceEntries(ws);
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
            <p class="kicker">Export archive</p>
            <h2 class="modal-title-lite" id="export-title"><i class="fa-solid fa-file-zipper"></i>Export workspace archive</h2>
            <p class="text-secondary mb-0">Create a client-side package from this workspace without mutating loaded sources or sending telemetry.</p>
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
            <div><strong>${plan.counts.files}</strong><span>markdown/file entries</span></div>
            <div><strong>${plan.counts.assets}</strong><span>asset entries</span></div>
            <div><strong>${escapeHtml(exportArchiveLabel(plan.archive.format))}</strong><span>${escapeHtml(exportPasswordLabel(plan.archive.passwordMode))}</span></div>
            <div><strong>${escapeHtml(exportDeliveryLabel(plan.delivery.target))}</strong><span>client-side delivery</span></div>
          </section>
        </div>
        <div class="modal-footer-actions export-actions">
          <button class="tv-btn primary" data-action="export-run" data-ws="${escapeAttr(ws.id)}" ${plan.counts.entries ? '' : 'disabled'}><i class="fa-solid fa-download"></i>Export archive</button>
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


  // --- Workspace export action state ---

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

    if (action === 'export-run') return next(event);

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
    const modalPassword = typeof app.modal?.exportPassword === 'string' ? app.modal.exportPassword : '';
    return modalPassword || document.querySelector('[data-export-password]')?.value || '';
  }

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
    return modal?.passwordMode || 'none';
  }

  function exportArchiveLabel(format) {
    if (format === 'tar') return 'tar';
    if (format === 'tgz') return 'tar.gz';
    return 'zip';
  }

  function exportPasswordLabel(mode) {
    if (mode === 'zip') return 'Windows-compatible password';
    if (mode === 'tiinex') return 'Tiinex AES-GCM';
    return 'no password';
  }

  function exportDeliveryLabel(target) {
    if (target === 'copy') return 'Copy';
    if (target === 'github-issue') return 'GitHub issue';
    return 'Download';
  }

  function exportSelectionLabel(mode) {
    if (mode === 'local') return 'Local edits and created artifacts';
    if (mode === 'sources') return 'Selected sources';
    return 'All loaded files';
  }

  function buildExportPlan(ws, modal) {
    const files = exportIncludedFiles(ws, modal);
    const assets = exportIncludedAssets(ws, modal);
    const mode = modal?.mode || 'all';
    const archiveFormat = exportArchiveFormat(modal);
    const passwordMode = exportPasswordMode(modal);
    return {
      schema: 'tiinex.export.plan.v1',
      workspace: { id: ws?.id || '', label: ws?.label || '', sourceNote: ws?.sourceNote || '' },
      selection: {
        mode,
        label: exportSelectionLabel(mode),
        includeAssets: Boolean(modal?.includeAssets),
        selectedSources: Array.from(modal?.sourceIds || [])
      },
      archive: { format: archiveFormat, label: exportArchiveLabel(archiveFormat), passwordMode, passwordLabel: exportPasswordLabel(passwordMode) },
      delivery: { target: 'download', label: exportDeliveryLabel('download'), clientSide: true, telemetry: 'none' },
      connectorContract: {
        target: 'download',
        clientSide: true,
        telemetry: 'none',
        originAdapters: exportSourceEntries(ws).map((source) => originAdapterSummary(source.kind || 'local'))
      },
      sources: exportSourceEntries(ws).map(safeSourceSerializable),
      files,
      assets,
      counts: { files: files.length, assets: assets.length, entries: files.length + assets.length }
    };
  }

  function buildPackageResult(plan) {
    const integrityRefresh = exportIntegritySummaryInit();
    return {
      schema: 'tiinex.package.result.v1',
      createdAt: new Date().toISOString(),
      workspace: Object.assign({}, plan.workspace || {}),
      plan: {
        schema: plan.schema,
        selection: Object.assign({}, plan.selection || {}),
        archive: Object.assign({}, plan.archive || {}),
        delivery: Object.assign({}, plan.delivery || {}),
        connectorContract: Object.assign({}, plan.connectorContract || {}),
        counts: Object.assign({}, plan.counts || {})
      },
      counts: Object.assign({}, plan.counts || {}),
      sources: Array.isArray(plan.sources) ? plan.sources.slice() : [],
      integrityRefresh,
      files: [],
      assets: [],
      warnings: []
    };
  }

  function exportResultWithDelivery(packageResult, delivery) {
    return Object.assign({}, packageResult, {
      delivery: Object.assign({}, packageResult?.plan?.delivery || {}, delivery || {}),
      completedAt: new Date().toISOString()
    });
  }

  function exportResultIntegrityRows(result) {
    const s = result?.integrityRefresh || exportIntegritySummaryInit();
    return [
      ['Self-target refreshed', s.refreshedSelfTargets || 0],
      ['Self-target already current', s.currentSelfTargets || 0],
      ['No-claim preserved', s.noClaimPreserved || 0],
      ['Parent-target preserved', s.parentTargetsPreserved || 0],
      ['Source files preserved', s.sourceFilesPreserved || 0],
      ['Malformed claims preserved', s.malformedClaims || 0],
      ['Unsupported claims preserved', s.unsupportedClaims || 0],
      ['Multi-entry preserved', s.multiEntryPreserved || 0]
    ];
  }

  function exportResultSummaryText(result) {
    const plan = result?.plan || {};
    const counts = result?.counts || {};
    const delivery = result?.delivery || {};
    const lines = [
      'Tiinex export summary',
      `Workspace: ${result?.workspace?.label || result?.workspace?.id || 'workspace'}`,
      `Selection: ${plan.selection?.label || plan.selection?.mode || 'all'}`,
      `Archive: ${plan.archive?.label || 'zip'} · ${plan.archive?.passwordLabel || 'no password'}`,
      `Delivery target: ${delivery.label || exportDeliveryLabel(delivery.target)} · client-side · no telemetry`,
      `Origin adapters: ${(plan.connectorContract?.originAdapters || []).map((a) => a.label || a.id).filter(Boolean).join(', ') || 'local/download'}`,
      `Output: ${delivery.filename || ''}`.trim(),
      `Entries: ${counts.entries || 0} total · ${counts.files || 0} files · ${counts.assets || 0} assets`,
      `Integrity: ${exportIntegritySummaryLine(result?.integrityRefresh)}`
    ];
    return lines.filter(Boolean).join('\n');
  }

  function showExportResult(packageResult, delivery) {
    const result = exportResultWithDelivery(packageResult, delivery);
    app.lastExportResult = result;
    app.modal = { type: 'export-result', result };
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
      origin: source?.origin || source?.url || '',
      issueNumber: source?.issueNumber || '',
      adapter: source?.adapter || null
    };
  }

  function exportFileIsLocalIntegrityTarget(file) {
    const sourceId = fileSourceId(file);
    return sourceId === 'local' || file?.sourceKind === 'local' || file?.isGenerated === true;
  }

  function exportIntegrityProfile(markdown) {
    const text = normalizeNewlines(markdown || '');
    if (!markdownLooksAuthorableTiinexArtifact(text)) {
      return { state: 'not-tiinex-markdown', claimLifecycle: 'not applicable', finality: 'not applicable', refreshable: false };
    }
    const integrity = parseIntegrity(text);
    if (!integrityHasClaim(integrity)) {
      const hasParent = markdownDeclaresContinuityParent(text);
      return {
        state: 'no-claim',
        claimLifecycle: 'draft/no-claim',
        finality: 'not finalized',
        refreshable: !hasParent,
        entryCount: integrity?.entryCount || 0,
        note: hasParent ? 'parent-target draft preserved' : 'self-target draft can be finalized'
      };
    }
    if ((integrity.entryCount || 0) > 1) {
      return {
        state: 'multi-entry',
        claimLifecycle: 'claimed',
        finality: 'preserve multi-entry footer',
        refreshable: false,
        entryCount: integrity.entryCount || 0,
        note: 'multiple integrity entries preserved'
      };
    }
    if (integrity.placeholderValue || !integrity.method || !integrity.towards || !integrity.value) {
      return {
        state: 'malformed-claim',
        claimLifecycle: 'repair-needed claim',
        finality: 'not finalized',
        refreshable: false,
        entryCount: integrity.entryCount || 0,
        note: 'malformed claim preserved for review'
      };
    }
    if (integrity.method !== TIINEX_SHA256_C14N_METHOD_ID) {
      return {
        state: 'unsupported-claim',
        claimLifecycle: 'unsupported claim',
        finality: 'not evaluated',
        refreshable: false,
        entryCount: integrity.entryCount || 0,
        method: integrity.method,
        note: 'unsupported method preserved'
      };
    }
    if (!integrityTowardsIsSelf(integrity.towards)) {
      return {
        state: 'parent-target-claim',
        claimLifecycle: 'claimed',
        finality: 'preserved target claim',
        refreshable: false,
        entryCount: integrity.entryCount || 0,
        note: 'non-self target preserved unless explicitly regenerated'
      };
    }
    return {
      state: 'self-byte-integrity-claim',
      claimLifecycle: 'claimed',
      finality: 'refreshable self claim',
      refreshable: true,
      entryCount: integrity.entryCount || 0,
      note: 'self-target claim can be refreshed'
    };
  }

  function exportIntegritySummaryInit() {
    return {
      refreshedSelfTargets: 0,
      currentSelfTargets: 0,
      noClaimPreserved: 0,
      malformedClaims: 0,
      unsupportedClaims: 0,
      multiEntryPreserved: 0,
      parentTargetsPreserved: 0,
      sourceFilesPreserved: 0,
      skipped: 0
    };
  }

  function exportIntegritySummaryBump(summary, key) {
    if (!summary || !key) return;
    summary[key] = (summary[key] || 0) + 1;
  }

  function exportIntegritySummaryLine(summary) {
    const s = summary || exportIntegritySummaryInit();
    return `refreshed self targets: ${s.refreshedSelfTargets || 0}; current self targets: ${s.currentSelfTargets || 0}; no-claim preserved: ${s.noClaimPreserved || 0}; malformed: ${s.malformedClaims || 0}; unsupported: ${s.unsupportedClaims || 0}; multi-entry preserved: ${s.multiEntryPreserved || 0}; parent-target preserved: ${s.parentTargetsPreserved || 0}; source files preserved: ${s.sourceFilesPreserved || 0}`;
  }

  function exportIntegritySummaryKeyForProfile(profile, localRefreshable) {
    if (!localRefreshable) return 'sourceFilesPreserved';
    if (profile.state === 'no-claim') return 'noClaimPreserved';
    if (profile.state === 'malformed-claim') return 'malformedClaims';
    if (profile.state === 'unsupported-claim') return 'unsupportedClaims';
    if (profile.state === 'multi-entry') return 'multiEntryPreserved';
    if (profile.state === 'parent-target-claim') return 'parentTargetsPreserved';
    return 'skipped';
  }

  async function exportFileWithIntegrityRefresh(ws, file) {
    const original = normalizeNewlines(file?.content || file?.text || '');
    const profile = exportIntegrityProfile(original);
    const localTarget = exportFileIsLocalIntegrityTarget(file);
    if (!localTarget || !profile.refreshable) {
      return {
        content: original,
        changed: false,
        integrity: {
          refreshAction: localTarget ? 'preserved' : 'preserved-source',
          before: profile.state,
          after: profile.state,
          note: profile.note || ''
        }
      };
    }
    const refreshed = await markdownWithSelfIntegrity(original);
    const after = exportIntegrityProfile(refreshed);
    return {
      content: refreshed,
      changed: refreshed !== original,
      integrity: {
        refreshAction: refreshed !== original ? 'refreshed-self-target' : 'self-target-current',
        before: profile.state,
        after: after.state,
        note: refreshed !== original ? 'self-target checksum refreshed for export' : 'self-target checksum already current'
      }
    };
  }

  async function exportPayload(ws, modal) {
    const plan = buildExportPlan(ws, modal);
    const files = plan.files;
    const assets = plan.assets;
    if (!files.length && !assets.length) throw new Error('Nothing selected for export.');

    const pathCounts = new Map();
    for (const item of [...files, ...assets]) {
      const path = normalizeAssetPath(item.path || item.name || '');
      pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
    }
    const collisions = new Set(Array.from(pathCounts.entries()).filter(([, count]) => count > 1).map(([path]) => path));

    const entries = [];
    const packageResult = buildPackageResult(plan);
    const integrityRefresh = packageResult.integrityRefresh;

    for (const file of files) {
      const outPath = exportFileOutputPath(file, collisions);
      const exported = await exportFileWithIntegrityRefresh(ws, file);
      const content = exported.content;
      const localTarget = exportFileIsLocalIntegrityTarget(file);
      const summaryKey = exported.integrity.refreshAction === 'refreshed-self-target'
        ? 'refreshedSelfTargets'
        : exported.integrity.refreshAction === 'self-target-current'
          ? 'currentSelfTargets'
          : exportIntegritySummaryKeyForProfile(exportIntegrityProfile(content), localTarget);
      exportIntegritySummaryBump(integrityRefresh, summaryKey);
      entries.push({ path: outPath, bytes: new TextEncoder().encode(content), type: 'text/markdown;charset=utf-8' });
      packageResult.files.push({
        path: file.path || '', outputPath: outPath, sourceId: file.sourceId || '', sourceLabel: file.sourceLabel || '',
        rawUrl: file.rawUrl || '', browseUrl: file.browseUrl || '', repo: file.repo || '', ref: file.ref || '', isGenerated: Boolean(file.isGenerated),
        integrity: exported.integrity
      });
    }

    for (const asset of assets) {
      const outPath = exportAssetOutputPath(asset, collisions);
      const blob = await exportBlobForEntry(asset);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      entries.push({ path: outPath, bytes, type: asset.type || blob.type || 'application/octet-stream' });
      packageResult.assets.push({
        path: asset.path || '', outputPath: outPath, type: asset.type || blob.type || '',
        size: asset.size || blob.size || bytes.byteLength || 0, source: asset.source || ''
      });
    }

    return { entries, packageResult, plan, files, assets };
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
    keys.k1 = (Math.imul((keys.k1 + (keys.k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    keys.k2 = crc32Update(keys.k2, (keys.k1 >>> 24) & 0xff);
  }

  function zipCryptoDecryptByte(keys) {
    const temp = (keys.k2 | 2) >>> 0;
    return ((Math.imul(temp, (temp ^ 1) >>> 0) >>> 8) & 0xff) >>> 0;
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

  function zipCryptoDecryptBytes(bytes, password) {
    const keys = zipCryptoKeys(password);
    const out = new Uint8Array(bytes.byteLength);
    for (let i = 0; i < bytes.byteLength; i++) {
      const plain = bytes[i] ^ zipCryptoDecryptByte(keys);
      out[i] = plain;
      zipCryptoUpdateKeys(keys, plain);
    }
    return out;
  }

  async function assertZipCryptoArchiveBlob(blob, expectedEntries) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let offset = 0;
    let entries = 0;
    while (offset + 30 <= bytes.byteLength) {
      const sig = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
      if ((sig >>> 0) === 0x02014b50 || (sig >>> 0) === 0x06054b50) break;
      if ((sig >>> 0) !== 0x04034b50) throw new Error('ZIP password archive verification failed: bad local header.');
      const flag = bytes[offset + 6] | (bytes[offset + 7] << 8);
      const method = bytes[offset + 8] | (bytes[offset + 9] << 8);
      const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
      const uncompressedSize = bytes[offset + 22] | (bytes[offset + 23] << 8) | (bytes[offset + 24] << 16) | (bytes[offset + 25] << 24);
      const nameLength = bytes[offset + 26] | (bytes[offset + 27] << 8);
      const extraLength = bytes[offset + 28] | (bytes[offset + 29] << 8);
      if (!(flag & 0x0001)) throw new Error('ZIP password archive verification failed: encrypted flag missing.');
      if (method !== 0) throw new Error('ZIP password archive verification failed: unsupported compression method.');
      if ((compressedSize >>> 0) !== ((uncompressedSize >>> 0) + 12)) throw new Error('ZIP password archive verification failed: encrypted payload size mismatch.');
      offset += 30 + nameLength + extraLength + (compressedSize >>> 0);
      entries += 1;
    }
    if (entries !== expectedEntries) throw new Error('ZIP password archive verification failed: entry count mismatch.');
  }

  function archiveZipCryptoBlob(entries, password) {
    if (!password) throw new Error('Password is required.');
    const fileParts = [];
    const centralParts = [];
    let offset = 0;
    const { time, day } = dosDateTime();
    const flag = 0x0801;
    const versionMadeBy = 0x0314;

    for (const entry of entries) {
      const nameBytes = new TextEncoder().encode(normalizeAssetPath(entry.path || 'file'));
      const data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
      const crc = crc32Bytes(data);
      const header = crypto.getRandomValues(new Uint8Array(12));
      const verificationByte = (crc >>> 24) & 0xff;
      header[11] = verificationByte;
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
      pushU32(central, 0x02014b50); pushU16(central, versionMadeBy); pushU16(central, 20); pushU16(central, flag); pushU16(central, 0);
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
    if (!modal.passwordMode) modal.passwordMode = 'none';
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
      const filename = `${base}.zip`;
      const blob = archiveZipCryptoBlob(payload.entries, password);
      await assertZipCryptoArchiveBlob(blob, payload.entries.length);
      downloadBlob(filename, blob);
      showExportResult(payload.packageResult, { target: 'download', label: exportDeliveryLabel('download'), status: 'downloaded', filename, archiveFormat: format, passwordMode });
      render(); toast(`Downloaded password-protected zip ${filename}.`, 'ok'); return;
    }
    const blob = await archiveBlob(payload.entries, format);
    if (passwordMode === 'tiinex') {
      const innerName = `${base}.${ext}`;
      const filename = `${innerName}.tiinex.enc.zip`;
      const encrypted = await encryptTiinexZipBlob(blob, password, innerName);
      downloadBlob(filename, encrypted);
      showExportResult(payload.packageResult, { target: 'download', label: exportDeliveryLabel('download'), status: 'downloaded', filename, archiveFormat: format, passwordMode });
      render(); toast(`Downloaded encrypted ${filename}.`, 'ok'); return;
    }
    const filename = `${base}.${ext}`;
    downloadBlob(filename, blob);
    showExportResult(payload.packageResult, { target: 'download', label: exportDeliveryLabel('download'), status: 'downloaded', filename, archiveFormat: format, passwordMode });
    render(); toast(`Downloaded ${filename}.`, 'ok');
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
      if (mode === 'none') app.modal.exportPassword = '';
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




  function renderExportResultModal(modal) {
    const result = modal?.result || app.lastExportResult;
    if (!result) return '';
    const counts = result.counts || {};
    const plan = result.plan || {};
    const delivery = result.delivery || {};
    const rows = exportResultIntegrityRows(result).map(([label, value]) => `<div class="export-result-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('');
    const summary = exportResultSummaryText(result);
    return `<div class="modal-backdrop-custom focus-modal export-backdrop" role="dialog" aria-modal="true" aria-labelledby="export-result-title">
      <div class="modal-panel export-panel export-result-panel">
        <div class="modal-header-lite export-head">
          <div>
            <p class="kicker">Package result</p>
            <h2 class="modal-title-lite export-title" id="export-result-title"><span class="export-title-icon"><i class="fa-solid fa-circle-check"></i></span><span>Export package created</span></h2>
            <p class="text-secondary mb-0">Client-side delivery completed. No telemetry or hidden upload was used.</p>
          </div>
          <button class="tv-btn small subtle" data-action="close-modal" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="export-body">
          <section class="export-result-hero">
            <div><strong>${escapeHtml(delivery.filename || 'export package')}</strong><span>downloaded file</span></div>
            <div><strong>${counts.entries || 0}</strong><span>total entries</span></div>
            <div><strong>${counts.files || 0}</strong><span>files</span></div>
            <div><strong>${counts.assets || 0}</strong><span>assets</span></div>
          </section>
          <section class="export-section export-result-contract">
            <h3>Package contract</h3>
            <div class="export-result-kv"><span>Selection</span><strong>${escapeHtml(plan.selection?.label || plan.selection?.mode || 'all')}</strong></div>
            <div class="export-result-kv"><span>Archive</span><strong>${escapeHtml(plan.archive?.label || 'zip')} · ${escapeHtml(plan.archive?.passwordLabel || 'no password')}</strong></div>
            <div class="export-result-kv"><span>Delivery target</span><strong>${escapeHtml(delivery.label || exportDeliveryLabel(delivery.target))} · client-side · no telemetry</strong></div>
            <div class="export-result-kv"><span>Loaded sources</span><strong>${(result.sources || []).length}</strong></div>
            <div class="export-result-kv"><span>Origin adapters</span><strong>${escapeHtml((plan.connectorContract?.originAdapters || []).map((a) => a.label || a.id).filter(Boolean).join(', ') || 'Local/download')}</strong></div>
          </section>
          <section class="export-section export-result-integrity">
            <h3>Integrity refresh summary</h3>
            <div class="export-result-rows">${rows}</div>
          </section>
          <section class="export-section export-result-copy">
            <h3>Copyable summary</h3>
            <pre class="source-block export-result-pre"><code>${escapeHtml(summary)}</code></pre>
          </section>
        </div>
        <div class="modal-footer-actions export-actions">
          <button class="tv-btn primary" data-action="copy-export-summary"><i class="fa-regular fa-copy"></i>Copy summary</button>
          <button class="tv-btn subtle" data-action="close-modal">Close</button>
        </div>
      </div>
    </div>`;
  }

  registerRenderModalWrapper(function renderModalWithExportResult(modal, next) {
    if (modal?.type === 'export-result') return renderExportResultModal(modal);
    return next(modal);
  });

  registerActionHandler(async function exportResultAction(event, next) {
    const action = event.currentTarget?.dataset?.action || '';
    if (action === 'copy-export-summary') {
      event.preventDefault();
      event.stopPropagation();
      const result = app.modal?.result || app.lastExportResult;
      if (!result) return toast('No export summary available.', 'warn');
      const text = exportResultSummaryText(result);
      try {
        await navigator.clipboard.writeText(text);
        toast('Export summary copied.', 'ok');
      } catch (_) {
        toast('Could not copy export summary.', 'warn');
      }
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
        ${renderPasswordButton(modal, 'zip', 'Windows-compatible ZIP password', 'File names stay visible; file contents require password.')}
      </div>
      ${needsPassword ? `<label class="field-label export-password-field">Password<input class="form-control tv-input" type="password" autocomplete="new-password" data-field="exportPassword" data-export-password value="${escapeAttr(modal.exportPassword || '')}" placeholder="Password for this export"></label>` : ''}
      <p class="export-encryption-note">${mode === 'zip'
        ? 'Windows-compatible ZIP password protects file contents for common ZIP clients. File names and folders remain visible; opening or extracting files requires the password.'
        : mode === 'tiinex'
          ? 'AES-GCM mode uses PBKDF2-SHA256 + AES-GCM-256 inside a Tiinex encrypted package container.'
          : 'Choose an archive format and optional password mode.'}</p>
    </section>`;
  };

  registerRenderExportModalWrapper(function renderExportModalWithHeaderPolish(modal, next) {
    const html = next(modal);
    return html
      .replace('class="modal-header-lite export-head"', 'class="modal-header-lite export-head"')
      .replace('<h2 class="modal-title-lite" id="export-title"><i class="fa-solid fa-file-zipper"></i>Export workspace archive</h2>', '<h2 class="modal-title-lite export-title" id="export-title"><span class="export-title-icon"><i class="fa-solid fa-file-zipper"></i></span><span>Export workspace archive</span></h2>');
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
        <div class="modal-read-body asset-preview-body ${isImage ? 'asset-image-preview-body' : ''}">
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

  registerRouteStateWrapper(function routeStateWithGitHubSources(next) {
    const state = next();
    (state.sources || []).forEach((item, index) => {
      const ws = app.workspaces[index];
      const githubSource = Array.from(ws?.sources?.values?.() || []).find((source) => source.kind === 'github' && source.repo);
      if (!githubSource) return;
      const normalized = normalizeGitHubSourceState(githubSource, ws);
      item.kind = 'github-tree';
      item.repo = normalized.repo;
      item.ref = normalized.ref || ws.ref || '';
      item.rootPaths = normalized.rootPaths || ['.topics'];
      item.enabledSurfaces = normalizeGithubSurfaceConfig(normalized.enabledSurfaces || {});
      item.issueUrls = normalized.issueUrls || [];
      item.discoveryDirective = normalized.discoveryDirective || { kind: 'implicit-workspace-inline', source: 'workspace.md', status: 'bootstrap' };
    });
    return state;
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
    // Commit-date enrichment can cost one GitHub REST request per artifact.
    // Keep it opt-in so ordinary browsing stays a good external-source citizen.
    repoCommitDateSortFetchLimit: 0,
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
      workspaceDisplayOptions(ws).showValidator ? 'validator' : '',
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

  function workspaceHasActiveDiscoveryProgress(ws) {
    return Boolean(ws && (ws.loading || ws.discoveryProgress));
  }

  function loadingProgressNotice(ws) {
    if (!workspaceHasActiveDiscoveryProgress(ws)) return '';
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
      if (!selected && workspaceHasActiveDiscoveryProgress(ws) && html.includes('<div class="post-feed')) {
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
    if (workspaceHasActiveDiscoveryProgress(ws) && html.includes('<div class="post-feed')) {
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





  function discoveryProgressDone(p) {
    return Math.max(0, Number(p?.loaded || 0)) + Math.max(0, Number(p?.failed || 0));
  }

  function discoveryProgressRatio(done, total) {
    const safeTotal = Math.max(0, Number(total || 0));
    if (!safeTotal) return 0;
    return Math.max(0, Math.min(1, Number(done || 0) / safeTotal));
  }

  function discoveryProgressPercent(ws) {
    const p = ws?.discoveryProgress || {};
    const phase = String(p.phase || '');
    const total = Math.max(0, Number(p.total || 0));
    const done = discoveryProgressDone(p);

    // The percentage is intentionally phase-weighted instead of a literal network
    // request ratio. Discovery has several differently expensive phases; showing
    // 96-99% while integrity verification still owns many markdown requests feels
    // false, so verification now gets a meaningful part of the bar.
    if (phase === 'tree') return 4;
    if (phase === 'fetch') {
      if (!total) return 8;
      return Math.max(8, Math.min(60, Math.round(8 + discoveryProgressRatio(done, total) * 52)));
    }
    if (phase === 'index') {
      const indexTotal = Math.max(0, Number(p.indexTotal || total || 0));
      const indexDone = Math.max(0, Number(p.indexLoaded || 0));
      if (!indexTotal) return 64;
      return Math.max(60, Math.min(72, Math.round(60 + discoveryProgressRatio(indexDone, indexTotal) * 12)));
    }
    if (phase === 'integrity') {
      const integrityTotal = Math.max(0, Number(p.integrityTotal || 0));
      const integrityDone = Math.max(0, Number(p.integrityLoaded || 0));
      if (!integrityTotal) return 74;
      return Math.max(72, Math.min(96, Math.round(72 + discoveryProgressRatio(integrityDone, integrityTotal) * 24)));
    }
    if (phase === 'policy') return 98;
    if (!total) return 0;
    return Math.max(2, Math.min(100, Math.round(discoveryProgressRatio(done, total) * 100)));
  }

  function discoveryProgressTitle(ws) {
    const p = ws?.discoveryProgress || {};
    const phase = String(p.phase || '');
    const total = Math.max(0, Number(p.total || 0));
    const done = discoveryProgressDone(p);
    const indexTotal = Math.max(0, Number(p.indexTotal || total || 0));
    const indexLoaded = Math.max(0, Number(p.indexLoaded || 0));
    const integrityTotal = Math.max(0, Number(p.integrityTotal || 0));
    const integrityLoaded = Math.max(0, Number(p.integrityLoaded || 0));

    if (phase === 'tree') return 'Discovering file list';
    if (phase === 'fetch') return total ? `Loading markdown files ${done}/${total}` : 'Loading markdown files';
    if (phase === 'index') return indexTotal ? `Indexing workspace ${indexLoaded}/${indexTotal}` : 'Indexing workspace';
    if (phase === 'integrity') return integrityTotal ? `Verifying markdown targets ${integrityLoaded}/${integrityTotal}` : 'Verifying markdown targets';
    if (phase === 'policy') return 'Reading workspace policy';
    if (!total) return 'Loading';
    return `${done}/${total}`;
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

  function applyDurableLensAfterProgressiveIndex(ws) {
    try {
      const state = app.pendingDurableLensState || decodedLensState() || cachedLensState();
      const sources = state?.workspaces || state?.sources || [];
      const index = app.workspaces.indexOf(ws);
      if (index >= 0 && sources[index] && typeof applyLensSource === 'function') applyLensSource(ws, sources[index]);
    } catch (_) {}
  }

  async function computeWorkspaceIndexWithDiscoveryProgress(ws) {
    if (!ws) return;
    ensureWorkspaceSources(ws);
    if (typeof repairTextBackedWorkspaceFiles === 'function') repairTextBackedWorkspaceFiles(ws);

    const files = Array.from(ws.files?.values?.() || []);
    const previousSelected = ws.selectedNodeId;
    const previousWindows = ws.lineageWindows || {};
    const previousIntegrity = ws.integrityCache || {};
    const previousParentFetches = ws.parentFetches || {};

    ws.discoveryProgress = Object.assign({}, ws.discoveryProgress || {}, {
      phase: 'index',
      indexLoaded: 0,
      indexTotal: files.length
    });
    updateDiscoveryProgressDom(ws);
    await progressYield(ws);

    const nodes = [];
    const chunkSize = Math.max(6, Number(app.settings.repoDiscoveryIndexChunkSize || 18));
    for (let index = 0; index < files.length; index += chunkSize) {
      const chunk = files.slice(index, index + chunkSize);
      for (const file of chunk) nodes.push(parseTraceFile(file));
      ws.discoveryProgress.indexLoaded = Math.min(files.length, index + chunk.length);
      updateDiscoveryProgressDom(ws);
      await progressYield(ws);
    }

    ws.nodes = nodes;
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
      const cachedIntegrity = previousIntegrity[node.storageKey || node.path] || previousIntegrity[node.path] || null;
      node.integrityStatus = cachedIntegrity?.status || initialIntegrityStatusForNode(node);
      node.integrityStatusLabel = cachedIntegrity?.label || initialIntegrityStatusLabelForNode(node);
    });

    ws.nodes.forEach((node) => {
      if (!node.parentResolvedPath) return;
      const parent = sameWorkspacePathLookup(ws, node.parentResolvedPath, node.sourceId)
        || sameWorkspacePathLookup(ws, node.parentResolvedPath, '');
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
    if (typeof scheduleIntegrityVerification === 'function') {
      await scheduleIntegrityVerification(ws, { discoveryProgress: true });
    }
    if (typeof scheduleGitCommitSortEnrichment === 'function') scheduleGitCommitSortEnrichment(ws);
    if (typeof resolvePendingSelectedRoutes === 'function') resolvePendingSelectedRoutes();
    applyDurableLensAfterProgressiveIndex(ws);
  }

  async function discoverGitHubRepoIntoWorkspace(ws, options) {
    const repo = options.repo;
    const ref = options.ref || '';
    const rootPaths = Array.isArray(options.rootPaths) ? options.rootPaths : parseRootPaths(options.rootPath || '.topics');
    const key = repoDiscoveryKey(repo, ref, rootPaths);

    if (ws.discoverySource?.kind === 'github-tree'
      && repoDiscoveryKey(ws.discoverySource.repo, ws.discoverySource.ref || '', ws.discoverySource.rootPaths || ws.discoverySource.rootPath || '.topics') === key
      && ws.nodes.length
      && !options.refreshExisting) {
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
    const githubSource = options.source || registerGitHubSource(ws, { repo, ref, rootPaths, enabledSurfaces: { repoFiles: true, issues: true } });
    ws.discoverySource = { kind: 'github-tree', repo, ref: ref || '', rootPath: rootPaths[0] || '.topics', rootPaths, sourceId: githubSource.id, enabledSurfaces: normalizeGithubSurfaceConfig(githubSource.enabledSurfaces || {}), issueUrls: githubSource.issueUrls || [], discoveryDirective: githubSource.discoveryDirective || null };
    ws.sourceNote = `GitHub repo discovery: ${repo}${ref ? '@' + ref : ''} / ${rootPathsLabel(rootPaths)}`;
    ws.discoveryProgress = { phase: 'tree', loaded: 0, total: 0, failed: 0 };
    ws.logs.push(`Discovering ${repo}${ref ? '@' + ref : ''} under ${rootPaths.join(', ')} via GitHub tree API.`);
    render();
    await progressYield(ws);

    let count = 0;
    let failed = 0;
    let indexed = false;

    try {
      const discovery = await discoverGitHubTracePaths(repo, ref, rootPaths, { hardRefresh: Boolean(options.hardRefresh) });
      ws.repo = repo;
      ws.ref = discovery.ref;
      ws.discoverySource.ref = discovery.ref;
      ws.discoverySource.rootPath = discovery.rootPath;
      ws.discoverySource.rootPaths = discovery.rootPaths;
      githubSource.ref = githubSource.ref || discovery.ref;
      githubSource.rootPaths = discovery.rootPaths;
      ws.logs.push(`Tree discovery found ${discovery.tracePaths.length} Tiinex markdown artifact file(s).`);
      if (discovery.freshnessSupplemented) {
        ws.logs.push(`Added ${discovery.freshnessSupplemented} known Tiinex schema freshness candidate(s) to avoid stale branch/CDN listings.`);
      }
      if (discovery.note) ws.logs.push(discovery.note);
      if (discovery.truncated) {
        ws.logs.push('GitHub tree response was truncated. Results may be incomplete; use a manifest for this repo.');
        toast(`Tree response for ${repo} was truncated; discovery may be incomplete.`, 'warn');
      }

      const paths = discovery.tracePaths.filter((path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        return options.refreshExisting || !Array.from(ws.files.values()).some((file) => file.rawUrl === rawUrl || file.path === path);
      });

      ws.discoveryProgress = { phase: 'fetch', loaded: 0, total: paths.length, failed: 0 };
      render();
      await progressYield(ws);

      const concurrency = Math.max(1, Number(app.settings.repoDiscoveryFetchConcurrency || 6));
      const progressEvery = Math.max(1, Number(app.settings.repoDiscoveryProgressEvery || 1));
      const renderEvery = Math.max(1, Number(app.settings.repoDiscoveryProgressiveRenderEvery || 12));
      const renderDelay = Math.max(16, Number(app.settings.repoDiscoveryBatchRenderDelayMs || 80));

      async function renderPartialFetchProgress(reason) {
        if (!ws.loading || !ws.discoveryProgress || ws.discoveryProgress.phase !== 'fetch') return;
        computeWorkspaceIndex(ws, { skipIntegrity: true });
        requestBufferedRender(reason, renderDelay);
        updateDiscoveryProgressDom(ws);
        await progressYield(ws);
      }

      await runWithConcurrency(paths, concurrency, async (path) => {
        const rawUrl = githubRawUrl(repo, discovery.ref, path);
        try {
          const content = await fetchText(rawUrl, 'GitHub raw artifact', { hardRefresh: Boolean(options.hardRefresh) });
          addFileToWorkspace(ws, {
            path,
            content,
            rawUrl,
            browseUrl: githubBrowseUrl(repo, discovery.ref, path),
            repo,
            ref: discovery.ref,
            sourceId: githubSource.id,
            sourceKind: githubSource.kind,
            sourceLabel: githubSource.label,
            sourceOrigin: githubSource.origin,
            rootPaths: githubSource.rootPaths,
            enabledSurfaces: githubSource.enabledSurfaces,
            sourceSurface: 'repoFiles'
          });
          count += 1;
          ws.discoveryProgress.loaded = count;
        } catch (error) {
          failed += 1;
          ws.discoveryProgress.failed = failed;
          ws.logs.push(`Could not fetch discovered artifact ${path}: ${error.message}`);
        }

        const completed = count + failed;
        ws.discoveryProgress.loaded = count;
        ws.discoveryProgress.failed = failed;
        ws.discoveryProgress.total = paths.length;
        updateDiscoveryProgressDom(ws);

        if (completed && (completed % renderEvery) === 0) {
          await renderPartialFetchProgress('repo-discovery-progressive-fetch');
        } else if ((completed % progressEvery) === 0) {
          await progressYield(ws);
        }
      });

      ws.discoveryProgress = Object.assign({}, ws.discoveryProgress || {}, {
        phase: 'fetch',
        loaded: count,
        failed,
        total: paths.length
      });
      await renderPartialFetchProgress('repo-discovery-fetch-complete');

      ws.discoveryProgress = Object.assign({}, ws.discoveryProgress || {}, {
        phase: 'index',
        indexLoaded: 0,
        indexTotal: ws.files?.size || count
      });
      await computeWorkspaceIndexWithDiscoveryProgress(ws);
      indexed = true;

      ws.discoveryProgress = Object.assign({}, ws.discoveryProgress || {}, { phase: 'policy' });
      updateDiscoveryProgressDom(ws);
      await progressYield(ws);
      await discoverWorkspacePolicy(ws);

      if (!count && !failed) toast(`No new Tiinex markdown artifacts loaded from ${repo}.`, 'warn');
      if (failed) toast(`${failed} Tiinex markdown artifact file(s) could not be fetched from ${repo}.`, 'warn');
    } catch (error) {
      ws.logs.push(`Repo discovery failed for ${repo}: ${error.message}`);
      toast(`Repo discovery failed for ${repo}: ${error.message}`, 'warn');
    } finally {
      app.repoDiscoveryInFlight.delete(key);
      ws.loading = false;
      ws.discoveryProgress = null;
      if (!indexed) computeWorkspaceIndex(ws);
      render();
    }
  }





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
    if (kind === 'text') return 'text';
    if (kind === 'url' || kind === 'link') return 'url';
    return kind || 'file';
  }

  function attachmentPreviewMaterialKindLabel(kind) {
    if (typeof materialKindLabel === 'function') return materialKindLabel(kind);
    const labels = { all: 'All', image: 'Images', text: 'Text', url: 'URLs', file: 'Files' };
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
    const order = ['image', 'text', 'url', 'file'];
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

  function insertPreviewMaterialAfterPostMain(html, material) {
    if (!material || !html || html.includes('preview-material-section')) return html;
    const summaryClose = /(<p class="post-summary">[\s\S]*?<\/p>\s*<\/div>)/u;
    if (!summaryClose.test(html)) return html;
    return html.replace(summaryClose, `$1${material}`);
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
    return insertPreviewMaterialAfterPostMain(html, material);
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

    return insertPreviewMaterialAfterPostMain(html, material);
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

  registerComputeWorkspaceIndexWrapper(function computeWorkspaceIndexWithDurableLens(ws, next) {
    const result = next(ws);
    const state = app.pendingDurableLensState || decodedLensState() || cachedLensState();
    const sources = state?.workspaces || state?.sources || [];
    const index = app.workspaces.indexOf(ws);
    if (index >= 0 && sources[index]) applyLensSource(ws, sources[index]);
    return result;
  });
  registerRenderWrapper(function renderWithDurableLens(next) {
    // Durable lens owns route selection/history only; scroll position is restored
    // by the stored browser scroll owner below.
    if (!app.isBootingFromUrl && !app.routing?.restoring) {
      applyCurrentOrCachedLens();
    }
    return next();
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
    app.userInteractionSerial = Number(app.userInteractionSerial || 0) + 1;
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

  function canonicalExternalTarget(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    try {
      const url = new URL(text);
      url.hash = '';
      url.search = '';
      return url.toString().replace(/\/$/, '').toLowerCase();
    } catch (_) {
      return stripUrlDecorations(text).replace(/\/$/, '').toLowerCase();
    }
  }

  function isSourceIdentityMaterialRef(node, ref) {
    if (!node || !ref) return false;
    const sourceTargets = [node.rawUrl, node.browseUrl, node.file?.rawUrl, node.file?.browseUrl]
      .map(canonicalExternalTarget)
      .filter(Boolean);
    if (!sourceTargets.length) return false;
    const refTargets = [ref.href, ref.rawUrl, ref.browseUrl, ref.sourceUrl]
      .map(canonicalExternalTarget)
      .filter(Boolean);
    if (!refTargets.length) return false;
    return refTargets.some((target) => sourceTargets.includes(target));
  }

  registerNodeMaterialRefsWrapper(function nodeMaterialRefsWithoutLineageEdges(ws, node, next) {
    return next(ws, node).filter((ref) => !isParentLikeMaterialRef(ws, node, ref) && !isStructuralMaterialRef(ref) && !isSourceIdentityMaterialRef(node, ref));
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

  function chipIsEditableSource(chip) {
    return chipIsSource(chip) && String(chip?.dataset?.action || '') === 'edit-source';
  }

  function chipPriority(chip, sourceCount) {
    const text = chipText(chip);
    const cls = String(chip?.className || '').toLowerCase();
    const joined = `${text} ${cls}`;
    if (/mismatch|missing|error|fail|danger/.test(joined)) return 0;
    if (/verified|out of date|integrity|ok/.test(joined)) return 1;
    if (/refs?|image|material|attachment|asset|pdf|zip/.test(joined)) return 2;
    if (chipIsEditableSource(chip)) return 3;
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

  function startupHashRouteModalState() {
    try {
      const state = staticDiskMode() ? decodeViewRouteFromHash() : decodeRouteStateFromHash();
      return state?.modal?.type ? state.modal : null;
    } catch (_) {
      return null;
    }
  }

  function startupHasExplicitRouteModal() {
    return Boolean(startupHashRouteModalState());
  }

  function reconcileStartupExplicitRouteModal() {
    if (app.routing?.startupRouteModalReconciled) return false;
    const routeModal = startupHashRouteModalState();
    if (!routeModal?.type || dialogRouteSessionClosed(routeModal)) return false;
    if (app.modal && app.modal.type === routeModal.type) {
      if (app.modal.type === 'artifact-wizard') app.modal.wizardStep = normalizeWizardRouteStep(routeModal.wizardStep || app.modal.wizardStep || 'type');
      app.routing.startupRouteModalReconciled = true;
      return true;
    }
    applyRouteModalState(routeModal);
    resolvePendingRouteModal();
    if (app.modal) app.routing.startupRouteModalReconciled = true;
    return Boolean(app.modal || app.pendingRouteModal);
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
    if (startupHasExplicitSharedState() && (!app.workspaces.length || startupHasExplicitRouteModal())) return false;
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


  function routeHistoryScrollStateForWorkspace(ws) {
    if (!ws) return null;
    return {
      top: Math.max(0, Math.round(Number(ws.routeScrollTop || 0))),
      mode: ws.routeScrollMode || scrollModeFromElement(ws) || 'discovery',
      selectedPath: ws.routeScrollSelectedPath || ''
    };
  }

  function routeHistoryScrollTarget(ws, state = null) {
    if (!ws) return null;
    const mode = state?.mode || ws.routeScrollMode || scrollModeFromElement(ws) || 'discovery';
    const preferredRole = mode === 'lineage' ? 'post-feed.lineage' : 'post-feed.discovery';
    return scrollElementForRole(ws, preferredRole, mode)
      || bestScrollElementForMode(ws, mode)
      || activeScrollableFeed(ws)
      || document.scrollingElement
      || document.documentElement
      || document.body;
  }

  function applyRouteHistoryScrollTop(target, top) {
    const nextTop = Math.max(0, Math.round(Number(top || 0)));
    if (!target) {
      scrollFlightRecord('routeHistoryScroll:apply-skip', { reason: 'no-target', top: nextTop });
      return false;
    }
    if (nextTop > 0) return applyScrollTopToTarget(target, nextTop);

    const before = scrollRestoreDebugTargetState(target);
    app.restoringStoredScroll = true;
    try {
      if (pageScrollTarget(target)) window.scrollTo({ top: 0, left: window.scrollX || 0, behavior: 'auto' });
      else target.scrollTop = 0;
    } finally {
      requestAnimationFrame(() => { app.restoringStoredScroll = false; });
    }
    const applied = Math.abs(scrollElementTop(target)) <= 4;
    scrollFlightRecord('routeHistoryScroll:apply-zero', {
      applied,
      before,
      afterImmediate: scrollRestoreDebugTargetState(target)
    });
    return applied;
  }

  function applyRouteHistoryScrollOnce(ws) {
    const state = routeHistoryScrollStateForWorkspace(ws);
    if (!ws || !state) return true;
    const target = routeHistoryScrollTarget(ws, state);
    const applied = applyRouteHistoryScrollTop(target, state.top);
    const holding = Math.abs(scrollElementTop(target) - state.top) <= 6;
    scrollFlightRecord('routeHistoryScroll:tick', {
      applied,
      holding,
      state,
      target: scrollRestoreDebugTargetState(target),
      workspace: scrollRestoreDebugWorkspaceState(ws)
    });
    return holding;
  }

  function scheduleRouteHistoryScrollRestore(reason = 'route-history') {
    const workspaces = (app.workspaces || []).filter(Boolean);
    if (!workspaces.length) return false;
    const token = Number(app.routeHistoryScrollToken || 0) + 1;
    app.routeHistoryScrollToken = token;
    const baselineInteraction = Number(app.userInteractionSerial || 0);
    const started = performance.now();
    const forcedByUxBack = /ux-back/.test(String(reason || ''));
    const durationMs = reason === 'startup' ? 6500 : 2800;
    scrollFlightRecord('routeHistoryScroll:schedule', {
      reason,
      durationMs,
      baselineInteraction,
      workspaces: workspaces.map((ws) => ({
        id: ws.id || '',
        label: ws.label || '',
        routeScrollTop: Number(ws.routeScrollTop || 0),
        routeScrollMode: ws.routeScrollMode || '',
        routeScrollSelectedPath: ws.routeScrollSelectedPath || ''
      }))
    });
    const tick = () => {
      if (app.routeHistoryScrollToken !== token) return;
      if (!forcedByUxBack && Number(app.userInteractionSerial || 0) !== baselineInteraction && performance.now() - started > 80) {
        scrollFlightRecord('routeHistoryScroll:cancel-user-interaction', { reason, baselineInteraction, currentInteraction: Number(app.userInteractionSerial || 0) });
        return;
      }
      let pending = false;
      for (const ws of workspaces) {
        if (!applyRouteHistoryScrollOnce(ws)) pending = true;
      }
      if (pending && performance.now() - started < durationMs) requestAnimationFrame(tick);
      else scrollFlightRecord('routeHistoryScroll:complete', { reason, pending, elapsed: Math.round(performance.now() - started) });
    };
    requestAnimationFrame(tick);
    setTimeout(tick, 80);
    setTimeout(tick, 220);
    setTimeout(tick, 650);
    setTimeout(tick, 1400);
    if (durationMs > 3000) {
      setTimeout(tick, 2800);
      setTimeout(tick, 5200);
    }
    return true;
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
        // Discovery often renders the feed shell before the posts are mounted.
        // Do not apply scroll to an empty feed or an interim page/workspace
        // target; keep the pending restore alive until the saved target role is
        // actually scrollable.
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
      // A restore can be correct for one frame and then be reset by a follow-up
      // render while Discovery/Lineage loading is still settling. A completed
      // marker is only valid while the saved target still holds the requested
      // top; otherwise resume the chase and re-apply.
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
    // The stored browser scroll is the single F5/session scroll-restore owner.
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

window.addEventListener('popstate', (event) => {
    noteRoutePopState(event.state || history.state || null);
    const uxBackRestore = Boolean(app.routing?.pendingUxBackRestore);
    app.routing.pendingUxBackRestore = false;
    if (scrollFlightRecorderEnabled()) {
      scrollFlightRecord('history:popstate', {
        historyState: scrollFlightRouteStateSummary(history.state),
        decodedRoute: scrollFlightDecodedRouteSummary(),
        snapshot: scrollFlightSnapshot('popstate-before'),
        uxBackRestore
      });
    }
    restoreRouteFromBrowserHistory();
    if (uxBackRestore) {
      setTimeout(() => scheduleRouteHistoryScrollRestore('ux-back-popstate'), 0);
      setTimeout(() => scheduleRouteHistoryScrollRestore('ux-back-popstate-late'), 120);
    }
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
    .then(() => {
      render();
      if (startupHasExplicitSharedState()) scheduleRouteHistoryScrollRestore('startup');
    })
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

  function mobileChipIsEditableSource(chip) {
    return mobileChipIsSource(chip) && String(chip?.dataset?.action || '') === 'edit-source';
  }

  function mobileChipPriority(chip, sourceCount) {
    const text = mobileChipText(chip);
    const cls = mobileChipClass(chip);
    const joined = `${text} ${cls}`;
    if (chip?.classList?.contains('mobile-card-more-chip')) return -1;
    if (/mismatch|missing|error|fail|danger/u.test(joined)) return 0;
    if (/verified|open|out of date|integrity|ok/u.test(joined)) return 1;
    if (mobileChipIsEditableSource(chip)) return 2;
    if (mobileChipIsSchema(chip)) return 3;
    if (mobileChipIsDate(chip)) return 4;
    if (/refs?|image|material|attachment|asset|pdf|zip/u.test(joined)) return 5;
    if (mobileChipIsSource(chip)) return sourceCount <= 1 ? 10 : 6;
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
