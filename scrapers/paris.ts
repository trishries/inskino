/**
 * Paris Theater — paristheaternyc.com
 *
 * Single-screen Netflix-operated venue at 4 W. 58th St, NYC.
 * Runs on Vista's OCAPI platform.
 *
 * Auth: POST https://auth.moviexchange.com/connect/token
 *   grant_type=password, username/password/client_id are a public
 *   "webhost browsing" service account baked into the site's JS bundle.
 *   Tokens expire ~12 h — always fetch a fresh one; never hardcode.
 *
 * Data: GET https://digital-api.paristheaternyc.com/ocapi/v1/showtimes/by-business-date/{YYYY-MM-DD}?siteIds=2001
 *   Response: { showtimes[], relatedData: { films[], attributes[] } }
 *   Each showtime has: id, schedule.startsAt (full ET ISO), filmId, attributeIds, isSoldOut
 *
 * Ticket URL: https://tickets.paristheaternyc.com/order/showtimes/2001-{sessionId}/seats
 *
 * If the site migrates: look for "webhost-browsing" credentials in their JS bundle,
 * or check the Network tab for a POST to auth.moviexchange.com/connect/token.
 *
 * Note: Vista OCAPI is also used by other cinemas — this can be generalized
 * by siteId the same way veezi.ts is parameterized by siteToken.
 */

import type { Screening } from './types.js';
import { USER_AGENT, etCalendarDays, groupIntoScreenings } from './utils.js';

const TOKEN_URL   = 'https://auth.moviexchange.com/connect/token';
const API_BASE    = 'https://digital-api.paristheaternyc.com/ocapi/v1';
const SITE_ID     = 2001;
const TICKET_BASE = 'https://tickets.paristheaternyc.com/order/showtimes';
const SITE_URL    = 'https://www.paristheaternyc.com';

// Public browsing service-account credentials (from the site's compiled JS bundle).
// These are intentionally public — the site embeds them for unauthenticated read access.
const CREDS = {
  username:  'webhost-browsing-parisnyc',
  password:  'HzaJe65EAPNto7sR5',
  client_id: 'webhost-browsing-parisnyc',
};

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  'Origin':     SITE_URL,
  'Referer':    SITE_URL + '/',
};

async function getToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    username:   CREDS.username,
    password:   CREDS.password,
    client_id:  CREDS.client_id,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { ...COMMON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Paris token: HTTP ${res.status}`);
  const data = await res.json() as { access_token?: string };
  const token = data.access_token;
  if (!token) throw new Error('Paris token: no access_token in response');
  return token;
}

interface OcapiResponse {
  showtimes: Array<{
    id: string;
    schedule: { startsAt: string }; // full ET ISO, e.g. "2026-06-02T22:30:00-04:00"
    filmId: string;
    isSoldOut: boolean;
    attributeIds: string[];
  }>;
  relatedData: {
    films: Array<{ id: string; title: { text: string } }>;
    attributes: Array<{ id: string; shortName: { text: string } | null }>;
  };
}

async function fetchDay(
  token: string,
  dateStr: string
): Promise<Array<{ title: string; showtime: string; ticketUrl: string }>> {
  const url = `${API_BASE}/showtimes/by-business-date/${dateStr}?siteIds=${SITE_ID}`;
  const res = await fetch(url, {
    headers: {
      ...COMMON_HEADERS,
      'Authorization':  `Bearer ${token}`,
      'Content-Type':   'application/json',
    },
  });
  if (!res.ok) throw new Error(`Paris ${dateStr}: HTTP ${res.status}`);

  const data = await res.json() as OcapiResponse;
  const titleById = new Map(
    (data.relatedData?.films ?? []).map(f => [f.id, f.title.text])
  );

  const sessions: Array<{ title: string; showtime: string; ticketUrl: string }> = [];
  for (const s of data.showtimes ?? []) {
    const title = titleById.get(s.filmId);
    if (!title) continue;
    sessions.push({
      title,
      showtime: s.schedule.startsAt, // already a correct ET ISO datetime
      ticketUrl: `${TICKET_BASE}/${s.id}/seats`,
    });
  }
  return sessions;
}

export async function fetchToday(): Promise<Screening[]> {
  const { today, tomorrow } = etCalendarDays();
  const token = await getToken();

  const [todaySessions, tomorrowSessions] = await Promise.all([
    fetchDay(token, today),
    fetchDay(token, tomorrow),
  ]);

  return groupIntoScreenings([...todaySessions, ...tomorrowSessions]);
}

if (process.argv[1]?.endsWith('paris.ts') || process.argv[1]?.endsWith('paris.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
