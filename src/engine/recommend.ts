// "Eat next": deterministic and explainable. Hard filters first, then a score built from parts
// that each produce a plain-language reason. No learning, no randomness.
import type { Hours, Location, Menu, MenuItem, Slot, Tier } from '../data/types';
import type { Profile } from '../storage/profile';
import { mealTargets, type Targets } from './targets';

export interface PlanRules { id: string; expressPerDay: number; flexMeals: boolean; diningCenterMeals: number | string; expressDrawsFromSwipes: boolean }
/** What's left today per the optional tracker; omit to assume everything is available. */
export interface Left { swipes: boolean; express: boolean }
export interface Pos { lat: number; lng: number }

export const TIER_LABEL: Record<Tier, string> = {
  'meal-swipe': 'a meal swipe', 'express-meal': 'an express meal', 'flex-meal': 'a Flex Meal',
  'dining-dollars': 'Dining Dollars', pay: 'card or cash',
};

export function haversineM(a: Pos, b: Pos): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const walkMin = (m: number) => Math.max(1, Math.round(m / 80));

/** Tiers the user allows that their plan actually has, in the user's order. */
export function usableTiers(p: Profile, plan: PlanRules | undefined, left: Left = { swipes: true, express: true }): Tier[] {
  return p.tiers.filter((t) =>
    t === 'meal-swipe' ? p.plan !== 'none' && left.swipes
    : t === 'express-meal' ? !!plan && plan.expressPerDay > 0 && left.express
    : t === 'flex-meal' ? !!plan?.flexMeals
    : true);
}

/** The best way this user can pay at this venue, or null if none of their tiers work there. */
export function venueTier(loc: Location, usable: Tier[]): { tier: Tier; rank: number } | null {
  const rank = usable.findIndex((t) => loc.payment.includes(t));
  return rank < 0 ? null : { tier: usable[rank], rank };
}

export function openSlot(hours: Hours, slug: string, date: string, time: string): Slot | null {
  return (hours[slug]?.[date] ?? []).find((s) => s.start <= time && time < s.end) ?? null;
}

export function nextSlot(hours: Hours, slug: string, date: string, time: string): Slot | null {
  return (hours[slug]?.[date] ?? []).find((s) => s.start > time) ?? null;
}

/** Hard filters: diet, allergens (unknown counts as unsafe), dislikes. */
export function allowed(item: MenuItem, p: Profile): boolean {
  if (!p.diet.every((d) => item.diet.includes(d))) return false;
  if (p.allergens.length && (item.allergens === null || item.allergens.some((a) => p.allergens.includes(a)))) return false;
  const text = `${item.name} ${item.ingredients ?? ''}`.toLowerCase();
  return !p.dislikes.some((d) => d.trim() && text.includes(d.trim().toLowerCase()));
}

/** Items being served now: today's items in the open meal period (all items for fixed menus). */
export function itemsNow(menu: Menu, slot: Slot | null, date: string): MenuItem[] {
  if (menu.fixed) return dedupe(menu.items);
  const today = menu.items.filter((i) => i.date === date);
  const inPeriod = slot?.period ? today.filter((i) => i.mealPeriod === slot.period) : today;
  // Hours and menus sometimes name periods differently ("Continuous Service" vs "Lunch").
  return dedupe(inPeriod.length ? inPeriod : today);
}

const dedupe = (items: MenuItem[]) => [...new Map(items.map((i) => [`${i.station}|${i.name}`, i])).values()];

// Category names come from ISU's menus (see public/data/menus); anything unlisted is neither.
const NOT_FOOD = /condiment|sauce|dressing|topping|note|app only|base option|feature|beverage|drink|creamer/i;
const MAIN_CAT = /entr[eé]e|pizza|sandwich|wrap|salad|express meal|bowl|pok[eé]|burger|plate/i;
const SIDE_CAT = /side|soup|fruit|dessert|bagel|muffin|bread|pastr|cookie|bar/i;
const isFood = (i: MenuItem) => i.calories !== null && i.calories > 0 && !i.name.startsWith('--') && !NOT_FOOD.test(i.category ?? '');

export interface Option {
  items: MenuItem[];
  kcal: number;
  proteinG: number;
  score: number;
  reasons: string[];
}

const sum = (xs: MenuItem[], k: 'calories' | 'proteinG') => Math.round(xs.reduce((a, i) => a + (i[k] ?? 0), 0));
const fit = (kcal: number, t: number) => Math.max(0, 1 - Math.abs(kcal - t) / t);

