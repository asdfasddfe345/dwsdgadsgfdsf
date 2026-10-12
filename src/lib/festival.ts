import { todayInIndia } from './spinRewards';

// Vijayadashami 2026 falls on 20 October and the tithi runs into the 21st. After that day the site goes back to normal by itself.
// ponytail: one festival with its last day in code. Move it to site_settings if the owner wants to switch themes from Admin.
const DASARA_LAST_DAY = '2026-10-21';

/** The festival the site is dressed for today, or null on an ordinary day. */
export const festival = todayInIndia() <= DASARA_LAST_DAY
  ? { name: 'Dasara', greeting: 'Happy Dasara', greetingTelugu: 'దసరా శుభాకాంక్షలు' }
  : null;
