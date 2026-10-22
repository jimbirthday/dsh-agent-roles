/** The browser half registers the bundle page only while its settings namespace is served. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject, NS } from '../src/client/index.ts'
import type { AgentRoleConfigFace } from '../src/client/roles-model.ts'
import { AGENT_ROLE_CONFIG_BUNDLE, AGENT_ROLES_NS, AgentRoleConfigController } from '../src/client/roles-model.ts'
import { apply as hostApply } from '../src/index.ts'

function view(ns: string, revision = 0) {
  return { ns, schema: {}, value: {}, applies: 'live', secrets: [], revision }
}

async function bench(served?: string[]) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const describeSettings = vi.fn(() => Promise.resolve(served === undefined
    ? { ok: false, error: new RemoteError('gateway/internal', 'no provider', {}) }
    : { ok: true, value: { writable: true, hasDocument: true, namespaces: served.map(ns => view(ns)) } }))
  const models = vi.fn(() => Promise.resolve({
    ok: true as const,
    value: { groups: [{ id: 'alpha', name: 'Alpha', models: [{ id: 'fast', name: 'Fast' }] }], failures: [] },
  }))
  const remote = new TestRemote(ctx, {
    settings: { describe: describeSettings },
    session: { modelCatalog: models },
  })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, describeSettings, models, remote }
}

function declareRoot(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'plugins.bundle.config': { kind: 'keyed', scope: 'root' } },
  } as never, () => null)
}

describe('ui-agent-role-config apply', () => {
  it('keeps the Host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.session', 'configForms'])
  })

  it('registers the page under the bundle name while the Host serves the role namespace', async () => {
    const { ctx, slots } = await bench([AGENT_ROLES_NS, 'shell'])
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('plugins.bundle.config')).toHaveLength(1) })
    const entry = slots.entries('plugins.bundle.config')[0]!
    expect(entry.options).toMatchObject({ key: AGENT_ROLE_CONFIG_BUNDLE })
    expect(entry.locale).toBe(NS)
    const face = (entry.inject as () => Pick<AgentRoleConfigFace, 'hooks'>)()
    expect(Object.keys(face.hooks)).toEqual(['agentRoleConfig'])
  })

  it('registers nothing until the namespace is served and removes the page when it stops', async () => {
    const { ctx, slots, describeSettings, remote } = await bench(['shell'])
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(describeSettings).toHaveBeenCalled() })
    expect(slots.entries('plugins.bundle.config')).toHaveLength(0)

    describeSettings.mockResolvedValue({
      ok: true, value: { writable: true, hasDocument: true, namespaces: [view(AGENT_ROLES_NS, 1)] },
    })
    remote.emit('settings/document-updated', [AGENT_ROLES_NS, 1])
    await vi.waitFor(() => { expect(slots.entries('plugins.bundle.config')).toHaveLength(1) })

    describeSettings.mockResolvedValue({
      ok: true, value: { writable: true, hasDocument: true, namespaces: [] },
    })
    remote.emit('settings/document-updated', [AGENT_ROLES_NS, 2])
    await vi.waitFor(() => { expect(slots.entries('plugins.bundle.config')).toHaveLength(0) })
  })

  it('withdraws the page and its subscription on fiber disposal', async () => {
    const { ctx, slots } = await bench([AGENT_ROLES_NS])
    declareRoot(slots)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(slots.entries('plugins.bundle.config')).toHaveLength(1) })
    await fiber.dispose()
    expect(slots.entries('plugins.bundle.config')).toHaveLength(0)
  })

  it('refreshes the Host model directory after model inputs change or the connection resets', async () => {
    const refresh = vi.spyOn(AgentRoleConfigController.prototype, 'refreshCatalog')
    const reset = vi.spyOn(AgentRoleConfigController.prototype, 'resetConnection')
    const { ctx, slots, remote, models } = await bench([AGENT_ROLES_NS])
    declareRoot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(models).toHaveBeenCalled() })
    refresh.mockClear()
    reset.mockClear()

    remote.emit('llm/adapters-updated', [])
    expect(refresh).toHaveBeenCalledTimes(1)
    remote.emit('settings/document-updated', ['llm-deepseek', 1])
    expect(refresh).toHaveBeenCalledTimes(2)
    ctx.emit('connection/reset')
    expect(reset).toHaveBeenCalledTimes(1)
    refresh.mockRestore()
    reset.mockRestore()
  })
})
