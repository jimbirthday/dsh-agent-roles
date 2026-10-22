/** The Agent Roles bundle page: the complete role catalog over the `agent-roles` settings section. */

import { useId } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import {
  Button, IconPlusOutlineRegular, IconTrashOutlineRegular, SegmentedControl, SettingsForm, SettingsValueField, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  AgentRoleConfigFace, AgentRoleConfigState, RoleDraftState, RoleField, RoleValidationCode, RoleValidationField,
} from './roles-model.ts'
import { formLabels, type AgentRoleConfigLocaleKey } from './locales.ts'
import css from './AgentRoleConfigCard.module.css'

/** Props the renderer binds for the bundle's page. */
export type AgentRoleConfigCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'agentRoles.config'>
  & InjectFace<AgentRoleConfigFace>

/**
 * Render the bundle's summary, or its staged role editor.
 * @param props - requested view, locale copy, the role snapshot, and its actions.
 * @returns the one-liner, or the editable catalog.
 */
export function AgentRoleConfigCard(props: AgentRoleConfigCardProps) {
  const { t } = props
  const state = props.useAgentRoleConfig(snapshot => snapshot)
  if (props.view === 'summary') return t('summary')
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <p className={css.description}>{t('description')}</p>
      <ModelCatalogNotice state={state} t={t} retry={props.retryCatalog} />
      <DefaultBackingField state={state} t={t}
        edit={props.editDefaultBacking} reset={props.resetDefaultBacking} />
      <section className={css.rolesSection}>
        <div className={css.rolesHead}>
          <div>
            <h3 className={css.heading}>{t('rolesTitle')}</h3>
            <p className={css.hint}>{t('rolesHint')}</p>
          </div>
          <Button variant="outline" size="sm" icon={<IconPlusOutlineRegular size={13} />}
            disabled={!state.writable || state.saving} onClick={props.addRole}>
            {t('addRole')}
          </Button>
        </div>
        {state.roles.length === 0
          ? <p className={css.empty} role="status">{t('emptyRoles')}</p>
          : <ol className={css.roles}>{state.roles.map((role, index) => (
            <RoleCard key={role.draftId} role={role} index={index} state={state} t={t}
              editRole={props.editRole} setContext={props.setContext} setProvider={props.setProvider}
              removeRole={props.removeRole} />
          ))}</ol>}
      </section>
    </SettingsForm>
  )
}

/** The shared Host model-directory state shown once above the role rows. */
function ModelCatalogNotice({ state, t, retry }: {
  readonly state: AgentRoleConfigState
  readonly t: Translate<AgentRoleConfigLocaleKey>
  readonly retry: () => void
}) {
  if (state.catalogStatus === 'loading') {
    return <p className={css.catalogNotice} role="status">{t('modelCatalogLoading')}</p>
  }
  if (state.catalogStatus === 'error') {
    return (
      <div className={css.catalogFailure} role="alert">
        <span>{t('modelCatalogFailed')}</span>
        {state.catalogError === null
          ? null
          : <span className={css.catalogDetail}>{state.catalogError}</span>}
        <Button variant="outline" size="sm" disabled={!state.writable || state.saving} onClick={retry}>
          {t('modelCatalogRetry')}
        </Button>
      </div>
    )
  }
  if (state.catalogPartial) {
    return <p className={css.catalogNotice} role="status">{t('modelCatalogPartial')}</p>
  }
  if (state.catalogStatus === 'ready' && state.catalogGroups.length === 0) {
    return <p className={css.catalogNotice} role="status">{t('modelCatalogEmpty')}</p>
  }
  return null
}

