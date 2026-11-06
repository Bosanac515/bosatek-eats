<script lang="ts">
  import { CATEGORIES, type Category, type Location } from '../data/types';
  import { haversineM, openSlot, walkMin } from '../engine/recommend';
  import { app, clock } from '../lib/app.svelte';
  import { amesNow, fmtTime } from '../lib/data';
  import { CATEGORY_LABEL, TIER_NAME } from './labels';
  import LocationPicker from './LocationPicker.svelte';

  type Filter = 'all' | Category | 'dining-dollars';
  let filter = $state<Filter>('all');
  let openOnly = $state(false);
  let q = $state('');
  const now = $derived(amesNow(clock.now));

  const dist = (l: Location) => (app.pos && l.lat !== null && l.lng !== null ? haversineM(app.pos, { lat: l.lat, lng: l.lng }) : null);
  const todayText = (l: Location) => {
    const s = app.hours[l.slug]?.[now.date];
    if (!s) return 'Hours unknown';
    if (!s.length) return 'Closed today';
    return s.map((x) => `${fmtTime(x.start)}–${fmtTime(x.end)}`).join(', ');
  };

  const shown = $derived(
    app.locs
      .filter((l) => filter === 'all' || (filter === 'dining-dollars' ? l.payment.includes('dining-dollars') : l.category === filter))
      .filter((l) => !openOnly || openSlot(app.hours, l.slug, now.date, now.time))
      .filter((l) => !q.trim() || `${l.name} ${l.building ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => (dist(a) ?? Infinity) - (dist(b) ?? Infinity)
        || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name)),
  );
  const FILTERS: [Filter, string][] = [['all', 'All'], ...CATEGORIES.map((c): [Filter, string] => [c, CATEGORY_LABEL[c]]), ['dining-dollars', 'Dining Dollars']];
</script>

<div class="page-head">
  <h1 tabindex="-1">Places</h1>
  <p class="muted small">{app.locs.length} campus dining spots</p>
</div>

<LocationPicker />

<div class="stack-sm no-print">
  <label class="sr-only" for="pq">Search places</label>
  <input id="pq" type="search" placeholder="Search places or buildings" bind:value={q} />
  <div class="seg" role="group" aria-label="Filter by type">
    {#each FILTERS as [f, label] (f)}<button aria-pressed={filter === f} onclick={() => (filter = f)}>{label}</button>{/each}
  </div>
  <label class="row small"><input type="checkbox" bind:checked={openOnly} /> Open now only</label>
</div>

<p class="sr-only" aria-live="polite">{shown.length} places shown</p>
<ul class="list">
  {#each shown as l (l.slug)}
    {@const open = openSlot(app.hours, l.slug, now.date, now.time)}
    {@const d = dist(l)}
    <li class="card stack-sm">
      <div class="row between">
        <a href="#/place/{l.slug}"><strong>{l.name}</strong></a>
        <span class="chip {open ? 'open' : 'closed'}">{open ? `Open until ${fmtTime(open.end)}` : 'Closed'}</span>
      </div>
      <p class="small muted">{l.building ?? ''}{d !== null ? ` · ${walkMin(d)} min walk` : ''} · {todayText(l)}</p>
      <div class="row">
        <span class="chip">{CATEGORY_LABEL[l.category]}</span>
        {#each l.payment as t (t)}<span class="chip">{TIER_NAME[t]}</span>{/each}
      </div>
    </li>
  {:else}
    <li class="note">No places match. Try another filter.</li>
  {/each}
</ul>
