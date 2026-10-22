# Agent Role example layer

English | [中文](README.zh.md)

Reference example for declaring named agent roles over a base-backed profile. The file is a complete patch, but its gateway routes, model ids, and API keys are placeholders; adapt it before running.

`roles.cordis.patch.yml` is a Cordis patch list, applied after `dsh-base`: it overrides the `llm-pi-ai` and `agent-default-model` rows the base declares and `insert:`s the preset registry, its two presets, the role catalog, and the delegation tool. Paste its rows into a profile's own `cordis.patch.yml`, or launch it as an overlay patch for one run. If the target profile already composes a preset registry, keep that row and point the role table at its preset ids instead of inserting a second registry.

## Credential environment variables

Two routes are declared, each resolving its key per request through the credential seam — never inlined. For this example to reach a model, export:

- `MGOOLE_API_KEY` — the orchestrator route, which also serves the main agent.
- `MGOOLE_WORKER_API_KEY` — the isolated worker route.

## What the example shows

- The main agent's endpoint, key, and model come from the `agent-default-model` row (`provider: mgoole`, `model: mgoole-orchestrator`) together with its matching `llm-pi-ai` route. That row sets what the top-level session runs on; the `roles` table below it does not affect the main agent.
- Child models come from the `roles` table. Each role binds `model.provider` and `model.model` to a declared route, so children run on the model its role names rather than inheriting the main agent's. The `worker` role points at the separate `mgoole-worker` route.
- The orchestrator and worker use `agentPreset`, so the two presets declared by this patch own their persona and tool composition. The auditor uses `contextDefault: fork`, inherits the parent's completed turns and composition, and does not declare a preset. A fork role is not automatically read-only: its authority to edit comes from the parent composition it inherits.
- `delegationDepth` is the absolute creation cap for that role's child. Each child has depth at least `1`, so `0` would prevent creation; the example gives the orchestrator and worker `2` and the auditor `1` rather than using `0` to mean "no further delegation".
- The `tool-agent-role` row mounts the model-facing tool that resolves a declared role and starts its backing subagent.

## Adapting it

Route names, model ids, and endpoints are placeholders; point them at the gateway this deployment actually serves. `backingProvider` optionally names a registered `@deepseek-ai/dsh-subagent` provider; when omitted, the consumer chooses the fresh or fork provider from `contextDefault`. A role needs the chosen provider's capabilities for the fields it sets: `agentOptions` for a declared model route, `agentPreset` for a preset, and `depthLimit` for `delegationDepth`. Omitting `model` inherits the provider route and does not require `agentOptions`.
