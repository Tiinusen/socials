# CP334 — mobile density, lifecycle responsiveness, and GitHub issue binding

CP334 follows CP333 after video review showed three remaining trust/UX gaps:

- mobile feed action buttons kept good width but still consumed too much vertical card space;
- mobile Chrome/tab/app switching could briefly freeze because lifecycle handlers synchronously serialized local workspace state on pagehide/beforeunload;
- Update known issue verification found the target, but local publication binding still treated non-comment issue updates like comment publication, allowing local draft shadows and imported issue bodies to coexist.

Changes:

- Mobile card action rails keep their current width distribution but reduce height, padding, radius, and icon size.
- Lifecycle leave now performs only a lightweight scroll/lens flush; durable local edits remain saved at mutation/save boundaries instead of doing a heavy synchronous localStorage serialization during app/tab switches.
- GitHub export publication binding treats `Update known issue` / existing-issue updates as issue-body bindings, not comment bindings.
- Added diagnostics: `TiinexDiagnostics.lifecycleResponsivenessReport()` and `TiinexDiagnostics.githubExportBindingReport()`.

Validation signal: `node --check app.js`, `npm run build:public`, `npm run public:check`, `node --check .site-publish/tiinex.bundle.js`, `npm run metrics`, and `npm run storage:scan`.
