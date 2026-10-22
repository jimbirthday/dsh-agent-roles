import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
// Vendor source, not a package dependency: the manifest declares no
// `@deepseek-ai/cosmokit`, and a hand-written live reference is the only way a
// spec can hand the constructor a table the config schema never validated.
import { createVolatile, updateVolatile } from '../../../../vendor/cosmokit/src/volatile.ts'
import AgentRoleRegistry, { AgentRoleError, summarizeRole } from '../src/index.ts'
import type { RoleDefinition } from '../src/index.ts'

/** The registry's validated config input, as `ctx.plugin()` accepts it. */
type MountConfig = NonNullable<Parameters<typeof AgentRoleRegistry.Config>[0]>
/** One role table in its config-input form. */
type RolesInput = NonNullable<MountConfig['roles']>
/** One role entry in its config-input form. */
type RoleInput = RolesInput[string]

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

/** Mount the registry as a plugin, the way a composition does. */
async function mounted(config: MountConfig = { roles: {} }): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(AgentRoleRegistry, config)
  return ctx
}

/** A minimal valid role over one route, with overrides layered on. */
function role(overrides: Record<string, unknown> = {}): RoleInput {
  return { label: 'Worker', model: { provider: 'worker-route', model: 'worker-1' }, ...overrides }
}

/** A minimal role in its resolved definition form, for constructor-only cases. */
function definition(overrides: Partial<RoleDefinition> = {}): RoleDefinition {
  return { label: 'Worker', model: { provider: 'worker-route', model: 'worker-1' }, ...overrides }
}

/**
 * Construct the registry over a hand-written live reference, the form a runtime
 * table update hands the service once the configuration schema has been left
 * behind.
 * @param raw - the role table as the live reference holds it.
 * @param backingProvider - optional deployment default override.
 * @returns the context owning the constructed registry.
 */
function constructed(raw: Record<string, RoleDefinition>, backingProvider?: string): Context {
  const ctx = new Context()
  contexts.push(ctx)
  new AgentRoleRegistry(ctx, {
    roles: createVolatile(raw),
    ...backingProvider === undefined ? {} : { backingProvider: createVolatile(backingProvider) },
  })
  return ctx
}

const CATALOG: RolesInput = {
  worker: role(),
  orchestrator: role({
    label: 'Orchestrator',
    description: 'Plans work.',
    model: { provider: 'mgoole', model: 'mo-1' },
    agentPreset: 'planner',
    delegationDepth: 2,
  }),
  auditor: role({
    label: 'Auditor',
    tags: ['review', 'safety'],
    model: { provider: 'mgoole', model: 'mo-1' },
    contextDefault: 'fork',
    backingProvider: 'fork',
  }),
  efficient: role({
    label: 'Efficient',
    model: { provider: 'mgoole', model: 'mo-1', reasoningEffort: 'low', maxTokens: 4096 },
    agentPreset: 'readonly',
    capacityGroup: 'review',
    outputSchema: { type: 'object', additionalProperties: false, properties: { verdict: { type: 'string' } }, required: ['verdict'] },
  }),
}

describe('AgentRoleRegistry catalog reads', () => {
  it('lists every role ordered by name with its restricted flag', async () => {
    const ctx = await mounted({ roles: CATALOG })
    expect(ctx.agentRoles.list()).toEqual([
      {
        name: 'auditor', label: 'Auditor', context: 'fork', tags: ['review', 'safety'],
        provider: 'mgoole', model: 'mo-1', restricted: false, structuredOutput: false,
      },
      {
        name: 'efficient', label: 'Efficient', context: 'fresh', agentPreset: 'readonly',
        provider: 'mgoole', model: 'mo-1', capacityGroup: 'review', restricted: true, structuredOutput: true,
      },
      {
        name: 'orchestrator', label: 'Orchestrator', description: 'Plans work.',
        context: 'fresh', agentPreset: 'planner',
        provider: 'mgoole', model: 'mo-1', restricted: true, structuredOutput: false,
      },
      {
        name: 'worker', label: 'Worker', context: 'fresh',
        provider: 'worker-route', model: 'worker-1', restricted: false, structuredOutput: false,
      },
    ])
    expect(ctx.agentRoles.names()).toEqual(['auditor', 'efficient', 'orchestrator', 'worker'])
    expect(ctx.agentRoles.has('auditor')).toBe(true)
    expect(ctx.agentRoles.has('nope')).toBe(false)
    expect(ctx.agentRoles.listResolved().map(summarizeRole)).toEqual(ctx.agentRoles.list())
  })
})

