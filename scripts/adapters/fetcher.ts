// The only network path the scraper has: honest User-Agent, one request per 2 s,
// and a hard stop on 403/429/challenge pages (the fix for a block is emailing ISU, not retrying).

export const USER_AGENT = 'BosaTekEats/0.1 (+https://eats.bosatek.com; hello@bosatek.com)';
const CHALLENGE = /captcha|cf-chl|challenge-platform|access denied/i;
const MAX_BYTES = 5_000_000;

export class BlockedError extends Error {}

export class PoliteFetcher {
  count = 0;
  private last = 0;
  constructor(
    private readonly gapMs = 2000,
    private readonly maxRequests = 120,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(url: string): Promise<string> {
    if (!url.startsWith('https://dining.iastate.edu/')) throw new Error(`refusing off-site URL: ${url}`);
    if (this.count >= this.maxRequests) throw new Error(`request budget (${this.maxRequests}) used up`);
    const wait = this.last + this.gapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.last = Date.now();
    this.count++;
    const res = await this.fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'error' });
    const body = await res.text();
    if (res.status === 403 || res.status === 429) throw new BlockedError(`${res.status} from ${url}: stop and email dining@iastate.edu`);
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    if (body.length > MAX_BYTES) throw new Error(`response too large from ${url}`);
    if (CHALLENGE.test(body.slice(0, 5000))) throw new BlockedError(`challenge page from ${url}: stop and email dining@iastate.edu`);
    return body;
  }

  text(url: string) {
    return this.get(url);
  }

  async json(url: string): Promise<unknown> {
    return JSON.parse(await this.get(url));
  }
}
