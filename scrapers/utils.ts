export const USER_AGENT =
  'InsKino/1.0 (NYC arthouse showtimes; +https://github.com/inskino/inskino)';

// US DST: 2nd Sunday of March (2 AM) → 1st Sunday of November (2 AM)
export function etOffset(dateStr: string): '-04:00' | '-05:00' {
  const [y, m, d] = dateStr.split('-').map(Number);

  const march1Dow = new Date(y, 2, 1).getDay(); // 0=Sun
  const dstStartDay = 8 + (7 - march1Dow) % 7; // 2nd Sunday of March

  const nov1Dow = new Date(y, 10, 1).getDay();
  const dstEndDay = 1 + (7 - nov1Dow) % 7; // 1st Sunday of November

  const afterStart = m > 3 || (m === 3 && d >= dstStartDay);
  const beforeEnd  = m < 11 || (m === 11 && d < dstEndDay);

  return afterStart && beforeEnd ? '-04:00' : '-05:00';
}

// Convert a naive local ET datetime string to a full ISO string with offset.
// Input: "2026-06-02T19:30:00" or "2026-06-02T19:30"
export function toETISO(naive: string): string {
  const datePart = naive.slice(0, 10);
  let timePart = naive.includes('T') ? naive.slice(11) : '00:00:00';
  if (timePart.length === 5) timePart += ':00'; // "HH:MM" → "HH:MM:00"
  return `${datePart}T${timePart}${etOffset(datePart)}`;
}

// Parse "7:45 PM" or "7:45PM" or "19:45" into "HH:MM:00"
export function parseTime(raw: string): string {
  const s = raw.trim();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const min = m12[2];
    const ampm = m12[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}:00`;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    return `${m24[1].padStart(2, '0')}:${m24[2]}:00`;
  }
  return '00:00:00';
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Parse Veezi-style date: "Tue 2 Jun" → "YYYY-MM-DD"
// Year is inferred by picking the nearest future occurrence.
export function parseVeeziDate(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  const day = parseInt(parts[1]);
  const monthKey = parts[2]?.toLowerCase().slice(0, 3);
  const month = MONTH_MAP[monthKey ?? ''] ?? 1;
  const now = new Date();
  let year = now.getFullYear();
  // If this month/day is before today in the current year, it wraps to next year
  if (month < now.getMonth() + 1 || (month === now.getMonth() + 1 && day < now.getDate())) {
    year++;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Returns today's and tomorrow's calendar dates in ET as YYYY-MM-DD strings.
export function etCalendarDays(): { today: string; tomorrow: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // "YYYY-MM-DD"

  const [y, mo, d] = parts.split('-').map(Number);
  const todayDate = new Date(y, mo - 1, d);
  const tomorrowDate = new Date(y, mo - 1, d + 1);

  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  return { today: fmt(todayDate), tomorrow: fmt(tomorrowDate) };
}

// Is dateStr (YYYY-MM-DD) today or tomorrow in ET?
export function isTodayOrTomorrow(dateStr: string): boolean {
  const { today, tomorrow } = etCalendarDays();
  return dateStr === today || dateStr === tomorrow;
}

// Group an array of {title, showtime, ticketUrl} into Screening[]
export function groupIntoScreenings(
  sessions: Array<{ title: string; showtime: string; ticketUrl: string }>
): import('./types.js').Screening[] {
  const map = new Map<string, { showtimes: string[]; ticketUrl: string }>();
  for (const { title, showtime, ticketUrl } of sessions) {
    if (!map.has(title)) map.set(title, { showtimes: [], ticketUrl });
    map.get(title)!.showtimes.push(showtime);
  }
  return Array.from(map.entries()).map(([title, { showtimes, ticketUrl }]) => ({
    title,
    showtimes: [...new Set(showtimes)].sort(),
    ticketUrl,
  }));
}
