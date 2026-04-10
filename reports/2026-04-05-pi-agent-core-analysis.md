# pi-agent-core (packages/agent) — Repository Analysis

> Generated: 2026-04-05

## Repository Thesis

`@mariozechner/pi-agent-core` is the **foundational agent runtime** for the pi-mono ecosystem — a stateful, event-streaming agent loop that bridges the gap between raw LLM API calls and application-level agent behavior. Its single dominant idea is **separating the agent execution loop from both the LLM provider layer below and the UI/platform layer above**: it consumes `AgentMessage` (an extensible union type), transforms them to LLM-compatible `Message[]` only at the call boundary, executes tools, and emits a well-defined event stream that any UI or harness can subscribe to. The package is deliberately small (~1500 lines of source across 5 files), has a single runtime dependency (`@mariozechner/pi-ai`), and serves as the load-bearing layer for every agent in the monorepo — the coding agent CLI, the mom Slack/Discord bot, and the web UI all depend on it.

---

## Repository Shape

```
packages/agent/
├── src/
│   ├── index.ts          # Re-export barrel (4 modules)
│   ├── types.ts          # All type definitions (~340 lines)
│   ├── agent-loop.ts     # Low-level agent loop (async generator) (~630 lines)
│   ├── agent.ts          # High-level Agent class (stateful wrapper) (~540 lines)
│   └── proxy.ts          # Browser proxy stream function (~340 lines)
├── test/
│   ├── utils/
│   │   ├── calculate.ts      # Calculator tool fixture
│   │   └── get-current-time.ts  # Time tool fixture
│   ├── agent-loop.test.ts    # Low-level loop unit tests (8 test cases)
│   ├── agent.test.ts         # Agent class unit tests (13 test cases)
│   └── e2e.test.ts           # Integration tests with faux provider (9 test cases)
├── package.json
├── tsconfig.build.json
├── vitest.config.ts
├── CHANGELOG.md
└── README.md
```

### Package Identity

| Field | Value |
|---|---|
| npm name | `@mariozechner/pi-agent-core` |
| Version | 0.64.0 (lockstep with monorepo) |
| Type | ESM library |
| Language | TypeScript (compiled via `tsgo`) |
| Runtime dependency | `@mariozechner/pi-ai` only |
| Dev dependencies | `vitest`, `@types/node`, `typescript` |
| Node.js | >=20.0.0 |
| License | MIT |
| Test runner | vitest (30s timeout for API calls) |

### What This Package Is Not

This is not a CLI, not an application, not a bot. It is a **library** — a reusable agent runtime consumed by higher-level packages. It exports types, a class, and two standalone functions. It has no binary entry, no scripts directory, no config files beyond build/test, and no side effects on import.

---

## Execution Model

### Two Layers of API

The package exposes two levels of abstraction:

#### 1. Low-Level: `agentLoop()` / `agentLoopContinue()` (src/agent-loop.ts)

Stateless async generator functions that return an `EventStream<AgentEvent, AgentMessage[]>`. They:

- Accept a context snapshot, config, and optional abort signal
- Run the core turn loop: stream LLM response → check for tool calls → execute tools → check for steering/follow-up → repeat
- Emit events observationally — the stream does **not** wait for consumer processing before proceeding. This is a key design choice: it's the consumer's responsibility to keep up.
- Return the final messages array via `stream.result()`

```
agentLoop(prompts, context, config, signal?, streamFn?)
  → EventStream<AgentEvent, AgentMessage[]>
```

#### 2. High-Level: `Agent` class (src/agent.ts)

Stateful wrapper that:

