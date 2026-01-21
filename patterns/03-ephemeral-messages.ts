/**
 * Pattern 2.2: Ephemeral Messages
 *
 * Mark tool outputs as ephemeral and prune aggressively. Tool results
 * are valuable at generation time but become noise afterward.
 *
 * Derived from: JetBrains research (50% cost reduction), context economics
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  ephemeral?: boolean;
  timestamp?: number;
}

interface EphemeralConfig {
  keepLast: number;  // Keep only N most recent ephemeral messages
  maxAge?: number;   // Optional: prune messages older than N ms
}

// Prune ephemeral messages, keeping only the most recent
function pruneEphemeral(
  messages: Message[],
  config: EphemeralConfig
): Message[] {
  const permanent = messages.filter(m => !m.ephemeral);
  const ephemeral = messages.filter(m => m.ephemeral);

  // Apply age filter if configured
  let filtered = ephemeral;
  if (config.maxAge) {
    const cutoff = Date.now() - config.maxAge;
    filtered = filtered.filter(m => (m.timestamp ?? 0) > cutoff);
  }

  // Keep only the N most recent
  const kept = filtered.slice(-config.keepLast);

  // Reconstruct in original order
  const keptSet = new Set(kept);
  return messages.filter(m => !m.ephemeral || keptSet.has(m));
}

// Mark a message as ephemeral
function asEphemeral(content: string): Message {
  return {
    role: 'tool',
    content,
    ephemeral: true,
    timestamp: Date.now()
  };
}

// Example: Agent loop with ephemeral pruning
async function agentWithPruning(
  task: string,
  tools: Array<{ name: string; execute: (args: unknown) => Promise<string> }>,
  llm: { invoke: (messages: Message[]) => Promise<{ done: boolean; toolCalls: Array<{ name: string; args: unknown }> }> },
  config: EphemeralConfig = { keepLast: 5 }
): Promise<string> {
  let messages: Message[] = [{ role: 'user', content: task }];

  while (true) {
    // Prune before each LLM call to save tokens
    messages = pruneEphemeral(messages, config);

    const response = await llm.invoke(messages);

    if (response.done) {
      return messages[messages.length - 1]?.content ?? '';
    }

    for (const call of response.toolCalls) {
      const tool = tools.find(t => t.name === call.name);
      if (tool) {
        const result = await tool.execute(call.args);
        // Tool outputs are ephemeral by default
        messages.push(asEphemeral(result));
      }
    }
  }
}

export {
  pruneEphemeral,
  asEphemeral,
  agentWithPruning,
  Message,
  EphemeralConfig
};
