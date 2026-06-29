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
- Integrity signals are method-scoped provenance context. A checksum match means byte integrity for the declared target, not truth, authorship, consent, or semantic correctness.

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
- save portable `.workspace.md` workspace configuration files
- export portable workspace archives through a client-side package/delivery pipeline

## Implementation baseline

The current package is a public handoff candidate with dependency-free static validation available through `node tools/validate-static.mjs`, static metrics through `node tools/collect-metrics.mjs`, and browser storage inventory through `node tools/inspect-storage.mjs`. `npm test`, `npm run metrics`, and `npm run storage:scan` are convenience aliases only; they do not imply a build step, dependencies, or a runtime requirement.

Ordinary app-level version suffixes, duplicate function declarations, package-local audit reports, embedded base64 logo data, inline data/blob logo payload support, version-stamped browser storage-key tokens, debug console/dynamic-code runtime surfaces, and unexpected single function reassignments are blocked by static validation. Packaged continuity markdown is also checked for pinned schema links and non-placeholder integrity values. The app integrity lifecycle treats empty or missing `Continuity Integrity` as no claim yet and treats any method entry with `Value` as a real claim. Local create/save finalizes a minimum checksum claim when the target is safe to compute.

Storage keys are centralized. Local workspace drafts autosave as local deltas without duplicating remote/default source trees. Startup reconnects saved local workspace state unless an explicit shared URL state is being opened. Storage write failures report through one `console.error` diagnostic path. Scroll and view-state behavior remain an active design surface and should be verified in the browser before claiming it is settled.

The viewer brand resolves through workspace markdown (`Viewer Identity` → `Icon`) and falls back to the packaged asset in `assets/`. Do not add a second logo path, inline image payload, or data/blob URL path for brand assets. Workspace configuration save and workspace archive export are separate product surfaces; archive export should flow through an ExportPlan, PackageResult, and Delivery target contract.

Ordinary app identifiers, CSS classes, actions, and DOM data attributes should remain semantic. Use Git history for implementation history; do not put implementation chronology into runtime names.

The current app is a static client-side package. Prefer improvements that preserve this shape unless the human explicitly chooses a larger architecture. Use the code maps in `app.js` and `styles.css` to navigate current runtime behavior, and use `src/architecture/boundaries.mjs` for the intended module boundaries. Extracted pure helpers live in `src/core/`, storage/state helpers live in `src/services/` and `src/state/`, UI helpers live in `src/ui/`, and route/lens/scroll policy helpers live in `src/viewstate/`; browser bridges under `src/app/` let `app.js` remain a classic static script. Metrics should report `architectureReadyForProductWork: yes` before new product work relies on this architecture baseline. Artifact wizard schema work should extend `WIZARD_SCHEMA_REGISTRY`; do not add parallel option/body/form switch tables, and do not reintroduce wizard opener/path/describe wrapper stacks.

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

## Generated schema-reference authority

Generated `Envelope Schema`, `Current Schema`, and `Parent Schema` references should use commit-pinned Tiinex docs schema permalinks when the schema is known. Relative schema paths are local recovery hints, not the preferred generated authority link when a maintained schema permalink is available.

## Browser State

Local workspace persistence stores local/draft deltas only. Remote/default workspace content must be reloaded from its source and then merged with saved local deltas. Scroll and lens state are session-scoped. Route, lens, and scroll policy helpers now have an owned `src/viewstate/` surface; treat browser restore behavior as active until it is deliberately consolidated.

## Runtime wrapper invariant

Render wrappers are `(next, ...args)` continuations. Do not pass Promise callback values before `next`; startup/render wrappers must keep the continuation as the first argument.

- `publicBuildReady: yes` means the publish path builds a bundled public site from the modular source.

## Browser scroll ownership

F5 scroll restore is owned by `tiinex.routeScroll.state.*`. Future scroll changes should keep one restore owner; improve the current stored-scroll policy or move the single owner into `src/viewstate/` instead.

