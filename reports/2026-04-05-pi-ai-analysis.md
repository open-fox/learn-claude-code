# pi-ai (packages/ai) — Repository Analysis

> Generated: 2026-04-05

## Repository Thesis

`@mariozechner/pi-ai` is the **foundational LLM abstraction layer** for the pi-mono ecosystem — a unified API that normalizes 20+ LLM providers behind a single streaming interface with automatic model discovery, token/cost tracking, cross-provider message handoffs, and tool call support. Its central bet is that every LLM provider can be reduced to the same streaming event protocol (`AssistantMessageEvent`), and that conversations should be serializable, transferable between providers, and resumable after aborts. The package is the largest in the monorepo (~100 source files across providers, utils, types, and OAuth), carries the heaviest dependency footprint (official SDKs for Anthropic, OpenAI, Google, Mistral, AWS Bedrock, plus AJV, TypeBox, partial-json), and is the dependency everything else in pi-mono builds on. It is both a library and a CLI tool (`pi-ai login/list` for OAuth flows).

---

## Repository Shape

```
packages/ai/
├── src/
│   ├── index.ts                   # Barrel export (~35 lines)
│   ├── types.ts                   # Core types: Model, Message, Context, events (~340 lines)
│   ├── stream.ts                  # Top-level stream/complete/streamSimple/completeSimple
│   ├── api-registry.ts            # Global API provider registry (Map-based)
│   ├── models.ts                  # Model registry + cost calculation + getModel()
│   ├── models.generated.ts        # Auto-generated model catalog (from scripts/generate-models.ts)
│   ├── env-api-keys.ts            # Environment variable → API key resolution (browser-safe)
│   ├── cli.ts                     # `pi-ai login/list` CLI entry point
│   ├── oauth.ts                   # OAuth entry point (separate export path)
│   ├── bedrock-provider.ts        # Bedrock shim (separate export path for Bun compat)
│   ├── providers/
│   │   ├── register-builtins.ts   # Lazy-loading registration for all 10 API providers
│   │   ├── transform-messages.ts  # Cross-provider message normalization
│   │   ├── simple-options.ts      # Unified thinking level → provider-specific options
│   │   ├── google-shared.ts       # Shared Google/Vertex/GeminiCLI logic
│   │   ├── openai-responses-shared.ts  # Shared OpenAI/Azure/Codex Responses logic
│   │   ├── github-copilot-headers.ts   # Copilot-specific header injection
│   │   ├── faux.ts                # Deterministic mock provider for tests
│   │   ├── anthropic.ts           # Anthropic Messages API
│   │   ├── openai-completions.ts  # OpenAI Chat Completions API
│   │   ├── openai-responses.ts    # OpenAI Responses API
│   │   ├── openai-codex-responses.ts  # OpenAI Codex Responses API (WebSocket support)
│   │   ├── azure-openai-responses.ts  # Azure OpenAI Responses API
│   │   ├── google.ts              # Google Generative AI API
│   │   ├── google-vertex.ts       # Google Vertex AI API
│   │   ├── google-gemini-cli.ts   # Google Gemini CLI API
│   │   ├── mistral.ts             # Mistral Conversations API
│   │   └── amazon-bedrock.ts      # AWS Bedrock Converse API
│   └── utils/
│       ├── event-stream.ts        # EventStream<T,R> async iterable + result() promise
│       ├── json-parse.ts          # Streaming JSON parser for tool call deltas
│       ├── validation.ts          # AJV-based tool argument validation
│       ├── overflow.ts            # Context overflow detection across providers
│       ├── typebox-helpers.ts     # StringEnum + TypeBox utilities
│       ├── sanitize-unicode.ts    # Unicode surrogate pair handling
│       ├── hash.ts                # Tool call ID normalization
│       └── oauth/                 # OAuth flows for 5 providers (9 files)
├── test/                          # 46 test files
├── scripts/
│   ├── generate-models.ts         # Fetches model catalogs from providers, generates models.generated.ts
│   └── generate-test-image.ts     # Test fixture generator
├── package.json
├── vitest.config.ts
├── tsconfig.build.json
├── bedrock-provider.d.ts          # Bedrock subpath type shim
├── bedrock-provider.js            # Bedrock subpath JS shim
├── CHANGELOG.md
└── README.md                      # ~1300 lines, comprehensive API reference
```

### Package Identity

