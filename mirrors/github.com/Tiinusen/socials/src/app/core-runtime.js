(function (global) {
  'use strict';

  function toText(value) {
    return value == null ? '' : String(value);
  }

  function normalizeLineEndings(value) {
    return toText(value).replace(/\r\n?/g, '\n');
  }

  function trimOuterBlankLines(value) {
    return normalizeLineEndings(value).replace(/^\n+|\n+$/g, '');
  }

  function splitNonEmptyLines(value) {
    return trimOuterBlankLines(value)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function shortText(value, max) {
    const text = toText(value).replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }

  function fileNameFromPath(path) {
    return String(path || '').split('/').pop() || 'artifact.trace.md';
  }

  function dirname(path) {
    const clean = String(path || '').replace(/\\/g, '/');
    const i = clean.lastIndexOf('/');
    return i >= 0 ? clean.slice(0, i) : '';
  }

  function joinPath(base, rel) {
    if (!rel) return base || '';
    if (/^[a-z]+:/i.test(rel) || rel.startsWith('/')) return rel;
    const parts = [];
    const source = (base ? `${base}/` : '') + rel;
    source.replace(/\\/g, '/').split('/').forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return parts.join('/');
  }

  function relativePath(fromPath, toPath) {
    const fromDir = dirname(fromPath).split('/').filter(Boolean);
    const toParts = String(toPath || '').split('/').filter(Boolean);
    while (fromDir.length && toParts.length && fromDir[0] === toParts[0]) {
      fromDir.shift();
      toParts.shift();
    }
    const up = fromDir.map(() => '..');
    return up.concat(toParts).join('/') || fileNameFromPath(toPath);
  }

  function slugify(input) {
    return String(input || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 58);
  }

  function canonicalWorkspacePath(path) {
    const text = String(path || '').replace(/\\/g, '/').trim();
    if (!text) return '';
    if (/^[a-z]+:/i.test(text)) return text;
    return joinPath('', text.replace(/^\/+/, '').replace(/^\.\//, ''));
  }

  function normalizeAssetPath(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+/g, '/')
      .replace(/^\.\//, '');
  }

  function sourceUrlDirectory(url) {
    const text = String(url || '');
    if (!text) return '';
    const i = text.lastIndexOf('/');
    return i >= 0 ? text.slice(0, i + 1) : text;
  }

  function isFetchableHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  function parseMarkdownLink(value) {
    const text = String(value || '').trim();
    const link = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return { text: link[1].trim(), href: link[2].trim() };
    return { text, href: '' };
  }

  function stripMarkdownInline(value) {
    return String(value || '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
  }

  function stripTrailingBodySeparator(value) {
    return String(value || '')
      .replace(/\n\s*---\s*$/m, '')
      .replace(/^\s*---\s*$/gm, '')
      .trim();
  }

  function stripBodyTitle(body) {
    return String(body || '').replace(/^\s*#\s+.+(?:\n+|$)/, '').trim();
  }

  function plainBlock(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*-\s?/, '').trimEnd())
      .join('\n')
      .trim();
  }

  function extractBodySections(markdown) {
    const out = {};
    let current = '';
    for (const raw of normalizeLineEndings(markdown || '').split('\n')) {
      const match = raw.match(/^##\s+(.+)\s*$/);
      if (match) {
        current = match[1].trim();
        out[current] = '';
        continue;
      }
      if (current) out[current] += `${raw}\n`;
    }
    return out;
  }

  function sectionMap(body) {
    const text = stripBodyTitle(body);
    const headingPattern = /^##\s+(.+?)\s*$/gm;
    const matches = Array.from(text.matchAll(headingPattern));
    const map = { _intro: '' };
    if (!matches.length) {
      map._intro = text.trim();
      return map;
    }
    map._intro = text.slice(0, matches[0].index).trim();
    for (let i = 0; i < matches.length; i += 1) {
      const key = matches[i][1].trim().toLowerCase();
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
      map[key] = text.slice(start, end).trim();
    }
    return map;
  }

  function singleFieldFromBullet(block, label) {
    const pattern = new RegExp(`^\\s*-\\s*${label}\\s*:\\s*(.*)$`, 'im');
    const match = String(block || '').match(pattern);
    return match ? match[1].trim() : '';
  }

  function schemaKey(schemaId) {
    const text = String(schemaId || '').toLowerCase();
    if (text.includes('discovery.')) return 'discovery';
    if (text.includes('resource.')) return 'resource';
    if (text.includes('instrument.')) return 'instrument';
    if (text.includes('relation')) return 'relation';
    if (text.includes('privacy') || text.includes('redaction')) return 'privacy';
    if (text.includes('attestation')) return 'attestation';
    if (text.includes('external.payload')) return 'payload';
    if (text.includes('topic')) return 'topic';
    if (text.includes('task')) return 'task';
    if (text.includes('decision')) return 'decision';
    if (text.includes('evidence')) return 'evidence';
    if (text.includes('feedback')) return 'feedback';
    if (text.includes('reduction')) return 'reduction';
    if (text.includes('runtime')) return 'runtime';
    if (text.includes('signal')) return 'signal';
    if (text.includes('pointer')) return 'pointer';
    if (text.includes('lineage.upgrade')) return 'lineage-upgrade';
    if (text.includes('schema.family') || text.includes('definition')) return 'schema-governance';
    if (text.includes('validation.method')) return 'validation';
    return schemaId ? 'unknown' : 'plain';
  }

  function schemaBadgeClass(schemaId) {
    const key = schemaKey(schemaId);
    const known = [
      'topic', 'task', 'decision', 'evidence', 'feedback', 'reduction',
      'runtime', 'signal', 'pointer', 'discovery', 'resource', 'instrument',
      'relation', 'privacy', 'attestation', 'payload', 'lineage-upgrade',
      'schema-governance', 'validation'
    ];
    if (known.includes(key)) return key;
    return key === 'plain' ? 'plain' : 'unknown';
  }

  function schemaIdFromText(value, fallback = 'tiinex.topic.v1') {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const markdown = text.match(/\[([^\]]+)\]\([^)]+\)/);
    if (markdown) return markdown[1].trim() || fallback;
    return text.replace(/^Current Schema:\s*/i, '').trim() || fallback;
  }

  global.TiinexCore = Object.freeze({
    canonicalWorkspacePath,
    dirname,
    extractBodySections,
    fileNameFromPath,
    isFetchableHttpUrl,
    joinPath,
    normalizeAssetPath,
    normalizeLineEndings,
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
    splitNonEmptyLines,
    stripBodyTitle,
    stripMarkdownInline,
    stripTrailingBodySeparator,
    toText,
    trimOuterBlankLines,
  });
})(window);
