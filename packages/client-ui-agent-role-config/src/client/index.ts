/** The Agent Roles bundle page: edit the catalog over the `agent-roles` settings namespace. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { AgentRoleConfigCard } from './AgentRoleConfigCard.tsx'
import {
  AGENT_ROLE_CONFIG_BUNDLE, AGENT_ROLES_NS, AgentRoleConfigController, type AgentRoleSettings,
} from './roles-model.ts'
import { en, zh, type AgentRoleConfigLocaleKey } from './locales.ts'

export type { AgentRoleConfigCardProps } from './AgentRoleConfigCard.tsx'
export type {
  AgentRoleConfigFace, AgentRoleConfigState, RoleContext, RoleDraft, RoleDraftState, RoleField,
  RoleValidationCode, RoleValidationField,
} from './roles-model.ts'
export type { AgentRoleConfigLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent Roles configuration page copy. */
    'agentRoles.config': AgentRoleConfigLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'agentRoles.config'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.session', 'configForms']

/**
 * Mount the Agent Roles page on its bundle while the Host serves the role catalog.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-agent-role-config: dictionaries')
  const card = new AgentRoleConfigController(ctx.configForms.get<AgentRoleSettings>(AGENT_ROLES_NS), ctx, t)
  ctx.effect(
    () => ctx.remote.$on('llm/adapters-updated', () => { card.refreshCatalog() }),
    'ui-agent-role-config: adapter invalidations',
  )
  ctx.effect(
    () => ctx.remote.$on('settings/document-updated', () => { card.refreshCatalog() }),
    'ui-agent-role-config: settings invalidations',
  )
  ctx.effect(
    () => ctx.on('connection/reset', () => { card.resetConnection() }),
    'ui-agent-role-config: connection generation',
  )
  ctx.effect(() => () => { card.dispose() }, 'ui-agent-role-config: form subscription')
  const face = card.inject()
  ctx.effect(() => ctx.configForms.whileServed([AGENT_ROLES_NS], () => ctx.slots.inject('plugins.bundle.config', () => (
    ctx.slots.register({
      name: 'plugins.bundle.config', key: AGENT_ROLE_CONFIG_BUNDLE, locale: NS, inject: () => face,
    }, AgentRoleConfigCard)
  ))), 'ui-agent-role-config: bundle page')
}
