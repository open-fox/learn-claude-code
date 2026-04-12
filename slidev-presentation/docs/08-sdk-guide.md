# Pi SDK 二次开发指南

## 概述

Pi 的分层架构使其可以在不同层级进行二次开发。根据你的需求，可以选择不同的集成深度：

| 层级 | 包 | 适用场景 |
|------|-----|---------|
| Level 1 | `@mariozechner/pi-ai` | 只需要统一的 LLM API |
| Level 2 | `@mariozechner/pi-agent-core` | 需要 Agent 循环 + 工具执行 |
| Level 3 | `@mariozechner/pi-coding-agent` | 需要完整的编码 Agent 能力 |
| 扩展 | Extensions | 在现有 CLI 基础上添加功能 |

---

## Level 1: 使用 pi-ai 作为 LLM 抽象层

### 安装

```bash
npm install @mariozechner/pi-ai
```

### 基础用法

```typescript
import { getModel, stream, complete, streamSimple } from "@mariozechner/pi-ai";

// 1. 获取预定义模型
const model = getModel("anthropic", "claude-opus-4-5");

// 2. 构建上下文
const context = {
  systemPrompt: "你是一个有用的助手。",
  messages: [
    { role: "user", content: "Hello!", timestamp: Date.now() }
  ],
};

// 3. 流式调用
const response = streamSimple(model, context, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  reasoning: "high",  // 启用推理
  maxTokens: 4096,
});

// 4. 处理流式事件
for await (const event of response) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}

// 5. 获取最终结果
const result = await response.result();
console.log("Usage:", result.usage);
```

### 带工具的调用

```typescript
import { Type } from "@mariozechner/pi-ai";

const context = {
  systemPrompt: "Use tools when needed.",
  messages: [{ role: "user", content: "What's the weather?", timestamp: Date.now() }],
  tools: [{
    name: "get_weather",
    description: "Get current weather for a location",
    parameters: Type.Object({
      location: Type.String({ description: "City name" }),
    }),
  }],
};

const result = await complete(model, context, { apiKey: "..." });

for (const block of result.content) {
  if (block.type === "toolCall") {
    console.log(`Tool: ${block.name}, Args:`, block.arguments);
  }
}
```

### 自定义 Provider

```typescript
import { registerApiProvider } from "@mariozechner/pi-ai";

// 注册自定义 API Provider
registerApiProvider({
  api: "my-custom-api",
  stream: (model, context, options) => {
    // 实现流式调用逻辑
    // 返回 AssistantMessageEventStream
  },
  streamSimple: (model, context, options) => {
    // 实现简化流式调用
  },
}, "my-source-id");
```

---

## Level 2: 使用 pi-agent-core 构建自定义 Agent

### 安装

```bash
npm install @mariozechner/pi-agent-core @mariozechner/pi-ai
```

### 基础 Agent

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, Type } from "@mariozechner/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个代码审查助手。",
    model: getModel("anthropic", "claude-sonnet-4-5"),
    thinkingLevel: "medium",
    tools: [{
      name: "analyze_code",
      label: "Analyze Code",
      description: "Analyze code quality",
      parameters: Type.Object({
        code: Type.String({ description: "Code to analyze" }),
      }),
      execute: async (toolCallId, params) => ({
        content: [{ type: "text", text: `Analysis of: ${params.code.substring(0, 50)}...` }],
        details: { complexity: "medium" },
      }),
    }],
  },
});

// 订阅事件
agent.subscribe(async (event) => {
  switch (event.type) {
    case "message_update":
      // 流式更新 UI
      break;
    case "tool_execution_start":
      console.log(`Executing: ${event.toolName}`);
      break;
    case "tool_execution_end":
      console.log(`Done: ${event.toolName}, error: ${event.isError}`);
      break;
  }
});

// 发送消息
await agent.prompt("请分析这段代码的质量");

