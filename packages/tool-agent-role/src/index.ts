/**
 * Model-facing delegation through the declared Agent Role catalog: the model
 * names a role, this tool resolves it with `ctx.agentRoles`, and a subagent
 * provider selected for the role's context mode starts the child.
 *
 * The catalog owns role definition (model route, Agent Preset, context mode,
 * delegation depth); this package owns the translation from a resolved role
 * into `ctx.subagents.startActivation` fields and the provider choice. A fresh
 * role starts without the parent's turns and may select an independent Agent
 * Preset; a fork role inherits the parent's turns and composition and cannot
 * select a preset. The tool returns the activation identity immediately and
 * the Subagent runtime delivers the result when the child finishes.
 *
 * @module @deepseek-ai/dsh-experimental-tool-agent-role
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { AgentRoleError, summarizeRole } from '@deepseek-ai/dsh-experimental-agent-role'
import type { AgentRoleErrorCode } from '@deepseek-ai/dsh-experimental-agent-role'
import type { InvalidRole, ResolvedRole, RoleSnapshot, RoleSummary } from '@deepseek-ai/dsh-experimental-agent-role'
import { LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { SubagentCapabilities, SubagentExecutionBudget, SubagentProvider } from '@deepseek-ai/dsh-subagent'
import { assertSubagentMaxDepth, delegationDepthOf } from '@deepseek-ai/dsh-subagent'
import { defineTool, parameterSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type {
  JsonSchemaNode,
  ParameterJsonSchema,
  ParameterSchemaSpec,
  ToolDefinition,
} from '@deepseek-ai/dsh-tools'

export const name = 'tool-agent-role'
/** Services required by the role delegation tool. */
export const inject = ['agentRoles', 'subagents', 'tools']

/** Maximum code points accepted in a model-supplied role name. */
const ROLE_NAME_MAX_LENGTH = 256
/** Maximum code points accepted in a model-supplied child label. */
const ROLE_LABEL_MAX_LENGTH = 256
/** Maximum code points accepted in a discovery query. */
const QUERY_MAX_LENGTH = 512
/** Maximum code points accepted in a configured model-facing tool name. */
const TOOL_NAME_MAX_LENGTH = 256
/** Characters safe to emit as a tool name to every supported provider. */
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/u
/** Maximum code points accepted in a configured subagent provider name. */
const PROVIDER_NAME_MAX_LENGTH = 256
/** Provider names are rendered in role errors and catalog rows as one token. */
const PROVIDER_NAME_PATTERN = /^[^\s`"\\]+$/u
/** Maximum rendered characters in one paged discovery result. */
const ROLE_DISCOVERY_MAX_CHARS = 16384
/** Marker appended when an exact-role description exceeds the discovery budget. */
const ROLE_DESCRIPTION_TRUNCATION = '… (description truncated)'
/** Maximum code points retained from a live-refresh failure for discovery. */
const CATALOG_STALE_REASON_MAX_LENGTH = 512
/** Maximum code points retained from a role-scoped upstream failure. */
const ROLE_PROBLEM_MAX_LENGTH = 2048
/** Marker appended when a live-refresh failure is shortened for discovery. */
const CATALOG_STALE_TRUNCATION = '…'

/**
 * Test whether a model-supplied string exceeds a protocol character limit.
 * Iteration counts Unicode code points, matching JSON Schema `maxLength`.
 * @param value - candidate string.
 * @param maxLength - maximum accepted code points.
 * @returns whether the string is too long.
 */
function exceedsCharacterLimit(value: string, maxLength: number): boolean {
  let count = 0
  for (const _codePoint of value) {
    count += 1
    if (count > maxLength) return true
  }
  return false
}

/**
 * Truncate a string to a maximum number of Unicode code points without
 * splitting a surrogate pair.
 * @param value - candidate string.
 * @param maxLength - maximum accepted code points.
 * @returns the original string or a code-point-safe prefix.
 */
function truncateCodePoints(value: string, maxLength: number): string {
  let result = ''
  let count = 0
  for (const codePoint of value) {
    if (count === maxLength) break
    result += codePoint
    count += 1
  }
  return result
}

/**
 * Reject one model-supplied argument above its protocol character limit.
 * @param value - candidate value, or undefined when the argument is omitted.
 * @param field - argument name used in the failure message.
 * @param maxLength - maximum accepted code points.
 * @throws Error naming the argument and limit, without echoing its value.
 */
function assertCharacterLimit(value: string | undefined, field: string, maxLength: number): void {
  if (value === undefined || !exceedsCharacterLimit(value, maxLength)) return
  throw new Error(`${field} exceeds ${maxLength} characters`)
}

/**
 * Reject a configured model-facing name that cannot identify a tool.
 * @param value - configured tool name.
 * @param field - setting name used in the failure message.
 * @throws Error when the name is blank or above the protocol limit.
 */
function assertConfiguredToolName(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`tool-agent-role: ${field} must be a non-empty string`)
  }
  if (exceedsCharacterLimit(value, TOOL_NAME_MAX_LENGTH)) {
    throw new Error(`tool-agent-role: ${field} must not exceed ${TOOL_NAME_MAX_LENGTH} characters`)
  }
  if (!TOOL_NAME_PATTERN.test(value)) {
    throw new Error(
      `tool-agent-role: ${field} may contain only ASCII letters, digits, underscores, dots, and hyphens`,
    )
  }
}

/**
 * Reject a configured provider name that would escape one error or catalog
 * line, or that exceeds the same bound the catalog applies to role-owned
 * identifiers.
 * @param value - configured provider name.
 * @param field - setting name used in the failure message.
 * @throws Error when the name is blank, unsafe inline, or above the limit.
 */
function assertConfiguredProviderName(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`tool-agent-role: ${field} must be a non-empty string`)
  }
  if (exceedsCharacterLimit(value, PROVIDER_NAME_MAX_LENGTH)) {
    throw new Error(`tool-agent-role: ${field} must not exceed ${PROVIDER_NAME_MAX_LENGTH} characters`)
  }
  if (!PROVIDER_NAME_PATTERN.test(value)) {
    throw new Error(
      `tool-agent-role: ${field} must not contain whitespace, backticks, quotes, or backslashes`,
    )
  }
}

/**
 * Collapse a live-refresh failure into a bounded, single-line discovery reason.
 * @param error - failure thrown while reading or rendering the live catalog.
 * @param maxLength - maximum code points in the returned reason.
 * @returns the normalized failure message.
 */
function catalogStaleReason(error: unknown, maxLength: number): string {
  return boundedFailure(error instanceof Error ? error.message : String(error), maxLength)
}

/**
 * Collapse one upstream failure into a bounded single line.
 * @param value - failure text.
 * @param maxLength - maximum retained code points.
 * @returns the normalized, bounded failure.
 */
function boundedFailure(value: string, maxLength = ROLE_PROBLEM_MAX_LENGTH): string {
  const message = oneLine(value)
  if (!exceedsCharacterLimit(message, maxLength)) return message
  if (maxLength <= CATALOG_STALE_TRUNCATION.length) return truncateCodePoints(message, maxLength)
  return `${truncateCodePoints(message, maxLength - CATALOG_STALE_TRUNCATION.length)}${CATALOG_STALE_TRUNCATION}`
}

/**
 * Await one promise only while the caller's signal is live. The upstream
 * preset registry has no cancellation channel, so this stops waiting but does
 * not cancel its diagnostic; the listener is removed on either settlement to
 * avoid retaining the caller's signal for the process lifetime.
 * @param pending - the operation to await.
 * @param signal - tool-call cancellation.
 * @returns the operation's value when it settles before cancellation.
 * @throws the signal reason when cancellation wins the race.
 */
function awaitAbortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup()
      reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)))
    }
    const cleanup = (): void => { signal.removeEventListener('abort', onAbort) }
    signal.addEventListener('abort', onAbort, { once: true })
    pending.then(
      (value) => { cleanup(); resolve(value) },
      (error: unknown) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))) },
    )
  })
}

/**
 * Compile parameter schemas with JSON Schema `maxLength` annotations the
 * value-schema DSL does not express. The raw schema still passes through the
 * DSL's enforced subset before the annotations are added.
 * @param spec - per-property parameter definitions.
 * @param limits - maximum code points by parameter name.
 * @returns the compiled schema carrying the requested limits.
 */
function boundedParameterSchema(
  spec: ParameterSchemaSpec,
  limits: Readonly<Record<string, number>>,
): ParameterJsonSchema {
  const schema: ParameterJsonSchema = parameterSchemaSpecToJsonSchema(spec)
  for (const [name, maxLength] of Object.entries(limits)) {
    const property = schema.properties[name]
    if (property === undefined || property.type !== 'string') {
      throw new Error(`tool-agent-role: parameter "${name}" must be a string to bound`)
    }
    const bounded: JsonSchemaNode & { maxLength: number } = { ...property, maxLength }
    schema.properties[name] = bounded
  }
  return schema
}

/** Tool configuration. */
export interface Config {
  /** Model-facing tool name (default `role_agent`). */
  readonly toolName?: string
  /** Model-facing discovery tool name (default `list_agent_roles`). */
  readonly discoveryToolName?: string
  /**
   * Optional provider override for a fresh role that declares no
   * `backingProvider`. Omitted uses the role catalog's deployment
   * `backingProvider`; a role-level `backingProvider` wins over this setting.
   */
  readonly freshProvider?: string
  /** Provider used by a fork role that declares no `backingProvider` (default `fork`). */
  readonly forkProvider?: string
  /**
   * Depth policy for roles that declare no `delegationDepth`: a numeric cap, or
   * `provider-managed` to leave recursion enforcement to the provider. Omit to
   * use the Host subagent setting.
   */
  readonly maxDepth?: number | 'provider-managed'
  /**
   * Maximum number of declared roles the catalog may contain. Loading fails
   * above this limit; a live edit above it keeps the previous tool definition
   * and logs the rejection. Default `64`.
   */
  readonly maxRoles?: number
  /**
   * Maximum character count of the inline role index appended to the
   * `role_agent` description. Above this limit the description points to
   * the configured discovery tool instead of inlining the catalog; every role
   * remains callable. Default `8192`.
   */
  readonly maxCatalogChars?: number
  /** Maximum role rows one discovery page returns (default `50`). */
  readonly discoveryPageSize?: number
  /** Maximum concurrent startup checks in one discovery call (default `4`). */
  readonly discoveryHealthConcurrency?: number
}

export const Config: z<Config> = z.object({
  toolName: z.string().min(1).default('role_agent'),
  discoveryToolName: z.string().min(1).default('list_agent_roles'),
  freshProvider: z.string().min(1),
  forkProvider: z.string().min(1).default('fork'),
  maxDepth: z.union([z.natural().max(Number.MAX_SAFE_INTEGER), z.const('provider-managed' as const)]),
  maxRoles: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64),
  maxCatalogChars: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8192),
  discoveryPageSize: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(50),
  discoveryHealthConcurrency: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(4),
})

/** Resolved catalog capacity limits. */
interface CatalogLimits {
  /** Maximum advertised role count. */
  readonly maxRoles: number
  /** Maximum rendered catalog character count. */
  readonly maxCatalogChars: number
}

/** The activation result one role tool call returns. */
interface RoleActivation {
  /** Discriminator shared with the generic subagent tool. */
  readonly kind: 'activation'
  /** The child Session id. */
  readonly subagentId: string
  /** The declared role that produced this child. */
  readonly role: string
  /** Whether the child started fresh or inherited the parent's completed turns. */
  readonly context: 'fresh' | 'fork'
  /** The registered subagent provider used to start the child. */
  readonly provider: string
  /** The role's model route, when it declares one. */
  readonly model?: string
  /** The role's Agent Preset id, when it declares one. */
  readonly agentPreset?: string
}

/** Human-readable feature name for one missing provider capability. */
const CAPABILITY_FEATURE: Readonly<Record<keyof SubagentCapabilities, string>> = {
  agentOptions: 'a child model route (`agentOptions`)',
  agentPreset: 'an independent Agent Preset (`agentPreset`)',
  outputSchema: 'a structured output schema (`outputSchema`)',
  depthLimit: 'a delegation depth cap (`depthLimit`)',
}

/**
 * Build the failure for a name that is not in the catalog, naming the roles
 * this deployment does declare.
 * @param snapshot - the catalog snapshot that established the name is absent.
 * @param roleName - the model-supplied role name.
 * @param discoveryToolName - the discovery tool named in the recovery hint.
 * @param cause - the catalog's original failure, when one exists.
 * @returns the structured unknown-role failure.
 */
function unknownRole(
  snapshot: RoleSnapshot,
  roleName: string,
  discoveryToolName: string,
  cause?: unknown,
): AgentRoleError {
  const declared = [...snapshot.roles, ...snapshot.invalid].map(role => role.name)
  const shown = declared.slice(0, 12).map(oneLine).join(', ')
  const omitted = declared.length > 12 ? `, and ${declared.length - 12} more (${declared.length} declared)` : ''
  const requested = truncateCodePoints(oneLine(roleName), 120)
  const message = declared.length === 0
    ? `unknown agent role "${requested}"; this deployment declares no roles`
    : `unknown agent role "${requested}"; declared roles: ${shown}${omitted}. `
      + `Use \`${discoveryToolName}\` to inspect the role catalog`
  return new AgentRoleError(message, 'ROLE_UNKNOWN', cause === undefined ? undefined : { cause })
}

