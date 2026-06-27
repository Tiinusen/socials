# Tiinex Lineage Viewer

Tiinex Lineage Viewer is a static, client-side viewer for portable Tiinex markdown artifacts. It makes continuity, provenance, handoff, source material, and lineage visible without requiring a server, database, or AI runtime.

## What it works with

The viewer is centered on portable markdown and local asset files, especially:

- `.trace.md`
- `.schema.md`
- `.workspace.md`
- `.validator.md`
- `.config.md`
- evidence, image, and supporting asset files

## Core semantics

Tiinex keeps these concepts separate:

- **Parent** means continuity lineage.
- **Origin** means grounding or provenance.
- **Reference** means a linked or cited artifact; it is not automatically a parent.
- **Integrity** is method-scoped provenance context. A checksum match means byte integrity for the declared target, not truth, authorship, consent, or semantic correctness.
- **No integrity claim** is a valid draft/local state. It is not the same as a checksum mismatch.

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
- share URL hash state for view/dialog context
- optionally include bounded wizard draft fields in the client-side URL hash
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

Source-control and hosting metadata can exist beside the static package in the GitHub repository. The validator allows repo-level metadata such as `CNAME`, `LICENSE`, `NOTICE`, and the project `discord/` folder while ignoring `.git/` internals for package-shape checks. The public workflow still publishes only the generated `.site-publish/` output, not the raw repository tree.


## Runtime ownership notes

The app still renders through a single static client entrypoint, but a few runtime surfaces have explicit owners to avoid parallel paths:

- Wizard schema behavior is owned by `WIZARD_SCHEMA_REGISTRY`.
- Wizard opening is owned by `openArtifactWizard()`.
- Wizard path selection is owned by `wizardPathFor()`.
- Wizard route/session lifecycle is owned by dialog route helpers near the view-state section.
- Browser back/forward and the in-app Lineage Back button share the route-history path when route history is available; direct-entry fallbacks update route state explicitly.
- Explicit dialog hash state owns F5 dialog restoration. The startup reconciliation keeps the requested wizard step instead of silently falling back to Type.
- `app.settings.wizardDraftHashState` controls whether bounded wizard draft form data is written into the client-side `#state` fragment. Dialog context, selected schema, step, parent, and reference target remain shareable even when draft data is disabled.
- Integrity diagnostics are owned by the method-scoped browser verifier. Empty or missing `Continuity Integrity` means no claim yet; a method entry with `Value` is treated as a real claim. Local create/save finalizes a minimum checksum claim when the target is safe to compute.
- Generated Tiinex schema references use commit-pinned `Tiinex/docs` schema permalinks when the schema is known; local schema paths remain resolution hints, not the generated authority link.

- `WIZARD_SCHEMA_REGISTRY` owns schema-aware wizard fields, defaults, body builders, and edit-prefill readers.
- `openArtifactWizard()` and `wizardPathFor()` are the canonical wizard open/path services.
- `compactMobilePostChips()` owns mobile badge packing.
- `snapshotRenderScrolls()` / `restoreRenderScrolls()` own scroll preservation across full render passes, including visible feeds, workspace shells, and open authoring-dialog bodies.

When extending the viewer, prefer adding to those owned surfaces instead of introducing duplicate switch tables, wrapper stacks, or ad-hoc scroll restore code.

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

The tool checks JavaScript syntax, tool and source-module syntax, CSS brace balance, root package shape, root markdown shape, architecture boundaries, duplicate function declarations, ordinary app-level version-stamped identifiers/classes, debug console and dynamic-code surfaces, public-facing scaffold wording, wrapper naming hygiene, wizard registry/path ownership, known single function reassignment inventory, pinned schema links in packaged continuity markdown, non-placeholder integrity values, app integrity lifecycle contracts, and default workspace mirror consistency.

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
- app-generated artifact output must not use `Value: pending`; empty footer means no integrity claim yet; local create/save writes `sha256-base64url-c14n-v1` when the target is safe to compute
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

