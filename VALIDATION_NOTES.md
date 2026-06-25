# Validation Notes

Package: v6-388 product CP103

Scope:
- CP100 preserves the CP98 routeScroll restore cleanup and the CP99 Discovery auto-more behavior.
- It polishes lineage terminal icon spacing so terminal status icons do not visually merge with text.
- It packages the app from the app root instead of through an internal working-directory wrapper.
- It preserves the working routeScroll restore implementation from CP97.
- It keeps retired anchor-scroll runtime helpers removed and leaves only stale-cache pruning for `tiinex.scroll.anchor.*`.
- It keeps the CP95 flight recorder as explicit opt-in via `tiinex.debug.scrollFlight` / `?debugScrollFlight=1`.

Readiness signals preserved:
- architectureScaffoldReady
- coreExtractionReady
- serviceStateExtractionReady
- uiFeatureExtractionReady
- viewStateIsolationReady
- publicBuildReady
- cleanupReadyForProductWork
- architectureReadyForProductWork
- singleOwnerRestoreReady
- stableCompletionRestoreReady
- discoveryAutoMoreRestoreReady

Cleanup details:
- Removed dead `chaseAnchorScrollForWorkspace`, `restoreAnchorScrollForAll`, `scheduleAnchorScrollRestore`, and related anchor-scroll read/write/apply helpers.
- Kept `pruneAnchorScrollStorage()` to clear stale retired sessionStorage entries.
- Kept routeScroll diagnostics behind `tiinex.debug.scrollRestore`.
- Moved the heavier full-flight diagnostics to `tiinex.debug.scrollFlight`.
- Added metrics/static guard for scroll cleanup readiness.

Validation run:
- node --check app.js
- node --check tools/*.mjs
- node --check src/**/*.mjs and src/**/*.js
- npm test
- npm run metrics
- npm run storage:scan
- npm run build:public
- npm run public:check
- node --check .site-publish/tiinex.bundle.js

Result: PASS

Browser validation focus for CP100:
- Discovery auto-more still loads before the Show more footer becomes the normal stopping point.
- Discovery F5 restore remains unchanged after auto-more has loaded extra cards.
- Lineage scroll/F5 remains unchanged.
- Lineage root terminal icon and text have visible spacing on desktop and mobile.
- Zip opens with app files at the archive root, not inside an internal wrapper folder.

## CP101 Lineage terminal spacing polish

- Fixed lineage terminal row spacing by restoring flex layout after the lineage feed block-level sizing rule.
- Keeps the terminal icon and text as separate visual items with a stable gap.
- No lineage traversal, restore, Discovery auto-more, storage, or view-state logic changed.
- Zip root remains app-root direct, without an internal workspace wrapper directory.



## CP102 unified node actions polish

- Moves node card actions into one shared descriptor list used by desktop cards and the mobile action sheet.
- Desktop node action rows stay on one horizontal row; local Edit and Remove become compact tail icons to avoid wrapping.
- Mobile action sheets now expose the same artifact action count as desktop, including More/Less or Anchor, Edit, and disabled Continue when applicable.
- Mobile action sheet header uses a compact close button and a single title column that can wrap naturally.
- No lineage traversal, scroll restore, Discovery auto-more, storage, or schema parsing logic changed.


## CP103 mobile action sheet toggle cleanup

- Removes the card expand/collapse More/Less action from the mobile action sheet because mobile cards already expose that behavior through the card tap target.
- Keeps desktop node action rows unchanged.
- Keeps lineage Anchor actions in the mobile sheet; only the redundant mobile expand/collapse action is filtered.
- No lineage traversal, scroll restore, Discovery auto-more, storage, or schema parsing logic changed.
