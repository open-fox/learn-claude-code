# packages/tui - 终端 UI 框架

## 模块定位

`@mariozechner/pi-tui` 是一个 **差分渲染终端 UI 框架**，为 Coding Agent CLI 提供丰富的终端交互体验。它实现了类似 React 的组件化渲染，但目标平台是终端而非浏览器。

## 核心特性

1. **差分渲染** - 只更新变化的行，避免终端闪烁
2. **组件系统** - 可组合的 UI 组件 (Editor, Markdown, SelectList 等)
3. **Overlay 系统** - 支持浮动层 (对话框、自动补全)
4. **输入处理** - 键盘事件、焦点管理、IME 支持
5. **图片渲染** - 支持 Kitty/Sixel/iTerm2 等终端图片协议

## 源文件结构

```
src/
├── tui.ts               # TUI 主引擎：差分渲染、布局、overlay
├── terminal.ts          # 终端底层抽象：ANSI 控制序列
├── terminal-image.ts    # 终端图片渲染
├── keys.ts              # 按键识别 (Kitty 协议)
├── keybindings.ts       # 快捷键系统
├── stdin-buffer.ts      # stdin 缓冲管理
├── utils.ts             # 宽字符处理、段落提取
├── fuzzy.ts             # 模糊匹配
├── undo-stack.ts        # 撤销/重做栈
├── kill-ring.ts         # Emacs 式 kill ring
├── autocomplete.ts      # 自动补全引擎
├── editor-component.ts  # 编辑器高级组件
└── components/
    ├── editor.ts         # 多行文本编辑器
    ├── input.ts          # 单行输入框
    ├── markdown.ts       # Markdown 渲染
    ├── text.ts           # 文本显示
    ├── truncated-text.ts # 截断文本
    ├── box.ts            # 边框容器
    ├── spacer.ts         # 空间填充
    ├── loader.ts         # 加载指示器
    ├── cancellable-loader.ts  # 可取消加载
    ├── image.ts          # 图片组件
    ├── select-list.ts    # 选择列表
    └── settings-list.ts  # 设置列表
```

## 核心设计

### 1. Component 接口

```typescript
interface Component {
  render(width: number): string[];   // 渲染为行数组
  handleInput?(data: string): void;  // 处理键盘输入
  wantsKeyRelease?: boolean;         // 是否需要按键释放事件
  invalidate(): void;                // 清除缓存
}

interface Focusable {
  focused: boolean;  // 焦点状态
}
```

所有组件实现 `render(width) → string[]`，TUI 引擎负责将这些行渲染到终端。

### 2. 差分渲染引擎

TUI 引擎的核心是 **逐行差分更新**：

```
上一帧: ["Hello World", "Line 2", "Line 3"]
当前帧: ["Hello World", "Line 2 (modified)", "Line 3", "Line 4"]

差分结果:
- Line 1: 相同，跳过
- Line 2: 不同，移动光标到第2行，写入新内容
- Line 3: 相同，跳过  
- Line 4: 新行，追加
```

关键优化：
- 使用 ANSI escape sequence 精确定位光标
- 只传输变化的内容
- 支持终端图片行的特殊处理 (Kitty/Sixel)

### 3. Overlay 系统

```typescript
type OverlayAnchor = 
  | "center" | "top-left" | "top-right" 
  | "bottom-left" | "bottom-right"
  | "top-center" | "bottom-center" 
  | "left-center" | "right-center";

interface OverlayMargin {
  top?: number; right?: number; bottom?: number; left?: number;
}
```

Overlay 渲染在主内容之上，支持定位和边距。用于：
- 自动补全弹窗
- 模型选择对话框
- 设置面板

### 4. 光标管理

使用 `CURSOR_MARKER` (APC 序列 `\x1b_pi:c\x07`) 标记光标位置：

```
组件 render() 输出: "Hello |" + CURSOR_MARKER + " World"
TUI 引擎: 找到 marker → 移除 → 定位硬件光标到该位置
```

这使得 IME 输入法候选窗口能正确定位。

## 组件库

### Editor 组件

功能完整的多行文本编辑器：
- 多行编辑，自动换行
- Undo/Redo (undo-stack.ts)
- Kill Ring (kill-ring.ts, Emacs 风格剪切板)
- 自动补全
- 语法高亮（通过外部配置）
- CJK 宽字符支持

### Markdown 组件

终端 Markdown 渲染：
- 标题、粗体、斜体
- 代码块（带语法高亮）
- 列表、引用
- 链接
- 使用 `marked` 解析 + `chalk` 着色

### 其他组件

- **SelectList** - 可选择列表，支持模糊搜索
- **Box** - 带边框的容器
- **Loader** / **CancellableLoader** - 加载状态指示
- **Image** - 终端图片渲染

## 东亚字符处理

`utils.ts` 中的 `visibleWidth()` 正确处理 CJK 字符宽度：

```typescript
import { eastAsianWidth } from "get-east-asian-width";

function visibleWidth(str: string): number {
  // 处理全角字符 (W, F) 占2列
  // 处理 ANSI escape sequences (0列)
  // 处理 emoji (2列)
}
```

## 对 Agent 框架的启示

### 为什么 Agent CLI 需要 TUI

1. **实时流式显示** - Agent 响应是流式的，需要逐字渲染
2. **多区域布局** - 编辑器区、消息区、状态栏、叠加层同时显示
3. **交互式中断** - 用户可以在 Agent 运行时输入 steering 消息
4. **丰富反馈** - 工具执行进度、token 用量、成本统计实时显示

### 设计教训

1. **差分渲染是必须的** - 终端全量重绘会闪烁，尤其是大量文本时
2. **组件化降低复杂度** - 每个组件只关心自己的渲染逻辑
3. **宽字符处理不可忽视** - CJK 用户的基本需求
4. **Overlay 比分区更灵活** - 浮动层可以按需显示/隐藏
