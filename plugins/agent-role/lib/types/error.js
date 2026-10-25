/** Stable failures raised by the Agent Role catalog. */
/** A typed Agent Role failure carrying a stable {@link AgentRoleErrorCode}. */
export class AgentRoleError extends Error {
    code;
    /**
     * @param message - action-oriented description naming the role and the fix.
     * @param code - stable machine-readable failure code.
     * @param options - optional cause chain.
     */
    constructor(message, code, options) {
        super(message, options);
        this.code = code;
        this.name = 'AgentRoleError';
    }
}
//# sourceMappingURL=error.js.map