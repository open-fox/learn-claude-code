# packages/web-ui - Web Chat UI 组件库

## 模块定位

`@mariozechner/pi-web-ui` 是一个基于 **Lit Web Components** 的 AI Chat 界面组件库。它提供了完整的聊天界面，支持消息渲染、文档预览、代码沙箱、模型选择等功能，可嵌入任何 Web 应用。

## 技术栈

| 维度 | 选型 |
|------|------|
| UI 框架 | Lit + mini-lit (Web Components) |
| 样式 | Tailwind CSS |
| 文档预览 | pdfjs-dist, docx-preview, xlsx |
| 图标 | Lucide |
| 本地模型 | LM Studio SDK, Ollama |
| 打包 | TypeScript + Tailwind 编译 |

## 源码结构

```
src/
├── index.ts                   # 库入口
├── ChatPanel.ts               # 主聊天面板
│
├── components/                # 核心 UI 组件
│   ├── AgentInterface.ts      # Agent 交互界面
│   ├── MessageList.ts         # 消息列表
│   ├── Messages.ts            # 消息容器
│   ├── Input.ts               # 输入框
│   ├── AttachmentTile.ts      # 附件瓷片
│   ├── ConsoleBlock.ts        # 控制台输出块
│   ├── ExpandableSection.ts   # 可展开区域
│   ├── MessageEditor.ts       # 消息编辑器
│   ├── ProviderKeyInput.ts    # API Key 输入
│   ├── CustomProviderCard.ts  # 自定义 Provider 卡片
│   ├── StreamingMessageContainer.ts  # 流式消息容器
│   ├── ThinkingBlock.ts       # 思考块显示
│   ├── SandboxedIframe.ts     # 沙箱 iframe
│   └── message-renderer-registry.ts  # 消息渲染注册
│   └── sandbox/               # 沙箱运行时
│       ├── RuntimeMessageBridge.ts
│       ├── RuntimeMessageRouter.ts
│       ├── SandboxRuntimeProvider.ts
│       ├── ArtifactsRuntimeProvider.ts
│       ├── AttachmentsRuntimeProvider.ts
│       ├── ConsoleRuntimeProvider.ts
│       └── FileDownloadRuntimeProvider.ts
│
├── dialogs/                   # 对话框组件
│   ├── SettingsDialog.ts      # 设置对话框
│   ├── ModelSelector.ts       # 模型选择器
│   ├── ProvidersModelsTab.ts  # Provider/Model 配置
│   ├── ApiKeyPromptDialog.ts  # API Key 输入对话框
│   ├── CustomProviderDialog.ts # 自定义 Provider
│   ├── SessionListDialog.ts   # 会话列表
│   ├── AttachmentOverlay.ts   # 附件预览
│   └── PersistentStorageDialog.ts  # 持久存储
│
├── tools/                     # 工具渲染
│   ├── index.ts               # 工具注册
│   ├── types.ts               # 工具类型
│   ├── extract-document.ts    # 文档提取
│   ├── javascript-repl.ts     # JS REPL
│   ├── renderer-registry.ts   # 渲染器注册
│   ├── renderers/             # 具体渲染器
│   │   ├── BashRenderer.ts
│   │   ├── CalculateRenderer.ts
│   │   ├── DefaultRenderer.ts
│   │   └── GetCurrentTimeRenderer.ts
│   └── artifacts/             # Artifact 系统
│       ├── artifacts.ts       # Artifact 工具定义
│       ├── ArtifactElement.ts # Artifact 容器
│       ├── ArtifactPill.ts    # Artifact 药丸标签
│       ├── HtmlArtifact.ts    # HTML 预览
│       ├── SvgArtifact.ts     # SVG 预览
│       ├── PdfArtifact.ts     # PDF 预览
│       ├── DocxArtifact.ts    # Word 文档预览
│       ├── ExcelArtifact.ts   # Excel 预览
│       ├── MarkdownArtifact.ts # Markdown 预览
│       ├── ImageArtifact.ts   # 图片预览
│       ├── TextArtifact.ts    # 文本预览
│       ├── GenericArtifact.ts # 通用预览
│       └── Console.ts         # 控制台
│
├── storage/                   # 持久化层
│   ├── app-storage.ts         # 应用存储
│   ├── store.ts               # 状态管理
│   ├── types.ts               # 存储类型
│   ├── backends/
│   │   └── indexeddb-storage-backend.ts  # IndexedDB 后端
│   └── stores/
│       ├── sessions-store.ts   # 会话存储
│       ├── settings-store.ts   # 设置存储
│       ├── provider-keys-store.ts  # API Key 存储
│       └── custom-providers-store.ts  # 自定义 Provider 存储
│
├── utils/                     # 工具函数
│   ├── attachment-utils.ts    # 附件处理
│   ├── auth-token.ts          # 认证 token
│   ├── format.ts              # 格式化
│   ├── i18n.ts                # 国际化
│   ├── model-discovery.ts     # 模型发现
│   ├── proxy-utils.ts         # 代理工具
│   └── test-sessions.ts       # 测试数据
│
└── prompts/
    └── prompts.ts             # 提示词
```

