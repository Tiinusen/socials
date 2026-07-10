# Tiinex Orientation v1

Tiinex is a broader continuity system for saving AI-assisted work as readable, inspectable Markdown artifacts.

Those artifacts preserve context, origin, parent links, transitions, and enough surrounding information for humans or AI tools to continue work later without silently inventing missing state.

## Core Identity

- Tiinex is artifact-first and Markdown-first.
- The goal is continuity that remains readable, inspectable, and portable.
- Parent lineage, origin grounding, policy boundaries, and runtime state are distinct concepts.
- A viewer, editor, exporter, or adapter may implement part of Tiinex without being the whole project.

## This Repository's Place

`Tiinex/site` is a static client-side viewer and reference implementation.
It helps inspect, share, continue, import, export, and review Tiinex artifacts and workspaces.

It is not the sole authority for Tiinex semantics, and it is not the whole definition of the broader continuity system.

## Reader Cautions

- Do not treat local draft state as published source.
- Do not collapse Parent and Origin into one generic relation.
- Do not treat workspace entrypoints as ordinary leaves when they are opened as workspaces.
- Do not read transient release files before stable identity and context files.