## Scroll restore boundary

F5 scroll restore must remain single-owner. Stored browser scroll owns session restore. Durable lens may preserve and apply route selection/history state, but it must not chase scroll after render. Lineage scroll identity should be guarded by selected artifact path plus node-set content, not volatile source/runtime signatures.

## Scroll diagnostic surface

The scroll diagnostic surface instruments the single-owner restore path behind `sessionStorage.setItem("tiinex.debug.scrollRestore", "1")` / `?debugScroll=1`, and stores the captured startup trace in `window.__tiinexScrollRestoreDebugLog`. Use it to determine whether restore misses are caused by candidate selection, content-signature rejection, early non-scrollable targets, completion timing, or later zero-scroll writes before making another behavioral change.

## Scroll restore readiness invariant

Discovery restore can find the correct saved candidate before the preferred `.post-feed.discovery` target is scrollable. The restore path treats that as not-ready, keeps the restore pending for the content-load window, and avoids applying saved scroll to interim page/workspace fallbacks. Future scroll work should preserve this target-readiness invariant rather than adding competing restore owners.

## Mobile badge compaction ownership

- Treats `compactMobilePostChips()` as the single owner for mobile badge packing.
- Removes render-time badge compaction passes that directly mutated the same rows.
- Collapsed mobile badge rows remain one line with `+N` as the overflow affordance.
- Expanded `+N` rows may wrap instead of compressing every badge into one row.
- Parent-picker Select remains a direct first-row affordance and is not part of the hidden-badge overflow group.
- Scroll restore, Discovery auto-more, lineage traversal, storage, schema parsing, and i18n are intentionally unchanged.

## Badge rail ownership

- Keeps the stable mobile badge core and reserves the first-row action rail for both normal ellipsis and parent-picker Select before deciding which semantic badges fit.
- Re-appends parent-picker Select after semantic badges so it remains the right-side action instead of becoming the first badge.
- Uses collapsed visual chip width estimates that match truncated mobile badge CSS so long schema badges can remain visible when their rendered chip fits.
- Does not change create-intent, parent semantics, scroll restore, Discovery auto-more, Lineage traversal, storage, schema parsing, or i18n.



## CP143j ownership audit note

GitHub discovery should have one canonical implementation. Tiinex markdown artifact suffix checks should delegate to the shared helper for `.trace.md`, `.schema.md`, `.validator.md`, and `.workspace.md`. Referenced Material should remain attachment-oriented through one `nodeMaterialRefs` wrapper owner; structural Tiinex navigation belongs to Source, lineage, schema controls, and integrity diagnostics.

## Image attachment preview ownership

Image attachment previews should fit the image inside the dialog viewport with `object-fit: contain` and without inner image scroll. Full-size viewing belongs to saved source/download/open actions; draft or local-only images only need a usable contained preview until they have a stable source.


---

# Continuity Integrity

## Validator Definition Integration

Generated `Continuity Integrity` method entries should link `sha256-base64url-c14n-v1` to the commit-pinned `.topics/.validators/sha256-base64url-c14n-v1.validator.md` artifact. Parser logic must continue to normalize both linked and plain method labels to the canonical method id, and Discovery must load `.validator.md` artifacts as visible Tiinex markdown.

## CP143g cleanup note

- `.validator.md` remains discoverable from GitHub origin and visible in tree/feed.
- Generic Referenced Material excludes structural Tiinex links such as schemas, validator definitions, trace/workspace artifacts, parent/origin links, and method-definition links.
- Structural navigation remains owned by Source, schema actions, integrity diagnostics, and lineage controls rather than attachment UI.


## CP145 method definition handoff note

- Integrity diagnostics should keep byte-integrity result, method-definition availability, and schema authority as separate signals.
- `sha256-base64url-c14n-v1` method definitions are authority surfaces, not generic attachments or ordinary narrative content.
- The app should keep accepting plain method ids while generated artifacts prefer linked validator method entries.

