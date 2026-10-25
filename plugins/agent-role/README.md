---
description: "Declare named agent roles for subagent delegation — model route, agent preset, backing provider, and delegation defaults — and read them back through ctx.agentRoles."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-agent-role

English | [中文](README.zh.md)

## Summary

`dsh-experimental-agent-role` declares named agent roles in configuration and answers questions about them through `ctx.agentRoles`. One role binds an optional model route, an optional agent preset, an optional subagent backing provider, a context mode, an optional delegation-depth cap, and an optional structured-output schema. The package defines roles only: a consumer resolves one and copies its fields into a `ctx.subagents.startActivation()` request, so mounting the package alone changes no model-visible behavior. `roles` and `backingProvider` are volatile, so a user edits them on the Plugins page and later reads observe the change. The package is experimental.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package where a deployment wants the differences between delegation targets named in configuration instead of repeated for every tool instance. The catalog owns the names, the model routes, the agent presets, and the delegation defaults; it starts nothing and executes nothing.

### When to choose it

Choose it when several delegation targets differ only in model and composition, and the deployment wants those differences declared once as named roles. Mount it in a composition that already provides the Subagent service, and pair it with a consumer that resolves a role and starts the child. Choose `dsh-tool-subagent` when one tool instance with per-call arguments is enough, or when the child model is a per-Session user decision rather than deployment configuration.

### Smallest working setup

The `roles` table is empty by default. From this source checkout, install the package into the Web profile; the CLI installs it as a plain dependency because the package declares no bundle patch:

```sh
pnpm dsh plugin --profile web add ./packages/experimental/agent-role
```

Then add the declaration through the Plugins page or the profile's `cordis.patch.yml`; the smallest composition that declares a role supplies one:

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

| Field | Default | Meaning |
|---|---|---|
| `roles` | `{}` | Role name to definition table; each key is a role's immutable name |
| `backingProvider` | `spawn` | Deployment fallback returned by `backingProviderFor`; a resolved role leaves an absent provider for its consumer to choose by `context` |

The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field and its JSDoc. Declaring a role creates no tool, no agent, and no child; the resolved values reach a child only when a consumer starts one.

### The role table

A role binds the values a consumer copies into one subagent start: an optional model route (`model.provider`, `model.model`, optional `model.reasoningEffort` and `model.maxTokens`), an optional agent preset (`agentPreset`), an optional subagent provider (`backingProvider`), whether the child starts fresh or inherits the caller's completed turns (`contextDefault`), an absolute delegation-depth cap (`delegationDepth`), an optional deployment capacity group (`capacityGroup`), an optional wall-clock execution budget (`executionBudget.wallClockMs`), and an object-rooted JSON Schema for a structured final result (`outputSchema`). Optional `tags` are discovery keywords: a consumer may match them, but they do not change the child start.

`tags` is a list of at most 16 non-empty, single-token strings of at most 64 characters each, with no duplicates. Reading a role returns a detached copy; tags do not reach a child request.

The preset owns the child's persona and tool composition. Its id must name a preset registered by the deployment, and the consumer passes it as the child start's `agentPreset`. A preset requires a fresh provider: a role with `contextDefault: fork` inherits the parent composition and is rejected at load if it also declares `agentPreset`. An omitted `agentPreset` leaves composition to the subagent provider, which by default joins the parent's current composition.

An omitted `model` leaves the child's route to the provider: a local provider inherits the parent route, and an external provider keeps its own route. A declared `model` requires the provider's `agentOptions` capability. `backingProvider` is optional. When it is present, the consumer uses that provider; when it is absent, the consumer selects the deployment's fresh or fork provider from `context`. `backingProviderFor(name)` returns the explicit provider or the deployment fallback and rejects an unknown name with `ROLE_UNKNOWN`.

`delegationDepth` is an absolute cap on the child being created. The started child has depth at least `1`, so `0` prevents the role from being created at all; it does not mean "this role exists but cannot delegate further". Omit it, or use a value that admits the intended role hierarchy.

`capacityGroup` names a group the Subagent runtime must declare in its `capacityGroups` table. The runtime owns the numeric limit, and the global `maxActiveSubagents` limit still applies. An undeclared group fails the start with `UNKNOWN_CAPACITY_GROUP` before provider work; the group name is configuration for the runtime and never reaches the provider. Omit it for ungrouped admission.

`executionBudget.wallClockMs` is a positive safe integer forwarded as the child start's `executionBudget`. The subagent runtime starts the clock at admission, so provider startup and child work share the limit, and expiry disposes the activation through the normal cancellation path before reporting `stopReason: 'timeout'`. Each activation, including a cold resume, starts a fresh budget; the persisted descriptor does not carry it. Omit it for no wall-clock limit.

