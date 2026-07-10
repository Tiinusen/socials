# Tiinex/site

Tiinex/site is a static client-side viewer for Tiinex artifacts and workspaces. Tiinex artifacts are readable Markdown files that preserve context, origin, parent links, transitions, and enough information for humans or AI tools to continue work later. The viewer helps inspect, share, continue, import, export, and review those artifacts. It is one implementation of Tiinex, not the whole project.

## What This Repository Is

This repository contains the public site and reference viewer for portable Tiinex artifacts.

The app is a static frontend package. It renders artifact and workspace content in the browser, supports local continuation and review flows, and can expose source-backed links when the loaded material actually has a published source.

## What Tiinex Is

Tiinex is the broader continuity system for saving AI-assisted work as readable, inspectable Markdown artifacts.

Those artifacts preserve enough surrounding structure to continue work later without pretending that a single note, screenshot, or generated answer was the whole story. The broader system includes artifact conventions, lineage semantics, policy lookup, continuity metadata, and multiple tools or implementations that can read or produce compatible material.

This repo is the viewer for that ecosystem, not the whole definition of it.

## Viewer Boundaries

- Local or draft material must not be guessed as GitHub source.
- Published or source-backed material may expose source links.
- Parent and Origin are separate relations and must not be collapsed.
- Workspace files are entrypoints when opened as workspaces, not ordinary leaves.
- Policy lookup should use the nearest `LINEAGE_POLICY.md` or `LINEAGE_LICENSE.md` when one is available in the loaded material.
- The app stays static and client-side; maintainer scripts are for packaging and validation, not runtime hosting logic.

## Stable Reading Order

- `tiinex.orientation.v1.md` explains Tiinex identity at the project level.
- `tiinex.context.v1.md` provides bounded self-contained LLM context for this repo.
- `README.md` explains this repository for humans first.
- `tiinex.app.llm.v1.md` gives viewer/runtime-specific guidance.
- `releases/CP345.md` and other files in `releases/` are transient implementation notes, not the repo identity surface.

## Public Surface

- `index.html` is the first-contact page for the public viewer.
- `app.js` and `src/` hold the client runtime.
- `styles.css` carries the site styling.
- `samples/` and `.topics/` provide portable artifacts and workspace material for testing and discovery.

## Development And Validation

Keep runtime behavior in the app code and public assets. Do not move behavior into docs-only files.

Validation commands for this repo:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

## Current Implementation Status

Current CP-specific implementation notes live under `releases/`.
Read those files only when you need time-bound release or validation status.
