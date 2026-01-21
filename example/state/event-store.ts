/**
 * Event Store for Purchase Advisor
 *
 * Implements Pattern 4.2 (Event-Sourced State) from the guide.
 * Records all agent activity as an append-only event log.
 *
 * Benefits:
 * - Full audit trail of agent decisions
 * - State can be reconstructed from events
 * - Debugging: see exactly what happened and when
 * - Analytics: track tool usage, success rates, timing
 *
 * @see patterns/08-event-sourced-state.ts
 */

import { promises as fs } from 'fs';

// =============================================================================
// EVENT TYPES
// =============================================================================

interface BaseEvent {
  type: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentStartedEvent extends BaseEvent {
  type: 'agent_started';
  task: string;
  tools: string[];
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

export interface AgentCompletedEvent extends BaseEvent {
  type: 'agent_completed';
  result: string;
  success: boolean;
  totalIterations: number;
  totalDurationMs: number;
}

export interface ErrorOccurredEvent extends BaseEvent {
  type: 'error_occurred';
  error: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

export type AgentEvent =
  | AgentStartedEvent
  | ToolCalledEvent
  | ToolResultEvent
  | StateChangedEvent
  | AgentCompletedEvent
  | ErrorOccurredEvent;

// =============================================================================
// AGENT STATE (derived from events)
// =============================================================================

export interface AgentState {
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
 * This is the "fold" operation in event sourcing.
 */
export function deriveState(events: AgentEvent[]): AgentState {
  const state: AgentState = {
    status: 'running',
    task: '',
    startTime: 0,
    iterations: 0,
    toolCalls: {
      total: 0,
      successful: 0,
      failed: 0,
      byTool: {},
    },
    variables: {},
    errors: [],
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
// EVENT STORE
// =============================================================================

/**
 * Append-only event store with optional persistence.
 *
 * Usage:
 *   const store = new EventStore('./events.jsonl');
 *   await store.append({ type: 'agent_started', task: '...' });
 *   const state = deriveState(store.all());
 */
export class EventStore {
  private events: AgentEvent[] = [];
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
  }

  /**
   * Append an event to the store.
   * Timestamp is added automatically.
   *
   * Note: We accept a partial event type because TypeScript's Omit on union types
   * doesn't narrow properly. The 'type' field discriminates at runtime.
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
      timestamp: Date.now(),
    } as AgentEvent;

    this.events.push(fullEvent);

    if (this.persistPath) {
      await this.persist();
    }
  }

  /**
   * Get all events.
   */
  all(): AgentEvent[] {
    return [...this.events];
  }

  /**
   * Filter events by type.
   */
  filter<T extends AgentEvent>(type: T['type']): T[] {
    return this.events.filter((e) => e.type === type) as T[];
  }

  /**
   * Get events since a timestamp.
   */
  since(timestamp: number): AgentEvent[] {
    return this.events.filter((e) => e.timestamp > timestamp);
  }

  /**
   * Get the derived state.
   */
  getState(): AgentState {
    return deriveState(this.events);
  }

  /**
   * Persist events to disk (JSON Lines format).
   */
  async persist(): Promise<void> {
    if (!this.persistPath) return;
    const lines = this.events.map((e) => JSON.stringify(e)).join('\n');
    await fs.writeFile(this.persistPath, lines);
  }

  /**
   * Load events from disk.
   */
  async load(): Promise<void> {
    if (!this.persistPath) return;
    try {
      const content = await fs.readFile(this.persistPath, 'utf-8');
      this.events = content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    } catch {
      // File doesn't exist yet - start fresh
    }
  }

  /**
   * Clear all events (useful for testing).
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get summary statistics.
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
