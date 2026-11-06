// Day plan exports. All built from our own normalized data; still escaped for each format.
import type { MenuItem } from '../data/types';

export interface PlannedMeal {
  label: string; // Breakfast, Lunch, Dinner, Snack
  venue: string;
  date: string; // YYYY-MM-DD (Ames)
  start: string; // HH:MM
  end: string;
  items: MenuItem[];
  kcal: number;
  proteinG: number;
  pay: string;
}

export function toText(meals: PlannedMeal[]): string {
  return meals.map((m) => [
    `${m.label}: ${m.venue} (${m.start}-${m.end}), ~${m.kcal} kcal, ${m.proteinG} g protein, ${m.pay}`,
    ...m.items.map((i) => `  - ${i.name}${i.calories !== null ? ` (${Math.round(i.calories)} kcal)` : ''}`),
  ].join('\n')).join('\n\n');
}

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(meals: PlannedMeal[]): string {
  const cell = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['date', 'meal', 'venue', 'start', 'end', 'item', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'allergens']];
  for (const m of meals)
    for (const i of m.items)
      rows.push([m.date, m.label, m.venue, m.start, m.end, i.name, String(i.calories ?? ''), String(i.proteinG ?? ''),
        String(i.carbsG ?? ''), String(i.fatG ?? ''), i.allergens === null ? 'unknown' : i.allergens.join(' ')]);
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** RFC 5545 line folding: at most 75 octets per line, never splitting a character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const CHICAGO = [
  'BEGIN:VTIMEZONE', 'TZID:America/Chicago',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0600', 'TZOFFSETTO:-0500', 'TZNAME:CDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0600', 'TZNAME:CST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

/** RFC 5545 calendar; times are Ames local (America/Chicago). */
export function toIcs(meals: PlannedMeal[], stamp = new Date()): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const dt = (d: string, t: string) => `${d.replace(/-/g, '')}T${(t === '24:00' ? '23:59' : t).replace(':', '')}00`;
  const now = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BosaTek Eats//EN', 'CALSCALE:GREGORIAN', ...CHICAGO];
  meals.forEach((m, n) => {
    lines.push('BEGIN:VEVENT', `UID:${m.date}-${n}@eats.bosatek.com`, `DTSTAMP:${now}`,
      `DTSTART;TZID=America/Chicago:${dt(m.date, m.start)}`, `DTEND;TZID=America/Chicago:${dt(m.date, m.end)}`,
      fold(`SUMMARY:${esc(`${m.label} at ${m.venue}`)}`),
      fold(`DESCRIPTION:${esc(`${m.items.map((i) => i.name).join(', ')}. ~${m.kcal} kcal. Pay: ${m.pay}. Confirm allergens with staff.`)}`),
      fold(`LOCATION:${esc(m.venue)}`), 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function toJson(meals: PlannedMeal[]): string {
  return JSON.stringify({ app: 'BosaTek Eats', exported: new Date().toISOString(), meals }, null, 2);
}

export function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
