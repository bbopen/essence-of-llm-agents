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

import type { Message, Tool, LLMClient, LLMResponse, ToolCall } from './types';

/**
 * The Loop - Core Agent Architecture
 *
 * This is the minimal viable agent. Every more complex agent
 * is an elaboration of this basic structure.
 *
 * The loop has four phases:
 * 1. GENERATE - Query the LLM with current context
 * 2. CHECK - Did the LLM signal completion?
 * 3. EXECUTE - Run any requested tool calls
 * 4. REPEAT - Feed results back, continue until done
 */
async function agent(
  task: string,
  tools: Tool[],
  llm: LLMClient
): Promise<string> {
  // Initialize context with the task
  const messages: Message[] = [{ role: 'user', content: task }];

  while (true) {
    // 1. GENERATE: Query the stochastic generator
    const response = await llm.invoke(messages, tools);

    // 2. CHECK TERMINATION: Explicit done signal
    // See Pattern 3.2 (Explicit Termination) for why we use
    // a done flag rather than "no tool calls"
    if (response.done) {
      return response.result ?? '';
    }

    // 3. EXECUTE: Run tool calls and collect results
    for (const call of response.toolCalls) {
      const tool = tools.find(t => t.name === call.name);
      if (!tool) {
        // Unknown tool - return error to LLM so it can adjust
        messages.push({
          role: 'tool',
          content: `Error: Unknown tool ${call.name}`,
          tool_call_id: call.id
        });
        continue;
      }

      // Execute and feed result back to context
      const result = await tool.execute(call.arguments);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: call.id
      });
    }

    // 4. Loop continues - the LLM observes tool results
    // and decides next action (observe → act → adjust)
  }
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
        path: { type: 'string', description: 'File path to read' }
      },
      required: ['path']
    },
    execute: async (args) => {
      // In production: actual file reading with error handling
      const path = args.path as string;
      return `Contents of ${path}: [file data here]`;
    }
  };

  // The done tool signals task completion
  // See Pattern 3.2 for full implementation
  const doneTool: Tool = {
    name: 'done',
    description: 'Signal that the task is complete',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string', description: 'Final result' }
      },
      required: ['result']
    },
    execute: async (args) => args.result as string
  };

  // Mock LLM client (in production: use OpenAI, Anthropic, etc.)
  const mockLLM: LLMClient = {
    invoke: async (messages, tools) => {
      // Simulate LLM deciding to read a file, then complete
      if (messages.length === 1) {
        return {
          content: '',
          toolCalls: [{ id: '1', name: 'read_file', arguments: { path: 'data.txt' } }],
          done: false
        };
      }
      return {
        content: '',
        toolCalls: [],
        done: true,
        result: 'Read the file successfully'
      };
    }
  };

  const result = await agent(
    'Read the data file and summarize it',
    [readFileTool, doneTool],
    mockLLM
  );

  console.log('Agent result:', result);
}

export { agent, exampleUsage };

// Re-export types for convenience
export type { Message, Tool, LLMClient, LLMResponse, ToolCall };
