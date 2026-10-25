/**
 * The Agent Role catalog (`ctx.agentRoles`): one named, declarative role per
 * entry, binding a model route, an optional agent preset, a backing subagent
 * provider, and delegation defaults. Consumers resolve a role into existing
 * `@deepseek-ai/dsh-subagent` start fields, so this package never executes a
 * child itself — it is a read-only definition catalog.
 *
 * The `roles` table is a volatile Config field: a deployment base supplies the
 * shipped roles through `cordis.patch.yml`, and a user may override or extend
 * the table at runtime. Reads validate the live table and return detached
 * snapshots, so a later edit never mutates a value a consumer already holds.
 *
 * @module @deepseek-ai/dsh-experimental-agent-role
 */
import type { Volatile } from '@deepseek-ai/cordis';
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ResolvedRole, RoleDefinition, RoleSnapshot, RoleSummary } from './types.ts';
export type * from './types.ts';
export { AgentRoleError } from './error.ts';
export type { AgentRoleErrorCode } from './error.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        agentRoles: AgentRoleRegistry;
    }
}
/** Plugin config: the role table plus the deployment's default backing provider. */
export interface Config {
    /**
     * The role catalog: immutable role name → definition. Empty by default; a
     * deployment base supplies the shipped roles and a user may override them.
     */
    roles: Volatile<Record<string, RoleDefinition>>;
    /** The deployment fallback returned by `backingProviderFor` when a role names none (default `spawn`). */
    backingProvider?: Volatile<string | undefined>;
}
/**
 * Project one resolved role into the browsing summary consumers render. This
 * is the single projection for both `list()` and catalog refresh paths, so a
 * new summary field cannot reach one caller but not the other.
 * @param role - one validated role snapshot.
 * @returns the detached catalog row.
 */
export declare function summarizeRole(role: ResolvedRole): RoleSummary;
/**
 * Owns the deployment's declarative agent role catalog. Reads validate the live
 * volatile table and return detached snapshots; the service executes nothing.
 */
