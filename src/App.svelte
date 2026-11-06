<script lang="ts">
  // Build phase 1 shell: proves the data pipeline end to end. Onboarding, "Eat next",
  // menus and plans arrive in later build phases.
  import { CATEGORIES, type Category, type Hours, type Location, type Meta } from './data/types';
  import { fmtTime, isStale, loadHours, loadLocations, loadMeta, openNow, slotsToday } from './lib/data';

  const LABELS: Record<Category, string> = {
    'dining-center': 'Dining centers', express: 'Express', 'fast-casual': 'Fast casual',
    cafe: 'Cafes', 'convenience-store': 'Convenience stores',
  };

  let data = $state<{ locs: Location[]; hours: Hours; meta: Meta } | null>(null);
  let error = $state<string | null>(null);

  Promise.all([loadLocations(), loadHours(), loadMeta()])
    .then(([locs, hours, meta]) => (data = { locs, hours, meta }))
    .catch((e: Error) => (error = e.message));

  const hoursText = (h: Hours, l: Location) => {
    const s = slotsToday(h, l);
    if (!s) return 'Hours unknown';
    if (!s.length) return 'Closed today';
    return s.map((x) => `${x.period ? `${x.period} ` : ''}${fmtTime(x.start)}–${fmtTime(x.end)}`).join(', ');
  };
</script>

<main>
  <h1>BosaTek Eats</h1>
  <p class="muted">Iowa State dining hours and menus. Unofficial student project.</p>

  {#if error}
    <p class="warn" role="alert">Couldn't load dining data ({error}). Check dining.iastate.edu directly.</p>
  {:else if !data}
    <p aria-live="polite">Loading…</p>
  {:else}
    {@const { locs, hours, meta } = data}
    <p class="muted">Data updated {new Date(meta.lastSuccess ?? meta.lastAttempt).toLocaleString()}</p>
    {#if isStale(meta)}
      <p class="warn" role="status">This data may be out of date. Confirm hours on dining.iastate.edu.</p>
    {/if}

    {#each CATEGORIES as cat (cat)}
      {@const group = locs.filter((l) => l.category === cat)}
      {#if group.length}
        <section aria-labelledby="h-{cat}">
          <h2 id="h-{cat}">{LABELS[cat]}</h2>
          <ul class="venues">
            {#each group as l (l.slug)}
              <li>
                <div class="row">
                  <strong>{l.name}</strong>
                  {#if openNow(hours, l)}<span class="open">Open now</span>{/if}
                </div>
                <div class="muted">{l.building ?? ''} · {hoursText(hours, l)}</div>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
  {/if}

  <footer>
    <p>Allergen and nutrition info comes from ISU Dining and may be incomplete or out of date. Always confirm with dining staff.</p>
    <p>BosaTek Eats is not affiliated with or endorsed by Iowa State University or ISU Dining. Provided as is, without warranty. Nothing you enter leaves your device.</p>
  </footer>
</main>
