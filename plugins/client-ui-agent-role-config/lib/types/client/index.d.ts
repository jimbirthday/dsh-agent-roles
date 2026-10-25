/** The Agent Roles bundle page: edit the catalog over the `agent-roles` settings namespace. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type AgentRoleConfigLocaleKey } from './locales.ts';
export type { AgentRoleConfigCardProps } from './AgentRoleConfigCard.tsx';
export type { AgentRoleConfigFace, AgentRoleConfigState, RoleContext, RoleDraft, RoleDraftState, RoleField, RoleValidationCode, RoleValidationField, } from './roles-model.ts';
export type { AgentRoleConfigLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Agent Roles configuration page copy. */
        'agentRoles.config': AgentRoleConfigLocaleKey;
    }
}
/** Dictionary namespace owned by this plugin. */
export declare const NS = "agentRoles.config";
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/**
 * Mount the Agent Roles page on its bundle while the Host serves the role catalog.
 * @param ctx - the browser plugin context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map