/**
 * Resolve one declared role, translating the catalog's unknown-name failure
 * into a message that names the roles this deployment does declare. The
 * explicit membership check also prevents prototype keys such as `constructor`
 * from reaching a table lookup as if they were role names.
 * @param ctx - context carrying the Agent Role catalog.
 * @param roleName - the model-supplied role name.
 * @param discoveryToolName - the discovery tool named in the recovery hint.
 * @returns the resolved role snapshot.
 * @throws AgentRoleError `ROLE_INVALID_CONFIG` when the catalog holds an
 *   invalid declaration under this name, or `ROLE_UNKNOWN` when it holds none.
 */
function resolveRole(ctx: Context, roleName: string, discoveryToolName: string): ResolvedRole {
  const snapshot = ctx.agentRoles.snapshot()
  const role = snapshot.roles.find(entry => entry.name === roleName)
  if (role !== undefined) return role
  const invalid = snapshot.invalid.find(entry => entry.name === roleName)
  if (invalid !== undefined) throw new AgentRoleError(invalid.message, invalid.code)
  throw unknownRole(snapshot, roleName, discoveryToolName)
}

/**
 * Build the child Agent options a role binds.
 * @param role - the resolved role.
 * @param provider - the selected backend whose route defaults may fill an omission.
 * @returns detached Agent options carrying the role's model route.
 */
function agentOptionsFor(role: ResolvedRole, backend: SubagentProvider): AgentOptions {
  const model = role.model
  if (model === undefined) {
    return backend.agentRouteDefaults === undefined || !backend.capabilities.agentOptions
      ? {}
      : { ...backend.agentRouteDefaults }
  }
  const { provider, reasoningEffort, maxTokens } = model
  return {
    provider,
    model: model.model,
    ...reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) },
    ...maxTokens === undefined ? {} : { maxTokens },
  }
}

/**
 * The provider capabilities one role's start request requires, in the same
 * fields `@deepseek-ai/dsh-subagent` validates before a child is prepared.
 * The caller resolves the effective depth cap first, so `provider-managed`
 * leaves `depthLimit` unrequired.
 * @param role - the resolved role whose request is about to start.
 * @param maxDepth - the effective delegation cap, or undefined when the provider enforces it.
 * @returns the capability keys the backing provider must support.
 */
function requiredCapabilities(role: ResolvedRole, maxDepth: number | undefined): (keyof SubagentCapabilities)[] {
  const required: (keyof SubagentCapabilities)[] = []
  if (role.model !== undefined) required.push('agentOptions')
  if (role.agentPreset !== undefined) required.push('agentPreset')
  if (maxDepth !== undefined) required.push('depthLimit')
  if (role.outputSchema !== undefined) required.push('outputSchema')
  return required
}

/**
 * Reject a start whose role needs capabilities its backing provider lacks.
 * The subagent service enforces the same rule; this preflight reports the role
 * name and the missing feature instead of a bare capability key.
 * @param role - the resolved role.
 * @param provider - the role's registered backing provider.
 * @param maxDepth - the effective delegation cap, or undefined when the provider enforces it.
 * @throws AgentRoleError naming the role, the provider, and every missing feature.
 */
