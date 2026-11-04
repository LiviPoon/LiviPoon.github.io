# Habit tracking

- Data: one markdown file per habit in `content/habits/` (e.g. `exercise.md`, `floss.md`).
  Frontmatter `entries:` is a YAML list of `YYYY-MM-DD` dates (completed days).
  Legacy line formats still parsed: `YYYY-MM-DD, value`, `- YYYY-MM-DD`, bare `YYYY-MM-DD`.
  Truthy values: numbers >0, `true/yes/y/x/done/complete/completed/checked`.
- Aggregation: `Body.tsx` (`getHabitTrackingData`) builds `timeline` (date,count) and
  `weeklySeries` (per habit, Monday-start UTC weeks, average per week). Duplicated in `portfolioRoot.ts`.
- Rendering: D3 in `scripts/habitTimeline.inline.ts` (~800 lines; grep first).
- Add a habit: create `content/habits/<name>.md` with `entries:`; rebuild.
- `content/tracked-habits/` is a separate folder (index only).
