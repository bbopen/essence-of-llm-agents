# Smart Purchase Advisor: Educational Example Architecture

> An end-to-end example demonstrating all patterns from "The Essence of LLM Agentic Systems"

## Overview

The **Smart Purchase Advisor** helps users make informed purchase decisions by:
1. Understanding user requirements (budget, use case, preferences)
2. Researching products across multiple dimensions (specs, reviews, prices)
3. Synthesizing findings into actionable recommendations

This example demonstrates the **coordinator-worker pattern** with full security, state management, and verification—all using synthetic data to keep it self-contained and runnable.

---

## Why This Example Works

| Traditional Approach Problem | Agentic Solution |
|------------------------------|------------------|
| Decision trees for every product category | LLM understands context naturally |
| Rigid if/else for feature combinations | Workers handle open-ended research |
| Manual rules for "good value" | LLM reasons about tradeoffs |
| Hardcoded price thresholds | Natural language budget constraints |
| Separate logic per product type | Same coordinator pattern, different workers |

**The key insight**: Without agents, a laptop recommender needs different code than a phone recommender. With agents, the same architecture handles both—the LLM adapts to the domain.

---

## Architecture Mapping to Guide Sections

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        OPERATIONS LAYER (08)                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Retry/Backoff   │  │  Circuit Breaker │  │   Rate Limits    │  │
│  │  (11-retry.ts)   │  │  (12-circuit.ts) │  │   (budget.ts)    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                        SECURITY LAYER (06)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Trifecta Assessment (09-lethal-trifecta.ts)                │   │
│  │  • Private data: user budget, preferences (YES)             │   │
│  │  • Untrusted input: product data from "web" (YES)           │   │
│  │  • External actions: NONE (research only, no purchase)      │   │
│  │  → Risk: MEDIUM (2/3 legs) - manageable with isolation      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Subsumption Layers (10-subsumption-layers.ts)              │   │
│  │  L0: Safety - block dangerous patterns                      │   │
│  │  L1: Resources - token/API budgets                          │   │
│  │  L2: Policy - only approved product categories              │   │
│  │  L3: Task - the actual recommendation                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                     COORDINATOR LAYER (09)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  PurchaseAdvisorCoordinator (extends 14-coordinator.ts)     │   │
│  │                                                             │   │
│  │  analyze(task) → Break into research subtasks               │   │
│  │  delegate(subtasks) → Send to specialized workers           │   │
│  │  aggregate(results) → Synthesize recommendation             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                          │                                          │
│    ┌─────────────────────┼─────────────────────┐                   │
│    │                     │                     │                    │
│    ▼                     ▼                     ▼                    │
│  ┌─────────┐       ┌─────────┐          ┌─────────┐                │
│  │ Spec    │       │ Review  │          │ Price   │                │
│  │ Analyzer│       │ Scanner │          │ Checker │                │
│  │ Worker  │       │ Worker  │          │ Worker  │                │
│  └─────────┘       └─────────┘          └─────────┘                │
│  (13-single-level-delegation.ts - workers cannot delegate)         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                       AGENT LOOP (01)                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Each worker runs: while(true) { generate → check → exec }  │   │
│  │  (01-the-loop.ts)                                           │   │
│  │                                                             │   │
│  │  Tools available to workers:                                │   │
│  │  • search_products - query synthetic catalog                │   │
│  │  • get_product_details - fetch full product info            │   │
│  │  • get_reviews - fetch synthetic reviews                    │   │
│  │  • compare_specs - compare multiple products                │   │
│  │  • done - explicit termination (05-explicit-termination.ts) │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                    VERIFICATION LAYER (04)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Tool Validation (06-tool-validation.ts)                    │   │
│  │  • Schema validation on all tool inputs                     │   │
│  │  • Return errors as results (LLM can retry)                 │   │
│  │                                                             │   │
│  │  Deterministic Guards (02-deterministic-guards.ts)          │   │
│  │  • Pre-execution: validate action is permitted              │   │
│  │  • Post-execution: verify result makes sense                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                       STATE LAYER (05)                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Event Store (08-event-sourced-state.ts)                    │   │
│  │  • Every tool call logged as event                          │   │
│  │  • State derived from events (replay capability)            │   │
│  │  • Persisted to filesystem for crash recovery               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Context Management                                         │   │
│  │  • Ephemeral messages (03-ephemeral-messages.ts)            │   │
│  │  • Keep last 5 product searches, prune older                │   │
│  │  • Filesystem memory (07-filesystem-memory.ts)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                    SYNTHETIC DATA LAYER                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Product Catalog (data/products.json)                       │   │
│  │  • 30 laptops with specs, prices, ratings                   │   │
│  │  • Some with missing data (tests error handling)            │   │
│  │  • Price range: $449 - $2,499                               │   │
│  │                                                             │   │
│  │  Reviews Database (data/reviews.json)                       │   │
│  │  • 2-5 reviews per product                                  │   │
│  │  • Mix of positive, negative, detailed, brief               │   │
│  │  • Some contradictory (tests verification)                  │   │
│  │                                                             │   │
│  │  Search Implementation (tools/synthetic-search.ts)          │   │
│  │  • Keyword matching against catalog                         │   │
│  │  • Same interface as real web search                        │   │
│  │  • Swappable for production implementation                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```text
example/
├── index.ts                    # Entry point - run the advisor
├── run.ts                      # CLI wrapper with argument parsing
│
├── coordinator/
│   └── purchase-advisor.ts     # Main coordinator (extends 14-coordinator.ts)
│
├── workers/
│   ├── spec-analyzer.ts        # Analyzes product specifications
│   ├── review-scanner.ts       # Processes and summarizes reviews
│   └── price-checker.ts        # Compares prices, finds deals
│
├── tools/
│   ├── index.ts                # Tool registry
│   ├── search-products.ts      # Search synthetic catalog
│   ├── get-product-details.ts  # Fetch full product info
│   ├── get-reviews.ts          # Fetch product reviews
│   ├── compare-specs.ts        # Side-by-side comparison
│   └── done.ts                 # Explicit termination
│
├── security/
│   ├── trifecta-check.ts       # Assess risk before execution
│   ├── layers.ts               # Subsumption layer implementation
│   └── policies.ts             # Business rules (allowed categories, etc.)
│
├── state/
│   ├── event-store.ts          # Event sourcing implementation
│   ├── context-manager.ts      # Ephemeral message handling
│   └── session.ts              # Session state (budget, preferences)
│
├── data/
│   ├── products.json           # Synthetic product catalog
│   ├── reviews.json            # Synthetic reviews
│   └── README.md               # Data format documentation
│
├── ops/
│   ├── retry.ts                # Retry with backoff
│   ├── budget.ts               # Token/API call budgets
│   └── metrics.ts              # Execution tracking
│
├── llm/
│   ├── client.ts               # LLM client interface
│   └── mock-client.ts          # Mock LLM for testing (optional real client)
│
└── evaluation/
    ├── test-cases.json         # Evaluation scenarios
    ├── runner.ts               # Run N times, compute statistics
    └── report.ts               # Generate evaluation report
```

