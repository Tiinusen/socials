# CP339 validation notes

Validated the CP339 workspace drop/content-boundary pass.

Root cause: drop classification trusted exact filename suffix `.workspace.md`. Browser duplicate names such as `tiinex-viewer.workspace (4).md` therefore bypassed workspace import and became local artifact cards.

Fix: workspace drop classification now accepts browser duplicate workspace filenames and also inspects markdown content for `tiinex.workspace.v1`, Workspace Entrypoints, and Workspace State before routing files to local material intake.

Passed:

```bash
node --check app.js
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
npm run metrics
npm run storage:scan
```
