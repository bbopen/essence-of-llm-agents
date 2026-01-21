/**
 * Pattern 8.1: Statistical Evaluation
 *
 * For stochastic systems, test distributions not single runs.
 * A single pass/fail tells you nothing about reliability.
 *
 * The key insight: LLMs are ~60-70% reliable per step. Single tests
 * prove nothing. You need statistical sampling to measure true reliability.
 *
 * Derived from: Statistical testing theory, MLOps practices
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// =============================================================================
// TYPES - Extend these for your domain
// =============================================================================

/**
 * Configuration for an evaluation run.
 */
interface EvalConfig {
  task: string;
  runs: number;           // Number of times to run (20-100 typical)
  timeout: number;        // Per-run timeout in ms
  concurrency?: number;   // Parallel runs (default: 1)
  tags?: string[];        // For filtering/grouping results
}

/**
 * Result from a single run.
 * Extend with domain-specific fields.
 */
interface RunResult {
  id: string;
  success: boolean;
  error?: string;
  durationMs: number;
  tokensUsed: number;
  iterations: number;
  toolCalls: number;
  timedOut: boolean;
}

/**
 * Aggregated metrics from all runs.
 */
interface EvalMetrics {
  successRate: number;
  confidenceInterval: [number, number];  // 95% CI
  avgDurationMs: number;
  p95DurationMs: number;
  avgTokens: number;
  avgIterations: number;
  timeoutRate: number;
  errorRate: number;
}

/**
 * Complete evaluation result.
 */
interface EvalResult {
  id: string;
  config: EvalConfig;
  runs: RunResult[];
  metrics: EvalMetrics;
  timestamp: number;
  totalDurationMs: number;
}

// =============================================================================
// STATISTICAL HELPERS
// =============================================================================

/**
 * Calculate standard deviation.
 */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Calculate percentile.
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

/**
 * Calculate 95% confidence interval using Wilson score.
 * More accurate than normal approximation for edge cases.
 */
