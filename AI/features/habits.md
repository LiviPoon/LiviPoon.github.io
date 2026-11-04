# Habit tracking

- Data: one markdown file per habit in `data/habits/` (e.g. `exercise.md`). Frontmatter
  `entries:` is a list of `YYYY-MM-DD` completed days. Also parsed: `YYYY-MM-DD, value` rows
  (truthy: numbers >0, `true/yes/y/x/done/complete/completed/checked`), `- YYYY-MM-DD`, bare dates.
- `tools/build-data.mjs` aggregates them into `site/data/site-data.js`: a daily `timeline`
  and a `weeklySeries` per habit (Monday-start UTC weeks, average per week). The script writes
  them onto the hidden `#quartz-body` element's `data-*` attributes.
- The deploy workflow re-runs the generator, so a pushed habit edit is always live. Run it
  locally too, so the committed `site-data.js` and your preview stay current.
- Consumers: `site/app.js` (homepage timeline), `assets/js/habit-timeline.js`
  (`/tracked-habits/` chart), `assets/js/roll-counter.js` (`data-habit` counters, e.g. the
  "side quests completed" number on achievements = total for "go outside of my comfort zone").
- Add a habit: create `data/habits/<name>.md` with `entries:` and run the generator.
