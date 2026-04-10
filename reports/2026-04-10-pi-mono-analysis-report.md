# Learn Claude Code 教程 × Pi-Mono 项目：19 章对照分析报告

> 本报告逐章对照 [learn-claude-code](../learn-claude-code) 教程的 19 个章节，分析 [pi-mono](../pi-mono) 开源项目中对应模块的实现方式、关键文件和核心代码。

---

## 项目全景

### Pi-Mono 包结构（三层依赖）

```
Layer 0 — pi-ai          (统一 LLM API，零内部依赖)
             ↑
Layer 1 — pi-agent-core   (通用 Agent 运行时，依赖 pi-ai)
             ↑
Layer 2 — pi-coding-agent (编码 Agent CLI + 扩展系统，依赖 pi-agent-core + pi-ai + pi-tui)
             ↑
         pi-mom           (Slack 机器人，依赖 pi-coding-agent)

辅助包：
  pi-tui      → 终端 UI 库
  pi-web-ui   → Web 聊天组件
  pi-pods     → vLLM GPU Pod 部署
```

---

## 阶段 1：构建单 Agent 核心（s01–s06）

---

### S01 — Agent Loop（Agent 循环）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 最小循环：问模型 → 执行工具 → 结果回传 → 继续 | 完全一致 |
| **对应包** | — | `pi-agent-core` (`packages/agent/`) |
| **关键文件** | — | `src/agent-loop.ts` (632行), `src/agent.ts` (540行) |
| **关键数据结构** | `messages` / `LoopState` | `AgentState` / `AgentContext` / `AgentMessage[]` |

**实现细节：**

- **`agent-loop.ts`** 中的 `runLoop()` 函数是核心循环：
  - **外层循环**：处理 follow-up 消息队列（用户在 agent 执行时输入的后续指令）
  - **内层循环**：`while (hasMoreToolCalls || pendingMessages.length > 0)` — 持续处理工具调用和 steering 消息
  - 流程：收集 steering 消息 → `convertToLlm()` 转换消息格式 → 调用 LLM 流式 API → 检测工具调用 → 执行工具 → 工具结果作为 `toolResult` 消息回传 → 循环
- **`agent.ts`** 中的 `Agent` 类封装了高层 API：
  - `prompt(msg)` — 提交新任务
  - `continue()` — 重试/继续
  - `steer(msg)` — 运行时注入 steering 消息（不等待当前 turn 结束）
  - `followUp(msg)` — 队列化后续消息（等待当前 turn 结束后发送）
  - `subscribe(fn)` — 事件订阅

**关键代码片段（`agent-loop.ts` runLoop）：**
```typescript
async function runLoop(currentContext, newMessages, config, signal, emit, streamFn) {
  while (true) {           // 外层：follow-up 消息循环
    let hasMoreToolCalls = true;
    while (hasMoreToolCalls || pendingMessages.length > 0) {  // 内层：工具循环
      // 1. 处理 pending 消息
      // 2. convertToLlm() 转换消息
      // 3. LLM 流式调用
      // 4. 检测工具调用 → 执行 → 结果回传
      // 5. 检查是否还有工具调用
    }
    // 检查 follow-up 队列
    const followUp = await config.getFollowUpMessages?.();
    if (!followUp?.length) break;
  }
}
```

---

### S02 — Tool Use（工具系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 工具注册、JSON Schema 参数定义、分发执行、tool_result 回传 | 完全一致 |
| **对应包** | — | `pi-coding-agent` (`packages/coding-agent/src/core/tools/`) |
| **关键文件** | — | `tools/index.ts`, `tools/read.ts`, `tools/write.ts`, `tools/edit.ts`, `tools/bash.ts`, `tools/grep.ts`, `tools/find.ts`, `tools/ls.ts` (共 13 个文件) |
| **关键数据结构** | `ToolSpec` / `ToolDispatchMap` / `tool_result` | `AgentTool<T>` / `ToolDefinition` / `AgentToolResult` |

