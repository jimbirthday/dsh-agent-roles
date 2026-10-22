---
description: "为 subagent 委派声明具名 agent 角色——模型路由、agent preset、backing provider 与委派默认值——并通过 ctx.agentRoles 读回。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-role

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-role` 在配置中声明具名 agent 角色，并通过 `ctx.agentRoles` 回答关于它们的问题。一个角色绑定一条可选的模型路由、可选的 agent preset、可选的 subagent backing provider、一种上下文模式、可选的委派深度上限，以及可选的结构化输出 schema。本包只定义角色：消费方解析一个角色并把其字段复制进 `ctx.subagents.startActivation()` 请求，因此仅挂载本包不改变任何模型可见行为。`roles` 与 `backingProvider` 都是 volatile，因此用户在插件页面上编辑它们，后续读取即可看到改动。本包为实验性功能。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当部署希望把各委派目标之间的差异以配置命名，而不是在每个工具实例上重复时，挂载本包。目录持有名称、模型路由、agent preset 与委派默认值；它不启动任何东西，也不执行任何东西。

### 何时选择

当多个委派目标仅在模型与组合上有差异，且部署希望把这些差异一次性声明为具名角色时，选择本包。在已经提供 Subagent 服务的组合中挂载它，并与解析角色、启动 child 的消费方配合使用。当一个带逐次调用参数的工具实例已足够，或 child 模型是逐 Session 的用户决策而非部署配置时，选择 `dsh-tool-subagent`。

### 最小工作配置

`roles` 表默认为空。请从此源码检出把本包安装到 Web profile；由于本包不声明 bundle patch，CLI 会将它作为普通依赖安装：

```sh
pnpm dsh plugin --profile web add ./packages/experimental/agent-role
```

然后通过 Plugins 页面或 profile 的 `cordis.patch.yml` 添加声明；声明一个角色的最小组合需要提供它：

```yaml
- name: '@deepseek-ai/dsh-experimental-agent-role'
  config:
    backingProvider: spawn
    roles:
      reviewer:
        label: Reviewer
        description: Reviews the current change
        tags: [review, diff]
        model:
          provider: deepseek-official
          model: deepseek-flash
        agentPreset: reviewer
        contextDefault: fresh
        delegationDepth: 1
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `roles` | `{}` | 角色名到定义的映射表；每个键都是一个角色的不可变名称 |
| `backingProvider` | `spawn` | `backingProviderFor` 返回的部署兜底值；解析后的角色会保留未声明状态，由消费方按 `context` 选择 |

生成的[配置目录](../../../docs/config-catalog.zh.md)是每个受支持字段及其 JSDoc 的穷尽式真源。声明角色不会创建任何工具、agent 或 child；只有在消费方启动 child 时，解析后的值才会到达 child。

### 角色表

一个角色绑定消费方复制进单次 subagent start 的那些值：可选的模型路由（`model.provider`、`model.model`，以及可选的 `model.reasoningEffort` 与 `model.maxTokens`）、可选的 agent preset（`agentPreset`）、可选的 subagent 提供方（`backingProvider`）、child 是 fresh 启动还是继承调用方已完成轮次（`contextDefault`）、绝对委派深度上限（`delegationDepth`）、可选的部署容量组（`capacityGroup`）、可选的墙钟执行预算（`executionBudget.wallClockMs`），以及用于结构化最终结果的、以对象为根的 JSON Schema（`outputSchema`）。可选的 `tags` 是发现关键词：消费方可以据此匹配角色，但它们不会改变 child start。

`tags` 最多 16 项，每项是长度不超过 64 个字符的非空单 token 字符串，且不得重复。读取角色会返回独立副本；标签不会进入 child 请求。

preset 持有 child 的人设与工具组合。它的 id 必须指向部署已注册的 preset，消费方会把它作为 child start 的 `agentPreset` 传入。preset 需要 fresh provider：声明 `contextDefault: fork` 的角色继承父级组合，若同时声明 `agentPreset` 会在加载时被拒绝。省略 `agentPreset` 时组合交给 subagent provider，默认会加入父级当前组合。

