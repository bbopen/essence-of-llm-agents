# Project Instructions

## Project Overview

This is "The Essence of LLM Agentic Systems" - a pattern reference guide with an educational example. The project has two main parts:

1. **Scaffolding** (`patterns/*.ts`) - Reference architecture patterns
2. **Example** (`example/*`) - Smart Purchase Advisor demonstrating those patterns

## Scaffolding vs Example Relationship

### Scaffolding (patterns/*.ts) = Educational Reference Architecture

- **Prioritizes readability and conceptual clarity** over TypeScript perfectionism
- Teaches the "what" and "why" of each pattern
- Should be complete enough that someone could copy it as a starting point
- **Is the authoritative source** - changes flow FROM here, not TO here
- Err on the side of being understandable rather than perfect code

### Example (example/*) = "Copy-Paste-and-Modify" Demonstration

- Should look like someone literally copied the scaffolding and filled in domain-specific parts
- The structure, method names, and flow should **mirror the scaffolding**
- A reader comparing them should think: "I see, they took `EventStore` from the pattern and just added Purchase Advisor events"
- **NOT about importing from scaffolding** - it's about the example being a recognizable instantiation of it
- Strictly follows the scaffolding's patterns and structure

### The Reader's Journey

1. Read `patterns/08-event-sourced-state.ts` → "Ah, this is how event sourcing works for agents"
2. Read `example/state/event-store.ts` → "I see, they copied that pattern and added their specific events"
3. Build their own → Copy the scaffolding, modify like the example did

### Rules

1. **Scaffolding is authoritative**: If the example needs something generic, add it to scaffolding first
2. **Example mirrors scaffolding**: The example's code should be structurally recognizable as "the scaffolding, but for Purchase Advisor"
3. **Readability over perfection**: Scaffolding can be slightly simplified for teaching; example shows real-world application
4. **No reverse flow**: Never update scaffolding to match example - always the other direction
5. **Example never edits scaffolding**: The example imports/mirrors scaffolding as-is; it does not modify pattern files

### The Completeness Principle

**Scaffolding must be domain-adaptable without edits.**

The `patterns/` directory should be usable as-is for ANY domain. If the example needs to:

- ✓ **Import and use** scaffolding directly → Correct
- ✓ **Add domain-specific data** (products.json, prompts) → Correct
- ✓ **Extend with domain fields** (recommendation, confidence) → Correct
- ✗ **Modify scaffolding code to make it work** → Bug in scaffolding

**The Test**: Can someone copy `patterns/` into a completely different project (restaurant finder, code reviewer, travel planner) and use it without modification?

- If **no** → The scaffolding is incomplete; fix it there
- If **yes** → The scaffolding is correct

This means:
- Generic utilities, types, and patterns belong in `patterns/`
- Domain-specific data, prompts, and tools belong in `example/`
- If you find yourself wanting to edit `patterns/*.ts` to make `example/` work, that's a signal to improve the scaffolding's genericity first

## Key Patterns Demonstrated

Pattern numbers follow `PATTERNS.md` (hierarchical by category, not file number):

| Pattern | Name | Scaffolding File | Example |
|---------|------|------------------|---------|
| 1.1 | The Loop | `01-the-loop.ts` | `index.ts` |
| 3.1 | Complete Action Spaces | `04-complete-action-spaces.ts` | `tools/index.ts` |
| 3.2 | Explicit Termination | `05-explicit-termination.ts` | `tools/done.ts` |
| 3.3 | Tool Validation | `06-tool-validation.ts` | `tools/*.ts` |
| 4.2 | Event-Sourced State | `08-event-sourced-state.ts` | `state/` |
| 7.1 | Single-Level Delegation | `13-single-level-delegation.ts` | referenced in coordinator |
| 7.2 | Coordinator | `14-coordinator.ts` | `orchestration/coordinator.ts` |
| 8.1 | Statistical Evaluation | `15-evaluation.ts` | `evaluation/runner.ts` |

**Note**: Pattern numbers (e.g., 3.2) come from `PATTERNS.md` categories, not from file prefixes (e.g., 05-).

## Running the Example

```bash
# Basic loop with mock LLM
npm run example:mock

# Basic loop with real LLM (requires OPENROUTER_API_KEY in .env.local)
npm run example

# Coordinator mode with mock LLM
npm run example:coordinator:mock

# Coordinator mode with real LLM
npm run example:coordinator

# Type checking
npm run typecheck
```

## Running Evaluations

```bash
# Run evaluation with real LLM (3 scenarios, 5 runs each)
npx tsx example/evaluation/runner.ts

# Run with mock LLM (deterministic, for testing infrastructure)
npx tsx example/evaluation/runner.ts --mock

# Run all 8 scenarios
npx tsx example/evaluation/runner.ts --full

# Run specific scenario by index
npx tsx example/evaluation/runner.ts --scenario=2
```

Evaluation scenarios are defined in `example/evaluation/runner.ts` with difficulty tiers (easy/medium/hard) and success criteria based on the product catalog in `example/data/products.json`.
