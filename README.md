# Tiinex/site

Tiinex/site is the current static client-side viewer for Tiinex artifacts and workspaces.

Tiinex artifacts are Markdown files that keep provenance readable: where material came from, what changed, what it depends on, what limits apply, and what should not be inferred from it.

The viewer helps inspect, share, import, export, review, and continue working with those artifacts. It is one implementation of Tiinex, not the whole project.

## What This Repository Is

This repository contains the public site and reference viewer for portable Tiinex artifacts.

The app is a static frontend package. It renders artifact and workspace content in the browser, supports local continuation and review flows, and can expose source-backed links when the loaded material actually has a published source.

## What Tiinex Is

Tiinex keeps provenance readable in Markdown artifacts you own.

Provenance means the visible trail around material: where it came from, what changed, what it depends on, what limits apply, and what should not be inferred from it.

This repo is the viewer for that artifact ecosystem, not the whole definition of it.

## AI / LLM Boundary

AI and LLM workflows are important use cases and pressure tests for Tiinex.

They are not the identity boundary of Tiinex, and this site should not be described as a general-purpose AI runtime.

## Viewer Boundaries

- Local or draft material must not be guessed as GitHub source.
- Published or source-backed material may expose source links.
- Parent and Origin are separate relations and must not be collapsed.
- Workspace files are entrypoints when opened as workspaces, not ordinary leaves.
- Policy lookup should use the nearest `LINEAGE_POLICY.md` or `LINEAGE_LICENSE.md` when one is available in the loaded material.
- The app stays static and client-side; maintainer scripts are for packaging and validation, not runtime hosting logic.

## Stable Reading Order

- `tiinex.orientation.v1.md` explains Tiinex identity at the project level.
- `tiinex.context.v1.md` provides bounded self-contained context for this repo.
- `README.md` explains this repository for humans first.
- `tiinex.app.llm.v1.md` gives viewer/runtime-specific guidance.
- Git history is the implementation chronology; the orientation files above define the current repository identity.

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

Repository tooling exposes these architecture readiness markers:

- `architectureScaffoldReady`
- `coreExtractionReady`
- `serviceStateExtractionReady`
- `uiFeatureExtractionReady`
- `viewStateIsolationReady`
- `publicBuildReady`
- `cleanupReadyForProductWork`
- `architectureReadyForProductWork`

## Current Implementation Status

Use the current source, validation output, and Git history for implementation status. Git owns change chronology, so do not add separate change-log files, release notes, or versioned implementation comments merely to duplicate commit history.
