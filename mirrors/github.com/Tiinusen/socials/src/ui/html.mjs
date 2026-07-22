export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

export function safeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:)/i.test(s)) return s;
  if (/^[./#][^\s]*$/i.test(s)) return s;
  return '';
}
