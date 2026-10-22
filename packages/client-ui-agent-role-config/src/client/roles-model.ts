/**
 * Staged editor state for the Agent Roles catalog. The Host keeps the role
 * table as one volatile dictionary, so this page edits the complete table and
 * writes it back as one revision-fenced mutation rather than exposing one
 * settings field per role.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ModelCatalogModel, ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  SettingsFormPathOp, SettingsFormScope, SettingsFormScopeSnapshot, SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentRoleConfigLocaleKey } from './locales.ts'

/** Settings namespace registered by the `agent-roles` Loader row. */
export const AGENT_ROLES_NS = 'agent-roles'

/** Settings namespace registered by the `agent-roles` Loader row in the shipped bundle patch. */
export const AGENT_ROLE_CONFIG_BUNDLE = '@deepseek-ai/dsh-experimental-agent-role-profile'

/** Maximum code points in one role name, mirroring the catalog validator. */
const ROLE_NAME_MAX_LENGTH = 256
/** Maximum code points in one role label, mirroring the catalog validator. */
const ROLE_LABEL_MAX_LENGTH = 256
/** Maximum code points in one role description, mirroring the catalog validator. */
const ROLE_DESCRIPTION_MAX_LENGTH = 4096
/** Maximum declared tags in one role, mirroring the catalog validator. */
const ROLE_TAGS_MAX_COUNT = 16
/** Maximum code points in one tag, mirroring the catalog validator. */
const ROLE_TAG_MAX_LENGTH = 64
/** Maximum code points in a provider, preset, or model identifier. */
const IDENTIFIER_MAX_LENGTH = 256

/** Role names the runtime reserves for object prototype members. */
const RESERVED_ROLE_NAMES = new Set(['__proto__', 'prototype', 'constructor'])

