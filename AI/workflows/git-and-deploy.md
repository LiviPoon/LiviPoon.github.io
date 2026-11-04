# Git & deploy

- Default branch `main`; push triggers GitHub Pages deploy (Node 22, `npm ci`, `npx quartz build`
  in `livipoon-quartz4/`, artifact `livipoon-quartz4/public`).
- Do feature work on a branch (current: `dev_uphall`); merge to `main` only when asked.
- Untracked and not to be committed: `node_modules/`, `public/`, `quartz/.quartz-cache/`.
  Consider adding them to `.gitignore` if not yet.
- `.gitignore` currently lists `CLAUDE.md`, `.claude`, `.env`, `garmin_session.json`.
  The agent docs live in `AI/` (tracked) so they aren't ignored.
- Before pushing: `npm run check` and a local `npx quartz build`.
- Never commit/push without being asked.
