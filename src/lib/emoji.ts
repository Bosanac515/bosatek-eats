// Visuals are emoji only (no external images): first keyword match wins, then a category fallback.
import type { MenuItem } from '../data/types';

const KEYWORDS: [RegExp, string, string][] = [
  [/pizza/i, '🍕', 'pizza'], [/burger|cheeseburger/i, '🍔', 'burger'], [/hot dog|bratwurst|brat\b/i, '🌭', 'hot dog'],
  [/taco/i, '🌮', 'taco'], [/burrito|wrap|quesadilla/i, '🌯', 'wrap'], [/sushi|pok[eé]|roll\b/i, '🍣', 'sushi'],
  [/ramen|noodle|lo mein|pho/i, '🍜', 'noodles'], [/pasta|spaghetti|mac(aroni)? and cheese|alfredo|penne|rotini/i, '🍝', 'pasta'],
  [/soup|chili|stew|chowder/i, '🍲', 'soup'], [/salad/i, '🥗', 'salad'], [/sandwich|sub\b|panini|blt/i, '🥪', 'sandwich'],
  [/fries|tots/i, '🍟', 'fries'], [/rice|pilaf/i, '🍚', 'rice'], [/curry/i, '🍛', 'curry'],
  [/chicken|tender|wing/i, '🍗', 'chicken'], [/bacon|pork|ham\b/i, '🥓', 'pork'], [/beef|steak|brisket|meatball/i, '🥩', 'beef'],
  [/fish|salmon|cod|tuna|shrimp/i, '🐟', 'fish'], [/egg|omelet/i, '🍳', 'eggs'], [/pancake|waffle|french toast/i, '🧇', 'waffle'],
  [/bagel/i, '🥯', 'bagel'], [/croissant/i, '🥐', 'croissant'], [/muffin|bread|toast|biscuit|roll/i, '🍞', 'bread'],
  [/cookie/i, '🍪', 'cookie'], [/cake|brownie|bar\b|dessert|pie\b/i, '🍰', 'dessert'], [/ice cream|gelato/i, '🍨', 'ice cream'],
  [/yogurt|parfait/i, '🥛', 'yogurt'], [/smoothie|shake/i, '🥤', 'smoothie'], [/coffee|latte|espresso|mocha/i, '☕', 'coffee'],
  [/tea\b/i, '🍵', 'tea'], [/apple|banana|orange|fruit|berr/i, '🍎', 'fruit'], [/potato/i, '🥔', 'potato'],
  [/broccoli|vegetable|veggie|green bean|carrot|brussel|corn\b/i, '🥦', 'vegetables'], [/tofu|bean|lentil|hummus/i, '🫘', 'beans'],
  [/cheese/i, '🧀', 'cheese'],
];

const CATEGORY: [RegExp, string, string][] = [
  [/dessert|bakery|sweet/i, '🍰', 'dessert'], [/breakfast/i, '🍳', 'breakfast'], [/side|vegetable/i, '🥦', 'side'],
  [/beverage|drink/i, '🥤', 'drink'], [/salad/i, '🥗', 'salad'], [/deli|sandwich/i, '🥪', 'sandwich'],
];

export function emojiFor(item: Pick<MenuItem, 'name' | 'category'>): { emoji: string; label: string } {
  const hit = KEYWORDS.find(([re]) => re.test(item.name)) ?? CATEGORY.find(([re]) => re.test(item.category ?? ''));
  return hit ? { emoji: hit[1], label: hit[2] } : { emoji: '🍽️', label: 'meal' };
}
