# Tiinex/site Context v1

This file is the bounded LLM context for `Tiinex/site`.

## Repository Summary

`Tiinex/site` is the static client-side viewer/reference implementation for Tiinex artifacts and workspaces.
It is the public site surface and browser runtime for loading, inspecting, sharing, continuing, importing, exporting, and reviewing portable Markdown artifacts.

## Not The Whole Project

Tiinex itself is the broader continuity system for saving AI-assisted work as readable, inspectable Markdown artifacts.
This repo implements one viewer/runtime surface inside that larger system.

## Stable Authority Order

1. `tiinex.orientation.v1.md` for Tiinex identity.
2. `tiinex.context.v1.md` for bounded repo context.
3. `README.md` for the human repo entrypoint.
4. `tiinex.app.llm.v1.md` for viewer/runtime guidance.
5. `releases/CPxxx.md` only for transient implementation status.

## Runtime Boundaries

- The app is static and client-side.
- `index.html`, `app.js`, `src/`, and `styles.css` are runtime surfaces.
- `package.json` scripts are maintainer tooling for validation and public packaging.
- Do not move runtime behavior into docs-only files.

## Required Semantics

- Local and draft material must not be guessed as GitHub source.
- Published or source-backed material may expose source links.
- Parent and Origin must remain separate.
- Workspace files act as workspace entrypoints when opened as workspaces.
- Policy lookup should use the nearest `LINEAGE_POLICY.md` or `LINEAGE_LICENSE.md` when available in loaded material.

## Validation

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`