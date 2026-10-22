---
description: "Install named Agent Roles and the role_agent delegation tool together through the Plugins page, with a small default role catalog."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-agent-role-profile

English | [中文](README.zh.md)

## Summary

`dsh-experimental-agent-role-profile` adds named Agent Roles, the `role_agent` delegation tool, and the `list_agent_roles` discovery tool to a profile in one experimental bundle. The default catalog declares fresh `planner`, `executor`, and `verifier` roles that inherit the deployment's model route, so no Agent Preset or model route is required. The bundle is default-off; enable it from the Plugins page or install it into an initialized Web profile. The base profile still supplies the `spawn` and `fork` Subagent providers, and ordinary subagent tools remain available.

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

### Install into a profile

Install the bundle into an initialized Web profile with one command:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-role-profile
```

The profile must already contain `@deepseek-ai/dsh-base`. The bundle ships with dsh switched off; the command above adds it explicitly to an initialized profile, and the Plugins page can enable it later. Restart a running Host if the Plugins page does not show the new layer.

Remove the bundle without editing the profile manifest by name:

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-experimental-agent-role-profile
```

### What you get

The install and remove commands above are the complete installation path; the bundle declares no separate preset or provider row.

The layer inserts `agent-roles`, a catalog of fresh `planner`, `executor`, and `verifier` roles, `ui-agent-role-config`, and `tool-agent-role`, which registers the model-facing `role_agent` and `list_agent_roles` tools. The planner decomposes work into executable steps, the executor carries out specified steps, and the verifier checks a deliverable against acceptance criteria; each description states its capability boundary. All three leave the model route to the deployment default and declare no preset. Open the bundle in Plugins to add, rename, or remove roles and to edit each role's fields; saving writes the complete role table. The profile's `cordis.patch.yml` remains the source for a deployment's initial catalog. Add a model route or a registered Agent Preset per role when the deployment needs it. A preset applies only to a fresh role. Existing `subagent` and `subagent_fork` tools stay enabled because this bundle is additive.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package's runtime content is [`cordis.patch.yml`](cordis.patch.yml). Applied after `dsh-base`, the patch inserts the declarative role catalog, its bundle page, and its model-facing consumer. It disables no rows. The catalog selects `spawn` as its deployment fallback; a fork role still resolves through the tool's `fork` default, so both providers must exist in the base profile.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered additive patch over `dsh-base` |
| [`src/index.ts`](src/index.ts) | Empty module entry; the patch is the runtime content |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Experimental packages](../README.md) — incubation status and publication policy.
- [Agent Role catalog](../agent-role/README.md) — declarative role fields, resolution, and validation.
- [Agent Role tool](../tool-agent-role/README.md) — the model-facing delegation tool this bundle mounts.
- [Agent Roles configuration page](../client-ui-agent-role-config/README.md) — the bundle page that edits the catalog.
- [Base bundle](../../bundle/base/README.md) — the profile layer this patch extends.

-----

<a id="model-experience"></a>
## Model Experience

### Role delegation tool

#### What the model sees

The bundle adds two tools. `role_agent` inlines the declared roles while the index fits its budget and accepts a role name, a complete task, an optional label, and an optional working directory; the role owns the model route, context mode, and preset. `list_agent_roles` returns the compact roster, matches a query, or reports one role's declaration facts and startup health without starting a child.

#### Token effect

The bundle adds two tool schemas and, while the index fits `maxCatalogChars`, one catalog row per declared role. An oversized index degrades to a discovery pointer; discovery output enters the context only when called.

#### KV Cache effect

The added tool and catalog stay prefix-stable while the patch and live role table are unchanged. Editing a role through `loader/volatile-update` changes the catalog text projected by the stable tool registration, so reuse stops matching from that point.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Health is on demand** — `list_agent_roles` diagnoses a role's provider, preset, model route, and depth when called; the bundle keeps no persistent health cache or roster panel.
- **No standalone role manager** — roles are edited in the bundle's Plugins page; `role_agent` uses the shared receipt card rather than a dedicated role view or task board.
- **No built-in model route** — all default roles inherit the deployment route. Adding a role-specific route requires a route registered by the profile; a missing route fails the call.
- **Base profile required** — the patch depends on the `spawn` and `fork` providers and the subagent services supplied by `dsh-base`; it is not a standalone profile.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
