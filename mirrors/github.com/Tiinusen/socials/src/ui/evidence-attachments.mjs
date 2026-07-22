export function attachmentFileExtension(name) {
  const match = String(name || '').match(/\.([a-z0-9]{1,12})$/i);
  return match ? match[1].toUpperCase() : '';
}

export function humanSize(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function shortMime(type, name = '') {
  const ext = attachmentFileExtension(name);
  const t = String(type || '').toLowerCase();
  if (t.startsWith('image/')) return ext || t.replace('image/', '').toUpperCase();
  if (t.includes('html')) return 'HTML';
  if (t.includes('markdown')) return 'MD';
  if (t.includes('json')) return 'JSON';
  if (t.includes('pdf')) return 'PDF';
  if (t.includes('text')) return 'TEXT';
  return ext || 'FILE';
}

export function attachmentMetaChips(attachment) {
  const chips = [];
  if (attachment?.kind === 'file') {
    const kind = shortMime(attachment.type, attachment.name);
    if (kind) chips.push(kind);
    const size = humanSize(attachment.size);
    if (size) chips.push(size);
    if (attachment.width && attachment.height) chips.push(`${attachment.width}×${attachment.height}`);
  } else if (attachment?.kind === 'url') {
    chips.push('URL');
    try {
      if (attachment.url) chips.push(new URL(attachment.url).hostname.replace(/^www\./, ''));
    } catch (_) {}
  }
  const rep = String(attachment?.representation || '').trim();
  if (rep && !chips.map((x) => String(x).toLowerCase()).includes(rep.toLowerCase())) {
    chips.unshift(rep);
  }
  return chips;
}
