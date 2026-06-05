/**
 * Generic Veezi ticketing adapter.
 *
 * Veezi serves sessions as a static HTML page. The structure is:
 *   <h3>FILM TITLE</h3>
 *   <h4>Tue 2 Jun</h4>
 *   <ul>
 *     <li><a href="/purchase/{ID}?siteToken=...">6:30 PM</a></li>
 *   </ul>
 *   ... more date/ul pairs for the same film ...
 *   <h3>NEXT FILM</h3>
 *
 * If Veezi changes their HTML structure, update the selectors here.
 * Canonical URL: https://ticketing.uswest.veezi.com/sessions/{siteToken}
 */

import * as cheerio from 'cheerio';
import type { Screening } from './types.js';
import {
  USER_AGENT,
  parseVeeziDate,
  parseTime,
  toETISO,
  isTodayOrTomorrow,
  groupIntoScreenings,
} from './utils.js';

const BASE = 'https://ticketing.uswest.veezi.com';

export async function fetchVeezi(siteToken: string): Promise<Screening[]> {
  const url = `${BASE}/sessions/${siteToken}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Veezi HTTP ${res.status} for ${url}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];
  let currentTitle = '';
  let currentDate = '';

  // Walk through all significant elements in document order
  $('h3, h4, ul').each((_, el) => {
    const tag = el.type === 'tag' ? el.name.toLowerCase() : '';
    if (tag === 'h3') {
      currentTitle = $(el).text().trim();
    } else if (tag === 'h4') {
      currentDate = $(el).text().trim();
    } else if (tag === 'ul' && currentTitle && currentDate) {
      const dateStr = parseVeeziDate(currentDate);
      if (!isTodayOrTomorrow(dateStr)) return;

      $(el)
        .find('a[href*="/purchase/"]')
        .each((_, a) => {
          const timeText = $(a).text().trim();
          const href = $(a).attr('href') || '';
          // Make absolute if relative
          const ticketUrl = href.startsWith('http') ? href : `${BASE}${href}`;
          const showtime = toETISO(`${dateStr}T${parseTime(timeText)}`);
          sessions.push({ title: currentTitle, showtime, ticketUrl });
        });
    }
  });

  return groupIntoScreenings(sessions);
}
