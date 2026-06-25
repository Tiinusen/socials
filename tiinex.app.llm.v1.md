# Continuity Context

- Envelope Schema: tiinex.root.v1
- Current
  - Current Schema: tiinex.topic.v1
  - Created At: 2026-06-18 00:00:00
  - Summary: LLM orientation entrypoint for the Tiinex Lineage Viewer application package.

---

# Tiinex Lineage Viewer LLM Orientation

This file orients a language model that receives a link to `https://tiinex.dev` or a local Tiinex Lineage Viewer package without prior project context.

Tiinex Lineage Viewer is a static, client-side application for working with portable markdown artifacts. Its main role is to make handoff, provenance, continuity, and lineage visible without requiring a server-side AI integration.

## Artifact scope

The application reads and works with files such as:

- `.trace.md`
- `.schema.md`
- `.workspace.md`
- `.config.md`
- related evidence, image, and local asset files

The core product idea is:

> Tiinex makes handoffs first-class objects.

## Core semantics

- `Parent` means continuity lineage.
- `Origin` means grounding or provenance source.
- A reference/destination link is not automatically a parent.
- A missing parent can be valid for a root or local starting point.
- A leaf is not permanently final; it is the current tip until a child, repair, continuation, or supersession exists.
- Integrity warnings are provenance signals, not merely generic errors.

## Current application capabilities

The app can:

- import local files, folders, and zip bundles
- load public GitHub sources selected by the human
- discover and display Tiinex artifacts
- inspect lineage relationships
- distinguish parent continuity from origin/provenance
- show schema-aware cards and badges
- show source and material context
- create local Tiinex artifacts through an Add wizard
- continue from an existing artifact
- reference an existing artifact without making it a parent
- edit local workspace markdown
- export portable workspace bundles

## Implementation baseline

The current package is a public handoff candidate with dependency-free static validation available through `node tools/validate-static.mjs`, static metrics through `node tools/collect-metrics.mjs`, and browser storage inventory through `node tools/inspect-storage.mjs`. `npm test`, `npm run metrics`, and `npm run storage:scan` are convenience aliases only; they do not imply a build step, dependencies, or a runtime requirement.

Ordinary app-level version suffixes, duplicate function declarations, package-local audit reports, embedded base64 logo data, inline data/blob logo payload support, version-stamped browser storage-key tokens, debug console/dynamic-code runtime surfaces, and unexpected single function reassignments are blocked by static validation. Packaged continuity markdown is also checked for pinned schema links and non-placeholder integrity values.

Storage keys are centralized. Local workspace drafts autosave as local deltas without duplicating remote/default source trees. Startup reconnects saved local workspace state unless an explicit shared URL state is being opened. Storage write failures report through one `console.error` diagnostic path. Scroll and view-state behavior remain an active design surface and should be verified in the browser before claiming it is settled.

The viewer brand resolves through workspace markdown (`Viewer Identity` → `Icon`) and falls back to the packaged asset in `assets/`. Do not add a second logo path, inline image payload, or data/blob URL path for brand assets.

Ordinary app identifiers, CSS classes, actions, and DOM data attributes should remain semantic. Use Git history for implementation history; do not put implementation chronology into runtime names.

The current app is a static client-side package. Prefer improvements that preserve this shape unless the human explicitly chooses a larger architecture. Use the code maps in `app.js` and `styles.css` to navigate current runtime behavior, and use `src/architecture/boundaries.mjs` for the intended module boundaries. Extracted pure helpers live in `src/core/`, storage/state helpers live in `src/services/` and `src/state/`, UI helpers live in `src/ui/`, and route/lens/scroll policy helpers live in `src/viewstate/`; browser bridges under `src/app/` let `app.js` remain a classic static script. Metrics should report `architectureReadyForProductWork: yes` before new product work relies on this architecture baseline.

## Development guidance

When changing code:

