import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../src/data/types';
import { usableTiers } from '../src/engine/recommend';
import { fold, toCsv, toIcs, toText, type PlannedMeal } from '../src/lib/exports';
import { decodeProfile, encodeProfile, MAX_CODE } from '../src/lib/transfer';
import { DEFAULT_PROFILE, type Profile } from '../src/storage/profile';
import { DEFAULT_TRACKING, logExpress, logSwipe, remaining } from '../src/storage/tracking';

const P: Profile = { ...DEFAULT_PROFILE, onboarded: true, allergens: ['peanuts'], dislikes: ['olives'], plan: 'gold' };

describe('profile transfer codes', () => {
  it('round-trips a plain code', async () => {
    const code = await encodeProfile(P);
    expect(code.startsWith('EATS1.P.')).toBe(true);
    expect(code.length).toBeLessThan(MAX_CODE);
    expect(await decodeProfile(code)).toEqual(P);
  });

  it('round-trips an encrypted code and rejects the wrong passphrase', async () => {
    const code = await encodeProfile(P, 'correct horse battery');
    expect(code.startsWith('EATS1.E.')).toBe(true);
    await expect(decodeProfile(code)).rejects.toThrow(/locked/);
    await expect(decodeProfile(code, 'wrong passphrase')).rejects.toThrow(/Wrong passphrase/);
    expect(await decodeProfile(code, 'correct horse battery')).toEqual(P);
  }, 20_000);

  it('detects tampering with an encrypted code', async () => {
    const code = await encodeProfile(P, 'correct horse battery');
    const flipped = code.slice(0, -3) + (code.at(-3) === 'A' ? 'B' : 'A') + code.slice(-2);
    await expect(decodeProfile(flipped, 'correct horse battery')).rejects.toThrow();
  }, 20_000);

  it('rejects short passphrases, junk, oversized and unknown-key codes', async () => {
    await expect(encodeProfile(P, 'short')).rejects.toThrow(/8 characters/);
    await expect(decodeProfile('hello')).rejects.toThrow(/not a BosaTek/);
    await expect(decodeProfile('EATS1.P.<script>')).rejects.toThrow(/characters/);
    await expect(decodeProfile(`EATS1.P.${'A'.repeat(MAX_CODE)}`)).rejects.toThrow(/too long/);
    const evil = await encodeProfile({ ...P, ...({ isAdmin: true } as object) } as Profile);
    await expect(decodeProfile(evil)).rejects.toThrow(/does not understand/);
  });

  it('caps decompressed size (zip bomb)', async () => {
    const big = new TextEncoder().encode(`{"v":1,"x":"${' '.repeat(200_000)}"}`);
    const packed = new Uint8Array(await new Response(new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const code = `EATS1.P.${btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    expect(code.length).toBeLessThan(MAX_CODE);
    await expect(decodeProfile(code)).rejects.toThrow(/too much data/);
  });
});

const item = (name: string, calories = 300): MenuItem => ({
  id: name, name, station: 'S', category: 'Entree', mealPeriod: 'Lunch', date: '2026-11-05', servingSize: null, servingGrams: null,
  calories, proteinG: 20, carbsG: 30, fatG: 10, fiberG: null, sugarG: null, sodiumMg: null, diet: [], allergens: null, ingredients: null,
});
const meals: PlannedMeal[] = [{
  label: 'Lunch', venue: 'Friley Windows, Savor', date: '2026-11-05', start: '10:30', end: '15:00',
  items: [item('=HYPERLINK("http://evil")'), item('Soup, "hot"', 120)], kcal: 420, proteinG: 40, pay: 'Meal swipe',
}];

describe('exports', () => {
  it('neutralizes spreadsheet formulas and quotes CSV cells', () => {
    const csv = toCsv(meals);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain('"Soup, ""hot"""');
    expect(csv).toContain(',unknown');
  });

  it('writes a valid calendar with escaped text and Ames time', () => {
    const ics = toIcs(meals, new Date('2026-11-05T12:00:00Z'));
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('DTSTART;TZID=America/Chicago:20261105T103000');
    expect(ics).toContain('SUMMARY:Lunch at Friley Windows\\, Savor');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it('folds long lines without splitting characters', () => {
    const f = fold(`DESCRIPTION:${'🍕'.repeat(40)}`);
    expect(f.split('\r\n ').join('')).toBe(`DESCRIPTION:${'🍕'.repeat(40)}`);
  });

  it('makes readable text', () => {
    expect(toText(meals)).toMatch(/^Lunch: Friley Windows, Savor \(10:30-15:00\), ~420 kcal/);
  });
});

describe('tracking', () => {
  const gold = { expressPerDay: 2, expressDrawsFromSwipes: true, diningCenterMeals: 210 };
  const cardinal = { expressPerDay: 2, expressDrawsFromSwipes: false, diningCenterMeals: 'unlimited' };

  it('express meals use a swipe on Gold but not on Cardinal', () => {
    const t = { ...DEFAULT_TRACKING, swipesLeft: 10 };
    expect(logExpress(t, '2026-11-05', gold).swipesLeft).toBe(9);
    expect(logExpress(t, '2026-11-05', cardinal).swipesLeft).toBe(10);
  });

  it('caps express per day and resets on a new day', () => {
    let t = DEFAULT_TRACKING;
    t = logExpress(logExpress(t, '2026-11-05', cardinal), '2026-11-05', cardinal);
    expect(remaining(t, '2026-11-05', cardinal).express).toBe(false);
    expect(remaining(t, '2026-11-06', cardinal).express).toBe(true);
  });

  it('turns off swipe tiers when swipes run out', () => {
    const t = logSwipe({ ...DEFAULT_TRACKING, swipesLeft: 1 });
    expect(t.swipesLeft).toBe(0);
    const left = remaining(t, '2026-11-05', gold);
    expect(left).toEqual({ swipes: false, express: false });
    const plan = { id: 'gold', flexMeals: false, ...gold };
    expect(usableTiers({ ...P, tiers: ['meal-swipe', 'express-meal', 'dining-dollars'] }, plan, left)).toEqual(['dining-dollars']);
  });
});
