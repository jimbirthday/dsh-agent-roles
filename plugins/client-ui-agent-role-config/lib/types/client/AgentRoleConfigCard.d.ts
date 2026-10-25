/** The Agent Roles bundle page: the complete role catalog over the `agent-roles` settings section. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AgentRoleConfigFace } from './roles-model.ts';
/** Props the renderer binds for the bundle's page. */
export type AgentRoleConfigCardProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'agentRoles.config'> & InjectFace<AgentRoleConfigFace>;
/**
 * Render the bundle's summary, or its staged role editor.
 * @param props - requested view, locale copy, the role snapshot, and its actions.
 * @returns the one-liner, or the editable catalog.
 */
export declare function AgentRoleConfigCard(props: AgentRoleConfigCardProps): string | import("react").JSX.Element;
//# sourceMappingURL=AgentRoleConfigCard.d.ts.map