- Keep changes small, reversible, and testable.
- Preserve mobile usability.
- Do not silently collapse Parent, Origin, and Reference.
- Keep markdown as the portable output behind the UI.
- Do not add ordinary app version suffixes such as `V1234`, `v1234`, or `*-v1234`.
- Schema IDs and checksum formats are domain versions and should remain versioned.
- Do not add wrapper or override layers by default.
- Simplify the touched semantic cluster directly when the live path is understood. Keep localStorage/sessionStorage keys centralized in `STORAGE_KEYS`, and treat saved browser state as a deliberate product surface. Verify scroll and view-state behavior in the browser before changing it.
- Run `node tools/validate-static.mjs` after code or package-shape changes; `npm test` is only a convenience alias.
- Run `node tools/collect-metrics.mjs` when updating documented size/quality numbers; `npm run metrics` is only a convenience alias.
- Run `node tools/inspect-storage.mjs` before changing browser storage behavior; `npm run storage:scan` is only a convenience alias.
- Run `node --check app.js` after JavaScript changes when a minimal syntax check is enough.
- Keep `src/core/` free from DOM and browser storage access.
- Keep `src/ui/` responsible for rendering helpers and DOM-facing presentation logic, not direct browser storage access.
- Check CSS brace balance after CSS changes; the static validation tool includes this check.
- Browser-test mobile action surfaces after UI changes.

## Mobile caution

Mobile cards use two separate controls that should not be conflated:

- `.mobile-chip-more` expands hidden badges such as `+3`.
- `.mobile-card-more-chip` opens the card action sheet through the `...` button.

The card action trigger must remain visible and must not be packed or hidden as a normal badge.

## LLM entry protocol

1. Read `llms.txt`.
2. Read this file.
3. Inspect the actual app files and current user report before making claims about runtime behavior.
4. Treat this file as orientation, not proof of current runtime state.
5. Use visible UI, supplied files, Git evidence, or explicit user reports to ground claims.
6. Help the human preserve continuity rather than replacing their judgment.

## Origin

The public app origin is expected to be:

- https://tiinex.dev

The broader Tiinex docs/source lineage may live in public Git repositories or exported local workspaces. When those sources are needed, verify them explicitly instead of assuming they are current.

---

# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: self
dCbgbwXfSv_COyErT_sF5DoJMq9tJpKmgWkHaCBn8I
## Browser State

Local workspace persistence stores local/draft deltas only. Remote/default workspace content must be reloaded from its source and then merged with saved local deltas. Scroll and lens state are session-scoped. Route, lens, and scroll policy helpers now have an owned `src/viewstate/` surface; treat browser restore behavior as active until it is deliberately consolidated.

## Runtime wrapper invariant

Render wrappers are `(next, ...args)` continuations. Do not pass Promise callback values before `next`; startup/render wrappers must keep the continuation as the first argument.

- `publicBuildReady: yes` means the publish path builds a bundled public site from the modular source.

## CP91 browser scroll ownership

F5 scroll restore is owned by `tiinex.routeScroll.state.*`. The older `tiinex.scroll.anchor.*` cache is retired and pruned at startup because it used runtime workspace/source identifiers and could race routeScroll after refresh. Future scroll changes should keep one restore owner; improve routeScroll policy or move the single owner into `src/viewstate/` instead.

## CP92 scroll restore note

F5 scroll restore must remain single-owner. `routeScroll` owns browser-session scroll restore. Durable lens may preserve and apply route selection/history state, but it must not chase scroll after render. Lineage scroll identity should be guarded by selected artifact path plus node-set content, not volatile source/runtime signatures.

## CP93 scroll restore diagnostic note

CP93 is a instrumentation pass. It instruments the single-owner `routeScroll` restore path behind `sessionStorage.setItem("tiinex.debug.scrollRestore", "1")` / `?debugScroll=1`, and stores the captured startup trace in `window.__tiinexScrollRestoreDebugLog`. It should be used to determine whether restore misses are caused by candidate selection, content-signature rejection, early non-scrollable targets, completion timing, or later zero-scroll writes before making another behavioral change.

## CP94 scroll restore readiness note

CP93 diagnostics showed that Discovery restore could find the correct saved `routeScroll` candidate, but the preferred `.post-feed.discovery` target was still an empty rendered shell with `max: 0`. CP94 treats this as not-ready, keeps the restore pending for a longer content-load window, and avoids applying saved scroll to interim page/workspace fallbacks. Future scroll work should preserve this target-readiness invariant rather than adding competing restore owners.