function confidenceInterval95(
  successRate: number,
  sampleSize: number
): [number, number] {
  if (sampleSize === 0) return [0, 0];

  const z = 1.96;  // 95% confidence
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
// EVALUATOR - Runs statistical evaluation
// =============================================================================

/**
 * Run function type that the evaluator calls.
 * Implement this for your specific agent.
 */
type RunFn = (
  task: string,
  runId: string
) => Promise<Omit<RunResult, 'id' | 'timedOut'>>;

/**
 * Statistical Evaluator for agent systems.
 *
 * Usage:
 *   const evaluator = new Evaluator(myAgentRunFn);
 *   const result = await evaluator.evaluate({
 *     task: 'Find a laptop under $1000',
 *     runs: 20,
 *     timeout: 30000,
 *   });
 *   console.log(generateReport(result));
 */
class Evaluator {
  private runFn: RunFn;

  constructor(runFn: RunFn) {
    this.runFn = runFn;
  }

  /**
   * Run a complete evaluation.
   */
  async evaluate(config: EvalConfig): Promise<EvalResult> {
    const startTime = Date.now();
    const runs: RunResult[] = [];
    const concurrency = config.concurrency || 1;

    // Generate run IDs
    const runIds = Array.from(
      { length: config.runs },
      (_, i) => `run-${i + 1}`
    );

    // Execute runs with concurrency control
    const semaphore = new Semaphore(concurrency);

    const runPromises = runIds.map(runId =>
      semaphore.acquire().then(async release => {
        try {
          const result = await this.executeRun(config, runId);
          runs.push(result);
          return result;
        } finally {
          release();
        }
      })
    );

    await Promise.all(runPromises);

    // Calculate metrics
    const metrics = this.calculateMetrics(runs);

    return {
      id: `eval-${Date.now()}`,
      config,
      runs,
      metrics,
      timestamp: Date.now(),
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a single run with timeout handling.
   */
  private async executeRun(
    config: EvalConfig,
    runId: string
  ): Promise<RunResult> {
    const startTime = Date.now();

    try {
      // Race between run and timeout
      const result = await Promise.race([
        this.runFn(config.task, runId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), config.timeout)
        ),
      ]);

      return {
        id: runId,
        ...result,
        timedOut: false,
      };
    } catch (error) {
      const isTimeout = String(error).includes('Timeout');

      return {
        id: runId,
        success: false,
        error: String(error),
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
        iterations: 0,
        toolCalls: 0,
        timedOut: isTimeout,
      };
    }
  }

  /**
   * Calculate aggregated metrics from runs.
   */
  private calculateMetrics(runs: RunResult[]): EvalMetrics {
    const total = runs.length;
    const successes = runs.filter(r => r.success);
    const failures = runs.filter(r => !r.success && !r.timedOut);
    const timeouts = runs.filter(r => r.timedOut);

    const successRate = total > 0 ? successes.length / total : 0;

    // Duration metrics (successful runs only)
    const durations = successes.map(r => r.durationMs);
    const avgDurationMs = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
    const p95DurationMs = percentile(durations, 95);

    // Token metrics
    const tokens = runs.map(r => r.tokensUsed);
    const avgTokens = tokens.length > 0
      ? tokens.reduce((a, b) => a + b, 0) / tokens.length
      : 0;

    // Iteration metrics
    const iterations = runs.map(r => r.iterations);
    const avgIterations = iterations.length > 0
      ? iterations.reduce((a, b) => a + b, 0) / iterations.length
      : 0;

    return {
      successRate,
      confidenceInterval: confidenceInterval95(successRate, total),
      avgDurationMs,
      p95DurationMs,
      avgTokens,
      avgIterations,
      timeoutRate: total > 0 ? timeouts.length / total : 0,
      errorRate: total > 0 ? failures.length / total : 0,
    };
  }
}

// =============================================================================
// SEMAPHORE - Concurrency control
// =============================================================================

/**
 * Simple semaphore for limiting concurrent operations.
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return () => this.release();
    }

    return new Promise(resolve => {
      this.waiting.push(() => {
        this.permits--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.permits++;
    const next = this.waiting.shift();
    if (next) next();
  }
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Generate a human-readable evaluation report.
 */
function generateReport(result: EvalResult): string {
  const m = result.metrics;
  const [ciLow, ciHigh] = m.confidenceInterval;

  const lines = [
    `# Evaluation Report`,
    ``,
    `**Task**: ${result.config.task}`,
    `**Runs**: ${result.runs.length}`,
    `**Date**: ${new Date(result.timestamp).toISOString()}`,
    ``,
    `## Metrics`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Success Rate | ${(m.successRate * 100).toFixed(1)}% |`,
    `| 95% CI | [${(ciLow * 100).toFixed(1)}%, ${(ciHigh * 100).toFixed(1)}%] |`,
    `| Avg Duration | ${m.avgDurationMs.toFixed(0)}ms |`,
    `| P95 Duration | ${m.p95DurationMs.toFixed(0)}ms |`,
    `| Avg Tokens | ${m.avgTokens.toFixed(0)} |`,
    `| Avg Iterations | ${m.avgIterations.toFixed(1)} |`,
    `| Timeout Rate | ${(m.timeoutRate * 100).toFixed(1)}% |`,
    `| Error Rate | ${(m.errorRate * 100).toFixed(1)}% |`,
    ``,
    `## Distribution`,
    ``,
    `- Successes: ${result.runs.filter(r => r.success).length}`,
    `- Failures: ${result.runs.filter(r => !r.success && !r.timedOut).length}`,
    `- Timeouts: ${result.runs.filter(r => r.timedOut).length}`,
    ``,
  ];

  // Add failure details
  const failures = result.runs.filter(r => !r.success);
  if (failures.length > 0) {
    lines.push(`## Failures`, ``);
    for (const failure of failures.slice(0, 5)) {
      lines.push(`- **${failure.id}**: ${failure.error || 'Unknown'}`);
    }
    if (failures.length > 5) {
      lines.push(`- ... and ${failures.length - 5} more`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// COMPARISON
// =============================================================================

/**
 * Comparison result between two evaluations.
 */
interface CompareResult {
  improved: boolean;
  regressions: string[];
  improvements: string[];
  summary: string;
}

/**
 * Compare two evaluation results.
 * Use this to check for regressions after changes.
 */
function compareEvaluations(
  baseline: EvalResult,
  current: EvalResult
): CompareResult {
  const regressions: string[] = [];
  const improvements: string[] = [];

  const bm = baseline.metrics;
  const cm = current.metrics;

  // Success rate comparison (5% threshold)
  const successDiff = cm.successRate - bm.successRate;
  if (successDiff < -0.05) {
    regressions.push(
      `Success rate: ${(bm.successRate * 100).toFixed(1)}% → ${(cm.successRate * 100).toFixed(1)}%`
    );
  } else if (successDiff > 0.05) {
    improvements.push(
      `Success rate: ${(bm.successRate * 100).toFixed(1)}% → ${(cm.successRate * 100).toFixed(1)}%`
    );
  }

  // Duration comparison (20% threshold)
  if (cm.avgDurationMs > bm.avgDurationMs * 1.2) {
    regressions.push(
      `Avg duration: ${bm.avgDurationMs.toFixed(0)}ms → ${cm.avgDurationMs.toFixed(0)}ms`
    );
  } else if (cm.avgDurationMs < bm.avgDurationMs * 0.8) {
    improvements.push(
      `Avg duration: ${bm.avgDurationMs.toFixed(0)}ms → ${cm.avgDurationMs.toFixed(0)}ms`
    );
  }

  // Token efficiency (20% threshold)
  if (cm.avgTokens > bm.avgTokens * 1.2) {
    regressions.push(
      `Avg tokens: ${bm.avgTokens.toFixed(0)} → ${cm.avgTokens.toFixed(0)}`
    );
  } else if (cm.avgTokens < bm.avgTokens * 0.8) {
    improvements.push(
      `Avg tokens: ${bm.avgTokens.toFixed(0)} → ${cm.avgTokens.toFixed(0)}`
    );
  }

  const improved = improvements.length > regressions.length;
  const summary = [
    `Success: ${(cm.successRate * 100).toFixed(1)}% (${successDiff >= 0 ? '+' : ''}${(successDiff * 100).toFixed(1)}%)`,
    `Duration: ${cm.avgDurationMs.toFixed(0)}ms`,
    `Tokens: ${cm.avgTokens.toFixed(0)}`,
    regressions.length > 0 ? `Regressions: ${regressions.length}` : null,
    improvements.length > 0 ? `Improvements: ${improvements.length}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return { improved, regressions, improvements, summary };
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/**
 * Example: Running an evaluation.
 *
 * This demonstrates how to evaluate an agent statistically.
 * See example/evaluation/runner.ts for a full implementation.
 */
async function runEvaluation(): Promise<void> {
  // Mock run function for demonstration
  const mockRunFn: RunFn = async (task, runId) => {
    // Simulate varying success rates
    const success = Math.random() > 0.3;  // ~70% success rate

    return {
      success,
      error: success ? undefined : 'Simulated failure',
      durationMs: 100 + Math.random() * 200,
      tokensUsed: 500 + Math.random() * 500,
      iterations: 2 + Math.floor(Math.random() * 3),
      toolCalls: 1 + Math.floor(Math.random() * 4),
    };
  };

  const evaluator = new Evaluator(mockRunFn);

  const result = await evaluator.evaluate({
    task: 'Find a laptop under $1500 for programming',
    runs: 20,
    timeout: 30000,
    concurrency: 5,
  });

  console.log(generateReport(result));
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Evaluator,
  Semaphore,
  generateReport,
  compareEvaluations,
  runEvaluation,
  // Statistical helpers
  stdDev,
  percentile,
  confidenceInterval95,
  // Types
  EvalConfig,
  EvalMetrics,
  EvalResult,
  RunResult,
  RunFn,
  CompareResult,
};
