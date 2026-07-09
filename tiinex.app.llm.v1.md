## CP331 LLM note

Mobile chrome fade must reclaim usable content space. Do not fix this with one-off offsets that only hide controls; the layout owner must give the space back to the feed/lineage surface when reading mode is active.

Artifact placement now has two explicit pre-content scopes: storage folder/path and continuity parent. Storage answers where the file lives. Parent answers what the artifact follows from. Hidden or unresolved parents are graph state and should not automatically change view filters or force discovery findings visible. Move/Rewire may later combine path and parent changes, but ordinary create/edit should keep those concepts separate.
