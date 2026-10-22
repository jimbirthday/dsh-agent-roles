/** Locale bundles for the Agent Roles configuration page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type AgentRoleConfigLocaleKey =
  | 'summary' | 'title' | 'description'
  | 'defaultBacking' | 'defaultBackingHint' | 'backingReset' | 'overridden'
  | 'rolesTitle' | 'rolesHint' | 'emptyRoles' | 'addRole' | 'removeRole' | 'unnamedRole' | 'roleHeading'
  | 'roleName' | 'roleNameHint'
  | 'label' | 'labelHint'
  | 'roleDescription' | 'roleDescriptionHint'
  | 'context' | 'contextHint' | 'fresh' | 'fork'
  | 'tags' | 'tagsHint'
  | 'modelProvider' | 'model' | 'reasoningEffort' | 'maxTokens' | 'modelRoute' | 'modelRouteHint'
  | 'modelInherit' | 'modelSelectPlaceholder' | 'modelUnavailable'
  | 'effortSelectPlaceholder' | 'effortInherit' | 'effortNone' | 'effortHint'
  | 'modelCatalogLoading' | 'modelCatalogFailed' | 'modelCatalogRetry' | 'modelCatalogPartial' | 'modelCatalogEmpty'
  | 'agentPreset' | 'agentPresetHint'
  | 'backingProvider' | 'backingProviderHint'
  | 'delegationDepth' | 'delegationDepthHint'
  | 'capacityGroup' | 'capacityGroupHint'
  | 'wallClockMs' | 'wallClockHint'
  | 'outputSchema' | 'outputSchemaHint'
  | 'optional' | 'advanced' | 'advancedHint'
  | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed'
  | 'nameRequired' | 'nameInvalid' | 'nameDuplicate' | 'nameReserved' | 'nameTooLong'
  | 'labelRequired' | 'labelTooLong' | 'descriptionTooLong' | 'tagsInvalid'
  | 'modelRouteRequired' | 'identifierInvalid' | 'positiveInteger' | 'nonNegativeInteger'
  | 'effortUnsupported'
  | 'presetForkConflict' | 'schemaInvalid' | 'schemaRoot'

/** English copy. */
export const en: Record<AgentRoleConfigLocaleKey, string> = {
  summary: 'Edit the named roles the role_agent tool can delegate to.',
  title: 'Agent roles',
  description: 'Add, remove, and edit the roles the role_agent tool offers to the model.',
  defaultBacking: 'Default backing provider',
  defaultBackingHint: 'Used when a role names no backing provider. Leave blank to use the deployment default.',
  backingReset: 'Use inherited value',
  overridden: 'Overridden',
  rolesTitle: 'Roles',
  rolesHint: 'Each role is addressable by its name in the role_agent tool. Changes are saved together.',
  emptyRoles: 'No roles are declared. Add one to let the model delegate by role.',
  addRole: 'Add role',
  removeRole: 'Remove role {name}',
  unnamedRole: 'Unnamed role',
  roleHeading: 'Role {name}',
  roleName: 'Role name',
  roleNameHint: 'Model-facing key. It cannot contain whitespace, quotes, backticks, or backslashes.',
  label: 'Label',
  labelHint: 'Human-facing name shown by catalogs and selectors.',
  roleDescription: 'Description',
  roleDescriptionHint: 'One-line explanation of what this role is for.',
  context: 'Context',
  contextHint: 'Fresh starts a new conversation; fork inherits the parent turns.',
  fresh: 'Fresh',
  fork: 'Fork',
  tags: 'Tags',
  tagsHint: 'Comma-separated discovery keywords. Each tag has no whitespace.',
  modelProvider: 'Model provider',
  model: 'Model',
  reasoningEffort: 'Reasoning effort',
  maxTokens: 'Max output tokens',
  modelRoute: 'Model route',
  modelRouteHint: 'Choose a provider and one of its advertised models.',
  modelInherit: 'Use deployment default',
  modelSelectPlaceholder: 'Not selected',
  modelUnavailable: 'not advertised',
  effortSelectPlaceholder: 'Choose a model first',
  effortInherit: 'Use the model default',
  effortNone: 'This model advertises no reasoning levels.',
  effortHint: 'The levels the selected model advertises in the Host directory.',
  modelCatalogLoading: 'Loading the Host model directory…',
  modelCatalogFailed: 'The Host model directory could not be loaded.',
  modelCatalogRetry: 'Retry',
  modelCatalogPartial: 'Some provider directories could not be loaded. Stored routes remain usable.',
  modelCatalogEmpty: 'The Host currently advertises no models. Stored routes remain usable.',
  agentPreset: 'Agent preset',
  agentPresetHint: 'Optional preset composed into a fresh child.',
  backingProvider: 'Backing provider',
  backingProviderHint: 'Optional subagent provider for this role.',
  delegationDepth: 'Delegation depth',
  delegationDepthHint: 'Maximum absolute delegation depth for this role, or blank for the tool default.',
  capacityGroup: 'Capacity group',
  capacityGroupHint: 'Optional subagent capacity group this role joins.',
  wallClockMs: 'Wall-clock budget (ms)',
  wallClockHint: 'Optional activation budget in milliseconds.',
  outputSchema: 'Output schema (JSON)',
  outputSchemaHint: 'Optional object JSON Schema for the child’s final structured result.',
  optional: 'Optional',
  advanced: 'Advanced',
  advancedHint: 'Leave blank to inherit the deployment value.',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  nameRequired: 'Enter a role name.',
  nameInvalid: 'Use one word without whitespace, quotes, backticks, or backslashes.',
  nameDuplicate: 'Another role already uses this name.',
  nameReserved: 'This name is reserved by the runtime.',
  nameTooLong: 'Keep the role name within 256 characters.',
  labelRequired: 'Enter a label.',
  labelTooLong: 'Keep the label within 256 characters.',
  descriptionTooLong: 'Keep the description within 4096 characters.',
  tagsInvalid: 'Use at most 16 comma-separated tags of up to 64 characters, without whitespace.',
  modelRouteRequired: 'Enter both a provider and a model, or leave the model route blank.',
  identifierInvalid: 'Use one word without whitespace, quotes, backticks, or backslashes.',
  effortUnsupported: 'The selected model does not advertise this reasoning effort.',
  positiveInteger: 'Enter a positive whole number.',
  nonNegativeInteger: 'Enter a non-negative whole number.',
  presetForkConflict: 'A fork role cannot use an agent preset because it inherits the parent composition.',
  schemaInvalid: 'This is not valid JSON.',
  schemaRoot: 'The output schema must be a JSON object with type "object".',
}

