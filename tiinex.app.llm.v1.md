## CP341 LLM note

CP341 keeps workspace-file drops explicit: dropping onto a workspace adds an entrypoint card, while dropping outside a workspace asks whether to Open or Merge.

- Open replaces only safe/non-draft workspaces.
- Merge upserts workspace/source config without closing existing workspaces.
- Duplicate workspace export carries duplicate intent inside Workspace State and opens as a separate workspace copy.
- Confirmed workspace close persists local-state deletion.
- Workspace entrypoint cards now have Configure for brandable identity settings.

Browser-local drafts remain local storage state and are not embedded into `.workspace.md` exports.
