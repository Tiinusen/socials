# CP333 validation notes

Validated after target-aware GitHub issue verification and mobile read/raw modal containment.

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

Manual checks:

1. Export a local draft using Update known issue and verify after updating the issue body.
2. Export a continuation comment and verify by matching comments.
3. Open Raw markdown and Schema read view on mobile; the close button must remain visible and content must not collapse into one-character columns.
4. Change a continuity parent in schema-aware edit, save, refresh, and confirm the parent edge still resolves or remains explicitly unresolved rather than disappearing.

# CP332 validation notes

Validated after GitHub target candidate discovery and mobile raw modal close fixes:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

Manual checks requested:

1. Open GitHub export for a local draft whose parent/original is a GitHub issue/comment discovery artifact. The target step should offer Create comment / Update known instead of defaulting to Create new when a target can be inferred.
2. Verify that hidden discovery findings remain hidden in the feed unless the user explicitly reveals them; using their GitHub issue as publication target must not change feed visibility.
3. Open Raw markdown on a long document in mobile/narrow width. The close button must remain visible/reachable.
4. Confirm repo zip shape remains replace-ready: root files present, no `.git`, no `.site-publish`, no `.nojekyll`, no `tiinex.bundle.js`.