export declare class AgentRoleRegistry extends Service {
    static Config: z<Schemastery.ObjectS<NoInfer<{
        roles: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
            label?: string | null;
            description?: string | null;
            tags?: string[] | null | undefined;
            model?: ({
                provider?: string | null;
                model?: string | null;
                reasoningEffort?: string | null;
                maxTokens?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            agentPreset?: string | null;
            backingProvider?: string | null;
            contextDefault?: "fresh" | "fork" | null;
            delegationDepth?: number | null;
            capacityGroup?: string | null;
            executionBudget?: ({
                wallClockMs?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            outputSchema?: any;
        } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
            label: z<string, string, "defined">;
            description: z<string, string, "plain">;
            tags: z<string[] | undefined, string[] | undefined, "plain">;
            model: z<({
                provider?: string | null;
                model?: string | null;
                reasoningEffort?: string | null;
                maxTokens?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | undefined, Schemastery.ObjectT<NoInfer<{
                provider: z<string, string, "defined">;
                model: z<string, string, "defined">;
                reasoningEffort: z<string, string, "plain">;
                maxTokens: z<number, number, "plain">;
            }>> | undefined, "plain">;
            agentPreset: z<string, string, "plain">;
            backingProvider: z<string, string, "plain">;
            contextDefault: z<"fresh" | "fork", "fresh" | "fork", "plain">;
            delegationDepth: z<number, number, "plain">;
            capacityGroup: z<string, string, "plain">;
            executionBudget: z<({
                wallClockMs?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | undefined, Schemastery.ObjectT<NoInfer<{
                wallClockMs: z<number, number, "plain">;
            }>> | undefined, "plain">;
            outputSchema: z<any, any, "plain">;
        }>>, string>>, "volatile-defined">;
        backingProvider: z<string, string, "volatile">;
    }>>, Schemastery.ObjectT<NoInfer<{
        roles: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
            label?: string | null;
            description?: string | null;
            tags?: string[] | null | undefined;
            model?: ({
                provider?: string | null;
                model?: string | null;
                reasoningEffort?: string | null;
                maxTokens?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            agentPreset?: string | null;
            backingProvider?: string | null;
            contextDefault?: "fresh" | "fork" | null;
            delegationDepth?: number | null;
            capacityGroup?: string | null;
            executionBudget?: ({
                wallClockMs?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            outputSchema?: any;
        } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
            label: z<string, string, "defined">;
            description: z<string, string, "plain">;
            tags: z<string[] | undefined, string[] | undefined, "plain">;
            model: z<({
                provider?: string | null;
                model?: string | null;
                reasoningEffort?: string | null;
                maxTokens?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | undefined, Schemastery.ObjectT<NoInfer<{
                provider: z<string, string, "defined">;
                model: z<string, string, "defined">;
                reasoningEffort: z<string, string, "plain">;
                maxTokens: z<number, number, "plain">;
            }>> | undefined, "plain">;
            agentPreset: z<string, string, "plain">;
            backingProvider: z<string, string, "plain">;
            contextDefault: z<"fresh" | "fork", "fresh" | "fork", "plain">;
            delegationDepth: z<number, number, "plain">;
            capacityGroup: z<string, string, "plain">;
            executionBudget: z<({
                wallClockMs?: number | null;
            } & import("@deepseek-ai/cosmokit").Dict) | undefined, Schemastery.ObjectT<NoInfer<{
                wallClockMs: z<number, number, "plain">;
            }>> | undefined, "plain">;
            outputSchema: z<any, any, "plain">;
        }>>, string>>, "volatile-defined">;
        backingProvider: z<string, string, "volatile">;
    }>>, "plain">;
    private readonly config;
    constructor(ctx: Context, config: Config);
    /**
     * Read and validate the live role table.
     * @returns the validated table.
     */
    private readTable;
    /** The deployment fallback returned by {@link backingProviderFor}. */
    private get fallbackProvider();
    /**
     * The deployment fallback a consumer uses when a role names no backing
     * provider. Unlike {@link backingProviderFor}, this reads no role name and
     * never raises `ROLE_UNKNOWN`.
     */
    get defaultBackingProvider(): string;
    /**
     * List every declared role as a detached catalog row, ordered by name.
     * @returns one summary per role.
     */
    list(): RoleSummary[];
    /**
     * List every declared role as a detached resolved snapshot from one table
     * read, ordered by name. Consumers that need several declared fields use
     * this instead of calling `resolve()` once per row, so a concurrent volatile
     * edit cannot split one result across two catalog generations.
     * @returns one resolved role per declaration.
     */
    listResolved(): ResolvedRole[];
    /**
     * Read every role without one malformed entry hiding the others. Valid
     * entries are resolved; invalid entries carry their role-scoped failure so
     * discovery can report both.
     * @returns valid roles and invalid entries, both ordered by name.
     */
    snapshot(): RoleSnapshot;
    /**
     * List every declared role name, ordered.
     * @returns the role names.
     */
    names(): string[];
    /**
     * Whether a role name is declared.
     * @param name - the role name to test.
     * @returns whether the name is declared.
     */
    has(name: string): boolean;
    /**
     * Resolve one role into a detached snapshot. `context` defaults to `fresh`;
     * an absent `backingProvider` stays undefined so the consumer selects the
     * provider that matches `context`.
     * @param name - the role name to resolve.
     * @returns the resolved role.
     * @throws AgentRoleError `ROLE_UNKNOWN` when the name is not declared.
     */
    resolve(name: string): ResolvedRole;
    /**
     * Resolve one role, or return undefined when it is not declared.
     * @param name - the role name to resolve.
     * @returns the resolved role, or undefined.
     */
    tryResolve(name: string): ResolvedRole | undefined;
    /**
     * Resolve the subagent provider a role delegates through.
     * @param name - the role name.
     * @returns the role's backing provider, or the deployment default.
     * @throws AgentRoleError `ROLE_UNKNOWN` when the name is not declared.
     */
    backingProviderFor(name: string): string;
}
export default AgentRoleRegistry;
//# sourceMappingURL=index.d.ts.map