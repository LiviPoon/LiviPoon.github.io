# Maintaining the AI/ docs

Goal: minimal context per task.

- Max 300 lines per `.md` file. If a doc nears ~250, split it and link the parts.
- `CLAUDE.md` stays a router: tables and one-liners only, no deep detail.
- Each doc starts with a one-line purpose and ends with "See also" links where useful.
- Document what is NOT obvious from reading code (why, gotchas, file pointers). Don't paste code.
- Prefer file pointers (`site/assets/js/masonry.js`) over descriptions that go stale.
- When adding a feature: add a file in `features/`, then a row in `features/index.md`.
- Check line counts: `wc -l AI/**/*.md AI/*.md | sort -n`
