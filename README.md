# CP336 — human-first workspace topology export

CP336 makes Save workspace produce a human-first `.workspace.md` while keeping machine restore state and source caches available in a technical appendix.

Changes:

- Workspace exports now summarize what the file opens before technical caches.
- GitHub issue-thread caches move out of `Workspace Entrypoints` into `Source Caches` after the human-facing sections.
- `Workspace State` is exported explicitly and can carry local browser material for restore.
- Local workspace material is restored to its owning workspace by label/topology instead of being silently absorbed into whichever GitHub workspace is active.
- `Machine State` now lists all visible workspaces, not only workspaces with expanded/selected details.
- Added `TiinexDiagnostics.workspaceExportTopologyReport()` to verify source/local topology before Move/Rewire work.
- Build identity updated to `CP336-human-first-workspace-topology`.

Validation:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`
