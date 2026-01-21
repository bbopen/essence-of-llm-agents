/**
 * LLM Client Module
 *
 * Exports both real (OpenRouter) and mock clients.
 * Use mock for testing, OpenRouter for production.
 */

export { OpenRouterClient, createOpenRouterClient } from './openrouter-client.js';
export { MockLLMClient, createMockClient, SCENARIOS } from './mock-client.js';
export type { MockResponse, MockScenario } from './mock-client.js';

import type { LLMClient } from '../../patterns/types.js';
import { createOpenRouterClient } from './openrouter-client.js';
import { createMockClient, SCENARIOS } from './mock-client.js';

/**
 * Create an LLM client based on environment
 *
 * - USE_MOCK=true: Returns mock client for testing
 * - MOCK_SCENARIO: Selects scenario (basicSearch, comparison)
 * - Otherwise: Returns OpenRouter client (requires OPENROUTER_API_KEY)
 */
export function createClient(): LLMClient {
  if (process.env.USE_MOCK === 'true') {
    const scenarioName = (process.env.MOCK_SCENARIO || 'basicSearch') as keyof typeof SCENARIOS;
    console.log(`[LLM] Using mock client with scenario: ${scenarioName}`);
    return createMockClient(scenarioName);
  }

  console.log('[LLM] Using OpenRouter client');
  return createOpenRouterClient();
}
