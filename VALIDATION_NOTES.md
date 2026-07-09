# CP336 validation notes

Validated the CP336 workspace export/topology pass after updating source and public build checks.

Runtime gate passed:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

Observed boundaries:

- Human-facing workspace export sections now precede technical appendices.
- Issue thread caches remain available for restore but are no longer emitted inside the primary workspace entrypoint list.
- Embedded local workspace state is available in `Workspace State.localWorkspaces` so local material can restore to its owning workspace.
- `Machine State.workspaces` is populated for all visible workspaces to make topology review possible even when no node is expanded.

Known non-gate:

- `npm run validate` remains a stricter static hygiene/checklist signal and is not the publish/runtime gate for this iteration.
