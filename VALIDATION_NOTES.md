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
- snapshot metadata identity, full commit, archive checksum, and safe zip extraction;
- ordered Git-proxy selection with one active attempt, real abort, bounded total budget, and persisted cooldown;
- `Reset cache` clearing transport cooldown for the selected repository;
- canonical source identity remaining unchanged when a mirror or proxy supplies material;
- published root and submodule snapshots excluding `.git` and `.mirrors`;
- mirror publication selecting the remote default-branch HEAD rather than the superproject gitlink commit.
- omitted workspace refs accepting snapshot metadata refs and native Git following the remote default branch instead of assuming `master`;
- repo-material reads remaining local-object-store-only after snapshot completion: a missing branch ref may reuse the loaded resolved commit, but must never start another clone/fetch.

Useful browser diagnostics:

- `TiinexDiagnostics.repositoryTransportPlan('Tiinex/docs')`
- `TiinexDiagnostics.repositoryTransportHealth()`
- `TiinexDiagnostics.githubRepoFetchTraceJson()`
- `TiinexDiagnostics.gitNativeRawBridgeReport()`

