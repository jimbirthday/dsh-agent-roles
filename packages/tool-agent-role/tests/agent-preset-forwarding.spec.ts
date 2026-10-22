/**
 * Behavioral proof that a role's Agent Preset reaches the child creation
 * request. The preset owns persona and tool composition; this package must
 * forward the preset id and must not synthesize the removed per-role
 * `persona` or `toolFilter` request fields.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import AgentRoleRegistry from '@deepseek-ai/dsh-experimental-agent-role'
import type { RoleDefinition } from '@deepseek-ai/dsh-experimental-agent-role'
// Vendor source, not a package dependency: the registry's schema input type
// rejects an intermediate typed role table, so this spec constructs it over a
// hand-written live table exactly as the agent-role registry spec does.
import { createVolatile } from '../../../../vendor/cosmokit/src/volatile.ts'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { ResolvedSubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { mountWorkingDirectoryFixture } from '../../../subagent/subagent/tests/working-directory-fixture.ts'
import * as tool from '../src/index.ts'
import * as mock from './scripted-provider.ts'

const contexts = new Set<Context>()
afterEach(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
  contexts.clear()
})

const testToolSignal = new AbortController().signal

/** A reviewer role composes its read-only behavior through its preset. */
const AUDITOR: RoleDefinition = {
  label: 'Auditor',
  description: 'Read-only auditor composed by the auditor preset',
  model: { provider: 'mock', model: 'mock' },
  agentPreset: 'auditor',
  backingProvider: 'mock',
}

/** The route declared by the auditor role, without touching the scripted child. */
class AuditorRoute extends LlmAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(): AsyncIterable<never> {
    throw new Error('AuditorRoute does not stream')
  }
}

let callCounter = 0

function text(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe('agent preset forwarding', () => {
  it('forwards the role preset and never synthesizes persona or toolFilter', async () => {
    const ctx = new Context()
    contexts.add(ctx)
    await ctx.plugin(Loader)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentPresets, { default: 'auditor' })
    await ctx.agentPresets.register({ id: 'auditor', plugins: [] })
    ctx.llm.registerAdapter(['mock'], new AuditorRoute())
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)

    let seen: ResolvedSubagentStartRequest | undefined
    await mock.mountScriptedProvider(ctx, {
      name: 'mock',
      onStart: (request) => { seen = request },
    })
    new AgentRoleRegistry(ctx, { roles: createVolatile({ auditor: AUDITOR }) })
    await ctx.plugin(tool, {})
    const { agent: parent } = await ctx.agents.create({ sessionId: SessionId('role-preset-parent') })

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId(`role-preset-${++callCounter}`),
      name: 'role_agent',
      arguments: { role: 'auditor', prompt: 'audit the working tree' },
      agent: parent,
    })
    if (result.isError) throw new Error(text(result))
    expect(result.isError).toBe(false)

    expect(seen?.agentPreset).toBe('auditor')
    expect(seen).not.toHaveProperty('persona')
    expect(seen).not.toHaveProperty('toolFilter')
  })
})
