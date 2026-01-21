/**
 * Smart Purchase Advisor - Entry Point
 *
 * An educational example demonstrating LLM agent patterns.
 * This file mirrors patterns/01-the-loop.ts with Purchase Advisor specifics.
 *
 * Patterns demonstrated:
 * - Pattern 1.1: The Loop (observe → act → adjust → repeat)
 * - Pattern 3.2: Explicit Termination (done tool)
 * - Pattern 4.2: Event-Sourced State (audit trail)
 *
 * Usage:
 *   npm run example              # Run with OpenRouter (requires API key)
 *   npm run example:mock         # Run with mock LLM (deterministic)
 *
 * @see patterns/01-the-loop.ts - The scaffolding this example is based on
 * @see patterns/08-event-sourced-state.ts - Event sourcing pattern
 */

import 'dotenv/config';
import { config } from 'dotenv';

// Load .env.local if it exists
config({ path: '.env.local' });

import type { Message, Tool, LLMClient } from '../patterns/types.js';
import { TaskComplete } from '../patterns/index.js';
import { createClient } from './llm/index.js';
import { allTools, parseRecommendation, getProduct } from './tools/index.js';
import { EventStore } from './state/index.js';

// =============================================================================
// AGENT OPTIONS
// =============================================================================

/**
 * Configuration options for the agent loop.
 *
 * This mirrors AgentOptions from patterns/01-the-loop.ts, with the addition
 * of eventStore for audit trail (Pattern 4.2).
 */
export interface AgentOptions {
  /**
   * System prompt that defines the agent's persona and instructions.
   * For Purchase Advisor, this configures the shopping assistant behavior.
   */
  systemPrompt?: string;

  /**
   * Maximum number of loop iterations before forced termination.
   * Default: 15 (sufficient for most purchase research tasks)
   */
  maxIterations?: number;

  /**
   * Enable verbose logging of agent activity.
   * Default: true (helpful for educational demonstration)
   */
  verbose?: boolean;

  /**
   * Custom logging function. Defaults to console.log.
   */
  logger?: (message: string) => void;

  /**
   * Event store for audit trail (Pattern 4.2: Event-Sourced State).
   * When provided, all agent activity is recorded for debugging and analytics.
   */
  eventStore?: EventStore;
}

// =============================================================================
// THE LOOP - Core Agent Pattern (Pattern 1.1)
// =============================================================================

/**
 * The Loop - Fundamental Agent Pattern
 *
 * This mirrors the agent() function from patterns/01-the-loop.ts,
 * with Purchase Advisor specifics and event sourcing added.
 *
 * The loop has four phases:
 * 1. GENERATE - Query the LLM with current context
 * 2. CHECK - Did the LLM signal completion?
 * 3. EXECUTE - Run any requested tool calls
 * 4. REPEAT - Feed results back, continue until done
 *
 * @param task - The user's purchase request
 * @param tools - Available tools (search, reviews, compare, done)
 * @param llm - LLM client (OpenRouter or mock)
 * @param options - Configuration options
 * @returns The agent's final recommendation
 */
