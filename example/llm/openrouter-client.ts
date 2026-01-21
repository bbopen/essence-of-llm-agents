/**
 * OpenRouter LLM Client
 *
 * Uses the OpenAI SDK with OpenRouter's API endpoint.
 * OpenRouter provides access to multiple models through a single API.
 */

import OpenAI from 'openai';
import type { Message, Tool, LLMClient, LLMResponse, ToolCall } from '../../patterns/types.js';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor(config: OpenRouterConfig) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      defaultHeaders: {
        'HTTP-Referer': config.siteUrl ?? 'https://github.com/bbopen/essence-of-llm-agents',
        'X-Title': config.siteName ?? 'Smart Purchase Advisor Example',
      },
    });
    this.model = config.model ?? 'anthropic/claude-sonnet-4';
  }

  async invoke(messages: Message[], tools: Tool[]): Promise<LLMResponse> {
    // Convert our Message format to OpenAI format
    const openaiMessages = messages.map(msg => this.convertMessage(msg));

    // Convert our Tool format to OpenAI format
    const openaiTools = tools.map(tool => this.convertTool(tool));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    return this.convertResponse(response, tools);
  }

  private convertMessage(msg: Message): OpenAI.ChatCompletionMessageParam {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.tool_call_id ?? '',
      };
    }

    if (msg.role === 'assistant') {
      // Include tool_calls if present
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: 'assistant',
        content: msg.content,
      };
    }

    return {
      role: msg.role as 'user' | 'system',
      content: msg.content,
    };
  }

  private convertTool(tool: Tool): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    };
  }

  private convertResponse(
    response: OpenAI.ChatCompletion,
    _tools: Tool[]
  ): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;

    // Extract tool calls - pass through all of them including 'done'
    // The done tool will throw TaskComplete when executed (Pattern 3.2)
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return {
      content: message.content ?? '',
      toolCalls,
      done: false, // Termination happens via TaskComplete exception, not this flag
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      } : undefined,
    };
  }
}

/**
 * Create an OpenRouter client from environment variables
 */
export function createOpenRouterClient(): OpenRouterClient {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY not set. Copy .env.local.example to .env.local and add your key.'
    );
  }

  return new OpenRouterClient({
    apiKey,
    model: process.env.OPENROUTER_MODEL,
  });
}
