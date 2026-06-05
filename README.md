# Ins Kino

NYC arthouse cinema showtimes on one page. Scrape on a schedule → static JSON → fast mobile-first frontend.

## Architecture

```
scrapers/        TypeScript adapters, one per theater
public/          Static site (index.html + showtimes.json)
.github/workflows/scrape.yml   Scheduled scraper → commits JSON → Netlify redeploys
```

The browser **never** scrapes theaters directly. The GitHub Action runs every few hours, writes `public/showtimes.json`, and pushes the commit. Netlify auto-deploys on push.

**1 AM rollover**: the frontend determines the current *program day* at load time — before 1 AM ET, today's program is yesterday's calendar date. The scraper always fetches today's **and** tomorrow's calendar dates so late-night shows appear on the right program day even if the scraper hasn't run since.

## Running locally

```bash
npm install
npm run scrape          # writes public/showtimes.json
npx serve public        # serves the frontend on http://localhost:3000
```

Run a single adapter for quick debugging:

```bash
npx tsx scrapers/anthology.ts
npx tsx scrapers/metrograph.ts
# etc.
```

## Theaters

| Theater | Adapter | Backend |
|---------|---------|---------|
| Anthology Film Archives | `scrapers/anthology.ts` | Veezi (ticketing.uswest.veezi.com) |
| IFC Center | `scrapers/ifccenter.ts` | HTML — ifccenter.com |
| Angelika Film Center | `scrapers/angelika.ts` | HTML / Next.js SSR |
| Film Forum | `scrapers/filmforum.ts` | HTML — filmforum.org |
| Metrograph | `scrapers/metrograph.ts` | HTML — metrograph.com/nyc/?date= |
| Quad Cinema | `scrapers/quad.ts` | HTML — quadcinema.com (Fandango tickets) |
| Paris Theater | `scrapers/paris.ts` | ⚠️ Domain appears parked — see note below |
| Cherry Lane Theatre | `scrapers/cherrylane.ts` | HTML — cherrylanetheatre.org |

### Veezi adapter

`scrapers/veezi.ts` is a generic adapter parameterized by `siteToken`. Anthology uses it directly. If other theaters in this list migrate to Veezi, import `fetchVeezi` and pass their token — no new parsing code needed.

## Adding a new theater

1. Create `scrapers/newtheater.ts` with this shape:
   ```typescript
   import type { Screening } from './types.js';
   export async function fetchToday(): Promise<Screening[]> { … }
   ```
2. Add it to the `THEATERS` array in `scrapers/index.ts`.
3. Check the site's network tab for a JSON/XHR endpoint first; fall back to HTML + Cheerio.
4. Wrap all HTTP calls in try/catch — the orchestrator uses `Promise.allSettled` so one failure never blocks others.

## Fixing a broken adapter

Theater sites change. When an adapter starts returning 0 films or errors:

1. Run it standalone: `npx tsx scrapers/thattheater.ts`
2. Open the theater's site and inspect the Network tab for a cleaner data source.
3. Update the selectors/URL at the top of the adapter file (comments explain what to look for).
4. The `status: "error"` card will appear in the UI with "SHOWTIMES UNAVAILABLE" until fixed.

## Paris Theater note

As of June 2026, `theparistheater.com` appears to be a parked domain. To fix:
- Find the current Paris Theater website (check Netflix press, Fandango, or their social media).
- Update `SCHEDULE_URL` in `scrapers/paris.ts`.
- Update the HTML parser to match the new site's structure.

## Deployment (Netlify)

1. Push this repo to GitHub.
2. In Netlify: **New site → Import from Git → select this repo**.
3. Build settings are in `netlify.toml` — publish directory is `public`, no build command needed.
4. The GitHub Action (`scrape.yml`) commits updated `showtimes.json` on its schedule; each push triggers a Netlify redeploy automatically.
5. Set the GitHub Action to have **write** permissions (already configured in `scrape.yml`'s `permissions` block).

## GitHub Action schedule

| Cron (UTC) | ET (EDT/summer) |
|------------|-----------------|
| `10 5 * * *` | 1:10 AM |
| `0 11 * * *` | 7:00 AM |
| `0 15 * * *` | 11:00 AM |
| `0 19 * * *` | 3:00 PM |
| `0 23 * * *` | 7:00 PM |

The 1:10 AM run is the most important — it populates the next day's data just after the program day rolls over.