---

## Implementation Plan

### Phase 1: Core Loop + Tools

Build the basic agent loop with synthetic data tools.

**Files to create:**
- `example/data/products.json` - Synthetic catalog
- `example/tools/search-products.ts` - Uses existing `06-tool-validation.ts`
- `example/tools/done.ts` - Reuses `05-explicit-termination.ts`
- `example/llm/mock-client.ts` - Returns scripted responses for testing

**Pattern reuse:**

```typescript
// example/tools/search-products.ts
import { validate, ValidatedTool } from '../../patterns/06-tool-validation';

export const searchProductsTool: ValidatedTool = {
  name: 'search_products',
  description: 'Search for products matching criteria',
  inputSchema: {
    query: { type: 'string', required: true, minLength: 1 },
    category: { type: 'string' },
    maxPrice: { type: 'number', minimum: 0 },
  },
  execute: async (args) => {
    // Query synthetic catalog
    const results = await searchCatalog(args);
    return JSON.stringify(results);
  }
};
```

### Phase 2: Workers + Coordinator

Implement the coordinator-worker pattern.

**Files to create:**
- `example/workers/spec-analyzer.ts`
- `example/workers/review-scanner.ts`
- `example/workers/price-checker.ts`
- `example/coordinator/purchase-advisor.ts`

**Pattern reuse:**

```typescript
// example/coordinator/purchase-advisor.ts
import { Coordinator, Subtask } from '../../patterns/14-coordinator';
import { SubAgent } from '../../patterns/13-single-level-delegation';

interface PurchaseTask {
  query: string;           // "laptop for programming under $1500"
  budget?: number;
  mustHave?: string[];     // ["good keyboard", "16GB RAM"]
  niceToHave?: string[];
}

class PurchaseAdvisorCoordinator extends Coordinator {
  async analyze(task: PurchaseTask): Promise<Subtask[]> {
    return [
      {
        id: 'specs',
        parentId: task.id,
        description: `Find laptops matching: ${task.query}`,
        type: 'analysis',
        context: { budget: task.budget, mustHave: task.mustHave }
      },
      {
        id: 'reviews',
        parentId: task.id,
        description: `Analyze reviews for top candidates`,
        type: 'analysis',
        // Depends on specs phase
      },
      {
        id: 'prices',
        parentId: task.id,
        description: `Compare prices and find deals`,
        type: 'analysis',
      }
    ];
  }
}
```

### Phase 3: Security + Verification

Add safety layers and validation.

