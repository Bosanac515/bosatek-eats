import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BlockedError, PoliteFetcher, USER_AGENT } from '../scripts/adapters/fetcher';
import type { Source } from '../scripts/adapters/source';
import { addDays, amesDate, dueMenus, staggerDay, type Schedule } from '../scripts/schedule';
import { manualHours, run } from '../scripts/scrape';
import { validate } from '../src/data/schema';
import type { Location } from '../src/data/types';

const schedule = JSON.parse(readFileSync('config/schedule.json', 'utf8')) as Schedule;

describe('schedule', () => {
  it('uses the Ames date, not UTC', () => {
    expect(amesDate(new Date('2026-11-06T03:00:00Z'))).toBe('2026-11-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('fetches weekly venues on the weekday and missing venues any day', () => {
    const all = new Set([...schedule.weekly.venues, ...schedule.monthly.venues, ...schedule.quarterly.venues]);
    // 2026-11-08 is a Sunday (weekday 0)
    expect(dueMenus(schedule, '2026-11-08', all).filter((j) => !j.fixed).map((j) => j.slug)).toEqual(schedule.weekly.venues);
    expect(dueMenus(schedule, '2026-11-09', all).some((j) => !j.fixed)).toBe(false);
    const none = dueMenus(schedule, '2026-11-09', new Set());
    expect(none.length).toBe(all.size); // bootstrap pulls everything once
  });

  it('staggers monthly and quarterly venues onto distinct days', () => {
    const n = schedule.quarterly.venues.length;
    const days = schedule.quarterly.venues.map((_, i) => staggerDay(i, n, 84));
    expect(new Set(days).size).toBe(n);
    const all = new Set([...schedule.weekly.venues, ...schedule.monthly.venues, ...schedule.quarterly.venues]);
    let monthly = 0;
    for (let d = 1; d <= 30; d++) monthly += dueMenus(schedule, `2026-11-${String(d).padStart(2, '0')}`, all).filter((j) => schedule.monthly.venues.includes(j.slug)).length;
    expect(monthly).toBe(schedule.monthly.venues.length); // each exactly once a month
  });

  it('expands manual weekly hours onto dates', () => {
    const h = manualHours([{ slug: 'x', name: 'X', category: 'fast-casual', building: 'MU', accepts: ['Cash'], menuUrl: 'https://x', hours: { fri: [['10:00', '15:00']] } }], '2026-11-05', 2);
    expect(h.x).toEqual({ '2026-11-05': [], '2026-11-06': [{ start: '10:00', end: '15:00', period: null }] });
  });
});

describe('PoliteFetcher', () => {
  const fake = (status: number, body: string, seen: RequestInit[] = []) =>
    (async (_u: string | URL | Request, init?: RequestInit) => { seen.push(init ?? {}); return new Response(body, { status }); }) as typeof fetch;

  it('sends the honest User-Agent and spaces requests', async () => {
    const seen: RequestInit[] = [];
    const f = new PoliteFetcher(50, 10, fake(200, '{}', seen));
    const t = Date.now();
    await f.json('https://dining.iastate.edu/a');
    await f.json('https://dining.iastate.edu/b');
    expect(Date.now() - t).toBeGreaterThanOrEqual(45);
    expect((seen[0].headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
  });

  it('stops on 403, 429 and challenge pages', async () => {
    await expect(new PoliteFetcher(0, 9, fake(429, '')).text('https://dining.iastate.edu/')).rejects.toBeInstanceOf(BlockedError);
    await expect(new PoliteFetcher(0, 9, fake(403, '')).text('https://dining.iastate.edu/')).rejects.toBeInstanceOf(BlockedError);
    await expect(new PoliteFetcher(0, 9, fake(200, '<div id="cf-chl-widget">')).text('https://dining.iastate.edu/')).rejects.toBeInstanceOf(BlockedError);
  });

  it('refuses other hosts and enforces the request budget', async () => {
    const f = new PoliteFetcher(0, 1, fake(200, 'ok'));
    await expect(f.text('https://evil.example/')).rejects.toThrow(/off-site/);
    await f.text('https://dining.iastate.edu/');
    await expect(f.text('https://dining.iastate.edu/')).rejects.toThrow(/budget/);
  });
});

describe('scrape run', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'eats-'));
    cpSync('public/data', join(dir, 'data'), { recursive: true });
    return join(dir, 'data');
  };
  const locs = () => validate.locations(JSON.parse(readFileSync('public/data/locations.json', 'utf8')));
  const source = (over: Partial<Source> = {}): Source => ({
    name: 'fake',
    listVenues: async () => [],
    venueDetails: async () => ({ lat: null, lng: null, address: null, accepts: [] }),
    hours: async (l: Location[], start) => Object.fromEntries(l.map((x) => [x.slug, { [start]: [] }])),
    menu: async (_l, date) => [{ id: '1', name: 'Soup', station: null, category: null, mealPeriod: 'Lunch', date, servingSize: null, servingGrams: null, calories: 100, proteinG: null, carbsG: null, fatG: null, fiberG: null, sugarG: null, sodiumMg: null, diet: [], allergens: null, ingredients: null }],
    ...over,
  });

  it('writes valid files and marks the run ok', async () => {
    const out = setup();
    const meta = await run(source(), { locations: false, out, now: new Date('2026-11-08T15:00:00Z') });
    expect(meta.ok).toBe(true);
    const fw = validate.menu(JSON.parse(readFileSync(join(out, 'menus/friley-windows.json'), 'utf8')));
    expect(new Set(fw.items.map((i) => i.date)).size).toBe(7);
    expect(Object.keys(validate.hours(JSON.parse(readFileSync(join(out, 'hours.json'), 'utf8'))))).toContain('mu-sushi-do');
    expect(locs().length).toBe(27);
  });

  it('keeps the last good file when a fetch returns invalid data', async () => {
    const out = setup();
    const before = readFileSync(join(out, 'hours.json'), 'utf8');
    const bad = source({ hours: async () => ({ 'friley-windows': { '2026-11-05': [{ start: '99:99', end: 'x', period: null }] } }) });
    const meta = await run(bad, { locations: false, out, now: new Date('2026-11-09T15:00:00Z') });
    expect(meta.ok).toBe(false);
    expect(meta.errors.join()).toMatch(/hours failed validation/);
    expect(readFileSync(join(out, 'hours.json'), 'utf8')).toBe(before);
    expect(meta.lastSuccess).toBe('2026-11-05T21:52:00Z');
  });

  it('stops every remaining fetch once blocked', async () => {
    const out = setup();
    writeFileSync(join(out, 'menus/friley-windows.json'), readFileSync('public/data/menus/friley-windows.json'));
    let menus = 0;
    const blocked = source({
      hours: async () => { throw new BlockedError('429 from x'); },
      menu: async () => { menus++; return []; },
    });
    const meta = await run(blocked, { locations: false, out, now: new Date('2026-11-08T15:00:00Z') });
    expect(meta.ok).toBe(false);
    expect(menus).toBe(0);
  });
});
