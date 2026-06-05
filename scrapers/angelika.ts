/**
 * Angelika Film Center NYC — angelikafilmcenter.com/nyc
 *
 * Part of Reading International. The site is a React SPA; the initial HTML
 * contains a server-side-rendered snapshot of today's showtimes.
 *
 * If this adapter returns empty/errors, check:
 *   1. Whether Reading migrated to a new domain or framework
 *   2. Try fetching /nyc/movies or /nyc/showtimes
 *   3. Look for a JSON payload in a <script id="__NEXT_DATA__"> tag (Next.js)
 *      or window.__INITIAL_STATE__ in a <script> tag (older React setup)
 *
 * Ticket links point to moviesatm.com (Reading International's purchase system).
 */

import * as cheerio from 'cheerio';
import type { Screening } from './types.js';
import {
  USER_AGENT,
  parseTime,
  toETISO,
  etCalendarDays,
  groupIntoScreenings,
} from './utils.js';

const BASE = 'https://www.angelikafilmcenter.com';
const SCHEDULE_URL = `${BASE}/nyc`;

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();

  const res = await fetch(SCHEDULE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Angelika HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];

  // Attempt 1: Next.js __NEXT_DATA__ embedded JSON
  const nextDataEl = $('script#__NEXT_DATA__').html();
  if (nextDataEl) {
    try {
      const data = JSON.parse(nextDataEl);
      const screenings = findScreeningsInNextData(data);
      if (screenings.length > 0) return screenings;
    } catch {
      // fall through to HTML parsing
    }
  }

  // Attempt 2: window.__INITIAL_STATE__ or similar
  $('script').each((_, el) => {
    const src = $(el).html() || '';
    const m = src.match(/(?:__INITIAL_STATE__|initialState|appState)\s*=\s*(\{[\s\S]*?\});/);
    if (m) {
      try {
        const state = JSON.parse(m[1]);
        const screenings = findScreeningsInNextData(state);
        if (screenings.length > 0) {
          sessions.push(...screenings.flatMap(s =>
            s.showtimes.map(t => ({ title: s.title, showtime: t, ticketUrl: s.ticketUrl }))
          ));
        }
      } catch {
        // ignore
      }
    }
  });

  if (sessions.length > 0) return groupIntoScreenings(sessions);

  // Attempt 3: HTML parsing — Reading's typical film-card structure
  $('[class*="movie"], [class*="film"], [class*="showtime"]').each((_, container) => {
    const $c = $(container);
    const title = $c.find('h2,h3,h4,[class*="title"]').first().text().trim();
    if (!title) return;

    $c.find('a[href*="moviesatm"], a[href*="readingcinemas"], a[href*="fandango"]').each((_, a) => {
      const $a = $(a);
      const ticketUrl = $a.attr('href') || SCHEDULE_URL;
      const timeText = $a.text().trim();
      if (!timeText.match(/\d:\d{2}/)) return;

      // Reading shows are always local ET
      for (const dateStr of [today, tomorrow]) {
        const showtime = toETISO(`${dateStr}T${parseTime(timeText)}`);
        sessions.push({ title: title.toUpperCase(), showtime, ticketUrl });
      }
    });
  });

  if (sessions.length === 0) {
    throw new Error('Angelika: no sessions found — site may require JavaScript rendering');
  }

  return groupIntoScreenings(sessions);
}

// Recursively find screening data in a Next.js data blob
function findScreeningsInNextData(obj: unknown): import('./types.js').Screening[] {
  if (!obj || typeof obj !== 'object') return [];

  // Look for arrays that contain objects with title + showtime-like properties
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (
        first &&
        typeof first === 'object' &&
        ('title' in first || 'movieTitle' in first || 'filmTitle' in first)
      ) {
        return (val as Array<Record<string, unknown>>).flatMap(item => {
          const title = String(item.title ?? item.movieTitle ?? item.filmTitle ?? '');
          const times: string[] = Array.isArray(item.showtimes)
            ? (item.showtimes as string[])
            : typeof item.showtime === 'string'
            ? [item.showtime]
            : [];
          if (!title || times.length === 0) return [];
          return [
            {
              title: title.toUpperCase(),
              showtimes: times,
              ticketUrl: String(item.ticketUrl ?? item.url ?? 'https://www.angelikafilmcenter.com/nyc'),
            },
          ];
        });
      }
    }
    const nested = findScreeningsInNextData(val);
    if (nested.length > 0) return nested;
  }
  return [];
}

if (process.argv[1]?.endsWith('angelika.ts') || process.argv[1]?.endsWith('angelika.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
