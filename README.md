# Tiinex Lineage Viewer v6.23

Static GitHub Pages-compatible lineage viewer for portable `.trace.md` artifacts.

## v6.23 focus

This patch improves `.trace.md` references in the referenced-material UI.

### Open trace

Trace references now expose one primary action:

- `Open trace`

The viewer decides the right behavior.

### Same workspace behavior

If the trace reference already exists in the current workspace:

- `Open trace` selects it as the viewer target.

If the trace reference is resolvable in the same repo/ref but not loaded yet:

- `Open trace` fetches it
- adds it to the current workspace
- selects it as the viewer target

### External lineage behavior

If the trace reference points at another repo/ref:

- the viewer asks before opening a new workspace
- `Open in new workspace` keeps the lineage context separate
- `Open source` remains available

### Trace reference status

Trace material rows now show lightweight status:

- `loaded`
- `loadable`
- `external lineage`
- `unresolved`

## Suggested test path

1. Open `index.html`.
2. Add `Tiinex/docs` via repo discovery.
3. Expand an evidence/pointer trace with a `.trace.md` reference.
4. Confirm the primary action says `Open trace`.
5. Click `Open trace`.
6. If already loaded, confirm it becomes selected.
7. If resolvable but unloaded, confirm it loads and becomes selected.
8. For external refs, confirm a modal asks whether to open a new workspace.


## v6.24

- Adjusted discovery tree file indentation so `.trace.md` rows sit one icon slot further right, making file and folder indentation visually symmetric.


## v6.25

Layout polish for large screens and ultrawide monitors.

- Added a centered workspace stage.
- Expanded workspaces now have a reading-width max around 650px.
- One workspace is centered instead of stretching full-width.
- Two and three workspace layouts remain centered as grouped columns.
- Collapsed workspaces remain narrow issue-board style columns.
- Mobile remains full-width/app-like.


## v6.26

Corrected the large-screen layout pass.

- v6.25 centered inner feed content but still allowed the workspace frame itself to stretch.
- v6.26 constrains the actual workspace grid columns.
- One workspace now becomes a centered reading-width panel.
- Multiple workspaces remain centered as a grouped set of columns.
- Topbar and footer are centered with the same max width as one expanded workspace.


## v6.27

Brand polish.

- Added the Tiinex symbol logo as the topbar brand mark.
- Kept the textual `Tiinex Lineage Viewer` label for clarity.
- Used the compact symbol rather than the full logotype so the centered reading-width topbar stays balanced.


## v6.28

Tiinex brand theme pass.

- Darker foundation and softer panels.
- Purple is now the primary brand accent.
- Cyan is no longer the dominant identity color.
- Topbar, workspace frames, chips, focus states, and active controls better match the Tiinex identity board.
- Existing layout and behavior are unchanged.


## v6.29

Topbar layout correction after the brand theme pass.

- Keeps the Tiinex purple brand theme.
- Restores the desktop topbar to a compact single-row pill.
- Prevents the brand label and action buttons from wrapping into two rows.
- Mobile may still wrap intentionally.


## v6.30

Small UI polish.

- Removed `Load demo` from the visible UI.
- Demo loading code remains available internally, but the app should rely on configured/default sources instead of a prominent demo button.
- Adjusted tree file rows: file icon is slightly larger and shifted two pixels left for better visual symmetry.


## v6.31

Workspace header correction.

- Workspace headers now span the full workspace frame.
- Prevents the centered app topbar width rule from leaking into workspace header strips.
- Header action pills remain visible without creating the clipped-box feeling.


## v6.32

Notification discipline.

- Automatic successful load/restore/navigation events no longer create toast spam.
- Browser back/forward should stay visually quiet when state restoration works.
- Errors and warnings still show notifications.
- Explicit user actions such as save/copy can still show confirmation.


## v6.33

Discovery performance and policy lookup patch.

### Discovery performance

- Repo discovery now fetches raw trace files with modest concurrency instead of strictly sequential loading.
- Intermediate renders happen less often and with a shorter render debounce.
- There is still no intentional GitHub/backend throttle in the viewer by default.

### Policy/license lookup

Policy detection now checks, in priority order:

1. `LINEAGE_LICENSE.md`
2. `LINEAGE_LICENSE`
3. `LINEAGE_POLICY.md`
4. `LINEAGE_POLICY`
5. `LICENSE.md`
6. `LICENSE`
7. `POLICY.md`
8. `POLICY`

Lineage-specific policy/license files take precedence over ordinary repo license/policy files.


## v6.34

Origin policy/licence semantics.

- Policy detection is explicitly origin-root based.
- The viewer checks only:
  - `LINEAGE_LICENSE.md`
  - `LINEAGE_LICENSE`
  - `LINEAGE_POLICY.md`
  - `LINEAGE_POLICY`
  - `LICENSE.md`
  - `LICENSE`
  - `POLICY.md`
  - `POLICY`
- It does not use `README`, `VALIDATION_NOTES`, or any other artifact file as a policy fallback.
- Ordinary `LICENSE`/`POLICY` files are shown as origin fallback policy, not as Tiinex lineage policy.


## v6.35

Origin license/policy badge fix and NOTICE badge.

- Fixed badge rendering for `origin-fallback` policy status.
- A root `LICENSE` or `POLICY` now shows as origin fallback instead of `Policy unknown`.
- Added separate origin `NOTICE` / `NOTICE.md` detection.
- NOTICE is shown as its own badge when present.
- Policy/license lookup still only checks the eight agreed root filenames.


## v6.36

Add Lineage intake polish.

- Reworked Add Lineage into an intake surface rather than a dense form.
- Added drag/drop for `.trace.md`, `.md`, and `.zip`.
- Added smart paste while the dialog is open and no input field is focused:
  - full trace markdown becomes a staged pasted `.trace.md`
  - GitHub/raw URLs are added to the explicit URLs field
  - `owner/repo` text fills the repo field
- Kept repo discovery, explicit URLs, and manual upload as compact intake cards.
- Edit mode remains intentionally out of scope.


## v6.37

Search/filter regression fix.

- Restored event binding for discovery search.
- Restored event binding for lineage search.
- Restored change binding for the discovery filter dropdown.
- Kept v6.36 Add Lineage drag/drop and smart paste behavior.


## v6.38

Search/filter regression fix, second pass.

- Search and filter now use delegated document-level handlers.
- Discovery search should filter immediately again.
- Lineage search should filter again.
- Discovery filter dropdown should apply again.
- Future render-layer overrides are less likely to break these controls.

Mobile Add Lineage polish:

- More compact source modal under narrow widths.
- Sticky footer actions inside the modal.
- Smaller spacing and typography for the intake cards.


## v6.39

Mobile Add Lineage intake polish.

- Drag/drop zone is hidden on narrow mobile screens.
- Mobile Add Lineage prioritizes file upload first.
- Explicit URLs are second.
- Public repo discovery is third.
- Smart paste still works when the dialog is open and no input field is focused.
- This aligns mobile use with likely upload/download/offline-cache workflows.


## v6.40

Collapsible Add Lineage intake sections.

- Upload/files stay visible as the fast path.
- Explicit URLs are collapsible.
- Public GitHub repo discovery is collapsible.
- Mobile users no longer need to scroll past text-heavy sections just to upload and start.
- Desktop keeps the richer intake surface while still reducing visual weight.


## v6.41

Directory drag/drop intake.

- Desktop drag/drop now supports dropping a whole folder where the browser exposes directory entries.
- The viewer recursively traverses dropped folders.
- Supported files are staged:
  - `.trace.md`
  - `.md`
  - `.zip`
- Relative paths are preserved so Discovery Tree can reflect the folder structure.
- Unsupported files are skipped with a small intake status note.
- Zip behavior remains unchanged.


## v6.42

Directory intake fallback.

- Folder drag/drop now also tries the modern File System Access API `getAsFileSystemHandle()`.
- Legacy `webkitGetAsEntry()` traversal remains.
- DataTransfer file-list fallback remains.
- Added explicit `Choose folder` input using `webkitdirectory` as a practical desktop fallback.
- Relative paths are preserved for folder picker and supported drag/drop APIs.


## v6.43

Workspace asset preservation.

- Uploaded folders, files, and zip bundles now preserve all contained files as workspace assets.
- `.trace.md` / `.md` files are still parsed into lineage nodes.
- Non-trace assets are not shown as tree nodes, but are available to reference resolving.
- Referenced material now resolves local workspace assets before remote source URLs.
- Local image assets can render thumbnails/lightbox via object URLs.
- Local `.txt` / ordinary `.md` assets can preview in the existing preview modal.
- Save exports a full workspace zip bundle with preserved files and generated traces.
- GitHub discovery remains read-only over fetched traces; it cannot export unfetched repo assets.


## v6.44

Merge/conflict semantics.

- Ordinary `.md` files are preserved as assets but only indexed if they look like Tiinex traces.
- `.trace.md` conflict detection uses lineage dimension slots, not full filenames/slugs.
  - `001-old.trace.md` conflicts with `001-new.trace.md`.
- Asset conflicts still use normal exact path conflict detection.
- Import conflicts now open a modal.
- Conflict actions:
  - `Replace existing`
  - `Import as sibling`
  - `Cancel import`
- `Import as sibling` moves the incoming branch into the next available sibling slot and renumbers companion assets that share the same dimension prefix.
- This first pass does not repair internal markdown links, parent origins, or checksums.


## v6.45

Hotfix.

- Removed the recursive `onAction` wrapper from v6.44.
- Click handlers now route through `onActionV645`, which only intercepts import-conflict actions.
- This fixes `RangeError: Maximum call stack size exceeded` when opening lineage from discovery.


## v6.46

Quiet empty start.

- Removed the redundant middle empty-state card when no workspace is loaded.
- Header/footer/stage layout remains present so positioning does not shift.
- The topbar `Add lineage` button remains the primary entry point.


## v6.47

Empty start and title polish.

- Replaced the actual `renderNoWorkspace()` renderer so the middle "No lineage loaded" card is removed.
- Kept an empty workspace panel to preserve header/footer/stage alignment.
- Product label changed from `Tiinex Lineage Viewer` to `Tiinex Lineage`.
- Header title text has defensive CSS to remove shadow/filter/transform effects that can contribute to blur.


## v6.48

Topbar spacing polish.

- Added a little more breathing room between the Tiinex brand and the action buttons.
- Added slight spacing between topbar buttons.
- Header remains centered; this is spacing-only polish.


## v6.49

Topbar symmetry and brand baseline polish.

- Removed per-button horizontal margins that made the right edge look asymmetrical.
- Kept spacing via container gap instead.
- Lifted the brand text slightly so it aligns better with the symbol mark.


## v6.50

Brand baseline and spacing correction.

- Moves the brand text upward using relative positioning instead of transform.
- Adds a little more margin after the brand lockup before the first action button.
- Keeps topbar centering intact.


## v6.51

