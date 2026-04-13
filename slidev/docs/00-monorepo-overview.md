# Pi Mono - Monorepo 架构总览

## 项目定位

Pi Mono 是一个 **TypeScript Agent 框架 monorepo**，提供从底层 LLM API 抽象到上层 Coding Agent CLI、Web UI、Slack Bot 的完整 AI Agent 技术栈。项目采用分层架构，每一层职责明确，可独立使用也可组合使用。

## 技术栈

| 维度 | 选型 |
|------|------|≠
| 语言 | TypeScript (严格模式, ES2022) |
| 运行时 | Node.js >= 20.0.0 |
| 模块系统 | ESM (type: "module") |
| 包管理 | npm workspaces |
| 编译器 | tsgo (TypeScript Go 编译器) + tsc |
| 代码质量 | Biome (lint + format) |
| 测试 | Vitest |
| Git Hooks | Husky |

## 包依赖关系图

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│   mom    │  │  web-ui  │  │   pods   │
└─┬──┬──┬──┘  └────┬─────┘  └────┬─────┘
  │  │  │          │              │
  │  │  ▼          │              │
  │  │ ┌───────────────┐          │
  │  │ │ coding-agent  │          │
  │  │ └─┬─────┬─────┬─┘          │
  │  │   │     │     │            │
  │  ▼   ▼     │     │            │
  │ ┌─────────┐│     │            │
  │ │  agent  ││     │            │
  │ └────┬────┘│     │       ┌────┘
  │      │     │     │       │
  ▼      ▼     ▼     ▼       ▼
┌──────────────┐   ┌──────────┐
│      ai      │   │   tui    │
│  (LLM API)   │   │ (终端UI) │
└──────────────┘   └──────────┘
```

依赖箭头说明：
- **mom** → coding-agent, agent, ai
- **web-ui** → ai（仅此一个）
- **pods** → agent（→ ai）
- **coding-agent** → agent, ai, tui
- **agent** → ai
- **ai** 和 **tui** 互相独立，无内部依赖

> **注意：`ai` 和 `tui` 是两个完全独立的底层包，互不依赖。**

### 实际依赖关系（来自 package.json）

| 包 | 内部依赖 |
|----|---------|
| **`ai`** | 无（最底层，只依赖外部 LLM SDK） |
| **`tui`** | 无（最底层，纯终端 UI） |
| **`agent`** | `ai` |
| **`coding-agent`** | `agent` + `ai` + `tui` |
| **`web-ui`** | `ai`（package.json 中声明了 `tui` 但源码未实际引用，疑似残留依赖） |
| **`mom`** | `coding-agent` + `agent` + `ai` |
| **`pods`** | `agent` |

### 依赖层级说明

1. **`ai`** (底层) - 统一 LLM API 层，零内部依赖，只依赖各 LLM Provider SDK
2. **`tui`** (底层) - 纯终端 UI 渲染库，零内部依赖，与 `ai` 完全独立
3. **`agent`** (pi-agent-core) - 核心 Agent 框架，只依赖 `ai`
4. **`coding-agent`** - 编码 Agent CLI，同时依赖 `agent` + `ai` + `tui`
5. **`web-ui`** - Web 端 UI，实际只依赖 `ai`（package.json 声明了 `tui` 但源码未使用）
6. **`mom`** - Slack/Discord Bot，依赖 `coding-agent` + `agent` + `ai`（不依赖 tui）
7. **`pods`** - GPU Pod 管理工具，只依赖 `agent`

## 7 个子模块概览

| 包名 | npm 名称 | 类型 | 一句话描述 |
|------|----------|------|-----------|
| `ai` | `@mariozechner/pi-ai` | Library | 统一 LLM API，支持 10+ 个 Provider |
| `agent` | `@mariozechner/pi-agent-core` | Library | Agent 核心运行时：循环、工具执行、状态管理 |
| `tui` | `@mariozechner/pi-tui` | Library | 终端 UI 框架：差分渲染、组件系统 |
| `coding-agent` | `@mariozechner/pi-coding-agent` | CLI + Library | 编码 Agent CLI (pi 命令)：文件操作、Bash、Session |
| `web-ui` | `@mariozechner/pi-web-ui` | Library | Web Chat UI 组件库 (Lit) |
| `pods` | `@mariozechner/pi` | CLI | GPU Pod 上的 vLLM 部署管理 |
| `mom` | `@mariozechner/pi-mom` | CLI | Slack/Discord Bot，委托 Coding Agent 执行任务 |

## 构建系统

### 构建顺序（串行）

```bash
tui → ai → agent → coding-agent → mom → web-ui → pods
```

### 关键脚本

```json
{
  "build": "cd packages/tui && npm run build && cd ../ai && ...",
  "dev": "concurrently [所有包并行 watch]",
  "check": "biome check + tsgo --noEmit + smoke tests",
  "test": "npm run test --workspaces",
  "publish": "npm publish -ws --access public"
}
```

### 版本同步

所有包统一版本号 (当前 v0.64.0)，通过 `scripts/sync-versions.js` 同步。

## 工程化亮点

1. **懒加载 Provider** - `register-builtins.ts` 使用 `import()` 动态加载 LLM Provider，避免启动时加载所有 SDK
2. **tsgo 编译** - 使用 Go 实现的 TypeScript 编译器加速构建
3. **TypeBox Schema** - 工具参数使用 TypeBox 定义 JSON Schema，兼具类型安全和运行时校验
4. **npm workspaces** - 无额外构建工具 (无 Turbo/NX/Lerna)，保持简洁
5. **Biome** - 替代 ESLint + Prettier，统一 lint 和 format

## 仓库结构

```
pi-mono/
├── packages/
│   ├── ai/            # LLM API 统一抽象
│   ├── agent/         # Agent 核心框架
│   ├── tui/           # 终端 UI 库
│   ├── coding-agent/  # Coding Agent CLI
│   ├── web-ui/        # Web UI 组件
│   ├── pods/          # GPU Pod 管理
│   └── mom/           # Slack/Discord Bot
├── scripts/           # 构建、发布、分析脚本
├── biome.json         # Lint/Format 配置
├── tsconfig.json      # TypeScript 根配置
├── tsconfig.base.json # TypeScript 基础配置
└── package.json       # Monorepo 根配置
```