function assertProviderCapabilities(
  role: ResolvedRole,
  provider: SubagentProvider,
  maxDepth: number | undefined,
): void {
  const missing = requiredCapabilities(role, maxDepth).filter(capability => !provider.capabilities[capability])
  if (missing.length === 0) return
  const features = missing.map(capability => CAPABILITY_FEATURE[capability]).join(', ')
  throw new AgentRoleError(
    `agent role "${role.name}" needs ${features}, but its provider `
    + `"${provider.name}" does not support ${missing.length === 1 ? 'that capability' : 'those capabilities'}`,
    'ROLE_INVALID_CONFIG',
  )
}

/**
 * Choose the provider that realizes a role's context mode and verify the
 * provider and role agree on whether the child inherits the parent's turns.
 * An explicit role `backingProvider` wins over this tool's `freshProvider` or
 * `forkProvider`; a fresh role without either falls back to the catalog's
 * deployment `backingProvider`.
 * @param role - the resolved role.
 * @param providerName - the provider selected for the role.
 * @param ctx - context carrying the subagent registry.
 * @returns the registered provider.
 * @throws AgentRoleError when the provider is missing or contradicts the context mode.
 */
function resolveProvider(ctx: Context, role: ResolvedRole, providerName: string): SubagentProvider {
  const provider = ctx.subagents.getProvider(providerName)
  if (provider === undefined) {
    throw new AgentRoleError(
      `agent role "${role.name}" delegates through subagent provider "${providerName}" `
      + `for context "${role.context}", which is not registered`,
      'ROLE_INVALID_CONFIG',
    )
  }
  const wantsInheritedContext = role.context === 'fork'
  if (provider.inheritsParentContext === wantsInheritedContext) return provider
  throw new AgentRoleError(
    `agent role "${role.name}" declares context "${role.context}", but provider "${provider.name}" `
    + `inherits the parent context (${provider.inheritsParentContext}); `
    + (wantsInheritedContext
      ? 'a fork role requires a provider that inherits the parent context'
      : 'a fresh role requires a provider that does not inherit the parent context'),
    'ROLE_INVALID_CONFIG',
  )
}

/**
 * Resolve the provider a role uses and reject one that contradicts its context
 * mode or lacks a capability the role needs. The model-facing tool calls this
 * for each invocation; loading also uses it to fail before the first call.
 * @param ctx - context carrying the subagent registry.
 * @param role - the resolved role.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param maxDepth - the effective delegation cap, or undefined when the provider enforces it.
 * @returns the registered provider that realizes the role.
 */
function requireRoleProvider(
  ctx: Context,
  role: ResolvedRole,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  maxDepth: number | undefined,
): SubagentProvider {
  const providerName = selectedProviderName(role, freshProvider, forkProvider, catalogFallback)
  const provider = resolveProvider(ctx, role, providerName)
  if (role.agentPreset !== undefined && provider.inheritsParentContext) {
    throw new AgentRoleError(
      `agent role "${role.name}" declares agentPreset "${role.agentPreset}", but provider `
      + `"${provider.name}" inherits the parent context; Agent Presets require a fresh provider`,
      'ROLE_INVALID_CONFIG',
    )
  }
  assertProviderCapabilities(role, provider, maxDepth)
  return provider
}

/**
 * Validate every declared role whose provider is currently registered. A role
 * whose explicit or configured provider is absent stays unvalidated until that
 * provider registers, so load order between the catalog and its backends does
 * not decide whether the composition loads.
 * @param ctx - context carrying the role catalog and subagent registry.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param maxDepth - depth policy for roles without their own cap.
 */
function validateDeclaredRoles(
  ctx: Context,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  maxDepth: number | 'provider-managed' | undefined,
): void {
  for (const role of ctx.agentRoles.snapshot().roles) {
    const providerName = selectedProviderName(role, freshProvider, forkProvider, catalogFallback)
    if (ctx.subagents.getProvider(providerName) === undefined) continue
    assertRoleContext(role)
    requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, effectiveMaxDepth(ctx, role, maxDepth))
  }
}

/**
 * Report a provider that cannot satisfy roles already using it, without
 * throwing from the provider registration effect. Registration owns the
 * provider lifecycle; a role misconfiguration must not roll back a provider
 * that other consumers can use.
 * @param ctx - context carrying the role catalog, subagent registry, and logger.
 * @param provider - the provider that just registered.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param maxDepth - depth policy for roles without their own cap.
 */
function reportProviderRoleConflicts(
  ctx: Context,
  provider: SubagentProvider,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  maxDepth: number | 'provider-managed' | undefined,
): void {
  try {
    for (const role of ctx.agentRoles.snapshot().roles) {
      const providerName = selectedProviderName(role, freshProvider, forkProvider, catalogFallback)
      if (providerName !== provider.name) continue
      assertRoleContext(role)
      requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, effectiveMaxDepth(ctx, role, maxDepth))
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.logger.warn(message)
  }
}

/**
 * Resolve the delegation cap a role's start will carry.
 * @param ctx - context carrying the subagent registry.
 * @param role - the resolved role.
 * @param maxDepth - the tool's depth policy for roles without their own cap.
 * @returns the numeric cap, or undefined when the provider enforces depth.
 */
function effectiveMaxDepth(
  ctx: Context,
  role: ResolvedRole,
  maxDepth: number | 'provider-managed' | undefined,
): number | undefined {
  return ctx.subagents.resolveMaxDepth(role.delegationDepth ?? maxDepth)
}

/**
 * Reject a child depth the caller's current depth already exceeds. The
 * subagent runtime applies the same comparison when it starts the child, but
 * discovery must report it against the caller that is asking, not merely echo
 * the declared cap.
 * @param role - the resolved role.
 * @param maxDepth - the effective numeric cap, or undefined when the provider enforces it.
 * @param parent - the agent asking for the role, when a caller is known.
 * @throws AgentRoleError when the child would exceed the cap.
 */
function assertDepthAvailable(role: ResolvedRole, maxDepth: number | undefined, parent: Agent | undefined): void {
  if (maxDepth === undefined || parent === undefined) return
  const childDepth = delegationDepthOf(parent) + 1
  if (childDepth <= maxDepth) return
  throw new AgentRoleError(
    `agent role "${role.name}" permits delegation depth ${maxDepth}, but the child would start at depth ${childDepth}`,
    'ROLE_INVALID_CONFIG',
  )
}

/**
 * Resolve the registered provider name a role delegates through.
 * @param role - the resolved role.
 * @param freshProvider - provider used by a fresh role without an explicit backend.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @returns the explicit backing provider, the configured provider for the role's context, or the catalog fallback.
 */
function selectedProviderName(
  role: ResolvedRole,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
): string {
  if (role.backingProvider !== undefined) return role.backingProvider
  if (role.context === 'fork') return forkProvider
  return freshProvider ?? catalogFallback()
}

/**
 * Reject a fork role that selects an independent Agent Preset. The catalog
 * rejects this combination on read; the explicit check keeps a call and its
 * health diagnosis aligned even if a live table bypasses that validation.
 * @param role - the resolved role.
 * @throws AgentRoleError when a fork role declares an Agent Preset.
 */
function assertRoleContext(role: ResolvedRole): void {
  if (role.context !== 'fork' || role.agentPreset === undefined) return
  throw new AgentRoleError(
    `agent role "${role.name}" declares agentPreset "${role.agentPreset}" with context "fork"; `
    + 'Agent Presets require a fresh role. Remove agentPreset or set contextDefault: fresh.',
    'ROLE_INVALID_CONFIG',
  )
}

/** Model-facing catalog text and the declared names it indexes. */
interface CatalogSummary {
  /** Suffix appended to the delegation tool description. */
  readonly description: string
  /** Declared role names, used for capacity checks and refresh detection. */
  readonly names: string[]
}

/**
 * Validate the declared role count against the configured capacity limit.
 * @param catalog - rendered role text and names.
 * @param limits - resolved capacity limits.
 * @throws Error naming the exceeded limit.
 */
function assertCatalogFits(catalog: CatalogSummary, limits: CatalogLimits): void {
  if (catalog.names.length > limits.maxRoles) {
    throw new Error(
      `tool-agent-role: the catalog declares ${catalog.names.length} roles, above maxRoles ${limits.maxRoles}; `
      + 'remove roles or raise maxRoles',
    )
  }
}

/**
 * Render the declared roles for model selection. Prefer one fact-rich row per
 * role; when that exceeds the character budget, fall back to a compact
 * name-and-label index. When even that index exceeds the budget, point to the
 * discovery tool instead of rejecting the catalog: all roles stay callable
 * through runtime name resolution.
 * @param roles - catalog rows in name order.
 * @param maxChars - maximum rendered catalog length.
 * @param discoveryToolName - configured discovery tool named in fallback text.
 * @returns catalog text and the names it advertises.
 */
