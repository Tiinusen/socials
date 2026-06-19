# Continuity Context

- Envelope Schema: tiinex.root.v1
- Current
  - Current Schema: tiinex.topic.v1
  - Created At: 2026-06-18 00:00:00
  - Summary: LLM orientation entrypoint for the Tiinex Lineage Viewer application package.

---

# Tiinex Lineage Viewer LLM Orientation

This file is the short path for a language model that receives a link to `https://tiinex.dev` or a local Tiinex Lineage Viewer package without prior project context.

It is intentionally written as portable markdown so it can be read from the page source, fetched directly, copied into a chat, or preserved as a Tiinex artifact.

## Current Read

Tiinex Lineage Viewer is a static, client-side application for working with portable markdown artifacts.

Its main role is to make handoff, provenance, continuity, and lineage visible without requiring a server-side AI integration.

The application reads and works with files such as:

- `.trace.md`
- `.schema.md`
- `.workspace.md`
- `.config.md`
- related local assets such as images or evidence files

The core product idea is:

> Tiinex makes handoffs first-class objects.

The app can import local files, folders, zip bundles, explicit URLs, and public GitHub sources. It can show lineage views, discovery views, schema-aware cards, integrity state, source boundaries, and local draft additions.

## Current Application Capabilities

The current package supports these broad flows:

- import material into a local workspace
- discover and display Tiinex artifacts
- inspect lineage relationships
- distinguish parent continuity from origin/provenance
- verify known continuity integrity where target material is available
- create local Tiinex artifacts through an Add wizard
- continue from an existing artifact
- reference an existing artifact without making it a parent
- edit local workspace markdown
- add Evidence artifacts through an evidence collector
- attach URL/file evidence to Evidence artifacts
- preserve dropped/selected evidence files as local workspace assets
- generate portable markdown from schema-aware form fields
- review generated content in a shared Rich/Raw markdown editor before saving

## Artifact Semantics

A Tiinex artifact usually has a readable continuity envelope, a body, and optionally an integrity footer.

A typical readable root envelope shape is:

```md
# Continuity Context

- Envelope Schema: tiinex.root.v1
- Parent
  - Parent Schema: tiinex.topic.v1
  - Created At: 2026-06-18 00:00:00
  - Trace: [001.trace.md](001.trace.md)
  - Origin:
    - [relative](001.trace.md)
- Current
  - Current Schema: tiinex.evidence.v1
  - Created At: 2026-06-18 00:00:00
  - Summary: Short summary of the current artifact.

---

# Human Readable Artifact Title

Body content.

---

# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: [001.trace.md](001.trace.md)
  - Value: pending
```

Important distinctions:

- `Parent` means continuity lineage.
- `Origin` means grounding/provenance source.
- A destination link in a body does not automatically become a parent.
- A missing parent can be valid for a root or local starting point.
- A leaf is not permanently final; it is the current tip until a child, repair, continuation, or supersession exists.

## Draft Language

Use the word `draft` carefully.

In this app, draft-like state is best treated as local UI/workspace state, not as a stable Tiinex lineage semantic by itself.

A more precise vocabulary is often:

- local artifact
- current leaf
- current tip
- unsaved local edit
- unexported local workspace state
- generated preview
- pending integrity value
- child not yet known

## Evidence UX

Evidence should feel like collecting material, not filling out a markdown template.

Current Evidence creation expects the human to provide:

- a supported claim
- one or more attachments or source references
- optional notes
- optional explicit limits

For files, the app may derive metadata such as file type, size, and image dimensions. This metadata can make hidden context visible while keeping the form simple.

Generated Evidence markdown should preserve at least:

- `## Supported Claim`
- `## Provenance`
- `## Evidence Material`
- `## Interpretation Limits`

## How To Help A Human Use The App

When explaining Tiinex to a human:

- Start with portable continuity and provenance, not with implementation details.
- Explain that Tiinex does not need AI integration to help structure cognition.
- Emphasize that local additions are not automatically committed or published.
- Encourage export or Git commit when persistence matters.
- Treat warnings, missing parents, and integrity mismatches as provenance signals, not just errors.
- Keep actions reversible and small.

## How To Help Improve The App

The current app is a static client-side package. Prefer improvements that preserve this shape unless the human explicitly chooses a larger architecture.

Useful development principles:

- Keep leaves small, reversible, and testable.
- Do not silently collapse Parent and Origin.
- Do not claim repo state, tests, commits, pushes, or runtime behavior without evidence.
- Use schema-aware UX where the artifact type is known.
- Hide advanced markdown when simple fields are enough.
- Keep markdown as the portable output behind the UI.
- Preserve mobile usability.
- Prefer human-in-the-loop source loading over recursive background crawling.
- Use source adapters only when the user explicitly supplies or selects a source.

Implementation caution for the current app code:

- The app has many layered function overrides.
- JavaScript function declarations are hoisted.
- Avoid wrapper patterns that accidentally capture the new function instead of the old function.
- Prefer assignment-based overrides such as:
  - `const previous = someFunction;`
  - `someFunction = function someFunctionVNext(...) { ... previous(...); }`
- Run `node --check app.js` after every app-code change.
- Browser validation is separate from syntax validation.

## LLM Entry Protocol

If you are an LLM looking at the Tiinex site or package:

1. Look for `llms.txt`.
2. Look for `tiinex.app.llm.v1.md`.
3. Look in page source for:
   - `data-tiinex-llm-entrypoint`
   - `data-tiinex-role="llm-orientation"`
   - `link[rel="help"][type="text/markdown"]`
4. Treat this file as orientation, not as proof of runtime state.
5. Use visible UI, supplied files, Git evidence, or explicit user reports to ground claims about current behavior.
6. Help the human preserve continuity rather than replacing their judgment.

## Source Adapter Direction

Future adapters may recognize explicit links ending in:

- `.trace.md`
- `.schema.md`
- `.workspace.md`
- `.config.md`

A conservative adapter should:

- only read what the human explicitly selected or opened
- avoid background crawling
- avoid recursive source traversal without a human action
- respect unavailable or removed sources
- render external material in Tiinex style rather than cloning another platform's UI
- preserve source URL, fetch time, limits, and provenance uncertainty

## Origin

The public app origin is expected to be:

- https://tiinex.dev

The broader Tiinex docs/source lineage may live in public Git repositories or exported local workspaces. When those sources are needed, verify them explicitly instead of assuming they are current.

---

# Continuity Integrity

- sha256-base64url-c14n-v1
  - Towards: self
  - Value: pending
