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

## Validation

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`
