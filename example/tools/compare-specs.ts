/**
 * Compare Specs Tool
 *
 * Compares specifications across multiple products.
 * Returns a side-by-side comparison table.
 *
 * IMPLEMENTS:
 *   Pattern 3.3 (Tool Validation) - Input validation via JSON Schema
 *   @see ../../patterns/06-tool-validation.ts
 *
 * DATA SOURCE:
 *   ../data/products.json - Product specs for comparison
 *   @see ./data.ts for the comparison implementation
 */

import type { Tool } from '../../patterns/types.js';
import { compareProducts, getProduct } from './data.js';

export const compareSpecsTool: Tool = {
  name: 'compare_specs',
  description:
    'Compare specifications of multiple products side-by-side. ' +
    'Use this to help users understand differences between products they are considering.',
  parameters: {
    type: 'object',
    properties: {
      productIds: {
        type: 'array',
        description: 'Array of product IDs to compare (2-5 products)',
        items: { type: 'string' },
      },
    },
    required: ['productIds'],
  },

  execute: async (args): Promise<string> => {
    try {
      const productIds = args.productIds as string[];

      if (!productIds || productIds.length < 2) {
        return 'Error: Please provide at least 2 product IDs to compare.';
      }

      if (productIds.length > 5) {
        return 'Error: Maximum 5 products can be compared at once. Please reduce your selection.';
      }

      // Validate all products exist
      const invalidIds = productIds.filter(id => !getProduct(id));
      if (invalidIds.length > 0) {
        return `Error: Products not found: ${invalidIds.join(', ')}. Use search_products to find valid IDs.`;
      }

      const { products, comparison } = compareProducts(productIds);

      // Build comparison table
      const headers = ['Spec', ...products.map(p => p.name.substring(0, 20))];
      const rows: string[][] = [];

      // Add comparison rows
      const specLabels: Record<string, string> = {
        cpu: 'CPU',
        cpuCores: 'CPU Cores',
        ram: 'RAM',
        storage: 'Storage',
        display: 'Display Size',
        displayType: 'Display Type',
        gpu: 'GPU',
        weight: 'Weight (lbs)',
        battery: 'Battery',
        price: 'Price ($)',
        rating: 'Rating',
      };

      for (const [key, values] of Object.entries(comparison)) {
        const label = specLabels[key] || key;
        const row = [label];
        for (const product of products) {
          const value = values[product.id];
          if (key === 'price') {
            row.push(`$${(value as number).toFixed(0)}`);
          } else if (key === 'rating') {
            row.push(`${value}/5`);
          } else {
            row.push(String(value));
          }
        }
        rows.push(row);
      }

      // Format as table
      const colWidths = headers.map((h, i) => {
        const allValues = [h, ...rows.map(r => r[i])];
        return Math.max(...allValues.map(v => v.length));
      });

      const formatRow = (cells: string[]) =>
        cells.map((c, i) => c.padEnd(colWidths[i])).join(' | ');

      const separator = colWidths.map(w => '-'.repeat(w)).join('-+-');

      const output = [
        '=== Product Comparison ===',
        '',
        formatRow(headers),
        separator,
        ...rows.map(formatRow),
        '',
        '--- Tags ---',
        ...products.map(p => `${p.name}: ${p.tags.join(', ')}`),
      ].join('\n');

      return output;
    } catch (error) {
      return `Error comparing products: ${(error as Error).message}`;
    }
  },
};
