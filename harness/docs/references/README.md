# harness/docs/references/

Curated notes for external libraries, one file per library
(e.g. `django-rest-framework.md`, `stripe.md`).

Create a file here only when it earns its place:

- The agent was corrected **twice** on the same library, or
- The library is version-pinned and its current docs differ from what models
  assume, or
- The project uses it in a deliberately non-standard way.

Each file: pin the version, date it (`Last reviewed: YYYY-MM-DD`), show the
project's own conventions and 2–3 real code patterns, list gotchas that
actually happened, keep it under 300 lines. A stale reference file is worse
than no reference file — delete or re-review on every major upgrade.

Full conventions: see `core/docs/external-docs.md` in the harness repo.
