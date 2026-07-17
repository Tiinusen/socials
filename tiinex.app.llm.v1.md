# Tiinex Viewer Runtime Guidance v1

This file is viewer and runtime guidance for `Tiinex/site`.

Read `tiinex.orientation.v1.md`, `tiinex.context.v1.md`, and `README.md` before using this file as the main interpretation surface.

## Runtime Role

The app is a static client-side viewer/reference implementation for Tiinex artifacts and workspaces.

It helps inspect, share, import, export, review, and continue work with portable Markdown artifacts in the browser.

It is one implementation of Tiinex, not the whole project.

## Invariants To Preserve

- Local or draft material must not be guessed as GitHub source.
- Published or source-backed material may expose source links.
- Parent and Origin must not be collapsed.
- Workspace files are entrypoints, not ordinary leaves, when opened as workspaces.
- Policy lookup should use the nearest `LINEAGE_POLICY.md` or `LINEAGE_LICENSE.md` when available.

## Runtime And Editing Guardrails

- Keep runtime behavior in `index.html`, `app.js`, `src/`, and other public assets.
- Do not move runtime behavior into docs-only files.
- `package.json` is maintainer tooling, not runtime architecture.
- Browser-local drafts remain local storage state and are not embedded into exported `.workspace.md` files unless the export path explicitly says so.
- Remote or published material should not be rewritten as local GitHub-backed authority unless the loaded source actually supports that claim.

## Workspace And Transport Ownership

Keep the app bootstrap configuration small. Runtime/vendor loading, safe transport budgets, and viewer defaults belong to the app. Portable repository knowledge belongs to `.workspace.md`.

A workspace may declare ordered, repository-scoped snapshot and Git-proxy transports. Relative transport resources resolve against the workspace artifact URL. The viewer must try only matching declarations and must not guess mirrors for unrelated repositories.
Snapshot transports precede Git-proxy transports. Order is significant within each kind. When a workspace omits a ref, a verified snapshot may declare the resolved ref and native Git should follow the remote default branch rather than inventing `master`.

For `github.com/<owner>/<repo>`, the viewer may also probe the schema-defined default GitHub Pages snapshot location after explicit snapshots and before Git. This is one metadata request at `<owner-lowercase>.github.io/<repo>/mirrors/github.com/<owner>/<repo>.json`, not directory crawling. Missing convention mirrors are quiet capability misses, not source failures. Redirects may reach configured custom domains, but viewers must not guess them.

A transport is a delivery path, not provenance. Loading `owner/repo` through a published zip, an HTTP mirror, or a Git proxy must preserve its canonical repository, resolved commit, Parent, and Origin. The transport used may be recorded separately.

Published repository snapshots must reuse the same safe zip-import core as uploaded repository zip files. Snapshot transport provides current repository material; Git transport provides richer Git capabilities when needed. Both should converge on the same workspace material model rather than duplicate discovery or indexing logic.

The repository mirror workflow is copyable infrastructure rather than a viewer-only build. It must always publish the repository that contains the workflow as a root mirror. Viewer repositories may additionally build the public app, and `.mirrors` submodules may add further repositories, but neither viewer files nor `.mirrors` are prerequisites for root publication. Ordinary submodules outside `.mirrors` are unrelated and must be ignored by mirror discovery.

Issues and Discussions remain provider-adapter surfaces. Repository snapshot and Git-proxy declarations do not proxy or replace those adapters.

Observed transport health, cooldowns, cache keys, credentials, and UI state are browser/runtime state and must not be serialized into `.workspace.md`.

Git transport health is measured only while network responses are active. Continuous healthy progress may outlive a nominal short wait, while no response, stalled bytes, or sustained very low throughput may trigger fallback. Once the response body is complete, local Git processing must not time out the proxy or place it in cooldown.

## Semantics

- Provenance means the visible trail around material: where it came from, what changed, what supports it, and what limits apply.
- Parent means continuity lineage.
- Origin means provenance or grounding.
- Reference or destination links do not become parents by default.
- Integrity warnings are provenance signals, not generic UI errors.
- Workspace entrypoints carry discovery and viewer-identity meaning that ordinary leaves do not.

## AI / LLM Boundary

AI and LLM workflows are possible use cases and pressure tests.

Do not describe the viewer as a general-purpose AI runtime unless current runtime code explicitly implements that behavior.

## Adapter Implementation Contract

Do not implement adapters by guessing parents from containers. Build adapters around explicit target descriptors and parent traversal results.

Target descriptors should separate:

- operation: create, update, or bind-existing;
- target kind: issue body, issue comment, discussion body, discussion comment, reddit post, reddit comment, etc.;
- container kind: issue thread, discussion thread, post thread, forum thread;
- publication URL and item URL.

Parent traversal should return resolved, unresolved-known, or fallback. Fallback to an external container is valid only when no explicit parent binding exists. Source/self paths must never become parent candidates.

For batch exports, build a selection graph before drafting targets. If a selected child has a selected parent, do not silently create a separate external container for the child; publish it as a nested item when the adapter supports nesting, or emit an explicit cross-publication binding.

GitHub issue imports should write new source material under `.topics/.github/.issues/...`; discussion adapters should use `.topics/.github/.discussions/...`. Keep compatibility read support for older `.topics/github-issues/...` material.

## Validation

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

## Architecture Readiness

Treat `architectureReadyForProductWork` as the aggregate readiness signal, while preserving the individual architecture diagnostics and their known limits.

## Repository material transport visibility

Repository transport is delivery state, not source identity. After repository discovery, the existing source rail shows one compact material indicator: `local Git`, `Pages mirror`, `Git proxy`, or `GitHub raw`. Warm browser-local Git reuse must be reported as local material and must not be counted as a fresh proxy success.

Use `TiinexDiagnostics.repositoryTransportDecisionReport()` to inspect the selected transport, reason, resolved commit, candidate plan, and unchanged canonical origin. Do not add a separate transport dashboard to ordinary desktop or mobile reading UX.

