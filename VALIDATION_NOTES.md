# Validation Notes

Use current command output and Git history as the validation record. This file documents stable expectations rather than point-in-time status.

Run the checks relevant to the changed surface. `npm test` is not the sole pass signal when known static-hygiene findings are unrelated to runtime behavior.


## v39 GitHub publication integrity refresh

Save/edit flows continue to seal authored artifacts with `sha256-base64url-c14n-v2`. GitHub browser publication now prepares the selected local draft payload before copy/open/verify, using the same effective markdown and local integrity finalizer as Save draft. This prevents a stale `file.content` snapshot from being posted inside the GitHub `Source Markdown` payload while the local card temporarily shows a refreshed footer.

Static validation guards that GitHub publication calls `prepareGithubExportIntegrityPayloads(modal, ws)` / `prepareGithubExportItemIntegrity(ws, item)` and that export integrity refresh prefers `file.text` / `githubExportEffectiveMarkdown(file, node)` over stale `file.content`. Old valid v1 claims remain readable; local save replaces refreshable authored claims with v2.

## v37 workspace issue pointer runtime fallback

Workspace issue pointers must use the same GitHub issue material fallback stack as ordinary issue imports. Runtime startup must not depend only on `api.github.com` for configured workspace issues; it should try public reader/web-readable issue surfaces, then REST, then cached material before falling back to the embedded default workspace.

Static validation guards that `resolveWorkspaceIssuePointer` uses `fetchWorkspacePointerIssueThread` and does not directly call `fetchGitHubJson(spec.apiIssueUrl)`.

## v35 package validation repair

The v34 runtime changes were valid, but the distributed zip had stale `VALIDATION_NOTES.md` content that omitted static architecture-readiness markers required by `tools/validate-static.mjs`. v35 republishes the same runtime/editor UX surface with the readiness markers present in the packaged source.

Architecture readiness markers used by repository tooling:

- architectureScaffoldReady
- coreExtractionReady
- serviceStateExtractionReady
- uiFeatureExtractionReady
- viewStateIsolationReady
- publicBuildReady
- cleanupReadyForProductWork
- architectureReadyForProductWork

Repository transport validation should cover:

- workspace-relative snapshot metadata resolution and repository scope matching;
- co-hosted mirror derivation from the viewer base, with explicit snapshots first, locally served `.mirrors/` metadata/archive support, public `mirrors/` support, no directory crawling, and no false `file://` fetchability;
- warm browser-local Git being checked before any remote mirror metadata request, while explicit hard refresh bypasses that preflight;
- conventional mirror misses remaining quiet and falling through to Git without changing canonical source identity;
- progress-aware snapshot archive transfer so a healthy large zip is not rejected by a fixed short wall-clock timeout;
- snapshot metadata identity, full commit, archive checksum, and safe zip extraction;
- ordered Git-proxy selection with one active attempt, real abort, bounded total budget, and persisted cooldown;
- progress-aware Git network policy: bounded response start, idle and sustained low-throughput detection, with network timers ending when the response body completes;
- local Git pack processing and file indexing never being classified as proxy timeout or transport cooldown;
- the first automatic cooldown being one minute so failed transports can be retested without hiding them for an entire development session;
- `Reset cache` clearing transport cooldown for the selected repository;
- canonical source identity remaining unchanged when a mirror or proxy supplies material;
- published root and submodule snapshots excluding `.git` and `.mirrors`;
- the publishing repository always producing its own root mirror even when `.mirrors`, `.gitmodules`, viewer source, or Node tooling is absent;
- workspace-owned `## Repository Mirrors` declarations providing default mirror sources without forcing source branches to carry Git submodule gitlinks or sidecar JSON;
- GitHub Actions `TIINEX_REPOSITORY_MIRRORS` configuration appending fork-owned mirrors without editing upstream workspace artifacts;
- official GitHub Pages Actions artifact deployment while still publishing an inspectable `public` branch;
- copyable workflow mode detection: viewer repositories build the app before mirrors, static lineage repositories publish their public material before mirrors, and mirror-only repositories still publish a root mirror without viewer-specific commands;
- ordinary submodules outside `.mirrors` being ignored rather than making mirror publication fail;
- mirror metadata, checksum, zip integrity, and directory/archive file parity being validated before publication;
- forks not inheriting the source repository's custom-domain `CNAME` unless `PAGES_CNAME` or `TIINEX_USE_SOURCE_CNAME=true` is explicitly configured;
- mirror publication selecting the remote default-branch HEAD rather than the superproject gitlink commit;
- fork source branches avoiding committed mirror gitlinks that GitHub Pages default checkout would recurse into before publish sanitization.
- omitted workspace refs accepting snapshot metadata refs and native Git following the remote default branch instead of assuming `master`;
- repo-material reads remaining local-object-store-only after snapshot completion: a missing branch ref may reuse the loaded resolved commit, but must never start another clone/fetch.

