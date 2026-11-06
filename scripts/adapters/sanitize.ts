// Scraped text is untrusted: strip tags, decode entities, collapse whitespace, cap length.

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

export function clean(v: unknown, cap = 200): string | null {
  if (v === null || v === undefined) return null;
  // Decode first so encoded tags (&lt;b&gt;) are stripped too; drop control chars.
  const s = decodeEntities(String(v))
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.slice(0, cap) : null;
}

export function num(v: unknown, lo = 0, hi = 100000, places = 2): number | null {
  if (v === null || v === undefined || v === '') return null;
  const f = Number(v);
  if (!Number.isFinite(f)) return null;
  const k = 10 ** places;
  return Math.round(Math.min(Math.max(f, lo), hi) * k) / k;
}

/** 1030 -> "10:30"; 2400 stays "24:00" (end of day). */
export function hhmm(n: unknown): string {
  const v = Math.min(Math.max(Math.trunc(Number(n)) || 0, 0), 2400);
  const h = Math.min(Math.floor(v / 100), 24);
  const m = h === 24 ? 0 : Math.min(v % 100, 59);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
