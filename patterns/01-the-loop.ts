/**
 * Pattern 1.1: The Loop
 *
 * The fundamental agent architecture. Every agent is a feedback loop:
 * observe → act → adjust → repeat.
 *
 * Derived from: Wiener (1948) cybernetics, Brooks (1986) subsumption
 *
 * WHY THIS PATTERN:
 * - Agents are not chatbots. They act on the world.
 * - The loop is the minimal structure that allows observation and correction.
 * - Without a loop, you have a one-shot prompt, not an agent.
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

import type { Message, Tool, LLMClient, LLMResponse, ToolCall } from './types.js';

// =============================================================================
// AGENT OPTIONS
// =============================================================================

/**
 * Configuration options for the agent loop.
 *
 * These options let you customize agent behavior without modifying
 * the core loop logic. Sensible defaults are provided.
 */
export interface AgentOptions {
  /**
   * System prompt that defines the agent's persona and instructions.
   * This is prepended to the conversation and guides the LLM's behavior.
   *
   * Example: "You are a code review assistant. Analyze code for bugs,
   * security issues, and style problems. Use the provided tools to
   * read files and report findings."
   */
  systemPrompt?: string;

  /**
   * Maximum number of loop iterations before forced termination.
   * Prevents runaway agents from infinite loops or excessive API costs.
   *
   * Default: 50 (reasonable for most tasks; adjust based on complexity)
   */
  maxIterations?: number;

  /**
   * Enable verbose logging of agent activity.
   * Useful for debugging and understanding agent behavior.
   *
   * When true, logs: iteration count, tool calls, result previews
   */
  verbose?: boolean;

  /**
   * Custom logging function. Defaults to console.log.
   * Override this to integrate with your logging infrastructure.
   */
  logger?: (message: string) => void;
}

// =============================================================================
// THE LOOP - Core Agent Architecture
// =============================================================================

/**
 * The Loop - Fundamental Agent Pattern
 *
 * This is the minimal viable agent. Every more complex agent
 * is an elaboration of this basic structure.
 *
 * The loop has four phases:
 * 1. GENERATE - Query the LLM with current context
 * 2. CHECK - Did the LLM signal completion?
 * 3. EXECUTE - Run any requested tool calls
 * 4. REPEAT - Feed results back, continue until done
 *
 * @param task - The user's task or query
 * @param tools - Available tools the agent can use
 * @param llm - LLM client for generating responses
 * @param options - Configuration options (system prompt, logging, limits)
 * @returns The agent's final result
 */
async function agent(
  task: string,
  tools: Tool[],
  llm: LLMClient,
  options: AgentOptions = {}
): Promise<string> {
  // Apply defaults
  const {
    systemPrompt,
    maxIterations = 50,
    verbose = false,
    logger = console.log,
  } = options;

  // Helper for conditional logging
  const log = (msg: string) => verbose && logger(msg);

  // Initialize conversation context
  const messages: Message[] = [];

  // Add system prompt if provided (defines agent persona/instructions)
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // Add the user's task
  messages.push({ role: 'user', content: task });

  log(`Starting agent with task: ${task.substring(0, 100)}...`);

  // Main loop with iteration guard
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    log(`--- Iteration ${iteration} ---`);

    // 1. GENERATE: Query the LLM with current context
    const response = await llm.invoke(messages, tools);

    // 2. CHECK TERMINATION: Explicit done signal
    // See Pattern 3.2 (Explicit Termination) for why we use
    // a done flag rather than "no tool calls"
    if (response.done) {
      log('Agent completed task.');
      return response.result ?? '';
    }

    // Handle case where LLM responds with text but no tool calls
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
      const tool = tools.find(t => t.name === call.name);

      if (!tool) {
        // Unknown tool - return error to LLM so it can adjust
        const errorMsg = `Error: Unknown tool "${call.name}"`;
        messages.push({
          role: 'tool',
          content: errorMsg,
          tool_call_id: call.id,
        });
        log(`  ✗ ${call.name}: ${errorMsg}`);
        continue;
      }

      log(`  → ${call.name}(${JSON.stringify(call.arguments)})`);

      // Execute the tool
      const result = await tool.execute(call.arguments);

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: call.id,
      });

      // Log result preview
      const preview = result.length > 100 ? result.substring(0, 100) + '...' : result;
      log(`  ← ${preview.split('\n')[0]}`);
    }

    // 4. Loop continues - the LLM observes tool results
    // and decides next action (observe → act → adjust)
  }

  // Max iterations reached - return graceful failure message
  return `Agent reached maximum iterations (${maxIterations}) without completing. ` +
    'Consider increasing maxIterations or simplifying the task.';
}

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/**
 * Example: Simple file-reading agent
 *
 * This demonstrates the loop pattern with a minimal tool set.
 * In production, you would add guards (Pattern 1.2), validation
 * (Pattern 3.3), and proper error handling (Pattern 6.1).
 */
async function exampleUsage(): Promise<void> {
  // Define a simple tool
  const readFileTool: Tool = {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
      },
      required: ['path'],
    },
    execute: async (args) => {
      // In production: actual file reading with error handling
      const path = args.path as string;
      return `Contents of ${path}: [file data here]`;
    },
  };

  // The done tool signals task completion
  // See Pattern 3.2 for full implementation
  const doneTool: Tool = {
    name: 'done',
    description: 'Signal that the task is complete',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'Final result' },
      },
      required: ['result'],
    },
    execute: async (args) => args.result as string,
  };

  // Mock LLM client (in production: use OpenAI, Anthropic, etc.)
  const mockLLM: LLMClient = {
    invoke: async (messages, _tools) => {
      // Simulate LLM deciding to read a file, then complete
      // In real usage, the LLM makes these decisions based on the task
      const hasToolResult = messages.some(m => m.role === 'tool');

      if (!hasToolResult) {
        return {
          content: '',
          toolCalls: [{ id: '1', name: 'read_file', arguments: { path: 'data.txt' } }],
          done: false,
        };
      }
      return {
        content: '',
        toolCalls: [],
        done: true,
        result: 'Read the file successfully',
      };
    },
  };

  // Run the agent with options
  const result = await agent(
    'Read the data file and summarize it',
    [readFileTool, doneTool],
    mockLLM,
    {
      systemPrompt: 'You are a helpful file assistant. Read files when asked and summarize their contents.',
      maxIterations: 10,
      verbose: true,
    }
  );

  console.log('Agent result:', result);
}

export { agent, exampleUsage };

// Note: AgentOptions is defined and exported above
// Re-export types from types.js for convenience
export type { Message, Tool, LLMClient, LLMResponse, ToolCall } from './types.js';