function catalogSummary(roles: readonly RoleSummary[], maxChars: number, discoveryToolName: string): CatalogSummary {
  if (roles.length === 0) {
    return { description: ' This deployment declares no agent roles.', names: [] }
  }
  const detailed = roles.map((role) => {
    const facts = [
      role.description ?? role.label,
      role.context === 'fork' ? 'fork context' : 'fresh context',
      role.structuredOutput ? 'structured result' : undefined,
      role.agentPreset === undefined ? undefined : `preset ${role.agentPreset}`,
      role.capacityGroup === undefined ? undefined : `capacity group ${role.capacityGroup}`,
      role.executionBudget?.wallClockMs === undefined
        ? undefined
        : `wall-clock budget ${role.executionBudget.wallClockMs} ms (expiry stops the child)`,
      role.provider === undefined ? 'inherited model route' : `${role.provider}/${role.model}`,
    ].flatMap((fact): string[] => fact === undefined ? [] : [oneLine(fact)])
    return `\`${oneLine(role.name)}\` (${oneLine(role.label)}): ${facts.join('; ')}`
  })
  const names = roles.map(role => role.name)
  const description = ` Declared roles:\n${detailed.join('\n')}`
  if (description.length <= maxChars) return { description, names }
  // Dropping optional facts keeps the roster visible without rejecting the
  // roles its operator just added.
  const compactRows = roles.map(role => `\`${oneLine(role.name)}\` (${oneLine(role.label)})`)
  const compactDescription = ` Declared roles (compact; call \`${discoveryToolName}\` for role facts):\n${compactRows.join('\n')}`
  if (compactDescription.length <= maxChars) return { description: compactDescription, names }
  // The discovery tool carries the full roster; only its fixed name is inlined.
  return {
    description: ` The role catalog is too large to inline; call \`${discoveryToolName}\` to inspect the declared roles.`,
    names,
  }
}

/**
 * Collapse one configured value into a single catalog line so it cannot forge
 * another role row or add model-facing instructions.
 * @param value - role-supplied text.
 * @returns the text with line breaks and repeated whitespace collapsed.
 */
