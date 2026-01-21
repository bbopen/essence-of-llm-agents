/**
 * Pattern 3.2: Explicit Termination
 *
 * Provide a "done" tool so the agent explicitly signals completion.
 * No implicit termination through message patterns or timeout.
 *
 * Derived from: Claude Code architecture, production agent patterns
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// Custom error for clean termination
class TaskComplete extends Error {
  constructor(public result: string) {
    super('Task completed');
    this.name = 'TaskComplete';
  }
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// The Done Tool - explicit termination signal
const doneTool: Tool = {
  name: 'done',
  description: 'Signal that the task is complete. Call this when you have finished the task or determined it cannot be completed.',
  parameters: {
    result: {
      type: 'string',
      description: 'Final result or explanation of what was accomplished'
    },
    success: {
      type: 'boolean',
      description: 'Whether the task was completed successfully'
    }
  },
  execute: async (args) => {
    const result = args.result as string;
    const success = args.success as boolean;

    if (success) {
      throw new TaskComplete(result);
    } else {
      throw new TaskComplete(`Failed: ${result}`);
    }
  }
};

// Agent loop with explicit termination
async function agentWithExplicitTermination(
  task: string,
  tools: Tool[],
  llm: { invoke: (messages: Array<{ role: string; content: string }>, tools: Tool[]) => Promise<{ toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> }> },
  maxIterations: number = 100
): Promise<string> {
  // Always include the done tool
  const allTools = [...tools, doneTool];
  // Message type must support tool_calls for assistant messages
  // and tool_call_id for tool result messages (see Pattern 1.1)
  const messages: Array<{
    role: string;
    content: string;
    tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    tool_call_id?: string;
  }> = [
    { role: 'user', content: task }
  ];

  for (let i = 0; i < maxIterations; i++) {
    const response = await llm.invoke(messages, allTools);

    // Add assistant message with tool_calls before processing results.
    // This is required by LLM APIs - see Pattern 1.1 for detailed explanation.
    if (response.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: response.toolCalls,
      });
    }

    for (const call of response.toolCalls) {
      const tool = allTools.find(t => t.name === call.name);
      if (!tool) continue;

      try {
        const result = await tool.execute(call.arguments);
        messages.push({ role: 'tool', content: result, tool_call_id: call.id });
      } catch (error) {
        if (error instanceof TaskComplete) {
          // Clean termination via done tool
          return error.result;
        }
        throw error;
      }
    }
  }

  // Fallback: max iterations reached
  return 'Max iterations reached without explicit completion';
}

export {
  doneTool,
  agentWithExplicitTermination,
  TaskComplete,
  Tool
};
