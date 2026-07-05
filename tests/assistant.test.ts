/**
 * feat-008 Asistent AI — suite (verification: `npm test -- tests/assistant`).
 * T01 covers the LLM module without any network: adapter construction and
 * the neutral-types ↔ wire-format mapping. Later tasks add integration
 * tests through the real service + DB with the fake provider (008 07-tasks).
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  AnthropicLlmProvider,
  fromAnthropicResponse,
  toAnthropicMessages,
} from "@/server/llm/anthropic";
import { LlmMessage, LlmUnavailableError } from "@/server/llm/provider";

function anthropicResponse(
  content: unknown[],
  usage = { input_tokens: 100, output_tokens: 20 },
): Anthropic.Message {
  return { content, usage } as unknown as Anthropic.Message;
}

describe("T01 — AnthropicLlmProvider construction", () => {
  it("throws LlmUnavailableError without an API key", () => {
    expect(() => new AnthropicLlmProvider({})).toThrow(LlmUnavailableError);
  });

  it("treats an empty ANTHROPIC_API_KEY as missing", () => {
    expect(() => new AnthropicLlmProvider({ ANTHROPIC_API_KEY: "" })).toThrow(
      LlmUnavailableError,
    );
  });

  it("constructs with a key, without touching the network", () => {
    expect(
      () =>
        new AnthropicLlmProvider({
          ANTHROPIC_API_KEY: "test-key",
          ASSISTANT_MODEL: "claude-opus-4-8",
        }),
    ).not.toThrow();
  });
});

describe("T01 — provider types round-trip through the wire mapping", () => {
  it("maps every neutral message role to the Messages API shape", () => {
    const messages: LlmMessage[] = [
      { role: "user", text: "ce pizza picantă aveți?" },
      {
        role: "assistant_tool_calls",
        calls: [{ id: "call_1", name: "get_menu", input: {} }],
      },
      {
        role: "tool_results",
        results: [{ toolCallId: "call_1", content: '{"categories":[]}' }],
      },
      { role: "assistant", text: "Avem Pizza Diavola." },
    ];

    expect(toAnthropicMessages(messages)).toEqual([
      { role: "user", content: "ce pizza picantă aveți?" },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "get_menu", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: '{"categories":[]}',
            is_error: false,
          },
        ],
      },
      { role: "assistant", content: "Avem Pizza Diavola." },
    ]);
  });

  it("keeps all tool results of one round in a single user message", () => {
    const [message] = toAnthropicMessages([
      {
        role: "tool_results",
        results: [
          { toolCallId: "call_1", content: "{}" },
          { toolCallId: "call_2", content: "invalid zone", isError: true },
        ],
      },
    ]);
    expect(message.role).toBe("user");
    expect(message.content).toHaveLength(2);
    expect(message.content[1]).toMatchObject({
      tool_use_id: "call_2",
      is_error: true,
    });
  });

  it("maps a text response to a reply with usage", () => {
    const result = fromAnthropicResponse(
      anthropicResponse([
        { type: "text", text: "Bună!" },
        { type: "text", text: " Cu ce vă pot ajuta?" },
      ]),
    );
    expect(result).toEqual({
      kind: "reply",
      text: "Bună! Cu ce vă pot ajuta?",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it("maps tool_use blocks to tool_calls, even mixed with text", () => {
    const result = fromAnthropicResponse(
      anthropicResponse(
        [
          { type: "text", text: "Verific meniul." },
          { type: "tool_use", id: "call_9", name: "get_menu", input: {} },
          {
            type: "tool_use",
            id: "call_10",
            name: "get_delivery_zones",
            input: {},
          },
        ],
        { input_tokens: 250, output_tokens: 41 },
      ),
    );
    expect(result).toEqual({
      kind: "tool_calls",
      calls: [
        { id: "call_9", name: "get_menu", input: {} },
        { id: "call_10", name: "get_delivery_zones", input: {} },
      ],
      usage: { inputTokens: 250, outputTokens: 41 },
    });
  });

  it("round-trips tool calls from a response back into the wire format", () => {
    const result = fromAnthropicResponse(
      anthropicResponse([
        { type: "tool_use", id: "call_7", name: "get_schedule", input: {} },
      ]),
    );
    if (result.kind !== "tool_calls") throw new Error("expected tool_calls");

    expect(
      toAnthropicMessages([
        { role: "assistant_tool_calls", calls: result.calls },
      ]),
    ).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_7", name: "get_schedule", input: {} },
        ],
      },
    ]);
  });
});
