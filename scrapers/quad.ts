/**
 * Quad Cinema — quadcinema.com
 *
 * The homepage shows a 7-day schedule in day-wrap divs. Structure (verified June 2026):
 *
 *   <div class="day-wrap date-02 active">   <!-- active = today, date-DD = day of month -->
 *     <div class="grid-item">
 *       <h4><a href="/film/amrum/">Amrum</a></h4>
 *       <ul class="showtimes-list">
 *         <li><a href="http://www.fandango.com/quadcinema_aaefp/theaterpage?date=2026-06-02">1.45pm</a></li>
 *       </ul>
 *     </div>
 *   </div>
 *
 * Times use "." as separator (e.g. "1.45pm", "12.30pm") rather than ":".
 * The Fandango link includes ?date=YYYY-MM-DD already.
 *
 * If Quad redesigns, check:
 *   - day-wrap.date-{DD} selector
 *   - h4 > a[href*="/film/"] for title
 *   - .showtimes-list li a for time + ticket link
 */

import * as cheerio from 'cheerio';
import type { Screening } from './types.js';
import { USER_AGENT, toETISO, etCalendarDays, groupIntoScreenings } from './utils.js';

const BASE = 'https://quadcinema.com';

// Parse Quad's "1.45pm" / "12.30pm" / "10.45am" format → "HH:MM:00"
function parseQuadTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{2})(am|pm)$/i);
  if (!m) return '00:00:00';
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = m[3].toLowerCase();
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:00`;
}

function extractDayFilms(
  $: cheerio.CheerioAPI,
  dayOfMonth: number,
  dateStr: string
): Array<{ title: string; showtime: string; ticketUrl: string }> {
  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];
  const $day = $(`.day-wrap.date-${String(dayOfMonth).padStart(2, '0')}`);
  if (!$day.length) return sessions;

  $day.find('.grid-item').each((_, item) => {
    const $item = $(item);
    const title = $item.find('h4 a[href*="/film/"]').first().text().trim();
    if (!title) return;

    $item.find('.showtimes-list li a').each((_, a) => {
      const timeText = $(a).text().trim();
      if (!timeText.match(/\d\.\d{2}(am|pm)/i)) return;
      const ticketUrl = $(a).attr('href') || BASE;
      sessions.push({
        title: title.toUpperCase(),
        showtime: toETISO(`${dateStr}T${parseQuadTime(timeText)}`),
        ticketUrl,
      });
    });
  });

  return sessions;
}

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();

  const res = await fetch(BASE, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Quad Cinema HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const todayDay    = parseInt(today.slice(8, 10));
  const tomorrowDay = parseInt(tomorrow.slice(8, 10));

  const sessions = [
    ...extractDayFilms($, todayDay, today),
    ...extractDayFilms($, tomorrowDay, tomorrow),
  ];

  return groupIntoScreenings(sessions);
}

if (process.argv[1]?.endsWith('quad.ts') || process.argv[1]?.endsWith('quad.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
