# CP298 validation note — cross-workspace relations

Intent: Reference and Use As must not be limited to artifacts from the same workspace. A visible artifact from another workspace can be the relation target/basis, while the newly created artifact is placed under the user-selected destination parent.

Changes:

- `parentPickerActiveFor` now allows the picker surface across all visible workspaces.
- Parent picker stores `referencedWsId` and `useAsBasisWsId`.
- Selection resolves parent from the clicked workspace and target/basis from the originating workspace.
- Artifact wizard keeps cross-workspace target/basis ids and workspace ids.
- Transition/reference/use-as markdown records cross-workspace source boundaries.
- Route modal descriptors include workspace identity so exact view can reopen cross-workspace relation drafts.
- Added `TiinexDiagnostics.crossWorkspaceRelationPickerReport()`.

Suggested browser test:

1. Load two workspaces side by side.
2. Press Reference on an artifact in workspace A.
3. Select parent on an artifact in workspace B.
4. Confirm the wizard opens in workspace B and shows the reference target from workspace A.
5. Review generated markdown: `Transition Boundary` and `Linked Artifacts` should name the source workspace when cross-workspace.
6. Repeat with Use As from a discovery finding in workspace A and parent in workspace B.
7. Run `TiinexDiagnostics.crossWorkspaceRelationPickerReport()` while the picker is active.

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

# CP296 validation notes

Validated locally after full fallback read-section and schema parent fetch hygiene changes:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

Manual browser validation requested:

- Expand a `decision` artifact and confirm `Decision`, `Basis`, and `Consequences` do not end with preview ellipses.
- Open detail read view for the same artifact and confirm fallback read sections match the expanded read rather than forcing Artifact Body as the only full source.
- Confirm horizontal rules render as visual rules when the artifact body contains Markdown rules.
- Re-open the Tiinusen/socials schema lineage case and confirm canonical Tiinex schema parents do not repeatedly hit `raw.githubusercontent.com/Tiinusen/socials/.../.topics/.schemas/tiinex.root.v1.schema.md` with 404s.
- Run `TiinexDiagnostics.presentationTruncationReport()`; expected `warningCount: 0` unless a deliberately preview-only surface is active.

# CP294 validation notes

Validated locally after presentation coverage changes:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

Browser/video validation is still required for visual rhythm, expanded cards, and detail read views.

# CP291 validation note — Prose rhythm and browser translate stability

Validated locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

Manual browser validation still needed:

- Open GitHub Issue 1 launcher and inspect expanded/detail prose spacing.
- Turn on Chrome Translate and switch between discovery/lineage/detail views. The expected result is less URL/hash churn and no repeated visible translation flicker from ordinary internal route writes.
- Run `TiinexDiagnostics.translationStabilityReport()` before and after enabling browser translation.
- Run `TiinexDiagnostics.activeLanguageSurfaceReport()` and confirm artifact prose surfaces are marked separately from UI chrome.

# CP290 Validation Notes — Presentation fidelity and nested GitHub continuity

Browser checks:

- Expanded card preview should preserve bullets, nested bullets, numbered list shape, code fences, blockquotes, and intentional line breaks better than CP289.
- Detail view → Artifact body should render the same markdown semantics as expanded preview where practical.
- GitHub issue target import should still load quickly from the `open/` launcher files.
- If an issue/comment thread contains recovered embedded Tiinex artifacts across multiple comments, later recovered leaves should parent to the previous recovered leaf unless the payload declares a more specific parent comment binding.
- `TiinexDiagnostics.githubIssueNestedContinuityReport()` should return `warningCount: 0` for a healthy imported issue thread. Warnings are expected to name missing/self parent situations instead of silently flattening.
- `TiinexDiagnostics.markdownRendererSmokeTest()` should return rendered HTML containing list, nested-list, blockquote, heading, and code-fence output.

Static validation run for this release:

- `node --check src/app/ui-runtime.js`
- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

# CP289 Validation Notes — Share target launchers and workspace routing

- Unzip the package locally and double-click `open/Open in Browser - GitHub Issue 1.html`.
- The launcher should redirect to `../index.html#github.issue|https://github.com/Tiinusen/socials/issues/1` relative to the launcher file location.
- Double-click `open/Open in Browser - GitHub Issue 1 Auto URL.html` to test visible URL auto-detection.
- The issue target should load as a focused Tiinusen/socials workspace without requiring manual address-bar editing.
- `open/Open in Browser - Workspace URL Shape.html` exercises the explicit `#workspace|...` route shape; the target URL must exist for a full workspace load.
- Existing `#state=` and `#view=` links should still restore app/view state.

# CP287 Validation Notes — Cold-start public hash target restore

- A cold open at `index.html#github.issue|https://github.com/Tiinusen/socials/issues/1` should load the target issue without `Could not restore browser history state: options is not defined`.
- A cold open at `index.html#https://github.com/Tiinusen/socials/issues/1` should auto-detect `github.issue` and load the same bounded target.
- `TiinexDiagnostics.parseHashShareTarget('#github.issue%7Chttps%3A%2F%2Fgithub.com%2FTiinusen%2Fsocials%2Fissues%2F1')` should return `{ adapter: 'github.issue', url: 'https://github.com/Tiinusen/socials/issues/1' }`.
- `#state=<base64-json>` and `#view=<base64-json>` should remain owned by the existing route-state decoders.
- GitHub outbound publication bodies should still use public readable viewer links and must not emit `file://`, `localhost`, or `C:\Users\...` viewer URLs.

Static validation passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

# CP286 Validation Notes — Public hash target routing

- `TiinexDiagnostics.configuredPublicViewerBaseUrl()` should return `https://tiinex.dev/` for the packaged default workspace, unless a host/workspace explicitly overrides it.
- `TiinexDiagnostics.publicViewerShareUrlFor('https://github.com/Tiinusen/socials/issues/1')` should return a readable hash target such as `https://tiinex.dev/#github.issue|https://github.com/Tiinusen/socials/issues/1`.
- Opening `https://tiinex.dev/#https://github.com/Tiinusen/socials/issues/1` should load only that bounded source target, not the whole default workspace.
- Opening `https://tiinex.dev/#github.issue|https://github.com/Tiinusen/socials/issues/1` should do the same, but with explicit adapter selection.
- Existing `#state=<base64-json>` links must continue to restore the full app state.
- GitHub outbound publication bodies must not contain local viewer links such as `file://`, `localhost`, `127.0.0.1`, or `C:\Users\...`.
- The logo should route to workspace/viewer home, not force an external GitHub tab.

Static validation passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

# CP285 Validation Notes — Progressive historical Git-native hydration

- Fresh init should still show no `raw.githubusercontent.com/Tiinex/docs/...` repo-material network success.
- `TiinexDiagnostics.githubRepoFetchSummary()` should keep `rawSuccess: 0`, `rawBytes: 0`, and `fetchGatePassThrough: 0` for repo-material reads.
- The CP284 misses for `6bbbeb9757a9d44d951877753b6f729ab3eb8f0b/.topics/odysseus/001.trace.md` and `4a64e25b9d4dc657104bee51877d140ee93f4bc2/.topics/.schemas/tiinex.topic.v1.schema.md` should be retried by progressive Git-native deepen against `master` up to `historicalMaxDepth: 256`.
- `historicalHydrateFailed` and `rawFallbackBlocked` should ideally drop to `0` for the current Tiinex/docs fixture. If they do not, `TiinexDiagnostics.githubRepoMaterialProblemTargets()` should include attempt arrays showing which depth step failed.
- Raw permalink lookup remains available only as an explicit degraded/fallback path; CP285 does not re-enable hidden raw reads.

Static validation passed locally:

- `node --check src/app/git-native-runtime.js`
- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

# CP281 Validation Notes — Git-native fallback intent boundary

- Fresh init must not show mass `raw.githubusercontent.com/Tiinex/docs/.../.topics/**/*.md` Network requests when Git-native is enabled/intended for `Tiinex/docs`.
- A persisted/global `allowRawFallback` value from earlier testing must not silently downgrade same-repo repo-material reads.
- Raw permalink fallback remains valid only when requested by a per-read explicit fallback policy.
- Integrity verification may report targets as unavailable/deferred when the object is not in the shallow Git store; that is preferable to hidden raw network fetch.
- `TiinexDiagnostics.githubRepoFetchSummary()` should describe the current/last session rather than stale trace events from earlier browser runs.

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

# CP260 Validation Notes — Discovery render stability and UX Back scroll restore

User validation accepted refresh correctness as good enough, but showed that discovery still mutates the DOM during loading, causing progress spinner restarts and scroll instability. UX Back from Lineage also continued to return to the top of Discovery even though browser Back/Forward scroll restoration was acceptable. CP260 disables progressive feed remounting during repo fetch by default, updates progress text without replacing the spinner element, and adds a direct Discovery scroll restore for UX Back that grows the windowed feed until the saved position can be applied.

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

# CP259 Validation Notes — Refresh surface guard and final progress commit

- GitHub source Refresh/Reset must not remove repo-file artifacts when Issue snapshot import refreshes or replaces stale comment material.
- Stale GitHub issue comment cleanup is only allowed for entries whose source surface is `issues` and whose issuecomment id matches the refreshed comment.
- Refresh/Reset progress should remain visible through the final render commit; adapter artifacts should not appear seconds after the progress surface has disappeared.
- Explicit source Save remains the owner for intentionally disabling `Repo files discovery`; source refresh is a reconciliation path, not a config-mutation path.

# CP258 Validation Notes — Source refresh operation boundary

- GitHub source dialog Refresh/Reset cache should show an inline progress panel while the operation is running.
- Refresh, Reset cache, and Save are disabled during that source refresh to prevent overlapping operations.
- Publication/issue snapshot binding must not turn off an existing GitHub source's repo-file discovery surface.
- Re-importing the same GitHub issue comment after edit/publish should replace stale source-backed recovered artifacts for that comment id before adding the fresh version.
- Existing stable areas remain out of scope: discard, local draft prune, publish markdown, and time portal display filters.

# CP257 Validation Notes — Source refresh progress and UX Back scroll

- Ordinary GitHub source Refresh should keep the visible progress surface until repo files, indexing/integrity/policy, issue snapshot import, and final render/reconciliation have completed.
- The progress bar must not disappear before issue/comment adapter artifacts are visible in the current view.
- Ordinary Refresh must not clear Tiinex adapter caches or pass hard-refresh semantics to issue import.
- `Reset cache` is the advanced hard-refresh path and should be used only when ordinary Refresh appears stale.
- UX Back from Lineage should return to Discovery using the last remembered Discovery scroll position captured before Lineage opened.
- Browser Back/Forward route/viewState scroll ownership is unchanged.
- No changes are made to publish, discard, local draft prune, markdown presentation, or time portal filtering.

# CP256 Source Refresh Progress And View Continuity

## Scope

- Ordinary GitHub source refresh is an in-place reconciliation.
- Discovery progress remains visible through repo file discovery, indexing/integrity/policy, and GitHub issue snapshot import.
- Soft refresh preserves expanded card state through workspace re-indexing.
- Scroll preservation remains owned by the existing render snapshot/restore surface.
- Hard refresh remains available as a last-resort cache/source reset, not as the ordinary reconciliation path.

## Verification

- Open a deep Lineage view, expand one or more cards, scroll down, then run ordinary source Refresh.
- Expected: progress continues into issue snapshot import instead of disappearing after repo files.
- Expected: expanded cards remain expanded after refresh/re-index.
- Expected: scroll position and Lineage target remain stable.
- Expected: no repeated background issue-import loop starts after refresh completes.

# CP255 Validation Notes — Restore reconciliation without discovery loop

- F5/local-state restore may prune a Local draft shadow when an identical source-backed artifact is already loaded.
- Local-state restore must not trigger GitHub issue discovery. Repeated `Imported issue snapshot` toasts after load are a regression.
- User Lineage state, expanded panels, scroll, and selected view must not reset due to background issue discovery after local restore.
- If restore prunes a local draft, persisted local workspace state must be flushed after restore completes so the draft does not return on the next F5.
- No changes are made to publish markdown, verify, discard, time portal, or broad GitHub adapter import behavior.

# CP253 Validation Notes — Verified publication consumes local draft

- Completing the guided GitHub routine after existing-comment verification should bind the verified comment permalink locally before closing the routine.
- If the live GitHub comment body matches the copied draft, the exact selected Local draft should be removed from runtime workspace state and persisted local workspace state.
- The source-backed imported/recovered artifact should take the local draft's place after recompute; the stale local edit should not remain as the active card.
- Source-backed originals must not be deleted; this patch only removes matching local/local-draft material selected for the verified publication.
- GitHub source dialog copy now reflects the current boundary: issues can be imported as source material, Discussions remain disabled.
- No GitHub write API, token, auth, backend, hidden upload, telemetry, discard change, time portal change, or markdown-presentation rewrite is introduced.

# CP252 Validation Notes — GitHub existing-comment verification and local viewer link

- GitHub outbound `Open in Tiinex` links no longer hardcode `https://tiinex.dev/`; they use the current viewer base URL with the encoded source/lineage route.
- Existing issue-comment verification may infer the known comment permalink from provenance instead of requiring the user to paste it.
- Verification for existing issue comments is not URL-shape acceptance: Tiinex fetches the public comment or scans issue comments and requires the body to match the copied draft.
- Copy, Open target, and Verify checklist actions now share primary button styling so the guided routine has one visual action language.
- Local publication-anchor cache updates an existing known comment by id instead of appending a duplicate synthetic comment when the target is an edited existing comment.
- No GitHub write API, token, auth, backend, hidden upload, or telemetry capability is introduced.

# CP251 Validation Notes — GitHub publication verify and presentation boundary

- Existing GitHub issue/comment export opens the best available known target URL, preferring comment permalinks when provenance provides one.
- Known target selection is not treated as publication verification. Copy + Open + tab return must not finalize the routine unless the user supplies a published URL.
- Existing-issue comment publication requires a `#issuecomment-...` permalink before verification can complete, because a bare issue URL cannot prove a new comment was posted in no-auth browser mode.
- GitHub outbound markdown now has a single bottom `Tiinex source payload` collapsible containing parser payload and publication notes. Human-facing content stays above that boundary.
- No GitHub write API, token, auth, backend, hidden upload, or telemetry capability is introduced.

# CP249 Validation Notes — Source-backed local draft discard

- Local draft discard now has a single file-deletion policy owner: `removeNodeCandidateMatches`.
- When the removed node is a local shadow draft, deletion is restricted to local/local-draft matches and no longer uses raw same-path deletion that can remove the source original.
- The discard confirmation now says `Discard local draft` and explicitly states that the original source artifact is preserved.
- After discard, Lineage re-anchors to the original source artifact and prefers a recovered typed source artifact over a resolved discovery-finding envelope when both exist.
- Static validation guards this ownership so future same-path cleanup does not regress source preservation.

## CP215 Validation Notes — Social Feed Card Polish

- Expanded inline cards use a compact presenter header so the outer card title and summary are not duplicated inside the preview.
- User-authored material remains the first emphasized block for discovery comments, feedback, topics, tasks, evidence, and pointers.
- Low-signal default values such as an unchanged placeholder target are suppressed from metadata chips.
- Full detail views still keep schema title, summary, provenance, limits, and adapter context available.

# CP193 package note

This package keeps CP192 exact schema filtering, then makes the schema selector tree-shaped instead of a flat alphabetical list. The selector is still a native form control for accessibility and low-risk rendering, but its options are grouped by the new `.topics/.schemas/**` directory families and indented by schema path depth.

The important boundary is unchanged: folder placement is only a discovery/navigation hint; Current Schema and artifact content remain the semantic authority. The selector now scales with all known Tiinex schema paths plus any loaded workspace-only schema IDs, so leaf schemas such as `discovery.finding`, `schema.rule`, `artifact.annotation`, and `artifact.transition` are visible in their family context instead of being mixed into one long unsorted list.

Markdown artifact kind filtering remains separate from schema filtering. `.schema.md`, `.adapter.md`, `.origin.md`, `.tool.md`, `.interface.md`, and related suffixes are represented by the in-app markdown artifact kind registry so the UI can filter file roles without pretending that suffixes are lineage schema identity.

# CP183 Schema Title Authoring Lint / Display Title Follow-up

## Scope

- Adds a non-mutating schema authoring-style lint: `schema-body-title-style-v1`.
- Detects schema artifacts whose first body H1 repeats namespace/version/file-role wording already carried elsewhere, for example `Tiinex Claim v1 Schema`.
- Derives a card/list presentation title such as `Claim` or `Discovery Breakthrough` without editing the artifact body.
- Displays a small `style` warning chip so the problematic schema H1 remains visible as tooling debt and future schema-builder test material.
- Does not change route, scroll, browser history, lineage selection, source access, GitHub discovery, issue target policy, or schema badge fetch behavior.

## Why this is not a schema-content patch

The verbose H1s are intentionally kept in the source artifacts until Tiinex has tooling that can explain and lint the issue. This package makes that lint path explicit instead of manually hiding or rewriting the source issue.

## Browser validation targets

- Open Tiinex/docs on CP183.
- Feed/Lineage cards for newer schemas should display concise titles such as `Claim`, `Condition`, `Derivation`, and `Discovery Breakthrough`.
- Hovering/opening detail/raw markdown should still reveal the original H1 text from the artifact.
- Cards with redundant schema H1s should show a `style` warning chip.
- Schema badge navigation should still work for repo schemas and digital.adapter.
- Regression-check Discovery scroll → Lineage card → Browser Back/Forward.

## Static validation commands

Passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

---

# CP182 Schema Freshness + Schema Badge Fetch Follow-up

## Scope

- Extends the Tiinex/docs schema freshness supplement with the newly committed schema files from the portal/interaction/module/surface/question/condition/claim/derivation/breakthrough work.
- Adds explicit schema-link resolution for schema badges. When `Current Schema` is a markdown link to a GitHub blob/raw URL, the app now converts that link into a raw fetch URL instead of treating the GitHub blob page as directly fetchable content.
- Keeps schema fetches under source access semantics: loaded schema material remains web-surface/raw source resolution, not evidence, preservation, validation, truth, authorship, consent, or completeness.
- Avoids route/back/scroll/lens changes.

## Browser validation targets

- Open Tiinex/docs from GitHub discovery.
- Tree view should include the newly committed schemas, including portal, portal.time, interaction.unit, schema.module, presentation.surface, question, condition, claim, derivation, and discovery.breakthrough.
- Click a schema badge on a repo-file artifact; it should select/open the loaded schema when present.
- Click a `digital.adapter` badge on a GitHub issue/discussion adapter artifact; it should load via the commit-pinned schema link instead of failing with `Failed to fetch`.
- Browser Back/Forward and UX Back should still preserve Discovery/Lineage state and scroll as in CP180c/CP181.
- GitHub source edit modal and issue target behavior should remain CP181 behavior: explicit issue URLs are allowed; broad issue API sampling remains avoided by default.

## Static validation commands

Passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

---

# CP160 Temporal Lens / Shared View Options

## Scope

- Display Options now functions as shared View Options for Discovery and Lineage views.
- Lineage mode exposes the same Display Options control as Discovery mode.
- Temporal Lens supports `Latest loaded view` and `As-of moment` modes.
- As-of mode filters visible nodes using the best available time anchor in this order: source version commit date, origin modified date, artifact `Created At`, workspace observed/imported time, then generated time.
- When no timestamp is available for an artifact, the app keeps it visible rather than pretending it can prove the artifact is newer than the lens.
- Actions started from an active temporal lens carry a visible wizard context and append a `Temporal Lens` section to generated markdown.

## User-facing behavior to verify

- Open Display Options from Discovery.
- Confirm default Temporal Lens is `Latest`.
- Set an `As-of` date and time; an active lens chip and view notice should appear.
- Discovery Feed and Tree should hide artifacts whose best available time anchor is newer than the lens.
- Enter Lineage mode and confirm the Display Options button is visible there too.
- With As-of active, Lineage should use the same temporal projection and show the same lens notice.
- Start Continue, Reference, or Use as from a temporal view; the wizard should show the temporal lens context and generated markdown should include a `Temporal Lens` section.
- Clear Temporal Lens and confirm the view returns to Latest without clearing schema/category chips.
- Regression-check Back/Forward, UX Back, F5 scroll restore, Display filter chips, and Use as parent picker.

