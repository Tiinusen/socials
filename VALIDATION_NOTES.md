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
