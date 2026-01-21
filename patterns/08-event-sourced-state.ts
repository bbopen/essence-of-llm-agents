/**
 * Pattern 4.2: Event-Sourced State
 *
 * Append-only event log with state derivation. Never lose history.
 * State can always be reconstructed from events.
 *
 * Derived from: Event sourcing patterns, audit requirements
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

import { promises as fs } from 'fs';

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Base event interface. All events have a type and timestamp.
 * Timestamps are added automatically by the EventStore.
 */
interface BaseEvent {
  type: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Agent started event - marks the beginning of an agent run.
 * Useful for tracking session boundaries and initial state.
 */
interface AgentStartedEvent extends BaseEvent {
  type: 'agent_started';
  task: string;
  tools: string[];
}

/**
 * Tool called event - records when a tool is invoked.
 * The toolCallId links this event to the corresponding result event.
 */
interface ToolCalledEvent extends BaseEvent {
  type: 'tool_called';
  toolCallId: string;
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result event - records the outcome of a tool call.
 * Links back to the original call via toolCallId.
 */
interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  toolCallId: string;
  tool: string;
  result: string;
  success: boolean;
  durationMs: number;
}

/**
 * State changed event - tracks mutations to agent state.
 * Useful for debugging and replaying state transitions.
 */
interface StateChangedEvent extends BaseEvent {
  type: 'state_changed';
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Agent completed event - marks the end of an agent run.
 * Records whether the task succeeded and aggregate metrics.
 */
interface AgentCompletedEvent extends BaseEvent {
  type: 'agent_completed';
  result: string;
  success: boolean;
  totalIterations: number;
  totalDurationMs: number;
}

/**
 * Error occurred event - records errors during execution.
 * Useful for debugging and monitoring error rates.
 */
interface ErrorOccurredEvent extends BaseEvent {
  type: 'error_occurred';
  error: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

/**
 * Union of all agent events.
 *
 * TypeScript note: When using Omit<AgentEvent, 'timestamp'>, TypeScript's
 * handling of union types with Omit doesn't narrow properly. We handle this
 * in EventStore.append by accepting explicit union of Omit types.
 */
type AgentEvent =
  | AgentStartedEvent
  | ToolCalledEvent
  | ToolResultEvent
  | StateChangedEvent
  | AgentCompletedEvent
  | ErrorOccurredEvent;

// =============================================================================
// EVENT STORE - Append-only log with optional persistence
// =============================================================================

/**
 * Event Store for agent activity tracking.
 *
 * Usage:
 *   const store = new EventStore('./events.jsonl');
 *   await store.append({ type: 'agent_started', task: '...', tools: [...] });
 *   const state = deriveState(store.all());
 */
class EventStore {
  private events: AgentEvent[] = [];
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
  }

  /**
   * Append an event to the store. Timestamp is added automatically.
   *
   * Note: We accept explicit union of Omit types because TypeScript's Omit
   * on union types doesn't narrow properly. The 'type' field discriminates
   * at runtime.
   */
  async append(
    event:
      | Omit<AgentStartedEvent, 'timestamp'>
      | Omit<ToolCalledEvent, 'timestamp'>
      | Omit<ToolResultEvent, 'timestamp'>
      | Omit<StateChangedEvent, 'timestamp'>
      | Omit<AgentCompletedEvent, 'timestamp'>
      | Omit<ErrorOccurredEvent, 'timestamp'>
  ): Promise<void> {
    const fullEvent = {
      ...event,
      timestamp: Date.now()
    } as AgentEvent;

    this.events.push(fullEvent);

    // Persist if configured
    if (this.persistPath) {
      await this.persist();
    }
  }

  all(): AgentEvent[] {
    return [...this.events];
  }

  filter<T extends AgentEvent>(type: T['type']): T[] {
    return this.events.filter(e => e.type === type) as T[];
  }

  since(timestamp: number): AgentEvent[] {
    return this.events.filter(e => e.timestamp > timestamp);
  }

  async persist(): Promise<void> {
    if (!this.persistPath) return;
    await fs.writeFile(
      this.persistPath,
      this.events.map(e => JSON.stringify(e)).join('\n')
    );
  }

  async load(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      this.events = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch {
      // File doesn't exist yet
    }
  }

  /**
   * Get the current derived state.
   * Convenience method that calls deriveState internally.
   */
  getState(): AgentState {
    return deriveState(this.events);
  }

