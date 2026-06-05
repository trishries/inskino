/**
 * Scraper orchestrator.
 * Runs all theater adapters in parallel, tolerates individual failures,
 * and writes public/showtimes.json.
 *
 * Usage:
 *   npx tsx scrapers/index.ts
 */

import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TheaterResult, ShowtimesOutput } from './types.js';
import { fetchToday as fetchAnthology } from './anthology.js';
import { fetchToday as fetchMetrograph } from './metrograph.js';
import { fetchToday as fetchFilmForum } from './filmforum.js';
import { fetchToday as fetchIFC } from './ifccenter.js';
import { fetchToday as fetchQuad } from './quad.js';
import { fetchToday as fetchParis } from './paris.js';
import { fetchToday as fetchCherryLane } from './cherrylane.js';
import { etCalendarDays } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const THEATERS: Array<{
  name: string;
  url: string;
  fetch: () => Promise<import('./types.js').Screening[]>;
}> = [
  { name: 'Anthology Film Archives', url: 'https://anthologyfilmarchives.org',   fetch: fetchAnthology },
  { name: 'IFC Center',              url: 'https://www.ifccenter.com',           fetch: fetchIFC },
  { name: 'Film Forum',              url: 'https://filmforum.org',               fetch: fetchFilmForum },
  { name: 'Metrograph',              url: 'https://metrograph.com',              fetch: fetchMetrograph },
  { name: 'Quad Cinema',             url: 'https://quadcinema.com',              fetch: fetchQuad },
  { name: 'Paris Theater',           url: 'https://www.paristheaternyc.com',     fetch: fetchParis },
  { name: 'Cherry Lane Theatre',     url: 'https://cherrylanetheatre.org',       fetch: fetchCherryLane },
];

async function run() {
  console.log(`[scraper] Starting run at ${new Date().toISOString()}`);
  const { today, tomorrow } = etCalendarDays();
  console.log(`[scraper] Fetching for ET calendar dates: ${today} and ${tomorrow}`);

  const results = await Promise.allSettled(THEATERS.map(t => t.fetch()));

  const theaters: TheaterResult[] = THEATERS.map((t, i) => {
    const result = results[i];
    if (result.status === 'rejected') {
      const err = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`[scraper] ${t.name} FAILED: ${err}`);
      return { name: t.name, url: t.url, status: 'error' as const, films: [], error: err };
    }
    const films = result.value;
    if (films.length === 0) {
      console.log(`[scraper] ${t.name}: no screenings`);
      return { name: t.name, url: t.url, status: 'empty' as const, films: [] };
    }
    const count = films.reduce((n, f) => n + f.showtimes.length, 0);
    console.log(`[scraper] ${t.name}: ${films.length} films, ${count} screenings`);
    return { name: t.name, url: t.url, status: 'ok' as const, films };
  });

  // Compute lastUpdated as ISO string with America/New_York offset
  const now = new Date();
  const { etOffset } = await import('./utils.js');
  const todayForOffset = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(now); // "YYYY-MM-DD"
  const finalOffset = etOffset(todayForOffset);

  // Build a local ET datetime string
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const g = (t: string) => etParts.find(p => p.type === t)?.value ?? '00';
  const lastUpdated = `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;

  const output: ShowtimesOutput = {
    lastUpdated: lastUpdated + finalOffset,
    theaters,
  };

  const outPath = join(__dirname, '..', 'public', 'showtimes.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`[scraper] Wrote ${outPath}`);
  console.log(`[scraper] Done.`);
}

run().catch(err => {
  console.error('[scraper] Fatal error:', err);
  process.exit(1);
});
