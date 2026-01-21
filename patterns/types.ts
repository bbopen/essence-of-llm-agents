/**
 * Shared Types for Agent Patterns
 *
 * These types follow the OpenAI API specification, which most LLM providers
 * (Anthropic, Google, Mistral, local models via Ollama/vLLM) are compatible with.
 *
 * Adapt these interfaces to your specific provider's SDK as needed.
 *
 * @see https://platform.openai.com/docs/api-reference/chat
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// =============================================================================
// MESSAGE TYPES (OpenAI-compatible)
// =============================================================================

/**
 * Role in the conversation. Maps to OpenAI's role field.
 * - 'system': Initial instructions (often called system prompt)
 * - 'user': Human input or task description
 * - 'assistant': LLM responses
 * - 'tool': Results from tool execution (OpenAI calls this 'function' in older API)
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A message in the conversation history.
 *
 * The `ephemeral` flag is an extension for context management:
 * messages marked ephemeral can be pruned to save tokens.
 */
export interface Message {
  role: MessageRole;
  content: string;

  /** Tool call ID this message is responding to (for role: 'tool') */
  tool_call_id?: string;

  /** Tool calls made by assistant (for role: 'assistant') */
  tool_calls?: ToolCall[];

  /** Mark as prunable for context management. Not part of OpenAI spec. */
  ephemeral?: boolean;

  /** Timestamp for age-based pruning. Not part of OpenAI spec. */
  timestamp?: number;
}

/**
 * Tool call requested by the LLM.
 * Maps to OpenAI's tool_calls[].function structure.
 */
export interface ToolCall {
  /** Unique ID for correlating with tool results */
  id: string;

  /** Tool name to invoke */
  name: string;

  /** Arguments as parsed JSON (LLM returns string, you parse it) */
  arguments: Record<string, unknown>;
}

/**
 * LLM response structure.
 * Simplified from OpenAI's ChatCompletion for agent use.
 */
export interface LLMResponse {
  /** Text content of the response (may be empty if only tool calls) */
  content: string;

  /** Tool calls the LLM wants to make */
  toolCalls: ToolCall[];

  /** Whether the LLM signaled completion (via stop token or done tool) */
  done: boolean;

  /** Final result if done is true */
  result?: string;

  /** Token usage for cost tracking */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// =============================================================================
// TOOL TYPES
// =============================================================================

/**
 * JSON Schema for tool parameters.
 * OpenAI uses JSON Schema draft-07 for tool definitions.
 */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    enum?: string[];
    items?: { type: string };
    required?: boolean;
  }>;
  required?: string[];
}

/**
 * Tool definition for the LLM.
 * Maps to OpenAI's tools[].function structure.
 */
export interface Tool {
  /** Unique tool name (used in tool calls) */
  name: string;

  /** Description shown to LLM to help it decide when to use this tool */
  description: string;

  /** JSON Schema defining the tool's parameters */
  parameters: ToolParameters;

  /**
   * Execute the tool with validated arguments.
   * Returns a string result that will be added to conversation as tool message.
   *
   * IMPORTANT: Return errors as strings, don't throw.
   * This lets the LLM see the error and retry with different arguments.
   */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * Result of tool execution for internal tracking.
 */
export interface ToolResult {
  /** Tool call ID this result corresponds to */
  toolCallId: string;

  /** Tool name that was executed */
  toolName: string;

  /** Result content (success message or error description) */
  content: string;

  /** Whether execution succeeded */
  success: boolean;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

// =============================================================================
// LLM CLIENT INTERFACE
// =============================================================================

/**
 * Abstract LLM client interface.
 *
 * Implement this for your specific provider:
 * - Anthropic: Use @anthropic-ai/sdk, map to Claude's message format
 * - OpenAI: Use openai package directly
 * - Local: Use Ollama, vLLM, or similar with OpenAI-compatible endpoint
 *
 * Example implementation sketch:
 * ```typescript
 * class AnthropicClient implements LLMClient {
 *   private client: Anthropic;
 *
 *   async invoke(messages: Message[], tools: Tool[]): Promise<LLMResponse> {
 *     const response = await this.client.messages.create({
 *       model: 'claude-sonnet-4-20250514',
 *       messages: this.convertMessages(messages),
 *       tools: this.convertTools(tools),
 *     });
 *     return this.convertResponse(response);
 *   }
 * }
 * ```
 */
export interface LLMClient {
  /**
   * Send messages to the LLM and get a response.
   *
   * @param messages - Conversation history
   * @param tools - Available tools for this request
   * @returns LLM response with potential tool calls
   */
  invoke(messages: Message[], tools: Tool[]): Promise<LLMResponse>;
}

// =============================================================================
// POLICY & GUARD TYPES
// =============================================================================

/**
 * Action representation for guard evaluation.
 * Guards validate actions before execution.
 */
export interface Action {
  /** Action type (often maps to tool name) */
  type: string;

