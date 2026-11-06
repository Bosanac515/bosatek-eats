// Which menus a given day's run should fetch. Pure, so it is unit-tested.

export interface Group { days: number; venues: string[] }
export interface Schedule {
  maxRequestsPerRun: number;
  hoursDays: number;
  weekly: Group & { weekday: number }; // 0 = Sunday
  monthly: Group;
  quarterly: Group;
}
export interface Job { slug: string; days: number; fixed: boolean }

/** YYYY-MM-DD in Ames, whatever timezone the runner is in. */
export function amesDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day offset inside the month (0-27) or quarter (0-83) that venue i of n owns. */
export const staggerDay = (i: number, n: number, span: number) => Math.floor((i * span) / Math.max(n, 1));

export function dueMenus(s: Schedule, today: string, have: Set<string>): Job[] {
  const d = new Date(`${today}T12:00:00Z`);
  const dom = d.getUTCDate() - 1;
  const q0 = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1, 12);
  const doq = Math.round((d.getTime() - q0) / 86_400_000);
  const jobs: Job[] = [];
  for (const v of s.weekly.venues)
    if (d.getUTCDay() === s.weekly.weekday || !have.has(v)) jobs.push({ slug: v, days: s.weekly.days, fixed: false });
  s.monthly.venues.forEach((v, i, all) => {
    if (dom === staggerDay(i, all.length, 28) || !have.has(v)) jobs.push({ slug: v, days: s.monthly.days, fixed: true });
  });
  s.quarterly.venues.forEach((v, i, all) => {
    if (doq === staggerDay(i, all.length, 84) || !have.has(v)) jobs.push({ slug: v, days: s.quarterly.days, fixed: true });
  });
  return jobs;
}