## Current owned runtime surfaces

The current product baseline treats these behavior clusters as owned surfaces, not as independent patch layers:

- **Scroll restore:** `routeScroll` remains the single F5 restore owner. Discovery, Lineage, and workspace-shell scroll targets are separate per workspace, content-signature guarded, and should not be shadowed by lens scroll chasers.
- **Discovery loading progress:** source loading progress covers file discovery, markdown fetch/load, progressive workspace indexing, discovery-time integrity target verification, and policy lookup. Do not leave `ws.loading` without `ws.discoveryProgress` for remote or route-driven markdown loading paths, and keep the visible percentage phase-weighted rather than pretending every phase has equal cost.
- **Discovery More:** Discovery feed auto-growth is layered above the same feed windowing path as the manual Show more fallback. It must not write scroll state or become a second restore owner.
- **Node actions:** desktop cards and mobile action sheets use the same node action descriptor list. Mobile may filter presentation-only actions such as redundant More/Less, but it should not own a separate action model.
- **Create intent:** Continue and Reference use one create-intent entry point. Reference starts with parent selection; Continue opens the schema-aware artifact wizard directly.
- **Mobile badges:** `compactMobilePostChips()` owns mobile badge membership, order, collapsed overflow, and expansion. CSS owns only presentation of the packed row and action rail. Do not add separate render-time badge mutators or competing CSS override blocks.
- **Parent picker:** parent selection is a mode over existing cards. The Select affordance is an action rail control, not a semantic badge and not a separate mobile action-sheet flow.
- **Artifact wizard architecture:** wizard opener and path decisions are direct services, not wrapper stacks. Schema metadata, default body templates, form fields, form defaults, markdown builders, edit-state readers, artifact kind, and any schema-specific describe renderer are owned from the deep-frozen `WIZARD_SCHEMA_REGISTRY`. Do not reintroduce parallel schema option/body/form switch tables or opener/path/describe wrappers.
- **Schema create policy:** schema family, schema-facing creatability, continuation/reference suitability, and UI exposure are owned by `SCHEMA_CREATE_POLICY_REGISTRY`. Schema-facing creatability uses the schema-family vocabulary (`yes`, `no`, `advanced`, `abstract`), while app-facing visibility is kept in `uiSurface`. `WIZARD_SCHEMA_REGISTRY` owns forms and body builders, but Type-step visibility derives from create policy. Do not add schema cards or support-schema shortcuts by editing wizard presentation paths directly.
- **Authoring dialog shell:** the artifact wizard, Review Markdown fallback, and local markdown edit share the `authoring-dialog-*` shell classes for panel, header, scroll body, close control, and footer actions. Dialog layout changes should extend that shared shell rather than adding separate mobile/desktop modal paths.
- **Wizard relation context:** parent/reference context lives in the dialog header through `wizardHeaderContext()`, not as body-level relation cards or strips. Do not restore large relation boilerplate cards for Continue/Reference unless there is a new product reason.
- **Dialog route state:** lightweight modal route state is allowed for shareable detail, markdown, and artifact-wizard dialogs. It stores stable descriptors, intent, step/schema context, and optional bounded wizard draft text when the Link sharing setting allows it. Do not store file payloads or secrets in URL hash state.
- **Render boundary:** `render()` may do a full app-shell render when chrome identity changes, but ordinary workspace/body/modal updates should patch `#workspace-grid`, `#toasts`, and `#modal-root` without replacing the topbar/brand chrome. Keep `renderChromeSignature()`, `patchRender()`, and `renderFullAppHtml()` as the owned split so view-mode changes do not recreate static chrome.
- **Hash navigation restore:** browser back/forward over `#state`/`#view` entries is a route restore, not an F5 restore. `scheduleRouteHistoryScrollRestore()` owns the short post-render scroll re-apply from hash route state; `routeScroll` remains the long F5/session restore owner. Startup local-state restore must not clear a dialog explicitly requested by the URL hash.

