// @vitest-environment jsdom
/** The Agent Roles bundle page renders the whole staged catalog and its errors. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentRoleConfigCard, type AgentRoleConfigCardProps } from '../src/client/AgentRoleConfigCard.tsx'
import type { AgentRoleConfigState, RoleDraftState } from '../src/client/roles-model.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(en)

const settled: SettingsFormShell = {
  available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false,
}

function role(rest: Partial<RoleDraftState> = {}): RoleDraftState {
  return {
    draftId: 'role-1', name: 'planner', label: 'Planner', description: 'Plans work.',
    tags: '', context: 'fresh', provider: '', model: '', reasoningEffort: '', maxTokens: '',
    agentPreset: '', backingProvider: '', delegationDepth: '', capacityGroup: '', wallClockMs: '',
    outputSchema: '', ...rest,
  }
}

function renderCard(state: Partial<AgentRoleConfigState> = {}, view: 'summary' | 'page' = 'page') {
  const store = createSnapshotStore<AgentRoleConfigState>({
    ...settled,
    defaultBacking: 'spawn',
    defaultBackingOverridden: false,
    defaultBackingCleared: false,
    defaultBackingInvalid: false,
    catalogGroups: [
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
    ],
    catalogStatus: 'ready',
    catalogPartial: false,
    catalogError: null,
    roles: [role()],
    ...state,
  })
  const actions = {
    editDefaultBacking: vi.fn(), resetDefaultBacking: vi.fn(), addRole: vi.fn(),
    removeRole: vi.fn(), editRole: vi.fn(), setContext: vi.fn(), setProvider: vi.fn(),
    retryCatalog: vi.fn(() => Promise.resolve()), save: vi.fn(() => Promise.resolve()), discard: vi.fn(),
  }
  const props = { ...actions, view, t, useAgentRoleConfig: bindSnapshotSelector(store) } as AgentRoleConfigCardProps
  render(<AgentRoleConfigCard {...props} />)
  return actions
}

describe('AgentRoleConfigCard', () => {
  it('renders its one-liner alone in the summary view', () => {
    renderCard({}, 'summary')
    expect(document.body.textContent).toBe(en.summary)
    expect(screen.queryByLabelText(en.roleName)).toBeNull()
  })

  it('stages role edits and saves the full staged table', () => {
    const actions = renderCard({ dirty: true })
    fireEvent.change(screen.getByLabelText(en.roleName), { target: { value: 'auditor' } })
    fireEvent.click(screen.getByRole('button', { name: en.addRole }))
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(actions.editRole).toHaveBeenCalledWith('role-1', 'name', 'auditor')
    expect(actions.addRole).toHaveBeenCalledOnce()
    expect(actions.save).toHaveBeenCalledOnce()
  })

  it('marks the field a structured error names, without depending on localized text', () => {
    renderCard({ invalid: true, roles: [role({ error: en.modelRouteRequired, errorCode: 'modelRouteRequired', errorField: 'modelRoute' })] })
    expect(screen.getByLabelText(en.modelProvider).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText(en.model)).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toBe(en.modelRouteRequired)
  })

  it('selects providers and filters models to the chosen provider', () => {
    const actions = renderCard({ roles: [role({ provider: 'alpha', model: 'fast' })] })
    expect(screen.getByLabelText(en.modelProvider)).toHaveProperty('tagName', 'SELECT')
    expect(screen.getByLabelText(en.model)).toHaveProperty('tagName', 'SELECT')
    expect(screen.getByRole('option', { name: 'Alpha API' }).getAttribute('value')).toBe('alpha')
    expect(screen.queryByRole('option', { name: 'Wide' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Fast' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(en.modelProvider), { target: { value: 'beta' } })
    expect(actions.setProvider).toHaveBeenCalledWith('role-1', 'beta')
  })

  it('disables the model picker until a provider is chosen and keeps an unavailable stored route', () => {
    renderCard({ roles: [role()] })
    expect(screen.getByLabelText(en.model)).toHaveProperty('disabled', true)
    cleanup()
    renderCard({ roles: [role({ provider: 'legacy', model: 'old' })] })
    expect(screen.getByRole('option', { name: `legacy (${en.modelUnavailable})` })).toBeTruthy()
    expect(screen.getByRole('option', { name: `old (${en.modelUnavailable})` })).toBeTruthy()
  })

  it('offers only the reasoning efforts the selected model advertises', () => {
    renderCard({ roles: [role()] })
    expect(screen.getByLabelText(en.reasoningEffort)).toHaveProperty('disabled', true)
    expect(screen.getByText(en.effortSelectPlaceholder)).toBeTruthy()
    cleanup()
    const actions = renderCard({ roles: [role({ provider: 'alpha', model: 'deep', reasoningEffort: 'high' })] })
    const efforts = screen.getByLabelText(en.reasoningEffort)
    expect(efforts).toHaveProperty('tagName', 'SELECT')
    expect(within(efforts).getAllByRole('option').map(option => option.textContent))
      .toEqual([en.effortInherit, 'Low', 'High'])
    expect(within(efforts).queryByRole('option', { name: 'Medium' })).toBeNull()
    fireEvent.change(efforts, { target: { value: 'low' } })
    expect(actions.editRole).toHaveBeenCalledWith('role-1', 'reasoningEffort', 'low')
  })

  it('states that a non-reasoning model offers no levels and keeps an unadvertised stored level selectable', () => {
    renderCard({ roles: [role({ provider: 'alpha', model: 'fast' })] })
    expect(screen.getByText(en.effortNone)).toBeTruthy()
    // Nothing to choose, so the picker states why instead of offering a value the model refuses.
    expect(screen.getByLabelText(en.reasoningEffort)).toHaveProperty('disabled', true)
    cleanup()
    renderCard({ roles: [role({ provider: 'alpha', model: 'deep', reasoningEffort: 'max' })] })
    expect(screen.getByRole('option', { name: `max (${en.modelUnavailable})` })).toBeTruthy()
    expect(screen.getByLabelText(en.reasoningEffort)).toHaveProperty('value', 'max')
  })

  it('shows directory loading, failure, retry, partial, and empty states', () => {
    renderCard({ catalogStatus: 'loading' })
    expect(screen.getByRole('status').textContent).toBe(en.modelCatalogLoading)
    cleanup()
    const actions = renderCard({
      catalogStatus: 'error', catalogError: 'offline',
    })
    expect(screen.getByRole('alert').textContent).toContain(en.modelCatalogFailed)
    expect(screen.getByRole('alert').textContent).toContain('offline')
    fireEvent.click(screen.getByRole('button', { name: en.modelCatalogRetry }))
    expect(actions.retryCatalog).toHaveBeenCalledOnce()
    cleanup()
    renderCard({ catalogPartial: true })
    expect(screen.getByRole('status').textContent).toBe(en.modelCatalogPartial)
    cleanup()
    renderCard({ catalogGroups: [] })
    expect(screen.getByRole('status').textContent).toBe(en.modelCatalogEmpty)
  })

  it('omits the detail row when the directory failure carries no message', () => {
    renderCard({ catalogStatus: 'error', catalogError: null })
    expect(screen.getByRole('alert').textContent).toBe(`${en.modelCatalogFailed}${en.modelCatalogRetry}`)
  })

  it('shows the schema textarea as invalid for a non-object root', () => {
    renderCard({ invalid: true, roles: [role({ outputSchema: '{"properties": {}}', error: en.schemaRoot, errorCode: 'schemaRoot', errorField: 'outputSchema' })] })
    expect(screen.getByLabelText(en.outputSchema).getAttribute('aria-invalid')).toBe('true')
  })

  it('routes every role field and control to its staged action', () => {
    const actions = renderCard({
      defaultBackingOverridden: true,
      roles: [role({ error: en.nameTooLong, errorCode: 'nameTooLong', errorField: 'name' })],
    })
    fireEvent.change(screen.getByLabelText(en.roleName), { target: { value: 'renamed' } })
    fireEvent.click(screen.getAllByRole('button', { name: en.backingReset })[0]!)
    fireEvent.change(screen.getByLabelText(en.label), { target: { value: 'Label' } })
    fireEvent.change(screen.getByLabelText(en.roleDescription), { target: { value: 'Description' } })
    fireEvent.click(screen.getByRole('tab', { name: en.fork }))
    fireEvent.change(screen.getByLabelText(en.tags), { target: { value: 'one, two' } })
    fireEvent.change(screen.getByLabelText(en.reasoningEffort), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText(en.maxTokens), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText(en.agentPreset), { target: { value: 'review' } })
    fireEvent.change(screen.getByLabelText(en.backingProvider), { target: { value: 'spawn' } })
    fireEvent.change(screen.getByLabelText(en.delegationDepth), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(en.capacityGroup), { target: { value: 'group' } })
    fireEvent.change(screen.getByLabelText(en.wallClockMs), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(en.outputSchema), { target: { value: '{}' } })
    expect(actions.editRole).toHaveBeenCalledWith('role-1', 'name', 'renamed')
    expect(actions.resetDefaultBacking).toHaveBeenCalledOnce()
    expect(actions.setContext).toHaveBeenCalledWith('role-1', 'fork')
    expect(actions.editRole).toHaveBeenCalledWith('role-1', 'outputSchema', '{}')
  })

  it('shows an empty catalog and marks provider and model invalid independently', () => {
    renderCard({ roles: [] })
    expect(screen.getByRole('status').textContent).toBe(en.emptyRoles)
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.identifierInvalid, errorCode: 'identifierInvalid', errorField: 'provider' })] })
    expect(screen.getByLabelText(en.modelProvider).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.identifierInvalid, errorCode: 'identifierInvalid', errorField: 'model' })] })
    expect(screen.getByLabelText(en.model).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    const actions = renderCard({ roles: [role({ provider: 'alpha', model: 'fast' })] })
    fireEvent.change(screen.getByLabelText(en.model), { target: { value: 'deep' } })
    expect(actions.editRole).toHaveBeenCalledWith('role-1', 'model', 'deep')
  })

  it('renders unnamed roles, resets role fields, and marks other structured fields invalid', () => {
    renderCard({
      invalid: true,
      roles: [role({
        name: '', label: '', error: en.labelRequired, errorCode: 'labelRequired', errorField: 'label',
      })],
    })
    expect(screen.getByRole('heading', { name: t('roleHeading', { name: t('unnamedRole') }) })).toBeTruthy()
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.descriptionTooLong, errorCode: 'descriptionTooLong', errorField: 'description' })] })
    expect(screen.getByLabelText(en.roleDescription).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.tagsInvalid, errorCode: 'tagsInvalid', errorField: 'tags' })] })
    expect(screen.getByLabelText(en.tags).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.identifierInvalid, errorCode: 'identifierInvalid', errorField: 'reasoningEffort' })] })
    expect(screen.getByLabelText(en.reasoningEffort).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ provider: 'alpha', model: 'deep', error: en.effortUnsupported, errorField: 'reasoningEffort' })] })
    expect(screen.getByLabelText(en.reasoningEffort).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByText(en.effortUnsupported)).toHaveLength(2)
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.positiveInteger, errorCode: 'positiveInteger', errorField: 'maxTokens' })] })
    expect(screen.getByLabelText(en.maxTokens).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.presetForkConflict, errorCode: 'presetForkConflict', errorField: 'agentPreset' })] })
    expect(screen.getByLabelText(en.agentPreset).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.identifierInvalid, errorCode: 'identifierInvalid', errorField: 'backingProvider' })] })
    expect(screen.getByLabelText(en.backingProvider).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.nonNegativeInteger, errorCode: 'nonNegativeInteger', errorField: 'delegationDepth' })] })
    expect(screen.getByLabelText(en.delegationDepth).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.identifierInvalid, errorCode: 'identifierInvalid', errorField: 'capacityGroup' })] })
    expect(screen.getByLabelText(en.capacityGroup).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.positiveInteger, errorCode: 'positiveInteger', errorField: 'wallClockMs' })] })
    expect(screen.getByLabelText(en.wallClockMs).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.modelRouteRequired, errorCode: 'modelRouteRequired', errorField: 'modelRoute' })] })
    expect(screen.getByLabelText(en.modelProvider).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.nameInvalid, errorCode: 'nameInvalid', errorField: 'name' })] })
    expect(screen.getByLabelText(en.roleName).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.modelRouteRequired, errorCode: 'modelRouteRequired', errorField: 'modelRoute' })] })
    expect(screen.getAllByText(en.modelRouteRequired)).toHaveLength(2)
    fireEvent.change(screen.getByLabelText(en.roleName), { target: { value: 'x' } })
    cleanup()
    renderCard({ invalid: true, roles: [role({ error: en.identifierInvalid, errorField: 'modelRoute' })] })
    expect(screen.getByLabelText(en.modelProvider).getAttribute('aria-invalid')).toBe('true')
    cleanup()
    renderCard({ invalid: true, roles: [role({ provider: 'alpha', error: en.identifierInvalid, errorField: 'model' })] })
    fireEvent.change(screen.getByLabelText(en.model), { target: { value: 'fast' } })
  })

  it('resets the default backing provider to its inherited value and removes roles', () => {
    const actions = renderCard({ defaultBackingOverridden: true })
    fireEvent.click(screen.getByRole('button', { name: en.backingReset }))
    fireEvent.click(screen.getByRole('button', { name: t('removeRole', { name: 'planner' }) }))
    expect(actions.resetDefaultBacking).toHaveBeenCalledOnce()
    expect(actions.removeRole).toHaveBeenCalledWith('role-1')
  })

  it('renders the shared unavailable and read-only states', () => {
    renderCard({ available: false })
    expect(screen.getByRole('status').textContent).toBe(en.unavailable)
    cleanup()
    renderCard({ writable: false })
    expect(screen.getByText(en.readOnly)).toBeTruthy()
    expect(screen.getByLabelText(en.roleName)).toHaveProperty('disabled', true)
  })
})
