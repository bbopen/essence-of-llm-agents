# Production Agent Guide

TypeScript patterns for autonomous agents. Based on dozens of research reports and theory going back to 1948.

## Someone already figured this out

We read dozens of reports, traced ideas back 80 years, and talked to people running agents in production. They all built the same thing.

[Wiener](papers/wiener-1948-cybernetics.pdf "Cybernetics: Or Control and Communication in the Animal and the Machine") described the architecture in 1948. [Ashby](papers/ashby-1956-cybernetics.pdf "An Introduction to Cybernetics") added the constraints in 1956. [Brooks](papers/brooks-1986-robust-layered.pdf "A Robust Layered Control System For A Mobile Robot") nailed the safety model in 1986. [Juran](https://www.juran.com/blog/the-juran-trilogy-2/ "The Quality Trilogy") distinguished control from improvement in 1986. The theory was done before most of us were born.

The lesson: stop trying to invent new frameworks. The frameworks exist.

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

[Yao et al.](https://arxiv.org/abs/2210.03629 "ReAct: Synergizing Reasoning and Acting in Language Models (2023)") formalized this as ReAct: Thought → Action → Observation. The thought is what the model plans to do. The action is the tool call. The observation is what came back. Then the cycle repeats. It's Wiener's loop with explicit reasoning steps.

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

This is Wiener's feedback loop, applied to LLMs.

## 02. The prompt

> The LLM is a language function approximator. It emulates reasoning through language. That's it.

### What an LLM actually does

[Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents "Effective Context Engineering for AI Agents") calls it *context engineering*, not prompt engineering. You're not crafting magic words. You're managing a finite resource: the context window.

The LLM predicts the next token based on everything before it. Reasoning emerges from this prediction at scale. Your job is to give it the right context so the next token is useful.

### The right altitude

Two failure modes:

- **Too prescriptive:** Brittle if-else logic in natural language. Breaks when reality doesn't match your script.
- **Too vague:** Not enough signal. The model guesses.

Find the middle. Specific enough to guide, flexible enough to handle variation.

`prompt-structure.ts`

```typescript
// System prompt anatomy
const systemPrompt = {
  identity: 'You are a code reviewer...',
  instructions: 'Review for bugs, security, clarity...',
  toolGuidance: 'Use read_file before suggesting changes...',
  outputFormat: 'Return JSON with severity, location, message...',
};

// The right altitude: specific outcomes, flexible methods
```

### Skills: progressive disclosure

[Claude Code](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/ "Claude Agent Skills Deep Dive") loads instructions on-demand through skills. A skill is a markdown file that injects specialized instructions when needed.

Three levels of loading (based on [Claude Code measurements](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/ "Claude Agent Skills Deep Dive")):

1. **Metadata:** Name and description. Always visible. ~100 tokens.
2. **Core instructions:** Full SKILL.md body. Loaded when Claude determines relevance. ~2,000-5,000 tokens typical.
3. **Supplementary:** Referenced files, scripts. Loaded only as needed. Unbounded.

This is progressive disclosure applied to prompts. Start small. Load more when necessary.

`skill-loading.ts`

```typescript
// Skills: load what you need, when you need it
const skills = [
  {
    name: 'code-review',
    description: 'Review code for issues',  // Level 1: always visible
    // Level 2-3: loaded on invocation
  },
];

// Selection is pure LLM reasoning—no embeddings, no classifiers
// Claude reads descriptions and matches intent
```

The principle works: don't load 10,000 tokens of instructions when you only need 500. Selection via LLM reasoning (read descriptions, match intent) avoids the complexity of embedding-based retrieval. Claude Code's three-level system is one implementation, but the underlying idea is simpler. Load instructions when the task needs them. A flat list of skills with on-demand loading gets you most of the benefit.

### Context anchors

Context windows have a problem: information in the middle gets less attention than the beginning and end. [Agents at Work](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/ "2026 Playbook for Reliable Agentic Workflows") found that todo lists help:

> "By constantly rewriting the todo list, agents recite objectives into the end of the context. This pushes the global plan into the model's recent attention span."

Write state to files. Read it back. This puts critical information where the model pays attention.

### Recursive Language Models

[Recursive Language Models](https://arxiv.org/html/2512.24601v1 "Recursive Language Models, MIT 2025") treat context as an external environment. The model writes Python to query what it needs via a REPL. MIT reports 3x cost reduction because the model only views what's relevant, validating our priority: compaction over summarization.

You probably don't need a REPL layer. Writing state to files and reading it back (Section 05) achieves the same selective access more simply.

### Observation masking

[JetBrains](https://blog.jetbrains.com/research/2025/12/efficient-context-management/ "The Complexity Trap, NeurIPS 2025") found that simple masking (omitting tool outputs from context) halves costs while matching summarization quality. The key insight: the model doesn't need to see everything it produces, just the parts relevant to the next step.

Instead of expensive summarization, mark outputs as ephemeral. The model retains what matters through its own attention patterns. This works best for intermediate results (search outputs, API responses) where the final artifact matters more than the path. Keep full context when debugging or when you need to explain how you got there.

## 03. Tools

> Give the agent more tools than you think it needs. Check what it does with them. Cut back if you have to.

### Ashby's Law

[Ross Ashby](papers/ashby-1956-cybernetics.pdf "An Introduction to Cybernetics (1956)"), 1956: *"Only variety can destroy variety."* (Often paraphrased as "absorb" by Stafford Beer.) Translation: your agent can only handle problems as complex as its tool set allows. When people say "the model is dumb," often the model just didn't have the right tools.

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

### MCP: the de facto standard

[Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25 "MCP Specification") won. [~40 million monthly SDK downloads](https://npmtrends.com/@modelcontextprotocol/sdk "MCP SDK npm trends") as of January 2026. [Donated to the Linux Foundation](https://www.anthropic.com/news/model-context-protocol-a2a-linux-foundation "MCP joins Linux Foundation") December 2025. Think of it as USB-C for AI: one protocol for many capabilities.

MCP defines three primitives:

- **Tools:** Functions the agent can call (read file, query database, send email)
- **Resources:** Data the agent can access (files, database rows, API responses)
- **Prompts:** Templates for common interactions

One interface. Any tool provider. Your agent doesn't care if the database tool comes from your code or a third-party server.

**Security note:** Adoption outpaced security hardening. [Equixly's audit](https://www.docker.com/blog/mcp-security-issues-threatening-ai-infrastructure/ "MCP Security Issues Threatening AI Infrastructure") found 43% of tested MCP servers had command injection vulnerabilities. [Invariant Labs](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks "MCP Security: Tool Poisoning Attacks") documented tool poisoning attacks. The protocol is sound; implementations need scrutiny. Treat third-party MCP servers like third-party npm packages—audit before trusting.

### Token efficiency

These patterns aren't part of MCP. They're Anthropic-specific features that work alongside any tool interface. Token-efficient tool mode graduated from beta with Claude 4. [Anthropic's research](https://www.anthropic.com/engineering/advanced-tool-use "Advanced Agentic Patterns") shows significant context savings:

**Tool Search:** Don't load all tools upfront. Use `defer_loading: true` and let the agent discover tools on demand. Anthropic reports [85% fewer tokens](https://www.anthropic.com/engineering/advanced-tool-use "Advanced Tool Use") in their testing. *Note: This is Anthropic API-specific, not a general MCP feature.*

**Programmatic Calling:** Let code execution filter results before they hit context. Query returns 10,000 rows? Filter to 10 in the sandbox. Anthropic's example showed [37% typical reduction](https://www.anthropic.com/engineering/code-execution-with-mcp "Code Execution with MCP"), though savings vary with data size—bulk data filtering sees larger gains.

**Token-efficient mode:** Reduces output tokens by 14-70%. The agent returns tool calls without repeating the schema. Now enabled by default in Claude 4.

`tool-efficiency.ts`

```typescript
// Tool search: Anthropic-specific feature
const tools = [
  { type: 'tool_search_tool_regex_20251119' },
  {
    name: 'query_database',
    defer_loading: true,  // Only loaded when discovered
  },
];

// Programmatic calling: filter in sandbox
const queryTool = {
  name: 'query_database',
  allowed_callers: ['code_execution_20250825'],
  // Results filtered before hitting context
};
```

## 04. Verification

> The LLM gets it right maybe 70% of the time. Your verification code catches the other 30%.

### Do the math

Illustrative example: say each step works 70% of the time. Over 10 steps:

`0.70^10 = 2.8%`

Now add verification that catches 80% of mistakes:

`0.94^10 = 53.8%`

The specific numbers will vary by task and model, but the principle holds: verification compounds. Without it, multi-step success rates collapse. With it, you have a chance.

**Note:** This catches *sporadic* errors: malformed output, type mismatches, policy violations. It doesn't catch *chronic waste*: 500 lines for a 20-line task. For that, see Section 10.

### Safety layers (Brooks, 1986)

[Rodney Brooks](papers/brooks-1986-robust-layered.pdf "A Robust Layered Control System For A Mobile Robot") built robots at MIT. His rule: lower layers override higher layers. Safety beats efficiency. Efficiency beats the goal. The goal never overrides safety.

Brooks' original layers were robot behaviors ("avoid obstacles" subsumes "wander"). Applying his principle to agents, we use (our formulation):

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

### Defense in depth

Any single check can be bypassed. The attacker has to beat all of them.

Stack defenses across different points: input validation catches malformed requests, policy checks catch unauthorized actions, output filtering catches leaked secrets, sandboxing contains damage from what slips through. [OWASP's agent security guidance](https://owasp.org/www-project-top-10-for-large-language-model-applications/ "OWASP LLM Top 10") recommends this layered approach.

When the sanitizer misses an injection, the policy layer might still block the action. When policy fails, the sandbox limits the blast radius. Each layer has blind spots. The goal is enough overlap that attackers can't thread the gaps.

### Hooks: integration points for verification

[Claude Code hooks](https://code.claude.com/docs/en/hooks "Claude Code Hooks Reference") are shell commands that run at lifecycle events. They don't implement Brooks' layers. They provide integration points where *you* can implement them. Your verification code runs at defined points:

- **PreToolUse:** Before any tool executes. *You* enforce Layer 0-2 here. Can modify inputs via `additionalContext`.
- **PostToolUse:** After execution. Run linters, formatters, tests.
- **Stop:** Before the agent completes. Final validation.

Hooks can do more than block. PreToolUse can modify inputs: sanitize arguments, inject additional context, transform parameters before the tool sees them. Hooks can also be scoped to specific tools or skills—a code-review skill might have stricter linting hooks than a general assistant.

`hooks.json`

```json
{
  "hooks": [
    {
      "event": "PreToolUse",
      "command": "node verify-action.js",
      "timeout": 5000
    },
    {
      "event": "PostToolUse",
      "command": "npm run lint -- --fix",
      "tools": ["Edit", "Write"]
    }
  ]
}
```

The theory said "lower layers win." Hooks are where you make that happen in code.

### Policy languages

Hooks tell you *when* to check. But what rules do you check?

[Cedar](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy-understanding-cedar.html "Cedar Policy Language for AWS AgentCore") and [AgentSpec](https://arxiv.org/abs/2503.18666 "AgentSpec: Customizable Runtime Guardrails, ICSE 2026") are current attempts. Cedar is AWS's production implementation: declarative permit/deny rules evaluated at a gateway. AgentSpec is academic: a DSL with 90% prevention rate in research evaluations.

Rules in deterministic code can't be argued with. The agent never sees tools it isn't permitted to use. But most teams don't need a new language. A TypeScript function validating against a rule set works fine:

```typescript
// You probably don't need Cedar. This works.
const policies = [
  { tool: 'refund', check: (ctx) => ctx.amount < 500 },
  { tool: 'delete', check: (ctx) => ctx.user.role === 'admin' },
];

function isPermitted(action, context) {
  const policy = policies.find(p => p.tool === action.tool);
  return policy ? policy.check(context) : false;
}
```

Cedar's value is governance at scale: many agents, auditable policies, compliance requirements. For one agent, you probably don't need it.

## 05. State and memory

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

### Context management

[Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents "Effective Context Engineering") calls context a finite, precious resource. [Jason Liu](https://jxnl.co/writing/2025/08/30/context-engineering-compaction/ "Context Engineering: Compaction") frames compaction as preserving "optimization trajectories": the reasoning path that got you here.

Based on these insights, we prioritize (our synthesis):

1. **Raw context:** Keep everything. Best quality.
2. **Observation masking:** Mark tool outputs as ephemeral (see Section 02). Model retains what matters through attention, not explicit storage.
3. **Compaction:** Strip redundant info but preserve structure. Reversible.
4. **Summarization:** Lossy. Last resort.

The key insight: compact *before* you hit limits. Don't wait until you're at 95% capacity.

`context-management.ts`

```typescript
const PRE_ROT_THRESHOLD = 0.75;  // 75% of context limit

function manageContext(messages, limit) {
  const usage = countTokens(messages) / limit;

  if (usage > PRE_ROT_THRESHOLD) {
    // Compaction: reversible, preserves structure
    return compact(messages, {
      keepFilePaths: true,     // References, not full content
      keepRecentToolCalls: 5,  // Preserve "rhythm"
      dropOldScreenshots: true,
    });
  }

  return messages;
  // Summarization only when compaction isn't enough
}
```

State survives context limits when you write it to files. Skills, todo lists, checkpoints: all filesystem. The context window can reset. The files remain.

## 06. Security

> Three things together cause problems: private data, outside input, and actions that affect the world. Remove one.

### The trifecta

[Simon Willison](https://simonw.substack.com/p/the-lethal-trifecta-for-ai-agents "The Lethal Trifecta for AI Agents") named this. If your agent has:

1. Access to secrets, databases, internal systems
2. Input from users, websites, emails
3. The ability to send messages, run code, change data

Then someone can trick it into leaking your secrets or doing things you didn't authorize. **Any two of these three are fine. All three together is a problem.**

[Meta's Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/ "Agents Rule of Two: A Practical Approach to AI Agent Security") formalizes this as a design constraint: an agent should satisfy *at most two* of [A] untrusted inputs, [B] sensitive data, [C] external actions.

> "Prompt injection is an architectural flaw."
> — [Simon Willison](https://simonwillison.net/series/prompt-injection/ "Prompt Injection series")

OpenAI acknowledged the same limitation in December 2025:

> "Prompt injection, much like scams and social engineering on the web, is unlikely to ever be fully 'solved.'"
> — [OpenAI](https://fortune.com/2025/12/23/openai-ai-browser-prompt-injections-cybersecurity-hackers/ "OpenAI on ChatGPT Atlas security")

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

### The box

[Marc Brooker](https://brooker.co.za/blog/2026/01/12/agent-box.html "Agent Safety is a Box") names the pattern: a deterministic control layer *outside* the agent. All tool calls flow through a gateway. The gateway checks policy before execution.

If your agent can be convinced to ignore system prompt constraints, you have a problem. If your gateway refuses unauthorized tools regardless of what the agent says, you have a solution. The agent can't reason its way past code. If you're already validating tool calls (which you should), you have this pattern. Brooker's insight is the mental model: prompt-based safety alone isn't enough.

### New attack surfaces

[Skills](https://arxiv.org/html/2601.10338 "Skills Security Research") and [MCP](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/ "Prompt Injection Design Patterns") add new risks:

**Skills consent gap:** User approves a skill once. The skill then has persistent permissions. An attacker who compromises a skill inherits those permissions.

**MCP tool confusion:** A malicious MCP server could provide a tool named `read_file` that looks legitimate but exfiltrates data. Users see tool names, not implementations.

**Plan-then-execute:** [Simon Willison](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/ "Prompt Injection Patterns") recommends generating a fixed action list, then executing only those actions. Untrusted data processes during planning can't inject new actions during execution.

`plan-then-execute.ts`

```typescript
// Constrain actions to a fixed plan
const plan = await llm.generatePlan(task);  // Fixed action list

for (const action of plan.actions) {
  // Untrusted data can't inject new actions here
  await execute(action);
}
```

## 07. Evaluation

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

### pass@k vs pass^k

Two metrics, different questions:

- **pass@k**: Run k times, at least one succeeds. Measures *coverage*: can the agent ever solve this?
- **pass^k**: Run k times, all succeed. Measures *reliability*: can you trust the agent in production?

[Holistic Evaluation of Language Models](https://crfm.stanford.edu/helm "HELM") uses both. A 90% pass@5 with 20% pass^5 means the agent can solve the problem but you can't predict when. Production needs pass^k.

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

### LLM-as-judge

When you can't write deterministic assertions, use another model to evaluate. [Prometheus 2](https://arxiv.org/abs/2405.01535 "Prometheus 2: Open Source LLM Judges") achieves near-human agreement on code quality judgments.

LLM judges scale evaluation beyond what humans can review and catch subtle issues that pattern matching misses. But they have their own biases. Calibrate against human judgments first. Use judges for screening, not final verdicts.

### Variance matters

A 70% success rate with 5% variance is more useful than 85% success with 30% variance. Report confidence intervals. Track variance over time. A change that increases mean performance but also increases variance may not be an improvement.

## 08. Operations

> The agent loop is easy. Retries, rate limits, circuit breakers, and monitoring take the real work.

### Why demos work and production fails

Your demo ran once on a good network with a responsive API. Production runs thousands of times with timeouts, rate limits, and services that go down at 3am.

Agents that work in demos die in production. The difference is infrastructure.

### What you need

- **Exponential Backoff:** When a call fails, wait longer before retrying. Add randomness so you don't hit the API at the same time as everyone else.
- **Circuit Breaker:** If a service fails 5 times in a row, stop calling it for a minute. Don't waste resources on something that's down.
- **Rate Limiting:** Agents can make unbounded requests. Put a ceiling on it.
- **Token Budgets:** Set per-task and per-session limits. An agent that solves a problem using $50 of tokens may not have solved it usefully.
- **Idempotency Keys:** Tool calls should be safe to retry. If a retry sends a second email or processes a second payment, your ops infrastructure failed.
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

## 09. Orchestration

> One coordinator hands out work. Workers do the work. Workers never hand out more work.

### Bounded delegation

Let workers spawn their own workers and you get:

- Costs that multiply at each level
- Latency that hides until everything times out at once
- Debugging that requires tracing every branch of every branch

We've heard of teams letting agents spawn agents. Bills hitting $2000/day before anyone noticed. The pattern is common enough to warn against.

"One level" is the simple version. The general principle is *bounded delegation*: the coordinator sets explicit limits on recursion depth, token budget, and execution time. Workers operate within those bounds.

Think of it like construction: you talk to the foreman, not the workers.

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

### MCP vs A2A

Two protocols, two directions. Both donated to the Linux Foundation December 2025:

- **[MCP](https://modelcontextprotocol.io/ "Model Context Protocol"):** Vertical. Agent connects to tools. One agent, many capabilities.
- **[A2A](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/ "A2A Protocol"):** Horizontal. Agent connects to agents. Coordination across systems.

> "A2A focuses on how agents communicate with each other (horizontally), while MCP focuses on how a single agent connects to tools (vertically)."
> — [Auth0](https://auth0.com/blog/mcp-vs-a2a/ "MCP vs A2A")

### Context isolation

Workers explore internally. They might process 50,000 tokens of search results, code, documentation. The coordinator doesn't need all that. Workers return summaries.

`context-isolation.ts`

```typescript
// Workers return summaries, not full traces
const workerResult = await worker.execute(subtask);
// Worker explored 50K tokens internally
// Returns 1-2K token summary

coordinator.addContext({
  subtask: subtask.id,
  outcome: workerResult.summary,
  artifacts: workerResult.files,  // References, not content
});
```

Share memory by communicating. Don't communicate by sharing memory. (Go proverb, via Rob Pike)

### Context poisoning

When workers share context, hallucinations propagate. Worker A hallucinates a fact. Worker B references it. Worker C cites B as confirmation. The false information looks well-sourced because it has multiple "references."

Context isolation (above) is the defense. Each worker starts clean. Results go through the coordinator, which can verify before incorporating.

Isolation treats each worker as untrusted input. The coordinator validates claims, checks sources, rejects contradictions. Full isolation isn't always practical. When workers share state (a codebase, for example), bound what each can modify. Prefer immutable shared resources plus explicit handoffs for changes.

### What the coordinator keeps

The coordinator maintains minimal state across worker calls:

- **Task decomposition:** Which subtasks exist and their dependencies
- **Completion status:** What's done, what's pending, what failed
- **Summaries:** The 1-2K token results from each worker
- **Artifacts:** References to files workers created (not the files themselves)

Workers are stateless between invocations. The coordinator is the only entity with memory.

## 10. Quality

> Quality isn't a layer you add. It emerges from the system.

### Deming's insight

[W. Edwards Deming](https://asq.org/quality-resources/tqm/deming-points "Deming's 14 Points") said it plainly: *"Cease dependence on inspection to achieve quality."* You can't bolt quality on at the end. The quality, good or bad, is already in the product.

The architecture in this guide IS the quality system:

- **The loop (01)**: Feedback is quality. You observe results and adjust. Wiener's whole point.
- **Verification (04)**: Brooks' safety layers catch errors before they execute.
- **State (05)**: Event sourcing gives you replay, debugging, crash recovery. That's your audit trail.
- **Evaluation (07)**: Statistical thinking. Run it 50 times, look at the distribution. Shift the distribution, not just fix bugs.

### What this doesn't catch

[Joseph Juran](https://www.juran.com/blog/the-juran-trilogy-2/ "The Quality Trilogy (1986)") distinguished **sporadic spikes** (sudden errors) from **chronic waste** (structural problems). The existing architecture handles sporadic spikes. What it doesn't automatically catch:

**Chronic waste**: The code works. Verification passes. But 500 lines for a 20-line task is still wrong.

**The asymmetry problem**: An agent generates in minutes. A human reviews in hours. If review time exceeds generation time by 10x, you don't have an efficiency gain. You have a bottleneck that happens to produce a lot of output.

### Measuring chronic waste

Track these over time:

- **Code churn**: Percentage rewritten within 2 weeks. High churn means the first output wasn't right.
- **Proportionality**: Actual lines vs. expected lines for the task.
- **Review time ratio**: Hours to review vs. minutes to generate.

[GitClear's analysis](https://www.gitclear.com/coding_on_copilot_data_shows_ais_downward_pressure_on_code_quality "AI's Downward Pressure on Code Quality") of 153M lines (2020-2023) found: code churn doubled post-Copilot adoption, code duplication increased 4x, and "moved" code (refactoring indicator) dropped. The data suggests AI accelerates writing while degrading maintenance.

These metrics surface chronic problems that verification misses.

### The velocity paradox

[Faros AI](https://www.faros.ai/blog/ai-software-engineering "The AI Productivity Paradox Research Report") measured real developer workflows across 10,000+ developers: 91% increase in PR review time, 21% more tasks completed, but the bottleneck moved to human approval. Generation is faster. Delivery isn't.

**What this means:** Optimizing for generation speed without optimizing for review and integration can decrease total velocity. The bottleneck shifts from writing to reviewing.

**What to track:** Time from commit to production, not time to first commit. PRs merged per week, not PRs opened. Working software, not working code.

### Stop the line

When quality checks fail, don't continue hoping someone catches it downstream. This extends verification (04): if the output is wrong, stop.

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

## 11. Complete example

> All of it together in one working system.

### The stack

1. **CLI:** Parse arguments, load config, wire things up
2. **Ops:** Retry logic, circuit breakers, rate limits
3. **Security:** Trifecta checks, plan-then-execute, input sanitization
4. **Agent:** The loop, MCP tools, hooks, context management

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

// Load skills on demand (progressive disclosure)
const skills = await loadRelevantSkills(task);

// The loop (Wiener, 1948)
while (this.canContinue()) {
  // Manage context before it rots
  this.messages = manageContext(this.messages, CONTEXT_LIMIT);

  const response = await this.ops.callLlm(
    () => this.queryLLM(skills)
  );

  // Hooks: PreToolUse (enforce Brooks' layers here)
  const verified = await this.hooks.preToolUse(response);

  // Run it (MCP tools)
  const results = await this.executeTools(verified.toolCalls);

  // Hooks: PostToolUse (quality gates)
  await this.hooks.postToolUse(results);

  // Record it (event sourcing)
  this.updateState(results);
}

// That's the architecture.
```

The loop is the architecture. Everything else is infrastructure.

---

*The loop is the architecture. Everything else is infrastructure.*