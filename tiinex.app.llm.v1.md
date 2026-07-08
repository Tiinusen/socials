## CP294 LLM note

Schema presentation is now treated as a coverage surface, not only a prettified preview. When adding or changing schemas, ensure expanded and detail read presenters surface important human-authored body sections before relying on the collapsed raw artifact body. Use `TiinexDiagnostics.presentationCoverageReport()` to inspect which known important sections are present and surfaced. Topic presenters must preserve content/intro text, design direction, next artifacts, candidate directions, and transition boundary when available.

## CP260 LLM note

CP260 treats discovery/render continuity as the owner, not adapter logic. Do not reintroduce progressive feed remounts as progress updates; progress should patch its own DOM surface and final render should happen after discovery material is stable. UX Back from Lineage should restore Discovery scroll directly, independent of browser history, and may grow the windowed Discovery feed before applying the saved scroll top. Browser Back/Forward remains URL/viewState-owned.

## CP259 LLM note

CP259 fixes CP258 refresh regressions. Do not let GitHub issue/comment snapshot import or stale-comment replacement mutate the broader GitHub repo-file surface. Refresh/Reset is non-destructive reconciliation unless an explicit source-save operation owns a surface toggle change. Stale source cleanup for a GitHub comment must be constrained to `sourceSurface === issues` and the same issuecomment id. Source-refresh progress must not be dismissed until the final workspace index/render has settled.

## CP258 LLM note

Source refresh must have a visible operation boundary when invoked from the GitHub source dialog. Do not rely only on corner toasts for long source operations. Refresh/Reset cache should lock overlapping source actions until the operation finishes. Issue/comment snapshot imports must preserve the canonical GitHub source configuration; importing a publication anchor or issue snapshot is not permission to turn off repo-file discovery. When a GitHub comment is re-imported after an edit, remove stale recovered source-backed artifacts for the same issuecomment id before adding the fresh artifact so the feed does not show both old and new source versions.

## CP256 Handoff Note — Source refresh progress and view continuity

Ordinary GitHub source refresh should be treated as an in-place reconciliation path. The visible discovery progress now spans repo file discovery and GitHub issue snapshot import instead of ending after repo files. Re-indexing now preserves expanded card state so soft refresh does not collapse the user's current Lineage/Discovery context. Do not route ordinary refresh through hard-refresh semantics unless the user explicitly asks for cache/source reset.

## CP215 implementation note

Expanded Feed and Lineage previews now pass `inline: true` to schema presenters. Inline mode keeps schema identity visible but suppresses duplicated title/summary inside the preview, emphasizes user-authored fields first, and reduces boilerplate metadata. Full detail views continue to use non-inline presenters.

# CP160 LLM note

- Treat Display Options as shared View Options for Discovery and Lineage surfaces.
- Temporal Lens is not a simple date filter. It is an As-of projection over the loaded workspace using the best available time anchor.
- Preferred time-anchor order is source version commit date, origin modified date, artifact `Created At`, workspace observed/imported time, then generated time.
- If an origin cannot provide versioned history, do not invent archived source state. Keep the fallback explicit.
- Generated artifacts started from an active temporal lens should preserve that lens context as provenance.

# Continuity Context

- Envelope Schema: tiinex.root.v1
- Current
  - Current Schema: tiinex.topic.v1
  - Created At: 2026-06-18 00:00:00
  - Summary: LLM orientation entrypoint for the Tiinex Lineage Viewer application package.

---

# Tiinex Lineage Viewer LLM Orientation

## CP257 LLM note

Source refresh progress must represent the whole source-refresh lifecycle, including issue snapshot import and the final render/reconciliation handoff. Do not dismiss the progress surface while adapter artifacts are still about to enter the feed. Ordinary Refresh is not Reset cache: it should reconcile the source without clearing Tiinex adapter caches or forcing hard-refresh semantics through every adapter. Reset cache is the advanced fallback. UX Back from Lineage should restore the remembered Discovery scroll captured before Lineage opened; browser Back/Forward remains route/viewState-owned.

## CP255 LLM note

Local workspace restore is not a discovery trigger. If a restore/reconciliation pass prunes a published Local draft shadow, persist that cleanup after restore finishes, but do not start GitHub issue import from local-state restore. Background issue discovery after restore caused repeated import toasts, rerenders, Lineage panel collapse, and URL view-state reapplication. Keep issue discovery explicit/on-demand.

## CP253 LLM note

After a no-auth GitHub publication is verified by reading the public comment and matching its body against the copied Tiinex draft, the publication binding is the owner of cleanup. It must import/bind the verified comment anchor first, then remove only the exact local draft selected for publication from both runtime state and persisted local workspace state. Do not rely on broad duplicate pruning alone for this flow, and do not delete source-backed originals. This is a state/binding patch, not a discard, time portal, or markdown-presentation patch.

## CP252 LLM note

Manual GitHub publication remains no-auth and user-mediated. For existing issue-comment publication, a known `#issuecomment-...` permalink is enough for Tiinex to locate the comment, but it is not enough to verify publication. Verification must read the public GitHub comment or scan issue comments and confirm that the live body matches the copied Tiinex draft. `Open in Tiinex` links in outbound GitHub markdown should use the current viewer URL as their route base, not a hardcoded public deployment URL, so local/dev builds remain testable.

## CP251 LLM note

Manual GitHub publication remains a no-auth browser routine. A selected known issue target is only a navigation/open target; it is not proof that the user posted or edited GitHub material. For existing-issue publication, require the user to paste the resulting GitHub comment permalink (`#issuecomment-...`) before treating the step as verified or pruning local drafts. GitHub-facing markdown should keep human-readable content first and place all Tiinex parser/source payload material inside one bottom collapsible labeled `Tiinex source payload`.

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

Storage keys are centralized. Local workspace drafts autosave as local deltas without duplicating remote/default source trees. Startup reconnects saved local workspace state unless an explicit shared URL state is being opened. Storage write failures report through one `console.error` instrumented path. Scroll and view-state behavior remain an active design surface and should be verified in the browser before claiming it is settled.

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

## Scroll instrumented surface

The scroll instrumented surface instruments the single-owner restore path behind `sessionStorage.setItem("tiinex.debug.scrollRestore", "1")` / `?debugScroll=1`, and stores the captured startup trace in `window.__tiinexScrollRestoreDebugLog`. Use it to determine whether restore misses are caused by candidate selection, content-signature rejection, early non-scrollable targets, completion timing, or later zero-scroll writes before making another behavioral change.

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

GitHub discovery should have one canonical implementation. Tiinex markdown artifact suffix checks should delegate to the shared helper for `.trace.md`, `.schema.md`, `.validator.md`, and `.workspace.md`. Referenced Material should remain attachment-oriented through one `nodeMaterialRefs` wrapper owner; structural Tiinex navigation belongs to Source, lineage, schema controls, and integrity validation.

## Image attachment preview ownership

Image attachment previews should fit the image inside the dialog viewport with `object-fit: contain` and without inner image scroll. Full-size viewing belongs to saved source/download/open actions; draft or local-only images only need a usable contained preview until they have a stable source.


---

# Continuity Integrity

## Validator Definition Integration

Generated `Continuity Integrity` method entries should link `sha256-base64url-c14n-v1` to the commit-pinned `.topics/.validators/sha256-base64url-c14n-v1.validator.md` artifact. Parser logic must continue to normalize both linked and plain method labels to the canonical method id, and Discovery must load `.validator.md` artifacts as visible Tiinex markdown.

## CP143g cleanup note

- `.validator.md` remains discoverable from GitHub origin and visible in tree/feed.
- Generic Referenced Material excludes structural Tiinex links such as schemas, validator definitions, trace/workspace artifacts, parent/origin links, and method-definition links.
- Structural navigation remains owned by Source, schema actions, integrity validation, and lineage controls rather than attachment UI.


## CP145 method definition handoff note

