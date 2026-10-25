---
description: "单个面向模型的委派工具，解析已声明的智能体角色并启动其后端 subagent，供挂载实验性角色目录的组合使用。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-role

[English](README.md) | 中文

## 概述

本包把声明式的智能体角色目录变成面向模型的委派与发现工具。模型给出角色名；工具通过 `ctx.agentRoles` 解析它，并经由按角色上下文模式选出的 provider 启动子智能体，同时转发该角色可选的模型路由、Agent Preset、委派深度、墙钟执行预算与结构化输出 schema。配套工具会列出目录，并在不启动子智能体的情况下诊断单个角色的启动就绪状态。子智能体的 Agent Preset 拥有人设与工具组合。本包是实验性的，不提供稳定性保证。

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

当模型应按名称委派给已声明的角色时，在 `@deepseek-ai/dsh-experimental-agent-role` 之上挂载本包。目录声明角色；本包把它们暴露为委派工具与配套的发现工具。

### 何时选择

当组合已经声明了角色，且模型应按名称挑选角色、而不是每次调用都传入临时的 provider、model 与 preset 时，选择本包。`role_agent` 只暴露角色声明的内容：模型提供不超过 256 个字符的角色名、任务、不超过 256 个字符的可选标签与可选工作目录，无法覆盖角色的模型、Agent Preset 或上下文模式。`list_agent_roles` 读取同一目录，但不会启动子智能体；其 `role` 参数同样限制为 256 个字符，`query` 参数限制为 512 个字符。当没有挂载角色目录时请勿使用，因为两个工具都会通过 `ctx.agentRoles` 解析。

### 最小工作示例

这些包不在随附的 Web bundle 中。请从此源码检出将两者安装到 Web profile；目录包是本工具的 peer，而 CLI 会把普通依赖安装进来，不会添加 bundle patch：

```sh
pnpm dsh plugin --profile web add ./packages/experimental/agent-role ./packages/experimental/tool-agent-role
```

Web profile 已经提供 `standard` preset 与 `spawn`/`fork` provider。通过 Plugins 页面或 profile 的 `cordis.patch.yml` 添加以下 patch；它声明一个复用当前模型路由与 `standard` 组合的 fresh 角色，以及一个继承父级组合的 fork 角色：

```yaml
# cordis.patch.yml
- insert:
    - id: agent-roles
      name: '@deepseek-ai/dsh-experimental-agent-role'
      config:
        backingProvider: spawn
        roles:
          reviewer:
            label: Reviewer
            description: Reviews the current change.
            agentPreset: standard
          summarizer:
            label: Summarizer
            description: Summarizes the completed conversation.
            contextDefault: fork
    - id: tool-agent-role
      name: '@deepseek-ai/dsh-experimental-tool-agent-role'
      config:
        toolName: role_agent
        discoveryToolName: list_agent_roles
```

两个角色都继承模型路由，因此不需要 LLM provider 或 model id。fresh 的 `reviewer` 使用随附的 `standard` preset；fork 的 `summarizer` 加入父级组合。若部署未随附该 preset，请替换 `standard`；缺失的 preset 会让调用以角色范围的错误失败。

插件有九个可选设置：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `toolName` | `role_agent` | 面向模型的委派工具名；每个已加载实例必须使用不同的名字 |
| `discoveryToolName` | `list_agent_roles` | 面向模型的发现工具名；必须与 `toolName` 不同 |
| `freshProvider` | 角色目录的部署级 `backingProvider` | 未声明 `backingProvider` 的 fresh 角色的可选 provider 覆盖；角色级 `backingProvider` 优先。必须是最多 256 个码点的非空单行名称 |
| `forkProvider` | `fork` | 未声明 `backingProvider` 的 fork 角色所使用的 provider。必须是最多 256 个码点的非空单行名称 |
| `maxDepth` | Host subagent 设置 | 未声明 `delegationDepth` 的角色的深度策略：数值上限，或用 `provider-managed` 把执行留给外部 provider |
| `maxRoles` | `64` | 最多可声明的角色数；加载或热编辑超出时会失败或保留上一份工具定义 |
| `maxCatalogChars` | `8192` | 追加到 `role_agent` 描述中的内联角色索引最大字符数；超出时描述改为点名 `discoveryToolName`，全部角色仍可调用 |
| `discoveryPageSize` | `50` | 单页发现结果最多返回的角色行数 |
| `discoveryHealthConcurrency` | `4` | 单次发现调用并发执行的启动健康检查上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md)是每个可接受字段及其 JSDoc 的详尽来源。