/** The fallback provider roles inherit, with the shared override and reset affordances. */
function DefaultBackingField({ state, t, edit, reset }: {
  readonly state: AgentRoleConfigState
  readonly t: Translate<AgentRoleConfigLocaleKey>
  readonly edit: (value: string) => void
  readonly reset: () => void
}) {
  const id = useId()
  return (
    <div className={css.defaultBacking}>
      <SettingsValueField
        id={`${id}-default-backing`}
        label={t('defaultBacking')}
        hint={t('defaultBackingHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('backingReset')}
        invalidLabel={t('identifierInvalid')}
        text={state.defaultBacking}
        overridden={state.defaultBackingOverridden}
        invalid={state.defaultBackingInvalid}
        disabled={!state.writable || state.saving}
        onEdit={edit}
        onReset={reset}
      />
    </div>
  )
}

/** One role's identity, context mode, and optional delegation fields. */
function RoleCard({ role, index, state, t, editRole, setContext, setProvider, removeRole }: {
  readonly role: RoleDraftState
  readonly index: number
  readonly state: AgentRoleConfigState
  readonly t: Translate<AgentRoleConfigLocaleKey>
  readonly editRole: (id: string, field: RoleField, text: string) => void
  readonly setContext: (id: string, context: 'fresh' | 'fork') => void
  readonly setProvider: (id: string, provider: string) => void
  readonly removeRole: (id: string) => void
}) {
  const id = useId()
  const disabled = !state.writable || state.saving
  const title = role.name.trim() === '' ? t('unnamedRole') : role.name.trim()
  const field = (key: RoleField) => ({
    id: `${id}-${key}`,
    text: role[key],
    disabled,
    overridden: false,
    onEdit: (text: string) => { editRole(role.draftId, key, text) },
    /* v8 ignore next -- role fields never render the reset affordance because the whole row shares one staged table. */
    onReset: () => { editRole(role.draftId, key, '') },
  })
  const invalid = (field: RoleValidationField, code?: RoleValidationCode): boolean => role.errorField === field
    && (code === undefined || role.errorCode === code)
  return (
    <li className={css.role}>
      <div className={css.roleHead}>
        <h4 className={css.roleTitle} id={`${id}-heading`}>{t('roleHeading', { name: title })}</h4>
        <Tag tone="quiet">{String(index + 1)}</Tag>
        <Button variant="ghost" size="sm" className={css.remove}
          aria-label={t('removeRole', { name: title })} title={t('removeRole', { name: title })}
          icon={<IconTrashOutlineRegular size={14} />} disabled={disabled}
          onClick={() => { removeRole(role.draftId) }}>
        </Button>
      </div>
      {role.error === undefined ? null : <p className={css.error} role="alert" id={`${id}-error`}>{role.error}</p>}
      <div className={css.grid}>
        <SettingsValueField label={t('roleName')} hint={t('roleNameHint')}
          {...field('name')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
          invalidLabel={t(role.errorField === 'name' && role.errorCode !== undefined ? role.errorCode : 'nameInvalid')}
          invalid={invalid('name')} />
        <SettingsValueField label={t('label')} hint={t('labelHint')}
          {...field('label')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
          invalidLabel={t(role.errorField === 'label' && role.errorCode !== undefined ? role.errorCode : 'labelRequired')}
          invalid={invalid('label')} />
      </div>
      <SettingsValueField label={t('roleDescription')} hint={t('roleDescriptionHint')}
        {...field('description')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
        invalidLabel={t(role.errorField === 'description' && role.errorCode !== undefined ? role.errorCode : 'descriptionTooLong')}
        invalid={invalid('description')} />
      <div className={css.grid}>
        <div className={css.context}>
          <span className={css.fieldLabel}>{t('context')}</span>
          <SegmentedControl id={`${id}-context`} label={t('context')} value={role.context}
            disabled={disabled} onChange={(context) => { setContext(role.draftId, context) }}
            options={[
              { value: 'fresh', label: t('fresh') },
              { value: 'fork', label: t('fork') },
            ]} />
          <p className={css.hint}>{t('contextHint')}</p>
        </div>
        <SettingsValueField label={t('tags')} hint={t('tagsHint')}
          {...field('tags')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
          invalidLabel={t('tagsInvalid')}
          invalid={invalid('tags', 'tagsInvalid')} />
      </div>
      <details className={css.advanced}>
        <summary className={css.summary}>{t('advanced')}</summary>
        <p className={css.hint}>{t('advancedHint')}</p>
        <div className={css.grid}>
          <ModelRouteFields role={role} state={state} t={t} disabled={disabled}
            editRole={editRole} setProvider={setProvider} />
          <EffortField role={role} state={state} t={t} disabled={disabled} editRole={editRole}
            invalid={role.errorField === 'reasoningEffort'} />
          <SettingsValueField label={t('maxTokens')} hint={t('advancedHint')}
            {...field('maxTokens')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
            invalidLabel={t('positiveInteger')} numeric
            invalid={invalid('maxTokens', 'positiveInteger')} />
          <SettingsValueField label={t('agentPreset')} hint={t('agentPresetHint')}
            {...field('agentPreset')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
            invalidLabel={t(role.errorField === 'agentPreset' && role.errorCode !== undefined ? role.errorCode : 'presetForkConflict')}
            invalid={role.errorField === 'agentPreset'} />
          <SettingsValueField label={t('backingProvider')} hint={t('backingProviderHint')}
            {...field('backingProvider')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
            invalidLabel={t(role.errorField === 'backingProvider' && role.errorCode !== undefined ? role.errorCode : 'identifierInvalid')}
            invalid={invalid('backingProvider', 'identifierInvalid')} />
          <SettingsValueField label={t('delegationDepth')} hint={t('delegationDepthHint')}
            {...field('delegationDepth')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
            invalidLabel={t('nonNegativeInteger')} numeric
            invalid={invalid('delegationDepth', 'nonNegativeInteger')} />
          <SettingsValueField label={t('capacityGroup')} hint={t('capacityGroupHint')}
            {...field('capacityGroup')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
            invalidLabel={t(role.errorField === 'capacityGroup' && role.errorCode !== undefined ? role.errorCode : 'identifierInvalid')}
            invalid={invalid('capacityGroup', 'identifierInvalid')} />
          <SettingsValueField label={t('wallClockMs')} hint={t('wallClockHint')}
            {...field('wallClockMs')} overriddenLabel={t('overridden')} resetLabel={t('backingReset')}
            invalidLabel={t('positiveInteger')} numeric
            invalid={invalid('wallClockMs', 'positiveInteger')} />
        </div>
        <div className={css.schema}>
          <label className={css.fieldLabel} htmlFor={`${id}-schema`}>{t('outputSchema')}</label>
          <p className={css.hint}>{t('outputSchemaHint')}</p>
          <textarea id={`${id}-schema`} className={css.schemaInput} value={role.outputSchema}
            disabled={disabled} aria-invalid={role.errorField === 'outputSchema' || undefined}
            onChange={(event) => { editRole(role.draftId, 'outputSchema', event.target.value) }} />
        </div>
      </details>
    </li>
  )
}

/** Provider and model pickers backed by the Host model directory. */
function ModelRouteFields({ role, state, t, disabled, editRole, setProvider }: {
  readonly role: RoleDraftState
  readonly state: AgentRoleConfigState
  readonly t: Translate<AgentRoleConfigLocaleKey>
  readonly disabled: boolean
  readonly editRole: (id: string, field: RoleField, text: string) => void
  readonly setProvider: (id: string, provider: string) => void
}) {
  const id = useId()
  const invalid = role.errorField === 'modelRoute'
    || (role.errorField === 'provider' && role.errorCode === 'identifierInvalid')
    || (role.errorField === 'model' && role.errorCode === 'identifierInvalid')
  const provider = state.catalogGroups.find(group => group.id === role.provider)
  const providers = state.catalogGroups.some(group => group.id === role.provider)
    ? state.catalogGroups
    : role.provider === '' ? state.catalogGroups : [
      ...state.catalogGroups,
      { id: role.provider, name: `${role.provider} (${t('modelUnavailable')})`, models: [] },
    ]
  const models = provider?.models ?? []
  const modelUnavailable = role.model !== '' && !models.some(model => model.id === role.model)
  return (
    <>
      <div className={css.selectField}>
        <label className={css.fieldLabel} htmlFor={`${id}-provider`}>{t('modelProvider')}</label>
        <select id={`${id}-provider`} className={css.select} value={role.provider}
          disabled={disabled} aria-invalid={invalid || undefined}
          onChange={(event) => { setProvider(role.draftId, event.target.value) }}>
          <option value="">{t('modelInherit')}</option>
          {providers.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <p className={css.hint}>{invalid ? t(role.errorCode ?? 'modelRouteRequired') : t('modelRoute')}</p>
      </div>
      <div className={css.selectField}>
        <label className={css.fieldLabel} htmlFor={`${id}-model`}>{t('model')}</label>
        <select id={`${id}-model`} className={css.select} value={role.model}
          disabled={disabled || role.provider === ''} aria-invalid={invalid || undefined}
          onChange={(event) => { editRole(role.draftId, 'model', event.target.value) }}>
          <option value="">{t('modelSelectPlaceholder')}</option>
          {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
          {modelUnavailable
            ? <option value={role.model}>{`${role.model} (${t('modelUnavailable')})`}</option>
            : null}
        </select>
        <p className={css.hint}>{t('modelRouteHint')}</p>
      </div>
    </>
  )
}

/**
 * Reasoning-effort picker offering only the levels the selected model
 * advertises. A stored level the directory no longer lists stays selectable
 * so an offline provider does not silently erase the role's route.
 */
function EffortField({ role, state, t, disabled, editRole, invalid }: {
  readonly role: RoleDraftState
  readonly state: AgentRoleConfigState
  readonly t: Translate<AgentRoleConfigLocaleKey>
  readonly disabled: boolean
  readonly editRole: (id: string, field: RoleField, text: string) => void
  readonly invalid: boolean
}) {
  const id = useId()
  const model = state.catalogGroups
    .find(group => group.id === role.provider)?.models.find(candidate => candidate.id === role.model)
  const efforts = model?.reasoning?.efforts ?? []
  const supported = efforts.map(effort => effort.id)
  const unknown = role.reasoningEffort !== '' && !supported.includes(role.reasoningEffort)
  // No model, or a described model with nothing to offer, leaves no choice to
  // make. An undescribed route stays editable because the directory cannot
  // say what it accepts.
  const selectable = role.model !== '' && (model === undefined || efforts.length > 0 || unknown)
  const hint = role.model === ''
    ? t('effortSelectPlaceholder')
    : model !== undefined && efforts.length === 0 && !unknown ? t('effortNone') : t('effortHint')
  return (
    <div className={css.selectField}>
      <label className={css.fieldLabel} htmlFor={`${id}-effort`}>{t('reasoningEffort')}</label>
      <select id={`${id}-effort`} className={css.select} value={role.reasoningEffort}
        disabled={disabled || !selectable} aria-invalid={invalid || undefined}
        onChange={(event) => { editRole(role.draftId, 'reasoningEffort', event.target.value) }}>
        <option value="">{t('effortInherit')}</option>
        {efforts.map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
        {unknown ? <option value={role.reasoningEffort}>{`${role.reasoningEffort} (${t('modelUnavailable')})`}</option> : null}
      </select>
      <p className={css.hint}>{invalid ? t(role.errorCode ?? 'effortUnsupported') : hint}</p>
    </div>
  )
}