// 等待完成
await agent.waitForIdle();
```

### 动态 API Key

```typescript
const agent = new Agent({
  getApiKey: async (provider) => {
    // 从 Vault/环境变量/OAuth 获取
    return process.env[`${provider.toUpperCase()}_API_KEY`];
  },
});
```

### 工具拦截

```typescript
const agent = new Agent({
  beforeToolCall: async ({ toolCall, args }) => {
    // 阻止危险操作
    if (toolCall.name === "bash" && args.command.includes("rm -rf")) {
      return { block: true, reason: "Dangerous command blocked" };
    }
    // 记录审计日志
    console.log(`[AUDIT] ${toolCall.name}:`, args);
    return undefined; // 允许执行
  },
  afterToolCall: async ({ toolCall, result, isError }) => {
    // 过滤敏感信息
    if (toolCall.name === "read" && result.content[0]?.text?.includes("SECRET")) {
      return {
        content: [{ type: "text", text: "[REDACTED]" }],
      };
    }
    return undefined; // 保持原结果
  },
});
```

### 使用 Proxy Stream (服务端中转)

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { streamProxy } from "@mariozechner/pi-agent-core";

const agent = new Agent({
  streamFn: (model, context, options) =>
    streamProxy(model, context, {
      ...options,
      authToken: "your-server-auth-token",
      proxyUrl: "https://your-llm-proxy.example.com",
    }),
});
```

### Steering 和 Follow-up

```typescript
// Agent 运行时中途插入消息
agent.steer({
  role: "user",
  content: [{ type: "text", text: "换一种方式实现" }],
  timestamp: Date.now(),
});

// Agent 空闲后追加任务
agent.followUp({
  role: "user",
  content: [{ type: "text", text: "现在写测试" }],
  timestamp: Date.now(),
});
```

### 自定义消息类型

```typescript
// 扩展消息类型
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    notification: {
      role: "notification";
      level: "info" | "warn" | "error";
      text: string;
      timestamp: number;
    };
  }
}

// 在 convertToLlm 中处理
const agent = new Agent({
  convertToLlm: (messages) => messages.filter(m => {
    if (m.role === "notification") return false; // 过滤通知消息
    return true;
  }),
});
```

---

## Level 3: 使用 pi-coding-agent 的完整能力

### 安装

```bash
npm install @mariozechner/pi-coding-agent @mariozechner/pi-agent-core @mariozechner/pi-ai
```

### 创建 Agent Session

```typescript
import {
  createAgentSession,
  codingTools,
  readTool,
  bashTool,
  editTool,
  writeTool,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

const { session } = await createAgentSession({
  cwd: process.cwd(),
  model: getModel("anthropic", "claude-sonnet-4-5"),
  thinkingLevel: "medium",
  tools: codingTools,  // [read, bash, edit, write]
});

// 订阅事件
session.subscribe((event) => {
  if (event.type === "message_end" && event.message.role === "assistant") {
    console.log("Assistant:", event.message.content);
  }
});

// 发送提示
await session.prompt("读取 package.json 并列出所有依赖");
```

### 自定义工具集

```typescript
import {
  createAgentSession,
  createReadTool,
  createBashTool,
  createGrepTool,
} from "@mariozechner/pi-coding-agent";

// 只读 Agent (无写入能力)
const { session } = await createAgentSession({
  tools: [createReadTool("/path/to/project"), createGrepTool("/path/to/project")],
});

// 或添加自定义工具
const { session: session2 } = await createAgentSession({
  tools: codingTools,
  customTools: [{
    name: "deploy",
    label: "Deploy",
    description: "Deploy the application",
    parameters: Type.Object({
      environment: Type.String({ enum: ["staging", "production"] }),
    }),
    execute: async (id, params) => {
      // 部署逻辑
      return { content: [{ type: "text", text: `Deployed to ${params.environment}` }], details: {} };
    },
  }],
});
```

### 使用 AgentSession Runtime (完整运行时)

```typescript
import {
  createAgentSessionRuntime,
  AgentSessionRuntimeHost,
} from "@mariozechner/pi-coding-agent";

// 创建运行时 (包含模型发现、认证等)
const runtime = await createAgentSessionRuntime({
  cwd: process.cwd(),
});

// 使用 session
const session = runtime.session;
session.subscribe(event => { /* ... */ });
await session.prompt("帮我重构这个函数");
```

---

## 扩展开发

### 创建扩展

在项目的 `.pi/extensions/` 目录创建 TypeScript 文件：