**Files to create:**
- `example/security/trifecta-check.ts`
- `example/security/layers.ts`

**Pattern reuse:**

```typescript
// example/security/layers.ts
import { checkAllLayers, LayerCheck } from '../../patterns/10-subsumption-layers';

// Custom layer: only allow approved product categories
const categoryPolicyLayer: LayerCheck = {
  layer: 2,
  name: 'category_policy',
  check: (action) => {
    const allowedCategories = ['laptops', 'phones', 'tablets', 'monitors'];
    if (action.type === 'search_products') {
      const category = action.parameters?.category as string;
      if (category && !allowedCategories.includes(category)) {
        return {
          allowed: false,
          reason: `Category "${category}" not in allowed list`
        };
      }
    }
    return { allowed: true };
  }
};
```

### Phase 4: State + Context

Add event sourcing and context management.

**Files to create:**
- `example/state/event-store.ts`
- `example/state/context-manager.ts`

**Pattern reuse:**

```typescript
// example/state/context-manager.ts
import { pruneEphemeral, EphemeralConfig } from '../../patterns/03-ephemeral-messages';
import { EventStore, deriveState } from '../../patterns/08-event-sourced-state';

// Keep only last 5 product search results
const ephemeralConfig: EphemeralConfig = {
  keepLast: 5,
  maxAge: 5 * 60 * 1000  // 5 minutes
};
```

### Phase 5: Operations

Add retry, circuit breaker, budgets.

**Pattern reuse:**

```typescript
// example/ops/retry.ts
import { withRetry, RetryConfig } from '../../patterns/11-retry-backoff';

// Wrap all tool executions
async function executeToolWithOps(tool: Tool, args: unknown): Promise<string> {
  return withRetry(() => tool.execute(args), {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    jitterFactor: 0.2
  });
}
```

### Phase 6: Evaluation

Add statistical evaluation.

**Files to create:**
- `example/evaluation/test-cases.json`
- `example/evaluation/runner.ts`

```typescript
// example/evaluation/runner.ts
interface EvaluationResult {
  successRate: number;
  variance: number;
  avgDurationMs: number;
  avgTokensUsed: number;
}

async function runEvaluation(
  testCases: TestCase[],
  runs: number = 50
): Promise<EvaluationResult> {
  const results = [];

  for (let i = 0; i < runs; i++) {
    for (const testCase of testCases) {
      const result = await runTestCase(testCase);
      results.push(result);
    }
  }

  return computeStatistics(results);
}
```

---

## Synthetic Data Design

### Product Catalog (`data/products.json`)

```json
{
  "products": [
    {
      "id": "laptop-001",
      "name": "ThinkPad X1 Carbon Gen 11",
      "category": "laptops",
      "brand": "Lenovo",
      "price": 1449.00,
      "specs": {
        "cpu": "Intel Core i7-1365U",
        "ram": "16GB",
        "storage": "512GB SSD",
        "display": "14\" 2.8K OLED",
        "weight": "2.48 lbs",
        "battery": "57Wh"
      },
      "rating": 4.5,
      "reviewCount": 127,
      "inStock": true,
      "tags": ["business", "lightweight", "premium"]
    },
    // ... 29 more products
  ]
}
```

**Design considerations:**
- Range from budget ($449) to premium ($2,499)
- Mix of brands, specs, use cases
- Some products have missing fields (tests validation)
- Some have identical specs but different prices (tests comparison)

### Reviews Database (`data/reviews.json`)

```json
{
  "reviews": {
    "laptop-001": [
      {
        "id": "rev-001-1",
        "rating": 5,
        "title": "Best laptop for developers",
        "body": "The keyboard is exceptional. Battery lasts all day coding.",
        "verified": true,
        "helpful": 45,
        "date": "2024-11-15"
      },
      {
        "id": "rev-001-2",
        "rating": 3,
        "title": "Good but expensive",
        "body": "Great machine but you can get similar specs for less.",
        "verified": true,
        "helpful": 23,
        "date": "2024-10-02"
      }
      // More reviews with varying sentiments
    ]
  }
}
```

**Design considerations:**

- 2-5 reviews per product
- Mix of verified/unverified
- Some contradictory opinions (tests synthesis)
- Varying detail levels

---

## Security Analysis

### Trifecta Assessment

| Factor | Present? | Justification |
|--------|----------|---------------|
| Private Data | ✓ | User's budget, preferences |
| Untrusted Input | ✓ | Product data (simulated "web" content) |
| External Actions | ✗ | Read-only research, no purchase capability |

#### Risk Level: MEDIUM (2/3)

By design, we break the trifecta by excluding purchase capability. The advisor researches and recommends—the user makes the final purchase decision themselves.

### Mitigation Strategies

1. **Data Isolation**: User preferences stored separately from product data
2. **Input Sanitization**: Product descriptions validated before LLM sees them
3. **No Action Leg**: Advisor cannot make purchases, only recommend

