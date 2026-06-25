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
src/
  architecture/
  app/
  core/
  state/
  services/
  ui/
  viewstate/
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

The tool checks JavaScript syntax, tool and source-module syntax, CSS brace balance, root package shape, root markdown shape, architecture boundaries, duplicate function declarations, ordinary app-level version-stamped identifiers/classes, debug console and dynamic-code surfaces, public-facing scaffold wording, wrapper naming hygiene, known single function reassignment inventory, pinned schema links in packaged continuity markdown, non-placeholder integrity values, and default workspace mirror consistency.

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

`app.js` and `styles.css` are still the runtime surfaces for the static package. Both files include semantic section dividers. Use those comments as navigation aids; do not treat them as permission to add another override layer.

`src/` now defines the intended architecture boundary map. Pure core helpers live in `src/core/` and are exposed to the classic browser app through `src/app/core-runtime.js`. Storage and local workspace state helpers live in `src/services/` and `src/state/` with classic browser bridges under `src/app/`. UI helpers live in `src/ui/` and are exposed through `src/app/ui-runtime.js`. Route, lens, and scroll policy helpers live in `src/viewstate/` and are exposed through `src/app/viewstate-runtime.js`. Further extraction can continue layer by layer while preserving browser behavior and file-open static usage.

Architecture layer intent:

- `src/architecture/` owns module boundary contracts.
- `src/app/` is reserved for bootstrap and orchestration.
- `src/core/` is for pure domain and markdown logic.
- `src/state/` is for application state and store coordination.
- `src/services/` is for browser adapters, source loading, archive, and export services.
- `src/ui/` is for feature rendering and DOM event binding.
- `src/viewstate/` is for route, lens, and scroll ownership.

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
Run `npm run build:public` to create the public `.site-publish/` bundle.
Run `npm run public:check` to verify the public bundle without leaving generated files behind.
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

- `app.js` is still a large monolith; `src/` now holds the validated module boundary map for continued extraction.
- `styles.css` is version-clean but could later be grouped into smaller files.
- Only five ordinary runtime hook assignments remain outside canonical wrapper registration; all five are parked scroll/viewState hooks.
- Metrics report `cleanupReadyForProductWork: yes` for the current package state.
- Metrics report `architectureScaffoldReady: yes` when the architecture boundary manifest is active.
- Metrics report `coreExtractionReady: yes` when pure core helpers are sourced from `src/core/` through the classic browser core runtime.
- Metrics report `serviceStateExtractionReady: yes` when the storage/local workspace state service slice is sourced through validated `src/` modules and classic browser bridges.
- Metrics report `uiFeatureExtractionReady: yes` when the first UI helper slice is sourced through validated `src/ui/` modules and a classic browser bridge.
- Metrics report `viewStateIsolationReady: yes` when route, lens, and scroll policy helpers are sourced through validated `src/viewstate/` modules and a classic browser bridge.
- Metrics report `publicBuildReady: yes` when the public publish build produces a bundled site and the workflow publishes build output instead of the raw source tree.
- Metrics report `architectureReadyForProductWork: yes` when the module boundary, core, services/state, UI, viewstate, public build, public hygiene, and cleanup readiness signals are all green.
- Scroll and view-state behavior now has an owned module surface, and F5 restore is stabilized for ordinary Discovery, Lineage, and More-expanded Discovery browser flows.

## Browser state notes

Tiinex stores only lightweight browser state. Local/draft workspace edits are saved as local deltas in `localStorage`. Scroll and lens state are session-scoped and should stay compact, content-aware, and safe to clear.

## CP91 scroll restore owner repair

CP91 consolidates F5 scroll restore ownership back to the stored `routeScroll` cache. The older `tiinex.scroll.anchor.*` cache is retired at startup and no longer registers scroll listeners, lifecycle writers, intervals, or render restore wrappers. This avoids two independent systems racing to restore Discovery/Lineage after refresh.

Stored scroll reads now skip zero-position entries and continue to scan for the latest nonzero identity match. Lifecycle flushes write only the rendered active mode, and inactive workspace-shell zero writes are rejected so a Lineage pagehide cannot overwrite the last real Discovery feed scroll. Mode detection prefers the visible rendered feed before falling back to selected-node state.

## CP92 scroll restore arbitration repair

CP92 keeps `tiinex.routeScroll.state.*` as the only F5 scroll restore owner and retires the remaining durable-lens scroll chase. Durable lens still owns route selection/history semantics, but it no longer schedules `chaseAllScroll` after render. This prevents stale lens scroll fields from racing the stored routeScroll cache and pulling Lineage to an old bottom position or Discovery back to top.

CP92 also makes Lineage stored-scroll content signatures stable across refresh by using the selected artifact path plus the rendered node set as the restore guard. Source/runtime signatures remain useful as direct-key material, but they are too volatile to decide whether a Lineage F5 restore is still valid.

## CP93 scroll restore diagnostics

