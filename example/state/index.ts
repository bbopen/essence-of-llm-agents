/**
 * State Management Module
 *
 * Exports event sourcing utilities for the Purchase Advisor.
 */

export {
  EventStore,
  deriveState,
  type AgentEvent,
  type AgentStartedEvent,
  type ToolCalledEvent,
  type ToolResultEvent,
  type StateChangedEvent,
  type AgentCompletedEvent,
  type ErrorOccurredEvent,
  type AgentState,
} from './event-store.js';
