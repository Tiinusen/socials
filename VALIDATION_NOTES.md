# CP342 validation notes

Validated the CP342 workspace drop routing and workspace-share boundary pass.

Commands:

```bash
node --check app.js
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
npm run metrics
npm run storage:scan
```
