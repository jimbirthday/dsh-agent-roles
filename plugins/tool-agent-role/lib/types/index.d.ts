/**
 * Model-facing delegation through the declared Agent Role catalog: the model
 * names a role, this tool resolves it with `ctx.agentRoles`, and a subagent
 * provider selected for the role's context mode starts the child.
 *
 * The catalog owns role definition (model route, Agent Preset, context mode,
 * delegation depth); this package owns the translation from a resolved role
 * into `ctx.subagents.startActivation` fields and the provider choice. A fresh
 * role starts without the parent's turns and may select an independent Agent
 * Preset; a fork role inherits the parent's turns and composition and cannot
 * select a preset. The tool returns the activation identity immediately and
 * the Subagent runtime delivers the result when the child finishes.
 *
 * @module @deepseek-ai/dsh-experimental-tool-agent-role
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "tool-agent-role";
/** Services required by the role delegation tool. */
export declare const inject: string[];
/** Tool configuration. */
export interface Config {
    /** Model-facing tool name (default `role_agent`). */
    readonly toolName?: string;
    /** Model-facing discovery tool name (default `list_agent_roles`). */
    readonly discoveryToolName?: string;
    /**
     * Optional provider override for a fresh role that declares no
     * `backingProvider`. Omitted uses the role catalog's deployment
     * `backingProvider`; a role-level `backingProvider` wins over this setting.
     */
    readonly freshProvider?: string;
    /** Provider used by a fork role that declares no `backingProvider` (default `fork`). */
    readonly forkProvider?: string;
    /**
     * Depth policy for roles that declare no `delegationDepth`: a numeric cap, or
     * `provider-managed` to leave recursion enforcement to the provider. Omit to
     * use the Host subagent setting.
     */
    readonly maxDepth?: number | 'provider-managed';
    /**
     * Maximum number of declared roles the catalog may contain. Loading fails
     * above this limit; a live edit above it keeps the previous tool definition
     * and logs the rejection. Default `64`.
     */
    readonly maxRoles?: number;
    /**
     * Maximum character count of the inline role index appended to the
     * `role_agent` description. Above this limit the description points to
     * the configured discovery tool instead of inlining the catalog; every role
     * remains callable. Default `8192`.
     */
    readonly maxCatalogChars?: number;
    /** Maximum role rows one discovery page returns (default `50`). */
    readonly discoveryPageSize?: number;
    /** Maximum concurrent startup checks in one discovery call (default `4`). */
    readonly discoveryHealthConcurrency?: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map