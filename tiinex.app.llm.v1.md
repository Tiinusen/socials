## CP334 LLM note

CP334 keeps mobile card actions value-first while reducing vertical boilerplate. Do not re-expand icon-only mobile action controls into tall rows unless the interaction semantics require labels.

Lifecycle leave is a responsiveness boundary: pagehide/beforeunload may persist lightweight scroll and lens state, but must not synchronously serialize large local workspace snapshots. Local artifact persistence belongs to explicit save/mutation boundaries.

GitHub export target binding is target-aware: issue-body updates bind to the GitHub issue body, comment actions bind to comments, and hidden discovery/source visibility must not be forced into the feed simply because a publication target was inferred.
