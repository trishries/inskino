/**
 * IFC Center — ifccenter.com
 *
 * Showtimes live in a widget on the homepage. Structure (verified June 2026):
 *
 *   <div class="daily-schedule tue active">
 *     <ul>
 *       <li>
 *         <a class="" href="/films/ask-e-jean/"></a>
 *         <div class="details">
 *           <h3>Ask E. Jean</h3>
 *           <ul class="times">
 *             <li><a href="https://tickets.ifccenter.com/websales/...">10:35 AM</a></li>
 *           </ul>
 *         </div>
 *       </li>
 *     </ul>
 *   </div>
 *   <div class="daily-schedule wed">...</div>
 *
 * Day classes: sun mon tue wed thu fri sat
 *
 * If IFC Center redesigns, check:
 *   - The .daily-schedule.{dow} selector
 *   - The .details h3 title selector
 *   - The .times a ticket link selector
 */

import * as cheerio from 'cheerio';
import type { Screening } from './types.js';
import { USER_AGENT, parseTime, toETISO, etCalendarDays, groupIntoScreenings } from './utils.js';

const HOME = 'https://www.ifccenter.com';
const DOW_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();

  const res = await fetch(HOME, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`IFC Center HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];

  for (const dateStr of [today, tomorrow]) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dowName = DOW_NAMES[new Date(y, m - 1, d).getDay()];

    const $daySection = $(`.daily-schedule.${dowName}`);
    if (!$daySection.length) continue;

    $daySection.find('> ul > li').each((_, li) => {
      const $li = $(li);
      const title = $li.find('.details h3').first().text().trim();
      if (!title) return;

      $li.find('.times a[href*="tickets.ifccenter.com"]').each((_, a) => {
        const timeText = $(a).text().trim();
        if (!timeText.match(/\d:\d{2}/)) return;
        const ticketUrl = $(a).attr('href') || HOME;
        sessions.push({
          title: title.toUpperCase(),
          showtime: toETISO(`${dateStr}T${parseTime(timeText)}`),
          ticketUrl,
        });
      });
    });
  }

  return groupIntoScreenings(sessions);
}

if (process.argv[1]?.endsWith('ifccenter.ts') || process.argv[1]?.endsWith('ifccenter.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
