/**
 * Pattern 5.1: Lethal Trifecta Assessment
 *
 * Identify and break the combination of:
 * - Private Data (database, secrets, user data)
 * - Untrusted Input (user input, web content, emails)
 * - External Actions (code exec, network, file write)
 *
 * Any two are manageable. All three together create systemic risk.
 *
 * Derived from: Willison (prompt injection), Schneier (OODA analysis)
 *
 * WHY THIS PATTERN:
 * - Prompt injection becomes devastating only with all three present
 * - Private Data alone: safe (nothing can access it maliciously)
 * - Untrusted Input alone: safe (nothing to steal, nothing to corrupt)
 * - External Actions alone: safe (no data to exfiltrate, no injection vector)
 * - Any two: manageable with proper controls
 * - ALL THREE: attacker can inject commands that access secrets and exfiltrate
 *
 * THE INSIGHT:
 * You don't need to solve prompt injection completely.
 * You need to ensure the trifecta never forms.
 * Breaking ANY leg makes the system safe.
 *
 * EXAMPLES:
 * - Email agent with send capability: ALL THREE → Critical risk
 * - Read-only data viewer: Only Private Data → Low risk
 * - Calculator bot: Only External Actions → Low risk
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

/**
 * Assessment of the three risk factors
 */
interface TrifectaAssessment {
  hasPrivateData: boolean;     // Database access, secrets, user data
  hasUntrustedInput: boolean;  // User input, web content, emails
  hasExternalActions: boolean; // Code exec, network calls, file writes
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Assess risk based on trifecta presence
 *
 * Risk escalates with each leg present:
 * - 0-1 legs: Low risk
 * - 2 legs: Medium risk (requires monitoring)
 * - 3 legs: Critical risk (must break one leg)
 */
function assessRisk(assessment: TrifectaAssessment): RiskLevel {
  const count = [
    assessment.hasPrivateData,
    assessment.hasUntrustedInput,
    assessment.hasExternalActions
  ].filter(Boolean).length;

  switch (count) {
    case 0: return 'low';
    case 1: return 'low';
    case 2: return 'medium';
    case 3: return 'critical';  // The lethal trifecta
    default: return 'low';
  }
}

/**
 * Mitigation recommendation structure
 */
interface Mitigation {
  action: string;
  priority: 'required' | 'recommended' | 'optional';
  description: string;
  breaksLeg?: 'privateData' | 'untrustedInput' | 'externalActions';
}

/**
 * Recommend mitigations based on assessment
 *
 * For each pair of legs, specific mitigations apply.
 * If all three are present, breaking one leg is mandatory.
 */
function recommendMitigations(assessment: TrifectaAssessment): Mitigation[] {
  const mitigations: Mitigation[] = [];

  // Private Data + Untrusted Input: Data isolation
  if (assessment.hasPrivateData && assessment.hasUntrustedInput) {
    mitigations.push({
      action: 'isolate_data',
      priority: 'required',
      description: 'Isolate private data from untrusted input processing',
      breaksLeg: 'privateData'
    });
  }

  // Untrusted Input + External Actions: Sandbox
  if (assessment.hasUntrustedInput && assessment.hasExternalActions) {
    mitigations.push({
      action: 'sandbox_actions',
      priority: 'required',
      description: 'Sandbox all external actions when processing untrusted input',
      breaksLeg: 'externalActions'
    });
  }

  // Private Data + External Actions: Audit trail
  if (assessment.hasPrivateData && assessment.hasExternalActions) {
    mitigations.push({
      action: 'audit_actions',
      priority: 'required',
      description: 'Audit all external actions that could expose private data'
    });
  }

  // CRITICAL: All three present - must break one leg
  if (assessment.hasPrivateData &&
      assessment.hasUntrustedInput &&
      assessment.hasExternalActions) {
    mitigations.unshift({
      action: 'break_trifecta',
      priority: 'required',
      description: 'CRITICAL: Must eliminate at least one leg of the trifecta. Options: ' +
        '(1) Remove private data access, (2) Sanitize all input, (3) Remove external action capability'
    });
  }

  return mitigations;
}

/**
 * Runtime policy enforcer
 *
 * Use this in your agent loop to block actions that would
 * complete the trifecta.
 */
interface AgentContext {
  hasPrivateData: boolean;
  hasUntrustedInput: boolean;
  requestedAction: 'read' | 'write' | 'execute' | 'network';
}

function enforcePolicy(context: AgentContext): { allowed: boolean; reason?: string } {
  const assessment: TrifectaAssessment = {
    hasPrivateData: context.hasPrivateData,
    hasUntrustedInput: context.hasUntrustedInput,
    hasExternalActions: ['write', 'execute', 'network'].includes(context.requestedAction)
  };

  const risk = assessRisk(assessment);

  if (risk === 'critical') {
    return {
      allowed: false,
      reason: 'Action blocked: lethal trifecta detected ' +
        '(private data + untrusted input + external action). ' +
        'This combination allows prompt injection to exfiltrate data.'
    };
  }

  return { allowed: true };
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/**
 * Example 1: Email agent assessment
 *
 * An email agent with full capabilities represents maximum risk.
 * Breaking one leg is mandatory before deployment.
 */
function assessEmailAgent(): void {
  const assessment: TrifectaAssessment = {
    hasPrivateData: true,      // Access to email content, contacts
    hasUntrustedInput: true,   // Emails from external senders
    hasExternalActions: true   // Can send emails, access URLs
  };

  const risk = assessRisk(assessment);
  const mitigations = recommendMitigations(assessment);

  console.log(`Email Agent Risk: ${risk}`);
  console.log('Required Mitigations:');
  for (const m of mitigations.filter(m => m.priority === 'required')) {
    console.log(`  - ${m.action}: ${m.description}`);
  }

  // Output:
  // Email Agent Risk: critical
  // Required Mitigations:
  //   - break_trifecta: CRITICAL: Must eliminate at least one leg...
  //   - isolate_data: Isolate private data from untrusted input processing
  //   - sandbox_actions: Sandbox all external actions...
}

/**
 * Example 2: Safe email agent design
 *
 * By removing external actions (read-only), we break the trifecta.
 */
function assessReadOnlyEmailAgent(): void {
  const assessment: TrifectaAssessment = {
    hasPrivateData: true,      // Still has access to emails
    hasUntrustedInput: true,   // Still processes external emails
    hasExternalActions: false  // REMOVED: Cannot send, only read
  };

  const risk = assessRisk(assessment);
  console.log(`Read-Only Email Agent Risk: ${risk}`);
  // Output: Read-Only Email Agent Risk: medium
  // Medium risk is manageable with proper isolation
}

/**
 * Example 3: Runtime policy enforcement
 *
 * This shows how to block dangerous actions at runtime.
 */
function runtimeEnforcementExample(): void {
  // Agent processing an external email (untrusted input)
  // and has access to contact database (private data)
  const context: AgentContext = {
    hasPrivateData: true,
    hasUntrustedInput: true,
    requestedAction: 'network'  // Wants to make HTTP request
  };

  const result = enforcePolicy(context);

  if (!result.allowed) {
    console.log(`BLOCKED: ${result.reason}`);
    // Feed this back to the LLM so it understands the constraint
  }
}

export {
  assessRisk,
  recommendMitigations,
  enforcePolicy,
  assessEmailAgent,
  assessReadOnlyEmailAgent,
  runtimeEnforcementExample,
  TrifectaAssessment,
  RiskLevel,
  Mitigation,
  AgentContext
};
