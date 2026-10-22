---
description: "通过插件页一次安装具名 Agent 角色与 role_agent 委派工具，并附带一个小型默认角色目录。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-role-profile

[English](README.md) | 中文

## 概述

`dsh-experimental-agent-role-profile` 通过一个实验性组合包为 profile 添加具名 Agent 角色、`role_agent` 委派工具和 `list_agent_roles` 发现工具。默认目录声明 fresh 的 `planner`、`executor` 与 `verifier`，三者都继承部署的模型路由，因此不需要 Agent Preset 或模型路由。本组合包默认关闭；可在插件页启用，或安装到已初始化的 Web profile。base profile 仍提供 `spawn` 与 `fork` Subagent provider，普通 subagent 工具保持可用。

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

### 安装到 profile

使用一条命令把组合包安装到已初始化的 Web profile：

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-role-profile
```

profile 必须已经包含 `@deepseek-ai/dsh-base`。本组合包随 dsh 安装提供但默认关闭；上面的命令会把它显式加入已初始化的 profile，之后也可在插件页启停。如果运行中的 Host 未显示新层，请重启。

无需按名称修改 profile 清单即可移除组合包：

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-role-profile
```

### 获得的功能

上面的安装和移除命令就是完整的安装路径；本组合包不声明独立的 preset 或 provider 行。

本层插入 `agent-roles` 目录，包含 fresh 的 `planner`、`executor` 与 `verifier`，并插入 `ui-agent-role-config` 与 `tool-agent-role`，后者注册面向模型的 `role_agent` 与 `list_agent_roles` 工具。planner 把任务拆解为可执行步骤，executor 按指定步骤执行，verifier 按验收标准核验交付物；每个角色的描述都写明能力边界。三者都把模型路由留给部署默认值，且都不声明 preset。在插件页打开本组合包即可添加、重命名或删除角色并编辑各字段；保存会写入完整角色表。profile 的 `cordis.patch.yml` 仍是部署初始目录的来源。部署需要时可为角色添加模型路由或已注册的 Agent Preset。preset 仅适用于 fresh 角色。本组合包是增量层，现有 `subagent` 与 `subagent_fork` 工具保持启用。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包的运行时内容是 [`cordis.patch.yml`](cordis.patch.yml)。在 `dsh-base` 之后应用时，patch 插入声明式角色目录、其组合包页面及模型消费者，不禁用任何行。目录选择 `spawn` 作为部署回退；fork 角色仍通过工具的 `fork` 默认值解析，因此 base profile 中两个 provider 都必须存在。

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 叠加在 `dsh-base` 之上的增量有序 patch |
| [`src/index.ts`](src/index.ts) | 空模块入口；patch 是运行时内容 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [实验性包](../README.zh.md)——孵化状态与发布规则。
- [Agent Role 目录](../agent-role/README.zh.md)——声明式角色字段、解析与校验。
- [Agent Role 工具](../tool-agent-role/README.zh.md)——本组合包挂载的模型委派工具。
- [Agent Roles 配置页](../client-ui-agent-role-config/README.zh.md)——编辑角色目录的组合包页面。
- [Base bundle](../../bundle/base/README.zh.md)——本 patch 扩展的 profile 层。

-----

<a id="model-experience"></a>
## 模型体验

### 角色委派工具

#### 模型会看到什么

本组合包添加两个工具。只要角色索引在预算内，`role_agent` 就内联已声明的角色，并接收角色名、完整任务、可选 label 与可选工作目录；模型路由、上下文模式与 preset 由角色持有。`list_agent_roles` 返回紧凑名册、匹配查询，或报告单个角色的声明事实与启动健康状态，且不会启动 child。

#### Token 影响

本组合包添加两个工具 schema；只要索引不超过 `maxCatalogChars`，还会添加每个已声明角色的一行目录。索引超限时会降级为一条发现提示；发现输出只在调用时进入上下文。

#### KV Cache 影响

只要 patch 与实时角色表不变，新增工具与目录就保持前缀稳定。通过 `loader/volatile-update` 编辑角色会改变稳定工具注册所投影的目录文本，因此从该点起前缀不再匹配。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **健康状态按需查询**——`list_agent_roles` 在被调用时诊断角色的 provider、preset、模型路由与深度；组合包不保留持久健康缓存或 roster 面板。
- **没有独立角色管理器**——角色在本组合包的插件页编辑；`role_agent` 使用共享收据卡片，而不是独立角色视图或任务看板。
- **没有内置模型路由**——全部默认角色都继承部署路由。添加角色专用路由需要 profile 注册该路由；路由缺失会使调用失败。
- **需要 base profile**——本 patch 依赖 `dsh-base` 提供的 `spawn` 与 `fork` provider 及 subagent 服务；它不是独立 profile。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
