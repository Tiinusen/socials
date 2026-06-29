# CP143f GitHub origin discovery follow-up

## Scope

- Removes the explicit Refresh GitHub discovery button added in CP143e.
- GitHub discovery now queries the repository tree origin first, then falls back to the static flat-package listing only if the origin request fails.
- `.validator.md` remains included in the canonical artifact suffix filter for GitHub tree discovery, jsDelivr fallback discovery, display options, tree/feed filtering, and lineage path helpers.
- README lists `.validator.md` as a supported Tiinex markdown artifact suffix.

## User-facing behavior to verify

- Open Tiinex/docs from GitHub discovery after CP143b is committed.
- `.topics/.validators/sha256-base64url-c14n-v1.validator.md` should be discovered from the GitHub tree origin and appear in tree/feed when `Show .validator.md` is enabled.
- The workspace header should not show a separate refresh button.
- Existing `.trace.md`, `.schema.md`, and `.workspace.md` filters should behave unchanged.

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
- The integrity parser normalizes linked method entries back to the canonical method id while preserving the method-definition URL for diagnostics.
- Integrity Diagnostics now exposes a `Method definition` link in technical details and copyable diagnostics.
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
  - Diagnostics should show a Method definition link.
- Create a continuation.
  - Footer method entry should be linked.
  - `Towards` should still point at the parent target.
  - Parent-target checksum should still verify when the parent markdown is loaded.
- Open the Tiinex docs workspace from GitHub discovery.
  - `.topics/.validators/sha256-base64url-c14n-v1.validator.md` should be imported and visible in feed/tree when `.validator.md` display is enabled.
- Toggle Display options.
  - `.validator.md` should appear as a separate artifact suffix option and default to visible.
- Existing older artifacts with plain `sha256-base64url-c14n-v1` method entries should still verify.
- Smoke test diagnostics desktop/mobile, Continue, Reference, wizard F5/hash restore, Discovery scroll restore, Lineage scroll restore, and Discovery auto-more.

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
  - `.topics/.validators/sha256-base64url-c14n-v1.validator.md` should be loaded and visible when `.validator.md` display is enabled.
- Open Display options.
  - `Show .validator.md` should still exist and be enabled by default.
- Existing plain-method artifacts should still verify.

## Static validation added

- Static validation now blocks `.validator.md` from being omitted in the secondary lineage-artifact path helper.
- Static validation now blocks wizard step navigation from using browser-history push entries.
- Static validation now blocks a separate GitHub discovery refresh button and requires origin-first GitHub tree discovery with static fallback.

## CP143g cleanup

- Removed the GitHub-discovery refresh-button path from the product package.
- Referenced Material now excludes structural Tiinex links such as schema artifacts, validator definitions, trace/workspace artifacts, method-definition links, and parent/origin envelope links.
- Generic Referenced Material is reserved for attachment-like supporting material. Source/schema/validator navigation remains owned by Source, schema badges, method-definition diagnostics, and lineage navigation.



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
- Structural trace/schema/validator navigation actions were removed from the attachment/material UI path. Source, lineage, schema controls, and integrity diagnostics remain the owning navigation surfaces.
- Static validation now guards these ownership boundaries.

## CP143j browser focus

- GitHub discovery should still load `.validator.md` from origin.
- Tree/feed should still show `.validators` and `sha256-base64url-c14n-v1.validator.md` when `.validator.md` display is enabled.
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

- Integrity Diagnostics shows a dedicated validation method authority card.
- Diagnostics distinguish byte-integrity result, method-definition availability, and schema authority.
- The method-definition permalink can be opened or copied from diagnostics.
- When the validator artifact is loaded in the workspace, diagnostics can open it directly.
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
- Shows validation-entry count in diagnostics and copied diagnostic text.
- Prevents local save refresh from collapsing multiple integrity entries into a single generated footer.

## Out of scope

- No new validation method is generated.
- No validation result ledger.
- No UI for authoring additional method entries.
- No broader validator registry beyond the committed SHA-256 method definition.

## User-facing behavior to verify

- Existing single-entry artifacts verify exactly as before.
- Diagnostics shows `Validation entries` for byte-ok artifacts.
- A hand-authored artifact with more than one integrity method entry keeps its footer after local save.
- Unsupported entries do not block verification when a supported complete byte-integrity entry is present.

## Static validation added

- Static validation requires `parseIntegrityEntries`, `preferredIntegrityEntry`, and diagnostics validation-entry output.
- Static validation blocks local save from flattening multiple integrity method entries.


---

# CP147 Multi-Validation Diagnostics

## Scope

- Render every parsed integrity method entry in diagnostics.
- Mark the active byte-integrity entry used for current checksum evaluation.
- Show unsupported, duplicate, or incomplete entries as preserved but not evaluated.
- Include evaluated, preserved unsupported, duplicate, and incomplete entry counts in copied diagnostics.
- Keep generated artifact output to one linked SHA-256 byte-integrity entry.

## User-facing behavior to verify

- Single-entry byte-ok artifacts behave as before while showing one active validation entry.
- Multi-entry artifacts show each entry in diagnostics without hiding unsupported entries.
- Duplicate method entries are visible as duplicate audit signals.
- Entries missing `Towards` or `Value` are visible as incomplete rather than silently ignored.
- Local save still preserves multi-entry footers.

## Static validation added

- Static validation requires per-entry diagnostics rendering.
- Static validation requires active, preserved, and duplicate entry signals.


---

# CP148 Draft/Final Integrity Semantics

## Scope

- Treat missing or empty `Continuity Integrity` as draft/no-claim rather than a verification error.
- Surface claim lifecycle, finality, and export readiness in integrity diagnostics.
- Keep malformed method entries distinct from draft/no-claim.
- Keep verified byte-integrity claims distinct from schema authority and method-definition availability.

## User-facing behavior to verify

- Draft/no-claim diagnostics should say no checksum claim is being made yet.
- Draft/no-claim diagnostics should say this is a valid local draft state, not final byte-integrity verification.
- Malformed claims should still be warnings that need repair.
- Byte-ok artifacts should remain byte-integrity verified.

## Static validation added

- Static validation requires claim lifecycle, finality, export readiness, and draft/no-claim wording in diagnostics.


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
- Added mobile-specific module card styling so status cards render as compact chips and hide explanatory boilerplate.
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
- Compressed lineage module cards into one-line chips on mobile so GitHub discovery status does not become boilerplate or collide with the discovery toolbar.
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
