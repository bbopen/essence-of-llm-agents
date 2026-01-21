# Smart Purchase Advisor Example

This directory contains a complete, working example that demonstrates the patterns
from the scaffolding in `patterns/`. It implements a laptop purchase advisor agent.

## Quick Start

```bash
# Run with real LLM (requires OPENROUTER_API_KEY in .env.local)
npm run example

# Run with mock LLM (deterministic, no API key needed)
npm run example:mock

# Run evaluation suite
npx tsx example/evaluation/runner.ts
```

## Directory Structure

```
example/
├── README.md              ← You are here
│
├── index.ts               ← MAIN ENTRY POINT
│                            Implements Pattern 1.1 (The Loop)
│                            @see patterns/01-the-loop.ts
│
├── index-coordinator.ts   ← Coordinator pattern example
│                            Implements Pattern 7.2 (Coordinator)
│                            @see patterns/14-coordinator.ts
│
├── data/                  ← DOMAIN DATA
│   ├── products.json      30 laptops with specs, prices, tags
│   └── reviews.json       Product reviews with ratings
│
├── tools/                 ← AGENT TOOLS
│   ├── index.ts           Tool registry (Pattern 3.1)
│   ├── search-products.ts Search by criteria (query, price, tags)
│   ├── get-reviews.ts     Fetch reviews for a product
│   ├── compare-specs.ts   Compare multiple products
│   ├── done.ts            Task completion (Pattern 3.2)
│   └── data.ts            Data loading and search functions
│
├── llm/                   ← LLM CLIENTS
│   ├── index.ts           Client factory (mock or real)
│   ├── openrouter-client.ts  Real API client
│   └── mock-client.ts     Deterministic mock for testing
│
├── state/                 ← STATE MANAGEMENT
│   └── index.ts           EventStore (Pattern 4.2)
│
├── evaluation/            ← TESTING
│   └── runner.ts          Statistical evaluation (Pattern 8.1)
│                          @see patterns/15-evaluation.ts
│
└── orchestration/         ← MULTI-AGENT
    ├── index.ts
    └── coordinator.ts     Coordinator implementation
```

## Pattern → Example Mapping

| Pattern | Scaffolding File | Example Implementation |
|---------|-----------------|----------------------|
| 1.1 The Loop | `patterns/01-the-loop.ts` | `example/index.ts` |
| 3.1 Complete Action Spaces | `patterns/04-complete-action-spaces.ts` | `example/tools/index.ts` |
| 3.2 Explicit Termination | `patterns/05-explicit-termination.ts` | `example/tools/done.ts` |
| 3.3 Tool Validation | `patterns/06-tool-validation.ts` | `example/tools/*.ts` |
| 4.2 Event-Sourced State | `patterns/08-event-sourced-state.ts` | `example/state/index.ts` |
| 7.1 Single-Level Delegation | `patterns/13-single-level-delegation.ts` | `example/orchestration/coordinator.ts` |
| 7.2 Coordinator | `patterns/14-coordinator.ts` | `example/orchestration/coordinator.ts` |
| 8.1 Statistical Evaluation | `patterns/15-evaluation.ts` | `example/evaluation/runner.ts` |

## Key Files Explained

### Data Files

**`data/products.json`** - The product catalog:
```json
{
  "products": [
    {
      "id": "laptop-001",
      "name": "ThinkPad X1 Carbon Gen 11",
      "brand": "Lenovo",
      "price": 1449.00,
      "specs": {
        "cpu": "Intel Core i7-1365U",
        "ram": "16GB",
        "storage": "512GB SSD",
        "display": "14\" 2.8K OLED",
        ...
      },
      "rating": 4.5,
      "tags": ["business", "programming", "premium"]
    },
    ...
  ]
}
```

**`data/reviews.json`** - Product reviews:
```json
{
  "reviews": [
    {
      "productId": "laptop-001",
      "rating": 5,
      "title": "Perfect for developers",
      "text": "The keyboard is incredible...",
      "pros": ["keyboard", "display", "build quality"],
      "cons": ["runs warm under load"]
    },
    ...
  ]
}
```

### System Prompt

The agent's behavior is configured via a system prompt in `index.ts`:

```typescript
const PURCHASE_ADVISOR_PROMPT = `You are a Smart Purchase Advisor...

Your tools:
- search_products: Search the catalog by criteria
- get_reviews: Get detailed reviews for a product
- compare_specs: Compare specifications of products
- done: Complete the task with your recommendation

Process:
1. Understand requirements (budget, use case)
2. Search for matching products
3. Review top candidates
4. Compare if needed
5. Make a recommendation with reasoning
...`;
```

### Evaluation Scenarios

The evaluation runner (`evaluation/runner.ts`) defines 8 test scenarios:

| Difficulty | Scenario | Task | Success Criteria |
|------------|----------|------|------------------|
| EASY | Programming Laptop | "Under $1500, 16GB RAM" | Price ≤ $1500, RAM ≥ 16GB |
| EASY | Budget Student | "Under $700 for notes" | Price ≤ $700 |
| MEDIUM | Linux Development | "Linux-friendly, ~$1200" | Linux brand + price ≤ $1400 |
| MEDIUM | Portable Gaming | "Gaming + under 4 lbs" | Dedicated GPU + weight ≤ 4.5 lbs |
| MEDIUM | OLED on Budget | "OLED under $900" | OLED display + price ≤ $900 |
| HARD | 32GB RAM Budget | "32GB, strict $1300" | RAM = 32GB, price ≤ $1350 |
| HARD | Gaming Cheap | "Gaming under $800" | Dedicated GPU + price ≤ $800 |
| HARD | Vague Request | "What laptop?" | Any recommendation with reasoning |

## How to Read This Example

1. **Start with `index.ts`** - See the main agent loop and system prompt
2. **Explore `tools/`** - Understand what capabilities the agent has
3. **Check `data/`** - See what products/reviews the agent works with
4. **Run the evaluation** - See how statistical testing works
5. **Compare to `patterns/`** - See how the example mirrors the scaffolding

## Environment Setup

Create `.env.local` with your API key:

```bash
OPENROUTER_API_KEY=sk-or-...
```

Or use the mock client for development:

```bash
npm run example:mock
```

## Relationship to Scaffolding

The `patterns/` directory contains **generic, reusable patterns** that can be
applied to any domain. This `example/` directory shows **one concrete implementation**
of those patterns for e-commerce product recommendations.

```
patterns/              →  example/
(abstract scaffolding)    (concrete implementation)

agent loop pattern     →  purchase advisor agent
tool validation        →  product search, reviews, comparison
event sourcing         →  audit trail for recommendations
evaluation framework   →  laptop recommendation testing
```

The patterns are theory-grounded and domain-agnostic. The example shows how to
instantiate them for a specific use case.
