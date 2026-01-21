/**
 * Coordinator Pattern for Purchase Advisor
 *
 * Implements Pattern 7.2 (Coordinator) from the guide.
 * One coordinator analyzes tasks → delegates to workers → aggregates results.
 *
 * This demonstrates multi-agent orchestration where:
 * - Coordinator is the "brain" that plans and synthesizes
 * - Workers are specialists that execute specific subtasks
 * - Single-level delegation prevents unbounded spawning (Pattern 7.1)
 *
 * @see patterns/14-coordinator.ts
 * @see patterns/13-single-level-delegation.ts
 */

import type { Tool, LLMClient } from '../../patterns/types.js';
import { EventStore } from '../state/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface Task {
  id: string;
  description: string;
  context?: Record<string, unknown>;
}

export interface Subtask extends Task {
  parentId: string;
  type: 'search' | 'review' | 'compare';
  parameters: Record<string, unknown>;
}

export interface WorkerResult {
  subtaskId: string;
  success: boolean;
  output: string;
  data?: unknown;
  durationMs: number;
}

/**
 * Final result from coordination.
 * Mirrors scaffolding's CoordinatorResult + domain-specific fields.
 */
export interface CoordinatorResult {
  taskId: string;
  success: boolean;
  summary: string;  // From scaffolding - overall coordination outcome
  subtaskResults: WorkerResult[];
  totalDurationMs: number;
  // Domain-specific extensions for Purchase Advisor:
  recommendation: string;
  reasoning: string;
  confidence: number;
  alternatives: Array<{ id: string; reason: string }>;
}

// =============================================================================
// WORKER - Executes single subtasks (no delegation capability)
// =============================================================================

/**
 * Worker agent that executes a single subtask.
 *
 * KEY PRINCIPLE (Pattern 7.1): Workers CANNOT spawn sub-workers.
 * This prevents unbounded cost and complexity explosion.
 */
export class Worker {
  private tool: Tool;
  private eventStore?: EventStore;

  constructor(tool: Tool, eventStore?: EventStore) {
    this.tool = tool;
    this.eventStore = eventStore;
  }

  async execute(subtask: Subtask): Promise<WorkerResult> {
    const startTime = Date.now();

    // Record worker start
    if (this.eventStore) {
      await this.eventStore.append({
        type: 'tool_called',
        toolCallId: subtask.id,
        tool: this.tool.name,
        arguments: subtask.parameters,
      });
    }

    try {
      // Execute the tool directly - workers don't have LLM access
      // They are deterministic executors
      const result = await this.tool.execute(subtask.parameters);
      const durationMs = Date.now() - startTime;

      // Record success
      if (this.eventStore) {
        await this.eventStore.append({
          type: 'tool_result',
          toolCallId: subtask.id,
          tool: this.tool.name,
          result: result.substring(0, 500),
          success: true,
          durationMs,
        });
      }

      return {
        subtaskId: subtask.id,
        success: true,
        output: result,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Record failure
      if (this.eventStore) {
        await this.eventStore.append({
          type: 'tool_result',
          toolCallId: subtask.id,
          tool: this.tool.name,
          result: (error as Error).message,
          success: false,
          durationMs,
        });
      }

      return {
        subtaskId: subtask.id,
        success: false,
        output: (error as Error).message,
        durationMs,
      };
    }
  }
}

// =============================================================================
// COORDINATOR - Analyzes, Delegates, Aggregates
// =============================================================================

/**
 * Coordinator agent that orchestrates the purchase advisor workflow.
 *
 * The coordinator follows a MapReduce-like pattern:
 * 1. ANALYZE - Parse user request, determine what subtasks are needed
 * 2. DELEGATE - Spawn workers to execute subtasks (possibly in parallel)
 * 3. AGGREGATE - Combine worker results into final recommendation
 *
 * Unlike simple agents, the coordinator uses an LLM for analysis and
 * aggregation, but delegates tool execution to workers.
 */
export class Coordinator {
  private workers: Map<string, Worker> = new Map();
  private llm: LLMClient;
  private eventStore?: EventStore;

