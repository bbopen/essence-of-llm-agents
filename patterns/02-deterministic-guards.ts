/**
 * Pattern 1.2: Deterministic Guards
 *
 * Wrap stochastic LLM with deterministic validation. Your code owns
 * the loop behavior, not the LLM. You can't unit test stochastic
 * behavior - keep validation deterministic.
 *
 * Derived from: Production evidence (60-70% LLM reliability vs 99.99% business need)
 *
 * WHY THIS PATTERN:
 * - LLMs are stochastic: same input → different outputs
 * - Business requirements demand predictability (99.99% reliability)
 * - Solution: deterministic code wraps unpredictable LLM
 * - Guards are testable; LLM behavior is not
 *
 * KEY INSIGHT:
 * Every guard is code you can unit test. If the LLM hallucinates
 * a dangerous action, your guards catch it deterministically.
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

import type { Action, Policy, Budget, GuardResult } from './types.js';

/**
 * Guard: Validate action structure
 *
 * This guard ensures the LLM produced a well-formed action.
 * Catches malformed JSON, missing fields, wrong types.
 */
function isValidAction(action: Action): GuardResult {
  if (!action.type || typeof action.type !== 'string') {
    return { allowed: false, reason: 'Missing or invalid action type' };
  }
  if (action.parameters && typeof action.parameters !== 'object') {
    return { allowed: false, reason: 'Parameters must be an object' };
  }
  return { allowed: true };
}

/**
 * Guard: Check policy compliance
 *
 * This guard enforces business rules: what actions are allowed,
 * what targets are forbidden, what requires human approval.
 */
function isPolicyCompliant(action: Action, policy: Policy): GuardResult {
  // Check if tool is completely blocked
  if (policy.blockedTools.includes(action.type)) {
    return { allowed: false, reason: `Action ${action.type} is blocked by policy` };
  }

  // Check for blocked patterns in arguments
  const argsString = JSON.stringify(action.parameters || {});
  for (const pattern of policy.blockedPatterns) {
    if (pattern.test(argsString)) {
      return { allowed: false, reason: 'Arguments contain blocked pattern' };
    }
  }

  // Check if action requires human confirmation
  if (policy.requiresConfirmation.includes(action.type)) {
    return {
      allowed: true,
      requiresConfirmation: true,
      reason: `Action ${action.type} requires human approval`
    };
  }

  return { allowed: true };
}

/**
 * Guard: Budget enforcement
 *
 * This guard prevents runaway costs. LLMs can loop indefinitely
 * or make excessive API calls. Budget guards are your circuit breaker.
 */
function checkBudget(budget: Budget): GuardResult {
  if (budget.usedTokens >= budget.maxTokens) {
    return { allowed: false, reason: 'Token budget exhausted', override: true };
  }
  if (budget.usedApiCalls >= budget.maxApiCalls) {
    return { allowed: false, reason: 'API call budget exhausted', override: true };
  }
  if (budget.maxTimeMs && budget.startTime) {
    const elapsed = Date.now() - budget.startTime;
    if (elapsed >= budget.maxTimeMs) {
      return { allowed: false, reason: 'Time budget exhausted', override: true };
    }
  }
  return { allowed: true };
}

/**
 * Composite guard: Run all guards in sequence
 *
 * Guards are checked in order of priority:
 * 1. Budget (fail fast on resource exhaustion)
 * 2. Validation (reject malformed actions)
 * 3. Policy (enforce business rules)
 */
function runGuards(
  action: Action,
  policy: Policy,
  budget: Budget
): GuardResult {
  // Budget check first - fail fast on exhaustion
  const budgetResult = checkBudget(budget);
  if (!budgetResult.allowed) return budgetResult;

  // Structural validation
  const validationResult = isValidAction(action);
  if (!validationResult.allowed) return validationResult;

  // Policy compliance
  const policyResult = isPolicyCompliant(action, policy);
  if (!policyResult.allowed) return policyResult;

  // If policy requires confirmation, propagate that
  if (policyResult.requiresConfirmation) {
    return policyResult;
  }

  return { allowed: true };
}

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/**
 * Example: Guarded agent loop
 *
 * This shows how guards integrate with the core loop (Pattern 1.1).
 * Every action passes through deterministic validation before execution.
 */
async function exampleGuardedLoop(): Promise<void> {
  // Define policy: what's allowed, what's blocked, what needs approval
  const policy: Policy = {
    blockedTools: ['delete_database', 'send_email_to_all'],
    blockedPatterns: [
      /rm\s+-rf/,           // Dangerous shell commands
      /DROP\s+TABLE/i,      // SQL injection patterns
      /password|secret/i    // Sensitive data patterns
    ],
    requiresConfirmation: ['deploy', 'publish', 'send_email'],
    maxOperations: 100
  };

  // Define budget: resource limits
  const budget: Budget = {
    maxTokens: 100000,
    maxApiCalls: 50,
    maxTimeMs: 60000,  // 1 minute
    usedTokens: 0,
    usedApiCalls: 0,
    startTime: Date.now()
  };

  // Example action from LLM
  const action: Action = {
    type: 'read_file',
    target: '/tmp/data.json',
    parameters: { encoding: 'utf-8' }
  };

  // Run guards
  const result = runGuards(action, policy, budget);

  if (!result.allowed) {
    console.log(`Action blocked: ${result.reason}`);
    // Feed error back to LLM context so it can adjust
    return;
  }

  if (result.requiresConfirmation) {
    console.log(`Action requires approval: ${result.reason}`);
    // Pause for human confirmation
    return;
  }

  console.log('Action allowed - proceeding with execution');
  // Execute the action...
}

export {
  isValidAction,
  isPolicyCompliant,
  checkBudget,
  runGuards,
  exampleGuardedLoop
};

// Re-export types
export type { Action, Policy, Budget, GuardResult };
