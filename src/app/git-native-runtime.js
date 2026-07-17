(function (global) {
  'use strict';

  const DEFAULT_VENDOR_URLS = Object.freeze({
    bufferModuleUrl: 'https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm',
    lightningFsScriptUrl: 'https://unpkg.com/@isomorphic-git/lightning-fs',
    gitScriptUrl: 'https://unpkg.com/isomorphic-git',
    gitHttpModuleUrl: 'https://unpkg.com/isomorphic-git/http/web/index.js',
    gitHttpUmdScriptUrl: 'https://unpkg.com/isomorphic-git/http/web/index.umd.js'
  });

  const loadedScripts = new Map();
  const importedModules = new Map();
  const runtimeCache = { value: null };


  function viewerOptions() {
    return global.TIINEX_VIEWER_OPTIONS || global.TiinexViewerOptions || {};
  }

  function gitNativeOptions(overrides = {}) {
    const base = viewerOptions().gitNative || viewerOptions().gitNativeRuntime || {};
    return Object.assign({}, base || {}, overrides || {});
  }

  function clean(value) {
    return String(value || '').trim();
  }

  function cleanDir(value) {
    const raw = clean(value || '/tiinex-git/Tiinex-docs').replace(/\\/g, '/').replace(/\/+/g, '/');
    return raw.startsWith('/') ? raw : `/${raw || 'tiinex-git'}`;
  }

  function cleanPath(value) {
    return clean(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/\/+/g, '/');
  }

  function slug(value) {
    return clean(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'source';
  }

  function runtimeIdentityKey(options = {}) {
    const opts = gitNativeOptions(options);
    const repo = clean(opts.repo || opts.remote || 'source');
    const fsName = clean(opts.fsName || 'tiinex-git-native-fs');
    const dir = cleanDir(opts.dir || `/tiinex-git/${slug(repo)}`);
    return `${fsName}::${dir}::${githubRemote(repo)}`;
  }

  function githubRemote(repo) {
    const raw = clean(repo);
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '').replace(/\.git$/i, '') + '.git';
    if (/^[^\s/]+\/[\w.-]+$/u.test(raw)) return `https://github.com/${raw}.git`;
    return raw;
  }

  function isGithubRemote(remote) {
    try { return new URL(remote).hostname.toLowerCase() === 'github.com'; } catch (_) { return /github\.com/i.test(remote); }
  }

  function loadScript(src) {
    const url = clean(src);
    if (!url) return Promise.resolve(false);
    if (loadedScripts.has(url)) return loadedScripts.get(url);
    const promise = new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts || []).find((script) => script.src === url);
      if (existing) {
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Could not load Git runtime script: ${url}`)), { once: true });
        if (existing.dataset?.tiinexLoaded === 'true') resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.tiinexGitRuntime = 'explicit';
      script.onload = () => { script.dataset.tiinexLoaded = 'true'; resolve(true); };
      script.onerror = () => reject(new Error(`Could not load Git runtime script: ${url}`));
      document.head.appendChild(script);
    });
    loadedScripts.set(url, promise);
    return promise;
  }

  async function importModule(src) {
    const url = clean(src);
    if (!url) return null;
    if (importedModules.has(url)) return importedModules.get(url);
    const promise = import(/* @vite-ignore */ url);
    importedModules.set(url, promise);
    return promise;
  }

  function bufferAvailable(value = global.Buffer) {
    return Boolean(value && typeof value.from === 'function' && typeof value.isBuffer === 'function');
  }

  function moduleBufferExport(mod) {
    if (!mod) return null;
    return mod.Buffer || mod.default?.Buffer || mod.default || null;
  }

  async function ensureBufferDependency(urls = {}) {
    if (bufferAvailable()) return { loaded: false, available: true, source: 'global' };
    if (urls.Buffer && bufferAvailable(urls.Buffer)) {
      global.Buffer = urls.Buffer;
      return { loaded: true, available: true, source: 'provided-option' };
    }
    if (urls.bufferModuleUrl) {
      const mod = await importModule(urls.bufferModuleUrl);
      const BufferCtor = moduleBufferExport(mod);
      if (!bufferAvailable(BufferCtor)) throw new Error(`Git native Buffer module did not expose a compatible Buffer export: ${urls.bufferModuleUrl}`);
      global.Buffer = BufferCtor;
      return { loaded: true, available: true, source: 'explicit-module', url: urls.bufferModuleUrl };
    }
    if (urls.bufferScriptUrl) {
      await loadScript(urls.bufferScriptUrl);
      if (bufferAvailable()) return { loaded: true, available: true, source: 'explicit-script', url: urls.bufferScriptUrl };
    }
    return { loaded: false, available: bufferAvailable(), source: '' };
  }

  async function loadConfiguredVendor(options = {}) {
    const opts = gitNativeOptions(options);
    const allowDefaults = Boolean(opts.allowDefaultVendorUrls || opts.useDefaultVendorUrls);
    const shouldLoad = Boolean(opts.loadVendor || opts.loadRuntime || opts.loadFromUnpkg || opts.bufferModuleUrl || opts.bufferScriptUrl || opts.lightningFsScriptUrl || opts.gitScriptUrl || opts.gitHttpModuleUrl || opts.gitHttpUmdScriptUrl);
    if (!shouldLoad) return { loaded: false, explicit: false, reason: 'runtime-loading-not-requested' };

    const urls = Object.assign({}, allowDefaults ? DEFAULT_VENDOR_URLS : {}, opts.vendorUrls || {}, opts || {});
    const buffer = await ensureBufferDependency(urls);
    if (urls.lightningFsScriptUrl) await loadScript(urls.lightningFsScriptUrl);
    if (urls.gitScriptUrl) await loadScript(urls.gitScriptUrl);
    if (urls.gitHttpModuleUrl) {
      const mod = await importModule(urls.gitHttpModuleUrl);
      if (mod) global.TiinexGitNativeRuntimeHttp = mod.default || mod;
    } else if (urls.gitHttpUmdScriptUrl) {
      await loadScript(urls.gitHttpUmdScriptUrl);
    }
    return { loaded: true, explicit: true, buffer, urls: { bufferModuleUrl: urls.bufferModuleUrl || '', bufferScriptUrl: urls.bufferScriptUrl || '', lightningFsScriptUrl: urls.lightningFsScriptUrl || '', gitScriptUrl: urls.gitScriptUrl || '', gitHttpModuleUrl: urls.gitHttpModuleUrl || '', gitHttpUmdScriptUrl: urls.gitHttpUmdScriptUrl || '' } };
  }

  function detectGlobals() {
    return {
      git: global.git || global.isomorphicGit || null,
      LightningFS: global.LightningFS || global.lightningFS || null,
      http: global.GitHttp || global.TiinexGitNativeRuntimeHttp || global.gitHttp || global.isomorphicGitHttp || null,
      Buffer: global.Buffer || null
    };
  }

  async function collectHttpBody(body) {
    if (!body) return undefined;
    if (body instanceof Uint8Array || body instanceof ArrayBuffer || typeof body === 'string' || body instanceof Blob) return body;
    const chunks = [];
    let total = 0;
    for await (const chunk of body) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk || []);
      chunks.push(bytes);
      total += bytes.byteLength;
    }
    if (!total) return undefined;
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  }

  function gitTransportTimingPolicy(value = {}) {
    const source = typeof value === 'number' ? { maxNetworkDurationMs: value } : (value || {});
    const maxNetworkDurationMs = Math.max(3000, Number(source.maxNetworkDurationMs || source.requestTimeoutMs || 35000));
    return Object.freeze({
      responseStartTimeoutMs: Math.max(1000, Math.min(maxNetworkDurationMs, Number(source.responseStartTimeoutMs || 6000))),
      idleTimeoutMs: Math.max(1000, Math.min(maxNetworkDurationMs, Number(source.idleTimeoutMs || 8000))),
      lowSpeedGraceMs: Math.max(2000, Math.min(maxNetworkDurationMs, Number(source.lowSpeedGraceMs || 12000))),
      minBytesPerSecond: Math.max(0, Number(source.minBytesPerSecond == null || source.minBytesPerSecond === '' ? 65536 : source.minBytesPerSecond)),
      maxNetworkDurationMs
    });
  }

  function gitTransportFailure(message, kind, detail = {}) {
    const error = new Error(message);
    error.name = 'TimeoutError';
    error.transportFailure = true;
    error.transportFailureKind = kind;
    Object.assign(error, detail || {});
    return error;
  }

  function gitTransportRateState(loaded, startedAt, now = Date.now()) {
    const durationMs = Math.max(1, Number(now || 0) - Number(startedAt || now || 0));
    const bytes = Math.max(0, Number(loaded || 0));
    return Object.freeze({ durationMs, bytesPerSecond: Math.round((bytes * 1000) / durationMs) });
  }

  function gitTransportLowSpeedState(loaded, firstByteAt, policy, now = Date.now()) {
    if (!firstByteAt) return Object.freeze({ exceeded: false, receivingMs: 0, bytesPerSecond: 0 });
    const rate = gitTransportRateState(loaded, firstByteAt, now);
    const graceMs = Math.max(0, Number(policy?.lowSpeedGraceMs || 0));
    const minimum = Math.max(0, Number(policy?.minBytesPerSecond || 0));
    return Object.freeze({
      exceeded: rate.durationMs >= graceMs && minimum > 0 && rate.bytesPerSecond < minimum,
      receivingMs: rate.durationMs,
      bytesPerSecond: rate.bytesPerSecond
    });
  }

  function timedFetchHttpClient(timing = {}, transportSignal = null, onTransportEvent = null) {
    const policy = gitTransportTimingPolicy(timing);
    let transportNetworkDeadlineAt = 0;
    const emit = (event, detail = {}) => {
      if (typeof onTransportEvent !== 'function') return;
      try { onTransportEvent(Object.assign({ event, at: Date.now() }, detail || {})); } catch (_) {}
    };
    return Object.freeze({
      async request(input = {}) {
        const controller = new AbortController();
        const externalSignals = [input.signal, transportSignal].filter(Boolean);
        let abortReason = null;
        let responseStartTimer = null;
        let idleTimer = null;
        let maxNetworkTimer = null;
        let lowSpeedMonitor = null;
        let reader = null;
        let networkStartedAt = 0;
        let responseStartedAt = 0;
        let firstByteAt = 0;
        let loaded = 0;
        let total = 0;
        const requestUrl = String(input.url || '');
        const requestMethod = String(input.method || 'GET').toUpperCase();

        const cleanup = () => {
          if (responseStartTimer) clearTimeout(responseStartTimer);
          if (idleTimer) clearTimeout(idleTimer);
          if (maxNetworkTimer) clearTimeout(maxNetworkTimer);
          if (lowSpeedMonitor) clearInterval(lowSpeedMonitor);
          responseStartTimer = null;
          idleTimer = null;
          maxNetworkTimer = null;
          lowSpeedMonitor = null;
          for (const signal of externalSignals) signal.removeEventListener?.('abort', abortFromExternal);
          try { reader?.releaseLock?.(); } catch (_) {}
        };
        const abortWith = (error) => {
          if (controller.signal.aborted) return;
          abortReason = error;
          try { controller.abort(error); } catch (_) { controller.abort(); }
          try { reader?.cancel?.(error); } catch (_) {}
        };
        const abortFromExternal = (event) => {
          const source = event?.target;
          const reason = source?.reason || new DOMException('Git transport aborted.', 'AbortError');
          abortWith(reason);
        };
        const elapsedMs = () => Math.max(0, Date.now() - networkStartedAt);
        const averageBytesPerSecond = () => gitTransportRateState(
          loaded,
          firstByteAt || responseStartedAt || networkStartedAt || Date.now()
        ).bytesPerSecond;
        const armIdleTimer = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => abortWith(gitTransportFailure(
            `Git transport stalled for ${Math.round(policy.idleTimeoutMs / 1000)} seconds.`,
            'idle-timeout',
            { loaded, total, elapsedMs: elapsedMs(), bytesPerSecond: averageBytesPerSecond() }
          )), policy.idleTimeoutMs);
        };
        const transportError = (error) => {
          if (abortReason) return abortReason;
          if (controller.signal.aborted && controller.signal.reason) return controller.signal.reason;
          if (error && typeof error === 'object') {
            error.transportFailure = true;
            error.transportFailureKind = error.transportFailureKind || 'network-error';
          }
          return error;
        };

        for (const signal of externalSignals) {
          if (signal.aborted) abortFromExternal({ target: signal });
          else signal.addEventListener?.('abort', abortFromExternal, { once: true });
        }

        try {
          const body = await collectHttpBody(input.body);
          networkStartedAt = Date.now();
          if (!transportNetworkDeadlineAt) transportNetworkDeadlineAt = networkStartedAt + policy.maxNetworkDurationMs;
          const remainingNetworkMs = Math.max(0, transportNetworkDeadlineAt - networkStartedAt);
          if (remainingNetworkMs < 1) throw gitTransportFailure(
            `Git transport exhausted the ${Math.round(policy.maxNetworkDurationMs / 1000)} second network budget.`,
            'max-network-duration',
            { loaded: 0, total: 0, elapsedMs: 0, bytesPerSecond: 0 }
          );
          const responseStartLimitMs = Math.max(1, Math.min(policy.responseStartTimeoutMs, remainingNetworkMs));
          emit('request-start', { url: requestUrl, method: requestMethod, policy, remainingNetworkMs });
          responseStartTimer = setTimeout(() => abortWith(gitTransportFailure(
            `Git transport did not respond within ${Math.round(responseStartLimitMs / 1000)} seconds.`,
            'response-start-timeout',
            { loaded: 0, total: 0, elapsedMs: elapsedMs(), bytesPerSecond: 0 }
          )), responseStartLimitMs);
          maxNetworkTimer = setTimeout(() => abortWith(gitTransportFailure(
            `Git transport exceeded the ${Math.round(policy.maxNetworkDurationMs / 1000)} second network budget.`,
            'max-network-duration',
            { loaded, total, elapsedMs: elapsedMs(), bytesPerSecond: averageBytesPerSecond() }
          )), remainingNetworkMs);

          const response = await fetch(input.url, {
            method: input.method || 'GET',
            headers: input.headers || {},
            body: ['GET', 'HEAD'].includes(requestMethod) ? undefined : body,
            signal: controller.signal,
            redirect: 'follow',
            credentials: 'omit',
            skipGitNativeRawBridge: true,
            allowRawFallback: true
          });
          if (responseStartTimer) clearTimeout(responseStartTimer);
          responseStartTimer = null;
          responseStartedAt = Date.now();
          const headers = {};
          response.headers.forEach((value, key) => { headers[key] = value; });
          reader = response.body?.getReader?.() || null;
          total = Math.max(0, Number(response.headers.get('content-length') || 0));
          emit('response-start', { url: response.url || requestUrl, method: requestMethod, statusCode: response.status, total, elapsedMs: elapsedMs() });

          async function* responseBody() {
            try {
              if (!reader) return;
              armIdleTimer();
              lowSpeedMonitor = setInterval(() => {
                if (!firstByteAt || controller.signal.aborted) return;
                const speed = gitTransportLowSpeedState(loaded, firstByteAt, policy);
                if (speed.exceeded) {
                  abortWith(gitTransportFailure(
                    `Git transport remained below ${Math.round(policy.minBytesPerSecond / 1024)} KB/s.`,
                    'low-throughput',
                    { loaded, total, elapsedMs: elapsedMs(), receivingMs: speed.receivingMs, bytesPerSecond: speed.bytesPerSecond }
                  ));
                }
              }, 500);
              while (true) {
                const next = await reader.read();
                if (next.done) {
                  if (abortReason) throw abortReason;
                  break;
                }
                if (next.value) {
                  const chunkBytes = Number(next.value.byteLength || next.value.length || 0);
                  loaded += chunkBytes;
                  const now = Date.now();
                  if (!firstByteAt) firstByteAt = now;
                  armIdleTimer();
                  const detail = {
                    phase: 'Receiving Git response',
                    loaded,
                    total,
                    chunkBytes,
                    elapsedMs: elapsedMs(),
                    bytesPerSecond: averageBytesPerSecond(),
                    url: response.url || requestUrl,
                    method: requestMethod,
                    statusCode: response.status
                  };
                  if (typeof input.onProgress === 'function') {
                    try { input.onProgress(detail); } catch (_) {}
                  }
                  emit('progress', detail);
                  yield next.value;
                }
              }
              const detail = {
                loaded,
                total,
                elapsedMs: elapsedMs(),
                bytesPerSecond: averageBytesPerSecond(),
                url: response.url || requestUrl,
                method: requestMethod,
                statusCode: response.status
              };
              emit('response-complete', detail);
            } catch (error) {
              const resolved = transportError(error);
              emit('request-failed', {
                url: response.url || requestUrl,
                method: requestMethod,
                loaded,
                total,
                elapsedMs: elapsedMs(),
                bytesPerSecond: averageBytesPerSecond(),
                reason: resolved?.message || String(resolved),
                failureKind: resolved?.transportFailureKind || ''
              });
              throw resolved;
            } finally {
              cleanup();
            }
          }

          if (!reader) {
            emit('response-complete', { url: response.url || requestUrl, method: requestMethod, statusCode: response.status, loaded: 0, total, elapsedMs: elapsedMs(), bytesPerSecond: 0 });
            cleanup();
          }
          return {
            url: response.url || input.url,
            method: input.method || 'GET',
            headers,
            body: responseBody(),
            statusCode: response.status,
            statusMessage: response.statusText
          };
        } catch (error) {
          const resolved = transportError(error);
          emit('request-failed', {
            url: requestUrl,
            method: requestMethod,
            loaded,
            total,
            elapsedMs: networkStartedAt ? elapsedMs() : 0,
            bytesPerSecond: averageBytesPerSecond(),
            reason: resolved?.message || String(resolved),
            failureKind: resolved?.transportFailureKind || ''
          });
          cleanup();
          throw resolved;
        }
      }
    });
  }

  async function removeDirRecursive(pfs, path) {
    if (!pfs || !path) return;
    let names = [];
    try { names = await pfs.readdir(path); } catch (_) { return; }
    for (const name of names) {
      const child = `${String(path).replace(/\/$/, '')}/${name}`;
      let stat = null;
      try { stat = await pfs.stat(child); } catch (_) {}
      if (stat?.isDirectory?.()) await removeDirRecursive(pfs, child);
      else {
        try { await pfs.unlink(child); } catch (_) {}
      }
    }
    try { await pfs.rmdir(path); } catch (_) {}
  }

  async function ensureDir(pfs, dir) {
    if (!pfs || typeof pfs.mkdir !== 'function') return;
    const parts = cleanDir(dir).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += `/${part}`;
      try { await pfs.mkdir(current); } catch (_) {}
    }
  }

  async function ensureRuntime(options = {}) {
    const opts = gitNativeOptions(options);
    const identityKey = runtimeIdentityKey(opts);
    if (runtimeCache.value && !opts.wipe && !opts.reloadRuntime && runtimeCache.value.identityKey === identityKey) return runtimeCache.value;

    const vendor = await loadConfiguredVendor(opts);
    const globals = detectGlobals();
    const missing = [];
    if (!globals.git) missing.push('git');
    if (!globals.LightningFS && !opts.fs) missing.push('LightningFS-or-fs');
    if (!globals.http && !opts.http) missing.push('http');
    if (!bufferAvailable(opts.Buffer || globals.Buffer)) missing.push('Buffer');
    if (missing.length) {
      const error = new Error(`Git native runtime is not available: ${missing.join(', ')}. Provide explicit runtime scripts/options first.`);
      error.missing = missing;
      error.vendor = vendor;
      throw error;
    }

    const fsName = clean(opts.fsName || 'tiinex-git-native-fs');
    const fs = opts.fs || new globals.LightningFS(fsName, { wipe: Boolean(opts.wipe) });
    const pfs = fs.promises || opts.pfs || fs;
    const dir = cleanDir(opts.dir || `/tiinex-git/${slug(opts.repo || 'source')}`);
    await ensureDir(pfs, dir);

    runtimeCache.value = Object.freeze({
      git: globals.git,
      fs,
      pfs,
      http: (opts.requestTimeoutMs || opts.maxNetworkDurationMs || opts.responseStartTimeoutMs || opts.idleTimeoutMs || opts.lowSpeedGraceMs || opts.minBytesPerSecond)
        ? timedFetchHttpClient({
          requestTimeoutMs: opts.requestTimeoutMs,
          maxNetworkDurationMs: opts.maxNetworkDurationMs,
          responseStartTimeoutMs: opts.responseStartTimeoutMs,
          idleTimeoutMs: opts.idleTimeoutMs,
          lowSpeedGraceMs: opts.lowSpeedGraceMs,
          minBytesPerSecond: opts.minBytesPerSecond
        }, opts.transportSignal || null, opts.onTransportEvent || null)
        : (opts.http || globals.http),
      Buffer: opts.Buffer || globals.Buffer || global.Buffer,
      dir,
      repo: clean(opts.repo || opts.remote || 'source'),
      remote: githubRemote(opts.remote || opts.repo || 'source'),
      identityKey,
      cache: opts.cache || {},
      corsProxy: clean(opts.corsProxy || ''),
      vendor,
      options: Object.freeze({
        fsName,
        hiddenProxy: false,
        hiddenNetwork: false,
        explicitVendorLoad: Boolean(vendor.loaded),
        explicitCorsProxy: Boolean(clean(opts.corsProxy || '')),
        cloneDepth: Math.max(1, Number(opts.cloneDepth || opts.depth || 1)),
        requestTimeoutMs: Math.max(0, Number(opts.requestTimeoutMs || 0)),
        maxNetworkDurationMs: Math.max(0, Number(opts.maxNetworkDurationMs || opts.requestTimeoutMs || 0)),
        responseStartTimeoutMs: Math.max(0, Number(opts.responseStartTimeoutMs || 0)),
        idleTimeoutMs: Math.max(0, Number(opts.idleTimeoutMs || 0)),
        lowSpeedGraceMs: Math.max(0, Number(opts.lowSpeedGraceMs || 0)),
        minBytesPerSecond: Math.max(0, Number(opts.minBytesPerSecond || 0)),
        rootPaths: normalizeRootPaths(opts.rootPaths || '.topics')
      })
    });
    return runtimeCache.value;
  }

  function normalizeRootPaths(value) {
    const list = Array.isArray(value) ? value : clean(value || '.topics').split(/[\n,]+/u);
    const roots = list.map(cleanPath).filter(Boolean);
    return roots.length ? roots : ['.topics'];
  }

  function defaultArtifactPathMatch(path) {
    const lower = cleanPath(path).toLowerCase();
    return /\.(trace|workspace|schema|validator)\.md$/u.test(lower)
      || /(^|\/)\.topics\//u.test(lower) && /\.md$/u.test(lower);
  }

  function decodeBlobText(blob) {
    if (typeof blob === 'string') return blob;
    if (blob instanceof Uint8Array) return new TextDecoder().decode(blob);
    if (Array.isArray(blob)) return new TextDecoder().decode(new Uint8Array(blob));
    if (blob && typeof blob.toString === 'function') return blob.toString('utf8');
    return String(blob || '');
  }

  function pushLabEvent(events, event) {
    if (!Array.isArray(events)) return;
    events.push(Object.assign({ at: Date.now() }, event || {}));
  }

  function resultType(value) {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    return typeof value;
  }

  async function listFilesViaWalk(runtime, ref, rootPaths, events) {
    const git = runtime.git;
    if (typeof git.walk !== 'function' || typeof git.TREE !== 'function') {
      pushLabEvent(events, { phase: 'list-files.walk.unavailable' });
      return null;
    }
    const roots = normalizeRootPaths(rootPaths);
    let files;
    try {
      pushLabEvent(events, { phase: 'list-files.walk.start', ref, roots });
      files = await git.walk({
        fs: runtime.fs,
        dir: runtime.dir,
        trees: [git.TREE({ ref })],
        map: async (filepath, entries) => {
          if (!filepath || filepath === '.') return null;
          const entry = entries && entries[0];
          const type = typeof entry?.type === 'function' ? await entry.type() : entry?.type;
          if (type && String(type).toLowerCase() !== 'blob') return null;
          const cleanFile = cleanPath(filepath);
          if (!roots.some((root) => cleanFile === root || cleanFile.startsWith(`${root}/`))) return null;
          return cleanFile;
        }
      });
    } catch (error) {
      pushLabEvent(events, { phase: 'list-files.walk.failed', error: error?.message || String(error) });
      return null;
    }
    if (!Array.isArray(files)) {
      pushLabEvent(events, { phase: 'list-files.walk.non-array', resultType: resultType(files) });
      return null;
    }
    const cleaned = files.map(cleanPath).filter(Boolean);
    pushLabEvent(events, { phase: 'list-files.walk.complete', files: cleaned.length });
    return cleaned;
  }

  async function listGitFiles(runtime, ref, rootPaths, events) {
    const roots = normalizeRootPaths(rootPaths);
    const fromWalk = await listFilesViaWalk(runtime, ref, roots, events);
    if (Array.isArray(fromWalk)) return Array.from(new Set(fromWalk)).sort((a, b) => a.localeCompare(b));
    if (typeof runtime.git.listFiles === 'function') {
      pushLabEvent(events, { phase: 'list-files.listFiles.start', ref, roots });
      let files;
      try {
        files = await runtime.git.listFiles({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
      } catch (error) {
        pushLabEvent(events, { phase: 'list-files.listFiles.failed', error: error?.message || String(error) });
        throw error;
      }
      if (!Array.isArray(files)) {
        const error = new Error(`Git runtime listFiles returned ${resultType(files)} instead of an array.`);
        error.stage = 'list-files.listFiles';
        error.resultType = resultType(files);
        pushLabEvent(events, { phase: 'list-files.listFiles.non-array', resultType: error.resultType });
        throw error;
      }
      const cleaned = files.map(cleanPath).filter((file) => roots.some((root) => file === root || file.startsWith(`${root}/`)));
      pushLabEvent(events, { phase: 'list-files.listFiles.complete', files: cleaned.length });
      return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
    }
    const error = new Error('Git runtime cannot list files; expected git.walk or git.listFiles.');
    error.stage = 'list-files';
    pushLabEvent(events, { phase: 'list-files.unavailable' });
    throw error;
  }

  async function readGitText(runtime, filepath, commit) {
    const result = await runtime.git.readBlob({ fs: runtime.fs, dir: runtime.dir, oid: commit, filepath: cleanPath(filepath), cache: runtime.cache });
    return decodeBlobText(result && result.blob);
  }

  function looksLikeCommit(value = '') {
    return /^[a-f0-9]{40}$/i.test(clean(value));
  }

  async function commitPresent(runtime, commit) {
    const oid = clean(commit);
    if (!oid || !looksLikeCommit(oid)) return false;
    if (!runtime?.git || typeof runtime.git.readCommit !== 'function') return false;
    try {
      await runtime.git.readCommit({ fs: runtime.fs, dir: runtime.dir, oid, cache: runtime.cache });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function acquireSnapshot(options = {}) {
    const opts = gitNativeOptions(options);
    const repo = clean(opts.repo || 'Tiinex/docs');
    const remote = githubRemote(opts.remote || repo);
    const requestedRef = clean(opts.ref || '');
    const ref = requestedRef || 'HEAD';
    const runtime = await ensureRuntime(Object.assign({}, opts, { repo }));
    if (isGithubRemote(remote) && !runtime.corsProxy && !opts.allowDirectGithubClone) {
      const error = new Error('GitHub browser git clone needs an explicit CORS proxy or allowDirectGithubClone=true. Tiinex will not choose a hidden proxy.');
      error.needsExplicitCorsProxy = true;
      error.remote = remote;
      throw error;
    }
    const events = [];
    const onProgress = (event) => {
      pushLabEvent(events, { phase: event?.phase || 'clone.progress', loaded: event?.loaded || 0, total: event?.total || 0 });
      if (typeof opts.onProgress === 'function') opts.onProgress(event);
    };
    const depth = Math.max(1, Number(opts.depth || opts.cloneDepth || runtime.options.cloneDepth || 1));
    const started = Date.now();
    let commit = '';
    let reusedExistingClone = false;
    let networkOperation = 'none';
    let networkOperationSucceeded = false;
    if (opts.reuseExistingClone !== false) {
      try {
        pushLabEvent(events, { phase: 'clone.reuse-check.start', ref, dir: runtime.dir });
        commit = await runtime.git.resolveRef({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
        reusedExistingClone = true;
        pushLabEvent(events, { phase: 'clone.reuse-existing', commit });
      } catch (error) {
        pushLabEvent(events, { phase: 'clone.reuse-check.miss', error: error?.message || String(error) });
      }
    }
    let refreshedExistingClone = false;
    if (commit && opts.refreshExistingClone === true) {
      try {
        networkOperation = 'fetch';
        pushLabEvent(events, { phase: 'fetch-current.start', remote, ref, depth, dir: runtime.dir });
        await runtime.git.fetch({
          fs: runtime.fs,
          http: runtime.http,
          dir: runtime.dir,
          url: remote,
          ref: requestedRef || undefined,
          singleBranch: true,
          depth,
          tags: false,
          force: true,
          corsProxy: runtime.corsProxy || undefined,
          cache: runtime.cache,
          onProgress
        });
        commit = await runtime.git.resolveRef({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
        networkOperationSucceeded = true;
        refreshedExistingClone = true;
        pushLabEvent(events, { phase: 'fetch-current.complete', commit });
      } catch (error) {
        pushLabEvent(events, { phase: 'fetch-current.failed', error: error?.message || String(error), retainedCommit: commit });
        if (opts.requireFreshSnapshot === true) throw error;
      }
    }

    if (!commit) {
      try {
        networkOperation = 'clone';
        pushLabEvent(events, { phase: 'clone.start', remote, ref, depth, dir: runtime.dir });
        await runtime.git.clone({
          fs: runtime.fs,
          http: runtime.http,
          dir: runtime.dir,
          url: remote,
          ref: requestedRef || undefined,
          singleBranch: opts.singleBranch !== false,
          depth,
          noCheckout: opts.noCheckout !== false,
          noTags: opts.noTags !== false,
          corsProxy: runtime.corsProxy || undefined,
          cache: runtime.cache,
          nonBlocking: true,
          batchSize: Math.max(1, Number(opts.batchSize || 100)),
          onProgress
        });
        networkOperationSucceeded = true;
        pushLabEvent(events, { phase: 'clone.complete' });
      } catch (error) {
        error.stage = error.stage || 'clone';
        error.progressEvents = events.slice(-40);
        if (opts.cleanupFailedClone !== false) {
          try {
            await removeDirRecursive(runtime.pfs, runtime.dir);
            await ensureDir(runtime.pfs, runtime.dir);
            pushLabEvent(events, { phase: 'clone.failed-cleanup.complete', dir: runtime.dir });
          } catch (cleanupError) {
            pushLabEvent(events, { phase: 'clone.failed-cleanup.failed', dir: runtime.dir, error: cleanupError?.message || String(cleanupError) });
          }
        }
        throw error;
      }
      try {
        pushLabEvent(events, { phase: 'resolve-ref.start', ref });
        commit = await runtime.git.resolveRef({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
        pushLabEvent(events, { phase: 'resolve-ref.complete', commit });
      } catch (error) {
        error.stage = error.stage || 'resolve-ref';
        error.progressEvents = events.slice(-40);
        throw error;
      }
    }
    let resolvedRef = requestedRef;
    if (!resolvedRef && typeof runtime.git.currentBranch === 'function') {
      try { resolvedRef = clean(await runtime.git.currentBranch({ fs: runtime.fs, dir: runtime.dir, fullname: false })); } catch (_) {}
    }
    if (!resolvedRef) resolvedRef = 'HEAD';
    const rootPaths = normalizeRootPaths(opts.rootPaths || runtime.options.rootPaths || '.topics');
    let files = [];
    try {
      files = await listGitFiles(runtime, commit, rootPaths, events);
    } catch (error) {
      error.stage = error.stage || 'list-files';
      error.progressEvents = events.slice(-40);
      throw error;
    }
    const candidates = files.filter(defaultArtifactPathMatch);
    return Object.freeze({
      ok: true,
      repo,
      remote,
      ref: resolvedRef,
      commit,
      dir: runtime.dir,
      depth,
      rootPaths,
      files,
      candidates,
      fileCount: files.length,
      candidateFiles: candidates.length,
      elapsedMs: Date.now() - started,
      progressEvents: events.slice(-40),
      reusedExistingClone,
      refreshedExistingClone,
      networkOperation,
      networkOperationSucceeded,
      sourceState: 'git-native-local-object-store',
      hiddenProxy: false,
      corsProxyConfigured: Boolean(runtime.corsProxy)
    });
  }

  async function runCloneLab(options = {}) {
    const opts = gitNativeOptions(options);
    const repo = clean(opts.repo || 'Tiinex/docs');
    const remote = githubRemote(opts.remote || repo);
    const requestedRef = clean(opts.ref || '');
    const ref = requestedRef || 'HEAD';
    const runtime = await ensureRuntime(Object.assign({}, opts, { repo }));
    if (isGithubRemote(remote) && !runtime.corsProxy && !opts.allowDirectGithubClone) {
      const error = new Error('GitHub browser git clone needs an explicit CORS proxy or allowDirectGithubClone=true. Tiinex will not choose a hidden proxy.');
      error.needsExplicitCorsProxy = true;
      error.remote = remote;
      throw error;
    }
    const events = [];
    const onProgress = (event) => {
      pushLabEvent(events, { phase: event?.phase || 'clone.progress', loaded: event?.loaded || 0, total: event?.total || 0 });
      if (typeof opts.onProgress === 'function') opts.onProgress(event);
    };
    const depth = Math.max(1, Number(opts.depth || opts.cloneDepth || runtime.options.cloneDepth || 1));
    const started = Date.now();
    let commit = '';
    if (opts.reuseExistingClone !== false) {
      try {
        pushLabEvent(events, { phase: 'clone.reuse-check.start', ref, dir: runtime.dir });
        commit = await runtime.git.resolveRef({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
        pushLabEvent(events, { phase: 'clone.reuse-existing', commit });
      } catch (error) {
        pushLabEvent(events, { phase: 'clone.reuse-check.miss', error: error?.message || String(error) });
      }
    }
    if (!commit) {
      try {
        pushLabEvent(events, { phase: 'clone.start', remote, ref, depth, dir: runtime.dir });
        await runtime.git.clone({
          fs: runtime.fs,
          http: runtime.http,
          dir: runtime.dir,
          url: remote,
          ref: requestedRef || undefined,
          singleBranch: opts.singleBranch !== false,
          depth,
          noCheckout: opts.noCheckout !== false,
          noTags: opts.noTags !== false,
          corsProxy: runtime.corsProxy || undefined,
          cache: runtime.cache,
          nonBlocking: true,
          batchSize: Math.max(1, Number(opts.batchSize || 100)),
          onProgress
        });
        pushLabEvent(events, { phase: 'clone.complete' });
      } catch (error) {
        error.stage = error.stage || 'clone';
        error.progressEvents = events.slice(-40);
        if (opts.cleanupFailedClone !== false) {
          try {
            await removeDirRecursive(runtime.pfs, runtime.dir);
            await ensureDir(runtime.pfs, runtime.dir);
            pushLabEvent(events, { phase: 'clone.failed-cleanup.complete', dir: runtime.dir });
          } catch (cleanupError) {
            pushLabEvent(events, { phase: 'clone.failed-cleanup.failed', dir: runtime.dir, error: cleanupError?.message || String(cleanupError) });
          }
        }
        throw error;
      }
      try {
        pushLabEvent(events, { phase: 'resolve-ref.start', ref });
        commit = await runtime.git.resolveRef({ fs: runtime.fs, dir: runtime.dir, ref, cache: runtime.cache });
        pushLabEvent(events, { phase: 'resolve-ref.complete', commit });
      } catch (error) {
        error.stage = error.stage || 'resolve-ref';
        error.progressEvents = events.slice(-40);
        throw error;
      }
    }
    let resolvedRef = requestedRef;
    if (!resolvedRef && typeof runtime.git.currentBranch === 'function') {
      try { resolvedRef = clean(await runtime.git.currentBranch({ fs: runtime.fs, dir: runtime.dir, fullname: false })); } catch (_) {}
    }
    if (!resolvedRef) resolvedRef = 'HEAD';
    const rootPaths = normalizeRootPaths(opts.rootPaths || runtime.options.rootPaths || '.topics');
    let files = [];
    try {
      files = await listGitFiles(runtime, commit, rootPaths, events);
    } catch (error) {
      error.stage = error.stage || 'list-files';
      error.progressEvents = events.slice(-40);
      throw error;
    }
    const candidates = files.filter(defaultArtifactPathMatch);
    const sample = [];
    for (const path of candidates.slice(0, Math.max(0, Number(opts.sampleReads || 3)))) {
      try {
        const text = await readGitText(runtime, path, commit);
        sample.push({ path, bytes: new TextEncoder().encode(text).length, title: (text.match(/^#\s+(.+)$/m) || [])[1] || '' });
      } catch (error) {
        sample.push({ path, error: error.message || String(error) });
      }
    }
    return Object.freeze({
      ok: true,
      repo,
      remote,
      ref: resolvedRef,
      commit,
      dir: runtime.dir,
      depth,
      rootPaths,
      fileCount: files.length,
      candidateFiles: candidates.length,
      sample,
      elapsedMs: Date.now() - started,
      progressEvents: events.slice(-40),
      sourceState: 'git-native-local-object-store',
      hiddenProxy: false,
      corsProxyConfigured: Boolean(runtime.corsProxy)
    });
  }

  function cloneLabErrorReport(error, options = {}) {
    const message = error && error.message ? error.message : String(error || 'Unknown Git native clone lab error');
    return Object.freeze({
      ok: false,
      error: message,
      name: error?.name || 'Error',
      missing: Array.isArray(error?.missing) ? error.missing.slice() : undefined,
      missingBufferDependency: /Missing Buffer dependency|\bBuffer\b/i.test(message),
      needsExplicitCorsProxy: Boolean(error?.needsExplicitCorsProxy),
      stage: error?.stage || '',
      resultType: error?.resultType || '',
      progressEvents: Array.isArray(error?.progressEvents) ? error.progressEvents.slice(-40) : [],
      repo: clean(options.repo || 'Tiinex/docs'),
      ref: clean(options.ref || 'HEAD'),
      sourceState: 'git-native-lab-failed-before-source-snapshot',
      hiddenProxy: false,
      hiddenVendorLoad: false,
      guidance: /Missing Buffer dependency|\bBuffer\b/i.test(message)
        ? 'Load the Buffer dependency explicitly, or use allowDefaultVendorUrls/loadFromUnpkg when Buffer is loaded before isomorphic-git.'
        : 'Inspect the error, runtime status, and explicit CORS proxy settings before switching discovery to Git-native.'
    });
  }

  async function cloneLab(options = {}) {
    const opts = gitNativeOptions(options);
    try {
      return await runCloneLab(opts);
    } catch (error) {
      if (opts.throwOnError) throw error;
      return cloneLabErrorReport(error, opts);
    }
  }

  async function status(options = {}) {
    const opts = gitNativeOptions(options);
    const globals = detectGlobals();
    const runtimeAvailable = Boolean(globals.git && (globals.LightningFS || opts.fs) && (globals.http || opts.http) && bufferAvailable(opts.Buffer || globals.Buffer));
    const cachedCorsProxy = Boolean(runtimeCache.value?.corsProxy);
    return Object.freeze({
      id: 'tiinex.browser-git-native-runtime.v1',
      runtimeAvailable,
      globals: Object.freeze({ git: Boolean(globals.git), LightningFS: Boolean(globals.LightningFS), GitHttp: Boolean(globals.http), Buffer: bufferAvailable(opts.Buffer || globals.Buffer) }),
      canLoadExplicitVendor: Boolean(opts.loadVendor || opts.loadRuntime || opts.loadFromUnpkg || opts.bufferModuleUrl || opts.bufferScriptUrl || opts.lightningFsScriptUrl || opts.gitScriptUrl || opts.gitHttpModuleUrl || opts.gitHttpUmdScriptUrl),
      hiddenVendorLoad: false,
      hiddenProxy: false,
      corsProxyConfigured: Boolean(clean(opts.corsProxy || '')) || cachedCorsProxy,
      cachedRuntime: Boolean(runtimeCache.value),
      cachedRepo: runtimeCache.value?.repo || '',
      cachedDir: runtimeCache.value?.dir || '',
      primaryReadPath: 'git-native-local-object-store',
      exactHistoricalObjectsAvailableWhenLocal: runtimeAvailable
    });
  }

  global.TiinexGitNativeRuntime = Object.freeze({
    DEFAULT_VENDOR_URLS,
    status,
    ensureRuntime,
    acquireSnapshot,
    cloneLab,
    listGitFiles,
    readGitText,
    commitPresent,
    defaultArtifactPathMatch
  });
})(window);
