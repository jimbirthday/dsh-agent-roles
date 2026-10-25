import z from "@deepseek-ai/schemastery";
import { AgentRoleError, summarizeRole } from "../../agent-role/lib/index.js";
import { LlmError, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import { assertSubagentMaxDepth, delegationDepthOf } from "@deepseek-ai/dsh-subagent";
import { defineTool, parameterSchemaSpecToJsonSchema } from "@deepseek-ai/dsh-tools";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/index.js
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
const name = "tool-agent-role";
/** Services required by the role delegation tool. */
const inject = [
	"agentRoles",
	"subagents",
	"tools"
];
/** Maximum code points accepted in a model-supplied role name. */
const ROLE_NAME_MAX_LENGTH = 256;
/** Maximum code points accepted in a model-supplied child label. */
const ROLE_LABEL_MAX_LENGTH = 256;
/** Maximum code points accepted in a discovery query. */
const QUERY_MAX_LENGTH = 512;
/** Maximum code points accepted in a configured model-facing tool name. */
const TOOL_NAME_MAX_LENGTH = 256;
/** Characters safe to emit as a tool name to every supported provider. */
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/u;
/** Maximum code points accepted in a configured subagent provider name. */
const PROVIDER_NAME_MAX_LENGTH = 256;
/** Provider names are rendered in role errors and catalog rows as one token. */
const PROVIDER_NAME_PATTERN = /^[^\s`"\\]+$/u;
/** Maximum rendered characters in one paged discovery result. */
const ROLE_DISCOVERY_MAX_CHARS = 16384;
/** Marker appended when an exact-role description exceeds the discovery budget. */
const ROLE_DESCRIPTION_TRUNCATION = "… (description truncated)";
/** Maximum code points retained from a live-refresh failure for discovery. */
const CATALOG_STALE_REASON_MAX_LENGTH = 512;
/** Maximum code points retained from a role-scoped upstream failure. */
const ROLE_PROBLEM_MAX_LENGTH = 2048;
/** Marker appended when a live-refresh failure is shortened for discovery. */
const CATALOG_STALE_TRUNCATION = "…";
/**
* Test whether a model-supplied string exceeds a protocol character limit.
* Iteration counts Unicode code points, matching JSON Schema `maxLength`.
* @param value - candidate string.
* @param maxLength - maximum accepted code points.
* @returns whether the string is too long.
*/
function exceedsCharacterLimit(value, maxLength) {
	let count = 0;
	for (const _codePoint of value) {
		count += 1;
		if (count > maxLength) return true;
	}
	return false;
}
/**
* Truncate a string to a maximum number of Unicode code points without
* splitting a surrogate pair.
* @param value - candidate string.
* @param maxLength - maximum accepted code points.
* @returns the original string or a code-point-safe prefix.
*/
function truncateCodePoints(value, maxLength) {
	let result = "";
	let count = 0;
	for (const codePoint of value) {
		if (count === maxLength) break;
		result += codePoint;
		count += 1;
	}
	return result;
}
/**
* Reject one model-supplied argument above its protocol character limit.
* @param value - candidate value, or undefined when the argument is omitted.
* @param field - argument name used in the failure message.
* @param maxLength - maximum accepted code points.
* @throws Error naming the argument and limit, without echoing its value.
*/
function assertCharacterLimit(value, field, maxLength) {
	if (value === void 0 || !exceedsCharacterLimit(value, maxLength)) return;
	throw new Error(`${field} exceeds ${maxLength} characters`);
}
/**
* Reject a configured model-facing name that cannot identify a tool.
* @param value - configured tool name.
* @param field - setting name used in the failure message.
* @throws Error when the name is blank or above the protocol limit.
*/
function assertConfiguredToolName(value, field) {
	if (value.trim().length === 0) throw new Error(`tool-agent-role: ${field} must be a non-empty string`);
	if (exceedsCharacterLimit(value, TOOL_NAME_MAX_LENGTH)) throw new Error(`tool-agent-role: ${field} must not exceed ${TOOL_NAME_MAX_LENGTH} characters`);
	if (!TOOL_NAME_PATTERN.test(value)) throw new Error(`tool-agent-role: ${field} may contain only ASCII letters, digits, underscores, dots, and hyphens`);
}
/**
* Reject a configured provider name that would escape one error or catalog
* line, or that exceeds the same bound the catalog applies to role-owned
* identifiers.
* @param value - configured provider name.
* @param field - setting name used in the failure message.
* @throws Error when the name is blank, unsafe inline, or above the limit.
*/
function assertConfiguredProviderName(value, field) {
	if (value.trim().length === 0) throw new Error(`tool-agent-role: ${field} must be a non-empty string`);
	if (exceedsCharacterLimit(value, PROVIDER_NAME_MAX_LENGTH)) throw new Error(`tool-agent-role: ${field} must not exceed ${PROVIDER_NAME_MAX_LENGTH} characters`);
	if (!PROVIDER_NAME_PATTERN.test(value)) throw new Error(`tool-agent-role: ${field} must not contain whitespace, backticks, quotes, or backslashes`);
}
/**
* Collapse a live-refresh failure into a bounded, single-line discovery reason.
* @param error - failure thrown while reading or rendering the live catalog.
* @param maxLength - maximum code points in the returned reason.
* @returns the normalized failure message.
*/
function catalogStaleReason(error, maxLength) {
	return boundedFailure(error instanceof Error ? error.message : String(error), maxLength);
}
/**
* Collapse one upstream failure into a bounded single line.
* @param value - failure text.
* @param maxLength - maximum retained code points.
* @returns the normalized, bounded failure.
*/
function boundedFailure(value, maxLength = ROLE_PROBLEM_MAX_LENGTH) {
	const message = oneLine(value);
	if (!exceedsCharacterLimit(message, maxLength)) return message;
	if (maxLength <= 1) return truncateCodePoints(message, maxLength);
	return `${truncateCodePoints(message, maxLength - 1)}${CATALOG_STALE_TRUNCATION}`;
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
function awaitAbortable(pending, signal) {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
		};
		const cleanup = () => {
			signal.removeEventListener("abort", onAbort);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		pending.then((value) => {
			cleanup();
			resolve(value);
		}, (error) => {
			cleanup();
			reject(error instanceof Error ? error : new Error(String(error)));
		});
	});
}
/**
* Compile parameter schemas with JSON Schema `maxLength` annotations the
* value-schema DSL does not express. The raw schema still passes through the
* DSL's enforced subset before the annotations are added.
* @param spec - per-property parameter definitions.
* @param limits - maximum code points by parameter name.
* @returns the compiled schema carrying the requested limits.
*/
function boundedParameterSchema(spec, limits) {
	const schema = parameterSchemaSpecToJsonSchema(spec);
	for (const [name, maxLength] of Object.entries(limits)) {
		const property = schema.properties[name];
		if (property === void 0 || property.type !== "string") throw new Error(`tool-agent-role: parameter "${name}" must be a string to bound`);
		const bounded = {
			...property,
			maxLength
		};
		schema.properties[name] = bounded;
	}
	return schema;
}
const Config = z.object({
	toolName: z.string().min(1).default("role_agent"),
	discoveryToolName: z.string().min(1).default("list_agent_roles"),
	freshProvider: z.string().min(1),
	forkProvider: z.string().min(1).default("fork"),
	maxDepth: z.union([z.natural().max(Number.MAX_SAFE_INTEGER), z.const("provider-managed")]),
	maxRoles: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64),
	maxCatalogChars: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8192),
	discoveryPageSize: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(50),
	discoveryHealthConcurrency: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(4)
});
/** Human-readable feature name for one missing provider capability. */
const CAPABILITY_FEATURE = {
	agentOptions: "a child model route (`agentOptions`)",
	agentPreset: "an independent Agent Preset (`agentPreset`)",
	outputSchema: "a structured output schema (`outputSchema`)",
	depthLimit: "a delegation depth cap (`depthLimit`)"
};
/**
* Build the failure for a name that is not in the catalog, naming the roles
* this deployment does declare.
* @param snapshot - the catalog snapshot that established the name is absent.
* @param roleName - the model-supplied role name.
* @param discoveryToolName - the discovery tool named in the recovery hint.
* @param cause - the catalog's original failure, when one exists.
* @returns the structured unknown-role failure.
*/
function unknownRole(snapshot, roleName, discoveryToolName, cause) {
	const declared = [...snapshot.roles, ...snapshot.invalid].map((role) => role.name);
	const shown = declared.slice(0, 12).map(oneLine).join(", ");
	const omitted = declared.length > 12 ? `, and ${declared.length - 12} more (${declared.length} declared)` : "";
	const requested = truncateCodePoints(oneLine(roleName), 120);
	return new AgentRoleError(declared.length === 0 ? `unknown agent role "${requested}"; this deployment declares no roles` : `unknown agent role "${requested}"; declared roles: ${shown}${omitted}. Use \`${discoveryToolName}\` to inspect the role catalog`, "ROLE_UNKNOWN", cause === void 0 ? void 0 : { cause });
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
function resolveRole(ctx, roleName, discoveryToolName) {
	const snapshot = ctx.agentRoles.snapshot();
	const role = snapshot.roles.find((entry) => entry.name === roleName);
	if (role !== void 0) return role;
	const invalid = snapshot.invalid.find((entry) => entry.name === roleName);
	if (invalid !== void 0) throw new AgentRoleError(invalid.message, invalid.code);
	throw unknownRole(snapshot, roleName, discoveryToolName);
}
/**
* Build the child Agent options a role binds.
* @param role - the resolved role.
* @param provider - the selected backend whose route defaults may fill an omission.
* @returns detached Agent options carrying the role's model route.
*/
function agentOptionsFor(role, backend) {
	const model = role.model;
	if (model === void 0) return backend.agentRouteDefaults === void 0 || !backend.capabilities.agentOptions ? {} : { ...backend.agentRouteDefaults };
	const { provider, reasoningEffort, maxTokens } = model;
	return {
		provider,
		model: model.model,
		...reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) },
		...maxTokens === void 0 ? {} : { maxTokens }
	};
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
function requiredCapabilities(role, maxDepth) {
	const required = [];
	if (role.model !== void 0) required.push("agentOptions");
	if (role.agentPreset !== void 0) required.push("agentPreset");
	if (maxDepth !== void 0) required.push("depthLimit");
	if (role.outputSchema !== void 0) required.push("outputSchema");
	return required;
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
function assertProviderCapabilities(role, provider, maxDepth) {
	const missing = requiredCapabilities(role, maxDepth).filter((capability) => !provider.capabilities[capability]);
	if (missing.length === 0) return;
	const features = missing.map((capability) => CAPABILITY_FEATURE[capability]).join(", ");
	throw new AgentRoleError(`agent role "${role.name}" needs ${features}, but its provider "${provider.name}" does not support ${missing.length === 1 ? "that capability" : "those capabilities"}`, "ROLE_INVALID_CONFIG");
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
function resolveProvider(ctx, role, providerName) {
	const provider = ctx.subagents.getProvider(providerName);
	if (provider === void 0) throw new AgentRoleError(`agent role "${role.name}" delegates through subagent provider "${providerName}" for context "${role.context}", which is not registered`, "ROLE_INVALID_CONFIG");
	const wantsInheritedContext = role.context === "fork";
	if (provider.inheritsParentContext === wantsInheritedContext) return provider;
	throw new AgentRoleError(`agent role "${role.name}" declares context "${role.context}", but provider "${provider.name}" inherits the parent context (${provider.inheritsParentContext}); ` + (wantsInheritedContext ? "a fork role requires a provider that inherits the parent context" : "a fresh role requires a provider that does not inherit the parent context"), "ROLE_INVALID_CONFIG");
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
function requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, maxDepth) {
	const provider = resolveProvider(ctx, role, selectedProviderName(role, freshProvider, forkProvider, catalogFallback));
	if (role.agentPreset !== void 0 && provider.inheritsParentContext) throw new AgentRoleError(`agent role "${role.name}" declares agentPreset "${role.agentPreset}", but provider "${provider.name}" inherits the parent context; Agent Presets require a fresh provider`, "ROLE_INVALID_CONFIG");
	assertProviderCapabilities(role, provider, maxDepth);
	return provider;
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
function validateDeclaredRoles(ctx, freshProvider, forkProvider, catalogFallback, maxDepth) {
	for (const role of ctx.agentRoles.snapshot().roles) {
		const providerName = selectedProviderName(role, freshProvider, forkProvider, catalogFallback);
		if (ctx.subagents.getProvider(providerName) === void 0) continue;
		assertRoleContext(role);
		requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, effectiveMaxDepth(ctx, role, maxDepth));
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
function reportProviderRoleConflicts(ctx, provider, freshProvider, forkProvider, catalogFallback, maxDepth) {
	try {
		for (const role of ctx.agentRoles.snapshot().roles) {
			if (selectedProviderName(role, freshProvider, forkProvider, catalogFallback) !== provider.name) continue;
			assertRoleContext(role);
			requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, effectiveMaxDepth(ctx, role, maxDepth));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.logger.warn(message);
	}
}
/**
* Resolve the delegation cap a role's start will carry.
* @param ctx - context carrying the subagent registry.
* @param role - the resolved role.
* @param maxDepth - the tool's depth policy for roles without their own cap.
* @returns the numeric cap, or undefined when the provider enforces depth.
*/
function effectiveMaxDepth(ctx, role, maxDepth) {
	return ctx.subagents.resolveMaxDepth(role.delegationDepth ?? maxDepth);
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
function assertDepthAvailable(role, maxDepth, parent) {
	if (maxDepth === void 0 || parent === void 0) return;
	const childDepth = delegationDepthOf(parent) + 1;
	if (childDepth <= maxDepth) return;
	throw new AgentRoleError(`agent role "${role.name}" permits delegation depth ${maxDepth}, but the child would start at depth ${childDepth}`, "ROLE_INVALID_CONFIG");
}
/**
* Resolve the registered provider name a role delegates through.
* @param role - the resolved role.
* @param freshProvider - provider used by a fresh role without an explicit backend.
* @param forkProvider - provider used by a fork role without an explicit backend.
* @param catalogFallback - reads the catalog's deployment provider for a fresh role.
* @returns the explicit backing provider, the configured provider for the role's context, or the catalog fallback.
*/
function selectedProviderName(role, freshProvider, forkProvider, catalogFallback) {
	if (role.backingProvider !== void 0) return role.backingProvider;
	if (role.context === "fork") return forkProvider;
	return freshProvider ?? catalogFallback();
}
/**
* Reject a fork role that selects an independent Agent Preset. The catalog
* rejects this combination on read; the explicit check keeps a call and its
* health diagnosis aligned even if a live table bypasses that validation.
* @param role - the resolved role.
* @throws AgentRoleError when a fork role declares an Agent Preset.
*/
function assertRoleContext(role) {
	if (role.context !== "fork" || role.agentPreset === void 0) return;
	throw new AgentRoleError(`agent role "${role.name}" declares agentPreset "${role.agentPreset}" with context "fork"; Agent Presets require a fresh role. Remove agentPreset or set contextDefault: fresh.`, "ROLE_INVALID_CONFIG");
}
/**
* Validate the declared role count against the configured capacity limit.
* @param catalog - rendered role text and names.
* @param limits - resolved capacity limits.
* @throws Error naming the exceeded limit.
*/
function assertCatalogFits(catalog, limits) {
	if (catalog.names.length > limits.maxRoles) throw new Error(`tool-agent-role: the catalog declares ${catalog.names.length} roles, above maxRoles ${limits.maxRoles}; remove roles or raise maxRoles`);
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
function catalogSummary(roles, maxChars, discoveryToolName) {
	if (roles.length === 0) return {
		description: " This deployment declares no agent roles.",
		names: []
	};
	const detailed = roles.map((role) => {
		const facts = [
			role.description ?? role.label,
			role.context === "fork" ? "fork context" : "fresh context",
			role.structuredOutput ? "structured result" : void 0,
			role.agentPreset === void 0 ? void 0 : `preset ${role.agentPreset}`,
			role.capacityGroup === void 0 ? void 0 : `capacity group ${role.capacityGroup}`,
			role.executionBudget?.wallClockMs === void 0 ? void 0 : `wall-clock budget ${role.executionBudget.wallClockMs} ms (expiry stops the child)`,
			role.provider === void 0 ? "inherited model route" : `${role.provider}/${role.model}`
		].flatMap((fact) => fact === void 0 ? [] : [oneLine(fact)]);
		return `\`${oneLine(role.name)}\` (${oneLine(role.label)}): ${facts.join("; ")}`;
	});
	const names = roles.map((role) => role.name);
	const description = ` Declared roles:\n${detailed.join("\n")}`;
	if (description.length <= maxChars) return {
		description,
		names
	};
	const compactDescription = ` Declared roles (compact; call \`${discoveryToolName}\` for role facts):\n${roles.map((role) => `\`${oneLine(role.name)}\` (${oneLine(role.label)})`).join("\n")}`;
	if (compactDescription.length <= maxChars) return {
		description: compactDescription,
		names
	};
	return {
		description: ` The role catalog is too large to inline; call \`${discoveryToolName}\` to inspect the declared roles.`,
		names
	};
}
/**
* Collapse one configured value into a single catalog line so it cannot forge
* another role row or add model-facing instructions.
* @param value - role-supplied text.
* @returns the text with line breaks and repeated whitespace collapsed.
*/
function oneLine(value) {
	return value.replace(/\s+/gu, " ").trim();
}
/** Normalize one model-facing failure message to a single bounded line. */
function oneLineFailure(value) {
	return boundedFailure(value).replace(/`/gu, "'");
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
async function preflightPreset(ctx, role, signal) {
	const presetId = role.agentPreset;
	if (presetId === void 0) return;
	const presets = ctx.get("agentPresets");
	if (presets === void 0) throw new AgentRoleError(`agent role "${role.name}" declares agentPreset "${presetId}", but the agent-presets service is not mounted`, "ROLE_INVALID_CONFIG");
	try {
		const resolved = await awaitAbortable(presets.resolve(presetId), signal);
		signal.throwIfAborted();
		if (resolved.broken !== void 0) throw new AgentRoleError(`agent role "${role.name}" declares agentPreset "${presetId}", which is broken: ${boundedFailure(resolved.broken)}`, "ROLE_INVALID_CONFIG");
	} catch (error) {
		signal.throwIfAborted();
		if (error instanceof AgentRoleError) throw error;
		if (remoteErrorOf(error)?.code === "agent-preset/not-found") throw new AgentRoleError(`agent role "${role.name}" declares agentPreset "${presetId}", which is not registered`, "ROLE_INVALID_CONFIG", { cause: error });
		throw new AgentRoleError(`agent role "${role.name}" could not resolve agentPreset "${presetId}": ` + boundedFailure(error instanceof Error ? error.message : String(error)), "ROLE_INVALID_CONFIG", { cause: error });
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
async function preflightModelRoute(ctx, role, provider, signal) {
	const model = role.model;
	if (model === void 0) return;
	if (!providerBuildsHostChild(provider)) return;
	const llm = ctx.get("llm");
	if (llm === void 0) throw new AgentRoleError(`agent role "${role.name}" declares model "${model.provider}/${model.model}", but the llm service is not mounted`, "ROLE_INVALID_CONFIG");
	await resolveRoute(llm, role, model.provider, model.model, model.reasoningEffort, model.maxTokens, signal);
}
/**
* Whether the Host LLM runtime resolves this provider's child route. A local
* provider constructs an in-process child from `agentOptions`; an external
* provider that advertises route defaults asks the Host to resolve them too.
* @param provider - the registered backend that will start the child.
* @returns whether the Host runtime resolves the declared route.
*/
function providerBuildsHostChild(provider) {
	return provider.prepareContinuable !== void 0 || provider.agentRouteDefaults !== void 0;
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
async function requireRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal) {
	signal.throwIfAborted();
	assertRoleContext(role);
	const maxDepth = effectiveMaxDepth(ctx, role, config.maxDepth);
	const provider = requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, maxDepth);
	assertDepthAvailable(role, maxDepth, parent);
	await preflightPreset(ctx, role, signal);
	signal.throwIfAborted();
	await preflightModelRoute(ctx, role, provider, signal);
	signal.throwIfAborted();
	return {
		provider,
		...maxDepth === void 0 ? {} : { maxDepth }
	};
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
async function requireStableRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal) {
	let health = await requireRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal);
	if (ctx.subagents.getProvider(health.provider.name) === health.provider) return health;
	signal.throwIfAborted();
	health = await requireRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal);
	if (ctx.subagents.getProvider(health.provider.name) === health.provider) return health;
	throw new AgentRoleError(`agent role "${role.name}" could not start because its subagent provider changed while resolving; retry the delegation`, "ROLE_INVALID_CONFIG");
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
async function inspectRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, depthOnly, signal) {
	const provider = selectedProviderName(role, freshProvider, forkProvider, catalogFallback);
	try {
		if (depthOnly) {
			signal.throwIfAborted();
			assertRoleContext(role);
			const maxDepth = effectiveMaxDepth(ctx, role, config.maxDepth);
			const ready = requireRoleProvider(ctx, role, freshProvider, forkProvider, catalogFallback, maxDepth);
			assertDepthAvailable(role, maxDepth, parent);
			return {
				provider: ready.name,
				...maxDepth === void 0 ? {} : { maxDepth }
			};
		}
		const ready = await requireRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, signal);
		return {
			provider: ready.provider.name,
			...ready.maxDepth === void 0 ? {} : { maxDepth: ready.maxDepth }
		};
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		return {
			provider,
			...error instanceof AgentRoleError ? { problemCode: error.code } : {},
			problem: oneLineFailure(error instanceof Error ? error.message : String(error))
		};
	}
}
/** The schema for one discovery row; detail-only fields stay optional. */
const DISCOVERY_ENTRY_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		kind: {
			type: "string",
			required: true,
			enum: ["role"]
		},
		name: {
			type: "string",
			required: true
		},
		label: { type: "string" },
		context: {
			type: "string",
			enum: ["fresh", "fork"]
		},
		provider: { type: "string" },
		model: { type: "string" },
		agentPreset: { type: "string" },
		capacityGroup: { type: "string" },
		executionBudget: {
			type: "object",
			description: "Runtime-enforced wall-clock limits for one activation. Expiry stops the child and reports stopReason \"timeout\".",
			additionalProperties: false,
			properties: { wallClockMs: {
				type: "number",
				description: "Positive safe integer of milliseconds; the clock starts at admission."
			} }
		},
		structuredOutput: { type: "boolean" },
		health: {
			type: "string",
			required: true,
			enum: ["ok", "invalid"]
		},
		healthScope: {
			type: "string",
			required: true,
			enum: ["static", "full"]
		},
		problemCode: {
			type: "string",
			enum: ["ROLE_INVALID_CONFIG", "ROLE_UNKNOWN"]
		},
		problem: { type: "string" },
		maxDepth: { type: "number" },
		description: { type: "string" },
		tags: {
			type: "array",
			items: { type: "string" }
		}
	}
};
/**
* Discovery relevance for one role against a lower-cased query. Higher ranks
* sort first; an exact name always precedes a name prefix, which precedes a
* label, tag, or description match.
* @param role - the resolved role.
* @param query - the lower-cased query.
* @returns the match rank, or undefined when no field matches.
*/
function matchRank(role, query) {
	const name = role.name.toLowerCase();
	if (name === query) return 4;
	if (name.startsWith(query)) return 3;
	if (role.label.toLowerCase().includes(query)) return 2;
	if (role.tags?.some((tag) => tag.toLowerCase().includes(query)) === true) return 1;
	if (role.description?.toLowerCase().includes(query) === true) return 0;
}
/**
* Project one rejected role into a discovery row. Its declaration facts are
* unavailable because validation failed, so only the name and role-scoped
* failure are returned.
* @param role - the rejected catalog entry.
* @returns the discovery row.
*/
function invalidDiscoveryEntry(role) {
	return {
		kind: "role",
		name: oneLine(role.name),
		health: "invalid",
		healthScope: "static",
		problemCode: role.code,
		problem: oneLineFailure(role.message)
	};
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
async function discoveryEntry(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, detail, signal) {
	const health = await inspectRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, parent, !detail, signal);
	return {
		kind: "role",
		name: oneLine(role.name),
		label: oneLine(role.label),
		context: role.context,
		provider: oneLine(health.provider),
		...role.model === void 0 ? {} : { model: oneLine(`${role.model.provider}/${role.model.model}`) },
		...role.agentPreset === void 0 ? {} : { agentPreset: oneLine(role.agentPreset) },
		...role.capacityGroup === void 0 ? {} : { capacityGroup: oneLine(role.capacityGroup) },
		...role.executionBudget === void 0 ? {} : { executionBudget: { ...role.executionBudget } },
		structuredOutput: role.outputSchema !== void 0,
		health: health.problem === void 0 ? "ok" : "invalid",
		healthScope: detail ? "full" : "static",
		...health.problemCode === void 0 ? {} : { problemCode: health.problemCode },
		...health.problem === void 0 ? {} : { problem: oneLineFailure(health.problem) },
		...health.maxDepth === void 0 ? {} : { maxDepth: health.maxDepth },
		...detail && role.description !== void 0 ? { description: oneLine(role.description) } : {},
		...detail && role.tags !== void 0 ? { tags: role.tags.map(oneLine) } : {}
	};
}
/**
* Render one discovery result as model-facing text.
* @param result - validated discovery result.
* @param query - the query that produced the result, when one was supplied.
* @returns the text block content.
*/
function renderDiscovery(result, query, toolName = "list_agent_roles") {
	if (result.entries.length === 0) {
		if (query === void 0) {
			const declaration = result.availableRoles === void 0 ? "(no matching agent roles)" : "This deployment declares no agent roles.";
			return result.catalogStale === void 0 ? declaration : `${declaration} The inline role catalog is stale: ${oneLine(result.catalogStale)}`;
		}
		const available = result.availableRoles;
		const roster = available === void 0 ? "" : available.length === 0 ? " This deployment declares no roles." : ` Declared roles: ${available.slice(0, 12).map(oneLine).join(", ")}${available.length > 12 ? `, and ${available.length - 12} more` : ""}.`;
		const stale = result.catalogStale === void 0 ? "" : ` The inline role catalog is stale: ${oneLine(result.catalogStale)}.`;
		return `(no agent roles match query "${oneLine(query)}".${roster} Call \`${toolName}\` without a query for the full roster, or pass an exact \`role\`.${stale})`;
	}
	const rows = result.entries.map((entry) => {
		const facts = [
			entry.label,
			entry.context,
			entry.health,
			entry.healthScope,
			entry.provider,
			entry.model,
			entry.agentPreset === void 0 ? void 0 : `preset ${entry.agentPreset}`,
			entry.capacityGroup === void 0 ? void 0 : `capacity group ${entry.capacityGroup}`,
			entry.executionBudget?.wallClockMs === void 0 ? void 0 : `wall-clock budget ${entry.executionBudget.wallClockMs} ms (expiry stops the child)`,
			entry.maxDepth === void 0 ? void 0 : `depth ${entry.maxDepth}`,
			entry.structuredOutput === true ? "structured result" : void 0,
			entry.tags === void 0 ? void 0 : `tags ${entry.tags.join(", ")}`
		].filter((fact) => fact !== void 0).map(oneLine);
		return `${oneLine(entry.name)}${facts.length === 0 ? "" : ` — ${facts.join(", ")}`}` + (entry.description === void 0 ? "" : `\n  ${oneLine(entry.description)}`) + (entry.problem === void 0 ? "" : `\n  problem${entry.problemCode === void 0 ? "" : ` (${entry.problemCode})`}: ${oneLine(entry.problem)}`);
	});
	if (result.truncated) rows.push(`(showing ${result.offset + 1}-${result.offset + result.entries.length} of ${result.total}; pass offset ${result.offset + result.entries.length} for the next page, or query or role to narrow)`);
	if (result.entries.some((entry) => entry.healthScope === "static" && entry.model !== void 0)) rows.push("(static health does not resolve model routes; pass an exact `role` for the full preset and model check)");
	if (result.catalogStale !== void 0) rows.push(`(the inline role catalog is stale and still shows an older list: ${oneLine(result.catalogStale)})`);
	return rows.join("\n");
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
function defineDiscoveryTool(ctx, config, toolName, freshProvider, forkProvider, catalogFallback, catalog, limits) {
	const parameters = {
		role: {
			type: "string",
			description: "Exact declared role name. Returns that role's detail and full startup health; cannot be combined with query or offset."
		},
		query: {
			type: "string",
			description: "Case-insensitive substring matched against role names, labels, tags, and descriptions. Results rank exact names first, then name prefixes, labels, tags, and descriptions."
		},
		offset: {
			type: "number",
			description: "Zero-based index of the first matching role. Continue with the offset named by the previous page's truncation notice."
		}
	};
	const definition = defineTool({
		name: toolName,
		description: "Inspect the declared agent roles this deployment offers. Call with no arguments for a compact list, with `query` to match names, labels, tags, or descriptions, or with `role` for one role's declaration facts and startup health. Rows report `healthScope`: list and query mode return `static` after checking provider, context, capability, and depth against the caller, so a static `ok` does not mean the model route resolves; an exact `role` lookup returns `full` after also resolving the Agent Preset and model route. Neither mode starts a child.",
		parameters,
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "roles"
					},
					entries: {
						type: "array",
						required: true,
						items: DISCOVERY_ENTRY_SCHEMA
					},
					total: {
						type: "number",
						required: true
					},
					offset: {
						type: "number",
						required: true
					},
					truncated: {
						type: "boolean",
						required: true
					},
					availableRoles: {
						type: "array",
						items: { type: "string" }
					},
					catalogStale: { type: "string" }
				}
			},
			render: (args, value) => [{
				type: "text",
				text: renderDiscovery(value, args.query, toolName)
			}]
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			assertCharacterLimit(args.role, "role", ROLE_NAME_MAX_LENGTH);
			assertCharacterLimit(args.query, "query", QUERY_MAX_LENGTH);
			if (args.role !== void 0 && args.query !== void 0) throw new Error("pass either `role` or `query`, not both");
			if (args.role !== void 0 && args.offset !== void 0) throw new Error("pass either `role` or `offset`, not both");
			const offset = args.offset ?? 0;
			if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("offset must be a non-negative safe integer");
			const query = args.query?.toLowerCase();
			const snapshot = ctx.agentRoles.snapshot();
			const exactRole = args.role === void 0 ? void 0 : snapshot.roles.find((role) => role.name === args.role);
			const exactInvalid = args.role === void 0 ? void 0 : snapshot.invalid.find((role) => role.name === args.role);
			if (args.role !== void 0 && exactRole === void 0 && exactInvalid === void 0) throw unknownRole(snapshot, args.role, toolName);
			const ranked = query === void 0 ? void 0 : snapshot.roles.flatMap((role) => {
				const rank = matchRank(role, query);
				return rank === void 0 ? [] : [{
					role,
					rank
				}];
			});
			const matchedRoles = exactRole !== void 0 ? [exactRole] : args.role !== void 0 ? [] : ranked === void 0 ? snapshot.roles : ranked.toSorted((a, b) => b.rank - a.rank || a.role.name.localeCompare(b.role.name)).map((entry) => entry.role);
			const matchedInvalid = exactInvalid !== void 0 ? [exactInvalid] : args.role === void 0 ? query === void 0 ? snapshot.invalid : snapshot.invalid.filter((role) => role.name.toLowerCase().includes(query)) : [];
			const matched = [...matchedRoles.map((role) => ({
				kind: "role",
				role
			})), ...matchedInvalid.map((role) => ({
				kind: "invalid",
				role
			}))];
			if (query === void 0 || args.role !== void 0) matched.sort((a, b) => a.role.name.localeCompare(b.role.name));
			if (args.role === void 0 && offset > 0 && offset >= matched.length) {
				const declared = snapshot.roles.length + snapshot.invalid.length;
				throw new Error(`offset ${offset} is beyond the ${matched.length} matching agent roles` + (declared === 0 && args.query === void 0 ? "; this deployment declares no roles" : "; pass offset 0 to restart"));
			}
			const shown = args.role === void 0 ? matched.slice(offset, offset + limits.pageSize) : matched;
			const detail = args.role !== void 0;
			const entries = [];
			for (let start = 0; start < shown.length; start += limits.healthConcurrency) {
				const batch = shown.slice(start, start + limits.healthConcurrency);
				entries.push(...await Promise.all(batch.map(async (match) => match.kind === "invalid" ? invalidDiscoveryEntry(match.role) : discoveryEntry(ctx, config, match.role, freshProvider, forkProvider, catalogFallback, exec.agent, detail, exec.signal))));
			}
			exec.signal.throwIfAborted();
			let returned = entries;
			if (args.role !== void 0 && entries.length === 1) {
				let shortened = false;
				while (!shortened) {
					const candidate = {
						kind: "roles",
						entries: returned,
						total: matched.length,
						offset: 0,
						truncated: false,
						...catalog.stale === void 0 ? {} : { catalogStale: catalog.stale }
					};
					if (renderDiscovery(candidate).length <= ROLE_DISCOVERY_MAX_CHARS) break;
					const entry = returned[0];
					if (entry.description === void 0 || entry.description.length === 0) break;
					const excess = renderDiscovery(candidate).length - ROLE_DISCOVERY_MAX_CHARS;
					const keep = Math.max(0, Array.from(entry.description).length - excess - 25);
					returned = [{
						...entry,
						description: `${truncateCodePoints(entry.description, keep).trimEnd()}${ROLE_DESCRIPTION_TRUNCATION}`
					}];
					shortened = true;
				}
			}
			if (args.role === void 0 && entries.length > 1) while (returned.length > 1) {
				if (renderDiscovery({
					kind: "roles",
					entries: returned,
					total: matched.length,
					offset,
					truncated: offset + returned.length < matched.length,
					...catalog.stale === void 0 ? {} : { catalogStale: catalog.stale }
				}).length <= ROLE_DISCOVERY_MAX_CHARS) break;
				returned = returned.slice(0, -1);
			}
			return {
				kind: "roles",
				entries: returned,
				total: matched.length,
				offset: args.role === void 0 ? offset : 0,
				truncated: args.role === void 0 && offset + returned.length < matched.length,
				...args.query !== void 0 && matched.length === 0 ? { availableRoles: [...snapshot.roles, ...snapshot.invalid].map((role) => oneLine(role.name)).sort() } : {},
				...args.query === void 0 && matched.length === 0 ? { availableRoles: [] } : {},
				...catalog.stale === void 0 ? {} : { catalogStale: catalog.stale }
			};
		}
	});
	definition.parameters = { ...boundedParameterSchema(parameters, {
		role: ROLE_NAME_MAX_LENGTH,
		query: QUERY_MAX_LENGTH
	}) };
	return definition;
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
async function resolveRoute(llm, role, provider, model, reasoningEffort, maxTokens, signal) {
	try {
		await llm.resolveCallConfig({
			provider,
			model,
			...reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) },
			...maxTokens === void 0 ? {} : { maxTokens }
		}, signal);
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		if (!(error instanceof LlmError) && !(error instanceof Error)) throw error;
		throw new AgentRoleError(`agent role "${role.name}" declares model "${provider}/${model}", which cannot be used: ${boundedFailure(error.message)}`, "ROLE_INVALID_CONFIG", { cause: error });
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
function defineRoleTool(ctx, config, toolName, freshProvider, forkProvider, catalogFallback, catalog, discoveryToolName) {
	const parameters = {
		role: {
			type: "string",
			required: true,
			description: `Exact name of a declared agent role. Use \`${discoveryToolName}\` when unsure.`
		},
		prompt: {
			type: "string",
			required: true,
			description: "The complete, self-contained task for the role. A fresh role does not share this conversation, so include everything it needs."
		},
		label: {
			type: "string",
			description: "Short display label for this delegation; defaults to the role label."
		},
		cwd: {
			type: "string",
			description: "Initial child working directory. Relative paths use your current directory; omitted inherits it."
		}
	};
	const definition = defineTool({
		name: toolName,
		description: "",
		parameters,
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					kind: {
						type: "string",
						required: true,
						const: "activation"
					},
					subagentId: {
						type: "string",
						required: true
					},
					role: {
						type: "string",
						required: true
					},
					context: {
						type: "string",
						required: true,
						enum: ["fresh", "fork"]
					},
					provider: {
						type: "string",
						required: true
					},
					model: { type: "string" },
					agentPreset: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `started subagent ${value.subagentId} (${oneLine(value.role)}, ${value.context}, ${oneLine(value.provider)}` + (value.model === void 0 ? "" : `, ${oneLine(value.model)}`) + `${value.agentPreset === void 0 ? "" : `, preset ${oneLine(value.agentPreset)}`})`
			}],
			presentationMeta: (_args, value) => ({ roleActivation: {
				subagentId: value.subagentId,
				role: value.role,
				context: value.context,
				provider: value.provider,
				...value.model === void 0 ? {} : { model: value.model },
				...value.agentPreset === void 0 ? {} : { agentPreset: value.agentPreset }
			} })
		},
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			assertCharacterLimit(args.role, "role", ROLE_NAME_MAX_LENGTH);
			assertCharacterLimit(args.label, "label", ROLE_LABEL_MAX_LENGTH);
			if (args.label !== void 0 && args.label.trim().length === 0) throw new Error("label must include non-whitespace text");
			if (args.cwd !== void 0 && args.cwd.includes("\0")) throw new Error("cwd must not contain a null character");
			if (args.prompt.trim().length === 0) throw new Error("prompt must include non-whitespace text");
			const agent = exec.agent;
			if (agent === void 0) throw new Error(`${toolName} requires a calling agent (exec.agent was undefined)`);
			const role = resolveRole(ctx, args.role, discoveryToolName);
			const { provider, maxDepth } = await requireStableRoleHealth(ctx, config, role, freshProvider, forkProvider, catalogFallback, agent, exec.signal);
			exec.signal.throwIfAborted();
			if (ctx.subagents.getProvider(provider.name) !== provider) throw new AgentRoleError(`agent role "${role.name}" could not start because its subagent provider changed while resolving; retry the delegation`, "ROLE_INVALID_CONFIG");
			const agentOptions = agentOptionsFor(role, provider);
			return {
				kind: "activation",
				subagentId: (await ctx.subagents.startActivation({
					provider: provider.name,
					label: args.label ?? role.label,
					displayLabel: role.name,
					request: {
						prompt: [{
							type: "text",
							text: args.prompt
						}],
						parent: agent,
						...Object.keys(agentOptions).length === 0 ? {} : { agentOptions },
						...role.agentPreset === void 0 ? {} : { agentPreset: role.agentPreset },
						...maxDepth === void 0 ? {} : { maxDepth },
						...role.capacityGroup === void 0 ? {} : { capacityGroup: role.capacityGroup },
						...role.executionBudget === void 0 ? {} : { executionBudget: { ...role.executionBudget } },
						...role.outputSchema === void 0 ? {} : { outputSchema: role.outputSchema },
						...args.cwd === void 0 ? {} : { cwd: args.cwd }
					},
					signal: exec.signal,
					delivery: "parent"
				})).childId,
				role: oneLine(role.name),
				context: role.context,
				provider: oneLine(provider.name),
				...role.model === void 0 ? {} : { model: oneLine(`${role.model.provider}/${role.model.model}`) },
				...role.agentPreset === void 0 ? {} : { agentPreset: oneLine(role.agentPreset) }
			};
		}
	});
	definition.parameters = { ...boundedParameterSchema(parameters, {
		role: ROLE_NAME_MAX_LENGTH,
		label: ROLE_LABEL_MAX_LENGTH
	}) };
	Object.defineProperty(definition, "description", {
		enumerable: true,
		get: () => `Delegate a self-contained task to one declared agent role: a named, preconfigured child with its own model route and Agent Preset composition. A fresh role starts without this conversation and may select an independent Agent Preset; a fork role inherits the parent's completed turns and composition, and Agent Presets are only available to fresh roles. This tool starts a managed child and immediately returns its id; the runtime notifies you when it finishes. Call \`${discoveryToolName}\` when you need the available roles or a role's health.` + catalog.current.description
	});
	return definition;
}
function apply(ctx, config = {}) {
	const toolName = config.toolName ?? "role_agent";
	assertConfiguredToolName(toolName, "toolName");
	const discoveryToolName = config.discoveryToolName ?? "list_agent_roles";
	assertConfiguredToolName(discoveryToolName, "discoveryToolName");
	if (discoveryToolName === toolName) throw new Error("tool-agent-role: discoveryToolName must differ from toolName");
	if (config.maxDepth !== "provider-managed") assertSubagentMaxDepth(config.maxDepth);
	if (config.freshProvider !== void 0) assertConfiguredProviderName(config.freshProvider, "freshProvider");
	if (config.forkProvider !== void 0) assertConfiguredProviderName(config.forkProvider, "forkProvider");
	const limits = {
		maxRoles: config.maxRoles ?? 64,
		maxCatalogChars: config.maxCatalogChars ?? 8192
	};
	if (!Number.isSafeInteger(limits.maxRoles) || limits.maxRoles < 1) throw new Error("tool-agent-role: maxRoles must be a positive safe integer");
	if (!Number.isSafeInteger(limits.maxCatalogChars) || limits.maxCatalogChars < 1) throw new Error("tool-agent-role: maxCatalogChars must be a positive safe integer");
	const discoveryLimits = {
		pageSize: config.discoveryPageSize ?? 50,
		healthConcurrency: config.discoveryHealthConcurrency ?? 4
	};
	if (!Number.isSafeInteger(discoveryLimits.pageSize) || discoveryLimits.pageSize < 1) throw new Error("tool-agent-role: discoveryPageSize must be a positive safe integer");
	if (!Number.isSafeInteger(discoveryLimits.healthConcurrency) || discoveryLimits.healthConcurrency < 1) throw new Error("tool-agent-role: discoveryHealthConcurrency must be a positive safe integer");
	const freshProvider = config.freshProvider;
	const forkProvider = config.forkProvider ?? "fork";
	const catalogFallback = () => ctx.agentRoles.defaultBackingProvider;
	validateDeclaredRoles(ctx, freshProvider, forkProvider, catalogFallback, config.maxDepth);
	ctx.on("subagent/provider-added", (provider) => {
		reportProviderRoleConflicts(ctx, provider, freshProvider, forkProvider, catalogFallback, config.maxDepth);
	});
	const catalog = {
		current: catalogSummary(ctx.agentRoles.list(), limits.maxCatalogChars, discoveryToolName),
		stale: void 0
	};
	assertCatalogFits(catalog.current, limits);
	ctx.tools.register(defineRoleTool(ctx, config, toolName, freshProvider, forkProvider, catalogFallback, catalog, discoveryToolName));
	ctx.tools.register(defineDiscoveryTool(ctx, config, discoveryToolName, freshProvider, forkProvider, catalogFallback, catalog, discoveryLimits));
	ctx.on("loader/volatile-update", () => {
		let next;
		let invalidRoles;
		try {
			const snapshot = ctx.agentRoles.snapshot();
			invalidRoles = snapshot.invalid;
			next = catalogSummary(snapshot.roles.map(summarizeRole), limits.maxCatalogChars, discoveryToolName);
			assertCatalogFits(next, limits);
		} catch (error) {
			ctx.logger.warn(error);
			catalog.stale = catalogStaleReason(error, CATALOG_STALE_REASON_MAX_LENGTH);
			return;
		}
		const invalidReason = invalidRoles.length === 0 ? void 0 : truncateCodePoints(`${invalidRoles.length === 1 ? "role" : "roles"} ${invalidRoles.map((role) => oneLine(role.name)).join(", ")} failed validation and ${invalidRoles.length === 1 ? "is" : "are"} excluded from the inline catalog`, CATALOG_STALE_REASON_MAX_LENGTH);
		if (next.description === catalog.current.description && next.names.length === catalog.current.names.length && next.names.every((name, index) => name === catalog.current.names[index])) {
			catalog.stale = invalidReason;
			return;
		}
		catalog.current = next;
		catalog.stale = invalidReason;
	}, { global: true });
}
//#endregion
export { Config, apply, inject, name };