### What This Demonstrates

The example shows how to **design away risk** rather than trying to mitigate it with more code:

```typescript
// BAD: Try to secure a full-featured agent
const riskyAgent = {
  hasPrivateData: true,      // User payment info
  hasUntrustedInput: true,   // Web content
  hasExternalActions: true,  // Can make purchases
  // Risk: CRITICAL - must implement complex mitigations
};

// GOOD: Design without the dangerous leg
const safeAdvisor = {
  hasPrivateData: true,      // User preferences (no payment)
  hasUntrustedInput: true,   // Product data
  hasExternalActions: false, // Research only!
  // Risk: MEDIUM - manageable
};
```

---

## Example Execution Flow

```text
User: "Find me a laptop under $1500 for programming"

┌─────────────────────────────────────────────────────────────────────┐
│ 1. COORDINATOR: Analyze Task                                        │
│    └─ Breaks into: specs, reviews, prices subtasks                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. PHASE 1: Spec Analysis (parallel not dependent on others)        │
│                                                                     │
│    ┌─────────────────────────────────────────────────────────────┐ │
│    │ Spec Worker Loop:                                           │ │
│    │   → search_products({query: "laptop programming", maxPrice: 1500})│
│    │   ← [5 products: laptop-001, laptop-003, laptop-007, ...]   │ │
│    │   → compare_specs({ids: [/* all 5 matching products */]})   │ │
│    │   ← [comparison table with specs side-by-side]              │ │
│    │   → done({result: "Top 3: laptop-001, laptop-007, laptop-015"})│
│    └─────────────────────────────────────────────────────────────┘ │
│                                                                     │
│    Result: ["laptop-001", "laptop-007", "laptop-015"]              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. PHASE 2: Review + Price (can run parallel, depend on Phase 1)    │
│                                                                     │
│    ┌─────────────────────────────┐  ┌─────────────────────────────┐│
│    │ Review Worker:              │  │ Price Worker:               ││
│    │   → get_reviews("laptop-001")│ │   → get_product_details(*)  ││
│    │   → get_reviews("laptop-007")│ │   ← [prices, deals]         ││
│    │   → get_reviews("laptop-015")│ │   → done({...})             ││
│    │   → done({summary: ...})    │  │                             ││
│    └─────────────────────────────┘  └─────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. COORDINATOR: Aggregate Results                                   │
│                                                                     │
│    Spec Analysis:   "3 candidates meet requirements"               │
│    Review Summary:  "laptop-001 has best keyboard reviews"         │
│    Price Check:     "laptop-007 is $200 cheaper, similar specs"    │
│                                                                     │
│    Final Synthesis: "Recommend laptop-007 (best value) or          │
│                      laptop-001 (best quality)"                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. RETURN TO USER                                                   │
│                                                                     │
│    "Based on your requirements ($1500 budget, programming use):    │
│                                                                     │
│    BEST VALUE: Dell XPS 15 ($1,299)                                │
│    - 16GB RAM, i7, great keyboard                                  │
│    - Reviews praise build quality                                  │
│                                                                     │
│    PREMIUM OPTION: ThinkPad X1 Carbon ($1,449)                     │
│    - Best-in-class keyboard for coding                             │
│    - Slightly lighter, better battery                              │
│                                                                     │
│    Both are solid choices for programming."                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Running the Example

```bash
# Install dependencies
npm install

# Run with a query
npx ts-node example/run.ts "laptop under $1500 for programming"

# Run with options
npx ts-node example/run.ts \
  --budget 1500 \
  --category laptops \
  --must-have "16GB RAM" \
  "good laptop for coding"

# Run evaluation (50 runs)
npx ts-node example/evaluation/runner.ts

# Run with real LLM (optional, requires API key)
ANTHROPIC_API_KEY=... npx ts-node example/run.ts --real-llm "..."
```

---

## What Each Section Teaches

| Guide Section | What the Example Shows |
|---------------|----------------------|
| 01: The Loop | Workers running observe→act→adjust cycles |
| 02: The Prompt | System prompts for each worker role |
| 03: Tools | search_products, get_reviews, compare_specs |
| 04: Verification | Schema validation, deterministic guards |
| 05: State | Event sourcing, context management |
| 06: Security | Trifecta assessment, breaking the dangerous leg |
| 07: Evaluation | Statistical testing (run 50 times) |
| 08: Operations | Retry with backoff, budgets |
| 09: Orchestration | Coordinator-worker with bounded delegation |
| 10: Quality | Verification of recommendations |

---

## Next Steps

1. Review this architecture
2. Create synthetic data files
3. Implement tools using existing patterns
4. Build coordinator and workers
5. Add security and verification layers
6. Write evaluation harness
7. Document for the guide
