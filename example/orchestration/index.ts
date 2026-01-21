/**
 * Orchestration Module
 *
 * Exports coordinator/worker patterns for multi-agent orchestration.
 */

export {
  Coordinator,
  Worker,
  type Task,
  type Subtask,
  type WorkerResult,
  type CoordinatorResult,
} from './coordinator.js';
