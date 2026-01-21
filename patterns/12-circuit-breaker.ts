/**
 * Pattern 6.2: Circuit Breaker
 *
 * When a service is failing, stop calling it. Give it time to recover.
 * Prevents cascading failures and resource exhaustion.
 *
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
 *
 * Derived from: Nygard (Release It!), Netflix Hystrix
 *
 * @see https://github.com/bbopen/essence-of-llm-agents
 */

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerConfig {
  failureThreshold: number;     // Failures before opening
  successThreshold: number;     // Successes in half-open before closing
  openDurationMs: number;       // How long to stay open
}

const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 30000
};

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = defaultConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from open to half-open
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.openDurationMs) {
        this.state = 'half_open';
        this.successes = 0;
        console.log('Circuit breaker: OPEN → HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half_open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        console.log('Circuit breaker: HALF_OPEN → CLOSED');
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // Any failure in half-open goes back to open
      this.state = 'open';
      console.log('Circuit breaker: HALF_OPEN → OPEN');
    } else if (this.state === 'closed' &&
               this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      console.log('Circuit breaker: CLOSED → OPEN');
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes
    };
  }

  // Manual reset for testing or recovery
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }
}

// Example: LLM client with circuit breaker
class ResilientLLMClient {
  private breaker: CircuitBreaker;
  private llm: { invoke: (prompt: string) => Promise<string> };

  constructor(llm: { invoke: (prompt: string) => Promise<string> }) {
    this.llm = llm;
    this.breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDurationMs: 60000  // 1 minute
    });
  }

  async invoke(prompt: string): Promise<string> {
    return this.breaker.execute(() => this.llm.invoke(prompt));
  }

  getStatus(): string {
    const stats = this.breaker.getStats();
    return `Circuit: ${stats.state}, Failures: ${stats.failures}`;
  }
}

export {
  CircuitBreaker,
  ResilientLLMClient,
  defaultConfig,
  CircuitBreakerConfig,
  CircuitState
};
