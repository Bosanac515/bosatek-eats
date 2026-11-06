<script lang="ts">
  import { app, locate, nearVenue } from '../lib/app.svelte';

  let busy = $state(false);
  let msg = $state('');
  let pick = $state('');

  async function useMine() {
    busy = true;
    msg = '';
    try { await locate(); } catch (e) { msg = (e as Error).message; } finally { busy = false; }
  }
</script>

<div class="stack-sm no-print">
  <div class="row">
    <button class="small" onclick={useMine} disabled={busy} aria-describedby="loc-note">📍 {busy ? 'Locating…' : 'Use my location'}</button>
    <label class="sr-only" for="near">Or pick where you are</label>
    <select id="near" class="grow" bind:value={pick} onchange={() => pick && nearVenue(pick)}>
      <option value="">I'm near…</option>
      {#each app.locs.filter((l) => l.source === 'isu') as l (l.slug)}<option value={l.slug}>{l.name}</option>{/each}
    </select>
  </div>
  <p id="loc-note" class="tiny muted">
    {#if app.pos}Sorting by distance from {app.posLabel}. {/if}Your location is used only on this page and never saved.
  </p>
  {#if msg}<p class="error small" role="alert">{msg}</p>{/if}
</div>
