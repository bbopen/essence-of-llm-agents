# Production Agent Guide

TypeScript patterns for autonomous agents. Based on dozens of research reports and theory going back to 1948.

## . 

## Someone already figured this out

We read dozens of reports, traced ideas back 80 years, and talked to people running agents in production. They all built the same thing.

[Wiener](papers/wiener-1948-cybernetics.pdf "Cybernetics: Or Control and Communication in the Animal and the Machine") described the architecture in 1948. [Ashby](papers/ashby-1956-cybernetics.pdf "An Introduction to Cybernetics") added the constraints in 1956. [Brooks](papers/brooks-1986-robust-layered.pdf "A Robust Layered Control System For A Mobile Robot") nailed the safety model in 1986. [Juran](https://www.juran.com/blog/the-juran-trilogy-2/ "The Quality Trilogy") distinguished control from improvement in 1986. The theory was done before most of us were born.

> "Stop trying to invent new frameworks. The frameworks exist."

### What we found

An agent is a `while` loop. It asks an LLM what to do, checks if that makes sense, runs the tool, and looks at what happened. Then it does that again until the task is done.

Everything else you'll read about (retries, rate limits, checkpoints, monitoring) goes around this loop. *The loop itself is maybe 50 lines of code.*

`agent.ts`

```typescript
async function agent(
  task: string,
  tools: Tool[],
  llm: LLM
): Promise<Result> {
  const messages: Message[] = [
    { role: 'user', content: task }
  ];

  while (true) {
    const response = await llm.invoke(
      messages, tools
    );

    if (response.done) {
      return response.result;
    }

    for (const call of response.toolCalls) {
      const result = await execute(call);
      messages.push({
        ...result,
        ephemeral: true
      });
    }
  }
}
```

The entire agent architecture. The stochastic part is three lines. Everything else is deterministic.

## 01. The loop

> Ask the LLM, check its answer, run the tool, see what happened. Repeat.

### Where this came from

[Norbert Wiener](papers/wiener-1948-cybernetics.pdf "Cybernetics: Or Control and Communication in the Animal and the Machine (1948)") drew feedback loops in 1948 when he was working on anti-aircraft guns. The target moves, you observe, you adjust. Control systems have looked like this ever since.

### Why everyone builds the same thing

We looked at [Claude Code](https://github.com/anthropics/claude-code "Claude Code: Agentic coding tool"), [Loom](https://github.com/ghuntley/loom "Loom: AI-powered coding agent"), [Browser-Use](https://github.com/browser-use/browser-use "Browser-Use: Browser automation for AI agents"). Different teams, different companies, different years. Same architecture.

> "An agent runs tools in a loop to achieve a goal."
> — [Simon Willison](https://simonwillison.net/2025/Sep/18/agents/ "I think 'agent' may finally have a widely enough agreed upon definition to be useful jargon now")

### Your code vs. the LLM

Your code runs the loop. Your code validates. Your code executes tools. The LLM sits inside that loop and answers one question: *"Given this situation, what should I do next?"*

`the-pattern.ts`

```typescript
// The LLM is one line.
// You own everything else.

while (!done) {
  const action = await llm.generate(context);

  if (isValid(action)) {
    const result = await execute(action);
    observe(result);
  }
}
```

Wiener drew this in 1948.

## 02. Tool design

> Give the agent more tools than you think it needs. Check what it does with them. Cut back if you have to.

### Ashby's Law

[Ross Ashby](papers/ashby-1956-cybernetics.pdf "An Introduction to Cybernetics (1956)"), 1956: *"Only variety can absorb variety."* Translation: your agent can only handle problems as complex as its tool set allows. When people say "the model is dumb," often the model just didn't have the right tools.

### The usual mistake

Teams start with a locked-down tool set. They add capabilities one by one. They hope it's enough. **This is backwards.**

Start with everything. Watch what the agent does. Restrict based on what actually goes wrong.

### Three things that matter

- **Done Tool:** Make the agent say "I'm finished" explicitly. If you just stop when there are no tool calls, agents quit when they're confused.
- **Ephemeral Results:** Browser screenshots are 50KB each. After 20 calls, you have 1MB of stale DOM. Keep only the recent ones.
- **Strict Schemas:** Tell the agent exactly what parameters you expect. Validate before execution.

`tools.ts`

```typescript
// Done tool: force explicit completion
const doneTool: Tool = {
  definition: {
    name: 'task_complete',
    description: 'Call when you are done',
  },
  execute: async (input) => {
    throw new TaskComplete(input);
  },
};

// Ephemeral: only keep the last 3
const getBrowserState: Tool = {
  definition: { /* ... */ },
  execute: async () => { /* ... */ },
  ephemeral: { keepLast: 3 },
};
```

Start generous. Restrict based on evidence.

## 03. Verification

> The LLM gets it right maybe 70% of the time. Your verification code catches the other 30%.

### Do the math

Say each step works 70% of the time. Over 10 steps:

`0.70^10 = 2.8%`

Now add verification that catches 80% of mistakes:

`0.94^10 = 53.8%`

Verification turns a useless agent into one that works half the time. Add retries and you're in business.

**Note:** This catches *sporadic* errors—malformed output, type mismatches, policy violations. It doesn't catch *chronic waste*—500 lines for a 20-line task. For that, see Section 09.

### Safety layers (Brooks, 1986)

[Rodney Brooks](papers/brooks-1986-robust-layered.pdf "A Robust Layered Control System For A Mobile Robot") built robots at MIT. His rule: lower layers override higher layers. Safety beats efficiency. Efficiency beats the goal. The goal never overrides safety.

- Layer 0: System safety. Cannot be bypassed.
- Layer 1: Resource limits.
- Layer 2: Policy checks.
- Layer 3: The actual task.

`verification.ts`

```typescript
// Lower layers always win (Brooks' subsumption)
const safetyLayers = [
  {
    level: 0,
    name: 'system_integrity',
    check: (action) => !isSystemDestructive(action),
  },
  {
    level: 1,
    name: 'resource_limits',
    check: (action, ctx) => isWithinLimits(action, ctx),
  },
  {
    level: 2,
    name: 'policy_compliance',
    check: (action, ctx) => isPolicyCompliant(action, ctx.policy),
  },
];

// Check in order. Stop at first failure.
```

## 04. State and memory

> Write things to files. Context windows fill up and cost money. Disk is cheap.

### Where memory goes

[Geoffrey Huntley](https://ghuntley.com/loop/ "Everything is a Ralph Loop") runs [Loom](https://github.com/ghuntley/loom "Loom: AI-powered coding agent"). His agents remember things by writing markdown files and making git commits. The context window starts fresh each time. Files persist forever.

> "Memory persists through filesystem, not in-context."
> — [Geoffrey Huntley](https://ghuntley.com/agent/ "How to Build a Coding Agent")

### Event sourcing

Log every action as it happens. Current state is derived from the log. This gives you:

- A complete record of what happened
- The ability to replay any point in time
- Easy debugging (run the same sequence locally)
- Recovery from crashes (pick up where you left off)

Never mutate state directly. **Append events. Compute state from events.**

`state.ts`

```typescript
// Append-only event log (event sourcing)
class EventStore {
  private events: AgentEvent[] = [];

  append(event): AgentEvent {
    const complete = {
      ...event,
      id: generateId(),
      timestamp: Date.now(),
    };
    this.events.push(complete);
    return complete;
  }

  getState(): DerivedState {
    // Replay events to get current state
    return this.events.reduce(
      reduceEvent, initialState
    );
  }
}
```

## 05. Security

> Three things together cause problems: private data, outside input, and actions that affect the world. Remove one.

### The trifecta

[Simon Willison](https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents "The Lethal Trifecta for AI Agents") named this. If your agent has:

1. Access to secrets, databases, internal systems
2. Input from users, websites, emails
3. The ability to send messages, run code, change data

Then someone can trick it into leaking your secrets or doing things you didn't authorize. **Any two of these three are fine. All three together is a problem.**

> "Prompt injection is an architectural flaw."
> — [Simon Willison](https://simonwillison.net/series/prompt-injection/ "Prompt Injection series")

### Defense in depth

Any one defense can be bypassed. Stack them: sanitize inputs, isolate capabilities, validate actions, sandbox execution, filter outputs. The attacker has to beat all of them.

`security.ts`

```typescript
// Check the trifecta
function assessTrifectaRisk(assessment) {
  const hasAll =
    assessment.privateData.present &&
    assessment.untrustedInput.present &&
    assessment.externalActions.present;

  if (!hasAll) {
    return { risk: 'low' };
  }

  // All three: you have a problem
  return {
    risk: 'critical',
    mitigations: [
      'Isolate sensitive data access',
      'Sanitize all inputs',
      'Require confirmation for actions',
    ],
  };
}
```

## 06. Evaluation

> Run the same test 50 times. Look at the distribution. Single runs tell you nothing.

### Statistics, not assertions

[R.A. Fisher](papers/fisher-1925-statistical-methods.pdf "Statistical Methods for Research Workers (1925)"), 1925: one successful experiment doesn't prove your hypothesis. One failure doesn't disprove it. You need repeated trials.

An agent that works 70% of the time will sometimes pass your test and sometimes fail it. Running it once gives you a coin flip, not an answer.

### What changes

| Old thinking | New thinking |
| --- | --- |
| Does it work? | How often does it work? |
| Pass or fail | Success rate with confidence interval |
| Fix the bug | Shift the distribution |

`evaluation.test.ts`

```typescript
// Run it many times. Look at the rate.
test('agent works >80% of the time', async () => {
  const results = await runEvaluation({
    task: 'do something',
    runs: 50,
    timeout: 30000,
  });

  expect(results.successRate).toBeGreaterThan(0.8);
  expect(results.variance).toBeLessThan(0.1);
});

// With 100 runs at 80% success:
// 95% confidence interval is [72%, 88%]
```

## 07. Operations

> The agent loop is easy. Retries, rate limits, circuit breakers, and monitoring take the real work.

### Why demos work and production fails

Your demo ran once on a good network with a responsive API. Production runs thousands of times with timeouts, rate limits, and services that go down at 3am.

> "Agents that work in demos die in production. The difference is infrastructure."

### What you need

- **Exponential Backoff:** When a call fails, wait longer before retrying. Add randomness so you don't hit the API at the same time as everyone else.
- **Circuit Breaker:** If a service fails 5 times in a row, stop calling it for a minute. Don't waste resources on something that's down.
- **Rate Limiting:** Agents can make unbounded requests. Put a ceiling on it.
- **Health Checks:** Know when things break before your users tell you.

`ops.ts`

```typescript
// Backoff with randomness (exponential backoff + jitter)
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error)) throw error;

      const base = config.baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * config.baseDelay;

      await sleep(base + jitter);
    }
  }
}
```

## 08. Orchestration

> One coordinator hands out work. Workers do the work. Workers never hand out more work.

### Why one level

Let workers spawn their own workers and you get:

- Costs that multiply at each level
- Latency that hides until everything times out at once
- Debugging that requires tracing every branch of every branch

One team let agents spawn agents. Their bill hit **$2000/day** before they noticed.

> "You talk to the foreman, not the workers."

### The pattern

A coordinator breaks down the task and assigns pieces to workers. Workers execute and return results. The coordinator combines results. That's it.

`orchestration.ts`

```typescript
// Flat: coordinator -> workers (never workers -> workers)
async function coordinator(task) {
  // Break it down
  const subtasks = analyze(task);

  // Hand out work (one level only)
  const results = await Promise.all(
    subtasks.map(async (subtask) => {
      const worker = selectWorker(subtask);
      // Workers execute. They don't delegate.
      return worker.execute(subtask);
    })
  );

  // Combine and return
  return combine(results);
}
```

## 09. Quality

> Quality isn't a layer you add. It emerges from the system.

### Deming's insight

[W. Edwards Deming](https://asq.org/quality-resources/tqm/deming-points "Deming's 14 Points") said it plainly: *"Cease dependence on inspection to achieve quality."* You can't bolt quality on at the end. The quality, good or bad, is already in the product.

The architecture in this guide IS the quality system:

- **The loop (01)**: Feedback is quality. You observe results and adjust. Wiener's whole point.
- **Verification (03)**: Brooks' safety layers catch errors before they execute.
- **State (04)**: Event sourcing gives you replay, debugging, crash recovery. That's your audit trail.
- **Evaluation (06)**: Statistical thinking. Run it 50 times, look at the distribution. Shift the distribution, not just fix bugs.

### What this doesn't catch

[Joseph Juran](https://www.juran.com/blog/the-juran-trilogy-2/ "The Quality Trilogy (1986)") distinguished **sporadic spikes** (sudden errors) from **chronic waste** (structural problems). The existing architecture handles sporadic spikes. What it doesn't automatically catch:

**Chronic waste**: The code works. Verification passes. But 500 lines for a 20-line task is still wrong.

**The asymmetry problem**: An agent generates in minutes. A human reviews in hours. If review time exceeds generation time by 10x, you don't have an efficiency gain. You have a bottleneck that happens to produce a lot of output.

### Measuring chronic waste

Track these over time:

- **Code churn**: Percentage rewritten within 2 weeks. High churn means the first output wasn't right.
- **Proportionality**: Actual lines vs. expected lines for the task.
- **Review time ratio**: Hours to review vs. minutes to generate.

These surface chronic problems that verification misses.

### Stop the line

When quality checks fail, don't continue hoping someone catches it downstream. This extends verification (03): if the output is wrong, stop.

```typescript
// Extend verification: stop on quality failure
if (metrics.proportionality.ratio > 5) {
  throw new VerificationError({
    reason: 'Output 5x larger than expected',
    action: 'Review before continuing',
  });
}
```

This isn't a new layer. It's verification applied to chronic waste, not just sporadic errors.

## 10. Complete example

> All of it together in one working system.

### The stack

1. **CLI:** Parse arguments, load config, wire things up
2. **Ops:** Retry logic, circuit breakers, rate limits
3. **Security:** Trifecta checks, sandboxing, input sanitization
4. **Agent:** The loop, tools, verification, state

### Run it

```typescript
npx ts-node run.ts "Create a hello world program"
```

### What you get

A production agent. The theory goes back to 1948. The patterns come from teams running this in production today. The code is TypeScript you can read and modify.

**Take it and make it yours.**

`complete.ts`

```typescript
// Everything together: the complete agent architecture

// The loop (Wiener, 1948)
while (this.canContinue()) {
  const response = await this.ops
    .callLlm(() => this.queryLLM());

  // Verify it (Brooks' layers)
  const verified = await this.verifyResponse(response);

  // Run it
  const results = await this.executeTools(verified.toolCalls);

  // Record it (event sourcing)
  this.updateState(results);
}

// That's the architecture.
```

The loop is the architecture. Everything else is infrastructure.

---

*The loop is the architecture. Everything else is infrastructure.*