# Artifact Registry / Display Options Follow-up

## Scope

- `TIINEX_MARKDOWN_ARTIFACT_REGISTRY` is the canonical owner for known Tiinex markdown artifact suffixes.
- The registry includes `.trace.md`, `.schema.md`, `.workspace.md`, `.validator.md`, `.adapter.md`, `.origin.md`, `.tool.md`, and `.interface.md`.
- GitHub tree discovery, jsDelivr fallback discovery, display filtering, tree/feed filtering, lineage path helpers, and structural Referenced Material exclusion should all delegate to the registry instead of maintaining separate suffix lists.
- Display Options uses an artifact category filter rather than one hard-coded checkbox per suffix. Discovery imports all known registry suffixes unless another source/discovery rule excludes them.

## User-facing behavior to verify

- Open Tiinex/docs from GitHub discovery.
- `.topics/.schemas`, `.topics/.validators`, `.topics/.adapters`, `.topics/.origins`, `.topics/.tools`, and `.topics/.interfaces` should be discoverable when present.
- Open Display options.
- The Artifact category filter should offer All Tiinex artifacts, Lineage traces, Schemas, Validators, Workspace entrypoints, Adapters, Origins, Tools, and Interfaces.
- Filtering a category should hide other artifact categories from the current view without changing imported workspace content.
- Regression-check browser Back/Forward, UX Back, and scroll restoration because this patch should not alter scroll ownership.

# CP143f GitHub origin discovery follow-up

## Scope

- Removes the explicit Refresh GitHub discovery button added in CP143e.
- GitHub discovery now queries the repository tree origin first, then falls back to the static flat-package listing only if the origin request fails.
- Registry-owned artifact suffixes remain included in GitHub tree discovery, jsDelivr fallback discovery, display options, tree/feed filtering, and lineage path helpers.
- README lists the registry-owned Tiinex markdown artifact suffixes.

## User-facing behavior to verify

- Open Tiinex/docs from GitHub discovery after CP143b is committed.
- `.topics/.validators/sha256-base64url-c14n-v1.validator.md` should be discovered from the GitHub tree origin and appear in tree/feed when the artifact category filter includes Validators.
- The workspace header should not show a separate refresh button.
- Existing `.trace.md`, `.schema.md`, `.validator.md`, and `.workspace.md` categories should remain visible by default through the Artifact category filter.

## Static validation added

- Static validation blocks a separate GitHub discovery refresh button.
- Static validation requires origin-first GitHub tree discovery with static flat-package fallback.

## Static validation commands

Run from package root:

