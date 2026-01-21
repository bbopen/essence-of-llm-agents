/**
 * Purchase Advisor Evaluation Runner
 *
 * Implements Pattern 8.1 (Statistical Evaluation) from the guide.
 * For stochastic systems, test distributions not single runs.
 *
 * This demonstrates realistic evaluation of an LLM-based agent with:
 * - Varied difficulty scenarios (easy → hard)
 * - Multiple runs to measure reliability
 * - Statistical metrics (confidence intervals, success rates)
 * - Success criteria beyond simple completion
 *
 * FILE LOCATIONS:
 * ───────────────────────────────────────────────────────────────────────────
 * This file (evaluation runner):
 *   ./runner.ts                 - You are here
 *
 * Scaffolding pattern:
 *   ../../patterns/15-evaluation.ts - Evaluator class, statistical helpers
 *
 * Agent implementation:
 *   ../index.ts                 - The agent loop (Pattern 1.1)
 *   ../tools/index.ts           - Available tools
 *   ../llm/index.ts             - LLM client factory (mock or real)
 *
 * Data files (used by tools during evaluation):
 *   ../data/products.json       - Product catalog (30 laptops)
 *   ../data/reviews.json        - Product reviews
 *
 * System prompt:
 *   Defined inline below as PURCHASE_ADVISOR_PROMPT
 *   (see line ~262)
 *
 * Evaluation scenarios:
 *   Defined inline below as SCENARIOS array
 *   (see line ~99)
 *   - 2 EASY scenarios (clear requirements, many matches)
 *   - 3 MEDIUM scenarios (specific requirements, fewer matches)
 *   - 3 HARD scenarios (conflicting/edge case requirements)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npx tsx example/evaluation/runner.ts           # Run with real LLM
 *   npx tsx example/evaluation/runner.ts --mock    # Run with mock LLM
 *   npx tsx example/evaluation/runner.ts --full    # Run all 8 scenarios
 *   npx tsx example/evaluation/runner.ts --scenario=2  # Run specific scenario
 *
 * @see patterns/15-evaluation.ts - The scaffolding this mirrors
 * @see example/data/products.json - Product data used by success criteria
 */

import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env.local' });

import type { Tool } from '../../patterns/types.js';
import { createClient } from '../llm/index.js';
import { allTools, parseRecommendation, getProduct } from '../tools/index.js';
import { EventStore } from '../state/index.js';
import { agent } from '../index.js';

// =============================================================================
// TYPES
// =============================================================================

interface EvalScenario {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  task: string;
  description: string;
  expectedBehavior: string;
  successCriteria: (result: RunResult) => boolean;
  runs: number;
  timeout: number;
}

interface RunResult {
  id: string;
  success: boolean;
  error?: string;
  durationMs: number;
  iterations: number;
  toolCalls: number;
  timedOut: boolean;
  recommendation?: string;
  recommendedPrice?: number;
  confidence?: number;
  reasoning?: string;
}

interface EvalMetrics {
  successRate: number;
  confidenceInterval: [number, number];
  avgDurationMs: number;
  p95DurationMs: number;
  avgIterations: number;
  timeoutRate: number;
  errorRate: number;
}

interface ScenarioResult {
  scenario: EvalScenario;
  runs: RunResult[];
  metrics: EvalMetrics;
  timestamp: number;
}

// =============================================================================
// EVALUATION SCENARIOS
// =============================================================================

/**
 * Evaluation scenarios designed for realistic variability.
 *
 * These scenarios are defined inline here (not in a separate file) to make
 * the evaluation self-contained and easy to follow. Each scenario:
 *
 * 1. Has a task string (what the user asks for)
 * 2. Has success criteria that reference product data from ../data/products.json
 * 3. Uses getProduct() to validate recommendations against the actual catalog
 *
 * The success criteria are designed based on what products exist in the catalog:
 * - products.json has 30 laptops ranging from $449 to $2499
 * - Various specs: 8GB-64GB RAM, different GPUs, weights, display types
 * - Tags: budget, gaming, business, programming, linux, etc.
 *
 * DIFFICULTY LEVELS:
 *
 * EASY: Clear requirements, many matching products
 *   - Expected success rate: 80-100%
 *   - Tests basic agent functionality
 *
 * MEDIUM: Somewhat specific requirements, fewer matches
 *   - Expected success rate: 50-80%
 *   - Tests reasoning and prioritization
 *
 * HARD: Conflicting/edge case requirements
 *   - Expected success rate: 30-60%
 *   - Tests robustness and graceful failure
 *
 * @see ../data/products.json - The product catalog these scenarios test against
 */
