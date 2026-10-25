window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-agent-role-config",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region lib/types/client/locales.js
		/** Locale bundles for the Agent Roles configuration page. */
		/** English copy. */
		const en = {
			summary: "Edit the named roles the role_agent tool can delegate to.",
			title: "Agent roles",
			description: "Add, remove, and edit the roles the role_agent tool offers to the model.",
			defaultBacking: "Default backing provider",
			defaultBackingHint: "Used when a role names no backing provider. Leave blank to use the deployment default.",
			backingReset: "Use inherited value",
			overridden: "Overridden",
			rolesTitle: "Roles",
			rolesHint: "Each role is addressable by its name in the role_agent tool. Changes are saved together.",
			emptyRoles: "No roles are declared. Add one to let the model delegate by role.",
			addRole: "Add role",
			removeRole: "Remove role {name}",
			unnamedRole: "Unnamed role",
			roleHeading: "Role {name}",
			roleName: "Role name",
			roleNameHint: "Model-facing key. It cannot contain whitespace, quotes, backticks, or backslashes.",
			label: "Label",
			labelHint: "Human-facing name shown by catalogs and selectors.",
			roleDescription: "Description",
			roleDescriptionHint: "One-line explanation of what this role is for.",
			context: "Context",
			contextHint: "Fresh starts a new conversation; fork inherits the parent turns.",
			fresh: "Fresh",
			fork: "Fork",
			tags: "Tags",
			tagsHint: "Comma-separated discovery keywords. Each tag has no whitespace.",
			modelProvider: "Model provider",
			model: "Model",
			reasoningEffort: "Reasoning effort",
			maxTokens: "Max output tokens",
			modelRoute: "Model route",
			modelRouteHint: "Choose a provider and one of its advertised models.",
			modelInherit: "Use deployment default",
			modelSelectPlaceholder: "Not selected",
			modelUnavailable: "not advertised",
			effortSelectPlaceholder: "Choose a model first",
			effortInherit: "Use the model default",
			effortNone: "This model advertises no reasoning levels.",
			effortHint: "The levels the selected model advertises in the Host directory.",
			modelCatalogLoading: "Loading the Host model directory…",
			modelCatalogFailed: "The Host model directory could not be loaded.",
			modelCatalogRetry: "Retry",
			modelCatalogPartial: "Some provider directories could not be loaded. Stored routes remain usable.",
			modelCatalogEmpty: "The Host currently advertises no models. Stored routes remain usable.",
			agentPreset: "Agent preset",
			agentPresetHint: "Optional preset composed into a fresh child.",
			backingProvider: "Backing provider",
			backingProviderHint: "Optional subagent provider for this role.",
			delegationDepth: "Delegation depth",
			delegationDepthHint: "Maximum absolute delegation depth for this role, or blank for the tool default.",
			capacityGroup: "Capacity group",
			capacityGroupHint: "Optional subagent capacity group this role joins.",
			wallClockMs: "Wall-clock budget (ms)",
			wallClockHint: "Optional activation budget in milliseconds.",
			outputSchema: "Output schema (JSON)",
			outputSchemaHint: "Optional object JSON Schema for the child’s final structured result.",
			optional: "Optional",
			advanced: "Advanced",
			advancedHint: "Leave blank to inherit the deployment value.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			nameRequired: "Enter a role name.",
			nameInvalid: "Use one word without whitespace, quotes, backticks, or backslashes.",
			nameDuplicate: "Another role already uses this name.",
			nameReserved: "This name is reserved by the runtime.",
			nameTooLong: "Keep the role name within 256 characters.",
			labelRequired: "Enter a label.",
			labelTooLong: "Keep the label within 256 characters.",
			descriptionTooLong: "Keep the description within 4096 characters.",
			tagsInvalid: "Use at most 16 comma-separated tags of up to 64 characters, without whitespace.",
			modelRouteRequired: "Enter both a provider and a model, or leave the model route blank.",
			identifierInvalid: "Use one word without whitespace, quotes, backticks, or backslashes.",
			effortUnsupported: "The selected model does not advertise this reasoning effort.",
			positiveInteger: "Enter a positive whole number.",
			nonNegativeInteger: "Enter a non-negative whole number.",
			presetForkConflict: "A fork role cannot use an agent preset because it inherits the parent composition.",
			schemaInvalid: "This is not valid JSON.",
			schemaRoot: "The output schema must be a JSON object with type \"object\"."
		};
		/** Simplified Chinese copy. */
		const zh = {
			summary: "编辑 role_agent 工具可以委派到的具名角色。",
			title: "智能体角色",
			description: "添加、删除并编辑 role_agent 工具向模型提供的角色。",
			defaultBacking: "默认 backing provider",
			defaultBackingHint: "角色没有指定 backing provider 时使用。留空表示使用部署默认值。",
			backingReset: "使用继承值",
			overridden: "已覆盖",
			rolesTitle: "角色",
			rolesHint: "每个角色都以名称被 role_agent 工具引用。所有改动会一起保存。",
			emptyRoles: "当前没有声明角色。添加一个角色后，模型才能按角色委派。",
			addRole: "添加角色",
			removeRole: "删除角色 {name}",
			unnamedRole: "未命名角色",
			roleHeading: "角色 {name}",
			roleName: "角色名称",
			roleNameHint: "面向模型的键。不能包含空白、引号、反引号或反斜杠。",
			label: "显示名称",
			labelHint: "目录和选择器展示给人看的名称。",
			roleDescription: "描述",
			roleDescriptionHint: "用一句话说明这个角色的用途。",
			context: "上下文",
			contextHint: "fresh 新建对话；fork 继承父级轮次。",
			fresh: "Fresh",
			fork: "Fork",
			tags: "标签",
			tagsHint: "逗号分隔的发现关键词。每个标签不能含空白。",
			modelProvider: "模型 Provider",
			model: "模型",
			reasoningEffort: "推理力度",
			maxTokens: "最大输出 token 数",
			modelRoute: "模型路由",
			modelRouteHint: "选择 Provider 及其当前提供的模型。",
			modelInherit: "使用部署默认值",
			modelSelectPlaceholder: "尚未选择",
			modelUnavailable: "当前目录未提供",
			effortSelectPlaceholder: "请先选择模型",
			effortInherit: "使用模型默认值",
			effortNone: "该模型没有提供推理力度。",
			effortHint: "这里只列出所选模型在 Host 目录中提供的力度。",
			modelCatalogLoading: "正在读取 Host 模型目录…",
			modelCatalogFailed: "无法读取 Host 模型目录。",
			modelCatalogRetry: "重试",
			modelCatalogPartial: "部分 Provider 的模型目录读取失败；已保存的路由仍会保留。",
			modelCatalogEmpty: "Host 当前没有提供任何模型；已保存的路由仍会保留。",
			agentPreset: "Agent Preset",
			agentPresetHint: "可选，只会组合进 fresh 子智能体。",
			backingProvider: "Backing provider",
			backingProviderHint: "可选，指定该角色使用的子智能体 Provider。",
			delegationDepth: "委派深度",
			delegationDepthHint: "该角色的最大绝对委派深度；留空表示使用工具默认值。",
			capacityGroup: "容量组",
			capacityGroupHint: "可选，该角色加入的子智能体容量组。",
			wallClockMs: "执行预算（毫秒）",
			wallClockHint: "可选，每次激活的墙钟预算。",
			outputSchema: "输出 Schema（JSON）",
			outputSchemaHint: "可选，子智能体最终结构化结果使用的对象 JSON Schema。",
			optional: "可选",
			advanced: "高级",
			advancedHint: "留空表示继承部署值。",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			nameRequired: "请填写角色名称。",
			nameInvalid: "请使用一个不含空白、引号、反引号或反斜杠的词。",
			nameDuplicate: "另一个角色已经使用了这个名称。",
			nameReserved: "运行时保留了该名称。",
			nameTooLong: "角色名称不能超过 256 个字符。",
			labelRequired: "请填写显示名称。",
			labelTooLong: "显示名称不能超过 256 个字符。",
			descriptionTooLong: "描述不能超过 4096 个字符。",
			tagsInvalid: "最多 16 个用逗号分隔的标签，每个不超过 64 个字符，且不能含空白。",
			modelRouteRequired: "请同时填写 Provider 和模型，或者完全留空。",
			identifierInvalid: "请使用一个不含空白、引号、反引号或反斜杠的词。",
			effortUnsupported: "所选模型不提供该推理力度。",
			positiveInteger: "请填写正整数。",
			nonNegativeInteger: "请填写非负整数。",
			presetForkConflict: "fork 角色会继承父级组合，因此不能同时使用 Agent Preset。",
			schemaInvalid: "这不是有效的 JSON。",
			schemaRoot: "输出 Schema 必须是 type 为 \"object\" 的 JSON 对象。"
		};
		/**
		* The form frame's copy, read from this page's dictionary.
		* @param t - the page's locale reader.
		* @returns the labels the shared settings form renders.
		*/
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}
		//#endregion
		//#region \0dsh-css:/Users/jim/dev/jimsub/deepseek-harness/packages/experimental/client-ui-agent-role-config/src/client/AgentRoleConfigCard.module.css.mjs
		const css = ".TsPHhG_description{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.5}.TsPHhG_defaultBacking{border-bottom:.5px solid var(--dsw-alias-border-l2)}.TsPHhG_catalogNotice,.TsPHhG_catalogFailure{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);margin:0;padding:8px 12px;font-size:12px;line-height:1.5}.TsPHhG_catalogFailure{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);flex-wrap:wrap;align-items:center;gap:8px;display:flex}.TsPHhG_catalogDetail{overflow-wrap:anywhere;flex:100%;min-width:0}.TsPHhG_rolesSection{gap:12px;min-width:0;padding:16px 0;display:grid}.TsPHhG_rolesHead{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.TsPHhG_heading{color:var(--dsw-alias-label-primary);margin:0;font-size:13px;font-weight:500;line-height:1.5}.TsPHhG_hint,.TsPHhG_empty{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.5}.TsPHhG_empty{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);padding:16px}.TsPHhG_roles{gap:12px;min-width:0;margin:0;padding:0;list-style:none;display:grid}.TsPHhG_role{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);min-width:0;padding:12px 16px 16px}.TsPHhG_roleHead{align-items:center;gap:8px;min-width:0;display:flex}.TsPHhG_roleTitle{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;margin:0;font-size:13px;font-weight:500;line-height:1.5;overflow:hidden}.TsPHhG_remove{flex:none}.TsPHhG_error{color:var(--dsw-alias-state-error-primary);margin:8px 0 0;font-size:13px;line-height:1.5}.TsPHhG_grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;min-width:0;display:grid}.TsPHhG_context{flex-direction:column;gap:6px;min-width:0;padding:12px 0;display:flex}.TsPHhG_fieldLabel{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}.TsPHhG_selectField{flex-direction:column;gap:6px;min-width:0;padding:12px 0;display:flex}.TsPHhG_select{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);width:100%;min-width:0;height:34px;font:inherit;color:var(--dsw-alias-label-primary);padding:0 12px;font-size:13px;line-height:1.5}.TsPHhG_select:focus-visible{border-color:var(--dsw-alias-state-business-primary);outline:none}.TsPHhG_select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.TsPHhG_select[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)}.TsPHhG_advanced{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:8px}.TsPHhG_summary{color:var(--dsw-alias-label-secondary);cursor:pointer;padding:10px 0;font-size:13px;line-height:1.5}.TsPHhG_schema{flex-direction:column;gap:6px;min-width:0;padding:12px 0;display:flex}.TsPHhG_schemaInput{border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);min-height:120px;font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-primary);resize:vertical;padding:8px 12px;font-size:13px;line-height:1.5}.TsPHhG_schemaInput:focus-visible{border-color:var(--dsw-alias-state-business-primary);outline:none}.TsPHhG_schemaInput:disabled{color:var(--dsw-alias-label-tertiary)}.TsPHhG_schemaInput[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)}@media (width<=640px){.TsPHhG_rolesHead{align-items:center}.TsPHhG_grid{grid-template-columns:minmax(0,1fr)}}";
		const tagId = "@deepseek-ai/dsh-experimental-client-ui-agent-role-config/AgentRoleConfigCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-experimental-client-ui-agent-role-config";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var AgentRoleConfigCard_module_css_default = {
			"advanced": "TsPHhG_advanced",
			"catalogDetail": "TsPHhG_catalogDetail",
			"catalogFailure": "TsPHhG_catalogFailure",
			"catalogNotice": "TsPHhG_catalogNotice",
			"context": "TsPHhG_context",
			"defaultBacking": "TsPHhG_defaultBacking",
			"description": "TsPHhG_description",
			"empty": "TsPHhG_empty",
			"error": "TsPHhG_error",
			"fieldLabel": "TsPHhG_fieldLabel",
			"grid": "TsPHhG_grid",
			"heading": "TsPHhG_heading",
			"hint": "TsPHhG_hint",
			"remove": "TsPHhG_remove",
			"role": "TsPHhG_role",
			"roleHead": "TsPHhG_roleHead",
			"roleTitle": "TsPHhG_roleTitle",
			"roles": "TsPHhG_roles",
			"rolesHead": "TsPHhG_rolesHead",
			"rolesSection": "TsPHhG_rolesSection",
			"schema": "TsPHhG_schema",
			"schemaInput": "TsPHhG_schemaInput",
			"select": "TsPHhG_select",
			"selectField": "TsPHhG_selectField",
			"summary": "TsPHhG_summary"
		};
		//#endregion
		//#region lib/types/client/AgentRoleConfigCard.js
		/** The Agent Roles bundle page: the complete role catalog over the `agent-roles` settings section. */
		/**
		* Render the bundle's summary, or its staged role editor.
		* @param props - requested view, locale copy, the role snapshot, and its actions.
		* @returns the one-liner, or the editable catalog.
		*/
		function AgentRoleConfigCard(props) {
			const { t } = props;
			const state = props.useAgentRoleConfig((snapshot) => snapshot);
			if (props.view === "summary") return t("summary");
			return (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					(0, react_jsx_runtime.jsx)("p", {
						className: AgentRoleConfigCard_module_css_default.description,
						children: t("description")
					}),
					(0, react_jsx_runtime.jsx)(ModelCatalogNotice, {
						state,
						t,
						retry: props.retryCatalog
					}),
					(0, react_jsx_runtime.jsx)(DefaultBackingField, {
						state,
						t,
						edit: props.editDefaultBacking,
						reset: props.resetDefaultBacking
					}),
					(0, react_jsx_runtime.jsxs)("section", {
						className: AgentRoleConfigCard_module_css_default.rolesSection,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: AgentRoleConfigCard_module_css_default.rolesHead,
							children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h3", {
								className: AgentRoleConfigCard_module_css_default.heading,
								children: t("rolesTitle")
							}), (0, react_jsx_runtime.jsx)("p", {
								className: AgentRoleConfigCard_module_css_default.hint,
								children: t("rolesHint")
							})] }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								size: "sm",
								icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutlineRegular, { size: 13 }),
								disabled: !state.writable || state.saving,
								onClick: props.addRole,
								children: t("addRole")
							})]
						}), state.roles.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
							className: AgentRoleConfigCard_module_css_default.empty,
							role: "status",
							children: t("emptyRoles")
						}) : (0, react_jsx_runtime.jsx)("ol", {
							className: AgentRoleConfigCard_module_css_default.roles,
							children: state.roles.map((role, index) => (0, react_jsx_runtime.jsx)(RoleCard, {
								role,
								index,
								state,
								t,
								editRole: props.editRole,
								setContext: props.setContext,
								setProvider: props.setProvider,
								removeRole: props.removeRole
							}, role.draftId))
						})]
					})
				]
			});
		}
		/** The shared Host model-directory state shown once above the role rows. */
		function ModelCatalogNotice({ state, t, retry }) {
			if (state.catalogStatus === "loading") return (0, react_jsx_runtime.jsx)("p", {
				className: AgentRoleConfigCard_module_css_default.catalogNotice,
				role: "status",
				children: t("modelCatalogLoading")
			});
			if (state.catalogStatus === "error") return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentRoleConfigCard_module_css_default.catalogFailure,
				role: "alert",
				children: [
					(0, react_jsx_runtime.jsx)("span", { children: t("modelCatalogFailed") }),
					state.catalogError === null ? null : (0, react_jsx_runtime.jsx)("span", {
						className: AgentRoleConfigCard_module_css_default.catalogDetail,
						children: state.catalogError
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						size: "sm",
						disabled: !state.writable || state.saving,
						onClick: retry,
						children: t("modelCatalogRetry")
					})
				]
			});
			if (state.catalogPartial) return (0, react_jsx_runtime.jsx)("p", {
				className: AgentRoleConfigCard_module_css_default.catalogNotice,
				role: "status",
				children: t("modelCatalogPartial")
			});
			if (state.catalogStatus === "ready" && state.catalogGroups.length === 0) return (0, react_jsx_runtime.jsx)("p", {
				className: AgentRoleConfigCard_module_css_default.catalogNotice,
				role: "status",
				children: t("modelCatalogEmpty")
			});
			return null;
		}
		/** The fallback provider roles inherit, with the shared override and reset affordances. */
		function DefaultBackingField({ state, t, edit, reset }) {
			const id = (0, react.useId)();
			return (0, react_jsx_runtime.jsx)("div", {
				className: AgentRoleConfigCard_module_css_default.defaultBacking,
				children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
					id: `${id}-default-backing`,
					label: t("defaultBacking"),
					hint: t("defaultBackingHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("backingReset"),
					invalidLabel: t("identifierInvalid"),
					text: state.defaultBacking,
					overridden: state.defaultBackingOverridden,
					invalid: state.defaultBackingInvalid,
					disabled: !state.writable || state.saving,
					onEdit: edit,
					onReset: reset
				})
			});
		}
		/** One role's identity, context mode, and optional delegation fields. */
		function RoleCard({ role, index, state, t, editRole, setContext, setProvider, removeRole }) {
			const id = (0, react.useId)();
			const disabled = !state.writable || state.saving;
			const title = role.name.trim() === "" ? t("unnamedRole") : role.name.trim();
			const field = (key) => ({
				id: `${id}-${key}`,
				text: role[key],
				disabled,
				overridden: false,
				onEdit: (text) => {
					editRole(role.draftId, key, text);
				},
				/* v8 ignore next -- role fields never render the reset affordance because the whole row shares one staged table. */
				onReset: () => {
					editRole(role.draftId, key, "");
				}
			});
			const invalid = (field, code) => role.errorField === field && (code === void 0 || role.errorCode === code);
			return (0, react_jsx_runtime.jsxs)("li", {
				className: AgentRoleConfigCard_module_css_default.role,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentRoleConfigCard_module_css_default.roleHead,
						children: [
							(0, react_jsx_runtime.jsx)("h4", {
								className: AgentRoleConfigCard_module_css_default.roleTitle,
								id: `${id}-heading`,
								children: t("roleHeading", { name: title })
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
								tone: "quiet",
								children: String(index + 1)
							}),
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								size: "sm",
								className: AgentRoleConfigCard_module_css_default.remove,
								"aria-label": t("removeRole", { name: title }),
								title: t("removeRole", { name: title }),
								icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, { size: 14 }),
								disabled,
								onClick: () => {
									removeRole(role.draftId);
								}
							})
						]
					}),
					role.error === void 0 ? null : (0, react_jsx_runtime.jsx)("p", {
						className: AgentRoleConfigCard_module_css_default.error,
						role: "alert",
						id: `${id}-error`,
						children: role.error
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentRoleConfigCard_module_css_default.grid,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
							label: t("roleName"),
							hint: t("roleNameHint"),
							...field("name"),
							overriddenLabel: t("overridden"),
							resetLabel: t("backingReset"),
							invalidLabel: t(role.errorField === "name" && role.errorCode !== void 0 ? role.errorCode : "nameInvalid"),
							invalid: invalid("name")
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
							label: t("label"),
							hint: t("labelHint"),
							...field("label"),
							overriddenLabel: t("overridden"),
							resetLabel: t("backingReset"),
							invalidLabel: t(role.errorField === "label" && role.errorCode !== void 0 ? role.errorCode : "labelRequired"),
							invalid: invalid("label")
						})]
					}),
					(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
						label: t("roleDescription"),
						hint: t("roleDescriptionHint"),
						...field("description"),
						overriddenLabel: t("overridden"),
						resetLabel: t("backingReset"),
						invalidLabel: t(role.errorField === "description" && role.errorCode !== void 0 ? role.errorCode : "descriptionTooLong"),
						invalid: invalid("description")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: AgentRoleConfigCard_module_css_default.grid,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: AgentRoleConfigCard_module_css_default.context,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: AgentRoleConfigCard_module_css_default.fieldLabel,
									children: t("context")
								}),
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
									id: `${id}-context`,
									label: t("context"),
									value: role.context,
									disabled,
									onChange: (context) => {
										setContext(role.draftId, context);
									},
									options: [{
										value: "fresh",
										label: t("fresh")
									}, {
										value: "fork",
										label: t("fork")
									}]
								}),
								(0, react_jsx_runtime.jsx)("p", {
									className: AgentRoleConfigCard_module_css_default.hint,
									children: t("contextHint")
								})
							]
						}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
							label: t("tags"),
							hint: t("tagsHint"),
							...field("tags"),
							overriddenLabel: t("overridden"),
							resetLabel: t("backingReset"),
							invalidLabel: t("tagsInvalid"),
							invalid: invalid("tags", "tagsInvalid")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("details", {
						className: AgentRoleConfigCard_module_css_default.advanced,
						children: [
							(0, react_jsx_runtime.jsx)("summary", {
								className: AgentRoleConfigCard_module_css_default.summary,
								children: t("advanced")
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: AgentRoleConfigCard_module_css_default.hint,
								children: t("advancedHint")
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: AgentRoleConfigCard_module_css_default.grid,
								children: [
									(0, react_jsx_runtime.jsx)(ModelRouteFields, {
										role,
										state,
										t,
										disabled,
										editRole,
										setProvider
									}),
									(0, react_jsx_runtime.jsx)(EffortField, {
										role,
										state,
										t,
										disabled,
										editRole,
										invalid: role.errorField === "reasoningEffort"
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
										label: t("maxTokens"),
										hint: t("advancedHint"),
										...field("maxTokens"),
										overriddenLabel: t("overridden"),
										resetLabel: t("backingReset"),
										invalidLabel: t("positiveInteger"),
										numeric: true,
										invalid: invalid("maxTokens", "positiveInteger")
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
										label: t("agentPreset"),
										hint: t("agentPresetHint"),
										...field("agentPreset"),
										overriddenLabel: t("overridden"),
										resetLabel: t("backingReset"),
										invalidLabel: t(role.errorField === "agentPreset" && role.errorCode !== void 0 ? role.errorCode : "presetForkConflict"),
										invalid: role.errorField === "agentPreset"
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
										label: t("backingProvider"),
										hint: t("backingProviderHint"),
										...field("backingProvider"),
										overriddenLabel: t("overridden"),
										resetLabel: t("backingReset"),
										invalidLabel: t(role.errorField === "backingProvider" && role.errorCode !== void 0 ? role.errorCode : "identifierInvalid"),
										invalid: invalid("backingProvider", "identifierInvalid")
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
										label: t("delegationDepth"),
										hint: t("delegationDepthHint"),
										...field("delegationDepth"),
										overriddenLabel: t("overridden"),
										resetLabel: t("backingReset"),
										invalidLabel: t("nonNegativeInteger"),
										numeric: true,
										invalid: invalid("delegationDepth", "nonNegativeInteger")
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
										label: t("capacityGroup"),
										hint: t("capacityGroupHint"),
										...field("capacityGroup"),
										overriddenLabel: t("overridden"),
										resetLabel: t("backingReset"),
										invalidLabel: t(role.errorField === "capacityGroup" && role.errorCode !== void 0 ? role.errorCode : "identifierInvalid"),
										invalid: invalid("capacityGroup", "identifierInvalid")
									}),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SettingsValueField, {
										label: t("wallClockMs"),
										hint: t("wallClockHint"),
										...field("wallClockMs"),
										overriddenLabel: t("overridden"),
										resetLabel: t("backingReset"),
										invalidLabel: t("positiveInteger"),
										numeric: true,
										invalid: invalid("wallClockMs", "positiveInteger")
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: AgentRoleConfigCard_module_css_default.schema,
								children: [
									(0, react_jsx_runtime.jsx)("label", {
										className: AgentRoleConfigCard_module_css_default.fieldLabel,
										htmlFor: `${id}-schema`,
										children: t("outputSchema")
									}),
									(0, react_jsx_runtime.jsx)("p", {
										className: AgentRoleConfigCard_module_css_default.hint,
										children: t("outputSchemaHint")
									}),
									(0, react_jsx_runtime.jsx)("textarea", {
										id: `${id}-schema`,
										className: AgentRoleConfigCard_module_css_default.schemaInput,
										value: role.outputSchema,
										disabled,
										"aria-invalid": role.errorField === "outputSchema" || void 0,
										onChange: (event) => {
											editRole(role.draftId, "outputSchema", event.target.value);
										}
									})
								]
							})
						]
					})
				]
			});
		}
		/** Provider and model pickers backed by the Host model directory. */
		function ModelRouteFields({ role, state, t, disabled, editRole, setProvider }) {
			const id = (0, react.useId)();
			const invalid = role.errorField === "modelRoute" || role.errorField === "provider" && role.errorCode === "identifierInvalid" || role.errorField === "model" && role.errorCode === "identifierInvalid";
			const provider = state.catalogGroups.find((group) => group.id === role.provider);
			const providers = state.catalogGroups.some((group) => group.id === role.provider) ? state.catalogGroups : role.provider === "" ? state.catalogGroups : [...state.catalogGroups, {
				id: role.provider,
				name: `${role.provider} (${t("modelUnavailable")})`,
				models: []
			}];
			const models = provider?.models ?? [];
			const modelUnavailable = role.model !== "" && !models.some((model) => model.id === role.model);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("div", {
				className: AgentRoleConfigCard_module_css_default.selectField,
				children: [
					(0, react_jsx_runtime.jsx)("label", {
						className: AgentRoleConfigCard_module_css_default.fieldLabel,
						htmlFor: `${id}-provider`,
						children: t("modelProvider")
					}),
					(0, react_jsx_runtime.jsxs)("select", {
						id: `${id}-provider`,
						className: AgentRoleConfigCard_module_css_default.select,
						value: role.provider,
						disabled,
						"aria-invalid": invalid || void 0,
						onChange: (event) => {
							setProvider(role.draftId, event.target.value);
						},
						children: [(0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: t("modelInherit")
						}), providers.map((group) => (0, react_jsx_runtime.jsx)("option", {
							value: group.id,
							children: group.name
						}, group.id))]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: AgentRoleConfigCard_module_css_default.hint,
						children: invalid ? t(role.errorCode ?? "modelRouteRequired") : t("modelRoute")
					})
				]
			}), (0, react_jsx_runtime.jsxs)("div", {
				className: AgentRoleConfigCard_module_css_default.selectField,
				children: [
					(0, react_jsx_runtime.jsx)("label", {
						className: AgentRoleConfigCard_module_css_default.fieldLabel,
						htmlFor: `${id}-model`,
						children: t("model")
					}),
					(0, react_jsx_runtime.jsxs)("select", {
						id: `${id}-model`,
						className: AgentRoleConfigCard_module_css_default.select,
						value: role.model,
						disabled: disabled || role.provider === "",
						"aria-invalid": invalid || void 0,
						onChange: (event) => {
							editRole(role.draftId, "model", event.target.value);
						},
						children: [
							(0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: t("modelSelectPlaceholder")
							}),
							models.map((model) => (0, react_jsx_runtime.jsx)("option", {
								value: model.id,
								children: model.name
							}, model.id)),
							modelUnavailable ? (0, react_jsx_runtime.jsx)("option", {
								value: role.model,
								children: `${role.model} (${t("modelUnavailable")})`
							}) : null
						]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: AgentRoleConfigCard_module_css_default.hint,
						children: t("modelRouteHint")
					})
				]
			})] });
		}
		/**
		* Reasoning-effort picker offering only the levels the selected model
		* advertises. A stored level the directory no longer lists stays selectable
		* so an offline provider does not silently erase the role's route.
		*/
		function EffortField({ role, state, t, disabled, editRole, invalid }) {
			const id = (0, react.useId)();
			const model = state.catalogGroups.find((group) => group.id === role.provider)?.models.find((candidate) => candidate.id === role.model);
			const efforts = model?.reasoning?.efforts ?? [];
			const supported = efforts.map((effort) => effort.id);
			const unknown = role.reasoningEffort !== "" && !supported.includes(role.reasoningEffort);
			const selectable = role.model !== "" && (model === void 0 || efforts.length > 0 || unknown);
			const hint = role.model === "" ? t("effortSelectPlaceholder") : model !== void 0 && efforts.length === 0 && !unknown ? t("effortNone") : t("effortHint");
			return (0, react_jsx_runtime.jsxs)("div", {
				className: AgentRoleConfigCard_module_css_default.selectField,
				children: [
					(0, react_jsx_runtime.jsx)("label", {
						className: AgentRoleConfigCard_module_css_default.fieldLabel,
						htmlFor: `${id}-effort`,
						children: t("reasoningEffort")
					}),
					(0, react_jsx_runtime.jsxs)("select", {
						id: `${id}-effort`,
						className: AgentRoleConfigCard_module_css_default.select,
						value: role.reasoningEffort,
						disabled: disabled || !selectable,
						"aria-invalid": invalid || void 0,
						onChange: (event) => {
							editRole(role.draftId, "reasoningEffort", event.target.value);
						},
						children: [
							(0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: t("effortInherit")
							}),
							efforts.map((effort) => (0, react_jsx_runtime.jsx)("option", {
								value: effort.id,
								children: effort.name
							}, effort.id)),
							unknown ? (0, react_jsx_runtime.jsx)("option", {
								value: role.reasoningEffort,
								children: `${role.reasoningEffort} (${t("modelUnavailable")})`
							}) : null
						]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: AgentRoleConfigCard_module_css_default.hint,
						children: invalid ? t(role.errorCode ?? "effortUnsupported") : hint
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/roles-model.js
		/**
		* Staged editor state for the Agent Roles catalog. The Host keeps the role
		* table as one volatile dictionary, so this page edits the complete table and
		* writes it back as one revision-fenced mutation rather than exposing one
		* settings field per role.
		*/
		/** Settings namespace registered by the `agent-roles` Loader row. */
		const AGENT_ROLES_NS = "agent-roles";
		/** Settings namespace registered by the `agent-roles` Loader row in the shipped bundle patch. */
		const AGENT_ROLE_CONFIG_BUNDLE = "@deepseek-ai/dsh-experimental-agent-role-profile";
		/** Maximum code points in one role name, mirroring the catalog validator. */
		const ROLE_NAME_MAX_LENGTH = 256;
		/** Maximum code points in one role label, mirroring the catalog validator. */
		const ROLE_LABEL_MAX_LENGTH = 256;
		/** Maximum code points in one role description, mirroring the catalog validator. */
		const ROLE_DESCRIPTION_MAX_LENGTH = 4096;
		/** Maximum declared tags in one role, mirroring the catalog validator. */
		const ROLE_TAGS_MAX_COUNT = 16;
		/** Maximum code points in one tag, mirroring the catalog validator. */
		const ROLE_TAG_MAX_LENGTH = 64;
		/** Maximum code points in a provider, preset, or model identifier. */
		const IDENTIFIER_MAX_LENGTH = 256;
		/** Role names the runtime reserves for object prototype members. */
		const RESERVED_ROLE_NAMES = new Set([
			"__proto__",
			"prototype",
			"constructor"
		]);
		/** Role names and identifiers that stay usable in one model-facing catalog line. */
		const TOKEN_PATTERN = /^[^\s`"\\]+$/u;
		let nextDraftId = 0;
		/** @returns a fresh draft identity, process-local and not persisted. */
		function draftId() {
			nextDraftId += 1;
			return `role-${String(nextDraftId)}`;
		}
		/** @param value - an untrusted value. @returns whether it is a non-array object. */
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** @param value - an untrusted setting. @returns the string when one is stored, otherwise an empty draft. */
		function text(value) {
			return typeof value === "string" ? value : "";
		}
		/** @param value - an untrusted setting. @returns stored text or a stored number rendered for editing. */
		function draftText(value) {
			return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
		}
		/** @param roles - an untrusted role table. @returns its entries in insertion order. */
		function roleEntries(roles) {
			return isRecord(roles) ? Object.entries(roles) : [];
		}
		/** @param definition - one configured role. @returns editable text for one nested model field. */
		function modelText(definition, field) {
			return isRecord(definition.model) ? draftText(definition.model[field]) : "";
		}
		/** @param definition - one configured role. @returns its tags as a comma-separated draft. */
		function tagsText(definition) {
			return Array.isArray(definition.tags) ? definition.tags.filter((tag) => typeof tag === "string").join(", ") : "";
		}
		/** @param definition - one configured role. @returns its nested execution budget as a draft. */
		function budgetText(definition) {
			return isRecord(definition.executionBudget) ? draftText(definition.executionBudget.wallClockMs) : "";
		}
		/** @param definition - one configured role. @returns its structured-output schema serialized for editing. */
		function schemaText(definition) {
			return definition.outputSchema === void 0 ? "" : JSON.stringify(definition.outputSchema, void 0, 2);
		}
		/**
		* Convert one configured role into an editable draft.
		* @param name - catalog key.
		* @param definition - configured role definition.
		* @returns the draft row.
		*/
		function toDraft(name, definition) {
			const role = isRecord(definition) ? definition : {};
			return {
				draftId: draftId(),
				name,
				label: text(role.label),
				description: text(role.description),
				tags: tagsText(role),
				context: role.contextDefault === "fork" ? "fork" : "fresh",
				provider: modelText(role, "provider"),
				model: modelText(role, "model"),
				reasoningEffort: modelText(role, "reasoningEffort"),
				maxTokens: modelText(role, "maxTokens"),
				agentPreset: text(role.agentPreset),
				backingProvider: text(role.backingProvider),
				delegationDepth: draftText(role.delegationDepth),
				capacityGroup: text(role.capacityGroup),
				wallClockMs: budgetText(role),
				outputSchema: schemaText(role)
			};
		}
		/** @returns an empty draft role. */
		function emptyDraft() {
			return {
				draftId: draftId(),
				name: "",
				label: "",
				description: "",
				tags: "",
				context: "fresh",
				provider: "",
				model: "",
				reasoningEffort: "",
				maxTokens: "",
				agentPreset: "",
				backingProvider: "",
				delegationDepth: "",
				capacityGroup: "",
				wallClockMs: "",
				outputSchema: ""
			};
		}
		/** @param value - a draft string. @returns its trimmed text, or undefined when blank. */
		function optional(value) {
			const trimmed = value.trim();
			return trimmed === "" ? void 0 : trimmed;
		}
		/** @param value - a draft identifier. @returns whether it satisfies the catalog's one-line rule. */
		function validIdentifier(value) {
			return value.length <= IDENTIFIER_MAX_LENGTH && TOKEN_PATTERN.test(value);
		}
		/** @param value - a draft integer. @returns whether it is a safe integer at or above a minimum. */
		function validInteger(value, minimum) {
			const trimmed = value.trim();
			const parsed = Number(trimmed);
			return trimmed !== "" && Number.isSafeInteger(parsed) && parsed >= minimum;
		}
		/**
		* Reasoning levels one advertised model accepts.
		* @param groups - the Host model directory.
		* @param provider - a draft provider id.
		* @param model - a draft model id.
		* @returns the effort ids in escalation order, an empty list for a model that
		*   advertises no reasoning, or undefined when the directory does not
		*   describe the route, so the page cannot decide.
		*/
		function advertisedEfforts(groups, provider, model) {
			const entry = groups.find((group) => group.id === provider)?.models.find((candidate) => candidate.id === model);
			if (entry === void 0) return void 0;
			return entry.reasoning?.efforts.map((effort) => effort.id) ?? [];
		}
		/** @param value - a string. @returns its code-point count. */
		function codePoints(value) {
			let count = 0;
			for (const _point of value) count += 1;
			return count;
		}
		/**
		* Validate a catalog key before comparing it with other roles.
		* @param name - a trimmed draft name.
		* @returns the name-level blocker, or undefined when the key is well formed.
		*/
		function catalogNameError(name) {
			if (name === "") return "nameRequired";
			if (codePoints(name) > ROLE_NAME_MAX_LENGTH) return "nameTooLong";
			if (RESERVED_ROLE_NAMES.has(name)) return "nameReserved";
			if (!TOKEN_PATTERN.test(name)) return "nameInvalid";
		}
		/**
		* Find every well-formed role name used more than once.
		* @param roles - all staged roles in catalog order.
		* @returns names that collide with another staged role.
		*/
		function duplicateNames(roles) {
			const counts = /* @__PURE__ */ new Map();
			for (const role of roles) {
				const name = role.name.trim();
				if (catalogNameError(name) !== void 0) continue;
				counts.set(name, (counts.get(name) ?? 0) + 1);
			}
			return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
		}
		/**
		* Read the tag draft.
		* @param value - comma-separated tags.
		* @returns the tag list, or undefined when the draft violates the catalog rules.
		*/
		function parseTags(value) {
			const tags = value.split(",").map((tag) => tag.trim()).filter((tag) => tag !== "");
			if (tags.length > ROLE_TAGS_MAX_COUNT) return void 0;
			const seen = /* @__PURE__ */ new Set();
			for (const tag of tags) {
				if (codePoints(tag) > ROLE_TAG_MAX_LENGTH || /\s/u.test(tag) || seen.has(tag)) return void 0;
				seen.add(tag);
			}
			return tags;
		}
		/**
		* Validate one role draft and convert it into the settings payload.
		* @param draft - the staged role.
		* @param duplicates - catalog keys used by more than one staged role.
		* @param groups - the Host model directory, used to reject a reasoning effort
		*   the selected model does not advertise.
		* @returns the payload, or the first blocker that prevents saving.
		*/
		function payloadOf(draft, duplicates, groups) {
			const name = draft.name.trim();
			const nameError = catalogNameError(name);
			if (nameError !== void 0) return {
				code: nameError,
				field: "name"
			};
			if (duplicates.has(name)) return {
				code: "nameDuplicate",
				field: "name"
			};
			const label = draft.label.trim();
			if (label === "") return {
				code: "labelRequired",
				field: "label"
			};
			if (codePoints(label) > ROLE_LABEL_MAX_LENGTH) return {
				code: "labelTooLong",
				field: "label"
			};
			if (codePoints(draft.description) > ROLE_DESCRIPTION_MAX_LENGTH) return {
				code: "descriptionTooLong",
				field: "description"
			};
			const tags = parseTags(draft.tags);
			if (tags === void 0) return {
				code: "tagsInvalid",
				field: "tags"
			};
			const provider = optional(draft.provider);
			const model = optional(draft.model);
			if (provider === void 0 !== (model === void 0)) return {
				code: "modelRouteRequired",
				field: "modelRoute"
			};
			const reasoningEffort = optional(draft.reasoningEffort);
			const maxTokens = optional(draft.maxTokens);
			const agentPreset = optional(draft.agentPreset);
			const backingProvider = optional(draft.backingProvider);
			const delegationDepth = optional(draft.delegationDepth);
			const capacityGroup = optional(draft.capacityGroup);
			const wallClockMs = optional(draft.wallClockMs);
			const outputSchema = optional(draft.outputSchema);
			const invalidIdentifier = [
				["provider", provider],
				["model", model],
				["reasoningEffort", reasoningEffort],
				["agentPreset", agentPreset],
				["backingProvider", backingProvider],
				["capacityGroup", capacityGroup]
			].find(([, value]) => value !== void 0 && !validIdentifier(value));
			if (invalidIdentifier !== void 0) return {
				code: "identifierInvalid",
				field: invalidIdentifier[0]
			};
			if (maxTokens !== void 0 && !validInteger(maxTokens, 1)) return {
				code: "positiveInteger",
				field: "maxTokens"
			};
			if (delegationDepth !== void 0 && !validInteger(delegationDepth, 0)) return {
				code: "nonNegativeInteger",
				field: "delegationDepth"
			};
			if (wallClockMs !== void 0 && !validInteger(wallClockMs, 1)) return {
				code: "positiveInteger",
				field: "wallClockMs"
			};
			if (provider === void 0 && (reasoningEffort !== void 0 || maxTokens !== void 0)) return {
				code: "modelRouteRequired",
				field: "modelRoute"
			};
			if (provider !== void 0 && model !== void 0 && reasoningEffort !== void 0) {
				const efforts = advertisedEfforts(groups, provider, model);
				if (efforts !== void 0 && !efforts.includes(reasoningEffort)) return {
					code: "effortUnsupported",
					field: "reasoningEffort"
				};
			}
			if (agentPreset !== void 0 && draft.context === "fork") return {
				code: "presetForkConflict",
				field: "agentPreset"
			};
			let schema;
			if (outputSchema !== void 0) {
				try {
					schema = JSON.parse(outputSchema);
				} catch (_error) {
					return {
						code: "schemaInvalid",
						field: "outputSchema"
					};
				}
				if (!isRecord(schema) || schema.type !== "object") return {
					code: "schemaRoot",
					field: "outputSchema"
				};
			}
			const description = optional(draft.description);
			return { payload: {
				label,
				...description === void 0 ? {} : { description },
				...tags.length === 0 ? {} : { tags },
				...provider === void 0 || model === void 0 ? {} : { model: {
					provider,
					model,
					...reasoningEffort === void 0 ? {} : { reasoningEffort },
					...maxTokens === void 0 ? {} : { maxTokens: Number(maxTokens) }
				} },
				...agentPreset === void 0 ? {} : { agentPreset },
				...backingProvider === void 0 ? {} : { backingProvider },
				contextDefault: draft.context,
				...delegationDepth === void 0 ? {} : { delegationDepth: Number(delegationDepth) },
				...capacityGroup === void 0 ? {} : { capacityGroup },
				...wallClockMs === void 0 ? {} : { executionBudget: { wallClockMs: Number(wallClockMs) } },
				...schema === void 0 ? {} : { outputSchema: schema }
			} };
		}
		/**
		* Bind the complete role table to one staged editor.
		*
		* A save writes the whole `roles` dictionary and the optional deployment
		* fallback under one expected revision. Replacing the dictionary lets a role
		* be renamed without leaving its previous key behind; every draft is validated
		* before the write, and a Host refusal keeps the drafts for correction.
		*/
		var AgentRoleConfigController = class {
			scope;
			ctx;
			t;
			store;
			staged;
			initial;
			acceptedValue;
			acceptedDraft;
			saving = false;
			failed = false;
			disposed = false;
			catalogGroups = [];
			catalogStatus = "idle";
			catalogPartial = false;
			catalogError = null;
			catalogGeneration = 0;
			saveGeneration = 0;
			unsubscribe;
			/**
			* @param scope - the `agent-roles` settings section.
			* @param ctx - the browser plugin context, whose `remote.session` namespace
			* answers the Host model directory.
			* @param t - page dictionary reader for validation messages.
			*/
			constructor(scope, ctx, t) {
				this.scope = scope;
				this.ctx = ctx;
				this.t = t;
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(this.projection());
				this.unsubscribe = scope.subscribe(() => {
					this.publish();
				});
				this.loadCatalog();
			}
			/**
			* Expose the page snapshot and every staged-edit action to the registered slot.
			* @returns the face the bundle page renders and mutates through.
			*/
			inject() {
				return {
					hooks: { agentRoleConfig: this.store },
					editDefaultBacking: (value) => {
						this.edit((draft) => ({
							...draft,
							defaultBacking: value,
							defaultBackingCleared: false
						}));
					},
					resetDefaultBacking: () => {
						const inherited = this.scope.getSnapshot().base;
						this.edit((draft) => ({
							...draft,
							defaultBacking: isRecord(inherited) ? text(inherited.backingProvider) : "",
							defaultBackingCleared: true
						}));
					},
					addRole: () => {
						this.edit((draft) => ({
							...draft,
							roles: [...draft.roles, emptyDraft()]
						}));
					},
					removeRole: (id) => {
						this.edit((draft) => ({
							...draft,
							roles: draft.roles.filter((role) => role.draftId !== id)
						}));
					},
					editRole: (id, field, value) => {
						this.edit((draft) => ({
							...draft,
							roles: draft.roles.map((role) => role.draftId === id ? field === "model" ? this.withSupportedEffort({
								...role,
								model: value
							}) : {
								...role,
								[field]: value
							} : role)
						}));
					},
					setContext: (id, context) => {
						this.edit((draft) => ({
							...draft,
							roles: draft.roles.map((role) => role.draftId === id ? {
								...role,
								context
							} : role)
						}));
					},
					setProvider: (id, provider) => {
						this.edit((draft) => ({
							...draft,
							roles: draft.roles.map((role) => {
								if (role.draftId !== id) return role;
								const models = this.catalogGroups.find((group) => group.id === provider)?.models;
								const keepModel = role.provider === provider || provider !== "" && models?.some((model) => model.id === role.model) === true;
								return this.withSupportedEffort({
									...role,
									provider,
									model: keepModel ? role.model : ""
								});
							})
						}));
					},
					retryCatalog: () => {
						this.loadCatalog();
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged === void 0 && !this.failed) return;
						this.staged = void 0;
						this.initial = void 0;
						this.failed = false;
						this.publish();
					}
				};
			}
			/** Release the accepted-value subscription. */
			dispose() {
				this.disposed = true;
				this.catalogGeneration += 1;
				this.saveGeneration += 1;
				this.unsubscribe();
			}
			/** Invalidate the model directory and request it again after a Host model change. */
			refreshCatalog() {
				if (this.disposed) return;
				this.catalogGeneration += 1;
				this.catalogStatus = "idle";
				this.catalogPartial = false;
				this.catalogError = null;
				this.loadCatalog();
			}
			/** Discard directory results from the previous connection and reload them. */
			resetConnection() {
				if (this.disposed) return;
				this.catalogGroups = [];
				this.refreshCatalog();
			}
			async loadCatalog() {
				if (this.disposed || this.catalogStatus === "loading") return;
				const generation = this.catalogGeneration;
				this.catalogStatus = "loading";
				this.catalogPartial = false;
				this.catalogError = null;
				this.publish();
				try {
					const response = await this.ctx.remote.session.modelCatalog();
					if (generation !== this.catalogGeneration) return;
					if (response.ok) {
						this.catalogGroups = response.value.groups;
						this.catalogPartial = response.value.failures.length > 0;
						this.catalogStatus = "ready";
					} else {
						this.catalogStatus = "error";
						this.catalogError = response.error.message;
					}
				} catch (error) {
					if (generation !== this.catalogGeneration) return;
					this.catalogStatus = "error";
					this.catalogError = error instanceof Error ? error.message : String(error);
				}
				this.publish();
			}
			/**
			* Validate every draft and write the catalog with one revision fence.
			* @returns settlement after the Host answer and recovery read.
			*/
			async save() {
				const ops = this.plan();
				if (ops === void 0 || this.saving || this.disposed || !this.scope.getSnapshot().writable) return;
				const generation = this.saveGeneration;
				this.saving = true;
				this.failed = false;
				this.publish();
				try {
					const landed = await this.scope.mutate(ops, this.scope.getSnapshot().revision);
					if (generation !== this.saveGeneration) return;
					if (landed) {
						this.staged = void 0;
						this.initial = void 0;
					}
					this.failed = !landed;
				} catch (_error) {
					if (generation !== this.saveGeneration) return;
					this.failed = true;
				} finally {
					if (generation === this.saveGeneration) {
						this.saving = false;
						this.publish();
					}
				}
			}
			/**
			* Stage one edit over the accepted values.
			* @param change - draft transformation.
			*/
			edit(change) {
				const base = this.staged ?? this.accepted();
				this.initial ??= base;
				this.staged = change(base);
				this.failed = false;
				this.publish();
			}
			/** @returns the currently displayed list, built from accepted values and staged edits. */
			current() {
				return this.staged ?? this.accepted();
			}
			/**
			* Clear a stored reasoning effort the newly selected model does not
			* advertise, so an edit cannot leave a route the model refuses. A route the
			* directory does not describe keeps its text.
			* @param role - the draft after a provider or model change.
			* @returns the draft with a supported effort, or an empty one.
			*/
			withSupportedEffort(role) {
				const effort = optional(role.reasoningEffort);
				const provider = optional(role.provider);
				const model = optional(role.model);
				if (effort === void 0) return role;
				if (provider === void 0 || model === void 0) return {
					...role,
					reasoningEffort: ""
				};
				const efforts = advertisedEfforts(this.catalogGroups, provider, model);
				return efforts === void 0 || efforts.includes(effort) ? role : {
					...role,
					reasoningEffort: ""
				};
			}
			/** @returns one draft list read from the accepted section. */
			accepted() {
				const snapshot = this.scope.getSnapshot();
				if (this.acceptedDraft !== void 0 && Object.is(this.acceptedValue, snapshot.value)) return this.acceptedDraft;
				const section = isRecord(snapshot.value) ? snapshot.value : {};
				this.acceptedValue = snapshot.value;
				this.acceptedDraft = {
					roles: roleEntries(section.roles).map(([name, definition]) => toDraft(name, definition)),
					defaultBacking: text(section.backingProvider),
					defaultBackingCleared: false
				};
				return this.acceptedDraft;
			}
			/**
			* Validate every draft into render state.
			* @returns the drafts and their first blocking message.
			*/
			roleStates() {
				const roles = this.current().roles;
				const duplicates = duplicateNames(roles);
				return roles.map((role) => {
					const outcome = payloadOf(role, duplicates, this.catalogGroups);
					if ("code" in outcome) return {
						...role,
						error: this.t(outcome.code),
						errorCode: outcome.code,
						errorField: outcome.field
					};
					return role;
				});
			}
			/**
			* @returns the writes a save performs, or undefined while blocked or unchanged.
			*/
			plan() {
				if (this.scope.getSnapshot().status !== "ready" || this.staged === void 0 || this.initial === void 0) return void 0;
				const states = this.roleStates();
				if (states.some((role) => role.error !== void 0)) return void 0;
				const defaultBacking = optional(this.current().defaultBacking);
				if (defaultBacking !== void 0 && !validIdentifier(defaultBacking)) return void 0;
				const current = this.current();
				const rolesChanged = JSON.stringify(current.roles) !== JSON.stringify(this.initial.roles);
				const backingChanged = current.defaultBacking !== this.initial.defaultBacking || current.defaultBackingCleared !== this.initial.defaultBackingCleared;
				if (!rolesChanged && !backingChanged) return void 0;
				const ops = [];
				if (rolesChanged) {
					const roles = {};
					const duplicates = duplicateNames(states);
					for (const role of states) roles[role.name.trim()] = payloadOf(role, duplicates, this.catalogGroups).payload;
					ops.push({
						op: "set",
						path: ["roles"],
						value: roles
					});
				}
				if (backingChanged) ops.push(current.defaultBackingCleared || defaultBacking === void 0 ? {
					op: "unset",
					path: ["backingProvider"]
				} : {
					op: "set",
					path: ["backingProvider"],
					value: defaultBacking
				});
				return ops;
			}
			/** Rebuild and publish the projection. */
			projection() {
				const snapshot = this.scope.getSnapshot();
				const current = this.current();
				const user = isRecord(snapshot.user) ? snapshot.user : {};
				const defaultBacking = optional(current.defaultBacking);
				const states = this.roleStates();
				return {
					available: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: this.plan() !== void 0,
					invalid: states.some((role) => role.error !== void 0) || defaultBacking !== void 0 && !validIdentifier(defaultBacking),
					saving: this.saving,
					failed: this.failed,
					defaultBacking: current.defaultBacking,
					defaultBackingOverridden: !current.defaultBackingCleared && defaultBacking !== void 0 && Object.hasOwn(user, "backingProvider"),
					defaultBackingCleared: current.defaultBackingCleared,
					defaultBackingInvalid: defaultBacking !== void 0 && !validIdentifier(defaultBacking),
					catalogGroups: this.catalogGroups,
					catalogStatus: this.catalogStatus,
					catalogPartial: this.catalogPartial,
					catalogError: this.catalogError,
					roles: states
				};
			}
			publish() {
				if (this.disposed) return;
				this.store.set(this.projection());
			}
		};
		//#endregion
		//#region lib/types/client/index.js
		/** The Agent Roles bundle page: edit the catalog over the `agent-roles` settings namespace. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "agentRoles.config";
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.session",
			"configForms"
		];
		/**
		* Mount the Agent Roles page on its bundle while the Host serves the role catalog.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-agent-role-config: dictionaries");
			const card = new AgentRoleConfigController(ctx.configForms.get(AGENT_ROLES_NS), ctx, t);
			ctx.effect(() => ctx.remote.$on("llm/adapters-updated", () => {
				card.refreshCatalog();
			}), "ui-agent-role-config: adapter invalidations");
			ctx.effect(() => ctx.remote.$on("settings/document-updated", () => {
				card.refreshCatalog();
			}), "ui-agent-role-config: settings invalidations");
			ctx.effect(() => ctx.on("connection/reset", () => {
				card.resetConnection();
			}), "ui-agent-role-config: connection generation");
			ctx.effect(() => () => {
				card.dispose();
			}, "ui-agent-role-config: form subscription");
			const face = card.inject();
			ctx.effect(() => ctx.configForms.whileServed([AGENT_ROLES_NS], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: AGENT_ROLE_CONFIG_BUNDLE,
				locale: NS,
				inject: () => face
			}, AgentRoleConfigCard))), "ui-agent-role-config: bundle page");
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map