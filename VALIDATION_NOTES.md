# Validation Notes

## v34 workspace config editor UX polish

Changes:

- Removed the duplicated “Exclude containing workspace” checkbox from the workspace config summary.
- Replaced it with one compact Update-scope control owned by the footer/action area.
- Reordered the editor body so Identity fields appear first.
- Added mobile-specific layout rules for the workspace config editor:
  - compact header copy,
  - hidden diagnostic summary clutter,
  - two-column action grid when room allows,
  - one-column fallback on very narrow screens,
  - sticky compact action area.

Validation run:

```text
node --check app.js                         OK
node --check tools/validate-static.mjs      OK
npm test                                    OK
npm run build:public                        OK
npm run public:check                        OK
node --check .site-publish/tiinex.bundle.js OK
npm run metrics                             OK
npm run storage:scan                        OK
```

Browser golden-flow was not run in this sandbox.
