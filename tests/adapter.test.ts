import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHours, parseLocationsPage, parseMenu, parseVenuePage, tiers } from '../scripts/adapters/isu';
import { clean, hhmm, num } from '../scripts/adapters/sanitize';
import { validate } from '../src/data/schema';

const fx = (f: string) => readFileSync(`tests/fixtures/${f}`, 'utf8');

describe('sanitize', () => {
  it('strips tags (including encoded ones), decodes entities, caps length', () => {
    expect(clean('<b>Clyde&#039;s</b>')).toBe("Clyde's");
    expect(clean('&lt;script&gt;alert(1)&lt;/script&gt;x')).toBe('alert(1) x');
    expect(clean('x'.repeat(500), 10)).toBe('x'.repeat(10));
    expect(clean('  \n ')).toBeNull();
  });
  it('clamps numbers and keeps coordinate precision', () => {
    expect(num('42.0239234', -90, 90, 7)).toBe(42.0239234);
    expect(num('abc')).toBeNull();
    expect(num('-5')).toBe(0);
  });
  it('formats HHMM times', () => {
    expect(hhmm(1030)).toBe('10:30');
    expect(hhmm(730)).toBe('07:30');
    expect(hhmm(2400)).toBe('24:00');
    expect(hhmm('junk')).toBe('00:00');
  });
});

describe('ISU parsers', () => {
  it('reads venue cards and categories from /locations', () => {
    const v = parseLocationsPage(fx('locations.html'));
    expect(v.find((x) => x.slug === 'friley-windows')).toMatchObject({ isuId: 30, category: 'dining-center', building: 'Friley Hall' });
    expect(v.find((x) => x.slug === 'clydes')?.name).toBe("Clyde's");
    expect(new Set(v.map((x) => x.category))).toEqual(new Set(['dining-center', 'fast-casual', 'express']));
  });

  it('reads coordinates, venue address (not the footer) and badges', () => {
    expect(parseVenuePage(fx('venue-friley-windows.html'))).toEqual({
      lat: 42.0239234, lng: -93.65045, address: '212 Beyer Ct, Ames, IA 50012',
      accepts: ['Credit', 'Dining Dollars', 'Flex Meal', 'ISU Card', 'Meal Plan'],
    });
    expect(parseVenuePage(fx('venue-west-side-market-express.html')).accepts).toEqual(['Meal Plan']);
  });

  it('derives payment tiers: express from category, Flex from badge', () => {
    expect(tiers('express', ['Meal Plan'])).toEqual(['express-meal']);
    expect(tiers('cafe', ['Credit', 'Dining Dollars', 'Flex Meal'])).toEqual(['flex-meal', 'dining-dollars', 'pay']);
    expect(tiers('fast-casual', ['Cash', 'Dining Dollars'])).toEqual(['dining-dollars', 'pay']);
    expect(tiers('dining-center', ['Meal Plan'])).toEqual(['meal-swipe']);
  });

  it('maps hours by slug and converts times', () => {
    const h = parseHours(JSON.parse(fx('hours.json')), new Map([[30, 'friley-windows'], [1, 'conversations']]));
    expect(Object.keys(h).sort()).toEqual(['conversations', 'friley-windows']); // unknown id 57 dropped
    expect(h['friley-windows']['2026-11-05'][0]).toEqual({ start: '10:30', end: '15:00', period: 'Lunch' });
    expect(h['friley-windows']['2026-11-07']).toEqual([]);
    validate.hours(h);
  });

  it('normalizes menu items and validates them', () => {
    const items = parseMenu(JSON.parse(fx('menu-30.json')));
    expect(items.length).toBeGreaterThan(0);
    const stir = items.find((i) => i.name === 'Spicy Chicken Stir Fry');
    expect(stir).toMatchObject({ station: 'Savor', mealPeriod: 'Lunch', calories: 114, proteinG: 17.75, servingSize: '4 oz Portion' });
    for (const i of items) expect(i.allergens === null || Array.isArray(i.allergens)).toBe(true);
    validate.menu({ venue: 'friley-windows', fetchedAt: '2026-11-05T12:00:00Z', fixed: false, items });
  });

  it('treats an item with no traits as unknown allergens, never allergen-free', () => {
    const items = parseMenu({ meals: { 1: { meal: 'Lunch', date: '2026-11-05', menu_displays: { 1: { name: 'X', categories: { a: { items: {
      1: { oid: '1', name: 'Mystery', traits: null },
      2: { oid: '2', name: 'Tagged', traits: { allergen: { dairy: {}, crustacean_shellfish: {}, bogus: {} } } },
      3: { oid: '3', name: 'Halal?', traits: { requirement: { halal: {}, vegan: {} }, miscellaneous_special_diet_info: { not_halal: {} } } },
    } } } } } } } });
    expect(items.find((i) => i.name === 'Mystery')?.allergens).toBeNull();
    expect(items.find((i) => i.name === 'Tagged')?.allergens).toEqual(['dairy', 'shellfish']);
    expect(items.find((i) => i.name === 'Halal?')?.diet).toEqual(['vegan']);
  });

  it('returns no items for unpublished days', () => {
    expect(parseMenu(JSON.parse(fx('menu-30-unpublished.json')))).toEqual([]);
  });

  it('uses the display name when serving_station is missing', () => {
    expect(parseMenu(JSON.parse(fx('menu-57.json'))).every((i) => i.station)).toBe(true);
  });
});
