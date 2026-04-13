# packages/coding-agent - 编码 Agent CLI

## 模块定位

`@mariozechner/pi-coding-agent` 是整个项目的 **旗舰产品**——一个功能完整的 AI 编码助手 CLI 工具 (`pi` 命令)。它基于 `agent-core` 和 `ai` 包，添加了文件操作工具、会话管理、扩展系统、交互式 TUI 等上层能力。

## 源码结构

```
src/
├── main.ts                    # CLI 入口
├── cli.ts                     # 命令行参数解析
├── index.ts                   # 库导出
├── config.ts                  # 全局配置 (路径、目录)
├── migrations.ts              # 数据迁移
│
├── cli/                       # CLI 子系统
│   ├── args.ts                # 参数定义
│   ├── config-selector.ts     # 模型/配置选择
│   ├── file-processor.ts      # 文件输入处理
│   ├── initial-message.ts     # 初始消息构建
│   ├── list-models.ts         # 模型列表
│   └── session-picker.ts      # 会话选择器
│
├── core/                      # 核心业务逻辑
│   ├── sdk.ts                 # ★ SDK 入口 (createAgentSession)
│   ├── agent-session.ts       # ★ AgentSession 类 (3000+ 行)
│   ├── agent-session-runtime.ts  # 运行时启动逻辑
│   ├── system-prompt.ts       # 系统提示词构建
│   ├── messages.ts            # 消息转换 (convertToLlm)
│   ├── model-registry.ts      # 模型注册/发现
│   ├── model-resolver.ts      # 模型解析
│   ├── session-manager.ts     # 会话持久化 (JSONL)
│   ├── settings-manager.ts    # 设置管理
│   ├── bash-executor.ts       # Bash 命令执行
│   ├── output-guard.ts        # 输出安全检查
│   ├── prompt-templates.ts    # 提示词模板
│   ├── skills.ts              # Skill 系统
│   ├── slash-commands.ts      # 斜杠命令
│   ├── resource-loader.ts     # 资源加载 (skills, prompts, themes)
│   ├── event-bus.ts           # 事件总线
│   ├── keybindings.ts         # 快捷键
│   ├── defaults.ts            # 默认配置
│   ├── timings.ts             # 性能计时
│   │
│   ├── tools/                 # ★ 内置工具
│   │   ├── index.ts           # 工具注册
│   │   ├── read.ts            # 文件读取
│   │   ├── write.ts           # 文件写入
│   │   ├── edit.ts            # 文件编辑 (字符串替换)
│   │   ├── bash.ts            # Bash 命令执行
│   │   ├── grep.ts            # 文件内容搜索
│   │   ├── find.ts            # 文件查找 (glob)
│   │   ├── ls.ts              # 目录列表
│   │   ├── edit-diff.ts       # Diff 格式编辑
│   │   ├── path-utils.ts      # 路径处理
│   │   ├── truncate.ts        # 输出截断
│   │   ├── render-utils.ts    # 渲染工具
│   │   ├── file-mutation-queue.ts  # 文件修改队列
│   │   └── tool-definition-wrapper.ts  # 工具定义包装
│   │
│   ├── compaction/            # 上下文压缩
│   │   ├── compaction.ts      # 压缩逻辑
│   │   ├── branch-summarization.ts  # 分支摘要
│   │   ├── utils.ts           # 工具函数
│   │   └── index.ts           # 导出
│   │
│   ├── extensions/            # ★ 扩展系统
│   │   ├── types.ts           # 扩展类型定义
│   │   ├── loader.ts          # 扩展加载
│   │   ├── runner.ts          # 扩展运行器
│   │   ├── wrapper.ts         # 扩展包装
│   │   └── index.ts           # 导出
│   │
│   └── export-html/           # HTML 导出
│       ├── index.ts           # 导出入口
│       ├── ansi-to-html.ts    # ANSI 转 HTML
│       └── tool-renderer.ts   # 工具结果渲染
│
├── modes/                     # 运行模式
│   ├── index.ts               # 模式选择
│   └── interactive/           # 交互式模式
│       └── components/        # TUI 组件 (30+ 文件)
│           ├── assistant-message.ts
│           ├── bash-execution.ts
│           ├── diff.ts
│           ├── custom-editor.ts
│           └── ...
│
└── bun/                       # Bun 编译支持
    ├── cli.ts
    └── register-bedrock.ts
```

## 核心架构

### AgentSession - 3000 行的核心类

`AgentSession` 是 coding-agent 的核心，它在 `Agent` (agent-core) 之上添加了：

```
AgentSession 职责:
├── 会话持久化 (JSONL)
├── 模型管理 (切换、循环)
├── 思考等级管理
├── 上下文压缩 (自动/手动)
├── 自动重试 (指数退避)
├── 扩展系统 (加载、事件分发)
├── 工具注册表 (内置 + 自定义)
├── 系统提示词构建
├── 会话分支导航
├── Bash 命令执行
├── HTML/JSONL 导出
└── Skill/Prompt Template 展开
```

### createAgentSession - SDK 入口

```typescript
const { session, extensionsResult } = await createAgentSession({
  cwd: process.cwd(),
  model: getModel('anthropic', 'claude-opus-4-5'),
  thinkingLevel: 'high',
  tools: codingTools,  // [read, bash, edit, write]
  customTools: myTools,
});

await session.prompt("读取 package.json 并分析依赖");
```