Source-aware workspace first pass.

- Workspaces now keep a source registry.
- Nodes and assets get `sourceId` metadata.
- GitHub/repo traces, URL traces, Local uploads, and Drafts are represented as distinct logical sources.
- Same visual path can coexist across different sources because storage keys include sourceId.
- Parent lookup prefers the same source before falling back to the merged workspace.
- Discovery cards and tree file rows show source badges.
- Local uploads/folders/zips merge into a single `Local` source instead of creating one root per zip/import.
- Local source conflicts still use v6.44 rules: trace dimension slots and exact asset paths.
- Copy Link now has a tooltip clarifying that it copies view state only, not local uploads or unsaved contents.
- Files/folders/zips can be dropped directly onto an existing workspace.
- Files/folders/zips can be dropped onto the empty stage to create a local workspace.


## v6.52

Hotfix.

- Removed the recursive `bindEvents` wrapper introduced in v6.51.
- Workspace drag/drop is now bound through a one-time document-level delegated handler.
- No new product behavior beyond preserving the v6.51 workspace drop intent.


## v6.53

Topbar brand alignment hotfix.

- Reset the Tiinex symbol mark to its natural inline-flex position.
- Nudged only the brand text span 2px upward.
- Added a little explicit left margin before the top actions.
- Avoids broad selectors that can affect button labels.


## v6.54

Workspace close confirmation.

- Closing/removing a workspace now uses native `window.confirm()`.
- Confirmation includes trace/source counts and warns that Copy Link does not preserve local uploads, preserved assets, or unsaved/generated contents.
- Cancel leaves the workspace untouched.


## v6.55

Close semantics polish.

- Close/remove workspace now explicitly treats confirmation as permission to discard live browser memory for that workspace.
- Revokes workspace object URLs on confirmed close.
- Clears pending import/modal state that belongs to the closed workspace.
- Keeps persistence intentionally out of scope until Add/Edit is designed.


## v6.56

Topbar simplification.

- Header brand is symbol-only by default.
- Removed visible `Tiinex Lineage` text from header render layers.
- Topbar `Add lineage` button is now `Create`.
- Brand hitbox is constrained to the icon size so it cannot overlap the Create button.
- Kept `Powered by Tiinex` in the footer.


## v6.57

Viewer identity config.

- Header brand can be configured from markdown.
- Default remains symbol-only with no header label.
- Default config file: `viewer.config.md`.
- Alternate config URL can be supplied with:
  - `?viewerConfig=...`
  - `?config=...`
  - `?identity=...`
- Supported fields:
  - `Label`
  - `Icon`
  - `Home`
  - `Accent` (parsed but not yet themed)
- Config can live on another origin when fetch/CORS allows it.
- GitHub blob URLs are converted to raw URLs where possible.
- Added an HTML origin notice asking redistributors to keep the visible `Powered by Tiinex` footer.


## v6.58

Custom CSS in viewer config.