  constructor(
    tools: Tool[],
    llm: LLMClient,
    eventStore?: EventStore
  ) {
    this.llm = llm;
    this.eventStore = eventStore;

    // Create workers for each tool (except 'done')
    for (const tool of tools) {
      if (tool.name !== 'done') {
        this.workers.set(tool.name, new Worker(tool, eventStore));
      }
    }
  }

  /**
   * Phase 1: Analyze the task and determine subtasks.
   *
   * Uses LLM to understand user requirements and plan the workflow.
   */
  async analyze(task: Task): Promise<Subtask[]> {
    // For simplicity, we use a deterministic analysis here.
    // In a full implementation, you'd use the LLM to dynamically
    // determine what subtasks are needed based on the task.

    const subtasks: Subtask[] = [];

    // Always start with a search
    subtasks.push({
      id: `${task.id}-search`,
      parentId: task.id,
      description: 'Search for matching products',
      type: 'search',
      parameters: this.extractSearchParams(task.description),
    });

    // Plan for reviews and comparison (will be refined after search)
    return subtasks;
  }

  /**
   * Extract search parameters from natural language description.
   */
  private extractSearchParams(description: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Extract price constraint
    const priceMatch = description.match(/under\s*\$?(\d+)/i);
    if (priceMatch) {
      params.maxPrice = parseInt(priceMatch[1], 10);
    }

    // Extract use case as query
    const useCases = ['programming', 'gaming', 'video editing', 'business', 'student'];
    for (const useCase of useCases) {
      if (description.toLowerCase().includes(useCase)) {
        params.query = useCase;
        break;
      }
    }

    return params;
  }

  /**
   * Phase 2: Delegate subtasks to workers.
   *
   * Workers execute independently. Similar subtasks can run in parallel.
   */
  async delegate(subtasks: Subtask[]): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];

    for (const subtask of subtasks) {
      const worker = this.workers.get(this.getWorkerForSubtask(subtask));

      if (!worker) {
        results.push({
          subtaskId: subtask.id,
          success: false,
          output: `No worker available for subtask type: ${subtask.type}`,
          durationMs: 0,
        });
        continue;
      }

      const result = await worker.execute(subtask);
      results.push(result);

      // After search, add review subtasks for top products
      if (subtask.type === 'search' && result.success) {
        const productIds = this.extractProductIds(result.output);
        const reviewSubtasks = productIds.slice(0, 3).map((id, i) => ({
          id: `${subtask.parentId}-review-${i}`,
          parentId: subtask.parentId,
          description: `Get reviews for ${id}`,
          type: 'review' as const,
          parameters: { productId: id },
        }));

        // Execute review subtasks in parallel
        const reviewResults = await Promise.all(
          reviewSubtasks.map(async (rs) => {
            const reviewWorker = this.workers.get('get_reviews');
            if (reviewWorker) {
              return reviewWorker.execute(rs);
            }
            return {
              subtaskId: rs.id,
              success: false,
              output: 'No review worker available',
              durationMs: 0,
            };
          })
        );

        results.push(...reviewResults);

        // Add comparison if we have multiple products
        if (productIds.length >= 2) {
          const compareSubtask: Subtask = {
            id: `${subtask.parentId}-compare`,
            parentId: subtask.parentId,
            description: 'Compare top products',
            type: 'compare',
            parameters: { productIds: productIds.slice(0, 4) },
          };

          const compareWorker = this.workers.get('compare_specs');
          if (compareWorker) {
            const compareResult = await compareWorker.execute(compareSubtask);
            results.push(compareResult);
          }
        }
      }
    }

