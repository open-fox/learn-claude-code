# packages/ai - 统一 LLM API 抽象层

## 模块定位

`@mariozechner/pi-ai` 是整个 Agent 框架的 **LLM 通信基础层**。它将 10+ 种 LLM Provider（OpenAI、Anthropic、Google、AWS Bedrock、Azure、Mistral 等）统一到一套消息格式和流式 API 之下，让上层 Agent 代码无需关心具体 Provider 的差异。

## 核心设计理念

### 1. 统一消息模型

所有 Provider 的消息被标准化为三种角色：

```typescript
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

消息内容采用块式结构：

| 内容类型 | 说明 |
|---------|------|
| `TextContent` | 文本内容，可附带签名 |
| `ThinkingContent` | 推理/思考内容，支持签名和加密回传 |
| `ImageContent` | Base64 编码的图片 |
| `ToolCall` | 工具调用请求 |

### 2. Provider 注册制

采用 **Registry Pattern** 管理 LLM Provider：

```typescript
// 注册 Provider
registerApiProvider({
  api: "anthropic-messages",
  stream: streamAnthropic,       // 原始流接口
  streamSimple: streamSimpleAnthropic,  // 简化流接口
});

// 使用：按 Model.api 自动路由
const result = await stream(model, context, options);
```

支持的 API 协议 (`KnownApi`)：

| API | Provider |
|-----|----------|
| `anthropic-messages` | Anthropic Claude |
| `openai-completions` | OpenAI Chat Completions |
| `openai-responses` | OpenAI Responses API |
| `openai-codex-responses` | OpenAI Codex |
| `azure-openai-responses` | Azure OpenAI |
| `google-generative-ai` | Google Gemini |
| `google-gemini-cli` | Google Gemini CLI |
| `google-vertex` | Google Vertex AI |
| `bedrock-converse-stream` | AWS Bedrock |
| `mistral-conversations` | Mistral AI |

### 3. 懒加载机制

Provider 模块采用 **懒加载** (`import()`)，只在首次使用某个 Provider 时才加载其 SDK：

```typescript
function loadAnthropicProviderModule() {
  anthropicProviderModulePromise ||= import("./anthropic.js").then(module => ({
    stream: module.streamAnthropic,
    streamSimple: module.streamSimpleAnthropic,
  }));
  return anthropicProviderModulePromise;
}
```

这样避免了启动时加载所有 Provider SDK（如 @anthropic-ai/sdk、openai 等），显著减少冷启动时间。

## 核心数据结构

### Model

```typescript
interface Model<TApi extends Api> {
  id: string;           // e.g., "claude-opus-4-5"
  name: string;         // 显示名
  api: TApi;            // 使用哪个 API 协议
  provider: Provider;   // 属于哪个 Provider
  baseUrl: string;      // API 端点
  reasoning: boolean;   // 是否支持推理/思考模式
  input: ("text" | "image")[];  // 支持的输入类型
  cost: { input, output, cacheRead, cacheWrite };  // 每百万 token 价格
  contextWindow: number;  // 上下文窗口大小
  maxTokens: number;      // 最大输出 token
  compat?: OpenAICompletionsCompat;  // 兼容性配置
}
```

### Context (LLM 调用上下文)

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}
```

### Tool (工具定义)

```typescript
interface Tool<TParameters extends TSchema = TSchema> {
  name: string;
  description: string;
  parameters: TParameters;  // TypeBox JSON Schema
}
```

## 流式事件协议

`AssistantMessageEvent` 是整个系统的流式通信协议：

```
start → [text_start → text_delta* → text_end]*
      → [thinking_start → thinking_delta* → thinking_end]*
      → [toolcall_start → toolcall_delta* → toolcall_end]*
      → done | error
```

每个事件携带 `partial: AssistantMessage`，允许 UI 实时渲染。

## StreamOptions 体系

```typescript
interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;     // 支持中断
  apiKey?: string;
  transport?: "sse" | "websocket" | "auto";
  cacheRetention?: "none" | "short" | "long";  // 缓存策略
  sessionId?: string;       // Provider 端缓存会话
  onPayload?: (payload, model) => payload;  // 拦截请求
  headers?: Record<string, string>;
  maxRetryDelayMs?: number;
  metadata?: Record<string, unknown>;
}

interface SimpleStreamOptions extends StreamOptions {
  reasoning?: ThinkingLevel;  // minimal | low | medium | high | xhigh
  thinkingBudgets?: ThinkingBudgets;
}
```

## Anthropic Provider 深度解析

以 Anthropic 为例，分析 Provider 实现的核心逻辑：

### OAuth / API Key / Copilot 三种认证模式

```typescript
function createClient(model, apiKey, ...): { client, isOAuthToken } {
  if (model.provider === "github-copilot") {
    // Bearer auth + 特殊 headers
  }
  if (isOAuthToken(apiKey)) {
    // OAuth Bearer + Claude Code 身份标识
    // headers: claude-code-20250219, oauth-2025-04-20
  }
  // 标准 API Key auth
}
```

### 思考模式（Thinking）

- **Adaptive Thinking** (Opus 4.6, Sonnet 4.6): 模型自主决定思考深度
- **Budget-based Thinking** (旧模型): 固定 token 预算
- **ThinkingLevel 映射**: minimal→low, low→low, medium→medium, high→high, xhigh→max

### Claude Code 兼容 ("隐身模式")

当使用 OAuth token 时，请求会附带 Claude Code 身份标识，让 Anthropic API 认为请求来自官方 CLI：

```typescript
const claudeCodeVersion = "2.1.75";
// 工具名转换: read → Read, bash → Bash
const toClaudeCodeName = (name) => ccToolLookup.get(name.toLowerCase()) ?? name;
```

## 模型注册表 (Model Registry)

```typescript
// 从 models.generated.ts 加载预定义模型
const modelRegistry = new Map<string, Map<string, Model<Api>>>();

// 查找模型
function getModel(provider: "anthropic", modelId: "claude-opus-4-5"): Model<...>;
function getModels(provider: "anthropic"): Model<...>[];
function getProviders(): KnownProvider[];

// 成本计算
function calculateCost(model, usage): Usage["cost"];
```

`models.generated.ts` 由构建脚本自动生成，包含所有已知模型的完整信息（价格、上下文窗口、能力等）。

## 工具兼容层

`OpenAICompletionsCompat` 处理不同 OpenAI 兼容 API 的差异：

- `supportsStore` - 是否支持 `store` 字段
- `supportsDeveloperRole` - 是否支持 `developer` 角色
- `supportsReasoningEffort` - 是否支持推理等级
- `thinkingFormat` - 思考格式: "openai" | "openrouter" | "zai" | "qwen"
- `maxTokensField` - "max_completion_tokens" | "max_tokens"
- `requiresAssistantAfterToolResult` - 工具结果后是否需要 assistant 消息

## 对 Agent 框架的启示

1. **抽象要足够薄** - `stream()` 和 `complete()` 只有几行代码，核心逻辑在 Provider 实现中
2. **Registry + 懒加载** - 扩展性和性能的最佳平衡
3. **统一消息格式** - Agent 层不需要知道 Provider 的消息差异
4. **流式优先** - 所有操作都以流为基础，`complete()` 只是等待流结束
5. **错误编码进流** - Provider 错误不抛异常，而是通过流的 `error` 事件传递
