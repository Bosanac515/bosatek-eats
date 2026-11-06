// The user's profile: lives only in this browser's localStorage. Versioned so later releases
// can migrate old data instead of losing it.
import { arr, bool, nullable, num, obj, oneOf, str, type Rule } from '../data/schema';
import { ALLERGENS, DIETS, TIERS, type Allergen, type Diet, type Tier } from '../data/types';

export const GOALS = ['lose', 'maintain', 'gain', 'athletic'] as const;
export const ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'very-active'] as const;
export const SEXES = ['male', 'female'] as const;
export const PLAN_IDS = ['cardinal', 'gold', 'campanile', 'none'] as const;

export type Goal = (typeof GOALS)[number];
export type Activity = (typeof ACTIVITY)[number];
export type PlanId = (typeof PLAN_IDS)[number];

export interface Profile {
  v: 1;
  onboarded: boolean;
  goal: Goal;
  age: number | null;
  sex: (typeof SEXES)[number] | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: Activity;
  diet: Diet[];
  allergens: Allergen[];
  dislikes: string[];
  plan: PlanId;
  /** Payment tiers the user allows, in priority order. Dining Dollars and pay are opt-in. */
  tiers: Tier[];
  nearbyMeters: number;
}

export const DEFAULT_PROFILE: Profile = {
  v: 1,
  onboarded: false,
  goal: 'maintain',
  age: null,
  sex: null,
  heightCm: null,
  weightKg: null,
  activity: 'light',
  diet: [],
  allergens: [],
  dislikes: [],
  plan: 'cardinal',
  tiers: ['meal-swipe', 'express-meal', 'flex-meal'],
  nearbyMeters: 400,
};

export const profileRule: Rule = obj({
  v: oneOf([1]),
  onboarded: bool,
  goal: oneOf(GOALS),
  age: nullable(num(18, 100)),
  sex: nullable(oneOf(SEXES)),
  heightCm: nullable(num(120, 230)),
  weightKg: nullable(num(35, 250)),
  activity: oneOf(ACTIVITY),
  diet: arr(oneOf(DIETS), DIETS.length),
  allergens: arr(oneOf(ALLERGENS), ALLERGENS.length),
  dislikes: arr(str(40), 20),
  plan: oneOf(PLAN_IDS),
  tiers: arr(oneOf(TIERS), TIERS.length),
  nearbyMeters: num(100, 3000),
});

/** Old stored versions -> current. Add an entry per schema bump: MIGRATIONS[1] = (p) => ({ ...p, v: 2 }). */
const MIGRATIONS: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> = {};

/** Untrusted JSON (storage or an import code) -> a valid Profile, or null. */
export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  let p = raw as Record<string, unknown>;
  for (let guard = 0; typeof p.v === 'number' && MIGRATIONS[p.v] && guard < 20; guard++) p = MIGRATIONS[p.v](p);
  if (profileRule(p, 'profile').length) return null;
  const out = p as unknown as Profile;
  return { ...out, tiers: [...new Set(out.tiers)], diet: [...new Set(out.diet)], allergens: [...new Set(out.allergens)] };
}

const KEY = 'eats.profile';

export function loadProfile(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Profile {
  try {
    const raw = storage?.getItem(KEY);
    return (raw && parseProfile(JSON.parse(raw))) || { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE }; // private mode, blocked storage, or corrupt JSON
  }
}

export function saveProfile(p: Profile, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
