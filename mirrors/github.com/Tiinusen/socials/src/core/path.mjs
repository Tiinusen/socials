export function fileNameFromPath(path) {
  return String(path || '').split('/').pop() || 'artifact.trace.md';
}

export function dirname(path) {
  const clean = String(path || '').replace(/\\/g, '/');
  const i = clean.lastIndexOf('/');
  return i >= 0 ? clean.slice(0, i) : '';
}

export function joinPath(base, rel) {
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

export function relativePath(fromPath, toPath) {
  const fromDir = dirname(fromPath).split('/').filter(Boolean);
  const toParts = String(toPath || '').split('/').filter(Boolean);
  while (fromDir.length && toParts.length && fromDir[0] === toParts[0]) {
    fromDir.shift();
    toParts.shift();
  }
  const up = fromDir.map(() => '..');
  return up.concat(toParts).join('/') || fileNameFromPath(toPath);
}

export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58);
}

export function canonicalWorkspacePath(path) {
  const text = String(path || '').replace(/\\/g, '/').trim();
  if (!text) return '';
  if (/^[a-z]+:/i.test(text)) return text;
  return joinPath('', text.replace(/^\/+/, '').replace(/^\.\//, ''));
}

export function normalizeAssetPath(path) {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '');
}

export function sourceUrlDirectory(url) {
  const text = String(url || '');
  if (!text) return '';
  const i = text.lastIndexOf('/');
  return i >= 0 ? text.slice(0, i + 1) : text;
}

export function isFetchableHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}
