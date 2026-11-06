// ISU Dining adapter. Endpoints come from the site's own JS; see docs/DISCOVERY.md.
// Parsers are pure (tested against tests/fixtures); fetching goes through PoliteFetcher.
import type { Accept, Allergen, Category, Diet, Hours, Location, MenuItem, Tier } from '../../src/data/types';
import { ACCEPTS, CATEGORIES, DIETS } from '../../src/data/types';
import { clean, hhmm, num } from './sanitize';
import type { PoliteFetcher } from './fetcher';
import type { Source } from './source';

export const BASE = 'https://dining.iastate.edu';

const ALLERGEN_MAP: Record<string, Allergen> = {
  dairy: 'dairy', eggs: 'eggs', fish: 'fish', peanuts: 'peanuts', crustacean_shellfish: 'shellfish',
  soy: 'soy', sesame_tahini: 'sesame', treenuts: 'tree-nuts', wheat_gluten: 'wheat-gluten',
};
const NOT_DIET: Record<string, Diet> = { not_halal: 'halal', not_vegan: 'vegan', not_vegetarian: 'vegetarian' };

export interface ListedVenue { isuId: number; slug: string; name: string; category: Category; building: string | null }

/** /locations: venue cards grouped by <div class="card-set" data-type="{category}">. */
export function parseLocationsPage(html: string): ListedVenue[] {
  const out: ListedVenue[] = [];
  for (const block of html.split('<div class="card-set" data-type="').slice(1)) {
    const category = block.slice(0, block.indexOf('"')) as Category;
    if (!CATEGORIES.includes(category)) continue;
    for (const card of block.split('data-venue-id="').slice(1)) {
      const m = /href="\/location\/([a-z0-9-]+)">([^<]+)<\/a>/.exec(card);
      const id = Number(card.slice(0, card.indexOf('"')));
      if (!m || !Number.isInteger(id)) continue;
      const b = /label-building">([^<]+)/.exec(card.slice(0, 3000));
      out.push({ isuId: id, slug: m[1], name: clean(m[2], 80) ?? m[1], category, building: clean(b?.[1], 80) });
    }
  }
  return out;
}

export interface VenueDetails { lat: number | null; lng: number | null; address: string | null; accepts: Accept[] }