```bash
node --check app.js
for f in tools/*.mjs; do node --check "$f"; done
find src -type f \( -name '*.mjs' -o -name '*.js' \) -print0 | sort -z | xargs -0 -n1 node --check
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## Validation status

Passed locally:

- `node --check app.js`
- `node --check tools/*.mjs`
- `node --check src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

## Metrics snapshot

- app.js lines: 19,062
- styles.css lines: 15,995
- functionDeclarations: 936
- duplicateFunctionDeclarationGroups: 0
- cleanupReadyForProductWork: yes
- architectureReadyForProductWork: yes
- public hygiene markerHits: 0

---

# Validation Notes — CP143c

CP143c integrates the committed canonical validator definition into the app runtime while keeping older plain method identifiers readable.

## Scope

- Generated `Continuity Integrity` method entries now use a markdown link to the commit-pinned `sha256-base64url-c14n-v1.validator.md` definition.
- The integrity parser normalizes linked method entries back to the canonical method id while preserving the method-definition URL for validation.
- Integrity Validation now exposes a `Method definition` link in technical details and copyable validation.
- Plain `sha256-base64url-c14n-v1` footers remain supported for older artifacts and for artifacts that predate the validator permalink.
- GitHub tree discovery and local indexing now treat `.validator.md` as a Tiinex markdown artifact alongside `.trace.md`, `.schema.md`, and `.workspace.md`.
- Discovery display options include a `.validator.md` toggle, enabled by default.
- The packaged default workspace and embedded workspace mirror were refreshed to the current pinned schema base and linked validator method entry.

## Out of scope

- No multi-validation model.
- No validation result ledger.
- No executable validator runtime registry.
- No export rewrite beyond the existing generated workspace integrity helper.
- No change to checksum canonicalization.
- No broad docs refresh outside packaged app files.

## User-facing behavior to verify

- Create a new Topic.
  - Footer method entry should be `[sha256-base64url-c14n-v1](commit-pinned validator permalink)`.
  - Integrity should still verify as byte-integrity verified.
  - Validation should show a Method definition link.
- Create a continuation.
  - Footer method entry should be linked.
  - `Towards` should still point at the parent target.
  - Parent-target checksum should still verify when the parent markdown is loaded.
- Open the Tiinex docs workspace from GitHub discovery.
  - `.topics/.validators/sha256-base64url-c14n-v1.validator.md` should be imported and visible in feed/tree when Validators are included by the artifact category filter.
- Toggle Display options.
  - Validators should appear in the artifact category filter and all Tiinex artifact categories should be visible by default.
- Existing older artifacts with plain `sha256-base64url-c14n-v1` method entries should still verify.
- Smoke test validation desktop/mobile, Continue, Reference, wizard F5/hash restore, Discovery scroll restore, Lineage scroll restore, and Discovery auto-more.

## Static validation commands

Run from package root:

```bash
node --check app.js
for f in tools/*.mjs; do node --check "$f"; done
find src -type f \( -name '*.mjs' -o -name '*.js' \) -print0 | sort -z | xargs -0 -n1 node --check
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## Validation status

Passed locally:

- `node --check app.js`
- `node --check tools/*.mjs`
- `node --check src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

## Metrics snapshot

- app.js lines: 19,032
- styles.css lines: 15,995
- functionDeclarations: 932
- duplicateFunctionDeclarationGroups: 0
- cleanupReadyForProductWork: yes
- architectureReadyForProductWork: yes
- public hygiene markerHits: 0

## Readiness signals

- architectureScaffoldReady: yes
- coreExtractionReady: yes
- serviceStateExtractionReady: yes
- uiFeatureExtractionReady: yes
- viewStateIsolationReady: yes
- publicBuildReady: yes
- cleanupReadyForProductWork: yes
- architectureReadyForProductWork: yes

# CP143d browser follow-up

## Scope

- Wizard step navigation now replaces the dialog route entry instead of pushing a second dialog route entry.
- Saving a direct-created artifact should not leave an older wizard step behind browser Back.
- `.validator.md` is included in the remaining lineage-artifact path helper used by parent/material handling.
- GitHub discovery now queries the repository tree origin before static flat-package fallback so newly committed `.validator.md` files can be picked up by origin ingest.

## User-facing behavior to verify

- Create a new Topic through the wizard, then press browser Back.
  - The saved wizard dialog should not reopen.
  - The saved artifact should remain selected or the previous non-dialog route should restore.
- Open the default Tiinex docs workspace after CP143b is committed.
  - `.topics/.validators/sha256-base64url-c14n-v1.validator.md` should be loaded and visible when Validators are included by the artifact category filter.
- Open Display options.
  - the Artifact category filter should still include Validators and default to All Tiinex artifacts.
- Existing plain-method artifacts should still verify.

## Static validation added

- Static validation now blocks `.validator.md` from being omitted in the secondary lineage-artifact path helper.
- Static validation now blocks wizard step navigation from using browser-history push entries.
- Static validation now blocks a separate GitHub discovery refresh button and requires origin-first GitHub tree discovery with static fallback.

## CP143g cleanup

- Removed the GitHub-discovery refresh-button path from the product package.
- Referenced Material now excludes structural Tiinex links such as schema artifacts, validator definitions, trace/workspace artifacts, method-definition links, and parent/origin envelope links.
- Generic Referenced Material is reserved for attachment-like supporting material. Source/schema/validator navigation remains owned by Source, schema badges, method-definition validation, and lineage navigation.



## CP143h material ownership cleanup

- Confirmed that Referenced Material had more than one entry path: the compact material section and material badges read directly from `extractMaterialRefs`, while preview/feed material used the wrapped `nodeMaterialRefs` pipeline.
- Rendered material sections, modal lookups, lightbox lookups, badges, and action indices now use the canonical `nodeMaterialRefs` pipeline so structural filters apply consistently.
- Linked validation-method examples such as `sha256-base64url-c14n-v1` and placeholder validator-permalink text are now treated as structural method metadata, not attachments.
- Static validation now blocks bypassing the canonical material pipeline and blocks method-id/validator-placeholder examples from surfacing as Referenced Material.

## CP143h browser focus

- Open `.topics/.validators/sha256-base64url-c14n-v1.validator.md` in Lineage mode.
  - It should not show a `Referenced Material` card for its own method-entry example.
  - It should not show a `1 attachment` material chip for the method-entry example.
  - Source should still open the committed validator file.
- Open schema artifacts.
  - Envelope, Current, Parent, Parent Origin, schema, trace, workspace, and validator links should not show as generic attachments.
- Evidence attachments and ordinary image/text supporting material should still appear as Referenced Material.

## CP143i image attachment preview containment

- Image attachment previews now contain the image inside the dialog viewport instead of creating an inner image scroll area.
- Saved image assets still expose Open source/Download actions for full-size access.
- Text asset previews keep their scrollable source preview behavior.
- Evidence image previews use the same contain-without-inner-scroll presentation so real attachments remain previewable without hiding dialog controls.
- Static validation blocks removing the image-specific preview body class or returning to an inner-scroll image preview.

## CP143i browser focus

- Open an image attachment from Referenced Material.
  - The image should fit inside the dialog regardless of portrait, landscape, or square ratio.
  - The image body should not show its own scrollbar.
  - Open source/Download should remain available for the full saved file.
- Open a real evidence image attachment.
  - The attachment should still preview.
  - The image should fit inside the preview panel.
- Open a text asset.
  - Text preview should still scroll when needed.


## CP143j ownership audit cleanup

- GitHub repo discovery now has one canonical `discoverGitHubRepoIntoWorkspace` implementation instead of overwritten replacement implementations.
- Tiinex markdown artifact suffix detection now delegates through one helper for discovery, indexing, lineage candidate checks, and `.validator.md` visibility.
- Referenced Material now has one canonical `nodeMaterialRefs` wrapper owner; parent/origin/structural filtering is not split across stacked wrappers.
- Structural trace/schema/validator navigation actions were removed from the attachment/material UI path. Source, lineage, schema controls, and integrity validation remain the owning navigation surfaces.
- Static validation now guards these ownership boundaries.

## CP143j browser focus

- GitHub discovery should still load `.validator.md` from origin.
- Tree/feed should still show `.validators` and `sha256-base64url-c14n-v1.validator.md` when Validators are included by the artifact category filter.
- The validator artifact should still have no false attachment chip or Referenced Material card.
- Real image/text Evidence attachments should still render and preview.
- New Topic should still receive linked validator footer and byte ok.
- Browser Back after Create should still not reopen the saved wizard dialog.

## CP144 Feed Sort Commit-Date Enrichment

- `Created At` remains the displayed and authored continuity timestamp.
- If a node has `Created At` ending in `00:00:00`, GitHub discovery may enrich the sort key with the latest file commit timestamp.
- The commit timestamp is only used when its UTC date matches the markdown `Created At` date.
- This prevents date-only schema/validator artifacts from sorting unpredictably inside the same day while avoiding cross-date provenance rewrites.
- The enrichment is sort metadata only; it does not mutate artifact markdown.


## CP145 Method Definition Authority

- Integrity Validation shows a dedicated validation method authority card.
- Validation distinguish byte-integrity result, method-definition availability, and schema authority.
- The method-definition permalink can be opened or copied from validation.
- When the validator artifact is loaded in the workspace, validation can open it directly.
- Validator artifacts display a `method definition` chip on cards.
- Plain method identifiers remain readable; linked method entries remain preferred for generated artifacts.

## CP145b Preview Action Ownership

- Opening material preview from Discovery must not also select the card or switch into Lineage mode.
- Preview material renders outside the primary card target rather than inside `post-main`.
- Material preview/open/copy actions stop click propagation.
- Lineage anchoring remains owned by explicit card selection, Open, Anchor, Continue, and Reference actions.

---

# CP146 Integrity Entry Foundation

## Scope

- Parses every first-level method entry under `Continuity Integrity`.
- Preserves linked and plain method labels for each entry.
- Selects the first supported complete `sha256-base64url-c14n-v1` entry for current byte-integrity verification.
- Shows validation-entry count in validation and copied instrumented text.
- Prevents local save refresh from collapsing multiple integrity entries into a single generated footer.

## Out of scope

- No new validation method is generated.
- No validation result ledger.
- No UI for authoring additional method entries.
- No broader validator registry beyond the committed SHA-256 method definition.

## User-facing behavior to verify

- Existing single-entry artifacts verify exactly as before.
- Validation shows `Validation entries` for byte-ok artifacts.
- A hand-authored artifact with more than one integrity method entry keeps its footer after local save.
- Unsupported entries do not block verification when a supported complete byte-integrity entry is present.

## Static validation added

- Static validation requires `parseIntegrityEntries`, `preferredIntegrityEntry`, and validation validation-entry output.
- Static validation blocks local save from flattening multiple integrity method entries.


---

# CP147 Multi-Validation Validation

## Scope

- Render every parsed integrity method entry in validation.
- Mark the active byte-integrity entry used for current checksum evaluation.
- Show unsupported, duplicate, or incomplete entries as preserved but not evaluated.
- Include evaluated, preserved unsupported, duplicate, and incomplete entry counts in copied validation.
- Keep generated artifact output to one linked SHA-256 byte-integrity entry.

## User-facing behavior to verify

- Single-entry byte-ok artifacts behave as before while showing one active validation entry.
- Multi-entry artifacts show each entry in validation without hiding unsupported entries.
- Duplicate method entries are visible as duplicate audit signals.
- Entries missing `Towards` or `Value` are visible as incomplete rather than silently ignored.
- Local save still preserves multi-entry footers.

## Static validation added

- Static validation requires per-entry validation rendering.
- Static validation requires active, preserved, and duplicate entry signals.


---

# CP148 Draft/Final Integrity Semantics

## Scope

- Treat missing or empty `Continuity Integrity` as draft/no-claim rather than a verification error.
- Surface claim lifecycle, finality, and export readiness in integrity validation.
- Keep malformed method entries distinct from draft/no-claim.
- Keep verified byte-integrity claims distinct from schema authority and method-definition availability.

## User-facing behavior to verify

- Draft/no-claim validation should say no checksum claim is being made yet.
- Draft/no-claim validation should say this is a valid local draft state, not final byte-integrity verification.
- Malformed claims should still be warnings that need repair.
- Byte-ok artifacts should remain byte-integrity verified.

## Static validation added

- Static validation requires claim lifecycle, finality, export readiness, and draft/no-claim wording in validation.


---

# Validation Notes — CP149

## Scope

- Export performs a non-mutating integrity refresh pass before archive creation.
- Local self-target Tiinex markdown is refreshed in the exported copy when safe.
- Source files, parent-target claims, unsupported methods, malformed claims, and multi-entry footers are preserved without mutating the loaded workspace.
- Export keeps the archive root aligned with the exported content tree; it does not add a root metadata folder.
- Export has one canonical archive owner for zip, tar, tar.gz, Tiinex AES-GCM packages, and Windows-compatible ZIP password mode.
- Windows-compatible ZIP password mode writes encrypted ZIP headers explicitly so file contents require the password in common ZIP clients while file names and folders remain visible.

## Browser validation

- Export a local self-target artifact and verify the exported copy remains byte-integrity consistent after import/open.
- Export a source artifact and verify it is preserved rather than rewritten.
- Export a ZIP password archive and verify file contents require the password in the ZIP client.
- Re-import that ZIP password archive and verify Tiinex prompts for the password before loading entries.
- Export a Tiinex AES-GCM package and verify Tiinex prompts for the password on re-import.

## Static validation

- Static checks require `exportFileWithIntegrityRefresh`, canonical archive ownership, ZIP password import support, no root metadata folder, and explicit traditional ZIP encryption header fields.

---

# CP150 Package / Export / Delivery Contract

## Scope

- Workspace archive export is structured as `ExportPlan → PackageResult → Delivery target`.
- Export preview shows selected files, assets, archive format, password mode, and client-side delivery before packaging.
- Export completion opens a package result summary with output filename, entry counts, delivery contract, and integrity refresh outcomes.
- Top-level `.workspace.md` saving is worded separately from per-workspace archive export.
- Export remains client-side: no telemetry, hidden upload, or default root metadata folder.

## User-facing behavior to verify

- The top toolbar action reads as saving the portable workspace configuration rather than exporting archive contents.
- Per-workspace Export opens an archive-focused dialog.
- Plain zip, ZIP password, Tiinex AES-GCM, tar, and tar.gz still download through the same canonical export action.
- After download, the package result modal appears and its Copy summary action copies the export summary.
- Exported archives still import as before and keep root structure aligned with the selected workspace tree.

## Static validation

- Static validation requires the plan/result/delivery functions, export result modal, copy-summary action, and export-result CSS surfaces.


---

# CP151b Connector / Origin Adapter Foundation

## Scope

- Origin adapters expose capability and guarantee contracts instead of assuming all origins behave like Git.
- Capabilities include discover, read, create, append, edit, replace, delete, patch, permalink resolution, content hashing, metadata observation, and reaction observation.
- GitHub is one source/community in the UX while repo files and issue discussions remain separate adapter surfaces under the hood.
- GitHub sources expose repo file discovery and issue discussion discovery toggles; issue discussion discovery defaults on.
- Portable `.workspace.md` entrypoints can declare repo file and issue discussion discovery surfaces.
- Single-source GitHub badges remain visible because the badge is now the edit entrypoint for source toggles.
- Issue comments are normalized as feedback/proposal nodes with parse level, intent, origin metadata, and body hash.
- GitHub issue import remains client-side and uses no Tiinex telemetry, token, auth prompt, write path, or hidden upload.

## User-facing behavior to verify

- In Add → GitHub source, enter a public repo URL or `owner/repo`.
- Confirm that Repo files discovery and Issue discussion discovery toggles are visible.
- Save the GitHub source; repo artifacts and issue/comment feedback should appear according to the enabled surfaces.
- Click a GitHub source badge and confirm it opens the same source dialog in edit mode.
- Close with X and confirm no source settings or workspace contents change.
- Confirm the default Tiinex docs `.workspace.md` opens with repo file and issue discussion discovery enabled.
- Confirm a single GitHub source badge remains visible and opens edit mode.
- Disable each surface separately and confirm disabled-surface files are removed from the current workspace view.
- Existing explicit URL, manual files/folders, archive export, ZIP password import/export, and AES-GCM import/export should continue to work.

## Static validation

- Static validation should keep passing with the origin adapter contract, GitHub source/community UX, issue parser, issue root/comment normalization, and export connector summary present.
- Static validation should reject a separate GitHub issue Add-flow source; issue discovery is owned by the GitHub source/community UX.

---

# Validation Notes — CP152a

CP152a stabilizes the GitHub source lifecycle and prepares schema-aware viewer modules.

## Scope

- GitHub source state is normalized through one canonical source path for workspace config, source editing, route restore, and local-state restore.
- `Issue Discussion Discovery: on` is honored at load/startup without requiring the user to save the source again.
- GitHub issue and comment imports are represented as `tiinex.discovery.finding.v1` candidates instead of canonical task, feedback, or evidence by default.
- Inline workspace discovery config remains supported and is carried as an implicit discovery directive so later explicit directive traces can be added without replacing the source model.
- The artifact wizard now exposes the new Discovery, Resource, and Instrument schema families through the shared wizard registry.
- The workspace shell can show schema-aware module cards for GitHub discovery, discovery findings, resources/budgets/usage, and instruments.
- No GitHub write/auth flow, backend, or token handling was added.
- Generated artifacts still use the current v1 checksum path. The v2 validator definition remains a future method until app/linter tooling supports v2 creation and verification.

## User-facing behavior to verify

- Open the packaged viewer workspace and load `Tiinex/docs`.
- Without editing the source, GitHub issue discussions should load when `Issue Discussion Discovery` is on.
- Refresh/F5 should not require resaving the GitHub source before issue discovery is available.
- Toggling issue discovery off should remove issue/comment material while preserving repo-file material.
- Toggling issue discovery back on should restore issue/comment discovery.
- Imported issue/comment nodes should show `tiinex.discovery.finding.v1` schema semantics.
- The New Tiinex Artifact wizard should include the new Discovery, Resource, and Instrument family options.
- Module cards should appear only when the active workspace contains matching schema families or GitHub issue/comment discovery material.

## Static validation commands

Run from package root:

```bash
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## Validation status

Passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`

---

# Validation Notes — CP152a1

CP152a1 fixes a startup regression found during browser validation.

## Regression

The app initialized to an empty shell because schema create policy validation rejected the newly added schema policy entries before render startup completed.

Root cause:

- `SCHEMA_CREATE_POLICY_REGISTRY` included the new Discovery, Resource, and Instrument schema ids.
- `SCHEMA_CREATE_POLICY_ORDER` did not include those ids.
- `SCHEMA_CREATE_POLICY_FAMILIES` did not include `discovery-family`, `resource-family`, or `instrument-family`.
- The registry guard threw during startup, blocking the UI.

## Fix

- Added all new Discovery, Resource, and Instrument schema ids to `SCHEMA_CREATE_POLICY_ORDER`.
- Added `discovery-family`, `resource-family`, and `instrument-family` to `SCHEMA_CREATE_POLICY_FAMILIES`.
- Extended static validation so the policy registry, order, and family allowlist are checked for symmetry.

## Static validation status

Passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

## Browser validation target

Retest the same startup path that previously showed an empty shell. The app should render normally before continuing the GitHub issue discovery acceptance flow.

## CP152a2 Hotfix Candidate Notes

User browser test of CP152a1 showed the startup blank-screen regression was fixed, but unauthenticated GitHub issue sampling returned `403` for `Tiinex/docs`. The source modal still showed issue discovery enabled, so the remaining problem was not the toggle state; it was error opacity and dependence on unauthenticated repository-wide issue sampling when no explicit issue URLs were configured.

Changes:

- Added GitHub API error-body parsing for issue discovery, including API message and rate-limit reset hints when available.
- Added issue discovery status tracking on the canonical GitHub source.
- Added visible GitHub discovery module status even when issue discovery is enabled but zero issue/comment findings are loaded.
- Added a default explicit issue URL for the bundled Tiinex docs workspace: `https://github.com/Tiinex/docs/issues/4`.
- Kept issue discovery read-only: no token, no auth prompt, no backend, no GitHub write.

Expected CP152a2 browser checks:

1. Start page renders.
2. Load Tiinex docs workspace.
3. Issue discovery should try the explicit `#4` URL before any repo-wide sampling.
4. If GitHub still returns `403`, the module/status text should expose the failure instead of making the source look silently enabled.
5. Expanding the source modal should show the configured issue URL.

---

# Validation Notes — CP152a3

User browser test of CP152a2 showed the GitHub discovery status card was too verbose on mobile and that the explicit test issue still did not appear when unauthenticated GitHub API access returned `403`.

## Findings

- The source lifecycle/startup path is now active: the app attempts issue discovery without requiring a source resave.
- The remaining load blocker is GitHub API access, not the workspace toggle state.
- A long explanatory module card hurts mobile ergonomics and violates the product direction of clean Tiinex status signaling.
- When explicit issue URLs are configured but live API material is unavailable, the lineage should still preserve the discovery target as a gap/finding instead of showing no visible target.

## Fixes

- Added a compact GitHub discovery status formatter for module cards.
- Added mobile-specific module card styling so status cards render as compact chips and hide explanatory adapter shell.
- Made failed GitHub discovery module cards clickable so the user can open the canonical source edit surface for details.
- Added fallback `tiinex.discovery.finding.v1` issue-target artifacts for configured Issue URLs when GitHub API loading fails.
- Fallback findings preserve the Issue URL and unavailable reason, but explicitly do not claim issue body/comment/title/timestamp preservation.
- Shortened failure toast/status text to avoid repeating long instructions in the main lineage view.

## Static validation status

Passed locally:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

## Browser validation target

1. Start page renders.
2. Load Tiinex docs workspace.
3. If GitHub API returns `403`, the module card should stay compact, especially on mobile.
4. The configured issue `#4` should appear as an unavailable GitHub issue discovery target/finding even when live issue material cannot be loaded.
5. If API access later succeeds, real issue/comment findings should load normally.

## CP152a4 mobile module/status polish

- Kept CP152a3 GitHub fallback behavior unchanged.
- Added `data-kind`/mobile labeling metadata to lineage module cards.
- Compressed lineage module cards into one-line chips on mobile so GitHub discovery status does not become adapter shell or collide with the discovery toolbar.
- Kept failed GitHub discovery card clickable for canonical source edit.
- Added mobile compact-state rule that hides module chips while scrolling down, matching the existing mobile chrome compaction behavior.


## CP152a5 note

User browser validation of CP152a4 showed two remaining polish/discovery issues:

- the repo tree under `.topics/.schemas` could show a stale branch/CDN listing that missed the newly committed Discovery/Resource/Instrument schema files;
- tree file badges did not keep a stable semantic order when optional child-count badges were present.

Patch applied:

- `fetchJson` now uses `cache: 'no-store'` and reports API body messages when available;
- Tiinex/docs repo discovery supplements the path list with the known newly committed schema/validator paths before raw fetch, so stale tree or jsDelivr listings do not hide fresh schema artifacts;
- repo discovery logs the freshness supplement when it is used;
- tree file badge ordering is now extras first, schema type next, byte/integrity badge at the far right;
- duplicate GitHub issue-discovery warning toast was removed.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser validation still required for:

- `.topics/.schemas` should now include the new Discovery/Resource/Instrument schema files after fresh load;
- GitHub Issue #4 fallback finding should remain visible if unauthenticated issue API access still fails;
- tree row badges should keep the stable order: extra badges, schema type, byte/integrity at far right.

## CP152a6 polish notes

- Removed the unavailable GitHub issue fallback URL from rendered referenced material by filtering material refs that only duplicate the node source URL. The Source action remains the canonical way to open the external GitHub issue target.
- Added schema-family badge classes for Discovery, Resource, Instrument, Runtime, Relation/Governance/Validation, Privacy/Payload, Attestation/Lineage Upgrade, while keeping white/ink styling reserved for unknown/plain schemas.
- Verified static checks after polish:
  - `npm test`
  - `npm run metrics`
  - `npm run storage:scan`
  - `npm run build:public`
  - `npm run public:check`
  - `node --check .site-publish/tiinex.bundle.js`

Browser checks still required:

1. GitHub Issue #4 fallback finding should keep the Source button but no longer render the same URL as Referenced material.
2. Known schema-family badges should no longer look like unknown white badges in feed, lineage, and tree views.

## CP152b1 schema-aware read presenter notes

User browser validation of CP152a6 showed no regression, but exposed a presentation-layer issue: the expanded card and Schema Read View were mechanically surfacing early artifact sections, while the exact markdown body often communicated the useful meaning more clearly. This is not an adapter bug; it is schema-aware presentation debt.

Patch applied:

- Added schema-aware read presenters for `tiinex.discovery.finding.v1`.
- Discovery findings now prioritize user-relevant interpretation before raw body text:
  - status;
  - finding type;
  - source/target/repository;
  - author/update information when present;
  - source URL;
  - promotion candidates;
  - canonical/promotion status;
  - unavailable reason or interpretation limit.
- Added minimal presenter foundations for `tiinex.resource.*` and `tiinex.instrument.*` so CP152b can continue without treating new schema families as unknown markdown blocks.
- Kept exact artifact body below the presenter as the source-of-truth markdown rendering.
- Updated expanded-card preview path so known schema presenters are used before generic first-heading extraction.
- Kept Raw Markdown modal unchanged.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Note: `.site-publish` is a generated build output and must be removed before `npm test` because the package validator intentionally rejects extra root entries before rebuild.

Browser checks still required:

1. Open GitHub Issue #4 / issue-comment findings in expanded card and Schema Read View.
2. The top read area should feel more useful than mechanical section extraction.
3. Exact artifact body should still be available below the schema-aware presenter.
4. Raw Markdown should remain exact and unchanged.
5. Resource/Instrument schema artifacts should render without looking unknown or empty.

## CP152b2 read-view ergonomics notes

User browser validation of CP152b1 confirmed that schema-aware presenters are the right direction, but exposed three ergonomics issues:

- full URLs wrapped awkwardly inside metric tiles;
- `Artifact Body` was still too visually dominant in Schema Read View;
- unavailable GitHub issue fallback artifacts used an `Evidence Material` heading even when no live material had been loaded.

Patch applied:

- Discovery finding presenters now show source URLs as a compact `Open source` metric/link instead of rendering the full URL as tile text.
- Schema Read View renders `Artifact Body` as a collapsed secondary details section. The exact rendered body is still available on demand, while Raw Markdown remains the exact source-of-truth view.
- Unavailable GitHub issue fallback artifacts now use `Unavailable Material` instead of `Evidence Material`, avoiding the implication that issue body/comment material was preserved.
- Expanded-card presenter behavior remains compact and schema-aware.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser checks still required:

1. Open GitHub Issue #4 fallback in expanded card and Schema Read View.
2. The source URL should appear as a compact `Open source` action/metric, not as a long wrapped tile.
3. Artifact Body should be collapsed/secondary in Schema Read View and expandable when needed.
4. Unavailable fallback body should use `Unavailable Material`, not `Evidence Material`.
5. Raw Markdown should remain exact.

## CP152b3 Tiinex interpretation wording notes

User validation of CP152b2 confirmed that the schema-aware discovery presenter is ergonomically better, but the word `promotion` was too internal and could be confused with Continue/Reference semantics.

Patch applied:

- Discovery presenter label changed from `Promotion candidates` to `Can be used as`.
- Discovery presenter interpretation line changed from `Promotion required: yes` to `Needs interpretation: yes`.
- Generated GitHub issue/comment discovery artifacts now use `Use As Candidates` and `Needs Interpretation` in their Triage sections.
- Presenter remains backward-compatible with older artifacts that still contain `Candidate Artifact Types` or `Promotion Required`.
- Interpretation Limits language now says findings must be explicitly used as task/feedback/evidence/resource need/pointer/etc. before inheriting those meanings.
- Continue and Reference semantics are unchanged; this patch only renames the discovery-to-specific-artifact interpretation surface.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser checks still required:

1. Open GitHub Issue #4 fallback in expanded card and Schema Read View.
2. Presenter should say `Can be used as`, not `Promotion candidates`.
3. Presenter should say `Needs interpretation: yes`, not `Promotion required: yes`.
4. Continue and Reference buttons should remain unchanged.
5. New imported GitHub issue/comment findings should generate Triage sections with `Use As Candidates` and `Needs Interpretation`.

## CP152b4 adapter request discipline notes

CP152b4 generalizes the GitHub rate-limit/cache work into a browser-native adapter request coordinator rather than adding a GitHub-only cache.

Patch applied:

- Added a central adapter request coordinator with single-flight request de-duplication.
- GitHub REST, GitHub raw, jsDelivr, viewer config, schema references, integrity target fetches, and generic URL JSON/text fetches now pass through the shared fetch discipline where practical.
- Normal requests use the browser HTTP cache path instead of forcing `cache: no-store` everywhere.
- Hard refresh uses explicit user action and `cache: reload`; it clears only Tiinex in-memory response cache for the selected source and does not bypass an active rate-limit guard.
- GitHub REST rate-limit headers and `Retry-After` are captured into a session-scoped guard so repeat refreshes do not hammer GitHub while backoff is active.
- Origin cache headers are parsed into cache/preservation metadata: `no-store`, `no-cache`, `private`, `max-age`, `expires`, `etag`, `last-modified`, `vary`, and `retry-after`.
- Preservation policy metadata distinguishes operational fetch/cache from explicit preservation. Cache hits are not evidence by themselves; saving material as evidence/external payload remains a deliberate artifact action.
- Source edit UI now exposes `Refresh` and `Hard refresh` for GitHub sources. Refresh remains cache-aware; hard refresh is manual and still respects rate-limit/backoff.
- Repo discovery refresh can update existing repo-file entries instead of silently skipping every already-known path.
- Issue discovery status treats rate-limited states as visible `needs attention` module status rather than retrying silently.
- Progressive indexing still performs an atomic node/index commit: parsed node arrays are built off-screen and the visible workspace is not assigned an empty index mid-load.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser checks still required:

1. Open CP152b4 and load the Tiinex docs workspace.
2. Confirm GitHub Issue #4 fallback remains visible if live GitHub issue material is unavailable.
3. Open GitHub source edit and confirm `Refresh` and `Hard refresh` are present.
4. Press `Refresh`; the source should refresh without duplicating issue targets or clearing the feed.
5. Press `Hard refresh`; it should not cause a retry storm, and active rate-limit/backoff should remain respected.
6. On slow network / Slow 4G simulation, progressive content should not disappear during `Indexing workspace` and then reappear as a second full load.

## CP152b5 request hygiene / policy lookup notes

CP152b5 keeps policy/license/NOTICE discovery, but removes the blind root-file probe pattern that created multiple avoidable 404s against origins.

Patch applied:

- Root policy lookup now first fetches the repository root manifest through the shared adapter request coordinator.
- Only policy/license/notice files that actually appear in the root manifest are fetched as raw text.
- Known policy names are still checked, but as bounded manifest matches rather than repeated raw 404 probes:
  - `LINEAGE_LICENSE.md`
  - `LINEAGE_LICENSE`
  - `LINEAGE_POLICY.md`
  - `LINEAGE_POLICY`
  - `LICENSE.md`
  - `LICENSE`
  - `POLICY.md`
  - `POLICY`
- NOTICE lookup uses the same root manifest and fetches only existing `NOTICE` / `NOTICE.md` files.
- If the root manifest cannot be read, lookup is marked `lookup-deferred` and the app does not fall back to extra raw probes that would add unnecessary load.
- Automatic GitHub commit-date enrichment is now opt-in by default (`repoCommitDateSortFetchLimit: 0`) because it can otherwise cost one GitHub REST request per artifact on ordinary browsing.
- Existing browser-cache, single-flight, rate-limit/backoff, refresh, and hard-refresh behavior from CP152b4 remains in place.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser checks still required:

1. Open CP152b5 and load the Tiinex docs workspace.
2. In DevTools Network, confirm old policy 404 probes such as `LINEAGE_LICENSE.md`, `LINEAGE_POLICY.md`, `POLICY.md`, etc. do not appear as separate raw fetch misses.
3. Confirm `LICENSE` and/or `NOTICE` still load when present in the root manifest.
4. Confirm GitHub Issue #4/comment discovery remains visible and does not retry-storm when rate-limited.
5. Confirm no large burst of `commits?sha=...&path=...` requests is started automatically on initial workspace load.

## CP152b6 policy lookup transport polish

CP152b6 changes policy/license/NOTICE discovery so the root-file manifest no longer uses unauthenticated GitHub REST `contents` API by default.

- Policy lookup still avoids blind raw 404 probes.
- Root-file presence is now checked through the cache-friendly jsDelivr flat manifest path used by the adapter request coordinator.
- Only manifest-confirmed root policy/license/NOTICE files are fetched as raw text.
- If the cache-friendly root manifest cannot be read, lookup remains `lookup-deferred`; the app still does not fall back to repeated raw probes.
- This keeps policy discovery while avoiding avoidable GitHub REST rate-limit pressure for ordinary workspace loads.

Validation focus:

1. Load Tiinex docs workspace while unauthenticated and rate-limited on GitHub REST.
2. Confirm Policy lookup does not become deferred just because GitHub REST root contents is unavailable.
3. Confirm Network does not show `api.github.com/repos/<repo>/contents?ref=...` for policy lookup.
4. Confirm no blind raw 404 probes for `LINEAGE_LICENSE`, `LINEAGE_POLICY`, or `POLICY` names.
5. Confirm `LICENSE` / `NOTICE` still load when present in the root manifest.

## CP152b7 - Use-As Interpretation Flow

- Added explicit `Use as` action chips for discovery findings.
- `Continue` and `Reference` remain unchanged:
  - `Continue` creates the next child leaf in the selected lineage.
  - `Reference` creates a reference leaf pointing at the selected artifact.
- `Use as` creates a new artifact of the selected schema with the discovery finding as explicit basis.
- The source finding remains unchanged and must not be silently treated as task, feedback, evidence, resource need, pointer, or another concrete artifact type.
- Generated use-as artifacts include a `Discovery Finding Basis` section and a `Current -> Why` line that preserves the interpretation boundary.
- Advanced candidates such as `external payload` remain visible as candidates but are not ordinary wizard actions yet.

## CP152b8 - Use-As Action UX And Read Presenter Polish

CP152b8 keeps the CP152b7 interpretation semantics, but moves the primary action path out of the expanded discovery presenter and into the ordinary card action row.

Patch applied:

- Discovery findings now get a primary `Use as` action in the card action row when ordinary use-as targets are available.
- `Use as` opens a compact `Use finding as…` picker.
- The picker creates explicit interpretation artifacts through the existing wizard flow.
- Detail/read presenter `Can be used as` chips are now contextual, not the only action path.
- `Continue` and `Reference` are unchanged:
  - `Continue` still means continuation in the selected lineage.
  - `Reference` still means a relation/reference to the selected artifact.
  - `Use as` means an explicit interpretation of a finding into another schema.
- Added minimal schema-aware read presenters for created use-as targets:
  - feedback
  - task
  - evidence
  - pointer
- Resource and instrument presenters from CP152b continue to cover resource need and related families.
- Use-as artifacts still include `Discovery Finding Basis` and leave the source finding unchanged.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser checks still required:

1. Open GitHub Issue #4 or an issue comment discovery finding.
2. Confirm the card action row includes `Use as` without expanding the card.
3. Click `Use as` and confirm the compact picker opens.
4. Choose `Feedback`, `Task`, `Evidence`, `Resource Need`, or `Pointer`.
5. Confirm the parent-placement picker opens instead of silently choosing a parent.
6. Select the source finding as parent and confirm the wizard opens in `Use as / Create from finding` mode with the finding basis retained.
7. Repeat and select another artifact as parent; confirm the wizard shows both the finding basis and the selected parent.
8. Create one use-as artifact and confirm the original finding remains unchanged.
9. Open the created artifact and confirm the read view is no longer empty or “No prioritized continuity sections found”.
10. Confirm `Continue` and `Reference` behavior is unchanged.

## CP155 - Use-As Parent Placement

Patch intent:

- `Use as` remains interpretation/projection, not mutation of the source finding.
- After choosing a use-as target schema, the app uses the same parent-placement picker as reference creation.
- The source finding is preserved as `useAsBasisNodeId` / `Discovery Finding Basis`.
- The selected parent controls lineage placement.
- Tree view file rows become selectable while parent-picker mode is active.
- Reference parent picking remains backward-compatible.

Browser checks required:

1. In Feed, click `Use as` on a discovery finding and choose a target schema.
2. Confirm the banner says `Select parent for use-as artifact`.
3. Select the original finding as parent; wizard should show finding basis and create a direct child.
4. Repeat and select another artifact as parent; wizard should show both finding basis and parent.
5. In Tree mode, repeat the parent selection; clicking a file row should select it as parent.
6. Confirm Reference still opens parent-picker and Tree selection works there too.
7. Confirm Back/Forward/F5 scroll behavior did not regress.

## CP152b9 Action Row Ergonomics

Discovery finding action rows no longer rely on horizontal scrolling. Raw Markdown remains available as a compact secondary action, while `Use as` is styled with the Tiinex accent instead of the green edit/constructive treatment. Narrow screens use icon-sized action targets and wrapping/grid behavior rather than side-scroll.
## CP152b10 Action Row Spacing Polish

- Balanced node action button left/right padding without reintroducing horizontal scroll.
- Kept Markdown as a compact icon-only secondary action.
- Kept Use as purple/Tiinex-accent styling and existing semantics.

## CP156 - Node Action Row Ownership

Patch intent:

- Keep node action rows stable across cards with and without conditional actions.
- Render non-mutating/read-only actions as icon-only to preserve horizontal space.
- Keep static mutating actions (`Continue`, `Reference`) before conditional mutating actions (`Use as`, `Edit`, `Remove`).
- Preserve accessible labels through `title` and `aria-label`.
- Do not alter scroll, discovery, or use-as parent-placement semantics.

Browser checks required:

1. Confirm `More`/`Less`, `Open`, `Markdown`, and `Source` render as icon-only on node cards.
2. Confirm `Continue` and `Reference` keep visible text.
3. Confirm `Use as` appears after `Continue` and `Reference` when available.
4. Confirm cards without `Use as` do not shift the positions of the read-only actions or static mutating actions.
5. Confirm the `Use as` parent-placement flow from CP155 still works.
6. Confirm Back/Forward/F5 scroll behavior did not regress.


## CP157 tree parent placement polish

- Tree parent-picker rows now use the same `Select as parent` wording and green visual affordance as Feed parent-picking cards.
- The tree row remains the actual click target; the visible affordance is a styled badge to avoid nested interactive controls.

## CP158 Display filter chips

Patch intent:

- Keep the default discovery view on leaf candidates without hiding schemas or artifact categories by default.
- Treat empty schema filter state as `All schemas`.
- Treat empty artifact category filter state as `All Tiinex artifacts`.
- Render selected schema and artifact filters as removable chips.
- Keep dropdowns as add-filter controls; they should not hide selected state inside a single select.
- Allow multiple schema filters and multiple artifact category filters at the same time.
- Preserve route/view-state compatibility with older single-filter links.

Browser checks required:

1. Open Display Options in a GitHub workspace.
2. Confirm `Leaves only` is enabled by default.
3. Confirm schema filter shows `All schemas` when no schema chip is selected.
4. Add `Evidence` and then another schema; both should appear as chips and the feed/tree should show the union.
5. Remove one schema chip; the view should update without clearing the other selected schema.
6. Confirm artifact category shows `All Tiinex artifacts` when no artifact chip is selected.
7. Add two artifact categories; both should appear as chips and the view should show the union.
8. Confirm add dropdowns do not offer already-selected filters.
9. Confirm copied links/view-state preserve selected filter chips.
10. Confirm Back/Forward/F5 scroll behavior did not regress.

## Display filter chip event ownership

- Schema add-filter selects are no longer claimed by the older single-schema filter listener.
- Schema chips now accumulate through the same add-filter path as artifact category chips.
- Adding or removing artifact category filters must not clear schema filter chips, and adding schema filters must not clear artifact category chips.

Browser verification:

- Add two schema chips in Display Options.
- Add one or more artifact category chips.
- Confirm both schema chips remain visible after adding artifact filters.
- Remove one schema chip and confirm the remaining schema and artifact chips stay active.
- Clear schema filters and confirm artifact filters remain active.

## CP161 Temporal Lens Polish

Patch intent:

- Keep View/Display Options usable after adding Temporal Lens by making the modal body scroll independently from the header.
- Keep the active temporal lens visible without letting the notice dominate Discovery or Lineage vertical space.
- Treat `Current -> Created At` as the strongest loaded-artifact existence boundary when deciding whether a node can appear in an As-of projection. Later source commits can show that the currently loaded file changed after the lens, but they must not by themselves prove that an older artifact did not exist.

Browser checks required:

1. Open Display Options on desktop and mobile width; confirm the dialog body scrolls and the close button/header stay reachable.
2. Set an As-of moment and confirm the temporal notice is compact and does not consume the visible feed.
3. Use an early As-of moment in Tiinex/docs and confirm early schema/root artifacts are not hidden solely due to later source-file revision metadata when their declared Created At is earlier.
4. Confirm the notice still makes clear this is a loaded projection unless a true source archive/revision has been loaded.
5. Confirm Discovery and Lineage both respect the same temporal lens and existing schema/artifact chips remain independent.
6. Confirm Back/Forward/F5 scroll behavior did not regress.

## CP162 Temporal Source Snapshot Boundary

Patch intent:

- Remove the temporal status badge from the workspace title rail to avoid clutter with source/stat/action chips.
- Keep the compact temporal notice as the canonical visible status inside Discovery/Lineage views.
- Rename the default temporal mode to loaded projection unless a source-backed snapshot has actually been loaded.
- Add explicit GitHub `Load source snapshot` support for As-of moments: find the latest commit before the selected moment and reload repo-file artifacts from that commit ref.

Browser checks required:

1. Activate a Temporal Lens and confirm the workspace title rail does not show a separate green/cyan As-of badge.
2. Confirm the compact in-view notice remains visible and says loaded projection before loading a source snapshot.
3. In a GitHub-backed workspace, use `Load source snapshot` and confirm the notice changes to a GitHub source snapshot label.
4. For an early Tiinex/docs As-of moment, confirm the loaded snapshot reflects the repo tree at the selected commit rather than only filtering current loaded files.
5. Confirm Back/Forward/F5 scroll and existing schema/artifact chips do not regress.

## CP163 GitHub Lazy Social Discovery

Patch intent:

- Keep GitHub issue/discussion discovery visible and default-enabled in Add GitHub source.
- Prevent empty social target lists from sampling latest open issues through the GitHub REST API.
- Accept explicit GitHub issue URLs and GitHub discussion URLs as social-origin targets.
- Register those targets as discovery findings without requiring live API reads.
- Preserve existing repo-file discovery and temporal source snapshot behavior.

Browser checks required:

1. Add a GitHub source with issue/discussion discovery enabled and no explicit social URLs; confirm no fallback issue target is created and status says lazy/on-demand rather than API sampling.
2. Add a GitHub source with `https://github.com/Tiinex/docs/issues/4`; confirm a target/gap discovery finding is created without a rate-limit failure.
3. Add a GitHub source with a GitHub discussion URL; confirm a discussion target discovery finding is created.
4. Confirm `Use as`, `Continue`, `Reference`, `Open`, `Markdown`, and `Source` actions still work on those target findings.
5. Confirm repo-file discovery, Display Options chips, Temporal Lens, Back/Forward/F5 scroll, and Tree view still behave as before.

## CP164 View Options Fit + Temporal Lineage Ancestors

Patch intent:

- Widen Display Options / View Options on desktop and avoid internal horizontal scroll.
- Allow the dialog to use more viewport height before the body begins scrolling.
- Keep mobile width bounded to the viewport and keep the close button reachable.
- Preserve ancestor context in Lineage mode when a descendant is visible under an active Temporal Lens.
- Keep Discovery temporal filtering unchanged; this patch only prevents Lineage mode from falsely ending at a hidden ancestor.

Browser checks required:

1. Open Display Options on desktop and confirm there is no X-axis scroll.
2. Confirm the dialog can use most of the viewport height before internal Y-scroll appears.
3. Repeat at mobile width and confirm controls fit without horizontal scrolling.
4. Activate a Temporal Lens and open a lineage whose selected artifact is visible.
5. Confirm parent/ancestor context remains visible in Lineage mode even if the loaded projection would otherwise filter the ancestor individually.
6. Confirm the notice still says loaded projection unless `Load source snapshot` has actually been used.
7. Confirm Back/Forward/F5 scroll, Display filter chips, and GitHub lazy social discovery do not regress.

## CP165 GitHub Web Repo Snapshot Resolver

Patch intent:

- Treat GitHub source/origin history as the primary Temporal Lens source when available.
- Resolve an As-of repo state by reading the GitHub web commits surface first, using URL/href semantics rather than CSS selectors.
- Keep the operation user-triggered and bounded to the selected workspace source.
- Prefer static source/tree discovery from the resolved commit ref before falling back to GitHub REST tree lookup.
- Add a human-assisted fallback input for GitHub tree URL, commit URL, or commit SHA.
- Keep artifact `Created At` as fallback projection only when source history cannot be resolved.

Browser checks required:

1. Activate Temporal Lens for a GitHub-backed workspace.
2. Click `Resolve source snapshot` and confirm the status changes from loaded projection to GitHub source snapshot when the commit can be resolved.
3. Confirm the GitHub commits page URL opened by `Open commits page` has a `since`/`until` window around the As-of moment.
4. Paste a GitHub `/tree/<sha>` URL or commit SHA into the fallback field and confirm the snapshot loads from that ref.
5. Confirm Discovery is rebuilt from the snapshot ref rather than only filtering the current loaded workspace.
6. Confirm Display Options layout, Lineage ancestor preservation, GitHub lazy social discovery, and Back/Forward/F5 scroll do not regress.

## CP166 Temporal Lens Apply Boundary

- Display Options temporal edits are staged in the modal and applied on dialog close.
- Applying an As-of lens schedules GitHub source snapshot resolution once, rather than refreshing the workspace on each datetime input change.
- Pasted GitHub tree URL / commit URL / SHA is staged in the same modal and applied on close.
- Loaded GitHub source snapshots are no longer re-filtered by artifact `Created At` for the same source; the loaded commit/tree state owns existence for that source snapshot.
- The explicit source-snapshot buttons were removed to avoid a separate manual import mental model. `Open commits page` remains as a human-assisted resolver path.

## CP167 GitHub Snapshot Resolver Fallback

Patch intent:

- Keep GitHub web commit-list resolution as the first source-history path.
- Add exactly one on-demand GitHub REST commit resolver fallback when browser CORS blocks the web commits surface.
- Keep repo discovery from the resolved commit ref static/raw-first where possible.
- Preserve an explicit `failed` temporal source snapshot state instead of silently reverting to loaded projection without explanation.
- Do not reintroduce eager issue/discussion API traversal.

Browser checks required:

1. Set Temporal Lens As-of on a GitHub workspace and close Display Options.
2. Confirm the status moves through source snapshot loading and either becomes `GitHub source snapshot @ <sha>` or visibly reports `source snapshot unresolved`.
3. If loaded, confirm Discovery rebuilds from the commit snapshot and includes files that exist at that repo state rather than only the current workspace projection.
4. If unresolved, paste a GitHub `/tree/<sha>`, `/commit/<sha>`, or SHA and close Display Options; confirm the snapshot loads from the pasted ref.
5. Confirm empty issue/discussion targets still do not trigger broad API sampling.

## CP168 GitHub Snapshot Resolver Guard Isolation

Validation focus:

1. Apply a GitHub Temporal Lens As-of date and close Display Options.
2. Confirm the app attempts source snapshot resolution even if previous issue/social discovery has created a `github-rest` rate-limit guard in session state.
3. Confirm the visible mode becomes either `GitHub source snapshot @ <sha>` or an honest unresolved state with an actionable error.
4. When loaded, confirm Discovery is built from the resolved commit ref and not re-filtered by artifact `Created At`.
5. Confirm empty issue/discussion target lists still do not perform broad API sampling.

## CP169 Known-ref source snapshot

- Temporal source snapshots now treat pasted GitHub tree URLs, commit URLs, or commit SHAs as first-class snapshot refs.
- Known refs run normal repository discovery against that ref instead of relying on artifact `Created At` projection.
- When static/jsDelivr and GitHub tree discovery cannot enumerate a snapshot ref, the loader can fall back to a seeded path manifest from the already-known workspace/source paths, then fetch raw files at the pasted ref and skip missing files.
- Date-to-commit resolving remains best-effort convenience; source snapshots by known ref are the canonical no-API/manual path.

## CP170 No-API Source Snapshot Boundary

Implementation notes:
- Source snapshot flow no longer uses GitHub REST/API as a fallback for date-to-commit resolving or tree enumeration.
- Pasted tree URLs, commit URLs, and SHA refs load as first-class known-ref snapshots.
- Known-ref snapshot discovery uses static/jsDelivr flat listing first, then seeded raw path fetches when static enumeration is unavailable.
- Silent commit-date enrichment remains opt-in (`repoCommitDateSortFetchLimit: 0`) to avoid one REST request per artifact.
- Date-to-commit auto-resolve is web-only/best-effort; if GitHub HTML is CORS-blocked, use `Open commits page` plus pasted ref.

Browser checks:
1. Open a GitHub-backed workspace and open Display Options.
2. Set As-of to the desired moment.
3. Paste `541269c` or `https://github.com/Tiinex/docs/tree/541269c` into Tree URL / SHA.
4. Close Display Options.
5. Confirm the notice becomes `GitHub source snapshot @ 541269c` and does not show GitHub API/rate-limit errors.
6. Disable Leaves only and confirm Discovery is built from the snapshot ref using static/raw paths, not artifact `Created At` filtering.
7. Confirm that leaving Tree URL / SHA empty does not silently call GitHub REST; date auto-resolve may become unresolved if GitHub web HTML is CORS-blocked.

## CP171 Historical schema snapshot compatibility

Changes:
- Treat `.topics/.schemas/tiinex.*.vN.md` as historical Tiinex schema artifacts during import/discovery.
- Add historical Tiinex/docs schema paths to the no-API seeded source snapshot manifest.
- Keep modern `.schema.md` schema support unchanged.

Validation:
1. Load `Tiinex/docs` and set an As-of Temporal Lens around 2026-05-30.
2. Paste `541269c` or `https://github.com/Tiinex/docs/tree/541269c` into `Tree URL / SHA`, then close Display Options.
3. Confirm the notice becomes `GitHub source snapshot @ 541269c` when the known-ref snapshot loads.
4. In Tree mode with Leaves only off, expand `.topics/.schemas` and confirm historical schema files such as `tiinex.evidence.v1.md`, `tiinex.task.v1.md`, and `tiinex.topic.v1.md` are discoverable as schema artifacts when present in that commit.
5. Confirm the console does not show GitHub API requests from the source snapshot flow.


## CP172 — No-API snapshot ref boundary and visible tree child counts

- Date-only temporal lens no longer silently attempts GitHub date-to-commit resolving when no Tree URL/SHA is supplied; no-API mode now marks this as `source snapshot needs ref` instead of a misleading unresolved failure.
- Known Tree URL / commit URL / SHA remains the canonical no-API source snapshot path.
- Discovery tree child badges are scoped to children visible in the current tree view and same source context so collapsed/filtered/current-graph descendants are not counted as if they belonged to the visible snapshot row.
- GitHub API remains disabled for source snapshot flow unless introduced later as an explicit user-invoked capability.

## CP173 — Compact source modules and no-ref projection clarity

Changes:
- Compress lineage/source module cards into a one-line horizontal rail across desktop and mobile.
- Preserve module click/edit behavior while reducing vertical chrome.
- Clarify no-ref Temporal Lens wording so date-only no-API mode reads as loaded projection needing a source ref.

Validation:
1. Load a GitHub-backed workspace and confirm the `GitHub discovery` module renders as a compact one-line chip/row, not a tall full-width header card.
2. On a narrow/mobile viewport, confirm the module rail stays one line and can scroll horizontally if needed.
3. Set an As-of date without Tree URL/SHA and close Display Options. Confirm the notice communicates that the view is a loaded projection needing a ref rather than a loaded source snapshot.
4. Paste a known ref such as `541269c` and confirm the known-ref source snapshot path still works without GitHub API calls.

## CP173 Final — Time portal resolver dialog and compact source chrome

Changes:
- Replace GitHub-specific controls inside Display Options with a clean Time portal date/time picker.
- Open a source-specific resolver lightbox only when a no-API GitHub source snapshot needs a concrete ref.
- The resolver lightbox supports `Open commits page` and paste of tree URL, commit URL, or SHA.
- Valid resolver input automatically loads the source snapshot and closes the lightbox.
- Compact the GitHub discovery/module header to a one-line source chip/rail.

Validation:
1. Open Display Options and confirm the Time portal card only contains the date/time picker plus Now/Clear helpers.
2. Set an As-of value without a ref and close Display Options. Confirm a separate resolver lightbox appears for GitHub no-API ref input.
3. Confirm the resolver has an Open commits page button and a Tree URL / commit URL / SHA input.
4. Paste `541269c` or a `https://github.com/Tiinex/docs/tree/541269c` URL and confirm the dialog closes and attempts to load the snapshot.
5. Confirm no `api.github.com` requests are triggered by the snapshot flow.
6. Confirm the GitHub discovery/source module renders compactly and does not take a full header-card height on desktop or mobile.

## CP174 validation notes

- Display Options Time portal uses Begin/End datetime inputs rather than the previous single “As of” control.
- Begin-only should filter the latest loaded state and must not open the GitHub ref resolver.
- End should preserve the no-API GitHub behavior: if a concrete ref is needed, the adapter dialog opens; no GitHub API fallback is invoked silently.
- Feed/Tree toolbars and compact GitHub source chips should no longer change width or consume a second source-card row.


## CP175 — Lineage audit summary, mismatch filter, and compact Display Options

Changes:
- The Lineage `Audit` button now runs a visible audit pass instead of behaving like a silent/one-step parent fetch. It attempts to load open parent boundaries, verifies loaded lineage integrity, and renders an audit summary with OK/mismatch/open/pending counts.
- Display Options adds a `Mismatches only` filter so reviewers can narrow the view to checksum problem areas.
- Display Options is more compact: adapter shell helper text is reduced, filter chips sit beside their dropdowns on desktop, controls use content-sized widths where possible, and the Time portal duplicate summary badge is removed.
- The Display Options button is placed consistently in the toolbar/search rail for both Discovery and Lineage modes.
- Mobile Display Options and Time portal status are tightened to preserve vertical reading space.

Browser checks:
1. Open Lineage mode and click `Audit`; confirm a visible audit summary appears with OK/mismatch/open/pending counts.
2. Confirm the audit button still loads open parent boundaries where available and does not look inert when there is no fetchable boundary.
3. Open Display Options and toggle `Mismatches only`; confirm Discovery narrows to mismatch problem areas and the active display count increments.
4. Confirm the Display Options button sits in the same toolbar area in Discovery and Lineage modes.
5. On mobile/narrow viewport, confirm Display Options is more compact and the Time portal notice does not consume a large card height.

## CP176 validation notes

Scope:

- Time portal interval polish: Begin/End auto-swap, latest restore on Clear, and latest restore when End is removed.
- Lineage toolbar polish: Audit, Display Options, preview, and search share a stable compact action rail.
- Display Options mobile polish: schema/artifact filter chips should wrap below the selector without overlap.

Browser checks:

1. Enter an End earlier than Begin and confirm the controls normalize to the chronological order after the control applies.
2. Load a GitHub source snapshot via the resolver dialog, then clear the Time portal and confirm the source view returns to the latest/default ref rather than the historical snapshot content.
3. Remove End while leaving Begin and confirm the view uses latest-state time filtering rather than staying pinned to the historical snapshot ref.
4. In Lineage mode, confirm Audit, Display Options, preview, and search do not overlap and feel like one consistent toolbar group.
5. On mobile, confirm schema/artifact filter chips in Display Options do not collide with dropdowns.

Static checks run:

- `node --check app.js`
- `node --check tools/*.mjs`
- `node --check src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `unzip -t CP176 zip`

## CP177 validation notes

Scope:

- Local no-API GitHub commit cache for Time portal End resolution.
- Lineage mode stability during rerender/audit/integrity refresh.

Browser checks:

1. Open a Time portal End for a GitHub source and resolve it manually once with a known ref such as `541269c`.
2. Clear/latest-restore, then set the same or a later nearby End again. Confirm the app can use the cached commit candidate without immediately opening the manual resolver dialog when the cached ref is eligible.
3. Confirm no silent `api.github.com` calls are introduced by this cache path.
4. Enter Lineage mode from a Discovery card and wait through integrity refresh; confirm the view does not bounce back to Discovery.
5. Click Audit in Lineage mode and confirm the view remains in Lineage while the audit summary updates.

Static checks run:

- `node --check app.js`
- `node --check tools/*.mjs`
- `node --check src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `unzip -t CP177 zip`

## CP178 route safety and Lineage toolbar polish

- Fixed a route/history regression where Lineage selection could be restored from stale hash/session lens state after Back or browser Back.
- App Back now explicitly clears the selected lineage target and writes a Discovery route instead of relying on `history.back()` landing on the correct prior entry.
- Browser Back to an empty/no-route hash clears Lineage selection and suppresses cached Lineage lens reapplication, preventing the viewer from getting stuck in Lineage mode.
- Removed a duplicate route push during node selection that could create repeated Lineage history entries.
- Toned down the Audit button and separated Back/Audit/Display/Preview click areas in the Lineage toolbar.

## CP179 validation notes

Scope:

- Browser Back and in-app Back routing stability for Lineage mode.
- Durable lens/cache URL ownership cleanup.

Browser checks:

1. Load the app from a local `file://` URL with an empty hash.
2. Enter Lineage from a Discovery card.
3. Press browser Back and confirm the view returns to Discovery instead of staying locked in Lineage.
4. Enter Lineage again and press the app Back button; confirm it returns to Discovery and the URL/hash reflects Discovery rather than the old selected Lineage target.
5. Press Audit in Lineage and confirm it neither triggers Back nor changes to Discovery.
6. Scroll in Lineage, then press browser Back; confirm scroll/session persistence does not rewrite the URL back to Lineage.

Static checks run:

- `node --check app.js`
- `node --check tools/*.mjs`
- `node --check src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`

## CP180b validation notes

Scope:

- Explicit Discovery route ownership after browser Back from Lineage.
- Lineage view lock must not override browser Back or explicit Discovery routes.
- Static-disk `#view` popstate restore should remain the active route owner through render.

Browser checks:

1. Start from a `file://` app URL with an explicit Discovery `#view` route.
2. Open a Lineage card.
3. Press browser Back.
4. Confirm Discovery remains visible for more than the Lineage lock window and does not bounce back to Lineage.
5. Press browser Forward and confirm the same Lineage card opens.
6. Press app Back from Lineage and confirm it returns to Discovery without triggering Audit.
7. Reload while on Discovery and confirm cached Lineage does not reappear.

Static checks run:

- `node --check app.js`
- `node --check tools/*.mjs`
- `node --check src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `unzip -t CP180b zip`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `unzip -t CP179 zip`
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

## CP181 — Adapter source-access contract and git-native trajectory

Scope:

- Establish a first-class source access mode contract for adapter/source provenance.
- Keep the active implementation on conservative `web-surface` / raw HTTP access for GitHub sources.
- Model `local-working-tree`, `local-git-archive`, `browser-remote-git`, and `service-backed-git` as explicit capability boundaries rather than hidden future assumptions.
- Preserve the CP180c route/back/scroll behavior; no route, scroll, or lens ownership logic was intentionally changed.

Implementation boundary:

- `SourceAccessMode` is now represented on workspace sources and source-loaded files.
- GitHub repo discovery records source access as `web-surface` and raw-file resolution as `github-raw-file`.
- Local/manual/draft material records `local-working-tree` source access.
- Adapter contracts now expose allowed or future source access modes without implementing local git, browser remote git, or service-backed git yet.
- Source resolution boundaries explicitly state that resolving or observing source material does not create evidence, preservation, validation, truth, authorship, consent, or completeness.

Conservative retrieval policy:

- GitHub issue/discussion surfaces remain lazy when no explicit targets are configured.
- Repo file discovery continues to prefer static/raw path resolution.
- Git-native modes are architectural trajectory, not active network/storage behavior in CP181.

Static checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
```

Browser checks still required:

1. Load CP181 from `file://` and confirm CP180c Discovery -> Lineage card selection still stays in Lineage.
2. Browser Back from Lineage should return to Discovery at the prior scroll position.
3. Browser Forward should return to the same Lineage card.
4. Add/edit a GitHub source and confirm the UI still loads repo files through the existing conservative path.
5. Enable issue/discussion discovery with no explicit targets and confirm it does not broad-sample live GitHub API material.

## CP184 — Recursive schema layout and transition-aware artifact actions

Scope:

- Updated Tiinex/docs schema path handling from a flat `.topics/.schemas/*.schema.md` assumption to a recursive `.topics/.schemas/**/**/*.schema.md` layout.
- Removed reliance on a docs-side `.layout` JSON manifest. The app carries a built-in Tiinex schema path index for conservative fallback/freshness only.
- Added normalization for stale Tiinex/docs flat schema paths observed through tree/CDN sources so they map to current directory-shaped schema paths before fetch.
- Updated schema create-policy permalinks and generated schema references to point to `master` paths in the recursive layout.
- Added transition-aware metadata for Continue, Reference, and Use as actions. Generated artifacts now include a Transition Boundary section that states transition kind, source/result boundary, mutation policy, provisional handle, durable identity boundary, and interpretation limit.

Static checks run after CP184:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

All checks passed. Browser regression still required for:

1. Tiinex/docs recursive `.topics/.schemas` discovery after the docs layout migration.
2. Schema badge opening from nested schema cards.
3. Continue/Reference/Use as wizard generation and Transition Boundary output.
4. CP180c Discovery scroll → Lineage → Back/Forward behavior.

## CP185 — Render stabilization and post-render effect hygiene

Scope:

- Reduce idle DOM churn observed after CP184 in Lineage mode with DevTools open.
- Keep CP184 recursive schema discovery and transition-aware actions intact.
- Preserve CP180c route/back/scroll ownership.

Implementation boundary:

- `patchRender` now uses stable HTML fragment hashes before replacing the workspace grid, toasts, or modal root.
- Repeated render calls with identical output no longer replace the same DOM subtree just to rebind it.
- Visible lineage integrity verification is queued once per selected-lineage signature instead of on every render pass.
- The signature is based on workspace, selected node, visible lineage node paths/storage keys, integrity claim, and raw source target.
- Durable identity, transition metadata, route history, stored scroll, and source discovery semantics are unchanged.

Static checks run after CP185:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser regression still required for:

1. Idle Lineage mode with DevTools open should no longer blink/repaint continuously.
2. Tiinex/docs recursive `.topics/.schemas` discovery after the docs layout migration.
3. Schema badge opening from nested schema cards.
4. Continue/Reference/Use as wizard generation and Transition Boundary output.
5. CP180c Discovery scroll → Lineage → Browser Back/Forward behavior.


## CP186 UX Back Route Parity

- Changed the Lineage toolbar Back action to prefer the same browser history transition used by the native browser Back button.
- The UX Back button now calls the bounded route-history back helper when a Tiinex route history entry is available.
- The old direct clear-selection behavior remains only as a fallback for direct Lineage loads or route entries without a Tiinex back stack.
- This keeps URL, parsed route view state, and scroll restoration under the same owner for browser Back and in-app Back.
- No recursive schema discovery, transition artifact generation, render stabilization, or route/scroll storage contracts were otherwise changed.

## CP187 — Adapter bridge and schema-policy discovery fallback

Scope:

- Completed the first GitHub social-origin adapter split in the web app by separating `github-issue` and `github-discussion` adapter contracts.
- Added explicit Adapter Boundary sections to generated GitHub social-origin discovery findings.
- Added an explicit `Import issue` card action for target-only GitHub issue findings. This imports issue body/comments only when the user asks for that enrichment.
- Kept GitHub discussions target-only in anonymous client mode because live discussion body/comment import is not safely available through the same conservative REST path.
- Added a schema create-policy fallback for all known Tiinex schema paths in the recursive schema catalog, without making directory placement semantic authority.

Static checks run after CP187:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

All checks passed.

Browser regression still required for:

1. Add Tiinex/docs GitHub source and confirm nested `.topics/.schemas` discovery remains stable.
2. Add an explicit GitHub issue URL, confirm target-only finding appears, then click `Import issue` and confirm issue/comment discovery findings are added.
3. Add an explicit GitHub discussion URL and confirm it remains a target-only discovery finding with an Adapter Boundary, not a fake live import.
4. Continue / Reference / Use as still generate Transition Boundary sections.
5. Discovery scroll → Lineage → Browser Back/Forward → UX Back parity remains green.

## CP188 — GitHub public issue adapter completion

Scope:

- Remove the Tiinex/docs issue #4 fallback from the embedded default workspace configuration.
- Stop treating issue discovery as target-registration only when public GitHub issue material can be read without login.
- Make bounded public issue discovery import issue body snapshots and issue comments automatically.
- Keep GitHub Discussions target-only in anonymous client mode rather than pretending discussion bodies/comments were imported.
- Correct GitHub issue/comment adapter artifact dates by using the observed GitHub source `created_at` value for generated issue and comment findings.
- Keep adapter import provenance explicit with observed/imported timestamps and body hashes.

Implementation boundary:

- No GitHub write, token prompt, backend, telemetry, or authenticated API requirement was added.
- Public issues are discovered through a bounded recent-open issue scan when issue/discussion discovery is enabled and no explicit targets are configured.
- Explicit issue URLs now import material immediately instead of creating a misleading target-only finding that requires a second manual click.
- Explicit discussion URLs still create target-only findings with an Adapter Boundary because anonymous browser mode does not provide an equivalent reliable discussion material import path.
- Existing `Import issue` action remains as a retry/enrichment action for unavailable or target-only issue findings.

Static checks run after CP188:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

All checks passed.

Browser regression still required for:

1. Fresh Tiinex/docs default source should no longer preconfigure issue #4.
2. With issue/discussion discovery enabled and no explicit URLs, recent public issues should import as issue-root/comment discovery findings within bounded limits.
3. Imported GitHub issue/comment cards should show source creation dates instead of the adapter import day.
4. Explicit GitHub issue URLs should import body/comments without requiring a second manual click.
5. Explicit GitHub discussion URLs should remain target-only with honest Adapter Boundary copy.
6. Continue / Reference / Use as should still generate Transition Boundary sections.
7. Discovery scroll → Lineage → Browser Back/Forward → UX Back parity remains green.


## CP189 — GitHub issue source-config hygiene

Scope:

- Keep CP188 bounded public GitHub issue discovery and issue/comment material import.
- Reserve the source modal `Issue / discussion URLs` textarea for explicit human-configured targets only.
- Stop writing adapter-discovered/imported issue URLs back into `source.issueUrls`.
- Track imported/discovered issue URLs separately as adapter observations, not source configuration.
- Route-state and workspace export now serialize explicit configured social targets only.
- Existing imported issue/comment artifacts remain discoverable; they no longer make the source config look manually seeded.

Why:

- A source configured with empty explicit targets should visibly test real bounded public issue discovery.
- Auto-imported GitHub issues such as #4/#5 must not reappear in the textarea and make discovery look pre-filled.
- Source configuration should describe user intent; adapter discoveries should be provenance/material results.

Static checks run after CP189:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

All checks passed.

Browser regression still required for:

1. Open Tiinex/docs source settings after prior issue imports; explicit Issue/discussion URLs should be empty unless the user typed explicit targets in this build.
2. Leave the field empty, refresh discovery, and confirm bounded public issue discovery imports issues/comments.
3. Re-open the source settings after import; imported issue URLs should not be written back into the textarea.
4. Type an explicit issue URL and save; confirm that it is treated as explicit configuration and imports issue body/comments.
5. Type an explicit discussion URL and save; confirm that it remains target-only with Adapter Boundary copy.
6. Back/Forward/UX Back parity remains green.

## CP190 — GitHub discovery loading guard

Scope:

- Keep CP189 source-config hygiene and CP188 public issue adapter behavior.
- Fix a repo discovery preflight ReferenceError that could leave `ws.loading = true` and `discoveryProgress = 0%` indefinitely before the main discovery `try/finally` boundary started.
- Correct the source-state no-repo-files path to use `normalizedSource.repo` when deriving explicit issue/discussion target URLs.

Why:

- The source modal could be correctly empty, but fresh discovery could still hang at `Loading 0%` because the discovery preamble referenced `normalizedSource.repo` outside the function where it exists.
- Loading state must never depend on an undefined config variable before the cleanup/finally path is active.
- This was not a schema/adapter semantic issue; it was source-discovery control-flow debt.

Static checks run after CP190:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

All checks passed.

Browser regression still required for:

1. Fresh Tiinex/docs source with empty issue/discussion URLs should leave Loading and render discovered nodes.
2. Bounded public issue discovery should import issue body/comment findings when issue discovery is enabled.
3. Source settings should remain empty after adapter-discovered issue imports unless explicit targets were typed by the user.
4. Back/Forward/UX Back parity remains green.

## CP191 — Search and Filter Contract Clarification

### Scope

- Expanded the schema display filter to use the known Tiinex schema surface, not only schemas already visible in the current node set.
- Kept artifact-kind filtering bounded to Tiinex markdown artifact kinds.
- Clarified the search scope in the UI and added deterministic advanced query tokens.

### Search behavior

Discovery and lineage search now scan title, summary, schema, path, source, date, and markdown body. Advanced tokens are supported for deterministic filtering:

- `schema:condition`
- `kind:schema`
- `title:"OLLE Object"`
- `path:.schemas`
- `source:Tiinex/docs`
- `status:mismatch`
- `has:parent`
- `is:draft`
- `-schema:schema`

Search remains a workspace/view filter and does not create provenance, evidence, validation, or transition artifacts by itself.

### Guardrails

- No route/history/scroll ownership changes.
- No GitHub source/adaptor policy changes.
- No dependency on `.layout` JSON.

## CP192 — schema-exact filters and markdown artifact suffix contract

Scope:
- Reworked display schema filtering so it no longer collapses Tiinex schemas to coarse families such as Discovery or Resource.
- Schema filters now use exact schema IDs when available, including every known Tiinex docs schema path and every schema loaded into the workspace.
- Filtering still keeps backward-compatible aliases for coarse family keys, but the dropdown exposes exact schemas as the scalable surface.
- Search help now documents exact schema search examples such as `schema:discovery.finding` and continues to support `schema:condition`, `kind:schema`, `has:parent`, and negative filters.
- Kept artifact file-type filtering as a suffix/kind registry for Tiinex markdown artifact categories instead of mixing it with schema-family filtering.

Boundary:
- Folder/path remains a navigation/discovery hint, not semantic authority.
- Search/filter state remains presentation/query state, not discovery, evidence, validation, or transition provenance.
- Markdown artifact kind is suffix-based support metadata for the app; it does not replace Current Schema or Continuity Context.

## CP194 — Schema branch filter semantics

Scope:

- Reworked schema display filters from exact-only schema matching to branch-aware schema scope matching.
- Schema tree selections now use branch semantics by default, with durable stored keys such as `branch:tiinex.discovery.v1` rather than bare schema IDs.
- Backward-compatible bare schema filter values are normalized into branch filters.
- `root` branch now means the root schema branch, so with `Leaves only` enabled it returns leaf artifacts under the Tiinex root branch instead of matching only the root artifact itself.
- Exact matching remains internally supported via `exact:<schema-id>` for future UI/advanced use, but the display picker defaults to branch semantics because it is a tree picker.

Validation:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

Boundary:

- Folder/tree placement is still a navigation and discovery hint, not schema authority.
- Schema filter selection is a view/filter lens, not discovery, evidence, validation, transition, or truth.
- Route/back/scroll, GitHub adapter import, transition-aware actions, and render stabilization were not intentionally changed.

## CP195 — GitHub Outbound Adapter Drafts

- Added a GitHub outbound draft action for GitHub-backed artifacts.
- Added a modal that prepares new issue, existing issue-comment, and new discussion draft bodies.
- Draft bodies include a Tiinex Transition Boundary and state that durable identity comes from the published GitHub URL/comment plus any future Tiinex Continuity Integrity fingerprint, not from local sequential IDs.
- No GitHub writes, tokens, auth prompts, backend, or telemetry were introduced.
- Outbound draft, copied body, and published GitHub material remain separate states.
- CP194 schema branch filtering and CP190 discovery loading guard are preserved.

## CP196 — Export-owned GitHub outbound drafts

- Removed per-card GitHub draft action from feed/lineage rows.
- Moved GitHub outbound draft preparation into the existing workspace Export/Save modal as a delivery target.
- Export selection now owns GitHub outbound body generation, so local/generated draft artifacts can be exported via adapter without extra row-level actions.
- GitHub draft mode remains client-side and no-write: it prepares copy-ready issue/comment/discussion bodies and safe GitHub web-form links only.
- Existing Download archive export remains the default delivery target.
- Transition boundaries remain explicit: outbound draft is not published material, not canonical Tiinex storage, and does not mutate loaded artifacts.

Validation run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t CP196 zip
```


## CP197 — Export Adapter Capability Surface

- Reframed workspace export around adapter capabilities rather than late delivery choice.
- Download archive capability keeps archive/password/assets controls.
- GitHub web draft capability hides file/password archive controls and presents markdown-only outbound issue/comment/discussion draft panels.
- Added responsive layout rules for the export modal so mobile screens can reach controls without horizontal assumptions.
- No GitHub write, token, backend, auth prompt, or telemetry was added.

## CP198 — Export adapter surface hierarchy

Scope:

- Fixed the GitHub export ReferenceError caused by a stale `schemaIdFromPath` call in workspace draft body generation.
- Added a Tiinex schema path-to-id helper so export summaries can derive schema labels from nested `.topics/.schemas/**` paths when explicit schema metadata is absent.
- Changed the visible export capability label from `GitHub web draft` to `GitHub`.
- Added a nested GitHub surface selector for Git repository, Issue tracker, and Discussion board.
- Git repository export is intentionally shown as unavailable in the no-auth browser adapter, rather than hidden or faked.
- Issue tracker and Discussion board continue to prepare copy-ready markdown only; no GitHub write, auth prompt, backend, token, or telemetry is introduced.

Validation:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Boundary:

- Export adapter capability is not a generic delivery checkbox.
- Download supports files/archive/password.
- GitHub browser adapter supports markdown text for GitHub web surfaces only.
- Prepared GitHub text is not published material, canonical Tiinex storage, evidence, validation, preservation, or mutation of loaded sources.

## CP199 — Staged Export Adapter Routine

Scope:

- Reworked the export modal into a staged workflow:
  - Configure adapter/scope/capability first.
  - Execute the chosen routine second.
- Download archive now has an execution step with a bounded `Download now` action.
- GitHub export now has an execution step with a bounded manual publishing routine.
- GitHub access levels are surfaced as:
  - manual copy/paste
  - web-form shortcut
  - API write as future/unavailable in the no-auth browser adapter
- GitHub draft preview bodies are collapsed by default so the modal is shorter and more mobile-friendly.
- GitHub continues to support markdown text only; files/assets are referenced, not uploaded.

Validation:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Boundary:

- Export adapter choice is capability selection, not generic delivery state.
- Prepared outbound GitHub markdown is not a posted issue/comment/discussion.
- Copying markdown is not publication.
- API write is not faked without an authenticated adapter.
- Loaded source artifacts are not mutated by either export setup or export execution.

## CP200 — Export UX compactness and disabled capability polish

- Stabilized workspace source strips so source/source-mode rows do not jump when local/generated sources appear or disappear during export/discovery work.
- Reworked GitHub export setup into compact capability rows for surface and access level instead of large card sections.
- Made unavailable Git repository and API-write capabilities visibly disabled in no-auth browser mode.
- Kept GitHub export as staged configure → execute routine; no API write, token prompt, backend, or telemetry was added.
- Preserved CP194 branch-aware schema filters, CP188/CP190 issue discovery, CP196/CP199 export ownership, and CP186 route/back/scroll behavior.

Checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```


## CP201 — export modal viewport and scroll stability

Scope:

- Added explicit modal body scroll restore keys for export setup and execute stages.
- Increased and compacted the staged export panel for desktop and mobile viewport fit.
- Preserved Download/GitHub adapter capability semantics and no-write GitHub browser boundary.

Validation target:

- Changing export adapter, scope, archive format, or password mode should preserve the current dialog scroll within the setup step.
- Moving from Configure to Execute intentionally uses a separate scroll boundary.
- Existing route/back/scroll and GitHub issue/discussion adapter behavior should remain unchanged.

## CP202 — guided GitHub export checklist

Scope:

- Replaced the GitHub export execution step with a per-artifact checklist routine.
- Added visible Copy body, Open GitHub form, and Verify and continue actions in the execution step.
- GitHub export advances one selected markdown artifact at a time.
- Issue tracker verification fetches the provided public issue URL through the existing GitHub issue adapter.
- Discussion board verification remains target/URL-shape bounded pending discussion enrichment.
- Removed the confusing access-level choice from GitHub setup; unsupported API/write capabilities are not presented as actionable routes.

Checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser validation focus:

- Save workspace → GitHub → Issue tracker → Continue should show a one-artifact checklist.
- Copy body should mark the copy step.
- Open GitHub form should open the form and mark the open step.
- Paste a published issue URL and Verify and continue should fetch/verify and advance to the next artifact.
- Discussion board should use the same routine but only URL-shape verification until public discussion import is added.
- Download export behavior should remain unchanged.

## CP203 — GitHub export target resolver checklist

Scope:

- Reworked the GitHub export execute step into checklist rows with icon, instruction, local action/control, and verification status.
- Added target strategy for GitHub export:
  - create new,
  - reuse known lineage/source target,
  - paste existing target.
- Added target candidate inference from artifact URLs, markdown text, loaded node source, parent origin, and parent lineage.
- Moved verification into a dedicated checklist step and made footer Continue/Done gated on successful verification.
- Issue verification fetches the public issue URL and stores resolved title/state; discussion verification remains URL-shape bounded until discussion enrichment lands.
- Preserved no-write/no-token/no-backend GitHub browser adapter boundary.

Checks run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser validation focus:

- Save workspace → GitHub → Issue tracker → Continue should show a target-aware checklist.
- If the artifact comes from an imported issue or parent issue, Reuse known should be offered and preselect a candidate.
- Paste existing should show a URL input and Verify should report an explicit error for malformed URLs.
- A valid GitHub issue URL should fetch/resolve and enable Continue/Done.
- The footer Continue/Done button should remain disabled until verification passes.
- Cancel should always be available.

## CP204 Validation Notes — GitHub Export Checklist Action Rows

Scope:

- GitHub export checklist UX only.
- No changes to route, scroll, history, discovery import, recursive schema layout, or core archive export semantics.

Checks run:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `unzip -t` on the output zip

Expected browser checks:

1. Save workspace → GitHub → Issue tracker → Continue.
2. Confirm each checklist row has a clear action/control.
3. Paste an invalid URL and confirm a clear error.
4. Paste a valid issue URL and confirm auto-verification attempts to resolve it.
5. Confirm Continue/Done stays disabled until Copy, Open, and Verify are all completed.


## CP205 Validation Notes — GitHub Export/Import Continuity And Local UX Back

Scope:

- GitHub export checklist state-machine semantics.
- Artifact-local GitHub target inference and `Reuse known` default when a known issue target is recoverable from artifact/source/parent/transition material.
- GitHub issue comment rediscovery of embedded Tiinex source markdown.
- Workspace-local UX Back behavior.
- Transition parent/target picker semantics across Feed/Lineage/Tree.

Expected browser checks:

1. Export an artifact whose parent/source/transition material references a GitHub issue. `Reuse known` should be selected by default and should not require manually typing the issue number.
2. Change target mode or target URL after Copy/Open/Verify. Copy/Open/Verify should become stale/cleared and Continue/Done should disable again.
3. Export to a GitHub issue/comment, refresh or rediscover issues, and confirm the comment wrapper remains a discovery finding while embedded Tiinex source markdown is also loaded as its original schema/type.
4. In Lineage, press the in-app Back button. The current workspace should switch to Discovery without invoking browser history navigation.
5. Browser Back/Forward should still operate as browser navigation.
6. Start a Reference/Use-as transition, choose a parent/target from Feed, Lineage, or Tree, including the same source artifact; the wizard should preserve reference/use-as semantics rather than silently converting self-selection into Continue.
7. Download export should continue to work as before.

Checks run:

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
unzip -t <output zip>
```


## CP206 Validation Notes — Export Defaults And GitHub Artifact Recovery

Scope:

- Default export selection order and default scope.
- Open-issue-only broad GitHub issue discovery wording/behavior.
- GitHub issue/comment permalink continuity metadata.
- Embedded Tiinex artifact recovery from GitHub issue bodies and comments.
- Deterministic recovered artifact paths to avoid duplicate recovered artifacts after F5/rediscovery.

Expected browser checks:

1. Open Save workspace. Expected: `Local` is selected by default, `Sources` is second, `All` is last.
2. Choose GitHub export after local changes. Expected: the routine starts from local changed/created artifacts unless the user explicitly chooses Sources or All.
3. Discover a GitHub source with no explicit issue URLs. Expected: broad discovery considers recent open public issues only.
4. Import a specific issue or issue-comment permalink. Expected: the issue/comment URL remains usable as source/target continuity even if broad discovery is open-only.
5. Export a Tiinex artifact to a GitHub issue body or comment, then F5/rediscover. Expected: the issue/comment wrapper remains a discovery finding and the embedded Tiinex artifact is recovered as its original schema/type.
6. Repeat F5/rediscovery. Expected: recovered artifacts update deterministically and do not gain duplicate `-2`, `-3`, etc. artifacts for the same issue/comment.
7. Re-export a recovered artifact. Expected: Reuse known can infer the GitHub issue/comment source target without manually entering the issue number.

Checks run:

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
unzip -t <output zip>
```

## Export scope and adapter defaults

Intent:

- Keep export scope continuity in browser session storage.
- Order scope choices as Local → Source → All.
- Infer the default export adapter from the selected lineage/source boundary, ignoring local as a semantic adapter.
- Prefer GitHub export when the selected lineage, parent chain, recovered origin, source, or GitHub issue/discussion permalink provides a non-local GitHub adapter signal.

Changed behavior:

- `defaultExportModal()` now reads the previous export scope from `sessionStorage` for this browser session.
- First-use fallback remains `local`.
- Source selections are also session-scoped and restored when the user returns to Source scope.
- The export modal infers GitHub adapter/surface metadata from selected lineage provenance before falling back to Download.
- GitHub issue/comment/discussion permalinks can seed `githubIssueUrl`, `githubTargetUrl`, and `githubSurface` defaults.
- Local remains ignored as a non-local adapter signal.

Boundary:

- Scope is user-continuity state, not artifact provenance.
- Adapter inference is a UI default only; it does not claim publication, verification, evidence, preservation, or canonical Tiinex storage.
- GitHub export remains no-write, no-token, no-auth, no-backend, no-telemetry.

Checks:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t <output zip>
```

## CP208 Validation Notes — Compact GitHub Export Routine

Scope:

- Compact the GitHub export checklist rows for desktop and mobile.
- Fix the missing `normalizeGitHubUrlForComparison` helper.
- Make known GitHub targets usable without redundant manual validation.
- Keep create-new exports gated on pasted published URL verification.
- Keep existing-target exports gated on target-known/target-shape acceptance plus Copy and Open.

Expected browser checks:

1. Open GitHub export for an artifact with an inferred issue target. Expected: `Reuse known` is selected and the target row is already accepted as a known target; Continue still requires Copy and Open.
2. Click Resolve/Recheck on a known issue target. Expected: no ReferenceError; live issue resolve succeeds when available or degrades to URL-shape accepted without blocking the flow.
3. Switch to Create new. Expected: the Verify row appears and requires the published issue URL after GitHub publication.
4. Switch to Paste existing and enter an invalid URL. Expected: target row is not green and Continue remains disabled.
5. Paste a valid issue URL. Expected: Verify accepts/resolve-checks the target and allows progress after Copy/Open.
6. Resize to mobile width. Expected: target controls stack cleanly without forcing unnecessary vertical gaps or hidden actions.

Checks:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t <output zip>
```

## CP209 — GitHub export auto-finish and post-export cleanup

CP209 keeps CP208's compact GitHub export routine, then removes two first-time flow frictions observed during browser testing. When the final selected GitHub export artifact is complete, the routine now closes the export dialog instead of showing a completion panel that still asks the user to press a no-op Done button. The workspace is recomputed, Discovery is refreshed, and the workspace-local Lineage view is returned to Discovery with a route replace.

The GitHub export routine also watches browser focus/visibility return as a low-frequency destination check trigger. The app does not poll aggressively; focus/visibility checks are throttled to at most once per five seconds and only run while the GitHub export execute routine is open. This keeps the manual web-surface adapter bounded while letting Tiinex re-check target state at the natural moment when the user returns from GitHub.

After export completion, identical local/generated artifacts are pruned when the same canonical markdown is now present from a non-local source. Recovered GitHub artifacts remain as source-owned artifacts; matching local shadows are removed from the current workspace so Discovery does not show a local copy beside the source copy. Discovery findings that only wrap a recovered embedded Tiinex artifact are also hidden from the default Discovery result list while remaining in workspace storage/provenance for recovery and audit purposes.

Boundaries unchanged: no GitHub write API, no auth, no token, no backend, no telemetry. A recovered artifact is still recovered/imported source material, not automatic truth, evidence, preservation, or canonical acceptance.


## CP210 — GitHub export focus stability and finding promotion cleanup

Scope:

- Prevent GitHub export focus/visibility checks from re-rendering an incomplete routine when no valid target URL is available.
- Keep throttled focus/visibility destination checks for valid GitHub issue/discussion targets.
- Treat resolved adapter discovery findings as bounded adapter shells in default Discovery when a real artifact is attached or generated from them.
- Keep explicit discovery finding inspection available through search/filter.

Expected browser checks:

1. Start a GitHub export, Copy, Open GitHub, switch tabs back and forth before pasting a target URL. Expected: the checklist state does not restart or visually jump back to the beginning.
2. Paste a valid published URL or use a known target, then return to Tiinex. Expected: throttled focus/visibility check may finish/close the routine when all required steps are satisfied.
3. Rediscover GitHub issue/comment material that contains or leads to a real Tiinex artifact. Expected: default Discovery shows the recovered/generated artifact lineage, not the adapter finding wrapper as the primary work item.
4. Search/filter for discovery findings. Expected: hidden resolved wrappers can still be inspected for provenance and audit.
5. Confirm no GitHub write/auth/token/backend/telemetry is introduced.

Checks:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t <output zip>
```

## CP211 — Discovery finding hierarchy and Time Portal filtering

Scope:

- Treat discovery findings as working cards only while unresolved/unknown/ambiguous.
- Hide findings from default Leaves-only Discovery once a typed child/recovered artifact exists.
- Keep explicit finding inspection available through search/filter and Tree without Leaves only.
- Ensure GitHub issue/comment adapter material respects Time Portal display windows instead of bypassing the filter through repo snapshot logic.

Expected browser checks:

1. Import/discover a GitHub issue with only untyped body material. Expected: an unresolved `discovery.finding` can appear as a working finding.
2. Use As / Continue from that finding with the finding selected as parent. Expected: the new typed child becomes the default visible working leaf; the finding is hidden when Leaves only is enabled.
3. Repeat Use As / Continue from the latest leaf. Expected: only the newest terminal leaf remains in default Leaves-only feed, while lineage still shows the chain.
4. Switch Tree on with Leaves only disabled. Expected: finding hierarchy can be inspected.
5. Filter/search for discovery findings. Expected: resolved finding shells are still available for provenance/audit.
6. Enable Time Portal with an end date before newly discovered GitHub issue/comment material. Expected: today's issue tracker adapter cards are hidden from the feed; repo snapshot behavior for source files remains intact.

Checks:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t <output zip>
```

## CP212 Validation Notes — Live GitHub Comment Refresh

- Fixed a refresh gap where a workspace restored from local state could skip GitHub issue/comment re-import when issue material already existed locally.
- Added active GitHub issue target resolution: configured issue URLs plus adapter-discovered issue URLs are both used as refresh targets.
- User/source refresh and existing issue-surface refresh now hard-refresh GitHub issue/comment REST reads within the bounded adapter flow.
- Explicit "Import issue" action now hard-refreshes visible GitHub issue material.
- Intended UX: if an issue body contains a typed Tiinex artifact and a later comment is untyped, the typed artifact remains the working card while the untyped comment appears as an unresolved `discovery.finding` working leaf.

Validation run:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```


## CP213 Validation Notes — GitHub Comment Continuity and Human Finding Cards

- Fixed the typed-issue-body plus untyped-comment scenario: when the GitHub issue body contains a recoverable typed Tiinex artifact, imported raw comments now parent to that recovered artifact instead of the issue discovery shell.
- This preserves working-leaf continuity: the unresolved comment is the current leaf, and the already-recovered topic does not remain visible as a disconnected parallel leaf in default Leaves-only Discovery.
- GitHub issue comment finding cards now use a comment excerpt and author in title/summary instead of exposing the GitHub comment id as the primary UX label.
- Discovery finding detail now includes an observed-material block so raw comments are understandable without inspecting adapter boilerplate.

Validation run:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t <output zip>
```


## CP214 Validation Notes — Human Card Presenters

- Reordered discovery finding read presentation so observed/comment material appears first, source/author/time/link appears as compact metadata chips, and adapter interpretation/limits are collapsed behind a details block.
- Stripped fenced markdown wrappers from observed material in discovery finding detail cards so raw comments read like comments instead of adapter payload boilerplate.
- Added a topic presenter and updated feedback/task/evidence/pointer presenters to foreground user-authored material before secondary metadata.
- Kept badges as the main high-level status vocabulary; presenter metadata is lower emphasis context, not a competing status table.
- Verified syntax, static validation, metrics, storage scan, public build/check, and public bundle syntax.

## CP216 Validation Notes — GitHub Presentation Boundary

- GitHub outbound single-artifact drafts use the artifact's human body title instead of the envelope `Continuity Context` heading for issue/discussion titles.
- Draft bodies include a short GitHub-readable presentation section first, followed by a stable `<!-- tiinex-artifact-start ... -->` divider.
- Tiinex embedded-artifact extraction now strips the GitHub presentation layer when the divider is present and recovers the markdown from the `Source Markdown` fenced payload below it.
- Adapter and transition details remain available in collapsible sections but no longer dominate the GitHub issue body.

## CP217 Validation Notes — GitHub Viewer Bridge

Scope:
- Add a GitHub-to-Tiinex bridge link in outbound markdown when a public source or known GitHub issue target exists.
- Keep GitHub presentation human-readable while preserving machine-readable recovery below the `tiinex-artifact-start` marker.
- Make Tiinex route boot/load accept GitHub issue URLs as live social sources, allowing viewer links to load issue bodies/comments and select recovered artifacts.

Validation commands run for this package:
- `node --check app.js`
- `node --check tools/*.mjs src/**/*.mjs src/**/*.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- clean zip extraction checks

