# packages/pods - GPU Pod 管理工具

## 模块定位

`@mariozechner/pi` (pods 包) 是一个 **CLI 工具**，用于在远程 GPU Pod 上管理 vLLM 部署。它让用户可以通过简单的命令管理远程 GPU 服务器上的 LLM 推理服务。

## 核心功能

```
pi-pods (CLI)
├── Pod 管理
│   ├── setup   - 配置远程 GPU Pod (SSH + 挂载)
│   ├── list    - 列出所有 Pod
│   ├── active  - 切换活跃 Pod
│   ├── remove  - 移除 Pod 配置
│   ├── shell   - 打开远程 Shell
│   └── ssh     - 执行远程命令
│
├── 模型管理
│   ├── start   - 启动 vLLM 模型服务
│   ├── stop    - 停止模型 (单个或全部)
│   ├── list    - 列出运行中的模型
│   └── logs    - 查看模型日志
│
└── Agent 集成
    └── agent   - 使用 pi-coding-agent 与模型交互
```

## 源码结构

```
src/
├── cli.ts              # CLI 入口和命令路由
├── index.ts            # 库导出
├── config.ts           # 配置管理 (~/.pi/config.json)
├── types.ts            # 类型定义
├── ssh.ts              # SSH 操作封装
├── model-configs.ts    # 预定义模型配置
└── commands/
    ├── pods.ts         # Pod 管理命令
    ├── models.ts       # 模型管理命令
    └── prompt.ts       # Agent 交互命令
```

## 工作流程

### 1. Pod 设置

```bash
# 配置远程 GPU Pod
pi pods setup my-pod "ssh user@gpu-server" --mount "sshfs user@storage:/models /models"
```

Pod 配置保存到 `~/.pi/config.json`：

```json
{
  "pods": {
    "my-pod": {
      "ssh": "ssh user@gpu-server",
      "mount": "sshfs user@storage:/models /models",
      "modelsPath": "/models"
    }
  },
  "activePod": "my-pod"
}
```

### 2. 模型部署

```bash
# 启动预定义模型
pi start llama-70b --name my-llama --memory 90% --context 32k --gpus 4

# 或使用自定义 vLLM 参数
pi start my-model --name custom --vllm --model /models/my-model --tensor-parallel-size 4
```

支持的 vLLM 选项：
- `--memory` - GPU 显存分配 (30%, 50%, 90%)
- `--context` - 上下文窗口 (4k~128k)
- `--gpus` - GPU 数量
- `--vllm` - 直接传递 vLLM 参数

### 3. Agent 交互

```bash
# 交互式聊天
pi agent my-llama

# 单次提问
pi agent my-llama "分析这个代码"

# 继续之前的会话
pi agent my-llama --continue
```

## 技术实现

### SSH 封装

`ssh.ts` 封装了 SSH 命令执行：
- 流式输出 (sshExecStream)
- 后台执行
- 错误处理

### 模型配置

`model-configs.ts` 包含预定义的模型配置（HuggingFace 路径、推荐 GPU 数量、默认参数等），简化部署命令。

## 对 Agent 框架的意义

Pods 包解决了一个实际问题：**自托管 LLM 推理**。在企业环境中，你可能需要：
- 在自有 GPU 服务器上运行开源模型
- 通过 vLLM 获得高性能推理
- 使用与云端 API 相同的工具和工作流

它展示了 Agent 框架如何与自托管基础设施集成。
