/**
 * Film Forum — filmforum.org
 *
 * The /now-playing page has a weekly schedule in tab panels #tabs-0 through #tabs-6,
 * corresponding to TUE, WED, THU, FRI, SAT, SUN, MON (verified June 2026).
 *
 * Each tab panel contains <p> elements with structure:
 *   <strong><a href="/film/{slug}">FILM TITLE</a></strong>
 *   <br>
 *   <span>12:20</span> <span>2:30</span> ...
 *
 * Times are in 12-hour format without AM/PM. Cinema bias: treat hours 1–11 as PM,
 * hour 12 as noon (PM). Film Forum doesn't have meaningful early-AM shows.
 *
 * Ticket URLs: https://my.filmforum.org/events/{slug}
 * The slug comes from the film link href (/film/{slug}).
 *
 * If Film Forum redesigns, check:
 *   - Whether the tab IDs still follow #tabs-{N}
 *   - Whether the day ordering (TUE first) is still the same
 *   - The <p> > <strong> > <a> + <span> structure
 */

import * as cheerio from 'cheerio';
import type { Screening } from './types.js';
import { USER_AGENT, toETISO, etCalendarDays, groupIntoScreenings } from './utils.js';

const NOW_PLAYING = 'https://filmforum.org/now-playing';

// Film Forum's tab panels always start from the current day of the week:
//   tabs-0 = today, tabs-1 = tomorrow, tabs-2 = day after, etc.
// So today is always 0, tomorrow is always 1.
function dateToTabIndex(dateStr: string, today: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round(
    (new Date(dateStr).getTime() - new Date(today).getTime()) / msPerDay
  );
  return diff; // 0 for today, 1 for tomorrow
}

// Convert Film Forum's AM/PM-less time string to HH:MM:00
// "12:20" → "12:20:00" (noon), "2:30" → "14:30:00" (afternoon PM)
function parseFfTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '00:00:00';
  let h = parseInt(m[1]);
  const min = m[2];
  // Assume PM for hours 1–11 (cinema bias); 12 stays as noon
  if (h >= 1 && h < 12) h += 12;
  return `${String(h).padStart(2, '0')}:${min}:00`;
}

function extractTabSessions(
  $: cheerio.CheerioAPI,
  tabIndex: number,
  dateStr: string
): Array<{ title: string; showtime: string; ticketUrl: string }> {
  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];
  const $tab = $(`#tabs-${tabIndex}`);
  if (!$tab.length) return sessions;

  $tab.find('p').each((_, p) => {
    const $p = $(p);
    // Film title from <strong><a href="/film/{slug}">
    const $titleLink = $p.find('strong a[href*="/film/"]').first();
    const title = $titleLink.text().trim();
    if (!title) return;

    // Derive ticket URL from slug
    const filmHref = $titleLink.attr('href') || '';
    const slug = filmHref.split('/film/')[1]?.replace(/\/$/, '') || '';
    const ticketUrl = slug
      ? `https://my.filmforum.org/events/${slug}`
      : NOW_PLAYING;

    // Showtimes from <span> elements
    $p.find('span').each((_, span) => {
      const timeText = $(span).text().trim();
      if (!timeText.match(/^\d{1,2}:\d{2}$/)) return;
      const showtime = toETISO(`${dateStr}T${parseFfTime(timeText)}`);
      sessions.push({ title: title.toUpperCase(), showtime, ticketUrl });
    });
  });

  return sessions;
}

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();

  const res = await fetch(NOW_PLAYING, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Film Forum HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const todayIdx    = dateToTabIndex(today, today);
  const tomorrowIdx = dateToTabIndex(tomorrow, today);

  const sessions = [
    ...extractTabSessions($, todayIdx, today),
    ...extractTabSessions($, tomorrowIdx, tomorrow),
  ];

  return groupIntoScreenings(sessions);
}

if (process.argv[1]?.endsWith('filmforum.ts') || process.argv[1]?.endsWith('filmforum.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
