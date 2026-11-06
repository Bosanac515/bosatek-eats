import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validate } from '../src/data/schema';
import type { MenuItem } from '../src/data/types';
import { allowed, buildOptions, eatNext, haversineM, itemsNow, usableTiers, venueTier } from '../src/engine/recommend';
import { dailyTargets, mealTargets } from '../src/engine/targets';
import { emojiFor } from '../src/lib/emoji';
import { DEFAULT_PROFILE, loadProfile, parseProfile, saveProfile, type Profile } from '../src/storage/profile';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as unknown;
const locations = validate.locations(read('public/data/locations.json'));
const hours = validate.hours(read('public/data/hours.json'));
const friley = validate.menu(read('public/data/menus/friley-windows.json'));
const P = (o: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, onboarded: true, ...o });
const item = (o: Partial<MenuItem>): MenuItem => ({
  id: '1', name: 'X', station: 'S', category: 'Entree', mealPeriod: 'Lunch', date: '2026-11-05', servingSize: null,
  servingGrams: null, calories: 300, proteinG: 20, carbsG: null, fatG: null, fiberG: null, sugarG: null, sodiumMg: null,
  diet: [], allergens: [], ingredients: null, ...o,
});
const CARDINAL = { id: 'cardinal', expressPerDay: 2, flexMeals: false, diningCenterMeals: 'unlimited', expressDrawsFromSwipes: false };

describe('targets', () => {
  it('uses Mifflin-St Jeor x activity, adjusted by goal', () => {
    // male 20y 180cm 75kg: BMR 750+1125-100+5 = 1780; x 1.55 = 2759 -> 2760
    expect(dailyTargets(P({ age: 20, sex: 'male', heightCm: 180, weightKg: 75, activity: 'moderate' })).kcal).toBe(2760);
    expect(dailyTargets(P({ age: 20, sex: 'male', heightCm: 180, weightKg: 75, activity: 'moderate', goal: 'lose' })).kcal).toBe(2260);
  });
  it('never goes below the safe floor', () => {
    expect(dailyTargets(P({ age: 60, sex: 'female', heightCm: 150, weightKg: 40, activity: 'sedentary', goal: 'lose' })).kcal).toBe(1200);
  });
  it('falls back to a generic day without body stats', () => {
    expect(dailyTargets(P())).toEqual({ kcal: 2000, proteinG: 75, personalized: false });
    expect(mealTargets(dailyTargets(P()), 'Lunch').kcal).toBe(700);
  });
});

describe('filters', () => {
  it('excludes allergens, and unknown allergen data when the user has any allergen', () => {
    const p = P({ allergens: ['dairy'] });
    expect(allowed(item({ allergens: ['dairy'] }), p)).toBe(false);
    expect(allowed(item({ allergens: null }), p)).toBe(false);
    expect(allowed(item({ allergens: ['eggs'] }), p)).toBe(true);
    expect(allowed(item({ allergens: null }), P())).toBe(true);
  });
  it('requires every diet and drops dislikes by name or ingredient', () => {
    expect(allowed(item({ diet: ['vegetarian'] }), P({ diet: ['vegan'] }))).toBe(false);
    expect(allowed(item({ diet: ['vegan', 'halal'] }), P({ diet: ['vegan', 'halal'] }))).toBe(true);
    expect(allowed(item({ ingredients: 'Mushrooms, onion' }), P({ dislikes: ['mushroom'] }))).toBe(false);
  });
});

describe('payment tiers', () => {
  it('respects plan rules and user order', () => {
    expect(usableTiers(P({ tiers: ['flex-meal', 'meal-swipe'] }), CARDINAL)).toEqual(['meal-swipe']);
    expect(usableTiers(P({ plan: 'none', tiers: ['meal-swipe', 'dining-dollars'] }), undefined)).toEqual(['dining-dollars']);
    const express = locations.find((l) => l.slug === 'west-side-market-express')!;
    expect(venueTier(express, ['meal-swipe', 'express-meal'])).toEqual({ tier: 'express-meal', rank: 1 });
    expect(venueTier(express, ['dining-dollars'])).toBeNull();
  });
});

describe('options', () => {
  it('builds varied meals near the target from real menu data', () => {
    const items = itemsNow(friley, { start: '10:30', end: '15:00', period: 'Lunch' }, '2026-11-05');
    const opts = buildOptions(items, { kcal: 700, proteinG: 26, personalized: false });
    expect(opts.length).toBe(3);
    expect(new Set(opts.map((o) => o.items[0].station)).size).toBe(3);
    for (const o of opts) expect(o.items.every((i) => i.mealPeriod === 'Lunch' && i.calories! > 0)).toBe(true);
    expect(buildOptions(items, { kcal: 700, proteinG: 26, personalized: false })).toEqual(opts); // deterministic
  });

  it('ranks open venues by distance and explains every option', () => {
    const menus = new Map([['friley-windows', friley]]);
    const picks = eatNext({
      profile: P(), plan: CARDINAL, locations, hours, menus, date: '2026-11-05', time: '12:00',
      pos: { lat: 42.0239, lng: -93.6504 }, daily: dailyTargets(P()),
    });
    expect(picks[0].loc.slug).toBe('friley-windows');
    expect(picks[0].nearby).toBe(true);
    expect(picks[0].options[0].reasons.join('\n')).toMatch(/kcal[\s\S]*protein[\s\S]*meal swipe, your first choice[\s\S]*min walk/);
    expect(eatNext({ profile: P(), plan: CARDINAL, locations, hours, menus, date: '2026-11-05', time: '03:00', pos: null, daily: dailyTargets(P()) })).toEqual([]);
  });

  it('measures distance correctly', () => {
    // Friley Windows to Memorial Union is roughly 450 m
    expect(Math.round(haversineM({ lat: 42.0239234, lng: -93.65045 }, { lat: 42.0235144, lng: -93.6456354 }) / 10)).toBe(40);
  });
});

describe('profile storage', () => {
  it('round-trips through storage and rejects bad data', () => {
    const mem = new Map<string, string>();
    const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const p = P({ allergens: ['soy'], dislikes: ['olives'] });
    expect(saveProfile(p, s)).toBe(true);
    expect(loadProfile(s)).toEqual(p);
    mem.set('eats.profile', '{not json');
    expect(loadProfile(s)).toEqual(DEFAULT_PROFILE);
    expect(parseProfile({ ...p, admin: true })).toBeNull(); // unknown key
    expect(parseProfile({ ...p, age: 9 })).toBeNull(); // out of range
    expect(parseProfile({ ...p, allergens: ['plutonium'] })).toBeNull(); // not whitelisted
  });
  it('survives storage that throws', () => {
    const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    expect(loadProfile(boom)).toEqual(DEFAULT_PROFILE);
    expect(saveProfile(P(), boom)).toBe(false);
  });
});

describe('emoji', () => {
  it('matches keywords, then category, then a default', () => {
    expect(emojiFor({ name: 'Pepperoni Pizza', category: null }).emoji).toBe('🍕');
    expect(emojiFor({ name: 'Mystery', category: 'Desserts' }).emoji).toBe('🍰');
    expect(emojiFor({ name: 'Mystery', category: null })).toEqual({ emoji: '🍽️', label: 'meal' });
  });
});
