import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { assertObjectJsonSchema } from "@deepseek-ai/dsh-tools";
//#region lib/types/error.js
/** Stable failures raised by the Agent Role catalog. */
/** A typed Agent Role failure carrying a stable {@link AgentRoleErrorCode}. */
var AgentRoleError = class extends Error {
	code;
	/**
	* @param message - action-oriented description naming the role and the fix.
	* @param code - stable machine-readable failure code.
	* @param options - optional cause chain.
	*/
	constructor(message, code, options) {
		super(message, options);
		this.code = code;
		this.name = "AgentRoleError";
	}
};
//#endregion
//#region lib/types/index.js
/**
* The Agent Role catalog (`ctx.agentRoles`): one named, declarative role per
* entry, binding a model route, an optional agent preset, a backing subagent
* provider, and delegation defaults. Consumers resolve a role into existing
* `@deepseek-ai/dsh-subagent` start fields, so this package never executes a
* child itself — it is a read-only definition catalog.
*
* The `roles` table is a volatile Config field: a deployment base supplies the
* shipped roles through `cordis.patch.yml`, and a user may override or extend
* the table at runtime. Reads validate the live table and return detached
* snapshots, so a later edit never mutates a value a consumer already holds.
*
* @module @deepseek-ai/dsh-experimental-agent-role
*/
/** The deployment fallback returned by {@link AgentRoleRegistry.backingProviderFor}. */
const DEFAULT_BACKING_PROVIDER = "spawn";
/** Role names that would alias an object prototype member in plain-record code. */
const RESERVED_ROLE_NAMES = new Set([
	"__proto__",
	"prototype",
	"constructor"
]);
/** Role names that remain usable as one model-facing catalog line and enum value. */
const ROLE_NAME_PATTERN = /^[^\s`"\\]+$/u;
/** Provider, preset, and model identifiers must remain usable in one catalog line. */
const ROLE_IDENTIFIER_PATTERN = /^[^\s`"\\]+$/u;
/**
* Maximum code points in one role name. The delegation and discovery tools
* reject longer model-supplied names, so the catalog rejects them at load
* rather than exposing a role no consumer can address.
*/
const ROLE_NAME_MAX_LENGTH = 256;
/** Fields a role definition may declare. */
const ROLE_FIELDS = new Set([
	"label",
	"description",
	"tags",
	"model",
	"agentPreset",
	"backingProvider",
	"contextDefault",
	"delegationDepth",
	"capacityGroup",
	"executionBudget",
	"outputSchema"
]);
/** Maximum tag count in one role definition. */
const ROLE_TAGS_MAX_COUNT = 16;
/** Maximum code points in one role tag. */
const ROLE_TAG_MAX_LENGTH = 64;
/** Maximum code points in a role's human-facing label. */
const ROLE_LABEL_MAX_LENGTH = 256;
/** Maximum code points in a role description rendered by discovery. */
const ROLE_DESCRIPTION_MAX_LENGTH = 4096;
/** Maximum code points in one role-owned identifier such as a provider or preset id. */
const ROLE_IDENTIFIER_MAX_LENGTH = 256;
/** Maximum code points retained from a row-scoped failure shown by discovery. */
const ROLE_PROBLEM_MAX_LENGTH = 2048;
/** Marker appended when a role-scoped failure exceeds the discovery budget. */
const ROLE_PROBLEM_TRUNCATION = "…";
/** Fields a role model route may declare. */
const MODEL_FIELDS = new Set([
	"provider",
	"model",
	"reasoningEffort",
	"maxTokens"
]);
/** Fields one role execution budget may declare. */
const EXECUTION_BUDGET_FIELDS = new Set(["wallClockMs"]);
/** Runtime schema for one role's model route. */
const roleModelSchema = z.object({
	provider: z.string().min(1).required(),
	model: z.string().min(1).required(),
	reasoningEffort: z.string().min(1),
	maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER)
});
/** Runtime schema for one declared role. */
const roleSchema = z.object({
	label: z.string().min(1).required(),
	description: z.string(),
	tags: z.union([z.array(z.string()), z.const(void 0)]),
	model: z.union([roleModelSchema, z.const(void 0)]),
	agentPreset: z.string().min(1),
	backingProvider: z.string().min(1),
	contextDefault: z.union([z.const("fresh"), z.const("fork")]),
	delegationDepth: z.natural().max(Number.MAX_SAFE_INTEGER),
	capacityGroup: z.string().min(1),
	executionBudget: z.union([z.object({ wallClockMs: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER) }), z.const(void 0)]),
	outputSchema: z.any()
});
/**
* Validate one string and its code-point bound.
* @param value - the untrusted value.
* @param subject - what the value names, for the failure message.
* @param maxLength - maximum accepted code points.
* @returns the same string once proven to be a bounded string.
*/
function boundedString(value, subject, maxLength) {
	if (typeof value !== "string") throw new AgentRoleError(`${subject} must be a string`, "ROLE_INVALID_CONFIG");
	if (codePointLength(value) > maxLength) throw new AgentRoleError(`${subject} must not exceed ${maxLength} characters`, "ROLE_INVALID_CONFIG");
	return value;
}
/**
* Validate one non-empty identifier.
* @param value - the candidate identifier.
* @param subject - what the identifier names, for the failure message.
* @returns the same string once proven non-empty.
*/
function nonEmpty(value, subject, maxLength = ROLE_IDENTIFIER_MAX_LENGTH) {
	const identifier = boundedString(value, subject, maxLength);
	if (identifier.trim().length === 0) throw new AgentRoleError(`${subject} must be a non-empty string`, "ROLE_INVALID_CONFIG");
	return identifier;
}
/**
* Validate one identifier that is rendered beside other catalog facts.
* @param value - the untrusted value.
* @param subject - what the identifier names, for the failure message.
* @returns the same string once accepted.
*/
function identifier(value, subject) {
	const checked = nonEmpty(value, subject);
	if (!ROLE_IDENTIFIER_PATTERN.test(checked)) throw new AgentRoleError(`${subject} must not contain whitespace, backticks, quotes, or backslashes`, "ROLE_INVALID_CONFIG");
	return checked;
}
/**
* Test whether a live value is a plain object record.
* @param value - the untrusted value.
* @returns whether the value can carry named role fields.
*/
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Validate one role name before the config dictionary writes it to a record.
* @param name - the candidate role name.
* @returns the same name once accepted.
*/
function assertRoleName(name) {
	nonEmpty(name, "role name");
	if (codePointLength(name) > ROLE_NAME_MAX_LENGTH) throw new AgentRoleError(`role name must not exceed ${ROLE_NAME_MAX_LENGTH} characters`, "ROLE_INVALID_CONFIG");
	if (!ROLE_NAME_PATTERN.test(name)) throw new AgentRoleError(`role name ${JSON.stringify(name)} must not contain whitespace, backticks, quotes, or backslashes`, "ROLE_INVALID_CONFIG");
	if (RESERVED_ROLE_NAMES.has(name)) throw new AgentRoleError(`role name "${name}" is reserved; choose a name that is not an object prototype key`, "ROLE_INVALID_CONFIG");
	return name;
}
/**
* Count Unicode code points without splitting surrogate pairs.
* @param value - candidate string.
* @returns the number of code points.
*/
function codePointLength(value) {
	let count = 0;
	for (const _codePoint of value) count += 1;
	return count;
}
/**
* Bound a rejected table key before it enters an invalid row. A live table can
* gain a key the config schema never validated; discovery and error surfaces
* echo that key, so retain a code-point-safe prefix instead of the raw value.
* @param name - the rejected role name.
* @returns the name when already bounded, otherwise a prefixed truncation.
*/
function boundedInvalidName(name) {
	if (codePointLength(name) <= ROLE_NAME_MAX_LENGTH) return name;
	const marker = "…";
	let truncated = "";
	let count = 0;
	for (const codePoint of name) {
		if (count === ROLE_NAME_MAX_LENGTH - codePointLength(marker)) break;
		truncated += codePoint;
		count += 1;
	}
	return `${truncated}${marker}`;
}
/**
* Collapse one live failure into a bounded single line. Both valid and invalid
* rows reach model-facing discovery text, so configured or thrown text must
* not add rows or consume the page budget.
* @param message - failure text from a role read.
* @returns the normalized, bounded message.
*/
function boundedFailure(message) {
	const oneLine = message.replace(/\s+/gu, " ").trim();
	if (codePointLength(oneLine) <= ROLE_PROBLEM_MAX_LENGTH) return oneLine;
	let truncated = "";
	let count = 0;
	const keep = ROLE_PROBLEM_MAX_LENGTH - codePointLength(ROLE_PROBLEM_TRUNCATION);
	for (const codePoint of oneLine) {
		if (count === keep) break;
		truncated += codePoint;
		count += 1;
	}
	return `${truncated}${ROLE_PROBLEM_TRUNCATION}`;
}
/** The config dictionary's key schema, checked before Schemastery assigns the entry. */
const roleNameSchema = z.transform(z.string(), assertRoleName);
/**
* Validate one role definition in place.
* @param name - the immutable role name.
* @param definition - the declared definition.
*/
function assertRole(name, definition) {
	assertRoleName(name);
	if (!isRecord(definition)) throw new AgentRoleError(`role ${JSON.stringify(name)} must be an object`, "ROLE_INVALID_CONFIG");
	assertKnownFields(name, "role", definition, ROLE_FIELDS);
	nonEmpty(definition.label, `role "${name}" label`, ROLE_LABEL_MAX_LENGTH);
	if (definition.description !== void 0) boundedString(definition.description, `role "${name}" description`, ROLE_DESCRIPTION_MAX_LENGTH);
	if (definition.contextDefault !== void 0 && definition.contextDefault !== "fresh" && definition.contextDefault !== "fork") throw new AgentRoleError(`role "${name}" contextDefault must be "fresh" or "fork"`, "ROLE_INVALID_CONFIG");
	const model = definition.model;
	if (model === void 0) {
		assertOptionalFields(name, definition);
		return;
	}
	if (!isRecord(model)) throw new AgentRoleError(`role ${JSON.stringify(name)} model must be an object`, "ROLE_INVALID_CONFIG");
	assertKnownFields(name, "model", model, MODEL_FIELDS);
	identifier(model.provider, `role "${name}" model.provider`);
	identifier(model.model, `role "${name}" model.model`);
	if (model.reasoningEffort !== void 0) identifier(model.reasoningEffort, `role "${name}" model.reasoningEffort`);
	if (model.maxTokens !== void 0 && (typeof model.maxTokens !== "number" || !Number.isSafeInteger(model.maxTokens) || model.maxTokens < 1)) throw new AgentRoleError(`role ${JSON.stringify(name)} model.maxTokens must be a positive safe integer`, "ROLE_INVALID_CONFIG");
	assertOptionalFields(name, definition);
}
/**
* Reject fields the role schema does not declare. Schemastery keeps unknown
* keys on a non-strict object, so a misspelled field would otherwise disappear
* into the live table while its intended setting silently kept its default.
* @param name - the immutable role name.
* @param subject - the value being checked, for the failure message.
* @param value - the declared object.
* @param supported - fields the schema accepts.
*/
function assertKnownFields(name, subject, value, supported) {
	const unknown = Object.keys(value).filter((field) => !supported.has(field));
	if (unknown.length === 0) return;
	const fields = unknown.map((field) => JSON.stringify(field.replace(/\s+/gu, " "))).join(", ");
	const accepted = [...supported].map((field) => `"${field}"`).join(", ");
	throw new AgentRoleError(`role ${JSON.stringify(name)} ${subject} declares unknown ${unknown.length === 1 ? "field" : "fields"} ${fields}; supported fields are ${accepted}`, "ROLE_INVALID_CONFIG");
}
/**
* Validate the role fields independent of whether the role binds a model route.
* @param name - the immutable role name.
* @param definition - the declared definition.
*/
function assertOptionalFields(name, definition) {
	if (definition.tags !== void 0) assertTags(name, definition.tags);
	if (definition.delegationDepth !== void 0 && (typeof definition.delegationDepth !== "number" || !Number.isSafeInteger(definition.delegationDepth) || definition.delegationDepth < 0)) throw new AgentRoleError(`role ${JSON.stringify(name)} delegationDepth must be a non-negative safe integer`, "ROLE_INVALID_CONFIG");
	if (definition.agentPreset !== void 0) {
		identifier(definition.agentPreset, `role "${name}" agentPreset`);
		if (definition.contextDefault === "fork") throw new AgentRoleError(`role "${name}" cannot combine contextDefault "fork" with agentPreset: fork children inherit the parent composition`, "ROLE_INVALID_CONFIG");
	}
	if (definition.backingProvider !== void 0) identifier(definition.backingProvider, `role "${name}" backingProvider`);
	if (definition.capacityGroup !== void 0) identifier(definition.capacityGroup, `role "${name}" capacityGroup`);
	if (definition.executionBudget !== void 0) {
		if (!isRecord(definition.executionBudget)) throw new AgentRoleError(`role ${JSON.stringify(name)} executionBudget must be an object`, "ROLE_INVALID_CONFIG");
		assertKnownFields(name, "executionBudget", definition.executionBudget, EXECUTION_BUDGET_FIELDS);
		const wallClockMs = definition.executionBudget.wallClockMs;
		if (wallClockMs !== void 0 && (typeof wallClockMs !== "number" || !Number.isSafeInteger(wallClockMs) || wallClockMs < 1)) throw new AgentRoleError(`role ${JSON.stringify(name)} executionBudget.wallClockMs must be a positive safe integer`, "ROLE_INVALID_CONFIG");
	}
	if (definition.outputSchema !== void 0) try {
		assertObjectJsonSchema(definition.outputSchema);
	} catch (error) {
		if (!(error instanceof Error)) throw error;
		throw new AgentRoleError(boundedFailure(`role ${JSON.stringify(name)} outputSchema is invalid: ${error.message}`), "ROLE_INVALID_CONFIG", { cause: error });
	}
}
/**
* Validate one role's discovery keywords. Tags are optional, but a declared
* tag must be a bounded non-empty single-line string, and the list must not
* repeat a tag.
* @param name - the immutable role name.
* @param tags - the declared keyword list.
*/
function assertTags(name, tags) {
	if (!Array.isArray(tags)) throw new AgentRoleError(`role ${JSON.stringify(name)} tags must be an array of strings`, "ROLE_INVALID_CONFIG");
	if (tags.length > ROLE_TAGS_MAX_COUNT) throw new AgentRoleError(`role "${name}" tags must contain at most ${ROLE_TAGS_MAX_COUNT} entries`, "ROLE_INVALID_CONFIG");
	const seen = /* @__PURE__ */ new Set();
	for (const tag of tags) {
		const checked = nonEmpty(tag, `role "${name}" tag`, ROLE_TAG_MAX_LENGTH);
		if (/\s/u.test(checked)) throw new AgentRoleError(`role "${name}" tag ${JSON.stringify(tag)} must not contain whitespace`, "ROLE_INVALID_CONFIG");
		if (seen.has(checked)) throw new AgentRoleError(`role "${name}" declares tag ${JSON.stringify(tag)} more than once`, "ROLE_INVALID_CONFIG");
		seen.add(checked);
	}
}
/**
* Read a live role table as its name/definition entries.
* @param roles - untrusted table from the volatile config reference.
* @returns the table entries, in insertion order.
*/
function readTableEntries(roles) {
	if (!isRecord(roles)) throw new AgentRoleError("agent roles must be an object mapping names to definitions", "ROLE_INVALID_CONFIG");
	try {
		return Object.entries(roles);
	} catch (error) {
		throw new AgentRoleError(boundedFailure(`agent roles could not be read: ${error instanceof Error ? error.message : String(error)}`), "ROLE_INVALID_CONFIG", { cause: error });
	}
}
/**
* Validate a live role table and narrow each structured-output schema.
* @param roles - untrusted table from the volatile config reference.
* @returns the same entries typed as validated role definitions.
*/
function readValidatedTable(roles) {
	const validated = {};
	for (const [name, definition] of readTableEntries(roles)) {
		assertRole(name, definition);
		validated[name] = definition;
	}
	return validated;
}
/**
* Read a live role table without hiding valid roles behind one malformed
* entry. Loading still validates the whole table eagerly; discovery uses this
* split read to report row-level failures beside usable roles.
* @param roles - untrusted table from the volatile config reference.
* @returns valid resolved roles and rejected entries, both ordered by name.
*/
function readRoleSnapshot(roles) {
	const valid = [];
	const invalid = [];
	for (const [name, definition] of readTableEntries(roles).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) try {
		assertRole(name, definition);
		valid.push(resolveDefinition(name, definition));
	} catch (error) {
		if (error instanceof AgentRoleError && error.code === "ROLE_INVALID_CONFIG") {
			invalid.push({
				name: boundedInvalidName(name),
				code: error.code,
				message: boundedFailure(error.message)
			});
			continue;
		}
		invalid.push({
			name: boundedInvalidName(name),
			code: "ROLE_INVALID_CONFIG",
			message: boundedFailure(`role ${JSON.stringify(boundedInvalidName(name))} could not be read: ` + (error instanceof Error ? error.message : String(error)))
		});
	}
	return {
		roles: valid,
		invalid
	};
}
/** Detach one role's model route into a fresh copy. */
function copyModel(model) {
	return {
		provider: model.provider,
		model: model.model,
		...model.reasoningEffort === void 0 ? {} : { reasoningEffort: model.reasoningEffort },
		...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
	};
}
/** Detach one structured-output schema so a caller cannot mutate catalog state. */
function copyOutputSchema(schema) {
	return structuredClone(schema);
}
/**
* Project one validated definition into a detached snapshot.
* @param name - the immutable role name.
* @param definition - the validated definition.
* @returns the detached resolved role.
*/
function resolveDefinition(name, definition) {
	return {
		name,
		label: definition.label,
		...definition.description === void 0 ? {} : { description: definition.description },
		...definition.tags === void 0 ? {} : { tags: [...definition.tags] },
		...definition.model === void 0 ? {} : { model: copyModel(definition.model) },
		...definition.agentPreset === void 0 ? {} : { agentPreset: definition.agentPreset },
		...definition.backingProvider === void 0 ? {} : { backingProvider: definition.backingProvider },
		context: definition.contextDefault ?? "fresh",
		...definition.delegationDepth === void 0 ? {} : { delegationDepth: definition.delegationDepth },
		...definition.capacityGroup === void 0 ? {} : { capacityGroup: definition.capacityGroup },
		...definition.executionBudget === void 0 ? {} : { executionBudget: copyExecutionBudget(definition.executionBudget) },
		...definition.outputSchema === void 0 ? {} : { outputSchema: copyOutputSchema(definition.outputSchema) }
	};
}
/**
* Copy a role's execution budget so callers cannot mutate catalog state.
* @param budget - the validated declared budget.
* @returns a detached budget snapshot.
*/
function copyExecutionBudget(budget) {
	return budget.wallClockMs === void 0 ? {} : { wallClockMs: budget.wallClockMs };
}
/**
* Project one resolved role into the browsing summary consumers render. This
* is the single projection for both `list()` and catalog refresh paths, so a
* new summary field cannot reach one caller but not the other.
* @param role - one validated role snapshot.
* @returns the detached catalog row.
*/
function summarizeRole(role) {
	const { backingProvider: _backingProvider, delegationDepth: _delegationDepth, outputSchema: _outputSchema, model: _model, ...summary } = role;
	return {
		...summary,
		...role.model === void 0 ? {} : {
			provider: role.model.provider,
			model: role.model.model
		},
		restricted: role.agentPreset !== void 0,
		structuredOutput: role.outputSchema !== void 0
	};
}
/**
* Owns the deployment's declarative agent role catalog. Reads validate the live
* volatile table and return detached snapshots; the service executes nothing.
*/
var AgentRoleRegistry = class extends Service {
	static Config = z.object({
		roles: z.dict(roleSchema, roleNameSchema).default({}).volatile(),
		backingProvider: z.string().min(1).volatile()
	});
	config;
	constructor(ctx, config) {
		super(ctx, "agentRoles");
		this.config = config;
		nonEmpty(config.backingProvider?.get() ?? DEFAULT_BACKING_PROVIDER, "agent-roles backingProvider");
		this.readTable();
	}
	/**
	* Read and validate the live role table.
	* @returns the validated table.
	*/
	readTable() {
		return readValidatedTable(this.config.roles.get());
	}
	/** The deployment fallback returned by {@link backingProviderFor}. */
	get fallbackProvider() {
		return nonEmpty(this.config.backingProvider?.get() ?? DEFAULT_BACKING_PROVIDER, "agent-roles backingProvider");
	}
	/**
	* The deployment fallback a consumer uses when a role names no backing
	* provider. Unlike {@link backingProviderFor}, this reads no role name and
	* never raises `ROLE_UNKNOWN`.
	*/
	get defaultBackingProvider() {
		return this.fallbackProvider;
	}
	/**
	* List every declared role as a detached catalog row, ordered by name.
	* @returns one summary per role.
	*/
	list() {
		return this.snapshot().roles.map(summarizeRole);
	}
	/**
	* List every declared role as a detached resolved snapshot from one table
	* read, ordered by name. Consumers that need several declared fields use
	* this instead of calling `resolve()` once per row, so a concurrent volatile
	* edit cannot split one result across two catalog generations.
	* @returns one resolved role per declaration.
	*/
	listResolved() {
		return this.snapshot().roles;
	}
	/**
	* Read every role without one malformed entry hiding the others. Valid
	* entries are resolved; invalid entries carry their role-scoped failure so
	* discovery can report both.
	* @returns valid roles and invalid entries, both ordered by name.
	*/
	snapshot() {
		return readRoleSnapshot(this.config.roles.get());
	}
	/**
	* List every declared role name, ordered.
	* @returns the role names.
	*/
	names() {
		return this.snapshot().roles.map((role) => role.name);
	}
	/**
	* Whether a role name is declared.
	* @param name - the role name to test.
	* @returns whether the name is declared.
	*/
	has(name) {
		const snapshot = this.snapshot();
		return snapshot.roles.some((role) => role.name === name) || snapshot.invalid.some((role) => role.name === name);
	}
	/**
	* Resolve one role into a detached snapshot. `context` defaults to `fresh`;
	* an absent `backingProvider` stays undefined so the consumer selects the
	* provider that matches `context`.
	* @param name - the role name to resolve.
	* @returns the resolved role.
	* @throws AgentRoleError `ROLE_UNKNOWN` when the name is not declared.
	*/
	resolve(name) {
		const resolved = this.tryResolve(name);
		if (resolved === void 0) throw new AgentRoleError(`unknown agent role "${name}"`, "ROLE_UNKNOWN");
		return resolved;
	}
	/**
	* Resolve one role, or return undefined when it is not declared.
	* @param name - the role name to resolve.
	* @returns the resolved role, or undefined.
	*/
	tryResolve(name) {
		const snapshot = this.snapshot();
		const resolved = snapshot.roles.find((role) => role.name === name);
		if (resolved !== void 0) return resolved;
		const invalid = snapshot.invalid.find((role) => role.name === name);
		if (invalid !== void 0) throw new AgentRoleError(invalid.message, invalid.code);
	}
	/**
	* Resolve the subagent provider a role delegates through.
	* @param name - the role name.
	* @returns the role's backing provider, or the deployment default.
	* @throws AgentRoleError `ROLE_UNKNOWN` when the name is not declared.
	*/
	backingProviderFor(name) {
		return this.resolve(name).backingProvider ?? this.fallbackProvider;
	}
};
//#endregion
export { AgentRoleError, AgentRoleRegistry, AgentRoleRegistry as default, summarizeRole };
