# packages/agent - Agent 核心运行时

## 模块定位

`@mariozechner/pi-agent-core` 是整个框架的 **Agent 运行时核心**，只有 5 个源文件，却实现了完整的 Agent 循环：消息管理、LLM 调用、工具执行、事件分发、状态管理。它是 "coding-agent" 和 "mom" 等上层应用的基础。

## 架构概览

```
┌─────────────────────────────────────────────┐
│                Agent (状态容器)               │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │ State   │  │ Queues   │  │ Listeners  │  │
│  │ messages│  │ steering │  │ subscribe()│  │
│  │ model   │  │ followUp │  │            │  │
│  │ tools   │  │          │  │            │  │
│  └─────────┘  └──────────┘  └────────────┘  │
│         │                                    │
│    ┌────▼─────────────────────────────┐      │
│    │       Agent Loop (agent-loop.ts)  │      │
│    │  prompt → stream → tools → loop   │      │
│    └──────────────────────────────────┘      │
│         │                                    │
│    ┌────▼─────────────────────────────┐      │
│    │       Proxy (proxy.ts)            │      │
│    │  SSE proxy for server-side auth   │      │
│    └──────────────────────────────────┘      │
└─────────────────────────────────────────────┘
```

## 源文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| `types.ts` | ~340 | 所有类型定义 |
| `agent.ts` | ~540 | Agent 类（状态容器 + 队列管理） |
| `agent-loop.ts` | ~630 | Agent 循环（LLM 调用 + 工具执行） |
| `proxy.ts` | ~340 | SSE 代理流（用于通过服务端中转 LLM 请求） |
| `index.ts` | - | 导出 |

## 核心概念

### 1. Agent 类 - 有状态的 Agent 容器

```typescript
class Agent {
  // 状态
  private _state: MutableAgentState;
  
  // 事件系统
  private listeners: Set<(event: AgentEvent) => void>;
  
  // 消息队列
  private steeringQueue: PendingMessageQueue;  // 中断当前轮次
  private followUpQueue: PendingMessageQueue;  // 等待空闲时执行
  
  // 可插拔的钩子
  convertToLlm: (messages: AgentMessage[]) => Message[];
  transformContext?: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
  streamFn: StreamFn;           // LLM 调用函数
  getApiKey?: (provider) => Promise<string>;
  beforeToolCall?: (context) => Promise<BeforeToolCallResult>;
  afterToolCall?: (context) => Promise<AfterToolCallResult>;
}
```

### 2. AgentState - Agent 的可观察状态

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];      // 可用工具
  messages: AgentMessage[];     // 对话记录
  isStreaming: boolean;         // 是否正在流式响应
  streamingMessage?: AgentMessage;  // 当前流式消息
  pendingToolCalls: ReadonlySet<string>;  // 正在执行的工具
  errorMessage?: string;
}
```

### 3. AgentMessage - 可扩展的消息类型

```typescript
// 基础 LLM 消息
type Message = UserMessage | AssistantMessage | ToolResultMessage;

// Agent 消息 = LLM 消息 + 自定义消息
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

// 通过 declaration merging 扩展
declare module "@mariozechner/agent" {
  interface CustomAgentMessages {
    artifact: ArtifactMessage;
    notification: NotificationMessage;
  }
}
```

这个设计允许应用层添加自定义消息类型（如 Bash 执行结果、压缩摘要等），而不影响核心 Agent 循环。

### 4. AgentTool - 工具定义

```typescript
interface AgentTool<TParameters, TDetails> extends Tool<TParameters> {
  label: string;  // 人类可读标签
  
  // 参数预处理
  prepareArguments?: (args: unknown) => Static<TParameters>;
  
  // 执行函数
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;
}
```

## Agent Loop 详解

Agent 循环是整个框架的核心，位于 `agent-loop.ts`。

### 主循环结构

```
外循环: while (true)
  内循环: while (hasMoreToolCalls || pendingMessages)
    1. 处理待处理消息 (steering messages)
    2. 调用 LLM 获取 assistant 响应
    3. 如果是 error/aborted → 退出
    4. 提取 tool calls
    5. 执行工具 → 收集 tool results
    6. 检查 steering 队列
  检查 follow-up 队列 → 有消息就继续外循环
  无消息 → 退出
