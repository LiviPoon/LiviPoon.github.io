# Git & deploy

- Default branch `main`. A push triggers the GitHub Pages workflow, which runs
  `node tools/build-data.mjs` and uploads `site/` as the artifact. No npm install, no build.
- Do feature work on a branch; merge to `main` only when asked.
- `.gitignore` lists `CLAUDE.md`, `.claude`, `.env`, `garmin_session.json`. The agent docs live
  in `AI/` (tracked).
- Before pushing: run `node tools/build-data.mjs`, preview with
  `python3 -m http.server -d site 8080`, and click through the changed pages in both themes.
- Never commit or push without being asked.