| Field | Value |
|---|---|
| npm name | `@mariozechner/pi-ai` |
| Version | 0.64.0 (lockstep with monorepo) |
| Type | ESM library + CLI |
| Binary | `pi-ai` (OAuth login/list) |
| Node.js | >=20.0.0 |
| Exports | Main (`.`), 10 provider subpaths, `./oauth`, `./bedrock-provider` |
| Runtime deps | 12 (official SDKs + AJV + TypeBox + partial-json + proxy-agent + undici) |
| License | MIT |

### What This Package Does

1. **Unified streaming API**: `stream()`, `complete()`, `streamSimple()`, `completeSimple()` work across all providers
2. **Model registry**: Auto-generated catalog with pricing, context window, reasoning capability for every model
3. **Cross-provider handoffs**: Messages from Provider A can be sent to Provider B with automatic thinking block transformation
4. **Tool support**: TypeBox schemas, AJV validation, streaming partial JSON arguments
5. **OAuth flows**: Login to Anthropic, OpenAI Codex, GitHub Copilot, Google Gemini CLI, Antigravity
6. **Cost tracking**: Per-request token usage and cost calculation at model-specific rates
7. **Browser compatibility**: Dynamic Node.js imports, explicit API key passing, separate OAuth entry point

---

## Execution Model

### The Four Entry Points

```typescript
// Provider-specific (full options, typed by API)
stream(model, context, options?)           → AssistantMessageEventStream
complete(model, context, options?)         → Promise<AssistantMessage>

// Unified (reasoning level as simple string)
streamSimple(model, context, options?)     → AssistantMessageEventStream
completeSimple(model, context, options?)   → Promise<AssistantMessage>
```

All four resolve the API provider from the model's `api` field via the global registry, then delegate. `complete`/`completeSimple` are sugar that call `stream`/`streamSimple` and await `.result()`.

### The Streaming Event Protocol

Every provider must produce the same event sequence:

```
start → (text_start → text_delta* → text_end)* 
       (thinking_start → thinking_delta* → thinking_end)*
       (toolcall_start → toolcall_delta* → toolcall_end)*
       → done | error
```

The `AssistantMessageEvent` union type (12 variants) carries a `partial` AssistantMessage that's progressively updated. The final `done`/`error` event carries the complete message. This protocol is the contract that every provider must fulfill.

### Lazy Provider Loading

Providers are **lazily loaded** on first use via `register-builtins.ts`. Each provider module is behind a `Promise<LazyProviderModule>` that's resolved only when that API is first called. This means importing `@mariozechner/pi-ai` doesn't eagerly load Anthropic SDK, OpenAI SDK, AWS SDK, etc. — a critical optimization since the combined SDK weight is substantial.

The lazy loading pattern:
1. `registerApiProvider()` registers a thin wrapper that returns an `AssistantMessageEventStream`
2. On first call, the wrapper triggers `import("./anthropic.js")` (or whichever provider)
3. The inner stream is forwarded to an outer `EventStream` via `forwardStream()`
4. Subsequent calls reuse the cached module promise

### Model Discovery

Models are generated at build time by `scripts/generate-models.ts`, which fetches catalogs from provider APIs (models.dev, etc.) and writes `models.generated.ts`. This file is a large TypeScript object literal mapping `provider → modelId → Model<Api>`. The `getModel()` function provides fully typed autocomplete for both provider and model ID.

### Cross-Provider Message Transformation

`transform-messages.ts` handles the critical cross-provider replay problem:

- **User messages**: Pass through unchanged
- **Tool results**: Tool call IDs are normalized (Anthropic requires `^[a-zA-Z0-9_-]+$`, OpenAI generates 450+ char IDs)
- **Same-provider assistant messages**: Preserved as-is (including thinking signatures for continuation)
- **Cross-provider assistant messages**: Thinking blocks converted to plain text, provider-specific metadata stripped, tool call IDs renormalized

This enables the coding agent to switch models mid-session without losing context.

---

## Architectural Center of Gravity

### types.ts — The Canonical Schema

This ~340-line file defines everything: `Model`, `Message`, `Context`, `Tool`, `AssistantMessage`, `Usage`, `StopReason`, `AssistantMessageEvent`, `StreamOptions`, `OpenAICompletionsCompat`. Every provider must produce `AssistantMessage` and emit `AssistantMessageEvent`. Every consumer works with `Context` and `Message[]`. This is the single most important file in the package.

### api-registry.ts — The Provider Dispatch

