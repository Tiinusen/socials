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

## Source And Adapter Semantics

- A source is where material was observed, loaded, published, or recovered from.
- An origin is provenance/grounding for material; it is not automatically a continuity parent.
- A parent is the declared continuity edge and must remain separate from source, origin, publication target, and external container.
- Adapters may expose external containers such as GitHub issues, discussions, Reddit posts, or forum threads. Those containers are source surfaces unless an artifact explicitly names them as parents.
- If an artifact declares a parent that is not currently discovered, preserve that relation as unresolved-known instead of falling back to the external container.
- Adapter exports of a connected lineage segment should preserve the segment as one publication transaction when the target supports nested items, such as issue body plus comments.
- Adapter imports may preserve attached assets when the source surface supports them; asset preservation is provenance, not proof of truth or acceptance.

## Reader Cautions

- Do not treat local draft state as published source.
- Do not collapse Parent and Origin into one generic relation.
- Do not treat workspace entrypoints as ordinary leaves when they are opened as workspaces.
- Do not describe Tiinex as a general-purpose AI runtime unless a specific current artifact implements that behavior.
- Do not read transient release files before stable identity and context files.