- Integrity validation should keep byte-integrity result, method-definition availability, and schema authority as separate signals.
- `sha256-base64url-c14n-v1` method definitions are authority surfaces, not generic attachments or ordinary narrative content.
- The app should keep accepting plain method ids while generated artifacts prefer linked validator method entries.

## CP145b preview action handoff note

Material preview controls are modal-only controls. They must not also select, anchor, or navigate the artifact card. Keep preview material outside primary card click targets, and keep preview/open/copy controls from bubbling into card-selection actions.

## CP146 integrity entry foundation handoff note

The app now treats `Continuity Integrity` as a list of method entries rather than a single-method-only footer. Current generated artifacts still write one linked SHA-256 byte-integrity entry, but parsing and validation preserve additional entries and choose the supported complete byte-integrity entry for current verification. Local save should not rewrite a multi-entry footer down to one entry.


## CP147 multi-validation validation handoff note

Validation now treats the integrity footer as a list of validation method entries. The app shows each entry, marks the active supported byte-integrity entry, and reports unsupported, duplicate, or incomplete entries as preserved audit signals. Generated artifacts still produce a single linked SHA-256 entry until additional validation methods are deliberately introduced.


## CP148 draft/final integrity handoff note

Draft/no-claim is an explicit local authoring state. Do not treat missing or empty `Continuity Integrity` as malformed. A real method entry with missing or placeholder `Value` is malformed; a missing claim is not. Validation should keep claim lifecycle and finality separate from byte-integrity result, method-definition availability, validation entries, and schema authority. Export and publish work should consume these distinctions rather than inventing a second no-claim interpretation.


## CP149 export integrity handoff note

Workspace export owns a non-mutating integrity refresh pass. Refresh only local self-target Tiinex markdown when safe, write refreshed bytes into the exported archive copy, and report every refresh/preservation outcome in the package result summary. Do not rewrite source files, parent-target claims, unsupported methods, malformed claims, or multi-entry footers during export. Export archive creation should stay on one canonical path; ZIP password mode is traditional client-compatible ZIP encryption, while Tiinex AES-GCM is stronger but app-specific.

## CP150 package/export/delivery handoff note

Workspace archive export now has an explicit `ExportPlan → PackageResult → Delivery target` contract. Current delivery is browser download only, but the structure is intended to let future copy/contribution/GitHub issue/Drive/local adapters attach as delivery targets without becoming separate archive owners. Export result UI is part of the product surface and should continue to emphasize client-side processing, no telemetry, and visible integrity refresh outcomes.


## CP151b connector/origin adapter handoff note

The app now has an explicit Connector/Origin Adapter mental model. Do not treat GitHub Issues as a separate user-facing source or export path; they are a social-origin discovery surface inside a GitHub source/community with capabilities and guarantees. Adapter contracts distinguish read/discover/write-like capabilities from origin guarantees such as mutability, weak versioning, hashability, author metadata, timestamps, and no telemetry. Portable `.workspace.md` entrypoints may declare GitHub repo-file and issue-discussion discovery surfaces, and GitHub source badges must remain visible because they are the edit entrypoint for those surfaces. GitHub issue discovery is read-only for this release pass: public issues are fetched client-side, issue bodies become root topic nodes, and comments become feedback/proposal nodes with parse level, mutation intent, origin metadata, and body hash. Comment nodes must not replace original lineage content unless the lineage owner explicitly accepts them into a draft/commit flow.

## CP152b4 adapter request discipline handoff note

Do not add direct one-off `fetch()` flows for new adapters. Route external URL/API reads through the adapter request coordinator so browser HTTP caching, single-flight de-duplication, rate-limit/backoff, cache header interpretation, and source status stay consistent across GitHub raw/API, jsDelivr, viewer config, schema references, integrity target fetches, and future adapters.

Operational fetch/cache status is not provenance or evidence. Preserve material only through explicit artifacts. If an origin signals `no-store`, `private`, auth scope, or similar caution, Tiinex should warn and default to reference/finding semantics unless the user explicitly chooses to preserve the material.
## Artifact registry / Display Options handoff note

Tiinex markdown artifact suffix support is registry-owned. Use `TIINEX_MARKDOWN_ARTIFACT_REGISTRY` as the canonical app owner for known suffixes such as `.trace.md`, `.schema.md`, `.workspace.md`, `.validator.md`, `.adapter.md`, `.origin.md`, `.tool.md`, and `.interface.md`. Discovery should import known registry suffixes; Display Options should only filter what the view shows. Do not add a new checkbox or a second suffix list when a new Tiinex suffix is introduced.

## Use-As parent placement handoff note

`Use as` means interpretation/projection, not mutation of the source finding. Do not silently make the source finding the parent. After the user chooses the use-as target schema, route them through the shared parent-placement picker. Preserve the original finding as `useAsBasisNodeId` / `Discovery Finding Basis`; use the selected parent only for lineage placement. Tree view must participate in parent picking rather than becoming a dead lane.

## Node action row ownership handoff note

Node action rows are semantically grouped. Non-mutating/read-only actions are icon-only and should stay left: More/Less or Anchor, Open, Markdown, and conditional Source. Mutating actions keep visible labels and sit to the right: static mutating actions first (`Continue`, `Reference`), then conditional mutating actions (`Use as`, `Edit`, `Remove`). Do not reintroduce text labels on read-only card actions or move conditional mutating actions before static mutating actions.


## CP157 tree parent placement polish

- Tree parent-picker rows now use the same `Select as parent` wording and green visual affordance as Feed parent-picking cards.
- The tree row remains the actual click target; the visible affordance is a styled badge to avoid nested interactive controls.

## CP158 Display filter chips

Display Options uses visible chip state for schema and artifact-category filters. Empty selection means All; selected chips narrow the visible discovery view and can be removed individually. Dropdowns are add-filter controls, not the canonical state display. `Leaves only` remains enabled by default and is separate from schema/artifact filtering.

## Display filter event ownership note

Display Options add-filter selects are not older single-filter selects. Keep `data-add-discovery-filter` and `data-add-artifact-display-filter` out of the generic discovery-filter change listener. Schema chips and artifact-category chips must accumulate independently; changing one filter family must not reset the other.

## CP161 temporal lens handoff note

Temporal Lens is a shared View Options capability, not a simple date filter. Keep the modal scalable by making the options body scroll. Keep active temporal status compact in Discovery/Lineage views.

For loaded projections, do not hide an artifact solely because its current source file has a later commit/modified timestamp if the artifact declares an older `Created At`. Declared artifact creation is the stronger existence boundary for loaded Tiinex artifacts. Source revision and modified timestamps remain useful for mode/status and for origins that can later load a true historical revision. Do not claim true archive semantics unless the actual origin state for the selected moment has been loaded or preserved.

## CP162 temporal source snapshot handoff note

Temporal Lens has two distinct modes that must not be conflated:

- Loaded projection: filters currently loaded artifacts using declared artifact timestamps and fallback observed/source metadata. This is not a source archive.
- Source snapshot: for GitHub sources, explicitly load the repo tree from the latest commit before the selected As-of moment and fetch artifacts from that commit-pinned ref.

Do not show temporal status as an extra workspace-title badge. The compact view notice owns visible temporal state. Do not claim source-version/archive semantics unless a source snapshot or preserved version archive has actually been loaded.

## CP163 GitHub lazy social discovery handoff note

GitHub issue/discussion discovery is a source capability, not permission to eagerly crawl the GitHub API. Keep the checkbox default-on, but empty social target lists must not sample latest open issues. Explicit issue/discussion URLs should become bounded social-origin discovery findings first. Live API import may exist later as a constrained enrichment path, but anonymous-safe target registration, manual import, and copy/paste export are the baseline. Discussions are first-class social targets even when live discussion material is not imported.

## CP164 View Options Fit + Temporal Lineage Ancestors