const SCENARIOS: EvalScenario[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // EASY: Should succeed most of the time
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'easy-programming',
    name: 'Programming Laptop (Easy)',
    difficulty: 'easy',
    task: 'Find me a laptop under $1500 for software development. I need at least 16GB RAM.',
    description: 'Clear budget, clear use case, many matching products',
    expectedBehavior: 'Should recommend a programming-tagged laptop ≤$1500 with 16GB+ RAM',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      if (!product) return false;
      // Must be under budget with adequate RAM
      const ramGB = parseInt(product.specs.ram) || 0;
      return product.price <= 1500 && ramGB >= 16;
    },
    runs: 5,
    timeout: 120000,
  },
  {
    id: 'easy-budget',
    name: 'Budget Student Laptop (Easy)',
    difficulty: 'easy',
    task: 'I need a cheap laptop for college, mainly for taking notes and browsing. Under $700 please.',
    description: 'Low budget, basic requirements, several budget options exist',
    expectedBehavior: 'Should recommend a budget laptop ≤$700',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      return product !== undefined && product.price <= 700;
    },
    runs: 5,
    timeout: 120000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MEDIUM: Requires more reasoning, fewer perfect matches
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'medium-linux',
    name: 'Linux Development (Medium)',
    difficulty: 'medium',
    task: 'I want a laptop that works well with Linux for development. Good keyboard is important. Budget around $1200.',
    description: 'Specific ecosystem requirement, only 3 Linux-tagged laptops exist',
    expectedBehavior: 'Should find Framework, System76, or Tuxedo; may also suggest ThinkPads',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      if (!product) return false;
      // Linux-friendly brands or has linux tag
      const linuxFriendly = ['Framework', 'System76', 'Tuxedo', 'Lenovo'].includes(product.brand);
      const hasLinuxTag = product.tags.some(t =>
        t.includes('linux') || t.includes('programming') || t.includes('developer')
      );
      return product.price <= 1400 && (linuxFriendly || hasLinuxTag);
    },
    runs: 5,
    timeout: 120000,
  },
  {
    id: 'medium-portable-gaming',
    name: 'Portable Gaming (Medium)',
    difficulty: 'medium',
    task: 'Looking for a gaming laptop that I can also carry around campus. Needs dedicated GPU but should be under 4 lbs if possible.',
    description: 'Conflicting requirements: gaming power vs portability',
    expectedBehavior: 'Should recommend ROG Zephyrus G14 or Razer Blade 14 (gaming + relatively light)',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      if (!product) return false;
      // Must have dedicated GPU and be reasonably portable
      const hasDedicatedGPU = product.specs.gpu.includes('RTX') ||
                              product.specs.gpu.includes('Radeon RX');
      const isPortable = product.specs.weight <= 4.5; // Some flexibility
      return hasDedicatedGPU && isPortable;
    },
    runs: 5,
    timeout: 120000,
  },
  {
    id: 'medium-oled-value',
    name: 'OLED on a Budget (Medium)',
    difficulty: 'medium',
    task: 'I want a laptop with an OLED display for watching movies and coding. Trying to keep it under $900.',
    description: 'Specific display requirement with tight budget',
    expectedBehavior: 'Should find ASUS Zenbook 14 OLED ($849) or ASUS VivoBook S 15 OLED ($699)',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      if (!product) return false;
      const hasOLED = product.specs.displayType.toLowerCase().includes('oled') ||
                      product.specs.displayType.toLowerCase().includes('amoled');
      return hasOLED && product.price <= 900;
    },
    runs: 5,
    timeout: 120000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HARD: Edge cases, likely to have failures or require creative solutions
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'hard-32gb-budget',
    name: '32GB RAM Under $1300 (Hard)',
    difficulty: 'hard',
    task: 'I need a laptop with 32GB RAM for running multiple VMs. My budget is strictly $1300.',
    description: 'Only one product matches: Tuxedo InfinityBook Pro 14 at exactly $1299',
    expectedBehavior: 'Should find Tuxedo ($1299/32GB) or HP EliteBook 840 G10 ($1399/32GB, over budget)',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      if (!product) return false;
      const ramGB = parseInt(product.specs.ram) || 0;
      // Must have 32GB and be at/under budget (small tolerance for edge case)
      return ramGB >= 32 && product.price <= 1350;
    },
    runs: 5,
    timeout: 120000,
  },
  {
    id: 'hard-gaming-cheap',
    name: 'Gaming Under $800 (Hard)',
    difficulty: 'hard',
    task: 'Need a laptop that can play modern games at decent settings. Budget is $800 max.',
    description: 'Very tight budget for gaming; Acer Nitro 5 is $749 but only has 8GB RAM',
    expectedBehavior: 'Should find Acer Nitro 5 ($749) with caveats, or explain limitations',
    successCriteria: (r) => {
      if (!r.success || !r.recommendation) return false;
      const product = getProduct(r.recommendation);
      if (!product) return false;
      const hasDedicatedGPU = product.specs.gpu.includes('RTX') ||
                              product.specs.gpu.includes('GTX');
      return hasDedicatedGPU && product.price <= 800;
    },
    runs: 5,
    timeout: 120000,
  },
  {
    id: 'hard-vague',
    name: 'Vague Request (Hard)',
    difficulty: 'hard',
    task: 'What laptop should I get?',
    description: 'Deliberately vague - tests how agent handles underspecified requests',
    expectedBehavior: 'Agent should either ask for clarification or make reasonable assumptions',
    successCriteria: (r) => {
      // Success if it completes with any recommendation and explains reasoning
      return r.success &&
             r.recommendation !== undefined &&
             r.reasoning !== undefined &&
             r.reasoning.length > 50;
    },
    runs: 5,
    timeout: 120000,
  },
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

