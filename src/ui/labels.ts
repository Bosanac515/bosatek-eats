import type { Allergen, Category, Tier } from '../data/types';
import type { Activity, Goal } from '../storage/profile';

export const GOAL_LABEL: Record<Goal, { title: string; hint: string }> = {
  lose: { title: 'Lose weight', hint: 'A moderate deficit' },
  maintain: { title: 'Maintain', hint: 'Steady, balanced meals' },
  gain: { title: 'Gain weight', hint: 'A small surplus' },
  athletic: { title: 'Athletic', hint: 'Extra fuel and protein' },
};

export const ACTIVITY_LABEL: Record<Activity, string> = {
  sedentary: 'Mostly sitting', light: 'Light (walk to class)', moderate: 'Moderate (exercise 3-5x/week)',
  active: 'Active (hard exercise most days)', 'very-active': 'Very active (athlete)',
};

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  dairy: 'Dairy', eggs: 'Eggs', fish: 'Fish', peanuts: 'Peanuts', shellfish: 'Shellfish', soy: 'Soy',
  sesame: 'Sesame / tahini', 'tree-nuts': 'Tree nuts', 'wheat-gluten': 'Wheat / gluten',
};

export const TIER_NAME: Record<Tier, string> = {
  'meal-swipe': 'Meal swipe', 'express-meal': 'Express meal', 'flex-meal': 'Flex Meal',
  'dining-dollars': 'Dining Dollars', pay: 'Card or cash',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  'dining-center': 'Dining centers', express: 'Express', 'fast-casual': 'Fast casual',
  cafe: 'Cafes', 'convenience-store': 'Markets',
};

const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function toImperial(heightCm: number | null, weightKg: number | null) {
  const totalIn = heightCm === null ? null : Math.round(heightCm / 2.54);
  return {
    ft: totalIn === null ? null : Math.floor(totalIn / 12),
    inch: totalIn === null ? null : totalIn % 12,
    lb: weightKg === null ? null : Math.round(weightKg * 2.20462),
  };
}

export function fromImperial(ft: number | null, inch: number | null, lb: number | null) {
  return {
    heightCm: ok(ft) ? Math.round(((ft * 12 + (ok(inch) ? inch : 0)) * 2.54) * 10) / 10 : null,
    weightKg: ok(lb) ? Math.round((lb / 2.20462) * 10) / 10 : null,
  };
}

export const cleanNum = (v: number | null | undefined) => (ok(v) ? v : null);
