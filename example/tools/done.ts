/**
 * Done Tool - Explicit Termination
 *
 * Signals that the agent has completed its task.
 * The result should contain the final recommendation/output.
 *
 * IMPLEMENTS:
 *   Pattern 3.2 (Explicit Termination) - Agent signals completion via exception
 *   @see ../../patterns/05-explicit-termination.ts
 *
 * HOW IT WORKS:
 *   The done tool throws a TaskComplete exception when executed.
 *   The agent loop catches this exception and returns the result cleanly.
 *   This mirrors the scaffolding's approach exactly.
 *
 * USAGE:
 *   The agent calls this tool when it has gathered enough information
 *   to make a recommendation. The result is a JSON object with:
 *   - recommendation: product ID (e.g., "laptop-001")
 *   - reasoning: why this product was chosen
 *   - confidence: 0-1 score
 *   - alternatives: other options to consider
 */

import type { Tool } from '../../patterns/types.js';
import { TaskComplete } from '../../patterns/index.js';

export const doneTool: Tool = {
  name: 'done',
  description:
    'Signal that the task is complete and provide the final result. ' +
    'Call this when you have gathered enough information to make a recommendation. ' +
    'The result should be a JSON object with: recommendation (product ID), ' +
    'reasoning (why this product), and optionally alternatives.',
  parameters: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description:
          'Final result as JSON with keys: recommendation (product ID), ' +
          'reasoning (explanation), confidence (0-1), alternatives (array of {id, reason})',
      },
    },
    required: ['result'],
  },

  execute: async (args): Promise<string> => {
    const result = args.result as string;
    // Throw TaskComplete to signal termination (Pattern 3.2)
    // The agent loop catches this and returns cleanly.
    throw new TaskComplete(result);
  },
};

/**
 * Expected result format from the done tool
 */
export interface RecommendationResult {
  recommendation: string; // Product ID
  reasoning: string; // Why this product
  confidence: number; // 0-1 confidence score
  alternatives?: Array<{
    id: string;
    reason: string;
  }>;
}

/**
 * Parse and validate the result from done tool
 */
export function parseRecommendation(result: string): RecommendationResult | null {
  try {
    const parsed = JSON.parse(result);

    if (!parsed.recommendation || !parsed.reasoning) {
      console.warn('Invalid recommendation format: missing required fields');
      return null;
    }

    return {
      recommendation: parsed.recommendation,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence ?? 0.5,
      alternatives: parsed.alternatives,
    };
  } catch (error) {
    console.warn('Failed to parse recommendation:', error);
    return null;
  }
}