/**
 * System prompt for the Purchase Advisor agent.
 *
 * This prompt is defined inline here for clarity. In production, you might:
 * - Load it from a file (e.g., ../prompts/purchase-advisor.txt)
 * - Store it in a database for A/B testing different versions
 * - Generate it dynamically based on user context
 *
 * The prompt configures:
 * - Agent persona (helpful shopping assistant)
 * - Available tools and when to use them
 * - Expected workflow (search → review → compare → recommend)
 * - Output format (recommendation, reasoning, confidence, alternatives)
 *
 * This same prompt is used in ../index.ts for the main example.
 */
const PURCHASE_ADVISOR_PROMPT = `You are a Smart Purchase Advisor helping users find the best laptop for their needs.

Your tools:
- search_products: Search the catalog by criteria (query, price, tags)
- get_reviews: Get detailed reviews for a specific product
- compare_specs: Compare specifications of multiple products
- done: Complete the task with your recommendation

Process:
1. Understand the user's requirements (budget, use case, preferences)
2. Search for matching products
3. Review top candidates (at least 2-3 products)
4. Compare if the choice isn't clear
5. Make a recommendation with detailed reasoning

IMPORTANT:
- Always verify products match the stated budget
- Consider trade-offs and explain them
- If requirements conflict or are hard to meet, acknowledge this
- Provide confidence based on how well the product matches requirements

Always use the done tool when finished, providing:
- recommendation: the product ID (e.g., "laptop-001")
- reasoning: detailed explanation of why (at least 2-3 sentences)
- confidence: 0-1 score based on match quality
- alternatives: other options to consider`;

// =============================================================================
// RUN FUNCTION
// =============================================================================

async function runPurchaseAdvisor(
  task: string,
  runId: string
): Promise<Omit<RunResult, 'id' | 'timedOut'>> {
  const eventStore = new EventStore();
  const startTime = Date.now();
  const llm = createClient();

  try {
    const result = await agent(task, allTools, llm, {
      systemPrompt: PURCHASE_ADVISOR_PROMPT,
      eventStore,
      maxIterations: 15,
      verbose: false,
    });

    const state = eventStore.getState();
    const recommendation = parseRecommendation(result);
    const product = recommendation ? getProduct(recommendation.recommendation) : undefined;

    return {
      success: state.status === 'completed' && recommendation !== null,
      error: state.status === 'failed' ? state.errors.join(', ') : undefined,
      durationMs: Date.now() - startTime,
      iterations: state.iterations,
      toolCalls: state.toolCalls.total,
      recommendation: recommendation?.recommendation,
      recommendedPrice: product?.price,
      confidence: recommendation?.confidence,
      reasoning: recommendation?.reasoning,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      durationMs: Date.now() - startTime,
      iterations: 0,
      toolCalls: 0,
    };
  }
}

// =============================================================================
// STATISTICAL HELPERS
// =============================================================================

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

