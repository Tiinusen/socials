# Tiinex Orientation v1

Tiinex keeps provenance readable in Markdown artifacts you own.

Provenance means the visible trail around material: where it came from, what changed, what it depends on, what limits apply, and what should not be inferred from it.

## Core Identity

- Tiinex is artifact-first, provenance-first, and Markdown-first.
- The goal is provenance and continuity that remain readable, inspectable, and portable.
- Parent lineage, origin grounding, policy boundaries, and runtime state are distinct concepts.
- A viewer, editor, exporter, or adapter may implement part of Tiinex without being the whole project.
- AI and LLM workflows are use cases and pressure tests, not the identity boundary.

## This Repository's Place

`Tiinex/site` is a static client-side viewer and reference implementation.
It helps inspect, share, import, export, review, and continue working with Tiinex artifacts and workspaces.

It is not the sole authority for Tiinex semantics, and it is not the whole definition of the broader provenance system.

## Reader Cautions

- Do not treat local draft state as published source.
- Do not collapse Parent and Origin into one generic relation.
- Do not treat workspace entrypoints as ordinary leaves when they are opened as workspaces.
- Do not describe Tiinex as a general-purpose AI runtime unless a specific current artifact implements that behavior.
- Do not read transient release files before stable identity and context files.
