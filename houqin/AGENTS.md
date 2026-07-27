# Houqin Working Rules

- Keep files single-purpose and avoid god files.
- Keep the UI thin; filesystem work must stay off the UI thread.
- Prefer durable, simple solutions over clever abstractions.
- Extract reusable black-box helpers when logic could be shared.
- Reuse existing helpers and patterns when they already fit.
- Write tests for core behavior before expanding UI polish.
- Keep runtime config local to the user machine, not in repo state, unless explicitly requested.