function confidenceInterval95(
  successRate: number,
  sampleSize: number
): [number, number] {
  if (sampleSize === 0) return [0, 0];
  const z = 1.96;
  const n = sampleSize;
  const p = successRate;
  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const lower = Math.max(0, (center - margin) / denominator);
  const upper = Math.min(1, (center + margin) / denominator);
  return [lower, upper];
}

// =============================================================================
// EVALUATOR
// =============================================================================

class PurchaseAdvisorEvaluator {
  async evaluateScenario(scenario: EvalScenario): Promise<ScenarioResult> {
    const runs: RunResult[] = [];
    const startTime = Date.now();

    console.log(`\n  Running ${scenario.runs} evaluations...`);

    for (let i = 0; i < scenario.runs; i++) {
      const runId = `${scenario.id}-run-${i + 1}`;
      process.stdout.write(`    Run ${i + 1}/${scenario.runs}: `);

      try {
        const result = await Promise.race([
          runPurchaseAdvisor(scenario.task, runId),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), scenario.timeout)
          ),
        ]);

        const fullResult: RunResult = {
          id: runId,
          ...result,
          timedOut: false,
        };

        // Apply scenario-specific success criteria
        fullResult.success = scenario.successCriteria(fullResult);
        runs.push(fullResult);

        const status = fullResult.success ? '✓' : '✗';
        const rec = fullResult.recommendation || 'none';
        const price = fullResult.recommendedPrice ? `$${fullResult.recommendedPrice}` : '';
        console.log(`${status} → ${rec} ${price} (${fullResult.durationMs}ms)`);

      } catch (error) {
        const isTimeout = String(error).includes('Timeout');
        runs.push({
          id: runId,
          success: false,
          error: String(error),
          durationMs: scenario.timeout,
          iterations: 0,
          toolCalls: 0,
          timedOut: isTimeout,
        });
        console.log(`✗ ${isTimeout ? 'TIMEOUT' : 'ERROR'}`);
      }
    }

    const metrics = this.calculateMetrics(runs);

    return {
      scenario,
      runs,
      metrics,
      timestamp: Date.now(),
    };
  }

  private calculateMetrics(runs: RunResult[]): EvalMetrics {
    const total = runs.length;
    const successes = runs.filter(r => r.success);
    const failures = runs.filter(r => !r.success && !r.timedOut);
    const timeouts = runs.filter(r => r.timedOut);

    const successRate = total > 0 ? successes.length / total : 0;

    const durations = runs.filter(r => !r.timedOut).map(r => r.durationMs);
    const avgDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const p95DurationMs = percentile(durations, 95);

    const iterations = runs.map(r => r.iterations);
    const avgIterations = iterations.length > 0
      ? iterations.reduce((a, b) => a + b, 0) / iterations.length
      : 0;

    return {
      successRate,
      confidenceInterval: confidenceInterval95(successRate, total),
      avgDurationMs,
      p95DurationMs,
      avgIterations,
      timeoutRate: total > 0 ? timeouts.length / total : 0,
      errorRate: total > 0 ? failures.length / total : 0,
    };
  }
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

