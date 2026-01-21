/**
 * Pattern 3.1: Complete Action Spaces
 *
 * Give the LLM maximal capability, then restrict based on evaluation.
 * Don't try to anticipate every use case - the model already knows.
 *
 * Derived from: Ashby's Law of Requisite Variety (1956), The Bitter Lesson
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface Policy {
  blockedTools: string[];
  blockedPatterns: RegExp[];
  requiresConfirmation: string[];
}

// Complete set of tools - everything the agent could possibly need
const completeTools: Tool[] = [
  {
    name: 'read_file',
    description: 'Read contents of a file',
    parameters: { path: { type: 'string' } },
    execute: async (args) => `Contents of ${args.path}`
  },
  {
    name: 'write_file',
    description: 'Write contents to a file',
    parameters: { path: { type: 'string' }, content: { type: 'string' } },
    execute: async (args) => `Wrote to ${args.path}`
  },
  {
    name: 'delete_file',
    description: 'Delete a file',
    parameters: { path: { type: 'string' } },
    execute: async (args) => `Deleted ${args.path}`
  },
  {
    name: 'execute_command',
    description: 'Run a shell command',
    parameters: { command: { type: 'string' } },
    execute: async (args) => `Executed: ${args.command}`
  },
  {
    name: 'network_request',
    description: 'Make an HTTP request',
    parameters: { url: { type: 'string' }, method: { type: 'string' } },
    execute: async (args) => `Fetched ${args.url}`
  }
];

// Policy-based filtering - guards restrict, not tools
function filterByPolicy(tools: Tool[], policy: Policy): Tool[] {
  return tools.filter(tool => {
    // Block explicitly denied tools
    if (policy.blockedTools.includes(tool.name)) {
      return false;
    }
    return true;
  });
}

// Runtime guard - check specific action against policy
function isActionAllowed(
  toolName: string,
  args: Record<string, unknown>,
  policy: Policy
): { allowed: boolean; reason?: string; requiresConfirmation?: boolean } {
  // Check blocked tools
  if (policy.blockedTools.includes(toolName)) {
    return { allowed: false, reason: `Tool '${toolName}' is blocked by policy` };
  }

  // Check blocked patterns in arguments
  const argsStr = JSON.stringify(args);
  for (const pattern of policy.blockedPatterns) {
    if (pattern.test(argsStr)) {
      return { allowed: false, reason: `Arguments match blocked pattern: ${pattern}` };
    }
  }

  // Check if confirmation required
  if (policy.requiresConfirmation.includes(toolName)) {
    return { allowed: true, requiresConfirmation: true };
  }

  return { allowed: true };
}

// Example policy: production environment
const productionPolicy: Policy = {
  blockedTools: ['delete_file'], // Never delete in production
  blockedPatterns: [
    /rm\s+-rf/,           // No recursive deletes
    /DROP\s+TABLE/i,      // No SQL drops
    /\/etc\//,            // No system file access
  ],
  requiresConfirmation: ['execute_command', 'network_request']
};

export {
  completeTools,
  filterByPolicy,
  isActionAllowed,
  productionPolicy,
  Tool,
  Policy
};