A global `Map<string, RegisteredApiProvider>` that maps API identifiers to stream functions. The registry supports:
- `registerApiProvider()` — add a provider
- `unregisterApiProviders(sourceId)` — remove by source (used by faux provider cleanup)
- `clearApiProviders()` + `registerBuiltInApiProviders()` — reset to defaults

### EventStream<T, R> — The Streaming Primitive

A custom async iterable with a critical dual nature:
1. **Push-based producer side**: `push(event)`, `end(result?)`
2. **Pull-based consumer side**: `for await (const event of stream)`

It buffers events when the consumer is slower than the producer, and resolves a `result()` promise when the terminal event arrives. This class is the foundation for both provider streams and the agent loop's event system.

### Provider Implementation Pattern

Each provider (e.g., `anthropic.ts`) follows this structure:
1. Export `streamAnthropic(model, context, options)` — the raw provider-specific function
2. Export `streamSimpleAnthropic(model, context, options)` — maps unified `reasoning` level to provider options
3. Internally: convert `Context` → provider request format, call provider SDK, parse SSE/WebSocket response, emit standardized `AssistantMessageEvent`s
4. Handle provider quirks: tool call ID formats, thinking block signatures, cache headers, retry delays

### The OpenAI Completions Compat System

The `openai-completions` API serves 10+ providers (xAI, Groq, Cerebras, OpenRouter, Vercel Gateway, zAI, MiniMax, Ollama, vLLM, etc.) through a single implementation with an extensive compatibility layer:

```typescript
interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  supportsStrictMode?: boolean;
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  thinkingFormat?: 'openai' | 'openrouter' | 'zai' | 'qwen' | 'qwen-chat-template';
  // ... routing options for OpenRouter and Vercel Gateway
}
```

Defaults are auto-detected from `baseUrl`. This design allows a single provider implementation to handle the fragmented OpenAI-compatible ecosystem.

---

## Distinctive Design Decisions

### Build-Time Model Generation

Rather than discovering models at runtime or hardcoding them, models are fetched from provider APIs at build time and compiled into `models.generated.ts`. This means:
- **Zero runtime API calls** for model discovery
- **Fully typed autocomplete** for `getModel('provider', 'modelId')`
- Model pricing and capabilities are frozen per release
- Adding a new model requires a rebuild (`npm run generate-models`)

### Browser-Safe by Design

The package avoids top-level Node.js imports entirely. `env-api-keys.ts` dynamically imports `node:fs`, `node:os`, `node:path` only in Node.js/Bun environments. AWS Bedrock is behind a separate export path (`./bedrock-provider`) because its SDK doesn't work in browsers. OAuth is similarly isolated to `./oauth`.

### Faux Provider for Testing

`registerFauxProvider()` creates a temporary in-memory provider with scripted responses, configurable token speed, and simulated cache behavior. It generates unique API/provider IDs to avoid collisions, and `registration.unregister()` cleans up. This enables deterministic tests for the agent loop and coding agent without any API keys.

### Error Protocol in Streams

The package enforces a strict contract: stream functions **must not throw**. All errors must be encoded in the stream as an `error` event carrying an `AssistantMessage` with `stopReason: "error"` or `"aborted"` and `errorMessage`. This prevents unhandled rejections from breaking consumer async iterators.

### The `simple` vs `raw` API Split

- `stream()`/`complete()` accept provider-specific options (e.g., `thinkingBudgetTokens` for Anthropic, `reasoningEffort` for OpenAI)
- `streamSimple()`/`completeSimple()` accept a unified `reasoning: "low"|"medium"|"high"` level that each provider maps to its native thinking/reasoning config

The `simple-options.ts` module handles this mapping. This split lets the agent-core package use the unified API while still allowing direct provider access for power users.

---

## Quality Signals and Risks

### Positive Signals

- **Extensive test suite**: 46 test files covering streaming, abort, tokens, unicode, cross-provider handoffs, overflow, images, tool calls, validation, OAuth, and provider-specific edge cases
- **Active maintenance**: 130+ versions with detailed CHANGELOG entries, community PRs from multiple contributors
- **Comprehensive README**: ~1300 lines functioning as a complete API reference with code examples for every feature
- **Documented provider addition checklist**: README includes an 8-step guide for adding new providers, covering types, implementation, registry, models, tests, coding-agent integration, docs, and changelog
- **Lazy loading**: Provider SDKs aren't loaded until first use, reducing startup cost significantly

### Risks and Concerns

