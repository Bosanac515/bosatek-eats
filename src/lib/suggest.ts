// Glue between app state and the pure engine: decides which menu files to load, then ranks.
import { eatNext, haversineM, openSlot, usableTiers, venueTier, type Pos, type VenuePick } from '../engine/recommend';
import { dailyTargets } from '../engine/targets';
import { remaining } from '../storage/tracking';
import { app, menuFor, planRules } from './app.svelte';
import { amesNow } from './data';

/** Ranked suggestions for a moment in time.
 * shortcut: only the closest maxVenues open venues are considered (keeps mobile data low); raise it if menus get sparse. */
export async function suggest(date: string, time: string, pos: Pos | null, maxVenues = 6): Promise<VenuePick[]> {
  const profile = app.profile;
  const plan = planRules(profile.plan);
  // Tracker limits only apply to today; future plans assume a fresh day.
  const left = date === amesNow().date ? remaining(app.tracking, date, plan) : undefined;
  const usable = usableTiers(profile, plan, left);
  const dist = (l: (typeof app.locs)[number]) =>
    pos && l.lat !== null && l.lng !== null ? haversineM(pos, { lat: l.lat, lng: l.lng }) : Infinity;
  const candidates = app.locs
    .filter((l) => venueTier(l, usable) && openSlot(app.hours, l.slug, date, time))
    .filter((l) => l.category !== 'fast-casual' || usable.includes('dining-dollars'))
    .sort((a, b) => dist(a) - dist(b) || venueTier(a, usable)!.rank - venueTier(b, usable)!.rank)
    .slice(0, maxVenues);
  const loaded = await Promise.all(candidates.map(async (l) => [l.slug, await menuFor(l.slug)] as const));
  const menus = new Map(loaded.flatMap(([s, m]) => (m ? [[s, m] as const] : [])));
  return eatNext({ profile, plan, locations: candidates, hours: app.hours, menus, date, time, pos, daily: dailyTargets(profile), left });
}
