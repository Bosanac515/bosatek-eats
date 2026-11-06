<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { isStale } from '../lib/data';
  const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : 'never');
</script>

<div class="page-head">
  <h1 tabindex="-1">About BosaTek Eats</h1>
  <p class="muted small">An independent student project by BosaTek.</p>
</div>

<section class="card stack-sm" aria-labelledby="data-h">
  <h2 id="data-h">Data</h2>
  <p class="small">Menus, hours and locations are read from ISU Dining's public website on a schedule: hours daily,
    dining center menus weekly, other menus monthly or quarterly. Memorial Union tenant hours are entered by hand.</p>
  {#if app.meta}
    <p class="small muted">Last successful update: {when(app.meta.lastSuccess)}.</p>
    {#if isStale(app.meta)}<p class="warn">The last update didn't finish, so some information may be out of date.</p>{/if}
  {/if}
  <p class="small">For official information, visit <a href="https://dining.iastate.edu" rel="noopener noreferrer" target="_blank">dining.iastate.edu</a>.</p>
</section>

<section class="card stack-sm" aria-labelledby="allergy-h">
  <h2 id="allergy-h">Allergens and nutrition</h2>
  <p class="small">Allergen, ingredient, diet and nutrition information is copied from ISU Dining's public menus and may be incomplete,
    out of date or wrong. Recipes, suppliers and portions change, and cross-contact can happen in any kitchen. Items marked
    "no allergen info" have no data from the source and are not allergen-free. BosaTek Eats cannot guarantee that any item is free
    of any allergen or suitable for any diet, including vegan, vegetarian or halal.</p>
  <p class="small">If you have a food allergy or a medical or religious dietary requirement, confirm every item with dining staff before
    eating it. ISU Dining's guidance is to check the ingredient label next to each dish and ask staff, and its registered dietitian
    can help with accommodations.</p>
</section>

<section class="card stack-sm" aria-labelledby="med-h">
  <h2 id="med-h">Not medical advice</h2>
  <p class="small">Calorie and protein targets are general estimates (Mifflin-St Jeor equation times activity level, adjusted by goal)
    and are not medical, nutritional or dietary advice. They are not suitable for anyone who is pregnant, managing a medical
    condition, or has a history of disordered eating. Talk to a doctor or registered dietitian before changing how you eat;
    ISU Dining offers dietitian consultations to meal plan holders.</p>
</section>

<section class="card stack-sm" aria-labelledby="aff-h">
  <h2 id="aff-h">Unofficial</h2>
  <p class="small">BosaTek Eats is not affiliated with, endorsed by, or operated by Iowa State University or ISU Dining, or by
    Panda Express, Chick-fil-A or Sushi Do. All names and trademarks belong to their owners. Menus, hours, payment rules, plan
    terms and prices can change without notice.</p>
</section>

<section class="card stack-sm" aria-labelledby="priv-h">
  <h2 id="priv-h">Privacy</h2>
  <p class="small">Everything you enter stays in this browser. Your location is used only to sort places while the page is open,
    and is never stored or sent anywhere. No accounts, analytics, ads or tracking.</p>
</section>

<section class="card stack-sm" aria-labelledby="warr-h">
  <h2 id="warr-h">No warranty</h2>
  <p class="small">Provided "as is", without warranty of any kind. You use it at your own risk, and the author is not liable for any
    loss or harm arising from its use, including from reliance on menu, allergen, nutrition, hours or payment information.</p>
  <p class="small">Questions or a request to stop collecting data: <a href="mailto:hello@bosatek.com">hello@bosatek.com</a></p>
</section>
