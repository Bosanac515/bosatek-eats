# ISU Dining: discovery notes (2026-11-05)

All endpoints were derived from the site's own JS (`Drupal.behaviors.diningVenueVenue` in the
footer `js_*.js` bundle and the hours grid on `/locations`). Public, unauthenticated, JSON.
robots.txt (stock Drupal) does not restrict `/location/*`, `/locations`, `/plans` or `/api/*`.
About 28 requests were used in discovery; every response was 200 with no challenge.

Etiquette: honest User-Agent, at most 1 request per 2 s. On 403, 429 or a challenge page, stop and
email dining@iastate.edu.

```
UA="BosaTekEats/0.1 (+https://eats.bosatek.com; hello@bosatek.com)"
# discovery (2026-11-05) used "ISUDiningPlanner/0.1 (student project; hello@bosatek.com)"
```

## Endpoints

### Venue list: `GET /locations` (HTML)
Cards grouped by `<div class="card-set" data-type="{category}">`, with `data-type` one of
dining-center | fast-casual | express | cafe | convenience-store. Each card has
`.iastate22-card[data-venue-id]`, `a[href="/location/{slug}"]` (the name, HTML-escaped) and
`.label-building`. There are 24 venues.

### Venue page: `GET /location/{slug}` (HTML)
- `.dining-venue[data-id]` is the venue id
- `#dining-venue-map[data-lat][data-lng]` gives the coordinates
- `Accepts:` badges are `span.badge.text-bg-secondary` (Credit, Dining Dollars, Flex Meal, Meal Plan, ISU Card)
- The address is in the venue's "Location" block. **Ignore the footer address** (ISU Dining office, 1215 Friley Hall).

### Hours: `GET /api/dining/hours?locs={id[,id…]}&date={YYYY-MM-DD}&days=7`
```
curl -sS -A "$UA" "https://dining.iastate.edu/api/dining/hours?locs=30,23,60,39&date=2026-11-05&days=7"
```
Response: `{locs: {"<id>": {name, days: {"YYYY-MM-DD": [{day, all_day, starthours, endhours, comment}]}}}}`.
Times are HHMM integers. `comment` is the meal period name ("" at retail). An empty array means closed.
One call covers all 24 venues.

### Menu: `GET /api/venue/{id}/menu/{YYYY-MM-DD}`
```
curl -sS -A "$UA" "https://dining.iastate.edu/api/venue/30/menu/2026-11-05"
```
Response: `{meals, hours, html_render}`. Ignore `html_render`, which is most of the 0.4 to 2 MB.
`meals.{oid} = {meal, date, menu_displays.{id} = {name, categories.{key} = {name, items.{oid}}}}`.
Menus are published **today + 6 days**. On day 8 and later, `meals` keep their names but have no `menu_displays`.

Item fields used: `oid, name, serving_station, category_display_name, ingredients,
unit_of_measure_name, unit_of_measure_net_weight_gram, nutrients.{key}.quantity, traits`.
- `nutrients` keys: kcal, fat, sfa, fatrn, chol, na, cho, fibtg, addsgr, sugar, pro, vitd, ca, fe, k
- `traits.requirement`: halal, vegan, vegetarian
- `traits.allergen`: dairy, eggs, fish, peanuts, crustacean_shellfish, soy, sesame_tahini, treenuts, wheat_gluten
- `traits.miscellaneous_special_diet_info`: not_halal, not_vegan, not_vegetarian, mashbooh, alcohol
- `traits.general`: internal kitchen flags. **Not used.**

### Other pages
- `/plans`: plan table, Flex Meal cap ($13.75; stated for Campanile and Block), Block plans, Dining Dollar discounts.
- `/nutritional-download`: editorial page only. **No bulk dataset.**

## Normalized menu item (`data/menus/*.json`)

| Field | Source | Notes |
|---|---|---|
| id | `oid` | |
| name | `name` | Some are placeholders like "-- Salad Bar --" |
| station | `serving_station`, else display name | `serving_station` is null at MU Food Court |
| category | `category_display_name` | |
| mealPeriod, date | meal `meal`, `date` | Period names vary by venue |
| servingSize, servingGrams | `unit_of_measure_*` | |
| calories, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg | `nutrients.*.quantity` | **null** for placeholder items (~8%) |
| diet | `traits.requirement`, minus `not_*` | `[]` means not certified |
| allergens | `traits.allergen` | **null when the item has no traits (~11%), meaning UNKNOWN, never allergen-free** |
| ingredients | `ingredients` | Free text, capped at 2000 characters |

The source does not provide: price, per-item photos, or a separate gluten-free flag.
`wheat-gluten` is an allergen, not a certification.

## Data notes and decisions
- **Flex Meal is not the same as express.** Express venues show only "Meal Plan". Flex Meal appears at retail venues.
  So express comes from `data-type="express"`, and Flex comes from the badge.
- **Conversations** is listed as Express but is treated as a dining center (`locations.overrides.json`).
  Unverified: whether it also takes express meals.
- **MU tenants** (Panda Express, Chick-fil-A, Sushi Do) are not in ISU Dining's data. They're entered by hand in
  `data/manual-venues.json`: Dining Dollars or cash only, hours as of 2026-11-05, no item data.
- Cardinal and Gold Flex Meals: set to `false`, **unverified**.
- Scrape cadence: `data/schedule.json` (hours daily; dining centers and Conversations weekly; fast-casual monthly; the rest quarterly, staggered).
- Venue page field: `data-id` on the venue page matches the venue id on `/locations`.

## Files
- `samples/`: raw responses (never re-requested)
- `tools/normalize_discovery.py`: samples to data (has self-checks)
- `data/locations.json`, `hours.json`, `plans.json`, `menus/`
- `data/locations.overrides.json`, `manual-venues.json`, `schedule.json`