    return results;
  }

  /**
   * Map subtask type to worker/tool name.
   */
  private getWorkerForSubtask(subtask: Subtask): string {
    const mapping: Record<string, string> = {
      search: 'search_products',
      review: 'get_reviews',
      compare: 'compare_specs',
    };
    return mapping[subtask.type] || subtask.type;
  }

  /**
   * Extract product IDs from search results.
   */
  private extractProductIds(searchOutput: string): string[] {
    const ids: string[] = [];
    const regex = /laptop-\d{3}/g;
    let match;
    while ((match = regex.exec(searchOutput)) !== null) {
      if (!ids.includes(match[0])) {
        ids.push(match[0]);
      }
    }
    return ids;
  }

  /**
   * Phase 3: Aggregate results into final recommendation.
   *
   * Synthesizes worker outputs into a coherent response.
   */
  async aggregate(
    task: Task,
    results: WorkerResult[]
  ): Promise<CoordinatorResult> {
    const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    // Extract product information from results
    const searchResult = results.find((r) => r.subtaskId.includes('search'));
    const reviewResults = results.filter((r) => r.subtaskId.includes('review'));
    const compareResult = results.find((r) => r.subtaskId.includes('compare'));

    // Simple heuristic: recommend the first product with good reviews
    let recommendedProduct = 'laptop-001';
    let confidence = 0.7;
    const alternatives: Array<{ id: string; reason: string }> = [];

    // Parse search results to find candidates
    if (searchResult?.success) {
      const productIds = this.extractProductIds(searchResult.output);
      if (productIds.length > 0) {
        recommendedProduct = productIds[0];

        // Check reviews for sentiment
        for (const review of reviewResults) {
          if (review.success && review.output.includes('5/5')) {
            confidence = Math.min(confidence + 0.1, 0.95);
          }
        }

        // Add alternatives
        for (let i = 1; i < Math.min(productIds.length, 3); i++) {
          alternatives.push({
            id: productIds[i],
            reason: 'Also matches your criteria',
          });
        }
      }
    }

    // Build reasoning from worker results
    let reasoning = 'Based on ';
    if (searchResult?.success) {
      reasoning += 'search results, ';
    }
    if (reviewResults.some((r) => r.success)) {
      reasoning += 'user reviews, ';
    }
    if (compareResult?.success) {
      reasoning += 'spec comparison, ';
    }
    reasoning += `this product best matches your requirements. `;
    reasoning += `(${successful.length}/${results.length} subtasks completed successfully)`;

    // Generate summary (from scaffolding pattern)
    const summary = failed.length === 0
      ? `Successfully completed ${successful.length} subtasks`
      : `Completed ${successful.length}/${results.length} subtasks. ` +
        `Failures: ${failed.map(f => f.subtaskId).join(', ')}`;

    return {
      taskId: task.id,
      success: failed.length === 0,
      summary,  // From scaffolding
      subtaskResults: results,
      totalDurationMs,
      // Domain-specific:
      recommendation: recommendedProduct,
      reasoning,
      confidence,
      alternatives,
    };
  }

  /**
   * Full coordination flow: Analyze → Delegate → Aggregate
   */
  async coordinate(task: Task): Promise<CoordinatorResult> {
    const startTime = Date.now();

    // Record coordination start
    if (this.eventStore) {
      await this.eventStore.append({
        type: 'agent_started',
        task: task.description,
        tools: Array.from(this.workers.keys()),
      });
    }

    // Phase 1: Analyze
    const subtasks = await this.analyze(task);

    // Phase 2: Delegate
    const results = await this.delegate(subtasks);

    // Phase 3: Aggregate
    const coordinatorResult = await this.aggregate(task, results);
    coordinatorResult.totalDurationMs = Date.now() - startTime;

    // Record coordination complete
    if (this.eventStore) {
      await this.eventStore.append({
        type: 'agent_completed',
        result: JSON.stringify({
          recommendation: coordinatorResult.recommendation,
          confidence: coordinatorResult.confidence,
        }),
        success: coordinatorResult.success,
        totalIterations: results.length,
        totalDurationMs: coordinatorResult.totalDurationMs,
      });
    }

    return coordinatorResult;
  }
}
