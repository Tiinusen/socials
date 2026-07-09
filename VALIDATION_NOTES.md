# CP335 validation notes

Validated after mobile chrome reclaim fix.

Expected manual result on mobile:

1. Scroll down in Feed or Lineage until chrome fades/collapses.
2. The blank source/tool spacer below the workspace title row should disappear.
3. The first visible card should move up and use the reclaimed space.
4. Return near top; controls should remain reachable without covering the first card.

Commands executed:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`