function oneLine(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/** Normalize one model-facing failure message to a single bounded line. */
function oneLineFailure(value: string): string {
  return boundedFailure(value).replace(/`/gu, '\'')
}

/**
 * Resolve the preset a role declares before a child is created. The registry
 * reports a missing id with the available roster; this preflight replaces the
 * late child-setup failure with a role-scoped, actionable error.
 * @param ctx - context that may carry the Agent Preset registry.
 * @param role - the resolved role.
 * @param signal - tool-call cancellation; the registry read has no cancellation
 *   channel, so cancellation stops awaiting its diagnostic.
 * @returns nothing when the role declares no preset or it resolves.
 * @throws AgentRoleError when the preset registry lacks the declared id or reports it broken.
 */
async function preflightPreset(ctx: Context, role: ResolvedRole, signal: AbortSignal): Promise<void> {
  const presetId = role.agentPreset
  if (presetId === undefined) return
  const presets = ctx.get('agentPresets')
  if (presets === undefined) {
    throw new AgentRoleError(
      `agent role "${role.name}" declares agentPreset "${presetId}", but the agent-presets service is not mounted`,
      'ROLE_INVALID_CONFIG',
    )
  }
  try {
    const resolved = await awaitAbortable(presets.resolve(presetId), signal)
    signal.throwIfAborted()
    if (resolved.broken !== undefined) {
      throw new AgentRoleError(
        `agent role "${role.name}" declares agentPreset "${presetId}", which is broken: ${boundedFailure(resolved.broken)}`,
        'ROLE_INVALID_CONFIG',
      )
    }
  } catch (error: unknown) {
    signal.throwIfAborted()
    if (error instanceof AgentRoleError) throw error
    const remote = remoteErrorOf(error)
    if (remote?.code === 'agent-preset/not-found') {
      throw new AgentRoleError(
        `agent role "${role.name}" declares agentPreset "${presetId}", which is not registered`,
        'ROLE_INVALID_CONFIG',
        { cause: error },
      )
    }
    // Registry diagnostics and internal failures are not missing presets:
    // report the registry failure itself so the operator investigates the
    // right component.
    throw new AgentRoleError(
      `agent role "${role.name}" could not resolve agentPreset "${presetId}": `
      + boundedFailure(error instanceof Error ? error.message : String(error)),
      'ROLE_INVALID_CONFIG',
      { cause: error },
    )
  }
}

/**
 * Validate a declared model route through the live LLM adapter before a child
 * is created. Only providers that expose `agentRouteDefaults` delegate route
 * resolution to this Host LLM runtime. A local provider builds an in-process
 * child from those options, so it is host-routed even without
 * `agentRouteDefaults`; only an external backend without that field owns its
 * route and may accept ids the Host adapter does not advertise.
 * @param ctx - context that may carry the LLM runtime.
 * @param role - the resolved role.
 * @param provider - the registered backend that will start the child.
 * @param signal - tool-call cancellation.
 * @returns nothing when the role inherits the route, the provider owns routing,
 *   or the route resolves.
 * @throws AgentRoleError when the runtime is absent or the route is rejected.
 */
async function preflightModelRoute(
  ctx: Context,
  role: ResolvedRole,
  provider: SubagentProvider,
  signal: AbortSignal,
): Promise<void> {
  const model = role.model
  if (model === undefined) return
  if (!providerBuildsHostChild(provider)) return
  const llm = ctx.get('llm')
  if (llm === undefined) {
    throw new AgentRoleError(
      `agent role "${role.name}" declares model "${model.provider}/${model.model}", but the llm service is not mounted`,
      'ROLE_INVALID_CONFIG',
    )
  }
  await resolveRoute(llm, role, model.provider, model.model, model.reasoningEffort, model.maxTokens, signal)
}

/**
 * Whether the Host LLM runtime resolves this provider's child route. A local
 * provider constructs an in-process child from `agentOptions`; an external
 * provider that advertises route defaults asks the Host to resolve them too.
 * @param provider - the registered backend that will start the child.
 * @returns whether the Host runtime resolves the declared route.
 */
function providerBuildsHostChild(provider: SubagentProvider): boolean {
  return provider.prepareContinuable !== undefined || provider.agentRouteDefaults !== undefined
}

/**
 * Resolve and validate everything a role's start needs. The delegation tool
 * calls this before starting the child, and discovery renders the same result
 * so a health report cannot disagree with a later call.
 * @param ctx - context carrying the catalog, subagent registry, and optional live services.
 * @param config - validated tool configuration.
 * @param role - the resolved role.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param parent - the caller whose current depth bounds the child, when known.
 * @param signal - tool-call cancellation.
 * @returns the registered provider and effective depth cap.
 * @throws AgentRoleError when the role cannot start.
 */
async function requireRoleHealth(
  ctx: Context,
  config: Config,
  role: ResolvedRole,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  parent: Agent | undefined,
  signal: AbortSignal,
): Promise<{ provider: SubagentProvider; maxDepth?: number }> {
  signal.throwIfAborted()
  assertRoleContext(role)
  const maxDepth = effectiveMaxDepth(ctx, role, config.maxDepth)
  const provider = requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, maxDepth)
  assertDepthAvailable(role, maxDepth, parent)
  await preflightPreset(ctx, role, signal)
  signal.throwIfAborted()
  await preflightModelRoute(ctx, role, provider, signal)
  signal.throwIfAborted()
  return { provider, ...maxDepth === undefined ? {} : { maxDepth } }
}

/**
 * Resolve a role against one provider identity. The preset and model-route
 * preflights await live services, so a same-name provider may be replaced
 * between the capability check and start; rechecking the registry here keeps
 * the role's fresh/fork contract bound to the provider that actually starts.
 * @param ctx - context carrying the subagent registry.
 * @param config - validated tool configuration.
 * @param role - the resolved role.
 * @param freshProvider - provider used by a fresh role without an explicit backend.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param parent - the caller whose current depth bounds the child.
 * @param signal - tool-call cancellation.
 * @returns the still-registered provider and effective depth cap.
 * @throws AgentRoleError when the provider changes again or stops satisfying the role.
 */
async function requireStableRoleHealth(
  ctx: Context,
  config: Config,
  role: ResolvedRole,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  parent: Agent | undefined,
  signal: AbortSignal,
): Promise<{ provider: SubagentProvider; maxDepth?: number }> {
  let health = await requireRoleHealth(
    ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal,
  )
  if (ctx.subagents.getProvider(health.provider.name) === health.provider) return health
  signal.throwIfAborted()
  health = await requireRoleHealth(
    ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal,
  )
  if (ctx.subagents.getProvider(health.provider.name) === health.provider) return health
  throw new AgentRoleError(
    `agent role "${role.name}" could not start because its subagent provider changed while resolving; retry the delegation`,
    'ROLE_INVALID_CONFIG',
  )
}

/** One role's startup readiness as discovery reports it. */
interface RoleHealth {
  /** The provider the role selects, whether or not it is registered. */
  readonly provider: string
  /** The effective numeric depth cap, when the provider enforces one here. */
  readonly maxDepth?: number
  /** The stable failure category, or undefined when the role can start. */
  readonly problemCode?: AgentRoleErrorCode
  /** The role-scoped failure, or undefined when the role can start. */
  readonly problem?: string
}

/**
 * Check one role without starting it, converting a startup failure into a
 * model-facing diagnostic. Cancellation still propagates.
 * @param ctx - context carrying the catalog and live services.
 * @param config - validated tool configuration.
 * @param role - the resolved role.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param parent - the caller whose current depth bounds the child, when known.
 * @param depthOnly - check provider, context, capability, and depth without
 *   resolving a preset or model route.
 * @param signal - tool-call cancellation.
 * @returns the selected provider and either its effective cap or the failure.
 */
async function inspectRoleHealth(
  ctx: Context,
  config: Config,
  role: ResolvedRole,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  parent: Agent | undefined,
  depthOnly: boolean,
  signal: AbortSignal,
): Promise<RoleHealth> {
  const provider = selectedProviderName(role, freshProvider, forkProvider, catalogFallback)
  try {
    if (depthOnly) {
      signal.throwIfAborted()
      assertRoleContext(role)
      const maxDepth = effectiveMaxDepth(ctx, role, config.maxDepth)
      const ready = requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, maxDepth)
      assertDepthAvailable(role, maxDepth, parent)
      return { provider: ready.name, ...maxDepth === undefined ? {} : { maxDepth } }
    }
    const ready = await requireRoleHealth(
      ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal,
    )
    return {
      provider: ready.provider.name,
      ...ready.maxDepth === undefined ? {} : { maxDepth: ready.maxDepth },
    }
  } catch (error: unknown) {
    if (signal.aborted) throw signal.reason
    return {
      provider,
      ...error instanceof AgentRoleError ? { problemCode: error.code } : {},
      problem: oneLineFailure(error instanceof Error ? error.message : String(error)),
    }
  }
}

/** Maximum entries one non-detail discovery result returns. */
interface DiscoveryLimits {
  /** Maximum role rows in one page. */
  readonly pageSize: number
  /** Maximum concurrent startup checks in one call. */
  readonly healthConcurrency: number
}

/** One discovery result row. */
interface RoleDiscoveryEntry {
  /** Discriminator for replay and future row kinds. */
  readonly kind: 'role'
  /** Declared role name. */
  readonly name: string
  /** Human-facing label. */
  readonly label?: string
  /** Resolved context mode. */
  readonly context?: 'fresh' | 'fork'
  /** Provider the role selects, whether or not it is registered. */
  readonly provider?: string
  /** Declared model route, when present. */
  readonly model?: string
  /** Declared Agent Preset id, when present. */
  readonly agentPreset?: string
  /** Deployment capacity group this role selects, when present. */
  readonly capacityGroup?: string
  /** Runtime-enforced wall-clock budget, when the role declares one. */
  readonly executionBudget?: SubagentExecutionBudget
  /** Whether the child returns a structured result. */
  readonly structuredOutput?: boolean
  /** Whether this scope's checks passed; read {@link healthScope} for what they covered. */
  readonly health: 'ok' | 'invalid'
  /** Whether `health` covers static startup checks or the full preset and model preflight. */
  readonly healthScope: 'static' | 'full'
  /** The stable failure category, when health is invalid. */
  readonly problemCode?: AgentRoleErrorCode
  /** The startup failure, when health is invalid. */
  readonly problem?: string
  /** The effective numeric depth cap, when one applies. */
  readonly maxDepth?: number
  /** The role's description, returned only for an exact-role lookup. */
  readonly description?: string
  /** The role's discovery tags, returned only for an exact-role lookup. */
  tags?: string[]
}

/** The complete discovery result. */
interface RoleDiscoveryResult {
  /** Discriminator for the result object. */
  readonly kind: 'roles'
  /** Matching rows, ordered by name. */
  readonly entries: RoleDiscoveryEntry[]
  /** Number of matching roles before the page limit. */
  readonly total: number
  /** Offset of the first returned matching role. */
  readonly offset: number
  /** Whether entries omits matching roles because of the page limit. */
  readonly truncated: boolean
  /** Every declared role name when an empty query result needs a recovery hint. */
  readonly availableRoles?: string[]
  /** Why the inline tool catalog still shows older roles, when a refresh failed. */
  readonly catalogStale?: string
}

/** The schema for one discovery row; detail-only fields stay optional. */
const DISCOVERY_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', required: true, enum: ['role'] },
    name: { type: 'string', required: true },
    label: { type: 'string' },
    context: { type: 'string', enum: ['fresh', 'fork'] },
    provider: { type: 'string' },
    model: { type: 'string' },
    agentPreset: { type: 'string' },
    capacityGroup: { type: 'string' },
    executionBudget: {
      type: 'object',
      description: 'Runtime-enforced wall-clock limits for one activation. Expiry stops the child and reports stopReason "timeout".',
      additionalProperties: false,
      properties: {
        wallClockMs: { type: 'number', description: 'Positive safe integer of milliseconds; the clock starts at admission.' },
      },
    },
    structuredOutput: { type: 'boolean' },
    health: { type: 'string', required: true, enum: ['ok', 'invalid'] },
    healthScope: { type: 'string', required: true, enum: ['static', 'full'] },
    problemCode: { type: 'string', enum: ['ROLE_INVALID_CONFIG', 'ROLE_UNKNOWN'] },
    problem: { type: 'string' },
    maxDepth: { type: 'number' },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
} as const

/**
 * Discovery relevance for one role against a lower-cased query. Higher ranks
 * sort first; an exact name always precedes a name prefix, which precedes a
 * label, tag, or description match.
 * @param role - the resolved role.
 * @param query - the lower-cased query.
 * @returns the match rank, or undefined when no field matches.
 */
function matchRank(role: ResolvedRole, query: string): number | undefined {
  const name = role.name.toLowerCase()
  if (name === query) return 4
  if (name.startsWith(query)) return 3
  if (role.label.toLowerCase().includes(query)) return 2
  if (role.tags?.some(tag => tag.toLowerCase().includes(query)) === true) return 1
  if (role.description?.toLowerCase().includes(query) === true) return 0
  return undefined
}

/**
 * Project one rejected role into a discovery row. Its declaration facts are
 * unavailable because validation failed, so only the name and role-scoped
 * failure are returned.
 * @param role - the rejected catalog entry.
 * @returns the discovery row.
 */
function invalidDiscoveryEntry(role: InvalidRole): RoleDiscoveryEntry {
  return {
    kind: 'role',
    name: oneLine(role.name),
    health: 'invalid',
    healthScope: 'static',
    problemCode: role.code,
    problem: oneLineFailure(role.message),
  }
}

/**
 * Project one resolved role and its startup diagnosis into a discovery entry.
 * The caller supplies the role snapshot from the same catalog read as the
 * list, so a concurrent volatile edit cannot make one row disappear.
 * @param ctx - context carrying the catalog and live services.
 * @param config - validated tool configuration.
 * @param role - resolved role snapshot.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param parent - the caller whose current depth bounds the child, when known.
 * @param detail - whether to include the description and fully resolve preset/model health.
 * @param signal - tool-call cancellation.
 * @returns the discovery row.
 */
async function discoveryEntry(
  ctx: Context,
  config: Config,
  role: ResolvedRole,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  parent: Agent | undefined,
  detail: boolean,
  signal: AbortSignal,
): Promise<RoleDiscoveryEntry> {
  const health = await inspectRoleHealth(
    ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, !detail, signal,
  )
  return {
    kind: 'role',
    name: oneLine(role.name),
    label: oneLine(role.label),
    context: role.context,
    provider: oneLine(health.provider),
    ...role.model === undefined ? {} : { model: oneLine(`${role.model.provider}/${role.model.model}`) },
    ...role.agentPreset === undefined ? {} : { agentPreset: oneLine(role.agentPreset) },
    ...role.capacityGroup === undefined ? {} : { capacityGroup: oneLine(role.capacityGroup) },
    ...role.executionBudget === undefined ? {} : { executionBudget: { ...role.executionBudget } },
    structuredOutput: role.outputSchema !== undefined,
    health: health.problem === undefined ? 'ok' : 'invalid',
    healthScope: detail ? 'full' : 'static',
    ...health.problemCode === undefined ? {} : { problemCode: health.problemCode },
    ...health.problem === undefined ? {} : { problem: oneLineFailure(health.problem) },
    ...health.maxDepth === undefined ? {} : { maxDepth: health.maxDepth },
    ...detail && role.description !== undefined ? { description: oneLine(role.description) } : {},
    ...detail && role.tags !== undefined ? { tags: role.tags.map(oneLine) } : {},
  }
}

/**
 * Render one discovery result as model-facing text.
 * @param result - validated discovery result.
 * @param query - the query that produced the result, when one was supplied.
 * @returns the text block content.
 */
function renderDiscovery(result: RoleDiscoveryResult, query?: string, toolName = 'list_agent_roles'): string {
  if (result.entries.length === 0) {
    if (query === undefined) {
      const declaration = result.availableRoles === undefined
        ? '(no matching agent roles)'
        : 'This deployment declares no agent roles.'
      return result.catalogStale === undefined
        ? declaration
        : `${declaration} The inline role catalog is stale: ${oneLine(result.catalogStale)}`
    }
    const available = result.availableRoles
    const roster = available === undefined
      ? ''
      : available.length === 0
        ? ' This deployment declares no roles.'
        : ` Declared roles: ${available.slice(0, 12).map(oneLine).join(', ')}${available.length > 12 ? `, and ${available.length - 12} more` : ''}.`
    const stale = result.catalogStale === undefined
      ? ''
      : ` The inline role catalog is stale: ${oneLine(result.catalogStale)}.`
    return `(no agent roles match query "${oneLine(query)}".${roster} `
      + `Call \`${toolName}\` without a query for the full roster, or pass an exact \`role\`.${stale})`
  }
  const rows = result.entries.map((entry) => {
    const facts = [
      entry.label,
      entry.context,
      entry.health,
      entry.healthScope,
      entry.provider,
      entry.model,
      entry.agentPreset === undefined ? undefined : `preset ${entry.agentPreset}`,
      entry.capacityGroup === undefined ? undefined : `capacity group ${entry.capacityGroup}`,
      entry.executionBudget?.wallClockMs === undefined
        ? undefined
        : `wall-clock budget ${entry.executionBudget.wallClockMs} ms (expiry stops the child)`,
      entry.maxDepth === undefined ? undefined : `depth ${entry.maxDepth}`,
      entry.structuredOutput === true ? 'structured result' : undefined,
      entry.tags === undefined ? undefined : `tags ${entry.tags.join(', ')}`,
    ].filter((fact): fact is string => fact !== undefined).map(oneLine)
    return `${oneLine(entry.name)}${facts.length === 0 ? '' : ` — ${facts.join(', ')}`}`
      + (entry.description === undefined ? '' : `\n  ${oneLine(entry.description)}`)
      + (entry.problem === undefined
        ? ''
        : `\n  problem${entry.problemCode === undefined ? '' : ` (${entry.problemCode})`}: ${oneLine(entry.problem)}`)
  })
  if (result.truncated) {
    rows.push(
      `(showing ${result.offset + 1}-${result.offset + result.entries.length} of ${result.total}; `
      + `pass offset ${result.offset + result.entries.length} for the next page, or query or role to narrow)`,
    )
  }
  // A static row never resolved a route, so a role whose model is unusable
  // still reads `ok` here. State that limit beside the rows instead of leaving
  // the caller to discover it when the delegation fails.
  if (result.entries.some(entry => entry.healthScope === 'static' && entry.model !== undefined)) {
    rows.push(
      '(static health does not resolve model routes; pass an exact `role` for the full preset and model check)',
    )
  }
  if (result.catalogStale !== undefined) {
    rows.push(`(the inline role catalog is stale and still shows an older list: ${oneLine(result.catalogStale)})`)
  }
  return rows.join('\n')
}

/**
 * Build the read-only role discovery tool over the live catalog.
 * @param ctx - context carrying the catalog, subagent registry, and tools.
 * @param config - validated tool configuration.
 * @param toolName - the registered discovery name.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param catalog - mutable inline catalog and the reason it is stale after a failed refresh.
 * @param limits - discovery page and health-concurrency limits.
 * @returns the tool definition to register.
 */
function defineDiscoveryTool(
  ctx: Context,
  config: Config,
  toolName: string,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  catalog: { readonly current: CatalogSummary; readonly stale?: string | undefined },
  limits: DiscoveryLimits,
): ToolDefinition {
  const parameters = {
    role: {
      type: 'string',
      description: 'Exact declared role name. Returns that role\'s detail and full startup health; cannot be combined with query or offset.',
    },
    query: {
      type: 'string',
      description: 'Case-insensitive substring matched against role names, labels, tags, and descriptions. Results rank exact names first, then name prefixes, labels, tags, and descriptions.',
    },
    offset: {
      type: 'number',
      description: 'Zero-based index of the first matching role. Continue with the offset named by the previous page\'s truncation notice.',
    },
  } satisfies ParameterSchemaSpec
  const definition = defineTool({
    name: toolName,
    description:
      'Inspect the declared agent roles this deployment offers. Call with no arguments for a compact list, '
      + 'with `query` to match names, labels, tags, or descriptions, or with `role` for one role\'s declaration facts '
      + 'and startup health. Rows report `healthScope`: list and query mode return `static` after checking '
      + 'provider, context, capability, and depth against the caller, so a static `ok` does not mean the model route '
      + 'resolves; an exact `role` lookup returns `full` after also resolving the Agent Preset and model route. '
      + 'Neither mode starts a child.',
    parameters,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'roles' },
          entries: { type: 'array', required: true, items: DISCOVERY_ENTRY_SCHEMA },
          total: { type: 'number', required: true },
          offset: { type: 'number', required: true },
          truncated: { type: 'boolean', required: true },
          availableRoles: { type: 'array', items: { type: 'string' } },
          catalogStale: { type: 'string' },
        },
      },
      render: (args, value) => [{ type: 'text', text: renderDiscovery(value, args.query, toolName) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      assertCharacterLimit(args.role, 'role', ROLE_NAME_MAX_LENGTH)
      assertCharacterLimit(args.query, 'query', QUERY_MAX_LENGTH)
      if (args.role !== undefined && args.query !== undefined) {
        throw new Error('pass either `role` or `query`, not both')
      }
      if (args.role !== undefined && args.offset !== undefined) {
        throw new Error('pass either `role` or `offset`, not both')
      }
      const offset = args.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new Error('offset must be a non-negative safe integer')
      }
      const query = args.query?.toLowerCase()
      const snapshot = ctx.agentRoles.snapshot()
      const exactRole = args.role === undefined
        ? undefined
        : snapshot.roles.find(role => role.name === args.role)
      const exactInvalid = args.role === undefined
        ? undefined
        : snapshot.invalid.find(role => role.name === args.role)
      if (args.role !== undefined && exactRole === undefined && exactInvalid === undefined) {
        throw unknownRole(snapshot, args.role, toolName)
      }
      const ranked = query === undefined
        ? undefined
        : snapshot.roles.flatMap((role) => {
          const rank = matchRank(role, query)
          return rank === undefined ? [] : [{ role, rank }]
        })
      const matchedRoles = exactRole !== undefined
        ? [exactRole]
        : args.role !== undefined
          ? []
          : ranked === undefined
            ? snapshot.roles
            : ranked.toSorted((a, b) => b.rank - a.rank || a.role.name.localeCompare(b.role.name))
              .map(entry => entry.role)
      const matchedInvalid = exactInvalid !== undefined
        ? [exactInvalid]
        : args.role === undefined
          ? (query === undefined
            ? snapshot.invalid
            : snapshot.invalid.filter(role => role.name.toLowerCase().includes(query)))
          : []
      // Invalid rows have no label or tags, so they follow ranked valid rows.
      const matched: ({ kind: 'role'; role: ResolvedRole } | { kind: 'invalid'; role: InvalidRole })[] = [
        ...matchedRoles.map(role => ({ kind: 'role' as const, role })),
        ...matchedInvalid.map(role => ({ kind: 'invalid' as const, role })),
      ]
      if (query === undefined || args.role !== undefined) {
        matched.sort((a, b) => a.role.name.localeCompare(b.role.name))
      }
      if (args.role === undefined && offset > 0 && offset >= matched.length) {
        const declared = snapshot.roles.length + snapshot.invalid.length
        throw new Error(
          `offset ${offset} is beyond the ${matched.length} matching agent roles`
          + (declared === 0 && args.query === undefined
            ? '; this deployment declares no roles'
            : '; pass offset 0 to restart'),
        )
      }
      const shown = args.role === undefined
        ? matched.slice(offset, offset + limits.pageSize)
        : matched
      const detail = args.role !== undefined
      const entries: RoleDiscoveryEntry[] = []
      // Health checks share the loader and LLM registries; a small pool keeps a
      // wide roster from fanning out while preserving result order.
      for (let start = 0; start < shown.length; start += limits.healthConcurrency) {
        const batch = shown.slice(start, start + limits.healthConcurrency)
        entries.push(...await Promise.all(batch.map(async match => match.kind === 'invalid'
          ? invalidDiscoveryEntry(match.role)
          : discoveryEntry(
            ctx, config, match.role, freshProvider, forkProvider, catalogFallback, exec.agent, detail, exec.signal,
          ))))
      }
      exec.signal.throwIfAborted()
      let returned = entries
      // Detail is a single row, but its declared description is still
      // model-visible text. Apply the page budget there too; the renderer
      // states that it shortened the row, and the structured value is
      // truncated with it so render and value cannot disagree.
      if (args.role !== undefined && entries.length === 1) {
        let shortened = false
        while (!shortened) {
          const candidate: RoleDiscoveryResult = {
            kind: 'roles',
            entries: returned,
            total: matched.length,
            offset: 0,
            truncated: false,
            ...catalog.stale === undefined ? {} : { catalogStale: catalog.stale },
          }
          if (renderDiscovery(candidate).length <= ROLE_DISCOVERY_MAX_CHARS) break
          const entry = returned[0] as RoleDiscoveryEntry
          if (entry.description === undefined || entry.description.length === 0) break
          const excess = renderDiscovery(candidate).length - ROLE_DISCOVERY_MAX_CHARS
          // The description is declared in code points, so shorten it the same
          // way; slicing UTF-16 units can split a surrogate pair.
          const keep = Math.max(
            0,
            Array.from(entry.description).length - excess - ROLE_DESCRIPTION_TRUNCATION.length,
          )
          returned = [{
            ...entry,
            description: `${truncateCodePoints(entry.description, keep).trimEnd()}${ROLE_DESCRIPTION_TRUNCATION}`,
          }]
          shortened = true
        }
      }
      if (args.role === undefined && entries.length > 1) {
        while (returned.length > 1) {
          const candidate: RoleDiscoveryResult = {
            kind: 'roles',
            entries: returned,
            total: matched.length,
            offset,
            truncated: offset + returned.length < matched.length,
            ...catalog.stale === undefined ? {} : { catalogStale: catalog.stale },
          }
          if (renderDiscovery(candidate).length <= ROLE_DISCOVERY_MAX_CHARS) break
          returned = returned.slice(0, -1)
        }
      }
      return {
        kind: 'roles' as const,
        entries: returned,
        total: matched.length,
        offset: args.role === undefined ? offset : 0,
        truncated: args.role === undefined && offset + returned.length < matched.length,
        ...args.query !== undefined && matched.length === 0
          ? { availableRoles: [...snapshot.roles, ...snapshot.invalid].map(role => oneLine(role.name)).sort() }
          : {},
        ...args.query === undefined && matched.length === 0
          ? { availableRoles: [] }
          : {},
        ...catalog.stale === undefined ? {} : { catalogStale: catalog.stale },
      }
    },
  })
  definition.parameters = { ...boundedParameterSchema(parameters, {
    role: ROLE_NAME_MAX_LENGTH,
    query: QUERY_MAX_LENGTH,
  }) }
  return definition
}

