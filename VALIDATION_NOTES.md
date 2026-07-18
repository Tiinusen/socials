# Validation Notes

Use current command output and Git history as the validation record. This file documents stable expectations rather than point-in-time status.

Run the checks relevant to the changed surface. `npm test` is not the sole pass signal when known static-hygiene findings are unrelated to runtime behavior.


## v44 Hosted issue snapshot freshness and path resolution

Hosted issue snapshots are now resolved through mirror-convention same-origin locations rooted at `/issues/github.com/<owner>/<repo>.json`, with a slash-preserving repository directory for `issues/<number>/...` files. Snapshot metadata, manifests, issue bodies, and comments use `cache: no-cache` and bypass Tiinex runtime memory caching so a new public-branch issue snapshot can be observed on a normal reload without requiring users to press Reset cache. This keeps public viewers snapshot-first while avoiding stale local transport state and avoiding automatic live GitHub fallback during startup.

## v42 Hosted issue snapshots and abuse-safe issue transport

Hosted public viewers must prefer same-origin issue snapshots before live GitHub issue reads. The publish workflow now materializes public issue bodies and comments under `issues/github.com/<owner>/<repo>/` during normal site publication. Issue and issue-comment events run a debounced issues-only public-branch update; after the bounded grace period the workflow reconciles the full configured snapshot set, so burst interactions collapse without dropping intermediate issue changes.

The browser transport is cache/snapshot-first. Shared anonymous readers remain explicit opt-in recovery, not an automatic startup fan-out. Static validation guards the hosted snapshot adapter, the one-shape reader fallback, provider-level abuse circuit breaker, issue-event workflow, and `issues:snapshot` publication script.


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

The selected material path remains visible after discovery in the existing source strip. The compact indicator now uses transport tiers: `mirror` for co-hosted snapshots, `proxy` for live source transport, and `cache` for browser-local cached material. Clicking `mirror` or `cache` asks for the next live source level instead of silently staying stale.

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

## Verified GitHub publication reconciliation

- A successful GitHub verification records a bounded browser-local publication receipt containing the published target, v2 self seal, artifact identity, local draft identity, and verification time. It does not store a second artifact payload.
- Source import and local-state restore remove a pre-publication local shadow only when the exact imported GitHub artifact carries the same v2 self seal as the receipt.
- Local edits created after the verification time remain unpublished local material and are not removed by receipt reconciliation.
- GitHub reader fallbacks that alter embedded Source Markdown bytes are rejected when their declared v2 self seal no longer validates. The adapter continues toward an exact source path instead of caching normalized bytes as authoritative material.
- Source-backed integrity checks prefer exact recovered source markdown. Local/draft checks continue to validate current editable text.

## Intentional non-publish workflow runs

- Workflow concurrency is scoped by repository and ref so a push to an upstream-sync branch cannot cancel a valid working-branch deployment.
- A branch that is intentionally not a publish source completes through a successful `Publish not required` step. No public branch or Pages mutation is attempted.

## v49 transport tier ownership

- Transport badge clicks now pass the selected tier through the single GitHub source loader into both repository-file discovery and issue-thread imports. `mirror → proxy` bypasses hosted repository/issue snapshots, and `proxy → direct` uses the explicit direct/raw fallback path.
- Source/discovery configuration remains user-owned. Tier changes refresh material using the saved source config, but they do not enable broad issue discovery or rewrite configured Issue/Discussion URLs.
- App release cache-busting no longer erases durable GitHub issue-thread cache entries. App assets are busted by build ids; source-material freshness is surfaced through transport badges and explicit refresh tiers.

## v50 source transport unification

- Transport tiers are owned by a single policy object passed through the GitHub source loader, repository discovery, issue-list discovery, and issue-thread imports.

## v51 cache-first startup and strict tier clicks

- Route-owned/startup GitHub source loading is cache-first again: warm durable source cache can render immediately, and the same policy falls through to the co-hosted mirror only when cache cannot satisfy the source material. Embedded route/share state is not treated as source cache.
- Transport order remains `cache -> mirror -> proxy -> direct`.
- User-initiated `mirror`, `proxy`, and `direct` clicks no longer silently demote failed issue imports back to stale cache; the requested tier either supplies material or reports unavailable, so the next badge click continues forward instead of jumping back to `cache`.
- `mirror` is mirror-only. If the hosted repository/issue snapshot is unavailable, startup does not silently fall through to live GitHub/API/proxy.
- `proxy` bypasses hosted mirrors and may use the configured live/proxy source transport. It does not silently invoke the direct/raw fallback.
- `direct` is the explicit last-resort raw/reader fallback. It is user-initiated only.
- Source/discovery configuration remains user-owned during all transport refreshes. The loader snapshots and restores repo/ref/root paths, enabled surfaces, and configured Issue/Discussion URLs.