- Owns the mutable `AgentState` (messages, tools, model, streaming status)
- Calls `runAgentLoop`/`runAgentLoopContinue` internally (not the `EventStream` versions — it uses the raw async functions with an emit callback)
- **Awaits subscribers in registration order** — this is the critical difference from the low-level API. Event emission acts as a barrier: `message_end` processing completes before tool preflight begins.
- Manages steering and follow-up message queues with configurable drain modes (`"all"` or `"one-at-a-time"`)
- Tracks `isStreaming`, `streamingMessage`, `pendingToolCalls`, `errorMessage` as runtime-owned readonly state
- Exposes `abort()`, `waitForIdle()`, `reset()`
- `prompt()` and `continue()` throw if called while already streaming (prevents race conditions)

### The AgentMessage → Message Boundary

This is the architectural core of the package:

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                    (optional)                           (required)
```

- `AgentMessage` is a union of standard LLM `Message` types plus any custom types added via TypeScript declaration merging
- `convertToLlm()` is the **required** bridge function that filters/transforms `AgentMessage[]` into provider-compatible `Message[]`
- `transformContext()` is an **optional** hook for context window management (pruning, compaction, external injection)

This design means the agent loop is completely agnostic about what custom messages an application adds — compaction events, UI notifications, system events, etc. can all live in the message array without breaking the LLM call.

### Event Flow

The event system is the primary integration surface. The full event sequence for a tool-using prompt:

```
agent_start
  turn_start
    message_start (user)
    message_end   (user)
    message_start (assistant, with toolCall)
    message_update × N (streaming)
    message_end   (assistant)
    tool_execution_start (per tool)
    tool_execution_update × N (optional streaming)
    tool_execution_end (per tool)
    message_start (toolResult)
    message_end   (toolResult)
  turn_end
  turn_start
    message_start (assistant, final)
    message_update × N
    message_end   (assistant)
  turn_end
