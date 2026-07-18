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
- `.topics/` may provide packaged workspace or lineage material when this repository chooses to carry it. Samples and redirect-only routes should not be committed just to support the public deployment; publish-time variables can project those surfaces when needed.

## Adapter And Source Layout

Adapter-backed source material is stored as source surface material, not as canonical lineage authority by default.

For GitHub surfaces, new imports use hidden source folders so ordinary topic material and adapter material stay visibly separate:

- `.topics/.github/.issues/...` for GitHub issue bodies, comments, recovered artifacts, and issue attachments when available;
- `.topics/.github/.discussions/...` for future GitHub discussion bodies, comments, recovered artifacts, and discussion attachments when available.

Older `.topics/github-issues/...` paths remain readable for compatibility.

Adapter implementations should preserve external container, publication item, embedded Tiinex artifact, origin, parent, and attached assets as distinct concepts. When a selected export batch contains parent/child artifacts, the adapter should preserve that lineage segment as one publication transaction when the target supports nested items.

## Workspace Artifacts And Export

Workspace files are ordinary Tiinex draft artifacts in the local source. Create a new `tiinex.workspace.v1` through **Create → New Tiinex artifact → Workspace**, or edit an existing workspace card with **Edit**. The header no longer has a separate Save Workspace path.

A workspace card's editor can stage the current viewer/workspace set with **Update with current**. Nothing is exported or published at that point; **Save local draft** persists the `.workspace.md` through the same local draft path as other artifacts. The workspace shell export button remains the normal Export adapter for download or GitHub publication.

GitHub issue publication should keep a clean reader-facing summary with the full Tiinex source payload collapsed below it, matching the issue-body pattern used by Tiinex/docs issue roots.

## Forking And Instance Customization

A fork can stay close to the canonical viewer while carrying its own lineage, domain, mirrors, and workspace pointers. Keep `master` or `main` clean as the upstream-sync branch. Use a working branch such as `personal`, `workbench`, `site`, or another instance-specific name for local/public changes.

The publisher supports combinations rather than separate modes:

- viewer app plus static lineage material plus mirrors;
- static lineage material plus mirrors;
- mirrors only when no public static material is present.

The publishing repository is always mirrored automatically. Local `.mirrors/` inputs and root-level `.gitmodules` never belong in the public deploy root. Extra mirrors should usually be configured through GitHub Actions variables rather than committed as submodules.

### Quick Start: Forked Instance

1. Fork this repository.
2. Keep `master`/`main` aligned with `Tiinex/site`.
3. Create a working branch for your instance, for example `personal`, `workbench`, or `site`.
4. Enable GitHub Actions.
5. In **Settings → Pages**, prefer **Source: GitHub Actions** for first-class Pages deployment. The workflow still force-publishes an inspectable `public` branch as an audit surface. The `github-pages` environment must allow the source branch that runs the workflow, or use no deployment-branch restriction for fork/instance repositories. The workflow updates `public` first, then deploys the same `.site-publish` artifact in a second job inside the same workflow run.
6. Add repository variables for instance-specific config, for example `PAGES_CNAME` and `TIINEX_WORKSPACE_POINTER_PRIMARY`.
7. Push the working branch. If this is a fork with more than one non-`public` branch, pushes to `master` are skipped unless explicitly pinned; pushes to the working branch publish that branch.

### Publish Source Selection

Default behavior is intentionally conservative around upstream-sync branches:

- `Tiinex/site` auto-publishes only `master` unless `TIINEX_PUBLISH_SOURCE_REF` overrides it.
- Other repositories publish `master` only when `master` is the only non-`public` branch.
- If a fork has other non-`public` branches, `master` is treated as upstream-sync material and skipped; the pushed working branch publishes instead.
- `public` never triggers publish.
- `TIINEX_PUBLISH_SOURCE_REF=<branch>` pins publication to one configured source ref and skips other branch pushes cleanly.
- `TIINEX_CANONICAL_SOURCE_REF` may rename the canonical upstream-sync branch when a repo uses `main` instead of `master`.

