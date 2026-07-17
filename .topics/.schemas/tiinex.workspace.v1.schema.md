# Continuity Context

- Envelope Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md)
- Parent
  - Parent Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md)
  - Created At: 2026-06-14 00:00:00
  - Trace: [tiinex.root.v1.schema.md](https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md)
  - Origin:
    - [browse + git](https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md)
- Current
  - Current Schema: [tiinex.workspace.v1](tiinex.workspace.v1.schema.md)
  - Created At: 2026-06-16 00:00:00
  - Why: Defines a portable multi-lineage workspace entrypoint schema as a descendant of the Tiinex root schema.
  - Summary: Schema for markdown-first Tiinex workspace artifacts.

---

# Tiinex Workspace v1 Schema

## Summary

Defines a markdown-first workspace format for a Tiinex-compatible viewer shell.

A `.workspace.md` artifact is a portable workspace entrypoint. It may set viewer identity, empty-stage behavior, workspace discovery roots, workspace entrypoints, repository transports, source policies, local-state behavior, export behavior, help, custom CSS, and residual machine state.

## Core Semantics

- The first body H1 after the continuity envelope is the workspace display name.
- `Current -> Current Schema` declares that the artifact is a workspace.
- Empty optional fields should be omitted.
- Missing optional sections or fields mean no opinion.
- Optional behavior fields may have viewer defaults.
- Omitted optional behavior fields mean use schema/viewer default, not disabled.
- Machine state may refine restoration, but it must not replace readable workspace declarations when markdown can express them.
- Raw JSON should be reserved for noisy, lossy, or inconvenient UI state.
- Empty-stage subtitle values should avoid terminal punctuation unless punctuation is intentional content.

## Display Name

Display name resolution order:

- first body H1 after the continuity envelope
- filename stem
- filename

`Display Name` should not be serialized as a normal workspace field.

## Recommended Workspace Sections

The body should prefer this order when sections are present:

- `# <display name>`
- `## Viewer Identity`
- `## Empty Stage`
- `## Host Defaults`
- `## Workspace Discovery`
- `## Workspace Entrypoints`
- `## Repository Mirrors`
- `## Repository Transports`
- `## Source Policy`
- `## Local Workspace State`
- `## Workspace Source Actions`
- `## Export Policy`
- `## Help`
- `## Custom CSS`
- `## Machine State`

A workspace may omit any optional section that has no signal to carry.

## Viewer Identity

Optional shell identity and presentation hints.

Recognized fields:

- `Label`
- `Home`
- `Icon`
- `Accent`
- `Theme`
- `Preferred Locale`
- `Schema Discovery Root`
- `Default Action`

Empty fields should be omitted.

## Empty Stage

Optional empty-stage text and behavior.

Recognized fields:

- `Subtitle`
- `Continuity Line`
- `Continuity Line Opacity`
- `Empty Drop Behavior`
- `Empty Copy Link Behavior`

Recommended viewer defaults:

- `Continuity Line`: `enabled`
- `Continuity Line Opacity`: `subtle`
- `Empty Drop Behavior`: `create-or-open-local-workspace`
- `Empty Copy Link Behavior`: `clean-url`

Default behavior fields should normally be omitted from serialized workspaces.

## Host Defaults

Optional host-side defaults for bootstrapping the app before URL state exists.

Recognized fields:

- `Default Workspace`
- `Default Workspace Behavior`
- `Default Workspace Query Param`
- `Default Workspace Hash Behavior`

Rules:

- Host defaults are app bootstrap hints.
- If the browser URL already contains explicit workspace/query/hash state, explicit URL state wins.
- Relative default workspace paths should resolve against the hosting page location.
- A static host may also provide these values through a small global script before the app loads.

## Workspace Discovery

Optional discovery roots for other `*.workspace.md` entrypoints.

Entries may be links with nested fields.

Recognized nested fields:

- `Kind`
- `Repository`
- `Ref`
- `Root Path`
- `Match`
- `Label`
- `Open Behavior`

## Workspace Entrypoints

Optional human-readable, machine-parseable workspace source declarations.

Each entrypoint should be a third-level heading under `## Workspace Entrypoints`.

Recognized fields:

- `Source Kind`
- `Repository`
- `Ref`
- `Root Path`
- `URL`
- `Label`
- `Open On Apply`
- `Default View`
- `Default Filter`
- `Default Search`
- `Selected Path`
- `Tree Root Label`
- `Preserve Existing Workspace`
- `If Already Open`

A viewer should open entrypoints where `Open On Apply` is omitted or affirmative.

## Repository Mirrors

Optional human-readable, machine-parseable declarations for repositories that should be published as co-hosted mirror snapshots beside the workspace viewer.