## 核心功能

### 1. Chat 界面

完整的聊天体验：
- 消息列表（用户、助手、工具结果）
- 流式消息渲染（ThinkingBlock、StreamingMessageContainer）
- 输入框（多行、附件支持）
- 消息编辑和重发

### 2. Artifact 系统

AI 生成内容的实时预览：
- **HTML** - 沙箱 iframe 中实时渲染
- **SVG** - 矢量图预览
- **PDF** - pdfjs-dist 渲染
- **Word** - docx-preview 渲染
- **Excel** - xlsx 解析和表格展示
- **Markdown** - 富文本渲染
- **代码** - 语法高亮 + 控制台

### 3. 沙箱系统

HTML/JS Artifact 在 `SandboxedIframe` 中安全执行：

```
ChatPanel
  └── SandboxedIframe
       ├── RuntimeMessageBridge   (通信桥)
       ├── RuntimeMessageRouter   (消息路由)
       ├── ArtifactsRuntimeProvider  (Artifact 管理)
       ├── AttachmentsRuntimeProvider (附件访问)
       ├── ConsoleRuntimeProvider    (控制台拦截)
       └── FileDownloadRuntimeProvider (文件下载)
```

### 4. 存储层

基于 IndexedDB 的持久化：

```
AppStorage
├── SessionsStore      # 会话历史
├── SettingsStore       # 用户设置
├── ProviderKeysStore   # API Key (加密存储)
└── CustomProvidersStore # 自定义 Provider 配置
```

### 5. 本地模型支持

直接连接本地运行的模型：
- **LM Studio** - 通过 `@lmstudio/sdk` 连接
- **Ollama** - 通过 `ollama` SDK 连接

### 6. 工具渲染器注册

可扩展的工具结果渲染：

```typescript
// 注册自定义渲染器
registerRenderer("bash", BashRenderer);
registerRenderer("calculate", CalculateRenderer);
```

## 与 ai 包的集成

web-ui 直接使用 `@mariozechner/pi-ai` 进行 LLM 通信：
- 使用 `stream()` / `streamSimple()` 进行流式对话
- 使用 Model Registry 发现可用模型
- 支持所有 pi-ai 支持的 Provider

## 对 Agent 框架的启示

### Web 端 Agent UI 需要考虑的问题

1. **流式渲染性能** - 大量 delta 事件需要高效 DOM 更新
2. **沙箱安全** - AI 生成的 HTML/JS 必须在沙箱中运行
3. **状态持久化** - IndexedDB 用于离线存储会话和设置
4. **多 Provider 支持** - 用户可能使用不同 Provider，需要统一管理 API Key
5. **文档预览** - Agent 经常生成各种格式的文件，需要丰富的预览能力
6. **本地模型** - 隐私敏感场景需要支持本地推理
