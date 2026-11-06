<script lang="ts">
  import { TIERS, type Tier } from '../data/types';
  import { dailyTargets } from '../engine/targets';
  import { app, clock, planRules, PLANS, setProfile, setTracking } from '../lib/app.svelte';
  import { amesNow } from '../lib/data';
  import { DEFAULT_PROFILE, type Profile } from '../storage/profile';
  import { DEFAULT_TRACKING } from '../storage/tracking';
  import { ALLERGEN_LABEL, GOAL_LABEL, TIER_NAME, cleanNum } from './labels';
  import Transfer from './Transfer.svelte';

  const p = $derived(app.profile);
  const t = $derived(dailyTargets(p));
  const plan = $derived(planRules(p.plan));
  const update = (patch: Partial<Profile>) => setProfile({ ...($state.snapshot(app.profile) as Profile), ...patch });

  // Enabled tiers keep the user's order; disabled ones are listed after them.
  const ordered = $derived([...p.tiers, ...TIERS.filter((x) => !p.tiers.includes(x))]);
  function toggle(tier: Tier) {
    update({ tiers: p.tiers.includes(tier) ? p.tiers.filter((x) => x !== tier) : [...p.tiers, tier] });
  }
  function move(tier: Tier, dir: -1 | 1) {
    const list = [...p.tiers];
    const i = list.indexOf(tier), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update({ tiers: list });
  }

  let swipes = $state<number | null>(app.tracking.swipesLeft);
  function saveSwipes() {
    const v = cleanNum(swipes);
    setTracking({ ...app.tracking, swipesLeft: v === null ? null : Math.min(1000, Math.max(0, Math.round(v))) });
  }

  let confirmReset = $state(false);
  function reset() {
    setProfile({ ...DEFAULT_PROFILE });
    setTracking({ ...DEFAULT_TRACKING });
    confirmReset = false;
    location.hash = '#/welcome';
  }
  const planName = (id: string) => PLANS.find((x) => x.id === id)?.name ?? 'No plan';
</script>

<div class="page-head">
  <h1 tabindex="-1">Profile</h1>
  <p class="muted small">Stored only in this browser.</p>
</div>
{#if app.saveFailed}<p class="warn" role="alert">This browser isn't saving settings (private mode or storage blocked). They'll reset when you close the tab.</p>{/if}

<section class="card stack-sm" aria-labelledby="you-h">
  <div class="row between"><h2 id="you-h">You</h2><a class="btn small" href="#/welcome">Change setup</a></div>
  <p>{GOAL_LABEL[p.goal].title} · {planName(p.plan)}</p>
  <p class="small muted">
    About {t.kcal.toLocaleString()} kcal and {t.proteinG} g protein a day{t.personalized ? '' : ' (general; add age, height and weight to personalize)'}.
  </p>
  <p class="small muted">
    {p.diet.length ? `Diet: ${p.diet.join(', ')}. ` : ''}{p.allergens.length ? `Avoiding: ${p.allergens.map((a) => ALLERGEN_LABEL[a]).join(', ')}. ` : ''}{p.dislikes.length ? `Dislikes: ${p.dislikes.join(', ')}.` : ''}
  </p>
  <p class="tiny muted">Estimates from the Mifflin-St Jeor equation. Not medical or nutrition advice.</p>
</section>

<section class="card stack-sm" aria-labelledby="pay-h">
  <h2 id="pay-h">How you'd like to pay</h2>
  <p class="small muted">Suggestions try these in order. Turning on Dining Dollars also adds fast-casual spots.</p>
  <ul class="list">
    {#each ordered as tier (tier)}
      {@const on = p.tiers.includes(tier)}
      {@const i = p.tiers.indexOf(tier)}
      <li class="row between">
        <label class="row"><input type="checkbox" checked={on} onchange={() => toggle(tier)} /> {on ? `${i + 1}. ` : ''}{TIER_NAME[tier]}</label>
        {#if on}
          <span class="row">
            <button class="small" disabled={i === 0} onclick={() => move(tier, -1)} aria-label="Move {TIER_NAME[tier]} up">↑</button>
            <button class="small" disabled={i === p.tiers.length - 1} onclick={() => move(tier, 1)} aria-label="Move {TIER_NAME[tier]} down">↓</button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if p.plan !== 'none' && plan && !plan.flexMeals && p.tiers.includes('flex-meal')}
    <p class="tiny muted">Your plan doesn't include Flex Meals, so they're skipped.</p>
  {/if}
</section>

<section class="card stack-sm" aria-labelledby="near-h">
  <h2 id="near-h">"Nearby" means within</h2>
  <label class="sr-only" for="nm">Nearby distance</label>
  <select id="nm" value={p.nearbyMeters} onchange={(e) => update({ nearbyMeters: Number(e.currentTarget.value) })}>
    <option value={200}>200 m (2-3 min walk)</option><option value={400}>400 m (5 min walk)</option>
    <option value={800}>800 m (10 min walk)</option><option value={1600}>1.6 km (20 min walk)</option>
  </select>
</section>

{#if plan}
  <section class="card stack-sm" aria-labelledby="track-h">
    <h2 id="track-h">Meal tracking <span class="muted small">(optional)</span></h2>
    {#if plan.diningCenterMeals !== 'unlimited'}
      <div class="field"><label for="sw">Swipes left this semester</label>
        <div class="row"><input id="sw" class="grow" type="number" inputmode="numeric" min="0" max="1000" bind:value={swipes} /><button class="small" onclick={saveSwipes}>Save</button></div></div>
      {#if plan.expressDrawsFromSwipes}<p class="tiny muted">On {planName(p.plan)}, express meals also use a swipe.</p>{/if}
    {:else}
      <p class="small muted">Cardinal has unlimited dining center meals. Express meals are a separate {plan.expressPerDay} per day.</p>
    {/if}
    <div><button class="small" onclick={() => setTracking({ ...app.tracking, expressDate: amesNow(clock.now).date, expressCount: 0 })}>Reset today's express count</button></div>
  </section>
{/if}

<section class="card" aria-labelledby="move-h">
  <h2 id="move-h">Move to another device</h2>
  <Transfer />
</section>

<section class="card stack-sm" aria-labelledby="reset-h">
  <h2 id="reset-h">Start over</h2>
  {#if confirmReset}
    <p class="small">This erases your settings and tracking on this device.</p>
    <div class="row"><button class="small primary" onclick={reset}>Erase</button><button class="small" onclick={() => (confirmReset = false)}>Cancel</button></div>
  {:else}
    <div><button class="small" onclick={() => (confirmReset = true)}>Erase my settings</button></div>
  {/if}
</section>

<p class="small"><a href="#/about">About, data sources and disclaimers</a></p>
