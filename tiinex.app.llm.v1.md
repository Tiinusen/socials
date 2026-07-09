## CP339 LLM note

CP339 preserves CP338 workspace Open/Merge/Duplicate semantics but fixes the intake boundary. A dropped workspace export must be treated as a workspace entrypoint even when the browser renamed it, for example `*.workspace (4).md`, or when the content clearly declares `tiinex.workspace.v1` / Workspace State.

Do not import those files as normal local leaves. Draft payloads remain browser-local and are not embedded in `.workspace.md` exports.