agent_end
```

Key semantics:
- `agent_end` is the last event emitted, but the run is not considered idle until all awaited `agent_end` listeners finish
- `message_update` is only emitted for assistant messages, and carries `assistantMessageEvent` with the delta
- `turn_end` includes both the assistant message and any tool results for that turn

### Tool Execution

Tool execution supports two modes (`toolExecution` config):

- **`parallel`** (default): Preflight (`prepareArguments` → validate → `beforeToolCall`) runs sequentially, then allowed tools execute concurrently. Final results are emitted in assistant source order regardless of completion order.
- **`sequential`**: Each tool call is fully processed before the next begins.

Tool lifecycle hooks:
- `prepareArguments`: Optional compatibility shim that transforms raw args before schema validation (useful for resumed sessions with outdated schemas)
- `beforeToolCall`: Can block execution (returns `{ block: true, reason: "..." }`)
- `afterToolCall`: Can override result content, details, or error flag

Error handling: tools should **throw** on failure; the loop catches errors and reports them as `isError: true` tool results to the LLM.

---

## Architectural Center of Gravity

### agent-loop.ts — The Core Loop

This ~630-line file contains the entire turn execution logic. Key functions:

| Function | Role |
|---|---|
| `runLoop()` | Main loop shared by prompt and continue paths. Outer loop handles follow-ups, inner loop handles tool calls and steering. |
| `streamAssistantResponse()` | Transforms context via `transformContext` → `convertToLlm`, resolves API key, calls stream function, processes streaming events, updates context in-place |
| `executeToolCallsParallel()` / `executeToolCallsSequential()` | Two tool execution strategies |
| `prepareToolCall()` | Tool lookup, argument preparation, validation, `beforeToolCall` hook. Returns either `PreparedToolCall` or `ImmediateToolCallOutcome` (for errors/blocks) |
| `executePreparedToolCall()` | Runs the tool, handles update events, catches errors |
| `finalizeExecutedToolCall()` | Runs `afterToolCall` hook, emits final events |

Design insight: The loop directly mutates `currentContext.messages` during streaming (replacing partial messages in-place). This means the context snapshot passed to `runLoop` is not truly immutable — the Agent class works around this by creating a fresh snapshot (`messages.slice()`) before each run.

### agent.ts — The State Manager

The `Agent` class adds three things the raw loop doesn't have:

1. **Mutable owned state** with accessor properties that copy arrays on assignment
2. **Awaited event emission** — listeners are called sequentially and awaited, making event processing a barrier
3. **Message queuing** — `PendingMessageQueue` class implements two drain modes for steering and follow-up

The `runWithLifecycle()` method is the lifecycle boundary: it creates an `AbortController`, sets `isStreaming`, runs the executor, handles failures, and resolves the idle promise.

### proxy.ts — Browser Bridge

A `streamProxy()` function that proxies LLM calls through a backend server via SSE. It reconstructs partial `AssistantMessage` objects from bandwidth-optimized proxy events (server strips the `partial` field from deltas). This enables browser apps to use the Agent without direct provider access.

---

## Distinctive Design Decisions

### Declaration Merging for Custom Messages

Rather than using a generic parameter or discriminated union factory, the package uses TypeScript's **declaration merging** on the `CustomAgentMessages` interface to allow downstream packages to add custom message types. This is a zero-runtime-cost approach — types are erased at compile time, and `convertToLlm` handles the actual filtering.

```typescript
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    notification: { role: "notification"; text: string; timestamp: number };
  }
}
```

This approach means any package in the monorepo can extend the message type without modifying agent-core.

### Observational vs Barrier Event Streams

The package deliberately offers two event consumption modes:
- **Low-level** (`agentLoop`/`agentLoopContinue`): Observational streams. Events fire and the loop continues regardless of consumer speed. No backpressure.
- **High-level** (`Agent`): Barrier-based. Each event is awaited across all listeners before the next phase proceeds. This is critical for the coding agent, where `message_end` processing (session persistence, compaction) must complete before tool preflight reads state.

This duality is called out explicitly in the README and is a conscious architectural choice, not an oversight.

### Copy-on-Assign State

`AgentState.tools` and `AgentState.messages` use accessor properties that `slice()` the provided array on assignment. This prevents external code from holding references that could mutate agent state unexpectedly. However, mutating the *returned* array does mutate internal state (documented behavior). This is a pragmatic middle ground — full immutability would require deep cloning, which is expensive for large message arrays.

### Thinking Level as First-Class Config

`ThinkingLevel` is not a boolean toggle but a 6-level scale (`"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`), with optional per-level token budgets (`ThinkingBudgets`). This reflects the package's awareness of reasoning-capable models where thinking depth is a meaningful tuning parameter.

---

## Quality Signals and Risks

### Positive Signals

- **Comprehensive test suite**: 30 test cases across 3 files — unit tests for the loop, unit tests for the Agent class, and integration tests using a faux provider. Test timeout is 30s, accommodating real API call scenarios.
- **Faux provider for testing**: `e2e.test.ts` uses `registerFauxProvider()` from `pi-ai` to create deterministic test models with configurable token speed and responses. This enables reliable integration testing without live API calls.
- **Clean dependency graph**: Only one runtime dependency (`@mariozechner/pi-ai`). No transitive dependencies that aren't already in pi-ai.
- **130+ versions**: The changelog shows active development since Jan 2026, with regular breaking changes that are clearly documented.
- **Strong contract documentation**: The README is ~450 lines and reads like an API reference, with event sequence diagrams, all hook signatures, and explicit behavioral contracts (e.g., "must not throw or reject").
- **Explicit error contracts**: `StreamFn`, `convertToLlm`, and `transformContext` all have documented "must not throw" contracts, with the loop handling errors at boundaries.

### Risks and Areas of Concern

1. **Context mutation during streaming**: `streamAssistantResponse()` pushes the partial message into `context.messages` and replaces it in-place as streaming events arrive. This means the context array is being mutated during iteration. The Agent class mitigates this by creating a snapshot, but direct `agentLoop` users must be aware.

2. **No backpressure on low-level streams**: The `agentLoop` EventStream pushes events without waiting for consumers. Fast tool execution could outpace a slow consumer (e.g., a network-bound UI), leading to buffered events. This is documented but could surprise users.