试着让模型执行：“把 diff 审查委派给 reviewer 角色”。模型会以 `role: reviewer` 和任务文本调用 `role_agent`。

### 模型能做什么

`role_agent` 工具接受四个参数：

- **`role`**（必填）——已声明角色的名称。
- **`prompt`**（必填）——完整任务，且必须包含非空白文本。fresh 角色看不到本对话，因此需包含它所需的一切；fork 角色继承父级已完成的轮次。
- **`label`**——包含非空白文本且不超过 256 个字符的显示标签；默认为角色标签。
- **`cwd`**——子智能体的初始工作目录，且不得包含空字符；省略时继承调用方的目录。

工具描述会内联本部署已声明的角色，并给出每个角色的说明、结构化输出状态、preset 状态、容量组、墙钟预算与模型路由。墙钟预算行会注明超时会停止子任务，避免把它误当成仅用于统计的阈值。`list_agent_roles` 是配套的发现工具：无参数时返回紧凑名册，用 `query` 匹配名称、显示名、标签或说明，用 `role` 查看单个角色的声明事实与启动健康状态。查询结果按精确名称、名称前缀、显示名、标签、说明的顺序排序；同一档内保持名称顺序。没有匹配项时，结果会返回空页与 `availableRoles` 中的已声明角色名，并渲染重试提示：不带 query 或使用精确 role；空目录会明确说明没有声明角色，无匹配名册也会按名称包含损坏的声明。每行都用 `healthScope` 说明检查范围：列表或 query 返回 `static`，只结合调用方检查 provider 注册、上下文、provider 能力与深度，不解析 preset 或模型路由；精确的 `role` 查询返回 `full`，还会解析 Agent Preset 与模型路由，并包含角色的说明与标签。因此静态 `ok` 并不表示声明的路由可用；只要结果页包含带声明模型的静态行，就会明确指出这一点。需要确认路由可用性时请使用精确 `role` 查询。`full` 解析 preset 声明与路由，但不会 mount preset 或执行其插件，因此 mount 阶段的失败仍会在委派启动时出现。两种模式都不会启动子智能体，委派时会再次执行完整预检。单个角色配置损坏时，它会作为无效行与有效角色并列显示，而不会让整个列表失败；稳定的 `problemCode`（`ROLE_INVALID_CONFIG`）与单行、最多 2048 个码点的消息会指出待修复字段，按名称精确查询该角色也会返回同一诊断。相邻声明损坏时，委派健康角色仍可正常工作；委派到损坏名称会返回该角色自己的诊断，而不是未知名称错误。`role` 参数是长度不超过 256 个字符、并按实时目录校验的自由字符串，因此大目录不需要枚举；目录在加载时会拒绝更长的角色名。`label` 最多接受 256 个字符。`query` 最多接受 512 个字符。列表或 query 每页受 16384 个渲染字符约束，超出时只丢弃整行并给出下一页的 offset；单行本身超出预算时会按 Unicode 码点截短说明文本，不会切断代理对，角色范围失败限制为 2048 个码点，精确 `role` 详情只截短说明文本以保持在同一下限内。对 volatile 目录的运行期编辑会在下一个请求前更新稳定注册所投影的描述。`maxCatalogChars` 只约束内联索引：超出时描述会点名配置后的发现工具，所有已声明角色仍可调用。

### 成功与失败的样子

