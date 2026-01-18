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

> Validation catches errors. Quality catches slop. You can't inspect your way to good code.

### Where this came from

[Joseph Juran](https://www.juran.com/blog/the-juran-trilogy-2/ "The Quality Trilogy (1986)") drew the distinction in 1986. There are two kinds of problems: **sporadic spikes** (sudden errors, caught by control) and **chronic waste** (structural problems, requiring improvement). Validation catches the spikes. Quality addresses the waste.

[W. Edwards Deming](https://asq.org/quality-resources/tqm/deming-points "Deming's 14 Points") said it plainly in Point 3: *"Cease dependence on inspection to achieve quality."* Inspection is too late. The quality, good or bad, is already in the product.

### The distinction

| Type | Question | Catches |
| --- | --- | --- |
| Verification | Did we build it right? | Malformed JSON, type errors |
| Validation | Did we build the right thing? | Unauthorized actions, policy violations |
| Quality | Should we have built it this way? | 500 lines for a 20-line task |

[Barry Boehm](https://en.wikipedia.org/wiki/Software_verification_and_validation "Software V&V (1972)") named this in 1972. Most agent frameworks stop at validation. Production systems need all three.

### The asymmetry problem

An agent generates code in minutes. A human reviews it in hours. This asymmetry compounds:

> "Only 3.4% of developers report both low hallucination rates AND high confidence in shipping AI code without human review."
> — Qodo, *State of AI Code Quality* (2025)

If review time exceeds generation time by 10x, you don't have an efficiency gain. You have a bottleneck that happens to produce a lot of output.

### Quality workers

In orchestration (Section 08), add independent quality review. Workers implement. Quality workers verify.

`quality-workers.ts`

```typescript
// Quality workers: independent review in orchestration
async function coordinator(task) {
  const subtasks = analyze(task);

  const results = await Promise.all(
    subtasks.map(async (subtask) => {
      // Implementation worker
      const worker = selectWorker(subtask);
      const result = await worker.execute(subtask);

      // Quality worker (independent)
      const reviewer = selectQualityWorker(subtask);
      const review = await reviewer.assess(result, subtask);

      if (!review.acceptable) {
        return worker.revise(result, review.findings);
      }
      return result;
    })
  );

  return combine(results);
}
```

The quality worker is not the same as the implementation worker. Different prompt, different role, different incentives.

### Four eyes principle

For high-risk outputs, require two independent assessments before action. This comes from banking and regulated industries where single points of failure cause disasters.

`four-eyes.ts`

```typescript
// Four eyes: dual control for high-risk actions
async function executeWithDualControl(
  action: Action,
  context: Context
): Promise<Result> {
  if (!isHighRisk(action)) {
    return execute(action);
  }

  // First assessment
  const review1 = await assessRisk(action, context);

  // Second assessment (independent)
  const review2 = await assessRisk(action, {
    ...context,
    priorAssessment: null, // Don't bias second reviewer
  });

  // Both must approve
  if (review1.approved && review2.approved) {
    return execute(action);
  }

  return {
    blocked: true,
    reasons: [...review1.concerns, ...review2.concerns],
  };
}
```

### ALCOA: Traceability for agent decisions

The pharmaceutical industry uses [ALCOA principles](https://www.quanticate.com/blog/alcoa-principles "ALCOA Data Integrity") for data integrity. Every decision must be:

- **Attributable**: Who (or what) made this decision?
- **Legible**: Can we read and understand it?
- **Contemporaneous**: Recorded when it happened, not reconstructed later
- **Original**: The first recording, not a copy
- **Accurate**: Reflects what actually occurred

`alcoa.ts`

```typescript
// ALCOA-compliant action record
interface AuditableAction {
  // Attributable
  actor: {
    type: 'agent' | 'human' | 'system';
    id: string;
    model?: string; // For agents: which model version
  };

  // Legible
  action: {
    type: string;
    description: string; // Human-readable
    parameters: Record<string, unknown>;
  };

  // Contemporaneous
  timestamp: {
    initiated: Date;
    completed: Date;
  };

  // Original
  id: string; // Immutable identifier
  sequence: number; // Order in event log

  // Accurate
  outcome: {
    success: boolean;
    result?: unknown;
    error?: string;
  };
  checksums: {
    input: string;
    output: string;
  };
}
```

### Chronic waste metrics

Track quality over time. These metrics surface chronic waste that validation misses:

- **Code churn**: Percentage rewritten within 2 weeks. High churn means the first output wasn't right.
- **Proportionality**: Actual lines vs. expected lines. 500 lines for a 20-line task is a quality problem.
- **Review time ratio**: Hours to review vs. minutes to generate. If this exceeds 10:1, the agent creates more work than it saves.
- **Defect escape rate**: Issues found after merge vs. before. Quality catches problems early.

`quality-metrics.ts`

```typescript
// Quality metrics: track chronic waste
interface QualityMetrics {
  // Code churn: rewrites indicate poor initial quality
  churn: {
    linesChanged: number;
    linesTotal: number;
    withinDays: number;
    rate: number; // linesChanged / linesTotal
  };

  // Proportionality: output size vs expected
  proportionality: {
    actualLines: number;
    expectedLines: number;
    ratio: number; // actual / expected
  };

  // Review burden: human time vs machine time
  reviewBurden: {
    generationMinutes: number;
    reviewMinutes: number;
    ratio: number; // review / generation
  };

  // Defect escape: issues found late
  defectEscape: {
    foundBeforeMerge: number;
    foundAfterMerge: number;
    escapeRate: number; // after / (before + after)
  };
}

function assessQualityHealth(metrics: QualityMetrics): QualityAssessment {
  const concerns: string[] = [];

  if (metrics.churn.rate > 0.3) {
    concerns.push('High code churn suggests poor initial output');
  }
  if (metrics.proportionality.ratio > 5) {
    concerns.push('Output significantly larger than expected');
  }
  if (metrics.reviewBurden.ratio > 10) {
    concerns.push('Review time exceeds generation time by 10x');
  }
  if (metrics.defectEscape.escapeRate > 0.2) {
    concerns.push('Too many defects escaping to production');
  }

  return {
    healthy: concerns.length === 0,
    concerns,
  };
}
```

### The Toyota principle

[Toyota's production system](https://www.6sigma.us/manufacturing/jidoka-toyota-production-system/ "Jidoka") gives every worker the authority to stop the line when they see a defect. This is called **jidoka**: automation with a human touch.

For agents: any quality check that fails should stop the pipeline. Don't let bad output accumulate downstream hoping someone will catch it later.

```typescript
// Jidoka: stop the line on quality failure
if (!qualityCheck.passed) {
  throw new QualityStop({
    reason: qualityCheck.findings,
    action: 'Review required before continuing',
  });
}
```

The point isn't to slow things down. The point is that fixing problems at the source is cheaper than fixing them downstream.

## 10. Complete example

> All of it together in one working system.

### The stack

1. **CLI:** Parse arguments, load config, wire things up
2. **Ops:** Retry logic, circuit breakers, rate limits
3. **Security:** Trifecta checks, sandboxing, input sanitization
4. **Quality:** Chronic waste detection, proportionality checks
5. **Agent:** The loop, tools, verification, state

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

  // Verify it (Section 03)
  const verified = await this.verifyResponse(response);

  // Run it
  const results = await this.executeTools(verified.toolCalls);

  // Assess quality (Section 09)
  const quality = await this.assessQuality(results, this.context);
  if (!quality.acceptable) {
    // Jidoka: stop the line
    await this.handleQualityFailure(quality);
    continue;
  }

  // Record it (events, ALCOA-compliant)
  this.updateState(results, quality);
}

// That's the architecture.
// Verification catches errors. Quality catches waste.
```

The loop is the architecture. Everything else is infrastructure.

---

*The loop is the architecture. Everything else is infrastructure.*