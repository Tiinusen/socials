# CP331 validation notes

Validated after mobile chrome reclaim and continuity-parent picker foundation:

- `node --check app.js`
- `npm run build:public`
- `npm run public:check`
- `node --check .site-publish/tiinex.bundle.js`
- `npm run metrics`
- `npm run storage:scan`

Manual checks requested:

1. On mobile, scroll down until chrome fades; content should reclaim the space instead of leaving an empty spacer.
2. Open a create/edit wizard and confirm Storage placement and Continuity parent appear as separate pre-content scopes.
3. Choose parent, cancel parent, and detach parent; the wizard should restore without changing storage folder unexpectedly.
4. Hidden/unresolved parent state should be shown as a relation state, not by forcing hidden discovery findings visible.