Browser checks requested:
- Export a known GitHub-target artifact as a comment; confirm the GitHub markdown starts with human content and an `Open in Tiinex` link.
- Open that Tiinex link; expected result is a Tiinex viewer route that imports the GitHub issue surface and selects the typed artifact where possible.
- Export a brand new local-only issue; expected result is still human-readable GitHub markdown, with honest fallback text when no public source/target URL exists yet.
- Refresh/F5 after publishing; expected result is no discovery finding created from the presentation layer above the marker.


## CP218 Validation Notes — Export Checklist Stability + Plain GitHub Titles

- Preserved Copy/Open checklist state when the user pastes/verifies a published GitHub URL for a create-new export. The published URL only resets verification state, not the copied/opened draft signatures.
- Kept full routine reset for actual target/mode changes, where the prepared target/destination can change.
- Changed GitHub issue/discussion draft titles to the artifact's human title only. Removed schema/path suffixes such as `· welcome to the next dimension trace md` from native GitHub titles.
- Verified syntax, static checks, tests, metrics, storage scan, public build/check, public bundle syntax, and zip integrity.


## CP219 Validation Notes — GitHub Issue URL Web Fallback

- Explicit GitHub issue URLs still prefer the GitHub REST issue/comment API.
- If REST is rate-limited/unavailable, Tiinex now attempts a non-REST GitHub issue web-page fallback.
- Successful web fallback is normalized into the same issue root, comment finding, embedded artifact recovery, and working-leaf logic as the REST path.
- If both REST and web fallback are unavailable, Tiinex still preserves the issue target as a bounded target-only discovery finding.
- This keeps the fallback honest: web parsing is best-effort and does not claim API completeness, but it no longer creates a different adapter shape when the web page is readable.

