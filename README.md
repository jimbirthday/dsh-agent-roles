# dsh-agent-roles

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）用的**具名智能体角色**插件。

它把「拆解 → 执行 → 验收」拆成三个各司其职的角色，模型通过 `role_agent` 工具按名字委派：

| 角色 | 职责 | 边界 |
| --- | --- | --- |
| **Planner** | 把复杂任务拆成原子级、可独立执行的单步指令，写明输入、动作、输出、验收标准、依赖与失败处理 | 只读分析，不执行任务、不改文件 |
| **Executor** | 严格按单步指令操作文件、运行命令、生成交付物 | 不自主规划、不改方案、不跳步 |
| **Verifier** | 按验收标准逐条核对，给可追溯证据，判定通过 / 不通过 / 无法验证 | 只读验收，不改交付物、不提改进建议 |

角色不是硬编码的：Provider、模型、reasoning effort 都在 dsh 设置页里下拉选择，配置写在 profile 的 `cordis.patch.yml` 里，可以增删改角色。

## 安装

### 前置条件

- dsh `0.2.1-rc.2` 或更新的、**含 agent-role 特性**的构建
- 注意下面的 [兼容性](#兼容性) 一节，这决定了哪些功能会失效

### 步骤

本仓库根目录就是一个自包含的 dsh bundle（三个插件随包分发，不依赖未发布的 npm 包）。在 dsh 的 Plugins 页面选择「从 Git 安装」并填入仓库地址，或在命令行执行：

```sh
dsh plugin add github:jimbirthday/dsh-agent-roles
```

> 需要装到指定 profile 时加 `--profile <name>`，例如 `dsh plugin --profile web add github:jimbirthday/dsh-agent-roles`。

### 确认装好了

```sh
dsh --dump-config | grep -A2 'id: agent-roles'
```

正常会看到三个条目（`name` 是随包分发的文件路径插件）：

```text
- id: agent-roles
  name: 'file://…/plugins/agent-role/lib/index.js'
- id: ui-agent-role-config
  name: 'file://…/plugins/client-ui-agent-role-config/lib/index.js'
- id: tool-agent-role
  name: 'file://…/plugins/tool-agent-role/lib/index.js'
```

### 卸载

```sh
dsh plugin remove @deepseek-ai/dsh-experimental-agent-role-profile
```

## 使用

### 在对话里

装好之后，模型多了两个工具：

- **`role_agent`** — 按名字委派。参数 `role`（角色名，必填）、`prompt`（完整任务，必填；子代理看不到当前对话，所以要自带上下文）、`label`（显示名）、`cwd`（工作目录）。
- **`list_agent_roles`** — 查看有哪些角色。不带参数列出全部，`query` 按名字/标签/描述搜索，`role` 查单个角色的详情和启动健康检查。

你不必手动指定角色，模型会自己判断该用哪个。想强制走某个角色，直接在话里说：

> 用 planner 拆解这个任务，再交给 executor 执行，最后让 verifier 按验收标准逐条核对并给证据。

### 在设置页改角色

**Plugins → Agent Roles** 可以编辑角色目录：标签、描述、标签词、模型路由、上下文本模式、委派深度、容量组、执行预算、结构化输出 schema。

模型路由是三个下拉框——Provider、模型、reasoning effort。推理力度只列出所选模型实际支持的级别；切换模型或 Provider 时，如果新模型不支持当前存的力度，会自动清空，避免存下一个用不了的值。

### 改配置文件

直接编辑 profile 的 `cordis.patch.yml` 也可以，适合批量改或版本管理：

```yaml
- id: agent-roles
  name: '@deepseek-ai/dsh-experimental-agent-role'
  config:
    backingProvider: spawn
    roles:
      planner:
        label: Planner
        description: 拆解任务为可执行单步
        tags: [planning, read-only]
        model:
          provider: your-provider
          model: your-model
          reasoningEffort: high
        contextDefault: fresh
```

> 在配置里直接引用角色目录插件时，`name` 仍写官方包名 `@deepseek-ai/dsh-experimental-agent-role`（本 bundle 会以文件路径形式加载它，包名不变）。

每个角色可声明的字段：`label`、`description`、`tags`、`model`、`agentPreset`、`backingProvider`、`contextDefault`、`delegationDepth`、`capacityGroup`、`executionBudget`、`outputSchema`。

`role_agent` 工具本身也有配置项：`toolName`（默认 `role_agent`）、`discoveryToolName`（默认 `list_agent_roles`）、`maxDepth`、`maxRoles`（默认 64）、`discoveryPageSize`（默认 50）等。

## 兼容性

**最重要的一条：三个 Host 包依赖 `@deepseek-ai/dsh-subagent` 里尚未发布到 npm 的成员。**

具体是这些：

- 类型 `SubagentExecutionBudget`
- `startActivation` 的 `displayLabel`
- `request.executionBudget`、`request.capacityGroup`

npm 上公开的 `@deepseek-ai/dsh-subagent@0.2.1-rc.2` 没有这些。实测结论：

| 方面 | 状态 |
| --- | --- |
| 安装、加载、界面 | ✅ 正常 |
| `role_agent` 委派 | ✅ 正常 |
| `executionBudget`（执行预算） | ⚠️ 不生效，字段被忽略 |
| `capacityGroup`（容量组） | ⚠️ 不生效，字段被忽略 |
| 子代理完成通知里的角色名 | ⚠️ 显示任务标签，不是角色名 |

也就是说：**核心用法完全可用，但执行预算和容量组这两个高级配置不起作用。** 要彻底解决，需要先把这几个字段发布到 npm 的 `dsh-subagent`，或者把插件改成不依赖它们。

## 仓库结构

```text
cordis.patch.yml                   bundle 的 patch：声明三个默认角色 + 三个插件行
lib/                               根 bundle 的运行时（空导出）
plugins/agent-role/                声明式角色目录：定义、校验、解析
plugins/tool-agent-role/           role_agent 委派工具 + list_agent_roles 发现工具
plugins/client-ui-agent-role-config/ Web 设置页的角色编辑卡片
artifacts/                         旧版四包 tarball（保留作参考）
```

## 来源与许可

代码取自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `packages/experimental/{agent-role,tool-agent-role,client-ui-agent-role-config,agent-role-profile}`，提交 `562ffcc214`。

MIT License，见 [LICENSE](LICENSE)。
