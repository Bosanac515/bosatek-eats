<script lang="ts">
  import { DIETS, type Diet, type Menu } from '../data/types';
  import { allowed, openSlot } from '../engine/recommend';
  import { app, clock, menuFor } from '../lib/app.svelte';
  import { amesNow, fmtTime } from '../lib/data';
  import { CATEGORY_LABEL, TIER_NAME } from './labels';
  import ItemRow from './ItemRow.svelte';

  let { slug }: { slug: string } = $props();
  const loc = $derived(app.locs.find((l) => l.slug === slug));
  const now = $derived(amesNow(clock.now));
  let menu = $state<Menu | null | undefined>(undefined);
  $effect(() => {
    menu = undefined;
    menuFor(slug).then((m) => (menu = m));
  });

  let q = $state('');
  let diets = $state<Diet[]>([...app.profile.diet]);
  let mine = $state(true); // apply my allergens and dislikes
  let date = $state('');
  let period = $state('');

  const dates = $derived(menu && !menu.fixed ? [...new Set(menu.items.map((i) => i.date))].sort() : []);
  $effect(() => { if (dates.length && !dates.includes(date)) date = dates.includes(now.date) ? now.date : dates[0]; });
  const dayItems = $derived(menu ? (menu.fixed ? menu.items : menu.items.filter((i) => i.date === date)) : []);
  const periods = $derived([...new Set(dayItems.map((i) => i.mealPeriod ?? 'Menu'))]);
  $effect(() => {
    if (periods.length && !periods.includes(period)) {
      const cur = openSlot(app.hours, slug, now.date, now.time)?.period;
      period = cur && periods.includes(cur) && date === now.date ? cur : periods[0];
    }
  });

  const shown = $derived(
    dayItems
      .filter((i) => (i.mealPeriod ?? 'Menu') === period)
      .filter((i) => diets.every((d) => i.diet.includes(d)))
      .filter((i) => !mine || allowed(i, { ...app.profile, diet: [] }))
      .filter((i) => !q.trim() || `${i.name} ${i.ingredients ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const byStation = $derived.by(() => {
    const m = new Map<string, typeof shown>();
    for (const i of shown) m.set(i.station ?? 'Menu', [...(m.get(i.station ?? 'Menu') ?? []), i]);
    return [...m];
  });
  const hidden = $derived(dayItems.filter((i) => (i.mealPeriod ?? 'Menu') === period).length - shown.length);
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const week = $derived(Object.entries(app.hours[slug] ?? {}).sort());
</script>

{#if !loc}
  <div class="page-head"><h1 tabindex="-1">Place not found</h1></div>
  <a href="#/places">Back to places</a>
{:else}
  {@const open = openSlot(app.hours, slug, now.date, now.time)}
  <div class="page-head">
    <a class="small no-print" href="#/places">← Places</a>
    <h1 tabindex="-1">{loc.name}</h1>
    <p class="muted small">{loc.building ?? ''}{loc.address ? ` · ${loc.address}` : ''}</p>
    <div class="row">
      <span class="chip {open ? 'open' : 'closed'}">{open ? `Open until ${fmtTime(open.end)}` : 'Closed now'}</span>
      <span class="chip">{CATEGORY_LABEL[loc.category]}</span>
      {#each loc.payment as t (t)}<span class="chip">{TIER_NAME[t]}</span>{/each}
    </div>
  </div>

  <details class="card">
    <summary><strong>Hours this week</strong></summary>
    <table class="small">
      <tbody>
        {#each week as [d, slots] (d)}
          <tr><th scope="row" class="muted">{dayLabel(d)}</th>
            <td>{slots.length ? slots.map((s) => `${s.period ? `${s.period} ` : ''}${fmtTime(s.start)}–${fmtTime(s.end)}`).join(', ') : 'Closed'}</td></tr>
        {/each}
      </tbody>
    </table>
  </details>

  {#if menu === undefined}
    <p class="muted" aria-live="polite">Loading menu…</p>
  {:else if menu === null}
    <div class="card stack-sm">
      <h2>Menu</h2>
      {#if loc.source === 'manual'}
        <p>This spot isn't run by ISU Dining, so its menu isn't listed here.</p>
        <a class="btn" href={loc.url} rel="noopener noreferrer" target="_blank">See their menu ↗</a>
      {:else}
        <p>No menu downloaded for this spot yet. Check <a href={loc.url} rel="noopener noreferrer" target="_blank">ISU Dining ↗</a>.</p>
      {/if}
    </div>
  {:else}
    <section class="stack" aria-labelledby="menu-h">
      <div class="row between"><h2 id="menu-h">Menu</h2>
        {#if menu.fixed}<span class="tiny muted">Regular menu, as of {new Date(menu.fetchedAt).toLocaleDateString()}</span>{/if}</div>

      {#if dates.length > 1}
        <div class="seg" role="group" aria-label="Day">
          {#each dates as d (d)}<button aria-pressed={date === d} onclick={() => (date = d)}>{d === now.date ? 'Today' : dayLabel(d)}</button>{/each}
        </div>
      {/if}
      {#if periods.length > 1}
        <div class="seg" role="group" aria-label="Meal">
          {#each periods as p (p)}<button aria-pressed={period === p} onclick={() => (period = p)}>{p}</button>{/each}
        </div>
      {/if}

      <div class="stack-sm no-print">
        <label class="sr-only" for="mq">Search this menu</label>
        <input id="mq" type="search" placeholder="Search dishes or ingredients" bind:value={q} />
        <div class="row">
          {#each DIETS as d (d)}<label class="row small"><input type="checkbox" value={d} bind:group={diets} /> {d}</label>{/each}
          <label class="row small"><input type="checkbox" bind:checked={mine} /> Hide my allergens and dislikes</label>
        </div>
      </div>

      {#if hidden > 0}<p class="tiny muted">{hidden} item{hidden === 1 ? '' : 's'} hidden by your filters.</p>{/if}
      {#each byStation as [station, items] (station)}
        <div class="card">
          <h3>{station}</h3>
          <div>{#each items as i, n (`${n}:${i.id}`)}<ItemRow item={i} />{/each}</div>
        </div>
      {:else}
        <p class="note">Nothing here matches your filters.</p>
      {/each}
      <p class="tiny muted">From ISU Dining. Recipes change and cross-contact can happen in any kitchen. Confirm allergens with dining staff.</p>
    </section>
  {/if}
{/if}
