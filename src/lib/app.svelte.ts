// Shared app state. Location (pos) is memory-only and never stored.
import plansConfig from '../../config/plans.json';
import type { Hours, Location, Menu, Meta } from '../data/types';
import type { PlanRules, Pos } from '../engine/recommend';
import { loadProfile, saveProfile, type Profile } from '../storage/profile';
import { loadTracking, saveTracking, type Tracking } from '../storage/tracking';
import { loadHours, loadLocations, loadMenu, loadMeta } from './data';

export const PLANS = plansConfig.plans;
export const planRules = (id: string): PlanRules | undefined => PLANS.find((p) => p.id === id);

export const app = $state({
  locs: [] as Location[],
  hours: {} as Hours,
  meta: null as Meta | null,
  error: null as string | null,
  ready: false,
  profile: loadProfile(),
  tracking: loadTracking(),
  pos: null as Pos | null,
  posLabel: null as string | null,
  saveFailed: false,
});

export async function init() {
  try {
    [app.locs, app.hours, app.meta] = await Promise.all([loadLocations(), loadHours(), loadMeta()]);
    app.ready = true;
  } catch (e) {
    app.error = (e as Error).message;
  }
}

export function setProfile(p: Profile) {
  app.profile = p;
  app.saveFailed = !saveProfile($state.snapshot(p) as Profile);
}

export function setTracking(t: Tracking) {
  app.tracking = t;
  app.saveFailed = !saveTracking($state.snapshot(t) as Tracking);
}

/** Ticks every 30 s so "open now" and suggestions stay current. */
export const clock = $state({ now: new Date() });
setInterval(() => (clock.now = new Date()), 30_000);

const menuCache = new Map<string, Promise<Menu | null>>();
/** Missing menu files are normal (manual venues, not yet scraped): resolve to null. */
export function menuFor(slug: string): Promise<Menu | null> {
  if (!menuCache.has(slug)) menuCache.set(slug, loadMenu(slug).catch(() => null));
  return menuCache.get(slug)!;
}

export function locate(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Location is not available in this browser.'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        app.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        app.posLabel = 'your location';
        resolve();
      },
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : 'Could not get your location.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function nearVenue(slug: string) {
  const l = app.locs.find((x) => x.slug === slug);
  if (l?.lat != null && l.lng != null) {
    app.pos = { lat: l.lat, lng: l.lng };
    app.posLabel = l.name;
  }
}
