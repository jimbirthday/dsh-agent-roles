/** The role catalog edits whole-table state and saves complete replacements. */

import { describe, expect, it, vi } from 'vitest'
import type { ModelProviderGroup, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import {
  AGENT_ROLES_NS, AgentRoleConfigController, type AgentRoleSettings,
} from '../src/client/roles-model.ts'
import { en } from '../src/client/locales.ts'

const t = (key: keyof typeof en) => en[key]

const groups: ModelProviderGroup[] = [
  {
    id: 'alpha',
    name: 'Alpha API',
    models: [
      { id: 'fast', name: 'Fast' },
      {
        id: 'deep',
        name: 'Deep',
        reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' },
      },
    ],
  },
  { id: 'beta', name: 'Beta API', models: [{ id: 'wide', name: 'Wide' }] },
]

function ctxWith(models = vi.fn(() => Promise.resolve({
  ok: true as const,
  value: { groups, failures: [] },
}))) {
  return { ctx: { remote: { session: { modelCatalog: models } } } as never, models }
}

function acceptWrites(host: StubConfigForm<AgentRoleSettings>): void {
  const section = (): AgentRoleSettings => ({ ...host.scope.getSnapshot().value as AgentRoleSettings })
  const layer = (): Record<string, unknown> => ({ ...host.scope.getSnapshot().user as object })
  host.mutate.mockImplementation((ops: readonly SettingsPathOpView[]) => {
    const value = section()
    const user = layer()
    for (const op of ops) {
      const field = op.path[0] as keyof AgentRoleSettings
      if (op.op === 'set') {
        value[field] = op.value as never
        user[field] = op.value
      } else {
        Reflect.deleteProperty(user, field)
        value[field] = (host.scope.getSnapshot().base as AgentRoleSettings | undefined)?.[field] as never
      }
    }
    host.publish({ value, user })
    return Promise.resolve(true)
  })
}

function bench(settings: AgentRoleSettings = {
  backingProvider: 'spawn',
  roles: {
    planner: { label: 'Planner', description: 'Plans work.', contextDefault: 'fresh' },
  },
}) {
  const host = stubConfigForm<AgentRoleSettings>()
  acceptWrites(host)
  host.publish({
    status: 'ready',
    writable: true,
    value: settings,
    base: { backingProvider: 'spawn', roles: {} },
    user: { backingProvider: 'spawn' },
    revision: 7,
  })
  const catalog = ctxWith()
  const controller = new AgentRoleConfigController(host.scope, catalog.ctx, t)
  return { host, controller, face: controller.inject(), ...catalog }
}

describe('AgentRoleConfigController', () => {
  it('reads the accepted catalog and notes its namespace', () => {
    const { face, models } = bench()
    const state = face.hooks.agentRoleConfig.getSnapshot()
    expect(AGENT_ROLES_NS).toBe('agent-roles')
    expect(state.catalogStatus).toBe('loading')
    expect(state.roles).toMatchObject([{ name: 'planner', label: 'Planner', context: 'fresh' }])
    expect(state.defaultBacking).toBe('spawn')
    expect(state.defaultBackingOverridden).toBe(true)
    expect(models).toHaveBeenCalledOnce()
  })

  it('loads the Host model directory and exposes it to the page', async () => {
    const { face } = bench()
    await vi.waitFor(() => {
      expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({
        catalogStatus: 'ready', catalogGroups: groups, catalogPartial: false, catalogError: null,
      })
    })
  })

  it('selects a provider and clears a model that provider does not advertise', async () => {
    const { face } = bench({
      roles: { planner: { label: 'Planner', model: { provider: 'alpha', model: 'fast' } } },
    })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.setProvider(role.draftId, 'beta')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'beta', model: '' })
    face.editRole(role.draftId, 'model', 'wide')
    face.setProvider(role.draftId, 'gamma')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'gamma', model: '' })
    face.setProvider(role.draftId, '')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: '', model: '' })
  })

  it('keeps a stored route that the current directory does not advertise', async () => {
    const { face } = bench({
      roles: { planner: { label: 'Planner', model: { provider: 'legacy', model: 'old' } } },
    })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'legacy', model: 'old' })
    face.editRole(face.hooks.agentRoleConfig.getSnapshot().roles[0]!.draftId, 'label', 'Renamed')
    face.save()
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().dirty).toBe(false) })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'legacy', model: 'old' })
  })

  it('keeps drafts when the directory fails and retries without a session reset', async () => {
    const models = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: new Error('offline') })
      .mockResolvedValueOnce({ ok: true as const, value: { groups, failures: [] } })
    const host = stubConfigForm<AgentRoleSettings>()
    acceptWrites(host)
    host.publish({
      status: 'ready', writable: true, revision: 1,
      value: { roles: { planner: { label: 'Planner' } } }, user: {},
    })
    const controller = new AgentRoleConfigController(host.scope, ctxWith(models).ctx, t)
    const face = controller.inject()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.editRole(role.draftId, 'label', 'Staged')
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('error') })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.label).toBe('Staged')
    face.retryCatalog()
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.label).toBe('Staged')
    expect(models).toHaveBeenCalledTimes(2)
  })

  it('reports partial provider failures and ignores late directory settlements', async () => {
    let settle!: (value: never) => void
    const models = vi.fn(() => new Promise<never>((resolve) => { settle = resolve }))
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: models } } } as never, t)
    const state = () => controller.inject().hooks.agentRoleConfig.getSnapshot()
    await vi.waitFor(() => { expect(models).toHaveBeenCalledOnce() })
    controller.refreshCatalog()
    await vi.waitFor(() => { expect(models).toHaveBeenCalledTimes(2) })
    settle({ ok: true, value: { groups, failures: [{ id: 'beta', name: 'Beta', message: 'down' }] } } as never)
    await vi.waitFor(() => { expect(state()).toMatchObject({ catalogStatus: 'ready', catalogPartial: true }) })
    controller.dispose()
    expect(state().catalogStatus).toBe('ready')
  })

  it('drops directory results on connection reset and ignores a pending read', async () => {
    let settle!: (value: unknown) => void
    const models = vi.fn(() => new Promise((resolve) => { settle = resolve }))
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: models } } } as never, t)
    const state = () => controller.inject().hooks.agentRoleConfig.getSnapshot()
    await vi.waitFor(() => { expect(models).toHaveBeenCalledOnce() })
    controller.resetConnection()
    await vi.waitFor(() => { expect(models).toHaveBeenCalledTimes(2) })
    expect(state().catalogGroups).toEqual([])
    settle({ ok: false, error: new Error('late') })
    await vi.waitFor(() => { expect(state().catalogStatus).toBe('error') })
    settle({ ok: true, value: { groups, failures: [] } })
    expect(state().catalogStatus).toBe('error')
  })

  it('handles a thrown directory request and non-Error failures', async () => {
    const thrown = vi.fn(() => Promise.reject(new Error('boom')))
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: thrown } } } as never, t)
    await vi.waitFor(() => {
      expect(controller.inject().hooks.agentRoleConfig.getSnapshot()).toMatchObject({
        catalogStatus: 'error', catalogError: 'boom',
      })
    })
    const thrownValue = { reason: 'plain' }
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- exercises the non-Error branch of the directory failure report.
    const plain = vi.fn(() => Promise.reject(thrownValue))
    const second = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: plain } } } as never, t)
    await vi.waitFor(() => {
      expect(second.inject().hooks.agentRoleConfig.getSnapshot()).toMatchObject({
        catalogStatus: 'error', catalogError: '[object Object]',
      })
    })
  })

  it('ignores directory work and edits after disposal', async () => {
    const pending = vi.fn(() => new Promise<never>(() => {}))
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: pending } } } as never, t)
    const face = controller.inject()
    controller.dispose()
    controller.refreshCatalog()
    controller.resetConnection()
    face.retryCatalog()
    face.discard()
    expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('loading')
  })

  it('edits and resets the deployment fallback', () => {
    const { host, face } = bench()
    face.editDefaultBacking('other')
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({
      defaultBacking: 'other', defaultBackingOverridden: true, defaultBackingCleared: false,
    })
    face.resetDefaultBacking()
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({
      defaultBacking: 'spawn', defaultBackingCleared: true,
    })
    face.save()
    expect(host.mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['backingProvider'] }], 7)
  })

  it('sets context and dumps a complete payload with every optional field', async () => {
    const { host, face } = bench({
      roles: {
        planner: {
          label: 'Planner', description: 'Plans work.', tags: ['planning'],
          model: { provider: 'alpha', model: 'fast', reasoningEffort: 'high', maxTokens: 64 },
          agentPreset: 'review', backingProvider: 'other', contextDefault: 'fork',
          delegationDepth: 2, capacityGroup: 'group-a', executionBudget: { wallClockMs: 1000 },
          outputSchema: { type: 'object' },
        },
      },
    })
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    expect(role).toMatchObject({
      provider: 'alpha', model: 'fast', reasoningEffort: 'high', maxTokens: '64',
      agentPreset: 'review', backingProvider: 'other', context: 'fork',
      delegationDepth: '2', capacityGroup: 'group-a', wallClockMs: '1000',
    })
    face.setContext(role.draftId, 'fresh')
    face.editRole(role.draftId, 'label', 'Changed')
    face.save()
    await expect.poll(() => host.mutate.mock.calls.length).toBe(1)
    expect(host.mutate.mock.calls[0]![0]).toEqual([{
      op: 'set',
      path: ['roles'],
      value: {
        planner: {
          label: 'Changed', description: 'Plans work.', tags: ['planning'],
          model: { provider: 'alpha', model: 'fast', reasoningEffort: 'high', maxTokens: 64 },
          agentPreset: 'review', backingProvider: 'other', contextDefault: 'fresh',
          delegationDepth: 2, capacityGroup: 'group-a', executionBudget: { wallClockMs: 1000 },
          outputSchema: { type: 'object' },
        },
      },
    }])
  })

  it('rejects invalid boundaries that the Host catalog enforces', () => {
    const { face } = bench({
      roles: {
        planner: { label: 'Planner' },
        summarizer: { label: 'Summarizer' },
      },
    })
    const roles = face.hooks.agentRoleConfig.getSnapshot().roles
    face.editRole(roles[0]!.draftId, 'name', 'a'.repeat(257))
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'nameTooLong' })
    face.editRole(roles[0]!.draftId, 'name', 'planner')
    face.editRole(roles[0]!.draftId, 'tags', Array.from({ length: 17 }, () => 'tag').join(','))
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'tagsInvalid' })
    face.editRole(roles[0]!.draftId, 'tags', '')
    face.editRole(roles[0]!.draftId, 'label', 'a'.repeat(257))
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'labelTooLong' })
    face.editRole(roles[0]!.draftId, 'label', 'Planner')
    face.editRole(roles[0]!.draftId, 'description', 'a'.repeat(4097))
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'descriptionTooLong' })
    face.editRole(roles[0]!.draftId, 'description', '')
    face.editRole(roles[0]!.draftId, 'maxTokens', '1.5')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'positiveInteger' })
    face.editRole(roles[0]!.draftId, 'maxTokens', '')
    face.editRole(roles[0]!.draftId, 'provider', 'alpha')
    face.editRole(roles[0]!.draftId, 'model', 'fast')
    face.editRole(roles[0]!.draftId, 'provider', 'bad provider')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'identifierInvalid' })
    face.editRole(roles[0]!.draftId, 'provider', 'alpha')
    face.editRole(roles[0]!.draftId, 'delegationDepth', '1.5')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'nonNegativeInteger' })
    face.editRole(roles[0]!.draftId, 'delegationDepth', '')
    face.editRole(roles[0]!.draftId, 'wallClockMs', '0')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'positiveInteger' })
  })

  it('blocks saving while the fallback is invalid and writes only the fallback when it changes', async () => {
    const { host, face } = bench()
    face.editDefaultBacking('bad fallback')
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({ invalid: true, dirty: false })
    face.editDefaultBacking('other')
    face.save()
    await expect.poll(() => host.mutate.mock.calls.length).toBe(1)
    expect(host.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['backingProvider'], value: 'other' }], 7)
  })

  it('discards a staged draft and clears a failed save', async () => {
    const { host, face } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.discard()
    expect(face.hooks.agentRoleConfig.getSnapshot().dirty).toBe(false)
    face.editRole(role.draftId, 'label', 'Changed')
    host.mutate.mockResolvedValueOnce(false)
    face.save()
    await expect.poll(() => face.hooks.agentRoleConfig.getSnapshot().failed).toBe(true)
    face.discard()
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({ failed: false, dirty: false, roles: [{ label: 'Planner' }] })
  })

  it('reports a thrown write and ignores a settlement after disposal', async () => {
    const { host, face, controller } = bench()
    const first = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    host.mutate.mockRejectedValueOnce(new Error('write failed'))
    face.editRole(first.draftId, 'label', 'Changed')
    face.save()
    await expect.poll(() => face.hooks.agentRoleConfig.getSnapshot().failed).toBe(true)
    host.mutate.mockImplementationOnce(() => new Promise(() => {}))
    face.save()
    controller.dispose()
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.label).toBe('Changed')
  })

  it('reads a non-object role definition as an empty draft and tolerates a missing inherited fallback', () => {
    const { face } = bench({ roles: { planner: 'not-an-object' } })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({
      name: 'planner', label: '', provider: '', model: '', agentPreset: '', backingProvider: '',
    })
    face.resetDefaultBacking()
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({ defaultBacking: 'spawn', defaultBackingCleared: true })
    face.setProvider(face.hooks.agentRoleConfig.getSnapshot().roles[0]!.draftId, 'alpha')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'alpha', model: '' })
  })

  it('keeps an advertised model when switching to the provider that owns it', async () => {
    const { face } = bench({
      roles: { planner: { label: 'Planner', model: { provider: 'legacy', model: 'fast' } } },
    })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.setProvider(role.draftId, 'alpha')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'alpha', model: 'fast' })
    face.setProvider(role.draftId, 'alpha')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'alpha', model: 'fast' })
  })

  it('clears a stored effort the newly selected model does not advertise', async () => {
    const { face } = bench({
      roles: { planner: { label: 'Planner', model: { provider: 'alpha', model: 'deep', reasoningEffort: 'high' } } },
    })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.editRole(role.draftId, 'model', 'fast')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ model: 'fast', reasoningEffort: '' })
    face.editRole(role.draftId, 'model', 'deep')
    face.editRole(role.draftId, 'reasoningEffort', 'low')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ reasoningEffort: 'low' })
    face.setProvider(role.draftId, 'beta')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ provider: 'beta', model: '', reasoningEffort: '' })
  })

  it('keeps a stored effort on a route the directory does not describe', async () => {
    const { face } = bench({
      roles: { planner: { label: 'Planner', model: { provider: 'legacy', model: 'old', reasoningEffort: 'max' } } },
    })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ reasoningEffort: 'max' })
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.errorCode).toBeUndefined()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.setProvider(role.draftId, 'legacy')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ reasoningEffort: 'max' })
    face.editRole(role.draftId, 'model', 'still-unknown')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ reasoningEffort: 'max' })
  })

  it('rejects an effort the selected model does not advertise and a route-less model field', async () => {
    const { host, face } = bench({
      roles: { planner: { label: 'Planner', model: { provider: 'alpha', model: 'fast' } } },
    })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.editRole(role.draftId, 'reasoningEffort', 'high')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({
      errorCode: 'effortUnsupported', errorField: 'reasoningEffort',
    })
    face.save()
    expect(host.mutate).not.toHaveBeenCalled()
    face.editRole(role.draftId, 'reasoningEffort', '')
    face.editRole(role.draftId, 'provider', '')
    face.editRole(role.draftId, 'model', '')
    face.editRole(role.draftId, 'maxTokens', '64')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({
      errorCode: 'modelRouteRequired', errorField: 'modelRoute',
    })
  })

  it('ignores retry while a directory read is already in flight', async () => {
    let settle!: (value: unknown) => void
    const models = vi.fn(() => new Promise((resolve) => { settle = resolve }))
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: models } } } as never, t)
    const face = controller.inject()
    await vi.waitFor(() => { expect(models).toHaveBeenCalledOnce() })
    face.retryCatalog()
    expect(models).toHaveBeenCalledOnce()
    settle({ ok: true, value: { groups, failures: [] } })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
  })

  it('does not save duplicate or read-only sections', async () => {
    const { host, face } = bench({
      roles: { planner: { label: 'Planner' }, summarizer: { label: 'Summarizer' } },
    })
    const roles = face.hooks.agentRoleConfig.getSnapshot().roles
    face.editRole(roles[1]!.draftId, 'name', 'planner')
    face.save()
    expect(host.mutate).not.toHaveBeenCalled()
    host.publish({ ...host.scope.getSnapshot(), writable: false })
    face.editRole(roles[1]!.draftId, 'name', 'writer')
    face.save()
    expect(host.mutate).not.toHaveBeenCalled()
  })

  it('uses empty inherited text for a non-object settings base and edits unrelated roles', () => {
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: { planner: { label: 'Planner' }, other: { label: 'Other' } } }, base: undefined, user: {} })
    const controller = new AgentRoleConfigController(host.scope, ctxWith().ctx, t)
    const face = controller.inject()
    face.resetDefaultBacking()
    expect(face.hooks.agentRoleConfig.getSnapshot().defaultBacking).toBe('')
    const [role] = face.hooks.agentRoleConfig.getSnapshot().roles
    face.setContext(role!.draftId, 'fork')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[1]?.context).toBe('fresh')
    face.setProvider(role!.draftId, 'alpha')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[1]?.provider).toBe('')
  })

  it('keeps the previous draft when a staged role gain is not accepted', async () => {
    const { host, face } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    host.mutate.mockResolvedValueOnce(false)
    face.editRole(role.draftId, 'label', 'Changed')
    face.save()
    await expect.poll(() => face.hooks.agentRoleConfig.getSnapshot().failed).toBe(true)
    face.setProvider(role.draftId, 'alpha')
    expect(face.hooks.agentRoleConfig.getSnapshot().failed).toBe(false)
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.provider).toBe('alpha')
  })

  it('reloads after a directory read fails and ignores a settlement after disposal', async () => {
    let settle!: (value: unknown) => void
    const models = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { settle = resolve }))
      .mockResolvedValue({ ok: true, value: { groups, failures: [] } })
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, { remote: { session: { modelCatalog: models } } } as never, t)
    const face = controller.inject()
    await vi.waitFor(() => { expect(models).toHaveBeenCalledOnce() })
    settle({ ok: false, error: { message: 'nope' } })
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({ catalogStatus: 'error', catalogError: 'nope' }) })
    face.retryCatalog()
    await vi.waitFor(() => { expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('ready') })
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({ catalogStatus: 'ready', catalogGroups: groups })

    let late!: (value: unknown) => void
    const lateModels = vi.fn(() => new Promise((resolve) => { late = resolve }))
    const lateHost = stubConfigForm<AgentRoleSettings>()
    lateHost.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const lateController = new AgentRoleConfigController(
      lateHost.scope, { remote: { session: { modelCatalog: lateModels } } } as never, t,
    )
    const lateFace = lateController.inject()
    await vi.waitFor(() => { expect(lateModels).toHaveBeenCalledOnce() })
    lateController.dispose()
    late({ ok: true, value: { groups, failures: [] } })
    await Promise.resolve()
    expect(lateFace.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('loading')
  })

  it('ignores already-consumed drafts and rejects a failed payload rebuild', async () => {
    const { host, face, controller } = bench({ roles: { planner: { label: 'Planner' }, summarizer: { label: 'Summarizer' } } })
    const roles = face.hooks.agentRoleConfig.getSnapshot().roles
    face.editRole(roles[1]!.draftId, 'name', 'planner')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({ errorCode: 'nameDuplicate' })
    face.discard()
    face.editRole(roles[1]!.draftId, 'name', 'writer')
    await controller.save()
    await expect.poll(() => host.mutate.mock.calls.length).toBe(1)
  })

  it('ignores a second save while one is in flight and a settlement after disposal', async () => {
    const { host, face, controller } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    let finish!: (landed: boolean) => void
    host.mutate.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    face.editRole(role.draftId, 'label', 'Changed')
    const saving = controller.save()
    face.editRole(role.draftId, 'label', 'Changed again')
    await controller.save()
    expect(host.mutate).toHaveBeenCalledOnce()
    finish(true)
    await saving
    expect(face.hooks.agentRoleConfig.getSnapshot().saving).toBe(false)
  })

  it('suppresses a late settlement after the page is disposed', async () => {
    const { host, face, controller } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    let finish!: (landed: boolean) => void
    host.mutate.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    face.editRole(role.draftId, 'label', 'Changed')
    const saving = controller.save()
    controller.dispose()
    finish(true)
    await saving
    expect(face.hooks.agentRoleConfig.getSnapshot().saving).toBe(true)
  })

  it('suppresses a late directory rejection after the page is disposed', async () => {
    let finish!: (reason: unknown) => void
    const host = stubConfigForm<AgentRoleSettings>()
    host.publish({ status: 'ready', writable: true, value: { roles: {} }, user: {} })
    const controller = new AgentRoleConfigController(host.scope, {
      remote: { session: { modelCatalog: () => new Promise((_resolve, reject) => { finish = reject }) } },
    } as never, t)
    const face = controller.inject()
    controller.dispose()
    finish(new Error('late'))
    await Promise.resolve()
    expect(face.hooks.agentRoleConfig.getSnapshot().catalogStatus).toBe('loading')
  })

  it('suppresses a late write rejection after the page is disposed', async () => {
    const { host, face, controller } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    let finish!: (reason: unknown) => void
    host.mutate.mockImplementationOnce(() => new Promise((_resolve, reject) => { finish = reject }))
    face.editRole(role.draftId, 'label', 'Changed')
    const saving = controller.save()
    controller.dispose()
    finish(new Error('late'))
    await saving
    expect(face.hooks.agentRoleConfig.getSnapshot().saving).toBe(true)
  })

  it('writes a complete renamed table in one revision-fenced mutation', async () => {
    const { host, face } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.editRole(role.draftId, 'name', 'executor')
    face.editRole(role.draftId, 'tags', 'execution, delivery')
    face.save()
    await expect.poll(() => host.mutate.mock.calls.length).toBe(1)
    expect(host.mutate).toHaveBeenCalledWith([{
      op: 'set',
      path: ['roles'],
      value: { executor: { label: 'Planner', description: 'Plans work.', tags: ['execution', 'delivery'], contextDefault: 'fresh' } },
    }], 7)
    await expect.poll(() => face.hooks.agentRoleConfig.getSnapshot().dirty).toBe(false)
  })

  it('removes a role and adds a blank row without leaving stale keys', async () => {
    const { host, face } = bench({
      roles: {
        planner: { label: 'Planner' },
        summarizer: { label: 'Summarizer', contextDefault: 'fork' },
      },
    })
    const [planner] = face.hooks.agentRoleConfig.getSnapshot().roles
    face.removeRole(planner!.draftId)
    face.addRole()
    const roles = face.hooks.agentRoleConfig.getSnapshot().roles
    face.editRole(roles[1]!.draftId, 'name', 'writer')
    face.editRole(roles[1]!.draftId, 'label', 'Writer')
    face.save()
    await expect.poll(() => host.mutate.mock.calls.length).toBe(1)
    expect(host.mutate.mock.calls[0]![0]).toEqual([{
      op: 'set',
      path: ['roles'],
      value: {
        summarizer: { label: 'Summarizer', contextDefault: 'fork' },
        writer: { label: 'Writer', contextDefault: 'fresh' },
      },
    }])
  })

  it('clears the default backing override instead of writing the inherited value', async () => {
    const { host, face } = bench()
    face.resetDefaultBacking()
    expect(face.hooks.agentRoleConfig.getSnapshot()).toMatchObject({
      defaultBacking: 'spawn', defaultBackingOverridden: false, defaultBackingCleared: true, dirty: true,
    })
    face.save()
    await expect.poll(() => host.mutate.mock.calls.length).toBe(1)
    expect(host.mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['backingProvider'] }], 7)
  })

  it.each([
    ['name', 'bad name', 'nameInvalid', 'name'],
    ['label', '', 'labelRequired', 'label'],
    ['tags', 'one, two words', 'tagsInvalid', 'tags'],
    ['maxTokens', '0', 'positiveInteger', 'maxTokens'],
    ['provider', 'only-provider', 'modelRouteRequired', 'modelRoute'],
    ['outputSchema', '{"properties": {}}', 'schemaRoot', 'outputSchema'],
    ['outputSchema', 'not json', 'schemaInvalid', 'outputSchema'],
  ] as const)('blocks a %s draft that the Host would reject', (field, value, code, errorField) => {
    const { host, face } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.editRole(role.draftId, field, value)
    const state = face.hooks.agentRoleConfig.getSnapshot()
    expect(state.invalid).toBe(true)
    expect(state.dirty).toBe(false)
    expect(state.roles[0]).toMatchObject({ errorCode: code, errorField })
    expect(host.mutate).not.toHaveBeenCalled()
  })

  it('rejects duplicate names, reserved names, and a fork preset together', () => {
    const { face } = bench({
      roles: {
        planner: { label: 'Planner' },
        summarizer: { label: 'Summarizer', contextDefault: 'fork' },
      },
    })
    const roles = face.hooks.agentRoleConfig.getSnapshot().roles
    face.editRole(roles[1]!.draftId, 'agentPreset', 'review')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[1]).toMatchObject({
      errorCode: 'presetForkConflict', errorField: 'agentPreset',
    })
    face.editRole(roles[1]!.draftId, 'agentPreset', '')
    face.editRole(roles[0]!.draftId, 'name', '__proto__')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({
      errorCode: 'nameReserved', errorField: 'name',
    })
    face.editRole(roles[0]!.draftId, 'name', 'summarizer')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]).toMatchObject({
      errorCode: 'nameDuplicate', errorField: 'name',
    })
  })

  it('keeps staged edits after a Host refusal', async () => {
    const { host, face } = bench()
    host.mutate.mockResolvedValueOnce(false)
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    face.editRole(role.draftId, 'label', 'Changed')
    face.save()
    await expect.poll(() => face.hooks.agentRoleConfig.getSnapshot().failed).toBe(true)
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.label).toBe('Changed')
  })

  it('unsubscribes and stops publishing after disposal', async () => {
    const { host, face, controller } = bench()
    const role = face.hooks.agentRoleConfig.getSnapshot().roles[0]!
    controller.dispose()
    expect(host.listenerCount()).toBe(0)
    face.editRole(role.draftId, 'label', 'After disposal')
    expect(face.hooks.agentRoleConfig.getSnapshot().roles[0]?.label).toBe('Planner')
  })
})
