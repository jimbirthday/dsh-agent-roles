/** Locale bundles for the Agent Roles configuration page. */
import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives';
/** Locale keys the page renders. */
export type AgentRoleConfigLocaleKey = 'summary' | 'title' | 'description' | 'defaultBacking' | 'defaultBackingHint' | 'backingReset' | 'overridden' | 'rolesTitle' | 'rolesHint' | 'emptyRoles' | 'addRole' | 'removeRole' | 'unnamedRole' | 'roleHeading' | 'roleName' | 'roleNameHint' | 'label' | 'labelHint' | 'roleDescription' | 'roleDescriptionHint' | 'context' | 'contextHint' | 'fresh' | 'fork' | 'tags' | 'tagsHint' | 'modelProvider' | 'model' | 'reasoningEffort' | 'maxTokens' | 'modelRoute' | 'modelRouteHint' | 'modelInherit' | 'modelSelectPlaceholder' | 'modelUnavailable' | 'effortSelectPlaceholder' | 'effortInherit' | 'effortNone' | 'effortHint' | 'modelCatalogLoading' | 'modelCatalogFailed' | 'modelCatalogRetry' | 'modelCatalogPartial' | 'modelCatalogEmpty' | 'agentPreset' | 'agentPresetHint' | 'backingProvider' | 'backingProviderHint' | 'delegationDepth' | 'delegationDepthHint' | 'capacityGroup' | 'capacityGroupHint' | 'wallClockMs' | 'wallClockHint' | 'outputSchema' | 'outputSchemaHint' | 'optional' | 'advanced' | 'advancedHint' | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed' | 'nameRequired' | 'nameInvalid' | 'nameDuplicate' | 'nameReserved' | 'nameTooLong' | 'labelRequired' | 'labelTooLong' | 'descriptionTooLong' | 'tagsInvalid' | 'modelRouteRequired' | 'identifierInvalid' | 'positiveInteger' | 'nonNegativeInteger' | 'effortUnsupported' | 'presetForkConflict' | 'schemaInvalid' | 'schemaRoot';
/** English copy. */
export declare const en: Record<AgentRoleConfigLocaleKey, string>;
/** Simplified Chinese copy. */
export declare const zh: Record<AgentRoleConfigLocaleKey, string>;
/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export declare function formLabels(t: (key: AgentRoleConfigLocaleKey) => string): SettingsFormLabels;
//# sourceMappingURL=locales.d.ts.map