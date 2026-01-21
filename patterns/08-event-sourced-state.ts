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

// Event types
interface BaseEvent {
  type: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface ToolCalledEvent extends BaseEvent {
  type: 'tool_called';
  tool: string;
  arguments: Record<string, unknown>;
}

interface ToolResultEvent extends BaseEvent {
  type: 'tool_result';
  tool: string;
  result: string;
  success: boolean;
}

interface StateChangedEvent extends BaseEvent {
  type: 'state_changed';
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

interface ErrorOccurredEvent extends BaseEvent {
  type: 'error_occurred';
  error: string;
  stack?: string;
}

type AgentEvent = ToolCalledEvent | ToolResultEvent | StateChangedEvent | ErrorOccurredEvent;

// Event Store - append-only log
class EventStore {
  private events: AgentEvent[] = [];
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
  }

  async append(event: Omit<AgentEvent, 'timestamp'>): Promise<void> {
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
}

// Derive current state from events
interface AgentState {
  toolCalls: number;
  successfulCalls: number;
  failedCalls: number;
  errors: string[];
  lastActivity: number;
  variables: Record<string, unknown>;
}

function deriveState(events: AgentEvent[]): AgentState {
  const state: AgentState = {
    toolCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    errors: [],
    lastActivity: 0,
    variables: {}
  };

  for (const event of events) {
    state.lastActivity = Math.max(state.lastActivity, event.timestamp);

    switch (event.type) {
      case 'tool_called':
        state.toolCalls++;
        break;
      case 'tool_result':
        if (event.success) {
          state.successfulCalls++;
        } else {
          state.failedCalls++;
        }
        break;
      case 'state_changed':
        state.variables[event.key] = event.newValue;
        break;
      case 'error_occurred':
        state.errors.push(event.error);
        break;
    }
  }

  return state;
}

// Example: Agent loop with event sourcing
async function agentWithEventSourcing(
  task: string,
  eventStore: EventStore
): Promise<AgentState> {
  // Load existing events
  await eventStore.load();

  // Simulate some agent activity
  await eventStore.append({
    type: 'tool_called',
    tool: 'read_file',
    arguments: { path: './example.txt' }
  });

  await eventStore.append({
    type: 'tool_result',
    tool: 'read_file',
    result: 'File contents here',
    success: true
  });

  await eventStore.append({
    type: 'state_changed',
    key: 'currentFile',
    oldValue: null,
    newValue: './example.txt'
  });

  // Derive current state from all events
  return deriveState(eventStore.all());
}

export {
  EventStore,
  deriveState,
  agentWithEventSourcing,
  AgentEvent,
  ToolCalledEvent,
  ToolResultEvent,
  StateChangedEvent,
  ErrorOccurredEvent,
  AgentState
};