一次成功的调用会启动一个受管子智能体并返回 `{ "kind": "activation", "subagentId": "<childId>", "role": "<name>", "context": "fresh|fork", "provider": "<provider>", "model": "<provider>/<model>", "agentPreset": "<preset>" }`；只有角色声明了对应字段时才会出现 `model` 与 `agentPreset`。每个结构化字符串进入结果前都会压成单行，角色范围的失败消息同样会压成单行。结果渲染为 `started subagent <childId> (<role>, <context>, <provider>, <model>, preset <preset>)`，其中没有执行 Promise 或最终输出；subagent 运行时另行投递子智能体的结果。相同字段会作为 `roleActivation` 展示标记记录到结果元数据，因此当 `toolName` 不是 `role_agent` 时，Web 客户端仍能识别该回执。稳定失败以出错的工具结果报告，而不是崩溃：

- `Error: unknown agent role "<name>"; declared roles: <names>. Use `list_agent_roles` to inspect the role catalog`——该名称不在目录中。错误最多列出 12 个名称；有省略时会给出总数，名册更大时指向发现工具。
- `Error: agent role "<name>" delegates through subagent provider "<provider>" for context "<mode>", which is not registered`——选中的 provider 缺失。
- `Error: agent role "<name>" declares context "<mode>", but provider "<provider>" inherits the parent context (...)`——provider 与角色的上下文模式冲突。
- `Error: agent role "<name>" declares agentPreset "<preset>" with context "fork"`——fork 角色不能选择独立 preset。
- `Error: agent role "<name>" declares agentPreset "<preset>", which is not registered`——preset 注册表不包含所声明的 id；损坏的 preset 会报告其诊断。非“id 缺失”的注册表故障会保留注册表自身的消息，不会把内部故障报告成 preset 缺失。
- `Error: agent role "<name>" declares model "<provider>/<model>", which cannot be used: ...`——实时 LLM 运行时拒绝了该 provider、模型、推理强度或 token 上限。
- `Error: agent role "<name>" needs ..., but its provider "<provider>" does not support ...`——角色需要后端不具备的 provider 能力。没有 model 的角色不要求 `agentOptions`；没有 `delegationDepth` 的角色仍会使用 Host subagent 的 `maxDepth` 默认值，因此有效上限通常要求 `depthLimit`，除非该上限由 provider 管理。
- `Error: role_agent requires a calling agent (exec.agent was undefined)`——非智能体调用方尝试委派。