  /**
   * Clear all events (useful for testing).
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get a human-readable summary of agent activity.
   * Useful for debugging and displaying results.
   */
  getSummary(): string {
    const state = this.getState();
    const duration = state.endTime
      ? state.endTime - state.startTime
      : Date.now() - state.startTime;

    return [
      `Status: ${state.status}`,
      `Task: ${state.task}`,
      `Iterations: ${state.iterations}`,
      `Tool Calls: ${state.toolCalls.total} (${state.toolCalls.successful} ok, ${state.toolCalls.failed} failed)`,
      `Duration: ${duration}ms`,
      state.errors.length > 0 ? `Errors: ${state.errors.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

// =============================================================================
// STATE DERIVATION - Reconstruct state from event history
// =============================================================================

/**
 * Agent state derived from events.
 *
 * This represents the "current" state of an agent run, computed
 * by folding over all events. No state is stored directly - it's
 * always derived from the event log.
 */
interface AgentState {
  status: 'running' | 'completed' | 'failed';
  task: string;
  startTime: number;
  endTime?: number;
  iterations: number;
  toolCalls: {
    total: number;
    successful: number;
    failed: number;
    byTool: Record<string, number>;
  };
  variables: Record<string, unknown>;
  errors: string[];
  result?: string;
}

/**
 * Derive current state from event history.
 *
 * This is the "fold" operation in event sourcing. Given a sequence
 * of events, compute the resulting state. This can be called at any
 * time to get the current state, or used to replay history.
 */
function deriveState(events: AgentEvent[]): AgentState {
  const state: AgentState = {
    status: 'running',
    task: '',
    startTime: 0,
    iterations: 0,
    toolCalls: {
      total: 0,
      successful: 0,
      failed: 0,
      byTool: {}
    },
    variables: {},
    errors: []
  };

  for (const event of events) {
    switch (event.type) {
      case 'agent_started':
        state.task = event.task;
        state.startTime = event.timestamp;
        break;

      case 'tool_called':
        state.toolCalls.total++;
        state.toolCalls.byTool[event.tool] =
          (state.toolCalls.byTool[event.tool] || 0) + 1;
        break;

      case 'tool_result':
        if (event.success) {
          state.toolCalls.successful++;
        } else {
          state.toolCalls.failed++;
        }
        break;

      case 'state_changed':
        state.variables[event.key] = event.newValue;
        break;

      case 'agent_completed':
        state.status = event.success ? 'completed' : 'failed';
        state.endTime = event.timestamp;
        state.iterations = event.totalIterations;
        state.result = event.result;
        break;

      case 'error_occurred':
        state.errors.push(event.error);
        if (!event.recoverable) {
          state.status = 'failed';
        }
        break;
    }
  }

  return state;
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/**
 * Example: Agent loop with event sourcing.
 *
 * This demonstrates how to integrate event sourcing into an agent.
 * See example/index.ts for a full working implementation.
 */
async function agentWithEventSourcing(
  task: string,
  eventStore: EventStore
): Promise<AgentState> {
  // Load existing events (if persisting to disk)
  await eventStore.load();

  // Record agent start
  await eventStore.append({
    type: 'agent_started',
    task,
    tools: ['read_file', 'done']
  });

  // Simulate agent activity
  const toolCallId = 'call-001';

  await eventStore.append({
    type: 'tool_called',
    toolCallId,
    tool: 'read_file',
    arguments: { path: './example.txt' }
  });

  await eventStore.append({
    type: 'tool_result',
    toolCallId,
    tool: 'read_file',
    result: 'File contents here',
    success: true,
    durationMs: 50
  });

  await eventStore.append({
    type: 'state_changed',
    key: 'currentFile',
    oldValue: null,
    newValue: './example.txt'
  });

  // Record completion
  await eventStore.append({
    type: 'agent_completed',
    result: 'Successfully read the file',
    success: true,
    totalIterations: 2,
    totalDurationMs: 100
  });

  // Derive current state from all events
  return deriveState(eventStore.all());
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  EventStore,
  deriveState,
  agentWithEventSourcing,
  // Event types
  AgentEvent,
  AgentStartedEvent,
  ToolCalledEvent,
  ToolResultEvent,
  StateChangedEvent,
  AgentCompletedEvent,
  ErrorOccurredEvent,
  // State type
  AgentState
};