function printScenarioResult(result: ScenarioResult): void {
  const { scenario, metrics } = result;
  const [ciLow, ciHigh] = metrics.confidenceInterval;

  console.log(`\n  ┌─ Results ─────────────────────────────────────────`);
  console.log(`  │ Success Rate: ${(metrics.successRate * 100).toFixed(0)}% (${result.runs.filter(r => r.success).length}/${result.runs.length})`);
  console.log(`  │ 95% CI: [${(ciLow * 100).toFixed(0)}%, ${(ciHigh * 100).toFixed(0)}%]`);
  console.log(`  │ Avg Duration: ${(metrics.avgDurationMs / 1000).toFixed(1)}s`);
  console.log(`  │ Avg Iterations: ${metrics.avgIterations.toFixed(1)}`);
  if (metrics.timeoutRate > 0) {
    console.log(`  │ Timeouts: ${(metrics.timeoutRate * 100).toFixed(0)}%`);
  }
  console.log(`  └───────────────────────────────────────────────────`);

  // Show recommendation distribution
  const recs = result.runs
    .filter(r => r.recommendation)
    .map(r => r.recommendation!);
  if (recs.length > 0) {
    const counts = new Map<string, number>();
    for (const rec of recs) {
      counts.set(rec, (counts.get(rec) || 0) + 1);
    }
    console.log(`\n  Recommendations:`);
    for (const [rec, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const product = getProduct(rec);
      const name = product?.name || rec;
      const price = product ? `$${product.price}` : '';
      console.log(`    ${count}x ${name} ${price}`);
    }
  }
}

function printSummary(results: ScenarioResult[]): void {
  console.log('\n' + '═'.repeat(60));
  console.log('EVALUATION SUMMARY');
  console.log('═'.repeat(60));

  // Group by difficulty
  const byDifficulty = {
    easy: results.filter(r => r.scenario.difficulty === 'easy'),
    medium: results.filter(r => r.scenario.difficulty === 'medium'),
    hard: results.filter(r => r.scenario.difficulty === 'hard'),
  };

  console.log('\n┌────────────────────────────────────┬──────────┬─────────┐');
  console.log('│ Scenario                           │ Success  │ Avg Dur │');
  console.log('├────────────────────────────────────┼──────────┼─────────┤');

  for (const [difficulty, scenarioResults] of Object.entries(byDifficulty)) {
    if (scenarioResults.length === 0) continue;
    console.log(`│ ${difficulty.toUpperCase().padEnd(34)} │          │         │`);

    for (const result of scenarioResults) {
      const name = result.scenario.name.substring(0, 32).padEnd(34);
      const rate = `${(result.metrics.successRate * 100).toFixed(0)}%`.padStart(6);
      const dur = `${(result.metrics.avgDurationMs / 1000).toFixed(1)}s`.padStart(6);
      console.log(`│   ${name} │ ${rate}   │ ${dur}  │`);
    }
  }

  console.log('└────────────────────────────────────┴──────────┴─────────┘');

  // Overall stats
  const totalRuns = results.reduce((sum, r) => sum + r.runs.length, 0);
  const totalSuccesses = results.reduce(
    (sum, r) => sum + r.runs.filter(run => run.success).length, 0
  );
  const overallRate = totalRuns > 0 ? totalSuccesses / totalRuns : 0;

  console.log(`\nOverall: ${totalSuccesses}/${totalRuns} runs successful (${(overallRate * 100).toFixed(0)}%)`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('═'.repeat(60));
  console.log('PURCHASE ADVISOR EVALUATION');
  console.log('Pattern 8.1: Statistical Evaluation');
  console.log('═'.repeat(60));

  // Parse arguments
  const useMock = process.argv.includes('--mock');
  const runFull = process.argv.includes('--full');
  const scenarioArg = process.argv.find(a => a.startsWith('--scenario='));
  const specificScenario = scenarioArg ? parseInt(scenarioArg.split('=')[1]) : undefined;

  if (useMock) {
    process.env.USE_MOCK = 'true';
    console.log('\n⚠️  Running with MOCK LLM (deterministic, no variability)');
  } else {
    console.log('\n🔄 Using real LLM (OpenRouter)');
  }

  // Select scenarios
  let scenariosToRun: EvalScenario[];
  if (specificScenario !== undefined) {
    scenariosToRun = [SCENARIOS[specificScenario]].filter(Boolean);
  } else if (runFull) {
    scenariosToRun = SCENARIOS;
  } else {
    // Default: one of each difficulty
    scenariosToRun = [
      SCENARIOS[0],  // easy-programming
      SCENARIOS[2],  // medium-linux
      SCENARIOS[5],  // hard-32gb-budget
    ];
  }

  console.log(`\nScenarios: ${scenariosToRun.length}`);
  console.log(`Total runs: ${scenariosToRun.reduce((sum, s) => sum + s.runs, 0)}`);

  const evaluator = new PurchaseAdvisorEvaluator();
  const results: ScenarioResult[] = [];

  for (const scenario of scenariosToRun) {
    console.log('\n' + '─'.repeat(60));
    console.log(`[${scenario.difficulty.toUpperCase()}] ${scenario.name}`);
    console.log('─'.repeat(60));
    console.log(`Task: "${scenario.task}"`);
    console.log(`Expected: ${scenario.expectedBehavior}`);

    const result = await evaluator.evaluateScenario(scenario);
    results.push(result);
    printScenarioResult(result);
  }

  printSummary(results);
  console.log('\n' + '═'.repeat(60));
}

// Exports for testing
export {
  PurchaseAdvisorEvaluator,
  SCENARIOS,
  EvalScenario,
  RunResult,
  ScenarioResult,
};

main().catch(console.error);