Each mirror should be a third-level heading under `## Repository Mirrors`.

Recognized fields:

- `Repository`
- `URL`
- `Enabled`

Rules:

- Repository mirror declarations are publication inputs for building `mirrors/<source-host>/<owner>/<repository>.json` and `.zip` outputs.
- `Repository` declares one exact repository identity. `owner/repo` means `github.com/owner/repo`; absolute Git repository URLs are also allowed.
- `URL` declares the clone URL used by the publisher. It should resolve to the same canonical repository identity as `Repository`.
- Missing `Enabled` means enabled.
- A repository mirror declaration is not a workspace entrypoint, not a runtime transport, and not provenance. It must not replace Canonical Origin, Parent, Origin, or source identity.
- The repository that contains the publisher is mirrored automatically and should not be repeated here.
- Older viewers may ignore this optional section without reinterpreting workspace sources.
- Deployment hosts may append additional mirrors through host configuration such as GitHub Actions repository variables. Those host-level additions are deployment settings, not workspace artifact content, and must not be serialized into the workspace unless they are intended to become portable defaults.

## Repository Transports

Optional ordered declarations for delivering repository material without changing its canonical source identity.

Each transport should be a third-level heading under `## Repository Transports`.

Viewers should try current-material `snapshot` transports before richer `git-proxy` transports. Declaration order is preference order among transports of the same kind.

Recognized fields:

- `Kind`
- `Repository`
- `Match`
- `Metadata`
- `Proxy`
- `Enabled`

Recognized kinds:

- `snapshot` — a published repository snapshot described by a small metadata document and delivered as an archive
- `git-proxy` — a browser Git transport proxy used for matching repositories

Rules:

- `Repository` declares one exact repository identity. `owner/repo` means `github.com/owner/repo`; absolute Git repository URLs are also allowed.
- `Match` declares a scoped repository pattern. A trailing `*` may match one or more repositories below the declared host or owner path.
- A `snapshot` entry requires `Metadata` and should normally use `Repository`.
- A `git-proxy` entry requires `Proxy` and requires either `Repository` or `Match`.
- Relative `Metadata` and `Proxy` values resolve against the workspace artifact location.
- Snapshot metadata owns the resolved commit, archive location, and checksum; the workspace should not duplicate those volatile values.
- A repository transport is a delivery path. It must not replace Canonical Origin, Parent, Origin, or repository identity.
- Runtime observations such as timeouts, cooldowns, health, cache keys, and credentials must not be serialized here.
- Missing `Enabled` means enabled.
- Older viewers may ignore this optional section without reinterpreting the workspace sources.

### Co-hosted mirror convention

A viewer may probe repository snapshots hosted beside the viewer before starting network Git.

For repository identity `<source-host>/<owner>/<repository>`, the public co-hosted metadata path is:

```text
./mirrors/<source-host>/<owner>/<repository>.json
```

The path resolves from the viewer application's effective base URL, not from the canonical repository URL and not from the current hash route. This keeps the same convention valid at an origin root, a project subpath, a custom domain, or `http://localhost`.

In a local/source checkout, a viewer may additionally probe:

```text
./.mirrors/<source-host>/<owner>/<repository>.json
```

The dot-directory form is local build input and must not become the assumed public path. It uses the same metadata-and-archive contract as `mirrors/`.

Rules:

- Explicit matching `snapshot` declarations precede convention-derived candidates.
- Warm browser-local Git precedes all remote or co-hosted probes unless the user explicitly requests refresh.
- In a local/source context, `.mirrors/` precedes `mirrors/`; in a published context only `mirrors/` is inferred.
- The probe is one metadata request per candidate. Viewers must not crawl directory indexes or guess unrelated hosts.
- A checked-out repository directory by itself is not a deterministic browser snapshot: without metadata/archive or user-granted folder access, a browser cannot safely enumerate arbitrary local files.
- A missing or unavailable conventional mirror is not a source-integrity failure. The viewer should continue to matching Git transports and then bounded material fallback.
- Relative resources in metadata resolve from the metadata document URL.
- The metadata and archive must satisfy repository identity, full commit, checksum, safe extraction, and source-boundary rules.
- `file://` runtimes may be unable to fetch local metadata because browsers isolate local files. Manual folder/zip import remains the no-server fallback; a local HTTP server may use both `.mirrors/` and `mirrors/` conventions.

## Source Policy

Optional behavior for source and integrity handling.

Recognized fields:

- `Missing Source Behavior`
- `Missing Integrity Behavior`
- `Integrity Mismatch Behavior`
- `Unknown Schema Behavior`
- `External URL Behavior`
- `Local File Behavior`
- `Workspace File Drop Behavior`
- `Trace File Drop Behavior`
- `Folder Drop Behavior`
- `Zip Drop Behavior`

