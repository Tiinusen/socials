# CP329 — placement picker foundation

CP329 follows CP328 after field testing showed the raw Folder text input was not respectful enough for ordinary users. Artifact storage placement now uses a tree-backed picker flow instead of asking users to type folder paths.

Changes:

- Build identity now reports a compact location/hash summary instead of echoing the full shared state hash.
- The artifact wizard shows Folder as a selected placement with a Choose folder action.
- Choose folder temporarily switches visible workspaces to Tree view so the user can pick placement from the same spatial model used for browsing.
- Folder picker preserves prior view/selection state and restores it when the picker is cancelled or a folder is chosen.
- Tree folders show a Select action during placement picking; ordinary add buttons are hidden while the picker is active.
- Cross-workspace folder selection is deferred when the draft already has a same-workspace parent, avoiding silent continuity breakage before Move/Rewire exists.

Validation gate remains the publish-readiness chain, not legacy `npm test` static hygiene.

# CP329 — placement picker foundation

CP329 follows CP327 after field testing showed the browser had no trustworthy build identity signal and `routeLoadPresentationReport()` could be missing in deployed code. The primary goal is to make route-owned startup/back behavior observable and to seed artifact storage placement without starting the full Move/Rewire feature yet.

Changes:

- Added `TiinexDiagnostics.buildIdentityReport()` so field tests can prove which source bundle is actually running.
- Expanded `TiinexDiagnostics.routeLoadPresentationReport()` into a session-based report with render events and content-clear tracking.
- Route restore now records whether it reused, refreshed in place, or destructively recreated workspaces.
- Route-owned GitHub source loads suppress intermediate issue/status renders so repo material does not flash as complete before configured issue surfaces finish.
- Added `TiinexDiagnostics.parentOriginContinuityReport()` to expose unresolved parent/origin edges such as orphaned “Awaiting response” leaves.
- Added `TiinexDiagnostics.artifactPlacementReadinessReport()` and a wizard path/folder preview. Continuity parent and storage path are now visible as separate concerns before save.
- Child artifacts default their storage folder from the parent artifact folder unless the user overrides the folder.
- Public build checks now require CNAME, favicon, build identity meta, and route-load diagnostics in the bundle.
- Clean repo zip format is repo-root direct: no `site/` wrapper, no duplicate `work_cp*` folder, no `.git`, `.site-publish`, `.nojekyll`, or `tiinex.bundle.js`.

Manual checks requested:

1. Replace repo root from the clean zip while preserving `.git/`.
2. Publish and confirm `TiinexDiagnostics.buildIdentityReport()` reports release `328`.
3. Open a shared `#state` link and confirm the route-load report is present, not `null`.
4. On mobile, swipe back/forward and confirm content is not cleared when source signatures match.
5. Open an artifact wizard from a parent and confirm Folder + Path preview defaults to the parent folder.
6. Run `TiinexDiagnostics.parentOriginContinuityReport()` and inspect unresolved parent edges before doing any manual repair.

# CP327 — single startup progress + favicon

CP327 follows CP326 after field testing showed `bootFromUrl` was only called once, but the route-owned GitHub source load still looked like two loads: repo material rendered once, then the configured issue/social surface continued and the user saw loading return. The app also lacked a favicon, causing `/favicon.ico` 404s.

Root cause:

- Route-owned startup used the same source load presentation as ordinary repo discovery. Repo discovery cleared `ws.loading` and rendered after repo files finished, even when configured issue discovery still belonged to the same route source load.
- The source repo had a Tiinex logo asset, but neither source nor public build emitted `favicon.ico`.

Changes:

- Initial route-owned GitHub loads now use the continuous source-refresh progress path, keeping one progress presentation until repo files, configured issue URLs, broad issue discovery, finalization, and render completion are done.
- Added `TiinexDiagnostics.routeLoadPresentationReport()` for route-owned loading state.
- Added root `favicon.ico` generated from the Tiinex logo and linked it from `index.html`.
- Public build now copies `favicon.ico`; public check requires it.

Validation focus:

- Fresh `#state` load should show one continuous loading phase and then content, not content flash followed by a second loading phase.
- Browser/mobile back with an already materialized matching workspace should reuse the workspace without clearing visible cards.
- `https://tiinex.dev/favicon.ico` should no longer 404 after publish.

# CP326 — route restore reuses materialized sources

CP326 follows CP325 after field testing showed that initial load and mobile back/swipe could still clear the current workspace, show discovery progress, briefly render content, and then reload the same source again.

Root cause:

- Route/source equality still compared runtime source resolution details such as access mode/resolution kind, and route state carried active discovered issue URLs as if they were editable source config.
- After the default workspace was materialized, the later route restore could decide the already-loaded workspace was a different source and recreate it from scratch.

Changes:

- Browser route matching now compares editable source config only: repo, requested/default ref, root paths, enabled surfaces, and explicitly configured Issue URLs. Runtime access mode, resolution kind, resolved commit observation, and discovered/imported issue URLs no longer make a loaded workspace look like a different source.
- Route state now persists configured Issue URLs as source config; active/discovered Issue URLs remain material, not route identity.
- If a route source is the same base repo/ref/root but config changed, route restore refreshes that workspace in place instead of clearing the whole app.
- `TiinexDiagnostics.routeAndLocalStateContinuityReport()` now reports the last route-apply decision and route/current source signatures.

Validation focus:

- Fresh load with an existing `#state` route should not run the Tiinex/docs workspace discovery twice.
- Mobile back/swipe should restore view state without blanking the feed and rebuilding the same source from zero.
- Source edit changes such as adding an explicit Issue URL may refresh in place, but should not clear all existing cards first.
- Run `TiinexDiagnostics.routeAndLocalStateContinuityReport()` and check `routing.lastApplyRouteState`.

# CP325 — route/local continuity + mobile lineage chrome

CP325 follows CP324 after field testing showed that mobile lineage inherited collapsed discovery chrome, local workspaces with GitHub sources could be merged into the default Tiinex/docs workspace on restart, and public deploys needed CNAME to survive force-orphan publishes.

Changes:

- Mobile lineage entry now expands mobile chrome when selecting or restoring a lineage route, so the lineage toolbar/search does not inherit a collapsed discovery feed state.
- Local-state restore now treats local payload workspaces as workspace-continuity identities first; repo/ref is only a remote resolver fallback and must not absorb separate local workspaces into Tiinex/docs.
- Public build now writes `.site-publish/CNAME` from `PAGES_CNAME` or root `CNAME`.
- Added root `CNAME` for `tiinex.dev`.
- Added `TiinexDiagnostics.routeAndLocalStateContinuityReport()`.

# CP324 — workspace config source truth

CP324 follows CP323 and a field report that Save workspace exported the active GitHub source as local-only. The root cause was export-state ownership: the base route state filtered out workspaces with no generic URL list before the GitHub-source wrapper could attach repo/ref/root/issue config, so `.workspace.md` export fell back to a local entrypoint.

Changes:

- Save workspace/export now keeps GitHub workspaces even when they have no generic URL list.
- `.workspace.md` export writes GitHub entrypoints again instead of `Source Kind: local` for source-backed workspaces.
- Editable GitHub source refs preserve the requested branch/tag such as `master`; resolved commits are stored separately as `Resolved Commit` metadata.
- Explicit Issue URLs are durable source anchors and import/refresh even if broad Issue Discovery is off.
- Issue Discovery checkbox now owns bounded repo-level issue discovery, not whether explicit Issue URLs are honored.
- Added `TiinexDiagnostics.workspaceSourceConfigReadinessReport()`.

Validation focus:

- Add/edit `Tiinex/docs` with ref `master`, root `.topics`, and explicit issue URLs for issues 9 and 10.
- Save workspace and confirm the exported `.workspace.md` has `Source Kind: github-tree`, `Repository: Tiinex/docs`, `Ref: master`, both `Issue URL` lines, and not `Open On Apply: no` for that entry.
- Re-open/edit the source and confirm the Ref field still shows `master`, not a commit permalink/hash.
- Refresh the source and confirm explicit issue URLs are attempted regardless of the broad Issue Discovery checkbox.
- Run `TiinexDiagnostics.workspaceSourceConfigReadinessReport()`.


# CP323 — top-bound mobile chrome collapse

CP323 follows CP322 plus mobile field-video review. CP320 removed the scroll jump by keeping chrome behavior stable, but the field video showed the remaining tradeoff: hidden chrome could still leave the reading surface feeling under-used. This pass changes ownership from scroll-direction toggles to a top-bound threshold.

Changes:

- Mobile reading chrome no longer expands just because the user scrolls slightly upward mid-feed.
- Workspace chrome compaction and global mobile reading chrome now share one near-top hysteresis helper.
- Chrome collapses after the feed is a little away from the top and expands only when the feed returns to the top boundary.
- `TiinexDiagnostics.sourceChromeStabilityReport()` now reports the active feed top and chrome threshold values.
- No source loading, schema rendering, share, evidence persistence, or publish workflow behavior changed in this checkpoint.

Validation focus:

- On mobile, scroll down enough to enter reading mode, then scroll slightly up/down in the middle of the feed. The header/source/search chrome should not repeatedly resize the content.
- Return almost to the top of the feed. Chrome should expand before the first card can hide under the header.
- Run `TiinexDiagnostics.sourceChromeStabilityReport()` and confirm `thresholds`, `mobileReading`, and workspace `feedTop` match the observed state.


# CP322 — publish workflow runtime gate

CP322 follows the CP321 deploy attempt. The public-branch workflow was still using `npm test` as its publish gate even though the current milestone validation treats `npm test`/static hygiene as non-blocking when package-history and material-pipeline warnings are known and unrelated to the runtime change.

Changes:

- Publish workflow no longer blocks on `npm test`.
- Publish workflow now runs the same runtime/public readiness gate used for checkpoint validation: app syntax, public build, public build check, bundled syntax, metrics, and storage scan.
- The Node 20 GitHub Actions runtime deprecation annotation is left as a warning, not treated as the failing condition.
- No viewer runtime code, source loading, share, schema rendering, or mobile UX behavior changed in this checkpoint.

Validation focus:

- GitHub Actions publish should fail only on the runtime/public readiness commands needed to produce `.site-publish`.
- Known strict static-hygiene failures should remain visible in local `npm test`/`npm run validate`, but should not block public branch publishing until they are cleaned in their own pass.


# CP321 — schema edit ownership + preview filter truth

CP321 follows CP320 field testing. It fixes two user-visible trust regressions without changing share, evidence persistence, or source loading.

Changes:

- Schema-aware edit saves are now owned by the edit path instead of falling through to the generic create-artifact path.
- Empty wizard fields no longer emit instructional placeholder text into artifact markdown, so presentation/read views do not make placeholders look user-authored.
- Preview material filter counts are scoped to the current non-preview feed result instead of the whole workspace.
- Preview/search/filter narrowed feed states render all current matches without requiring Show more.
- Added `TiinexDiagnostics.previewMaterialFilterReadinessReport()` for preview count/show-more ownership checks.

Validation focus:

- Edit a root/local artifact through schema-aware edit and save it; it should update in place, not attempt to create a duplicate path.
- Leave optional wizard fields empty; read/presentation views should not show `Describe ...` instructional placeholder text.
- In Preview → Images/Text/URL/File, chip counts should describe the current narrowed feed, and empty state text should not contradict the selected count.
- Preview/search/filter narrowed views should not show a Show more footer.



# CP320 — source rail + no-jump mobile chrome

CP320 is a focused UX hotfix after CP319 mobile polish testing. It does not change evidence persistence, share, route ownership, or schema rendering.

Changes:

- Workspace sources are now owned by a one-line horizontal source rail.
- Source rail is left-aligned and horizontally scrollable on desktop and mobile.
- Mobile source rail hides its scrollbar so users can swipe horizontally without the row looking like a broken wrap layout.
- Single-source workspaces keep the source rail visible so source settings/actions remain reachable.
- Mobile reading chrome keeps its layout slot while fading out; content no longer jumps down/up when chrome expands or collapses.
- Added `TiinexDiagnostics.sourceChromeStabilityReport()`.

Validation focus:

- Mobile: source row should use one row and swipe horizontally.
- Desktop: source row should also stay in one row and scroll when needed.
- Mobile: scroll down/up should fade chrome without pushing the card list.


# CP319 — value-first polish consolidation

CP319 is a focused milestone-polish pass after field testing CP318. It does not add a new product feature; it reduces visual debt around mobile source/search controls, evidence material density, Display Options, and search result windowing.

Changes:

- Discovery and Lineage toolbar search now share one responsive width model so the search field does not jump between modes.
- Mobile source chips are treated as a compact horizontal source summary instead of wrapping into awkward rows.
- Discovery search now renders all search matches instead of keeping the lazy discovery window and forcing users to press Show more after a focused query.
- Evidence with inline image preview now keeps Material and Provenance attached as compact expandable metadata under the visual evidence instead of stacking tall independent cards.
- Mobile card action rail gets a final containment pass so Edit/More cannot stretch into wide bars.
- Display Options on mobile uses clean vertical pickers, visible labels, compact chips, and stacked Time Portal controls.
- Added `TiinexDiagnostics.uxPolishReadinessReport()` for search/toolbar/material UX checks.

Validation remains runtime/UI-led for this pass: the static public build is clean, and the intended confirmation is visual testing on desktop and mobile.

# CP318 — explicit route startup guard

CP318 fixes the remaining startup polish issue visible on slow/mobile loads after CP317: explicit `#state=`, public hash, and `?url=` routes should be the only source-loading owner during init. The default persisted Git-native bootstrap is now skipped before route restore when an explicit route already owns the source.

Changes:

- Explicit route/source hashes skip `startup-before-config` and `startup-before-boot` default Git-native bootstrap.
- The route source can still use Git-native inside its own discovery path; this only removes the pre-route/default source bootstrap.
- Startup diagnostics now report whether Git-native was bootstrapped before route or skipped because the route owns source loading.
- Empty discovery feed during active loading now says `Loading workspace source…` instead of `No nodes match this view.`
- This avoids the professional UX problem where the app looked empty while the route-owned workspace was still loading.

Diagnostics:

```js
TiinexDiagnostics.startupRouteInitReport()
```

Expected on cold `#state=` / readable public hash route:

- `summary.routeOwnsSourceLoading: true`
- `summary.applyConfigWorkspaceState: false`
- `summary.bootstrapGitNativeBeforeRoute: false`
- `gitNativeBootstrap.beforeRouteBootstrap: false`

# CP317 — startup single-pass route ownership hotfix

CP317 fixes an acute production/mobile regression where startup could appear to load the workspace twice. The root cause was config workspace state and explicit URL route state both trying to own initial workspace loading.

Changes:

- Explicit `#state=` routes now own startup source loading.
- Public/readable hash targets such as `#github.issue|...` own startup source loading.
- Direct `?url=` imports own startup source loading.
- Viewer config / `.workspace.md` identity can still load branding/help, but it no longer preloads the default workspace state when the URL already contains an explicit source route.
- `bootFromUrl()` now has a single-flight wrapper so duplicate startup calls are recorded and skipped rather than executing twice.
- Initial `#state=` restore reuses an already matching workspace source signature instead of forcing `recreate=true`.
- `file:// #view=` still keeps the old behavior because view routes need an existing workspace before the view selection can apply.

New diagnostic:

```js
TiinexDiagnostics.startupRouteInitReport()
```

Expected result after cold load with a shared/exact URL: one source owner, one discovery/material load pass, and no visible render → clear → reload cycle.

# CP316 — mobile action owner rail

CP316 makes mobile card actions value-first by giving mobile cards their own action owner instead of continuing to compress the desktop `.post-actions` bar.

Changes:

- Desktop keeps the existing `.post-actions` rendering.
- Mobile now hides the desktop action bar and renders a separate `.mobile-card-action-rail`.
- The mobile rail shows primary actions only: Read, Markdown, Share, Edit when available, plus More when secondary actions exist.
- Secondary actions such as Continue, Reference, Use As, Source, Remove, and adapter/import actions move into the existing mobile More sheet.
- Parent-picking mode still exposes the parent-select action directly in the mobile rail.
- Mobile source chips are tighter and horizontal-scrollable so source context does not break into awkward multi-line rows.
- Added `TiinexDiagnostics.mobileActionOwnershipReport()`.

This is intentionally a light ownership refactor rather than another CSS-only override. The goal is same semantics as desktop, not the same physical layout.

# CP315 — mobile value pass + image inspection controls

CP315 follows CP314 after field testing showed that evidence images were now visible inline, but image inspection, mobile action density, provenance presentation, and mobile Display Options still needed polish.

Changes:

- Evidence provenance is no longer duplicated as a long one-line meta pill; it remains in the structured Provenance section where list semantics are preserved.
- Mobile card actions switch to a single compact horizontal row with icon-only affordances, reducing vertical boilerplate while keeping actions reachable.
- Workspace source chips are tighter on mobile and use horizontal overflow rather than breaking the source row into awkward stacked fragments.
- Material image preview now has two inspection modes: `Fit` for full-image review and `1:1 / pan` for close inspection inside a scrollable surface.
- Mobile image preview uses a fullscreen-ish surface with compact header/footer and safe-area padding.
- Display Options mobile picker cards are cleaned up: schema/artifact select rows collapse to one clean column, helper labels no longer float over the controls, and Time Portal collapses without horizontal overflow.

Diagnostics added:

```js
TiinexDiagnostics.previewInspectionReadinessReport()
TiinexDiagnostics.displayOptionsMobileReadinessReport()
```

# CP314 — evidence inline preview actually visible + mobile action containment

