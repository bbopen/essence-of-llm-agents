/**
 * Tools Index - Smart Purchase Advisor
 *
 * This file implements Pattern 3.1 (Complete Action Spaces) from the guide.
 * All tools the agent can use are defined and exported here.
 *
 * FILE LOCATIONS:
 * ───────────────────────────────────────────────────────────────────────────
 * Tools (this directory):
 *   ./search-products.ts  - Search product catalog by criteria
 *   ./get-reviews.ts      - Fetch reviews for a specific product
 *   ./compare-specs.ts    - Compare specifications of multiple products
 *   ./done.ts             - Signal task completion (Pattern 3.2)
 *   ./data.ts             - Data loading and search functions
 *
 * Data files (referenced by tools):
 *   ../data/products.json - Product catalog (30 laptops with specs, prices, tags)
 *   ../data/reviews.json  - Product reviews (ratings, pros/cons, comments)
 *
 * Scaffolding patterns (what these tools implement):
 *   ../../patterns/04-complete-action-spaces.ts - Tool availability
 *   ../../patterns/05-explicit-termination.ts   - Done tool pattern
 *   ../../patterns/06-tool-validation.ts        - Input validation
 * ───────────────────────────────────────────────────────────────────────────
 *
 * @see patterns/04-complete-action-spaces.ts
 */

export { searchProductsTool } from './search-products.js';
export { getReviewsTool } from './get-reviews.js';
export { compareSpecsTool } from './compare-specs.js';
export { doneTool, parseRecommendation } from './done.js';
export type { RecommendationResult } from './done.js';

// Data exports for advanced usage
// See ../data/products.json and ../data/reviews.json for raw data
export {
  loadProducts,
  loadReviews,
  getProduct,
  searchProducts,
  compareProducts,
} from './data.js';
export type { Product, Review, ProductSpecs, SearchCriteria } from './data.js';

import type { Tool } from '../../patterns/types.js';
import { searchProductsTool } from './search-products.js';
import { getReviewsTool } from './get-reviews.js';
import { compareSpecsTool } from './compare-specs.js';
import { doneTool } from './done.js';

/**
 * All tools available to the purchase advisor agent
 */
export const allTools: Tool[] = [
  searchProductsTool,
  getReviewsTool,
  compareSpecsTool,
  doneTool,
];

/**
 * Get tools by name
 */
export function getTools(...names: string[]): Tool[] {
  return allTools.filter(t => names.includes(t.name));
}
