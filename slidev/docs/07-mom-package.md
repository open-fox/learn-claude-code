# packages/mom - Slack/Discord Bot Agent

## 模块定位

`@mariozechner/pi-mom` 是一个 **Slack/Discord Bot**，它将 Coding Agent 的能力暴露到聊天平台。用户在 Slack 中发消息，Bot 调用 Agent 执行任务（运行命令、读写文件等），并将结果回复到 Slack。

## 核心架构

```
Slack/Discord 消息
       │
       ▼
┌──────────────┐     ┌──────────────┐
│  SlackBot    │     │  DiscordBot  │
│  (slack.ts)  │     │ (discord.ts) │
└──────┬───────┘     └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────────────────────────┐
│        MomHandler (main.ts)      │
│  ├── channelStates (per channel) │
│  ├── AgentRunner cache           │
│  └── Events watcher              │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│     AgentRunner (agent.ts)       │
│  ├── Agent (pi-agent-core)       │
│  ├── AgentSession (pi-coding-agent) │
│  ├── SessionManager              │
│  ├── Custom Tools (bash, read, write, edit, attach) │
│  └── Sandbox (Docker/Host)       │
└──────────────────────────────────┘
```

## 源码结构

```
src/
├── main.ts           # Slack Bot 主入口
├── main-discord.ts   # Discord Bot 入口
├── agent.ts          # ★ Agent 运行器 (800+ 行)
├── slack.ts          # Slack Socket Mode 集成
├── discord.ts        # Discord Bot 集成
├── context.ts        # 上下文管理
├── events.ts         # 事件系统 (定时触发)
├── sandbox.ts        # 沙箱 (Docker/Host)
├── store.ts          # 频道存储
├── download.ts       # Slack 附件下载
├── log.ts            # 日志系统
└── tools/            # 自定义工具
    ├── index.ts      # 工具注册
    ├── bash.ts       # Bash 执行 (可在 Docker 中)
    ├── read.ts       # 文件读取
    ├── write.ts      # 文件写入
    ├── edit.ts       # 文件编辑
    ├── attach.ts     # Slack 文件上传
    └── truncate.ts   # 输出截断
```

## 核心功能

### 1. 每频道 Agent

每个 Slack 频道维护独立的 Agent 实例：

```typescript
const channelRunners = new Map<string, AgentRunner>();

function getOrCreateRunner(sandboxConfig, channelId, channelDir): AgentRunner {
  let existing = channelRunners.get(channelId);
  if (existing) return existing;
  // 创建新的 Agent + Session + Tools
  const runner = createRunner(sandboxConfig, channelId, channelDir);
  channelRunners.set(channelId, runner);
  return runner;
}
```

### 2. 沙箱执行

工具执行支持两种模式：

| 模式 | 说明 | 安全性 |
|------|------|--------|
| `host` | 直接在宿主机执行 | 低 (需信任用户) |
| `docker` | 在 Docker 容器中执行 | 高 (隔离环境) |

```bash
# 使用 Docker 沙箱
mom --sandbox=docker:mom-sandbox /path/to/workspace
```

### 3. 事件系统

Mom 支持三种事件触发方式：

```json
// 立即触发
{"type": "immediate", "channelId": "C123", "text": "新 Issue 已创建"}

// 定时触发 (一次性)
{"type": "one-shot", "channelId": "C123", "text": "提醒开会", "at": "2025-12-15T09:00:00+01:00"}

// 周期触发
{"type": "periodic", "channelId": "C123", "text": "检查邮箱", "schedule": "0 9 * * 1-5"}
```

事件文件存放在 `workspace/events/` 目录。

### 4. 记忆系统

```
workspace/
├── MEMORY.md              # 全局记忆
├── SYSTEM.md              # 环境配置记录
├── events/                # 事件文件
├── skills/                # 全局 Skills
└── {channelId}/
    ├── MEMORY.md          # 频道记忆
    ├── log.jsonl          # 消息历史
    ├── context.jsonl      # Agent 会话
    ├── attachments/       # 用户附件
    ├── scratch/           # 工作目录
    └── skills/            # 频道 Skills
```

### 5. Slack 集成

- **Socket Mode** - 通过 WebSocket 接收事件
- **消息更新** - 用 `_Thinking_` → 工具执行 → 最终回复 的方式实时更新消息
- **线程回复** - 工具执行详情发到线程
- **文件上传** - attach 工具支持上传文件到 Slack
- **[SILENT]** - 定时任务无事可报时静默删除消息

### 6. 系统提示词

Mom 的系统提示词包含：
- Slack mrkdwn 格式化规则
- 频道/用户 ID 映射
- 工作区目录结构
- Skills 使用指南
- 事件系统说明
- 记忆系统说明
- 日志查询示例

## Agent 运行流程

```
1. Slack 消息到达
2. 下载附件到 workspace/{channelId}/attachments/
3. 同步 log.jsonl 中的离线消息到 context.jsonl
4. 更新系统提示词 (刷新记忆、频道信息、Skills)
5. 构建用户消息: "[时间戳] [用户名]: 消息内容"
6. 调用 session.prompt()
7. 事件监听器处理:
   - tool_execution_start → 发送 "_→ 工具标签_"
   - tool_execution_end → 线程中发送工具详情
   - message_end → 发送 AI 回复
   - compaction_start/end → 通知压缩状态
8. 更新 Slack 主消息为最终回复
9. 发送 token 用量统计到线程
```

## 对 Agent 框架的启示

### 将 Agent 嵌入聊天平台的关键问题

1. **状态持久化** - 频道间独立会话，掉线后可恢复
2. **安全沙箱** - Agent 有 bash 权限，必须隔离
3. **异步执行** - 一个频道只能同时运行一个任务
4. **用户反馈** - 实时更新 Slack 消息显示进度
5. **记忆机制** - MEMORY.md 让 Agent 跨对话保持上下文
6. **事件系统** - 不只是被动响应，还能主动触发 (定时任务、Webhook)
7. **输出格式** - Slack mrkdwn ≠ Markdown，需要格式转换
8. **成本控制** - 显示 token 用量和成本

### Mom 展示了 Agent SDK 的灵活性

Mom 复用了 `pi-agent-core` 和 `pi-coding-agent` 的核心能力：
- `Agent` 类提供循环和状态管理
- `AgentSession` 提供会话持久化和压缩
- `convertToLlm` 处理消息转换
- `SessionManager` 处理 JSONL 持久化

同时添加了平台特定的适配层（Slack 集成、Docker 沙箱、事件系统）。