CP314 follows CP313 after browser validation showed that the inline Evidence image preview still did not appear in expanded/read views when the material was a local/draft asset. The root cause was material filtering: local assets and local-unavailable image refs were removed before the evidence presenter could see them.

Changes:

- Local/draft material refs now survive the referenced-material filter so Evidence presenters can render inline image previews.
- Evidence inline preview now works for local assets as well as source-backed images.
- Material list formatting preserves top-level markdown bullets instead of stripping them from Evidence Material / Observed Material.
- Supported Claim multiline plain text is rendered as a list when it was entered as one line per item but lacked explicit bullets.
- Mobile card action rows are contained in a stable compact grid up to tablet-ish widths, preventing Edit/Continue/Reference from stretching past the viewport.
- `TiinexDiagnostics.evidenceInlinePreviewReadinessReport()` now includes `materialRefCount` and richer image ref details.

Manual checks requested:

1. Open an Evidence artifact with a local image in expanded card view.
2. Open the same artifact in Schema Read View.
3. Confirm the image appears inline and opens the existing preview/lightbox.
4. Confirm Evidence Material and Supported Claim list formatting reads naturally.
5. Check mobile width: card actions should stay contained and not stick out past the viewport.

# CP313 — evidence inline image preview + list readability

CP313 follows the evidence persistence hotfix. The local image asset now survives refresh, but the read surfaces still made the image feel detached: evidence expanded/detail views showed only material metadata while the actual visual evidence lived behind a separate preview. This pass integrates image evidence into the evidence presenter itself.

Changes:

- Evidence presenter now renders image material inline inside expanded and detail read views.
- Inline image cards use fit-contain thumbnails and open the existing image lightbox on click.
- Evidence detail/expanded views avoid duplicating image material in the generic referenced-material section when an inline image preview is already shown.
- Local/unavailable image material is represented as local-only/unavailable instead of a source link.
- Markdown list rendering now supports indented continuation lines under list items.
- Markdown list spacing is tightened so evidence/provenance lists read less like broken nested boilerplate.
- Added diagnostic: `TiinexDiagnostics.evidenceInlinePreviewReadinessReport()`.

Manual browser validation requested:

1. Open the evidence artifact with a local image in expanded/read mode. The image should appear naturally inside the Evidence presenter near Material.
2. Open the same artifact in detail/read view. The image should appear there too.
3. Click the inline image preview. The existing lightbox should open.
4. Refresh/F5 and verify the image still appears or is clearly marked local-unavailable.
5. Confirm lists in Supported Claim / Material / Provenance read with normal list rhythm.

# CP311 — value-first UX trust gate

CP311 is a focused trust-gate pass before moving from the viewer/share work toward schema building and later Leaflet modes. The goal is not new capability; it is making the current field experience respect the user's screen and material boundaries.

Changes:

- Local/draft evidence asset paths such as `assets` or `assets/...` no longer resolve to guessed GitHub source URLs when the local asset is unavailable after refresh.
- Missing local evidence assets render as local-only/unavailable material instead of web URL/source material.
- Local asset recovery now also scans bare evidence lines such as `- Source: assets` in addition to markdown links.
- Mobile card actions are value-first: compact horizontal action row, expand/anchor hidden, no full-width boilerplate rows for Edit/Continue/Reference/Use As.
- Added diagnostic: `TiinexDiagnostics.valueFirstUxReadinessReport()`.

Validation run:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

# CP310 — field mobile UX + evidence asset roundtrip cleanup

CP310 follows CP309 field/video review. It targets runtime UX regressions rather than new product scope.

Changes:

- Mobile card actions are compact again: same semantic order as desktop, no expand action, no full-width Edit/Continue/Reference rows.
- Source strip on mobile is more compact and horizontally scrollable so source chips do not dominate the viewport.
- Camera remains a single native image/camera picker action.
- Draft/local evidence image links recovered from markdown now become file/image attachments rather than URL attachments.
- Bare `assets/...` or `_assets/...` URL attachments are flagged as suspicious by diagnostics.
- Recovered local image attachments can reuse local workspace assets for preview when available.
- Draft/local cards do not show guessed GitHub Source links.

Diagnostics:

```js
TiinexDiagnostics.evidenceAssetRoundtripReport()
TiinexDiagnostics.fieldRegressionReadinessReport()
TiinexDiagnostics.mobileActionLayoutReadinessReport()
TiinexDiagnostics.evidencePreviewReadinessReport()
TiinexDiagnostics.routeReuseReadinessReport()
```

# CP308 — mobile action parity + evidence preview polish

CP308 follows CP307 after field/mobile testing found three publish-facing regressions: card actions on mobile no longer matched the desktop semantic order, evidence image preview could crop/overflow and the close button was unreliable because the overlay was injected outside the normal app binding root, and browser back/forward to an already loaded public hash target could clear the workspace and trigger a new discovery pass.

Changes:

- Mobile card action rows keep the same semantic order as desktop while hiding only the expand/anchor affordance to save space.
- Mutating actions such as Edit, Continue, Reference, and Use As no longer stretch into separate full-width rows on mobile.
- Evidence Camera is now a single native image/camera picker action with no front/back app-level choice.
- Evidence image preview uses almost the full viewport, preserves image aspect ratio, avoids crop/hidden overflow, and allows browser pinch zoom by removing the old viewport zoom lock.
- Evidence preview close works through a document-level handler because the preview overlay is rendered outside the normal app event-binding root. Backdrop click and Escape also close it.
- Back/forward to an already loaded public hash target reuses the existing workspace instead of clearing workspaces and running discovery again.
- Added diagnostics: `TiinexDiagnostics.mobileActionLayoutReadinessReport()`, `TiinexDiagnostics.evidencePreviewReadinessReport()`, and `TiinexDiagnostics.routeReuseReadinessReport()`.

Browser/mobile validation is still the deciding signal before publishing.

# CP298 — Cross-workspace reference/use-as parity

CP298 follows CP297 after browser testing showed that Reference and Use As still behaved as if the selected parent had to live in the same workspace as the referenced/basis artifact. That discriminated based on origin and broke the golden rule for multi-workspace Tiinex work: any visible artifact should be able to anchor a relation when the user explicitly chooses it.

Changes:

- Parent-placement picker is now global across visible workspaces.
- Reference flows preserve the referenced artifact workspace separately from the destination parent workspace.
- Use As flows preserve the basis artifact workspace separately from the destination parent workspace.
- Wizard context chips show when the target/basis comes from another workspace.
- Generated transition bodies include source workspace boundary lines for cross-workspace relations.
- Linked Artifacts and Discovery Finding Basis sections use cross-workspace-aware labels/hrefs.
- Exact-view modal routing carries referenced/use-as basis descriptors with workspace identity.
- Added `TiinexDiagnostics.crossWorkspaceRelationPickerReport()`.

Browser validation is still required for visual UX and relation roundtrip behavior.

# CP296 — Full fallback read sections + schema parent fetch hygiene

CP296 follows CP295 after browser testing showed that registered schema presenters were improved, but fallback schema reads such as `decision` still used the old preview/excerpt path. That made expanded and detail read views show mid-section ellipses even when the user expected a full read. It also showed repeated repo-relative 404s when schema parent links from a non-schema repository pointed at canonical Tiinex schema material.

Changes:

- Fallback continuity/read sections now render full section bodies in expanded lineage cards and detail read views.
- `decision`, fallback `topic`, `feedback/evidence`, `task`, `reduction`, and generic unregistered schema section rendering no longer calls `markdownExcerpt(...)` in read mode.
- Generic fallback read now includes all non-continuity sections instead of slicing to the first five.
- `TiinexDiagnostics.presentationTruncationReport()` now inspects fallback read HTML too, not only registered schema presenters.
- Standard Tiinex schema parents under `.topics/.schemas/**/tiinex.*.schema.md` now prefer the canonical `Tiinex/docs` schema registry when the current repo is not `Tiinex/docs`, preventing accidental `Tiinusen/socials/.topics/.schemas/...` parent-fetch probes.
- Failed auto-parent fetches now have a short cooldown so a missing parent does not spam the network/console on every render.

Browser/video validation is still required for final UX judgment.

# CP294 — Presentation coverage audit

CP294 broadens schema presenter coverage so expanded cards and detail read views do not silently omit important artifact sections. Topic artifacts now surface intro/body content, Current Read, Design Direction, Next Artifacts, Good Child Candidates, and Transition Boundary with markdown-preserving read blocks. Feedback, task, evidence, pointer, resource, and instrument presenters now surface more context in detail view while keeping compact cards readable. New diagnostics: `TiinexDiagnostics.presentationCoverageReport()` and `TiinexDiagnostics.presentationCoverageForActive()`.

# CP291 package note — Prose rhythm and browser translate stability

CP291 follows CP290 after browser validation showed that markdown structure and nested GitHub continuity were materially better, but the reading experience still needed more visual rhythm and Chrome Translate could flicker when app view changes rewrote the URL hash.

Changes:

- Artifact prose now has more intentional spacing before headings, paragraphs, lists, blockquotes, and code fences.
- Expanded preview and detail/read view use the same prose rhythm rules while still allowing preview density to stay compact.
- UI chrome such as topbar, workspace strip, badges, buttons, actions, modal headers, and footer is marked as non-translatable.
- Artifact titles, summaries, preview sections, and rendered artifact bodies are marked as translatable surfaces with lightweight `lang` hints where possible.
- Public readable share hashes are preserved during normal route writes instead of immediately being rewritten to `#view=<base64>`.
- When browser translation appears active, static local route writes preserve the current URL and keep view state in `history.state`, reducing Chrome Translate churn.
- Diagnostics now expose `TiinexDiagnostics.translationStabilityReport()` and `TiinexDiagnostics.activeLanguageSurfaceReport()`.

This does not add a translation engine. It keeps translation native/browser-friendly and leaves future Tiinex translation as an explicit transition/presentation artifact instead of a silent source mutation.

# CP290 package note — Presentation fidelity and nested GitHub continuity

CP290 follows CP289 after browser testing showed that share-target launchers are useful, but the next product-quality boundary is not more share UI. Share should be built on top of consistent artifact presentation and trustworthy nested continuity.

Changes:

- The expanded card preview and detail artifact body now use a shared safer markdown presentation path for headings, paragraphs, links, code fences, blockquotes, ordered lists, nested lists, and line breaks.
- Schema presenter primary-read blocks now preserve lightweight markdown structure instead of flattening list-like material into one paragraph.
- Fallback continuity previews now use the same renderer so expanded view and detail view are closer to each other.
- GitHub issue/discussion-style recovered embedded Tiinex artifacts now keep a linear parent cursor while importing comments. A recovered leaf can become the fallback parent for the next recovered leaf, instead of every recovered comment artifact falling back to the issue body/root.
- Existing explicit parent binding is still preferred when a comment payload carries a Tiinex Parent GitHub Comment or transition parent signal.
- Diagnostics now expose `TiinexDiagnostics.markdownRendererSmokeTest()` and `TiinexDiagnostics.githubIssueNestedContinuityReport()`.

This is deliberately a hardening release, not the final Share UI. It prepares for later Share-as-transition/presentation work by making sure the thing being shared is presented consistently and keeps its parent chain.

# CP289 package note — Share target launchers and workspace routing

CP289 follows CP288 after browser testing showed that public hash target routing could load focused issue targets, but manual hash typing made cold-start tests slow and error-prone. It also starts treating share targets as typed entrypoints instead of only artifact URLs.

Changes:

- Added `open/*.html` launcher files that redirect relatively to `../index.html#...`, so a local zip can be tested by double-clicking an HTML file instead of manually editing the browser address bar.
- Added `#workspace|https://.../*.workspace.md` as an explicit workspace target shape.
- Added `.workspace.md` auto-detection for visible hash URLs.
- Workspace share targets load as workspace entrypoints, while artifact/social targets still load as focused artifact/lineage entrypoints.
- Kept `#state=` and `#view=` compatibility for opaque exact app/view state links.

# CP287 package note — Cold-start public hash target restore

CP287 follows CP286 after browser validation showed that readable hash targets could be parsed and loaded when pasted into an already-open viewer, but a cold-opened link could still surface `options is not defined` during route/history restoration. The root cause was a small operation-boundary leak in `loadUrlsIntoWorkspace`: the function used `options.sourceProgress` without accepting an `options` parameter.

Changes:

- `loadUrlsIntoWorkspace(ws, urls, options = {})` now has an explicit options boundary, so hash-target boot and popstate restore do not throw after importing the shared source.
- `parseHashShareTarget(...)` now accepts both visible and URL-encoded public hash targets, including `#github.issue|https://...` and `#github.issue%7Chttps%3A%2F%2F...`.
- `startupHasExplicitSharedState()` now treats readable hash targets as explicit shared state, so local restore/autosave guardrails do not treat them like an ordinary empty/local startup.
- Existing `#state=` and `#view=` routes remain unchanged.

Expected browser result: opening a fresh viewer tab directly at `index.html#github.issue|https://github.com/Tiinusen/socials/issues/1` or `index.html#https://github.com/Tiinusen/socials/issues/1` should load the bounded GitHub issue target without the `options is not defined` warning.

# CP286 package note — Public hash target routing and viewer home boundary

CP286 follows CP285 after native Git source ownership and historical hydration reached a clean browser result. The next boundary issue was publication/share hygiene: GitHub outbound bodies could still emit local `file://` viewer links or opaque `#state=<base64-json>` links when a human-readable public source target would be better.

Changes:

- The viewer now accepts readable hash targets such as `https://tiinex.dev/#https://github.com/Tiinusen/socials/issues/1`.
- Explicit adapter hashes are supported, for example `#github.issue|https://github.com/owner/repo/issues/1`, `#github.discussion|...`, `#github.file|...`, and `#web.markdown|...`.
- Existing `#state=<base64-json>` and `#view=<base64-json>` routes are preserved.
- GitHub outbound `Open in Tiinex` links now use the configured public viewer base URL plus a readable target hash instead of leaking `file://`, localhost, or the full opaque route state.
- Workspace config can declare `Public Viewer URL` and `Workspace Home`; the default packaged viewer declares `https://tiinex.dev/`.
- The logo now behaves as a workspace/viewer home entrypoint instead of an external GitHub link by default.
- Diagnostics expose `TiinexDiagnostics.publicViewerShareUrlFor(url, adapter)`, `configuredPublicViewerBaseUrl()`, and `parseHashShareTarget()`.

Expected browser result: publication previews should show `Open in Tiinex` as a public URL such as `https://tiinex.dev/#github.issue|https://github.com/Tiinusen/socials/issues/1`; no generated GitHub body should contain `file://`, `localhost`, `127.0.0.1`, or `C:\Users\...` viewer links.

# CP285 package note — Progressive historical Git-native hydration

CP285 follows CP284 after browser diagnostics showed 17/19 historical integrity targets were hydrated through Git-native, but two older commit-pinned targets remained outside the default depth-64 local object window. Both problem commits exist in Tiinex/docs history; they were 94 and 205 commits behind the loaded snapshot, so the remaining issue was bounded history depth rather than missing files or raw permalink policy.

Changes:

- Git-native historical hydration now uses a progressive depth plan instead of one fixed `historicalDepth` fetch.
- The runtime still tries the exact commit SHA first, then deepens the declared history ref through bounded steps.
- Default browser config keeps initial clone `depth: 1` but allows historical hydration up to `historicalMaxDepth: 256`.
- `historicalMaxDepth`, `historicalDepthSteps`, and `timePortalMaxDepth` are accepted in the persisted Git-native config.
- Hydration diagnostics now include max depth/depth-step context for failed historical targets.

Expected browser result: `rawSuccess: 0` and `rawBytes: 0` should remain true, while the two CP284 blocked historical integrity targets should now resolve via Git-native progressive deepening instead of becoming `rawFallbackBlocked`.

# CP281 package note — Git-native fallback intent boundary

CP281 follows CP280 after browser validation still showed `.topics/**/*.trace.md` requests reaching `nativeFetch` from the global raw gate. The root cause is treated as policy debt: a persisted/global `allowRawFallback` setting must not silently reopen same-repo raw permalink reads once Git-native source ownership is intended. Raw permalink lookup remains supported, but only as a per-read explicit fallback/degraded path.

Changes:

- `rawFallbackAllowedForRepoMaterial(...)` no longer treats global persisted `allowRawFallback` as an implicit pass for same-repo material.
- The global fetch gate now rethrows Git-native bridge failure unless the individual fetch request explicitly carries `allowRawFallback: true`.
- Git-native raw-read enablement can use a loaded Git-native workspace owner even if session config is not currently enabled.
- `TiinexDiagnostics.githubRepoFetchSummary()` now defaults to the current/last source session instead of summarizing stale persisted trace events from older builds.

Expected browser result: fresh init should not show `raw.githubusercontent.com/Tiinex/docs/.../.topics/**/*.md` as normal Network requests. Historical/integrity objects unavailable from the shallow Git store should be reported as blocked/deferred, not silently fetched through raw.

This package narrows CP260 discovery/render continuity. Repo discovery no longer progressively remounts the feed during fetch progress by default, progress title updates no longer recreate the spinner element on every tick, and UX Back from Lineage applies a direct Discovery scroll restore with window growth so the user returns near the same Discovery position.

# CP260 package note

CP260 is a continuity patch after CP259. CP259 made refresh surfaces safe and progress more honest, but browser validation showed that progressive discovery renders could still reset scroll/spinner state while material was loading, and UX Back returned to Discovery at the top. CP260 keeps progress updates DOM-patched, disables feed-remounting progressive repo renders by default, and adds a direct UX Back Discovery scroll restorer that can grow the windowed feed before applying the remembered position. Browser Back/Forward and source/adapters semantics are unchanged.