## v52 cache-source-material correction

- Cache tier now restores a complete GitHub source-material snapshot keyed by the source config signature, not just route/share state, issue-thread cache, or warm local Git preflight.
- Successful mirror/proxy/direct loads write the same text artifact set back to durable browser cache so a following reload can render the same bounded cards before network refresh.
- Warm local Git preflight is opt-in only; it must not satisfy the user-facing cache tier because it can be repo-file-only and miss configured issue material.
- Cache miss falls forward to mirror under the same source config and without broad discovery when the Issue Discovery surface is disabled.

## v53 cache transport material parity

- Browser source-material cache is accepted only when it can satisfy the configured source surfaces. For configured GitHub issue URLs, a one-card/placeholder cache is treated as incomplete and falls forward to the hosted mirror instead of presenting a partial cache view.
- Cache restore rehydrates configured issue targets from the durable GitHub issue-thread cache before indexing. This makes cache use the same issue-thread materialization path as mirror/proxy/direct, including recovered embedded artifacts and comments.
- `browser-cache` is now a first-class transport kind in repository and issue badge presentation. It renders as `cache`, not a generic transport/proxy badge, so the user-facing order remains `cache -> mirror -> proxy -> direct`.
- Incomplete material is not written back as source-material cache. Failed/unavailable issue placeholders can remain visible for the current attempt, but they no longer poison the next release/reload as a durable cache hit.

## v54 strict transport presentation and Time Portal restore

- Starting a GitHub source load clears stale repository/issue transport presentation for that source before new material is applied. Cache restores force both repository and configured issue surfaces to present as `cache`, even if the cached issue thread was originally observed through proxy or direct. This prevents stale `direct`/`proxy` badges from leaking into cache mode.
- The workspace transport strip now keys off the active requested tier for the current source load when that tier has material/presentation. Moving `cache -> mirror -> proxy -> direct` replaces the previous tier badge instead of accumulating stale lower-tier badges.
- Time Portal display options restored from a route/share link schedule the historical source snapshot path after view-state hydration. Cached commit observations can load the source snapshot without opening a modal; otherwise the workspace is marked as needing a concrete ref while the display filter still applies to loaded issue/comment observations.
- Historical source snapshot loads explicitly use the direct/raw-capable transport path for repository files and continue to filter issue/comment material by timestamp, because issue snapshots are observations rather than Git tree contents.

## v55 Time Portal cache boundary

- Time Portal route/share restore is cache-first and network-silent. If the exact historical source-material cache is present, it restores the commit-pinned repo-file view from browser cache. If it is absent during route-owned startup, the app records `needs-direct` and surfaces cache-unavailable instead of silently issuing raw GitHub/jsDelivr requests while the badge says `cache`.
- Time Portal direct refresh now uses already-known seeded artifact paths before any external flat/tree listing. The broad Tiinex/docs schema freshness supplement is not injected into historical route restore, which prevents a route load from expanding into hundreds of root/schema raw reads.
- Commit-pinned raw file reads use the exact historical immutable-file cache (`readExactHistoricalFile`) before the network and write successful direct reads back to both immutable-file cache and bounded source-material cache. Repeating the same Time Portal view should therefore use cache, not fresh raw GETs.


## v56 Time Portal transport boundary

- Time Portal no longer claims the normal latest-state `cache` or `mirror` tiers. Cache/mirror requests for a commit-pinned historical source snapshot are promoted to `proxy`, and `direct` remains the explicit last-resort raw fallback tier.
- Proxy Time Portal loads bypass hosted repository mirrors and attempt the configured Git/proxy transport for the historical commit. If no historical repo material is returned, the snapshot is marked failed/unavailable instead of showing a loaded state for a partial tree.
- Direct Time Portal loads may use GitHub tree/raw fallback, but commit-pinned file reads must pass through `readExactHistoricalFile`; deferred or budget-suppressed exact reads no longer fall through to generic raw `fetchText`.
- Tiinex/docs schema/root freshness supplements are disabled for historical snapshot path discovery. Time Portal must not expand a route restore into unrelated root/schema raw probes.

## v57 cache freshness and Time Portal resolver adjustment

- Public rebuild/release identity now invalidates durable GitHub source-material caches and issue-thread caches. Local/draft workspaces and publication receipts remain outside this invalidation boundary.
- Source-material cache entries carry the release key and are also treated as stale after the configured source-material cache TTL, defaulting to two hours. Stale or release-mismatched cache falls forward to mirror through the existing transport policy instead of showing stale workspace-only material.
- Time Portal explicit ref/URL resolver now uses the direct historical transport. The modal already asks for a concrete tree/commit/SHA and says the snapshot loads directly; this keeps the UI contract aligned with the transport that currently owns full historical raw reads.

