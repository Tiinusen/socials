(function (global) {
  'use strict';

  const core = global.TiinexCore || {};
  const shortText = core.shortText || ((value, max) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  });
  const stripMarkdownInline = core.stripMarkdownInline || ((value) => String(value || ''));

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function safeUrl(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (/^(https?:|mailto:)/i.test(s)) return s;
    if (/^[./#][^\s]*$/i.test(s)) return s;
    return '';
  }

  function attachmentFileExtension(name) {
    const match = String(name || '').match(/\.([a-z0-9]{1,12})$/i);
    return match ? match[1].toUpperCase() : '';
  }

  function humanSize(bytes) {
    const n = Number(bytes || 0);
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function shortMime(type, name = '') {
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

  function attachmentMetaChips(attachment) {
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

  function renderPreviewText(value, limit = 320) {
    const text = String(value || '').trim();
    const clipped = text.length <= limit ? text : `${text.slice(0, limit).replace(/[\s,;:]+$/g, '').trimEnd()}…`;
    return escapeHtml(stripMarkdownInline(clipped)).replace(/\n/g, '<br>');
  }

  function renderPreviewSections(sections, names) {
    const html = names
      .filter((name) => sections[name] && sections[name].trim())
      .slice(0, 4)
      .map((name) => `<section class="preview-section"><h4>${escapeHtml(name)}</h4><p>${renderPreviewText(sections[name], 320)}</p></section>`)
      .join('');
    return html || '<p class="preview-note">No prioritized continuity sections found for this schema.</p>';
  }

  global.TiinexUi = Object.freeze({
    attachmentFileExtension,
    attachmentMetaChips,
    escapeAttr,
    escapeHtml,
    humanSize,
    renderPreviewSections,
    safeUrl,
    shortMime,
  });
})(window);
