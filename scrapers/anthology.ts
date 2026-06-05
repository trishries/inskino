import type { Screening } from './types.js';
import { fetchVeezi } from './veezi.js';

// Anthology Film Archives uses Veezi ticketing.
// If Anthology ever migrates off Veezi, update the siteToken or replace this with
// a different adapter while keeping the fetchToday() export signature unchanged.
const SITE_TOKEN = 'bsrxtagjxmgh2qy0b6p646xdcr';

export async function fetchToday(): Promise<Screening[]> {
  return fetchVeezi(SITE_TOKEN);
}

// Run standalone: npx tsx scrapers/anthology.ts
if (process.argv[1]?.endsWith('anthology.ts') || process.argv[1]?.endsWith('anthology.js')) {
  fetchToday().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error);
}
