---
description: "One model-facing delegation tool that resolves a declared agent role and starts its backing subagent, for compositions mounting the experimental Agent Role catalog."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-tool-agent-role

English | [中文](README.zh.md)

## Summary

This package turns the declarative Agent Role catalog into model-facing delegation and discovery tools. The model names a declared role; the tool resolves it through `ctx.agentRoles` and starts a child through the provider selected for its context mode, forwarding the role's optional model route, Agent Preset, delegation depth, wall-clock execution budget, and structured-output schema. A companion tool lists the catalog and diagnoses one role's startup readiness without starting a child. The child's Agent Preset owns persona and tool composition. The package is experimental and provides no stability guarantee.

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

Add this package on top of `@deepseek-ai/dsh-experimental-agent-role` when the model should delegate to declared roles by name. The catalog declares the roles; this package exposes the delegation tool and its discovery companion.

### When to choose it

Choose it when a composition already declares roles and the model should pick one by name rather than passing an ad-hoc provider, model, and preset on every call. `role_agent` exposes only what a role declares: the model supplies a role name of at most 256 characters, a task, an optional label of at most 256 characters, and an optional working directory, and cannot override the role's model, Agent Preset, or context mode. `list_agent_roles` reads the same catalog without starting a child; its `role` argument shares the 256-character limit and its `query` argument is limited to 512 characters. Omit the package when no role catalog is mounted, because both tools resolve through `ctx.agentRoles`.

### Smallest working example

These packages are not part of the shipped Web bundle. From this source checkout, install both into the Web profile; the catalog package is this tool's peer, and the CLI installs a plain dependency without a bundle patch:

```sh
pnpm dsh plugin --profile web add ./packages/experimental/agent-role ./packages/experimental/tool-agent-role
```

The Web profile already provides the `standard` preset and the `spawn`/`fork` providers. Add this profile patch through the Plugins page or the profile's `cordis.patch.yml`; it declares one fresh role that reuses the current model route and `standard` composition, plus one fork role that inherits the parent composition:

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

Both roles inherit their model route, so no LLM provider or model id is required. The fresh `reviewer` uses the shipped `standard` preset; the fork `summarizer` joins the parent composition. Replace `standard` if the deployment does not ship that preset; a missing preset fails the call with a role-scoped error.

The plugin takes nine optional settings:

| Field | Default | Meaning |
|---|---|---|
| `toolName` | `role_agent` | Model-facing delegation tool name; each loaded instance must use a distinct name |
| `discoveryToolName` | `list_agent_roles` | Model-facing discovery tool name; must differ from `toolName` |
| `freshProvider` | Role catalog's deployment `backingProvider` | Optional provider override for a fresh role that declares no `backingProvider`; a role-level `backingProvider` wins. Must be a non-empty, single-token name of at most 256 code points |
| `forkProvider` | `fork` | Provider used by a fork role that declares no `backingProvider`. Must be a non-empty, single-token name of at most 256 code points |
| `maxDepth` | Host subagent setting | Depth policy for a role that declares no `delegationDepth`: a numeric cap, or `provider-managed` to leave enforcement to an external provider |
| `maxRoles` | `64` | Maximum number of declared roles; a load or live edit above it fails or keeps the previous tool definition |
| `maxCatalogChars` | `8192` | Maximum inline role index appended to the `role_agent` description; above it the description names `discoveryToolName` and every role stays callable |
| `discoveryPageSize` | `50` | Maximum role rows one discovery page returns |
| `discoveryHealthConcurrency` | `4` | Maximum startup health checks one discovery call runs concurrently |

The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field and its JSDoc.

Try it by asking the model: "delegate the diff review to the reviewer role". The model calls `role_agent` with `role: reviewer` and the task text.

### What the model can do

The `role_agent` tool takes four parameters:

- **`role`** (required) — the name of a declared role.
- **`prompt`** (required) — the complete task, containing non-whitespace text. A fresh role does not see this conversation, so include everything it needs; a fork role inherits the parent's completed turns.
- **`label`** — a display label containing non-whitespace text and at most 256 characters; it defaults to the role's label.
- **`cwd`** — an initial child working directory without a null character; omitted inherits the caller's directory.

