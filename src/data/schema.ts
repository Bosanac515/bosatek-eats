// Tiny validator for untrusted JSON (scraped data now, import codes later).
// Unknown keys are rejected, strings are length-capped, numbers range-checked, enums whitelisted.
import { ACCEPTS, ALLERGENS, CATEGORIES, DIETS, TIERS } from './types';
import type { Hours, Location, Menu, Meta } from './types';

export type Rule = (v: unknown, path: string) => string[];

const ok: string[] = [];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const nullable = (r: Rule): Rule => (v, p) => (v === null ? ok : r(v, p));

export const str = (max: number, pattern?: RegExp): Rule => (v, p) =>
  typeof v !== 'string' ? [`${p}: expected string`]
  : v.length > max ? [`${p}: longer than ${max}`]
  : pattern && !pattern.test(v) ? [`${p}: bad format`]
  : ok;

export const num = (lo: number, hi: number): Rule => (v, p) =>
  typeof v !== 'number' || !Number.isFinite(v) ? [`${p}: expected number`]
  : v < lo || v > hi ? [`${p}: out of range ${lo}..${hi}`]
  : ok;

export const bool: Rule = (v, p) => (typeof v === 'boolean' ? ok : [`${p}: expected boolean`]);

export const oneOf = (values: readonly unknown[]): Rule => (v, p) =>
  values.includes(v) ? ok : [`${p}: not an allowed value`];

export const arr = (item: Rule, max: number): Rule => (v, p) =>
  !Array.isArray(v) ? [`${p}: expected array`]
  : v.length > max ? [`${p}: more than ${max} entries`]
  : v.flatMap((x, i) => item(x, `${p}[${i}]`));

export const obj = (shape: Record<string, Rule>): Rule => (v, p) => {
  if (!isObj(v)) return [`${p}: expected object`];
  const extra = Object.keys(v).filter((k) => !(k in shape)).map((k) => `${p}.${k}: unknown key`);
  return [...extra, ...Object.entries(shape).flatMap(([k, r]) => r(v[k], `${p}.${k}`))];
};

export const record = (key: RegExp, val: Rule, max: number): Rule => (v, p) => {
  if (!isObj(v)) return [`${p}: expected object`];
  const keys = Object.keys(v);
  if (keys.length > max) return [`${p}: more than ${max} keys`];
  return keys.flatMap((k) => (key.test(k) ? val(v[k], `${p}.${k}`) : [`${p}.${k}: bad key`]));
};

const SLUG = /^[a-z0-9-]{1,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-4]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;
const gram = nullable(num(0, 5000));

export const locationRule = obj({
  slug: str(60, SLUG),
  isuId: nullable(num(0, 1e6)),
  name: str(80),
  category: oneOf(CATEGORIES),
  listedAs: nullable(oneOf(CATEGORIES)),
  building: nullable(str(80)),
  address: nullable(str(120)),
  lat: nullable(num(41.9, 42.1)), // Ames bounding box: catches swapped or garbage coordinates
  lng: nullable(num(-93.8, -93.5)),
  accepts: arr(oneOf(ACCEPTS), ACCEPTS.length),
  payment: arr(oneOf(TIERS), TIERS.length),
  source: oneOf(['isu', 'manual']),
  url: str(200, /^https:\/\//),
});

export const slotRule = obj({ start: str(5, TIME), end: str(5, TIME), period: nullable(str(40)) });
export const hoursRule = record(SLUG, record(DATE, arr(slotRule, 12), 31), 100);

export const menuItemRule = obj({
  id: str(20),
  name: str(120),
  station: nullable(str(60)),
  category: nullable(str(60)),
  mealPeriod: nullable(str(40)),
  date: str(10, DATE),
  servingSize: nullable(str(40)),
  servingGrams: gram,
  calories: nullable(num(0, 5000)),
  proteinG: gram, carbsG: gram, fatG: gram, fiberG: gram, sugarG: gram,
  sodiumMg: nullable(num(0, 20000)),
  diet: arr(oneOf(DIETS), DIETS.length),
  allergens: nullable(arr(oneOf(ALLERGENS), ALLERGENS.length)),
  ingredients: nullable(str(2000)),
});

export const menuRule = obj({
  venue: str(60, SLUG),
  fetchedAt: str(30, ISO),
  fixed: bool,
  items: arr(menuItemRule, 5000),
});

export const metaRule = obj({
  lastAttempt: str(30, ISO),
  lastSuccess: nullable(str(30, ISO)),
  ok: bool,
  errors: arr(str(300), 50),
});

/** Throws with every problem listed, so a bad scrape never replaces good data. */
export function assertValid<T>(rule: Rule, v: unknown, name: string): T {
  const errs = rule(v, name);
  if (errs.length) throw new Error(`${name} failed validation:\n${errs.slice(0, 20).join('\n')}`);
  return v as T;
}

export const validate = {
  locations: (v: unknown) => assertValid<Location[]>(arr(locationRule, 100), v, 'locations'),
  hours: (v: unknown) => assertValid<Hours>(hoursRule, v, 'hours'),
  menu: (v: unknown) => assertValid<Menu>(menuRule, v, 'menu'),
  meta: (v: unknown) => assertValid<Meta>(metaRule, v, 'meta'),
};