Display Options is now a wider/taller shared View Options dialog with internal body scroll only. Avoid adding new controls that force X-axis scroll; prefer wrapping controls or full-width rows on narrow screens.

Temporal Lens lineage rendering preserves ancestors of visible descendants. This is a continuity-context rule, not a source-history claim: loaded projection can keep parent context visible, but only source snapshots or preserved version archives may claim historical origin state.

## CP165 GitHub Web Repo Snapshot Resolver

Temporal Lens source snapshots should prefer origin/source history over artifact-declared `Created At`. For GitHub repositories, CP165 introduces a bounded web resolver that builds a `commits/<ref>/?since=...&until=...` URL, parses stable `/commit/<sha>` href semantics, chooses the latest commit at or before the selected As-of moment, and reloads repo-file discovery from that commit ref. This is a web-adapter source-state path, not broad crawling.

If automatic web resolving is blocked, the user may paste a GitHub tree URL, commit URL, or SHA. That human-assisted path is still a source snapshot and should be preferred over loaded projection. Artifact `Created At` remains a fallback when source state cannot be resolved, not the primary truth for GitHub Temporal Lens.

## CP166 Temporal Lens Apply Boundary

Temporal Lens is now a staged View Options concern. When Display Options is open, temporal mode/date/ref changes are held as a modal draft and applied on close. The apply step schedules source snapshot resolution for GitHub sources rather than updating the active view on every field change.

When a GitHub source snapshot is loaded, that snapshot's files should not be filtered out by artifact `Created At`; the source commit/tree state owns the source-backed historical view. Artifact dates remain fallback/projection metadata when no source snapshot is available.

## CP167 Handoff Note

CP167 tightens Temporal Lens source-snapshot truthfulness. GitHub source snapshot resolution now tries web commits first, then a single bounded REST commit lookup as a CORS/budget-aware fallback, then loads repo discovery from the resolved commit ref. The visible temporal mode distinguishes loaded, loading, and failed source snapshot state. Artifact `Created At` remains fallback projection only when no source snapshot is loaded.

## CP168 Handoff Note

GitHub Temporal Lens source snapshots use isolated request guards for the single commit resolver and snapshot tree fallback. Do not reuse the broad `github-rest` guard for this bounded temporal lookup, because social issue/comment discovery can otherwise make source snapshots appear unavailable before the app has tried the intended one-shot resolver. This is still not permission for eager crawling: issue/discussion discovery remains lazy, and full source snapshot loading is triggered only by applying a temporal lens or by a user-supplied tree/commit ref.

## CP169 Known-ref source snapshot

- Temporal source snapshots now treat pasted GitHub tree URLs, commit URLs, or commit SHAs as first-class snapshot refs.
- Known refs run normal repository discovery against that ref instead of relying on artifact `Created At` projection.
- When static/jsDelivr and GitHub tree discovery cannot enumerate a snapshot ref, the loader can fall back to a seeded path manifest from the already-known workspace/source paths, then fetch raw files at the pasted ref and skip missing files.
- Date-to-commit resolving remains best-effort convenience; source snapshots by known ref are the canonical no-API/manual path.

## CP170 No-API Source Snapshot Boundary

GitHub source snapshots must not use GitHub REST/API as a silent fallback. Known refs supplied by the user (tree URL, commit URL, SHA, branch, or tag) are first-class source snapshot refs and should run through the same repo discovery path as ordinary repo discovery, with static/jsDelivr and raw URL fetches before any future explicit API capability. Date-to-commit resolving is web-only/best-effort in the static web app; if GitHub commit-list HTML is blocked by CORS, the correct baseline is human-assisted `Open commits page` plus pasted ref.

Do not re-enable automatic commit-date enrichment by default. It can cost one REST request per artifact and conflicts with the anonymous/browser-like adapter principle. Paygate/auth/rate-limited adapter paths may exist later as explicit user-invoked capabilities, but must not be introduced as background retries or convenience fallbacks.

## CP171 Historical schema snapshot compatibility

Historical source snapshots can predate the current artifact filename registry. Tiinex/docs used historical schema filenames such as `.topics/.schemas/tiinex.topic.v1.md` before the newer `.schema.md` convention. Snapshot discovery must therefore classify `.topics/.schemas/tiinex.*.vN.md` as schema artifacts while preserving the modern `.schema.md` registry contract. This is intentionally scoped to the support schema directory so ordinary `.v1.md` files elsewhere do not become schemas by accident.


## CP172 — No-API snapshot ref boundary and visible tree child counts

- Date-only temporal lens no longer silently attempts GitHub date-to-commit resolving when no Tree URL/SHA is supplied; no-API mode now marks this as `source snapshot needs ref` instead of a misleading unresolved failure.
- Known Tree URL / commit URL / SHA remains the canonical no-API source snapshot path.
- Discovery tree child badges are scoped to children visible in the current tree view and same source context so collapsed/filtered/current-graph descendants are not counted as if they belonged to the visible snapshot row.
- GitHub API remains disabled for source snapshot flow unless introduced later as an explicit user-invoked capability.

## CP173 — Compact source modules and no-ref projection clarity

Source/adaptor context should not consume content space. GitHub discovery/module cards are compact one-line chips across desktop and mobile. Treat them as status/context affordances, not content panels.

Date-only no-API Temporal Lens does not load a GitHub source snapshot by itself. Without a Tree URL, commit URL, or SHA, the visible view remains a loaded projection and the UI should say that it needs a source ref. GitHub API/REST paths remain explicit user-invoked capabilities only, not silent fallbacks.

## CP173 Final — Time portal resolver dialog

Time traversal is now modeled as a portal-like view request. Display Options captures only the requested time: empty means latest, filled date/time means an As-of portal is requested. Source-specific details, such as GitHub tree URL/SHA resolution, live in an adapter resolver dialog rather than Display Options.

For no-API GitHub snapshots, date-only does not silently call GitHub API or cross-origin GitHub HTML. The GitHub adapter lightbox can open the commits page and accepts a user-pasted tree URL, commit URL, or SHA. Valid input loads the snapshot and closes the resolver. API/auth/paygated paths remain explicit user-invoked capabilities only.

## CP174 continuity note — Time portal interval UX

The former single As-of temporal lens is now presented as a Time portal interval. `temporalStart` is Begin, `temporalEnd` is End, and older `temporalAsOf` values map to End for compatibility. Empty Begin/End disables the time portal. Begin-only filters the latest loaded state and does not require source snapshot resolution. A populated End remains the source-state boundary for adapters that can resolve historical snapshots. GitHub remains no-API by default and asks for a concrete ref through the adapter dialog only when needed.


## CP175 continuity note — audit and display compactness

Lineage audit is now a visible review action rather than a silent parent-fetch affordance. It may fetch open parent boundaries, verifies loaded lineage integrity states, and leaves a summary with OK/mismatch/open/pending counts. Future changes should keep this action review-oriented and bounded; it should not become background crawling.

Display Options has a `mismatchesOnly` view filter and a compact layout. Keep Time portal source-resolution details out of Display Options; adapter-specific ref resolution belongs in the portal resolver dialog. Preserve the toolbar placement of the display-options button so Discovery and Lineage modes feel unified.

## CP176 implementation note

Time portal interval controls now normalize reversed Begin/End ranges instead of surfacing an error. Clearing the time portal, or converting a historical End-bound portal into Begin-only latest filtering, schedules a latest source restore so a GitHub workspace does not remain pinned to the last manually resolved snapshot ref.

Lineage toolbar controls now group Audit, Display Options, preview, and search as a stable compact action rail. The audit button remains a read-only verification action; it does not mutate artifacts.

Display Options mobile filter rows were adjusted so selected schema/artifact chips wrap below their dropdown controls without overlapping.

## CP177 LLM handoff note