Default policy values should normally be omitted from serialized workspaces.

## Local Workspace State

Optional behavior for named local browser state.

Recognized fields:

- `Local State Mode`
- `Default Offer`
- `Display Name Source`
- `Storage Key Mode`
- `Shared Across Tabs`
- `Auto Save`
- `Auto Save Delay`
- `Save Text Assets`
- `Save Binary Assets`
- `Binary Asset Strategy`
- `Empty State Entries`
- `Close Last Workspace Behavior`
- `Clear Local State Behavior`

Default local-state values should normally be omitted from serialized workspaces.

## Workspace Source Actions

Optional behavior for closing sources or removing workspaces.

Recognized fields:

- `Close Source`
- `Close Source Confirm`
- `Close Source Removes`
- `Close Source Keeps`
- `Close Source If Last Source`
- `Remove Workspace Confirm`
- `Remove Workspace Local State Effect`

Default source-action values should normally be omitted from serialized workspaces.

## Export Policy

Optional behavior for export surfaces.

Recognized fields:

- `Export Workspace Button`
- `Export Filename`
- `Export Format`
- `Export Includes Viewer Identity`
- `Export Includes Workspace Discovery`
- `Export Includes Workspace Entrypoints`
- `Export Includes Custom CSS`
- `Export Includes Machine State`
- `Export Includes Local-only Text`
- `Export Includes Binary Assets`
- `Local-only Omission Behavior`
- `Bundle Export`
- `Copy Link Includes Local State`
- `Copy Link Includes Shareable Workspace Sources`

Default export values should normally be omitted from serialized workspaces.

## Help

Optional human-readable markdown help for the active workspace lens.

Rules:

- If `## Help` exists, a viewer may show a help action.
- If `## Help` is absent, a viewer should omit the help action.
- Help content should be normal markdown.
- Help should orient the reader to this workspace, not replace schema documentation.
- Third-level headings may be rendered as collapsible scan-first sections.
- Markdown image syntax may be supported.
- Relative help links and images should resolve against the workspace artifact location when that location is known.

## Custom CSS

Optional fenced CSS block for viewer-local presentation.

CSS remains human-readable configuration and should appear before raw machine state.

## Machine State

Optional fenced JSON block for residual UI state.

This section should hold state that is useful for exact restoration but too noisy or awkward to keep as first-class markdown fields.

Machine State should not contain source declarations that can be expressed under `Workspace Entrypoints`.

## Schema Validation Contract

### Workspace Scope

Applies To

- artifacts whose `Current -> Current Schema` is `tiinex.workspace.v1`

Rules

- `tiinex.workspace.v1` identifies portable multi-lineage workspace entrypoints.
- A workspace is not a trace handoff unless another schema layer or parent relation makes it one.
- A workspace may participate in Tiinex continuity through the root envelope.

### Workspace Body

Required Shape

- first body H1 after the continuity envelope
- readable markdown body

Optional Sections

- Viewer Identity
- Empty Stage
- Host Defaults
- Workspace Discovery
- Workspace Entrypoints
- Repository Mirrors
- Repository Transports
- Source Policy
- Local Workspace State
- Workspace Source Actions
- Export Policy
- Help
- Custom CSS
- Machine State

Rules

- The first body H1 after the continuity envelope is the display name.
- Empty optional fields should be omitted.
- Missing optional sections or fields mean no opinion.
- Machine State must not replace readable Workspace Entrypoints, Repository Mirrors, or Repository Transports when markdown can express them.
- Snapshot transports precede Git-proxy transports; declaration order is preference order within each kind.
- Repository mirror declarations and repository transports must remain distinct from canonical source identity and continuity provenance.
- Subtitle values should avoid terminal punctuation unless punctuation is intentional content.
- Prose outside `Schema Validation Contract` may explain the schema, but it does not add required validation rules.

### Defaults

Rules

- Optional behavior fields may have viewer defaults.
- Omitted optional behavior fields mean use schema/viewer default, not disabled.
- Writers should omit default-valued optional behavior fields unless intentionally documenting defaults.

### File Naming

Allowed Shapes

- `*.workspace.md`

Rules

- Workspace artifacts use the `.workspace.md` suffix.
- The suffix identifies the artifact role, not the maximum capability.

---

# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: [tiinex.root.v1.schema.md](https://github.com/Tiinex/docs/blob/cca53fc8c52fd27b92b9429420efd613913a88bd/.topics/.schemas/tiinex.root.v1.schema.md)
  - Value: MB29XuzpMrwUc396COqKR2nVPX4E9gmUv0CS1zLYSKY
