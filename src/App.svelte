<script lang="ts">
  import { app, init } from './lib/app.svelte';
  import { isStale } from './lib/data';
  import About from './ui/About.svelte';
  import DayPlan from './ui/DayPlan.svelte';
  import EatNext from './ui/EatNext.svelte';
  import Onboarding from './ui/Onboarding.svelte';
  import Places from './ui/Places.svelte';
  import Profile from './ui/Profile.svelte';
  import Venue from './ui/Venue.svelte';

  const TABS = [
    ['#/', 'Eat next', '🍽️'], ['#/places', 'Places', '📍'], ['#/plan', 'Plan', '🗓️'], ['#/profile', 'Profile', '👤'],
  ] as const;

  let hash = $state(location.hash || '#/');
  let main: HTMLElement | undefined = $state();
  addEventListener('hashchange', () => {
    hash = location.hash || '#/';
    scrollTo(0, 0);
    // Move focus to the new page's heading so screen readers announce the change.
    queueMicrotask(() => main?.querySelector<HTMLElement>('h1')?.focus());
  });
  init();

  const route = $derived.by(() => {
    if (!app.profile.onboarded || hash === '#/welcome') return { name: 'welcome' as const };
    const m = /^#\/place\/([a-z0-9-]{1,60})$/.exec(hash);
    if (m) return { name: 'place' as const, slug: m[1] };
    const name = ({ '#/': 'home', '#/places': 'places', '#/plan': 'plan', '#/profile': 'profile', '#/about': 'about' } as const)[hash] ?? 'home';
    return { name };
  });
  const tabFor = $derived(route.name === 'place' ? '#/places' : route.name === 'about' ? '#/profile' : hash);
  $effect(() => {
    const titles = { welcome: 'Welcome', home: 'Eat next', places: 'Places', plan: 'Plan a day', profile: 'Profile', about: 'About', place: 'Menu' };
    document.title = `${titles[route.name]} · BosaTek Eats`;
  });
</script>

<a class="skip" href="#main" onclick={(e) => { e.preventDefault(); main?.focus(); }}>Skip to content</a>
<div class="shell">
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#/"><span class="dot" aria-hidden="true"></span>BosaTek Eats <small>unofficial</small></a>
      {#if route.name !== 'welcome'}
        <nav class="tabs" aria-label="Main">
          <ul>
            {#each TABS as [href, label, icon] (href)}
              <li><a {href} aria-current={tabFor === href ? 'page' : undefined}><span class="ico" aria-hidden="true">{icon}</span>{label}</a></li>
            {/each}
          </ul>
        </nav>
      {/if}
    </div>
  </header>

  <main id="main" tabindex="-1" bind:this={main}>
    {#if app.error}
      <div class="page-head"><h1 tabindex="-1">Couldn't load dining data</h1></div>
      <p class="warn" role="alert">{app.error}. Check your connection, or see dining.iastate.edu directly.</p>
    {:else if route.name === 'welcome'}
      <Onboarding />
    {:else if !app.ready}
      <p class="muted" aria-live="polite">Loading…</p>
    {:else}
      {#if app.meta && isStale(app.meta)}
        <p class="warn" role="status">Dining data may be out of date. Confirm hours on <a href="https://dining.iastate.edu" rel="noopener noreferrer" target="_blank">dining.iastate.edu</a>.</p>
      {/if}
      {#if route.name === 'home'}<EatNext />
      {:else if route.name === 'places'}<Places />
      {:else if route.name === 'place'}<Venue slug={route.slug} />
      {:else if route.name === 'plan'}<DayPlan />
      {:else if route.name === 'profile'}<Profile />
      {:else}<About />{/if}
    {/if}
  </main>
</div>
