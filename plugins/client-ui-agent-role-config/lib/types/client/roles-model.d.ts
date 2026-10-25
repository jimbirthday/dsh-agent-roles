/**
 * Staged editor state for the Agent Roles catalog. The Host keeps the role
 * table as one volatile dictionary, so this page edits the complete table and
 * writes it back as one revision-fenced mutation rather than exposing one
 * settings field per role.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { SettingsFormScope, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots';
import type { AgentRoleConfigLocaleKey } from './locales.ts';
/** Settings namespace registered by the `agent-roles` Loader row. */
export declare const AGENT_ROLES_NS = "agent-roles";
/** Settings namespace registered by the `agent-roles` Loader row in the shipped bundle patch. */
export declare const AGENT_ROLE_CONFIG_BUNDLE = "@deepseek-ai/dsh-experimental-agent-role-profile";
/** The two context modes a role may declare. */
export type RoleContext = 'fresh' | 'fork';
/** One role row as the page edits it. Every optional field is present as a draft string. */
export interface RoleDraft {
    /** Stable draft identity; the catalog key is what is saved. */
    readonly draftId: string;
    /** Model-facing role name. */
    name: string;
    /** Human-facing label. */
    label: string;
    /** Optional one-line description. */
    description: string;
    /** Comma-separated discovery tags. */
    tags: string;
    /** `fresh` starts a new conversation; `fork` inherits the parent turns. */
    context: RoleContext;
    /** Optional model provider. */
    provider: string;
    /** Optional model id. */
    model: string;
    /** Optional adapter-owned reasoning effort. */
    reasoningEffort: string;
    /** Optional positive output-token cap. */
    maxTokens: string;
    /** Optional agent preset id. */
    agentPreset: string;
    /** Optional subagent provider id. */
    backingProvider: string;
    /** Optional absolute delegation-depth cap. */
    delegationDepth: string;
    /** Optional subagent capacity group. */
    capacityGroup: string;
    /** Optional activation wall-clock budget in milliseconds. */
    wallClockMs: string;
    /** Optional object JSON Schema, serialized for editing. */
    outputSchema: string;
}
/** What one role draft renders, including blocking validation and a stable row key. */
export interface RoleDraftState extends RoleDraft {
    /** Localized validation message, or undefined when the draft can be saved. */
    error?: string;
    /** Stable validation outcome that selects the affected control. */
    errorCode?: RoleValidationCode;
    /** Draft field the validation outcome belongs to. */
    errorField?: RoleValidationField;
}
/** Why a role draft cannot be saved. */
export type RoleValidationCode = 'nameRequired' | 'nameInvalid' | 'nameDuplicate' | 'nameReserved' | 'nameTooLong' | 'labelRequired' | 'labelTooLong' | 'descriptionTooLong' | 'tagsInvalid' | 'modelRouteRequired' | 'identifierInvalid' | 'positiveInteger' | 'nonNegativeInteger' | 'presetForkConflict' | 'schemaInvalid' | 'schemaRoot' | 'effortUnsupported';
/** The control a role validation outcome marks invalid. */
export type RoleValidationField = RoleField | 'modelRoute';
/** What the page renders. */
export interface AgentRoleConfigState extends SettingsFormShell {
    /** Deployment fallback for roles that name no backing provider. */
    defaultBacking: string;
    /** Whether the default backing provider came from a user override. */
    defaultBackingOverridden: boolean;
    /** Whether the draft clears the user-layer override instead of writing the visible text. */
    defaultBackingCleared: boolean;
    /** Whether the default backing provider draft is not a valid identifier. */
    defaultBackingInvalid: boolean;
    /** Host model directories grouped by provider. */
    catalogGroups: readonly ModelProviderGroup[];
    /** Adapter-directory request state. */
    catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
    /** Whether at least one provider's directory request failed. */
    catalogPartial: boolean;
    /** Host failure message from the last directory request. */
    catalogError: string | null;
    /** Roles in catalog order. */
    roles: readonly RoleDraftState[];
}
/** Actions the slot registration injects. */
export interface AgentRoleConfigFace {
    /** Snapshot the renderer binds as `useAgentRoleConfig`. */
    hooks: {
        agentRoleConfig: SnapshotStore<AgentRoleConfigState>;
    };
    /** Change the deployment fallback for roles without a backing provider. */
    editDefaultBacking: (text: string) => void;
    /** Reset the deployment fallback to the inherited composition value. */
    resetDefaultBacking: () => void;
    /** Add one draft role. */
    addRole: () => void;
    /** Remove one draft role. */
    removeRole: (draftId: string) => void;
    /** Change one field of one draft role. */
    editRole: (draftId: string, field: RoleField, text: string) => void;
    /** Change one role's context mode. */
    setContext: (draftId: string, context: RoleContext) => void;
    /** Select one provider, clearing a model the provider does not advertise. */
    setProvider: (draftId: string, provider: string) => void;
    /** Retry the Host model directory. */
    retryCatalog: () => void;
    /** Write every staged edit and clear the drafts on acceptance. */
    save: () => void;
    /** Drop every staged edit. */
    discard: () => void;
}
/** Draft fields the page edits as text. */
export type RoleField = Exclude<keyof RoleDraft, 'draftId' | 'context'>;
/** The settings section this page edits. */
export interface AgentRoleSettings {
    roles?: Record<string, unknown>;
    backingProvider?: string;
}
/**
 * Bind the complete role table to one staged editor.
 *
 * A save writes the whole `roles` dictionary and the optional deployment
 * fallback under one expected revision. Replacing the dictionary lets a role
 * be renamed without leaving its previous key behind; every draft is validated
 * before the write, and a Host refusal keeps the drafts for correction.
 */