The tool description inlines the roles this deployment declares, with each role's description, structured-output status, preset status, capacity group, wall-clock budget, and model route. A wall-clock row states that expiry stops the child, so the budget is not mistaken for a reporting threshold. `list_agent_roles` is the discovery companion: call it with no arguments for a compact roster, with `query` to match names, labels, tags, or descriptions, or with `role` for one role's declaration facts and startup health. Query results rank exact names first, then name prefixes, then label, tag, and description matches; ties keep name order. A query with no match returns an empty page, the declared role names in `availableRoles`, and a rendered hint to retry without a query or with an exact role; an empty catalog says so instead, and a no-match roster also includes malformed declarations by name. Every row states `healthScope`: a list or query returns `static` after checking provider registration, context, provider capabilities, and depth against the caller without resolving a preset or model route; an exact `role` lookup returns `full` after also resolving the Agent Preset and model route and includes the role's description and tags. A static `ok` therefore does not mean the declared route resolves, and a page that carries any static row with a declared model says so; pass an exact `role` when route usability matters. `full` resolves the preset declaration and route; it does not mount the preset or execute its plugins, so a mount-time failure still surfaces when delegation starts. Neither mode starts a child, and delegation repeats the full preflight. One malformed role appears as an invalid row beside the valid roles instead of failing the whole list; its stable `problemCode` (`ROLE_INVALID_CONFIG`) and message identify the field to fix, and an exact lookup of that name returns the same diagnostic. Delegating to a healthy role still works while a sibling declaration is malformed; delegating to the malformed name returns that role's own diagnostic rather than an unknown-name error. The `role` parameter is a free string of at most 256 characters checked against the live catalog, so a large roster needs no enum; the catalog rejects a longer declared name at load. `label` accepts at most 256 characters. `query` accepts at most 512 characters. A list or query page is bounded by 16384 rendered characters by dropping whole rows and reporting the next offset; one row that alone exceeds the budget is shortened at its description without splitting a Unicode code point, role-scoped failures are bounded to 2048 code points, and an exact `role` detail shortens only its description to stay within the same budget. A runtime edit to the volatile catalog updates the description projected by the stable registration before the next request. `maxCatalogChars` bounds only the inline index: above it the description names the configured discovery tool, and every declared role stays callable.

### What success and failure look like

A successful call starts a managed child and returns `{ "kind": "activation", "subagentId": "<childId>", "role": "<name>", "context": "fresh|fork", "provider": "<provider>", "model": "<provider>/<model>", "agentPreset": "<preset>" }`; `model` and `agentPreset` are present only when the role declares them. Each structured string is reduced to one line before it enters this result, and role-scoped failure messages are collapsed to one line and bounded to 2048 code points, including preset-resolution and model-route failures that originate upstream. The result renders as `started subagent <childId> (<role>, <context>, <provider>, <model>, preset <preset>)` and contains no execution promise or final output; the subagent runtime delivers the child's result separately. The same fields are recorded as a `roleActivation` presentation marker, so the Web client recognizes the receipt when `toolName` is not `role_agent`. Stable failures are reported as errored tool results rather than crashes:

- `Error: unknown agent role "<name>"; declared roles: <names>. Use `list_agent_roles` to inspect the role catalog` — the name is not in the catalog. The error lists at most 12 names, states the total when it omits any, and points to discovery when the roster is larger.
- `Error: agent role "<name>" delegates through subagent provider "<provider>" for context "<mode>", which is not registered` — the selected provider is absent.
- `Error: agent role "<name>" declares context "<mode>", but provider "<provider>" inherits the parent context (...)` — the provider contradicts the role's context mode.
- `Error: agent role "<name>" declares agentPreset "<preset>" with context "fork"` — a fork role cannot select an independent preset.
- `Error: agent role "<name>" declares agentPreset "<preset>", which is not registered` — the preset registry does not contain the declared id; a broken preset reports its diagnostic instead. A registry failure that is not a missing id keeps the registry's own message, so an internal fault is not reported as a missing preset.
- `Error: agent role "<name>" declares model "<provider>/<model>", which cannot be used: ...` — the live LLM runtime rejects the provider, model, reasoning effort, or token limit.
- `Error: agent role "<name>" needs ..., but its provider "<provider>" does not support ...` — the role requires a provider capability the backend lacks. A role with no model does not require `agentOptions`; a role with no `delegationDepth` still uses the Host subagent `maxDepth` default, so the effective cap usually requires `depthLimit` unless the catalog or provider is managed by the provider.
- `Error: role_agent requires a calling agent (exec.agent was undefined)` — a non-agent caller tried to delegate.

