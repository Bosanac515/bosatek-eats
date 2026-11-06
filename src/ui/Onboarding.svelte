<script lang="ts">
  import { ALLERGENS, DIETS, type Tier } from '../data/types';
  import { app, PLANS, setProfile } from '../lib/app.svelte';
  import { ACTIVITY, DEFAULT_PROFILE, GOALS, type Profile } from '../storage/profile';
  import { ALLERGEN_LABEL, ACTIVITY_LABEL, GOAL_LABEL, cleanNum, fromImperial, toImperial } from './labels';

  let step = $state(0);
  const STEPS = 5;
  let draft = $state<Profile>({ ...$state.snapshot(app.profile) as Profile });
  const imp = toImperial(draft.heightCm, draft.weightKg);
  let ft = $state<number | null>(imp.ft), inch = $state<number | null>(imp.inch), lb = $state<number | null>(imp.lb);
  let dislikes = $state(draft.dislikes.join(', '));
  let dd = $state(draft.tiers.includes('dining-dollars'));
  let pay = $state(draft.tiers.includes('pay'));
  let err = $state('');
  let heading: HTMLElement | undefined = $state();

  function finish(skipAll = false) {
    const base: Profile = skipAll ? { ...DEFAULT_PROFILE } : $state.snapshot(draft) as Profile;
    const tiers: Tier[] = ['meal-swipe', 'express-meal', 'flex-meal'];
    if (!skipAll && dd) tiers.push('dining-dollars');
    if (!skipAll && pay) tiers.push('pay');
    setProfile({ ...base, tiers, onboarded: true });
    location.hash = '#/';
  }

  function next() {
    err = '';
    if (step === 2) {
      draft.age = cleanNum(draft.age);
      const b = fromImperial(ft, inch, lb);
      if (draft.age !== null && (draft.age < 18 || draft.age > 100)) return void (err = 'Age must be between 18 and 100. Leave it blank to skip.');
      if (b.heightCm !== null && (b.heightCm < 120 || b.heightCm > 230)) return void (err = 'Height looks off. Check feet and inches.');
      if (b.weightKg !== null && (b.weightKg < 35 || b.weightKg > 250)) return void (err = 'Weight must be between 77 and 550 lb.');
      draft.heightCm = b.heightCm;
      draft.weightKg = b.weightKg;
    }
    if (step === 3) draft.dislikes = dislikes.split(',').map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 20);
    if (step === STEPS - 1) return finish();
    step++;
    queueMicrotask(() => heading?.focus());
  }
  function back() { err = ''; step = Math.max(0, step - 1); queueMicrotask(() => heading?.focus()); }
</script>