## CP220 Validation Notes — GitHub issue cache + publication-origin binding

Changed from CP219:

- Added persistent cache key `tiinex.github.issueThreadCache.v1` for GitHub issue thread snapshots.
- `fetchGitHubIssueThreadWithFallback` now uses:
  1. fresh cache when explicitly preferred,
  2. GitHub REST issue/comment API,
  3. GitHub web-page fallback,
  4. stale cache when live reads are unavailable,
  5. target-only unavailable finding only when there is no readable live source and no cache.
- Successful live API/web reads populate the cache.
- Verified manual exports now queue a local publication-anchor import from the exact copied draft body, keyed by the pasted GitHub issue URL. This preserves continuity even before the API can be read again.
- The exported local file metadata is annotated with `publishedOriginUrl`, `publishedOriginKind`, and `publishedOriginObservedAt`; `sourceOrigin` is filled when empty so known target inference can continue working.
- Post-export discovery refresh prefers cache and does not force a hard-refresh detail read by default.

Checks run:

```txt
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Expected browser checks:

1. Publish a new GitHub issue through the manual wizard while API detail reads are limited.
   - Verify the issue URL.
   - Finish the routine.
   - Expected: the published URL is locally bound and the just-published artifact is imported/recovered from the copied draft, without needing a fresh API detail read.

2. Add a configured issue URL that was previously loaded successfully.
   - Simulate rate-limit/guarded API state.
   - Expected: cached issue/comment snapshot loads with cached/stale semantics; it must not claim live freshness.

3. Add a brand-new issue URL never seen before while API and web fallback are unavailable.
   - Expected: target-only finding remains, because no live or cached material exists.

4. Save/reopen workspace.
   - Expected: sourceOrigin / publication-origin metadata helps target inference continue working.

## CP221 Validation Notes — GitHub Reader Fallback and Origin Traversal

Intent: avoid burning GitHub REST API detail requests for known issue targets and keep known issue continuity usable after API rate limits.

Expected behavior:

- Configured or discovered issue URLs attempt cache/reader/web fallback before GitHub REST detail reads.
- If reader/web fallback can read a public issue, it should produce the same issue/comment discovery behavior as the REST path: typed issue body recovery, untyped comments as discovery findings, same working-leaf rules.
- If no live material and no cache exists, the app remains honest and keeps a target-only placeholder.
- If a real issue thread later loads, previous target-only/unavailable placeholders for that issue are pruned.
- Known issue URLs in sourceOrigin/publishedOrigin/recoveredFrom URLs or artifact markdown are eligible as traversal discovery targets.

Validation commands run:

```sh
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```


## CP222 Validation Notes — GitHub Fallback Reader And Workspace Source State

- Explicit GitHub issue targets now use local cache/public reader/API fallback before GitHub REST, then stale cache, and only then target-only placeholders.
- Workspace exports include active issue URLs and a compact cached issue-thread snapshot so known issues can continue working when public API limits are exhausted.
- GitHub discussion options are disabled in source/export surfaces because discussion import/export is not implemented at parity with issues.
- The embedded default Tiinex/docs workspace includes issue #9 as a workspace-scoped configured issue target.


## CP223 Validation Notes — GitHub Fallback Gaps Not Working Artifacts

- Corrected malformed public reader/Jina fallback URL variants for GitHub issue detail reads.
- Added `isGitHubTargetOnlyFindingNode` so unavailable/target-only GitHub issue placeholders are not treated as working leaves.
- Default Discovery feed hides target-only GitHub gap cards unless the user explicitly searches/filters discovery findings.
- Target-only material remains preserved as source/status context and can still be inspected via explicit discovery filters; the app should not present it as if issue body/comments were imported.
- Static verification: run syntax, tests, metrics, storage scan, public build/check, bundle syntax check, and zip integrity.


## CP224 Validation Notes — GitHub Paste Fallback Import

- Automatic GitHub issue import still tries cache/readers/web/API before declaring a target gap.
- The target-gap `Import issue` action now opens a paste fallback when automatic reads fail.
- Pasted issue material is imported through `loadGitHubIssueThreadSnapshotIntoWorkspace`, preserving the same typed-artifact recovery, untyped-comment finding, working-leaf, and continuity rules as API import.
- The fallback accepts saved GitHub HTML, reader markdown/page text, issue/thread JSON, or plain visible issue material. Plain text is treated as issue-body material and remains clearly user-pasted, not live GitHub proof.

## Package 225 Validation Notes — GitHub Issue Reader Validation Alignment

Browser validation for `https://github.com/Tiinex/docs/issues/9` showed direct GitHub issue HTML is blocked by CORS, but GitHub API issue/comments and multiple Jina reader candidates returned readable material. Package 225 therefore removes direct GitHub HTML from the automatic issue fallback chain, keeps the parser for manual/pasted HTML only, adds the verified reader URL shape, and lets explicit configured issue targets bypass stale session rate-limit guards so a prior API-limit state does not force a target-only gap after the browser can read again.

