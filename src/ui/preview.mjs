import { shortText } from '../core/text.mjs';
import { stripMarkdownInline } from '../core/markdown.mjs';
import { escapeHtml } from './html.mjs';

export function renderPreviewSections(sections, names) {
  const html = names
    .filter((name) => sections[name] && sections[name].trim())
    .slice(0, 4)
    .map((name) => {
      const text = String(sections[name] || '').trim();
      const clipped = text.length <= 320 ? text : `${text.slice(0, 320).replace(/[\s,;:]+$/g, '').trimEnd()}…`;
      return `<section class="preview-section"><h4>${escapeHtml(name)}</h4><p>${escapeHtml(stripMarkdownInline(clipped)).replace(/\n/g, '<br>')}</p></section>`;
    })
    .join('');
  return html || '<p class="preview-note">No prioritized continuity sections found for this schema.</p>';
}