This package narrows CP258 source refresh mutations. Refresh/Reset no longer prunes existing repo-file material unless an explicit source-save owns the surface change, stale GitHub comment replacement is limited to issue-snapshot entries for the same issuecomment id, and the source-refresh progress surface stays visible through the final render commit.

# CP259 package note

CP259 is a regression-safety patch after CP258. CP258 improved the source-dialog operation boundary, but browser validation showed Refresh/Reset could leave only issue-snapshot artifacts visible and dismiss progress before the final feed render. CP259 makes source refresh a non-destructive reconciliation path: it preserves existing repo-file surfaces unless a saved source config explicitly disables them, constrains stale issue-comment cleanup to the `issues` surface and the same comment id, and waits for the refreshed workspace render to settle before clearing source-refresh progress.

This package tightens source refresh operation ownership after CP257. GitHub source Refresh/Reset now has an inline modal progress boundary, overlapping source refresh actions are locked, issue snapshot import preserves existing GitHub source surface configuration, and refreshed GitHub comment snapshots replace stale source-backed artifacts for the same issue comment id.

# CP258 package note

CP258 keeps the stable publish/discard/local-draft behavior from CP257 while addressing the remaining source-refresh continuity gaps. Refresh/Reset cache from the GitHub source dialog now exposes progress inside the dialog instead of relying on corner toasts, and the action buttons are disabled while the source operation is running. Issue import no longer overwrites a repo source's `Repo files discovery` toggle when binding a publication/comment snapshot. When the same GitHub issue comment is re-imported after edit/publish, stale recovered source entries for that comment id are removed before the fresh source-backed artifact is added.

CP257 makes source refresh progress and UX Back scroll ownership more honest without changing adapter semantics. The source-refresh progress lifecycle now includes a final render/reconciliation phase after issue snapshot import, and the bar is dismissed only after the refreshed source has been rendered. Ordinary Refresh no longer passes hard-refresh semantics to issue import; it requests a fresh user-initiated reconciliation without clearing adapter caches. The advanced hard path is presented as `Reset cache` to reflect its purpose.

UX Back now restores the remembered Discovery scroll position captured before entering Lineage, instead of relying on whatever route scroll may have been overwritten while scrolling inside Lineage. Browser Back/Forward remains route/viewState-owned and unchanged.

# CP255 package note

This package fixes the CP254 regression where local-state reconciliation triggered GitHub issue discovery during restore. Local workspace restore is now a reconciliation pass only; it prunes already-published local draft shadows against loaded source-backed artifacts, but it does not start issue/comment discovery, show repeated import toasts, or re-render/apply URL view state in the background.

Pruned local draft state is saved through a post-restore flush after `app.localState.restoring` is false, so the same draft should not return on the next F5. Discovery remains on-demand through source init, explicit import/refresh, hard refresh, or publish verification.

# CP253 package note

This package makes verified GitHub publication binding consume the published local draft instead of leaving the workspace in a post-publish shadow state. When the no-auth GitHub routine verifies an existing issue comment by matching the live comment body, the app now imports/binds that publication anchor synchronously before closing the routine, removes the exact selected local draft from runtime and persisted local workspace state, then recomputes the workspace so the source-backed published artifact can take its place. The patch is intentionally narrow: it does not change discard, markdown presentation, time portal filtering, or broad GitHub discovery behavior.

The GitHub source copy is also clarified: issue snapshots are supported as source material while Discussions remain disabled until a real discussion reader exists.

# CP252 package note

This package keeps the manual no-auth GitHub publishing boundary, but makes existing-comment publication less manual and less misleading. `Open in Tiinex: view artifact` links now use the currently running Tiinex viewer URL instead of a hardcoded `https://tiinex.dev/` base, so local/dev builds can test the encoded lineage route before the app is published.

For existing GitHub issue comments, Verify can now use the known `#issuecomment-...` permalink when provenance provides it, fetch that comment through the read-only GitHub API, and require the live comment body to match the copied Tiinex draft. If no comment anchor is known, Verify scans the issue comments for an exact matching body. Returning from GitHub may run this same read-only check, but it no longer marks the routine complete from URL shape alone. The Open target checklist button now uses the same primary action styling as Copy and Verify.

# CP251 package note

This package tightens the manual GitHub publication routine without adding GitHub write/auth/server capabilities. Existing-issue publication now opens the best known GitHub permalink, including `#issuecomment-...` when the artifact provenance has one, so the user lands on the right issue/comment context before pasting. Returning from GitHub no longer auto-completes the routine from a known target alone; verification now requires the user to paste the resulting published GitHub URL, and existing-issue comment publication requires a comment permalink so Tiinex can bind the exact result instead of merely accepting the issue URL.

GitHub-facing outbound markdown is also simplified for human readers. The visible issue/comment body keeps title, summary, bridge line, and user-authored content first. All Tiinex parser material is moved into one bottom `<details>` block labeled `Tiinex source payload`, containing boundary notes, source markdown, and publication notes. This keeps create and edit publication output aligned while preserving the `tiinex-artifact-start` recovery marker for import/discovery.

# CP249 package note

This package fixes local-draft discard ownership for source-backed artifacts. Discarding a Local draft now deletes only the local shadow copy, preserves the non-local source file with the same artifact path, and re-anchors Lineage to the visible source original. If the saved original anchor resolves to a GitHub discovery-finding envelope, the selection prefers the recovered typed source artifact when available, so discard does not fall back to the adapter wrapper as the ordinary working card.

# Package 229 package note

Package 229 strengthens the Jina GitHub issue/comment reader fallback so explicit issue URLs can import issue body/comments without relying on GitHub REST detail calls. It adds loose issue extraction, improves loose string boundaries for JSON-like reader text, and applies loose extraction when strict parsing returns no usable comments.

# Package 227 package note

Package 227 fixes the verified GitHub issue fallback parser fault. Browser instrumentation showed that Jina reader can fetch both issue and comment API endpoints, but the comments response is JSON-like reader markdown where `comment.body` can contain raw control characters/newlines inside string literals. `jsonFromPossiblyWrappedText` now repairs control characters inside JSON strings before parsing, so Jina-wrapped comments can normalize into the same issue-thread shape as REST API comments.

Adapter rate-limit guards are now persisted in localStorage as well as sessionStorage, and GitHub REST detail fallback no longer bypasses a remembered rate-limit guard for explicit issue targets. Known issue detail reads should prefer cache/Jina-reader paths; REST remains a last resort and should stay quiet until the remembered reset time has passed.



# Package 226 package note

Package 226 focuses on the verified GitHub issue fallback root cause: direct GitHub issue HTML is CORS-blocked, but the browser can read issue material through Jina reader endpoints. The app now adds an explicit Jina API-reader issue thread loader before REST/API fallback, using the exact reader route shape that browser validation showed works. It also hardens wrapped-reader JSON parsing and slightly clarifies secondary enabled button styling so enabled neutral buttons are less easily mistaken for disabled buttons.
# CP224 package note

This package update adds a deterministic no-API GitHub issue material import fallback. If automatic browser readers, cache, and the GitHub API cannot read a configured issue target, the Import issue action opens a paste importer instead of silently acting like a successful discovery. Pasted GitHub issue page text, saved HTML, reader markdown, or API/cache JSON is normalized through the same GitHub issue/comment discovery pipeline as the API path, so embedded Tiinex artifacts, untyped comments, working leaves, and source provenance behave consistently.

# CP223 package note

This update tightens GitHub issue fallback behavior. Target-only GitHub issue/discussion placeholders are now treated as source gaps, not working artifacts, so they no longer appear as ordinary leaves in the default feed when no material was actually imported. Explicit discovery filters/search can still inspect them. The GitHub reader/proxy fallback URL set was corrected and broadened so public reader paths can succeed before consuming REST detail requests.

# CP222 package note

This package update tightens the GitHub social-source fallback contract. Issue detail import now tries local cache, public reader/API proxy fallbacks, GitHub reader/web fallbacks, GitHub REST, and then stale cache before retaining a target-only placeholder. Save Workspace now preserves active issue URLs and cached issue-thread snapshots in the workspace entrypoint where available. GitHub Discussions are disabled/greyed in source/export UI until a real discussion reader is implemented. The embedded default workspace includes https://github.com/Tiinex/docs/issues/9 as a workspace-scoped Tiinex/docs issue target, not as a global default.

# CP219 package note

CP219 updates the GitHub issue target fallback path. Explicit issue URLs now try the normal GitHub REST issue/comment import first and, when REST is rate-limited or unavailable, fall back to a GitHub web-page read/parser before creating a target-only placeholder. The web fallback feeds the same issue-root/comment/recovered-artifact discovery pipeline so typed issue bodies, embedded Tiinex source markdown, and untyped comments get the same working-leaf/continuity treatment when the public web page is readable.

# CP218 package note

This package fixes a GitHub export routine regression observed in browser testing. Pasting or verifying the published GitHub URL for a newly-created issue/comment no longer resets the already-completed Copy/Open steps, because the published URL is the result anchor of the draft rather than a mutation of the prepared body. Target changes still reset the routine because they can change the draft destination/semantics.

GitHub issue/discussion titles now use the user's artifact title exactly, without appending schema/path suffixes. Schema identity remains in the body presentation and machine-readable Tiinex payload; GitHub's native issue list should read like a normal human issue list.

# CP215 package note

This package polishes expanded Feed and Lineage cards toward a simpler social reading model. Inline presenters now avoid repeating the outer card title and summary, put the user-authored delta first, keep schema identity as a small Tiinex label, reduce low-signal metadata, and leave deeper adapter/provenance context available behind details. This keeps the view faithful to Tiinex boundaries while making expanded cards scan more like a normal social feed item.

# CP214 package note

Package 214 refines expanded card presentation after CP213 made GitHub comment continuity usable. Expanded schema presenters now prioritize the user-authored delta first, use compact Tiinex-style metadata chips for source/context, collapse adapter limits/context behind details, and add a topic presenter so typified working artifacts feel consistent with discovery findings.

# CP213 package note

This package keeps CP212's live GitHub comment refresh, then fixes the continuity gap for issues whose body already contains a typed Tiinex artifact and whose later comments are raw/untyped. Untyped GitHub issue comments now attach to the recovered typed issue artifact as their parent when the issue body provides one, rather than remaining disconnected under the adapter shell. In default Leaves-only Discovery this means the unresolved comment becomes the current working leaf and the already-continued topic no longer appears as a parallel leaf.

GitHub comment discovery findings are also presented in a more human form. The card title and summary now prefer the actual comment excerpt and author instead of the GitHub comment id, and the discovery finding read view surfaces the observed material so the user can understand the finding without decoding adapter metadata.

The discovery finding remains provenance/inbox state: raw comments are shown as unresolved findings, typed issue artifacts remain normal artifacts, and parent/working-leaf continuity determines which cards are primary in the feed.

# CP206 package note

This package keeps CP205's GitHub export/import continuity and tightens the first-time export defaults. Workspace export now defaults to `Local`, with `Sources` second and `All` last, because normal Tiinex export should prefer changed/local material over every loaded source artifact.

Bounded GitHub issue discovery continues to sample only recent open public issues when no explicit issue URLs are configured. Explicit issue/comment permalinks still resolve as bounded source targets, so a user can paste or retain `#issuecomment-...` URLs for continuity without broadening the default issue scan to closed material.

GitHub issue import now attempts artifact recovery from both the issue body and issue comments. The wrapper issue/comment findings remain as discovery provenance, but embedded Tiinex markdown from `## Source Markdown` or `## Source Markdown Excerpt` fenced blocks is recovered as a separate loaded artifact with its original schema/body. Recovered paths are deterministic per issue/comment so F5 or rediscovery updates the same recovered artifact instead of multiplying duplicates.

Recovered artifacts preserve GitHub issue/comment source metadata (`sourceOrigin`, `recoveredFromUrl`, `recoveryKind`) so later export target inference can reuse the original issue without asking the user to re-enter the issue number. This is still recovery/import provenance, not canonical approval, evidence, preservation, or truth.

# CP205 package note

This package keeps CP204's GitHub export action checklist, then tightens first-time export/import continuity. GitHub export target selection is now artifact-local: an inferred GitHub issue target from the selected artifact, its parent chain, source/origin text, or transition material defaults to `Reuse known` for that artifact instead of being overridden by a previous global modal choice. Changing target mode or URL resets copy/open/verify state because the prepared body and target semantics changed.

GitHub issue comment discovery now preserves the comment wrapper as `tiinex.discovery.finding.v1` while also recovering an embedded Tiinex source artifact from the exported `## Source Markdown` fenced block when present. The recovered artifact is loaded as its original schema/type with the GitHub comment as source/origin metadata; the wrapper remains provenance and does not become canonical truth/evidence/preservation by itself.

The in-app Lineage Back button is now workspace-local view-state navigation: it clears the selected lineage artifact and returns that workspace to Discovery with a route replace. It no longer calls `history.back()`. Browser Back remains the browser's global history navigation.

Transition parent placement remains view-agnostic across loaded artifact surfaces. Feed, Lineage, and Tree can all select a parent/target anchor during transition authoring, and selecting the same artifact as the reference/transition anchor is allowed instead of being silently rewritten into a Continue action. This matches `tiinex.artifact.transition.v1`: transition targets/results may be existing artifacts, new artifacts, relations, annotations, reports, projections, views, or no-output, and the UI must not hide that boundary as a hardcoded behavior.

# CP193 package note

This package keeps CP192 exact schema filtering, then makes the schema selector tree-shaped instead of a flat alphabetical list. The selector is still a native form control for accessibility and low-risk rendering, but its options are grouped by the new `.topics/.schemas/**` directory families and indented by schema path depth.

The important boundary is unchanged: folder placement is only a discovery/navigation hint; Current Schema and artifact content remain the semantic authority. The selector now scales with all known Tiinex schema paths plus any loaded workspace-only schema IDs, so leaf schemas such as `discovery.finding`, `schema.rule`, `artifact.annotation`, and `artifact.transition` are visible in their family context instead of being mixed into one long unsorted list.

Markdown artifact kind filtering remains separate from schema filtering. `.schema.md`, `.adapter.md`, `.origin.md`, `.tool.md`, `.interface.md`, and related suffixes are represented by the in-app markdown artifact kind registry so the UI can filter file roles without pretending that suffixes are lineage schema identity.

# CP189 package note

This package keeps CP188 public GitHub issue discovery, then fixes source-configuration hygiene so adapter-discovered/imported issues do not appear as explicit manual Issue/discussion URL targets.

The Issue/discussion URLs field is now reserved for human-configured social targets only. Bounded public issue discovery may import issue snapshots and comments, but those discovered URLs are tracked as adapter observations rather than written back into the source config. This prevents older CP187/CP188 issue #4/#5 test targets from making discovery look manually pre-seeded when the user is trying to test empty-config discovery.

GitHub issue material import remains read-only and unauthenticated. GitHub discussion targets remain target-only in anonymous browser mode until a future service-backed or explicit-paste enrichment path exists.

# CP188 package note

This package keeps CP187 adapter semantics, then makes the GitHub issue adapter useful without requiring manual issue URLs or a login. The embedded default Tiinex/docs workspace no longer carries the old issue #4 fallback. When issue/discussion discovery is enabled and no explicit social targets are configured, the viewer imports a bounded set of recent public GitHub issues and their comments as discovery findings.

GitHub Discussions remain target-only in anonymous browser mode because the viewer does not fake material import when it cannot reliably read body/comments through the conservative client-side source path. Imported issue/comment artifacts use the GitHub source `created_at` timestamp for their card date, while provenance still records when the adapter observed/imported the material.

# CP183 package note

This package keeps CP181/CP182 behavior, then adds a non-mutating authoring-style lint/display layer for schema body titles.

Browser validation found that newly loaded schema artifacts such as `Tiinex Claim v1 Schema` and `Tiinex Discovery Breakthrough v1 Schema` are root-valid enough to load, but their body H1 titles repeat information already carried by filename and Continuity Context. CP183 deliberately does **not** rewrite those schema artifacts. Instead it preserves them as live authoring-lint targets while giving cards a cleaner presentation surface title.

Changes:

- Adds `schema-body-title-style-v1` as an in-app, non-blocking style warning for schema artifacts whose body H1 redundantly includes `Tiinex`, `vN`, or trailing `Schema`.
- Adds a separate `displayTitle` derivation for schema cards; raw `node.title` / body H1 remains unchanged and is still available in detail/raw views and hover/title context.
- Shows a small `style` warning chip when the authoring-style lint detects the redundant title convention.
- Keeps route, scroll, browser history, lineage selection, source-access, and schema-badge fetch behavior unchanged.

No source artifact content is mutated. The point is to make the schema-builder/tooling skill visible before deciding whether future schema edits should normalize titles at authoring time.

# CP160 package note

This package adds a shared temporal view lens. Discovery and Lineage can now be viewed in Latest mode or through an As-of moment. The As-of projection uses origin/source version timestamps where available and falls back to artifact-created or observed/imported timestamps when an origin cannot provide version history. The UI is explicit about that limitation and does not claim archived revisions when only loaded artifacts are available.

# Tiinex Lineage Viewer

Tiinex Lineage Viewer is a static, client-side viewer for portable Tiinex markdown artifacts. It makes continuity, provenance, handoff, source material, and lineage visible without requiring a server, database, or AI runtime.

## What it works with

The viewer is centered on portable markdown and local asset files, especially:

- `.trace.md`
- `.schema.md`
- `.workspace.md`
- `.validator.md`
- `.adapter.md`
- `.origin.md`
- `.tool.md`
- `.interface.md`
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
- read external sources through a cache-aware, rate-limit-aware adapter request coordinator
- check origin policy/license/NOTICE files through bounded manifest-based discovery rather than blind probes
- save a portable `.workspace.md` view/lens configuration
- export a portable workspace archive through a client-side package/delivery pipeline

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
- Integrity validation are owned by the method-scoped browser verifier. Empty or missing `Continuity Integrity` means no claim yet; a method entry with `Value` is treated as a real claim. Local create/save finalizes a minimum checksum claim when the target is safe to compute.
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
- **Wizard relation context:** parent/reference context lives in the dialog header through `wizardHeaderContext()`, not as body-level relation cards or strips. Do not restore large relation adapter shell cards for Continue/Reference unless there is a new product reason.
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



## Export architecture

Workspace export is split into a package pipeline rather than a single button action:

```txt
ExportPlan
→ PackageResult
→ Delivery target
```

The plan owns selection, archive format, password mode, source scope, and client-side delivery intent. The package result owns exported entries, asset/file counts, non-mutating integrity refresh outcomes, and warnings. Delivery targets currently use browser download only; future contribution, copy, GitHub issue, Google Drive, or local connector delivery should attach as additional targets instead of becoming parallel archive owners.

Top-level `.workspace.md` saving is separate from per-workspace archive export. The former preserves the viewer/lens configuration; the latter packages workspace content. Both remain client-side and must not introduce telemetry or hidden uploads.

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

Generated integrity method entries use the commit-pinned canonical validator definition for `sha256-base64url-c14n-v1`. The app still accepts older plain method identifiers, but newly generated artifacts should link the method entry to `.topics/.validators/sha256-base64url-c14n-v1.validator.md`. Discovery treats registry-owned Tiinex markdown suffixes as first-class artifacts: `.trace.md`, `.schema.md`, `.workspace.md`, `.validator.md`, `.adapter.md`, `.origin.md`, `.tool.md`, and `.interface.md`. GitHub discovery queries the repository tree origin before falling back to the static flat-package listing, so newly committed support definitions are not hidden by package-cache staleness. Wizard step changes replace the dialog route entry so saving a created artifact does not leave an older wizard dialog behind browser Back.

### CP143g cleanup note

Referenced Material is attachment-oriented. Structural Tiinex links such as schema references, validator method definitions, trace/workspace artifacts, parent origin, and method-definition links are not shown as generic referenced material. They remain accessible through their dedicated source, schema, validator, validation, and lineage controls.


### CP143i image attachment preview note

Image attachment preview dialogs contain images inside the available dialog viewport instead of letting the image create an internal scroll area. Saved assets still expose source/download actions for full-size access, while unsaved or local-only previews prioritize a usable contained preview. Text previews remain scrollable because their content is not ratio-bound image media.


### CP143j ownership audit note

Discovery, Tiinex markdown artifact suffix detection, and Referenced Material now have clearer single-owner boundaries. GitHub discovery has one canonical implementation, registry-owned Tiinex suffix detection delegates to `TIINEX_MARKDOWN_ARTIFACT_REGISTRY`, and Referenced Material has one wrapper owner over the `nodeMaterialRefs` pipeline. Structural Tiinex navigation such as trace/schema/validator/adapter/origin/tool/interface links is not rendered through attachment actions.


### Artifact registry and Display Options note

Tiinex markdown artifact suffixes are now owned by a central registry rather than by separate discovery and display filters. The registry includes lineage traces, schemas, validators, workspace entrypoints, adapters, origins, tools, and interfaces. Display Options uses a scalable artifact category filter; it filters the current view only and must not determine which known Tiinex artifacts are imported during discovery.


### CP144 feed sort note

Feed and leaf sorting use markdown `Created At` as the primary authored timestamp. When `Created At` is only a date-level midnight value (`00:00:00`) and GitHub can resolve a latest commit for the same file on the same UTC date, the app uses that commit timestamp for ordering. This keeps recently changed schema, validator, and trace artifacts near the top without rewriting their authored continuity timestamp.

### CP145 method definition authority note

Integrity validation now separate three signals: byte-integrity result, method-definition availability, and schema authority. The canonical method definition for `sha256-base64url-c14n-v1` is shown as its own authority surface with open/copy actions when available in the workspace or as a pinned source link. Validation method definition artifacts also carry a visible `method definition` chip so they are not presented as ordinary narrative content.

### CP145b preview action ownership note

Material preview actions are modal-only actions. Preview material is rendered outside the card's primary selection target, and preview/open/copy controls stop click propagation so opening an attachment preview does not also select or anchor the artifact in Lineage mode.

### CP146 integrity entry foundation note

The integrity parser preserves all first-level method entries under `Continuity Integrity` and selects the first supported complete byte-integrity entry for current verification. Validation show the validation-entry count separately from the byte-integrity result and method-definition authority. Local save refresh does not collapse multiple method entries into one generated footer; generated artifacts still emit one linked `sha256-base64url-c14n-v1` entry until additional validation methods are deliberately introduced.

### CP147 multi-validation validation note

Integrity validation now render each parsed method entry as its own audit row. The currently evaluated byte-integrity entry is marked as active, while unsupported or duplicate entries are preserved and shown as not evaluated. Audit text reports evaluated entries, preserved unsupported entries, duplicate method entries, and incomplete entries with missing `Towards` or `Value`. Generated artifacts still emit one linked `sha256-base64url-c14n-v1` entry.


### CP148 draft/final integrity note

Draft/no-claim integrity is a valid local authoring state, not a checksum failure. Integrity validation now expose claim lifecycle, finality, and export-readiness signals separately from byte-integrity result, method-definition availability, validation entries, and schema authority. A missing or empty `Continuity Integrity` footer remains no claim; malformed method entries remain repair-needed claims; verified byte-integrity claims remain final method-scoped verification.


### CP149 export integrity refresh note

Workspace export runs a non-mutating integrity refresh pass before archive creation. Local self-target Tiinex markdown artifacts are refreshed in the exported copy when safe; source files, parent-target claims, unsupported claims, malformed claims, and multi-entry footers are preserved without changing the loaded workspace. Export keeps the archive root aligned with the exported content tree rather than adding a metadata folder. Export now has one canonical archive path for zip, tar, tar.gz, Tiinex AES-GCM packages, and Windows-compatible ZIP password mode. Windows-compatible ZIP password mode protects file contents while leaving file names and folders visible, and Tiinex can re-import those password ZIPs by prompting for the password. AES-GCM remains the stronger Tiinex-specific package mode.


### CP150 package/export/delivery note

Workspace archive export now exposes a plan/result/delivery contract. Export previews file, asset, archive, password, and client-side delivery choices before packaging, then shows a package result summary after download with counts and integrity refresh outcomes. The archive still contains only the selected workspace tree by default. No telemetry, hidden upload, or root metadata folder is added. Top-level `.workspace.md` saving is worded separately from per-workspace archive export.

### CP151b connector/origin adapter note

Connector behavior is now modeled by explicit origin adapter contracts rather than by one-off source types. Adapter capabilities distinguish discover/read/create/append/edit/replace/delete/patch, and guarantees distinguish addressability, mutability, versioning, hashability, author metadata, timestamps, deletion risk, client-side behavior, and telemetry. Edit-capable origins must be treated as preconditioned mutation surfaces, not silent replacement paths.

GitHub issue discussions are introduced as a social-origin adapter surface inside the GitHub source/community UX. A GitHub source can enable repo file discovery and issue discussion discovery independently; issue discussion discovery defaults on. Portable `.workspace.md` entrypoints can declare these surfaces so the default Tiinex docs workspace opens with both repo files and issue discussions enabled. GitHub source badges stay visible as the edit entrypoint even when there is only one source. Public issues are normalized as root topic nodes and comments become feedback nodes. Comment bodies are classified as structured, inferred, or raw; intent is classified as add, correct, comment, question, review, or unknown. These nodes are feedback/proposals only and do not replace the original lineage unless the lineage owner accepts them into their own draft/commit flow. Issue/comment body hashes preserve mutation signals for mutable GitHub content.

## Adapter request discipline

External-source adapters should use the shared request coordinator rather than calling `fetch()` directly. Browser HTTP caching remains the primary cache path. Tiinex adds only the coordination layer it needs: single-flight request de-duplication, rate-limit/backoff status, source refresh semantics, and visible discovery fallback/gap handling.

Adapters should expose or preserve capability metadata when available: cacheability, conditional-request support, rate-limit header support, recommended concurrency, auto-retry policy, auth scope, and preservation caution. A cached response is operational convenience, not preserved evidence. When a source signals `no-store`, `private`, auth-scoped access, or similar caution, Tiinex should default toward reference/finding behavior and require an explicit user decision before preserving material as evidence or embedded payload.

GitHub source refresh is read-only. `Refresh` is the normal source reconciliation path and must not clear Tiinex adapter caches. `Reset cache` is the advanced hard-refresh path: it clears Tiinex in-memory source cache for that source and still respects rate-limit/backoff; it must not become an automatic retry loop.

### CP152b6 Policy Lookup Transport

Policy/license/NOTICE discovery uses the shared adapter request discipline and avoids unauthenticated GitHub REST root-contents lookup during ordinary loads. The viewer checks a cache-friendly root manifest first, fetches only policy files that are actually present, and defers lookup rather than adding fallback probes when the manifest cannot be read.

### CP152b7 Use-As Flow

Discovery findings can now expose actionable `Can be used as` chips. Choosing one opens the artifact wizard for that schema while keeping the original finding unchanged. The generated artifact records the discovery finding as its explicit basis, so the app does not silently convert a finding into evidence, feedback, task, resource need, or pointer.

### CP152b8 Use-As Action UX

Use-as creation is now exposed as a primary action on discovery-finding cards instead of requiring the user to expand the card first. The `Use as` action opens a compact picker and then the same schema-aware wizard flow. `Continue` and `Reference` keep their original meanings: continuation and relation/reference. `Use as` remains the only flow that explicitly interprets a finding as feedback, task, evidence, resource need, pointer, or another target schema.

The expanded discovery presenter still shows `Can be used as`, but those chips are contextual rather than the only path to action. Created use-as artifacts keep the source finding unchanged and include a `Discovery Finding Basis` section. Minimal read presenters now cover feedback, task, evidence, and pointer artifacts so use-as results have useful pretty views immediately.

## CP152b9 Action Row Ergonomics

Discovery finding action rows no longer rely on horizontal scrolling. Raw Markdown remains available as a compact secondary action, while `Use as` is styled with the Tiinex accent instead of the green edit/constructive treatment. Narrow screens use icon-sized action targets and wrapping/grid behavior rather than side-scroll.
## CP152b10

- Balanced node action button left/right padding without reintroducing horizontal scroll.
- Kept Markdown as a compact icon-only secondary action.
- Kept Use as purple/Tiinex-accent styling and existing semantics.

## CP155 Use-As Parent Placement

`Use as` no longer silently makes the source finding the parent. After choosing the interpretation target, the app enters the shared parent-placement picker so the user chooses where the new leaf belongs. Selecting the original finding means direct continuation from that finding; selecting another artifact means the created use-as artifact keeps the finding as explicit basis while using the selected artifact as parent. Tree view now participates in the same parent picker by making file rows selectable while the picker is active.

## CP156 Node Action Row Ownership

Node card action rows now keep a stable semantic order. Non-mutating/read-only actions are icon-only and stay on the left: More/Less or Anchor, Open, Markdown, and Source when present. Static mutating actions keep visible labels and come next: Continue and Reference. Conditional mutating actions come after them: Use as, Edit, and Remove when available. This prevents optional actions from shifting the primary read-only/action positions while preserving accessible labels through titles and aria labels.


## CP157 tree parent placement polish

- Tree parent-picker rows now use the same `Select as parent` wording and green visual affordance as Feed parent-picking cards.
- The tree row remains the actual click target; the visible affordance is a styled badge to avoid nested interactive controls.

## CP158 Display filter chips

Display Options now treats schema and artifact filters as visible selections rather than hidden single-select state.

- Empty schema selection means `All schemas`.
- Empty artifact category selection means `All Tiinex artifacts`.
- Adding one or more schema filters shows only matching schemas; adding several shows the union of those schema types.
- Adding one or more artifact category filters shows only matching registry-owned artifact kinds; adding several shows the union of those artifact kinds.
- Selected filters render as removable chips, while the dropdowns only add filters that are not already selected.
- `Leaves only` remains enabled by default and is independent from schema/artifact filtering.

This keeps the default discovery view broad enough to show all current leaf candidates while making historical lookback/filter state visible and reversible before the later Atlas/Verse work.

## Display filter chip event ownership

Display Options schema and artifact-category filters use visible chips as their canonical UI state. The add-filter dropdowns only add chips; they are not older single-filter controls. Adding an artifact category must not clear schema chips, and adding schema chips must not clear artifact-category chips.

## CP161 Temporal Lens Polish

- Display Options keeps the header fixed and scrolls the option body so additional view controls fit on desktop and mobile.
- Temporal lens notices are compact one-line status pills in the view rather than large panels that consume feed/lineage height.
- Temporal projection no longer excludes an artifact solely because its loaded source file was committed or modified after the selected As-of time when the artifact itself declares an older `Created At` boundary. Source revision/modification data still contributes to lens mode and fallback behavior, but declared artifact creation is the stronger loaded-artifact existence boundary.
- This remains a loaded-projection fallback, not a true origin time-machine. A later version archive/source-ref pass should fetch or load the actual origin state for the selected moment when the origin supports it.

## CP162 Temporal Source Snapshot Boundary

Temporal Lens no longer renders a separate active badge in the workspace title; the compact in-view notice owns visible temporal status. The default As-of behavior is labeled as a loaded projection until a source snapshot is explicitly loaded.

For GitHub sources, the Temporal Lens controls now include an explicit `Load source snapshot` action. It looks up the latest commit before the selected As-of moment, fetches the repo tree at that commit, and reloads repo-file artifacts from that commit-pinned ref. This is the first source-backed historical lens path; it remains user-triggered and no-auth/read-only.

This does not create a full multi-version archive yet. It replaces the current repo-file source view with the selected commit snapshot and keeps the mode visible so users can tell loaded projection from source-backed snapshot.

## CP163 GitHub Lazy Social Discovery

GitHub social discovery remains enabled by default as a source capability, but it is no longer interpreted as eager broad API traversal. Empty issue/discussion target lists stay lazy and do not sample open issues through the REST API. Explicit issue or discussion URLs are registered as bounded `tiinex.discovery.finding.v1` social-origin targets without requiring live API reads.

This keeps anonymous-first behavior useful while avoiding unauthenticated REST-budget exhaustion. Live issue/comment import remains an internal/future enrichment path, not the default refresh/startup behavior. GitHub social targets preserve target identity, source URL, interpretation limits, and `Use as` candidates so the user can continue/reference/use them without treating unavailable live material as preserved evidence.

## CP164 View Options Fit + Temporal Lineage Ancestors

Display Options / View Options was widened and given a taller desktop/mobile viewport so the growing shared option set does not introduce premature vertical scroll or horizontal scroll. The dialog body remains the only scroll surface; the header and close action stay fixed and reachable.

Temporal Lens lineage rendering now preserves ancestors of visible descendants. A loaded projection must not break a selected artifact's continuity chain just because an ancestor's current loaded file metadata or declared date does not fit the lens. This does not turn loaded projection into a true origin snapshot; it keeps lineage review coherent until a source snapshot or version archive is loaded.

## CP165 GitHub Web Repo Snapshot Resolver

Temporal Lens source snapshots now resolve GitHub repo state through the GitHub web commit-list surface before falling back to any loaded-artifact projection. The resolver builds a `commits/<ref>/?since=...&until=...` URL, parses stable commit/tree href semantics rather than GitHub CSS classes, chooses the latest commit at or before the selected As-of moment, and reloads repo-file discovery from that commit ref.

The source snapshot path is explicit and user-triggered. If the web surface cannot be read by the client, the Temporal Lens UI also supports a human-assisted fallback: paste a GitHub tree URL, commit URL, or commit SHA, then load the source snapshot from that ref. Source snapshots prefer static flat/tree paths before GitHub REST tree lookup. Artifact `Created At` remains a fallback projection only when origin/source state cannot be resolved.

## CP166 Temporal Lens Apply Boundary

Temporal Lens editing in Display Options now uses a draft/apply boundary. Changing the As-of value or optional GitHub tree/commit ref inside the dialog no longer immediately mutates the active view. Closing the Display Options dialog applies the temporal draft once, updates the route state, and schedules source snapshot resolution from the selected GitHub source.

The explicit `Resolve source snapshot` / `Load pasted ref` buttons were removed from the main temporal control row. Source snapshot resolution is now part of applying the temporal lens: the app first tries the GitHub source/history resolver and, when a tree URL/commit URL/SHA is pasted, uses that ref as the source snapshot. `Open commits page` remains as the human-assisted no-API path for finding a suitable GitHub ref.

A loaded GitHub source snapshot is now treated as the authoritative repo-state projection for that source. Once a snapshot ref has loaded, Discovery no longer re-filters that source's snapshot nodes by artifact-declared `Created At`; the commit/tree state already determines which files exist in that historical source view. Artifact `Created At` remains only a fallback for loaded projection when source-backed snapshot state is unavailable.

## CP167 GitHub Snapshot Resolver Fallback

Temporal Lens source snapshots now distinguish three states: loading, loaded, and failed. If the browser cannot read the GitHub web commits surface, the UI no longer silently looks like a valid source snapshot; it records an unresolved source snapshot state and keeps the visible mode honest.

The GitHub repo-state resolver still tries the GitHub web commits page first. Because `github.com` HTML reads may be blocked by browser CORS even when a human can navigate the page, the resolver now falls back to one bounded GitHub REST commit lookup for the selected workspace source and As-of moment. After that single commit resolution, source discovery still prefers static/jsDelivr and raw commit-pinned file reads before the GitHub tree API.