CP177 adds a no-API local GitHub commit cache for time portals. The cache stores commit refs observed through adapter flows with a source timestamp when available; user-supplied time-portal refs are stored against the requested End time as portal-observed candidates. Future End-bound GitHub portals consult this cache before opening the manual ref resolver dialog. This is a convenience path only; GitHub API remains opt-in/explicit and is not used silently.

CP177 also adds a short-lived Lineage selection lock during explicit Lineage actions and integrity refresh so stale durable route/cache state cannot bounce the user back to Discovery during rerenders.

## CP178 route safety and Lineage toolbar polish

- Fixed a route/history regression where Lineage selection could be restored from stale hash/session lens state after Back or browser Back.
- App Back now explicitly clears the selected lineage target and writes a Discovery route instead of relying on `history.back()` landing on the correct prior entry.
- Browser Back to an empty/no-route hash clears Lineage selection and suppresses cached Lineage lens reapplication, preventing the viewer from getting stuck in Lineage mode.
- Removed a duplicate route push during node selection that could create repeated Lineage history entries.
- Toned down the Audit button and separated Back/Audit/Display/Preview click areas in the Lineage toolbar.

## CP179 implementation note

Route state is now the single owner of URL/history writes. Durable lens persistence remains useful for session scroll/lens recovery, but it must not call `history.replaceState()` or `history.pushState()` independently of `setRouteState()`. This avoids a stale cached Lineage lens rewriting a Discovery/no-route browser-history entry after Back.

When browser Back lands on an empty/no-route hash, cached Lineage lens reapplication must remain suppressed through compute/index refreshes. Do not read `cachedLensState()` directly from compute wrappers; use the route-or-allowed cache path so suppression is honored.

## CP180b implementation note

CP180b handles the companion case where browser Back lands on an explicit Discovery `#view` route rather than an empty hash. Explicit Discovery route application must clear any workspace-matching `lineageViewLock` and suppress stale cached Lineage lens reapplication. Otherwise the route can correctly apply Discovery for one render and then the short-lived Lineage lock can reselect the previous Lineage artifact, making Back look like it bounced.

Static-disk `popstate` restore should keep `app.routing.restoring` true through route apply and render. Route restore is the active owner during that window; render-time durable lens helpers and Lineage locks must not compete with it.
## CP180c — Lineage select route owns pending lens and Discovery scroll

- Selecting a Discovery card now preserves the current Discovery scroll on the current route entry before mutating the workspace into Lineage mode.
- Lineage selection writes a fresh pending durable lens state from the route writer, so compute/render refreshes cannot reapply the previous Discovery lens and bounce the user back out of Lineage.
- Lens scroll capture no longer falls back to page/body scroll when the selected mode is Lineage but the Lineage feed has not rendered yet. This prevents the transient selection render from overwriting the Discovery Back target with scrollTop 0.
- `select-node` actions now stop propagation/default handling like the other navigation actions, keeping card selection as the only owner for the click.
- Browser Back/Forward and UX Back behavior from CP180b is intentionally preserved; this patch only narrows the Discovery -> Lineage transition and its scroll snapshot boundary.

Static checks run:

```txt
node --check app.js
node --check tools/*.mjs
node --check src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser checks still required:

1. Scroll deep in Discovery, click several cards that previously flashed Lineage and returned to Discovery; they should stay in Lineage.
2. Browser Back from Lineage should return to Discovery at the prior scroll position.
3. Browser Forward should return to the same Lineage card.
4. UX Back should return to Discovery at the prior scroll position.
5. F5 deep Discovery restore should continue to work.



## CP205 implementation note

GitHub export routine state is now artifact-local. `githubDefaultTargetMode()` no longer reads a global modal target mode, so provenance-derived candidates can select `Reuse known` by default for the current artifact. Target mode and target URL changes reset copy/open/verify signatures because the prepared body, open target, and verification boundary are no longer the same. Continue/Done requires matching copy/open/verify signatures, not just stale booleans.

GitHub issue comment import now has two layers: the comment itself remains a `tiinex.discovery.finding.v1` wrapper, and an embedded Tiinex artifact inside the exported `## Source Markdown` fenced block is recovered as a separate loaded artifact when present. The recovered artifact keeps its original schema body and points to the GitHub comment as source/origin metadata. This is recovery/import provenance, not canonical approval or preservation.

The in-app Lineage Back action is no longer a browser-history back helper. It is a workspace-local view-state transition from Lineage to Discovery using route replace. Browser Back remains available as browser navigation, which is safer in multiworkspace roots.

Reference transition self-selection is no longer rewritten into Continue. Parent/target selection may choose any loaded artifact surfaced in Feed, Lineage, or Tree, including the same artifact, because transition semantics own source/result boundaries rather than a hardcoded UI shortcut.


## CP206 implementation note

Workspace export now defaults to Local, with Sources second and All last. GitHub issue discovery's broad anonymous scan is explicitly open-issue-only, while explicit issue/comment permalinks remain resolvable as source anchors.

GitHub issue import recovers embedded Tiinex markdown from both issue bodies and comments. Recovery accepts `## Source Markdown` and `## Source Markdown Excerpt` fenced blocks, preserves the wrapper `discovery.finding`, stores source/recovery metadata on the recovered file/node, and uses deterministic recovered paths so rediscovery updates rather than duplicates the artifact.

## Export Scope And Adapter Inference Handoff Notes

This handoff note focuses on export setup UX continuity after GitHub artifact recovery work.

Key behavior:

- Scope order in the staged export modal is now `Local`, `Source`, `All`.
- Scope mode is preserved in `sessionStorage` until the browser session ends.
- Source selections are preserved with the scope when `Source` is selected.
- `defaultExportModal()` infers non-local adapter defaults from the selected lineage and workspace sources.
- Local is filtered out as a semantic adapter for inference.
- GitHub issue/discussion/comment permalinks can seed GitHub adapter/surface/target defaults.

Important boundary:

- Adapter inference is not proof or publication.
- It only chooses a sensible UI default for the export routine.
- GitHub remains browser-only and no-write/no-token/no-auth/no-telemetry.

Browser tests:

1. Open export for a local-only workspace. Expected: Download + Local default.
2. Open export from a selected artifact whose lineage/source/recovered origin references a GitHub issue. Expected: GitHub adapter default, issue surface, known target available.
3. Change scope to Source, close, reopen before browser close. Expected: Source remains selected with prior source IDs.
4. Close browser/session and reopen. Expected: first-use fallback Local.
5. Verify scope order: Local left, Source middle, All right.

## CP208 Handoff Note — GitHub Export Compact Target Routine

The GitHub export routine now treats inferred `Reuse known` targets as bounded target-continuity state. A known target from artifact/source provenance can satisfy the target step without a redundant manual validation click. This is not proof that a GitHub comment was posted; it only means the target is known enough for the browser-only manual routine.

`normalizeGitHubUrlForComparison()` is now the canonical helper for target/signature URL equality. It preserves GitHub issue/discussion comment anchors where present and prevents stale copy/open/verify signatures from comparing raw, differently-shaped URLs.

For `create-new`, the routine still shows a separate Verify row because Tiinex cannot know the final published URL until the user creates the GitHub issue/discussion and pastes the result back. For `reuse-known` and `paste-existing`, target acceptance lives in the compact Target row.
# CP209 — GitHub export auto-finish and post-export cleanup

- Final GitHub export completion closes the dialog and refreshes Discovery instead of leaving a no-op Done step.
- Focus/visibility return can trigger a throttled destination check for the active GitHub export routine; no aggressive polling is added.
- Local/generated artifacts with canonical markdown identical to a non-local recovered/source artifact are pruned after export completion.
- Resolved discovery.finding wrappers are hidden from default Discovery when a recovered embedded artifact exists; wrapper files remain in workspace provenance.
- Boundaries unchanged: no GitHub write/auth/token/backend/telemetry; recovered artifacts are not automatically truth/evidence/preservation/canon.