1. **Massive dependency surface**: 12 runtime dependencies including full official SDKs for Anthropic, OpenAI, Google, Mistral, and AWS. Dependency conflicts or breaking SDK updates cascade directly. The `@mistralai/mistralai` version is pinned at `1.14.1` (not a caret range), suggesting past breakage.

2. **Generated model file freshness**: `models.generated.ts` is only updated at build time. Between releases, newly added models from providers won't appear until someone runs `npm run generate-models` and publishes. Users on older versions may have stale pricing data.

3. **OpenAI Completions compat complexity**: The `OpenAICompletionsCompat` interface has 12+ fields to handle provider quirks. Each new OpenAI-compatible provider may need URL-based auto-detection rules or explicit compat overrides. This is the most fragile part of the codebase.

4. **Global mutable registry**: The API provider registry is a module-level `Map`. `registerBuiltInApiProviders()` runs as a side effect of importing `register-builtins.ts`. Tests that modify the registry need careful cleanup (the faux provider handles this with `unregister()`).

5. **No rate limiting or retry built-in**: The package provides `maxRetryDelayMs` to cap server-requested delays, but has no retry logic itself. Consumers must implement retries.

6. **Browser + Bedrock incompatibility**: Bedrock models appear in the model registry even in browser builds but fail at runtime. The README documents this, but it's a potential footgun.

7. **OAuth credential storage is caller's responsibility**: The login functions return credentials but don't persist them. The CLI saves to `auth.json` in the current directory, but programmatic users must manage storage themselves.

---

## Provider Coverage Map

| API Identifier | Provider(s) | SDK/Protocol |
|---|---|---|
| `anthropic-messages` | Anthropic | `@anthropic-ai/sdk` |
| `openai-responses` | OpenAI | `openai` SDK (Responses API) |
| `azure-openai-responses` | Azure OpenAI | `openai` SDK (Azure endpoint) |
| `openai-codex-responses` | OpenAI Codex | `openai` SDK + WebSocket |
| `openai-completions` | OpenAI, xAI, Groq, Cerebras, OpenRouter, Vercel, zAI, MiniMax, HuggingFace, OpenCode, Kimi, Ollama, vLLM, etc. | `openai` SDK (Chat Completions) |
| `google-generative-ai` | Google | `@google/genai` |
| `google-vertex` | Google Vertex AI | `@google/genai` + ADC |
| `google-gemini-cli` | Google Gemini CLI, Antigravity | `@google/genai` + OAuth |
| `mistral-conversations` | Mistral | `@mistralai/mistralai` |
| `bedrock-converse-stream` | Amazon Bedrock | `@aws-sdk/client-bedrock-runtime` |

---

## How To Build, Test, and Use

### Build

```bash
npm run generate-models   # Fetch model catalogs from providers
npm run build             # generate-models + tsgo compile
npm run dev               # tsgo watch mode (no model generation)
```

### Test

```bash
npm test                  # vitest --run (30s timeout)
```

Most tests require API keys in environment variables. The faux provider tests and unit tests work without keys.

### CLI

```bash
npx @mariozechner/pi-ai login              # Interactive OAuth provider selection
npx @mariozechner/pi-ai login anthropic    # Login to specific provider
npx @mariozechner/pi-ai list               # List available OAuth providers
```

### Usage

```typescript
import { getModel, stream, complete, streamSimple, Type, StringEnum } from '@mariozechner/pi-ai';

// Get a typed model
const model = getModel('anthropic', 'claude-sonnet-4-20250514');

// Stream with provider-specific options
const s = stream(model, { messages: [{ role: 'user', content: 'Hello' }] }, {
  thinkingEnabled: true, thinkingBudgetTokens: 8192
});
for await (const event of s) { /* handle events */ }
const message = await s.result();

// Or use unified reasoning API
const response = await completeSimple(model, context, { reasoning: 'medium' });
```

---

## Summary

`@mariozechner/pi-ai` is an ambitious and well-executed unified LLM API that normalizes 20+ providers and 10 distinct API protocols behind a single streaming event interface. Its key architectural contributions are: (1) the `AssistantMessageEvent` streaming protocol that all providers must produce, (2) build-time model generation for typed autocomplete without runtime API calls, (3) lazy provider loading to avoid SDK bloat at import time, (4) cross-provider message transformation for mid-session model switching, and (5) the OpenAI Completions compat system that handles the fragmented OpenAI-compatible ecosystem through a single implementation with 12+ feature flags. The main risks are the large dependency surface, the complexity of the compat system, and the stale model data between releases. The 46-file test suite and 1300-line README demonstrate serious investment in quality and documentation.
