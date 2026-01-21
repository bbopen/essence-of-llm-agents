/**
 * Production Agent Patterns
 *
 * A canonical pattern catalog for building LLM-based agents.
 * Each pattern is derived from theory (Wiener, Ashby, Brooks) and
 * validated in production systems.
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// =============================================================================
// Shared Types (OpenAI-compatible) - Export once from types.js
// =============================================================================
export type {
  Message,
  MessageRole,
  Tool,
  ToolCall,
  ToolParameters,
  ToolResult,
  LLMClient,
  LLMResponse,
  Action,
  Policy,
  Budget,
  GuardResult,
  BaseEvent,
  AgentStartedEvent,
  AgentCompletedEvent,
  ToolCalledEvent,
  ToolResultEvent,
  StateChangedEvent,
  ErrorOccurredEvent,
  AgentEvent,
  Task,
  TaskResult,
} from './types.js';

// =============================================================================
// Core Architecture
// =============================================================================
export { agent, exampleUsage } from './01-the-loop.js';
export type { AgentOptions } from './01-the-loop.js';

export {
  isValidAction,
  isPolicyCompliant,
  checkBudget,
  runGuards,
} from './02-deterministic-guards.js';

// =============================================================================
// Context Patterns
// =============================================================================
export {
  asEphemeral,
  pruneEphemeral,
  agentWithPruning,
} from './03-ephemeral-messages.js';
export type { EphemeralConfig } from './03-ephemeral-messages.js';

// =============================================================================
// Tool Patterns
// =============================================================================
export {
  completeTools,
  filterByPolicy,
  isActionAllowed,
} from './04-complete-action-spaces.js';

export {
  doneTool,
  agentWithExplicitTermination,
  TaskComplete,
} from './05-explicit-termination.js';

export {
  validate,
  executeWithValidation,
  writeFileTool,
} from './06-tool-validation.js';
export type { Schema, ValidationResult } from './06-tool-validation.js';

// =============================================================================
// State Patterns
// =============================================================================
export { FilesystemMemory, agentWithMemory } from './07-filesystem-memory.js';
export type { MemoryEntry } from './07-filesystem-memory.js';

export {
  EventStore,
  deriveState,
  agentWithEventSourcing,
} from './08-event-sourced-state.js';
export type { AgentState } from './08-event-sourced-state.js';

// =============================================================================
// Security Patterns
// =============================================================================
export {
  assessRisk,
  recommendMitigations,
  enforcePolicy,
  assessEmailAgent,
  assessReadOnlyEmailAgent,
} from './09-lethal-trifecta.js';
export type { TrifectaAssessment } from './09-lethal-trifecta.js';

export {
  LAYERS,
  safetyLayer,
  resourcesLayer,
  policyLayer,
  checkAllLayers,
  agentWithSubsumption,
} from './10-subsumption-layers.js';
export type { LayerCheck, LayerResult } from './10-subsumption-layers.js';

// =============================================================================
// Resilience Patterns
// =============================================================================
export {
  withRetry,
  calculateDelay,
  isRetryable,
  callLLMWithRetry,
} from './11-retry-backoff.js';
export type { RetryConfig } from './11-retry-backoff.js';

export { CircuitBreaker, ResilientLLMClient } from './12-circuit-breaker.js';
export type { CircuitBreakerConfig } from './12-circuit-breaker.js';

// =============================================================================
// Orchestration Patterns
// =============================================================================
export {
  MainAgent,
  SubAgent,
  codeReviewWithDelegation,
} from './13-single-level-delegation.js';

export {
  Coordinator,
  Worker,
  runCoordinatedTask,
} from './14-coordinator.js';
export type { Subtask, WorkerResult, CoordinatorResult } from './14-coordinator.js';

// =============================================================================
// Evaluation Patterns
// =============================================================================
export {
  Evaluator,
  Semaphore,
  generateReport,
  compareEvaluations,
  runEvaluation,
  stdDev,
  percentile,
  confidenceInterval95,
} from './15-evaluation.js';
export type {
  EvalConfig,
  EvalMetrics,
  EvalResult,
  RunResult,
  RunFn,
  CompareResult,
} from './15-evaluation.js';