```

### 消息转换管道

```
AgentMessage[] 
  → transformContext()     // 可选: 裁剪、注入上下文
  → convertToLlm()        // AgentMessage[] → Message[]
  → LLM Context           // systemPrompt + messages + tools
  → streamFn()            // 调用 LLM
  → AssistantMessage      // 流式返回
```

### 工具执行模式

```typescript
type ToolExecutionMode = "sequential" | "parallel";
```

**Sequential**: 逐个执行工具，每个工具完成后再执行下一个。

**Parallel** (默认): 
1. **顺序**预处理所有工具调用（验证参数、beforeToolCall 钩子）
2. **并行**执行通过预处理的工具
3. **顺序**收集结果（保持 assistant 消息中的原始顺序）

### 工具执行钩子

```
[LLM 返回 tool_call]
  → prepareToolCallArguments()  // 参数适配
  → validateToolArguments()     // Schema 校验
  → beforeToolCall()            // 拦截: 可阻止执行
  → tool.execute()              // 实际执行
  → afterToolCall()             // 后处理: 可修改结果
  → emit tool_execution_end
```

## 事件系统

### AgentEvent 类型

```typescript
type AgentEvent =
  // Agent 生命周期
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  // Turn 生命周期 (一次 assistant 响应 + 工具调用)
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  // 消息生命周期
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: ... }
  | { type: "message_end"; message: AgentMessage }
  // 工具执行生命周期
  | { type: "tool_execution_start"; toolCallId; toolName; args }
  | { type: "tool_execution_update"; toolCallId; toolName; partialResult }
  | { type: "tool_execution_end"; toolCallId; toolName; result; isError };
```

### 消息队列系统

Agent 支持两种消息队列，实现"人机协同"：

| 队列 | 时机 | 用途 |
|------|------|------|
| **Steering** | 当前 turn 完成后、下次 LLM 调用前 | 中途引导 Agent |
| **Follow-up** | Agent 完全空闲时 | 追加任务 |

两种队列模式：
- `"all"` - 一次性消费所有待处理消息
- `"one-at-a-time"` - 每次只消费一条

## Proxy Stream

`proxy.ts` 实现了 SSE 代理流，用于需要通过服务端中转 LLM 请求的场景（如服务端管理 API Key）。

```typescript
function streamProxy(model, context, options: ProxyStreamOptions): ProxyMessageEventStream {
  // 1. POST 请求到 proxyUrl/api/stream
  // 2. 读取 SSE 流
  // 3. 解析 ProxyAssistantMessageEvent
  // 4. 客户端重建 partial AssistantMessage
  // 5. 转发为标准 AssistantMessageEvent
}
```

关键优化：服务端传输的 `ProxyAssistantMessageEvent` 省略了 `partial` 字段，减少带宽。客户端根据 delta 事件自行重建 partial message。

## 对 Agent 框架设计的启示

### 1. 消息类型可扩展

通过 TypeScript declaration merging 让应用层可以添加自定义消息类型，而核心循环只处理标准 LLM 消息。`convertToLlm()` 负责过滤和转换。

### 2. 关注点分离

- **Agent 类**: 状态管理 + 队列管理 + 事件分发
- **Agent Loop**: 纯逻辑，无状态，只操作传入的 context
- **工具系统**: 独立的类型和执行管道

### 3. 可中断设计

- 每个操作接受 `AbortSignal`
- Agent 暴露 `abort()` 方法
- `waitForIdle()` 等待当前运行完成

### 4. 钩子系统

`beforeToolCall` / `afterToolCall` 是 Agent Harness 的核心扩展点：
- 权限控制（阻止危险工具）
- 审计日志
- 结果过滤/修改
- 用户确认

### 5. 流式优先

整个系统从 LLM 调用到事件分发都是流式的，保证 UI 实时性。`agent_end` 事件的 listener 也是 run 的一部分，确保所有清理逻辑执行完毕才算真正空闲。