CP93 adds gated scroll restore instrumentation. It does not change scroll restore behavior. When `sessionStorage.setItem("tiinex.debug.scrollRestore", "1")` is set before reload, routeScroll emits gated startup diagnostics for stored-scroll reads, fallback scans, candidate choice, target readiness, apply attempts, completion, deadline, and zero-write capture skips. The same data is retained in `window.__tiinexScrollRestoreDebugLog` for copy/paste after refresh.

## CP94 scroll restore content-readiness repair

CP94 keeps `routeScroll` as the single F5 scroll restore owner, but changes restore completion timing from a fixed early startup attempt to a content-readiness gate. A saved Discovery or Lineage scroll is not applied to an empty feed shell or interim page/workspace target. The pending restore remains alive until the saved target role is present and scrollable, or until the user interacts/cancels the restore window. This targets the CP93 observed restore trace where a saved Discovery top of 4000 was found, but `.post-feed.discovery` still had `max: 0` when restore attempted to apply it.

## CP95 scroll flight recorder

CP95 is diagnostic-only. It does not change scroll restore ownership or restore policy. When enabled with `sessionStorage.setItem('tiinex.debug.scrollRestore', '1')` or `?debugScroll=1`, it records a structured scroll flight log at `window.__tiinexScrollFlight`.

The flight recorder captures per-workspace scroll state rather than treating the page as one global scroll. Each workspace snapshot includes Discovery feed, Lineage feed, workspace shell, route scroll fields, rendered card count, loading state, visible More/load-more affordances, first visible anchor, decoded URL state, and lens cache state.

For low-noise debugging, CP95 stores most events in memory and only logs key DOM set-scroll attempts to the console unless `sessionStorage.setItem('tiinex.debug.scrollConsole', '1')` or `?debugScrollConsole=1` is used.

## CP96 scroll restore stable-completion notes

- Targeted scroll restore repair based on CP95 flight-recorder logs.
- Restore completion is now stable: a scroll target must keep the saved top briefly before the restore is considered complete.
- If a follow-up render resets the target, restore completion is invalidated and the chase resumes.


## CP97 More-aware Discovery restore

CP97 extends the stable CP96 restore path for Discovery positions that were saved after the user expanded the feed with Show more. When the saved Discovery top is beyond the currently rendered window, restore increases the same workspace's Discovery window in normal grow-count steps, re-renders, and resumes the pending restore until the saved target is reachable or no more matching content exists.

The guard remains content-signature based: if the Discovery view/filter/search/source content signature no longer matches, restore is rejected instead of scrolling into changed content. Each workspace still keeps its own scroll state; Discovery feed, Lineage feed, and workspace shell remain separate targets.


## CP98 scroll cleanup after green restore

CP98 is a cleanup package after CP97 browser validation passed for Discovery, Lineage, and More-expanded Discovery restore. It keeps the working routeScroll behavior intact and removes/contains diagnostic and retired scroll infrastructure that was only useful while isolating the bug.

The retired anchor-scroll runtime helper family is removed; only the startup prune for stale `tiinex.scroll.anchor.*` session entries remains. The structured scroll flight recorder is now explicit opt-in via `sessionStorage.setItem('tiinex.debug.scrollFlight', '1')` or `?debugScrollFlight=1`, rather than being coupled to the lighter `tiinex.debug.scrollRestore` routeScroll diagnostic flag. Render and route-state flight snapshots are also gated before they build heavy snapshots.

RouteScroll remains the single F5 scroll-restore owner. Discovery, Lineage, and workspace shell targets remain separate per-workspace targets, and Discovery More-aware restore remains content-signature guarded so changed views do not auto-scroll into stale content.


## CP99 Discovery auto-more

CP99 adds Discovery feed auto-growth near the rendered end of the feed while keeping the existing Show more button as a manual fallback. It is layered on top of the CP97/CP98 routeScroll restore path and does not change the stored-scroll owner.

Mobile More footer layout is also tightened so the visible-count text does not squeeze outside the footer when the fallback button is visible.

## CP100 lineage terminal polish

CP100 keeps the CP99 behavior unchanged and only polishes lineage terminal icon spacing so status icons do not visually merge with their text. The zip is also built from the app root so the archive opens directly on the app files.


### CP101 packaging and terminal polish note

CP101 keeps the CP100 app-root zip shape and only adjusts the lineage terminal row so status icons remain visually separated from text.

### CP102 unified node actions polish

CP102 consolidates desktop card actions and mobile action-sheet actions around one shared node action descriptor list. Desktop keeps artifact actions on one row by compacting local Edit/Remove tail actions, while mobile shows the same action set in the sheet with a smaller close affordance.


### CP103 mobile action sheet toggle cleanup

CP103 keeps CP102's shared node action descriptor list but filters the redundant mobile More/Less expand action from the action sheet. Mobile cards already use the card body as the expand/collapse affordance, while desktop keeps the explicit More/Less row action. Lineage Anchor remains available in the mobile sheet.
