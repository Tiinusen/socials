# CP332 — GitHub target parent binding + raw modal close

CP332 keeps publication target selection grounded when a local draft is attached to a source-backed or hidden discovery/original artifact. GitHub export now scans the local draft, its continuity parent chain, original-source shadow artifacts, and GitHub issue-style storage paths before falling back to a new issue target.

This pass does not force hidden discovery findings back into the visible feed. Hidden or unresolved parent/original artifacts remain relation state; export may still use their GitHub target as a publication container when that target can be inferred from source URLs, stored markdown, or path shape.

Mobile raw markdown/detail modals also keep their close affordance visible on long documents by giving the modal header an explicit close-button slot and allowing long paths/titles/source lines to wrap on narrow screens.

Validation signal: `node --check app.js`, `npm run build:public`, `npm run public:check`, `node --check .site-publish/tiinex.bundle.js`, `npm run metrics`, and `npm run storage:scan`.
