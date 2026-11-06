// Optional local tracking of remaining swipes and today's express meals. Device-only.
import { nullable, num, obj, oneOf, str } from '../data/schema';

export interface Tracking { v: 1; swipesLeft: number | null; expressDate: string | null; expressCount: number }
export interface TrackRules { expressPerDay: number; expressDrawsFromSwipes: boolean; diningCenterMeals: number | string }

export const DEFAULT_TRACKING: Tracking = { v: 1, swipesLeft: null, expressDate: null, expressCount: 0 };

const rule = obj({
  v: oneOf([1]),
  swipesLeft: nullable(num(0, 1000)),
  expressDate: nullable(str(10, /^\d{4}-\d{2}-\d{2}$/)),
  expressCount: num(0, 20),
});

const KEY = 'eats.tracking';

export function loadTracking(s: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Tracking {
  try {
    const v = JSON.parse(s?.getItem(KEY) ?? 'null') as unknown;
    return v && !rule(v, 'tracking').length ? (v as Tracking) : { ...DEFAULT_TRACKING };
  } catch {
    return { ...DEFAULT_TRACKING };
  }
}

export function saveTracking(t: Tracking, s: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): boolean {
  try {
    s?.setItem(KEY, JSON.stringify(t));
    return true;
  } catch {
    return false;
  }
}

export const expressToday = (t: Tracking, date: string) => (t.expressDate === date ? t.expressCount : 0);

export function logSwipe(t: Tracking): Tracking {
  return { ...t, swipesLeft: t.swipesLeft === null ? null : Math.max(0, t.swipesLeft - 1) };
}

/** On Gold and Campanile an express meal also uses one of the plan's swipes. */
export function logExpress(t: Tracking, date: string, rules: TrackRules): Tracking {
  const used = Math.min(expressToday(t, date) + 1, 20);
  const swipesLeft = rules.expressDrawsFromSwipes && t.swipesLeft !== null ? Math.max(0, t.swipesLeft - 1) : t.swipesLeft;
  return { ...t, expressDate: date, expressCount: used, swipesLeft };
}

/** What the tracker says is still available today. */
export function remaining(t: Tracking, date: string, rules: TrackRules | undefined) {
  if (!rules) return { swipes: false, express: false };
  const limited = rules.diningCenterMeals !== 'unlimited';
  const swipes = !limited || t.swipesLeft === null || t.swipesLeft > 0;
  const express = expressToday(t, date) < rules.expressPerDay && (!rules.expressDrawsFromSwipes || swipes);
  return { swipes, express };
}
