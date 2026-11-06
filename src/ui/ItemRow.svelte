<script lang="ts">
  import type { MenuItem } from '../data/types';
  import { emojiFor } from '../lib/emoji';

  let { item }: { item: MenuItem } = $props();
  const e = $derived(emojiFor(item));
  const g = (v: number | null, unit = 'g') => (v === null ? '–' : `${Math.round(v)}${unit}`);
</script>

<details class="item">
  <summary>
    <span class="emoji" role="img" aria-label={e.label}>{e.emoji}</span>
    <span>
      <span>{item.name}</span>
      {#if item.diet.length}
        <span class="tiny muted"> · {item.diet.join(', ')}</span>
      {/if}
    </span>
    <span class="kcal">{item.calories === null ? '' : `${Math.round(item.calories)} kcal`}</span>
  </summary>
  <div class="detail">
    {#if item.calories !== null}
      <div class="macros" aria-label="Nutrition per serving">
        <div><b>{g(item.proteinG)}</b><span>protein</span></div>
        <div><b>{g(item.carbsG)}</b><span>carbs</span></div>
        <div><b>{g(item.fatG)}</b><span>fat</span></div>
        <div><b>{g(item.sodiumMg, 'mg')}</b><span>sodium</span></div>
      </div>
    {/if}
    {#if item.servingSize}<p class="muted">Serving: {item.servingSize}</p>{/if}
    <p>
      <strong>Allergens:</strong>
      {#if item.allergens === null}
        <span class="error">No allergen info from ISU. Ask staff before eating.</span>
      {:else if item.allergens.length}
        {item.allergens.join(', ')}
      {:else}
        none listed by ISU
      {/if}
    </p>
    {#if item.ingredients}<p class="muted small"><strong>Ingredients:</strong> {item.ingredients}</p>{/if}
  </div>
</details>
