/**
 * Coordinator Mode - Entry Point
 *
 * Demonstrates Pattern 7.2 (Coordinator) from the guide.
 * This shows multi-agent orchestration where:
 * - Coordinator analyzes tasks and plans subtasks
 * - Workers execute subtasks independently
 * - Coordinator aggregates results into final recommendation
 *
 * Usage:
 *   npm run example:coordinator         # Run coordinator mode
 *   npm run example:coordinator:mock    # Run with mock LLM
 *
 * @see example/orchestration/coordinator.ts
 * @see patterns/14-coordinator.ts
 */

import 'dotenv/config';
import { config } from 'dotenv';

// Load .env.local if it exists
config({ path: '.env.local' });

import { createClient } from './llm/index.js';
import { allTools, getProduct } from './tools/index.js';
import { EventStore } from './state/index.js';
import { Coordinator, type Task } from './orchestration/index.js';

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // Get task from command line or use default
  const taskDescription =
    process.argv[2] ||
    'Find me a laptop under $1500 for programming. I need a good keyboard and at least 16GB RAM.';

  // Create event store for audit trail (Pattern 4.2)
  const eventStore = new EventStore();

  // Create LLM client (mock or real based on environment)
  const llm = createClient();

  // Create coordinator with tools and LLM
  const coordinator = new Coordinator(allTools, llm, eventStore);

  // Create the task
  const task: Task = {
    id: `task-${Date.now()}`,
    description: taskDescription,
  };

  console.log('\n' + '='.repeat(60));
  console.log('COORDINATOR MODE - MULTI-AGENT ORCHESTRATION');
  console.log('='.repeat(60));
  console.log(`Task: ${taskDescription}\n`);
  console.log('Pattern 7.2: Coordinator (Analyze → Delegate → Aggregate)');
  console.log('Pattern 7.1: Single-Level Delegation (Workers cannot spawn sub-workers)');
  console.log('='.repeat(60) + '\n');

  try {
    // Run the coordinator
    const result = await coordinator.coordinate(task);

    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('COORDINATOR RESULT');
    console.log('='.repeat(60));

    const product = getProduct(result.recommendation);
    console.log(`\nRecommended: ${product?.name ?? result.recommendation}`);
    if (product) {
      console.log(`Price: $${product.price.toFixed(2)}`);
      console.log(`Rating: ${product.rating}/5`);
    }

    console.log(`\nReasoning: ${result.reasoning}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`Success: ${result.success}`);
    console.log(`Total Duration: ${result.totalDurationMs}ms`);

    if (result.alternatives.length > 0) {
      console.log('\nAlternatives:');
      for (const alt of result.alternatives) {
        const altProduct = getProduct(alt.id);
        console.log(`  - ${altProduct?.name ?? alt.id}: ${alt.reason}`);
      }
    }

    // Subtask breakdown
    console.log('\n' + '-'.repeat(40));
    console.log('SUBTASK RESULTS');
    console.log('-'.repeat(40));
    for (const subtask of result.subtaskResults) {
      const status = subtask.success ? '✓' : '✗';
      console.log(`  ${status} ${subtask.subtaskId}: ${subtask.durationMs}ms`);
      if (!subtask.success) {
        console.log(`    Error: ${subtask.output}`);
      }
    }

    // Display event sourcing summary (Pattern 4.2)
    console.log('\n' + '='.repeat(60));
    console.log('EVENT LOG SUMMARY');
    console.log('='.repeat(60));
    console.log(eventStore.getSummary());

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    // Record error event
    await eventStore.append({
      type: 'error_occurred',
      error: (error as Error).message,
      recoverable: false,
    });

    console.error('Error:', error);
    console.log('\nEvent Log:');
    console.log(eventStore.getSummary());
    process.exit(1);
  }
}

main();
