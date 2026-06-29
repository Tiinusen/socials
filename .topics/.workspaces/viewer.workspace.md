# Continuity Context

- Envelope Schema: [tiinex.root.v1](https://github.com/Tiinex/docs/blob/7aecdb99551c4b6850665cdee418f0b9907d9616/.topics/.schemas/tiinex.root.v1.schema.md)
- Current
  - Current Schema: [tiinex.workspace.v1](https://github.com/Tiinex/docs/blob/7aecdb99551c4b6850665cdee418f0b9907d9616/.topics/.schemas/tiinex.workspace.v1.schema.md)
  - Created At: 2026-06-16 00:00:00
  - Why: Defines a portable multi-lineage workspace entrypoint.
  - Summary: Opens the Tiinex docs workspace and declares the default viewer discovery lens.

---

# Tiinex Viewer

## Viewer Identity

- Icon: ../../assets/tiinex-logo-white-transparent.png
- Home: https://github.com/Tiinex

## Empty Stage

- Subtitle: Every handoff starts somewhere
- Subtitle: Start where the last thread ends
- Subtitle: Leave enough for the next mind
- Subtitle: A thread is waiting
- Subtitle: Nothing starts from nothing

## Workspace Discovery

- [Tiinex docs workspaces](https://github.com/Tiinex/docs)
  - Kind: github-tree
  - Ref: master
  - Root Path: .topics
  - Match: *.workspace.md
  - Label: Tiinex docs workspaces
  - Open Behavior: chooser

## Workspace Entrypoints

### Tiinex docs

- Source Kind: github-tree
- Repository: Tiinex/docs
- Ref: master
- Root Path: .topics
- Repo Files Discovery: on
- Issue Discussion Discovery: on
- Issue URL: https://github.com/Tiinex/docs/issues/4
- Default View: feed
- Default Filter: all

## Help

### What is this view?

This workspace opens Tiinex markdown artifacts so an external reviewer and their LLM helpers can inspect continuity, source material, integrity signals, and continuation paths.

### What should I check first?

Start with what is loaded.

Check the workspace source, then inspect the visible badges. Treat integrity mismatch, missing integrity, unknown schema, and local-only material as review signals, not automatic failure.

### What should I trust?

Trust only what the artifact and its sources actually show.

Use `Source` to inspect where material came from, `Markdown` to read the artifact, `Open` to inspect the selected node, and `Continue` only when the next step is clear enough to preserve.

### What should an LLM preserve?

Do not collapse Parent and Origin.

Parent is the declared continuity edge. Origin is provenance for where the material came from. If either is missing or weak, say so rather than filling the gap.

### What should I send back?

A useful validation note names the selected artifact, the source inspected, the observed signal, and the smallest next correction or continuation.

---

# Continuity Integrity

- [sha256-base64url-c14n-v1](https://github.com/Tiinex/docs/blob/3466e50d739a9ba65319297cef79c6b09844b1d7/.topics/.validators/sha256-base64url-c14n-v1.validator.md)
  - Towards: [viewer.workspace.md](viewer.workspace.md)
  - Value: cq_1gsfGZ34oa4EQbEDrpO4Vaq9vYZAdn6Xwkl10blA
