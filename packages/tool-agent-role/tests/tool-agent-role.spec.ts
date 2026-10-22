import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import AgentRoleRegistry from '@deepseek-ai/dsh-experimental-agent-role'
import type { RoleDefinition } from '@deepseek-ai/dsh-experimental-agent-role'
// Vendor source, not a package dependency: the registry's schema input type
// rejects an intermediate typed role table, so specs construct it over a
// hand-written live table exactly as the agent-role registry spec does.
import { createVolatile, updateVolatile } from '../../../../vendor/cosmokit/src/volatile.ts'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { ResolvedSubagentStartRequest, SubagentCapabilities } from '@deepseek-ai/dsh-subagent'
import type { ToolExecutionToken } from '@deepseek-ai/dsh-tools'
import { mountWorkingDirectoryFixture } from '../../../subagent/subagent/tests/working-directory-fixture.ts'
import * as tool from '../src/index.ts'
import * as mock from './scripted-provider.ts'

const contexts = new Set<Context>()
afterEach(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
  contexts.clear()
})

const testToolSignal = new AbortController().signal

const REVIEWER: RoleDefinition = {
  label: 'Reviewer',
  description: 'Independent diff reviewer',
  tags: ['review', 'diff'],
  model: { provider: 'deepseek-official', model: 'deepseek-chat', reasoningEffort: 'high', maxTokens: 8192 },
  agentPreset: 'reviewer',
  backingProvider: 'mock',
  delegationDepth: 2,
}

const SUMMARIZER: RoleDefinition = {
  label: 'Summarizer',
  description: 'Summarizes the completed conversation prefix',
  model: { provider: 'deepseek-official', model: 'deepseek-chat' },
  contextDefault: 'fork',
}

/** Minimal adapter that resolves exactly one advertised route. */
class RouteAdapter extends LlmAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    if (provider !== 'deepseek-official' || model !== 'deepseek-chat') {
      return Promise.reject(new Error(`unknown route ${provider}/${model}`))
    }
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      reasoning: { efforts: [{ id: ReasoningEffortId('high'), name: 'High' }] },
    })
  }

  async * stream(): AsyncIterable<never> {
    throw new Error('RouteAdapter does not stream')
  }
}

/** Register one route plus the preset registry used by the role tool. */
async function mountRoleServices(ctx: Context, options: { route?: boolean; presets?: string[] } = {}): Promise<void> {
  if (options.route !== false) ctx.llm.registerAdapter(['deepseek-official'], new RouteAdapter())
  if (options.presets !== undefined) {
    await ctx.plugin(Loader)
    await ctx.plugin(AgentPresets, { default: options.presets[0] ?? 'reviewer' })
    for (const id of options.presets) await ctx.agentPresets.register({ id, plugins: [] })
  }
}

let agentCounter = 0

/** Mount the real catalog, subagent runtime, and tool over two scripted providers. */
async function setup(options: {
  roles?: Record<string, RoleDefinition>
  capabilities?: Partial<SubagentCapabilities>
  inheritsParentContext?: boolean
  onStart?: (request: ResolvedSubagentStartRequest) => Promise<void> | void
  onForkStart?: (request: ResolvedSubagentStartRequest) => Promise<void> | void
  config?: tool.Config
  services?: { route?: boolean; presets?: string[] }
} = {}): Promise<{ ctx: Context; parent: Agent }> {
  const ctx = new Context()
  contexts.add(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await mountRoleServices(ctx, options.services ?? { presets: ['reviewer'] })
  await ctx.plugin(AgentLoop, { agents: [] })
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  await mock.mountScriptedProvider(ctx, {
    name: 'mock',
    agentRouteDefaults: { provider: 'deepseek-official', model: 'deepseek-chat' },
    ...options.capabilities === undefined ? {} : { capabilities: options.capabilities },
    ...options.inheritsParentContext === undefined ? {} : { inheritsParentContext: options.inheritsParentContext },
    ...options.onStart === undefined ? {} : { onStart: options.onStart },
  })
  await mock.mountScriptedProvider(ctx, {
    name: 'fork-mock',
    inheritsParentContext: true,
    ...options.onForkStart === undefined ? {} : { onStart: options.onForkStart },
  })
  new AgentRoleRegistry(ctx, { roles: createVolatile(options.roles ?? { reviewer: REVIEWER, summarizer: SUMMARIZER }) })
  await ctx.plugin(tool, options.config ?? {})
  const handle = await ctx.agents.create({ sessionId: SessionId(`role-agent-${++agentCounter}`) })
  return { ctx, parent: handle.agent }
}

let callCounter = 0

/** Execute the registered role tool through the real ToolRuntime pipeline. */
function callRole(
  ctx: Context,
  args: unknown,
  over: { agent?: Agent | undefined } = {},
) {
  const agent = 'agent' in over ? over.agent : undefined
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId(`role-call-${++callCounter}`),
    name: 'role_agent',
    arguments: args,
    ...agent === undefined ? {} : { agent },
  })
}

