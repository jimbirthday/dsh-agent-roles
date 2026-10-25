/** Stable failures raised by the Agent Role catalog. */
/** Machine-readable Agent Role failure codes. */
export type AgentRoleErrorCode = 'ROLE_INVALID_CONFIG' | 'ROLE_UNKNOWN';
/** A typed Agent Role failure carrying a stable {@link AgentRoleErrorCode}. */
export declare class AgentRoleError extends Error {
    readonly code: AgentRoleErrorCode;
    /**
     * @param message - action-oriented description naming the role and the fix.
     * @param code - stable machine-readable failure code.
     * @param options - optional cause chain.
     */
    constructor(message: string, code: AgentRoleErrorCode, options?: {
        cause?: unknown;
    });
}
//# sourceMappingURL=error.d.ts.map