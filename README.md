# dsh-provider-mgoole

Planner / Executor / Verifier agent roles for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）。

三个默认角色分工：**Planner** 只做拆解与规划，**Executor** 严格按单步指令执行，**Verifier** 只读核验并按验收标准给出证据。三者由 `role_agent` 工具暴露给模型，Provider / 模型 / reasoning effort 都在设置页里选，不用手填。

## 包含的包

| 包 | 作用 |
| --- | --- |
| `@deepseek-ai/dsh-experimental-agent-role` | 声明式角色目录：角色定义、校验、解析 |
| `@deepseek-ai/dsh-experimental-tool-agent-role` | `role_agent` 委派工具 + `list_agent_roles` 发现工具 |
| `@deepseek-ai/dsh-experimental-client-ui-agent-role-config` | Web 设置页角色编辑卡片 |
| `@deepseek-ai/dsh-experimental-agent-role-profile` | 上面三个的 bundle 组合层，声明三个默认角色 |

## 安装

先看下面的 [兼容性](#兼容性) 一节。四个包**未发布到 npm**，需要用本仓库 `artifacts/` 里的 tarball 安装，并在 profile 里加 overrides 指向这些文件：

```yaml
# ~/.dsh/profiles/web/pnpm-workspace.yaml
overrides:
  '@deepseek-ai/dsh-experimental-agent-role': file:/path/to/deepseek-ai-dsh-experimental-agent-role-0.2.1-rc.2.tgz
  '@deepseek-ai/dsh-experimental-tool-agent-role': file:/path/to/deepseek-ai-dsh-experimental-tool-agent-role-0.2.1-rc.2.tgz
  '@deepseek-ai/dsh-experimental-client-ui-agent-role-config': file:/path/to/deepseek-ai-dsh-experimental-client-ui-agent-role-config-0.2.1-rc.2.tgz
```

然后安装 bundle：

```sh
dsh plugin --profile web add /path/to/deepseek-ai-dsh-experimental-agent-role-profile-0.2.1-rc.2.tgz
```

`artifacts/SHA256SUMS` 记录了四个 tarball 的校验和，安装前建议核对。

校验和安装是否生效：

```sh
dsh --profile web --dump-config | grep -A2 agent-roles
```

设置页在 **Plugins → Agent Roles**，可以编辑角色、选 Provider / 模型 / reasoning effort。

## 兼容性

**必须用本仓库对应的 dsh 版本（0.2.1-rc.2 之后含 agent-role 特性的构建）。**

原因是这三个包用到了 `@deepseek-ai/dsh-subagent` 里尚未发布到 npm 的字段：

- `SubagentExecutionBudget`（类型）、`startActivation` 的 `displayLabel`、`request.executionBudget`、`request.capacityGroup`

npm 上公开的 `@deepseek-ai/dsh-subagent@0.2.1-rc.2` 里这些成员都不存在。运行时这些字段是可选的、会被忽略，所以**功能能用，但 executionBudget 与 capacityGroup 不生效，子代理完成通知里显示的是任务标签而不是角色名**。用 TypeScript 直接引用源码会编译失败。

## 从源码构建

```sh
pnpm install
pnpm run build          # 三个 Host 包
pnpm run build:client   # 客户端 bundle
pnpm run pack:plugins   # 输出 tarball 到 dist/
```

`pnpm run build` 在 npm 上公开的 subagent 版本下会报三个类型错误（见 [兼容性](#兼容性)）；要完整构建需要能解析到含这些成员的 dsh 工作区。

## 来源

代码来自 DeepSeek Harness 仓库的 `packages/experimental/{agent-role,tool-agent-role,client-ui-agent-role-config,agent-role-profile}`，提交 `562ffcc214`，按 MIT 协议分发（见 `LICENSE`）。
