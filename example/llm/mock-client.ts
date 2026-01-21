/**
 * Mock LLM Client for Deterministic Testing
 *
 * Returns scripted responses for predictable test scenarios.
 * Useful for:
 * - Unit testing without API calls
 * - Demonstrating the system flow
 * - Debugging tool implementations
 *
 * NOTE: Termination happens via the 'done' tool throwing TaskComplete (Pattern 3.2).
 * The mock client returns 'done' as a regular tool call, and the agent loop
 * catches the TaskComplete exception when the tool executes.
 */

import type { Message, Tool, LLMClient, LLMResponse, ToolCall } from '../../patterns/types.js';

export interface MockResponse {
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  content?: string;
}

export type MockScenario = MockResponse[];

/**
 * Pre-defined scenarios for testing
 */
export const SCENARIOS = {
  /**
   * Basic laptop search scenario
   * 1. Search for laptops under $1500
   * 2. Get reviews for top result
   * 3. Call done tool with recommendation (throws TaskComplete)
   */
  basicSearch: [
    // Step 1: Search for products
    {
      toolCalls: [
        {
          name: 'search_products',
          arguments: { query: 'laptop', maxPrice: 1500 },
        },
      ],
    },
    // Step 2: Get reviews for the top match
    {
      toolCalls: [
        {
          name: 'get_reviews',
          arguments: { productId: 'laptop-001' },
        },
      ],
    },
    // Step 3: Call done tool (will throw TaskComplete when executed)
    {
      toolCalls: [
        {
          name: 'done',
          arguments: {
            result: JSON.stringify({
              recommendation: 'laptop-001',
              reasoning: 'Best keyboard for programming, within budget',
              confidence: 0.85,
            }),
          },
        },
      ],
    },
  ] as MockScenario,

  /**
   * Multi-product comparison scenario
   */
  comparison: [
    // Search
    {
      toolCalls: [
        {
          name: 'search_products',
          arguments: { query: 'laptop programming', maxPrice: 1500 },
        },
      ],
    },
    // Compare specs
    {
      toolCalls: [
        {
          name: 'compare_specs',
          arguments: { productIds: ['laptop-001', 'laptop-007', 'laptop-003'] },
        },
      ],
    },
    // Get reviews for top 2
    {
      toolCalls: [
        { name: 'get_reviews', arguments: { productId: 'laptop-001' } },
        { name: 'get_reviews', arguments: { productId: 'laptop-003' } },
      ],
    },
    // Call done tool (will throw TaskComplete when executed)
    {
      toolCalls: [
        {
          name: 'done',
          arguments: {
            result: JSON.stringify({
              recommendation: 'laptop-003',
              alternative: 'laptop-001',
              reasoning: 'MacBook Air M3 offers best value. ThinkPad X1 for keyboard preference.',
              confidence: 0.9,
            }),
          },
        },
      ],
    },
  ] as MockScenario,
} as const;

export class MockLLMClient implements LLMClient {
  private scenario: MockScenario;
  private step: number = 0;
  private callLog: Array<{ messages: Message[]; response: LLMResponse }> = [];

  constructor(scenario: MockScenario = SCENARIOS.basicSearch) {
    this.scenario = scenario;
  }

  async invoke(messages: Message[], _tools: Tool[]): Promise<LLMResponse> {
    if (this.step >= this.scenario.length) {
      // Scenario exhausted - return a done tool call as fallback
      // This will throw TaskComplete when executed
      return {
        content: '',
        toolCalls: [{
          id: 'mock-fallback-done',
          name: 'done',
          arguments: { result: JSON.stringify({ recommendation: 'none', reasoning: 'Scenario exhausted' }) },
        }],
        done: false, // Termination happens via TaskComplete exception
      };
    }

    const mockResponse = this.scenario[this.step];
    this.step++;

    const response: LLMResponse = {
      content: mockResponse.content ?? '',
      toolCalls: (mockResponse.toolCalls ?? []).map((tc, i) => ({
        id: `mock-${this.step}-${i}`,
        name: tc.name,
        arguments: tc.arguments,
      })),
      done: false, // Termination happens via TaskComplete exception, not this flag
      usage: {
        prompt_tokens: messages.reduce((sum, m) => sum + m.content.length / 4, 0),
        completion_tokens: 100,
        total_tokens: 0, // Will be calculated
      },
    };

    if (response.usage) {
      response.usage.total_tokens =
        response.usage.prompt_tokens + response.usage.completion_tokens;
    }

    this.callLog.push({ messages: [...messages], response });
    return response;
  }

  /**
   * Get the log of all LLM calls for debugging
   */
  getCallLog() {
    return this.callLog;
  }

  /**
   * Reset the mock to start over
   */
  reset() {
    this.step = 0;
    this.callLog = [];
  }

  /**
   * Set a new scenario
   */
  setScenario(scenario: MockScenario) {
    this.scenario = scenario;
    this.reset();
  }
}

/**
 * Create a mock client based on environment
 */
export function createMockClient(
  scenarioName: keyof typeof SCENARIOS = 'basicSearch'
): MockLLMClient {
  return new MockLLMClient(SCENARIOS[scenarioName]);
}