`outputSchema` is validated at load and on every read against the JSON Schema subset the subagent structured-output runtime accepts, and it must be object-rooted. The consumer forwards it as the child start's `outputSchema`; the subagent runtime then supplies the matching structured-output tool, validates the committed value, and reports it as the child's structured result. The backing provider must advertise the `outputSchema` capability.

### Reading roles

`list()` returns one `RoleSummary` per valid role, ordered by name: `name`, `label`, optional `description`, optional `tags`, resolved `context`, optional `agentPreset`, optional `capacityGroup`, optional `executionBudget`, `provider`, `model`, `restricted`, which is true when the role declares an `agentPreset`, and `structuredOutput`, which is true when it declares an `outputSchema`. A preset may narrow the child's tools, but `restricted` is descriptive rather than a security guarantee; read `agentPreset` for the id. `list()`, `listResolved()`, `names()`, and `has()` build on the same row-level snapshot, so one malformed declaration does not hide healthy siblings; `has()` reports a declared name even when that row is invalid, matching the `ROLE_INVALID_CONFIG` raised by `resolve()`; `snapshot()` exposes the valid roles and invalid rows together.

`resolve(name)` returns a `ResolvedRole`, which carries the declared values with `context` defaulted to `fresh`; an absent `backingProvider` also stays absent so the consumer chooses by context, and an absent `model` stays absent so the provider route is inherited. The returned `outputSchema` and `tags` are detached copies that a caller may mutate without changing catalog state. An undeclared name, including a prototype key such as `constructor`, raises `AgentRoleError` with code `ROLE_UNKNOWN`. `tryResolve(name)` returns `undefined` instead of throwing, and `backingProviderFor(name)` rejects an unknown name with `ROLE_UNKNOWN`; `backingProviderFor` returns the explicit role provider or the deployment fallback even for a fork role, so a consumer that wants fresh/fork-specific selection applies that policy itself. `defaultBackingProvider` exposes the deployment fallback without resolving a role, so a consumer can apply its own precedence between role-level and deployment-level providers; it still raises `ROLE_INVALID_CONFIG` if a live edit makes the fallback invalid. Every successful read returns a detached copy, so a later table edit never changes a value a consumer already holds.

### Validation and failure

The plugin reads and validates the whole composed table while it loads, so a self-contained misconfiguration fails plugin loading rather than the first delegation. It rejects an empty role name or label, a role name containing whitespace, backticks, quotes, or backslashes (which would break the one-line catalog row or its code formatting), an unknown role, model, or execution-budget field, an empty `model.provider` or `model.model` when a model is declared, a `maxTokens` that is not a positive safe integer, a `delegationDepth` that is not a non-negative safe integer, a `wallClockMs` that is not a positive safe integer, an empty role-level or deployment-level `backingProvider`, an empty `agentPreset`, an empty `capacityGroup`, the `contextDefault: fork` plus `agentPreset` combination, an invalid `tags` list, and an `outputSchema` outside the supported object-rooted JSON Schema subset; every such failure carries code `ROLE_INVALID_CONFIG`.