省略 `model` 时 child 的路由交给 provider：本地 provider 继承父级路由，外部 provider 保留自己的路由。声明 `model` 需要 provider 的 `agentOptions` 能力。`backingProvider` 可选。声明时消费方使用该 provider；省略时消费方按 `context` 选择部署的 fresh 或 fork provider。`backingProviderFor(name)` 返回显式 provider 或部署兜底值，并以 `ROLE_UNKNOWN` 拒绝未知名称。

`delegationDepth` 是创建 child 时的绝对深度上限。启动的 child 深度至少为 `1`，因此 `0` 会阻止该角色被创建；它的含义不是“角色存在但不能再委派”。请省略该字段，或使用能容纳预期角色层级的数值。

`capacityGroup` 命名一个必须由 Subagent 运行时在 `capacityGroups` 表中声明的组。数值上限由运行时拥有，全局 `maxActiveSubagents` 限制仍然生效。未声明的组会在任何 provider 工作前以 `UNKNOWN_CAPACITY_GROUP` 拒绝启动；组名是运行时配置，绝不会传给 provider。省略该字段即使用无分组接纳。

`executionBudget.wallClockMs` 必须是正安全整数，并作为 child start 的 `executionBudget` 转发。subagent 运行时在准入时开始计时，因此 provider 启动与 child 实际工作共享该上限；超时后会走正常取消路径释放 activation，再报告 `stopReason: 'timeout'`。每次 activation（包括冷恢复）都开始新预算；持久 descriptor 不携带它。省略该字段即不设墙钟上限。

`outputSchema` 会在加载时以及每次读取时按 subagent 结构化输出运行时接受的 JSON Schema 子集校验，且必须以对象为根。消费方把它作为 child start 的 `outputSchema` 转发；随后 subagent 运行时提供匹配的结构化输出工具，校验已提交的值，并把该值作为 child 的结构化结果报告。backing provider 必须声明 `outputSchema` 能力。

### 读取角色

`list()` 按名称顺序为每个有效角色返回一个 `RoleSummary`：`name`、`label`、可选 `description`、可选 `tags`、解析后的 `context`、可选 `agentPreset`、可选 `capacityGroup`、可选 `executionBudget`、`provider`、`model`、`restricted`（在角色声明了 `agentPreset` 时为真），以及 `structuredOutput`（在角色声明了 `outputSchema` 时为真）。preset 可能收窄 child 的工具，但 `restricted` 只是描述，不构成安全保证；preset 的具体 id 请直接读取 `agentPreset`。`list()`、`listResolved()`、`names()` 与 `has()` 都基于同一逐行快照，因此一条损坏声明不会隐藏健康的同级角色；损坏声明仍算已声明，`has()` 对其返回真，与 `resolve()` 抛出的 `ROLE_INVALID_CONFIG` 一致；`snapshot()` 同时暴露有效角色与无效行。

`resolve(name)` 返回 `ResolvedRole`，它携带已声明的值，其中 `context` 默认为 `fresh`；未声明的 `backingProvider` 也保持未声明，由消费方按 context 选择，未声明的 `model` 同样保持未声明，以继承 provider 路由。返回的 `outputSchema` 与 `tags` 是独立副本，调用方可以修改它们而不改变目录状态。未声明的名称（包括 `constructor` 等原型键）会以 `ROLE_UNKNOWN` 码抛出 `AgentRoleError`。`tryResolve(name)` 返回 `undefined` 而不是抛出，`backingProviderFor(name)` 以 `ROLE_UNKNOWN` 拒绝未知名称；即使角色是 fork，`backingProviderFor` 也只返回显式 provider 或部署兜底值，需要按 fresh/fork 选择的消费方应自行应用该策略。`defaultBackingProvider` 直接暴露部署兜底值，不解析角色，便于消费方在角色级与部署级 provider 之间实现自己的优先级；如果实时编辑使兜底值无效，它仍会抛出 `ROLE_INVALID_CONFIG`。每次成功读取都返回独立副本，因此之后的表改动绝不会改变消费方已持有的值。

