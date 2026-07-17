# Validation Notes

Use current command output and Git history as the validation record. This file documents stable expectations rather than point-in-time status.

Run the checks relevant to the changed surface. `npm test` is not the sole pass signal when known static-hygiene findings are unrelated to runtime behavior.

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
- copyable workflow mode detection: viewer repositories build the app before mirrors, while lineage-only repositories publish mirrors without viewer-specific commands;
- ordinary submodules outside `.mirrors` being ignored rather than making mirror publication fail;
- mirror metadata, checksum, zip integrity, and directory/archive file parity being validated before publication;
- forks not inheriting the source repository's custom-domain `CNAME` unless `PAGES_CNAME` is explicitly configured;
- mirror publication selecting the remote default-branch HEAD rather than the superproject gitlink commit.
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
