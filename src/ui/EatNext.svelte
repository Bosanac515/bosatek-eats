<script lang="ts">
  import { nextSlot, walkMin, type VenuePick } from '../engine/recommend';
  import { dailyTargets } from '../engine/targets';
  import { app, clock, planRules, setTracking } from '../lib/app.svelte';
  import { amesNow, fmtTime } from '../lib/data';
  import { emojiFor } from '../lib/emoji';
  import { suggest } from '../lib/suggest';
  import { expressToday, logExpress, logSwipe } from '../storage/tracking';
  import { TIER_NAME } from './labels';
  import LocationPicker from './LocationPicker.svelte';

  const now = $derived(amesNow(clock.now));
  let picks = $state<VenuePick[] | null>(null);
  let failed = $state(false);

  $effect(() => {
    // Re-run when time, location, profile or tracking change.
    const { date, time } = now;
    void app.profile; void app.tracking;
    let stale = false;
    suggest(date, time, app.pos)
      .then((p) => { if (!stale) { picks = p; failed = false; } })
      .catch(() => { if (!stale) failed = true; });
    return () => { stale = true; };
  });

  const daily = $derived(dailyTargets(app.profile));
  const plan = $derived(planRules(app.profile.plan));
  const top = $derived(picks?.[0]);

  /** Earliest later opening today among all venues, for the "nothing open" state. */
  const nextOpen = $derived.by(() => {
    let best: { name: string; start: string } | null = null;
    for (const l of app.locs) {
      const s = nextSlot(app.hours, l.slug, now.date, now.time);
      if (s && (!best || s.start < best.start)) best = { name: l.name, start: s.start };
    }
    return best;
  });
</script>

<div class="page-head">
  <h1 tabindex="-1">Eat next</h1>
  <p class="muted small">{new Date(clock.now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtTime(now.time)} in Ames</p>
</div>

<LocationPicker />

{#if failed}
  <p class="warn" role="alert">Couldn't load menus. Check your connection and try again.</p>
{:else if picks === null}
  <p class="muted" aria-live="polite">Finding something good…</p>
{:else if !top}
  <div class="card stack">
    <h2>Nothing that fits is open right now</h2>
    {#if nextOpen}<p>{nextOpen.name} opens next, at {fmtTime(nextOpen.start)}.</p>{/if}
    <p class="muted small">Suggestions only include places your enabled payment methods work at, with menus that fit your filters. You can change those in Profile.</p>
    <div class="row"><a class="btn" href="#/places">Browse places</a><a class="btn" href="#/plan">Plan a day</a></div>
  </div>
{:else}
  <section class="hero" aria-labelledby="top-h">
    <div class="row between">
      <span class="chip">{top.slot.period ?? 'Open now'} until {fmtTime(top.slot.end)}</span>
      {#if top.distM !== null}<span class="chip">{walkMin(top.distM)} min walk</span>{/if}
    </div>
    <h2 id="top-h"><a href="#/place/{top.loc.slug}">{top.loc.name}</a></h2>
    <p class="small">{top.loc.building ?? ''} · Pay with {TIER_NAME[top.pay.tier].toLowerCase()} · aim for about {top.target.kcal} kcal</p>
  </section>

  <ul class="list" aria-label="Meal options at {top.loc.name}">
    {#each top.options as o, n (o.items.map((i) => i.id).join())}
      <li class="card option">
        <div class="row between">
          <h3>Option {n + 1}</h3>
          <span class="chip accent">{o.kcal} kcal · {o.proteinG} g protein</span>
        </div>
        <div class="meal">
          {#each o.items as i (i.id)}
            {@const e = emojiFor(i)}
            <span><span role="img" aria-label={e.label}>{e.emoji}</span> {i.name}</span>
          {/each}
        </div>
        <details>
          <summary class="small">Why this meal</summary>
          <ul class="why">{#each o.reasons as r (r)}<li>{r}</li>{/each}</ul>
        </details>
      </li>
    {/each}
  </ul>
  <p class="tiny muted">Allergen and nutrition info is from ISU Dining and can be wrong. Confirm with staff. Targets are estimates{daily.personalized ? '' : ' for a general 2,000 kcal day; add your details in Profile to personalize'}.</p>

  {#if picks.length > 1}
    <section class="stack-sm" aria-labelledby="also-h">
      <h2 id="also-h">Also open</h2>
      <ul class="list">
        {#each picks.slice(1) as p (p.loc.slug)}
          <li class="card flat">
            <a href="#/place/{p.loc.slug}" class="row between">
              <strong>{p.loc.name}</strong>
              <span class="tiny muted">{p.distM !== null ? `${walkMin(p.distM)} min · ` : ''}{TIER_NAME[p.pay.tier]}</span>
            </a>
            <p class="small muted">Try: {p.options[0].items.map((i) => i.name).join(' + ')} (~{p.options[0].kcal} kcal)</p>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

{#if plan}
  <section class="card stack-sm no-print" aria-labelledby="log-h">
    <h2 id="log-h">Log a meal</h2>
    <p class="small muted">
      {#if app.tracking.swipesLeft !== null}{app.tracking.swipesLeft} swipes left · {/if}{expressToday(app.tracking, now.date)} of {plan.expressPerDay} express meals used today
    </p>
    <div class="row">
      {#if plan.diningCenterMeals !== 'unlimited'}<button class="small" disabled={app.tracking.swipesLeft === null} onclick={() => setTracking(logSwipe(app.tracking))}>Used a swipe</button>{/if}
      <button class="small" onclick={() => setTracking(logExpress(app.tracking, now.date, plan))}>Used an express meal</button>
    </div>
    {#if plan.diningCenterMeals !== 'unlimited' && app.tracking.swipesLeft === null}
      <p class="tiny muted">Set your remaining swipes in <a href="#/profile">Profile</a> to track them.</p>
    {/if}
  </section>
{/if}