`snapshot()` 是面向浏览界面的逐行读取。它从一次实时表读取返回 `{ roles, invalid }`：有效声明解析后放入 `roles`，以 `ROLE_INVALID_CONFIG` 拒绝的条目以名称、code 与消息放入 `invalid`。因此单个损坏条目不会遮住目录其余部分。加载时仍会完整校验整张表并对加载时已存在的误配置失败；加载后经实时编辑产生的损坏条目只影响自身，`list()`、`listResolved()`、`names()`、`has()` 与 `resolve()` 仍可读取健康角色，解析损坏名称则抛出该行的 `ROLE_INVALID_CONFIG`。消费方需要在损坏声明旁报告有效行时，应使用 `snapshot()`。

### 校验与失败

插件在加载时会读取并校验整张组合表，因此自包含的误配置会让插件加载失败，而不是等到第一次委派。它拒绝空角色名或空 label、含空白、反引号、引号或反斜杠的角色名（这些字符会破坏单行目录行或其代码格式）、未知的角色、model 或执行预算字段、声明 model 时的空 `model.provider` 或 `model.model`、不是正安全整数的 `maxTokens`、不是非负安全整数的 `delegationDepth`、不是正安全整数的 `wallClockMs`、空角色级或部署级 `backingProvider`、空 `agentPreset`、空 `capacityGroup`、`contextDefault: fork` 与 `agentPreset` 的组合、无效的 `tags` 列表，以及不在受支持对象根 JSON Schema 子集内的 `outputSchema`；以上每种失败都带有 `ROLE_INVALID_CONFIG` 码。

读取会再次校验实时表，因此加载后被编辑的表会在下次读取时被检查。读取按行隔离：损坏条目不会阻止健康同级角色出现在 `list()`、`listResolved()`、`names()`、`has()` 或 `resolve()` 中。解析损坏行本身会抛出该行的 `ROLE_INVALID_CONFIG`；`snapshot()` 返回有效角色与带角色范围消息的无效行。provider、model、reasoning effort、preset、backing provider 与 capacity group 标识符必须是非空单 token 字符串，且不得包含空白、反引号、引号或反斜杠，以便安全进入单行目录行与结构化结果。角色名遵循相同字符限制，并最多 256 个码点。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