async function agent(
  task: string,
  tools: Tool[],
  llm: LLMClient,
  options: AgentOptions = {}
): Promise<string> {
  // Apply defaults (mirrors scaffolding, with Purchase Advisor adjustments)
  const {
    systemPrompt,
    maxIterations = 15,
    verbose = true,
    logger = console.log,
    eventStore,
  } = options;

  // Helper for conditional logging
  const log = (msg: string) => verbose && logger(msg);

  const startTime = Date.now();

  // Record agent start event (Pattern 4.2: Event Sourcing)
  if (eventStore) {
    await eventStore.append({
      type: 'agent_started',
      task,
      tools: tools.map((t) => t.name),
    });
  }

  // Initialize conversation context
  const messages: Message[] = [];

  // Add system prompt if provided (defines agent persona/instructions)
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // Add the user's task
  messages.push({ role: 'user', content: task });

  log('\n' + '='.repeat(60));
  log('SMART PURCHASE ADVISOR');
  log('='.repeat(60));
  log(`Task: ${task}\n`);

  // Main loop with iteration guard (Pattern 1.1: The Loop)
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    log(`--- Iteration ${iteration} ---`);

    // 1. GENERATE: Query the LLM with current context
    const response = await llm.invoke(messages, tools);

    // 2. CHECK: Handle case where LLM responds with text but no tool calls
    if (response.toolCalls.length === 0) {
      if (response.content) {
        messages.push({ role: 'assistant', content: response.content });
        log(`LLM response (no tools): ${response.content.substring(0, 100)}...`);
      }
      continue;
    }

    // 3. EXECUTE: Run tool calls and collect results
    //
    // IMPORTANT: We must add the assistant's message (with tool_calls) to the
    // conversation BEFORE adding tool results. This is required by LLM APIs.
    //
    // The conversation flow must be:
    //   User: "Do something"
    //   Assistant: [tool_calls: [{id: "abc", name: "my_tool", args: {...}}]]
    //   Tool: [tool_call_id: "abc", content: "result"]
    //
    // Without the assistant message, the API cannot match tool results to their
    // requests. Anthropic and OpenAI both validate this pairing and will reject
    // requests where tool_call_id doesn't match a preceding tool_calls entry.
    //
    messages.push({
      role: 'assistant',
      content: response.content || '',
      tool_calls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      const tool = tools.find((t) => t.name === call.name);
      const toolStartTime = Date.now();

      // Record tool call event (Pattern 4.2)
      if (eventStore) {
        await eventStore.append({
          type: 'tool_called',
          toolCallId: call.id,
          tool: call.name,
          arguments: call.arguments,
        });
      }

      if (!tool) {
        // Unknown tool - return error to LLM so it can adjust
        const errorMsg = `Error: Unknown tool "${call.name}"`;
        messages.push({
          role: 'tool',
          content: errorMsg,
          tool_call_id: call.id,
        });

        // Record tool error (Pattern 4.2)
        if (eventStore) {
          await eventStore.append({
            type: 'tool_result',
            toolCallId: call.id,
            tool: call.name,
            result: errorMsg,
            success: false,
            durationMs: Date.now() - toolStartTime,
          });
        }

        log(`  ✗ ${call.name}: ${errorMsg}`);
        continue;
      }

      log(`  → ${call.name}(${JSON.stringify(call.arguments)})`);

      // Execute the tool (may throw TaskComplete for done tool - Pattern 3.2)
      try {
        const result = await tool.execute(call.arguments);

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: call.id,
        });

        // Record tool result (Pattern 4.2)
        if (eventStore) {
          await eventStore.append({
            type: 'tool_result',
            toolCallId: call.id,
            tool: call.name,
            result: result.substring(0, 500), // Truncate for storage
            success: !result.startsWith('Error'),
            durationMs: Date.now() - toolStartTime,
          });
        }

        // Log result preview
        const preview = result.length > 100 ? result.substring(0, 100) + '...' : result;
        log(`  ← ${preview.split('\n')[0]}`);
      } catch (error) {
        // Pattern 3.2: Explicit Termination via TaskComplete exception
        if (error instanceof TaskComplete) {
          log('Agent completed task.');

          // Record completion event (Pattern 4.2)
          if (eventStore) {
            await eventStore.append({
              type: 'agent_completed',
              result: error.result,
              success: true,
              totalIterations: iteration,
              totalDurationMs: Date.now() - startTime,
            });
          }

          return error.result;
        }
        // Re-throw unexpected errors
        throw error;
      }
    }

    // 4. Loop continues - the LLM observes tool results
    // and decides next action (observe → act → adjust)
  }

  // Max iterations reached - return graceful failure message
  const failureResult =
    `Agent reached maximum iterations (${maxIterations}) without completing. ` +
    'Consider increasing maxIterations or simplifying the task.';

  // Record failure (Pattern 4.2)
  if (eventStore) {
    await eventStore.append({
      type: 'agent_completed',
      result: failureResult,
      success: false,
      totalIterations: maxIterations,
      totalDurationMs: Date.now() - startTime,
    });
  }

  return failureResult;
}

// =============================================================================
// PURCHASE ADVISOR SYSTEM PROMPT
// =============================================================================

/**
 * System prompt for the Smart Purchase Advisor.
 *
 * This configures the agent's persona and instructions for helping
 * users find the best laptop for their needs.
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
3. Review top candidates
4. Compare if needed
5. Make a recommendation with reasoning

Always use the done tool when finished, providing:
- recommendation: the product ID (e.g., "laptop-001")
- reasoning: why you chose this product
- confidence: 0-1 score
- alternatives: other options to consider`;

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // Get task from command line or use default
  const task =
    process.argv[2] ||
    'Find me a laptop under $1500 for programming. I need a good keyboard and at least 16GB RAM.';

  // Create event store for audit trail (Pattern 4.2)
  // Optionally persist to disk with: new EventStore('./events.jsonl')
  const eventStore = new EventStore();

  try {
    // Create LLM client (mock or real based on environment)
    const llm = createClient();

    // Run the agent with Purchase Advisor configuration
    const result = await agent(task, allTools, llm, {
      systemPrompt: PURCHASE_ADVISOR_PROMPT,
      eventStore,
      maxIterations: 15,
      verbose: true,
    });

    // Parse and display the recommendation
    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDATION');
    console.log('='.repeat(60));

    const recommendation = parseRecommendation(result);
    if (recommendation) {
      const product = getProduct(recommendation.recommendation);

      console.log(`\nRecommended: ${product?.name ?? recommendation.recommendation}`);
      if (product) {
        console.log(`Price: $${product.price.toFixed(2)}`);
        console.log(`Rating: ${product.rating}/5`);
      }
      console.log(`\nReasoning: ${recommendation.reasoning}`);
      console.log(`Confidence: ${(recommendation.confidence * 100).toFixed(0)}%`);

      if (recommendation.alternatives?.length) {
        console.log('\nAlternatives:');
        for (const alt of recommendation.alternatives) {
          const altProduct = getProduct(alt.id);
          console.log(`  - ${altProduct?.name ?? alt.id}: ${alt.reason}`);
        }
      }
    } else {
      console.log('\nRaw result:');
      console.log(result);
    }

    // Display event sourcing summary (Pattern 4.2)
    console.log('\n' + '='.repeat(60));
    console.log('EVENT LOG SUMMARY');
    console.log('='.repeat(60));
    console.log(eventStore.getSummary());

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    // Record error event (Pattern 4.2)
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

// Export for testing and extension
export { agent };

main();
