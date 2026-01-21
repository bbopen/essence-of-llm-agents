/**
 * Get Reviews Tool
 *
 * Retrieves reviews for a specific product.
 * Returns review summaries including ratings, titles, and key content.
 *
 * IMPLEMENTS:
 *   Pattern 3.3 (Tool Validation) - Input validation via JSON Schema
 *   @see ../../patterns/06-tool-validation.ts
 *
 * DATA SOURCE:
 *   ../data/reviews.json - Product reviews with ratings, pros/cons
 *   @see ./data.ts for the data loading implementation
 */

import type { Tool } from '../../patterns/types.js';
import { loadReviews, getProduct, type Review } from './data.js';

/**
 * Format a review for display to the LLM
 */
function formatReview(review: Review): string {
  const verified = review.verified ? '[Verified Purchase]' : '[Unverified]';
  return [
    `Rating: ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} (${review.rating}/5) ${verified}`,
    `Title: "${review.title}"`,
    `"${review.body}"`,
    `- ${review.author}, ${review.date} (${review.helpful} found helpful)`,
  ].join('\n');
}

/**
 * Calculate review summary statistics
 */
function summarizeReviews(reviews: Review[]): string {
  if (reviews.length === 0) {
    return 'No reviews available';
  }

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const verifiedCount = reviews.filter(r => r.verified).length;

  const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => distribution[r.rating]++);

  return [
    `Average Rating: ${avgRating.toFixed(1)}/5`,
    `Total Reviews: ${reviews.length}`,
    `Verified Purchases: ${verifiedCount}/${reviews.length}`,
    `Distribution: 5★(${distribution[5]}) 4★(${distribution[4]}) 3★(${distribution[3]}) 2★(${distribution[2]}) 1★(${distribution[1]})`,
  ].join('\n');
}

export const getReviewsTool: Tool = {
  name: 'get_reviews',
  description:
    'Get reviews for a specific product by ID. Returns review summaries, ratings, and key feedback. ' +
    'Use this to understand user experiences and identify pros/cons of a product.',
  parameters: {
    type: 'object',
    properties: {
      productId: {
        type: 'string',
        description: 'Product ID to get reviews for (e.g., "laptop-001")',
      },
    },
    required: ['productId'],
  },

  execute: async (args): Promise<string> => {
    try {
      const productId = args.productId as string;

      // Validate product exists
      const product = getProduct(productId);
      if (!product) {
        return `Error: Product "${productId}" not found. Use search_products to find valid product IDs.`;
      }

      const reviews = loadReviews(productId);

      if (reviews.length === 0) {
        return `No reviews found for ${product.name} (${productId}). The product has ${product.reviewCount} reviews in the system but none are loaded in our sample data.`;
      }

      const output = [
        `=== Reviews for ${product.name} ===`,
        `Price: $${product.price.toFixed(2)}`,
        '',
        '--- Summary ---',
        summarizeReviews(reviews),
        '',
        '--- Individual Reviews ---',
        ...reviews.map(r => formatReview(r)),
      ].join('\n');

      return output;
    } catch (error) {
      return `Error getting reviews: ${(error as Error).message}`;
    }
  },
};