export declare class AgentRoleConfigController {
    private readonly scope;
    private readonly ctx;
    private readonly t;
    private readonly store;
    private staged;
    private initial;
    private acceptedValue;
    private acceptedDraft;
    private saving;
    private failed;
    private disposed;
    private catalogGroups;
    private catalogStatus;
    private catalogPartial;
    private catalogError;
    private catalogGeneration;
    private saveGeneration;
    private readonly unsubscribe;
    /**
     * @param scope - the `agent-roles` settings section.
     * @param ctx - the browser plugin context, whose `remote.session` namespace
     * answers the Host model directory.
     * @param t - page dictionary reader for validation messages.
     */
    constructor(scope: SettingsFormScope<AgentRoleSettings>, ctx: ClientContext, t: Translate<AgentRoleConfigLocaleKey>);
    /**
     * Expose the page snapshot and every staged-edit action to the registered slot.
     * @returns the face the bundle page renders and mutates through.
     */
    inject(): AgentRoleConfigFace;
    /** Release the accepted-value subscription. */
    dispose(): void;
    /** Invalidate the model directory and request it again after a Host model change. */
    refreshCatalog(): void;
    /** Discard directory results from the previous connection and reload them. */
    resetConnection(): void;
    private loadCatalog;
    /**
     * Validate every draft and write the catalog with one revision fence.
     * @returns settlement after the Host answer and recovery read.
     */
    save(): Promise<void>;
    /**
     * Stage one edit over the accepted values.
     * @param change - draft transformation.
     */
    private edit;
    /** @returns the currently displayed list, built from accepted values and staged edits. */
    private current;
    /**
     * Clear a stored reasoning effort the newly selected model does not
     * advertise, so an edit cannot leave a route the model refuses. A route the
     * directory does not describe keeps its text.
     * @param role - the draft after a provider or model change.
     * @returns the draft with a supported effort, or an empty one.
     */
    private withSupportedEffort;
    /** @returns one draft list read from the accepted section. */
    private accepted;
    /**
     * Validate every draft into render state.
     * @returns the drafts and their first blocking message.
     */
    private roleStates;
    /**
     * @returns the writes a save performs, or undefined while blocked or unchanged.
     */
    private plan;
    /** Rebuild and publish the projection. */
    private projection;
    private publish;
}
//# sourceMappingURL=roles-model.d.ts.map