## CP145b preview action handoff note

Material preview controls are modal-only controls. They must not also select, anchor, or navigate the artifact card. Keep preview material outside primary card click targets, and keep preview/open/copy controls from bubbling into card-selection actions.

## CP146 integrity entry foundation handoff note

The app now treats `Continuity Integrity` as a list of method entries rather than a single-method-only footer. Current generated artifacts still write one linked SHA-256 byte-integrity entry, but parsing and diagnostics preserve additional entries and choose the supported complete byte-integrity entry for current verification. Local save should not rewrite a multi-entry footer down to one entry.


## CP147 multi-validation diagnostics handoff note

Diagnostics now treats the integrity footer as a list of validation method entries. The app shows each entry, marks the active supported byte-integrity entry, and reports unsupported, duplicate, or incomplete entries as preserved audit signals. Generated artifacts still produce a single linked SHA-256 entry until additional validation methods are deliberately introduced.


## CP148 draft/final integrity handoff note

Draft/no-claim is an explicit local authoring state. Do not treat missing or empty `Continuity Integrity` as malformed. A real method entry with missing or placeholder `Value` is malformed; a missing claim is not. Diagnostics should keep claim lifecycle and finality separate from byte-integrity result, method-definition availability, validation entries, and schema authority. Export and publish work should consume these distinctions rather than inventing a second no-claim interpretation.


## CP149 export integrity handoff note

Workspace export owns a non-mutating integrity refresh pass. Refresh only local self-target Tiinex markdown when safe, write refreshed bytes into the exported archive copy, and report every refresh/preservation outcome in the package result summary. Do not rewrite source files, parent-target claims, unsupported methods, malformed claims, or multi-entry footers during export. Export archive creation should stay on one canonical path; ZIP password mode is traditional client-compatible ZIP encryption, while Tiinex AES-GCM is stronger but app-specific.

## CP150 package/export/delivery handoff note

Workspace archive export now has an explicit `ExportPlan → PackageResult → Delivery target` contract. Current delivery is browser download only, but the structure is intended to let future copy/contribution/GitHub issue/Drive/local adapters attach as delivery targets without becoming separate archive owners. Export result UI is part of the product surface and should continue to emphasize client-side processing, no telemetry, and visible integrity refresh outcomes.


## CP151b connector/origin adapter handoff note

The app now has an explicit Connector/Origin Adapter mental model. Do not treat GitHub Issues as a separate user-facing source or export path; they are a social-origin discovery surface inside a GitHub source/community with capabilities and guarantees. Adapter contracts distinguish read/discover/write-like capabilities from origin guarantees such as mutability, weak versioning, hashability, author metadata, timestamps, and no telemetry. Portable `.workspace.md` entrypoints may declare GitHub repo-file and issue-discussion discovery surfaces, and GitHub source badges must remain visible because they are the edit entrypoint for those surfaces. GitHub issue discovery is read-only for this release pass: public issues are fetched client-side, issue bodies become root topic nodes, and comments become feedback/proposal nodes with parse level, mutation intent, origin metadata, and body hash. Comment nodes must not replace original lineage content unless the lineage owner explicitly accepts them into a draft/commit flow.

## CP152b4 adapter request discipline handoff note

Do not add direct one-off `fetch()` flows for new adapters. Route external URL/API reads through the adapter request coordinator so browser HTTP caching, single-flight de-duplication, rate-limit/backoff, cache header interpretation, and source status stay consistent across GitHub raw/API, jsDelivr, viewer config, schema references, integrity target fetches, and future adapters.

Operational fetch/cache status is not provenance or evidence. Preserve material only through explicit artifacts. If an origin signals `no-store`, `private`, auth scope, or similar caution, Tiinex should warn and default to reference/finding semantics unless the user explicitly chooses to preserve the material.
