// Daily and per-meal calorie/macro targets. Estimates only: the UI shows the "not medical advice" note.
import type { Profile } from '../storage/profile';

export interface Targets { kcal: number; proteinG: number; personalized: boolean }

const MULT = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, 'very-active': 1.9 } as const;
const GOAL_KCAL = { lose: -500, maintain: 0, gain: 300, athletic: 300 } as const;
const PROTEIN_PER_KG = { lose: 1.4, maintain: 1.0, gain: 1.4, athletic: 1.6 } as const;
export const FLOOR = { male: 1500, female: 1200, unknown: 1200 } as const;

/** Mifflin-St Jeor x activity, adjusted by goal, never below a safe floor. */
export function dailyTargets(p: Profile): Targets {
  const { age, heightCm: h, weightKg: w, sex } = p;
  if (age === null || h === null || w === null) {
    // No body stats: a generic reference day rather than a guess about this person.
    return { kcal: 2000, proteinG: 75, personalized: false };
  }
  const s = sex === 'male' ? 5 : sex === 'female' ? -161 : -78; // unspecified: midpoint of the two
  const bmr = 10 * w + 6.25 * h - 5 * age + s;
  const floor = FLOOR[sex ?? 'unknown'];
  const kcal = Math.max(floor, Math.round((bmr * MULT[p.activity] + GOAL_KCAL[p.goal]) / 10) * 10);
  return { kcal, proteinG: Math.round(w * PROTEIN_PER_KG[p.goal]), personalized: true };
}

/** Share of the day's target for a meal period name as ISU writes it. */
export function mealShare(period: string | null): number {
  const p = (period ?? '').toLowerCase();
  if (p.includes('breakfast')) return 0.25;
  if (p.includes('lunch') || p.includes('dinner')) return 0.35;
  if (p.includes('late') || p.includes('snack') || p.includes('after hours')) return 0.15;
  return 0.3; // retail / "Daily Menu" / "Grab and Go"
}

export function mealTargets(t: Targets, period: string | null): Targets {
  const s = mealShare(period);
  return { kcal: Math.round(t.kcal * s), proteinG: Math.round(t.proteinG * s), personalized: t.personalized };
}