Useful browser diagnostics:

- `TiinexDiagnostics.repositoryTransportPlan('Tiinex/docs')`
- `TiinexDiagnostics.repositoryTransportHealth()`
- `TiinexDiagnostics.githubRepoFetchTraceJson()`
- `TiinexDiagnostics.gitNativeRawBridgeReport()`

## Repository transport decision visibility

The selected repository material path remains visible after discovery in the existing source strip. The compact indicator distinguishes `local Git`, `local mirror`, `site mirror`, `Git proxy`, and `GitHub raw` without adding a new desktop or mobile panel.

Warm persistent Git reuse is recorded as `local-git`; it does not report a fresh proxy success when no repository network operation occurred. `TiinexDiagnostics.repositoryTransportDecisionReport()` exposes the selected material path, resolved commit, canonical origin, candidate plan, and source boundary for regression review.


- Fork-safe mirror publication ignores self-referential mirror declarations because the root repository is already published, and sanitizes root-level `.gitmodules`/`.mirrors` from the deploy artifact.

- Fork-safe mirror publication defaults to publishing only the repository itself when no mirror variable/secret/manual input is configured; workspace and `.gitmodules` mirrors are explicit opt-ins, and direct GitHub Pages deployment can be disabled with `TIINEX_PAGES_DEPLOY=branch-only` while the inspectable `public` branch remains available.

- Fork-safe branch publication now runs on pushes to any non-`public` branch by default, while `TIINEX_PUBLISH_SOURCE_REF` can pin publication to one configured source ref and skip other branch pushes without changing `public`.

- Repo-agnostic publication builds viewer identity, default Git source, CNAME, and optional static roots from GitHub Actions variables or repository facts rather than hardcoded Tiinex/site defaults.
- Viewer-like repositories fail fast when required build tooling is partially missing, so a broken viewer branch cannot silently replace the public app with mirror-only output.

## V8 workspace bootstrap candidate chain

- Build-time workspace variables are projected into `window.TiinexWorkspace.candidates`, not into a generic env blob and not into a generated `.workspace.md` artifact.
- Runtime tries candidates in order: query pointers, query direct workspace URLs, configured runtime candidates, direct runtime workspaces, and packaged local workspace fallbacks.
- GitHub issue pointers are transport/config sources only. The issue body must point to a real workspace artifact using `Workspace URL:` or `Workspace:`; the app resolves that pointer at runtime and logs candidate-level diagnostics.

## V9 repo-agnostic viewer validation

- Viewer builds no longer require `.topics/.workspaces/viewer.workspace.md` when runtime workspace candidates or issue pointers own bootstrap.
- `npm test` must pass for a viewer branch that has app/tooling files but no packaged `.topics` workspace, provided workspace bootstrap can be supplied by runtime candidates such as `TIINEX_WORKSPACE_POINTER_PRIMARY`.
- Optional publish roots such as `.topics`, `assets`, and `favicon.ico` are copied when present, but their absence must not make the public build checker fail; `samples/` is not a default root.

## V10 Actions-first publication and instance branch policy

