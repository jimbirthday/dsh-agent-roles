---
description: "在 Agent Roles 组合包的插件页中编辑完整的具名角色目录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-role-config

[English](README.md) | 中文

## 概述

本包为[Agent Roles 组合包](../agent-role-profile/README.zh.md)的插件页提供配置主体。用户可以添加、重命名、删除并编辑 `role_agent` 向模型提供的角色，以及部署回退 backing provider。所有角色行会作为一次完整目录替换保存，因此重命名不会留下旧键。页面只在 Host 提供 `agent-roles` 设置命名空间时出现；它没有独立路由或全局角色管理器。

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

安装并启用 [`@jimbirthday/dsh-agent-roles`](../agent-role-profile/README.zh.md)。本包是该组合包的依赖，无需单独安装。在插件页打开 Agent Roles 组合包即可进入编辑器。页面展示继承的角色、上下文模式，以及可选的模型、preset、子智能体、预算和输出 Schema 字段。Provider 和模型从 Host 模型目录中选择，模型列表会跟随所选 Provider。推理力度只能从该模型在该路由上提供的级别中选择，因此无法输入模型会拒绝的值；不提供任何级别的模型会禁用选择框，切换到不提供已存级别的模型会清除该级别。

每次编辑都会暂存，直到点击保存。保存会校验每一行，并在一次带 revision 约束的设置变更中写入完整 `roles` 字典以及发生变化的回退 provider。Host 拒绝时保留暂存值并显示保存失败，便于用户修正。放弃会恢复已接受的目录。对默认 backing provider 点击重置会暂存一次移除用户层覆盖的操作，而不是写入继承文本。

角色名称会成为目录键。每个名称必须唯一、未被运行时保留、为不含空白、引号、反引号或反斜杠的单个词，且不超过 256 个字符；label 与标签各有自己的限制。fresh 角色可以声明 Agent Preset，fork 角色会继承父级组合，因此不能声明。模型路由需要同时选择 provider 与模型，或者两者都留空；留空表示继承部署路由，而没有路由时的推理力度或输出上限会被拒绝，不会保存到无法生效的位置。模型未提供的推理力度会阻止保存；目录未描述的模型则保留其已存力度。输出 Schema 必须能解析为根对象为 object 的 JSON。

目录会在适配器变化、设置提交和连接重置后刷新。当前目录未提供的已保存 provider 或模型仍会保持选中并标记为不可用，因此 Provider 离线不会清除已保存路由。目录读取失败时角色草稿保持不变，并提供重试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 入口为空。它的 Loader 行存在，是为了让 Client 模块系统提供浏览器半边。该半边注册 `agentRoles.config` 字典和一个名为 `@jimbirthday/dsh-agent-roles` 的 keyed `plugins.bundle.config` 条目；`ctx.configForms.whileServed(['agent-roles'])` 控制该条目及其控制器是否存在。控制器绑定 `ctx.configForms.get('agent-roles')`，并为每个已接受设置值缓存一份草稿目录，使行在不同渲染与编辑之间保持稳定的草稿 ID。

设置 Loader 整体替换该行的 `config`，而不是深合并，因此页面写入完整角色字典，而不是逐角色 patch。保存前会按 Host 目录规则校验。草稿行以进程内 ID 为键；已保存目录以去除首尾空白后的角色名为键。`SettingsForm` 渲染暂存表单、字段、保存失败、只读和不可用状态。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | locale、控制器与组合包页面注册 |
| [`src/client/roles-model.ts`](src/client/roles-model.ts) | 草稿转换、校验、整表写入计划与保存状态 |
| [`src/client/AgentRoleConfigCard.tsx`](src/client/AgentRoleConfigCard.tsx) | 组合包页面与角色控件 |
| [`src/client/locales.ts`](src/client/locales.ts) | 英文与中文页面文案 |
| [`src/index.ts`](src/index.ts) | 空 Host 入口 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Agent Roles 组合包](../agent-role-profile/README.zh.md)——挂载本页面的可选组合包。
- [Agent Role 目录](../agent-role/README.zh.md)——权威角色字段、解析与校验。
- [Agent Role 工具](../tool-agent-role/README.zh.md)——已保存目录的模型侧消费者。
- [设置原语](../../client/ui-primitives/README.zh.md)——共享的暂存表单与值控件。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本浏览器页面编辑设置，不注册面向模型的输入。

#### KV Cache 影响

无直接影响。保存的角色表会经其所属工具改变 `role_agent` 目录文本，该缓存影响记录在[组合包文档](../agent-role-profile/README.zh.md#model-experience)中。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅限组合包页面**——角色在 Agent Roles 组合包的插件页编辑，而不是独立全局角色管理器。
- **整表保存**——每次保存都会替换完整角色字典；来自其他界面的并发编辑由设置作用域的 revision 约束识别，而不是逐角色合并。
- **Preset 与 backing provider 仍为文本**——Agent Preset 和 backing provider 标识仍需输入文本；Provider 与模型使用 Host 目录。
- **依赖模型目录**——Host 当前未提供的 Provider 或模型在已保存时仍会显示，但无法从空或部分失败的目录中重新选择。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
