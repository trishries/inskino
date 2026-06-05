/**
 * Metrograph — metrograph.com
 *
 * The /nyc/ page is a monthly calendar. Structure (verified June 2026):
 *
 *   <div id="calendar-list-day-2026-06-02" class="calendar-list-day movies-grid">
 *     <div class="item film-thumbnail homepage-in-theater-movie">
 *       <a class="image" href="/film/?vista_film_id=..."></a>
 *       <h4>Film Title</h4>
 *       <div class="film-metadata">Director / Year / Runtime / Format</div>
 *       <div class="showtimes">
 *         <a href="https://t.metrograph.com/Ticketing/visSelectTickets.aspx?...">4:00pm</a>
 *       </div>
 *     </div>
 *   </div>
 *
 * Date is encoded in the container's `id` as `calendar-list-day-YYYY-MM-DD`.
 * If Metrograph redesigns, look for that id pattern or update to a new scheme.
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

const CALENDAR_URL = 'https://metrograph.com/nyc/';

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();

  const res = await fetch(CALENDAR_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Metrograph HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];

  for (const dateStr of [today, tomorrow]) {
    const dayDiv = $(`#calendar-list-day-${dateStr}`);
    if (!dayDiv.length) continue;
    // If closed (e.g. private event), the div has class "closed" and no .item.film-thumbnail
    if (dayDiv.hasClass('closed')) continue;

    dayDiv.find('.item.film-thumbnail, .item').each((_, item) => {
      const $item = $(item);
      const title = $item.find('h4').first().text().trim();
      if (!title) return;

      $item.find('.showtimes a[href*="visSelectTickets"]').each((_, a) => {
        const timeText = $(a).text().trim();
        if (!timeText.match(/\d:\d{2}/)) return;
        const href = $(a).attr('href') || CALENDAR_URL;
        sessions.push({
          title: title.toUpperCase(),
          showtime: toETISO(`${dateStr}T${parseTime(timeText)}`),
          ticketUrl: href,
        });
      });
    });
  }

  if (sessions.length === 0) {
    // Closed days (private events) result in 0 sessions — that's status:"empty", not error
    // Return empty array; the orchestrator sets status based on film count.
    return [];
  }

  return groupIntoScreenings(sessions);
}

if (process.argv[1]?.endsWith('metrograph.ts') || process.argv[1]?.endsWith('metrograph.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