This keeps the intended source-history semantics working in anonymous/client mode without returning to broad API crawling. The manual tree URL / commit URL / SHA field remains the no-API fallback path when API budget is exhausted or disabled.

## CP168 GitHub Snapshot Resolver Guard Isolation

Temporal Lens source snapshot resolving now isolates the single bounded GitHub commit lookup from broad GitHub issue/comment/tree discovery rate-limit guards. A stale or exhausted `github-rest` guard from social discovery should not prevent the app from attempting the one commit lookup that resolves the user's selected As-of source snapshot. Snapshot tree fallback also gets its own guard while still preferring static/jsDelivr commit-ref discovery before GitHub tree API.

This does not reintroduce eager API crawling. Empty social target lists remain lazy; source snapshot resolving is only triggered by applying an As-of temporal lens for a GitHub source or by a pasted tree/commit ref. If the actual GitHub API budget is exhausted, the source snapshot can still fail honestly and the human-assisted tree URL/SHA path remains the no-API fallback.

## CP169 Known-ref source snapshot

- Temporal source snapshots now treat pasted GitHub tree URLs, commit URLs, or commit SHAs as first-class snapshot refs.
- Known refs run normal repository discovery against that ref instead of relying on artifact `Created At` projection.
- When static/jsDelivr and GitHub tree discovery cannot enumerate a snapshot ref, the loader can fall back to a seeded path manifest from the already-known workspace/source paths, then fetch raw files at the pasted ref and skip missing files.
- Date-to-commit resolving remains best-effort convenience; source snapshots by known ref are the canonical no-API/manual path.

## CP170 No-API Source Snapshot Boundary

Temporal source snapshots now treat GitHub API/REST access as an explicit capability only, not a silent fallback. The snapshot flow uses web/raw/static paths by default: a pasted GitHub tree URL, commit URL, or SHA is loaded as a first-class source snapshot ref, then repo discovery runs against that ref using jsDelivr/static flat listing when available and raw file fetches from the seeded path manifest when enumeration is unavailable.

Date-to-commit resolving remains web-only/best-effort in the static web app. If the browser blocks reading GitHub commit-list HTML through CORS, the UI remains honest and expects the user to use `Open commits page` plus paste the selected tree/commit ref. Artifact `Created At` remains fallback projection metadata and never owns file existence for a loaded source snapshot.

Silent GitHub commit-date enrichment is disabled by default (`repoCommitDateSortFetchLimit: 0`) because it can otherwise spend one REST request per artifact. Paygate/auth/rate-limited adapter paths must be explicit user-invoked capabilities, not background fallbacks.

## CP171 Historical schema snapshot compatibility

Historical Tiinex/docs snapshots may contain schema artifacts under the earlier `.topics/.schemas/tiinex.*.vN.md` filename pattern rather than the newer `.schema.md` suffix. Source snapshot discovery now treats those historical files as schema artifacts when they live under `.topics/.schemas/`, so commit-ref snapshots such as `541269c` do not drop older schema contracts from Discovery simply because the registry learned a newer filename convention later.

Known-ref source snapshots remain no-API by default. When static/jsDelivr enumeration is unavailable, the seeded path manifest includes both current schema filenames and the historical Tiinex/docs schema filenames; missing raw files are skipped by the existing fetch path.


## CP172 — No-API snapshot ref boundary and visible tree child counts

- Date-only temporal lens no longer silently attempts GitHub date-to-commit resolving when no Tree URL/SHA is supplied; no-API mode now marks this as `source snapshot needs ref` instead of a misleading unresolved failure.
- Known Tree URL / commit URL / SHA remains the canonical no-API source snapshot path.
- Discovery tree child badges are scoped to children visible in the current tree view and same source context so collapsed/filtered/current-graph descendants are not counted as if they belonged to the visible snapshot row.
- GitHub API remains disabled for source snapshot flow unless introduced later as an explicit user-invoked capability.

## CP173 Compact source modules and no-ref projection clarity

- GitHub discovery/module cards now render as compact one-line chips instead of full-width cards so source/status context does not steal vertical workspace height, especially on mobile.
- Date-only no-API Temporal Lens state now labels the visible list as a loaded projection that needs a source ref. This avoids implying that a true source snapshot is loaded when no Tree URL/SHA was supplied.
- The no-API policy from CP170 remains authoritative: GitHub API/REST is not used silently by source snapshot flow. Pasting a GitHub tree URL, commit URL, or SHA remains the canonical source-snapshot path.

## CP173 Final — Time portal resolver dialog and compact source chrome

- Display Options now treats time traversal as a clean `Time portal` picker: a single date/time input with Now/Clear helpers. Empty date/time means latest/current loaded view.
- GitHub-specific ref handling was removed from Display Options. No `Open commits page` button or `Tree URL / SHA` input is shown inside Display Options.
- When a no-API GitHub time portal needs a concrete ref, the adapter opens a separate source resolver lightbox.
- The resolver lightbox explains the no-API boundary, provides an `Open commits page` action, and accepts a GitHub tree URL, commit URL, or SHA.
- When the resolver input validates, it loads the source snapshot directly and closes the dialog; no OK/Apply button is required.
- GitHub API remains disabled for source snapshot flow unless later added as an explicit user-invoked capability.
- Source/adaptor module cards remain compact one-line rows to preserve vertical workspace space, especially on mobile.

### CP174 — Time portal interval controls

- Display Options now exposes a neutral **Time** portal with Begin and End inputs on one row.
- Empty Begin and End means latest/current view.
- Begin-only acts as a latest-state time filter from Begin to now and does not request historical source resolution.
- End requests an end-bound source state when the adapter supports it; GitHub no-API resolution still opens the adapter ref dialog only when needed.
- GitHub discovery source chips are kept compact and single-line to preserve feed/tree content space, especially on mobile.


### CP175 — Audit and compact display polish

CP175 makes the Lineage audit control visible and review-oriented: clicking `Audit` now runs a lineage audit pass, tries to resolve open parent boundaries, verifies loaded integrity claims, and shows OK/mismatch/open/pending counts in the Lineage view. Display Options also includes a `Mismatches only` filter for quickly finding checksum problem areas.

The Display Options dialog is compacted for desktop and mobile. Filter chips are aligned with their controls where possible, adapter shell copy is reduced, Time portal duplicate summary chips are removed, and the Display Options toolbar button is placed consistently across Discovery and Lineage modes.

### CP176 — Time portal interval guardrails and lineage toolbar polish

- Begin/End values in the Time portal are normalized so reversed intervals are swapped automatically instead of becoming user-facing errors.
- Clearing the Time portal now schedules a latest/source restore when the active view had loaded a historical source snapshot, so the workspace does not stay pinned to the last snapshot ref.
- Begin-only time filtering continues to use the latest source state; removing End from a snapshot-backed view also restores the latest source ref.
- Lineage toolbar actions are grouped as compact icon controls beside search so Audit, Display Options, preview, and search no longer overlap.
- Display Options mobile filter rows were tightened so selected chips do not overlap the schema/artifact dropdown controls.

### CP177 — Local GitHub commit cache and Lineage view stability

- GitHub time portal resolution now checks a local, no-API commit cache before opening the manual source-ref resolver dialog.
- The cache records commit refs observed by the adapter together with a source timestamp when available; for user-supplied time portal refs, the requested End time is stored as a portal-observed timestamp so the same or nearby later portal can be resolved without asking again.
- GitHub web/raw/static paths remain the default; no GitHub API fallback is introduced.
- Lineage mode gets a short-lived selection lock during explicit Lineage actions such as Select, Audit, and integrity refresh so stale durable route/cache state cannot bounce the user back to Discovery during rerenders.

## CP178 route safety and Lineage toolbar polish

- Fixed a route/history regression where Lineage selection could be restored from stale hash/session lens state after Back or browser Back.
- App Back now explicitly clears the selected lineage target and writes a Discovery route instead of relying on `history.back()` landing on the correct prior entry.
- Browser Back to an empty/no-route hash clears Lineage selection and suppresses cached Lineage lens reapplication, preventing the viewer from getting stuck in Lineage mode.
- Removed a duplicate route push during node selection that could create repeated Lineage history entries.
- Toned down the Audit button and separated Back/Audit/Display/Preview click areas in the Lineage toolbar.

## CP179 — Browser Back route ownership hardening

- Durable lens/session scroll persistence no longer writes to the live URL or browser history. Route writes are now owned by `setRouteState()` only.
- This prevents scroll/pagehide persistence from replacing a Discovery/no-route history entry with a stale Lineage hash after the user presses browser Back.
- Workspace index recomputation now respects cached-lens suppression, so a browser Back to an empty/no-route hash cannot resurrect a cached Lineage selection during the next compute/render pass.
- The in-app Lineage Back button clears selection with a Discovery route replace, so it exits Lineage without adding another browser-history entry that points back into Lineage.
- Audit/Display/Preview toolbar separation from CP178 remains in place, with the Audit button kept low-emphasis and Tiinex-toned.

## CP180b — Explicit Discovery route beats Lineage lock

- Browser Back to an explicit Discovery `#view` route now clears the short-lived Lineage view lock for that workspace, preventing the lock from reselecting the prior Lineage card during the next render.
- Static-disk popstate restore keeps route restoration active through apply-and-render, so render-time durable lens helpers do not race the route that browser history just selected.
- Explicit Discovery route application suppresses stale cached Lineage lens reapplication in the same way empty/no-route handling does.
- The patch preserves the CP179 rule that durable lens/session persistence is not a live history writer; it only narrows which owner may reselect Lineage after Back.
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

## CP184 — Recursive schema layout and transition-aware artifact actions

- Tiinex/docs schema discovery now treats `.topics/.schemas` as a recursive family tree rather than a flat schema directory.
- The viewer no longer depends on a `.layout` JSON manifest in Tiinex/docs. Directory layout remains a discovery/navigation projection; artifact content remains semantic authority.
- Built-in Tiinex/docs schema freshness candidates now point at the directory-shaped schema paths, so stale CDN/tree listings can be normalized away instead of reintroducing deleted flat paths.
- Schema create policy and wizard schema links now use the directory-shaped schema paths on `master`.
- Schema badge resolution first uses explicit schema links/envelope context, then falls back to the directory-shaped schema path index and loaded filename scan.
- Continue, Reference, and Use as are now represented as transition-aware actions with `tiinex.artifact.transition.v1` metadata and generated Transition Boundary sections in new artifacts.
- Transition metadata uses labels/provisional handles for authoring and UI, while durable identity remains the Continuity Integrity fingerprint after checksum/finalization.

Scope intentionally not changed:

- Browser route/history/scroll ownership from CP180c is preserved.
- GitHub retrieval remains read-only `web-surface`/raw-source oriented.
- No `.layout` JSON dependency is introduced in the web app or docs repository.

## CP185 — Render stabilization and post-render effect hygiene

- Idle renders now avoid replacing the workspace grid, toasts, or modal DOM when the generated HTML is unchanged.
- The chrome-preserving patch renderer hashes stable HTML fragments and only patches the specific fragment whose content changed.
- Lineage integrity refresh is now scheduled once per visible lineage signature instead of once per render.
- This keeps recursive schema discovery and larger lineage views from creating repeated post-render verification jobs while the selected lineage has not changed.
- Continue, Reference, Use as transition metadata from CP184 remains intact.

Scope intentionally not changed:

- Browser route/history/scroll ownership from CP180c is preserved.
- Recursive Tiinex/docs schema path support from CP184 is preserved.
- No `.layout` JSON dependency is introduced.


## CP186 — UX Back history parity

- The in-app Lineage Back button now uses the same route-history back path as the browser Back button when a Tiinex history entry exists.
- Direct clear-selection is retained only as fallback for direct Lineage loads or missing route history.
- URL, parsed route view state, and scroll restoration now share one navigation owner.

Scope intentionally not changed:

- Recursive schema discovery from CP184 is preserved.
- Transition-aware actions from CP184 are preserved.
- Render stabilization from CP185 is preserved.

## CP187 — Adapter bridge and schema-policy discovery fallback

- GitHub issue and GitHub discussion are now separated as origin-adapter contracts.
- Explicit GitHub discussion URLs remain target-only in anonymous client mode; the app does not pretend to import discussion body/comments without a safe enrichment path.
- Explicit GitHub issue targets now expose an `Import issue` action that performs an explicit live issue/comment import into discovery-finding artifacts.
- GitHub social-origin generated artifacts now include an Adapter Boundary section that states access mode, discovery mode, capabilities, and interpretation limits.
- Schema create-policy lookup now has a derived fallback for every known Tiinex schema path in the recursive schema catalog, so new schema families can be recognized without hand-building a parallel identity registry.
- Derived schema policies are UI/tooling fallbacks only; directory placement remains a navigation hint, not semantic authority.

Scope intentionally not changed:

- No GitHub writes, tokens, auth prompts, backend, or telemetry are introduced.
- Browser route/history/scroll ownership from CP186 is preserved.
- Recursive schema layout remains markdown/path based; no `.layout` JSON dependency is introduced.

## CP190 — GitHub Discovery Loading Guard

CP190 fixes a repo discovery preflight variable-scope regression that could leave a workspace stuck at Loading 0% before the main discovery cleanup boundary ran. It preserves CP188 public issue import and CP189 source-config hygiene.

### Product 191 — Search and filter contract clarity

CP191 makes search and display filters more explicit. The schema filter now lists the known Tiinex schema surface instead of only schemas currently present in the visible node set. Search input copy and active search legends clarify that search scans title, summary, schema, path, source/date metadata, and markdown body. Advanced deterministic query tokens are supported, including `schema:condition`, `kind:schema`, `title:"OLLE Object"`, `path:.schemas`, `source:Tiinex/docs`, `status:mismatch`, `has:parent`, `is:draft`, and negation such as `-schema:schema`.

This keeps search as a view/filter operation; it does not mutate artifacts or create evidence, validation, or transition results.

## CP192 summary

Exact schema filters now list known and loaded schemas instead of coarse schema families. Artifact kind filters remain suffix/category filters.

### CP194 — Schema branch filter semantics

CP194 makes schema filtering match the tree-shaped schema model. Selecting a schema from the schema tree now means “this branch and descendants” by default, rather than exact leaf-only matching. `root` therefore represents the root branch; with `Leaves only` enabled it returns leaf artifacts under root instead of an empty result caused by `root` not itself being a leaf.

Exact schema matching remains available as an internal filter mode for future UI work, but the display picker uses branch semantics because it is presented as a tree picker.

### CP195 — GitHub outbound adapter drafts

CP195 adds read-only outbound GitHub draft preparation. Tiinex can now prepare copy-ready GitHub issue, issue-comment, and discussion draft bodies from a selected artifact, with an explicit Tiinex Transition Boundary and adapter boundary language. The app still performs no GitHub write, token, auth prompt, backend call, or telemetry; publication requires explicit user action in GitHub.

The outbound draft flow separates three states: prepared draft, copied body, and published GitHub material. It does not treat a prepared draft as evidence, validation, preservation, acceptance, or canonical Tiinex storage.

### CP196 — Export-owned GitHub outbound drafts

CP196 moves GitHub outbound draft preparation out of per-artifact row actions and into the existing workspace Save/Export flow.

The export modal now has a delivery target for GitHub web drafts. It prepares copy-ready issue, issue-comment, and discussion bodies from the current export selection without API write, token use, backend, or telemetry.

The previous card-level “GitHub draft” action is removed because Continue, Reference, and Use as should create/transform workspace artifacts first. Publishing/exporting those workspace artifacts belongs to the workspace export adapter surface.

Boundary: prepared outbound draft is not published material, not canonical Tiinex storage, and does not mutate loaded source artifacts.


### CP197 — Export adapter capability surface

CP197 makes the workspace export dialog choose an adapter capability first instead of treating GitHub as a late delivery toggle. Download archive remains the file/package adapter with archive and password capabilities. GitHub web draft is now a markdown-only outbound adapter surface that prepares copy-ready issue, issue-comment, and discussion bodies without API write, token use, backend, or telemetry.

The modal is also made more responsive: the adapter choice appears near the top, GitHub draft bodies are grouped in collapsible panels, and mobile layout stacks controls so the footer controls remain reachable.

### CP198 — Export adapter surface hierarchy

CP198 fixes CP197's export adapter regression and improves the GitHub adapter surface model.

- Fixed a `schemaIdFromPath is not defined` ReferenceError in GitHub export body generation.
- Renamed the outward-facing export adapter choice from `GitHub web draft` to `GitHub`.
- Kept the internal no-write web-draft boundary, but made it a GitHub adapter capability rather than a delivery checkbox label.
- Added a GitHub surface picker inside the GitHub adapter:
  - Git repository: future/unavailable in no-auth browser mode.
  - Issue tracker: prepares new issue and issue-comment draft markdown.
  - Discussion board: prepares discussion draft markdown.
- GitHub adapter export remains markdown/text-only in this client-side mode; files/assets are referenced, not uploaded.


### CP199 — Staged export adapter routine

CP199 reframes workspace export as a two-step adapter routine instead of a tall all-in-one dialog.

- Step 1 configures the export adapter, scope, and capability level.
- Step 2 executes the selected routine.
- Download execution performs a local client-side archive export.
- GitHub execution prepares copy-ready markdown and gives the user a bounded manual routine for publishing through GitHub surfaces.
- GitHub access levels are explicit: manual copy/paste, web-form shortcut, and future API write.
- GitHub API write remains unavailable in the no-token browser adapter.

This keeps export semantics aligned with adapter capability: Download supports files/assets/password packages, while GitHub browser mode supports markdown text only. Prepared GitHub text is not posted material, not canonical Tiinex storage, and does not mutate loaded source artifacts.