/**
 * Resolve one declared route through the live LLM runtime and report a
 * rejection in role terms.
 * @param llm - live LLM runtime.
 * @param role - the resolved role that declared the route.
 * @param provider - the declared provider id.
 * @param model - the declared model id.
 * @param reasoningEffort - the declared effort, when present.
 * @param maxTokens - the declared output cap, when present.
 * @param signal - tool-call cancellation.
 * @returns nothing when the route resolves.
 * @throws AgentRoleError when the route is rejected.
 */
async function resolveRoute(
  llm: LlmRuntime,
  role: ResolvedRole,
  provider: string,
  model: string,
  reasoningEffort: string | undefined,
  maxTokens: number | undefined,
  signal: AbortSignal,
): Promise<void> {
  try {
    await llm.resolveCallConfig({
      provider,
      model,
      ...reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) },
      ...maxTokens === undefined ? {} : { maxTokens },
    }, signal)
  } catch (error: unknown) {
    if (signal.aborted) throw signal.reason
    if (!(error instanceof LlmError) && !(error instanceof Error)) throw error
    throw new AgentRoleError(
      `agent role "${role.name}" declares model "${provider}/${model}", `
      + `which cannot be used: ${boundedFailure(error.message)}`,
      'ROLE_INVALID_CONFIG',
      { cause: error },
    )
  }
}