Reads validate the live table again, so a table edited after load is checked on the next read. Reads are row-scoped: a malformed entry does not block a healthy sibling from `list()`, `listResolved()`, `names()`, `has()`, or `resolve()`. Resolving the malformed row itself raises its `ROLE_INVALID_CONFIG`; `snapshot()` returns valid roles beside invalid rows with their role-scoped messages. Provider, model, reasoning-effort, preset, backing-provider, and capacity-group identifiers must be non-empty, single-token strings without whitespace, backticks, quotes, or backslashes so they remain safe in one-line catalog rows and structured results. Role names follow the same character restriction and are bounded at 256 code points.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The observable behavior is covered in [Use this package](#use-this-package); this section explains the one separation the service is built on and how a consumer spends a role.

### Design concept

The service is a read-only definition catalog with one separation: the catalog owns the declaration, and its consumer owns the start. `AgentRoleRegistry` registers `ctx.agentRoles` as a Cordis service, holds the volatile `Config`, and executes nothing. Every read re-reads the live table from the volatile references and returns copies, so a Plugins-page edit takes effect on later reads without a remount, and no consumer can mutate the table through a returned value.

No consumer is required at load: the deployment composes the table, and validation fails loud on the composed table because a misconfiguration is self-contained there.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `AgentRoleRegistry`: config schema, role validation, reads, and detached snapshots |
| [`src/types.ts`](src/types.ts) | `RoleDefinition`, `RoleModel`, `ResolvedRole`, `RoleContext`, and `RoleSummary` |
| [`src/error.ts`](src/error.ts) | `AgentRoleError` and its `ROLE_INVALID_CONFIG` and `ROLE_UNKNOWN` codes |
| [`locale/`](locale) | Plugin title and description for the Plugins page |

### How a consumer spends a role

A consumer resolves a name and maps the snapshot onto an existing Subagent start. An explicit `backingProvider` selects the provider argument; otherwise the consumer selects the fresh or fork provider matching `context`. The remaining fields become the child request: `agentOptions` from a declared `model`, `agentPreset` from `agentPreset`, `maxDepth` from `delegationDepth`, and `executionBudget` from `executionBudget`. Each present capability-dependent request field needs the chosen provider's capability, so a role the provider cannot honor fails the start instead of degrading.

### Why the catalog is experimental

The package ships the declaration vocabulary and the read API while the mapping from a role to a child start is settled by a consumer. Keeping the whole public contract in the experimental group matches the [subtree rules](../AGENTS.md) and lets the role fields change while the composition that spends them takes shape.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the child start this catalog feeds into the decisions behind per-child composition and depth.

- [Subagent subsystem](../../../docs/subsystems/subagent.md) — the child start request, its fields, and the `ctx.subagents` service API.
- [tool-subagent package](../../subagent/tool-subagent/README.md) — the model-facing delegation tool whose configuration carries the same per-child fields.
- [Subagent persona, tool visibility, and depth Agent Note](../../../.agents/notes/implemented/feature/2026-07-12-subagent-persona-tool-filter-and-depth.md) — why composition and depth are per-child controls, and why visibility is not authority.
- [Agent Role catalog Agent Note](../../../.agents/notes/implemented/feature/2026-10-14-declarative-agent-role-catalog.md) — the declarative-catalog decision, its alternatives, and its risks.
- [Experimental package reference](../AGENTS.md) — placement, publication, and dependency isolation.

-----

<a id="model-experience"></a>
## Model Experience

### Role bindings, indirectly

#### What the model sees

This package contributes nothing to a model request by itself: it writes no prompt section, no tool definition, and no Session event. A role reaches a model only when a consumer copies the resolved snapshot into `ctx.subagents.startActivation()`, with `agentPreset` as the child's preset and `model` as the child's `agentOptions`; the consumer and the provider own the resulting child request.

#### Token effect

None from this package. Every token a role causes belongs to the child start the consumer creates from it, such as the preset's prompt sections and tool definitions.

#### KV Cache effect

Reading the catalog is not on the request path, so `list()`, `resolve()`, `tryResolve()`, and the other reads leave an established request prefix unchanged and never invalidate reuse. A role edit reaches a model only through a later consumer start; from that point the change belongs to the new child's own prefix, and a fork child inherits the parent composition rather than applying a preset.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what the catalog cannot do yet or what needs special operational care. They are current package constraints, not a task backlog.

- **A consumer is optional** — this package declares roles and starts nothing. Mount `@deepseek-ai/dsh-experimental-tool-agent-role` to expose the `role_agent` tool that resolves a role and maps it onto `ctx.subagents.startActivation()`; without a consumer, mounting this package changes no tool, prompt, or child.
- **Declaring a preset is not authorizing** — a preset may narrow the child's visible tools, but the catalog does not enforce a security boundary; review the preset and the provider composition themselves.
- **Preset ids are not resolved by the catalog** — `agentPreset` must name a preset registered by the deployment; the catalog only checks that the id is non-empty. A consumer validates the reference before starting the child, and the failure without that preflight appears at child setup.
- **Model routes are not resolved by the catalog** — a role may name a provider or model the composition has not registered; the catalog only validates the field values. A consumer validates the route before starting the child, and the failure without that preflight appears when the child requests the route.
- **Capability-dependent fields fail at start** — a declared model, `agentPreset`, `outputSchema`, and the depth cap each need the backing provider's capability, so a role whose fields that provider cannot honor fails the start rather than degrading. An omitted model never requires `agentOptions`.
- **Validation after load is on-read** — the load-time check covers the composed table; a later edit reaches the same code on the next read. Reads are row-scoped: an invalid entry appears as an invalid row in `snapshot()` and does not hide healthy roles from `list()`, `listResolved()`, `names()`, `has()`, or `resolve()`, while resolving that name raises its `ROLE_INVALID_CONFIG`.
- **Experimental prototype with no stability promise** — the package is public, but its contracts can change freely while it incubates.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers and is explicitly non-authoritative.

#### Promotion

Promotion to a product-role group requires reviewing the public contract, limitations, test evidence, release payload, runtime dependents, and a named stable owner, per the [experimental subtree rules](../AGENTS.md).

#### Future directions

Undecided directions include a shipped default role set, checking a role's model route against the live LLM registry at load, role editing beyond the raw volatile table, and role-level execution limits or dedicated Web presentation; none of these are committed.

</details>
