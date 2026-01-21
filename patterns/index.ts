/**
 * Production Agent Patterns
 *
 * A canonical pattern catalog for building LLM-based agents.
 * Each pattern is derived from theory (Wiener, Ashby, Brooks) and
 * validated in production systems.
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

// Shared Types (OpenAI-compatible)
export * from './types';

// Core Architecture
export * from './01-the-loop';
export * from './02-deterministic-guards';

// Context Patterns
export * from './03-ephemeral-messages';

// Tool Patterns
export * from './04-complete-action-spaces';
export * from './05-explicit-termination';
export * from './06-tool-validation';

// State Patterns
export * from './07-filesystem-memory';
export * from './08-event-sourced-state';

// Security Patterns
export * from './09-lethal-trifecta';
export * from './10-subsumption-layers';

// Resilience Patterns
export * from './11-retry-backoff';
export * from './12-circuit-breaker';

// Orchestration Patterns
export * from './13-single-level-delegation';
export * from './14-coordinator';
