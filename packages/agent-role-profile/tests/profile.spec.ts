/** The Agent Roles bundle must carry one parseable, additive role layer that mounts through Loader. */

import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include, { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { OPTIONAL_BUNDLES, composeEntries, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentRoleRegistry from '@deepseek-ai/dsh-experimental-agent-role'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { mountWorkingDirectoryFixture } from '../../../subagent/subagent/tests/working-directory-fixture.ts'
import * as roleTool from '../../tool-agent-role/src/index.ts'
import * as mock from '../../tool-agent-role/tests/scripted-provider.ts'

const contexts = new Set<Context>()
const roots = new Set<string>()
afterEach(async () => {
  for (const ctx of contexts) await ctx.fiber.dispose()
  contexts.clear()
  for (const root of roots) await rm(root, { recursive: true, force: true })
  roots.clear()
})

/** Execute one mounted tool through the real pipeline. */
function call(ctx: Context, name: string, args: unknown, agent: Agent, id: string) {
  return ctx.tools.execute({
    name,
    callId: ToolCallId(id),
    arguments: args,
    agent,
    signal: new AbortController().signal,
  })
}

describe('Agent Roles profile bundle', () => {
  it('is admitted as a shipped optional bundle and installed by the CLI', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const cli = JSON.parse(readFileSync(resolve(root, '../../../apps/cli/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(OPTIONAL_BUNDLES).toContain('@deepseek-ai/dsh-experimental-agent-role-profile')
    expect(cli.dependencies?.['@deepseek-ai/dsh-experimental-agent-role-profile']).toBe('workspace:*')
  })

  it('declares a public layer with the role catalog and delegation tool', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: { access?: string }
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBeUndefined()
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toEqual({
      '@deepseek-ai/dsh-experimental-client-ui-agent-role-config': 'workspace:*',
      '@deepseek-ai/dsh-experimental-agent-role': 'workspace:*',
      '@deepseek-ai/dsh-experimental-tool-agent-role': 'workspace:*',
    })

    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(parsed).toEqual([{ insert: [
      {
        id: 'agent-roles',
        name: '@deepseek-ai/dsh-experimental-agent-role',
        config: {
          backingProvider: 'spawn',
          roles: {
            planner: {
              label: 'Planner',
              description: 'Turns a complex task into atomic, independently executable steps with explicit inputs, '
                + 'actions, outputs, acceptance criteria, dependencies, and failure handling.',
              tags: ['planning', 'decomposition', 'read-only'],
              contextDefault: 'fresh',
            },
            executor: {
              label: 'Executor',
              description: 'Executes specified steps with files, commands, and tools, then reports the original '
                + 'error and failing location instead of replanning or changing the requested output.',
              tags: ['execution', 'delivery', 'steps'],
              contextDefault: 'fresh',
            },
            verifier: {
              label: 'Verifier',
              description: 'Checks a deliverable against stated acceptance criteria and reports pass, fail, or '
                + 'unverifiable with traceable evidence, without modifying the result.',
              tags: ['verification', 'acceptance', 'read-only'],
              contextDefault: 'fresh',
            },
          },
        },
      },
      {
        id: 'ui-agent-role-config',
        name: '@deepseek-ai/dsh-experimental-client-ui-agent-role-config',
      },
      {
        id: 'tool-agent-role',
        name: '@deepseek-ai/dsh-experimental-tool-agent-role',
        config: { toolName: 'role_agent' },
      },
    ] }])
  })

  it('mounts the shipped layer through Loader and exposes both tools', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'dsh-agent-role-profile-'))
    roots.add(root)
    const packageRoot = fileURLToPath(new URL('..', import.meta.url))
    const entries = composeEntries([loadOverlayPatches('dsh', resolve(packageRoot, 'cordis.patch.yml'))])
    expect(entries.map(entry => entry.id)).toEqual(['agent-roles', 'ui-agent-role-config', 'tool-agent-role'])

    const configPath = resolve(root, 'cordis.yml')
    await writeFile(configPath, yaml.dump(entries.map((entry): { id: string; name: string; config: unknown } => ({
      id: entry.id,
      name: entry.id === 'agent-roles' ? 'cordis:agent-role'
        : entry.id === 'ui-agent-role-config' ? 'cordis:ui-agent-role-config' : 'cordis:tool-agent-role',
      config: entry.config,
    }))))

    const ctx = new Context()
    contexts.add(ctx)
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(Loader)
    Object.assign(ctx.loader.builtins, {
      include: Include,
      'agent-role': AgentRoleRegistry,
      'ui-agent-role-config': { apply: () => {} },
      'tool-agent-role': roleTool,
    })
    await ctx.plugin(AgentLoop, { agents: [] })
    await mountWorkingDirectoryFixture(ctx)
    await ctx.plugin(SubagentRuntime)
    await mock.mountScriptedProvider(ctx, { name: 'spawn' })
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()

    const parent = (await ctx.agents.create({ sessionId: SessionId('profile-parent') })).agent
    const discovery = await call(ctx, 'list_agent_roles', {}, parent, 'profile-discovery')
    expect(discovery.isError).not.toBe(true)
    expect(discovery.value).toMatchObject({
      entries: [{ name: 'executor' }, { name: 'planner' }, { name: 'verifier' }],
    })

    const started = await call(ctx, 'role_agent', { role: 'planner', prompt: 'plan this change' }, parent, 'profile-role')
    expect(started.isError).not.toBe(true)
    expect(started.value).toMatchObject({ role: 'planner', context: 'fresh', provider: 'spawn' })
  })
})
