/**
 * Public Agent Role values: one declarative {@link RoleDefinition} per named
 * role, the resolved {@link ResolvedRole} consumers bind to a child, and the
 * request records the service accepts.
 *
 * A role binds a model route, an optional agent preset, an optional delegation
 * depth, and the subagent backend used to create the role. Consumers translate
 * a resolved role into the existing `@deepseek-ai/dsh-agent` and
 * `@deepseek-ai/dsh-subagent` request fields.
 *
 * @module @deepseek-ai/dsh-experimental-agent-role/types
 */
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import type { SubagentExecutionBudget } from '@deepseek-ai/dsh-subagent';
/** One exact model route a role binds. */
export interface RoleModel {
    /** Registered LLM provider route (for example `deepseek-official`). */
    readonly provider: string;
    /** Provider-owned model id. */
    readonly model: string;
    /** Adapter-owned reasoning effort, or the route default when absent. */
    readonly reasoningEffort?: string;
    /** Maximum output tokens per request, or the route default when absent. */
    readonly maxTokens?: number;
}
/**
 * One declared role. Every field except {@link label} is optional; omitted
 * fields leave the corresponding seam value at its default.
 */
export interface RoleDefinition {
    /** Human-facing label shown by catalogs and selectors. */
    readonly label: string;
    /** Optional one-line description of what the role is for. */
    readonly description?: string;
    /**
     * Optional discovery keywords. Discovery matches them alongside the name,
     * label, and description, and renders them on an exact-role lookup.
     */
    readonly tags?: readonly string[];
    /**
     * The model route this role uses, or undefined to inherit the provider's
     * route defaults or the parent route.
     */
    readonly model?: RoleModel;
    /**
     * Agent preset id composed into the child independently of the parent. A
     * preset owns the child's persona and tool composition; it requires a fresh
     * provider and is rejected with {@link contextDefault} `fork`.
     */
    readonly agentPreset?: string;
    /**
     * Subagent provider name used to create the role (for example `spawn`).
     * Omitted leaves the choice to the consumer, which selects a fresh or fork
     * provider from {@link contextDefault}.
     */
    readonly backingProvider?: string;
    /** Whether the role starts fresh or inherits the delegating parent's turns. */
    readonly contextDefault?: 'fresh' | 'fork';
    /**
     * Absolute delegation-depth cap for creating this role's child. The started
     * child has depth at least 1, so `0` prevents the role from being created.
     * Omitted leaves the delegation tool's own cap in force.
     */
    readonly delegationDepth?: number;
    /**
     * Deployment-declared subagent capacity group. The role names the group; the
     * Subagent runtime owns its numeric limit and rejects an undeclared name.
     * Omitted uses the runtime's global capacity only.
     */
    readonly capacityGroup?: string;
    /**
     * Runtime-enforced wall-clock budget for each activation of this role. The
     * consumer forwards it as `executionBudget`; an expired budget stops the
     * child through normal disposal and reports `stopReason: 'timeout'`. A cold
     * resume starts a new budget because the descriptor does not carry it.
     */
    readonly executionBudget?: SubagentExecutionBudget;
    /**
     * Object-rooted JSON Schema for the child's final structured result. The
     * consumer forwards it as the activation's `outputSchema`; the subagent
     * runtime supplies the matching `structured_output` tool and validates the
     * committed value. Requires a provider with the `outputSchema` capability.
     */
    readonly outputSchema?: ObjectJsonSchema;
}
/** The resolved backing mode after applying {@link RoleDefinition.contextDefault}. */
export type RoleContext = 'fresh' | 'fork';
/**
 * A detached, copy-safe role snapshot returned by reads. Optional fields are
 * resolved: `context` defaults to `fresh`, and `delegationDepth` defaults to
 * `undefined`. `backingProvider` stays undefined when the role names none, so
 * the consumer selects a provider matching `context`.
 */
export interface ResolvedRole {
    /** Immutable role name (the configured table key). */
    readonly name: string;
    /** The role's label. */
    readonly label: string;
    /** The role's description, or undefined. */
    readonly description?: string;
    /** Detached discovery keywords, or undefined when the role declares none. */
    readonly tags?: readonly string[];
    /** The bound model route, or undefined to inherit the provider route. */
    readonly model?: RoleModel;
    /** The role's agent preset id, or undefined to inherit the parent composition. */
    readonly agentPreset?: string;
    /** The explicit subagent provider, or undefined for the consumer to choose by context. */
    readonly backingProvider?: string;
    /** The resolved context mode. */
    readonly context: RoleContext;
    /** The optional delegation-depth cap. */
    readonly delegationDepth?: number;
    /** The deployment capacity group this role selects, or undefined for ungrouped admission. */
    readonly capacityGroup?: string;
    /** The role's runtime-enforced activation budget, or undefined for no limit. */
    readonly executionBudget?: SubagentExecutionBudget;
    /** The declared child structured-output schema, or undefined for free-form text. */
    readonly outputSchema?: ObjectJsonSchema;
}
/** One detached catalog row for browsing surfaces. */
export interface RoleSummary {
    /** Immutable role name. */
    readonly name: string;
    /** The role's label. */
    readonly label: string;
    /** The role's description, or undefined. */
    readonly description?: string;
    /** The role's discovery keywords, or undefined when it declares none. */
    readonly tags?: readonly string[];
    /** The role's resolved context mode. */
    readonly context: RoleContext;
    /** The role's agent preset id, or undefined. */
    readonly agentPreset?: string;
    /** The role's model provider route, or undefined when the role inherits one. */
    readonly provider?: string;
    /** The role's model id, or undefined when the role inherits one. */
    readonly model?: string;
    /** The deployment capacity group this role selects, or undefined for ungrouped admission. */
    readonly capacityGroup?: string;
    /** The role's runtime-enforced activation budget, or undefined for no limit. */
    readonly executionBudget?: SubagentExecutionBudget;
    /**
     * Whether the role declares an agent preset. A preset may narrow the child's
     * tools, but this flag does not prove a security restriction.
     * @deprecated Read {@link agentPreset} directly; this flag is retained only
     * for existing catalog consumers.
     */
    readonly restricted: boolean;
    /** Whether the role requires a structured final result. */
    readonly structuredOutput: boolean;
}
/** One role read that failed validation, retained so discovery can report it beside valid roles. */
export interface InvalidRole {
    /** The immutable role name that failed validation. */
    readonly name: string;
    /** The stable failure category. */
    readonly code: 'ROLE_INVALID_CONFIG';
    /** The role-scoped validation failure. */
    readonly message: string;
}
/**
 * One snapshot of the live role table. Valid roles are resolved; invalid roles
 * are retained separately so one malformed entry does not hide the rest of the
 * catalog from discovery.
 */
export interface RoleSnapshot {
    /** Valid resolved roles, ordered by name. */
    readonly roles: ResolvedRole[];
    /** Invalid role entries, ordered by name. */
    readonly invalid: InvalidRole[];
}
//# sourceMappingURL=types.d.ts.map