/** Up to n meals built around different mains, each topped up with sides toward the target. */
export function buildOptions(items: MenuItem[], t: Targets, n = 3): Option[] {
  const food = items.filter(isFood);
  let mains = food.filter((i) => MAIN_CAT.test(i.category ?? ''));
  if (!mains.length) mains = food.filter((i) => (i.calories ?? 0) >= 250); // venues without entree categories
  const sides = food.filter((i) => !mains.includes(i) && SIDE_CAT.test(i.category ?? '') && (i.calories ?? 0) < 450);
  const combos = mains.map((main) => {
    const picked = [main];
    while (picked.length < 3 && sum(picked, 'calories') < t.kcal * 0.85) {
      const best = sides
        .filter((s) => !picked.includes(s))
        .map((s) => ({ s, f: fit(sum([...picked, s], 'calories'), t.kcal) }))
        .sort((a, b) => b.f - a.f || a.s.name.localeCompare(b.s.name))[0];
      if (!best || best.f <= fit(sum(picked, 'calories'), t.kcal)) break;
      picked.push(best.s);
    }
    const kcal = sum(picked, 'calories'), proteinG = sum(picked, 'proteinG');
    const score = 0.7 * fit(kcal, t.kcal) + 0.3 * Math.min(1, proteinG / Math.max(t.proteinG, 1));
    return { items: picked, kcal, proteinG, score, reasons: [] as string[] };
  });
  combos.sort((a, b) => b.score - a.score || a.items[0].name.localeCompare(b.items[0].name));
  // Variety: prefer a different station for each option, then fill with the best remaining.
  const seen = new Set<string>();
  const unique = combos.filter((c) => {
    const k = c.items.map((i) => i.id).sort().join();
    return !seen.has(k) && seen.add(k);
  });
  const out: Option[] = [];
  const stations = new Set<string | null>();
  for (const c of unique) if (out.length < n && !stations.has(c.items[0].station)) { out.push(c); stations.add(c.items[0].station); }
  for (const c of unique) if (out.length < n && !out.includes(c)) out.push(c);
  return out;
}

export function reasons(o: Option, t: Targets, period: string | null, pay: { tier: Tier; rank: number }, distM: number | null, p: Profile): string[] {
  const meal = period ? period.toLowerCase() : 'meal';
  const diff = o.kcal - t.kcal;
  const r = [
    Math.abs(diff) <= t.kcal * 0.15 ? `About ${o.kcal} kcal, close to your ~${t.kcal} kcal ${meal} target`
    : diff < 0 ? `About ${o.kcal} kcal, a lighter pick than your ~${t.kcal} kcal ${meal} target`
    : `About ${o.kcal} kcal, more than your ~${t.kcal} kcal ${meal} target`,
    `${o.proteinG} g protein toward ~${t.proteinG} g for this meal`,
    `Pay with ${TIER_LABEL[pay.tier]}${pay.rank === 0 ? ', your first choice' : ''}`,
  ];
  if (distM !== null) r.push(`${walkMin(distM)} min walk`);
  if (p.diet.length) r.push(`Marked ${p.diet.join(' and ')} by ISU Dining`);
  if (p.allergens.length) r.push(`ISU lists none of your allergens for these items. Confirm with staff`);
  return r;
}

export interface VenuePick {
  loc: Location;
  slot: Slot;
  pay: { tier: Tier; rank: number };
  distM: number | null;
  nearby: boolean;
  options: Option[];
  target: Targets;
}

export interface EatNextInput {
  profile: Profile;
  plan: PlanRules | undefined;
  locations: Location[];
  hours: Hours;
  menus: Map<string, Menu>;
  date: string;
  time: string;
  pos: Pos | null;
  daily: Targets;
  left?: Left;
}

/** Every open venue the user can pay at, nearest (or highest-priority tier) first, with options. */
export function eatNext(x: EatNextInput): VenuePick[] {
  const usable = usableTiers(x.profile, x.plan, x.left);
  const picks: VenuePick[] = [];
  for (const loc of x.locations) {
    // Fast-casual spots only join "Eat next" when the user has opted into Dining Dollars.
    if (loc.category === 'fast-casual' && !usable.includes('dining-dollars')) continue;
    const pay = venueTier(loc, usable);
    const slot = openSlot(x.hours, loc.slug, x.date, x.time);
    const menu = x.menus.get(loc.slug);
    if (!pay || !slot || !menu) continue;
    const target = mealTargets(x.daily, slot.period);
    const options = buildOptions(itemsNow(menu, slot, x.date).filter((i) => allowed(i, x.profile)), target);
    if (!options.length) continue;
    const distM = x.pos && loc.lat !== null && loc.lng !== null ? Math.round(haversineM(x.pos, { lat: loc.lat, lng: loc.lng })) : null;
    for (const o of options) o.reasons = reasons(o, target, slot.period, pay, distM, x.profile);
    picks.push({ loc, slot, pay, distM, nearby: distM !== null && distM <= x.profile.nearbyMeters, options, target });
  }
  return picks.sort((a, b) =>
    (a.distM ?? Infinity) - (b.distM ?? Infinity) || a.pay.rank - b.pay.rank || a.loc.name.localeCompare(b.loc.name));
}