function text(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe('dsh-experimental-tool-agent-role', () => {
  it('exposes the role tool with runtime role resolution and a discovery companion', async () => {
    const { ctx } = await setup()
    const schema = ctx.tools.schemas().find(entry => entry.name === 'role_agent')
    expect(schema).toBeDefined()
    const properties = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['cwd', 'label', 'prompt', 'role'])
    expect(properties.role).toMatchObject({ type: 'string' })
    expect(properties.role).toMatchObject({ maxLength: 256 })
    expect(properties.label).toMatchObject({ type: 'string', maxLength: 256 })
    expect(properties.role).not.toHaveProperty('enum')
    expect(ctx.tools.schemas().map(entry => entry.name)).toContain('list_agent_roles')
    const discovery = ctx.tools.schemas().find(entry => entry.name === 'list_agent_roles')
    const discoveryProperties = (discovery!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(discoveryProperties.role).toMatchObject({ type: 'string', maxLength: 256 })
    expect(discoveryProperties.query).toMatchObject({ type: 'string', maxLength: 512 })
    expect(ctx.tools.get('list_agent_roles')?.output.schema.properties?.entries?.items?.properties?.executionBudget)
      .toMatchObject({
        type: 'object',
        additionalProperties: false,
        properties: { wallClockMs: { type: 'number' } },
      })
    expect(schema!.description).toContain('`reviewer` (Reviewer): Independent diff reviewer')
    expect(schema!.description).toContain('deepseek-official/deepseek-chat')
  })

  it('lists roles compactly, narrows by query, and diagnoses one role on demand', async () => {
    const { ctx, parent } = await setup({ config: { forkProvider: 'fork-mock' } })
    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const listed = await call({})
    if (listed.isError) throw new Error(text(listed))
    expect(listed.value).toMatchObject({
      kind: 'roles',
      total: 2,
      truncated: false,
    })
    const entries = (listed.value as {
      entries: { name: string; health: string; healthScope: string; description?: string }[]
    }).entries
    expect(entries.map(entry => entry.name)).toEqual(['reviewer', 'summarizer'])
    expect(entries.every(entry => entry.health === 'ok')).toBe(true)
    expect(entries.every(entry => entry.healthScope === 'static')).toBe(true)
    expect(entries.every(entry => entry.description === undefined)).toBe(true)
    expect(text(listed)).toContain('reviewer — Reviewer, fresh, ok, static, mock')
    expect(text(listed)).toContain('static health does not resolve model routes')

    const queried = await call({ query: 'diff' })
    if (queried.isError) throw new Error(text(queried))
    expect((queried.value as { entries: { name: string }[] }).entries.map(entry => entry.name))
      .toEqual(['reviewer'])

    const byTag = await call({ query: 'review' })
    if (byTag.isError) throw new Error(text(byTag))
    const byTagEntry = (byTag.value as { entries: { name: string; tags?: string[] }[] }).entries[0]!
    expect(byTagEntry.name).toBe('reviewer')
    expect(byTagEntry.tags).toBeUndefined()

    const noMatch = await call({ query: 'nonexistent-role' })
    if (noMatch.isError) throw new Error(text(noMatch))
    expect((noMatch.value as { entries: unknown[] }).entries).toEqual([])
    expect((noMatch.value as { availableRoles?: string[] }).availableRoles).toEqual(['reviewer', 'summarizer'])
    expect(text(noMatch)).toContain('no agent roles match query "nonexistent-role"')
    expect(text(noMatch)).toContain('Declared roles: reviewer, summarizer')
    expect(text(noMatch)).toContain('without a query')

    const detailed = await call({ role: 'reviewer' })
    if (detailed.isError) throw new Error(text(detailed))
    const detailedEntries = (detailed.value as {
      entries: { name: string; description?: string; tags?: string[]; healthScope: string }[]
    }).entries
    expect(detailedEntries).toMatchObject([{
      name: 'reviewer',
      description: 'Independent diff reviewer',
      tags: ['review', 'diff'],
      healthScope: 'full',
    }])
    expect(text(detailed)).toContain('reviewer — Reviewer, fresh, ok, full, mock')
    expect(text(detailed)).toContain('tags review, diff')
  })

  it('ranks exact names before prefixes, labels, tags, and descriptions', async () => {
    const { ctx, parent } = await setup({
      roles: {
        review: { label: 'Description match', description: 'review', backingProvider: 'mock' },
        reviewer: { label: 'Prefix match', tags: ['review'], backingProvider: 'mock' },
        inspector: { label: 'Review label', description: 'inspects a change', backingProvider: 'mock' },
        audit: { label: 'Audit', tags: ['review'], backingProvider: 'mock' },
      },
    })
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-rank-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: { query: 'review' },
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    const entries = (result.value as { entries: { name: string }[] }).entries
    expect(entries.slice(0, 2).map(entry => entry.name)).toEqual(['review', 'reviewer'])
    expect(entries.slice(2).map(entry => entry.name).sort()).toEqual(['audit', 'inspector'])
  })

  it('matches a query through a tag alone and returns tags only on exact lookup', async () => {
    const { ctx, parent } = await setup({
      roles: {
        reviewer: { label: 'Reviewer', tags: ['security'], backingProvider: 'mock' },
        summarizer: SUMMARIZER,
      },
    })
    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-tag-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const matched = await call({ query: 'SECURITY' })
    if (matched.isError) throw new Error(text(matched))
    expect((matched.value as { entries: { name: string }[] }).entries.map(entry => entry.name))
      .toEqual(['reviewer'])

    const detailed = await call({ role: 'reviewer' })
    if (detailed.isError) throw new Error(text(detailed))
    expect((detailed.value as { entries: { tags?: string[] }[] }).entries[0]?.tags).toEqual(['security'])
  })

  it('rejects role and query arguments above their protocol limits without echoing them', async () => {
    const { ctx, parent } = await setup()
    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-limit-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const longRole = 'r'.repeat(257)
    const oversizedRole = await call({ role: longRole })
    expect(oversizedRole.isError).toBe(true)
    expect(text(oversizedRole)).toContain('role exceeds 256 characters')
    expect(text(oversizedRole)).not.toContain(longRole)

    const longQuery = 'q'.repeat(513)
    const oversizedQuery = await call({ query: longQuery })
    expect(oversizedQuery.isError).toBe(true)
    expect(text(oversizedQuery)).toContain('query exceeds 512 characters')
    expect(text(oversizedQuery)).not.toContain(longQuery)

    const delegated = await callRole(ctx, { role: 'r'.repeat(257), prompt: 'do work' }, { agent: parent })
    expect(delegated.isError).toBe(true)
    expect(text(delegated)).toContain('role exceeds 256 characters')

    const normal = await call({ query: 'diff' })
    expect(normal.isError).toBe(false)
    expect((normal.value as { entries: { name: string }[] }).entries.map(entry => entry.name))
      .toEqual(['reviewer'])
  })

  it('bounds a discovery page by rendered characters and resumes at the reported offset', async () => {
    const roles = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [
      `budget-${String(index).padStart(2, '0')}`,
      {
        label: `Role ${index} ${'x'.repeat(240)}`,
        description: `Description ${index} ${'d'.repeat(4080)}`,
        model: { provider: 'p'.repeat(256), model: 'm'.repeat(256) },
        agentPreset: 'a'.repeat(256),
        backingProvider: 'mock',
      },
    ]))
    const { ctx, parent } = await setup({ roles })
    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-budget-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const first = await call({})
    if (first.isError) throw new Error(text(first))
    const page = first.value as {
      entries: { name: string }[]
      total: number
      offset: number
      truncated: boolean
    }
    expect(page.total).toBe(20)
    expect(page.truncated).toBe(true)
    expect(page.entries.length).toBeGreaterThanOrEqual(1)
    expect(page.entries.length).toBeLessThan(20)
    expect(text(first).length).toBeLessThanOrEqual(16384)
    expect(text(first)).toContain(`pass offset ${page.entries.length} for the next page`)

    const next = await call({ offset: page.entries.length })
    if (next.isError) throw new Error(text(next))
    const nextPage = next.value as {
      entries: { name: string }[]
      offset: number
      truncated: boolean
    }
    expect(nextPage.offset).toBe(page.entries.length)
    expect(nextPage.entries[0]?.name).toBe(`budget-${String(page.entries.length).padStart(2, '0')}`)
    expect(text(next).length).toBeLessThanOrEqual(16384)

    const detailed = await call({ role: 'budget-00' })
    if (detailed.isError) throw new Error(text(detailed))
    expect(text(detailed)).toContain(`Description 0 ${'d'.repeat(4080)}`)
    expect(text(detailed).length).toBeLessThanOrEqual(16384)
  })

  it('returns the first oversized discovery row instead of looping on an empty page', async () => {
    const { ctx, parent } = await setup()
    const role = ctx.agentRoles.resolve('reviewer')
    vi.spyOn(ctx.agentRoles, 'snapshot').mockReturnValue({
      roles: [
        { ...role, name: 'hugeOne', label: `One ${'x'.repeat(20000)}` },
        { ...role, name: 'hugeTwo', label: `Two ${'y'.repeat(20000)}` },
      ],
      invalid: [],
    })
    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-huge-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const first = await call({})
    if (first.isError) throw new Error(text(first))
    const page = first.value as {
      entries: { name: string }[]
      total: number
      truncated: boolean
    }
    expect(page.total).toBe(2)
    expect(page.entries).toHaveLength(1)
    expect(page.truncated).toBe(true)
    expect(text(first)).toContain('pass offset 1 for the next page')

    const second = await call({ offset: 1 })
    if (second.isError) throw new Error(text(second))
    const secondPage = second.value as { entries: { name: string }[]; truncated: boolean }
    expect(secondPage.entries.map(entry => entry.name)).toEqual(['hugeTwo'])
    expect(secondPage.truncated).toBe(false)
  })

  it('reports a role whose backing provider is missing without failing the list', async () => {
    const { ctx, parent } = await setup({
      roles: {
        reviewer: REVIEWER,
        detached: { label: 'Detached', backingProvider: 'missing' },
      },
      services: { presets: ['reviewer'] },
    })
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-missing-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: { role: 'detached' },
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    const entry = (result.value as {
      entries: { name: string; health: string; problemCode?: string; problem?: string }[]
    }).entries[0]!
    expect(entry).toMatchObject({
      name: 'detached',
      health: 'invalid',
      problemCode: 'ROLE_INVALID_CONFIG',
    })
    expect(entry.problem).toContain('"missing"')
    expect(text(result)).toContain('problem (ROLE_INVALID_CONFIG):')
  })

  it('includes a malformed declaration in the no-match recovery roster', async () => {
    const roles = createVolatile({
      broken: { label: 'Broken', backingProvider: 'mock' },
    })
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await mountRoleServices(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'mock' })
    new AgentRoleRegistry(ctx, { roles })
    await ctx.plugin(tool, {})
    const parent = (await ctx.agents.create({ sessionId: SessionId(`broken-roster-${++agentCounter}`) })).agent
    updateVolatile(roles, createVolatile({ broken: { label: '' } }))

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-invalid-roster-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: { query: 'nothing-matches' },
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    expect(result.value).toMatchObject({ entries: [], availableRoles: ['broken'] })
    expect(text(result)).toContain('Declared roles: broken')
  })

  it('keeps a declared name with line breaks on one discovery row', async () => {
    const roles = createVolatile({ reviewer: REVIEWER })
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await mountRoleServices(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'mock' })
    new AgentRoleRegistry(ctx, { roles })
    await ctx.plugin(tool, {})
    const parent = (await ctx.agents.create({ sessionId: SessionId(`forged-role-${++agentCounter}`) })).agent
    updateVolatile(roles, createVolatile({ 'bad\nFORGED': { label: '' } }))
    ctx.emit('loader/volatile-update', [['roles']])

    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-forged-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const result = await call({})
    if (result.isError) throw new Error(text(result))
    const rendered = text(result)
    const lines = rendered.split('\n')
    expect(lines.filter(line => line.includes(' — '))).toHaveLength(1)
    expect(lines.some(line => line.startsWith('FORGED'))).toBe(false)
    expect(rendered).toContain('bad FORGED — invalid, static')
    expect(rendered).toContain('inline role catalog is stale and still shows an older list: role bad FORGED failed validation')
    expect(rendered.split('\n').some(line => line.startsWith('FORGED'))).toBe(false)
    expect(result.value).toMatchObject({ entries: [{ name: 'bad FORGED', health: 'invalid' }] })

    const exact = await call({ role: 'bad\nFORGED' })
    if (exact.isError) throw new Error(text(exact))
    expect(exact.value).toMatchObject({ entries: [{ name: 'bad FORGED', health: 'invalid' }] })
    expect(text(exact).split('\n').some(line => line.startsWith('FORGED'))).toBe(false)

    const unknown = await call({ role: 'missing' })
    expect(unknown.isError).toBe(true)
    expect(text(unknown)).toContain('declared roles: bad FORGED')
    expect(text(unknown).split('\n').some(line => line.startsWith('FORGED'))).toBe(false)

    const noMatch = await call({ query: 'nothing-matches' })
    if (noMatch.isError) throw new Error(text(noMatch))
    expect(text(noMatch)).toContain('Declared roles: bad FORGED')
    expect(text(noMatch).split('\n').some(line => line.startsWith('FORGED'))).toBe(false)
    expect(noMatch.value).toMatchObject({ availableRoles: ['bad FORGED'] })
  })

  it('bounds a hostile invalid-role message inside the discovery page budget', async () => {
    const roles = createVolatile({ reviewer: REVIEWER })
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await mountRoleServices(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'mock' })
    new AgentRoleRegistry(ctx, { roles })
    await ctx.plugin(tool, {})
    const parent = (await ctx.agents.create({ sessionId: SessionId(`hostile-role-${++agentCounter}`) })).agent
    const hostile = {
      get label(): string {
        throw new Error(`label\nFORGED ${'x'.repeat(100_000)}`)
      },
    }
    updateVolatile(roles, { get: () => ({ reviewer: REVIEWER, hostile }) })

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-hostile-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: {},
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    const rendered = text(result)
    expect(rendered.length).toBeLessThanOrEqual(16384)
    expect(rendered.split('\n').some(line => line.startsWith('FORGED'))).toBe(false)
    const entry = (result.value as { entries: { name: string; problem?: string }[] })
      .entries.find(candidate => candidate.name === 'hostile')
    expect(entry?.problem).toBeDefined()
    expect(entry?.problem?.length).toBeLessThanOrEqual(2048)
  })

  it('pages through a roster wider than one discovery result', async () => {
    const roles = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [
      `role-${String(index).padStart(2, '0')}`,
      { label: `Role ${index}`, backingProvider: 'mock' },
    ]))
    const { ctx, parent } = await setup({ roles })
    const call = (args: unknown) => ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-page-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: args,
      agent: parent,
    })

    const first = await call({})
    if (first.isError) throw new Error(text(first))
    expect(first.value).toMatchObject({ total: 51, offset: 0, truncated: true })
    const firstEntries = (first.value as { entries: { name: string }[] }).entries
    expect(firstEntries).toHaveLength(50)
    expect(firstEntries.at(-1)?.name).toBe('role-49')
    expect(text(first)).toContain('pass offset 50 for the next page')

    const second = await call({ offset: 50 })
    if (second.isError) throw new Error(text(second))
    expect(second.value).toMatchObject({ total: 51, offset: 50, truncated: false })
    expect((second.value as { entries: { name: string }[] }).entries.map(entry => entry.name))
      .toEqual(['role-50'])

    const pastEnd = await call({ offset: 51 })
    expect(pastEnd.isError).toBe(true)
    expect(text(pastEnd)).toContain('offset 51 is beyond the 51 matching agent roles')
  })

  it('honors a configured discovery page size and rejects a non-positive one', async () => {
    const roles = Object.fromEntries(Array.from({ length: 3 }, (_, index) => [
      `role-${index}`,
      { label: `Role ${index}`, backingProvider: 'mock' },
    ]))
    const { ctx, parent } = await setup({ roles, config: { discoveryPageSize: 2 } })
    const first = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-page-size-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: {},
      agent: parent,
    })
    if (first.isError) throw new Error(text(first))
    expect(first.value).toMatchObject({ total: 3, offset: 0, truncated: true })
    expect((first.value as { entries: unknown[] }).entries).toHaveLength(2)

    const second = await setup({ roles, config: { discoveryPageSize: 0 } }).catch((error: unknown) => error)
    expect(second).toBeInstanceOf(Error)
    expect((second as Error).message).toContain('discoveryPageSize')
  })

  it('registers when the catalog is empty without a role enum', async () => {
    const { ctx, parent } = await setup({ roles: {} })
    const schema = ctx.tools.schemas().find(entry => entry.name === 'role_agent')
    expect(schema).toBeDefined()
    expect(schema!.description).toContain('This deployment declares no agent roles.')
    const properties = (schema!.parameters as { properties?: Record<string, unknown> }).properties ?? {}
    expect(properties.role).toMatchObject({ type: 'string' })
    expect(properties.role).not.toHaveProperty('enum')

    const listed = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-empty-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: {},
      agent: parent,
    })
    if (listed.isError) throw new Error(text(listed))
    expect(listed.value).toMatchObject({ kind: 'roles', entries: [], total: 0, offset: 0, truncated: false, availableRoles: [] })
    expect(text(listed)).toBe('This deployment declares no agent roles.')

    const pastEnd = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-empty-offset-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: { offset: 1 },
      agent: parent,
    })
    expect(pastEnd.isError).toBe(true)
    expect(text(pastEnd)).toContain('offset 1 is beyond the 0 matching agent roles; this deployment declares no roles')
  })

  it('shortens an oversized exact-detail description once instead of looping', async () => {
    const { ctx, parent } = await setup({ roles: { reviewer: REVIEWER } })
    const role = ctx.agentRoles.resolve('reviewer')
    vi.spyOn(ctx.agentRoles, 'snapshot').mockReturnValue({
      roles: [{ ...role, description: 'd'.repeat(20000) }],
      invalid: [],
    })
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-detail-budget-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: { role: 'reviewer' },
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    const description = (result.value as { entries: { description?: string }[] }).entries[0]?.description ?? ''
    expect(description.endsWith('… (description truncated)')).toBe(true)
    expect(text(result).length).toBeLessThanOrEqual(16384)
  })

  it('truncates an oversized description without splitting a surrogate pair', async () => {
    const { ctx, parent } = await setup({ roles: { reviewer: REVIEWER } })
    const role = ctx.agentRoles.resolve('reviewer')
    vi.spyOn(ctx.agentRoles, 'snapshot').mockReturnValue({
      roles: [{ ...role, description: '😀'.repeat(10000) }],
      invalid: [],
    })
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-detail-surrogate-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: { role: 'reviewer' },
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    const description = (result.value as { entries: { description?: string }[] }).entries[0]?.description ?? ''
    expect(description.endsWith('… (description truncated)')).toBe(true)
    expect(description).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u)
    expect(text(result).length).toBeLessThanOrEqual(16384)
  })

  it('rebuilds the tool definition when a volatile catalog edit changes roles', async () => {
    const roles = createVolatile({ reviewer: REVIEWER })
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await mountRoleServices(ctx, { presets: ['reviewer'] })
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'mock' })
    new AgentRoleRegistry(ctx, { roles })
    await ctx.plugin(tool, {})

    expect(ctx.tools.get('role_agent')?.parameters).toMatchObject({ properties: { role: { type: 'string' } } })
    updateVolatile(roles, createVolatile({
      reviewer: { ...REVIEWER, executionBudget: { wallClockMs: 30_000 } },
      auditor: { label: 'Auditor', description: 'Checks the change', backingProvider: 'mock', contextDefault: 'fork' },
    }))
    ctx.emit('loader/volatile-update', [['roles']])

    const schema = ctx.tools.schemas().find(entry => entry.name === 'role_agent')
    expect(schema!.description).toContain('`auditor` (Auditor): Checks the change')
    expect(schema!.description).toContain('wall-clock budget 30000 ms (expiry stops the child)')
    expect(schema!.parameters).toMatchObject({ properties: { role: { type: 'string' } } })
  })

  it('forwards a declared outputSchema and reports it in the role catalog', async () => {
    const outputSchema = {
      type: 'object' as const,
      additionalProperties: false,
      properties: { verdict: { type: 'string' as const } },
      required: ['verdict'],
    }
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { reviewer: { ...REVIEWER, outputSchema } },
      onStart: (request) => { seen = request },
    })

    const result = await callRole(ctx, { role: 'reviewer', prompt: 'review' }, { agent: parent })
    if (result.isError) throw new Error(text(result))
    expect(result.isError).toBe(false)
    expect(seen?.outputSchema).toEqual(outputSchema)
    const schema = ctx.tools.schemas().find(entry => entry.name === 'role_agent')
    expect(schema!.description).toContain('structured result')
  })

  it('rejects an unregistered preset before starting the child', async () => {
    let started = false
    const { ctx, parent } = await setup({
      services: { presets: [] },
      onStart: () => { started = true },
    })
    const result = await callRole(ctx, { role: 'reviewer', prompt: 'review' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('agentPreset "reviewer"')
    expect(started).toBe(false)
  })

  it('rejects a preset role when the preset registry is not mounted', async () => {
    const { ctx, parent } = await setup({ services: {} })
    const result = await callRole(ctx, { role: 'reviewer', prompt: 'review' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('agent-presets service is not mounted')
  })

  it('preflights a declared model route before starting the child', async () => {
    let started = false
    const { ctx, parent } = await setup({
      roles: {
        detached: {
          label: 'Detached',
          model: { provider: 'missing', model: 'nope' },
          backingProvider: 'mock',
        },
      },
      onStart: () => { started = true },
    })
    const result = await callRole(ctx, { role: 'detached', prompt: 'review' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('missing/nope')
    expect(started).toBe(false)
  })

  it('leaves route validation to an external provider that owns its route', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { external: { label: 'External', model: { provider: 'external-route', model: 'external-model' }, backingProvider: 'external' } },
      onStart: (request) => { seen = request },
    })
    await mock.mountScriptedProvider(ctx, { name: 'external', onStart: (request) => { seen = request } })

    const result = await callRole(ctx, { role: 'external', prompt: 'review' }, { agent: parent })
    if (result.isError) throw new Error(text(result))
    expect(seen?.agentOptions).toMatchObject({ provider: 'external-route', model: 'external-model' })
  })

  it('preflights a declared route for a local provider without agentRouteDefaults', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await mountRoleServices(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    const sessions: string[] = []
    ctx.on('session/created', session => void sessions.push(session.id))
    await mock.mountLocalProvider(ctx, { name: 'local' })
    new AgentRoleRegistry(ctx, {
      roles: createVolatile({
        detached: {
          label: 'Detached',
          model: { provider: 'missing', model: 'nope' },
          backingProvider: 'local',
          delegationDepth: 1,
        },
      }),
    })
    await ctx.plugin(tool, {})
    const { agent: parent } = await ctx.agents.create({ sessionId: SessionId(`role-local-${++agentCounter}`) })

    const result = await callRole(ctx, { role: 'detached', prompt: 'review' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('agent role "detached" declares model "missing/nope"')
    expect(sessions.every(id => !id.startsWith('scripted-subagent:local:'))).toBe(true)
  })

  it('preserves cancellation during model-route preflight', async () => {
    let started = false
    const { ctx, parent } = await setup({
      services: { route: false, presets: ['reviewer'] },
      onStart: () => { started = true },
    })
    const controller = new AbortController()
    const definition = ctx.tools.get('role_agent')!
    class CancellingAdapter extends LlmAdapter {
      override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
        controller.abort(new Error('caller cancelled'))
        return Promise.resolve({ provider, id: model, name: model })
      }

      async * stream(): AsyncIterable<never> {
        throw new Error('CancellingAdapter does not stream')
      }
    }
    ctx.llm.registerAdapter(['deepseek-official'], new CancellingAdapter())
    let failure: unknown
    try {
      await definition.execute(
        { role: 'reviewer', prompt: 'review' },
        {
          callId: ToolCallId('role-preflight'),
          rootCallId: ToolCallId('role-preflight'),
          token: Symbol('role-preflight') as ToolExecutionToken,
          name: 'role_agent',
          arguments: { role: 'reviewer', prompt: 'review' },
          agent: parent,
          signal: controller.signal,
          deferContext() {},
          concludeTurn() {},
        },
      )
    } catch (error: unknown) {
      failure = error
    }
    expect(failure).toEqual(new Error('caller cancelled'))
    expect(started).toBe(false)
  })

  it('preserves cancellation while a preset preflight is still pending', async () => {
    let started = false
    const { ctx, parent } = await setup({
      services: { presets: ['reviewer'] },
      onStart: () => { started = true },
    })
    const pending = Promise.withResolvers<never>()
    vi.spyOn(ctx.agentPresets, 'resolve').mockReturnValue(pending.promise)
    const controller = new AbortController()
    const definition = ctx.tools.get('role_agent')!
    const call = definition.execute(
      { role: 'reviewer', prompt: 'review' },
      {
        callId: ToolCallId('role-preset-preflight'),
        rootCallId: ToolCallId('role-preset-preflight'),
        token: Symbol('role-preset-preflight') as ToolExecutionToken,
        name: 'role_agent',
        arguments: { role: 'reviewer', prompt: 'review' },
        agent: parent,
        signal: controller.signal,
        deferContext() {},
        concludeTurn() {},
      },
    )
    controller.abort(new Error('caller cancelled'))
    await expect(call).rejects.toEqual(new Error('caller cancelled'))
    expect(started).toBe(false)
  })

  it('resolves a fresh preset role into the exact startActivation fields', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({ onStart: (request) => { seen = request } })

    const result = await callRole(ctx, { role: 'reviewer', prompt: 'review the diff' }, { agent: parent })

    if (result.isError) throw new Error(text(result))
    expect(result.isError).toBe(false)
    expect(result.value).toHaveProperty('kind', 'activation')
    expect(result.value).toHaveProperty('subagentId', expect.any(String))
    expect(result.value).toMatchObject({
      role: 'reviewer',
      context: 'fresh',
      provider: 'mock',
      model: 'deepseek-official/deepseek-chat',
      agentPreset: 'reviewer',
    })
    expect(text(result)).toMatch(/^started subagent .*\(reviewer, fresh, mock, deepseek-official\/deepseek-chat, preset reviewer\)/)

    expect(seen?.parent).toBe(parent)
    expect(seen?.prompt).toEqual([{ type: 'text', text: 'review the diff' }])
    expect(seen?.agentOptions).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-chat',
      reasoningEffort: 'high',
      maxTokens: 8192,
    })
    expect(seen?.agentPreset).toBe('reviewer')
    expect(seen?.maxDepth).toBe(2)
    expect(seen).not.toHaveProperty('persona')
    expect(seen).not.toHaveProperty('toolFilter')
  })

  it('forwards a role execution budget to the activation request', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { reviewer: { ...REVIEWER, executionBudget: { wallClockMs: 25_000 } } },
      onStart: (request) => { seen = request },
    })

    const result = await callRole(ctx, { role: 'reviewer', prompt: 'bounded review' }, { agent: parent })

    expect(result.isError).toBe(false)
    expect(seen?.executionBudget).toEqual({ wallClockMs: 25_000 })

    const listed = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-discovery-budget-${++callCounter}`),
      name: 'list_agent_roles',
      arguments: {},
      agent: parent,
    })
    if (listed.isError) throw new Error(text(listed))
    expect((listed.value as { entries: { name: string; executionBudget?: unknown }[] }).entries)
      .toContainEqual(expect.objectContaining({
        name: 'reviewer',
        executionBudget: { wallClockMs: 25_000 },
      }))
    expect(text(listed)).toContain('wall-clock budget 25000 ms (expiry stops the child)')
  })

  it('defaults the child label to the role label and honors an explicit label', async () => {
    const labels: (string | undefined)[] = []
    const { ctx, parent } = await setup({ onStart: (request) => { labels.push(request.label) } })
    await callRole(ctx, { role: 'reviewer', prompt: 'first' }, { agent: parent })
    await callRole(ctx, { role: 'reviewer', prompt: 'second', label: 'custom label' }, { agent: parent })
    expect(labels).toEqual(['Reviewer', 'custom label'])
  })

  it('routes concurrent calls independently by their own role context', async () => {
    const starts: { provider: string; prompt: string }[] = []
    const { ctx, parent } = await setup({
      roles: { reviewer: REVIEWER, summarizer: SUMMARIZER },
      config: { forkProvider: 'fork-mock' },
      onStart: (request) => {
        starts.push({ provider: 'mock', prompt: request.prompt[0]?.type === 'text' ? request.prompt[0].text : '' })
      },
      onForkStart: (request) => {
        starts.push({ provider: 'fork-mock', prompt: request.prompt[0]?.type === 'text' ? request.prompt[0].text : '' })
      },
    })

    const [fresh, fork] = await Promise.all([
      callRole(ctx, { role: 'reviewer', prompt: 'review in parallel' }, { agent: parent }),
      callRole(ctx, { role: 'summarizer', prompt: 'summarize in parallel' }, { agent: parent }),
    ])
    if (fresh.isError) throw new Error(text(fresh))
    if (fork.isError) throw new Error(text(fork))
    expect(fresh.value).toMatchObject({ role: 'reviewer', context: 'fresh', provider: 'mock' })
    expect(fork.value).toMatchObject({ role: 'summarizer', context: 'fork', provider: 'fork-mock' })
    expect((fresh.value as { subagentId: string }).subagentId)
      .not.toBe((fork.value as { subagentId: string }).subagentId)
    expect(starts).toEqual(expect.arrayContaining([
      { provider: 'mock', prompt: 'review in parallel' },
      { provider: 'fork-mock', prompt: 'summarize in parallel' },
    ]))
  })

  it('selects the configured fork provider for a fork role and omits agentPreset', async () => {
    const started: string[] = []
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { summarizer: SUMMARIZER },
      config: { forkProvider: 'fork-mock' },
      onStart: () => { started.push('mock') },
      onForkStart: (request) => {
        started.push('fork-mock')
        seen = request
      },
    })

    const result = await callRole(ctx, { role: 'summarizer', prompt: 'summarize' }, { agent: parent })
    if (result.isError) throw new Error(text(result))
    expect(result.isError).toBe(false)

    expect(started).toEqual(['fork-mock'])
    expect(seen?.agentPreset).toBeUndefined()
    expect(seen?.prompt).toEqual([{ type: 'text', text: 'summarize' }])
  })

  it('uses an explicit backing provider for a fork role', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { summarizer: { ...SUMMARIZER, backingProvider: 'fork-mock' } },
      onForkStart: (request) => { seen = request },
    })

    const result = await callRole(ctx, { role: 'summarizer', prompt: 'summarize' }, { agent: parent })
    if (result.isError) throw new Error(text(result))
    expect(result.isError).toBe(false)
    expect(seen?.agentPreset).toBeUndefined()
  })

  it('rejects a fresh role whose explicit provider inherits the parent context', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'mock' })
    await mock.mountScriptedProvider(ctx, { name: 'fork-mock', inheritsParentContext: true })
    new AgentRoleRegistry(ctx, {
      roles: createVolatile({ reviewer: { ...REVIEWER, backingProvider: 'fork-mock' } }),
    })
    const mounted = ctx.plugin(tool, {})
    await expect(mounted).rejects.toThrow(/agent role "reviewer".*"fork-mock".*inherits the parent context/s)
  })

  it('rejects a fork role that declares an Agent Preset at catalog load', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    expect(() => new AgentRoleRegistry(ctx, {
      roles: createVolatile({ summarizer: { ...SUMMARIZER, agentPreset: 'reviewer' } }),
    })).toThrow(/cannot combine contextDefault "fork" with agentPreset/)
  })

  it('rejects a role whose provider does not support Agent Presets', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'mock', capabilities: { agentPreset: false } })
    new AgentRoleRegistry(ctx, { roles: createVolatile({ reviewer: REVIEWER }) })
    const mounted = ctx.plugin(tool, {})
    await expect(mounted).rejects.toThrow(/agent role "reviewer" needs .*`agentPreset`.*"mock"/s)
  })

  it('preflights the remaining provider capabilities the role needs', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, {
      name: 'mock',
      capabilities: { agentOptions: false, depthLimit: false },
    })
    new AgentRoleRegistry(ctx, { roles: createVolatile({ reviewer: REVIEWER }) })
    const mounted = ctx.plugin(tool, {})
    await expect(mounted).rejects.toThrow(/agent role "reviewer".*agentOptions.*depthLimit/s)
  })

  it('keeps a late provider registered when an existing role cannot use it', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    new AgentRoleRegistry(ctx, { roles: createVolatile({ detached: { ...REVIEWER, backingProvider: 'late' } }) })
    await ctx.plugin(tool, {})

    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('role_agent')
    ctx.subagents.registerProvider({
      name: 'late',
      capabilities: { agentOptions: false, agentPreset: true, outputSchema: true, depthLimit: true },
      inheritsParentContext: false,
      start: () => Promise.reject(new Error('unused')),
    })
    expect(ctx.subagents.getProvider('late')).toBeDefined()

    const handle = await ctx.agents.create({ sessionId: SessionId(`role-agent-late-${++agentCounter}`) })
    const parent = handle.agent
    const result = await callRole(ctx, { role: 'detached', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/agent role "detached" needs .*`agentOptions`.*"late"/s)
  })

  it('keeps a late provider registered when the live role table becomes invalid', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    const roles = createVolatile({})
    new AgentRoleRegistry(ctx, { roles })
    await ctx.plugin(tool, {})

    updateVolatile(roles, createVolatile({ broken: { label: '' } }))

    ctx.subagents.registerProvider({
      name: 'late',
      capabilities: { agentOptions: true, agentPreset: true, outputSchema: true, depthLimit: true },
      inheritsParentContext: false,
      start: () => Promise.reject(new Error('unused')),
    })
    expect(ctx.subagents.getProvider('late')).toBeDefined()
  })

  it('applies the global subagent depth cap when a role declares none', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { inherited: { label: 'Inherited', backingProvider: 'mock' } },
      onStart: (request) => { seen = request },
    })

    const result = await callRole(ctx, { role: 'inherited', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(false)
    expect(seen?.maxDepth).toBe(1)
  })

  it('can leave depth enforcement to the provider for external backends', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { inherited: { label: 'Inherited', backingProvider: 'mock' } },
      capabilities: { agentOptions: false, depthLimit: false },
      config: { maxDepth: 'provider-managed' },
      onStart: (request) => { seen = request },
    })

    const result = await callRole(ctx, { role: 'inherited', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(false)
    expect(seen).not.toHaveProperty('maxDepth')
  })

  it('rejects a provider without depthLimit when the Host cap still applies', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, {
      name: 'mock',
      capabilities: { depthLimit: false },
    })
    new AgentRoleRegistry(ctx, { roles: createVolatile({ inherited: { label: 'Inherited', backingProvider: 'mock' } }) })

    await expect(ctx.plugin(tool, {})).rejects.toThrow(
      /agent role "inherited" needs .*`depthLimit`.*"mock"/s,
    )
  })

  it('forwards provider route defaults when a role declares no model', async () => {
    let seen: ResolvedSubagentStartRequest | undefined
    const { ctx, parent } = await setup({
      roles: { inherited: { label: 'Inherited', backingProvider: 'mock' } },
      capabilities: { agentOptions: true },
      onStart: (request) => { seen = request },
    })

    const result = await callRole(ctx, { role: 'inherited', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(false)
    expect(seen?.agentOptions).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-chat',
    })
  })

  it('rejects an invalid maxDepth passed directly to apply', async () => {
    const { ctx } = await setup()
    await expect(ctx.plugin(tool, { maxDepth: -1 })).rejects.toThrow(/maxDepth/)
  })

  it('returns an errored result naming the declared roles for an unknown role', async () => {
    const { ctx, parent } = await setup()
    const result = await callRole(ctx, { role: 'nope', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('unknown agent role "nope"; declared roles: reviewer, summarizer')
    expect(text(result)).toContain('Use `list_agent_roles`')
  })

  it('reports how many roles an unknown-role hint omits', async () => {
    const roles = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [
      `role-${String(index).padStart(2, '0')}`,
      { label: `Role ${String(index)}`, backingProvider: 'mock', contextDefault: 'fresh' as const },
    ]))
    const { ctx, parent } = await setup({ roles })
    const result = await callRole(ctx, { role: 'nope', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('and 2 more (14 declared)')
  })

  it('treats prototype keys as unknown roles instead of leaking a TypeError', async () => {
    const { ctx, parent } = await setup()
    for (const role of ['constructor', '__proto__', 'toString']) {
      const result = await callRole(ctx, { role, prompt: 'do work' }, { agent: parent })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain(`unknown agent role "${role}"`)
    }
  })

  it('truncates an unknown role diagnostic without splitting a surrogate pair', async () => {
    const { ctx, parent } = await setup()
    const role = `${'a'.repeat(119)}😀`
    const result = await callRole(ctx, { role, prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain(`unknown agent role "${role}"`)
  })

  it('rejects a call without a calling agent', async () => {
    const { ctx } = await setup()
    const result = await callRole(ctx, { role: 'reviewer', prompt: 'do work' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('requires a calling agent')
  })

  it('rejects a prompt without non-whitespace text before starting a child', async () => {
    const started: string[] = []
    const { ctx, parent } = await setup({ onStart: (request) => { started.push(request.label ?? '') } })
    for (const prompt of ['', '   \n\t']) {
      const result = await callRole(ctx, { role: 'reviewer', prompt }, { agent: parent })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('prompt must include non-whitespace text')
    }
    expect(started).toEqual([])
  })

  it('rejects a label above its limit before starting a child without echoing it', async () => {
    const started: string[] = []
    const { ctx, parent } = await setup({ onStart: (request) => { started.push(request.label ?? '') } })
    const longLabel = 'l'.repeat(257)
    const result = await callRole(
      ctx,
      { role: 'reviewer', prompt: 'do work', label: longLabel },
      { agent: parent },
    )
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('label exceeds 256 characters')
    expect(text(result)).not.toContain(longLabel)
    expect(started).toEqual([])
  })

  it('rejects a blank label instead of replacing the role label', async () => {
    const started: string[] = []
    const { ctx, parent } = await setup({ onStart: (request) => { started.push(request.label ?? '') } })
    for (const label of ['', '  \n\t']) {
      const result = await callRole(ctx, { role: 'reviewer', prompt: 'do work', label }, { agent: parent })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('label must include non-whitespace text')
    }
    expect(started).toEqual([])
  })

  it('rejects a cwd containing a null character before starting a child', async () => {
    const started: string[] = []
    const { ctx, parent } = await setup({ onStart: (request) => { started.push(request.label ?? '') } })
    const result = await callRole(
      ctx,
      { role: 'reviewer', prompt: 'do work', cwd: '/tmp/bad\0path' },
      { agent: parent },
    )
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('cwd must not contain a null character')
    expect(started).toEqual([])
  })

  it('fails loud when the role provider is not registered', async () => {
    const { ctx, parent } = await setup({
      roles: { detached: { ...REVIEWER, backingProvider: 'missing' } },
    })
    const result = await callRole(ctx, { role: 'detached', prompt: 'do work' }, { agent: parent })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('"missing"')
    expect(text(result)).toContain('not registered')
  })
})
