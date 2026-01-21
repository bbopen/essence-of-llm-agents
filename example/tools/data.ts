/**
 * Data Loading and Types for Synthetic Product Catalog
 *
 * Loads the synthetic data from JSON files and provides
 * typed access to products and reviews.
 *
 * DATA FILES (loaded by this module):
 *   ../data/products.json - 30 laptops with full specs
 *     - Price range: $449 - $2499
 *     - Specs: CPU, RAM (8-64GB), storage, display, GPU, weight
 *     - Tags: budget, gaming, business, programming, linux, etc.
 *
 *   ../data/reviews.json - Product reviews
 *     - Ratings: 1-5 stars
 *     - Includes: title, body, pros, cons, verified status
 *
 * EXPORTS:
 *   Types: Product, Review, ProductSpecs, SearchCriteria
 *   Functions: loadProducts, loadReviews, getProduct, searchProducts, compareProducts
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Types for our synthetic data
export interface ProductSpecs {
  cpu: string;
  cpuCores: number;
  ram: string;
  ramType: string;
  storage: string;
  storageType: string;
  display: string;
  displayResolution: string;
  displayType: string;
  gpu: string;
  weight: number;
  battery: string;
  ports: string[];
}

export interface Product {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  specs: ProductSpecs;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
}

export interface Review {
  id: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  helpful: number;
  date: string;
  author: string;
}

export interface ProductCatalog {
  products: Product[];
}

export interface ReviewDatabase {
  reviews: Record<string, Review[]>;
}

// Cache for loaded data
let productCatalog: ProductCatalog | null = null;
let reviewDatabase: ReviewDatabase | null = null;

function getDataPath(filename: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, '..', 'data', filename);
}

/**
 * Load the product catalog
 */
export function loadProducts(): Product[] {
  if (!productCatalog) {
    const data = readFileSync(getDataPath('products.json'), 'utf-8');
    productCatalog = JSON.parse(data) as ProductCatalog;
  }
  return productCatalog.products;
}

/**
 * Load reviews for a specific product
 */
export function loadReviews(productId: string): Review[] {
  if (!reviewDatabase) {
    const data = readFileSync(getDataPath('reviews.json'), 'utf-8');
    reviewDatabase = JSON.parse(data) as ReviewDatabase;
  }
  return reviewDatabase.reviews[productId] ?? [];
}

/**
 * Get a product by ID
 */
export function getProduct(productId: string): Product | undefined {
  const products = loadProducts();
  return products.find(p => p.id === productId);
}

/**
 * Search products by various criteria
 */
export interface SearchCriteria {
  query?: string;
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  minRating?: number;
  tags?: string[];
  inStock?: boolean;
}

export function searchProducts(criteria: SearchCriteria): Product[] {
  let results = loadProducts();

  // Filter by category
  if (criteria.category) {
    results = results.filter(p =>
      p.category.toLowerCase() === criteria.category!.toLowerCase()
    );
  }

  // Filter by price
  if (criteria.maxPrice !== undefined) {
    results = results.filter(p => p.price <= criteria.maxPrice!);
  }
  if (criteria.minPrice !== undefined) {
    results = results.filter(p => p.price >= criteria.minPrice!);
  }

  // Filter by rating
  if (criteria.minRating !== undefined) {
    results = results.filter(p => p.rating >= criteria.minRating!);
  }

  // Filter by stock
  if (criteria.inStock !== undefined) {
    results = results.filter(p => p.inStock === criteria.inStock);
  }

  // Filter by tags
  if (criteria.tags && criteria.tags.length > 0) {
    results = results.filter(p =>
      criteria.tags!.some(tag =>
        p.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
      )
    );
  }

  // Filter by query (searches name, brand, tags, and specs)
  if (criteria.query) {
    const query = criteria.query.toLowerCase();
    results = results.filter(p => {
      const searchableText = [
        p.name,
        p.brand,
        ...p.tags,
        p.specs.cpu,
        p.specs.gpu,
        p.specs.displayType,
      ].join(' ').toLowerCase();
      return searchableText.includes(query);
    });
  }

  // Sort by rating (best first)
  results.sort((a, b) => b.rating - a.rating);

  return results;
}

/**
 * Compare specs for multiple products
 */
export function compareProducts(productIds: string[]): {
  products: Product[];
  comparison: Record<string, Record<string, string | number>>;
} {
  const products = productIds
    .map(id => getProduct(id))
    .filter((p): p is Product => p !== undefined);

  const comparison: Record<string, Record<string, string | number>> = {};

  // Build comparison table
  const specKeys: (keyof ProductSpecs)[] = [
    'cpu', 'cpuCores', 'ram', 'storage', 'display',
    'displayType', 'gpu', 'weight', 'battery'
  ];

  for (const key of specKeys) {
    comparison[key] = {};
    for (const product of products) {
      const value = product.specs[key];
      comparison[key][product.id] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  // Add price and rating
  comparison['price'] = {};
  comparison['rating'] = {};
  for (const product of products) {
    comparison['price'][product.id] = product.price;
    comparison['rating'][product.id] = product.rating;
  }

  return { products, comparison };
}