/**
 * Build the role delegation tool. The catalog text is read when the model
 * surface is projected, so a refreshed catalog becomes visible without
 * disposing this registration.
 * @param ctx - context carrying the role catalog, subagent registry, and tools.
 * @param config - validated tool configuration.
 * @param toolName - the resolved model-facing tool name.
 * @param freshProvider - provider used by a fresh role without an explicit backend or catalog fallback.
 * @param forkProvider - provider used by a fork role without an explicit backend.
 * @param catalogFallback - reads the catalog's deployment provider for a fresh role.
 * @param catalog - mutable catalog slot refreshed by one atomic replacement.
 * @param discoveryToolName - the catalog discovery tool this description points to.
 * @returns the tool definition to register once.
 */
function defineRoleTool(
  ctx: Context,
  config: Config,
  toolName: string,
  freshProvider: string | undefined,
  forkProvider: string,
  catalogFallback: () => string,
  catalog: { current: CatalogSummary },
  discoveryToolName: string,
): ToolDefinition {
  const parameters = {
    role: {
      type: 'string',
      required: true,
      description: `Exact name of a declared agent role. Use \`${discoveryToolName}\` when unsure.`,
    },
    prompt: {
      type: 'string',
      required: true,
      description: 'The complete, self-contained task for the role. A fresh role does not share this conversation, so include everything it needs.',
    },
    label: {
      type: 'string',
      description: 'Short display label for this delegation; defaults to the role label.',
    },
    cwd: {
      type: 'string',
      description: 'Initial child working directory. Relative paths use your current directory; omitted inherits it.',
    },
  } satisfies ParameterSchemaSpec
  const definition = defineTool({
    name: toolName,
    description: '',
    parameters,
    /* jscpd:ignore-start -- both delegation tools expose the same activation result contract. */
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, const: 'activation' },
          subagentId: { type: 'string', required: true },
          role: { type: 'string', required: true },
          context: { type: 'string', required: true, enum: ['fresh', 'fork'] },
          provider: { type: 'string', required: true },
          model: { type: 'string' },
          agentPreset: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `started subagent ${value.subagentId} (${oneLine(value.role)}, ${value.context}, ${oneLine(value.provider)}`
          + (value.model === undefined ? '' : `, ${oneLine(value.model)}`)
          + `${value.agentPreset === undefined ? '' : `, preset ${oneLine(value.agentPreset)}`})`,
      }],
      // The tool name is deployment-configurable, so the Web card identifies the
      // receipt by this marker rather than by a hardcoded name.
      presentationMeta: (_args, value) => ({ roleActivation: {
        subagentId: value.subagentId,
        role: value.role,
        context: value.context,
        provider: value.provider,
        ...value.model === undefined ? {} : { model: value.model },
        ...value.agentPreset === undefined ? {} : { agentPreset: value.agentPreset },
      } }),
    },
    /* jscpd:ignore-end */
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      assertCharacterLimit(args.role, 'role', ROLE_NAME_MAX_LENGTH)
      assertCharacterLimit(args.label, 'label', ROLE_LABEL_MAX_LENGTH)
      if (args.label !== undefined && args.label.trim().length === 0) {
        throw new Error('label must include non-whitespace text')
      }
      if (args.cwd !== undefined && args.cwd.includes('\0')) {
        throw new Error('cwd must not contain a null character')
      }
      if (args.prompt.trim().length === 0) {
        throw new Error('prompt must include non-whitespace text')
      }
      const agent: Agent | undefined = exec.agent
      if (agent === undefined) {
        throw new Error(`${toolName} requires a calling agent (exec.agent was undefined)`)
      }

      const role = resolveRole(ctx, args.role, discoveryToolName)
      const { provider, maxDepth } = await requireStableRoleHealth(
        ctx, config, role, freshProvider, forkProvider, catalogFallback, agent, exec.signal,
      )
      // Continue synchronously to the start call: a same-name provider replaced
      // between the health check and startActivation would otherwise silently
      // change the role's context and capability contract.
      exec.signal.throwIfAborted()
      if (ctx.subagents.getProvider(provider.name) !== provider) {
        throw new AgentRoleError(
          `agent role "${role.name}" could not start because its subagent provider changed while resolving; retry the delegation`,
          'ROLE_INVALID_CONFIG',
        )
      }
      const agentOptions = agentOptionsFor(role, provider)

      const started = await ctx.subagents.startActivation({
        provider: provider.name,
        label: args.label ?? role.label,
        displayLabel: role.name,
        request: {
          prompt: [{ type: 'text', text: args.prompt }] as ContentBlock[],
          parent: agent,
          ...Object.keys(agentOptions).length === 0 ? {} : { agentOptions },
          ...role.agentPreset === undefined ? {} : { agentPreset: role.agentPreset },
          ...maxDepth === undefined ? {} : { maxDepth },
          ...role.capacityGroup === undefined ? {} : { capacityGroup: role.capacityGroup },
          ...role.executionBudget === undefined ? {} : { executionBudget: { ...role.executionBudget } },
          ...role.outputSchema === undefined ? {} : { outputSchema: role.outputSchema },
          ...args.cwd === undefined ? {} : { cwd: args.cwd },
        },
        signal: exec.signal,
        delivery: 'parent',
      })
      return {
        kind: 'activation' as const,
        subagentId: started.childId,
        role: oneLine(role.name),
        context: role.context,
        provider: oneLine(provider.name),
        ...role.model === undefined ? {} : { model: oneLine(`${role.model.provider}/${role.model.model}`) },
        ...role.agentPreset === undefined ? {} : { agentPreset: oneLine(role.agentPreset) },
      } satisfies RoleActivation
    },
  })
  definition.parameters = {
    ...boundedParameterSchema(parameters, {
      role: ROLE_NAME_MAX_LENGTH,
      label: ROLE_LABEL_MAX_LENGTH,
    }),
  }
  Object.defineProperty(definition, 'description', {
    enumerable: true,
    get: () => 'Delegate a self-contained task to one declared agent role: a named, preconfigured child with its '
      + 'own model route and Agent Preset composition. A fresh role starts without this conversation and '
      + 'may select an independent Agent Preset; a fork role inherits the parent\'s completed turns and '
      + 'composition, and Agent Presets are only available to fresh roles. This tool starts a managed '
      + 'child and immediately returns its id; the runtime notifies you when it finishes.'
      + ` Call \`${discoveryToolName}\` when you need the available roles or a role's health.`
      + catalog.current.description,
  })
  return definition
}

