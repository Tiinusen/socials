# CP335 — mobile chrome reclaim without blank spacer

CP335 follows CP334 after field testing showed mobile chrome/header fading out but leaving a blank spacer before the first feed card.

Changes:

- Mobile reading mode now collapses transient source/mode/feed toolbar rows instead of keeping their reserved slot.
- The workspace title row remains reachable near the top, but when reading it is compact and does not preserve the old source-row spacer.
- First feed/lineage cards reclaim the released vertical space.
- Build identity updated to `CP335-mobile-chrome-reclaim`.

Validation gate:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`
