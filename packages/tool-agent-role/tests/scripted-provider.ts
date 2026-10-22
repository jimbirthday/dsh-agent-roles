/** Package-local scripted child boundary for deterministic tool-agent-role tests. */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
  SubagentRun,
} from '@deepseek-ai/dsh-subagent'

/** Every capability on by default; a fixture narrows the set it needs. */
const DEFAULT_CAPABILITIES: SubagentCapabilities = {
  agentOptions: true,
  agentPreset: true,
  outputSchema: true,
  depthLimit: true,
}

/** Options for one scripted provider fixture. */
export interface Config {
  /** Registry name to register under. */
  name: string
  /** Static Host-owned route defaults; omitting makes the fixture an external route owner. */
  agentRouteDefaults?: { provider: string; model: string }
  /** Start-time features advertised by the provider. */
  capabilities?: Partial<SubagentCapabilities>
  /** Whether the child is seeded with the parent's completed turns (default false). */
  inheritsParentContext?: boolean
  /** Records each start request before the run settles. */
  onStart?: (request: ResolvedSubagentStartRequest) => Promise<void> | void
}

/** Scripted external provider that records the exact start request it receives. */
class ScriptedSubagentProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities
  readonly inheritsParentContext: boolean
  readonly agentRouteDefaults?: { provider: string; model: string }
  private started = 0

  constructor(
    readonly name: string,
    private readonly config: Config,
  ) {
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...config.capabilities }
    this.inheritsParentContext = config.inheritsParentContext ?? false
    if (config.agentRouteDefaults !== undefined) this.agentRouteDefaults = config.agentRouteDefaults
  }

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    await this.config.onStart?.(request)
    const output: ContentBlock[] = [{ type: 'text', text: 'scripted subagent reply' }]
    return {
      id: SessionId(`scripted-subagent:${this.name}:${request.parent.id}:${++this.started}`),
      result: Promise.resolve({ output, stopReason: 'completed' as const }),
      dispose(): Promise<void> {
        return Promise.resolve()
      },
    }
  }
}

/**
 * Mount one scripted provider through an effect-scoped local plugin.
 * @param ctx - context carrying the real subagent registry.
 * @param config - scripted provider identity, capabilities, and start observer.
 * @returns the fixture plugin's disposable fiber.
 */
export function mountScriptedProvider(ctx: Context, config: Config) {
  return ctx.plugin({
    name: `scripted-subagent-provider:${config.name}`,
    inject: ['subagents'],
    apply(pluginCtx: Context): void {
      pluginCtx.subagents.registerProvider(new ScriptedSubagentProvider(config.name, config))
    },
  })
}

/**
 * Mount a scripted provider that declares `prepareContinuable`, the marker the
 * subagent runtime uses for a local in-process child.
 * @param ctx - context carrying the real subagent registry.
 * @param config - scripted provider identity, capabilities, and start observer.
 * @returns the fixture plugin's disposable fiber.
 */
export function mountLocalProvider(ctx: Context, config: Config) {
  return ctx.plugin({
    name: `scripted-local-subagent-provider:${config.name}`,
    inject: ['subagents'],
    apply(pluginCtx: Context): void {
      const provider = new ScriptedSubagentProvider(config.name, config)
      pluginCtx.subagents.registerProvider(Object.assign(provider, {
        prepareContinuable: () => Promise.resolve({}),
      }))
    },
  })
}