## 内置工具

### 文件操作工具

| 工具 | 功能 | 关键特性 |
|------|------|---------|
| `read` | 读取文件 | 支持行范围、图片自动缩放、PDF 读取 |
| `write` | 写入文件 | 原子写入、自动创建目录 |
| `edit` | 编辑文件 | 字符串匹配替换、replace_all 支持 |
| `bash` | 执行命令 | 超时控制、输出截断、命令前缀 |
| `grep` | 搜索内容 | 基于 ripgrep、正则支持 |
| `find` | 查找文件 | Glob 模式、修改时间排序 |
| `ls` | 列目录 | 树形显示 |

### File Mutation Queue

文件修改操作使用队列保证顺序：

```typescript
const tools = withFileMutationQueue([editTool, writeTool]);
// edit 和 write 操作串行执行，避免并发文件冲突
```

## 会话管理

### JSONL 格式

会话使用 JSONL (JSON Lines) 持久化，支持树形结构：

```jsonl
{"type":"session","version":4,"id":"abc","timestamp":"2025-01-01","cwd":"/project"}
{"type":"message","id":"1","parentId":null,"message":{"role":"user","content":"hello"}}
{"type":"message","id":"2","parentId":"1","message":{"role":"assistant","content":[...]}}
{"type":"model_change","id":"3","parentId":"2","provider":"anthropic","modelId":"claude-opus-4-5"}
{"type":"thinking_level_change","id":"4","parentId":"3","thinkingLevel":"high"}
{"type":"compaction","id":"5","parentId":"4","summary":"...","firstKeptEntryId":"3"}
```

### 树形导航

会话支持分支，用户可以"回到过去"重新对话：

```
root → user1 → assistant1 → user2 → assistant2 (当前分支)
                           └→ user3 → assistant3 (另一分支，带摘要)
```

### 上下文压缩 (Compaction)

当上下文超过阈值时自动压缩：

1. **阈值触发** - 超过 context window 的配置百分比
2. **溢出触发** - LLM 返回 context overflow 错误
3. 调用 LLM 对旧消息生成摘要
4. 用摘要替换旧消息，保留最近的消息

## 扩展系统

### Extension 类型

```typescript
interface ExtensionFactory {
  (pi: ExtensionAPI): void;
}

interface ExtensionAPI {
  // 工具注册
  registerTool(definition: ToolDefinition): void;
  
  // 命令注册
  registerCommand(name: string, handler: CommandHandler): void;
  
  // 事件监听
  on(event: "tool_call", handler: ToolCallHandler): void;
  on(event: "tool_result", handler: ToolResultHandler): void;
  on(event: "message_end", handler: MessageEndHandler): void;
  on(event: "input", handler: InputHandler): void;
  on(event: "context", handler: ContextHandler): void;
  // ... 更多事件
  
  // 会话控制
  sendMessage(message): void;
  sendUserMessage(content): void;
  
  // 模型/工具控制
  setModel(model): boolean;
  getActiveTools(): string[];
  setActiveTools(names): void;
}
```

### 扩展加载

扩展从以下位置加载：
- `.pi/extensions/` (项目级)
- `~/.pi/agent/extensions/` (全局级)

支持 TypeScript (通过 jiti 运行时编译) 和 JavaScript。

### 扩展生命周期事件

```
session_start → agent_start → turn_start 
  → message_start → message_update → message_end
  → tool_execution_start → tool_execution_update → tool_execution_end
  → turn_end
→ agent_end → session_shutdown
```

## 系统提示词

`system-prompt.ts` 构建 system prompt，包含：

1. 基础身份和规则
2. 当前工作目录
3. 可用工具描述
4. 工具使用指南 (promptSnippet, promptGuidelines)
5. Skills 列表
6. AGENTS.md 上下文文件
7. 自定义追加内容
8. 扩展追加的系统提示词

## 运行模式

### Interactive Mode (交互式)

完整的 TUI 界面：
- 多行编辑器
- 流式消息渲染
- 工具执行可视化 (diff、bash 输出等)
- 快捷键 (Ctrl+P 切换模型, Ctrl+T 切换思考等级)
- 自动补全 (斜杠命令、文件路径)

### Print Mode (打印)

非交互式，适合脚本和 CI/CD：
```bash
pi "分析代码并修复 bug" --print
echo "请解释这个函数" | pi --print
```

### RPC Mode

程序化访问，输出结构化数据：
```bash
pi --json
```

## 对 Agent Harness 的启示

### 一个成熟的 Agent Harness 需要什么

1. **会话持久化** - 用户中断后可以恢复
2. **上下文管理** - 自动压缩，避免 context overflow
3. **自动重试** - 临时错误（限流、服务器错误）自动恢复
4. **扩展系统** - 用户可以添加自定义工具和行为
5. **安全机制** - 工具执行拦截、权限控制
6. **模型切换** - 运行时切换 LLM Provider 和模型
7. **丰富的 UI** - 实时反馈、进度显示、错误展示
8. **多模式支持** - 交互式 + 脚本化 + API
9. **资源管理** - Skills、Prompts、Themes 的发现和加载
10. **分支导航** - 对话树，支持回溯和重试