## v58 Time Portal direct/proxy recovery and mobile workspace action

- Time Portal badge refresh is intercepted before the generic source loader when an end-bound historical snapshot is active. The existing commit/tree ref is reused for the next transport tier, so clicking transport badges no longer creates parallel GitHub sources or reloads the same workspace through the latest-state path.
- Time Portal path discovery uses static flat manifests with `noApi` for commit-pinned snapshots. It no longer calls the GitHub tree API from the browser while the resolver dialog promises No API.
- Historical `proxy` can read commit-pinned files through the static jsDelivr file surface after the static flat manifest resolves paths. Historical `direct` remains the explicit raw fallback and uses `readExactHistoricalFile` against immutable raw URLs.
- Explicit Time Portal direct loads raise the exact-historical per-origin read budget and clear stale local cooldown from prior suppressed attempts. This restores full-tree direct loads without returning to automatic startup raw bursts.
- Workspace artifact cards now expose the Open workspace action as an early blue icon-only action. The later duplicate labeled Open action was removed so mobile prioritizes opening the workspace over editing it.

## v59 workspace card desktop/mobile action parity

- Desktop workspace artifact cards restore the labeled blue Open action next to the layer icon. The action uses the same `open-workspace-artifact` behavior as before v58 and keeps Edit as the separate green authoring action.
- Mobile workspace artifact rails swap the visible green Edit slot for the blue Open workspace icon. Edit remains available in the More sheet, so mobile prioritizes opening workspace entrypoints without removing the authoring path.
- The change is presentation/order only. It does not modify Time Portal, transport selection, source settings, or workspace open/merge semantics.

## v60 Time Portal historical resolver recovery

- The Time Portal concrete-ref resolver is proxy-first again. Pasting a tree URL, commit URL, or SHA first attempts the configured Git/proxy transport, then automatically retries the same historical commit through direct/raw fallback if the proxy returns no repo material.
- Direct Time Portal loads may use the GitHub tree listing to recover the full historical path set before immutable raw file reads. Cache/mirror remain excluded from historical Git-state ownership.
- The resolver dialog copy now matches the runtime: proxy first, direct/raw fallback if needed. It no longer claims a strict No API boundary while the direct fallback may need the tree listing.
- Desktop workspace cards keep the labeled blue Open action; mobile workspace rails prioritize only the blue Open icon and leave Edit in the More sheet.

## v61 workspace card desktop action order correction

- Desktop workspace artifact cards restore the pre-mobile-polish order: Edit remains the green authoring action, Continue and Reference are compact icon-only lineage actions, and the labeled blue Open action sits before labeled Merge at the tail of the row.
- Mobile workspace artifact cards keep the v60 behavior: the visible primary rail surfaces Open workspace as a blue icon-only action and leaves Edit in the More sheet.
- Static validation now guards both contracts so desktop and mobile workspace action ordering can evolve independently without regressing the other artifact card layouts.

## v62 workspace Open browser history boundary

- User-facing workspace Open/Merge actions now own browser history as navigation. They suppress internal workspace-state `replaceState` and prewarm writes during the import, then push one final route entry for the opened workspace set.
- This preserves mobile swipe/back behavior after opening a workspace card from the first browser entry. Back should return to the previous workspace/card list instead of leaving or closing the browser tab.
- Existing route restore/popstate behavior is unchanged: browser Back still restores the previous route state rather than re-running source discovery when matching workspaces already exist.

## v63 Time Portal resolver join and publish-run cache boundary

- Historical Time Portal source loads now join an existing in-flight repo discovery for the same repo/ref/root instead of starting a duplicate loader or reporting failure while the original load continues in the background.
- The Time Portal concrete-ref modal closes when historical repo material has actually landed, even if an earlier proxy/direct attempt had already written a transient unavailable status.
- Public build cache-busting uses the publish run identity (`GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`, or build time locally) in the build id and release cache key. A public rebuild that republishes mirrors or issue snapshots from the same source commit is therefore still a cache boundary for source-material caches.


## v64 issue fallback and single-leaf route polish