3. **`beforeToolCall` can mutate args by reference**: Test `agent-loop.test.ts` line 310-370 explicitly tests that mutating `args` in `beforeToolCall` propagates to tool execution without revalidation. This is intentional (documented as "execute mutated args") but creates an escape hatch around schema validation.

4. **Lockstep versioning with monorepo**: The package version (0.64.0) is pinned to `pi-ai@^0.64.0`. Any breaking change in pi-ai cascades here. The CHANGELOG shows this has caused real issues in sibling packages (mom v0.42.5 crash from API mismatch).

5. **No retry logic in the agent loop**: The loop handles `stopReason: "error"` by terminating immediately. Retry logic must be implemented by the consumer (the coding agent's `AgentSession` does this). This is a deliberate layering decision but means bare `Agent` users get no retries.

6. **Proxy module assumes SSE format**: `streamProxy()` parses `data: ` prefixed lines from an HTTP response body. There's no WebSocket or other transport option for the proxy path — only the direct path supports `transport` configuration.

---

## Unknowns Worth Verifying

- **`EventStream` implementation**: The stream class is imported from `@mariozechner/pi-ai` and is critical to both `agentLoop` and `streamProxy`. Its buffering, error propagation, and `result()` semantics are not defined in this package.
- **`validateToolArguments` behavior**: Imported from `pi-ai`, used for schema validation in `prepareToolCall`. Its error format and strictness affect how tool call failures surface.
- **`parseStreamingJson` in proxy.ts**: Used to reconstruct partial JSON from toolcall deltas. Its behavior on malformed JSON determines proxy resilience.
- **Thread safety of `PendingMessageQueue`**: The queue uses synchronous array operations. If `steer()` or `followUp()` are called from multiple async contexts simultaneously, there could be race conditions — though in practice Node.js single-threading mitigates this.

---

## How To Build, Test, and Use

### Build

```bash
npm run build     # tsgo -p tsconfig.build.json
npm run dev       # tsgo watch mode
npm run clean     # rm -rf dist
```

### Test

```bash
npm test          # vitest --run (30s timeout)
```

Tests use mock streams and a faux provider — no API keys needed for unit/integration tests. The `e2e.test.ts` file tests against `registerFauxProvider()` which simulates streaming with configurable token rates.

### Usage

```typescript
// High-level (recommended for most use cases)
import { Agent } from "@mariozechner/pi-agent-core";
const agent = new Agent({
  initialState: { systemPrompt: "...", model: getModel("anthropic", "claude-sonnet-4-20250514") },
});
agent.subscribe(async (event, signal) => { /* handle events */ });
await agent.prompt("Hello!");

// Low-level (for custom harnesses)
import { agentLoop } from "@mariozechner/pi-agent-core";
for await (const event of agentLoop([userMsg], context, config)) {
  console.log(event.type);
}

// Browser proxy
import { Agent, streamProxy } from "@mariozechner/pi-agent-core";
const agent = new Agent({
  streamFn: (model, ctx, opts) => streamProxy(model, ctx, { ...opts, authToken: "...", proxyUrl: "..." }),
});
```

---

## Summary

`pi-agent-core` is a well-factored, deliberately minimal agent runtime that does one thing well: it runs a turn-based LLM agent loop with tool execution, event streaming, and extensible message types. Its key contribution to the pi-mono architecture is the **AgentMessage/Message boundary** — allowing higher-level packages (coding-agent, mom) to add arbitrary custom message types without modifying the core loop. The dual-API design (observational streams for advanced users, barrier-based Agent class for most consumers) is a thoughtful concession to real-world needs. The test suite is solid with 30 cases covering the critical path, and the faux provider pattern enables deterministic testing without API keys. The main risk is the tight lockstep versioning with pi-ai and the context mutation pattern during streaming, both of which require careful attention from downstream consumers.
