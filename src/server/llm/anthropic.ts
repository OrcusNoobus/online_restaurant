/**
 * Anthropic adapter for LlmProvider — the ONLY file that may import
 * `@anthropic-ai/sdk` (008 04-plan.md). Maps the neutral message/tool types
 * to the Messages API wire format and typed SDK errors to LlmUnavailableError.
 */
import Anthropic from "@anthropic-ai/sdk";

import {
  LlmMessage,
  LlmProvider,
  LlmToolDefinition,
  LlmTurnResult,
  LlmUnavailableError,
} from "./provider";

/** Matches .env.example; ASSISTANT_MODEL overrides for a one-line swap. */
const DEFAULT_MODEL = "claude-opus-4-8";

/** Neutral messages → Messages API wire format. Exported for unit tests. */
export function toAnthropicMessages(
  messages: LlmMessage[],
): Anthropic.MessageParam[] {
  return messages.map((message): Anthropic.MessageParam => {
    switch (message.role) {
      case "user":
        return { role: "user", content: message.text };
      case "assistant":
        return { role: "assistant", content: message.text };
      case "assistant_tool_calls":
        return {
          role: "assistant",
          content: message.calls.map((call) => ({
            type: "tool_use" as const,
            id: call.id,
            name: call.name,
            input: call.input,
          })),
        };
      case "tool_results":
        // All results of one round go back in a single user message.
        return {
          role: "user",
          content: message.results.map((result) => ({
            type: "tool_result" as const,
            tool_use_id: result.toolCallId,
            content: result.content,
            is_error: result.isError ?? false,
          })),
        };
    }
  });
}

/** Messages API response → neutral turn result. Exported for unit tests. */
export function fromAnthropicResponse(
  response: Anthropic.Message,
): LlmTurnResult {
  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  const toolCalls = response.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (toolCalls.length > 0) {
    return {
      kind: "tool_calls",
      calls: toolCalls.map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      })),
      usage,
    };
  }
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  return { kind: "reply", text, usage };
}

export class AnthropicLlmProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  /** `env` is injectable for tests; construction fails without an API key. */
  constructor(env: Record<string, string | undefined> = process.env) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LlmUnavailableError(
        "ANTHROPIC_API_KEY is not set (see .env.example)",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = env.ASSISTANT_MODEL || DEFAULT_MODEL;
  }

  async complete(input: {
    system: string;
    messages: LlmMessage[];
    tools: LlmToolDefinition[];
    maxTokens: number;
  }): Promise<LlmTurnResult> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: input.maxTokens,
        // Tools render before system in the prompt, so the cache breakpoint
        // on the system block caches tools + system together. Everything
        // volatile (conversation, cart) stays in `messages`, after it.
        system: [
          {
            type: "text",
            text: input.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: input.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        })),
        messages: toAnthropicMessages(input.messages),
      });
      return fromAnthropicResponse(response);
    } catch (error) {
      // APIError covers auth, 429, 5xx, billing and (in the TS SDK) also
      // connection errors — the assistant is unavailable either way. The
      // original error rides along as `cause` for the server log.
      if (error instanceof Anthropic.APIError) {
        throw new LlmUnavailableError(`Anthropic API error: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