## CP210 Handoff Note — Export focus stability and resolved finding shells

The GitHub export routine should not render just because the browser tab regained focus. Focus/visibility is only a low-frequency opportunity to check a valid target URL. If no valid target URL exists, the routine returns without render so copy/open state is not visually disrupted while the user works in GitHub.

Discovery findings from adapters are now treated as bounded adapter shells when they have a meaningful artifact attached: recovered embedded markdown, a generated interpretation/feedback child, or a recoveredFromPath link. Default Discovery hides those resolved shells and shows the meaningful artifact lineage instead. The wrapper remains in workspace data and can still be surfaced by explicit search/filter for provenance or audit.

## CP211 Handoff Note — Discovery findings as inbox shells and working leaves

Discovery findings now act as unresolved adapter observations by default. A finding remains a primary working card only while it represents new/unknown/ambiguous material. When the user or adapter produces a typed child artifact, recovered embedded artifact, or explicit artifact that references the finding as its basis, default Leaves-only Discovery treats that typed artifact as the working leaf and hides the resolved finding shell.

The shell is not deleted. It remains provenance/audit context and is available through explicit search/filter or Tree without Leaves only. Tree with Leaves only shows terminal working artifacts, while non-leaf Tree can show the issue/comment/finding hierarchy.

Time Portal filtering now applies to GitHub issue/comment adapter observations. The repo-file snapshot shortcut is limited to repo file surfaces; issue tracker material is live social material and must respect the selected Time Portal window.

## CP212 implementation note

CP212 addresses the scenario: a GitHub issue body contains a typed/recovered Tiinex artifact, while a newer issue comment is raw/untyped. CP211 working-leaf semantics were correct once the comment was present, but startup/source refresh could skip or cache issue comment re-import for existing issue surfaces. CP212 treats issue/comment surfaces as live social material: known issue targets are `configuredIssueUrls + discoveredIssueUrls`, existing issue surfaces are re-read on restore/refresh, and user/post-export issue reads use hard refresh. The intended result is that typed material is shown as the working artifact, while newly-added raw comments appear as unresolved `discovery.finding` leaves instead of being hidden by stale source state.


## CP213 Handoff Note — Comment findings attach to typed issue body artifacts

CP213 fixes the GitHub discovery case where an issue body contains a typed/recovered Tiinex artifact and later comments are untyped. Comment findings now use the recovered issue-body artifact as their parent when available. This keeps default working-leaf Discovery aligned with user continuity: the raw unresolved comment is the active leaf, while the typed topic is an ancestor rather than a parallel feed card.

GitHub issue comment findings also get human-facing labels. The imported finding title/summary use comment text and author rather than the opaque GitHub comment id, and the read presenter shows the observed material. The adapter still keeps provenance metadata and body hashes; the change is presentation and continuity, not a claim that raw comments are canonical typed artifacts.


## CP214 implementation note

CP214 changes expanded-card ergonomics without changing lineage semantics. `renderDiscoveryFindingSummary` now treats observed/comment material as the primary delta, shows source context as compact metadata chips, and moves adapter limits/interpretation into collapsed context. `renderTopicSummary` gives topic artifacts a schema-aware presenter. Feedback/task/evidence/pointer presenters now put user-authored content before secondary metadata so Discovery and Lineage previews feel like working artifact cards rather than adapter tables.

## CP216 implementation note

CP216 treats GitHub export as a presentation surface as well as a transport surface. Outbound bodies contain a human-first summary for GitHub readers, then an explicit `tiinex-artifact-start` marker before the source markdown. Import/recovery should ignore the presentation above that marker when recovering Tiinex artifacts. This keeps GitHub issues readable without making the convenience header part of the canonical artifact payload.

## Viewer bridge implementation note

This package treats GitHub as a presentation surface with a return bridge into Tiinex.

Outbound GitHub markdown now includes an `Open in Tiinex` line when the exported artifact has a public source URL or selected GitHub target URL. The URL points to `https://tiinex.dev/#state=...` with route state that can load the relevant source and select the artifact by path/title. Route/source loading was extended so GitHub issue URLs are handled by the live issue importer instead of raw file fetch.

The human GitHub presentation remains non-canonical. The stable import boundary is still the `tiinex-artifact-start` marker followed by `## Source Markdown`; importers should ignore presentation content above the marker when a recoverable Tiinex artifact exists below.


## CP218 implementation note

CP218 fixes the browser-observed GitHub export checklist reset. The URL pasted after publication is now treated as a result anchor and clears only verification fields (`verified`, `verifiedSignature`, resolved metadata, errors), preserving prior Copy/Open completion state and signatures. `githubResetRoutineState` still resets Copy/Open/Verify for target/mode changes. GitHub draft titles now use `markdownTitleFromFile(file)` directly without schema/path suffixes; schema context remains in the body and Tiinex payload.


## CP219 implementation note — GitHub issue URL web fallback

Explicit issue URL import now routes through `fetchGitHubIssueThreadWithFallback`. It first calls the GitHub REST issue/comment API. On REST failure, including stored/session rate-limit guards, it attempts `fetchGitHubIssueThreadViaWeb`, which fetches the public GitHub issue page through the separate `github-web` adapter/rate-limit bucket and parses title, issue body, comments, authors, timestamps, and embedded Tiinex source markdown from rendered HTML. The resulting API-shaped issue/comment objects then flow through `loadGitHubIssueIntoWorkspace`, so issue-body embedded artifacts and untyped comments share the same discovery/working-leaf behavior as the normal API path. If web fallback also fails, existing target-only fallback remains.

## CP220 implementation note

CP220 changes the GitHub issue adapter fallback semantics:

- Browser HTML scraping of GitHub issue pages is still best-effort and may fail due CORS/HTML changes.
- The reliable fallback is now local continuity cache + publication-origin binding.
- New storage key: `tiinex.github.issueThreadCache.v1`.
- GitHub issue thread cache entries store sanitized issue/comment bodies, URLs, timestamps, cache source, freshness, repo, issue number, and cachedAt.
- `fetchGitHubIssueThreadWithFallback` prefers fresh cache when asked, then tries REST, then web fallback, then stale cache, then throws.
- `loadGitHubIssueIntoWorkspace` delegates to `loadGitHubIssueThreadSnapshotIntoWorkspace`, so API, web fallback, cache, and locally verified publication snapshots all flow through the same issue/comment discovery rules.
- Finalizing a manual GitHub export now queues `scheduleGithubExportPublicationAnchorImport`, which reconstructs the just-published issue/comment body from the copied draft and binds it to the verified issue URL. This avoids relying on immediate API availability to preserve continuity.

Known limitation:
- A never-before-seen public issue cannot be fully read without either GitHub API access, a readable web fallback, or a prior/local publication cache. In that case the adapter must keep a target-only finding and clearly avoid claiming freshness.

## CP221 implementation note

CP221 changes GitHub issue detail import semantics:

- `fetchGitHubIssueThreadWithFallback` now attempts fresh local thread cache, public reader fallback, GitHub web fallback, then GitHub REST API by default. `preferApiFirst` can restore API-first order.
- `fetchGitHubIssueThreadViaReader` and `parseGitHubIssueThreadReaderMarkdown` provide a best-effort public markdown reader path for GitHub issue pages. The parser extracts embedded Tiinex artifacts and comment-like blocks into the same `{ issue, comments }` snapshot shape used by the API path.
- Successful issue imports call `removeGitHubSocialTargetPlaceholder` so target-only placeholders do not remain beside real loaded issue material.
- `workspaceGitHubIssueUrls` scans source configuration, loaded file metadata, node metadata, and markdown bodies for GitHub issue URLs; `activeGitHubIssueUrls` can merge those with configured/discovered issue targets.
- GitHub export boundary text now documents Publication Origin / Origin Binding so verified GitHub URLs are explicitly part of publication provenance.