describe('AgentRoleRegistry.resolve', () => {
  it('defaults context to fresh and leaves an undeclared backing provider for the consumer', async () => {
    const ctx = await mounted({ roles: { worker: role() } })
    expect(ctx.agentRoles.resolve('worker')).toEqual({
      name: 'worker',
      label: 'Worker',
      model: { provider: 'worker-route', model: 'worker-1' },
      context: 'fresh',
    })
  })

  it('keeps an absent backing provider absent when the composition overrides the default', async () => {
    const ctx = await mounted({ roles: { worker: role() }, backingProvider: 'fork' })
    expect(ctx.agentRoles.resolve('worker').backingProvider).toBeUndefined()
  })

  it('returns detached tag copies and keeps them ordered as declared', async () => {
    const ctx = await mounted({ roles: { auditor: role({ tags: ['review', 'safety'] }) } })
    const first = ctx.agentRoles.resolve('auditor')
    expect(first.tags).toEqual(['review', 'safety'])
    const mutable = first.tags as string[]
    mutable.push('mutated')
    expect(ctx.agentRoles.resolve('auditor').tags).toEqual(['review', 'safety'])
    expect(ctx.agentRoles.list()[0]?.tags).toEqual(['review', 'safety'])
    ;(ctx.agentRoles.list()[0]?.tags as string[]).push('listed-mutation')
    expect(ctx.agentRoles.list()[0]?.tags).toEqual(['review', 'safety'])
  })

  it('resolves the declared role fields exactly', async () => {
    const ctx = await mounted({ roles: CATALOG })
    expect(ctx.agentRoles.resolve('auditor')).toEqual({
      name: 'auditor',
      label: 'Auditor',
      tags: ['review', 'safety'],
      model: { provider: 'mgoole', model: 'mo-1' },
      backingProvider: 'fork',
      context: 'fork',
    })
  })

  it('carries the optional model controls a role declares', async () => {
    const ctx = await mounted({ roles: CATALOG })
    expect(ctx.agentRoles.resolve('efficient').model).toEqual({
      provider: 'mgoole', model: 'mo-1', reasoningEffort: 'low', maxTokens: 4096,
    })
    expect(ctx.agentRoles.resolve('efficient').agentPreset).toBe('readonly')
    expect(ctx.agentRoles.resolve('efficient').capacityGroup).toBe('review')
    expect(ctx.agentRoles.resolve('efficient').outputSchema).toEqual({
      type: 'object', additionalProperties: false, properties: { verdict: { type: 'string' } }, required: ['verdict'],
    })
  })

  it('carries a declared description through resolve and leaves an absent one undefined', async () => {
    const ctx = await mounted({ roles: CATALOG })
    expect(ctx.agentRoles.resolve('orchestrator').description).toBe('Plans work.')
    expect(ctx.agentRoles.resolve('worker').description).toBeUndefined()
  })

  it('returns detached snapshots a caller cannot write back through', async () => {
    const ctx = await mounted({ roles: CATALOG })
    const first = ctx.agentRoles.resolve('auditor')
    Object.assign(first, { label: 'Mutated' })
    const firstModel = first.model
    if (firstModel === undefined) throw new Error('auditor must declare a model route')
    Object.assign(firstModel, { provider: 'mutated-route' })
    const second = ctx.agentRoles.resolve('auditor')
    expect(second.label).toBe('Auditor')
    expect(second.model?.provider).toBe('mgoole')
    expect(second.model).not.toBe(firstModel)
    const efficient = ctx.agentRoles.resolve('efficient')
    const verdict = efficient.outputSchema?.properties?.verdict
    if (verdict === undefined) throw new Error('efficient must declare a verdict property')
    Object.assign(verdict, { type: 'number' })
    expect(ctx.agentRoles.resolve('efficient').outputSchema?.properties?.verdict?.type).toBe('string')
  })

  it('keeps valid roles readable when one live entry fails validation', async () => {
    const roles = createVolatile({ worker: definition() })
    const ctx = new Context()
    contexts.push(ctx)
    new AgentRoleRegistry(ctx, { roles })
    updateVolatile(roles, createVolatile({
      worker: definition(),
      bad: definition({ label: '' }),
    }))

    expect(ctx.agentRoles.snapshot()).toEqual({
      roles: [{ name: 'worker', label: 'Worker', model: { provider: 'worker-route', model: 'worker-1' }, context: 'fresh' }],
      invalid: [{ name: 'bad', code: 'ROLE_INVALID_CONFIG', message: 'role "bad" label must be a non-empty string' }],
    })
    expect(ctx.agentRoles.snapshot().roles.map(role => role.name)).toEqual(['worker'])
    expect(ctx.agentRoles.resolve('worker').label).toBe('Worker')
    expect(() => ctx.agentRoles.resolve('bad')).toThrow(/role "bad" label must be a non-empty string/)
    expect(ctx.agentRoles.has('worker')).toBe(true)
    expect(ctx.agentRoles.has('bad')).toBe(true)
    expect(ctx.agentRoles.has('missing')).toBe(false)
  })

  it('bounds a hostile live value failure retained for discovery', () => {
    const roles = createVolatile({ worker: definition() })
    const ctx = new Context()
    contexts.push(ctx)
    new AgentRoleRegistry(ctx, { roles })
    const hostile = {
      get label(): string {
        throw new Error(`line one\n${'x'.repeat(100_000)}`)
      },
    }
    updateVolatile(roles, { get: () => ({ worker: definition(), hostile }) })

    const invalid = ctx.agentRoles.snapshot().invalid
    expect(invalid).toHaveLength(1)
    expect(invalid[0]?.name).toBe('hostile')
    expect(invalid[0]?.message.length).toBeLessThanOrEqual(2048)
    expect(invalid[0]?.message).not.toContain('\n')
  })

  it('bounds a rejected role name retained for discovery', () => {
    const roles = createVolatile({ worker: definition() })
    const ctx = new Context()
    contexts.push(ctx)
    new AgentRoleRegistry(ctx, { roles })
    updateVolatile(roles, createVolatile({
      worker: definition(),
      ['x'.repeat(500)]: definition({ label: '' }),
    }))

    const invalid = ctx.agentRoles.snapshot().invalid[0]
    expect(invalid?.name).toHaveLength(256)
    expect(invalid?.name.endsWith('…')).toBe(true)
    expect(invalid?.message.length).toBeLessThanOrEqual(2048)
  })

  it('classifies a table-level read failure as a bounded catalog error', () => {
    const roles = createVolatile({ worker: definition() })
    const ctx = new Context()
    contexts.push(ctx)
    new AgentRoleRegistry(ctx, { roles })
    updateVolatile(roles, {
      get: () => new Proxy({}, {
        ownKeys(): never {
          throw new Error(`table read failed\n${'x'.repeat(100_000)}`)
        },
      }),
    })

    expect(() => ctx.agentRoles.snapshot()).toThrow(expect.objectContaining({
      code: 'ROLE_INVALID_CONFIG',
    }))
    try {
      ctx.agentRoles.snapshot()
      expect.unreachable('snapshot must reject an unreadable table')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRoleError)
      expect((error as AgentRoleError).message).toContain('agent roles could not be read')
      expect((error as AgentRoleError).message.length).toBeLessThanOrEqual(2048)
      expect((error as AgentRoleError).message).not.toContain('\n')
    }
  })

  it('throws ROLE_UNKNOWN for an undeclared role and reports undefined from tryResolve', async () => {
    const ctx = await mounted({ roles: CATALOG })
    try {
      ctx.agentRoles.resolve('nope')
      expect.unreachable('resolve must throw for an unknown role')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRoleError)
      expect((error as AgentRoleError).code).toBe('ROLE_UNKNOWN')
      expect((error as AgentRoleError).message).toBe('unknown agent role "nope"')
    }
    expect(ctx.agentRoles.tryResolve('nope')).toBeUndefined()
    expect(ctx.agentRoles.tryResolve('worker')?.name).toBe('worker')
  })

  it('lists resolved roles in one ordered detached read', async () => {
    const ctx = await mounted({ roles: CATALOG })
    const resolved = ctx.agentRoles.listResolved()
    expect(resolved.map(role => role.name)).toEqual(['auditor', 'efficient', 'orchestrator', 'worker'])
    expect(resolved.every(role => role.context !== undefined)).toBe(true)
    Object.assign(resolved[0]!.tags!, ['mutated'])
    expect(ctx.agentRoles.resolve('auditor').tags).toEqual(['review', 'safety'])
  })

  it('rejects a role name that would collide with an object prototype key', async () => {
    const roles: Record<string, RoleInput> = {}
    Object.defineProperty(roles, '__proto__', { value: role(), enumerable: true, configurable: true })
    await expect(mounted({ roles })).rejects.toThrow(/role name "__proto__" is reserved/)
    await expect(mounted({ roles: { constructor: role() } })).rejects.toThrow(/role name "constructor" is reserved/)
  })

  it('rejects a role name that would break one catalog line or escape its enum rendering', async () => {
    for (const name of ['two words', 'line\nbreak', 'tick`mark', 'quote"mark', 'back\\slash']) {
      await expect(mounted({ roles: { [name]: role() } })).rejects.toThrow(/must not contain whitespace, backticks, quotes, or backslashes/)
    }
  })

  it('leaves the model route absent when a role inherits the provider route', async () => {
    const ctx = await mounted({ roles: { inherited: { label: 'Inherited' } } })
    expect(ctx.agentRoles.resolve('inherited')).toEqual({
      name: 'inherited',
      label: 'Inherited',
      context: 'fresh',
    })
    expect(ctx.agentRoles.list()[0]).toEqual({
      name: 'inherited',
      label: 'Inherited',
      context: 'fresh',
      restricted: false,
      structuredOutput: false,
    })
  })

  it('treats prototype keys as undeclared roles', async () => {
    const ctx = await mounted({ roles: CATALOG })
    for (const name of ['constructor', '__proto__', 'toString']) {
      expect(ctx.agentRoles.tryResolve(name)).toBeUndefined()
      expect(ctx.agentRoles.has(name)).toBe(false)
      try {
        ctx.agentRoles.resolve(name)
        expect.unreachable('resolve must throw for a prototype key')
      } catch (error) {
        expect(error).toBeInstanceOf(AgentRoleError)
        expect((error as AgentRoleError).code).toBe('ROLE_UNKNOWN')
      }
    }
  })
})