/** Role names and identifiers that stay usable in one model-facing catalog line. */
const TOKEN_PATTERN = /^[^\s`"\\]+$/u

/** The two context modes a role may declare. */
export type RoleContext = 'fresh' | 'fork'

/** One role row as the page edits it. Every optional field is present as a draft string. */
export interface RoleDraft {
  /** Stable draft identity; the catalog key is what is saved. */
  readonly draftId: string
  /** Model-facing role name. */
  name: string
  /** Human-facing label. */
  label: string
  /** Optional one-line description. */
  description: string
  /** Comma-separated discovery tags. */
  tags: string
  /** `fresh` starts a new conversation; `fork` inherits the parent turns. */
  context: RoleContext
  /** Optional model provider. */
  provider: string
  /** Optional model id. */
  model: string
  /** Optional adapter-owned reasoning effort. */
  reasoningEffort: string
  /** Optional positive output-token cap. */
  maxTokens: string
  /** Optional agent preset id. */
  agentPreset: string
  /** Optional subagent provider id. */
  backingProvider: string
  /** Optional absolute delegation-depth cap. */
  delegationDepth: string
  /** Optional subagent capacity group. */
  capacityGroup: string
  /** Optional activation wall-clock budget in milliseconds. */
  wallClockMs: string
  /** Optional object JSON Schema, serialized for editing. */
  outputSchema: string
}

/** What one role draft renders, including blocking validation and a stable row key. */
export interface RoleDraftState extends RoleDraft {
  /** Localized validation message, or undefined when the draft can be saved. */
  error?: string
  /** Stable validation outcome that selects the affected control. */
  errorCode?: RoleValidationCode
  /** Draft field the validation outcome belongs to. */
  errorField?: RoleValidationField
}

/** Why a role draft cannot be saved. */
export type RoleValidationCode =
  | 'nameRequired' | 'nameInvalid' | 'nameDuplicate' | 'nameReserved' | 'nameTooLong'
  | 'labelRequired' | 'labelTooLong' | 'descriptionTooLong' | 'tagsInvalid'
  | 'modelRouteRequired' | 'identifierInvalid' | 'positiveInteger' | 'nonNegativeInteger'
  | 'presetForkConflict' | 'schemaInvalid' | 'schemaRoot' | 'effortUnsupported'

/** The control a role validation outcome marks invalid. */
export type RoleValidationField = RoleField | 'modelRoute'

/** What the page renders. */
export interface AgentRoleConfigState extends SettingsFormShell {
  /** Deployment fallback for roles that name no backing provider. */
  defaultBacking: string
  /** Whether the default backing provider came from a user override. */
  defaultBackingOverridden: boolean
  /** Whether the draft clears the user-layer override instead of writing the visible text. */
  defaultBackingCleared: boolean
  /** Whether the default backing provider draft is not a valid identifier. */
  defaultBackingInvalid: boolean
  /** Host model directories grouped by provider. */
  catalogGroups: readonly ModelProviderGroup[]
  /** Adapter-directory request state. */
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error'
  /** Whether at least one provider's directory request failed. */
  catalogPartial: boolean
  /** Host failure message from the last directory request. */
  catalogError: string | null
  /** Roles in catalog order. */
  roles: readonly RoleDraftState[]
}

/** Actions the slot registration injects. */
export interface AgentRoleConfigFace {
  /** Snapshot the renderer binds as `useAgentRoleConfig`. */
  hooks: { agentRoleConfig: SnapshotStore<AgentRoleConfigState> }
  /** Change the deployment fallback for roles without a backing provider. */
  editDefaultBacking: (text: string) => void
  /** Reset the deployment fallback to the inherited composition value. */
  resetDefaultBacking: () => void
  /** Add one draft role. */
  addRole: () => void
  /** Remove one draft role. */
  removeRole: (draftId: string) => void
  /** Change one field of one draft role. */
  editRole: (draftId: string, field: RoleField, text: string) => void
  /** Change one role's context mode. */
  setContext: (draftId: string, context: RoleContext) => void
  /** Select one provider, clearing a model the provider does not advertise. */
  setProvider: (draftId: string, provider: string) => void
  /** Retry the Host model directory. */
  retryCatalog: () => void
  /** Write every staged edit and clear the drafts on acceptance. */
  save: () => void
  /** Drop every staged edit. */
  discard: () => void
}

/** Draft fields the page edits as text. */
export type RoleField = Exclude<keyof RoleDraft, 'draftId' | 'context'>

/** The settings section this page edits. */
export interface AgentRoleSettings {
  roles?: Record<string, unknown>
  backingProvider?: string
}

/** The role definition the page writes back. */
type RolePayload = Record<string, unknown>

/** One read of the accepted section or the staged draft. */
interface CatalogDraft {
  readonly roles: readonly RoleDraft[]
  readonly defaultBacking: string
  readonly defaultBackingCleared: boolean
}

let nextDraftId = 0
/** @returns a fresh draft identity, process-local and not persisted. */
function draftId(): string {
  nextDraftId += 1
  return `role-${String(nextDraftId)}`
}

/** @param value - an untrusted value. @returns whether it is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param value - an untrusted setting. @returns the string when one is stored, otherwise an empty draft. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** @param value - an untrusted setting. @returns stored text or a stored number rendered for editing. */
function draftText(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

/** @param roles - an untrusted role table. @returns its entries in insertion order. */
function roleEntries(roles: unknown): [string, unknown][] {
  return isRecord(roles) ? Object.entries(roles) : []
}

/** @param definition - one configured role. @returns editable text for one nested model field. */
function modelText(definition: Record<string, unknown>, field: 'provider' | 'model' | 'reasoningEffort' | 'maxTokens'): string {
  return isRecord(definition.model) ? draftText(definition.model[field]) : ''
}

/** @param definition - one configured role. @returns its tags as a comma-separated draft. */
function tagsText(definition: Record<string, unknown>): string {
  return Array.isArray(definition.tags)
    ? definition.tags.filter((tag): tag is string => typeof tag === 'string').join(', ')
    : ''
}

/** @param definition - one configured role. @returns its nested execution budget as a draft. */
function budgetText(definition: Record<string, unknown>): string {
  return isRecord(definition.executionBudget) ? draftText(definition.executionBudget.wallClockMs) : ''
}

/** @param definition - one configured role. @returns its structured-output schema serialized for editing. */
function schemaText(definition: Record<string, unknown>): string {
  return definition.outputSchema === undefined ? '' : JSON.stringify(definition.outputSchema, undefined, 2)
}

/**
 * Convert one configured role into an editable draft.
 * @param name - catalog key.
 * @param definition - configured role definition.
 * @returns the draft row.
 */
function toDraft(name: string, definition: unknown): RoleDraft {
  const role = isRecord(definition) ? definition : {}
  return {
    draftId: draftId(),
    name,
    label: text(role.label),
    description: text(role.description),
    tags: tagsText(role),
    context: role.contextDefault === 'fork' ? 'fork' : 'fresh',
    provider: modelText(role, 'provider'),
    model: modelText(role, 'model'),
    reasoningEffort: modelText(role, 'reasoningEffort'),
    maxTokens: modelText(role, 'maxTokens'),
    agentPreset: text(role.agentPreset),
    backingProvider: text(role.backingProvider),
    delegationDepth: draftText(role.delegationDepth),
    capacityGroup: text(role.capacityGroup),
    wallClockMs: budgetText(role),
    outputSchema: schemaText(role),
  }
}

/** @returns an empty draft role. */
function emptyDraft(): RoleDraft {
  return {
    draftId: draftId(), name: '', label: '', description: '', tags: '', context: 'fresh',
    provider: '', model: '', reasoningEffort: '', maxTokens: '', agentPreset: '',
    backingProvider: '', delegationDepth: '', capacityGroup: '', wallClockMs: '', outputSchema: '',
  }
}

/** @param value - a draft string. @returns its trimmed text, or undefined when blank. */
function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** @param value - a draft identifier. @returns whether it satisfies the catalog's one-line rule. */
function validIdentifier(value: string): boolean {
  return value.length <= IDENTIFIER_MAX_LENGTH && TOKEN_PATTERN.test(value)
}

/** @param value - a draft integer. @returns whether it is a safe integer at or above a minimum. */
function validInteger(value: string, minimum: number): boolean {
  const trimmed = value.trim()
  const parsed = Number(trimmed)
  return trimmed !== '' && Number.isSafeInteger(parsed) && parsed >= minimum
}

/**
 * Reasoning levels one advertised model accepts.
 * @param groups - the Host model directory.
 * @param provider - a draft provider id.
 * @param model - a draft model id.
 * @returns the effort ids in escalation order, an empty list for a model that
 *   advertises no reasoning, or undefined when the directory does not
 *   describe the route, so the page cannot decide.
 */
function advertisedEfforts(
  groups: readonly ModelProviderGroup[],
  provider: string,
  model: string,
): readonly string[] | undefined {
  const entry: ModelCatalogModel | undefined = groups
    .find(group => group.id === provider)?.models.find(candidate => candidate.id === model)
  if (entry === undefined) return undefined
  return entry.reasoning?.efforts.map(effort => effort.id) ?? []
}

/** @param value - a string. @returns its code-point count. */
function codePoints(value: string): number {
  let count = 0
  for (const _point of value) count += 1
  return count
}

/**
 * Validate a catalog key before comparing it with other roles.
 * @param name - a trimmed draft name.
 * @returns the name-level blocker, or undefined when the key is well formed.
 */
function catalogNameError(name: string): RoleValidationCode | undefined {
  if (name === '') return 'nameRequired'
  if (codePoints(name) > ROLE_NAME_MAX_LENGTH) return 'nameTooLong'
  if (RESERVED_ROLE_NAMES.has(name)) return 'nameReserved'
  if (!TOKEN_PATTERN.test(name)) return 'nameInvalid'
  return undefined
}

/**
 * Find every well-formed role name used more than once.
 * @param roles - all staged roles in catalog order.
 * @returns names that collide with another staged role.
 */
function duplicateNames(roles: readonly RoleDraft[]): ReadonlySet<string> {
  const counts = new Map<string, number>()
  for (const role of roles) {
    const name = role.name.trim()
    if (catalogNameError(name) !== undefined) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name))
}

/**
 * Read the tag draft.
 * @param value - comma-separated tags.
 * @returns the tag list, or undefined when the draft violates the catalog rules.
 */
function parseTags(value: string): string[] | undefined {
  const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag !== '')
  if (tags.length > ROLE_TAGS_MAX_COUNT) return undefined
  const seen = new Set<string>()
  for (const tag of tags) {
    if (codePoints(tag) > ROLE_TAG_MAX_LENGTH || /\s/u.test(tag) || seen.has(tag)) return undefined
    seen.add(tag)
  }
  return tags
}

/**
 * Validate one role draft and convert it into the settings payload.
 * @param draft - the staged role.
 * @param duplicates - catalog keys used by more than one staged role.
 * @param groups - the Host model directory, used to reject a reasoning effort
 *   the selected model does not advertise.
 * @returns the payload, or the first blocker that prevents saving.
 */
function payloadOf(
  draft: RoleDraft,
  duplicates: ReadonlySet<string>,
  groups: readonly ModelProviderGroup[],
): { payload: RolePayload } | { code: RoleValidationCode; field: RoleValidationField } {
  const name = draft.name.trim()
  const nameError = catalogNameError(name)
  if (nameError !== undefined) return { code: nameError, field: 'name' }
  if (duplicates.has(name)) return { code: 'nameDuplicate', field: 'name' }
  const label = draft.label.trim()
  if (label === '') return { code: 'labelRequired', field: 'label' }
  if (codePoints(label) > ROLE_LABEL_MAX_LENGTH) return { code: 'labelTooLong', field: 'label' }
  if (codePoints(draft.description) > ROLE_DESCRIPTION_MAX_LENGTH) return { code: 'descriptionTooLong', field: 'description' }
  const tags = parseTags(draft.tags)
  if (tags === undefined) return { code: 'tagsInvalid', field: 'tags' }
  const provider = optional(draft.provider)
  const model = optional(draft.model)
  if ((provider === undefined) !== (model === undefined)) return { code: 'modelRouteRequired', field: 'modelRoute' }
  const reasoningEffort = optional(draft.reasoningEffort)
  const maxTokens = optional(draft.maxTokens)
  const agentPreset = optional(draft.agentPreset)
  const backingProvider = optional(draft.backingProvider)
  const delegationDepth = optional(draft.delegationDepth)
  const capacityGroup = optional(draft.capacityGroup)
  const wallClockMs = optional(draft.wallClockMs)
  const outputSchema = optional(draft.outputSchema)
  const identifiers: readonly [RoleField, string | undefined][] = [
    ['provider', provider],
    ['model', model],
    ['reasoningEffort', reasoningEffort],
    ['agentPreset', agentPreset],
    ['backingProvider', backingProvider],
    ['capacityGroup', capacityGroup],
  ]
  const invalidIdentifier = identifiers.find(([, value]) => value !== undefined && !validIdentifier(value))
  if (invalidIdentifier !== undefined) return { code: 'identifierInvalid', field: invalidIdentifier[0] }
  if (maxTokens !== undefined && !validInteger(maxTokens, 1)) return { code: 'positiveInteger', field: 'maxTokens' }
  if (delegationDepth !== undefined && !validInteger(delegationDepth, 0)) {
    return { code: 'nonNegativeInteger', field: 'delegationDepth' }
  }
  if (wallClockMs !== undefined && !validInteger(wallClockMs, 1)) return { code: 'positiveInteger', field: 'wallClockMs' }
  // Both fields live under `model`, so a draft that sets either without a
  // route would save nothing while looking applied.
  if (provider === undefined && (reasoningEffort !== undefined || maxTokens !== undefined)) {
    return { code: 'modelRouteRequired', field: 'modelRoute' }
  }
  if (provider !== undefined && model !== undefined && reasoningEffort !== undefined) {
    const efforts = advertisedEfforts(groups, provider, model)
    // An undescribed route keeps whatever it stores: the provider may be
    // offline here and still serve the model.
    if (efforts !== undefined && !efforts.includes(reasoningEffort)) {
      return { code: 'effortUnsupported', field: 'reasoningEffort' }
    }
  }
  if (agentPreset !== undefined && draft.context === 'fork') return { code: 'presetForkConflict', field: 'agentPreset' }
  let schema: unknown
  if (outputSchema !== undefined) {
    try {
      schema = JSON.parse(outputSchema) as unknown
    } catch (_error) {
      return { code: 'schemaInvalid', field: 'outputSchema' }
    }
    if (!isRecord(schema) || schema.type !== 'object') return { code: 'schemaRoot', field: 'outputSchema' }
  }
  const description = optional(draft.description)
  const payload: RolePayload = {
    label,
    ...description === undefined ? {} : { description },
    ...tags.length === 0 ? {} : { tags },
    ...provider === undefined || model === undefined ? {} : {
      model: {
        provider,
        model,
        ...reasoningEffort === undefined ? {} : { reasoningEffort },
        ...maxTokens === undefined ? {} : { maxTokens: Number(maxTokens) },
      },
    },
    ...agentPreset === undefined ? {} : { agentPreset },
    ...backingProvider === undefined ? {} : { backingProvider },
    contextDefault: draft.context,
    ...delegationDepth === undefined ? {} : { delegationDepth: Number(delegationDepth) },
    ...capacityGroup === undefined ? {} : { capacityGroup },
    ...wallClockMs === undefined ? {} : { executionBudget: { wallClockMs: Number(wallClockMs) } },
    ...schema === undefined ? {} : { outputSchema: schema },
  }
  return { payload }
}

/**
 * Bind the complete role table to one staged editor.
 *
 * A save writes the whole `roles` dictionary and the optional deployment
 * fallback under one expected revision. Replacing the dictionary lets a role
 * be renamed without leaving its previous key behind; every draft is validated
 * before the write, and a Host refusal keeps the drafts for correction.
 */
export class AgentRoleConfigController {
  private readonly store: SnapshotStore<AgentRoleConfigState>
  private staged: CatalogDraft | undefined
  private initial: CatalogDraft | undefined
  private acceptedValue: unknown
  private acceptedDraft: CatalogDraft | undefined
  private saving = false
  private failed = false
  private disposed = false
  private catalogGroups: readonly ModelProviderGroup[] = []
  private catalogStatus: AgentRoleConfigState['catalogStatus'] = 'idle'
  private catalogPartial = false
  private catalogError: string | null = null
  private catalogGeneration = 0
  private saveGeneration = 0
  private readonly unsubscribe: () => void

  /**
   * @param scope - the `agent-roles` settings section.
   * @param ctx - the browser plugin context, whose `remote.session` namespace
   * answers the Host model directory.
   * @param t - page dictionary reader for validation messages.
   */
  constructor(
    private readonly scope: SettingsFormScope<AgentRoleSettings>,
    private readonly ctx: ClientContext,
    private readonly t: Translate<AgentRoleConfigLocaleKey>,
  ) {
    this.store = createSnapshotStore(this.projection())
    this.unsubscribe = scope.subscribe(() => { this.publish() })
    void this.loadCatalog()
  }

  /**
   * Expose the page snapshot and every staged-edit action to the registered slot.
   * @returns the face the bundle page renders and mutates through.
   */
  inject(): AgentRoleConfigFace {
    return {
      hooks: { agentRoleConfig: this.store },
      editDefaultBacking: (value) => {
        this.edit(draft => ({ ...draft, defaultBacking: value, defaultBackingCleared: false }))
      },
      resetDefaultBacking: () => {
        const inherited = this.scope.getSnapshot().base
        this.edit(draft => ({
          ...draft,
          defaultBacking: isRecord(inherited) ? text(inherited.backingProvider) : '',
          defaultBackingCleared: true,
        }))
      },
      addRole: () => {
        this.edit(draft => ({ ...draft, roles: [...draft.roles, emptyDraft()] }))
      },
      removeRole: (id) => {
        this.edit(draft => ({ ...draft, roles: draft.roles.filter(role => role.draftId !== id) }))
      },
      editRole: (id, field, value) => {
        this.edit(draft => ({
          ...draft,
          roles: draft.roles.map(role => role.draftId === id
            ? field === 'model' ? this.withSupportedEffort({ ...role, model: value }) : { ...role, [field]: value }
            : role),
        }))
      },
      setContext: (id, context) => {
        this.edit(draft => ({
          ...draft,
          roles: draft.roles.map(role => role.draftId === id ? { ...role, context } : role),
        }))
      },
      setProvider: (id, provider) => {
        this.edit(draft => ({
          ...draft,
          roles: draft.roles.map((role) => {
            if (role.draftId !== id) return role
            const models = this.catalogGroups.find(group => group.id === provider)?.models
            const keepModel = role.provider === provider
              || (provider !== '' && models?.some(model => model.id === role.model) === true)
            return this.withSupportedEffort({ ...role, provider, model: keepModel ? role.model : '' })
          }),
        }))
      },
      retryCatalog: () => { void this.loadCatalog() },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged === undefined && !this.failed) return
        this.staged = undefined
        this.initial = undefined
        this.failed = false
        this.publish()
      },
    }
  }

  /** Release the accepted-value subscription. */
  dispose(): void {
    this.disposed = true
    this.catalogGeneration += 1
    this.saveGeneration += 1
    this.unsubscribe()
  }

  /** Invalidate the model directory and request it again after a Host model change. */
  refreshCatalog(): void {
    if (this.disposed) return
    this.catalogGeneration += 1
    this.catalogStatus = 'idle'
    this.catalogPartial = false
    this.catalogError = null
    void this.loadCatalog()
  }

  /** Discard directory results from the previous connection and reload them. */
  resetConnection(): void {
    if (this.disposed) return
    this.catalogGroups = []
    this.refreshCatalog()
  }

  private async loadCatalog(): Promise<void> {
    if (this.disposed || this.catalogStatus === 'loading') return
    const generation = this.catalogGeneration
    this.catalogStatus = 'loading'
    this.catalogPartial = false
    this.catalogError = null
    this.publish()
    try {
      const response = await this.ctx.remote.session.modelCatalog()
      if (generation !== this.catalogGeneration) return
      if (response.ok) {
        this.catalogGroups = response.value.groups
        this.catalogPartial = response.value.failures.length > 0
        this.catalogStatus = 'ready'
      } else {
        this.catalogStatus = 'error'
        this.catalogError = response.error.message
      }
    } catch (error) {
      if (generation !== this.catalogGeneration) return
      this.catalogStatus = 'error'
      this.catalogError = error instanceof Error ? error.message : String(error)
    }
    this.publish()
  }

  /**
   * Validate every draft and write the catalog with one revision fence.
   * @returns settlement after the Host answer and recovery read.
   */
  async save(): Promise<void> {
    const ops = this.plan()
    if (ops === undefined || this.saving || this.disposed || !this.scope.getSnapshot().writable) return
    const generation = this.saveGeneration
    this.saving = true
    this.failed = false
    this.publish()
    try {
      const landed = await this.scope.mutate(ops, this.scope.getSnapshot().revision)
      if (generation !== this.saveGeneration) return
      if (landed) {
        this.staged = undefined
        this.initial = undefined
      }
      this.failed = !landed
    } catch (_error) {
      if (generation !== this.saveGeneration) return
      this.failed = true
    } finally {
      if (generation === this.saveGeneration) {
        this.saving = false
        this.publish()
      }
    }
  }

  /**
   * Stage one edit over the accepted values.
   * @param change - draft transformation.
   */
  private edit(change: (draft: CatalogDraft) => CatalogDraft): void {
    const base = this.staged ?? this.accepted()
    this.initial ??= base
    this.staged = change(base)
    this.failed = false
    this.publish()
  }

  /** @returns the currently displayed list, built from accepted values and staged edits. */
  private current(): CatalogDraft {
    return this.staged ?? this.accepted()
  }

  /**
   * Clear a stored reasoning effort the newly selected model does not
   * advertise, so an edit cannot leave a route the model refuses. A route the
   * directory does not describe keeps its text.
   * @param role - the draft after a provider or model change.
   * @returns the draft with a supported effort, or an empty one.
   */
  private withSupportedEffort(role: RoleDraft): RoleDraft {
    const effort = optional(role.reasoningEffort)
    const provider = optional(role.provider)
    const model = optional(role.model)
    // An effort lives under `model`, so a draft without a complete route has
    // nowhere to store it and the page would drop it on save.
    if (effort === undefined) return role
    if (provider === undefined || model === undefined) return { ...role, reasoningEffort: '' }
    const efforts = advertisedEfforts(this.catalogGroups, provider, model)
    return efforts === undefined || efforts.includes(effort) ? role : { ...role, reasoningEffort: '' }
  }

  /** @returns one draft list read from the accepted section. */
  private accepted(): CatalogDraft {
    const snapshot: SettingsFormScopeSnapshot<AgentRoleSettings> = this.scope.getSnapshot()
    if (this.acceptedDraft !== undefined && Object.is(this.acceptedValue, snapshot.value)) return this.acceptedDraft
    const section = isRecord(snapshot.value) ? snapshot.value : {}
    this.acceptedValue = snapshot.value
    this.acceptedDraft = {
      roles: roleEntries(section.roles).map(([name, definition]) => toDraft(name, definition)),
      defaultBacking: text(section.backingProvider),
      defaultBackingCleared: false,
    }
    return this.acceptedDraft
  }

  /**
   * Validate every draft into render state.
   * @returns the drafts and their first blocking message.
   */
  private roleStates(): RoleDraftState[] {
    const roles = this.current().roles
    const duplicates = duplicateNames(roles)
    return roles.map((role) => {
      const outcome = payloadOf(role, duplicates, this.catalogGroups)
      if ('code' in outcome) {
        return { ...role, error: this.t(outcome.code), errorCode: outcome.code, errorField: outcome.field }
      }
      return role
    })
  }

  /**
   * @returns the writes a save performs, or undefined while blocked or unchanged.
   */
  private plan(): SettingsFormPathOp[] | undefined {
    const snapshot = this.scope.getSnapshot()
    if (snapshot.status !== 'ready' || this.staged === undefined || this.initial === undefined) return undefined
    const states = this.roleStates()
    if (states.some(role => role.error !== undefined)) return undefined
    const defaultBacking = optional(this.current().defaultBacking)
    if (defaultBacking !== undefined && !validIdentifier(defaultBacking)) return undefined
    const current = this.current()
    const rolesChanged = JSON.stringify(current.roles) !== JSON.stringify(this.initial.roles)
    const backingChanged = current.defaultBacking !== this.initial.defaultBacking
      || current.defaultBackingCleared !== this.initial.defaultBackingCleared
    if (!rolesChanged && !backingChanged) return undefined
    const ops: SettingsFormPathOp[] = []
    if (rolesChanged) {
      const roles: Record<string, RolePayload> = {}
      const duplicates = duplicateNames(states)
      for (const role of states) {
        // Every row was validated above; payloadOf repeats the conversion for storage.
        roles[role.name.trim()] = (payloadOf(role, duplicates, this.catalogGroups) as { payload: RolePayload }).payload
      }
      ops.push({ op: 'set', path: ['roles'], value: roles })
    }
    if (backingChanged) {
      ops.push(current.defaultBackingCleared || defaultBacking === undefined
        ? { op: 'unset', path: ['backingProvider'] }
        : { op: 'set', path: ['backingProvider'], value: defaultBacking })
    }
    return ops
  }

  /** Rebuild and publish the projection. */
  private projection(): AgentRoleConfigState {
    const snapshot = this.scope.getSnapshot()
    const current = this.current()
    const user = isRecord(snapshot.user) ? snapshot.user : {}
    const defaultBacking = optional(current.defaultBacking)
    const states = this.roleStates()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.plan() !== undefined,
      invalid: states.some(role => role.error !== undefined)
        || (defaultBacking !== undefined && !validIdentifier(defaultBacking)),
      saving: this.saving,
      failed: this.failed,
      defaultBacking: current.defaultBacking,
      defaultBackingOverridden: !current.defaultBackingCleared && defaultBacking !== undefined
        && Object.hasOwn(user, 'backingProvider'),
      defaultBackingCleared: current.defaultBackingCleared,
      defaultBackingInvalid: defaultBacking !== undefined && !validIdentifier(defaultBacking),
      catalogGroups: this.catalogGroups,
      catalogStatus: this.catalogStatus,
      catalogPartial: this.catalogPartial,
      catalogError: this.catalogError,
      roles: states,
    }
  }

  private publish(): void {
    if (this.disposed) return
    this.store.set(this.projection())
  }
}