## CP200 — export UX compactness

CP200 polishes the staged export adapter surface:

- Source rails reserve stable space so badges do not create distracting vertical jumps while workspace source state changes.
- GitHub export setup uses compact rows for surface and access-level choices.
- Unimplemented capabilities remain visible but disabled, so future surfaces are discoverable without pretending to work.
- GitHub browser export remains markdown-only and user-mediated; it does not upload files, post comments, request tokens, or mutate sources.


## CP201 — export modal viewport and scroll stability

CP201 keeps the staged export dialog stable while the user changes adapter options.

- Export setup and execute bodies now carry explicit scroll-restore keys, so changing adapter/scope/password options no longer snaps the dialog back to the top.
- The export panel uses more of the available viewport on desktop while remaining bounded on small screens.
- Export cards, sections, summaries, and footer spacing are tightened so Download and GitHub setup are easier to use without unnecessary scrolling.
- Adapter semantics are unchanged: Download carries files/assets/password packages; GitHub browser mode carries markdown text only and does not post or upload.

## CP202 — guided GitHub export checklist

CP202 turns GitHub browser export from a loose copy/open page into a guarded per-artifact routine.

- GitHub setup no longer exposes a separate manual/web/API access-level choice as if all levels were equally useful.
- Issue tracker and Discussion board use a guided checklist:
  1. copy the prepared markdown body,
  2. open the GitHub form,
  3. publish in GitHub,
  4. paste the resulting GitHub URL and verify before continuing.
- GitHub export processes one selected markdown artifact at a time so adapters that only support single-body publishing do not pretend to upload an entire workspace at once.
- Issue URL verification calls the public GitHub issue adapter to confirm the published issue can be read.
- Discussion verification is bounded to URL-shape/target validation until the discussion adapter gets public enrichment support.
- Git repository and API write remain visible as future/unavailable capabilities; no write API, token prompt, backend, or telemetry was added.

Boundary: the checklist verifies a public target URL or target shape; it does not make the GitHub issue/discussion canonical Tiinex storage, evidence, validation, preservation, or proof.

## CP203 — GitHub export target resolver checklist

CP203 refines the guided GitHub export routine into a target-aware checklist.

- GitHub export now starts each artifact with a target decision: create a new GitHub target, reuse a known lineage/source target, or paste an existing GitHub URL.
- Known targets are inferred from the artifact source URL, markdown body, loaded node, and parent lineage where available.
- Copy and open are checklist rows, not separate export levels.
- Verification is now its own row with visible resolved/error state.
- The footer Continue/Done button is disabled until the current artifact has verified a GitHub issue or discussion target.
- Issue verification fetches the public GitHub issue and records resolved title/state in the routine state.
- Discussion verification remains URL-shape bounded pending richer public discussion enrichment.

Boundary: a verified GitHub URL proves only that the selected GitHub target can be resolved within the current adapter boundary. It does not make the GitHub target canonical Tiinex storage, evidence, validation, preservation, or proof.

## CP204 — GitHub Export Checklist Action Rows

CP204 refines the GitHub export routine so each checklist row has an explicit user action or verification control. Manual copy/paste is treated as part of a guided web routine, not as a separate unguarded export level.

- Target selection is now part of the checklist row.
- Copy body, Open GitHub, and Verify result each carry their own row action.
- The non-action “Publish in GitHub” row was removed; publishing is described inside the Open/Verify instructions.
- Paste/change in GitHub URL inputs attempts verification when the URL shape is valid.
- Continue/Done requires copy + open + verified, not verification alone.

Boundaries remain unchanged: Tiinex prepares markdown and verifies published URLs, but it does not post to GitHub, call write APIs, request tokens, upload files, or mutate loaded sources.

## Export scope continuity and adapter inference

This update adjusts the workspace export setup flow:

- Scope choices are ordered `Local → Source → All`.
- `Local` remains the first-use fallback.
- The chosen scope and Source selections persist for the current browser session.
- Export adapter default is inferred from selected lineage/source provenance when possible.
- Local is ignored as an adapter signal; GitHub issue/discussion/recovered-comment/source URLs may default the export adapter to GitHub.

The inference is only a user-assistive default. It does not post to GitHub, call write APIs, request tokens, upload files, or make exported material canonical.

## CP208 — Compact GitHub export routine validation

CP208 tightens the GitHub export execute step after first-use browser feedback.

- The target row is more compact and mobile-friendly: mode, known target, URL, and Resolve/Recheck live in one compact control group when space allows.
- `Reuse known` targets inferred from artifact/source provenance are accepted as known targets without requiring an extra manual validation click.
- Target rows are only marked done when the target is actually usable: `create-new` selected, or an existing target is known/resolved.
- The extra Verify row is only shown for `create-new`, where a newly published GitHub URL must still be pasted back into Tiinex.
- URL comparison now has a canonical GitHub URL normalizer, fixing the `normalizeGitHubUrlForComparison is not defined` error.
- GitHub issue verification degrades to bounded URL-shape acceptance if live public issue resolution is unavailable, so browser-only export is not blocked by adapter/network limits.

Boundary: shape/known-target acceptance is a target-continuity check, not proof that a comment was posted, not evidence, not preservation, and not canonical Tiinex storage.

## CP209 — GitHub export auto-finish and post-export cleanup

CP209 keeps CP208's compact GitHub export routine, then removes two first-time flow frictions observed during browser testing. When the final selected GitHub export artifact is complete, the routine now closes the export dialog instead of showing a completion panel that still asks the user to press a no-op Done button. The workspace is recomputed, Discovery is refreshed, and the workspace-local Lineage view is returned to Discovery with a route replace.

The GitHub export routine also watches browser focus/visibility return as a low-frequency destination check trigger. The app does not poll aggressively; focus/visibility checks are throttled to at most once per five seconds and only run while the GitHub export execute routine is open. This keeps the manual web-surface adapter bounded while letting Tiinex re-check target state at the natural moment when the user returns from GitHub.

After export completion, identical local/generated artifacts are pruned when the same canonical markdown is now present from a non-local source. Recovered GitHub artifacts remain as source-owned artifacts; matching local shadows are removed from the current workspace so Discovery does not show a local copy beside the source copy. Discovery findings that only wrap a recovered embedded Tiinex artifact are also hidden from the default Discovery result list while remaining in workspace storage/provenance for recovery and audit purposes.

Boundaries unchanged: no GitHub write API, no auth, no token, no backend, no telemetry. A recovered artifact is still recovered/imported source material, not automatic truth, evidence, preservation, or canonical acceptance.


## CP210 — GitHub export focus stability and finding promotion cleanup

CP210 keeps CP209's auto-finish behavior but stops focus/visibility checks from re-rendering an unfinished GitHub export routine when there is no valid target URL to check. Returning from GitHub should no longer make the checklist feel like it restarted or interrupted itself; focus/visibility is only used as a bounded, throttled check when there is actually a resolvable target URL.

Discovery cleanup is also stricter. Adapter-generated `discovery.finding` wrappers are treated as bounded adapter shells when they have a meaningful resolved artifact attached, including recovered embedded Tiinex artifacts or user-created children such as feedback or interpretation artifacts. Those wrappers remain in workspace storage/provenance, but default Discovery prioritizes the meaningful artifact lineage. Explicit search or schema filtering for discovery findings still surfaces them for audit.

Boundary: a hidden wrapper is not deleted, and a promoted/recovered artifact is not automatically truth, evidence, preservation, or canon. The UI simply avoids making resolved adapter adapter shell the user's main work object.

## CP211 — Discovery finding hierarchy, working leaves, and Time Portal filtering

CP211 makes adapter-generated discovery findings behave more like a discovery inbox instead of primary work artifacts when meaningful typed artifacts already exist.

- Default Discovery now uses working leaves when Leaves only is enabled. A discovery finding stops being a working leaf once it has a typed child, recovered embedded artifact, or explicit artifact that references it as its finding basis.
- Resolved discovery finding shells remain available for provenance/audit through explicit search, discovery filters, or Tree without Leaves only.
- Tree with Leaves only shows terminal working artifacts; Tree without Leaves only can still show the finding hierarchy for inspection.
- Discovery finding read views now surface resolved typed artifacts as links, making it clear that the shell is source/provenance context and the typed artifacts carry the working continuity.
- Time Portal filtering now applies to GitHub issue/comment adapter material. Loaded GitHub repo snapshots may still use source-snapshot existence for repo files, but issue tracker observations are live social material and must stay inside the selected Time Portal window.

Boundary: findings are not deleted. They remain bounded adapter observations. The UI only changes which artifact is treated as the default working object.

# CP212 package note

CP212 fixes GitHub issue/comment refresh continuity after CP211. GitHub issue/comment material is live social material rather than a static repo snapshot. Known issue targets now include both explicitly configured issue URLs and previously discovered issue URLs when refreshing a workspace, so browser/local-state refreshes can re-read existing issue targets and surface newly-added untyped comments as unresolved discovery findings.

The change also forces bounded GitHub issue/comment reads to bypass the runtime cache when the user refreshes the source, when an existing issue surface is refreshed from local-state restore, or when post-export discovery refresh runs. This prevents typed issue bodies from being recovered while a newer raw comment remains hidden behind stale adapter cache state.

# CP216 package note

This package adds a GitHub-facing presentation layer for outbound issue/comment drafts. The human-readable GitHub title and body now prioritize the artifact title, schema kind, summary, and user-authored content before Tiinex adapter context. A stable `tiinex-artifact-start` marker separates the convenience presentation from the machine-readable Tiinex source markdown so discovery/import can ignore everything above the marker and recover the artifact below.

# CP217 package note

This package refines GitHub outbound presentation surfaces after the presentation-boundary package.

- GitHub export markdown now includes a low-noise `Open in Tiinex` bridge line above the machine-readable payload when a public source or known GitHub target exists.
- The bridge link uses Tiinex route state so `https://tiinex.dev/` can load the referenced GitHub issue/source and select the exported artifact by lineage/title/path where possible.
- Browser boot/source loading now treats GitHub issue URLs passed through route state or `?url=` as live issue surfaces instead of trying to fetch them as raw markdown files.
- The human GitHub body remains presentation-only above the `tiinex-artifact-start` marker; Tiinex importers recover the artifact from `Source Markdown` below the marker.
- Single-node outbound drafts were aligned with the same presentation boundary so alternate GitHub draft paths do not reintroduce `Tiinex: Continuity Context` style noise.

# CP220 package note

This package builds on CP219 and changes GitHub issue discovery fallback from a target-only dead end into a cache-aware continuity path.

Highlights:
- Adds a persistent browser-local GitHub issue thread cache at `tiinex.github.issueThreadCache.v1`.
- Successful GitHub API or web issue imports are cached as issue + comments snapshots.
- If GitHub REST is rate-limited and the web page fallback cannot be read from the browser, known issue targets can still load from the cached snapshot with explicit cached/stale semantics instead of pretending the live source was read.
- After a manual GitHub export is verified, Tiinex records the publication URL as a local source anchor and immediately imports the just-published markdown from the prepared draft into the same issue/comment discovery pipeline. This makes the verified publication usable even if live discovery is rate-limited.
- Post-export refresh now prefers fresh local issue cache before spending detail requests, while broad issue listing may still use the public GitHub API.

Browser validation is still required for GitHub rate-limit behavior, cache-staleness UX, and publication URL binding.

# CP221 package note

This package update tightens GitHub issue discovery resilience after API limit failures.

- GitHub issue detail import now prefers cache and public reader/web fallback before spending GitHub REST detail requests, unless a caller explicitly requests API-first behavior.
- Public issue reader fallback is normalized into the same issue/comment snapshot shape as the API path when it can read material.
- Successful issue imports remove older target-only/unavailable placeholders for the same issue.
- Workspace/source issue-target inference also scans loaded artifact origins, publication origins, recovered-from URLs, and markdown bodies for GitHub issue URLs.
- GitHub outbound transition boundary text records publication-origin binding semantics so verified GitHub URLs can be used as durable source origins after publication.

Browser validation is still required because public reader fallback depends on external CORS/network behavior.

# Package 225 package note

Package 225 tightens GitHub issue fallback routing after browser validation showed that direct `github.com/issues/...` HTML fetches are CORS-blocked while GitHub API and Jina reader surfaces can return issue material. Automatic issue detail import no longer spends a fallback attempt on direct GitHub HTML; it preserves the HTML parser for pasted/saved material only. Explicit configured issue targets can bypass stale in-session adapter rate-limit guards when the browser can read the target again, and reader URL candidates now include the exact CORS-readable shapes verified in browser validation.

# Package 228 package note

Package 228 tightens the GitHub issue reader fallback after browser validation showed that Jina reader access succeeds but the comments payload can be JSON-like text with raw control characters inside `body` strings. The GitHub issue adapter now includes a loose GitHub API comment reader that extracts comment blocks and fields when strict JSON parsing fails, allowing Jina comments to flow into the same issue/comment discovery pipeline instead of degrading to a target-only source gap. It also keeps the Package 227 GitHub REST API rate-limit guard behaviour: known API reset state is persisted and REST detail calls remain a last-resort path behind cache and reader surfaces.

# CP230 package note

- Tightened GitHub Jina issue reader payload validation so nested GitHub user/comment objects are not accepted as the issue payload merely because they contain `html_url`.
- Added GitHub issue/comment payload guards for Jina-wrapped API responses and forces loose extraction when strict parsing returns the wrong top-level object/array shape.
- Keeps Jina reader as the preferred detail path for configured GitHub issue targets, with GitHub REST detail lookup remaining a guarded last resort.

# Package 232 note

Package 232 fixes the GitHub issue import failure surfaced by the issue import trace. The Jina API reader correctly parsed issue #9 and its two comments, but every fallback attempt failed while sanitizing the cacheable thread because `cleanCachedGitHubIssueItem` called `cleanWhitespace` after that helper had no local runtime definition. The package restores a small app-local whitespace cleaner used by GitHub reader/web sanitization without changing the reader, parser, loader, or UI semantics.

# Package 233 package note

Package 233 fixes GitHub issue reader continuity after successful issue import. Recovered Tiinex artifacts embedded in GitHub issue bodies/comments are now reparented to the locally recovered issue/comment chain before they are added to the workspace. This keeps Jina reader imports consistent with API-style continuity: a comment artifact recovered from issue #9 becomes a child of the recovered issue artifact instead of keeping an unavailable GitHub blob parent reference from the publication draft.

# Package 234 package note

Package 234 is a bounded GitHub issue adapter polish pass after issue import started working through Jina. It keeps the successful import path intact and adds two targeted continuity hygiene fixes:

- recovered GitHub artifacts now strip both block-style and flattened top-level Parent declarations before the importer writes the local recovered parent edge, preventing publication-time parent links from producing missing GitHub blob targets or self-cycles;
- after a successful GitHub issue thread import, exact local duplicates shadowed by imported source material are pruned from the Local source when content, title, and schema are compatible, so a published artifact does not remain as an identical local copy beside its recovered source copy.

# CP235 package note

Package 235 addresses two GitHub recovered-continuity polish issues observed after Package 234:

- Lineage traversal now keys loaded workspace artifacts by storage/path identity before origin URLs. Multiple recovered artifacts can legitimately share the same GitHub issue/comment URL, so using `browseUrl` as the primary traversal identity produced false lineage-cycle warnings.
- Local shadow pruning now compares canonical artifact content after integrity and top-level parent blocks are removed. This lets a local artifact be pruned when the imported source artifact is semantically the same artifact but has a different local/source parent edge or refreshed integrity footer.

# Package 236 package note

Package 236 strengthens local shadow pruning after GitHub issue recovery. Earlier pruning only matched nearly identical full artifact markdown after parent/integrity cleanup. Published/recovered artifacts can legitimately differ in envelope-level parent, integrity, scope, or source metadata while preserving the same user-authored artifact body. The prune pass now indexes imported source artifacts by both full comparable content and a schema/title/body semantic key, then removes compatible local copies when an imported source version shadows the local working copy.

# Package 237 package note

Package 237 polishes GitHub presentation output and social-origin references. The visible GitHub presentation now omits generated transition-boundary sections from the artifact content preview and keeps the Tiinex boundary details compact. Parent origin links now label GitHub issue/comment/discussion surfaces explicitly instead of using generic git/browser wording, and generated Use As source links prefer the external GitHub issue/comment origin when that is the real source surface.

# Package 238 package note

Package 238 adds adapter-aware local draft editing for source/imported artifacts. Source-backed cards can now open the existing edit flow, but saving creates a Local draft that shadows the source artifact instead of mutating the imported source material. When a Local draft shadows a source artifact, the source card is hidden from the normal feed/lineage list and can be revealed with an `Open original` collapsed separator.

This keeps the active edited material visible while preserving source provenance without duplicating full cards in the normal view. When discovery later finds the same semantic content in the source, existing local shadow-pruning can remove the local draft.

# Package 239 package note

Package 239 keeps the adapter-aware edit capability, but moves Edit into the action boundary between read/source actions and write/transition actions. Edit now renders as an icon-only action immediately before Continue, so GitHub/source cards remain compact and the action order reads as inspect source, edit draft, then continue/reference/use-as.

Resolved discovery finding wrappers are also hidden from ordinary discovery and lineage rendering when a typed artifact already carries the working continuity. The wrapper remains selectable when explicitly targeted, but it no longer duplicates the typed card by default.

# CP240 package note

This package keeps Open original shadows out of discovery feed rendering and shows them only in lineage context under local draft cards. It also improves the rich markdown preview/editor list rendering so nested bullet and ordered lists preserve visible hierarchy instead of flattening indentation.