- Direct GitHub Pages Actions deployment is the default when not explicitly disabled, and the workflow still publishes the same `.site-publish` artifact to `public` as an inspectable fallback/audit branch.
- `public` never triggers the publisher.
- `Tiinex/site` auto-publishes only the canonical source ref, default `master`, unless `TIINEX_PUBLISH_SOURCE_REF` overrides the source ref.
- Forks and non-canonical instances publish the canonical source ref only when it is the only non-`public` branch; once a working branch exists, pushes to the canonical branch are skipped and pushes to working branches publish those branches.
- `TIINEX_CANONICAL_SOURCE_REF` lets repos use `main` or another upstream-sync branch name without changing workflow code.
- Redirect-only public folders such as `discord/` should be generated from `TIINEX_PUBLIC_REDIRECTS` instead of being committed as source material.
- `samples/` is no longer part of the repository root or default public-copy contract.
- README quick-start guidance should describe fork setup, working branch naming, repo variables, ChatGPT review pass, and Copilot review pass without making instance-specific config part of source.

## v18 single-workflow Pages deployment

The publish workflow now updates the inspectable `public` branch, uploads the same `.site-publish` directory as the GitHub Pages artifact, and deploys it through a downstream `deploy-pages` job in the same workflow file. This removes the repository-dispatch handoff and makes push-triggered publication fully automatic while preserving `public` as the audit branch. Instance repositories that publish from working branches such as `personal` should allow those branches in the `github-pages` environment, or use no deployment-branch restriction.

## V14/V15 Workspace Save Findings

- The header Save Workspace path proved too custom even after export was split out. Workspace files need to be visible artifacts in the active flow, not a hidden runtime context or a side export lane.
- Saved workspace leaves must remain normal local artifacts (`local` source, `.workspace.md` validation, local state persistence, selected local node), so canceling a later export cannot mark the save itself as exported or published.
- GitHub issue previews for workspace artifacts should show human-facing workspace sections and keep technical restore state/source caches inside the collapsed Tiinex source payload.

## V16 workspace artifacts use normal create/edit

- The header `Save workspace` action is removed.
- `tiinex.workspace.v1` is available in the ordinary artifact wizard, so new workspace files use the same draft/export/publish path as other artifacts.
- Workspace cards remain special in presentation: their Edit form summarizes the active workspace set and offers `Update with current`, which stages the current workspace/viewer state into the selected `.workspace.md` without exporting.
- `Save local draft` is the persistence boundary. Export/download/GitHub publication remains a separate explicit action.

## V17 workspace export ownership repair

- Restored the workspace shell export button to the canonical export adapter flow.
- Workspace artifact creation/editing remains owned by Create/Edit card flows; the old save-artifact dialog is not used by the shell export action.
- Added a static guard so `saveWorkspace()` cannot regress to opening the workspace artifact save dialog.

## v19 workspace edit continuity polish

- Workspace artifact editor now exposes a Summary field so the card subtitle and GitHub presentation are user-authored instead of falling back to the generated "Portable workspace export..." line.
- Saving a workspace artifact updates the Continuity Context Summary while preserving normal local draft behavior; export/publish remains a separate action.

## V27 GitHub payload and workspace help cleanup

- GitHub Source Markdown recovery now treats the Source Markdown section as the authority and unwraps its outer fence greedily. This preserves `.workspace.md` payloads that contain nested `json`/`css` fences, including older issue bodies published with a triple-fence wrapper.
- GitHub outbound single-artifact payloads now prefer the current file text/local draft markdown before stale `content` fields, so newly saved artifacts publish the same bytes that the user sees locally.
- Workspace Help/FAQ is sanitized as human-facing help. Leaked workspace entrypoint/source field blocks are kept under Workspace Entrypoints, not rendered as FAQ items.

## V36 hosted workspace bootstrap fallback

- Hosted GitHub Pages deployments must not rely on dot-prefixed workspace paths such as `.topics/.workspaces/viewer.workspace.md` being fetchable at runtime. Even when `.nojekyll` and the public branch contain the files, public serving can still return 404 for dot-paths.
- Runtime/query workspace candidates still own startup when provided, but if no external candidate exists, the embedded default workspace is the portable hosted default.
- If runtime candidates fail and the user did not provide an explicit workspace query, startup falls back to the embedded workspace instead of leaving the viewer on an empty stage.
