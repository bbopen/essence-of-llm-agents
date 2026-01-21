/**
 * Pattern 7.1: Single-Level Delegation
 *
 * Main agent spawns workers. Workers execute and return. Workers
 * CANNOT spawn sub-workers. One level only.
 *
 * Prevents: Cost explosion, unbounded nesting, debugging nightmares
 *
 * Derived from: Claude Code architecture, production cost analysis
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

interface Task {
  id: string;
  description: string;
  context?: Record<string, unknown>;
}

interface TaskResult {
  taskId: string;
  success: boolean;
  result?: string;
  error?: string;
}

interface Tool {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// Sub-agent: Has tools but NO delegation capability
class SubAgent {
  private tools: Tool[];
  private maxIterations: number;

  constructor(tools: Tool[], maxIterations: number = 20) {
    // CRITICAL: No 'delegate' tool in sub-agent's toolkit
    this.tools = tools.filter(t => t.name !== 'delegate');
    this.maxIterations = maxIterations;
  }

  async execute(task: Task): Promise<TaskResult> {
    try {
      // Sub-agent runs its loop with limited tools
      // It can use tools but CANNOT delegate to other agents
      const result = await this.runLoop(task);

      return {
        taskId: task.id,
        success: true,
        result
      };
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async runLoop(task: Task): Promise<string> {
    // Simplified loop - in reality would call LLM
    console.log(`SubAgent executing: ${task.description}`);
    return `Completed: ${task.description}`;
  }
}

// Main agent: Has delegation capability
class MainAgent {
  private tools: Tool[];
  private workerPool: SubAgent[];

  constructor(tools: Tool[]) {
    this.tools = tools;
    this.workerPool = [];
  }

  // Create a worker for a specific task
  private createWorker(taskTools: Tool[]): SubAgent {
    // Workers get subset of tools, never delegation
    return new SubAgent(taskTools);
  }

  // Delegate a task to a worker
  async delegate(task: Task, taskTools?: Tool[]): Promise<TaskResult> {
    const worker = this.createWorker(taskTools || this.tools);
    this.workerPool.push(worker);

    const result = await worker.execute(task);

    // Clean up worker reference
    this.workerPool = this.workerPool.filter(w => w !== worker);

    return result;
  }

  // Delegate multiple tasks in parallel
  async delegateParallel(tasks: Task[]): Promise<TaskResult[]> {
    const promises = tasks.map(task => this.delegate(task));
    return Promise.all(promises);
  }

  // Main agent's tools include delegation
  getTools(): Tool[] {
    return [
      ...this.tools,
      {
        name: 'delegate',
        execute: async (args) => {
          const task: Task = {
            id: String(args.id || Date.now()),
            description: String(args.description),
            context: args.context as Record<string, unknown>
          };
          const result = await this.delegate(task);
          return JSON.stringify(result);
        }
      }
    ];
  }
}

// Example: Code review with delegation
async function codeReviewWithDelegation(files: string[]): Promise<void> {
  const mainAgent = new MainAgent([
    { name: 'read_file', execute: async (args) => `Contents of ${args.path}` },
    { name: 'analyze', execute: async (args) => `Analysis of ${args.content}` }
  ]);

  // Main agent delegates file reviews to workers
  const tasks: Task[] = files.map((file, i) => ({
    id: `review-${i}`,
    description: `Review ${file} for code quality issues`,
    context: { file }
  }));

  console.log(`Main agent delegating ${tasks.length} reviews...`);

  const results = await mainAgent.delegateParallel(tasks);

  console.log('Results:');
  for (const result of results) {
    console.log(`  ${result.taskId}: ${result.success ? 'OK' : 'FAILED'}`);
  }
}

export {
  MainAgent,
  SubAgent,
  codeReviewWithDelegation,
  Task,
  TaskResult,
  Tool
};
