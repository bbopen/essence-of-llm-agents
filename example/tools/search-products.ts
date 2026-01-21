/**
 * Search Products Tool
 *
 * Searches the synthetic product catalog based on criteria.
 * Returns matching products sorted by rating.
 *
 * IMPLEMENTS:
 *   Pattern 3.3 (Tool Validation) - Input validation via JSON Schema
 *   @see ../../patterns/06-tool-validation.ts
 *
 * DATA SOURCE:
 *   ../data/products.json - 30 laptops with specs, prices, tags
 *   @see ./data.ts for the search implementation
 */

import type { Tool } from '../../patterns/types.js';
import { searchProducts, type Product } from './data.js';

/**
 * Format a product for display to the LLM
 */
function formatProduct(product: Product): string {
  return [
    `ID: ${product.id}`,
    `Name: ${product.name}`,
    `Brand: ${product.brand}`,
    `Price: $${product.price.toFixed(2)}`,
    `Rating: ${product.rating}/5 (${product.reviewCount} reviews)`,
    `CPU: ${product.specs.cpu}`,
    `RAM: ${product.specs.ram}`,
    `Storage: ${product.specs.storage}`,
    `Display: ${product.specs.display} ${product.specs.displayType}`,
    `Weight: ${product.specs.weight} lbs`,
    `Tags: ${product.tags.join(', ')}`,
    `In Stock: ${product.inStock ? 'Yes' : 'No'}`,
  ].join('\n');
}

export const searchProductsTool: Tool = {
  name: 'search_products',
  description:
    'Search for products in the catalog. Returns products matching the criteria, sorted by rating. ' +
    'Use this to find products based on user requirements like budget, features, or use case.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query (searches name, brand, tags, specs). E.g., "laptop programming" or "OLED display"',
      },
      category: {
        type: 'string',
        description: 'Product category. Currently only "laptops" is available.',
        enum: ['laptops'],
      },
      maxPrice: {
        type: 'number',
        description: 'Maximum price in USD',
      },
      minPrice: {
        type: 'number',
        description: 'Minimum price in USD',
      },
      minRating: {
        type: 'number',
        description: 'Minimum rating (1-5)',
      },
      tags: {
        type: 'array',
        description:
          'Tags to filter by. E.g., ["programming", "lightweight"]. Products matching ANY tag are returned.',
        items: { type: 'string' },
      },
    },
    required: [],
  },

  execute: async (args): Promise<string> => {
    try {
      const criteria = {
        query: args.query as string | undefined,
        category: args.category as string | undefined,
        maxPrice: args.maxPrice as number | undefined,
        minPrice: args.minPrice as number | undefined,
        minRating: args.minRating as number | undefined,
        tags: args.tags as string[] | undefined,
        inStock: true, // Only show in-stock products
      };

      const results = searchProducts(criteria);

      if (results.length === 0) {
        return 'No products found matching the criteria. Try broadening your search.';
      }

      // Limit to top 10 results to avoid context bloat
      const topResults = results.slice(0, 10);

      const output = [
        `Found ${results.length} products (showing top ${topResults.length}):`,
        '',
        ...topResults.map((p, i) => `--- Product ${i + 1} ---\n${formatProduct(p)}`),
      ].join('\n');

      return output;
    } catch (error) {
      return `Error searching products: ${(error as Error).message}`;
    }
  },
};
