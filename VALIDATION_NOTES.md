# CP334 validation notes

Validated after mobile action density, lifecycle responsiveness, and GitHub issue-body binding updates.

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

Manual checks:

1. On a narrow/mobile viewport, feed card action buttons should keep their usable width but take less vertical height.
2. On mobile Chrome, switching tabs/apps should not pause for several seconds due to Tiinex lifecycle handlers.
3. Export a local draft with `Update known issue`, update the issue body, verify, and finish; the local draft shadow should be removed or reconciled once the issue body is bound/imported.
4. `TiinexDiagnostics.lifecycleResponsivenessReport()` should show lightweight flushes and skipped synchronous local saves after tab/app lifecycle events.
5. `TiinexDiagnostics.githubExportBindingReport()` should show issue-body bindings for known issue updates.
