# Tiinex/site

Tiinex/site is the current static client-side viewer for Tiinex artifacts and workspaces.

Tiinex artifacts are Markdown files that keep provenance readable: where material came from, what changed, what it depends on, what limits apply, and what should not be inferred from it.

The viewer helps inspect, share, import, export, review, and continue working with those artifacts. It is one implementation of Tiinex, not the whole project.

## What This Repository Is

This repository contains the public site and reference viewer for portable Tiinex artifacts.

The app is a static frontend package. It renders artifact and workspace content in the browser, supports local continuation and review flows, and can expose source-backed links when the loaded material actually has a published source.

## What Tiinex Is

Tiinex keeps provenance readable in Markdown artifacts you own.

Provenance means the visible trail around material: where it came from, what changed, what it depends on, what limits apply, and what should not be inferred from it.

This repo is the viewer for that artifact ecosystem, not the whole definition of it.

## AI / LLM Boundary

AI and LLM workflows are important use cases and pressure tests for Tiinex.

They are not the identity boundary of Tiinex, and this site should not be described as a general-purpose AI runtime.

## Viewer Boundaries

- Local or draft material must not be guessed as GitHub source.
- Published or source-backed material may expose source links.
- Parent and Origin are separate relations and must not be collapsed.
- Workspace files are entrypoints when opened as workspaces, not ordinary leaves.
- Policy lookup should use the nearest `LINEAGE_POLICY.md` or `LINEAGE_LICENSE.md` when one is available in the loaded material.
- The app stays static and client-side; maintainer scripts are for packaging and validation, not runtime hosting logic.

## Stable Reading Order

- `tiinex.orientation.v1.md` explains Tiinex identity at the project level.
- `tiinex.context.v1.md` provides bounded self-contained context for this repo.
- `README.md` explains this repository for humans first.
- `tiinex.app.llm.v1.md` gives viewer/runtime-specific guidance.
- Git history is the implementation chronology; the orientation files above define the current repository identity.

## Public Surface

- `index.html` is the first-contact page for the public viewer.
- `app.js` and `src/` hold the client runtime.
- `styles.css` carries the site styling.
- `samples/` and `.topics/` provide portable artifacts and workspace material for testing and discovery.

## Adapter And Source Layout

Adapter-backed source material is stored as source surface material, not as canonical lineage authority by default.

For GitHub surfaces, new imports use hidden source folders so ordinary topic material and adapter material stay visibly separate:

- `.topics/.github/.issues/...` for GitHub issue bodies, comments, recovered artifacts, and issue attachments when available;
- `.topics/.github/.discussions/...` for future GitHub discussion bodies, comments, recovered artifacts, and discussion attachments when available.

Older `.topics/github-issues/...` paths remain readable for compatibility.

Adapter implementations should preserve external container, publication item, embedded Tiinex artifact, origin, parent, and attached assets as distinct concepts. When a selected export batch contains parent/child artifacts, the adapter should preserve that lineage segment as one publication transaction when the target supports nested items.

## Forking And Instance Customization

A fork can stay close to the canonical viewer while carrying its own lineage and presentation.

Keep viewer/runtime files close to upstream and place instance-owned material in bounded surfaces such as `.topics/`, workspace artifacts, local untracked `.mirrors/` worktrees, branding assets, and GitHub Actions variables. Avoid committing instance-specific custom domains or viewer source defaults when an environment variable can own them. Deleting or heavily rewriting shared runtime files makes future upstream syncs conflict-prone.

The publisher supports combinations: viewer plus lineage/static material plus mirrors, static lineage material plus mirrors, or mirrors only when no public static material is present. The publishing repository is always mirrored automatically. When no mirror variable, secret, manual input, or explicit compatibility flag is set, the publisher emits only the repository itself and excludes local `.mirrors/` build inputs from that snapshot. Forks can add instance-owned mirrors without modifying the repository by setting the GitHub Actions repository variable or secret `TIINEX_REPOSITORY_MIRRORS`; use one mirror per line, such as `Tiinusen/socials` or `github.com/example/repo = https://github.com/example/repo.git`. Workspace `## Repository Mirrors` and older `.gitmodules` mirror entries remain supported as opt-in compatibility inputs, but committed mirror submodules are source/build inputs and can make GitHub Pages' default Jekyll checkout recurse into stale or self-referential gitlinks. Remove unwanted mirror submodules through Git rather than deleting only their working folders, because `.gitmodules` and gitlinks are the actual declarations.

For a new fork:

1. Enable GitHub Actions in the fork.
2. Prefer GitHub Pages `Deploy from a branch` using `public` at `/ (root)`. The publish workflow updates that branch automatically on pushes to any non-`public` branch so a fork can publish the active working branch.
3. Set `TIINEX_PUBLISH_SOURCE_REF` only when an instance should publish one pinned branch instead of whichever branch was pushed.
4. Keep local `.mirrors/` worktrees untracked unless the fork intentionally owns Git submodules.
5. Add fork-specific mirrors through the `TIINEX_REPOSITORY_MIRRORS` repository variable or secret instead of editing upstream files.
6. Use `TIINEX_WORKSPACE_REPOSITORY_MIRRORS=true` only when the instance intentionally wants workspace-declared mirrors included in the published mirror set.
7. Use `TIINEX_PAGES_DEPLOY=true` only when the repository's `github-pages` environment allows direct Actions deployments from the chosen publish branch.
8. Preserve the repository `LICENSE` and applicable `NOTICE` attribution for inherited viewer code.

Optional repository variables:

- `TIINEX_PUBLISH_SOURCE_REF`: optional branch name to publish instead of whichever branch was pushed. For push events, only a push to the pinned branch updates `public`; pushes to other non-`public` branches exit cleanly without publishing. Manual runs can still use the `source_ref` input for a branch, tag, or commit.
- `TIINEX_REPOSITORY_MIRRORS`: newline-separated extra mirrors. Accepts `owner/repo`, `github.com/owner/repo`, `https://host/owner/repo.git`, or `identity = clone-url`. This may be a repository variable or secret.
- `TIINEX_WORKSPACE_REPOSITORY_MIRRORS`: set to `true` to include workspace `## Repository Mirrors` declarations. Omitted means disabled.
- `TIINEX_GITMODULES_REPOSITORY_MIRRORS`: set to `true` to include older `.gitmodules` mirror declarations. Omitted means disabled.
- `PAGES_CNAME`: custom domain to write into the deployed artifact. Source `CNAME` is ignored unless `TIINEX_USE_SOURCE_CNAME=true`, so forks do not inherit upstream domains by accident.
- `TIINEX_USE_SOURCE_CNAME`: optional source-CNAME mode for instances that intentionally want a committed `CNAME` copied into the deploy artifact.
- `TIINEX_PUBLIC_STATIC_PATHS`: optional newline/comma-separated allowlist for non-viewer static publication. Omitted means the workflow auto-copies common lineage/static roots such as `.topics`, `assets`, `samples`, and selected root markdown/assets when present.
- `TIINEX_VIEWER_TITLE`, `TIINEX_VIEWER_GIT_REPO`, `TIINEX_VIEWER_GIT_REF`, `TIINEX_VIEWER_GIT_ROOTS`: optional viewer build defaults. Omitted means the built viewer derives repository/ref defaults from the publishing repository and source ref.
- `TIINEX_WORKSPACE_POINTER_PRIMARY`, `TIINEX_WORKSPACE_POINTER_SECONDARY`, `TIINEX_WORKSPACE_POINTERS`: ordered GitHub issue pointers that the runtime resolves at page load. The issue body should declare `Workspace URL:` or `Workspace:` and may point to a GitHub blob/raw `.workspace.md`; the app then loads that workspace without GitHub Actions generating a workspace artifact.
- `TIINEX_DEFAULT_WORKSPACE`, `TIINEX_FALLBACK_WORKSPACE`, `TIINEX_WORKSPACE_FALLBACKS`, `TIINEX_LOCAL_WORKSPACE_PATH`: ordered direct workspace fallbacks. These become runtime workspace candidates, not a generated `.workspace.md` file.
- `TIINEX_PAGES_DEPLOY`: set to `true` to run official `actions/deploy-pages` deployment. Omitted means disabled; the `public` branch is still updated automatically.

## Development And Validation

Keep runtime behavior in the app code and public assets. Do not move behavior into docs-only files.

Validation commands for this repo:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

Repository tooling exposes these architecture readiness markers:

- `architectureScaffoldReady`
- `coreExtractionReady`
- `serviceStateExtractionReady`
- `uiFeatureExtractionReady`
- `viewStateIsolationReady`
- `publicBuildReady`
- `cleanupReadyForProductWork`
- `architectureReadyForProductWork`

## Current Implementation Status

Use the current source, validation output, and Git history for implementation status. Git owns change chronology, so do not add separate change-log files, release notes, or versioned implementation comments merely to duplicate commit history.
