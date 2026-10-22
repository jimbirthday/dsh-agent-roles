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

四个包**没有发布到 npm**，用本仓库 `artifacts/` 里的 tarball 安装。先把仓库 clone 下来：

```sh
git clone https://github.com/jimbirthday/dsh-agent-roles.git
cd dsh-agent-roles
shasum -a 256 -c artifacts/SHA256SUMS      # 核对四个 tarball
```

然后在 dsh profile 里加 overrides，让 pnpm 知道去哪找那三个内部依赖：

```yaml
# ~/.dsh/profiles/web/pnpm-workspace.yaml
overrides:
  '@deepseek-ai/dsh-experimental-agent-role': file:/绝对路径/dsh-agent-roles/artifacts/deepseek-ai-dsh-experimental-agent-role-0.2.1-rc.2.tgz
  '@deepseek-ai/dsh-experimental-tool-agent-role': file:/绝对路径/dsh-agent-roles/artifacts/deepseek-ai-dsh-experimental-tool-agent-role-0.2.1-rc.2.tgz
  '@deepseek-ai/dsh-experimental-client-ui-agent-role-config': file:/绝对路径/dsh-agent-roles/artifacts/deepseek-ai-dsh-experimental-client-ui-agent-role-config-0.2.1-rc.2.tgz
```

再安装 bundle 本身：

```sh
dsh plugin --profile web add /绝对路径/dsh-agent-roles/artifacts/deepseek-ai-dsh-experimental-agent-role-profile-0.2.1-rc.2.tgz
```

> 路径必须是绝对路径，`~` 不会被展开。漏掉 overrides 那一步会报 `is not in the npm registry`，因为三个内部包不在 npm 上。

### 确认装好了

```sh
dsh --profile web --dump-config | grep -A2 'id: agent-roles'
```

正常会看到三个条目：

```text
- id: agent-roles
  name: '@deepseek-ai/dsh-experimental-agent-role'
- id: ui-agent-role-config
  name: '@deepseek-ai/dsh-experimental-client-ui-agent-role-config'
- id: tool-agent-role
  name: '@deepseek-ai/dsh-experimental-tool-agent-role'
```

### 卸载

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-role-profile
```

装之前记得把加过的 overrides 也删掉。

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

每个角色可声明的字段：`label`、`description`、`tags`、`model`、`agentPreset`、`backingProvider`、`contextDefault`、`delegationDepth`、`capacityGroup`、`executionBudget`、`outputSchema`。

`role_agent` 工具本身也有配置项：`toolName`（默认 `role_agent`）、`discoveryToolName`（默认 `list_agent_roles`）、`maxDepth`、`maxRoles`（默认 64）、`discoveryPageSize`（默认 50）等。

## 兼容性

**最重要的一条：本仓库的三个 Host 包依赖 `@deepseek-ai/dsh-subagent` 里尚未发布到 npm 的成员。**

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
| `pnpm run build`（三个 Host 包） | ❌ 报三个类型错误 |
| `pnpm run build:client`（客户端） | ✅ 0 错误 |

也就是说：**核心用法完全可用，但执行预算和容量组这两个高级配置不起作用。** 要彻底解决，需要先把这几个字段发布到 npm 的 `dsh-subagent`，或者把插件改成不依赖它们。

## 从源码构建

```sh
pnpm install
pnpm run build          # 三个 Host 包（见上方兼容性限制）
pnpm run build:client   # 客户端 bundle，干净通过
pnpm run pack:plugins   # 输出 tarball 到 dist/
```

要完整构建 Host 包，需要工作区里能解析到含上述成员的 `dsh-subagent`（即 deepseek-harness 源码仓库里对应的提交）。

## 仓库结构

```text
packages/
  agent-role/                     声明式角色目录：定义、校验、解析
  tool-agent-role/                role_agent 委派工具 + list_agent_roles 发现工具
  client-ui-agent-role-config/    Web 设置页的角色编辑卡片
  agent-role-profile/             上面三个的 bundle 组合层，声明三个默认角色
artifacts/                        预构建 tarball + SHA256SUMS
```

## 来源与许可

代码取自 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `packages/experimental/{agent-role,tool-agent-role,client-ui-agent-role-config,agent-role-profile}`，提交 `562ffcc214`。

MIT License，见 [LICENSE](LICENSE)。