可观察行为已在[使用本包](#use-this-package)中完整说明；本节解释本服务所建立的那一项分离，以及消费方如何使用一个角色。

### 设计理念

本服务是一个只读定义目录，只做一项分离：目录持有声明，其消费方持有启动。`AgentRoleRegistry` 把 `ctx.agentRoles` 注册为 Cordis 服务，持有 volatile `Config`，不执行任何东西。每次读取都会从 volatile 引用重新读取实时表并返回副本，因此插件页面的编辑会在后续读取中生效而无需重挂载，也没有消费方可以通过返回值改动该表。

加载时不要求存在消费方：部署负责组合该表，而校验会在组合表上明确失败，因为误配置在那里的判定是自包含的。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `AgentRoleRegistry`：配置 schema、角色校验、读取与独立快照 |
| [`src/types.ts`](src/types.ts) | `RoleDefinition`、`RoleModel`、`ResolvedRole`、`RoleContext` 与 `RoleSummary` |
| [`src/error.ts`](src/error.ts) | `AgentRoleError` 及其 `ROLE_INVALID_CONFIG` 与 `ROLE_UNKNOWN` 码 |
| [`locale/`](locale) | 插件页面使用的插件标题与描述 |

### 消费方如何使用一个角色

消费方解析一个名称，并把快照映射到既有 Subagent start。显式 `backingProvider` 选择 provider 参数；否则消费方按 `context` 选择 fresh 或 fork 提供方。其余字段成为 child 请求：`agentOptions` 来自声明的 `model`，`agentPreset` 来自 `agentPreset`，`maxDepth` 来自 `delegationDepth`，`executionBudget` 来自 `executionBudget`。每个存在且依赖能力的请求字段都需要所选提供方的对应能力，因此提供方无法满足的角色会让启动失败，而不是降级。

### 目录为何是实验性的

本包提供声明词汇与读取 API，而从角色到 child start 的映射由消费方确定。把整个公共约定放在实验性分组，符合[子树规则](../AGENTS.md)，并让角色字段在消费它们的组合成形期间可以变更。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从本目录所服务的 child start 逐步进入逐 child 组合与深度背后的决策。

- [Subagent 子系统](../../../docs/subsystems/subagent.zh.md)——child start 请求、其字段与 `ctx.subagents` 服务 API。
- [tool-subagent 包](../../subagent/tool-subagent/README.zh.md)——面向模型的委派工具，其配置携带相同的逐 child 字段。
- [Subagent 人设、工具可见性与深度 Agent Note](../../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.zh.md)——组合与深度为何是逐 child 控制，以及可见性为何不等于授权。
- [Agent Role 目录 Agent Note](../../../.agents/notes/implemented/feature/2026-10-14-declarative-agent-role-catalog.zh.md)——声明式目录决策、其替代方案与风险。
- [实验包参考](../AGENTS.md)——位置、公开发布与依赖隔离。

-----

<a id="model-experience"></a>
## 模型体验

### 角色绑定（间接）

#### 模型看到什么

本包本身不向模型请求贡献任何内容：它不写提示词段落、不写工具定义，也不写会话事件。只有当消费方把解析后的快照复制进 `ctx.subagents.startActivation()` 时，角色才会到达模型：`agentPreset` 作为 child 的 preset，`model` 作为 child 的 `agentOptions`；由此产生的 child 请求由消费方与提供方负责。

#### Token 影响

本包不产生 token 影响。角色引发的每个 token 都属于消费方由此创建的 child start，例如 preset 的提示词段落与工具定义。

#### KV Cache 影响

读取目录不在请求路径上，因此 `list()`、`resolve()`、`tryResolve()` 及其他读取都让已建立的请求前缀保持不变，绝不使复用失效。角色编辑只通过之后的消费方启动到达模型；从那时起，改动属于新 child 自己的前缀，而 fork child 继承父级组合，不会应用 preset。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本目录目前不能做什么、或哪些方面需要特别的运维关注。它们是当前包约束，不是任务清单。

- **消费方是可选的**——本包只声明角色，不启动任何东西。挂载 `@deepseek-ai/dsh-experimental-tool-agent-role` 会暴露 `role_agent` 工具：它解析角色并将其映射到 `ctx.subagents.startActivation()`；没有消费方时，挂载本包不改变任何工具、提示词或 child。
- **声明 preset 不等于授权**——preset 可能收窄 child 可见的工具，但目录不执行安全边界；请审查 preset 与 provider 组合本身。
- **目录不解析 preset id**——`agentPreset` 必须指向部署已注册的 preset；目录只检查 id 非空。消费方会在启动 child 前校验该引用；若没有这道预检，失败会出现在 child 设置阶段。
- **目录不解析模型路由**——角色可以指定组合并未注册的提供方或模型；目录只校验字段值。消费方会在启动 child 前校验路由；若没有这道预检，失败会出现在 child 请求该路由时。
- **依赖能力的字段在启动时失败**——声明的 model、`agentPreset`、`outputSchema` 与深度上限各自需要 backing provider 的对应能力，因此提供方无法满足其字段的角色会让启动失败，而不是降级。省略 model 永远不会要求 `agentOptions`。
- **加载后的校验发生在读取时**——加载时的检查覆盖组合表；之后的编辑会在下次读取时进入同一段代码。读取按行隔离：无效条目会成为 `snapshot()` 中的无效行，不会让健康角色从 `list()`、`listResolved()`、`names()`、`has()` 或 `resolve()` 中消失，解析该名称时才会抛出其 `ROLE_INVALID_CONFIG`。
- **实验原型，无稳定性承诺**——本包公开发布，但孵化期间约定仍可自由变更。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文，明确不具权威性。

#### Promotion

promotion 到产品角色组需要按[实验子树规则](../AGENTS.md)审查公共约定、限制、测试证据、发布载荷、运行时依赖与具名稳定 owner。

#### 未来方向

尚未决定的探索方向包括一套随附的默认角色、在加载时对照实时 LLM 注册表检查角色模型路由、超越原始 volatile 表的角色编辑，以及角色级执行限制或专用 Web 呈现；这些都没有承诺。

</details>