# Package 241 note

This package fixes two adapter-aware edit regressions discovered after local draft editing:

- `Open original` now has a registered action handler in lineage view, so the compact original separator toggles into the actual source/original card.
- Local edit drafts now preserve shadow/origin metadata through local workspace serialization and are saved synchronously after edit commits, reducing the chance that an immediate refresh drops the draft before autosave runs.

The package also preserves local draft metadata when editing an already-local shadow draft again, so subsequent edits do not lose the original source link.

# Package 242 note

- Local draft and newly created local artifacts now become the active lineage anchor immediately after save. The save flow locks lineage view to the saved local node and updates the route without requiring the user to return to Discovery to find it.
- Local workspace startup restore now defers when a shared/view hash has not finished rebuilding the workspace yet. This prevents the first empty render during F5 from consuming the one-shot local-state restore attempt before local drafts can be merged back in.
- Local artifact creation flows now flush local workspace state immediately after save in addition to the normal scheduled autosave, reducing the chance of losing work on a fast refresh.

# Package 243 note

Package 243 tightens adapter-aware local draft identity and reload persistence after testing showed two remaining issues:

- `Open original` could resolve a local draft back to a GitHub discovery finding wrapper because several recovered artifacts share the same issue/comment origin URL. Local drafts now preserve exact edited-node identity metadata and original resolution ranks exact node/storage/path matches before origin fallbacks.
- Static `#view` reloads could let remote/source mutations race ahead of local-state merge and overwrite or miss saved Local deltas. Startup local-state restore now retries while saved local files are still missing, and remote-only startup mutations are blocked from clobbering a pending local profile before merge.

# Package 244 local workspace quota hardening

This package narrows local workspace persistence to actual local deltas and drafts. Generated artifacts recovered from remote/social sources are rebuilt from adapters and should not be serialized into the local workspace state merely because they were generated in runtime.

It also prunes regenerable route-scroll, lens, GitHub issue import trace, and GitHub cache entries when local workspace state hits browser storage quota, then retries the save.

# Package 245 note

This package hardens local draft discard semantics. Removing a local edit draft now removes the matching runtime file and immediately writes the discard to the persisted local workspace state, including the case where the deleted draft was the last local delta. This prevents discarded drafts from being restored by an older local snapshot after Discovery view changes or page reload.

# CP246 package note

- Hardened local draft discard so deleting the final local draft does not auto-create a fresh local-state profile during the same discard cycle.
- Added null-safe route/source guards around workspace source lookups used during delete/render route updates.
- Shows active discovery progress in lineage view as well as discovery feed view so source/discovery work remains visible while a lineage card is selected.

# CP247 package note

- Keeps local draft discard anchored to the exact source original when possible instead of falling back to discovery feed/source wrappers.
- Treats GitHub social discovery findings that embed typed Tiinex artifacts as resolved source envelopes even if the recovered typed artifact is temporarily shadowed or a local draft was just discarded.
- This prevents resolved `discovery.finding` wrapper cards from becoming normal feed leaves after a local edit draft is removed.

# CP248 package note

- Tightened local draft discard fallback so removing a local edit draft anchors back to the exact typed source artifact when possible, even if the draft was not the currently selected node after opening the original.
- Marked GitHub issue/comment discovery wrappers as resolved source envelopes when they contain embedded typed Tiinex artifacts so they do not reappear as normal feed leaves after local draft discard.
- Preserved explicit resolved-envelope metadata through file and node parsing for imported GitHub social material.

# Package 261 note

Package 261 fixes GitHub publication semantics for local continuation artifacts. A continuation created from a GitHub issue/comment source artifact now defaults to creating a new GitHub issue comment in the parent issue instead of reusing/updating the parent comment target. The guided GitHub routine labels that path as a continuation comment, opens the parent issue/comment only as context, and verifies by scanning for the copied body or accepting the new comment permalink.

Recovered embedded Tiinex artifacts imported from newly published comments now prefer the declared parent comment from the embedded Parent origin when that source-backed parent is loaded. This keeps Tiinex continuation parentage bound to the continued artifact/comment instead of falling back to the GitHub issue container.

# Package 262 note

Package 262 streamlines GitHub continuation publication. Continuation exports now keep the permalink/comment-id field as a fallback override instead of a normal first-step requirement: Verify scans the parent issue for the copied continuation body, then reveals the permalink override only if Tiinex cannot infer the new comment.

Continuation payloads also carry explicit Tiinex parent anchors when available, including the parent GitHub comment permalink/comment id and parent artifact path. Import/recovery uses those anchors to restore Tiinex continuation parentage before falling back to GitHub issue container parentage.

# Package 263 note

Package 263 starts the Git-native source adapter breakthrough path without replacing the working GitHub source flow yet. The package introduces a `GitSourceAdapter` research contract that defines a local-object-store-first, Time-Portal-aware source reader. Repo files, Git source-state anchors, and parent traversal are modeled as Git source responsibilities; GitHub issues/comments remain separate social/source snapshot surfaces.

The package also adds browser-visible repo fetch diagnostics for the current GitHub raw-file path. `TiinexDiagnostics.githubRepoFetchSummary()` and `TiinexDiagnostics.githubRepoFetchTraceJson()` expose how many tree/raw requests were attempted, how many raw artifact reads succeeded or failed, and whether 429/rate-limit conditions were observed. This gives us evidence before replacing the request-per-file fallback with a Git-native implementation.

# Package 264 note

Package 264 moves the Git-native source adapter breakthrough from a pure research contract into an executable adapter spine. A new `git-native-source-adapter` service defines an injected, isomorphic-git-compatible runtime boundary without silently adding a CDN, proxy, token, or hidden backend. The adapter can normalize Git remotes, acquire/identify a source snapshot, list artifact candidates from a Git source state, read files by commit/blob, and attempt parent recovery from local Git objects before any permalink/web-origin fallback.

The existing GitHub raw-file repo discovery remains the active browser flow in this package, but diagnostics now distinguish full raw URL repetition from harmless basename collisions such as many distinct `001.trace.md` files. The goal is to keep old-path observation honest while shifting implementation pressure toward the local-object-store-first Git adapter.

# Package 265 note

Package 265 wires a browser Git-native runtime bridge ahead of the future source-reader switch. The active repo discovery flow still uses the existing GitHub fallback, but the app now ships `src/app/git-native-runtime.js`, loaded before `app.js`, so an explicit isomorphic-git/LightningFS/GitHttp runtime can be provided without hiding a CDN, proxy, token, or backend.

The new browser diagnostics are `TiinexDiagnostics.gitNativeRuntimeStatus()` and `TiinexDiagnostics.gitNativeCloneLab(options)`. The clone lab is intentionally explicit: Tiinex does not choose a hidden Git CORS proxy. For GitHub browser clone tests, the caller must provide a configured runtime and an explicit `corsProxy` or explicitly allow a direct GitHub clone attempt. This keeps the breakthrough path local-object-store-first while making the CORS/proxy boundary visible.

# Package 266 note

Package 266 hardens the browser Git-native runtime bridge after the first clone-lab test showed that the isomorphic-git browser runtime needs a compatible `Buffer` dependency. The active repo discovery path still uses the existing GitHub fallback; this package only improves the explicit Git-native lab path.

When `TiinexDiagnostics.gitNativeCloneLab({ loadFromUnpkg: true, allowDefaultVendorUrls: true, ... })` is used, the runtime now loads a Buffer module explicitly before isomorphic-git, exposes Buffer availability in `gitNativeRuntimeStatus()`, and returns structured `{ ok: false }` diagnostics for setup failures instead of relying on uncaught console errors. The hidden-proxy/hidden-vendor rules remain unchanged: Tiinex does not choose a proxy or vendor runtime unless the caller explicitly allows it.

# Package 267 note

Package 267 hardens the explicit Git-native clone lab after CP266 reached a new layer: the browser runtime was available, but file-listing diagnostics could still fail with an unstructured `Cannot read properties of undefined (reading 'filter')` error when a runtime list operation did not return an array. The active product discovery path still uses the existing GitHub fallback; this package only improves the Git-native research/lab path.

The clone lab now treats Git tree walking and `listFiles` as separate observable stages, reports non-array file-list results explicitly, keeps recent lab stage events in failure reports, and can reuse an existing local clone/object store before attempting a fresh clone. This keeps the breakthrough path focused on Git-native local-object reads while giving the next test enough signal to distinguish clone, ref resolution, tree walking, and blob-read failures.

# Package 268 note

Package 268 connects the Git-native breakthrough path to repo-file discovery when an explicit browser Git runtime is available. Discovery now tries the local Git object-store path before falling back to bounded GitHub raw reads: it acquires/reuses a shallow Git snapshot, resolves the source ref to a commit, lists Tiinex artifact candidates under the configured roots, and reads artifact bodies from the local object store.

The hidden-boundary rules remain intact. Tiinex still does not choose a hidden CDN, proxy, token, or backend. A fresh browser session without an explicit runtime/vendor/proxy configuration will skip Git-native discovery and use the bounded GitHub raw fallback. After an explicit clone lab or explicit `TiinexDiagnostics.enableGitNativeDiscovery(...)` configuration, repo discovery can use the Git-native local-object-store path and avoid per-artifact `raw.githubusercontent.com` reads.

# Package 269 note

Package 269 fixes the activation gap discovered in CP268. `TiinexDiagnostics.enableGitNativeDiscovery(...)` now initializes the explicit browser Git runtime instead of only storing configuration, and it reports whether the runtime is actually ready before the user refreshes discovery. This keeps the no-hidden-CDN/proxy rule intact while making the intentional Git-native path usable.

Repo discovery now passes the persisted Git-native configuration into runtime status and snapshot acquisition. That means an explicit `loadFromUnpkg`/vendor/proxy configuration survives from enablement into ordinary discovery, allowing `discoverGitHubRepoIntoWorkspace` to choose the local Git object-store path instead of skipping Git-native and falling back to raw GitHub reads because `status({})` lacked context.

## CP270 — Git-native discovery summary guard

CP270 keeps the CP269 Git-native discovery path active and tightens repo-fetch observability so Git-native discovery is reported as first-class source acquisition instead of being folded into previous raw-byte counters.

- `TiinexDiagnostics.githubRepoFetchSummary()` now separates raw GitHub reads from Git-native local object-store reads.
- Summary now reports `gitNative.snapshotStarts`, `gitNative.snapshotComplete`, `gitNative.readSuccess`, `gitNative.readFailed`, `gitNative.readBytes`, `gitNative.candidateFiles`, `gitNative.pathsToRead`, and recent commits.
- The repo-fetch trace buffer was increased so a full Tiinex/docs Git-native discovery session can retain snapshot start/complete and read events together.
- Verdict can now return `git-native-active`, `git-native-with-raw-fallback`, or `git-native-observed-no-reads`.

This is diagnostics-only and does not change publish, issue snapshots, continuation, discard, or Time Portal behavior.

## CP271 — Git-native activation persistence

CP271 fixes the CP270 gap where Git-native runtime activation was usable in the current page but too easy to lose before the next repo discovery. `TiinexDiagnostics.enableGitNativeDiscovery(...)` now persists the explicit Git-native config in localStorage and ordinary repo discovery hydrates that config before deciding whether to use the local Git object-store path or raw fallback.

New diagnostics:

```js
TiinexDiagnostics.gitNativeDiscoveryConfig()
TiinexDiagnostics.disableGitNativeDiscovery()
```

The boundary remains explicit: Tiinex still does not choose a hidden CDN, hidden proxy, token, or backend. The persisted config exists only after an explicit enable command and can be cleared with `disableGitNativeDiscovery()`.

## CP272 — Git-native trace isolation

CP272 fixes the CP271 observability ambiguity where `githubRepoFetchSummary()` could mix raw requests from an earlier startup/auto-discovery session with a later Git-native refresh. `TiinexDiagnostics.enableGitNativeDiscovery(...)` now clears the repo-fetch trace by default when enabling Git-native discovery, and returns `traceCleared: true` in its readiness report. Pass `{ clearTrace: false }` only when deliberately comparing mixed sessions.

A new `TiinexDiagnostics.githubRepoFetchLastSessionSummary()` helper summarizes only the most recent repo acquisition session. This keeps mobile/TeamViewer testing simple: enable Git-native, refresh, then run the normal summary or last-session summary and expect `git-native-active` when repo files came from the local Git object store.

## CP273 — Git-native raw bridge closure

CP273 closes the gap where CP272 could load repo artifacts through the Git-native discovery path but later secondary material reads could still fetch commit-pinned `raw.githubusercontent.com` URLs. When explicit Git-native discovery is enabled, `fetchText()` now intercepts GitHub raw file URLs for the configured repo and reads the blob from the browser-local Git object store first.

This makes Git-native the canonical repo-material reader after explicit enablement. Raw web reads remain available only when Git-native discovery is not enabled, the URL belongs to another repo, or an explicit raw fallback override is allowed. The repo-fetch summary now reports `gitNative.rawBridgeSuccess`/`rawBridgeFailed` so secondary reads are visible without being mistaken for raw discovery.


## CP274 — Canonical Git-native adapter-request bridge

CP274 closes the CP273 gap where secondary repo material reads that called `adapterFetchText()`/`adapterRequest()` directly could still reach `raw.githubusercontent.com` even after explicit Git-native discovery was active. The Git-native raw bridge now lives at both repo material entrypoints:

- `fetchText()` for ordinary material reads.
- `adapterRequest()` for secondary adapter reads.

When explicit Git-native discovery is enabled for the same repo, matching GitHub raw URLs are satisfied from the browser-local Git object store before any network request is attempted. Raw web fallback remains blocked for that repo unless an explicit override is passed, making the local Git object store the canonical repo-material reader after enablement.

Validation run:

```text
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP275 — Raw network hard gate for Git-native repo reads

CP275 responds to CP274 browser Network evidence where `githubRepoFetchSummary()` could report `git-native-active` while DevTools still showed `app.js:829` fetches for repo artifact names. The Git-native bridge is now broader and stricter:

- `adapterRequest()` attempts the Git-native raw bridge for any URL that can be resolved to a GitHub raw URL, not only URLs already classified as `github-raw`.
- The bridge also recognizes embedded/proxied raw GitHub URLs well enough to recover the canonical raw source parts.
- Raw repo network fetches are hard-blocked for the explicitly enabled Git-native repo unless an explicit raw fallback override is passed.
- Path aliasing covers `.topics/...` versus `topics/...` raw URL variants before falling back.

The intended post-enable invariant is: Tiinex/docs repo artifacts are read from the browser-local Git object store; DevTools should not show `.topics/...`/`topics/...` repo artifact fetches from `app.js:829` as the normal path.

Validation run:

```text
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```


## CP276 - Git-native startup bootstrap

- Hydrates persisted Git-native discovery config before bootFromUrl so restored/default source loading can use the local Git object store without a console enable step.
- enableGitNativeDiscovery now persists default repo/ref/rootPaths (`Tiinex/docs`, `master`, `.topics`) so later startup has enough context to initialize the runtime.
- Adds bootstrap trace events (`git-native.bootstrap.start|ready|failed`) for startup diagnostics.


## CP277 — Packaged default Git-native startup

CP277 closes the CP276 startup gap where a freshly opened packaged viewer could still run the raw GitHub repo-material path before any console command was issued. The packaged `index.html` now seeds `TIINEX_VIEWER_OPTIONS.gitNative` with the Tiinex/docs default Git-native runtime config (`repo: Tiinex/docs`, `ref: master`, `rootPaths: .topics`, explicit vendor loading, and explicit CORS proxy).

This means a normal packaged startup has the same Git-native context that previously required `TiinexDiagnostics.enableGitNativeDiscovery(...)`. The raw GitHub reader remains fallback/degraded, but the default Tiinex/docs repo-file source path is now intended to bootstrap through the browser-local Git object store from init, not only after pressing Refresh or running console setup.

## CP278 — Git-native global raw fetch gate

CP278 responds to browser Network evidence where CP277 still showed `.topics/...` repo artifact fetches during startup even though the repo-fetch summary reported `git-native-active`. The remaining path was any direct `fetch(...)` invocation for GitHub raw repo material that bypassed the app's `fetchText()`/`adapterRequest()` bridges or reached them before diagnostics could classify it correctly.

The app now installs a Git-native raw fetch gate before startup boot. For matching `raw.githubusercontent.com/<repo>/<ref>/<path>` URLs belonging to the configured Git-native repo, the gate reads from the browser-local Git object store and returns a synthetic `Response` without touching the network. This keeps Git-native local object-store reads canonical across discovery, integrity verification, secondary material reads, and stray raw fetch callers. Network fallback for that repo remains explicit/degraded via an explicit raw fallback override only.

Validation run:

```text
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP279 — Repo-material source ownership

CP279 turns the CP278 fetch gate from the main safety mechanism into a last-resort guardrail. The app now has an explicit repo-material read boundary for GitHub file material:

- `readRepoMaterialText(...)` owns repo/ref/path/purpose reads before ordinary network fetch is attempted.
- Git-native repo matching is case-insensitive, so `Tiinex/docs` and `tiinex/docs` resolve as the same configured repo while preserving display casing.
- GitHub file URL parsing is broader and handles raw URLs, `github.com/.../blob/...`, `github.com/.../raw/...`, and contents-API file URLs with a `ref` query.
- Integrity target reads use the repo-material boundary and are deferred/unavailable when the matching Git object is not local instead of silently mass-fetching raw permalink targets.
- Parent candidate reads and material previews are routed through labeled repo-material policies.
- Startup now prepares the persisted/packaged Git-native runtime before loading viewer config, then refreshes readiness before boot.
- The global fetch gate remains installed, but it now records pass-through reasons instead of being the only evidence boundary.

