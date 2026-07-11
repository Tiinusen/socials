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