- `viewer.config.md` can now include inline custom CSS under:

  ```md
  ## Custom CSS

  ```css
  :root { --tv-accent: #a78bfa; }
  ```
  ```

- `viewer.config.md` can also reference an external stylesheet with:
  - `- CSS: ./personal.css`
  - `- CSS: https://.../personal.css`
- External CSS is resolved relative to the config URL.
- Custom CSS is injected into `<style id="viewer-config-custom-css">`.
- A footer guard style is injected after custom CSS so the visible `Powered by Tiinex` origin footer is not accidentally hidden by viewer config.


## v6.59

Create/source flow reset.

- Topbar `Create` now opens a small create-workspace dialog.
- Creating a workspace no longer requires selecting sources first.
- Source intake moved to the workspace-level source button.
- Empty workspace hint still invites drag/drop or source-button import.
- Add-source modal keeps files, folder picker, explicit URLs, and public GitHub repo discovery.


## v6.60

Workspace Add flow.

- Workspace action bar now has a visible `Add` button.
- `Add` opens a step chooser instead of the full source intake immediately.
- Manual file/folder choices open native pickers directly and import immediately after selection.
- Git source and URL source are separate focused steps.
- Drag/drop is a separate desktop-only mode with a highlighted drop target scoped to the selected workspace.
- Topbar `Create` remains a simple empty-workspace action.


## v6.61

Compact workspace header and single-file parent guard.

- Workspace `Add` button is now icon-only with tooltip/aria text.
- Policy, license, local, unknown, and notice chips are icon-only.
- Policy/notice title text starts with the source filename and includes sanitized document text when available.
- Policy colors now carry the main signal:
  - green = lineage policy found
  - yellow = origin fallback policy/license
  - red = missing policy/license
  - blue = local workspace
  - purple = notice
- Fixed false cycle detection for flat single-file uploads where a relative parent such as `../001.trace.md` collapses onto the current uploaded filename.


## v6.62

Stabilization pass.

- Fixed delegated workspace drag/drop crash caused by assuming `event.currentTarget` was the drop zone.
- Workspace drop now resolves the actual `.workspace-drop-target` from the event path and safely removes drag classes.
- Workspace drop ignores events while the Add/source modal is open, so modal-scoped drop owns that interaction.
- Drag/drop Add mode now accepts drops across the modal/drop overlay, not only the exact inner dropzone.
- Local/uploaded/generated nodes can be removed from the current workspace with confirmation.
- Remote Git/source nodes remain protected from removal in the basic mode.
- Reduction/compaction is intentionally left for a later Add/Edit/reduction leaf.


## v6.63

Empty-stage and workspace-active polish.

- Removed visible active workspace affordance from the UI.
- Internal `activeWorkspaceId` remains for routing/focus behavior.
- Added configurable empty-stage subtitle/watermark through `viewer.config.md`.
- Supported config keys include:
  - `No workspace subtitle`
  - `no-workspace-subtitle`
  - `empty workspace subtitle`
  - `stage subtitle`
- Default subtitle: `Everything starts from somewhere.`


## v6.64

Empty-stage polish and empty URL-state cleanup.

- Removed the visual box around the no-workspace watermark.
- Reduced watermark size and opacity.
- Footer background is transparent in the empty-stage view.
- Empty viewer state now clears stale `#state=...` hashes.
- `Copy link` on an empty viewer copies a clean URL while preserving query params such as `viewerConfig`.
- Boot no longer loads demo content implicitly when no state/direct URL exists.
- QR button intentionally deferred until URL semantics are stable.


## v6.65

Rotating no-workspace subtitles.

- `viewer.config.md` still supports a single subtitle:
  - `No workspace subtitle: Every handoff starts somewhere.`
- It now also supports a bullet list:
  - under `No workspace subtitles:`
  - or under a `## No workspace subtitles` section
- The empty-stage subtitle rotates when the empty stage is presented again, while staying stable during the same visible empty-state render.
- Added default Tiinex-style subtitle examples to `viewer.config.md`.


## v6.66

Viewer config schema documentation.

- Added `.topics/.schemas/tiinex.viewer.config.v1.schema.md`.
- The schema is site-local documentation for `viewer.config.md`.
- It is intentionally not a continuity/lineage artifact and does not require a continuity envelope.
- Added a schema comment to `viewer.config.md`.


## v6.67

Viewer config convention alignment.

- Reworked `viewer.config.md` into a lightweight Tiinex-style markdown shape:
  - `## Why`
  - `## Summary`
  - `## Current`
  - config-specific sections
  - `## Integrity`
- Kept it intentionally parentless and non-lineage.
- Added a checksum footer to `viewer.config.md`.
- Updated `.topics/.schemas/tiinex.viewer.config.v1.schema.md` to document the recommended shape.
- No runtime changes expected.


## v6.68

Config lineage optionality and evidence attachment visibility.

- Updated the viewer config schema language:
  - `.config.md` is a discovery/role suffix, not a capability limit.
  - `Parent` is optional, not forbidden.
  - A config may be standalone or participate in a lineage.
- Updated `viewer.config.md` wording and refreshed its checksum.
- Restored referenced-material badges/sections in the latest card renderer.
- Expanded evidence cards now pass workspace context to `renderContinuityPreview(node, ws)`, so relative evidence links such as local/remote image assets can surface as attachments.


## v6.69

Site-local config path.

- Moved the actual viewer config to `.topics/.configs/viewer.config.md`.
- Kept the schema at `.topics/.schemas/tiinex.viewer.config.v1.schema.md`.
- Updated the schema comment inside the config to use `../.schemas/tiinex.viewer.config.v1.schema.md`.
- Viewer now tries `.topics/.configs/viewer.config.md` by default.
- Viewer falls back to root `viewer.config.md` for older deployments.
- Explicit `?viewerConfig=`, `?config=`, and `?identity=` still override the default.


## v6.70

Export current lens as `.config.md`.

- Added topbar `Export` button with tooltip: downloads the current view/lens as a portable `.config.md`.
- Exported config includes:
  - `Display Name`
  - `Why`
  - `Summary`
  - `Current`
  - human-readable `Workspaces`
  - machine-readable `Viewer State` JSON
  - no-workspace subtitles
  - optional custom CSS
  - checksum footer
- Drag/drop or source intake of `*.config.md` now opens the config as a viewer lens.
- Config opening preserves existing local workspaces and merges/deduplicates shareable sources where possible.
- Local-only/generated material is noted in exports but not embedded.
- No `.trace.md` Add/Edit lineage authoring included in this leaf.


## v6.71

Config-open feedback clarity.

- Dropping/opening a `.config.md` without `## Viewer State` now reports that the config was applied but no workspace snapshot was found.
- Dropping/opening a `.config.md` with empty `Viewer State.sources` reports that there are no shareable workspaces.
- Dropping/opening a `.config.md` with sources reports that the workspace snapshot was applied.
- Brand icon hover title now uses `Display Name`/H1 and summary text when available, so a config with no visible label still has inspectable identity.


## v6.72

Named local workspace state and source close.

- First manually-created local workspace creates a named local state profile from the workspace label.
- Local state stores under a unique internal key while displaying the user-provided name.
- New tabs with no URL/config workspace state offer a restore dialog for existing local workspace profiles.
- Restore dialog can be closed to start empty.
- Text-based local workspace files and text assets are autosaved to localStorage.
- Binary assets are intentionally not embedded in localStorage in this leaf.
- Workspace sources now render as closable pills.
- Closing a source uses a native confirm prompt and removes files/assets from that source in the current workspace.


## v6.73

Local state guardrails.

- Restore dialog now only offers local-state entries that contain at least one workspace snapshot.
- Empty or stale local-state entries are pruned from the registry.
- Opening an empty/stale local-state entry no longer clears the viewer into an empty “opened” state.
- Creating the first local workspace now requires an explicit user-provided name.
- Create modal copy now reflects that the first local workspace name is required.


## v6.74

Config format alignment.

- Bundled `.topics/.configs/viewer.config.md` now uses the Tiinex `# Continuity Context` envelope instead of comment-only metadata.
- Bundled config now contains `## Viewer State` for a default `Tiinex/docs` workspace source, so dropping it should open a workspace rather than only changing the shell lens.
- `tiinex.viewer.config.v1.schema.md` now has `tiinex.root.v1` as parent and uses the same continuity envelope convention.
- Exported `.config.md` files now use the continuity envelope and `# Continuity Integrity` footer.
- `Config Discovery` remains one optional section in the same config format, not a separate config type.


## v6.75

Discovery filter/search regression repair.

- Reconnected discovery search inputs rendered with `data-search`.
- Reconnected discovery filter selects rendered with `data-discovery-filter-select`.
- Added robust direct and delegated bindings for future render-layer changes.
- Preserved the v6.74 config/source behavior.


## v6.76

Markdown-first config shape.

- First body H1 after the continuity envelope is now the config display name.
- `Display Name` is no longer emitted as a normal config field.
- Bundled config no longer contains body `Why`, body `Summary`, `Current`, or raw `Viewer State`.
- Bundled config uses `Workspace Entrypoints` as the readable workspace-opening surface.
- Parser can open workspaces from `Workspace Entrypoints`.
- Legacy `Viewer State` remains supported as a migration fallback.
- Export now emits markdown-first sections and omits empty optional fields.
- Optional behavior defaults are documented in schema rather than dumped into each config.
- Empty-stage subtitles in bundled/default config no longer use terminal periods.
- Added a very subtle empty-stage continuity line.


## v6.77

Config-provided Help lightbox.

- Added optional `## Help` section support in `.config.md`.
- Added a right-side `?` topbar button only when active config has help content.
- Help button has no visual tooltip; the lightbox carries the context.
- Help lightbox renders normal markdown using the existing safe markdown renderer.
- Bundled config includes help text aimed at external reviewers and their LLM helpers.
- Export preserves config-provided help content.
- Schema documents optional `Help`.


## v6.78

Brand/help layout correction.

- Scoped viewer identity parsing to `Viewer Identity` and legacy top-level fields only.
- Nested `Label` values under `Config Discovery` no longer leak into the topbar brand.
- Added a fixed-size brand icon slot so the logo/mark stays inside its designated box.
- Made the Help lightbox use a robust fixed backdrop and centered modal layout.
- Kept the v6.77 config-provided `## Help` behavior.


## v6.79

Visible default brand correction.

- Restored a visible Tiinex fallback mark when config omits explicit `Label` and `Icon`.
- Kept the brand link clickable and symbol-only by default.
- Ensured the fallback mark stays inside the fixed brand slot.
- No config format changes.


## v6.80

Workspace artifact pivot.

- Preferred artifact suffix is now `.workspace.md`.
- Removed bundled `.config.md` artifact.
- Added bundled `.topics/.workspaces/viewer.workspace.md`.
- Schema renamed from `tiinex.viewer.config.v1` to `tiinex.workspace.v1`.
- Schema file renamed to `.topics/.schemas/tiinex.workspace.v1.schema.md`.
- `Config Discovery` renamed to `Workspace Discovery`.
- Export now writes `.workspace.md`.
- Drop/open logic now treats `.workspace.md` as the workspace artifact.
- UI copy now says workspace where it refers to the portable artifact.
- No backwards compatibility alias is intentionally kept because this is not published yet.


## v6.81

Scan-first workspace Help.

- `## Help` is rendered as a scan-first modal.
- `###` headings become collapsible sections.
- Help sections are closed by default.
- Help supports markdown image syntax `![alt](url)`.
- Help links and images resolve relative to the workspace artifact URL when available.
- Schema notes collapsible help sections and relative asset behavior.


## v6.82

Workspace Help readability polish.

- Made the Help modal more opaque for readability.
- Moved close control to the top-right of the dialog.
- Added safer internal header padding so the kicker/title does not clip.
- Reduced excessive background bleed through expanded Help sections.
- Kept the collapsible scan-first behavior from v6.81.


## v6.83

Workspace asset CWD and host default workspace.

- Workspace `Icon` and `CSS` paths now resolve relative to the `.workspace.md` artifact location when they are relative.
- Bundled `viewer.workspace.md` now declares `Icon: ../../assets/tiinex-logo-white-transparent.png`.
- A host can provide a default workspace without URL query/hash state.
- Supported host globals before app load:
  - `window.TiinexWorkspace = { defaultWorkspace: "path/to/workspace.workspace.md" }`
  - `window.TiinexWorkspace = "path/to/workspace.workspace.md"`
- Explicit URL state still wins over host defaults.
- Schema documents optional `Host Defaults`.


## v6.84

Local-file hardening and brand fallback.

- Removed CDN `integrity` attributes from `index.html` to avoid stale SRI failures in the prototype.
- Brand image now has an app-relative fallback for packaged `assets/...`.
- If the brand image still fails, the default Tiinex mark remains visible.
- Local `file://` fetch attempts now fail early with a clear local-only message instead of browser CORS noise.
- This does not make browser `file://` fetch possible; for automatic loading, host the folder over `http://localhost` or drop files into the viewer.


## v6.85

Static-disk default workspace and embedded brand fallback.

- `file://` with no explicit workspace query and no `#state=` now uses an embedded bundled workspace instead of fetching `.workspace.md` from disk.
- Default brand logo has an embedded data-URI fallback.
- Workspace-relative assets still work in hosted/http mode.
- Static disk mode remains limited for remote/source fetching; drag/drop or `http://localhost` is still required for full automatic remote workspace behavior.


## v6.86

Corrected `file://` workspace bootstrap and packaged asset resolution.

- `#state=` no longer prevents loading the embedded default workspace shell in static disk mode.
- In `file://` mode, workspace asset paths prefer packaged app-relative `assets/...` before any resolved `file://` URL.
- Brand image no longer intentionally starts from stale `file:///C:/.../assets/...` paths.
- Stale `#state=` containing `file://` sources is cleared with a warning instead of repeatedly trying unsafe local loads.
- Hosted/http mode still fetches the configured `.workspace.md` entrypoint normally.


## v6.87

Robust brand slot rendering.

- Replaced topbar brand `<img>` layering with a CSS background image on the fixed brand slot.
- Topbar now explicitly reserves left and right 34px side slots.
- Default embedded Tiinex logo is used as the brand image when available.
- Keeps the symbol-only layout unless the workspace provides a label.


## v6.88

Deterministic static-disk mode and inline brand rendering.

- In `file://` mode, route `#state=` is ignored and removed on boot.
- In `file://` mode, the app no longer tries to restore URL route sources.
- URL state writing is disabled in `file://` mode to avoid non-portable file-route hashes.
- Brand logo renders as an inline embedded image in static disk mode.
- Brand fallback letter remains visible if the image fails.
- Hosted/http mode still supports route state and workspace fetching.


## v6.89

Deterministic workspace/default brand resolution.

- Workspace-provided `Icon` wins when provided.
- Relative icon paths are normalized to packaged `assets/...` when possible.
- If workspace omits `Icon`, the viewer defaults to `assets/tiinex-logo-white-transparent.png`.
- Embedded Tiinex logo data URI remains a final fallback.
- Brand slot is rendered as a deterministic CSS background with inline variables.
- Embedded default workspace now applies workspace entrypoints again for faster regression testing.


## v6.90

Explicit inline brand image rendering.

- Brand slot now renders a real inline `<img>` again, but with strict inline-safe sizing and class isolation.
- Workspace `Icon` remains first choice.
- Packaged `assets/tiinex-logo-white-transparent.png` remains the default when no workspace icon is configured.
- Embedded Tiinex data URI is the image fallback.
- If even the fallback image fails, the slot shows a visible `T` fallback.


## v6.91

Plain-flow brand and symmetric topbar.

- Topbar layout is forced back to centered flex, avoiding malformed grid symmetry.
- Brand slot is a normal flow element with explicit 34px wrapper and 28px inner slot.
- Logo image is a normal inline-flow image, not absolutely positioned and not a CSS background.
- A visible fallback `T` remains under/behind the logo and becomes fully visible on image failure.
- Help button remains the right-side sidecar.


## v6.92

Brand slot visibility fix.

- Fixed old CSS selector `.brand-inline > span:not(.brand-mark)` hiding the modern brand slot.
- The modern brand slot is now explicitly allowed and visible.
- Logo loading was already working; this fixes the render visibility root cause.


## v6.93

Search focus stability.

- Search input now updates workspace search state immediately.
- Feed refresh is debounced and restores focus/caret after render.
- This avoids the one-character-at-a-time blur regression.
- Kept the patch small rather than refactoring the whole render tree.


## v6.94

Schema badge and schema attachment navigation.

- Type/schema badges are clickable reading-contract affordances.
- Clicking a type badge attempts to open the matching `.schema.md` as a lineage view in the same workspace.
- Schema references/attachments get an `Open schema` / `Load schema` action.
- Schema references navigate in the same viewer instead of opening a lightbox or browser tab.
- GitHub discovery now indexes both `*.trace.md` and `*.schema.md` under the selected roots.
- `.schema.md` files are indexed as lineage artifacts.
- Browser history is updated through the existing route-state path where route-state is enabled.


## v6.95

Static-disk view hash and browser history.

- `file://` mode now writes lightweight `#view=` route state for UI navigation.
- The lightweight state stores active workspace, workspace offset, selected paths, view/filter/search state.
- `file://` still does not serialize or restore local file sources through URL state.
- Browser Back/Forward works for badge/schema navigation and selected-node navigation in static disk mode.
- Old `#state=` full-source hashes are still cleared in static disk mode.
- Hosted/http mode keeps the full source-preserving route state.


## v6.96

Help readability / anti-blur polish.

- Kept the purple Tiinex accent.
- Made Help reading surfaces more opaque.
- Removed text shadows and filters from Help text.
- Disabled blur on the Help card itself while keeping a lighter backdrop blur behind it.
- Improved line-height and font rendering for Help text.
- Added reduced-transparency handling.


## v6.97

Badge readability normalization.

- Normalized card badge/chip typography.
- Raised the smallest badge text size.
- Slightly reduced larger type-badge dominance.
- Made badge padding and line-height more consistent.
- Removed text-shadow/filter from badges for clearer reading.
- Kept the purple Tiinex accent.


## v6.98

Semantic badge color restore.

- Restored the richer badge color language from the earlier visual direction.
- Kept badge text sizes consistent.
- Reduced v6.97's oversized badge feel.
- Preserved the purple Tiinex identity and red integrity signal.
- Keeps browser zoom as the preferred readability scaler.


## v6.99

Low-signal badge reduction.

- Removed repeated `leaf candidate` badges from feed cards.
- Kept higher-signal badges: source, type/schema, date, material, integrity, draft.
- `selected leaf` remains visible when a node is actively selected.
- Lineage-specific relation labels can still show where they add context.


## v6.100

Dynamic discovery filter options.

- Discovery filter options are derived from the loaded workspace nodes.
- `All` is always present.
- Only loaded schema/type keys are shown.
- `Drafts` appears only when generated draft nodes exist.
- If the current filter disappears after source changes, it falls back to `All`.
- This removes static filter options that advertise unloaded types.


## v6.101

Integrity `Towards` target resolution.

- Fixed false integrity mismatches caused by hashing parent when `Towards` was not `self`.
- `Towards: self` still hashes the current artifact without its integrity footer.
- Markdown-link `Towards` values now resolve to the declared target artifact.
- Commit-pinned GitHub `Towards` URLs are fetched and hashed as the exact declared target.
- Relative `Towards` values resolve through loaded workspace paths or repo/ref context.
- Integrity cache now keys both storage key and path.


## v6.102

Confidence-aware integrity verification.

- A loaded filename/path candidate may verify a match, but no longer proves mismatch unless it is the exact declared `Towards` target.
- Exact remote `Towards` URLs are still authoritative when they can be fetched.
- If the exact target cannot be fetched and only a non-matching candidate is loaded, status becomes `integrity unavailable` instead of false `integrity mismatch`.
- Badge tooltips now distinguish exact mismatch from ambiguous/unavailable target resolution.


## v6.103

Pragmatic integrity display policy.

- Exact locally anchored target bytes can still produce verified or mismatch.
- Self integrity still verifies/mismatches against the current artifact.
- Loaded candidate targets can verify green if they match, but cannot produce red mismatch if ambiguous.
- Remote exact target fetches can verify green if they match.
- Remote exact target non-match is shown as `integrity unavailable` instead of red mismatch until the target is locally anchored.
- This reduces false alarms during exploratory static/discovered browsing while preserving hard failure for exact local targets.


## v6.104

Canonical integrity hash input.

- Fixed browser integrity canonicalization for `Towards: self` and loaded targets.
- The verifier now hashes the artifact body plus the canonical empty `# Continuity Integrity` footer stub.
- Integrity method entries remain excluded from the hash.
- This matches the generator/exporter shape used by current Tiinex artifacts.
- Added a subtle topbar scale cohesion pass so header controls do not visually dominate the workspace content.


## v6.105

Integrity unresolved instead of false red.

- The browser verifier now tries multiple known Tiinex canonical hash inputs.
- If any variant matches, the artifact is verified.
- If none match, the viewer reports `integrity unresolved` rather than red mismatch.
- This applies especially to `Towards: self` while the browser canonicalizer is being aligned with the VS Code validator.
- Red mismatch is intentionally avoided until the web canonicalizer is proven byte-for-byte equivalent to the validator.


## v6.106

Recursive Help markdown rendering.

- Help markdown now trims trailing standalone divider lines such as `---`, `***`, and `___`.
- Nested help headings (`####`, `#####`, etc.) render as nested collapsible sections.
- Existing top-level Help sections remain collapsible.
- Middle dividers render as subtle rules; trailing dividers are removed.
- Image and config-relative asset support remains intact.


## v6.107

Integrity diagnostics UI.

- Integrity badges are now clickable when an integrity footer exists.
- Clicking a badge opens an Integrity Diagnostics modal.
- Diagnostics show method, `Towards`, expected value, resolved target label/status, authority, confidence, and computed hash variants.
- Diagnostics include a raw text block and copy action for comparison with the VS Code validator.
- This does not claim final checksum parity; it makes the viewer's current attempts visible.


## v6.108

Compact tree integrity badges and schema integrity display policy.

- Tree-mode integrity badges are now compact and should not break row layout.
- Maintained schema nodes with integrity footers use `schema integrity` instead of loud `integrity unresolved` while checksum parity is still unproven.
- Feed cards keep richer diagnostics access.
- Diagnostics remain clickable on integrity badges.


## v6.109

Ported VS Code continuity checksum canonicalizer.

- Ported the checksum canonicalization semantics from `Tiinex/ai-provenance/ides/vscode/src/traceableContinuityValidation.js`.
- Canonicalization now:
  - normalizes CRLF/CR to LF
  - strips trailing spaces/tabs per line
  - trims final trailing whitespace/newlines
  - hashes everything before the `# Continuity Integrity` heading when present
  - joins the hashed lines with `\n`
- Removed the prior multi-variant guesswork from normal verification.
- Restored real verified/mismatch behavior when the exact target can be read.
- Retains diagnostics for comparison.


## v6.110

Integrity label and diagnostics dialog polish.

- Integrity badge labels are shorter:
  - `verified`
  - `mismatch`
  - `open`
  - `missing`
  - `malformed`
- Diagnostics still carries the full integrity context.
- Integrity diagnostics now renders as a centered modal dialog instead of a full-screen page-like surface.
- Mobile layout uses a nearly full-screen dialog with internal scrolling.


## v6.111

Self-link integrity and tree badge reduction.

- `Towards: [self](self)` now resolves as `self`.
- `Towards: self`, `[self](self)`, and `[anything](self)` all use the local exact self target path.
- Tree-mode integrity badges are now icon-only with tooltip text.
- Feed and lineage cards keep text labels such as `verified`, `mismatch`, and `open`.


## v6.112

Tree row badge layout repair.

- Restored text labels on tree integrity badges.
- Tree file rows now group filename and badges into two inline grid regions.
- Badges stay on the same row and should not wrap above/below filenames.
- Filename truncates before badges when horizontal space is tight.
- Feed and lineage card badge behavior is unchanged.


## v6.113

Integrity diagnostics/status sync.

- Integrity diagnostics now writes its computed result back to the node and integrity cache.
- A badge that said `open` can update to `verified` after diagnostics proves a match.
- Lineage mode now refreshes visible lineage integrity after lazy parent context is available.
- This reduces stale badge state where the dialog and chip disagreed.


## v6.115

Badge signal cleanup and logo sizing.

- Increased the viewer logo image by 2px in width and height.
- Missing continuity now uses the red danger badge styling.
- Removed boilerplate relation badges from feed/lineage cards:
  - `selected leaf`
  - `parent context`
  - `root context`
  - `leaf candidate`
- Removed `leaf` badge from tree rows.
- Child-count badges remain where they carry actual branching signal.


## v6.116

Tree-view badge layout repair.

- Fixed tree-row badge layout by removing nested `<button>` elements inside tree-row buttons.
- Tree integrity badges in tree mode now render as non-interactive inline badges, which keeps schema and integrity badges on the same row.
- Preserved the v6.115 badge cleanup and red `missing` styling.


## v6.117

Tree badge clipping repair.

- Keeps tree badges as text badges.
- Keeps badges on the same row as the filename.
- Removes clipping from the tree badge group.
- The filename now yields via ellipsis before badges get clipped.
- Schema badges may ellipsis if very long, but integrity badges stay visible.


## v6.118

Modal scroll containment.

- Applied shared modal layout rules across current lightbox/dialog surfaces.
- Modal backdrops are fixed and contain scroll.
- Modal panels/cards use flex-column layout with fixed header and internally scrolling body.
- Schema Read View content should no longer slide under the header or scroll outside the dialog.
- Mobile view keeps a near-fullscreen dialog with internal body scroll.


## v6.119

Brand/logo lockup final sizing.

- Applied the manually validated browser CSS shape for the topbar logo.
- Brand slot is 38×38px.
- Brand image is 40×40px, centered and clipped inside the slot.
- Removed old inline span offsets that made the logo drift.
- Preserved the v6.118 modal scroll containment fixes.


## v6.120

Read/Markdown modal scroll repair.

- Rendered read/markdown modals with an explicit `modal-read-scroll` body wrapper.
- Read modal panel now uses fixed header + internal scroll body.
- Removed the old negative-margin sticky header behavior inside read modals.
- Schema Read View content should no longer disappear, slide under the header, or scroll outside the dialog.
- Preserved v6.119 logo lockup and prior checksum fixes.


## v6.121

Help typography polish.

- Reduced Help heading weight so headings read sharper.
- Removed glow/text-shadow/filter from Help headings.
- Adjusted Help heading letter-spacing and line-height.
- Preserved the existing Help layout, accordion behavior, and purple visual identity.


## v6.122

App-level Create workspace visibility.

- Added an app-level option for disabling workspace creation.
- This is intentionally not part of workspace config.
- Default remains enabled.
- Hosts can set:
  ```html
  <script>
    window.TIINEX_VIEWER_OPTIONS = { createWorkspace: false };
  </script>
  ```
  before loading `app.js`.
- Quick URL testing also supports `?createWorkspace=false` or `?create=0`.
- When disabled, Create/open-create controls are hidden and guarded against action calls.


## v6.123

Policy and notice dialogs.

- License/policy and NOTICE badges now open an internal lightbox/dialog instead of opening a browser tab directly.
- Dialog includes workspace/document metadata and rendered document text when available.
- Dialog includes an explicit `Open source` action for users who want the original file.
- Missing/local/unknown policy states also open a short explanatory dialog.
- NOTICE remains separate from policy/license.


## v6.124

Compact policy/notice badge regression fix.

- License/policy and NOTICE badges are compact icon-only controls again.
- Text remains available via `title` and `aria-label`.
- Policy/notice dialogs still open internally.
- Removed the secondary bottom `Close` button from the policy/notice dialog.
- `Open source` remains inside the dialog when a source URL exists.


## v6.125

Schema Open regression fix.

- Fixed `Open` on schema/read view after v6.120 scroll-wrapper changes.
- `renderNodeModal` now calls the active detail renderer with `(ws, node)`.
- Raw Markdown modal also guards against missing `rawMarkdown`.
- Keeps v6.124 compact policy/notice badges and dialog behavior.


## v6.126

Create workspace dialog polish.

- Simplified the Create workspace dialog copy.
- Removed repeated explanation around local workspace naming.
- Dialog now says:
  - Name a local workspace.
  - Sources/files/folders/GitHub roots can be added after it exists.
  - Stored locally in this browser unless exported.
- No workspace creation behavior changed.


## v6.127

First-class schema/workspace artifacts.

- `.schema.md` files are indexed as workspace nodes when imported or discovered.
- `.workspace.md` files are indexed as workspace nodes when imported or discovered.
- Dropping schema/workspace files into an empty viewer creates a local workspace and imports them.
- GitHub tree discovery now includes `.trace.md`, `.schema.md`, and `.workspace.md`.
- Added a runtime bridge for `commitImportEntries` so the current import path does not silently fail.
- `.workspace.md` can still be used as a viewer entrypoint where that path is explicitly invoked; it is no longer excluded from workspace material import.


## v6.128

Responsive image attachment previews.

- Image attachment previews now use a contained, scroll-safe image surface.
- Images keep their natural aspect ratio and use `object-fit: contain`.
- Landscape, portrait, square, meme poster, and screenshot images should all fit within the dialog without cropping.
- Mobile previews use nearly full viewport height with internal scroll.
- Tiny screenshots are not force-upscaled beyond the responsive bounds.


## v6.129

Cross-scope lineage traversal.

- Parent traversal now treats `.schema.md` and `.workspace.md` as lineage artifacts, not non-lineage attachments.
- Parent fetching no longer rejects schema/workspace parents when they are linked through GitHub/remote URLs.
- Absolute parent links now preserve the target repo path instead of deriving a malformed relative path from the current node.
- Lineage mode adds a scope-transition divider when the loaded chain moves from one source/workspace/repo scope to another.
- Parent-unavailable footer language now distinguishes an open/lazy-load boundary from a hard failure.


## v6.130

Import dedupe and one-boundary lineage audit.

- Deduplicates imported entries by source/path before committing imports.
- Prevents single dropped files from appearing as duplicate local-source counts in common import paths.
- Lineage mode now attempts to automatically fetch one fetchable parent boundary when the visible lineage ends there.
- Added a small `Audit` control in lineage mode.
- The Audit button manually loads the next fetchable parent boundary when one is open.
- The auto-fetch intentionally crosses one boundary per render to avoid runaway traversal.


## v6.131

Parent audit bridge and source count repair.

- Fixed Audit/auto parent fetch regression by adding a `fetchParentTrace` bridge to the current `fetchParentCandidate(wsId, candidate)` implementation.
- Source pill counts no longer double-count one imported markdown artifact as both an indexed file and preserved asset.
- If a source has indexed workspace files/nodes, the pill count shows that count.
- If a source is asset-only, the pill count falls back to asset count.


## v6.132

Static-file GitHub API CORS guard.

- Disables `api.github.com/repos/.../git/trees?...` discovery when the viewer is opened from `file://`.
- Static file mode now returns an empty GitHub tree manifest instead of breaking the app with CORS errors.
- Explicit raw/browse parent links and workspace entrypoints can still be loaded individually.
- Hosted viewer mode may still use GitHub API tree discovery.


## v6.133

Parent edge URL/path resolution.

- Fixes the case where a parent file is loaded into the workspace but not shown in the selected lineage.
- Parent edge resolution now matches against:
  - relative paths
  - converted GitHub browse/raw URLs
  - loaded node `path`
  - loaded node `rawUrl`
  - loaded node `browseUrl`
- This is especially important for schema/workspace artifacts whose Parent Trace is an absolute GitHub URL.
- No GitHub API tree discovery is reintroduced; this preserves v6.132 static-file CORS behavior.


## v6.134

Discovery display options.

- Added a workspace-level Display options control in the workspace header.
- Display options are app/UI state, not workspace schema config.
- Toggles:
  - Leaves only
  - Show `.trace.md`
  - Show `.schema.md`
  - Show `.workspace.md`
- Defaults preserve current behavior:
  - leaves only: on
  - trace/schema/workspace: on
- Discovery feed and tree both use the same display options.


## v6.135

Display options render repair and filter consolidation.

- Fixed a render-blocking regression from v6.134 by restoring the missing `countWorkspaceSources` helper.
- Added a defensive `filteredDiscoverySources` helper for active/older call chains.
- Moved the discovery type filter dropdown into the Display options dialog.
- Discovery toolbar now keeps only view mode and search, improving mobile width.
- Filter dropdown is now dynamic and only lists loaded artifact types plus `All` and `Drafts` when present.


## v6.136

Static Git discovery fallback and empty policy polish.

- Static `file://` Git source discovery now uses jsDelivr flat package metadata instead of `api.github.com/git/trees`.
- This keeps disk-opened viewer mode from hitting GitHub API CORS while still allowing repo tree discovery.
- Hosted mode can still use the GitHub API tree endpoint.
- Empty/unknown policy dialogs now render compact metadata rows and a short empty-state card instead of oversized pill shapes.


## v6.137

Remove cleanup for imported material.

- `Remove` on a local/uploaded markdown/schema/workspace node now removes both the indexed file and the preserved asset copy.
- Matching cleanup checks path, storage key, source/path key, and asset path.
- Parent fetch state for the removed node is cleared when it matches the removed path/rawUrl/browseUrl.
- Source pills hide when their source has no remaining files/assets.
- Re-importing the same removed file should no longer trigger stale path/sibling conflict prompts.


## v6.138

Tree expand/collapse all.

- Added an icon-only tree control next to discovery search in Tree view.
- If any visible folders are expanded, the control collapses all visible folders.
- If all visible folders are collapsed, the control expands all visible folders.
- The control is hidden in Feed view and when the visible tree has no folders.
- Tree state is persisted through the current route state.


## v6.139

Orphan lineage asset cleanup.

- `.trace.md`, `.schema.md`, and `.workspace.md` assets are treated as preserved secondary copies.
- Orphan preserved lineage assets are pruned when no matching indexed workspace file remains.
- Import conflict detection for lineage markdown now checks indexed files, not stale preserved asset copies.
- Source pill counts ignore orphaned lineage asset residue.
- Remove now performs an extra orphan-lineage-asset cleanup pass after removing a local/uploaded node.


## v6.141

Reimport parent cache repair without hoisted recursion.

- Replaces the broken v6.140 approach.
- Fixes the remove/reimport case where a selected node may show a fetchable parent boundary but fail to auto-load after reimport.
- Clears stale auto-parent-fetch cache on remove/reimport.
- Uses an assignment override for `commitImportEntries` instead of a hoisted function declaration.
- Prevents the v6.140 maximum call stack recursion.


## v6.142

Stale loaded parent-fetch state repair.

- Fixes a remove/reimport case where the parent was no longer in the workspace but `parentFetches` still said the parent boundary was loaded.
- `parentFetchState` now validates `loaded` state against actual loaded nodes before blocking fetch.
- If loaded state is stale, the cache entry and auto-fetch attempt key are cleared.
- Removing a local/uploaded leaf also removes a lazy-loaded parent boundary if it was only referenced by that leaf.


## v6.143

First-pass local Edit/Add authoring.

- Local/uploaded workspace nodes get an `Edit` action.
- Edit opens a markdown textarea and saves back to the same local workspace path/source.
- Save recomputes workspace index and keeps the selected node active when possible.
- Workspace plus button now opens a `New markdown artifact` dialog for local artifacts.
- Add supports:
  - `.trace.md`
  - `.schema.md`
  - `.workspace.md`
- Add/Edit are local workspace operations only; no Git commits are created.
- This is a raw markdown pass, not a schema-aware form editor.


## v6.144

Edit/Add render-blocking handler repair.

- Fixes v6.143 blank-page regression caused by referencing missing global `onInput`.
- Removes the broken `onInput`/`onChange` wrapper.
- Adds delegated `input`/`change` listeners for Edit/Add modal fields.
- Keeps v6.143 first-pass local Edit/Add behavior.


## v6.145

Continue/Add recursion repair.

- Fixes v6.143/v6.144 stack overflow caused by a hoisted `renderNodeActions` override capturing itself.
- Removes the recursive `renderNodeActions` wrapper.
- Injects Edit buttons by wrapping `renderNodePost` instead.
- Continue now opens the Add artifact dialog with a continuation template for the selected node.
- Continue creates a local `.trace.md` draft only; it does not commit to Git.


## v6.146

Add/Edit semantics correction.

- Corrects the first Edit/Add pass semantics.
- Raw markdown Edit is now local-only:
  - local uploaded nodes
  - generated/draft nodes
  - local workspace files
- GitHub/committed remote nodes no longer show raw Edit by default.
- `Continue` remains an Add flow that creates a local continuation draft.
- `Reference` is now treated as an Add flow that creates a local reference draft.
- Future work can add:
  - schema-aware Add/Edit wizard forms
  - explicit advanced markdown edit mode for repair/debug
  - richer markdown editor component


## v6.147

Icon-only local Edit affordance.

- Keeps v6.146 Add/Edit semantics.
- Local-only Edit button is now icon-only.
- The accessible label and tooltip remain `Edit local markdown`.
- This keeps secondary edit behavior from forcing a new action row.


## v6.148

Compact icon node action row.

- Node action buttons are normalized to icon-only compact buttons after render.
- Button text is preserved as tooltip and accessible label.
- Edit/local markdown action is styled green.
- Remove/delete actions are styled red.
- The row remains wrap-capable but should fit substantially better on mobile and narrow cards.
- Destructive remove still relies on the existing confirmation flow.


## v6.149

Contextual Add/Edit markdown studio.

- Continue and Reference dialogs now identify their mode clearly.
- Continue shows a parent continuity-edge card.
- Reference shows a referenced-material card.
- Add/Edit use a markdown studio layout with:
  - textarea editor
  - formatting toolbar
  - live preview pane
- The markdown renderer is intentionally small and local: headings, lists, links, emphasis, quote, code, and separators.
- Layout is split editor/preview on desktop and stacked on mobile.
- Raw markdown remains the fallback authoring surface; schema-aware wizard forms remain future work.


## v6.150

Compact markdown/raw editor modes.

- Add/Edit markdown studio is more compact to reduce unnecessary modal scrolling.
- Added editor mode toggle:
  - Markdown: toolbar + preview
  - Raw: plain textarea, no preview
- Desktop layout keeps split editor/preview in Markdown mode.
- Mobile/narrow layout stacks and uses shorter preview height.
- This keeps the static/offline viewer dependency-free while preserving a path to a richer editor component later.


## v6.151

Raw/Rich markdown editor semantics.

- Renames the authoring modes conceptually to Raw/Rich.
- Rich mode is now editable, not a read-only preview.
- Rich mode uses a contenteditable surface and writes changes back to markdown state.
- Raw mode remains a plain markdown textarea.
- Markdown toolbar applies to the Rich surface when Rich is active, and to the textarea when Raw is active.
- The Rich-to-markdown conversion is intentionally small and supports common structures only.


## v6.152

Continue/Reference stack repair.

- Fixes stack overflow when clicking Continue or Reference after the Rich/Raw editor update.
- Removes the recursive v6.150 wrappers around `openContinuationAddModalV6145` and `openReferenceAddModalV6146`.
- Rich mode remains the default Add/Edit editor mode.
- Raw mode is still available inside the dialog.


## v6.153

Rich editor behavior and modal sizing repair.

- Rich toolbar actions now operate on the active contenteditable surface without forcing a re-render.
- Toolbar mouse-down preserves the Rich editor selection.
- Heading/quote/code toolbar actions apply block formatting instead of inserting raw markdown markers.
- Raw toolbar still inserts markdown snippets into the textarea.
- The editor surface now has a bounded height with internal scrolling.
- The Add/Edit dialog should no longer let the editor grow larger than the modal.


## v6.154

Add/Edit single-scroll layout.

- Removes the double-scroll feeling from Add/Edit authoring dialogs.
- The modal panel now uses a fixed flex layout.
- Header and footer stay outside the scrolling editor surface.
- Rich editor and Raw textarea scroll internally.
- The outer dialog body no longer scrolls during normal Add/Edit use.
- On short screens the relation card can collapse to preserve editor space.


## v6.155

Root-shaped Add/Continue/Reference templates.

- Add/Continue/Reference markdown templates now follow the Tiinex root envelope shape more closely.
- Templates now include:
  - `Envelope Schema`
  - nested `Parent` block for Continue
  - nested `Current` block
  - `Created At` with `YYYY-MM-DD hh:mm:ss`
  - root-shaped `Continuity Integrity` method entry
- Continue parent edges now emit `Parent Schema`, `Created At` when known, `Trace`, and recoverable `Origin` hints.
- Reference drafts remain independent local leaves and point at the selected artifact in the body.


## v6.156

Route/history selected lineage state.

- Browser history and Copy link now preserve selected lineage state.
- Route state now includes:
  - selected node id
  - selected path
  - selected title fallback
  - view mode: `lineage` or `discovery`
- Back/forward restore attempts to resolve selection by id, exact path, filename fallback, then title.
- If the selection is not yet loaded, the viewer keeps a pending selection instead of silently falling back to discovery.
- Static file `#view=` state and shareable `#state=` routes both receive the selected-lineage fields.


## v6.157

Restore workspace plus source flow.

- Fixes regression where the workspace plus button was redirected directly to `New markdown artifact`.
- Workspace plus now opens the source/material dialog again.
- New local artifact creation remains available as a secondary option from the source/material dialog.
- Continue and Reference still open contextual Add flows directly from node cards.


## v6.158

Tiinex artifact wizard and reference parent picker.

- Renames the source-dialog launcher from `New markdown artifact` to `New Tiinex artifact`.
- The launcher opens a wizard first, not the Raw/Rich editor directly.
- Human-authored schema options are exposed as cards:
  - Topic
  - Evidence
  - Feedback
  - Reduction
  - Task
  - Decision
  - Pointer
  - Lineage Upgrade Deferral
  - Workspace
  - Raw Tiinex Artifact
- Runtime/machine-oriented schemas are intentionally excluded from the human wizard.
- Continue opens the wizard with parent preselected.
- Reference enters parent-picker mode first.
- In parent-picker mode, node action rows collapse down to `Select as parent`.
- Selecting the same node as the reference target becomes a continuation shortcut.
- After schema/relation selection, the existing Raw/Rich editor remains the fallback content step.


## v6.159

Paged Tiinex artifact wizard.

- Splits the Tiinex artifact wizard into smaller pages:
  - Type
  - Details
  - Content editor
- Type selection advances to Details automatically to reduce mobile clicks.
- Details page can go back to Type.
- Content still opens the existing Rich/Raw editor as the final step.
- The wizard body is smaller and more mobile-friendly because only one step is visible at a time.
- Schema cards remain limited to human-authored artifact types.


## v6.160

Compact source-dialog Tiinex artifact action.

- Shrinks the `New Tiinex artifact` launcher in the source/material dialog.
- Keeps it as a secondary header action rather than a large call-to-action pill.
- Height is now closer to the close/header action control family.
- Mobile width and height are tightened.


## v6.161

Tiinex artifact as first Add choice only.

- Moves `New Tiinex artifact` out of the Add dialog header.
- Shows it as a normal Add choice card on the first Add screen.
- Removes it from Git source, Explicit URLs, Drag/drop, and other Add substeps.
- This prevents the artifact option from looking like a Done/Next button in source subflows.


## v6.162

Schema-grounded artifact wizard templates.

- Reworks generated Add/Continue/Reference markdown templates against the current Tiinex root and human-authored schema contracts in `Tiinex/docs`.
- Generated envelopes now use the conventional readable shape:
  - blank line after `# Continuity Context`
  - linked `Envelope Schema` when a relative schema path can be generated
  - nested `Parent` and `Current` blocks
  - root-shaped `Continuity Integrity` method entry
- Child/continuation integrity now points `Towards` the parent trace instead of defaulting to `self`.
- Schema-specific wizard bodies now follow the declared `Artifact Creation Contract` body shapes for:
  - Topic
  - Evidence
  - Feedback
  - Reduction
  - Task
  - Decision
  - Pointer
  - Lineage Upgrade Deferral
- Runtime/machine-oriented schemas remain hidden from the human authoring wizard.
- The final editor title now says `New Tiinex artifact`, not `New markdown artifact`.


## v6.163

Schema-aware low-friction artifact forms.

- Details step now uses schema-aware fields for known human-authored Tiinex artifact types.
- Known types no longer show a generic markdown body textarea in Details.
- Raw Tiinex Artifact still uses the raw markdown body textarea.
- The Content step still opens the shared Rich/Raw markdown editor as the final review/refinement surface.
- Generated markdown is assembled from small, schema-specific fields.
- This reduces cognitive load while preserving portable markdown output.


## v6.164

Evidence attachment collector.

- Evidence Details now behaves more like an evidence collector.
- The Details step focuses on:
  - supported claim
  - repeatable attachments
- Attachments currently support:
  - URL
  - local file
- Attachment cards include label, representation, notes, and limits.
- File attachments are preserved into the local workspace asset map when the evidence artifact is saved.
- Generated Evidence markdown builds Provenance, Evidence Material, and Interpretation Limits from the attachment list.
- Responsive layout:
  - desktop: attachment cards can use two columns
  - mobile: one column with larger touch-friendly actions


## v6.165

Compact Evidence collector and global drop target.

- Evidence Details is more compact to reduce internal scroll.
- Desktop layout places Supported Claim and Evidence Attachments side by side.
- Mobile layout remains single-column with touch-friendly Add URL / Add file buttons.
- While the Evidence step is open, dropping files anywhere on the dialog/window adds them as evidence attachments.
- Dragging files over the active Evidence dialog shows a global drop affordance.


## v6.166

Evidence Details polish.

- Tightens the Evidence Details step so the dialog better fits its content.
- Removes the extra helper line below the Evidence collector.
- Keeps claim and attachments side-by-side on desktop.
- Keeps mobile single-column behavior.
- Adds a small attachment count pill when attachments exist.
- Makes attachment actions shorter (`URL`, `File`) and easier to scan.
- Keeps global drag/drop support from v6.165.


## v6.167

Simplified Evidence attachments and draft wording cleanup.

- Evidence attachment cards now show only the useful defaults first:
  - URL for URL attachments
  - immutable file name for file attachments
  - Notes
- Label, Representation, and Limits are moved behind `More details`.
- File name is treated as file-derived metadata rather than something the user must re-enter.
- Representation is still preserved but treated as advanced metadata.
- Limits are auto-generated when the user does not provide explicit ones.
- New artifact summary wording no longer defaults to `Draft ... created in Tiinex Viewer.`


## v6.168

Evidence attachment metadata chips.

- File attachments no longer repeat the file name inside the card body.
- File-derived metadata is shown as compact chips near the attachment title:
  - file type / extension
  - size
  - image dimensions when available
- Image dimensions are read locally in the browser from the dropped/selected file.
- Metadata is also emitted into generated Evidence markdown when available.
- URL attachments still show the URL input because the URL is the user-authored target.


## v6.169

LLM orientation entrypoint.

- Adds `llms.txt` as a short model-facing entrypoint.
- Adds `tiinex.app.llm.v1.md` as a Tiinex-style app orientation document.
- Adds HTML discovery hints:
  - `link rel="help"` to `llms.txt`
  - `link rel="help"` to `tiinex.app.llm.v1.md`
  - `meta name="tiinex:llm-entrypoint"`
  - hidden `data-tiinex-llm-entrypoint` section
  - JSON-LD software/application description
- The orientation explains current app purpose, artifact semantics, Evidence UX, implementation cautions, and conservative source adapter principles.


## v6.170

Evidence representation becomes derived metadata.

- Removes editable `Representation` from Evidence attachment details.
- Shows representation as derived/read-only metadata instead.
- Adds representation as a metadata chip when available.
- Lets `Label` take the full advanced-details width.
- Keeps `Notes` as the primary human field.
- Keeps `Limits` available as advanced override.


## v6.171

Evidence image thumbnails and overlay preview.

- Image attachments now use a thumbnail in the same visual slot as the file icon.
- Clicking the thumbnail opens an in-app image preview overlay above the current dialog.
- The preview overlay uses the same local File object URL as the thumbnail.
- Preview shows attachment metadata chips when available.
- Escape closes the preview overlay.
- Non-image attachments keep the existing icon behavior.


## v6.172

Restore Discovery search filtering.

- Fixes a regression where Discovery search text updated but non-matching cards stayed visible.
- Restores search filtering after the display-options override.
- Keeps Display Options behavior:
  - leaves only
  - trace/schema/workspace visibility
  - schema filter
  - draft filter
- Applies the search filter last so typed queries hard-filter Discovery cards again.


## v6.173

Stabilize Tree search toolbar.

- Keeps the Tree expand/collapse control slot visible when search returns no folders.
- The disabled placeholder prevents the search box from jumping left/right as results appear or disappear.
- No behavior change when folders exist.


## v6.174

Dark themed native select controls.

- Styles native select controls and options to match the Tiinex dark theme.
- Applies to schema-aware wizard dropdowns such as Feedback Disposition and Decision State.
- Adds dark `color-scheme` hints to modal/wizard containers.
- Improves selected/hover/disabled option readability where the browser allows option styling.


## v6.175

Create directly from schema wizard Details.

- Known schema wizards no longer force the user through the final Rich/Raw markdown review step.
- Details footer now offers:
  - primary `Create artifact` / `Create continuation` / `Create reference`
  - secondary `Review markdown`
- Raw Tiinex Artifact still uses the markdown editor path.
- Direct create uses the same generated markdown template as the review path.
- Evidence direct create preserves file attachments as local workspace assets.


## v6.176

Repair local generated artifact indexing.

- Fixes local generated artifacts being indexed as legacy markdown.
- Root cause: local artifact save/upsert stored markdown in `text`, while the parser reads `content`.
- New local artifacts now store both `text` and `content`.
- Existing local/browser-state files with `text` but missing `content` are repaired before indexing.
- Direct schema wizard create should now produce modern schema-aware nodes immediately.


## v6.177

Schema-aware Edit for local known artifacts.

- Local editable artifacts with known Tiinex schemas now open the same schema-aware wizard used by Add.
- The old Rich/Raw markdown editor remains available through `Review markdown`.
- Unknown or legacy local markdown still falls back to the raw markdown editor.
- Save local edit regenerates the markdown from schema-aware fields and writes back to the same local artifact path.
- Existing Topic/Feedback/Reduction/Task/Decision/Pointer/Workspace fields are populated from the current markdown body where possible.


## v6.178

Trim body separator before integrity.

- Fixes schema-aware Edit fields receiving trailing `---` from the body/integrity separator.
- Parsed node body now strips standalone markdown separators before `# Continuity Integrity`.
- Edit field extraction also strips separators defensively.
- This prevents fields such as `Next artifacts` from being populated with `---`.
- Transform/schema migration is intentionally not implemented in this leaf.


## v6.179

Folder-scoped Add and unique root artifact paths.

- New root/local artifacts now receive a unique path automatically.
- If the target folder already has numeric trace filenames, creation picks the next numeric `.trace.md`.
- Otherwise creation uses the title slug and appends `-2`, `-3`, etc. when needed.
- Tree view folders now expose a small Add button.
- Root note also exposes an Add button for the workspace discovery root.
- Folder Add opens the regular schema wizard but scopes the generated path to that folder.


## v6.180

Export dialog v1.

- Workspace export now opens an Export dialog instead of immediately downloading generated files.
- Short export modes:
  - `All`
  - `Local`
  - `Sources`
- `Sources` mode can select one or more source groups.
- Assets can be included or excluded.
- Zip exports include:
  - selected markdown/files
  - optional preserved assets
  - `_tiinex/export.manifest.json`
  - `_tiinex/README.md`
- Duplicate output paths are disambiguated under `_sources/` or `_assets/`.
- Export no longer mutates the loaded workspace.


## v6.181

Export active-workspace helper fix.

- Adds a compatibility `getActiveWorkspace()` helper used by older/header export code paths.
- Fixes the console error `ReferenceError: getActiveWorkspace is not defined` when pressing Export.
- No Export dialog semantics changed from v6.180.


## v6.182

URL view-state scroll preservation.

- Adds feed/lineage scroll position to URL route state.
- Supports both `#state=` route links and static/local `#view=` links.
- Restores scroll after refresh, route restore, and browser history navigation.
- Debounces scroll updates with `history.replaceState` so scrolling does not spam history.
- Copy Link now captures the latest visible feed scroll before copying.
- Unsaved edit/modal form state is still not URLified.


## v6.183

Robust URL scroll lens and focus preservation.

- Captures scroll from both `.post-feed` and broader workspace scroll containers.
- Saves scroll immediately to a local fallback cache as well as URL route state.
- Restores scroll over several animation frames/timeouts so async source loading does not reset the viewport.
- Avoids URL writes while form/editor inputs are active.
- Attempts to restore focused inputs after a render when the same modal remains open.
- Copy Link captures current workspace scroll before copying.


## v6.184

Encrypted Tiinex export package.

- Adds optional password encryption to Export.
- Encrypted exports are downloaded as `.tiinex.enc.zip`.
- The encrypted package wraps the normal exported zip using:
  - PBKDF2-SHA256
  - AES-GCM-256
  - random salt
  - random IV
- Drag/drop import detects the Tiinex encrypted package magic header.
- Import prompts for the password, decrypts locally in the browser, then imports the inner zip.
- This is app-level Tiinex package encryption, not legacy OS-level ZIP encryption.


## v6.185

Archive format and password mode choices.

- Export now separates archive format from password mode.
- Archive choices:
  - `zip`
  - `tar`
  - `tar.gz`
- Password choices:
  - `None`
  - `Tiinex`
  - `Zip`
- Tiinex password mode wraps the selected archive using the app-level encrypted Tiinex package format.
- Zip password mode generates a traditional ZIP-password archive intended for compatibility with OS archive tools.
- The inner representation remains the same: user content rooted at `.topics/` when that is the source structure, with `_tiinex/` reserved for export metadata.


## v6.186

LICENSE / NOTICE document width polish.

- Policy/notice prose blocks now use the available modal width more consistently.
- Removes narrow text-column behavior inside large LICENSE and NOTICE dialogs.
- Keeps wrapping readable with `pre-wrap` and `overflow-wrap`.
- Does not change the underlying policy detection or export behavior.


## v6.187

Transparent encryption labels and Export header polish.

- Password mode labels now name the actual method:
  - `AES-GCM`
  - `ZipCrypto`
- Help text clarifies that AES-GCM mode uses PBKDF2-SHA256 + AES-GCM-256 inside a Tiinex package container.
- ZipCrypto is labeled as legacy ZIP compatibility, not as stronger encryption.
- Export modal header now has clearer icon/title separation and stronger visual hierarchy.


## v6.188

Visible assets and stable Discovery search width.

- Discovery toolbar search now keeps a fixed responsive width and right alignment.
- Imported non-lineage files can now be surfaced as Assets.
- Display Options includes `Show assets` (default off).
- Empty workspaces with hidden assets show a prompt to enable assets.
- Asset cards support:
  - Open/Preview for image and text-like assets
  - Download
  - Remove
- `Show assets` is carried in URL view-state for shareable lens behavior.


## v6.189

Fix Discovery toolbar overlap regression.

- Repairs v6.188 toolbar CSS that allowed search to overlap the Feed/Tree toggle.
- Feed/Tree mode controls now get a reserved left column.
- Search/tools use a reserved right column.
- On narrow widths, the toolbar stacks instead of overlapping.
- No behavior changes to search, tree, or asset visibility.


## v6.190

Stabilize Discovery search across Feed and Tree.

- Reserves the Tree expand/collapse icon slot in both Feed and Tree modes.
- Search now stays in the same horizontal position when switching Feed/Tree.
- CSS-only patch; no behavior changes.


## v6.191

Stabilize Discovery toolbar vertical alignment.

- Makes the Tree expand/collapse button and placeholder slot exactly match the Discovery search box height.
- Prevents vertical jumping when switching Feed and Tree.
- CSS-only patch; no behavior changes.


## v6.192

Responsive discovery loading and feed windowing.

- Repo discovery no longer re-renders the whole app every small batch by default.
- GitHub fetches still run in parallel, but UI render is deferred until final indexing unless batch rendering is explicitly enabled.
- Discovery feed renders a window of cards first instead of every matching card.
- Adds `Show more` for additional Discovery feed cards.
- Shows a lightweight loading notice while repo discovery is running.
- Keeps Tree mode full-structure for now.


## v6.193

Lightweight discovery progress bar.

- Replaces verbose loading copy with a compact progress bar.
- Progress updates imperatively in the DOM while GitHub files are fetched.
- Avoids re-rendering the whole workspace for every progress tick.
- Keeps final indexing as the remaining expensive phase.


## v6.194

Mobile logo and post action touch-target polish.

- Keeps the Tiinex mark visible in narrow/mobile layouts.
- Mobile post actions now use an equal-width grid across the card width.
- Mobile action buttons get larger, predictable touch targets.
- Desktop layout is intentionally left unchanged.


## v6.195

Feed Preview mode for referenced material / attachments.

- Adds a Feed-only Preview toggle in the toolbar icon slot.
- Preview mode hides cards without referenced material.
- Cards with material lift the referenced material panel into the feed card.
- Preview type filters are generated from actual material kinds in the loaded workspace.
- Preview state is carried in URL/view-state.


## v6.196

Multi-select Preview filters and Lineage preview.

- Preview attachment filters are now multi-select toggles.
- `All` resets Preview filters to show every material type.
- Preview toggle is available in Lineage mode too.
- In Lineage mode, Preview lifts material panels into cards without hiding ancestors/parents.
- Preview multi-select state is included in URL/view-state.


## v6.197

Compact Preview filter tray.

- Preview filters now show only selected material types by default.
- `Types` opens a compact multi-select tray.
- Selected type badges can be clicked to remove that type.
- `All` remains the reset/default state.
- The Preview bar is more compact on mobile.
- Mobile footer/powered-by chrome is visually reduced.


## v6.198

Mobile compact action strip.

- Mobile post actions are now forced into compact equal-width icon columns.
- Prevents each action from taking a full row in dense mobile feeds.
- Keeps touch targets reasonable while restoring reading space.
- Asset cards keep short labels because they have fewer actions.


## v6.199

Mobile action strip and scroll chrome compression.

- Mobile post actions now render as a compact horizontal icon strip instead of full-width rows.
- The action strip keeps equal flexible hit targets while using far less vertical space.
- On mobile, scrolling down compacts discovery chrome:
  - source tabs/drop hint
  - preview filter bar
  - discovery label chrome
- Scrolling up expands chrome again.
- Desktop remains unchanged.


## v6.200

Durable URL lens restore and scroll chase.

- URL/view-state now keeps a stronger selected-lineage descriptor:
  - selected node id
  - selected path
  - selected title
  - mode
- On refresh, the app retries selected lineage restore after index/render rather than silently falling back to Discovery.
- Scroll state is written on `pagehide` / `beforeunload`.
- Latest lens state is cached in session storage as a fallback.
- Scroll restoration now “chases” the target for a short window while async content grows.
- Copy Link persists the same durable lens state before copying.


## v6.201

Cancel stale scroll chase after user interaction.

- Prevents route scroll restore from continuing after the user starts scrolling/clicking.
- Applies cached lens state only once per load unless route/history restore is active.
- Discovery scroll restore now carries a discovery signature and is ignored when the list changed.
- Lineage scroll restore remains strong.
- Fixes the visible upward “jump” when expanding a card and immediately scrolling during the first seconds after opening a lineage.


## v6.202

History de-duplication for semantic lens state.

- Prevents duplicate browser Back steps when the same semantic lens is pushed twice.
- Ignores volatile scroll fields when deciding whether a route push is semantically new.
- Converts duplicate near-term `pushState` calls into `replaceState`.
- Keeps real navigation to another node/card as a browser history step.


## v6.203

Mobile app lens.

- Adds a mobile-only floating action button with workspace-level actions.
- Reduces mobile top chrome toward a one-line appbar.
- Replaces dense mobile per-card action strips with:
  - primary action
  - more action sheet
- Keeps desktop layout unchanged.
- Collapses expanded cards when entering/opening a lineage.
- Preview attachments filter now hides parent/origin-like lineage refs from attachment preview.
- Asset preview title fallback avoids showing `relative` as the main title when possible.


## v6.204

Mobile lens corrective pass.

- Fixes the mobile FAB by adding a direct delegated click handler for the appended FAB host.
- Maps FAB actions to existing app actions using stable mobile-specific action names.
- Adds a mobile logo fallback glyph so the brand mark is not just an empty orb.
- Adds viewport/user-scalable guard and touch double-tap prevention.
- Collapses expanded cards when browser Back/Forward changes the selected lens.


## v6.205

Mobile chrome compression pass.

- Makes the mobile global topbar a true one-row appbar.
- Adds a JS-installed brand fallback glyph on the actual orb/brand element.
- Hides workspace action/stat icon rows on mobile; these are now owned by the FAB.
- Compacts source pills and toolbar/search rows.
- Keeps content higher in the viewport.
- Footer is visually reduced and fixed at the bottom.


## v6.206

Mobile lens repair: functional action sheets and scroll-away chrome.

- Builds mobile node action sheets from known node actions instead of reading removed desktop buttons.
- Fixes per-card `⋯` actions so they show usable actions.
- Adds robust FAB action dispatch:
  - Create
  - Add source/material
  - Export
  - Copy link
  - Display
  - Help
- Header and workspace title chrome hide on mobile down-scroll and return on up-scroll/top.
- Mobile badges/chips are reduced to micro-size.


## v6.207

Mobile lens repair 2.

- FAB now uses a private `data-mobile-action` channel so older `data-action` handlers do not intercept it.
- Action sheets render real Font Awesome icons instead of class-name text.
- Action sheet actions dispatch through known node actions.
- Down-scroll reading mode now hides source rows, filters, search chrome, and preview filter chrome.
- Feed/Tree mode toggle is hoisted into the source row when possible.
- Mobile badges are sorted by importance and constrained to one row with `+N` overflow.


## v6.208

Source/mode row and mobile dialog polish.

- Source pills and Feed/Tree mode toggle are unified into one row when both exist.
- The mode toggle remains right-aligned.
- Mobile badges are slightly larger/readable while still kept to one row with `+N`.
- Mobile dialog surfaces get a generic compact pass:
  - better viewport width
  - smaller headers
  - sticky actions
  - one-column grids
  - reduced card padding
- The pass targets common modal/dialog class names across viewer generations.


## v6.209

Mobile simplification pass.

- Hides the source row on mobile when only one source is loaded.
- Keeps Feed/Tree in its normal toolbar instead of overworking source-row layout.
- Mobile badges now prioritize:
  - mismatch/missing
  - verified/out-of-date/open
  - refs/images/material
  - other badges behind `+N`
- Schema/source/date badges are pushed behind `+N` sooner.
- Wizard schema selection cards become compact icon + name rows on mobile.
- Wizard card descriptions and suffix boilerplate are hidden in mobile type menus.
- Parent/origin-like trace references are filtered harder from Preview/Referenced material.


## v6.210

Robust single-source mobile hiding.

- Single-source detection now uses workspace app-state instead of relying on DOM chip classes.
- Mobile source row is hidden when the workspace has only one loaded source.
- Keeps Feed/Tree in the normal toolbar so mode switching remains visible.


## v6.211

Mobile density correction:

- marks single-source workspaces with `single-source-state-v6211` using the same display-source counting path as the rendered source strip
- hides the actual `.workspace-source-strip` on mobile when a workspace has one visible source
- avoids the broad v6.210 source-row selectors by removing `single-source-state-v6210` during the v6.211 render pass
- re-compacts mobile card badges after render so source/date/schema chips fall behind the `+N` button before they can overflow the row


## v6.212

- Added a mobile top rail with icon-only workspace create, copy link, and workspace navigation around the Tiinex logo.
- Added a resilient mobile density pass for workspace/page transitions so single-source badges and low-signal schema/date badges stay behind the +N control after paging.
- Validation: node --check app.js. Browser/mobile visual validation still required.


## v6.213

- Refines mobile top rail spacing so create/copy sit beside the logo while workspace arrows stay at the rail edges.
- Replaces fixed-count mobile badge compaction with width-aware single-line packing.
- Keeps state/schema/date-first ordering on mobile and hides the badge +N button once expanded.
- Collapses expanded mobile badge rows on back/navigation-style actions.

## v6.214 Mobile rail and source row polish

- Corrected the mobile top-rail create button to open the same create-workspace flow as desktop, not the workspace add-material flow.
- Aligns mobile source chips with the Feed/Tree toggle in a single mobile-only source/mode row.
- Hides source chips when the mobile feed scrolls into compact reading mode while keeping Feed/Tree reachable.

### v6.215

Mobile polish pass for stable Feed/Tree placement, smaller visual controls, empty-workspace copy, and create-workspace modal sizing.


## v6.216

- Moves mobile Feed/Tree into the workspace title row to reclaim vertical space and prevent header-slot drift.
- Hides the search/filter toolbar for truly empty mobile workspaces and uses the empty-state card as the instruction surface.
- Trims the Create Workspace dialog into a more compact mobile form with smaller thumb-friendly actions.


## v6.217

- Adds an idempotent mobile empty-workspace hint pass to avoid mutation-observer churn after creating an empty workspace.
- Replaces the mobile create-workspace modal markup/CSS with a compact bottom-sheet style dialog.
- Keeps v6.216 Feed/Tree title-row placement and empty-workspace toolbar hiding unchanged.

## v6.218

- Hide the workspace source strip in desktop and mobile when the active workspace has only one source.
- Suppress the mobile FAB while Discovery Tree is active because tree rows already expose add actions.
- Replace the mobile Create Workspace dialog with a lower bottom-sheet form that keeps actions near the thumb area and reduces static text.


## v6.219

- Stabilized desktop legal/policy/notice badge slots during workspace indexing.
- Normalized the display-options action size against the other desktop workspace action buttons.
- Changed discovery tree folders to be collapsed by default unless explicitly opened by the user.
- Reworked the mobile create-workspace sheet with minimal copy and bottom-aligned same-row actions.

### v6.222

- Kept Sources before Traces in the workspace stat row.
- Reverted display options to the workspace action rail after the toolbar relocation produced a visible layout regression.

## v6.223

- Moves Display Options into the discovery/search tool row directly beside the existing toolbar controls instead of the workspace action rail.
- Keeps the Sources → Traces workspace-stat ordering.
- Aligns Tree view folder add buttons into a stable right-side column.
- Validation: `node --check app.js` passes.


## v6.224

- Nudges the tree root-level add button one pixel left so it visually aligns with folder-row add buttons.

### v6.225

- Aligns the Tree root add button with folder-row add buttons.
- Keeps Discovery and Lineage toolbar search controls from shifting when switching modes.

### v6.226

Toolbar correction pass: display options, preview/tree controls, and search now occupy explicit stable slots across Discovery, Tree, and Lineage modes so the search input does not collapse or jump.


## v6.228

- Stabilized mobile workspace title row height so Feed/Tree changes do not produce a visible 1px header hop.
- Normalized desktop card badge order to match the mobile-prioritized order after render: status, schema, date, material/reference, source.
- Preserved v6.227 toolbar and Tree plus alignment behavior.

## v6.229

- Locked the mobile workspace title/mode row to a fixed height to avoid 1px Feed/Tree toggle jumps.
- Hid the redundant green mobile primary card action while preserving the right-side More action position and size.


## v6.230

- Locks the mobile workspace title + Feed/Tree row to integer-pixel geometry to prevent the visible 1px jump when toggling Feed/Tree.

## v6.232

- Removed the mobile top rail `min-height` lock that caused a visible 1px Feed/Tree toggle jump on narrow/mobile layouts.
- Kept the v6.231 idempotent mobile DOM stabilization.


### v6.234
- Normalized Lineage toolbar geometry against Discovery toolbar geometry.
- Kept Lineage preview/search aligned with Discovery by reserving a spacer slot rather than moving Display Options into Lineage.
- Compacted mobile Lineage Back/Audit actions into icon-sized title-row controls.


## v6.235

- Normalized Lineage toolbar rhythm against Discovery after v6.234.
- Removed legacy pseudo-spacer now that the real Lineage spacer owns the reserved slot.
- Locked Back/Audit and Lineage search rail to the same 2rem control geometry.

## v6.236

- Equalized Discovery and Lineage desktop search rail widths so switching modes no longer makes the search input feel shorter or longer.
- Preserved the mobile full-width search rail behavior.

## v6.237

- Aligned mobile Lineage search rail with Discovery geometry.
- Restored readable Back/Audit labels in mobile Lineage title actions.
- Lineage Back button now attempts browser history back first, with clear-selection fallback.
- v6.238: Stabilized mobile Lineage entry from scrolled Discovery, preventing inherited compact chrome from hiding the search rail; tightened mobile Lineage toolbar padding/vertical alignment against Discovery.


### v6.241
- Ensured mobile card More is always present as a badge-row ellipsis control.
- Re-normalized mobile Lineage search rail to match Discovery geometry without reintroducing toolbar padding drift.

### v6.242

- Robust mobile card More injection from rendered DOM ids instead of assuming `ws.nodes` is an Array.
- Final high-specificity mobile Lineage/Discovery search-rail parity override.
- Preserves v6.231 DOM hot-loop guard and v6.233 top-rail stability.

## v6.244

- Hard-stops mobile badge-row More at window-capture before card click delegation can open lineage.
- Resolves the More chip by direct target, elementsFromPoint, or card-local hit-test.
- Opens the same mobile action sheet from workspace/node state.

## v6.245

- Fixes the mobile badge-row `...` action opening path.
- v6.244 correctly stopped the card click, but opening only on `click` could fail because the captured `pointerdown` preventDefault suppressed the follow-up click on mobile.
- The handler now opens on the first captured down/click event with duplicate suppression.

## v6.251

- Fixed mobile badge-row action sheet dispatch by handling sheet action buttons on first press before the older click-capture close path can swallow them.
- Runs core actions directly for Open, Markdown, Continue, Reference, Source, and Remove while preserving the compact ellipsis sheet.
- Validation: `node --check app.js` passed.


### v6.257

Mobile action sheet follow-up for Continue / Reference:

- fixes the root self-recursive `renderCreateModal` wrapper path that still produced `Maximum call stack size exceeded` when native mobile Continue/Reference dispatched;
- keeps the working native mobile `...` action sheet and Open/Markdown behavior;
- keeps create modal rendering inside the normal app modal flow so fields and generate actions remain wired.

Validation: `node --check app.js` passed.


## v6.259 compact create flow update

- Split legacy Continue/Reference create into explicit Type and Details steps.
- Kept Continue parent implicit; Reference still separates parent from reference target.
- Compacted mobile boilerplate so leaf-type choices and form inputs are reachable without scrolling past a full policy/relationship page.
- Added sticky footer actions and internal dialog scroll for mobile and desktop.
- Selection of a schema no longer jumps directly into the form; the user chooses type, then continues to details.
- Reduction remains out of this ordinary create flow pending a dedicated provenance-preserving reduction flow.

Validation: `node --check app.js` passes. Browser visual validation not run in this environment.

## v6.260 compact create routing fix

v6.260 makes the v6.259 compact create wizard apply to the actual active Continue/Reference modal shape. The previous build could fall back to the legacy one-page create dialog when the modal had `mode` but no `type`. Step and schema actions now normalize the modal as a create modal before rendering.

Validation: `node --check app.js` passed. Browser visual validation still required.

## v6.261 notes

v6.261 removes the active split between legacy Continue/Reference create dialogs and the newer artifact wizard. Continue and Reference should now route through the artifact wizard on desktop and mobile. The legacy create modal remains available for workspace and older fallback surfaces, but ordinary card Continue/Reference actions should no longer render it.

Mobile styling for the artifact wizard was tightened so the same canonical dialog can be made responsive instead of maintaining a separate mobile-only create flow.

### v6.263

Canonical create routing hardened after route-trace showed mobile Continue still produced the legacy `create-lineage-backdrop-v6257` DOM. Non-workspace create modal state is now normalized to the artifact wizard even when legacy state omits `mode`, and mobile action-sheet Continue/Reference are intercepted directly.
