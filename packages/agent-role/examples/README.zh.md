# Agent Role 示例层

[English](README.md) | 中文

面向基于 base 的 profile 的参考示例，用于声明具名 agent 角色。该文件是一份完整 patch，但其中的网关路由、model id 与 API key 都是占位值；运行前请先适配。

`roles.cordis.patch.yml` 是一个 Cordis patch 列表，在 `dsh-base` 之后应用：它覆盖 base 声明的 `llm-pi-ai` 与 `agent-default-model` 行，并 `insert:` preset 注册表、它的两个 preset、角色目录及其委派工具。把其中的行粘贴进某个 profile 自己的 `cordis.patch.yml`，或把它作为一次运行的 overlay patch 启动。如果目标 profile 已经组合了 preset 注册表，请保留那一行，并让角色表引用其中的 preset id，而不是插入第二个注册表。

## 凭据环境变量

示例声明了两条路由，每条都按请求通过凭据 seam 解析各自的 key——绝不内联。要让本示例真正访问模型，请导出：

- `MGOOLE_API_KEY`——orchestrator 路由，同时服务主 agent。
- `MGOOLE_WORKER_API_KEY`——隔离的 worker 路由。

## 示例展示了什么

- 主 agent 的 endpoint、key 与 model 来自 `agent-default-model` 行（`provider: mgoole`、`model: mgoole-orchestrator`）及其匹配的 `llm-pi-ai` 路由。该行决定顶层 session 运行在什么之上；其下的 `roles` 表不影响主 agent。
- 子 agent 的 model 来自 `roles` 表。每个角色把 `model.provider` 与 `model.model` 绑定到已声明的路由，因此子 agent 运行在其角色指定的 model 上，而不是继承主 agent 的。`worker` 角色指向单独的 `mgoole-worker` 路由。
- orchestrator 与 worker 使用 `agentPreset`，由本 patch 声明的两个 preset 持有它们的人设与工具组合。auditor 使用 `contextDefault: fork`，继承父级已完成的轮次与组合，且不声明 preset。fork 角色并不自动只读：它能否编辑取决于它继承的父级组合。
- `delegationDepth` 是该角色 child 的绝对创建上限。每个 child 的深度至少为 `1`，因此 `0` 会阻止创建；示例给 orchestrator 与 worker `2`、auditor `1`，而不是用 `0` 表示“不能再委派”。
- `tool-agent-role` 行挂载面向模型的工具，该工具解析已声明的角色并启动其 backing subagent。

## 适配它

路由名、model id 与 endpoint 都是占位值；请把它们指向该部署实际服务的网关。`backingProvider` 可选地命名一个已注册的 `@deepseek-ai/dsh-subagent` provider；省略时消费方按 `contextDefault` 选择 fresh 或 fork provider。角色为其设置的字段需要所选 provider 具备相应能力：声明的 model 路由需要 `agentOptions`，preset 需要 `agentPreset`，`delegationDepth` 需要 `depthLimit`。省略 `model` 会继承 provider 路由，且不需要 `agentOptions`。
