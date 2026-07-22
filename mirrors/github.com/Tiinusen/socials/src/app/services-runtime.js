(function (global) {
  'use strict';

  function readJson(storage, key, fallback = null) {
    try {
      const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : '';
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    const json = JSON.stringify(value);
    storage.setItem(key, json);
    return json;
  }

  function textByteLength(value) {
    try {
      return new TextEncoder().encode(String(value || '')).length;
    } catch (_) {
      return String(value || '').length;
    }
  }

  function storageKeys(storage) {
    try {
      return Object.keys(storage || {});
    } catch (_) {
      return [];
    }
  }

  function removeKeysWithPrefix(storage, prefix, keepKey = '') {
    const removed = [];
    for (const key of storageKeys(storage)) {
      if (!String(key).startsWith(prefix) || key === keepKey) continue;
      storage.removeItem(key);
      removed.push(key);
    }
    return removed;
  }

  global.TiinexServicesStorage = Object.freeze({
    readJson,
    removeKeysWithPrefix,
    storageKeys,
    textByteLength,
    writeJson,
  });
})(window);