  /** Target resource (file path, URL, etc.) */
  target?: string;

  /** Action parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Policy for action filtering.
 * Used by Deterministic Guards pattern.
 */
export interface Policy {
  /** Tools that are completely blocked */
  blockedTools: string[];

  /** Regex patterns to block in arguments */
  blockedPatterns: RegExp[];

  /** Tools that require human confirmation */
  requiresConfirmation: string[];

  /** Maximum operations per session */
  maxOperations?: number;
}

/**
 * Budget constraints for resource management.
 */
export interface Budget {
  /** Maximum tokens to use */
  maxTokens: number;

  /** Maximum API calls to make */
  maxApiCalls: number;

  /** Maximum execution time in milliseconds */
  maxTimeMs?: number;

  /** Tokens used so far */
  usedTokens: number;

  /** API calls made so far */
  usedApiCalls: number;

  /** Start time for duration tracking */
  startTime?: number;
}

/**
 * Result of a guard check.
 */
export interface GuardResult {
  /** Whether the action is allowed */
  allowed: boolean;

  /** Reason for rejection (if not allowed) */
  reason?: string;

  /** Whether this guard's decision is final (stops further checks) */
  override?: boolean;

  /** Whether human confirmation is required before proceeding */
  requiresConfirmation?: boolean;
}

// =============================================================================
// EVENT SOURCING TYPES
// =============================================================================

/**
 * Base event structure for event sourcing.
 * All events should extend this.
 */
export interface BaseEvent {
  /** Event type discriminator */
  type: string;

  /** When the event occurred */
  timestamp: number;

  /** Optional metadata (correlation IDs, user info, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Agent lifecycle events.
 */
export interface AgentStartedEvent extends BaseEvent {
  type: 'agent_started';
  task: string;
  tools: string[];
}

export interface AgentCompletedEvent extends BaseEvent {
  type: 'agent_completed';
  result: string;
  success: boolean;
  totalIterations: number;
  totalDurationMs: number;
}

export interface ToolCalledEvent extends BaseEvent {
  type: 'tool_called';
  toolCallId: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  toolCallId: string;
  tool: string;
  result: string;
  success: boolean;
  durationMs: number;
}

export interface StateChangedEvent extends BaseEvent {
  type: 'state_changed';
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ErrorOccurredEvent extends BaseEvent {
  type: 'error_occurred';
  error: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

/** Union of all agent events */
export type AgentEvent =
  | AgentStartedEvent
  | AgentCompletedEvent
  | ToolCalledEvent
  | ToolResultEvent
  | StateChangedEvent
  | ErrorOccurredEvent;

// =============================================================================
// ORCHESTRATION TYPES
// =============================================================================

/**
 * Task for delegation to sub-agents.
 */
export interface Task {
  /** Unique task identifier */
  id: string;

  /** Human-readable task description */
  description: string;

  /** Priority for scheduling */
  priority?: 'high' | 'normal' | 'low';

  /** Additional context for the sub-agent */
  context?: Record<string, unknown>;
}

/**
 * Result from a sub-agent task.
 */
export interface TaskResult {
  /** Task ID this result corresponds to */
  taskId: string;

  /** Whether the task completed successfully */
  success: boolean;

  /** Result content if successful */
  result?: string;

  /** Error message if failed */
  error?: string;

  /** Execution metrics */
  metrics?: {
    durationMs: number;
    tokensUsed?: number;
    toolCalls?: number;
  };
}
