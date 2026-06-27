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