- Configured GitHub issue targets may fall forward from hosted issue snapshot (`mirror`) to the GitHub API (`proxy`) when the repository/file mirror is already usable but the issue mirror has not been deployed for that source. The fallback is issue-surface-only and does not change the selected repository-file transport or source configuration.
- Broad issue discovery remains bounded by the configured source toggle and limits. The mirror-miss proxy fallback is applied to explicit issue/social targets, not as a new startup crawler path.
- After a workspace/source load completes, a discovery result that contains exactly one visible leaf is promoted to Lineage view with a route replace. The decision happens only after loading/progress is complete, ignores resolved adapter wrapper shells and target-only gaps, and does not push extra history.

## v65 open-tab public build identity and issue publication coalescing

- Public builds now emit `tiinex.build.json` with a publication identity separate from the bundled app identity. Open tabs poll this small identity file on startup/focus/interval, invalidate durable source-material caches when the public content identity changes, and reload once so updated mirrors/issue snapshots are observed without the user pressing F5. Local/draft workspaces and publication receipts stay out of that invalidation boundary.
- Issue/comment workflow publication is rate-limited and coalescing rather than trailing-edge debounce. Public branch updates are serialized with `cancel-in-progress: false`; the issue job reads `.tiinex/issue-publish-state.json`, publishes immediately when the cooldown has elapsed, otherwise waits only the remaining cooldown, then reconciles the latest full issue snapshot state.
- Issue publication diagnostics now log `last_published`, `cooldown_remaining`, `pending_generation`, `snapshot_generation`, and `follow-up required`. The durable state is written back to the public artifact after each full/issue snapshot publication.

## v66 - GitHub export close verification

- Guided GitHub export close now attempts a bounded verify/bind when the user has already copied and opened a known target.
- A verified close finalizes the routine, binds the publication URL locally, and prunes matching local draft shadows.
- A failed close-verify keeps the modal open once; a second close within 30 seconds intentionally abandons the routine and leaves the draft local/recoverable.
- Post-export refresh now avoids broad discovery when the verified publication snapshot was already bound locally, reducing stale source churn.


## v67 portable static/issue publisher and post-publication live verification

- The publish workflow treats `.github/workflows` plus `tools/` as portable publisher tooling, not as partial viewer app markers. Content/docs repositories can copy the workflow and tools to publish static lineage material, repository mirrors, and hosted issue snapshots without carrying `app.js`, `index.html`, or `package.json` from the viewer repo.
- Issue snapshot, public identity, and issue publication state steps now run the Node tools directly when package scripts are unavailable. Viewer repos keep using the normal app build path; non-viewer repos use the static/mirror path.
- Guided GitHub export verification and post-export rediscovery bypass cache and hosted mirrors. They read GitHub via the live proxy/API tier first and may fall to direct reader/raw fallback when needed, because freshly published GitHub issue/comment material cannot be verified against stale cache or mirror snapshots.

- GitHub-backed repository mirrors now try the viewer-owned mirror first and then a single source-owned default GitHub Pages mirror candidate, such as `https://tiinex.github.io/docs/mirrors/github.com/Tiinex/docs.json`, before proxy/direct transport. Non-GitHub sources are not given a guessed Pages candidate.
- Hosted issue snapshots use the same bounded mirror ordering: viewer-owned `/issues/github.com/<owner>/<repo>.json` first, then the source repository's default GitHub Pages issue snapshot when the source is GitHub-backed.


## v68 cross-repo mirrors and gentle public identity checks

- GitHub-backed repository mirrors now resolve in a bounded order: explicit/configured transports, viewer-owned co-hosted mirrors, then a single source-repository default GitHub Pages mirror such as `https://tiinex.github.io/docs/mirrors/github.com/Tiinex/docs.json`. Non-GitHub sources do not get a guessed Pages mirror.
- Hosted issue snapshots use the same source-owned Pages fallback after the viewer-owned issue snapshot path, so a content repo can publish its own issues without forcing the viewer repo to carry every issue mirror.
- Public build identity checks no longer use unique `?check=Date.now()` no-store requests or a default minute interval. They use the stable `/tiinex.build.json` URL with browser revalidation, check once on startup and on focus/visibility only after a conservative TTL, and allow interval polling only as explicit opt-in.

## v69 freshest hosted issue mirror selection

- Hosted issue snapshot resolution no longer stops at the first successful mirror metadata response. It probes the bounded candidate set (viewer-owned mirror, then source-owned GitHub Pages mirror for GitHub-backed sources), compares `sourceUpdatedAt`/`generatedAt`, and selects the freshest valid metadata.
- The selected mirror is cached only after freshness selection. This prevents a stale viewer-owned issue mirror from masking a newer source-repository Pages issue snapshot.
- Thread imports and issue-list discovery share the same metadata selector, so mirror transport produces the same latest issue state for configured issue targets and bounded discovery without enabling proxy/direct or broad discovery.
