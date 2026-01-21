/**
 * Pattern 7.2: Coordinator Pattern
 *
 * One coordinator analyzes tasks, delegates to workers, aggregates
 * results. MapReduce for agents.
 *
 * The coordinator has three phases:
 * 1. ANALYZE - Break task into subtasks
 * 2. DELEGATE - Assign subtasks to workers
 * 3. AGGREGATE - Combine results into final output
 *
 * Derived from: Simon's hierarchical systems, MapReduce
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// =============================================================================
// TYPES - Extend these for your domain
// =============================================================================

/**
 * A task to be coordinated.
 * Extend with domain-specific fields (e.g., context, priority).
 */
interface Task {
  id: string;
  description: string;
  context?: Record<string, unknown>;
}

/**
 * A subtask delegated to a worker.
 * The `type` field determines which worker handles it.
 * Extend with domain-specific types and parameters.
 */
interface Subtask extends Task {
  parentId: string;
  type: string;  // e.g., 'analysis' | 'search' | 'review'
  parameters?: Record<string, unknown>;
}

/**
 * Result from a worker executing a subtask.
 */
interface WorkerResult {
  subtaskId: string;
  success: boolean;
  output: string;
  durationMs: number;
  data?: unknown;  // Domain-specific data
}

/**
 * Final result from coordination.
 * Extend with domain-specific fields (e.g., recommendation, confidence).
 */
interface CoordinatorResult {
  taskId: string;
  success: boolean;
  summary: string;
  subtaskResults: WorkerResult[];
  totalDurationMs: number;
}

// =============================================================================
// COORDINATOR - Analyzes, Delegates, Aggregates
// =============================================================================

/**
 * Coordinator: Analyze → Delegate → Aggregate
 *
 * This is a simplified example. In production, you would:
 * - Use LLM for dynamic task analysis
 * - Add event sourcing for audit trail
 * - Handle failures with retry/fallback logic
 *
 * See example/orchestration/coordinator.ts for a full implementation.
 */
class Coordinator {
  private workers: Map<string, Worker> = new Map();

  // Phase 1: Analyze task and break into subtasks
  async analyze(task: Task): Promise<Subtask[]> {
    console.log(`Analyzing task: ${task.description}`);

    // In production, use LLM to dynamically decompose task.
    // Here's a simplified deterministic example.
    const subtasks: Subtask[] = [
      {
        id: `${task.id}-analysis`,
        parentId: task.id,
        description: `Analyze requirements for: ${task.description}`,
        type: 'analysis',
        parameters: { depth: 'full' }
      },
      {
        id: `${task.id}-impl`,
        parentId: task.id,
        description: `Implement: ${task.description}`,
        type: 'implementation',
        parameters: {}
      },
      {
        id: `${task.id}-review`,
        parentId: task.id,
        description: `Review implementation of: ${task.description}`,
        type: 'review',
        parameters: { checkSecurity: true }
      }
    ];

    return subtasks;
  }

  // Phase 2: Delegate subtasks to workers
  async delegate(subtasks: Subtask[]): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];

    // Group by dependency - analysis before impl, impl before review
    const phases = this.groupByPhase(subtasks);

    for (const phase of phases) {
      // Execute phase subtasks in parallel
      const phaseResults = await Promise.all(
        phase.map(subtask => this.executeSubtask(subtask))
      );
      results.push(...phaseResults);

      // Check for failures before continuing
      const failures = phaseResults.filter(r => !r.success);
      if (failures.length > 0) {
        console.warn(`Phase had ${failures.length} failures`);
      }
    }

    return results;
  }

  private groupByPhase(subtasks: Subtask[]): Subtask[][] {
    const phases: Map<number, Subtask[]> = new Map();
    // Define phase order for known types; unknown types default to phase 1
    const order: Record<string, number> = {
      analysis: 0,
      implementation: 1,
      review: 2,
      test: 3
    };

    for (const subtask of subtasks) {
      const phase = order[subtask.type] ?? 1;
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      phases.get(phase)!.push(subtask);
    }

    return Array.from(phases.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, tasks]) => tasks);
  }

  private async executeSubtask(subtask: Subtask): Promise<WorkerResult> {
    const startTime = Date.now();

    try {
      // Get or create worker for this subtask type
      let worker = this.workers.get(subtask.type);
      if (!worker) {
        worker = new Worker(subtask.type);
        this.workers.set(subtask.type, worker);
      }

      const output = await worker.execute(subtask);

      return {
        subtaskId: subtask.id,
        success: true,
        output,
        durationMs: Date.now() - startTime
      };
    } catch (error) {
      return {
        subtaskId: subtask.id,
        success: false,
        output: (error as Error).message,
        durationMs: Date.now() - startTime
      };
    }
  }

  // Phase 3: Aggregate results
  async aggregate(
    task: Task,
    results: WorkerResult[]
  ): Promise<CoordinatorResult> {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    const totalDuration = results.reduce(
      (sum, r) => sum + r.durationMs,
      0
    );

    // Generate summary (extend with domain-specific aggregation)
    const summary = failed.length === 0
      ? `Successfully completed ${successful.length} subtasks`
      : `Completed ${successful.length}/${results.length} subtasks. ` +
        `Failures: ${failed.map(f => f.subtaskId).join(', ')}`;

    return {
      taskId: task.id,
      success: failed.length === 0,
      summary,
      subtaskResults: results,
      totalDurationMs: totalDuration
    };
  }

  // Full coordination flow
  async coordinate(task: Task): Promise<CoordinatorResult> {
    const subtasks = await this.analyze(task);
    const results = await this.delegate(subtasks);
    return this.aggregate(task, results);
  }
}

// =============================================================================
// WORKER - Executes single subtasks (no delegation capability)
// =============================================================================

/**
 * Worker: Executes a single subtask.
 *
 * KEY PRINCIPLE (Pattern 7.1): Workers CANNOT spawn sub-workers.
 * This prevents unbounded cost and complexity explosion.
 *
 * In production, workers typically wrap tools or external services.
 * See example/orchestration/coordinator.ts for a Tool-wrapping Worker.
 */
class Worker {
  private type: string;

  constructor(type: string) {
    this.type = type;
  }

  async execute(subtask: Subtask): Promise<string> {
    console.log(`Worker [${this.type}] executing: ${subtask.description}`);

    // In production, this would execute actual work:
    // - Call an API
    // - Execute a Tool
    // - Run a subprocess
    // Here we simulate work with a delay.
    await new Promise(resolve => setTimeout(resolve, 100));

    return `${this.type} completed for ${subtask.id}`;
  }
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/**
 * Example: Running a coordinated task.
 *
 * This demonstrates the basic coordination flow.
 * See example/orchestration/coordinator.ts for a full implementation
 * with Tool integration, event sourcing, and domain-specific logic.
 */
async function runCoordinatedTask(): Promise<void> {
  const coordinator = new Coordinator();

  const task: Task = {
    id: 'feature-123',
    description: 'Add user authentication to the API',
    context: { priority: 'high', deadline: '2024-01-15' }
  };

  const result = await coordinator.coordinate(task);

  console.log('\n=== Coordination Result ===');
  console.log(`Task: ${result.taskId}`);
  console.log(`Success: ${result.success}`);
  console.log(`Summary: ${result.summary}`);
  console.log(`Duration: ${result.totalDurationMs}ms`);
  console.log(`Subtasks: ${result.subtaskResults.length}`);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Coordinator,
  Worker,
  runCoordinatedTask,
  // Types - extend these for your domain
  Task,
  Subtask,
  WorkerResult,
  CoordinatorResult
};