目录读取失败会报告自身的错误，而不是伪装成 `unknown agent role` 或“没有声明角色”，因此目录不可用时不会误导调用方去查找新的角色名。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释工具背后的设计决策，并指向实现它们的代码；可观察行为已在[使用本包](#use-this-package)中完整覆盖。

### 设计理念

工具建立在三项承诺之上：

- **目录拥有定义。** 本包不声明任何角色。它用 `ctx.agentRoles.resolve` 解析名称并读取分离的角色快照，因此运行时的目录编辑永远不会改变进行中的调用已持有的值。
- **翻译，而非重新实现。** 解析后的角色映射到既有的 `ctx.subagents.startActivation` 字段；subagent 运行时拥有子智能体创建、结果投递与清理。
- **Agent Preset 是组合来源。** 本包绝不合成人设文本或工具掩码。它把角色的 `agentPreset` 转发给 subagent 服务，由 preset 拥有子智能体的人设与工具组合。

### 源码导览

| 文件 | 作用 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置、角色解析、目录渲染、preset 与模型预检、provider 预检，以及可见目录随 volatile 表更新的稳定工具注册 |
| [`tests/tool-agent-role.spec.ts`](tests/tool-agent-role.spec.ts) | 验证 fresh 与 fork 角色解析为精确的启动字段，并覆盖未知角色、发现列表与健康状态、目录刷新、结构化输出、preset 与模型预检、加载时与 provider 后注册校验、上下文冲突与能力预检失败 |
| [`tests/agent-preset-forwarding.spec.ts`](tests/agent-preset-forwarding.spec.ts) | 验证角色 preset 到达启动请求，且不带 persona 或 tool-filter 字段 |
| [`tests/scripted-provider.ts`](tests/scripted-provider.ts) | 包内脚本化 subagent provider，记录它收到的启动请求 |

### 角色解析与 provider 预检

`resolveRole` 拒绝目录中不存在的名称，并在目录返回 `ROLE_UNKNOWN` 失败时带上已声明的角色名重新报告；显式成员检查可防止原型键被当作角色。未声明 model 的角色会在所选 provider 支持 `agentOptions` 且声明了 `agentRouteDefaults` 时使用该默认路由；否则不发送路由覆盖，由 provider 或父级决定路由。在 child 存在之前，`preflightPreset` 通过实时注册表解析已声明的 preset，并以角色范围的错误拒绝缺失、损坏或未挂载的注册表；`preflightModelRoute` 通过实时 LLM 运行时解析已声明的路由，使未注册的 provider、未列出的模型、不支持的推理强度或无效 token 上限在此失败。路由预检适用于以 `prepareContinuable` 标识的本地 provider——它使用 Host 选项构建进程内 child——以及声明了 `agentRouteDefaults` 的外部 provider；两者都由 Host LLM 运行时消费该路由。两者皆未声明的外部 provider 拥有自己的路由并自行校验。如果 Host 负责路由而 `llm` 服务未挂载，角色会直接失败，而不是未经校验就启动。两次等待之后、启动 child 之前，已取消的调用会再次被检查。

provider 选择遵循角色。角色显式 `backingProvider` 优先。否则 fresh 角色在配置了工具 `freshProvider` 时使用它，再回退到角色目录的部署级 `backingProvider`；fork 角色使用 `forkProvider`。工具要求选中 provider 的 `inheritsParentContext` 与 `context` 一致，并拒绝 fork 角色或任何继承父级上下文的 provider 上的 `agentPreset`。它检查请求所需的能力——只有声明 model 路由时才需要 `agentOptions`，角色选择 preset 时需要 `agentPreset`，声明结构化结果时需要 `outputSchema`，有效委派上限需要 `depthLimit`——并以一条命名角色、provider 与每个缺失特性的消息失败。角色级 `capacityGroup` 会在同一启动边界由 subagent 运行时按其部署表校验；未声明的组会在任何 provider 工作前失败，且绝不会进入 provider 请求。角色级 `executionBudget` 会原样转发；运行时拥有其时钟，并在释放 activation 后报告 `stopReason: 'timeout'`。工具加载时会对 provider 已注册的每个角色执行同一检查。稍后注册的 provider 会针对使用它的角色接受校验，但冲突只记录日志而不抛出：会抛出的 `provider-added` 监听器会回滚该 provider 的注册，并破坏其他消费方。角色调用会再次检查自己的 provider，因此冲突在调用时仍是清晰的角色错误。provider 仍未注册的角色可以正常加载，并在调用时失败。subagent 服务在启动时执行同样的规则；本预检以角色术语报告它们。

`role_agent` 不暴露 provider、model 或推理强度参数。因此它不读取 `tool-subagent` 的 `subagent-model-selection-policy`；该策略授权的是模型在调用中显式给出的子级路由，而角色的 `model` 属于部署配置，调用不能选择或替换它。需要限制子级路由的部署应约束角色目录或组合，而不是依赖该按 Session 生效的策略。上面的路由预检仍会用实时 LLM 运行时校验已声明的路由。

### fresh 与 fork 上下文

fresh 角色在没有父级已完成轮次的情况下启动，并可以选择独立的 Agent Preset。fork 角色以父级已完成的轮次为种子，并继承父级的组合，因此 `agentPreset` 只适用于 fresh 角色。subagent 服务还会拒绝继承父级上下文的 provider 上的 `agentPreset`；本包在启动前拒绝该组合，并点名角色与 provider。

只读行为属于 Agent Preset，而不属于本包：省略写工具的 preset 组合出子智能体的工具范围，本包绝不编辑工具列表。

### 注册与清理

`apply` 通过 `ctx.tools.register` 只注册一次委派工具，其返回的 disposer 由 `ctx.effect` 在 fiber 清理或插件替换时回退；同时注册稳定的 `list_agent_roles` 定义，每次调用读取实时目录。直接 `apply` 省略 `toolName` 时默认为 `role_agent`，`discoveryToolName` 默认为 `list_agent_roles`；空白名称、超过 256 个字符的名称、含 `[A-Za-z0-9_.-]` 之外字符的名称或两者相同都会在加载时失败。委派定义在投影模型接口时从可变槽位读取目录文本，因此 `loader/volatile-update` 监听器无需销毁并重新注册工具就能更新可见目录。监听器按行读取快照并只渲染有效角色，再校验候选并一次赋值提交；损坏的相邻声明不会进入内联描述，但仍会通过发现工具显示，`catalogStale` 会以不超过 512 个字符的单行原因点名它（或报告读取失败、候选超出 `maxRoles`）。超出 `maxCatalogChars` 的候选会有意降级为发现指针。因此连续事件不会把目录回退，刷新失败也不会移除工具。发现工具始终读取实时快照，委派解析当前角色表，因此在表或上限修复前，超出 `maxRoles` 新增的有效角色仍可调用，描述则停留在最后一个有效目录。provider 预检与启动之间隔着 preset 和路由的异步检查；启动前一刻工具会再次确认所选 provider 仍是当前注册实例，因此同名替换无法悄悄改变角色的 fresh/fork 语义。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时，阅读这些页面。它们从工具走向它所消费的目录与它启动的 subagent 接缝。

- [agent-role 包](../agent-role/README.zh.md)——本工具解析的 `ctx.agentRoles` 目录。
- [tool-subagent 包](../../subagent/tool-subagent/README.zh.md)——`ctx.subagents` 之上的同类委派工具。
- [生成的工具目录](../../../docs/tool-catalog.zh.md)——模型收到的每个工具 schema。

-----

<a id="model-experience"></a>
## 模型体验

### 角色委派工具

#### 模型看到什么

插件加载期间会显示两个工具。`role_agent` 的名字由 `toolName` 决定；其描述说明 fresh 角色在没有本对话的情况下启动并可以选择 Agent Preset，而 fork 角色继承父级已完成的轮次与组合，Agent Preset 只适用于 fresh 角色。只要索引不超过 `maxCatalogChars`，描述就内联每个已声明角色的说明、标签、结构化结果状态、preset 状态、容量组与模型路由；超出时改为点名配置后的发现工具。其 `role` 参数是长度不超过 256 个字符的自由字符串。参数为 `role` 与包含非空白文本的 `prompt`（必填），以及可选的 `label`（包含非空白文本，不超过 256 个字符）与 `cwd`。`list_agent_roles` 的名字由 `discoveryToolName` 决定，接受可选的 `role`、`query` 与 `offset`，返回紧凑名册、按相关性排序的匹配项，或单个角色的详情、标签与启动健康状态；`query` 限制为 512 个字符，当一页超过 50 行或 16384 个渲染字符时，会指出下一页的 offset。没有匹配项时会通过 `availableRoles` 报告已声明名称，而不是返回空行。模型无法覆盖角色的模型路由、Agent Preset、上下文模式、容量组或输出 schema：它们来自目录，而非调用。

#### Token 影响

只要工具可见，每个请求都会为两个简短定义支付固定 schema 开销。委派描述会随内联角色索引增长，直到达到 `maxCatalogChars`，随后降为一条发现提示。发现结果只在调用时进入上下文。模型传入的任务文本会留在父级历史中，直到压缩。

#### KV Cache 影响

只要渲染后的工具描述不变，前缀就保持稳定。会改变渲染描述的运行期目录编辑会在 `loader/volatile-update` 时更新稳定注册背后的目录槽位，因此下一次投影的请求会携带不同文本，复用从那一刻起不再匹配；渲染结果相同的编辑保持请求前缀不变。隐藏该工具的 scope 限制或重新加载注册也会使复用失效。

### 委派结果

#### 模型看到什么

成功返回 `started subagent <childId> (<role>, <context>, <provider>, <model>, preset <preset>)`，省略角色未声明的事实；目录、上下文、provider、preset、模型路由或能力失败会返回一条命名角色的错误。结果还会携带持久的 `roleActivation` 展示标记，使配置了其他 `toolName` 时仍保留角色专用 Web 卡片。子智能体的执行细节及其结构化结果通过 subagent 运行时另行到达，而不在此确认中。完成通知会在 child id 前标出角色名，使父级能识别结束的是哪个角色。

#### Token 影响

确认为单行短文本。角色的任务文本与确认会留在父级历史中直到压缩；子智能体的工作上下文留在子智能体中。

#### KV Cache 影响

仅追加；结果跟随可重用的请求前缀，不会使既有缓存条目失效。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **目录是唯一的角色来源**——没有按调用覆盖 provider、model、preset 或上下文，且 `role_agent` 不读取 `subagent-model-selection-policy`。已声明的路由属于部署权限，目录本身没有独立的路由白名单：请只把部署授权的路由写进角色表或组合。`list_agent_roles` 只读取该目录；它不声明额外角色。
- **预检只报告，不修复**——后端 provider 不具备某能力时，冲突会在该 provider 注册时记录日志，并在调用时以具名错误失败；本包无法添加能力或替换 provider。
- **preset 与路由预检依赖实时服务**——声明的 preset 需要 Agent Preset 注册表；只有当 Host 解析该路由时，才会通过 llm 服务检查声明的路由，即本地 provider，或声明了 `agentRouteDefaults` 的外部 provider。把路由委派给不带该标记的外部 provider 的组合仍需自行校验路由。
- **preset 需要 fresh provider**——fork 角色继承父级组合，不能选择独立 Agent Preset。不具备 `agentPreset` 能力的后端会拒绝声明 preset 的 fresh 角色，而不是静默忽略。
- **角色文本占用请求前缀**——在不超过 `maxCatalogChars` 时，委派描述先为每个角色保留一行丰富事实，再降级为名称与标签索引；超出该预算后只保留一条发现提示。发现结果只在模型调用该工具时占用上下文。
- **只强制执行墙钟执行预算**——`executionBudget.wallClockMs` 约束每次 activation 的经过时间，包括 provider 启动与冷恢复的新 epoch。角色的 `model.maxTokens` 仍只限制单次模型请求的输出，不限制子级的轮数、累计 token 或成本；没有按角色的轮数或成本预算。
- **容量组不会跨进程重启保留**——组上限只约束创建它的运行时内的并发 activation。后续进程中的冷恢复没有保留的组名，因此在父级以相同声明创建新子级之前，只会按全局上限准入。
- **角色失败只有单次诊断**——启动失败会报告角色与失败原因，但不会按角色重试，也不保留按角色的尝试历史。恢复的子级沿用描述符持久化的身份与组合；执行预算来自新的 activation，而不是描述符。
- **携带角色显示名的描述符只供新读取器使用**——本包在委派时传入 `displayLabel`。在此字段之前发布的 Subagent 读取器会拒绝该描述符，无法冷恢复该子级；不含该字段的记录仍可读取。
- **无稳定性承诺的实验原型**——本包已公开，但其工具名与参数在孵化期间可自由变更。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作背景——点击展开</summary>

#### 提升

提升到产品角色分组需要审查公开约定、限制、测试证据、发布载荷、运行时依赖方与具名的稳定负责人，参见[实验性子树规则](../AGENTS.md)。

#### 未来方向

未定的方向包括对允许字段子集的按调用覆盖、角色级执行限制与可观测性，以及一套随附的默认角色；这些均未承诺。

</details>