Validation run:

```bash
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```


## Package 226 Validation Notes — GitHub Jina API Reader Fallback

- Added a direct `github-jina-api-reader-fallback` path for known GitHub issue targets.
- The new path reads `https://r.jina.ai/http://https://api.github.com/repos/<owner>/<repo>/issues/<n>` and the matching comments endpoint, then normalizes the result through the same issue/comment snapshot pipeline as the API path.
- Hardened `jsonFromPossiblyWrappedText` so Jina reader wrappers, fenced JSON, and balanced JSON slices are parsed more reliably.
- Kept direct `github.com/issues/...` browser fetch out of automatic fallback because validation confirmed CORS blocks it.
- Updated secondary enabled button styling to reduce disabled/secondary ambiguity beside primary actions.

## Package 227 Validation Notes — Jina Comment Parser and REST Rate-limit Guard

- Browser instrumentation proved the Jina issue reader endpoint and Jina comments reader endpoint both returned HTTP 200 with Tiinex markers/material, but comments parsing failed on `Bad control character in string literal` because the reader returned JSON-like text with raw markdown newlines inside `body` strings.
- `jsonFromPossiblyWrappedText` now attempts strict JSON parsing first, then repairs control characters inside JSON strings and retries. Balanced JSON extraction uses the same tolerant parse helper.
- GitHub REST/API adapter rate-limit guards are persisted to localStorage and sessionStorage. This lets the app remember a GitHub API reset time across refreshes instead of re-probing aggressively.
- Configured issue targets can still bypass stale reader-side guards, but REST detail fallback uses a separate options object with `ignoreRateLimitGuard: false`, so a known GitHub REST rate limit is respected.