Recommended fork branch names describe the instance or role, for example `personal`, `workbench`, `site`, `socials`, or `staging`. Avoid `forked`; it describes the relationship, not the role.

### Pages Deployment

The publish workflow builds `.site-publish`, force-publishes the same artifact to the inspectable `public` branch, uploads that exact artifact for GitHub Pages, and deploys it through `actions/deploy-pages` in the same workflow file. The deployment job waits for the public branch publication job, so the branch remains the audit surface for what was deployed.

Because Pages deployment happens in the same workflow run that was triggered by the source branch, repositories that publish from instance branches such as `personal` should let the `github-pages` environment allow that branch, or use no deployment-branch restriction. `Tiinex/site` can keep the environment restricted to `master` because only `master` auto-publishes there. Set `TIINEX_PAGES_DEPLOY=branch-only` or `false` when a repository is still using branch-source Pages or does not want Actions deployment.

### Repository Variables

Use repository variables for public instance config. Use secrets only when values truly need secrecy; public site config and public mirror names usually do not.

- `PAGES_CNAME`: custom domain written to `.site-publish/CNAME`. Source `CNAME` is ignored unless `TIINEX_USE_SOURCE_CNAME=true`, so forks do not inherit upstream domains by accident.
- `TIINEX_USE_SOURCE_CNAME`: copy a committed source `CNAME` only when explicitly wanted.
- `TIINEX_PUBLISH_SOURCE_REF`: optional pinned publish branch/ref.
- `TIINEX_CANONICAL_SOURCE_REF`: canonical upstream-sync branch, default `master`.
- `TIINEX_REPOSITORY_MIRRORS`: newline-separated extra mirrors. Accepts `owner/repo`, `github.com/owner/repo`, `https://host/owner/repo.git`, or `identity = clone-url`.
- `TIINEX_WORKSPACE_REPOSITORY_MIRRORS`: set to `true` to include workspace `## Repository Mirrors` declarations. Omitted means disabled.
- `TIINEX_GITMODULES_REPOSITORY_MIRRORS`: set to `true` to include older `.gitmodules` mirror declarations. Omitted means disabled.
- `TIINEX_PUBLIC_STATIC_PATHS`: optional newline/comma-separated allowlist for non-viewer static publication. Omitted means common lineage/static roots are copied when present.
- `TIINEX_PUBLIC_REDIRECTS`: newline-separated redirect folders to generate at publish time, for example `discord = https://discord.gg/example`. This avoids committing route-only redirect directories.
- `TIINEX_VIEWER_TITLE`, `TIINEX_VIEWER_GIT_REPO`, `TIINEX_VIEWER_GIT_REF`, `TIINEX_VIEWER_GIT_ROOTS`: optional viewer build defaults. Omitted means the built viewer derives repository/ref defaults from the publishing repository and source ref.
- `TIINEX_WORKSPACE_POINTER_PRIMARY`, `TIINEX_WORKSPACE_POINTER_SECONDARY`, `TIINEX_WORKSPACE_POINTERS`: ordered GitHub issue pointers that the runtime resolves at page load. The issue body should declare `Workspace URL:` or `Workspace:` and may point to a GitHub blob/raw `.workspace.md`.
- `TIINEX_DEFAULT_WORKSPACE`, `TIINEX_FALLBACK_WORKSPACE`, `TIINEX_WORKSPACE_FALLBACKS`, `TIINEX_LOCAL_WORKSPACE_PATH`: ordered direct workspace fallbacks. These become runtime workspace candidates, not a generated `.workspace.md` file.
- Hosted startup treats the embedded workspace as the portable default when no runtime/query candidate owns startup. Do not depend on `.topics/.workspaces/viewer.workspace.md` being publicly fetchable on GitHub Pages; dot-prefixed paths may 404 even when they exist in the publish artifact.
- `TIINEX_PAGES_DEPLOY`: defaults to GitHub Pages Actions deployment via repository dispatch after the inspectable `public` branch is updated. Set to `branch-only`, `false`, `no`, `off`, or `0` to keep only the public branch update.
- `TIINEX_ISSUE_SNAPSHOTS`: defaults to `true`. During site publish, the workflow exports public GitHub issues/comments from the publishing repository into `issues/github.com/<owner>/<repo>/` so hosted viewers read same-origin issue material before live GitHub.
- `TIINEX_ISSUE_SNAPSHOT_REPOSITORIES`: optional newline/comma-separated `owner/repo` list for additional public issue snapshots. Omitted means the publishing repository only.
- `TIINEX_ISSUE_PUBLISH_GRACE_SECONDS`: issue/comment event debounce, capped at 120 seconds. After the wait, the workflow reconciles all configured issue snapshots, so burst events do not lose intermediate changes.

