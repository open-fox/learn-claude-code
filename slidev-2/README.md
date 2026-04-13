# Learn Claude Code · Slidev Deck

这是一套基于 `learn-claude-code/docs/en` 中 `s01` 到 `s19` 教程章节整理出的详细 `Slidev` 课件。

## 内容范围

- `s01` The Agent Loop
- `s02` Tool Use
- `s03` TodoWrite
- `s04` Subagent
- `s05` Skills
- `s06` Context Compact
- `s07` Permission System
- `s08` Hook System
- `s09` Memory System
- `s10` System Prompt
- `s11` Error Recovery
- `s12` Task System
- `s13` Background Tasks
- `s14` Cron Scheduler
- `s15` Agent Teams
- `s16` Team Protocols
- `s17` Autonomous Agents
- `s18` Worktree + Task Isolation
- `s19` MCP & Plugin

## 设计原则

- 按教程章节顺序组织
- 每章包含：问题、机制、核心变化、关键代码、takeaway
- 视觉语言参考 `web` 端：分层颜色、圆角卡片、浅色背景、深色代码面板
- 适当使用 `v-click`、流程图、代码高亮来增强讲解节奏

## 目录结构

- `slides.md`：主课件
- `styles/index.css`：自定义视觉样式
- `package.json`：运行脚本

## 使用方式

```bash
cd learn-claude-code/slidev
npm install
npm run dev
```

构建静态版本：

```bash
npm run build
```

如需导出 PDF，可在安装浏览器依赖后执行：

```bash
npm run export
```
