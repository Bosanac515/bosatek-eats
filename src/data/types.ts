// Shapes of the files in public/data. The scraper writes them; the app only reads them.

export const CATEGORIES = ['dining-center', 'express', 'fast-casual', 'cafe', 'convenience-store'] as const;
export const ACCEPTS = ['Credit', 'Dining Dollars', 'Flex Meal', 'Meal Plan', 'ISU Card', 'Cash'] as const;
export const TIERS = ['meal-swipe', 'express-meal', 'flex-meal', 'dining-dollars', 'pay'] as const;
export const DIETS = ['halal', 'vegan', 'vegetarian'] as const;
export const ALLERGENS = [
  'dairy', 'eggs', 'fish', 'peanuts', 'shellfish', 'soy', 'sesame', 'tree-nuts', 'wheat-gluten',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Accept = (typeof ACCEPTS)[number];
export type Tier = (typeof TIERS)[number];
export type Diet = (typeof DIETS)[number];
export type Allergen = (typeof ALLERGENS)[number];

export interface Location {
  slug: string;
  isuId: number | null;
  name: string;
  category: Category;
  /** Category as ISU lists it, before overrides; null for manual venues. */
  listedAs: Category | null;
  building: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  accepts: Accept[];
  payment: Tier[];
  source: 'isu' | 'manual';
  url: string;
}

export interface Slot {
  start: string; // "HH:MM", may be "24:00"
  end: string;
  period: string | null; // meal name, null at retail
}

/** venue slug -> ISO date -> open slots ([] = closed) */
export type Hours = Record<string, Record<string, Slot[]>>;

export interface MenuItem {
  id: string;
  name: string;
  station: string | null;
  category: string | null;
  mealPeriod: string | null;
  date: string;
  servingSize: string | null;
  servingGrams: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  diet: Diet[];
  /** null = the source has no allergen data for this item: UNKNOWN, never allergen-free. */
  allergens: Allergen[] | null;
  ingredients: string | null;
}

export interface Menu {
  venue: string;
  fetchedAt: string; // ISO timestamp
  /** true for fixed-menu venues pulled monthly/quarterly: the UI shows "menu as of fetchedAt". */
  fixed: boolean;
  items: MenuItem[];
}

export interface Meta {
  lastAttempt: string;
  lastSuccess: string | null;
  ok: boolean;
  errors: string[];
}
