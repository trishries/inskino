/**
 * Cherry Lane Theatre — cherrylanetheatre.org
 *
 * A24-owned Off-Broadway playhouse at 38 Commerce St, NYC.
 * Primarily presents live theater; film screenings are rare (a few per month,
 * often in a "Source Material" series tied to an upcoming play).
 *
 * When present, film events appear in the calendar as standard events with
 * a date, time, and film title. A normal day shows 0 films here.
 *
 * Ticket links go through Telecharge or Eventbrite (A24's preference varies).
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

const BASE = 'https://cherrylanetheatre.org';

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();

  const res = await fetch(BASE, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Cherry Lane HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];

  // Cherry Lane's calendar lists events with date, time, and title.
  // We look for any event entry whose date matches today or tomorrow
  // AND whose description/category suggests it's a film.

  const filmKeywords = /\bfilm\b|\bscreening\b|\bcinema\b|\bmovie\b|\bsource material\b/i;

  $('[class*="event"], [class*="show"], article, li').each((_, el) => {
    const $el = $(el);
    const fullText = $el.text();

    // Is this a film event?
    if (!filmKeywords.test(fullText)) return;

    // Get the date
    const dateText = $el.find('time, [class*="date"], [datetime]').first().attr('datetime') ||
                     $el.find('time, [class*="date"]').first().text().trim();

    let eventDate = '';
    if (dateText) {
      // datetime might be "2026-06-13" or a full ISO string
      const isoMatch = dateText.match(/\d{4}-\d{2}-\d{2}/);
      if (isoMatch) eventDate = isoMatch[0];
    }

    // If no explicit date found, try matching text like "June 13" or "Jun 13"
    if (!eventDate) {
      const textDateMatch = fullText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})/i);
      if (textDateMatch) {
        const monthNames: Record<string, number> = {
          jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
          jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
        };
        const monthKey = textDateMatch[0].slice(0, 3).toLowerCase();
        const month = monthNames[monthKey];
        const day = parseInt(textDateMatch[1]);
        if (month && day) {
          const year = new Date().getFullYear();
          eventDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }

    if (eventDate !== today && eventDate !== tomorrow) return;

    const title = $el.find('h1,h2,h3,h4,[class*="title"]').first().text().trim();
    if (!title) return;

    const timeText = $el.find('time, [class*="time"]').last().text().trim() ||
                     fullText.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/i)?.[0] || '';
    const ticketUrl = $el.find('a[href*="telecharge"], a[href*="eventbrite"], a[href*="a24"]').attr('href') ||
                      $el.find('a').first().attr('href') || BASE;

    if (timeText.match(/\d:\d{2}/)) {
      sessions.push({
        title: title.toUpperCase(),
        showtime: toETISO(`${eventDate}T${parseTime(timeText)}`),
        ticketUrl,
      });
    }
  });

  return groupIntoScreenings(sessions);
}

if (process.argv[1]?.endsWith('cherrylane.ts') || process.argv[1]?.endsWith('cherrylane.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
