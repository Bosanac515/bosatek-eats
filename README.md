# BosaTek Eats

A static, mobile-first meal planner for Iowa State dining locations, served at **eats.bosatek.com**
from GitHub Pages. Unofficial student project; not affiliated with Iowa State University or ISU Dining.

> Status: **build phase 1**: data pipeline, CI and a venue/hours shell. The planning engine,
> onboarding, menus, plans and profile transfer come in later phases.

## Architecture

```
config/            hand-edited inputs (plans, scrape schedule, manual venues, overrides)
scripts/           data pipeline (Node, runs in GitHub Actions)
  adapters/        Source interface + ISU adapter, polite fetcher, sanitizer
  schedule.ts      what a given day's run fetches
  scrape.ts        fetch -> sanitize -> validate -> write public/data, or keep last good
public/data/       generated JSON the app reads (committed; seed data ships with the repo)
src/
  data/            types + schema validators (shared by the scraper and the app)
  lib/             app data loading and time helpers
  App.svelte       UI
tests/             vitest: adapter parsers on real trimmed responses, validators, schedule, pipeline
docs/              DISCOVERY.md (endpoints, schema, source gaps), DISCLAIMERS.md
```

**Data flow:** the `Scrape` workflow runs once a day. It fetches what `config/schedule.json` says
is due, sanitizes every string (tags stripped, entities decoded, length-capped), validates all files
against `src/data/schema.ts` (unknown keys rejected, enums whitelisted, numbers range-checked), and
writes `public/data`. If anything fails, the previous files stay and `meta.json` records the error,
so the app shows "may be out of date". The workflow then commits and calls `Deploy`.

| What | When | Requests |
|---|---|---|
| Hours, all venues (1 bulk call) | daily | 1 |
| Dining centers + Conversations, 7 days of menus | weekly (Sunday) or if missing or over 6 days old | 35 |
| Fast-casual menus | monthly, each venue on its own day | 1 each |
| Cafes, convenience stores, other express | quarterly, each venue on its own day | 1 each |
| Venue list and venue pages | on demand (`locations` input) | 25 |

Fetching rules (enforced in `scripts/adapters/fetcher.ts`): only `https://dining.iastate.edu/`, honest
User-Agent `BosaTekEats/0.1 (+https://eats.bosatek.com; hello@bosatek.com)`, at most one request per 2 s,
a per-run budget, and a hard stop on 403/429/challenge pages. If blocked, email dining@iastate.edu;
don't work around it.

## Development

```
npm ci --ignore-scripts
npm run dev        # http://localhost:5173
npm test
npm run check      # svelte-check, strict TypeScript
npm run build
npm run scrape     # real requests to ISU: use sparingly
```

Node 22+. Dependencies are exact-pinned with a committed lockfile; Dependabot updates npm packages
and the SHA-pinned GitHub Actions weekly.

## How to

- **Add or fix a location:** venue data comes from ISU. To correct one, add an entry to
  `config/locations.overrides.json` (`category`, `mealSwipe`), then run the `Scrape` workflow with
  `locations` checked.
- **Add a non-ISU venue:** add it to `config/manual-venues.json` (weekly hours, `accepts`,
  `menuUrl`). It's placed at the Memorial Union's coordinates.
- **Update meal plans (yearly):** edit `config/plans.json`. Plan terms are config, never code.
- **Change scrape cadence:** edit `config/schedule.json`.
- **Add a data source:** implement `Source` in `scripts/adapters/source.ts` (see `isu.ts`) and pass
  it to `run()` in `scripts/scrape.ts`. Its output goes through the same validators.

## Deployment

1. Repo **Settings → Pages → Source: GitHub Actions**. `public/CNAME` sets `eats.bosatek.com`.
2. Cloudflare DNS: `CNAME eats → bosanac515.github.io`. Then enable **Enforce HTTPS** in Pages.
3. Cloudflare response headers (Rules → Transform Rules → Modify Response Header) for `eats.bosatek.com`:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   X-Content-Type-Options: nosniff
   Referrer-Policy: no-referrer
   Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=()
   ```
   The `<meta>` CSP in `index.html` is a fallback; `frame-ancestors` only works as a real header.

## Security notes

- No `innerHTML` or `{@html}` anywhere; Svelte escapes all text. Scraped strings are also sanitized at ingest.
- Strict CSP: no inline scripts, no remote origins, no analytics, no external images or fonts.
- Everything the user enters stays in `localStorage` on their device (later phases).
- Workflows: actions pinned to commit SHAs, `permissions` minimal per job, `npm ci --ignore-scripts`,
  and the scrape job's token is only handed to the final `git push` (`persist-credentials: false`).
- CI runs `npm audit`, svelte-check, tests and CodeQL (JavaScript/TypeScript and Actions).

Read [docs/DISCLAIMERS.md](docs/DISCLAIMERS.md) before launch.
