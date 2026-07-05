/**
 * Provider-agnostic LLM interface (008 06-contracts/api.md). The assistant
 * service depends only on this file; vendor SDKs live behind adapters
 * (anthropic.ts). Nothing vendor-shaped — block types, stop reasons, SDK
 * errors — may cross this interface.
 */

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface LlmToolResult {
  toolCallId: string;
  /** JSON-serialized tool output — the model sees exactly this string. */
  content: string;
  isError?: boolean;
}

/** One conversation entry; prior tool calls/results are typed entries too. */
export type LlmMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "assistant_tool_calls"; calls: LlmToolCall[] }
  | { role: "tool_results"; results: LlmToolResult[] };

/** JSON Schema for a tool's input — always an object schema. */
export interface LlmToolSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: LlmToolSchema;
}

export type LlmTurnResult =
  | { kind: "reply"; text: string; usage: LlmUsage }
  | { kind: "tool_calls"; calls: LlmToolCall[]; usage: LlmUsage };

export interface LlmProvider {
  complete(input: {
    system: string;
    messages: LlmMessage[];
    tools: LlmToolDefinition[];
    maxTokens: number;
  }): Promise<LlmTurnResult>;
}

/**
 * Provider failure — missing key, auth, 429, 5xx, billing/spend limit.
 * Callers translate it to 503 assistant_unavailable (008 06-contracts).
 */
export class LlmUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmUnavailableError";
  }
}