`TiinexDiagnostics.githubRepoFetchSummary()` now includes a `repoMaterial` section with `gitNativeSuccess`, `rawFallbackExplicit`, `rawFallbackBlocked`, `rawPassThroughUnexpected`, `fetchGatePassThrough`, and `integrityDeferred`. A run can be Git-native-active only when unexpected repo-material pass-through is not observed.

Validation run:

```text
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```
## CP282 repo-material owner registry pass

Intent: close the observed CP281 gap where Git-native discovery succeeded but integrity/source follow-up reads still passed raw.githubusercontent.com/Tiinex/docs/.../.topics/*.trace.md through the fetch gate.

Key changes:
- Root and public viewer options now merge packaged Git-native defaults instead of relying on `window.TIINEX_VIEWER_OPTIONS || defaults`; this keeps the packaged native Git intent even if an earlier runtime/host creates an empty options object.
- Added an explicit in-memory Git-native repo-material owner registry, populated when a Git-native repo snapshot is acquired.
- Marked the workspace and discovery source as `git-object-store` / `git-native-local-object-store` when native discovery succeeds.
- `gitNativeRawReadDisabledReason()` and `gitNativeRepoMaterialIntendedFor()` now consult the owner registry before allowing same-repo raw pass-through.
- Integrity remote-target hashing now routes Git-native-owned repo material through `readRepoMaterialText(... fallbackPolicy: 'never')`; missing local objects become target-unavailable/deferred instead of implicit raw network fallback.

Browser acceptance target:
- Fresh init should show zero actual Network requests for `raw.githubusercontent.com/Tiinex/docs/.../.topics/**/*.md` when Git-native discovery succeeds.
- GitHub issue/comment/social, vendor/runtime, and CORS Git clone/fetch requests may remain.
- Any same-repo raw fallback must be explicit and visible in diagnostics.


## CP283 — Schema permalink local substitute

CP283 narrows the remaining CP282 raw fetches observed for historical Tiinex schema permalinks such as `raw.githubusercontent.com/Tiinex/docs/<old-commit>/.topics/.schemas/.../*.schema.md`.

The app now treats a Git-native-owned repo as owned even when a request points at a historical ref outside the shallow snapshot. For non-integrity schema contract reads, if the exact historical object is not available locally, the repo-material boundary may serve the same schema path from the loaded Git-native snapshot and records this as `git-native-local-object-store-ref-substitute`. Integrity/checksum reads remain exact and are never substituted.

Diagnostics now expose `repoMaterial.localRefSubstitute` so remaining raw network requests can be separated from local same-path schema substitutes.

Validation run:

```text
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP284 — Historical Git-native hydration

CP284 keeps the CP283 source boundary but stops treating historical commit misses as a terminal local-object-store miss. When a Git-native-owned repo-material read targets a full historical commit SHA outside the current shallow snapshot, the viewer now attempts a Git-native hydration pass before any raw permalink fallback is considered.

The hydration sequence is bounded and observable:

- try to fetch the exact commit SHA through the configured Git smart HTTP runtime;
- if the exact SHA fetch is unavailable, deepen the configured history ref with `historicalDepth` / `timePortalDepth` support;
- retry the exact repo/path read from the local Git object store;
- keep raw permalink fallback blocked unless the read explicitly opts into a degraded fallback policy.

This is intended to support lineage parents and schema/trace permalinks that still exist in repository history without making raw.githubusercontent.com the hidden continuity path. Diagnostics now include historical hydration counters and `TiinexDiagnostics.githubRepoMaterialProblemTargets()` for inspecting remaining blocked/missed targets.

Validation run:

```text
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP289 - Share target launchers and workspace route shape

- Added local HTML browser launchers under `open/` so cold-start share links can be tested by double-clicking a file from the extracted package.
- The launchers use relative redirects back to `../index.html`, so they move with the local package and avoid OS-specific symlink, `.url`, or shell-script behavior.
- Public hash routing now treats `.workspace.md` URLs as workspace targets instead of ordinary markdown artifacts.
- Explicit `#workspace|https://.../*.workspace.md` links fetch and apply the workspace entrypoint without opening the default workspace first.
- The readable share formats remain separate from opaque `#state=` route snapshots.

Smoke targets:

```txt
open/Open in Browser - GitHub Issue 1.html
open/Open in Browser - GitHub Issue 1 Auto URL.html
open/Open in Browser - Workspace URL Shape.html
```

Expected: the GitHub issue launchers cold-start the focused issue route. The workspace launcher exercises the `workspace|` route shape when the referenced `.workspace.md` URL is reachable.

## CP288 - Cold-start public hash target selection

- Public hash targets now load viewer identity without opening the embedded default Tiinex/docs workspace in file:// mode.
- Boot-time public hash targets replace the current workspace set instead of coexisting with default/local workspaces.
- Local workspace auto-restore is suppressed for public hash targets so a shared issue/discussion/file link remains a narrow entrypoint.
- GitHub issue hash targets select the recovered embedded Tiinex artifact when available, otherwise the issue root/comment target.
- A bounded startup lineage guard prevents cached lens state from overriding the selected public target during cold-start render settling.

Smoke target:

```txt
index.html#github.issue|https://github.com/Tiinusen/socials/issues/1
index.html#https://github.com/Tiinusen/socials/issues/1
```

Expected: one focused Tiinusen/socials workspace, no Tiinex/docs default workspace, no stale local lineage selection, and no `options is not defined`.


## CP292 — Share eligibility and interaction-card groundwork

This release separates "share" from "copy the current address bar URL".

Share targets are now classified before the user copies anything:

- `public-resolvable` — a public Tiinex viewer URL can be produced for a source-backed target.
- `access-bound` — a source URL exists, but public access cannot be proven from the current browser session.
- `draft-local` — the target is local/draft and needs export, review packaging, or publication before it can honestly be shared as a public target.
- `exact-view-only` — the current UI state can be copied, but no external source boundary was found.
- `unavailable` — no useful share target exists yet.

The topbar now opens a Share review panel instead of immediately copying an opaque view link. Workspace headers and artifact cards expose the same share review surface. Exact view links remain available, but they are explicitly labeled as exact UI state rather than default social/share targets.

Diagnostics:

```js
TiinexDiagnostics.shareEligibilityForActive()
TiinexDiagnostics.shareEligibilityForWorkspace(wsId)
TiinexDiagnostics.shareEligibilityForArtifact(wsId, nodeId)
TiinexDiagnostics.shareEligibilityReport()
TiinexDiagnostics.interactionCardPreviewForActive()
```

The interaction-card preview is intentionally lightweight: it points at the selected target and states the share boundary without turning the presentation into evidence, endorsement, or a source mutation.

Validation run:

```text
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP293 — GitHub issue comment parent binding

This release tightens GitHub issue import continuity for flat GitHub issue threads that contain multiple embedded Tiinex artifacts.

GitHub issue comments are not treated as an automatic lineage chain. Comment discovery findings now attach to the recovered issue artifact when available. Embedded Tiinex artifacts resolve their parent from explicit hints inside the embedded Source Markdown first, including Parent Trace, Parent Origin, Source Artifact, Source Path, and parent comment IDs.

For the common issue-publication shape where several comments all continue from the issue body artifact, the recovered comment artifacts should now become siblings under the recovered issue artifact instead of being chained by comment order. A real child-on-child case remains supported when the embedded artifact names or links a previous recovered comment artifact as its parent.

Diagnostics now include parent resolution metadata in the existing report:

```js
TiinexDiagnostics.githubIssueNestedContinuityReport()
```

Relevant fields:

```txt
resolutionMode
resolutionHint
resolutionScore
explicitParent
```

Expected browser signal for `https://github.com/Tiinex/docs/issues/9#issuecomment-4881782365`:

- `Welcome to the Next Dimension` remains the recovered issue-body artifact.
- `The American Experiment`, `Silicon Valley`, and `Test B` should resolve as siblings under that recovered issue-body artifact when their embedded Parent Trace points at `welcome-to-the-next-dimension.trace.md`.
- A recovered comment artifact should only appear under another recovered comment artifact when the embedded Source Markdown explicitly points there.

Validation run:

```text
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP295 — full presenter read surfaces

- Schema presenter sections no longer silently truncate in expanded cards or detail view.
- Compact/explicit preview excerpts still truncate intentionally and show a preview note.
- Markdown horizontal rules (`---`, `***`, `___`) render as visual dividers instead of text.
- Artifact Body is open by default in detail view so exact rendered body is visible without a second expand step.
- Added `TiinexDiagnostics.presentationTruncationReport()`.

## CP297 — reasoned share cards for public-ready sharing

- Share now treats the receiver context as first-class: the modal asks `Why do you want to share this?`.
- The answer is included in the copied interaction-card markdown as a reason answer, not written back into the artifact.
- Interaction cards include question, answer, intent, destination, target/open URL, status, audience, and boundary warnings.
- Public link and exact view link remain separate from reasoned card copy.
- Added lightweight share signal diagnostics for later observed-like/share counter work.
- Detail view keeps `Artifact Body` collapsed by default again; schema presenters are the primary read surface, exact body remains one click away.

Diagnostics:

```js
TiinexDiagnostics.interactionCardPreviewForActive('share', 'Why I am sharing this')
TiinexDiagnostics.shareSignalPreviewForActive('Why I am sharing this')
TiinexDiagnostics.shareCounterObservationReport()
```

Validation run:

```text
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## Product update 299 - GitHub issue live parent binding + schema badge navigation

This update tightens two public-viewing readiness edges:

- GitHub issue import now re-indexes recovered artifacts during the import pass, allowing later embedded comments to bind to earlier recovered comments instead of falling back to the issue body/root.
- Recovered GitHub issue artifacts preserve parent hint diagnostics, including explicit resolution mode, hint, score, and unresolved-hint warnings.
- Schema badge navigation now uses the same lineage lock/route transition path as ordinary artifact selection, reducing the delayed/no-op feel on first click.

New diagnostic:

```js
TiinexDiagnostics.githubIssueParentBindingAudit()
```

## Product update 300 - public-ready share destinations

This update makes the Share surface usable as a compact public-facing delivery tool instead of a raw debug dialog.

- Share modal is scroll-contained so long cards and boundary explanations do not overflow the viewport.
- The card preview is rendered as a readable interaction card, not raw markdown.
- The reason question remains optional and is included only in card-style outputs.
- Plain link copying stays plain and only appears for resolvable public Tiinex targets.
- Guestbook/comment copy provides a compact text block for generic destinations.
- Download HTML card creates a lightweight standalone interaction card file.
- Bookmark exact view prepares the address bar with an exact-view hash for browser bookmark-bar use.
- System share uses the native browser share sheet when available and falls back to copy.
- Draft/local targets keep explicit boundaries; the app does not claim a public share link when there is no public origin target.

New diagnostic:

```js
TiinexDiagnostics.shareReadinessReport()
```

## CP301 — Compact share card UI

CP301 moves the share reason prompt into the rendered interaction card itself so the dialog no longer repeats the same concept in two places.

Changes:

- The rendered share card is now the primary input surface.
- The reason textarea lives inside the card preview.
- Share actions are shortened to Card, Guestbook, Link, HTML, Bookmark, and Native.
- Share actions use a compact grid with a two-column mobile fallback.
- Long links and target values wrap instead of forcing horizontal dialog scroll.
- Boundary details stay collapsed unless the target is dangerous/unavailable.
- Added `TiinexDiagnostics.shareCompactnessReport()`.

Plain link, reasoned card, guestbook text, HTML card, bookmark, and native browser share remain separate flows.

## CP302 — Share action handoff

CP302 makes the Share surface behave like a completed user action rather than a hidden toast behind a dialog.

Changes:

- Share action buttons now use the same visual treatment so destinations do not imply different semantic weight.
- Copy actions close the Share dialog after a successful clipboard write so status feedback is visible.
- Clipboard failures open a manual copy panel instead of hiding an error behind the Share dialog.
- Bookmark prepares the exact-view URL and opens an explicit manual-step panel for Ctrl+D / Cmd+D or dragging the address bar.
- HTML share export now downloads a compact share card with an Open in Tiinex call-to-action and a collapsed markdown fallback.
- HTML and bookmark flows do not poll or repeatedly verify external destinations.

Diagnostics:

```js
TiinexDiagnostics.shareActionHandoffReport()
```

## CP303 — Share HTML opener and guestbook context

CP303 separates the two HTML share use cases and keeps the lightweight guestbook/comment text self-explanatory.

Changes:

- Guestbook/comment copy now includes the share question before the answer, so pasted text keeps the context of what the answer means.
- The HTML share destination is split into:
  - `Card HTML`: a standalone presentation card with Open in Tiinex and collapsed markdown fallback.
  - `Open HTML`: a tiny redirect/opener page similar to the local Open in Browser launchers.
- Redirect HTML includes a manual Open in Tiinex link fallback and no polling or destination probing.
- Share diagnostics now report the redirect HTML flow alongside card HTML, link, bookmark, and native share.

Diagnostics:

```js
TiinexDiagnostics.shareReadinessReport()
TiinexDiagnostics.shareActionHandoffReport()
```

## Release 304 — share mobile polish + evidence relation attachments

This release hardens the public-facing share flow and the reference/use-as evidence wizard before public publish.

- Share guestbook/comment text now includes both the prompt and the answer, so pasted text has context.
- Share modal gets a phone-width layout pass: circular close button, tighter header, compact action grid, wrapped long links, and less vertical waste.
- HTML share card copy explains that the file is a standalone Tiinex interaction card and keeps the target link as the origin boundary.
- Evidence creation through Reference / Use As now surfaces the selected artifact as a locked relation attachment when the evidence schema is selected.
- Schema-aware edit of existing evidence recovers linked Tiinex artifacts from `Linked Artifacts`, `Discovery Finding Basis`, `Provenance`, and `Evidence Material` sections into the attachment collector where possible.

New diagnostics:

```js
TiinexDiagnostics.sharePolishReadinessReport()
TiinexDiagnostics.evidenceRelationAttachmentReport()
```

## Release 305 — evidence camera capture

This release adds native camera capture to evidence creation while keeping the existing URL, file, drag-and-drop, and locked relation attachment flows.

- Evidence attachments now offer a Camera action beside URL and File.
- Camera action opens a small choice surface for back camera, front camera, or gallery fallback.
- Mobile browsers can use their native image capture flow through `accept="image/*"` and `capture` inputs.
- Captured photos are stored as normal evidence file attachments and keep capture metadata such as facing mode, capture time, media type, size, and dimensions when available.
- Camera capture is browser/device mediated; no camera stream is kept open and no server polling is used.

Diagnostic:

```js
TiinexDiagnostics.evidenceCameraCaptureReport()
```

## Release 306 — publish-ready camera fallback + launcher cleanup

This release finishes the camera capture surface and removes the bundled `open/` launcher directory before public publish.

- Evidence attachment actions now keep Camera visible on desktop and mobile instead of trying to hide it based on guessed capability.
- Camera opens a browser-native choice for back camera, front camera, or image/gallery fallback.
- Desktop browsers without native camera capture fall back through the normal image picker path rather than making the feature disappear.
- No camera stream is kept open and no server polling is used.
- The bundled `open/` launcher directory has been removed from this publish package; share-generated `Open HTML` is now the supported opener/redirect mechanism.

Diagnostic:

```js
TiinexDiagnostics.evidenceCameraCaptureReport()
```

## Checkpoint 307 — field regression sweep

- Simplified evidence image capture to one native Camera/Image picker action.
- Kept Camera visible on desktop and mobile without app-level front/back choice.
- Preserved local evidence images as local material refs so the viewer can preview them instead of guessing GitHub source URLs.
- Hid Open source for local/draft evidence assets to avoid non-existent GitHub links before publication.
- Kept the real card action bar visible on mobile so Continue, Reference, Use As and related actions remain available in the field.
- Normalized GitHub repo discovery keys so omitted ref and `master` do not start duplicate mobile discovery passes.


## Checkpoint 309 — mobile share boundary + draft package polish

This checkpoint is a field polish pass after mobile/desktop review.

- Mobile card actions now use a stable grid instead of squeezed horizontal rows.
- Expand/anchor affordances are hidden on phone card action rows to save space.
- Real transition actions remain visible and labelled where possible.
- Share cards no longer fall back to exact-view URLs as if they were public origins.
- Public link / Open HTML / Native share require a public or access-bound target.
- Draft/unpublished artifacts get an explicit artifact package HTML download that carries the artifact markdown for private review.
- Evidence preview keeps pinch-zoom friendly viewport/touch hints.

## Checkpoint 312 — evidence image persistence hotfix + restructure roadmap guard

This checkpoint focuses on the remaining field blocker before shifting attention toward schema building / Leaflet-mode work.

Changes:

- Replaced undefined `basename(...)` calls with the viewer path helper to remove the console ReferenceError seen after evidence recovery.
- Evidence image attachments now read a persistent data URL before local save, so draft/local image previews can survive refresh when browser storage allows it.
- Local image assets restored from workspace state are served directly from persisted data URLs rather than being converted into guessed GitHub source URLs.
- Material extraction now detects bare local image/material lines in addition to markdown links, so evidence material such as `001.png` or `assets/001.png` can recover as local image material.
- Added `TiinexDiagnostics.evidenceLocalAssetPersistenceReport()` to verify whether local image assets are actually persisted, blob-only, and previewable.

Design note for upcoming workspace restructuring:

Moving, deleting, inserting, or reparenting artifacts must be implemented as graph-safe workspace operations with dry-run previews and reference rewrites. Those operations should preserve continuity by updating relative paths, relinking children, and recording user-visible transition intent instead of silently mutating provenance.
