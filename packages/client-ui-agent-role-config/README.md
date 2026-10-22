---
description: "Edit the Agent Roles bundle's complete named-role catalog from its Plugins page."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-client-ui-agent-role-config

English | [中文](README.zh.md)

## Summary

This package adds the configuration body to the [Agent Roles bundle](../agent-role-profile/README.md)'s page in Plugins. Users add, rename, remove, and edit the roles that `role_agent` exposes, together with the deployment fallback backing provider. All role rows save as one complete catalog replacement, so a rename cannot leave the previous key behind. The page appears only while the Host serves the `agent-roles` settings section; it has no standalone route or global role manager.

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

Install and enable [`@deepseek-ai/dsh-experimental-agent-role-profile`](../agent-role-profile/README.md). This package is a dependency of that bundle, so it needs no separate install command. In Plugins, open the Agent Roles bundle to reach the editor. The page shows the inherited roles, their context mode, and optional model, preset, subagent, budget, and output-schema fields. Provider and model are chosen from the Host model directory, and the model list follows the selected provider. Reasoning effort is chosen from the levels that exact model advertises for that route, so a level the model refuses cannot be typed in; a model that advertises none disables the picker, and switching to a model that does not offer the stored level clears it.

Each edit stays staged until Save. Save validates every row and writes the complete `roles` dictionary and any changed fallback provider in one revision-fenced settings mutation. A Host refusal keeps the staged values and shows a save failure so the user can correct them. Discard restores the accepted catalog. Reset on the default backing provider stages an unset of the user-layer override instead of writing the inherited text.

Role names become catalog keys. Each name must be unique, non-reserved, one token without whitespace, quotes, backticks, or backslashes, and at most 256 characters; labels and tags have their own limits. A fresh role may name an Agent Preset, while a fork role inherits the parent composition and cannot. A model route needs both a provider and a model or neither; blank providers inherit the deployment route, and reasoning effort or an output cap without a route is refused rather than saved where it cannot apply. An effort the advertised model does not list blocks the save; a route the directory does not describe keeps its stored effort. The output schema must parse as JSON with an object root.

The directory refreshes after adapter changes, settings commits, and connection resets. A stored provider or model that the current directory does not advertise stays selected and is labelled as unavailable, so an offline provider does not erase a saved route. A directory failure leaves role drafts intact and offers a retry.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host entry is inert. Its Loader row exists so the Client module system serves the browser half. That half registers the `agentRoles.config` dictionaries and one keyed `plugins.bundle.config` entry named `@deepseek-ai/dsh-experimental-agent-role-profile`; `ctx.configForms.whileServed(['agent-roles'])` controls whether the entry and its controller exist. The controller binds `ctx.configForms.get('agent-roles')` and caches one draft catalog per accepted settings value, giving rows stable draft ids across rendering and edits.

The settings Loader replaces the row's complete `config`, not a deep merge, so the page writes the whole role dictionary rather than a per-role patch. Validation mirrors the Host catalog rules before saving. Draft rows are keyed by a process-local id; the saved catalog is keyed by the trimmed role name. `SettingsForm` renders the staged frame, fields, save failure, read-only state, and unavailable state.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale, controller, and bundle-page registration |
| [`src/client/roles-model.ts`](src/client/roles-model.ts) | Draft conversion, validation, complete-table planning, and save state |
| [`src/client/AgentRoleConfigCard.tsx`](src/client/AgentRoleConfigCard.tsx) | Bundle page and role controls |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese page copy |
| [`src/index.ts`](src/index.ts) | Inert Host entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent Roles bundle](../agent-role-profile/README.md) — the opt-in bundle that mounts this page.
- [Agent Role catalog](../agent-role/README.md) — authoritative role fields, resolution, and validation.
- [Agent Role tool](../tool-agent-role/README.md) — the model-facing consumer of the saved catalog.
- [Settings primitives](../../client/ui-primitives/README.md) — the shared staged form and value controls.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser page edits settings and registers no model-facing input.

#### KV Cache effect

No direct effect. A saved role table changes the `role_agent` catalog text through its owning tool, whose [bundle documentation](../agent-role-profile/README.md#model-experience) records that cache effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Bundle page only** — roles are edited on the Agent Roles bundle's Plugins page, not in a standalone global role manager.
- **Whole-table save** — every save replaces the complete role dictionary; concurrent edits from another surface are resolved by the settings scope's revision fence rather than merged per role.
- **Text for presets and backing providers** — Agent Preset and backing-provider identifiers remain free text; providers and models use the Host directory.
- **Directory-dependent choices** — a provider or model the Host does not advertise remains visible when stored, but cannot be chosen anew from an empty or partial directory.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