Caveat: browser validation is necessary. Unknown public GitHub issues still cannot be loaded if API, reader/web fallback, and cache all fail. The UI should keep target-only placeholders in that case instead of pretending fresh material was read.


## CP222 implementation note

CP222 changes the GitHub issue fallback strategy and persistence boundary. Known issue targets are saved through workspace export as Issue URL entries plus an encoded Issue Thread Cache when available. Registering a GitHub source merges that cache back into local browser cache. Explicit issue reads now try public reader/API proxy paths before spending GitHub REST detail requests. If all readers/API/cache fail, Tiinex remains honest and keeps a target-only placeholder rather than fabricating issue body/comments. GitHub discussion UI is intentionally disabled until a real discussion adapter exists.


## CP223 implementation note

GitHub issue fallback behavior was adjusted after target-only issue cards continued to appear as ordinary discovery leaves when public issue material could not be read. Reader/proxy URL generation was corrected, and target-only/unavailable GitHub issue findings are now classified as source gaps rather than working artifacts. They remain inspectable through explicit discovery filters/search but should not compete with actual imported topics/comments in the default feed.


## CP224 implementation note

GitHub issue fallback has an explicit no-API paste importer. When browser-readable cache/reader/web/API paths fail, `Import issue` opens a modal where the user can paste GitHub issue page text, saved HTML, Jina/reader markdown, or API/cache JSON. The pasted material is normalized via the same issue/comment snapshot loader as API imports, so it must not create a separate adapter semantics path. Target-only GitHub issue findings remain source gaps, not working leaves.

## Package 225 implementation note

The GitHub issue fallback diagnosis established that direct `github.com` issue pages are not a valid automatic client-side fallback because CORS blocks them. The fallback chain now relies on cache, public reader/API reader, reader markdown, and then GitHub API with stale rate-limit guard bypass for explicit configured targets. Direct HTML parsing remains available only for pasted/saved issue material. If a browser can fetch API or reader material, target-only `GitHub Issue #N` placeholders should be superseded by normal issue/comment import through the same discovery pipeline.


## Package 226 implementation note

Browser validation showed GitHub issue detail fallback was not a network availability problem: reader endpoints returned HTTP 200 and contained Tiinex markers, but the app still degraded to a target-only issue gap. Package 226 adds a first-class Jina API-reader issue loader before REST fallback and before generic GitHub page-reader parsing. If it succeeds, it returns the same thread shape as the REST API loader, so `loadGitHubIssueThreadSnapshotIntoWorkspace` can recover typed issue-body artifacts, untyped comments, and working-leaf continuity through the existing path.

## Package 227 implementation note

CP227 fixes the Jina API-reader comments path rather than changing UX. Diagnostics showed `https://r.jina.ai/http://https://api.github.com/repos/Tiinex/docs/issues/9/comments?per_page=100` returns reader markdown containing a GitHub comments JSON array, but raw newlines/control characters inside `body` strings make `JSON.parse` fail. `jsonFromPossiblyWrappedText` now repairs control characters only while inside JSON strings before retrying parse, so issue/comment snapshots can continue through the existing GitHub issue loader.

Adapter rate-limit persistence moved from session-only to localStorage + sessionStorage via the existing `tiinex.adapter.rateLimit.*` keys. `fetchGitHubIssueThreadWithFallback` now keeps reader-side guard bypass for configured/user-initiated issue targets, but passes `ignoreRateLimitGuard: false` to the GitHub REST fallback so remembered API rate limits are not bypassed by frequent refreshes.

## CP228 implementation note

CP228 addresses the post-CP227 regression where issue #9 still degraded to a target-only fallback even though browser instrumentation proved Jina reader issue/comment endpoints were reachable. The issue was narrowed to comments parsing: Jina-wrapped GitHub API comments can look like JSON but contain raw control characters in `body` strings. CP228 keeps strict JSON parsing first, then falls back to a non-eval loose GitHub comment extractor for Jina API reader text. This should recover comments and let `fetchGitHubIssueThreadViaJinaApiDirect` return a real issue thread instead of throwing when issue body is empty and comments are present but non-strict.

## CP229 implementation note

CP229 continues the GitHub issue fallback work after CP228. It treats the user's browser instrumentation as proof that Jina reader access works while strict JSON parsing of Jina comments fails. The implementation now:

- adds loose issue extraction for Jina-wrapped GitHub API issue payloads,
- improves loose string boundary detection for markdown-heavy JSON-like fields,
- uses loose comments when strict parsing yields an empty/non-array result, not only when strict parsing throws,
- applies the same loose fallback to the public-reader API path,
- keeps GitHub REST API as last resort behind the remembered rate-limit guard.

Use CP229 as the next patch candidate for validating issue #9 import parity with the API path.

## CP230 implementation note

CP230 follows the CP229 browser instrumentation. The Jina reader fetches were successful, so the patch validates that parsed Jina API payloads are truly the requested GitHub issue/comment shape before using them. If a strict parser returns a nested GitHub object or a non-comment array, the adapter falls back to loose reader extraction instead of continuing to later fallbacks or creating a target-only issue gap.

## CP231 implementation note — GitHub issue import issue import trace

CP231 is intentionally instrumented. Do not treat it as the final Jina fallback fix. Ask the browser tester to trigger GitHub source hard refresh and then run `TiinexDiagnostics.githubIssueImportTraceJson()`; use the resulting trace to identify whether failure occurs during adapter fetch, parser normalization, fallback orchestration, issue-thread loader, workspace insertion, indexing, or feed rendering.

## Package 232 implementation note

The GitHub issue import observability trace isolated the issue #9 failure to a missing runtime helper, not Jina routing or parser semantics. Jina API direct parsed the issue and comments successfully; sanitization failed at `cleanCachedGitHubIssueItem` because `cleanWhitespace` was referenced by GitHub reader/web helpers but was not defined in the app runtime closure. Package 232 defines a local whitespace normalizer and leaves the adapter pipeline unchanged.

## Package 233 implementation note

Package 233 follows the successful Package 232 import. The issue was no longer access or parsing; it was recovered-artifact continuity. GitHub issue/comment imports were adding embedded Tiinex markdown exactly as published, including Parent Trace links that pointed to GitHub blob paths from the publication context. Those paths are not necessarily loaded or even present in the source repo, so lineage mode showed target unavailable and the feed treated parent/child artifacts as disconnected leaves.

The importer now rewrites the Parent envelope of recovered embedded artifacts to the local parent node that is known during import, then recomputes parent-target integrity. This preserves explicit continuity inside the loaded workspace while keeping `recoveredFromPath` and `recoveredFromUrl` as origin/provenance for the GitHub material.

## Package 234 implementation note

Package 234 follows successful GitHub issue import. The remaining adapter polish was not access or parsing, but continuity hygiene: recovered artifacts could keep source/publication-time Parent metadata, and local copies could remain beside identical imported source copies after publication/discovery. The patch strips top-level Parent declarations before applying recovered local parent edges and prunes exact local duplicates after issue-thread import. Use As relation semantics were intentionally not redesigned here; transition schema-driven authoring should own that broader behavior.

## CP235 implementation note

Package 235 follows the successful GitHub issue import path. The remaining cycle warning was caused by traversal identity using `browseUrl` first. Recovered artifacts generated from the same GitHub issue/comment share the same URL, so traversal incorrectly treated distinct loaded artifacts as revisiting the same node. The traversal key now prefers storage/path identity. Local shadow pruning also ignores integrity and top-level parent-block differences when content is otherwise title/schema-compatible, so local copies can be removed after the same artifact is recovered from GitHub.

## Package 236 implementation note

Local shadow pruning now has two comparable identities: full canonical markdown and schema/title/body semantic content. The latter is necessary for GitHub recovered artifacts whose body is identical to a local working copy but whose envelope differs because it has been reparented, assigned source scope, or regenerated with source integrity. Removal still requires title and schema compatibility to avoid deleting unrelated local artifacts with similar prose.