describe('AgentRoleRegistry invalid tables', () => {
  it('fails at mount when a role declares an empty agent preset', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await expect(ctx.plugin(AgentRoleRegistry, { roles: { bad: role({ agentPreset: '' }) } }))
      .rejects.toThrow()
  })

  it('fails at mount when a fork role also declares an agent preset', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    try {
      await ctx.plugin(AgentRoleRegistry, {
        roles: { bad: role({ contextDefault: 'fork', agentPreset: 'reviewer' }) },
      })
      expect.unreachable('a fork role must not declare an agent preset')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRoleError)
      expect((error as AgentRoleError).code).toBe('ROLE_INVALID_CONFIG')
      expect((error as AgentRoleError).message).toMatch(/cannot combine contextDefault "fork" with agentPreset/)
    }
  })

  it('fails at mount when a role omits a required field or declares a negative depth', async () => {
    for (const roles of [
      { bad: { model: { provider: 'p', model: 'm' } } },
      { bad: { label: 'Bad', model: { model: 'm' } } },
      { bad: { label: 'Bad', model: { provider: 'p' } } },
      { bad: { label: 'Bad', model: { provider: 'p', model: 'm' }, delegationDepth: -1 } },
    ]) {
      const ctx = new Context()
      contexts.push(ctx)
      await expect(ctx.plugin(AgentRoleRegistry, { roles })).rejects.toThrow()
    }
  })

  it('reports ROLE_INVALID_CONFIG when a live table reaches the constructor', () => {
    const tables: Record<string, RoleDefinition>[] = [
      { bad: definition({ agentPreset: '' }) },
      { bad: definition({ label: '' }) },
      { bad: definition({ model: { provider: '', model: 'm' } }) },
      { bad: definition({ model: { provider: 'p', model: '' } }) },
      { bad: definition({ delegationDepth: -1 }) },
      { bad: definition({ model: { provider: 'p', model: 'm', maxTokens: 0 } }) },
      { bad: definition({ contextDefault: 'fork', agentPreset: 'reviewer' }) },
      { bad: definition({ outputSchema: { type: 'array' } as never }) },
      { '': definition() },
      { bad: null as never },
      { bad: [] as never },
      { bad: { model: { provider: 'p', model: 'm' } } as never },
      { bad: definition({ model: null as never }) },
      { bad: definition({ tags: null as never }) },
      { bad: definition({ tags: 'review' as never }) },
      { bad: definition({ descriptions: 'typo' } as never) },
      { bad: definition({ description: 42 as never }) },
      { bad: definition({ contextDefault: 'sideways' as never }) },
      { bad: definition({ model: { provider: 'p', model: 'm', reasoningEffort: '' } }) },
      { bad: definition({ description: 'x'.repeat(4097) }) },
      { bad: definition({ model: { provider: 'x'.repeat(257), model: 'm' } }) },
    ]
    for (const raw of tables) {
      try {
        constructed(raw)
        expect.unreachable('an invalid live table must fail at construction')
      } catch (error) {
        expect(error).toBeInstanceOf(AgentRoleError)
        expect((error as AgentRoleError).code).toBe('ROLE_INVALID_CONFIG')
      }
    }
  })

  it('keeps valid rows discoverable beside malformed live entries', () => {
    const roles = createVolatile({ worker: definition() })
    const ctx = new Context()
    contexts.push(ctx)
    new AgentRoleRegistry(ctx, { roles })

    updateVolatile(roles, createVolatile({
      worker: definition(),
      nullRole: null,
      arrayRole: [],
    }))

    const snapshot = ctx.agentRoles.snapshot()
    expect(snapshot.roles.map(role => role.name)).toEqual(['worker'])
    expect(snapshot.invalid.map(role => role.name)).toEqual(['arrayRole', 'nullRole'])
    expect(snapshot.invalid.map(role => role.code)).toEqual(['ROLE_INVALID_CONFIG', 'ROLE_INVALID_CONFIG'])
  })

  it('names the offending field in the construction failure message', () => {
    const badDefinition = (overrides: Partial<RoleDefinition>, pattern: RegExp): void => {
      expect(() => constructed({ bad: definition(overrides) })).toThrow(pattern)
    }
    badDefinition({ agentPreset: '' }, /role "bad" agentPreset must be a non-empty string/)
    badDefinition(
      { contextDefault: 'fork', agentPreset: 'reviewer' },
      /role "bad" cannot combine contextDefault "fork" with agentPreset/,
    )
    badDefinition({ label: '' }, /role "bad" label must be a non-empty string/)
    badDefinition({ model: { provider: '', model: 'm' } }, /role "bad" model.provider must be a non-empty string/)
    badDefinition({ model: { provider: 'p', model: '' } }, /role "bad" model.model must be a non-empty string/)
    badDefinition({ delegationDepth: -1 }, /role "bad" delegationDepth must be a non-negative safe integer/)
    badDefinition(
      { model: { provider: 'p', model: 'm', maxTokens: 0 } },
      /role "bad" model.maxTokens must be a positive safe integer/,
    )
    badDefinition({ outputSchema: { type: 'array' } as never }, /role "bad" outputSchema is invalid/)
    badDefinition({ tags: [''] }, /role "bad" tag must be a non-empty string/)
    badDefinition({ tags: ['two words'] }, /role "bad" tag "two words" must not contain whitespace/)
    badDefinition({ tags: ['x'.repeat(65)] }, /role "bad" tag must not exceed 64 characters/)
    badDefinition({ tags: ['review', 'review'] }, /role "bad" declares tag "review" more than once/)
    badDefinition(
      { tags: Array.from({ length: 17 }, (_, index) => `tag-${index}`) },
      /role "bad" tags must contain at most 16 entries/,
    )
    expect(() => constructed({ '': definition() }))
      .toThrow(/role name must be a non-empty string/)
    expect(() => constructed({ ['r'.repeat(257)]: definition() }))
      .toThrow(/role name must not exceed 256 characters/)
    expect(() => constructed({}, '')).toThrow(/agent-roles backingProvider must be a non-empty string/)
  })

  it('rejects unknown role fields instead of silently keeping their defaults', async () => {
    await expect(mounted({
      roles: { bad: { label: 'Bad', discription: 'misspelled' } },
    })).rejects.toThrow(
      'role "bad" role declares unknown field "discription"; supported fields are "label", "description", "tags", ',
    )
    expect(() => constructed({
      bad: { ...definition(), model: { provider: 'p', model: 'm', temperature: 0 } } as RoleDefinition,
    })).toThrow('role "bad" model declares unknown field "temperature"; supported fields are "provider", "model"')
  })
})

describe('AgentRoleRegistry.backingProviderFor', () => {
  it('returns the role provider or the deployment default', async () => {
    const ctx = await mounted({ roles: CATALOG })
    expect(ctx.agentRoles.backingProviderFor('auditor')).toBe('fork')
    expect(ctx.agentRoles.backingProviderFor('worker')).toBe('spawn')
  })

  it('rejects an unknown role instead of silently selecting the fallback', async () => {
    const ctx = await mounted({ roles: { worker: role() } })
    try {
      ctx.agentRoles.backingProviderFor('nope')
      expect.unreachable('backingProviderFor must reject an unknown role')
    } catch (error) {
      expect(error).toBeInstanceOf(AgentRoleError)
      expect((error as AgentRoleError).code).toBe('ROLE_UNKNOWN')
    }
  })

  it('returns a configured deployment default for a declared role', async () => {
    const ctx = await mounted({ roles: { worker: role() }, backingProvider: 'fork' })
    expect(ctx.agentRoles.backingProviderFor('worker')).toBe('fork')
  })
})
