import { normalizeLineEndings } from './text.mjs';

export function parseMarkdownLink(value) {
  const text = String(value || '').trim();
  const link = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (link) return { text: link[1].trim(), href: link[2].trim() };
  return { text, href: '' };
}

export function stripMarkdownInline(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function stripTrailingBodySeparator(value) {
  return String(value || '')
    .replace(/\n\s*---\s*$/m, '')
    .replace(/^\s*---\s*$/gm, '')
    .trim();
}

export function stripBodyTitle(body) {
  return String(body || '').replace(/^\s*#\s+.+(?:\n+|$)/, '').trim();
}

export function plainBlock(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

export function extractBodySections(markdown) {
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

export function sectionMap(body) {
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

export function singleFieldFromBullet(block, label) {
  const pattern = new RegExp(`^\\s*-\\s*${label}\\s*:\\s*(.*)$`, 'im');
  const match = String(block || '').match(pattern);
  return match ? match[1].trim() : '';
}
