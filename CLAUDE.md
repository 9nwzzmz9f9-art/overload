Read SPEC.md before any work. It is the source of truth.

This is the PWA rebuild of the native iOS app that lives at
`~/Overload`. That build was abandoned after extensive debugging showed
its one differentiating feature (Live Activity lock-screen logging)
depended on undocumented ActivityKit behavior not worth fighting
further. This project intentionally drops that feature — see SPEC.md §0
and §6.1.

- No frameworks, no build step, no npm, no third-party dependencies of
  any kind. Plain HTML/CSS/JS, served as static files.
- No AI, no networking calls at runtime, no analytics.
- Build phases in order (SPEC.md §8). Stop after each and wait for me.
- Storage is IndexedDB, hand-written, no wrapper library.
- All persistence behind a repository module — no raw IndexedDB calls
  scattered through UI code.
- Progression logic lives in one module (`progressionEngine`) only.
