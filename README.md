# Tiinex Lineage Viewer

Tiinex Lineage Viewer is a static, client-side viewer for portable Tiinex markdown artifacts. It makes continuity, provenance, handoff, source material, and lineage visible without requiring a server, database, or AI runtime.

## What it works with

The viewer is centered on portable markdown and local asset files, especially:

- `.trace.md`
- `.schema.md`
- `.workspace.md`
- `.config.md`
- evidence, image, and supporting asset files

## Core semantics

Tiinex keeps these concepts separate:

- **Parent** means continuity lineage.
- **Origin** means grounding or provenance.
- **Reference** means a linked or cited artifact; it is not automatically a parent.
- **Integrity** is surfaced as provenance context, not hidden as a generic error.

These distinctions are product behavior, not UI wording. Do not collapse them during maintenance changes.

## Main capabilities

The viewer can:

- open local files, folders, and zip bundles
- open public GitHub sources selected by the human
- discover Tiinex artifacts in a workspace
- switch between discovery and lineage views
- inspect source, schema, material, and integrity context
- create local artifacts through schema-aware flows
- continue from an existing artifact
- reference an artifact without making it the parent
- edit local workspace markdown
- export a portable workspace bundle

## Package shape

The package is intentionally simple and can be hosted as static files:

```txt
index.html
app.js
styles.css
assets/
samples/
.topics/
tools/validate-static.mjs
tools/collect-metrics.mjs
tools/inspect-storage.mjs
package.json
.editorconfig
.gitignore
README.md
llms.txt
tiinex.app.llm.v1.md
VALIDATION_NOTES.md
```

No build step is required for ordinary local use. `package.json` is included only as a maintainer convenience for dependency-free validation and metrics commands; it is not required to run or host the app. The app remains a static frontend package.

## Local use

Open `index.html` in a browser.

For more realistic browser behavior, serve the folder through a local static server. Some browser origin/storage warnings are expected when running directly from `file://`.

## Static validation

Run the packaged static validation tool from the package root:

```bash
node tools/validate-static.mjs
# optional convenience alias
npm test
```

The tool checks JavaScript syntax, tool syntax, CSS brace balance, root package shape, root markdown shape, duplicate function declarations, ordinary app-level version-stamped identifiers/classes, debug console and dynamic-code surfaces, public-facing scaffold wording, wrapper naming hygiene, known single function reassignment inventory, pinned schema links in packaged continuity markdown, non-placeholder integrity values, and default workspace mirror consistency.

To inspect current static size and cleanup metrics:

```bash
node tools/collect-metrics.mjs
# optional convenience alias
npm run metrics
```

To inventory browser storage usage without changing runtime state:

```bash
node tools/inspect-storage.mjs
# optional convenience alias
npm run storage:scan
```

Browser storage keys are centralized in `STORAGE_KEYS` inside `app.js`; do not add ad hoc `localStorage` or `sessionStorage` key strings outside that map.

## Code-quality baseline

This package is maintained as a public handoff candidate:

- ordinary app code uses semantic names rather than version-stamped helper names
- ordinary app CSS classes, actions, and DOM data attributes are version-clean
- duplicate function declarations are blocked by static validation
- known remaining ordinary function reassignments are limited to the parked scroll/viewState surface and checked so new hidden reassignment paths cannot appear silently
- metrics report `cleanupReadyForProductWork: yes` when non-scroll/viewState ordinary reassignment debt is clear
- package-local audit reports are not shipped
- packaged continuity markdown uses pinned schema links and non-placeholder integrity values
- the embedded default workspace mirrors the packaged workspace markdown
- the Tiinex logo resolves through the viewer workspace `Icon` field or the packaged `assets/` default
- app history belongs in Git, not in runtime symbol names
- browser storage key names are centralized and semantic
- local workspace drafts autosave as local deltas into named browser storage
- saved local workspace state reconnects on startup unless an explicit shared URL state is being opened
- storage write failures report through one console error path instead of looping silently

## Code navigation

`app.js` and `styles.css` are still single-file runtime surfaces for the static package. Both files include semantic section dividers. Use those comments as navigation aids; do not treat them as permission to add another override layer.

A module split should be treated as a separate architecture step after the active call paths are mapped and covered by stronger validation.

## Development rules

- Keep app-code names semantic.
- Do not add ordinary app identifiers such as `someHelperV1234` or CSS classes like `button-v1234`.
- Schema IDs and checksum format versions, such as `tiinex.root.v1` and `sha256-base64url-c14n-v1`, are domain versions and should remain versioned.
- Do not collapse Parent, Origin, and Reference semantics.
- Do not add wrapper or override chains as a maintenance strategy.
- Prefer small, reversible changes with browser validation.
- Run `node tools/validate-static.mjs` or `npm test` after code or package-shape changes.
- Run `npm run metrics` when checking size and quality numbers.
- Run `npm run storage:scan` before changing browser storage behavior.
- Run `node --check app.js` after JavaScript changes when you want the smallest possible syntax check.
- Check CSS brace balance after CSS changes; the static validation tool includes this check.

## Browser validation checklist

After app-code changes, test at least:

- desktop startup
- desktop Discovery and Lineage headers
- Open / Markdown / Source
- Continue
- Reference parent selection flow
- mobile Discovery
- mobile Lineage
- mobile `...` action sheet
- mobile `+N` hidden-badge expansion when present
- mobile FAB Create
- export if the change touches source, archive, workspace state, or storage behavior

## Current readiness status

The package is clean enough to continue product development with less risk of old code paths winning over current behavior. Remaining improvement surfaces are structural or state-design oriented rather than blocker cleanup:

- `app.js` is still a large monolith and could later be split into modules.
- `styles.css` is version-clean but could later be grouped into smaller files.
- Only five ordinary runtime hook assignments remain outside canonical wrapper registration; all five are parked scroll/viewState hooks.
- Metrics report `cleanupReadyForProductWork: yes` for the current package state.
- Scroll and view-state behavior still need a deliberate design pass before being treated as settled.

## Browser state notes

Tiinex stores only lightweight browser state. Local/draft workspace edits are saved as local deltas in `localStorage`. Scroll and lens state are session-scoped and should stay compact, content-aware, and safe to clear.
