/**
 * Pattern 6.1: Retry with Exponential Backoff
 *
 * Transient failures are normal. Retry with increasing delays and
 * jitter to prevent thundering herd.
 *
 * Derived from: Netflix, AWS reliability patterns
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;  // 0-1, amount of randomness
}

const defaultConfig: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2
};

// Calculate delay with exponential backoff and jitter
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  // Exponential: base * 2^attempt
  const exponential = config.baseDelayMs * Math.pow(2, attempt);

  // Cap at max
  const capped = Math.min(exponential, config.maxDelayMs);

  // Add jitter: +/- jitterFactor
  const jitter = capped * config.jitterFactor * (Math.random() * 2 - 1);

  return Math.max(0, capped + jitter);
}

// Determine if error is retryable
function isRetryable(error: Error): boolean {
  const retryablePatterns = [
    /timeout/i,
    /ECONNRESET/,
    /ETIMEDOUT/,
    /rate.?limit/i,
    /429/,
    /503/,
    /502/,
    /504/,
    /overloaded/i,
    /temporarily unavailable/i
  ];

  const message = error.message || '';
  return retryablePatterns.some(pattern => pattern.test(message));
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry wrapper
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = defaultConfig
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry non-retryable errors
      if (!isRetryable(lastError)) {
        throw lastError;
      }

      // Don't delay after last attempt
      if (attempt < config.maxAttempts - 1) {
        const delay = calculateDelay(attempt, config);
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// Example: LLM call with retry
interface LLMResponse {
  content: string;
}

async function callLLMWithRetry(
  prompt: string,
  llm: { invoke: (prompt: string) => Promise<LLMResponse> }
): Promise<LLMResponse> {
  return withRetry(
    () => llm.invoke(prompt),
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      jitterFactor: 0.1
    }
  );
}

export {
  withRetry,
  calculateDelay,
  isRetryable,
  callLLMWithRetry,
  defaultConfig,
  RetryConfig
};