A failed catalog read is reported with its own error rather than as `unknown agent role` or a deployment with no roles, so an unavailable catalog does not send the caller looking for a new role name.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the tool and points at the code that realizes them; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The tool is built on three commitments:

- **The catalog owns definition.** This package declares no roles. It resolves a name with `ctx.agentRoles.resolve` and reads a detached role snapshot, so a runtime catalog edit never mutates a value an in-flight call already holds.
- **Translation, not reimplementation.** A resolved role maps onto existing `ctx.subagents.startActivation` fields; the subagent runtime owns child creation, result delivery, and teardown.
- **Agent Preset is the composition source.** This package never synthesizes persona prose or a tool mask. It forwards the role's `agentPreset` to the subagent service, and the preset owns persona and tool composition for the child.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config, role resolution, catalog rendering, preset and model preflight, provider preflight, and the stable tool registrations whose visible catalog tracks the volatile table |
| [`tests/tool-agent-role.spec.ts`](tests/tool-agent-role.spec.ts) | Resolves fresh and fork roles into exact start fields and covers unknown-role, discovery listing and health, catalog refresh, structured output, preset and model preflight, load-time and late-provider validation, context-conflict, and capability failures |
| [`tests/agent-preset-forwarding.spec.ts`](tests/agent-preset-forwarding.spec.ts) | Proves a role preset reaches the start request without persona or tool-filter fields |
| [`tests/scripted-provider.ts`](tests/scripted-provider.ts) | Package-local scripted subagent provider that records the start request it receives |

### Role resolution and provider preflight

`resolveRole` rejects names absent from the catalog and re-reports the catalog's `ROLE_UNKNOWN` failure with the declared role names; an explicit membership check keeps prototype keys from being treated as roles. A role with no declared model uses the selected provider's `agentRouteDefaults` when that provider supports `agentOptions`; otherwise it sends no route override and leaves routing to the provider or parent. Before the child exists, `preflightPreset` resolves a declared preset through the live registry and rejects a missing, broken, or unmounted registry with a role-scoped error, and `preflightModelRoute` resolves a declared route through the live LLM runtime so an unregistered provider, unlisted model, unsupported reasoning effort, or invalid token limit fails there. The route preflight applies to a local provider, identified by `prepareContinuable`, because it builds an in-process child from the Host options, and to an external provider that declares `agentRouteDefaults`; either way the Host LLM runtime consumes the route. An external provider with neither marker owns its own routing and validates its route. A host-routed role fails when the `llm` service is absent rather than starting without validation. An aborted call is rechecked after both waits and before starting the child.

Provider selection follows the role. An explicit role `backingProvider` wins. Otherwise a fresh role uses the tool's `freshProvider` when configured, then the role catalog's deployment `backingProvider`; a fork role uses `forkProvider`. The tool requires the selected provider's `inheritsParentContext` to match `context`, and it rejects an `agentPreset` on a fork role or on any provider that inherits the parent context. It checks the capabilities the request needs — `agentOptions` only for a declared model route, `agentPreset` when the role selects one, `outputSchema` when it declares a structured result, and `depthLimit` for an effective delegation cap — and fails with a message naming the role, the provider, and every missing feature. A role-level `capacityGroup` is validated by the subagent runtime against its deployment table at the same start boundary; an undeclared group fails before provider work and never reaches the provider request. A role-level `executionBudget` is forwarded unchanged; the runtime owns its clock and reports `stopReason: 'timeout'` after disposing the activation. The same check runs when the tool loads for every role whose provider is already registered. A provider that registers later is validated for the roles that use it, but a conflict is logged instead of thrown: a throwing `provider-added` listener would roll back that provider's registration and break other consumers. The role call rechecks its own provider, so the conflict remains a clear role error at call time. A role whose provider is absent remains loadable and fails at call time. The subagent service enforces the same rules at start; this preflight reports them in role terms.