/** /location/{slug}: map coordinates, Accepts badges, and the venue's own Location block. */
export function parseVenuePage(html: string): VenueDetails {
  const m = /id="dining-venue-map"[^>]*data-lat="([-\d.]+)"[^>]*data-lng="([-\d.]+)"/.exec(html);
  const a = html.indexOf('Accepts');
  const badges = a < 0 ? [] : [...html.slice(a, a + 1500).matchAll(/badge text-bg-secondary">([^<]+)/g)]
    .map((x) => clean(x[1]))
    .filter((x): x is Accept => ACCEPTS.includes(x as Accept));
  // The page footer has ISU Dining's office address; only read inside the venue block.
  const i = html.indexOf('class="dining-venue"');
  const j = html.indexOf('venue-menu', i);
  const block = html.slice(i, j > i ? j : undefined).replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
  const addr = /Location[|\s]+[^|]+?[|\s]+([^|]+?, IA \d{5})/.exec(block);
  return {
    lat: m ? num(m[1], -90, 90, 7) : null,
    lng: m ? num(m[2], -180, 180, 7) : null,
    address: clean(addr?.[1], 120),
    accepts: [...new Set(badges)].sort(),
  };
}

/** Payment tiers a venue supports, from its badges. Express comes from category, not badges. */
export function tiers(category: Category, accepts: readonly Accept[], mealSwipe = false): Tier[] {
  const has = (x: Accept) => accepts.includes(x);
  const t: Tier[] = [];
  if (has('Meal Plan') && (category === 'dining-center' || mealSwipe)) t.push('meal-swipe');
  if (has('Meal Plan') && category === 'express') t.push('express-meal');
  if (has('Flex Meal')) t.push('flex-meal');
  if (has('Dining Dollars')) t.push('dining-dollars');
  if (has('Credit') || has('ISU Card') || has('Cash')) t.push('pay');
  return t;
}

interface RawSlot { starthours?: unknown; endhours?: unknown; comment?: unknown }
const slot = (s: RawSlot) => ({ start: hhmm(s.starthours), end: hhmm(s.endhours), period: clean(s.comment, 40) });

/** /api/dining/hours: {locs: {id: {days: {date: [slot]}}}} -> Hours keyed by slug. */
export function parseHours(json: unknown, slugById: Map<number, string>): Hours {
  const locs = (json as { locs?: Record<string, { days?: Record<string, RawSlot[]> }> }).locs ?? {};
  const out: Hours = {};
  for (const [id, e] of Object.entries(locs)) {
    const slug = slugById.get(Number(id));
    if (!slug || !e.days) continue;
    out[slug] = Object.fromEntries(
      Object.entries(e.days)
        .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .map(([d, slots]) => [d, (Array.isArray(slots) ? slots : []).map(slot)]),
    );
  }
  return out;
}

type Obj = Record<string, unknown>;
const vals = (v: unknown): Obj[] => (v && typeof v === 'object' ? Object.values(v as Obj) as Obj[] : []);
const keys = (v: unknown): string[] => (v && typeof v === 'object' ? Object.keys(v) : []);

/** /api/venue/{id}/menu/{date}: nested meals -> displays -> categories -> items. html_render is ignored. */
export function parseMenu(json: unknown): MenuItem[] {
  const items: MenuItem[] = [];
  for (const meal of vals((json as Obj).meals)) {
    for (const disp of vals(meal.menu_displays)) {
      for (const cat of vals(disp.categories)) {
        for (const it of vals(cat.items)) {
          const nut = (it.nutrients ?? {}) as Record<string, { quantity?: unknown } | undefined>;
          const q = (k: string) => num(nut[k]?.quantity);
          const tr = it.traits as Record<string, Obj | null> | null | undefined;
          const notDiet = new Set(keys(tr?.miscellaneous_special_diet_info).map((k) => NOT_DIET[k]));
          const date = clean(meal.date, 10);
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          items.push({
            id: clean(it.oid, 20) ?? '',
            name: clean(it.name, 120) ?? '',
            station: clean(it.serving_station ?? disp.name, 60),
            category: clean(it.category_display_name, 60),
            mealPeriod: clean(meal.meal, 40),
            date,
            servingSize: clean(it.unit_of_measure_name, 40),
            servingGrams: num(it.unit_of_measure_net_weight_gram, 0, 5000),
            calories: num(nut.kcal?.quantity, 0, 5000),
            proteinG: q('pro'), carbsG: q('cho'), fatG: q('fat'), fiberG: q('fibtg'), sugarG: q('sugar'),
            sodiumMg: num(nut.na?.quantity, 0, 20000),
            diet: keys(tr?.requirement).filter((k): k is Diet => DIETS.includes(k as Diet) && !notDiet.has(k as Diet)).sort(),
            // No traits at all = no data from the source: UNKNOWN, never "allergen-free".
            allergens: tr ? keys(tr.allergen).map((k) => ALLERGEN_MAP[k]).filter((x): x is Allergen => !!x).sort() : null,
            ingredients: clean(it.ingredients, 2000),
          });
        }
      }
    }
  }
  return items.filter((i) => i.id && i.name);
}

export function isuSource(f: PoliteFetcher): Source {
  return {
    name: 'isu',
    async listVenues() {
      return parseLocationsPage(await f.text(`${BASE}/locations`));
    },
    async venueDetails(slug) {
      return parseVenuePage(await f.text(`${BASE}/location/${encodeURIComponent(slug)}`));
    },
    async hours(locs, start, days) {
      const ids = locs.flatMap((l) => (l.isuId === null ? [] : [l.isuId]));
      const url = `${BASE}/api/dining/hours?locs=${ids.join(',')}&date=${start}&days=${days}`;
      return parseHours(await f.json(url), new Map(locs.map((l) => [l.isuId ?? -1, l.slug])));
    },
    async menu(loc: Location, date) {
      if (loc.isuId === null) return [];
      return parseMenu(await f.json(`${BASE}/api/venue/${loc.isuId}/menu/${date}`));
    },
  };
}