Validation commands run:

```sh
node --check app.js
node --check tools/*.mjs src/**/*.mjs src/**/*.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
unzip -t output-package.zip
```

## CP228 Validation Notes — Jina Loose Comment Extraction

- Root cause from browser instrumentation: direct GitHub issue HTML is CORS-blocked, Jina reader URLs return 200 and include Source Markdown/Current Schema, but Jina-wrapped GitHub issue comments can contain raw control characters/newlines inside JSON string values and fail strict JSON parsing.
- Added a loose GitHub API comment extraction path for Jina reader text. It extracts comment blocks, IDs, html URLs, authors, timestamps, and bodies without evaluating untrusted content.
- Jina issue/detail fallback should now normalize successful reader material into the same issue-thread shape used by the API path; target-only gaps remain only when cache, reader, and last-resort API provide no usable issue body or comments.
- Direct `github.com/issues/...` fetch remains excluded from automatic fallback because the browser proved it is blocked by CORS.
- Static validation run: `node --check app.js`; `node --check tools/*.mjs src/**/*.mjs src/**/*.js`; `npm test`; `npm run metrics`; `npm run storage:scan`; `npm run build:public`; `npm run public:check`; `node --check .site-publish/tiinex.bundle.js`.

## CP229 Validation Notes — Jina Issue Thread Rescue

- Diagnosis from browser probes: Jina reader endpoints returned HTTP 200 for both GitHub issue and comments material, but the comments reader payload was JSON-like markdown rather than strict JSON. Comment body fields could contain raw markdown/control characters, causing strict parsing to fail before the issue thread reached the workspace loader.
- CP229 adds a loose Jina GitHub issue extractor in addition to the loose comment extractor, improves loose string field boundary detection, and retries loose extraction when strict parsing returns an empty/non-array comments result.
- CP229 also extends the public-reader API path to recover from parser failures by fetching reader text and applying loose issue/comment extraction before falling through to API/stale-cache/source-gap.
- Expected behavior: configured GitHub issue URLs such as https://github.com/Tiinex/docs/issues/9 should import as the same issue/comment thread shape as the API path when Jina reader material is available; target-only gap artifacts should only remain when no issue body/comment material can be read from cache, Jina/public readers, API, or user-provided material.

## CP230 Validation Notes — Jina Top-Level Payload Validation

Browser instrumentation showed that the app fetched the correct Jina issue and comments reader URLs with HTTP 200 and material markers present, but still fell through to a target-only gap. The likely failure was accepting a parseable nested GitHub object as an issue payload because it had `html_url`, then failing after the resulting thread had no issue body/comments. CP230 adds shape validation for issue and comment payloads before accepting strict parser results.

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

## CP231 Validation Notes — GitHub Issue Import Diagnostics

- Added `tiinex.github.issueImportTrace.v1` as a bounded local issue import trace for GitHub issue discovery/import.
- Exposed `TiinexDiagnostics.githubIssueImportTraceJson()`, `TiinexDebug.githubIssueImportTrace()`, `TiinexDebug.lastGithubIssueImportTrace()`, and `TiinexDebug.clearGithubIssueImportTrace()` for browser-driven instrumentation.
- Instrumented adapter request, Jina issue/comment reader parsing, fallback attempt selection, issue-thread loading, source discovery target status, and workspace insertion stages.
- Failed configured issue imports now mention the issue import trace accessor in source status so failures are not blank “target failed” outcomes.
- Static validation, metrics, storage scan, public build, public check, public bundle syntax check, and zip validation were run for this package.

## Package 232 Validation Notes — GitHub issue import cleanWhitespace helper

The issue import trace showed that the configured GitHub issue target entered the correct source pipeline, fetched the Jina issue endpoint with HTTP 200, parsed the issue as valid strict JSON, fetched the Jina comments endpoint, parsed two comments, and then failed in `cleanCachedGitHubIssueItem` with `ReferenceError: cleanWhitespace is not defined`. Package 232 adds the missing local `cleanWhitespace` helper near the runtime dependency guards. No adapter routing, parser, loader, or UI behaviour was otherwise changed.

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

## Package 233 Validation Notes — GitHub Issue Recovered Artifact Continuity

- User validation of Package 232 confirmed the Jina GitHub issue import path now loads issue #9 and its embedded artifacts.
- The remaining regression was continuity: recovered comment artifacts kept parent references from the published GitHub markdown, pointing at GitHub blob paths that do not exist in the loaded workspace and may 404.
- Added a bounded recovered-artifact reparenting step during GitHub issue thread import. When an embedded Tiinex artifact is recovered from an issue body or comment, the importer rewrites the artifact envelope Parent block to the local recovered parent that the importer already knows, then refreshes the parent-target integrity footer.
- Issue-body embedded artifacts are attached to the issue-root discovery finding; comment embedded artifacts are attached to the current issue working parent, which becomes the recovered issue-body artifact when present.
- Expected browser validation: after importing issue #9, “Welcome to the Next Dimension” should no longer remain a disconnected working leaf when “The American Experiment” and “Silicon Valley” are its recovered child artifacts.

## Package 234 Validation Notes — GitHub Recovered Continuity Polish

- Strengthened recovered artifact reparenting: top-level Parent declarations are stripped in both modern block form and older/exported flattened forms before writing the import-local Parent block.
- Added a self-parent guard before writing parent-target integrity for recovered artifacts.
- Added local shadow pruning after successful GitHub issue thread import. Local files are removed only when an imported non-local source file has identical normalized content and compatible title/schema metadata.
- This deliberately does not redesign Continue, Reference, or Use As; schema-driven transition authoring remains separate future scope.

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

## CP235 Validation Notes — Recovered Artifact Traversal Identity

- Fixed false lineage cycles caused by `artifactTraversalKey` preferring GitHub origin URLs over loaded workspace path/storage identity. GitHub issue imports can create several Tiinex artifacts from the same issue/comment URL; those are siblings or parent/child artifacts, not necessarily the same lineage node.
- Improved local duplicate pruning by normalizing comparable content through continuity checksum canonicalization and stripping top-level Parent blocks before comparison. Title/schema compatibility is still required before removing a local file.
- Validation run: `node --check app.js`; `node --check tools/*.mjs src/**/*.mjs src/**/*.js`; `npm test`; `npm run metrics`; `npm run storage:scan`; `npm run build:public`; `npm run public:check`; `node --check .site-publish/tiinex.bundle.js`.

## Package 236 Validation Notes — Local Shadow Semantic Pruning