```typescript
// .pi/extensions/my-extension.ts
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

const extension: ExtensionFactory = (pi) => {
  // 注册自定义工具
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "Does something useful",
    parameters: { type: "object", properties: { input: { type: "string" } } },
    execute: async (id, params) => ({
      content: [{ type: "text", text: `Result: ${params.input}` }],
      details: {},
    }),
  });

  // 注册斜杠命令
  pi.registerCommand("greet", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.sendMessage({
        customType: "notification",
        content: `Hello, ${args || "world"}!`,
        display: "inline",
      });
    },
  });

  // 监听事件
  pi.on("tool_call", async (event) => {
    console.log(`Tool called: ${event.toolName}`);
    // 可以返回 { block: true } 阻止执行
  });

  pi.on("tool_result", async (event) => {
    // 可以修改工具结果
    if (event.toolName === "bash" && event.content[0]?.text?.includes("SECRET")) {
      return { content: [{ type: "text", text: "[FILTERED]" }] };
    }
  });

  // 上下文注入
  pi.on("context", async (messages) => {
    // 可以修改发送给 LLM 的消息
    return messages;
  });

  // 输入拦截
  pi.on("input", async (text, images, source) => {
    if (text.startsWith("!")) {
      // 自己处理，不发给 LLM
      return { action: "handled" };
    }
    return { action: "continue" }; // 正常处理
  });
};

export default extension;
```

---

## 实际项目示例

### 示例 1: 代码审查 Bot

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, Type } from "@mariozechner/pi-ai";
import { execSync } from "child_process";

const agent = new Agent({
  initialState: {
    systemPrompt: `你是一个代码审查专家。审查提交的代码变更，关注：
    1. 安全漏洞
    2. 性能问题
    3. 代码风格
    4. 逻辑错误`,
    model: getModel("anthropic", "claude-sonnet-4-5"),
    thinkingLevel: "high",
    tools: [{
      name: "get_diff",
      label: "Get Git Diff",
      description: "Get the git diff for review",
      parameters: Type.Object({
        base: Type.String({ description: "Base branch", default: "main" }),
      }),
      execute: async (id, params) => {
        const diff = execSync(`git diff ${params.base}...HEAD`).toString();
        return { content: [{ type: "text", text: diff }], details: {} };
      },
    }],
  },
});

await agent.prompt("请审查最新的代码变更");
```

### 示例 2: 文档生成 Agent

```typescript
import { createAgentSession, readTool, writeTool } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  tools: [readTool, writeTool],
  customTools: [{
    name: "list_files",
    label: "List Files",
    description: "List TypeScript source files",
    parameters: Type.Object({ dir: Type.String() }),
    execute: async (id, params) => {
      const files = execSync(`find ${params.dir} -name "*.ts" -not -path "*/node_modules/*"`)
        .toString().trim().split("\n");
      return { content: [{ type: "text", text: files.join("\n") }], details: { files } };
    },
  }],
});

await session.prompt("读取 src/ 下的所有 TypeScript 文件，为每个公开函数生成 JSDoc 注释");
```

### 示例 3: Slack Bot (参考 mom)

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

function createSlackAgent(channelId: string) {
  const agent = new Agent({
    initialState: {
      systemPrompt: buildSlackSystemPrompt(channelId),
      model: getModel("anthropic", "claude-sonnet-4-5"),
      tools: createSlackTools(channelId),
    },
    convertToLlm: (messages) => messages.filter(m => 
      m.role === "user" || m.role === "assistant" || m.role === "toolResult"
    ),
  });

  agent.subscribe(async (event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      const text = event.message.content
        .filter(c => c.type === "text")
        .map(c => c.text)
        .join("");
      await postToSlack(channelId, text);
    }
  });

  return agent;
}
```

---

## 最佳实践

### 1. 选择正确的集成层级

- **只需要调用 LLM** → `pi-ai`
- **需要 Agent 循环** → `pi-agent-core`
- **需要文件操作 + 会话** → `pi-coding-agent`

### 2. 错误处理

```typescript
agent.subscribe(async (event) => {
  if (event.type === "turn_end") {
    const msg = event.message;
    if (msg.role === "assistant" && msg.stopReason === "error") {
      console.error("Agent error:", msg.errorMessage);
      // 实现重试逻辑
    }
  }
});
```

### 3. 成本控制

```typescript
agent.subscribe(async (event) => {
  if (event.type === "message_end" && event.message.role === "assistant") {
    const usage = event.message.usage;
    if (usage.cost.total > MAX_COST_PER_TURN) {
      agent.abort();
    }
  }
});
```

### 4. 安全

- 使用 `beforeToolCall` 拦截危险操作
- 限制工具集 (不给不需要的工具)
- 使用 Docker 沙箱执行 Bash
- 通过 `afterToolCall` 过滤敏感输出

### 5. 性能

- 使用 `transformContext` 控制上下文大小
- 启用 compaction (自动压缩)
- 使用 `cacheRetention: "long"` 利用 Provider 缓存
- 设置 `sessionId` 启用会话级缓存