Snapshot reads are same-origin and revalidated on load. The viewer tries both root-hosted and repository-prefixed Pages layouts before considering live GitHub, so issue snapshots can be deployed beside custom-domain and project-page viewers without turning visitors into GitHub crawlers.
- `TIINEX_ISSUE_SNAPSHOT_MAX_ISSUES`, `TIINEX_ISSUE_SNAPSHOT_MAX_COMMENTS_PER_ISSUE`: optional safety bounds for unusually large repositories.

### Tiinex/site Suggested Variables

```text
PAGES_CNAME=tiinex.dev
TIINEX_PUBLISH_SOURCE_REF=master
TIINEX_WORKSPACE_POINTER_PRIMARY=https://github.com/Tiinex/site/issues/<workspace-pointer-issue>
TIINEX_REPOSITORY_MIRRORS=
Tiinex/docs
Tiinex/ai-provenance
```

### Tiinusen/socials Suggested Variables

```text
PAGES_CNAME=tiinusen.com
TIINEX_WORKSPACE_POINTER_PRIMARY=https://github.com/Tiinusen/socials/issues/1
```

Add `TIINEX_PUBLISH_SOURCE_REF=personal` or another chosen branch name only when that instance should publish one branch and ignore pushes to other branches.

### Issue Workspace Pointer Format

Issue body example:

```md
## Tiinex Workspace Pointer

- Workspace URL: https://github.com/Tiinusen/socials/blob/personal/.topics/.workspaces/viewer.workspace.md
```

The issue is a pointer/config source. The workspace file remains the Tiinex artifact. GitHub Actions should not generate a `.workspace.md` just because an environment variable exists.

### Iterating With ChatGPT Web

1. Upload the current source zip and any screenshots/log excerpts.
2. State the intended invariant, not only the symptom.
3. Ask for a new merge-ready zip.
4. Apply the zip to the branch being tested.
5. Run the validation commands below and capture browser/workflow evidence.
6. Feed the result back with the latest zip if another pass is needed.

### Iterating With GitHub Copilot

1. Work on the instance branch, not the upstream-sync branch.
2. Ask Copilot for the smallest change that preserves the publish/runtime invariants above.
3. Require it to update validation when the behavior can regress.
4. Run the validation commands below before committing.
5. Keep public config in repository variables instead of committing instance-specific source files.

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

### Workspace artifact editing note

Workspace entrypoints are normal Tiinex artifacts. Use Create → Workspace to create one, or open an existing workspace artifact and choose Edit. The editor can stage the current workspace set with **Update with current**, but it only persists when **Save local draft** is clicked. Export and GitHub publishing remain the normal Export flow. The workspace Summary is user-authored and is what readers see first in cards and GitHub issue previews.

### Verified publication and refresh behavior

After a GitHub issue or issue comment is verified, Tiinex keeps a small local publication receipt. On refresh, the receipt lets the viewer distinguish the verified source artifact from its older browser-local editing shadow. The local shadow is removed only when the imported source carries the same v2 self seal; a newer unpublished edit remains local.

Public builds attach the commit-derived build id to local CSS, bundle, icon, and logo URLs. When a new build identity loads, remote/runtime caches are invalidated while local drafts and named local workspace state are preserved.
