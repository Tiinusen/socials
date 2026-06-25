# Validation Notes

Package: v6-405 product CP120

## Purpose

CP120 is a wizard shell cleanup release after the CP119 browser-approved wizard registry baseline. It intentionally avoids new product concepts and preserves the current wizard flow. Its goal is to make the wizard and markdown fallback dialogs share a professional authoring shell before deeper flow redesign.

## Cleanup performed

- Added shared `authoring-dialog-*` shell classes for authoring modals.
- Applied the shared shell to the artifact wizard, Review Markdown/add-artifact fallback, and local markdown edit.
- Moved Review Markdown and local edit footers out of their scroll bodies so header, body, and actions have the same layout contract as the wizard.
- Reduced mobile header density with smaller kicker/title/lead spacing and clamped lead copy.
- Gave the scroll body explicit ownership of overflow so footer actions no longer behave like body content.
- Made mobile footer actions use a compact two-column grid, with primary actions spanning the row.
- Kept schema registry ownership from CP119 unchanged.

## Intentionally unchanged

- wizard step semantics and product flow
- schema registry contents
- create-intent semantics
- parent-picker semantics
- sibling naming
- raw markdown review/editor fallback behavior
- scroll restore
- Discovery auto-more
- mobile badge packing
- lineage traversal
- storage keys and browser persistence
- schema parsing
- i18n

## Readiness signals

The authoring-shell cleanup keeps product-readiness signals expected to remain green:

- architectureScaffoldReady: yes
- coreExtractionReady: yes
- serviceStateExtractionReady: yes
- uiFeatureExtractionReady: yes
- viewStateIsolationReady: yes
- publicBuildReady: yes
- cleanupReadyForProductWork: yes
- architectureReadyForProductWork: yes

## Static validation commands

Run from package root:

```bash
node --check app.js
for f in tools/*.mjs; do node --check "$f"; done
find src -type f \( -name '*.mjs' -o -name '*.js' \) -print0 | sort -z | xargs -0 -n1 node --check
npm test
npm run metrics
npm run storage:scan
npm run build:public
npm run public:check
node --check .site-publish/tiinex.bundle.js
```

## Browser validation focus

Because CP120 changes the dialog shell, browser validation should focus on visual and layout behavior:

- desktop Continue opens the wizard and can create a child artifact
- desktop Reference still asks for parent first, then opens the wizard
- mobile Continue opens the same wizard flow
- mobile Reference parent selection still uses the approved icon-only Select affordance
- wizard type step has more usable body space on mobile
- wizard details step has a compact header/footer and scrolls in the body
- Evidence still shows supported claim plus URL/File attachment collector
- Review Markdown uses the same header/body/footer shell and does not trap the footer inside the scroll body
- schema-aware local edit opens the wizard with fields prefilled
- quick sanity check that mobile badges and Discovery auto-more remain unchanged