<section class="onboard" aria-labelledby="ob-h">
  <div class="progress" role="progressbar" aria-label="Setup progress" aria-valuemin="1" aria-valuemax={STEPS} aria-valuenow={step + 1}>
    <div style:width="{((step + 1) / STEPS) * 100}%"></div>
  </div>

  {#if step === 0}
    <div class="stack">
      <h1 id="ob-h" tabindex="-1" bind:this={heading}>Welcome to BosaTek Eats</h1>
      <p>Find something good to eat on campus, right now, that fits your goals, your diet and your meal plan.</p>
      <p class="muted small">Setup takes about a minute, and you can skip any step or all of it. Everything you enter stays on this device.</p>
      <div class="warn stack-sm">
        <p><strong>Before you start</strong></p>
        <p>Allergen and nutrition info comes from ISU Dining and may be incomplete or out of date. Always confirm with dining staff.</p>
        <p>Calorie targets are rough estimates, not medical or nutrition advice.</p>
        <p>This is an unofficial student project, not affiliated with Iowa State University or ISU Dining.</p>
      </div>
    </div>
  {:else if step === 1}
    <fieldset>
      <legend><h1 id="ob-h" tabindex="-1" bind:this={heading}>What's your goal?</h1></legend>
      <div class="choices">
        {#each GOALS as g (g)}
          <label class="choice"><input type="radio" name="goal" value={g} bind:group={draft.goal} />
            <span>{GOAL_LABEL[g].title}<small>{GOAL_LABEL[g].hint}</small></span></label>
        {/each}
      </div>
    </fieldset>
  {:else if step === 2}
    <div class="stack">
      <h1 id="ob-h" tabindex="-1" bind:this={heading}>About you <span class="muted small">(optional)</span></h1>
      <p class="muted small">Used only to estimate calorie targets on this device. Leave blank for general suggestions.</p>
      <div class="grid-2">
        <div class="field"><label for="age">Age (18+)</label><input id="age" type="number" inputmode="numeric" min="18" max="100" bind:value={draft.age} /></div>
        <div class="field"><label for="sex">Sex (for the formula)</label>
          <select id="sex" bind:value={draft.sex}><option value={null}>Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></div>
        <div class="field"><label for="ft">Height (ft)</label><input id="ft" type="number" inputmode="numeric" min="4" max="7" bind:value={ft} /></div>
        <div class="field"><label for="in">Height (in)</label><input id="in" type="number" inputmode="numeric" min="0" max="11" bind:value={inch} /></div>
        <div class="field"><label for="lb">Weight (lb)</label><input id="lb" type="number" inputmode="numeric" min="77" max="550" bind:value={lb} /></div>
        <div class="field"><label for="act">Activity</label>
          <select id="act" bind:value={draft.activity}>{#each ACTIVITY as a (a)}<option value={a}>{ACTIVITY_LABEL[a]}</option>{/each}</select></div>
      </div>
    </div>
  {:else if step === 3}
    <div class="stack">
      <h1 id="ob-h" tabindex="-1" bind:this={heading}>Diet and allergens</h1>
      <fieldset><legend>Only show food that is</legend>
        <div class="choices">{#each DIETS as d (d)}<label class="choice"><input type="checkbox" value={d} bind:group={draft.diet} />{d[0].toUpperCase() + d.slice(1)}</label>{/each}</div>
      </fieldset>
      <fieldset><legend>Hide food containing</legend>
        <div class="choices">{#each ALLERGENS as a (a)}<label class="choice"><input type="checkbox" value={a} bind:group={draft.allergens} />{ALLERGEN_LABEL[a]}</label>{/each}</div>
      </fieldset>
      {#if draft.allergens.length}<p class="note">Items with no allergen info from ISU will be hidden too.</p>{/if}
      <div class="field"><label for="dis">Foods you don't like <span class="muted small">(comma separated)</span></label>
        <input id="dis" type="text" maxlength="400" placeholder="mushrooms, olives" bind:value={dislikes} /></div>
    </div>
  {:else}
    <div class="stack">
      <h1 id="ob-h" tabindex="-1" bind:this={heading}>Meal plan and paying</h1>
      <fieldset><legend>Your meal plan</legend>
        <div class="choices">
          {#each PLANS as p (p.id)}<label class="choice"><input type="radio" name="plan" value={p.id} bind:group={draft.plan} />{p.name}</label>{/each}
          <label class="choice"><input type="radio" name="plan" value="none" bind:group={draft.plan} />No plan</label>
        </div>
      </fieldset>
      <fieldset><legend>Suggestions use meal swipes first, then express meals and Flex Meals. Also include:</legend>
        <label class="choice"><input type="checkbox" bind:checked={dd} /><span>Dining Dollars<small>Adds fast-casual spots to suggestions</small></span></label>
        <label class="choice"><input type="checkbox" bind:checked={pay} /><span>Card or cash</span></label>
      </fieldset>
      <p class="muted small">You can reorder these anytime in Profile.</p>
    </div>
  {/if}

  {#if err}<p class="error" role="alert">{err}</p>{/if}

  <div class="row between">
    {#if step > 0}<button onclick={back}>Back</button>{:else}<button class="ghost" onclick={() => finish(true)}>Skip setup</button>{/if}
    <div class="row">
      {#if step > 0 && step < STEPS - 1}<button class="ghost" onclick={() => { step++; queueMicrotask(() => heading?.focus()); }}>Skip</button>{/if}
      <button class="primary" onclick={next}>{step === 0 ? 'Get started' : step === STEPS - 1 ? 'Done' : 'Next'}</button>
    </div>
  </div>
</section>
