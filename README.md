# CP339 — workspace drop / content boundary semantics

CP339 fixes the drag/drop boundary for workspace entrypoint files. Workspace exports saved by browsers as names like `tiinex-viewer.workspace (4).md` are now recognized as workspace files, and markdown content with `tiinex.workspace.v1` / Workspace State is also detected even when the filename is not exact.

This preserves the CP338 Open/Merge/Duplicate model while preventing dropped `.workspace.md` exports from becoming ordinary local artifact cards.

Validation gate:

```bash
node --check app.js
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
npm run metrics
npm run storage:scan
```
