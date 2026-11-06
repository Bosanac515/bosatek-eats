// Daily data run (GitHub Action or `npm run scrape`). Fetches what the schedule says is due,
// validates everything, and only then overwrites public/data. Any failure keeps the last good
// files and records the error in meta.json so the UI can show a stale warning.
//   --locations   also re-read /locations and every venue page (25 requests; do it each term)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Category, Hours, Location, Menu, Meta, Slot } from '../src/data/types';
import { validate } from '../src/data/schema';
import { isuSource, tiers } from './adapters/isu';
import { BlockedError, PoliteFetcher } from './adapters/fetcher';
import type { Source } from './adapters/source';
import { addDays, amesDate, dueMenus, type Schedule } from './schedule';

const OUT = 'public/data';
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const write = (p: string, v: unknown) => writeFileSync(p, `${JSON.stringify(v, null, 1)}\n`);

interface ManualVenue {
  slug: string; name: string; category: Category; building: string;
  accepts: Location['accepts']; menuUrl: string; hours: Record<string, [string, string][]>;
}
interface Overrides { [slug: string]: { category?: Category; mealSwipe?: boolean } }

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Manual venues reuse the coordinates/address of the venue they sit in (MU Food Court). */
export function manualLocations(manual: ManualVenue[], anchor: Location | undefined): Location[] {
  return manual.map((v) => ({
    slug: v.slug, isuId: null, name: v.name, category: v.category, listedAs: null, building: v.building,
    address: anchor?.address ?? null, lat: anchor?.lat ?? null, lng: anchor?.lng ?? null,
    accepts: [...v.accepts].sort(), payment: tiers(v.category, v.accepts), source: 'manual', url: v.menuUrl,
  }));
}

export function manualHours(manual: ManualVenue[], start: string, days: number): Hours {
  const out: Hours = {};
  for (const v of manual) {
    out[v.slug] = {};
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const wd = WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
      out[v.slug][d] = (v.hours[wd] ?? []).map(([a, b]): Slot => ({ start: a, end: b, period: null }));
    }
  }
  return out;
}

async function buildLocations(src: Source, overrides: Overrides, manual: ManualVenue[]): Promise<Location[]> {
  const listed = await src.listVenues();
  if (listed.length < 10) throw new Error(`only ${listed.length} venues on /locations; page layout may have changed`);
  const locs: Location[] = [];
  for (const v of listed) {
    const d = await src.venueDetails(v.slug);
    const o = overrides[v.slug] ?? {};
    const category = o.category ?? v.category;
    locs.push({
      slug: v.slug, isuId: v.isuId, name: v.name, category, listedAs: v.category, building: v.building,
      address: d.address, lat: d.lat, lng: d.lng, accepts: d.accepts,
      payment: tiers(category, d.accepts, o.mealSwipe), source: 'isu', url: `https://dining.iastate.edu/location/${v.slug}`,
    });
  }
  return [...locs, ...manualLocations(manual, locs.find((l) => l.slug === 'memorial-union-food-court'))];
}

export async function run(src: Source, opts: { locations: boolean; now?: Date; out?: string; config?: string }) {
  const out = opts.out ?? OUT;
  const cfg = opts.config ?? 'config';
  const schedule = read<Schedule>(join(cfg, 'schedule.json'));
  const manual = read<{ venues: ManualVenue[] }>(join(cfg, 'manual-venues.json')).venues;
  const overrides = read<Overrides>(join(cfg, 'locations.overrides.json'));
  const today = amesDate(opts.now);
  const errors: string[] = [];
  mkdirSync(join(out, 'menus'), { recursive: true });

  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`.slice(0, 300));
      if (e instanceof BlockedError) throw e;
    }
  };

  try {
    const locPath = join(out, 'locations.json');
    let locs = existsSync(locPath) ? validate.locations(read(locPath)) : null;
    if (opts.locations || !locs) {
      await step('locations', async () => {
        locs = validate.locations(await buildLocations(src, overrides, manual));
        write(locPath, locs);
      });
    }
    if (!locs) throw new Error('no locations available');
    const all: Location[] = locs;

    await step('hours', async () => {
      const isu = await src.hours(all.filter((l) => l.source === 'isu'), today, schedule.hoursDays);
      write(join(out, 'hours.json'), validate.hours({ ...isu, ...manualHours(manual, today, schedule.hoursDays) }));
    });

    // A weekly menu older than 6 days counts as missing, so one failed weekly run is retried next day.
    const fresh = (s: string) => {
      const p = join(out, 'menus', `${s}.json`);
      if (!existsSync(p)) return false;
      if (!schedule.weekly.venues.includes(s)) return true;
      return (opts.now ?? new Date()).getTime() - Date.parse(read<Menu>(p).fetchedAt) < 6 * 86_400_000;
    };
    const have = new Set(all.map((l) => l.slug).filter(fresh));
    for (const job of dueMenus(schedule, today, have)) {
      const loc = all.find((l) => l.slug === job.slug);
      if (!loc) { errors.push(`menu ${job.slug}: not in locations.json`); continue; }
      await step(`menu ${job.slug}`, async () => {
        const items = [];
        for (let i = 0; i < job.days; i++) items.push(...(await src.menu(loc, addDays(today, i))));
        const menu: Menu = { venue: loc.slug, fetchedAt: new Date().toISOString(), fixed: job.fixed, items };
        write(join(out, 'menus', `${loc.slug}.json`), validate.menu(menu));
      });
    }
  } catch (e) {
    if (!errors.some((x) => x.includes((e as Error).message))) errors.push((e as Error).message.slice(0, 300));
  }

  const metaPath = join(out, 'meta.json');
  const prev = existsSync(metaPath) ? read<Meta>(metaPath) : null;
  const now = new Date().toISOString();
  const meta: Meta = { lastAttempt: now, lastSuccess: errors.length ? (prev?.lastSuccess ?? null) : now, ok: !errors.length, errors };
  write(metaPath, validate.meta(meta));
  return meta;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const schedule = read<Schedule>('config/schedule.json');
  const fetcher = new PoliteFetcher(2000, schedule.maxRequestsPerRun);
  const meta = await run(isuSource(fetcher), { locations: process.argv.includes('--locations') });
  console.log(`${fetcher.count} requests; ok=${meta.ok}`);
  for (const e of meta.errors) console.error(`  ${e}`);
  process.exit(meta.ok ? 0 : 1);
}