**实现细节：**

- **7 个内置工具**：`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
- **工具定义方式**：通过 `defineTool()` 工厂函数，使用 TypeBox JSON Schema 定义参数
- **工具执行模式**（在 `agent-loop.ts` 中）：
  - `sequential`：逐个执行
  - `parallel`（默认）：并发执行，结果按原始顺序返回
- **自定义工具注册**：`createAgentSession({ customTools: [myTool] })`
- **工具参数验证**：使用 `validateToolArguments()` 验证 JSON Schema

**工具集合导出（`tools/index.ts`）：**
```typescript
export const codingTools = [readTool, bashTool, editTool, writeTool];  // 默认4个
export const allTools = [readTool, bashTool, editTool, writeTool, grepTool, findTool, lsTool];  // 全部7个
export const readOnlyTools = [readTool, grepTool, findTool, lsTool];  // 只读
```

---

### S03 — Todo / Planning（规划系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 把大目标拆成小步骤的最小计划系统 | **未内置独立规划模块** |
| **对应包** | — | 无专门包 |
| **替代方案** | — | 依赖 LLM 自身推理能力 + `thinkingLevel` 参数 |

**实现细节：**

Pi-Mono **没有**内置类似 `TodoItem` / `PlanState` 的独立规划数据结构。它采取了不同的设计哲学：

1. **Thinking 模式**：通过 `thinkingLevel` 参数（`off/low/medium/high/xhigh`）控制 LLM 的思考深度，由模型自己决定如何分解任务
2. **扩展示例中有 planner 概念**：`examples/extensions/preset.ts` 中有 "planner" 相关内容，但仅作为示例
3. **Steering 消息**：用户可以通过 `steer()` 在运行时调整 agent 的方向

**与教程的差异**：教程认为规划应该是一个显式的数据结构（`TodoItem[]`），让 agent 的行为可见可追踪；Pi-Mono 则把规划完全交给 LLM 内部推理。

---

### S04 — Subagent（子 Agent）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 上下文隔离与任务委派，每个子任务获得独立的 fresh context | 一致，但实现为**扩展**而非内置 |
| **对应包** | — | `pi-coding-agent`（扩展示例） |
| **关键文件** | — | `examples/extensions/subagent/index.ts` (987行), `examples/extensions/subagent/agents.ts` |

**实现细节：**

Subagent 是通过 **Extension** 实现的，而非核心内置模块：

- **进程隔离**：通过 `spawn()` 启动独立 `pi` 进程，每个子 agent 有完全隔离的上下文窗口
- **三种执行模式**：
  - **Single**：`{ agent: "name", task: "..." }` — 单任务委派
  - **Parallel**：`{ tasks: [...] }` — 并行多任务（最大 4 并发，8 任务）
  - **Chain**：`{ chain: [...] }` — 链式顺序执行，支持 `{previous}` 占位符传递上一步输出
- **Agent 发现**：从 `~/.pi/agent/agents/` 或项目 `.pi/agents/` 目录读取配置
- **JSON 模式通信**：使用 `--mode json` 运行子 agent，通过 stdout 解析 JSON 事件流

**关键代码（子 agent 执行）：**
```typescript
async function runSingleAgent(defaultCwd, agents, agentName, task, ...) {
  const args = ["--mode", "json", "-p", "--no-session"];
  // ... 构建参数
  const invocation = getPiInvocation(args);
  const proc = spawn(invocation.command, invocation.args, {
    cwd: cwd ?? defaultCwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // 解析 JSON 事件流
  proc.stdout.on("data", (data) => { /* 解析 message_end, tool_result_end 事件 */ });
}
```

---

### S05 — Skills（技能系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 按需加载专业知识，不把所有知识塞进 prompt | 完全一致 |
| **对应包** | — | `pi-coding-agent` (`packages/coding-agent/src/core/skills.ts`) |
| **关键文件** | — | `src/core/skills.ts` (509行, 14KB) |
| **关键数据结构** | `SkillMeta` / `SkillContent` / `SkillRegistry` | `Skill` / `SkillFrontmatter` |

**实现细节：**

- **技能格式**：Markdown 文件 + YAML frontmatter 元数据（name, description, globs 等）
- **发现位置**：
  - `~/.pi/agent/skills/` — 用户全局技能
  - `.pi/skills/` — 项目本地技能
  - npm 包中的技能
- **加载流程**：`loadSkills()` → `loadSkillsFromDir()` → 解析 frontmatter → 验证 → 注入 system prompt
- **注入方式**：`formatSkillsForPrompt(skills)` 将技能描述格式化后附加到系统提示词

**技能数据结构：**
```typescript
interface Skill {
  name: string;           // 最长 64 字符
  description: string;    // 最长 1024 字符
  content: string;        // markdown 正文
  globs?: string[];       // 匹配的文件模式
  sourceInfo: SourceInfo; // 来源信息
}
```

---

### S06 — Context Compact（上下文压缩）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 上下文预算与压缩，避免越跑越脏越长 | 完全一致 |
| **对应包** | — | `pi-coding-agent` (`packages/coding-agent/src/core/compaction/`) |
| **关键文件** | — | `compaction/compaction.ts` (824行, 25KB), `compaction/branch-summarization.ts` (11KB), `compaction/utils.ts` (5.6KB) |
| **关键数据结构** | `CompactSummary` / `PersistedOutputMarker` | `CompactionResult` / `CompactionEntry` / `CompactionDetails` |

**实现细节：**

- **触发时机**：
  - `shouldCompact()` — 基于 token 阈值自动检测
  - `isContextOverflow` — 上下文溢出时紧急触发
  - 手动触发
- **压缩流程**：
  1. `estimateTokens()` / `calculateContextTokens()` — token 估算
  2. `findCutPoint()` — 找到安全的截断点
  3. `serializeConversation()` — 序列化对话内容
  4. `generateSummary()` — 使用 LLM 生成压缩摘要
  5. 追踪文件操作（已读/已修改文件列表）保存到 `CompactionDetails`
- **分支摘要**：`generateBranchSummary()` 为会话分支生成独立摘要
- **AgentSession 自动压缩**：在每个 turn 结束后自动检查并执行

**关键数据结构：**
```typescript
interface CompactionDetails {
  readFiles: string[];      // 已读文件列表
  modifiedFiles: string[];  // 已修改文件列表
}
```

---

## 阶段 2：补安全、扩展、记忆、提示词、恢复（s07–s11）

---

### S07 — Permission System（权限系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 危险操作前的权限管道 / 安全闸门 | 通过 **beforeToolCall 钩子**实现 |
| **对应包** | — | `pi-agent-core` (类型定义) + `pi-coding-agent` (扩展系统) |
| **关键文件** | — | `packages/agent/src/types.ts` (BeforeToolCallContext), `packages/coding-agent/src/core/extensions/types.ts` |
| **关键数据结构** | `PermissionRule` / `PermissionDecision` | `BeforeToolCallResult` (`{ block: true, reason: "..." }`) |

**实现细节：**

Pi-Mono 没有独立的 "Permission" 模块，而是**通过工具调用钩子实现权限控制**：

- **`beforeToolCall` 钩子**：在每个工具执行前调用
  - 可以**阻止执行**：返回 `{ block: true, reason: "Not allowed" }`
  - 可以**修改参数**：改变工具的输入
  - 可以**放行**：不做任何操作
- **`afterToolCall` 钩子**：工具执行后可以验证和修改结果
- **BashOperations 接口**：允许自定义命令沙箱化
- **Subagent 中的用户确认**：`confirmProjectAgents` 参数让用户确认是否运行来自项目仓库的 agent

**权限检查流程（`ARCHITECTURE.md`）：**
```
beforeToolCall() hook
    ├─► 验证 args
    ├─► 检查权限
    ├─► 可以阻止执行
    └─► 可以修改参数
        │
        ▼
    工具执行
        │
        ▼
    afterToolCall() hook
        ├─► 验证结果
        └─► 可以修改返回值
```

---

### S08 — Hook System（钩子系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 不改核心循环也能扩展行为的插口系统 | 完全一致，且更丰富 |
| **对应包** | — | `pi-coding-agent` (`packages/coding-agent/src/core/extensions/`) |
| **关键文件** | — | `extensions/types.ts` (1451行, 47KB), `extensions/runner.ts` (916行, 28KB), `extensions/loader.ts` (16KB) |
| **关键数据结构** | `HookEvent` / `HookResult` | `ExtensionFactory` / `Extension` / `ExtensionRunner` |

**实现细节：**

Pi-Mono 的扩展系统（Extension System）就是教程中 Hook System 的超集。它提供了**完整的生命周期钩子**：

| 钩子名称 | 触发时机 |
|----------|---------|
| `beforeAgentStart` | Agent 启动前 |
| `afterAgentStart` / `agentEnd` | Agent 启动后/结束 |
| `turnStart` / `turnEnd` | 每个 turn 开始/结束 |
| `beforeToolCall` | 工具执行前（可阻止/修改） |
| `afterToolCall` / `toolResult` | 工具执行后 |
| `beforeProviderRequest` | LLM 请求前 |
| `sessionStart` / `sessionShutdown` | 会话生命周期 |
| `sessionBeforeCompact` / `sessionCompact` | 压缩前后 |
| `sessionBeforeFork` / `sessionBeforeSwitch` | 分支/切换前 |
| `context` | 上下文事件 |
| `input` | 用户输入事件 |
| `userBash` | 用户执行 bash |
| `resourcesDiscover` | 资源发现 |

**扩展注册方式：**
```typescript
const myExtension: ExtensionFactory = async (context) => {
  return {
    hooks: {
      beforeToolCall: async ({ toolCall, args }) => { /* 可阻止/修改 */ },
      afterToolCall: async ({ toolCall, result }) => { /* 修改结果 */ },
      turnEnd: async (event) => { /* 每 turn 结束后的逻辑 */ },
    },
    commands: [{ name: "/my-cmd", handler: async () => { ... } }],
  };
};
```

---

### S09 — Memory System（记忆系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 区分临时上下文和跨会话记忆的持久层 | 两种方式实现 |
| **对应包** | — | `pi-coding-agent` (会话持久化) + `pi-mom` (MEMORY.md) |
| **关键文件** | — | `coding-agent/src/core/session-manager.ts` (42KB), `mom/src/agent.ts` (30KB) |
| **关键数据结构** | `MemoryEntry` / `MemoryStore` | `SessionEntry` / `SessionManager` / `MEMORY.md` |

**实现细节：**

Pi-Mono 的记忆系统有两层：

**1. 会话持久化（pi-coding-agent）：**
- `SessionManager` 管理会话的创建/保存/加载/分支/历史
- 存储位置：`~/.pi/agent/sessions/`
- 会话格式：JSON 文件包含 header + entries（消息、工具调用、压缩摘要等）
- 支持分支（branch）和历史回溯

**2. 显式 Memory 文件（pi-mom）：**
- `MEMORY.md` — 工作区级全局记忆（跨频道共享）
- 频道级 `MEMORY.md` — 频道特定记忆
- 在构建 system prompt 时注入记忆内容

```typescript
function getMemory(channelDir: string): string {
  // 读取工作区级 MEMORY.md
  const workspaceMemoryPath = join(channelDir, "..", "MEMORY.md");
  // 读取频道级 MEMORY.md
  const channelMemoryPath = join(channelDir, "MEMORY.md");
  // 组合返回
}
```

**与教程差异**：教程设计了专门的 `MemoryEntry` 结构和 `MemoryStore` 抽象；Pi-Mono 的 coding-agent 主要靠会话持久化实现跨会话延续，而 Mom 包则用 Markdown 文件作为显式记忆。

---

### S10 — System Prompt（系统提示词）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 可管理、可组装的提示词流水线 | 完全一致 |
| **对应包** | — | `pi-coding-agent` (`packages/coding-agent/src/core/system-prompt.ts`) |
| **关键文件** | — | `src/core/system-prompt.ts` (169行), `src/core/resource-loader.ts` (909行, 31KB) |
| **关键数据结构** | `PromptParts` / `SystemPromptBlock` | `BuildSystemPromptOptions` |

**实现细节：**

`buildSystemPrompt()` 函数动态构建系统提示词，组装多个来源：

1. **工具列表**：根据 `selectedTools` 生成可用工具描述
2. **使用指南**：根据可用工具动态生成（如有 bash 但无 grep 则建议用 bash 做搜索）
3. **自定义指南**：`promptGuidelines` 追加的额外规则
4. **项目上下文文件**：从 `AGENTS.md` / `CLAUDE.md` 读取项目特定指令
5. **技能描述**：`formatSkillsForPrompt(skills)` 注入可用技能
6. **Pi 文档路径**：指向 README、docs、examples 的绝对路径
7. **元信息**：当前日期 + 工作目录
8. **支持完全替换**：`customPrompt` 可替换整个默认提示词
9. **支持追加**：`appendSystemPrompt` 在默认提示词后追加

---

### S11 — Error Recovery（错误恢复）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 出错后还能继续往前走的恢复分支 | 多层恢复机制 |
| **对应包** | — | `pi-agent-core` + `pi-coding-agent` |
| **关键文件** | — | `agent/src/agent-loop.ts`, `agent/src/agent.ts`, `coding-agent/src/core/agent-session.ts` |
| **关键数据结构** | `RecoveryState` / `TransitionReason` | `stopReason: "error"` / `errorMessage` / `RetrySettings` |

**实现细节：**

Pi-Mono 的错误恢复分散在多个层面：

1. **StreamFn 契约**：要求不抛异常，而是通过事件流中的 `stopReason: "error"` + `errorMessage` 传递错误
2. **`continue()` 重试**：当 LLM 返回错误时，用户可以调用 `agent.continue()` 重试
3. **上下文溢出自动恢复**：
   - `isContextOverflow` 检测溢出
   - 自动触发 `compact()`（压缩）
   - 压缩后重试
4. **Settings 中的 `RetrySettings`**：可配置重试参数
5. **工具执行错误处理**：工具返回 `isError: true` 时，LLM 会看到错误信息并尝试修正

**与教程差异**：教程设计了显式的 `RecoveryState` 和 `TransitionReason`，Pi-Mono 则通过组合 `continue()`、自动压缩、事件流错误传播等机制实现恢复。

---

## 阶段 3：任务系统升级（s12–s14）

---

### S12 — Task System（任务系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 持久化的工作图，不只是会话内清单 | 通过消息 API 实现 |
| **对应包** | — | `pi-agent-core` |
| **关键文件** | — | `agent/src/agent.ts` (prompt/continue/steer/followUp) |
| **关键数据结构** | `TaskRecord` / `TaskStatus` | `AgentMessage` + 消息队列 |

**实现细节：**

Pi-Mono **没有**独立的 "Task Manager" 抽象。任务就是消息：

- `prompt(msg)` — 提交新任务
- `continue()` — 重试/继续当前任务
- `steer(msg)` — 运行时注入 steering 消息（不等待当前 turn 结束）
- `followUp(msg)` — 队列化后续消息（等待当前 turn 结束后发送）
- `queue_update` 事件通知队列状态变化

**与教程差异**：教程设计了 `TaskRecord` / `TaskStatus` 等持久化任务图结构，Pi-Mono 选择了更轻量的消息驱动方式。会话持久化（SessionManager）在某种程度上提供了任务的持久化能力。

---

### S13 — Background Tasks（后台任务）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 慢任务后台执行，结果延后回来 | **pi-mom** 包实现 |
| **对应包** | — | `pi-mom` (`packages/mom/`) |
| **关键文件** | — | `mom/src/agent.ts`, `mom/src/main.ts` |
| **关键数据结构** | `RuntimeTaskState` / `Notification` | `PendingMessage[]` / `AgentRunner` |

**实现细节：**

Pi-Mono 的 coding-agent 本身没有独立的后台任务系统，但 **pi-mom** 包实现了后台任务概念：

- **PendingMessage 队列**：聚合用户消息后批量处理
- **AgentRunner**：每个 Slack 频道管理一个 agent runner，后台异步运行
- **Docker 沙箱**：在容器中隔离执行命令
- **EventsWatcher**：监控文件系统事件目录，根据事件文件触发任务

---

### S14 — Cron Scheduler（定时调度器）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 时间到了就能自动开工的定时触发层 | **pi-mom** 包实现 |
| **对应包** | — | `pi-mom` (`packages/mom/src/events.ts`) |
| **关键文件** | — | `mom/src/events.ts` (384行, 10KB) |
| **关键数据结构** | `ScheduleRecord` / `CronTrigger` | `MomEvent` / `EventsWatcher` / `Cron` |

**实现细节：**

使用 **`croner`** 库实现定时调度，支持三种事件类型：

```typescript
interface ImmediateEvent { type: "immediate"; channelId: string; text: string; }
interface OneShotEvent   { type: "one-shot";  channelId: string; text: string; at: string; }  // ISO 8601
interface PeriodicEvent  { type: "periodic";  channelId: string; text: string; schedule: string; timezone: string; }  // cron 表达式
```

- **EventsWatcher 类**：监控 `events/` 目录中的 JSON 文件
- **文件触发**：创建 JSON 文件 → 自动解析 → 创建定时任务
- **支持时区**：`PeriodicEvent` 支持 IANA 时区
- **支持一次性事件**：`OneShotEvent` 使用 ISO 8601 时间

---

## 阶段 4：多 Agent 与外部工具平台（s15–s19）

---

### S15 — Agent Teams（Agent 团队）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 长期存在、能反复接活的 agent 团队 | **无内置抽象，通过组合实现** |
| **对应包** | — | 分散在多个包 |
| **关键数据结构** | `TeamMember` / `MessageEnvelope` | 无专门结构 |

**实现细节：**

Pi-Mono 没有内置的 "agent teams" 抽象，但通过组合实现了类似功能：

1. **Subagent 扩展的 parallel 模式**：可以同时运行多个专业 agent（最大 4 并发），类似团队并行工作
2. **Mom 包**：本身就是一个"团队协调者"，为每个 Slack 频道管理一个 agent runner
3. **AGENTS.md 的并行 agent 规则**：明确定义了多个 agent 在同一 worktree 上并行工作的 git 规则

---

### S16 — Team Protocols（团队协议）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 团队之间可追踪、可批准、可拒绝的协议层 | **无正式抽象** |
| **对应包** | — | 分散的约定 |
| **关键数据结构** | `ProtocolEnvelope` / `RequestRecord` | 无 |

**实现细节：**

Pi-Mono 没有正式的团队协议抽象，但存在以下约定：

1. **Chain 模式的 `{previous}` 占位符**：Subagent chain 模式通过模板变量实现输出传递协议
2. **RPC 模式**：`rpc-types.ts` (9KB) 定义了进程间通信协议（JSONL 格式），支持 agent 与外部进程通信
3. **事件流协议**：Agent 事件流本身就是一种通信协议

---

### S17 — Autonomous Agents（自主 Agent）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 队友能自己找活、自己恢复工作的自治层 | **pi-mom** 最接近 |
| **对应包** | — | `pi-mom` |
| **关键文件** | — | `mom/src/agent.ts`, `mom/src/events.ts`, `mom/src/main.ts` |
| **关键数据结构** | `ClaimPolicy` / `AutonomyState` | 无专门结构 |

**实现细节：**

**pi-mom** 是最接近"自主 agent"的实现：

- **独立运行**：作为 Slack 机器人自主响应消息
- **Cron 调度**：通过 EventsWatcher + croner 定期执行任务
- **维护记忆**：MEMORY.md 文件提供持久化工作记忆
- **Docker 沙箱隔离**：在容器中安全执行命令
- **多频道管理**：为每个频道维护独立的 agent runner

**coding-agent 的无人值守模式**：
- `--mode json` — 纯 JSON 输出，适合程序化调用
- `--mode rpc` — RPC 模式，允许外部进程控制

---

### S18 — Worktree Isolation（工作树隔离）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 任务与隔离工作目录绑定的并行执行车道 | 多种机制组合 |
| **对应包** | — | `pi-mom` (Docker 沙箱) + `pi-coding-agent` (Subagent 进程隔离) |
| **关键文件** | — | `mom/src/sandbox.ts` (222行), `AGENTS.md` (git 规则) |
| **关键数据结构** | `WorktreeRecord` / `TaskBinding` | `SandboxConfig` / `Executor` |

**实现细节：**

Pi-Mono 没有内置的 git worktree 管理，但通过多种机制实现隔离：

**1. Mom 的 Docker 沙箱（`sandbox.ts`）：**
```typescript
type SandboxConfig = { type: "host" } | { type: "docker"; container: string };
```
- `HostExecutor`：直接在主机执行
- `DockerExecutor`：将命令路由到 Docker 容器中执行，workspace 映射到 `/workspace`

**2. Subagent 的进程隔离：**
- 每个子 agent 是独立 `pi` 进程，有自己的 `cwd`
- 通过 JSON 事件流通信，完全隔离

**3. AGENTS.md 中的并行 agent git 规则：**
- 禁止 `git add -A`、`git reset --hard` 等危险操作
- 要求只 stage 自己修改的文件
- 明确跟踪文件修改记录

---

### S19 — MCP & Plugin（MCP 与插件系统）

| 维度 | 教程概念 | Pi-Mono 实现 |
|------|---------|-------------|
| **核心思想** | 把外部工具与外部能力接入主系统的总线 | **未实现 MCP，有自己的扩展系统** |
| **对应包** | — | `pi-coding-agent`（Extension System） |
| **关键文件** | — | `extensions/types.ts`, `extensions/runner.ts`, `extensions/loader.ts`, `resource-loader.ts` |
| **关键数据结构** | `MCPServerConfig` / `CapabilityRoute` | `ExtensionFactory` / `Extension` / `ExtensionRunner` |

**实现细节：**

Pi-Mono **没有实现标准的 MCP（Model Context Protocol）**，但有自己完整的扩展体系：

**Extension System 提供了类似 MCP 的能力：**

| 能力 | MCP 对应 | Pi-Mono Extension 对应 |
|------|---------|----------------------|
| 外部工具注册 | `tools/list` + `tools/call` | `defineTool()` + `registerTool()` |
| 生命周期钩子 | — | 20+ 个 hooks |
| 自定义命令 | — | `/command` 斜杠命令 |
| 自定义 UI | — | 页脚、编辑器、消息渲染器 |
| 资源发现 | `resources/list` | `resourcesDiscover` 钩子 |

**扩展发现位置：**
- `~/.pi/agent/extensions/` — 用户全局扩展
- `.pi/extensions/` — 项目本地扩展
- npm 包中的扩展

**RPC 协议**（非 MCP 但类似）：
- `rpc-types.ts` 定义了 JSONL 格式的进程间通信协议
- 支持通过外部进程控制 agent

---

## 总结对照表

| 章节 | 教程模块 | Pi-Mono 实现状态 | 对应包/文件 | 实现方式 |
|------|---------|-----------------|-----------|---------|
| **s01** | Agent Loop | ✅ 完整实现 | `pi-agent-core` / `agent-loop.ts` | 核心内置 |
| **s02** | Tool Use | ✅ 完整实现 | `pi-coding-agent` / `core/tools/` | 7 个内置工具 + defineTool() |
| **s03** | Planning | ❌ 未内置 | — | 依赖 LLM 推理 + thinkingLevel |
| **s04** | Subagent | ✅ 扩展实现 | `examples/extensions/subagent/` | 进程隔离 + JSON 事件流 |
| **s05** | Skills | ✅ 完整实现 | `pi-coding-agent` / `core/skills.ts` | Markdown + frontmatter |
| **s06** | Context Compact | ✅ 完整实现 | `pi-coding-agent` / `core/compaction/` | LLM 摘要 + 文件追踪 |
| **s07** | Permission | ⚠️ 钩子实现 | `pi-agent-core` / `types.ts` | beforeToolCall 阻止/修改 |
| **s08** | Hook System | ✅ 完整实现 | `pi-coding-agent` / `core/extensions/` | 20+ 生命周期钩子 |
| **s09** | Memory | ⚠️ 部分实现 | `session-manager.ts` + `mom/agent.ts` | 会话持久化 + MEMORY.md |
| **s10** | System Prompt | ✅ 完整实现 | `pi-coding-agent` / `system-prompt.ts` | 多来源组装 |
| **s11** | Error Recovery | ⚠️ 分散实现 | 多个文件 | continue() + 自动压缩 + 事件流 |
| **s12** | Task System | ⚠️ 消息驱动 | `pi-agent-core` / `agent.ts` | prompt/steer/followUp |
| **s13** | Background Tasks | ⚠️ Mom 包实现 | `pi-mom` | PendingMessage 队列 |
| **s14** | Cron Scheduler | ✅ Mom 包实现 | `pi-mom` / `events.ts` | croner 库 + EventsWatcher |
| **s15** | Agent Teams | ❌ 无内置 | — | Subagent parallel 替代 |
| **s16** | Team Protocols | ❌ 无内置 | — | Chain {previous} + RPC |
| **s17** | Autonomous Agents | ⚠️ Mom 实现 | `pi-mom` | Slack 机器人 + cron + memory |
| **s18** | Worktree Isolation | ⚠️ 组合实现 | `mom/sandbox.ts` + AGENTS.md | Docker 沙箱 + git 规则 |
| **s19** | MCP & Plugin | ❌ 未实现 MCP | `extensions/` | 自有 Extension System |

### 状态说明
- ✅ 完整实现：核心概念完整对应
- ⚠️ 部分/替代实现：有相关机制但不完全匹配教程的抽象设计
- ❌ 未内置：没有对应的专门模块

---

## 关键架构洞察

1. **三层分层设计**：`pi-ai → pi-agent-core → pi-coding-agent` 职责清晰分离，教程的前 6 章（Agent Loop、Tools、Skills、Context）都有直接对应
2. **Extension System 是万能胶水**：教程中的 Hook、Permission、甚至部分 Planning 功能，在 Pi-Mono 中都通过统一的 Extension System 实现
3. **Subagent 是扩展不是内置**：说明 Pi-Mono 倾向于保持核心精简，把复杂功能推到扩展层
4. **后半程（s12-s19）差距明显**：教程后半程涉及的 Task Graph、Team Protocol、Autonomous、MCP 等高级抽象，Pi-Mono 多数没有内置，需要通过组合现有机制实现
5. **Mom 包是自主 Agent 的参考实现**：展示了如何基于 pi-coding-agent 构建包含 cron、memory、sandbox 的持续运行系统
6. **AgentSession 极其庞大**（98KB）：是整个系统最核心最复杂的类，封装了教程中多个章节的功能

---

*生成日期: 2026-04-09*
*教程版本: learn-claude-code (19 章)*
*Pi-Mono 版本: 0.65.2*