## Package 237 implementation note

This package is a GitHub-presentation polish pass after the issue-reader adapter stabilized. It does not change reader/parser/import semantics. It reduces GitHub issue/comment body noise by stripping generated Transition Boundary sections from the visible presentation layer, keeps Tiinex boundary details compact, and clarifies social-origin labels for parent/source links so issue/comment/discussion provenance remains distinguishable from Git file provenance.

## Package 238 implementation note

Package 238 introduces source-aware edit semantics. `canEditNode` now allows source/imported cards, but `saveNodeEdit` writes non-local edits to the Local source and records `shadowSource*` metadata. Render logic suppresses source-original cards that are shadowed by a local draft and inserts a compact `Open original` control under the draft; expanding it renders the original source card without making it compete as a normal feed item.

## Package 239 implementation note

The user reported that Edit appeared too far right on imported cards and that resolved GitHub discovery findings still appeared as duplicate lineage cards under typed artifacts. Package 239 changes the action ordering in `nodeActionItems` and hides resolved finding wrappers in `renderLineageNodeList` unless selected. This is intentionally a UI/continuity polish patch; it does not change GitHub fetch, parser, import, or local shadow pruning semantics.

## CP240 implementation note

Open original shadows should be shown in lineage view only, directly under the local draft that shadows a source artifact. Discovery feed view should not render the Open original separator. CP240 also improves rich markdown list hierarchy for indented bullet/ordered lists in authoring/editor surfaces.

## Package 241 implementation note

The adapter-aware edit shadow UX had two remaining issues: `Open original` rendered in lineage view but had no action handler, and local drafts could lose their source shadow identity or miss persistence if the user refreshed immediately after saving. Package 241 wires the toggle action, persists local draft shadow metadata, preserves that metadata on later local edits, and flushes local workspace state immediately after edit saves.

## Package 242 implementation note

This package addresses local draft continuity after adapter-aware edits. The app now anchors lineage to the saved local draft immediately and defers startup local-state merge until the hash-restored workspace exists. This is intended to keep local edits visible through F5 and to prevent the user from having to leave Lineage view to rediscover a newly saved draft.

## Package 243 implementation note

Package 243 fixes the adapter-aware edit shadow contract. Origin URLs are provenance and may be shared by a wrapper finding and multiple recovered artifacts, so a local draft must resolve its original through exact edited artifact identity before falling back to shared origin. The package also makes local-state restore less one-shot during static `#view` reloads: if saved local files are still missing, restore can retry and startup source mutations are prevented from clobbering the pending local profile.

## Package 244 implementation note

Local workspace save should persist local user deltas, local drafts, uploads, and local generated material, not the full adapter-recovered source graph. Generated files with GitHub/source identity are considered rebuildable adapter material and are excluded from local workspace state snapshots. On quota pressure, the app also clears regenerable browser scroll, lens, GitHub issue import trace, commit cache, and issue-thread cache entries before retrying the local state write.

## Package 245 implementation note

Local draft discard is now treated as the inverse of local draft save. The app removes matching local files from runtime state, removes matching entries from the persisted local workspace snapshot, and forces a save that is allowed to clear the last local delta. This avoids stale local drafts returning after Discovery rerender or reload.

## CP246 implementation note

CP246 follows CP245's local draft discard work. The observed failure was not a GitHub adapter problem; it was local workspace state attempting to save while delete had temporarily removed the active local profile, causing a null source lookup and leaving the local draft visible after discard. Explicit discard saves now pass a no-auto-connect guard, source lookup helpers tolerate null workspaces, and active discovery progress is rendered in lineage views.

## CP247 implementation note

CP247 corrects the post-discard fallback path for adapter-aware local drafts. A GitHub discovery finding that wraps a typed embedded Tiinex artifact is now treated as a resolved source envelope for ordinary feed/lineage visibility, even when a local shadow draft has just been removed. Discarding a selected local draft now prefers the exact original source artifact as the next Lineage anchor.

## CP248 implementation note

Local draft discard is now treated as a source-aware operation. Removing a local edit draft should keep lineage anchored to the exact typed original source artifact instead of falling back to Discovery. GitHub social discovery wrappers are also marked as resolved envelopes when they contain embedded typed Tiinex material, preventing them from reappearing as normal working leaves after a local draft is discarded.

## Package 261 implementation note

GitHub issue/comment export now distinguishes editing an existing source comment from publishing a new continuation comment. A local continuation artifact should not inherit the continued comment as an update target. It should open the parent issue/comment as context, publish as a new GitHub comment, and verify against the new comment permalink or by matching the copied body. On import, recovered Tiinex markdown should prefer the embedded Parent origin's GitHub comment as the Tiinex parent when the source-backed parent is loaded; the GitHub issue remains the container/source surface, not the Tiinex parent edge.

## Package 262 continuation publication note

GitHub continuation publication should be treated as `create-continuation-comment`, not `update-existing-comment`. The ordinary user path is Copy, Open context, post a new comment, then Verify. The Verify action should scan the known issue for the copied body first; the comment permalink field is a fallback override shown after a Verify attempt, not a primary requirement.

Outbound continuation payloads should carry machine-readable parent anchors when available. Import/recovery should resolve Tiinex parentage through the embedded parent comment URL/comment id or parent artifact path before falling back to the GitHub issue container.

## Package 263 Git-native source adapter research note

Package 263 begins the Git-native source adapter breakthrough path. The current GitHub repo-file path remains functional but is now explicitly observable as a raw-file fallback. Future work should prefer `GitSourceAdapter` semantics: resolve a Git source state, acquire or reuse a local object snapshot, scan Tiinex artifacts locally, and use web/permalink lookup only as a bounded fallback when the local source state cannot answer.

This is important for Time Portal support. A Git-native adapter should resolve refs, commits, trees, and blobs locally when available, and should treat Parent Origin permalinks as recovery anchors rather than the first material read path. GitHub issue/comment snapshots remain provider social surfaces; they must not own repo-file discovery.

## Package 264 Git-native runtime spine note

Package 264 adds an executable Git-native adapter spine without switching the active GitHub discovery path yet. The new service is dependency-injected and isomorphic-git-compatible: callers provide `git`, `fs`, `dir`, optional `http`, cache, progress, and provider helpers. This preserves Tiinex client-side-first boundaries by avoiding hidden CDN, proxy, token, or backend assumptions.

The canonical direction is now concrete: repo discovery should acquire or reuse a Git source snapshot, list Tiinex artifact candidates from the local object store, and read blob text by commit/path. Parent Origin and other permalinks remain recovery anchors used after local Git/source capabilities cannot answer. Time Portal support should prefer commit/tree/blob source states over web-origin lookups.

The raw GitHub path remains a working fallback, but diagnostics now separate duplicate full raw URLs from basename collisions so repeated filenames such as `001.trace.md` across different directories do not become misleading evidence.

## Package 265 Git-native browser runtime bridge note

Package 265 adds the browser-side runtime bridge needed before switching repo discovery away from raw GitHub file reads. The bridge lives in `src/app/git-native-runtime.js`, is loaded before `app.js`, and exposes explicit browser diagnostics for runtime status and a clone lab.

This package keeps Tiinex's boundary discipline: no hidden CDN, no hidden CORS proxy, no token requirement, and no backend is selected by Tiinex. Callers can explicitly provide or load isomorphic-git, LightningFS, and GitHttp, then run a shallow clone lab that lists `.topics` candidates and reads blobs from the local Git object store. GitHub browser clone requires an explicit `corsProxy` or an explicit direct-clone override; permalinks and web endpoints remain fallback/recovery anchors after local Git capabilities cannot answer.

## Package 266 LLM note — Git-native Buffer dependency