- GitHub issue recovery works, but local copies could remain beside imported source copies when the publication/recovery process altered envelope metadata while preserving the same body.
- Added body-level semantic duplicate keys gated by matching schema and title. This keeps pruning bounded while allowing source-imported artifacts to supersede local working copies that only differ by parent/integrity/scope metadata.
- The pruning trace now records candidate count when pruning occurs, and records kept candidates when semantic candidates exist but title/schema compatibility prevents removal.

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
unzip -t output-package.zip
```

## Package 237 Validation Notes — GitHub Presentation Compactness and Social Origin Labels

- GitHub-facing presentation should not promote generated transition metadata as primary reader content. `githubArtifactBodyDelta` now strips generated Transition Boundary sections from the human preview while leaving the machine-readable Source Markdown payload intact.
- Tiinex boundary details in outbound GitHub drafts are compact summaries rather than long internal policy lists.
- Parent origin entries now use surface-aware labels such as `github issue`, `github issue comment`, `github discussion`, and `github discussion comment`; relative workspace origins are plain text rather than broken GitHub-relative links.
- Use As source-finding links prefer external GitHub social origins when available, preventing issue-page markdown from resolving transient recovered paths as invalid GitHub issue filters.
- Validation run: `node --check app.js`; `node --check tools/*.mjs src/**/*.mjs src/**/*.js`; `npm test`; `npm run metrics`; `npm run storage:scan`; `npm run build:public`; `npm run public:check`; `node --check .site-publish/tiinex.bundle.js`.

## Package 238 Validation Notes — Adapter-aware local edit shadows

- Source/imported artifacts now expose Edit as a local draft operation instead of pretending to mutate read-only source material.
- Saving an edit on a source-backed artifact writes a Local file with shadow metadata pointing at the original source node.
- Normal feed/lineage rendering hides source originals that are shadowed by a Local draft and shows a compact `Open original` separator under the draft. Clicking it reveals the real source card in place.
- This is intentionally a presentation/continuity hygiene patch. It does not yet implement adapter-side mutation of existing GitHub issue/comment bodies.

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

## Package 239 Validation Notes — Edit Placement and Resolved Finding Visibility

- Moved the Edit action earlier in card action order: after read/source actions and before Continue/Reference. It is rendered icon-only to avoid widening source/imported cards.
- Normal feed and lineage rendering now filter resolved discovery finding wrappers unless that wrapper is explicitly selected. This keeps adapter envelopes/provenance from competing with the typed recovered artifact.
- Static validation run: node syntax checks, npm test, metrics, storage scan, public build, public check, and bundled syntax check.

## CP240 Validation Notes — Lineage Original Shadows and Markdown List Hierarchy

- Open original is now lineage-only context. Discovery/feed rendering shows the active draft card without the original separator.
- Rich markdown preview now preserves nested unordered and ordered list depth from markdown indentation.
- CSS list spacing was adjusted for markdown rich editor and preview surfaces.
- Static validation run: `node --check app.js`; `node --check tools/*.mjs src/**/*.mjs src/**/*.js`; `npm test`; `npm run metrics`; `npm run storage:scan`; `npm run build:public`; `npm run public:check`; `node --check .site-publish/tiinex.bundle.js`.

## Package 241 Validation Notes — Original Toggle and Local Draft Persistence

- Added an action handler for `toggle-original-shadow`; the lineage-only `Open original` control now toggles `app.openOriginalShadows` and re-renders.
- Local edit drafts now retain `sourceOrigin`, `shadowSourceKey`, `shadowSourceId`, `shadowSourcePath`, `shadowSourceOrigin`, `localDraftOf`, and `localEditDraft` in local workspace state serialization.
- Saving a local edit now flushes local workspace state immediately after scheduling autosave, protecting drafts when a user refreshes shortly after saving.
- Re-editing an existing local shadow draft preserves the origin/shadow metadata rather than replacing it with an ordinary local file.

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

## Package 242 Validation Notes — Local Draft Save/Reload Stability

Observed video behavior: after saving a local edit, the edited local artifact was not consistently selected as the active lineage anchor; after browser refresh, local drafts and newly continued local artifacts could disappear. The likely cause was a combination of route/selection not being locked to the saved local node and startup local-state restore being marked attempted before the shared route had rebuilt the workspace.

Changes:

- Added a saved-local-node selection helper used by local edit saves and local artifact creation.
- Save flows now select and lineage-lock the saved local node before closing the modal and replacing route state.
- Local artifact creation now writes local state immediately, not only through delayed autosave.
- Startup local-state restore now defers instead of consuming its single attempt when a shared/view hash is present but workspaces are not loaded yet.

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

## Package 243 Validation Notes — Local Draft Identity and Reload Merge

Observed regression: editing a source card created a local draft, but `Open original` could expand the related discovery finding rather than the exact artifact that was edited. After F5, local drafts and local continuations could disappear, indicating the local-state merge was not deterministic across static route reloads.

Changes:

- Local edit drafts now store exact source node/storage identity in addition to origin/source URL metadata.
- Open-original lookup ranks exact identity matches before origin fallback and penalizes resolved discovery finding wrappers unless the finding was the edited card.
- Static route reloads now keep retrying local-state merge when saved local files are still missing.
- Remote/source startup mutations avoid saving over a pending local-state profile before local deltas have had a chance to merge.

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

## Package 244 Validation Notes — Local Workspace Quota Hardening

A local edit save failed with a browser `QuotaExceededError` for `tiinex.localWorkspace.state.*`. The likely pressure came from two sources: generated remote artifacts being eligible for local-state persistence and accumulated regenerable scroll/cache data in localStorage.

Package 244 changes local-state persistence so generated remote/source artifacts are not stored as local deltas unless they have no remote identity. The quota retry path now prunes regenerable scroll/lens/GitHub cache entries before retrying the local workspace snapshot write.

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

## Package 245 Validation Notes — Local Draft Discard Persistence

Observed behavior: Remove discarded a local draft from the active Lineage view, but the draft reappeared in Discovery and after reload. The cause was a persistence asymmetry: save persisted local drafts immediately, while discard only mutated runtime state and could be blocked by the empty-local-state reload guard.

Changes:

- local draft removal now matches runtime files by exact local path, storage key, and shadow/origin identity fields,
- remove writes through to the persisted local workspace snapshot immediately,
- deliberate deletion of the last local delta can clear the local state key instead of being blocked by the static-route startup guard,
- local state runtime serialization keeps the exact shadow identity fields needed for Open original and discard matching.

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

## CP246 Validation Notes — Local Draft Discard Guard and Lineage Progress

User validation showed local draft persistence surviving refresh, but Remove triggered `Cannot read properties of null (reading 'sources')` and did not complete discard reliably. CP246 hardens the discard path by preventing auto-connection of a new local-state profile during explicit delete, adding null-safe workspace source guards, and surfacing discovery progress in lineage view.

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

## CP247 Validation Notes — Resolved Finding Visibility after Local Draft Discard

A video pass showed that local draft persistence and discard were working, but after discarding a local draft the UI could fall back to a GitHub `discovery.finding` wrapper instead of the typed source artifact. CP247 strengthens resolved finding detection by recognizing GitHub issue/comment findings whose material embeds a typed Tiinex artifact, and keeps Lineage anchored to the exact original source card when a selected local shadow draft is discarded.

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

## CP248 Validation Notes — Discard Anchor and Resolved Envelope Metadata

Video review showed that Remove persisted the local draft deletion, but the UI fell back to Discovery feed and surfaced the GitHub comment `discovery.finding` wrapper. CP248 addresses two gaps: discard now anchors to the original typed source artifact whenever a local draft has exact shadow/original identity, and GitHub issue/comment wrapper findings now carry explicit resolved-envelope metadata when their material includes a typed Tiinex artifact.

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

## Package 261 Validation Notes — GitHub Continuation Comment Publication

Observed behavior: after publishing an edit, creating a continuation from the published source artifact still used the parent comment as the GitHub update target. The user had to replace the verifier's prefilled parent comment URL with the new comment permalink, and the imported continuation later appeared parented to the issue root rather than the artifact that was continued.

Changes:

- GitHub export now detects local continuation artifacts by their `Transition Boundary -> Transition Kind: continue` marker.
- Continuations default to `Create comment`, a new issue-comment publication mode, instead of `Update known`.
- The GitHub routine opens the parent issue/comment as context but treats it as a parent/reference, not an overwrite target.
- Verify for continuation comments scans the issue for the copied body or accepts the newly published comment permalink; it no longer pre-fills the parent comment permalink as the publication result.
- Import/recovery prefers the embedded artifact's declared parent GitHub comment when that source-backed artifact is loaded, preserving Tiinex continuation parentage instead of defaulting to the issue container.

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

## Package 262 Validation Notes — Streamlined Continuation Verify and Parent Anchor

Follow-up testing showed that continuation publication was now using `Create comment`, but the guided routine still exposed the comment permalink field too early and imported continuations could still fall back to GitHub issue-root parentage when the payload only carried a human-readable source label.

Changes:

- Continuation verify now starts with a single Verify action. Tiinex scans the parent issue for the copied continuation body first.
- The comment permalink override field is hidden until the first Verify attempt fails or needs manual override.
- Continuation target UX no longer exposes the full Create/Update/Paste mode selector in the normal path; it states that the parent comment is context only and that a new continuation comment should be created.
- Outbound continuation payloads now include machine-readable Tiinex parent anchors when available: parent GitHub comment permalink, parent artifact path, parent artifact title, parent comment id, and an explicit binding meaning.
- GitHub comment recovery now reads parent comment anchors from the embedded transition/source boundary, not only from the continuity envelope, before falling back to the GitHub issue container.

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

## Package 263 Validation Notes — Git Source Adapter Research Spine

This package does not replace the current GitHub repo-file reader. It adds the architecture and observability needed before choosing the canonical Git-native implementation.

Changes:

- Added `src/services/git-source-adapter.mjs` as an implementation-neutral adapter contract for Git source snapshots.
- The contract is local-object-store-first, Time-Portal-aware, and treats permalinks as recovery anchors rather than the primary read path.
- Added `src/services/repo-fetch-diagnostics.mjs` with pure helpers for summarizing repo-file fetch behavior.
- Added runtime repo fetch tracing for the current GitHub raw-file fallback: session start, tree discovery, raw request, raw success, raw failure, and rate-limit metadata.
- Exposed `TiinexDiagnostics.githubRepoFetchSummary()`, `TiinexDiagnostics.githubRepoFetchTraceJson()`, and `TiinexDiagnostics.clearGithubRepoFetchTrace()` for browser-console discovery research.
- Added static validation that the Git source adapter research spine and repo-fetch diagnostics remain present.

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

## Package 264 Validation Notes — Git-Native Runtime Spine

This package intentionally does not replace the working GitHub repo discovery flow. It adds the first executable Git-native adapter boundary so the next implementation step can wire a real browser Git runtime behind a stable Tiinex contract instead of continuing to expand raw GitHub file-fetch behavior.

Changes:

- Added `src/services/git-native-source-adapter.mjs` with an injected isomorphic-git-compatible runtime shape.
- The adapter exposes source normalization, snapshot acquisition, ref resolution, artifact candidate listing, `readFile`, `readBlobAt`, capability reporting, and local-object parent recovery before permalink fallback.
- The adapter is explicit about `hiddenProxy: false` and does not load any library, CDN, proxy, token, or server path by itself.
- Static validation now exercises the adapter with a fake Git runtime so candidate listing, commit anchoring, permalink parsing, and blob reads are executable contracts.
- Repo-fetch diagnostics now report unique full raw URLs, duplicate full URL requests, and basename collisions separately so repeated names like `001.trace.md` are not mistaken for duplicated material.
- Browser diagnostics expose `TiinexDiagnostics.gitNativeAdapterCapability()` alongside the existing Git source contract and repo fetch summary.

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

## Package 265 Validation Notes — Browser Git-Native Runtime Bridge

Package 265 continues the Git-native breakthrough path by adding a browser runtime bridge instead of polishing the raw GitHub fallback. The active product discovery path is not switched yet; this package makes the actual isomorphic-git runtime path executable from the browser when explicitly configured.

Changes:

- Added `src/app/git-native-runtime.js` and loaded it before `app.js` in both local and public bundle order.
- The bridge detects or explicitly loads `git`, `LightningFS`, and `GitHttp` runtime pieces without choosing a hidden CDN by default.
- Added an explicit clone lab that can shallow-clone a repo, resolve the commit, list `.topics` files from the Git object store/tree, and sample-read candidate artifact blobs.
- GitHub browser clone refuses to silently choose a proxy; `corsProxy` or `allowDirectGithubClone` must be explicit.
- Added `TiinexDiagnostics.gitNativeRuntimeStatus()` and `TiinexDiagnostics.gitNativeCloneLab(options)` for browser discovery research.
- Static validation now guards the runtime bridge tokens so this path remains part of the app surface.

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

## Package 266 Validation Notes — Git-Native Buffer Dependency Bridge

Package 266 keeps the active product discovery path unchanged and hardens the explicit browser Git-native clone lab after CP265 exposed a real runtime dependency: the browser UMD build of isomorphic-git can fail during clone with `Missing Buffer dependency` when no compatible `Buffer` global is present.

Changes:

- Added explicit Buffer dependency loading to `src/app/git-native-runtime.js` before loading isomorphic-git when the caller requests default vendor URLs.
- Added `bufferModuleUrl` to the default explicit vendor set and assigns the imported `Buffer` export to `window.Buffer` only as part of an explicit runtime load.
- Runtime status now reports the `Buffer` global alongside `git`, `LightningFS`, and `GitHttp`.
- Runtime availability now requires a compatible Buffer dependency unless one is provided through options.
- The clone lab now returns a structured `{ ok: false, ... }` diagnostic result for runtime/setup failures by default instead of leaving the console with only an uncaught rejection; `throwOnError: true` preserves throw behavior for debugging.
- Static validation now guards the Buffer dependency bridge so the Git-native breakthrough path cannot regress back to a missing-runtime state silently.

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

## Package 267 Validation Notes — Git-Native Clone Lab Stage Diagnostics

Package 267 keeps the active product discovery path unchanged and hardens the explicit browser Git-native clone lab after CP266 testing showed a new unstructured failure: `Cannot read properties of undefined (reading 'filter')` during the file-listing phase.

Changes:

- Made `src/app/git-native-runtime.js` defensive when `git.walk` or `git.listFiles` returns a non-array value.
- Added explicit clone-lab stage events for clone reuse checks, clone, ref resolution, tree walking, `listFiles`, and list-result shape failures.
- Failure reports now include `stage`, `resultType`, and recent `progressEvents` so browser diagnostics can show where the Git-native lab failed.
- The lab can reuse an existing local clone/object store before attempting a new clone, reducing repeated clone attempts during browser research.
- The hidden-proxy and hidden-vendor rules remain unchanged.

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

## Package 268 Validation Notes — Git-Native Repo Discovery Bridge

Package 268 makes Git-native repo discovery a real product-read candidate rather than only a lab. When `TiinexGitNativeRuntime` is explicitly available/configured, `discoverGitHubRepoIntoWorkspace` now attempts a Git-native snapshot before bounded web/raw acquisition. Successful snapshots read artifact content via `readBlob` from the browser Git object store and tag repo files with `sourceResolutionKind: git-native-local-object-store`, `sourceAccessMode: git-object-store`, and the resolved commit.

This package intentionally keeps fallback behavior bounded: if the runtime is missing, lacks explicit vendor/proxy configuration, or cannot clone/list/read, the app falls back to existing GitHub raw reads and records the Git-native skip/failure in `TiinexDiagnostics.githubRepoFetchTraceJson()`. The browser runtime remains explicit: no hidden CDN, hidden proxy, token, or backend was added. Validation ran `node --check app.js`, `node --check tools/*.mjs src/**/*.mjs src/**/*.js`, `npm test`, `npm run metrics`, `npm run storage:scan`, `npm run build:public`, `npm run public:check`, and `node --check .site-publish/tiinex.bundle.js`.

## Package 269 Validation Notes — Git-Native Discovery Activation Gate

Package 269 fixes the CP268 activation gap where `TiinexDiagnostics.enableGitNativeDiscovery(...)` stored explicit Git-native options but returned `runtimeAvailable: false` because it only checked status instead of initializing the explicit runtime. The command now calls `TiinexGitNativeRuntime.ensureRuntime(...)`, preserves the configured options in `TIINEX_VIEWER_OPTIONS.gitNative`, and returns a readiness report with `runtimeReady`, cached repo/dir, missing dependencies, and setup errors when present.

Repo discovery now evaluates runtime status using the persisted Git-native configuration rather than `status({})`. This allows a previously enabled explicit vendor/proxy configuration to flow into `acquireSnapshot(...)`, so discovery can use the local Git object store path instead of skipping Git-native due to missing context. No hidden CDN, hidden proxy, token, or backend was introduced.

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

## CP270 validation note — Git-native summary separation

CP270 fixes a observability mismatch observed after CP269: Git-native object-store reads were visible in `githubRepoFetchTraceJson()`, but `githubRepoFetchSummary()` still only had previous raw counters and could report `rawBytes` for non-raw reads. The summary now keeps raw and Git-native acquisition counters separate and labels successful Git-native repo discovery as `git-native-active` when no raw requests were used.

## CP271 validation note — Git-native activation persistence

CP271 persists explicit Git-native discovery configuration under `tiinex.gitNative.discoveryConfig.v1`, hydrates it into `TIINEX_VIEWER_OPTIONS.gitNative` before repo discovery, and exposes diagnostics for reading/clearing that configuration. This addresses the observed CP270 case where a later refresh still used raw GitHub reads even after the Git-native runtime bridge had been proven viable.

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

## CP272 validation note — Git-native trace isolation

CP272 keeps the CP271 Git-native activation path but prevents stale raw fallback observations from polluting the next Git-native test run. The explicit enable command clears `tiinex.github.repoFetchTrace.v1` by default before recording the new ready/failure event, and `githubRepoFetchLastSessionSummary()` can summarize only the latest `session.start` or `git-native.snapshot.start` window.

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

## CP273 validation note — Git-native raw bridge closure

CP273 addresses the observed CP272 case where `githubRepoFetchSummary()` could report `git-native-active` while the browser Network tab still showed commit-pinned `raw.githubusercontent.com/Tiinex/docs/<commit>/.topics/...` fetches. The fix routes GitHub raw URLs for the explicitly enabled Git-native repo through the local Git object store in `fetchText()` before any network fallback.

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


## CP274 validation note — Canonical Git-native adapter-request bridge

CP274 responds to the CP273 browser Network evidence where `githubRepoFetchSummary()` showed `git-native-active` while DevTools still showed `app.js:800` fetches for commit-pinned `raw.githubusercontent.com/Tiinex/docs/<commit>/.topics/...` files. Those fetches came from direct `adapterRequest()`/`adapterFetchText()` callers, bypassing the previous `fetchText()` bridge.

The fix intercepts GitHub raw adapter requests for the explicitly enabled Git-native repo before `fetch(...)` is called. A bridged adapter result reports `cacheState: git-native-raw-bridge` and `sourceState: git-native-local-object-store`; no browser network request is made for the repo file when the blob is available locally.

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

## CP275 validation note — Raw network hard gate for Git-native repo reads

CP275 closes the CP274 observation that browser Network still showed repo artifact fetches from the adapter network line even while diagnostics reported Git-native discovery. The patch makes the Git-native bridge URL-shape based rather than adapter-id-only, supports embedded raw GitHub URL recovery, tries `.topics`/`topics` path aliases, and hard-blocks raw GitHub repo fetches for the explicitly enabled Git-native repo unless an explicit raw fallback override is provided.

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


## CP277 validation note — Packaged Git-native startup default

CP277 responds to browser evidence where CP276 still showed many `raw.githubusercontent.com` repo artifact fetches on initial page load, while a later Refresh used the Git-native path. The package now includes a default `TIINEX_VIEWER_OPTIONS.gitNative` block in `index.html`, so startup bootstrap has the same repo/ref/root/runtime/proxy context before `bootFromUrl()` restores or discovers the Tiinex/docs workspace.

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

## CP278 validation note — Git-native global raw fetch gate

CP278 closes the CP277 startup evidence where init still showed many `raw.githubusercontent.com` artifact fetches while Refresh was clean. The patch installs a startup-time `window.fetch` gate that only intercepts GitHub raw URLs for the explicitly configured Git-native repo. Matching repo artifact reads are served from `TiinexGitNativeRuntime.readGitText(...)` as a synthetic response and traced as `git-native.raw-fetch-gate.*`, preventing hidden raw network access from bypassing the canonical Git-native reader.

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

## CP279 validation note — Repo-material source ownership

CP279 addresses the CP278 ambiguity where Network could still show `app.js` raw fetches even when Git-native diagnostics looked healthy. The patch introduces an explicit repo-material source owner instead of relying on `fetchText()`, `adapterRequest()`, and the global fetch gate as separate partial bridges.

The intended source rule is now: matching Tiinex/docs repo material uses the browser-local Git object store first; if the object is not locally available, the read becomes unavailable/deferred unless an explicit degraded raw fallback is requested. Integrity verification follows that rule too, so historical or shallow-clone-missing targets should not turn into silent raw permalink crawls.

Diagnostics now expose repo-material ownership state through `githubRepoFetchSummary().repoMaterial`, including blocked fallback, explicit fallback, integrity deferrals, and unexpected fetch-gate pass-through. Browser Network remains the acceptance authority for raw requests, but diagnostics should now explain why each matching raw request did or did not use Git-native.

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

## CP280 repo-material raw boundary follow-up

Context: CP279 still allowed actual `raw.githubusercontent.com/Tiinex/docs/<commit>/.topics/**/*.md` network reads during startup integrity verification. Browser evidence showed `app.js:12039`, meaning the global fetch gate passed the request to native fetch.

Changes:

- Treat same-repo Git-native source ownership as an intent boundary, not only as an already-ready runtime capability.
- Block implicit raw repo-material fallback when Git-native is configured or an active workspace owns the repo through the local Git object store.
- Route integrity remote target hashing through the repo-material owner before any network fallback.
- Make loaded integrity target matching repo-case-insensitive and snapshot-ref-aware.
- Make the fetch gate block implicit same-repo raw pass-through instead of silently native-fetching when Git-native is intended.
- Make diagnostics verdict degrade when raw network success is observed without explicit fallback.

Validation run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Browser validation still required: fresh init should show zero actual Network requests for `raw.githubusercontent.com/Tiinex/docs/.../.topics/**/*.md` unless an explicit fallback/degraded policy is used.
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


## CP283 validation note — Historical schema permalink reduction

CP282 reduced the bulk raw fetch problem but still allowed a small number of real raw network reads for historical schema permalinks. CP283 adds a bounded local substitute rule for schema contracts only: if `Tiinex/docs` is Git-native-owned and an older `.topics/.schemas/**/*.schema.md` permalink is not present in the shallow clone, the viewer tries the same path at the loaded Git-native snapshot before raw fallback.

This is intentionally not used for integrity targets, checksum targets, or ordinary trace material. Those remain exact: missing local historical objects become unavailable/deferred unless an explicit fallback path is used.

Expected browser signal:
- `raw.githubusercontent.com/Tiinex/docs/<old-commit>/.topics/.schemas/**/*.schema.md` should be reduced or eliminated when the same schema path exists in the local snapshot.
- `githubRepoFetchSummary().repoMaterial.localRefSubstitute` should count local schema substitutes.
- Any remaining actual raw requests should be files not available through the current Git-native object store or explicit non-repo/social/vendor requests.

## CP284 validation note — Historical Git-native object hydration

CP283 reached the important Network target of zero raw Tiinex/docs repo-material requests, but remaining `rawFallbackBlocked` entries could represent real historical continuity targets that exist only in Git history. CP284 addresses that gap by adding on-demand Git-native historical hydration.

For a Git-native-owned repo-material request with a full historical commit SHA, the runtime now tries to hydrate that commit into the LightningFS object store using configured Git smart HTTP before the read is marked unavailable. The fallback order is exact commit-SHA fetch first, then a bounded deepen of the configured history ref using `historicalDepth` / `timePortalDepth`.

Expected browser signal:

- `raw.githubusercontent.com/Tiinex/docs/...` should remain at zero for implicit repo-material reads.
- `repoMaterial.historicalHydrateStarts` may be greater than zero when historical permalinks are encountered.
- `repoMaterial.historicalHydrateSuccess` should explain targets that were previously blocked but can be fetched through Git-native history.
- `repoMaterial.rawFallbackBlocked` should only remain for targets whose historical Git object cannot be hydrated within the bounded policy or whose path is genuinely absent.
- `TiinexDiagnostics.githubRepoMaterialProblemTargets()` lists any remaining missed/blocked targets for follow-up.

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


## CP292 validation note — Share eligibility before share/copy

Intent: avoid producing share links that look authoritative when the target is actually local, draft, access-bound, or only recoverable through an exact UI-state hash.

Key changes:

- Topbar `Copy link` becomes `Share` and opens a review panel.
- Artifact cards and workspace headers can open the same share review panel for their own scope.
- Public target links, exact view links, and interaction-card markdown are separate actions.
- Local/draft material is surfaced as a boundary warning instead of silently being omitted from a copied URL.
- Diagnostics expose share eligibility and interaction-card previews for active/workspace/artifact scopes.

Expected browser signal:

- Source-backed GitHub issue/artifact targets should show `public-resolvable` when a public viewer base is configured.
- Draft/local artifacts should show `draft-local` and warn that a public link will not carry the material.
- Copy public link should be disabled when no public target exists.
- Copy exact view should remain available for current UI state and scroll/lens continuity.

Validation run:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## CP293 validation note — GitHub issue comment parent binding

Intent: prevent flat GitHub issue comment imports from becoming a false lineage chain merely because comments are processed in order.

Key changes:

- Comment discovery findings use the recovered issue artifact as their parent when an issue-body artifact exists.
- Recovered comment artifacts resolve parent from embedded Source Markdown hints before falling back to the issue-body artifact.
- Parent hints include Parent Trace, Parent Origin, Source Artifact, Source Path, integrity Towards, and explicit issue comment IDs.
- Parent resolution metadata is stored on recovered files and exposed through `TiinexDiagnostics.githubIssueNestedContinuityReport()`.
- The report now warns when a recovered comment artifact is chained to a previous comment without explicit parent binding metadata.

Expected browser signal:

- Issue #9 should no longer show `Silicon Valley` as a child of `The American Experiment` when both embedded artifacts point back to `welcome-to-the-next-dimension.trace.md`.
- True child-on-child publication remains possible when the embedded artifact explicitly points at the previous recovered artifact or parent comment.
- `githubIssueNestedContinuityReport().warningCount` should stay `0` for explicit or issue-root fallback parent choices and should warn on accidental comment-order chains.

Validation run:

```txt
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

## CP297 validation note — reasoned generic share

Intent: make generic Share useful without becoming advertisement. A share card should answer why the sender is sharing, preserve destination context, and keep exact/public link copying distinct.

Changes:

- Share modal asks: `Why do you want to share this?`
- `Copy reasoned card` is the primary action and includes the answer in the markdown card.
- Public target link and exact view link remain secondary actions.
- Interaction-card markdown now includes destination and the share boundary.
- Added `TiinexDiagnostics.shareSignalPreviewForActive(reason)` as lightweight signal groundwork.
- Added `TiinexDiagnostics.shareCounterObservationReport()` for later observed external counter integration; it only reports observed counters and does not claim global truth.
- Detail view no longer opens Artifact Body by default.

Expected browser signal:

- Topbar/workspace/artifact Share opens the same generic reasoned card surface.
- Empty reason is allowed but visibly represented as missing context in the card.
- Entering a reason and copying the card includes the reason.
- Copy public link still produces only the link.
- Copy exact view still produces the base64 exact state link.
- Detail view still shows full presenter sections, with Artifact Body collapsed by default.

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

## Update 299 - GitHub issue live parent binding + schema badge navigation

Validation date: 2026-07-08

Scope:
- Keep newly recovered GitHub issue/comment artifacts indexed during the same import pass, so later comments can bind to earlier recovered artifacts such as Test C -> Test B.
- Preserve parent hint diagnostics for recovered issue artifacts.
- Make schema badge navigation use the same lineage route lock as ordinary card selection so first-click schema open is not swallowed by cached lens/route restore.

Local validation run:

```text
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Manual browser validation still required:
- Re-open https://github.com/Tiinex/docs/issues/9 and verify Test C appears under Test B when lineage is opened from Test C.
- Click a schema badge once and verify the schema lineage opens immediately.
- Run `TiinexDiagnostics.githubIssueParentBindingAudit()` and check unresolvedHints/warnings.

## Update 300 - public-ready share destinations

Validation date: 2026-07-08

Scope:
- Keep the Share modal within the viewport with internal scroll.
- Replace raw markdown preview with rendered card preview.
- Support Copy reasoned card, Copy guestbook text, Copy link only, Download HTML card, Bookmark exact view, and System share.
- Keep plain public link separate from reasoned/card outputs.
- Treat draft/local material as non-public unless an exact-view/export/publish path supplies an explicit origin boundary.

Diagnostics:

```js
TiinexDiagnostics.shareReadinessReport()
TiinexDiagnostics.interactionCardRenderedPreviewForActive('Jag vill dela detta för granskning.')
```

Manual browser checks recommended:
- Open Share from topbar, workspace, and artifact cards.
- Type in the reason box and confirm the rendered preview updates live.
- Copy reasoned card and guestbook text.
- Download the HTML card and open it locally.
- Use Bookmark exact view, then add it to the browser bookmark bar.
- Confirm Copy link only is disabled when there is no public target.

## CP301 validation — Compact share card UI

Static validation run locally:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Observed locally through static checks only:

- Share modal renders with one card/input surface instead of a separate prompt plus preview.
- Actions remain available as separate destination flows.
- New diagnostic: `TiinexDiagnostics.shareCompactnessReport()`.

Browser validation still needed for scroll, mobile/touch layout, copy actions, and bookmark/browser-share flows.

## CP302 validation notes — Share action handoff

Local checks run for CP302:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

Manual browser validation remains required for destination UX: copy actions, downloaded HTML card, bookmark URL preparation, and native browser share behavior depend on browser permissions and user action.

## CP303 validation notes — Share HTML opener and guestbook context

Local checks run for CP303:

- `node --check app.js`
- `npm test`
- `npm run metrics`
- `npm run storage:scan`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`

Observed through static checks only:

- Guestbook/comment output now carries the share question and answer together.
- Share dialog exposes both `Card HTML` and `Open HTML` destination actions.
- `Open HTML` generates a lightweight redirect/opener file with manual link fallback.

Browser validation still needed for downloaded HTML behavior and user-facing share flow polish.

## Release 304 validation

Local static validation executed:

```txt
node --check app.js
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Expected browser checks:

- Open Share on a phone-width viewport. The dialog should remain readable without horizontal overflow.
- Use Comment/Guestbook copy. The pasted text should include `Question:` and `Answer:` lines.
- Download Card HTML and Open HTML. The card should remain readable and the opener should behave like the Open in Browser launchers.
- Use Reference or Use As, choose `Evidence`, and verify that the selected target/basis is visible as a locked relation attachment.
- Edit an existing evidence artifact with linked material and verify that linked artifacts are visible in the attachment collector when recoverable from markdown.

## Release 305 validation

Local validation executed:

```txt
node --check app.js
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Validation note:

`npm test` was not used as the pass signal for this package because the static package validator currently flags older package-history wording in README/styles from prior releases. The app syntax and public build checks above passed after this camera change.

Browser validation requested:

- Open Evidence through Reference or Use As.
- Choose Camera.
- Try back camera and front camera on a mobile browser.
- Confirm the captured image appears as an evidence attachment.
- Create the evidence artifact and verify the captured file is preserved as an asset.

## Release 306 validation

Local validation executed for publish-ready camera fallback and launcher cleanup:

```txt
node --check app.js
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

Validation notes:

- The source package no longer contains the bundled `open/` launcher directory.
- Camera should be visible in Evidence attachments on desktop and mobile.
- Desktop without camera capture should still offer image/gallery fallback.
- Mobile browsers should be tested for back/front camera capture through browser-native UI.
- `npm test` may still flag historical package wording in README/styles and was not used as the release pass signal.
