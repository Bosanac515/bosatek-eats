<script lang="ts">
  import type { Option, VenuePick } from '../engine/recommend';
  import { dailyTargets } from '../engine/targets';
  import { app, clock } from '../lib/app.svelte';
  import { amesNow, fmtTime } from '../lib/data';
  import { emojiFor } from '../lib/emoji';
  import { download, toCsv, toIcs, toJson, toText, type PlannedMeal } from '../lib/exports';
  import { suggest } from '../lib/suggest';
  import { TIER_NAME } from './labels';
  import LocationPicker from './LocationPicker.svelte';

  // A representative moment inside each meal; the venue's own hours decide the actual window.
  const MEALS = [['Breakfast', '08:30'], ['Lunch', '12:30'], ['Dinner', '18:00'], ['Snack', '21:00']] as const;
  type Choice = { p: VenuePick; o: Option };

  const today = $derived(amesNow(clock.now).date);
  const days = $derived([...new Set(Object.values(app.hours).flatMap((h) => Object.keys(h)))].filter((d) => d >= today).sort().slice(0, 7));
  let date = $state('');
  $effect(() => { if (!days.includes(date)) date = days[0] ?? today; });

  let choices = $state<Choice[][] | null>(null);
  let pickIdx = $state<number[]>([0, 0, 0, 0]);
  let status = $state('');

  $effect(() => {
    const d = date, pos = app.pos;
    void app.profile;
    if (!d) return;
    let stale = false;
    choices = null;
    Promise.all(MEALS.map(([, t]) => suggest(d, t, pos, 6))).then((all) => {
      if (stale) return;
      const c = all.map((picks) => picks.flatMap((p) => p.options.map((o) => ({ p, o }))));
      // Variety across the day: prefer a place and a main dish not already planned, then just a new dish.
      const places = new Set<string>(), dishes = new Set<string>();
      pickIdx = c.map((list) => {
        let i = list.findIndex((x) => !places.has(x.p.loc.slug) && !dishes.has(x.o.items[0].name));
        if (i < 0) i = Math.max(0, list.findIndex((x) => !dishes.has(x.o.items[0].name)));
        if (list[i]) { places.add(list[i].p.loc.slug); dishes.add(list[i].o.items[0].name); }
        return i;
      });
      choices = c;
    });
    return () => { stale = true; };
  });

  const planned = $derived<(PlannedMeal | null)[]>(
    (choices ?? []).map((c, n) => {
      const ch = c[pickIdx[n] % Math.max(c.length, 1)];
      if (!ch) return null;
      return { label: MEALS[n][0], venue: ch.p.loc.name, date, start: ch.p.slot.start, end: ch.p.slot.end, items: ch.o.items,
        kcal: ch.o.kcal, proteinG: ch.o.proteinG, pay: TIER_NAME[ch.p.pay.tier] };
    }),
  );
  const meals = $derived(planned.filter((m): m is PlannedMeal => m !== null));
  const total = $derived(meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG }), { kcal: 0, p: 0 }));
  const daily = $derived(dailyTargets(app.profile));
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  async function copy() {
    try { await navigator.clipboard.writeText(toText(meals)); status = 'Copied to clipboard.'; }
    catch { status = 'Copying is blocked here. Try the text file instead.'; }
  }
  const file = (ext: string) => `bosatek-eats-${date}.${ext}`;
</script>

<div class="page-head">
  <h1 tabindex="-1">Plan a day</h1>
  <p class="muted small">Breakfast, lunch, dinner and a snack, built from real menus. Swap anything you don't like.</p>
</div>

<div class="seg no-print" role="group" aria-label="Day">
  {#each days as d (d)}<button aria-pressed={date === d} onclick={() => (date = d)}>{d === today ? 'Today' : dayLabel(d)}</button>{/each}
</div>
<LocationPicker />

{#if choices === null}
  <p class="muted" aria-live="polite">Building your day…</p>
{:else}
  <section class="hero" aria-label="Day totals">
    <span class="stat">{total.kcal.toLocaleString()} kcal</span>
    <p class="small">{total.p} g protein · target about {daily.kcal.toLocaleString()} kcal and {daily.proteinG} g protein{daily.personalized ? '' : ' (general)'}</p>
  </section>

  <ul class="list">
    {#each MEALS as [label], n (label)}
      {@const m = planned[n]}
      {@const count = choices[n].length}
      <li class="card stack-sm">
        <div class="row between">
          <h2>{label}</h2>
          {#if count > 1}<button class="small no-print" onclick={() => (pickIdx[n] = (pickIdx[n] + 1) % count)} aria-label="Swap {label}">↻ Swap</button>{/if}
        </div>
        {#if m}
          <p class="small"><a href="#/place/{choices[n][pickIdx[n] % count].p.loc.slug}">{m.venue}</a> · {fmtTime(m.start)}–{fmtTime(m.end)} · {m.pay}</p>
          <div class="option"><div class="meal">
            {#each m.items as i (i.id)}{@const e = emojiFor(i)}<span><span role="img" aria-label={e.label}>{e.emoji}</span> {i.name}</span>{/each}
          </div></div>
          <p class="tiny muted">~{m.kcal} kcal · {m.proteinG} g protein{count > 1 ? ` · option ${(pickIdx[n] % count) + 1} of ${count}` : ''}</p>
        {:else}
          <p class="muted small">Nothing that fits is open around then.</p>
        {/if}
      </li>
    {/each}
  </ul>

  {#if meals.length}
    <section class="card stack-sm no-print" aria-labelledby="exp-h">
      <h2 id="exp-h">Save or share</h2>
      <div class="row">
        <button class="small" onclick={() => window.print()}>Print / PDF</button>
        <button class="small" onclick={copy}>Copy text</button>
        <button class="small" onclick={() => download(file('csv'), 'text/csv', toCsv(meals))}>CSV</button>
        <button class="small" onclick={() => download(file('ics'), 'text/calendar', toIcs(meals))}>Calendar</button>
        <button class="small" onclick={() => download(file('json'), 'application/json', toJson(meals))}>JSON</button>
      </div>
      <p class="tiny muted" aria-live="polite">{status}</p>
    </section>
  {/if}
  <p class="tiny muted">Menus can change. Allergen and nutrition info is from ISU Dining; confirm with staff. Targets are estimates, not medical advice.</p>
{/if}
