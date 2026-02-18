# GitHub Pages Setup (Quartz 4)

Follow Quartz docs:
- Get started: https://quartz.jzhao.xyz/#-get-started
- Hosting on GitHub: https://quartz.jzhao.xyz/hosting

## Repo settings

1. Push this TEMP project to your GitHub repo.
2. In GitHub repo settings, open **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Ensure `.github/workflows/deploy.yml` is present (already added).

## Domain

- `quartz/static/CNAME` has been added with your domain: `www.livipoon.com`.
- `quartz.config.ts` baseUrl is set to `www.livipoon.com`.

## Local commands

- Build: `npm run quartz -- build`
- Dev server: `npm run quartz -- build --serve`

Note: `.npmrc` uses `engine-strict=false` in this TEMP port because your local npm is `10.8.3` while Quartz requests `>=10.9.2`.
