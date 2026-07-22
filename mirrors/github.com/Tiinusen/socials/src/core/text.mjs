export function toText(value) {
  return value == null ? '' : String(value);
}

export function normalizeLineEndings(value) {
  return toText(value).replace(/\r\n?/g, '\n');
}

export function trimOuterBlankLines(value) {
  return normalizeLineEndings(value).replace(/^\n+|\n+$/g, '');
}

export function splitNonEmptyLines(value) {
  return trimOuterBlankLines(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function shortText(value, max) {
  const text = toText(value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