export function apply(ctx: Context, config: Config = {}): void {
  const toolName = config.toolName ?? 'role_agent'
  assertConfiguredToolName(toolName, 'toolName')
  const discoveryToolName = config.discoveryToolName ?? 'list_agent_roles'
  assertConfiguredToolName(discoveryToolName, 'discoveryToolName')
  if (discoveryToolName === toolName) {
    throw new Error('tool-agent-role: discoveryToolName must differ from toolName')
  }
  if (config.maxDepth !== 'provider-managed') assertSubagentMaxDepth(config.maxDepth)
  // Direct apply() bypasses Schemastery defaults, so resolve every limit here.
  if (config.freshProvider !== undefined) assertConfiguredProviderName(config.freshProvider, 'freshProvider')
  if (config.forkProvider !== undefined) assertConfiguredProviderName(config.forkProvider, 'forkProvider')
  const limits: CatalogLimits = {
    maxRoles: config.maxRoles ?? 64,
    maxCatalogChars: config.maxCatalogChars ?? 8192,
  }
  if (!Number.isSafeInteger(limits.maxRoles) || limits.maxRoles < 1) {
    throw new Error('tool-agent-role: maxRoles must be a positive safe integer')
  }
  if (!Number.isSafeInteger(limits.maxCatalogChars) || limits.maxCatalogChars < 1) {
    throw new Error('tool-agent-role: maxCatalogChars must be a positive safe integer')
  }
  const discoveryLimits: DiscoveryLimits = {
    pageSize: config.discoveryPageSize ?? 50,
    healthConcurrency: config.discoveryHealthConcurrency ?? 4,
  }
  if (!Number.isSafeInteger(discoveryLimits.pageSize) || discoveryLimits.pageSize < 1) {
    throw new Error('tool-agent-role: discoveryPageSize must be a positive safe integer')
  }
  if (!Number.isSafeInteger(discoveryLimits.healthConcurrency) || discoveryLimits.healthConcurrency < 1) {
    throw new Error('tool-agent-role: discoveryHealthConcurrency must be a positive safe integer')
  }
  // A fresh role without an explicit tool provider may use the catalog's
  // deployment fallback; the catalog itself defaults to `spawn`.
  const freshProvider = config.freshProvider
  const forkProvider = config.forkProvider ?? 'fork'
  const catalogFallback = (): string => ctx.agentRoles.defaultBackingProvider
  validateDeclaredRoles(ctx, freshProvider, forkProvider, catalogFallback, config.maxDepth)
  ctx.on('subagent/provider-added', (provider) => {
    reportProviderRoleConflicts(ctx, provider, freshProvider, forkProvider, catalogFallback, config.maxDepth)
  })
  const catalog = {
    current: catalogSummary(ctx.agentRoles.list(), limits.maxCatalogChars, discoveryToolName),
    stale: undefined as string | undefined,
  }
  assertCatalogFits(catalog.current, limits)
  ctx.tools.register(defineRoleTool(
    ctx, config, toolName, freshProvider, forkProvider, catalogFallback, catalog, discoveryToolName,
  ))
  ctx.tools.register(
    defineDiscoveryTool(
      ctx, config, discoveryToolName, freshProvider, forkProvider, catalogFallback, catalog, discoveryLimits,
    ),
  )
  ctx.on('loader/volatile-update', () => {
    let next: CatalogSummary
    let invalidRoles: InvalidRole[]
    try {
      const snapshot = ctx.agentRoles.snapshot()
      invalidRoles = snapshot.invalid
      // Reuse the registry projection so the refresh path cannot drift from
      // the initial catalog when `RoleSummary` gains another field.
      next = catalogSummary(snapshot.roles.map(summarizeRole), limits.maxCatalogChars, discoveryToolName)
      assertCatalogFits(next, limits)
    } catch (error: unknown) {
      // Keep the last valid definition: a partially edited live table must not
      // remove the tool the model already discovered, and a catalog above the
      // configured budget must not replace a model-visible definition wholesale.
      ctx.logger.warn(error)
      catalog.stale = catalogStaleReason(error, CATALOG_STALE_REASON_MAX_LENGTH)
      return
    }
    const invalidReason: string | undefined = invalidRoles.length === 0
      ? undefined
      : truncateCodePoints(
        `${invalidRoles.length === 1 ? 'role' : 'roles'} `
        + `${invalidRoles.map(role => oneLine(role.name)).join(', ')} failed validation and `
        + `${invalidRoles.length === 1 ? 'is' : 'are'} excluded from the inline catalog`,
        CATALOG_STALE_REASON_MAX_LENGTH,
      )
    if (next.description === catalog.current.description
      && next.names.length === catalog.current.names.length
      && next.names.every((name, index) => name === catalog.current.names[index])) {
      // A successful refresh that renders identically still makes the inline
      // catalog current, so it must clear an earlier failure.
      catalog.stale = invalidReason
      return
    }
    catalog.current = next
    catalog.stale = invalidReason
  }, { global: true })
}