`role_agent` exposes no provider, model, or reasoning-effort parameter. It therefore does not consult the `tool-subagent` `subagent-model-selection-policy`, which authorizes model-supplied explicit child routes: a role's `model` is deployment configuration, and the call cannot select or replace it. A deployment that must restrict child routes constrains the role catalog or composition rather than relying on that per-Session policy. The route preflight above still validates a declared route against the live LLM runtime.

### Fresh and fork context

A fresh role starts without the parent's completed turns and may select an independent Agent Preset. A fork role is seeded with the parent's completed turns and inherits the parent's composition, so `agentPreset` is available only to fresh roles. The subagent service additionally rejects `agentPreset` on providers that inherit the parent context; this package rejects the combination before starting and names the role and provider.

Read-only behavior belongs to the Agent Preset, not to this package: a preset that omits write tools composes the child's tool scope, and this package never edits tool lists.

### Registration and teardown

`apply` registers the delegation tool once through `ctx.tools.register`, whose returned disposer `ctx.effect` unwinds on fiber disposal or plugin replacement, plus a stable `list_agent_roles` definition that reads the live catalog on each call. A direct-apply omission of `toolName` defaults to `role_agent`; `discoveryToolName` defaults to `list_agent_roles`; a blank name, a name above 256 characters, a name outside `[A-Za-z0-9_.-]`, or equal names fail at load. The delegation definition reads its catalog text from a mutable slot when the model surface is projected, so a `loader/volatile-update` listener changes the visible catalog without disposing and re-registering the tool. The listener reads the row-split snapshot and renders only valid roles, then validates the candidate and commits it in one assignment; a malformed sibling is excluded from the inline description but remains visible through discovery, while `catalogStale` names it (or reports a failed read or candidate above `maxRoles`) in a single line of at most 512 characters. A candidate above `maxCatalogChars` intentionally degrades to a discovery pointer. Consecutive events therefore cannot roll the catalog back, and a failed refresh cannot remove the tool. Discovery always reads the live snapshot and delegation resolves the current role table, so a valid role added above `maxRoles` remains callable while the description stays at the last valid catalog until the limit or table is fixed. The provider preflight and the start are separated by awaited preset and route checks; immediately before starting, the tool rechecks that the selected provider is still the registered instance, so a same-name replacement cannot silently change the role's fresh/fork semantics.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the tool to the catalog it consumes and the subagent seam it starts.

- [agent-role package](../agent-role/README.md) — the `ctx.agentRoles` catalog this tool resolves.
- [tool-subagent package](../../subagent/tool-subagent/README.md) — the sibling delegation tool over `ctx.subagents`.
- [Generated tool catalog](../../../docs/tool-catalog.md) — every tool schema the model receives.

-----

<a id="model-experience"></a>
## Model Experience

### Role delegation tool

#### What the model sees

Two tools are visible while the plugin is loaded. `role_agent`, named by `toolName`, states that a fresh role starts without this conversation and may select an Agent Preset, while a fork role inherits the parent's completed turns and composition; Agent Presets are available only to fresh roles. It inlines each declared role's description, label, structured-result status, preset status, capacity group, and model route while that index fits `maxCatalogChars`; above the limit it names the configured discovery tool. Its `role` parameter is a free string of at most 256 characters. The parameters are `role` and a non-blank `prompt` (required), plus optional `label` (non-blank, at most 256 characters) and `cwd`. `list_agent_roles`, named by `discoveryToolName`, takes optional `role`, `query`, and `offset` and returns a compact roster, relevance-ordered matching entries, or one role's detail with startup health and tags; `query` is limited to 512 characters, and a page over 50 rows or 16384 rendered characters names the offset for the next page. A query with no match reports the declared names in `availableRoles` instead of an empty row. The model cannot override the role's model route, Agent Preset, context mode, capacity group, or output schema: those come from the catalog, not the call.