## Cleanup status

The package has been cleaned after the recent scroll, action, create-intent, parent-picker, and mobile badge work:

- no app/runtime identifiers carry implementation chronology
- duplicate function declarations remain blocked by validation
- mobile badge packing has one JavaScript owner
- mobile badge/action rail CSS is consolidated into one canonical presentation block
- removed create/Continue/Reference shortcuts no longer bypass the artifact wizard
- raw markdown review remains an explicit fallback/editor surface, not the primary create path
- wizard opener/path ownership is direct and static validation blocks reintroducing wizard wrapper stacks
- schema-aware wizard ownership is centralized in one validated, deep-frozen registry instead of option/body/form/edit switch tables
- wizard, Review Markdown, and local edit dialog shells share one authoring-dialog layout contract
- Evidence keeps its attachment-aware describe renderer through the registry, not through stacked describe-step wrappers
- wizard relation context is header-level and guarded against stale body cards/strips
- shareable dialog route state is lightweight and descriptor-based
- zip packaging opens directly at the app root

Before starting larger feature work, keep using the browser checklist above for changed surfaces and run the static validation and metrics commands documented in this README.


## Loading progress contract

Discovery content may render progressively while preserving the loading/progress notice until the owned loading lifecycle is complete. Partial renders are allowed during fetch, but they must not clear `ws.loading` or `ws.discoveryProgress`; the progress notice is only dismissed after discovered markdown fetches, progressive indexing, discovery-time integrity target verification, and policy checks complete. Background integrity verification must not be launched as a separate untracked fetch wave during Discovery progress. The displayed percentage is phase-weighted so long verification phases do not appear as a misleading 96-99% stall.

## Architecture readiness signals

These markers are intentionally kept in the README for validator visibility and maintainer handoff:

- architectureScaffoldReady: yes
- coreExtractionReady: yes
- serviceStateExtractionReady: yes
- uiFeatureExtractionReady: yes
- viewStateIsolationReady: yes
- publicBuildReady: yes
- cleanupReadyForProductWork: yes
- architectureReadyForProductWork: yes

## Validator method integration

Generated integrity method entries use the commit-pinned canonical validator definition for `sha256-base64url-c14n-v1`. The app still accepts older plain method identifiers, but newly generated artifacts should link the method entry to `.topics/.validators/sha256-base64url-c14n-v1.validator.md`. Discovery treats `.validator.md` files as first-class Tiinex markdown artifacts alongside `.trace.md`, `.schema.md`, and `.workspace.md`. GitHub discovery queries the repository tree origin before falling back to the static flat-package listing, so newly committed validator definitions are not hidden by package-cache staleness. Wizard step changes replace the dialog route entry so saving a created artifact does not leave an older wizard dialog behind browser Back.

### CP143g cleanup note

Referenced Material is attachment-oriented. Structural Tiinex links such as schema references, validator method definitions, trace/workspace artifacts, parent origin, and method-definition links are not shown as generic referenced material. They remain accessible through their dedicated source, schema, validator, diagnostics, and lineage controls.


### CP143i image attachment preview note

Image attachment preview dialogs contain images inside the available dialog viewport instead of letting the image create an internal scroll area. Saved assets still expose source/download actions for full-size access, while unsaved or local-only previews prioritize a usable contained preview. Text previews remain scrollable because their content is not ratio-bound image media.


### CP143j ownership audit note

Discovery, Tiinex markdown artifact suffix detection, and Referenced Material now have clearer single-owner boundaries. GitHub discovery has one canonical implementation, `.trace.md`/`.schema.md`/`.validator.md`/`.workspace.md` suffix detection delegates to one helper, and Referenced Material has one wrapper owner over the `nodeMaterialRefs` pipeline. Structural Tiinex navigation such as trace/schema/validator links is not rendered through attachment actions.