CP266 keeps raw GitHub repo discovery as the active product path while hardening the explicit Git-native clone lab. CP265 testing showed `Missing Buffer dependency` from isomorphic-git in the browser. The runtime bridge now loads a Buffer module only during explicit vendor/runtime loading, reports Buffer availability in runtime status, and returns structured clone-lab failure diagnostics unless `throwOnError` is requested. Do not treat this as a full source-discovery switch; it is still a prerequisite bridge for the future local-object-store-first Git adapter.

## Package 267 LLM note — Git-native clone lab stage diagnostics

CP267 keeps raw GitHub repo discovery as the active product path while hardening the explicit Git-native clone lab. CP266 testing reached a new layer where the runtime was available but file-listing could fail with an unstructured `undefined.filter` error. The runtime bridge now separates clone, ref resolution, tree walk, `listFiles`, and blob-read stages in diagnostics, reports non-array list results explicitly, and can reuse an existing local clone/object store before trying to clone again. Do not treat this as a full source-discovery switch; it is still a prerequisite bridge for the future local-object-store-first Git adapter.

## Package 268 LLM note — Git-native discovery bridge

CP268 is the first package where repo-file discovery can prefer the Git-native local object store when the browser runtime is explicitly available. The app still does not silently load a vendor runtime or choose a CORS proxy. If the user has run the explicit clone lab or configured `TIINEX_VIEWER_OPTIONS.gitNative`, discovery attempts `acquireSnapshot`, lists Tiinex artifacts from the resolved Git commit, and reads file text via local Git blob reads before any raw-web fallback.

Treat raw GitHub file fetches as bounded fallback/recovery, not the intended canonical path. Time Portal/source-state work should prefer the resolved Git commit/tree/blob anchors recorded by the Git-native path. GitHub issue/comment discovery remains a separate social/source surface and should not be merged with repo-file Git discovery.

## Package 269 LLM note — Git-native activation gate

CP269 fixes the CP268 gap where the explicit Git-native discovery command stored configuration but did not initialize the runtime. `TiinexDiagnostics.enableGitNativeDiscovery(...)` now calls `ensureRuntime(...)` and reports readiness, while repo discovery passes persisted Git-native config into status/snapshot acquisition. If the runtime is ready, the intended path is local Git object-store discovery; raw GitHub file reads remain fallback. The no-hidden-CDN/proxy/token/backend boundary remains intact.

## CP270 handoff note

Git-native repo discovery is active from CP269. CP270 only tightens diagnostics: `githubRepoFetchSummary()` now includes a `gitNative` section and no longer counts Git-native bytes as raw bytes. Use `verdict: git-native-active` as the quick signal that repo-file discovery is reading from the browser-local Git object store rather than `raw.githubusercontent.com` per artifact.

## CP271 handoff note

CP271 makes Git-native discovery activation durable. The explicit enable command persists sanitized runtime/proxy/vendor options in localStorage, repo discovery hydrates that config before choosing the Git-native path, and diagnostics expose `gitNativeDiscoveryConfig()` plus `disableGitNativeDiscovery()`. Continue to treat raw GitHub file reads as fallback; the intended canonical path after explicit enablement is local Git object-store discovery.

## CP272 handoff note

CP272 is an observability guard for Git-native testing. `enableGitNativeDiscovery(...)` now clears the repo-fetch trace by default and reports `traceCleared: true`, so `githubRepoFetchSummary()` after a refresh is no longer polluted by raw requests from a previous startup/auto-discovery run. `githubRepoFetchLastSessionSummary()` is available for quick mobile-friendly confirmation of the latest repo acquisition path.

## CP273 handoff note

CP273 makes explicit Git-native discovery own secondary repo material reads too. If `TiinexDiagnostics.enableGitNativeDiscovery(...)` has enabled the runtime, `fetchText()` intercepts matching `raw.githubusercontent.com/<repo>/<ref>/<path>` URLs and reads the blob through `TiinexGitNativeRuntime.readGitText(...)` from the browser-local Git object store. This closes the CP272 gap where discovery itself was Git-native but integrity/material/parent-style reads could still hit raw GitHub URLs. `githubRepoFetchSummary()` now includes raw-bridge counters under `gitNative`.


## CP274 handoff note

CP274 makes the Git-native raw bridge canonical across both repo-material read entrypoints. CP273 intercepted `fetchText()` callers, but DevTools showed remaining `app.js:800` raw GitHub fetches from direct `adapterRequest()`/`adapterFetchText()` callers. CP274 moves the Git-native bridge into `adapterRequest()` as well, before the network `fetch(...)` line. With explicit Git-native discovery enabled for `Tiinex/docs`, matching `raw.githubusercontent.com/<repo>/<ref>/<path>` reads should return local Git object-store text and no longer appear as raw repo-file network requests. Raw fallback stays explicit/degraded.

## CP275 handoff note

CP275 adds a hard network gate for Git-native repo reads. CP274 bridged `fetchText()` and direct `adapterRequest()` calls, but browser Network still showed `app.js:829` fetches. CP275 broadens detection to any URL convertible to `raw.githubusercontent.com/<repo>/<ref>/<path>`, supports embedded/proxied raw URLs, tries `.topics`/`topics` path aliases, and blocks raw network fetches for the explicitly enabled Git-native repo unless an explicit raw fallback override is passed. After enablement, a matching Tiinex/docs repo artifact read should either come from `TiinexGitNativeRuntime.readGitText(...)` or fail as a Git-native/local-object-store issue; it should not silently hit raw GitHub as normal discovery/material flow.


## CP276 - Git-native startup bootstrap

- Hydrates persisted Git-native discovery config before bootFromUrl so restored/default source loading can use the local Git object store without a console enable step.
- enableGitNativeDiscovery now persists default repo/ref/rootPaths (`Tiinex/docs`, `master`, `.topics`) so later startup has enough context to initialize the runtime.
- Adds bootstrap trace events (`git-native.bootstrap.start|ready|failed`) for startup diagnostics.


## CP277 handoff note

CP277 makes Git-native startup the packaged default for the Tiinex/docs viewer. Earlier packages required an explicit console call or persisted localStorage config before init behaved like a Git-native run; CP277 seeds `TIINEX_VIEWER_OPTIONS.gitNative` directly in `index.html` with the Tiinex/docs repo/ref/rootPaths and explicit runtime/proxy settings. On a fresh packaged load, `ensurePersistedGitNativeDiscoveryRuntime('startup-before-boot')` should have enough context to prepare the runtime before `bootFromUrl()`. The expected browser Network shape is now like the previous post-refresh state: GitHub issue/social requests can remain, but `.topics/...` repo artifact reads should not use raw.githubusercontent.com as the normal startup path.

## CP278 handoff note

CP278 is the closure pass for the Git-native repo-material path. CP277 seeded packaged startup with Git-native config, but browser Network still showed raw repo artifact fetches during init. CP278 installs a startup-time `window.fetch` gate that intercepts matching `raw.githubusercontent.com/<repo>/<ref>/<path>` requests for the configured Git-native repo and returns a synthetic `Response` from the browser-local Git object store. This protects discovery, integrity verification, secondary material reads, and any direct raw fetch caller from silently using the previous raw GitHub path. GitHub issue/comment/social requests remain normal provider-specific network reads; repo-file material should use local Git objects unless explicit raw fallback is requested.

## CP279 handoff note

CP279 reframes the Git-native cleanup as repo-material source ownership. Use `readRepoMaterialText(...)` as the semantic boundary for GitHub file material before ordinary network fetch. Matching Tiinex/docs material should read from the browser-local Git object store first; raw permalink fallback remains allowed only as an explicit degraded path. Integrity targets now use the same rule and should become unavailable/deferred when an object is not present in the shallow local store instead of silently fetching raw permalinks. `githubRepoFetchSummary().repoMaterial` is the quick diagnostic section for `gitNativeSuccess`, `rawFallbackExplicit`, `rawFallbackBlocked`, `rawPassThroughUnexpected`, and `integrityDeferred`.