#### Token effect

Fixed schema cost for two short definitions on every request where the tools are visible. The delegation description grows with the inline role index until `maxCatalogChars`, then drops to one discovery pointer. Discovery results enter context only when called. The task text the model passes stays in parent history until compaction.

#### KV Cache effect

Prefix-stable while the rendered tool description is unchanged. A runtime catalog edit that changes the rendered description or names updates the catalog slot behind the stable registration on `loader/volatile-update`, so the next projected request carries different text and reuse stops matching from that point; an edit that renders identically keeps the request prefix. A scoped restriction that hides the tool or a reload that replaces the registration also invalidates reuse.

### Delegation result

#### What the model sees

Success returns `started subagent <childId> (<role>, <context>, <provider>, <model>, preset <preset>)`, omitting facts the role does not declare; a catalog, context, provider, preset, model-route, or capability failure returns an error naming the role. The result also carries a durable `roleActivation` presentation marker, which keeps the role-specific Web card under a configured `toolName`. Child execution and its structured result arrive separately through the subagent runtime, not in this acknowledgement. The completion notice names the role before the child id, so a parent can identify which role settled.

#### Token effect

The acknowledgement is a single short line. The role's task text and the acknowledgement remain in parent history until compaction; the child's working context stays in the child.

#### KV Cache effect

Append-only; the result follows the reusable request prefix and does not invalidate existing cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The catalog is the only role source** — there is no per-call provider, model, preset, or context override, and `role_agent` does not consult `subagent-model-selection-policy`. Declared routes are deployment authority, and the catalog has no separate route allowlist: restrict a role's `model` to routes the deployment authorizes in its role table or composition. `list_agent_roles` reads that catalog; it declares no additional roles.
- **Preflight reports, it does not repair** — a role whose capabilities its backing provider lacks logs a conflict when that provider registers and fails at call time with a named error; this package cannot add capabilities or substitute a provider.
- **Preset and route preflight depend on live services** — a declared preset requires the Agent Preset registry, and a declared route is checked through the llm service only when the Host resolves that route: a local provider, or an external provider that declares `agentRouteDefaults`. A composition that delegates routing to an external provider without that marker keeps responsibility for validating the route.
- **Presets require fresh providers** — a fork role inherits the parent's composition and cannot select an independent Agent Preset. A backend without `agentPreset` support rejects a fresh role that declares one rather than silently ignoring it.
- **Role text consumes the request prefix** — the delegation description carries a fact-rich row per role, then a compact name-and-label index, while it fits `maxCatalogChars`. Above that budget it carries one discovery pointer. Discovery results consume context only when the model calls the tool.
- **Only a wall-clock execution budget is enforced** — `executionBudget.wallClockMs` bounds each activation's elapsed time, including provider startup and a cold resume's new epoch. A role's `model.maxTokens` still caps one model request's output, not the child's turns, cumulative tokens, or cost; there is no per-role turn or cost budget.
- **Capacity groups do not survive a process restart** — a group limit bounds concurrent activations in the runtime that created them. A cold resume in a later process has no retained group name, so it is admitted under the global limit until the parent starts a new child with the same declaration.
- **Role failures are single-attempt diagnostics** — a failed start reports the role and the failure, but neither retries the role nor preserves a per-role attempt history. A resumed child keeps the descriptor's persisted identity and composition; its execution budget comes from the new activation, not the descriptor.
- **A descriptor carrying the role display name is new-reader-only** — this package passes `displayLabel` on delegation. A Subagent reader from before that field rejects the descriptor and cannot cold-resume the child; records without the field remain readable.
- **Experimental prototype with no stability promise** — the package is public, but its tool name and parameters can change freely while it incubates.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

#### Promotion

Promotion to a product-role group requires reviewing the public contract, limitations, test evidence, release payload, runtime dependents, and a named stable owner, per the [experimental subtree rules](../AGENTS.md).

#### Future directions

Undecided directions include per-call overrides for a permitted subset of fields, role-level execution limits and observability, and a shipped default role set; none of these are committed.

</details>
