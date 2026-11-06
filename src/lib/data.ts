// The app's only way in to the data files. Everything is validated before use, even our own
// files, because they are built from scraped content.
import { validate } from '../data/schema';
import type { Hours, Location, Meta, Slot } from '../data/types';

async function load<T>(path: string, check: (v: unknown) => T): Promise<T> {
  const res = await fetch(`/data/${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return check(await res.json());
}

export const loadLocations = () => load('locations.json', validate.locations);
export const loadHours = () => load('hours.json', validate.hours);
export const loadMeta = () => load('meta.json', validate.meta);
export const loadMenu = (slug: string) => load(`menus/${encodeURIComponent(slug)}.json`, validate.menu);

/** Date and HH:MM in Ames, regardless of the device's timezone. */
export function amesNow(now = new Date()): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function slotsToday(hours: Hours, loc: Location, now = new Date()): Slot[] | undefined {
  return hours[loc.slug]?.[amesNow(now).date];
}

export function openNow(hours: Hours, loc: Location, now = new Date()): boolean {
  const { time } = amesNow(now);
  return (slotsToday(hours, loc, now) ?? []).some((s) => s.start <= time && time < s.end);
}

/** Data is stale if the last run failed or the last success is over 2 days old. */
export function isStale(meta: Meta, now = new Date()): boolean {
  return !meta.ok || !meta.lastSuccess || now.getTime() - Date.parse(meta.lastSuccess) > 2 * 86_400_000;
}

export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  if (h === 24 || h === 0) return m ? `12:${String(m).padStart(2, '0')} AM` : 'midnight';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
