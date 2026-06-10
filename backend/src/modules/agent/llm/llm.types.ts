/**
 * Provider-neutral chat/tool-use contract.
 *
 * The agent loop speaks only these shapes; each concrete provider
 * (Anthropic, OpenAI, …) maps them to/from its own SDK. Nothing here is
 * tied to a specific vendor.
 */

export type LlmRole = 'user' | 'assistant';

/** A tool the model decided to call. `input` is always a parsed object. */
export interface LlmToolCall {
    id: string;
    name: string;
    input: Record<string, unknown>;
}

/** The result of executing a tool call, fed back to the model. */
export interface LlmToolResult {
    toolCallId: string;
    content: string;
    isError?: boolean;
}

/**
 * One conversation turn. An assistant turn may carry `text` and/or
 * `toolCalls`; a user turn may carry `text` and/or `toolResults`.
 */
export interface LlmMessage {
    role: LlmRole;
    text?: string;
    toolCalls?: LlmToolCall[];
    toolResults?: LlmToolResult[];
}

/** A tool definition handed to the model (JSON-Schema input). */
export interface LlmToolSpec {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
    system: string;
    tools: LlmToolSpec[];
    messages: LlmMessage[];
    maxTokens?: number;
}

/** Why the model stopped, normalized across providers. */
export type LlmStopReason = 'tool_use' | 'end' | 'max' | 'other';

export interface LlmResponse {
    /** Concatenated text the model produced this turn (may be empty). */
    text: string;
    /** Tool calls requested this turn (empty when the model is done). */
    toolCalls: LlmToolCall[];
    stop: LlmStopReason;
}