/** Simplified Chinese copy. */
export const zh: Record<AgentRoleConfigLocaleKey, string> = {
  summary: '编辑 role_agent 工具可以委派到的具名角色。',
  title: '智能体角色',
  description: '添加、删除并编辑 role_agent 工具向模型提供的角色。',
  defaultBacking: '默认 backing provider',
  defaultBackingHint: '角色没有指定 backing provider 时使用。留空表示使用部署默认值。',
  backingReset: '使用继承值',
  overridden: '已覆盖',
  rolesTitle: '角色',
  rolesHint: '每个角色都以名称被 role_agent 工具引用。所有改动会一起保存。',
  emptyRoles: '当前没有声明角色。添加一个角色后，模型才能按角色委派。',
  addRole: '添加角色',
  removeRole: '删除角色 {name}',
  unnamedRole: '未命名角色',
  roleHeading: '角色 {name}',
  roleName: '角色名称',
  roleNameHint: '面向模型的键。不能包含空白、引号、反引号或反斜杠。',
  label: '显示名称',
  labelHint: '目录和选择器展示给人看的名称。',
  roleDescription: '描述',
  roleDescriptionHint: '用一句话说明这个角色的用途。',
  context: '上下文',
  contextHint: 'fresh 新建对话；fork 继承父级轮次。',
  fresh: 'Fresh',
  fork: 'Fork',
  tags: '标签',
  tagsHint: '逗号分隔的发现关键词。每个标签不能含空白。',
  modelProvider: '模型 Provider',
  model: '模型',
  reasoningEffort: '推理力度',
  maxTokens: '最大输出 token 数',
  modelRoute: '模型路由',
  modelRouteHint: '选择 Provider 及其当前提供的模型。',
  modelInherit: '使用部署默认值',
  modelSelectPlaceholder: '尚未选择',
  modelUnavailable: '当前目录未提供',
  effortSelectPlaceholder: '请先选择模型',
  effortInherit: '使用模型默认值',
  effortNone: '该模型没有提供推理力度。',
  effortHint: '这里只列出所选模型在 Host 目录中提供的力度。',
  modelCatalogLoading: '正在读取 Host 模型目录…',
  modelCatalogFailed: '无法读取 Host 模型目录。',
  modelCatalogRetry: '重试',
  modelCatalogPartial: '部分 Provider 的模型目录读取失败；已保存的路由仍会保留。',
  modelCatalogEmpty: 'Host 当前没有提供任何模型；已保存的路由仍会保留。',
  agentPreset: 'Agent Preset',
  agentPresetHint: '可选，只会组合进 fresh 子智能体。',
  backingProvider: 'Backing provider',
  backingProviderHint: '可选，指定该角色使用的子智能体 Provider。',
  delegationDepth: '委派深度',
  delegationDepthHint: '该角色的最大绝对委派深度；留空表示使用工具默认值。',
  capacityGroup: '容量组',
  capacityGroupHint: '可选，该角色加入的子智能体容量组。',
  wallClockMs: '执行预算（毫秒）',
  wallClockHint: '可选，每次激活的墙钟预算。',
  outputSchema: '输出 Schema（JSON）',
  outputSchemaHint: '可选，子智能体最终结构化结果使用的对象 JSON Schema。',
  optional: '可选',
  advanced: '高级',
  advancedHint: '留空表示继承部署值。',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  nameRequired: '请填写角色名称。',
  nameInvalid: '请使用一个不含空白、引号、反引号或反斜杠的词。',
  nameDuplicate: '另一个角色已经使用了这个名称。',
  nameReserved: '运行时保留了该名称。',
  nameTooLong: '角色名称不能超过 256 个字符。',
  labelRequired: '请填写显示名称。',
  labelTooLong: '显示名称不能超过 256 个字符。',
  descriptionTooLong: '描述不能超过 4096 个字符。',
  tagsInvalid: '最多 16 个用逗号分隔的标签，每个不超过 64 个字符，且不能含空白。',
  modelRouteRequired: '请同时填写 Provider 和模型，或者完全留空。',
  identifierInvalid: '请使用一个不含空白、引号、反引号或反斜杠的词。',
  effortUnsupported: '所选模型不提供该推理力度。',
  positiveInteger: '请填写正整数。',
  nonNegativeInteger: '请填写非负整数。',
  presetForkConflict: 'fork 角色会继承父级组合，因此不能同时使用 Agent Preset。',
  schemaInvalid: '这不是有效的 JSON。',
  schemaRoot: '输出 Schema 必须是 type 为 "object" 的 JSON 对象。',
}

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: AgentRoleConfigLocaleKey) => string): SettingsFormLabels {
  return {
    unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'),
    save: t('save'), saving: t('saving'),
  }
}
