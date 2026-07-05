/**
 * feat-008 Asistent AI — suite (verification: `npm test -- tests/assistant`).
 * T01 covers the LLM module without any network: adapter construction and
 * the neutral-types ↔ wire-format mapping. T02 covers conversation storage
 * against the real Postgres (docker-compose; the suite migrates itself).
 * Later tasks add integration tests through the real service with the fake
 * provider (008 07-tasks).
 */
import { execSync } from "node:child_process";

import Anthropic from "@anthropic-ai/sdk";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { assistantConversations, assistantMessages } from "@/server/db/schema";
import {
  AnthropicLlmProvider,
  fromAnthropicResponse,
  toAnthropicMessages,
} from "@/server/llm/anthropic";
import { LlmMessage, LlmUnavailableError } from "@/server/llm/provider";
import {
  appendMessage,
  countUserMessages,
  countUserMessagesForIpLast24h,
  createConversation,
  deleteConversationsOlderThan,
  getConversation,
  getConversationMessages,
} from "@/server/repositories/assistant";

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); the T02 suite needs Postgres.
const skipDb = process.env.SKIP_DB === "1";

beforeAll(() => {
  if (skipDb) return;
  execSync("npm run db:migrate", { stdio: "pipe" });
}, 120_000);

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

// --- T02 — conversation storage (real Postgres) ------------------------------

/** TEST-NET-3 addresses — never real clients, easy to spot in the dev DB. */
const IP_A = "203.0.113.81";
const IP_B = "203.0.113.82";

const createdConversationIds: string[] = [];

async function newConversation(clientIp: string) {
  const conversation = await createConversation(clientIp);
  createdConversationIds.push(conversation.id);
  return conversation;
}

/** Retention/counter tests move the DB clocks; app-side dates stay untouched. */
async function backdateConversation(conversationId: string, days: number) {
  await db
    .update(assistantConversations)
    .set({ lastActivityAt: sql`now() - make_interval(days => ${days})` })
    .where(eq(assistantConversations.id, conversationId));
}

async function backdateMessage(messageId: number, hours: number) {
  await db
    .update(assistantMessages)
    .set({ createdAt: sql`now() - make_interval(hours => ${hours})` })
    .where(eq(assistantMessages.id, messageId));
}

afterAll(async () => {
  if (skipDb || createdConversationIds.length === 0) return;
  await db
    .delete(assistantConversations)
    .where(inArray(assistantConversations.id, createdConversationIds));
});

describe.skipIf(skipDb)("T02 — conversation round-trip and ordering", () => {
  it("persists a full transcript and reads it back in insertion order", async () => {
    const conversation = await newConversation(IP_A);
    expect(conversation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(conversation.clientIp).toBe(IP_A);

    await appendMessage({
      conversationId: conversation.id,
      role: "user",
      content: { text: "ce pizza picantă aveți?" },
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: { toolCalls: [{ id: "call_1", name: "get_menu", input: {} }] },
      inputTokens: 250,
      outputTokens: 18,
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "tool",
      content: {
        toolCallId: "call_1",
        name: "get_menu",
        result: { categories: [{ slug: "pizza" }] },
      },
    });
    await appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: { text: "Avem Pizza Diavola." },
      inputTokens: 400,
      outputTokens: 35,
    });

    const messages = await getConversationMessages(conversation.id);
    expect(messages.map(({ role }) => role)).toEqual(["user", "assistant", "tool", "assistant"]);
    // ordered reads go by (conversationId, id) — ids must be strictly ascending
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].id).toBeGreaterThan(messages[i - 1].id);
    }

    expect(messages[0].content).toEqual({ text: "ce pizza picantă aveți?" });
    expect(messages[0].inputTokens).toBeNull();
    expect(messages[0].outputTokens).toBeNull();
    expect(messages[1].content).toEqual({
      toolCalls: [{ id: "call_1", name: "get_menu", input: {} }],
    });
    expect(messages[1].inputTokens).toBe(250);
    expect(messages[2].content).toEqual({
      toolCallId: "call_1",
      name: "get_menu",
      result: { categories: [{ slug: "pizza" }] },
    });
    expect(messages[3].content).toEqual({ text: "Avem Pizza Diavola." });
    expect(messages[3].outputTokens).toBe(35);
  });

  it("returns null for an unknown conversation id", async () => {
    expect(await getConversation("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getConversationMessages("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("bumps lastActivityAt on every appended message (the retention clock)", async () => {
    const conversation = await newConversation(IP_A);
    await backdateConversation(conversation.id, 29);

    await appendMessage({ conversationId: conversation.id, role: "user", content: { text: "mai sunteți?" } });

    const bumped = await getConversation(conversation.id);
    const ageMs = Date.now() - bumped!.lastActivityAt.getTime();
    expect(ageMs).toBeLessThan(60_000);
  });
});

describe.skipIf(skipDb)("T02 — anti-abuse counters", () => {
  it("counts only role-user rows per conversation", async () => {
    const conversation = await newConversation(IP_A);
    await appendMessage({ conversationId: conversation.id, role: "user", content: { text: "salut" } });
    await appendMessage({ conversationId: conversation.id, role: "assistant", content: { text: "Bună!" } });
    await appendMessage({
      conversationId: conversation.id,
      role: "tool",
      content: { toolCallId: "c", name: "get_menu", result: {} },
    });
    await appendMessage({ conversationId: conversation.id, role: "user", content: { text: "meniul?" } });

    expect(await countUserMessages(conversation.id)).toBe(2);
  });

  it("counts user messages per IP across conversations, only inside 24h", async () => {
    const ipCounted = "203.0.113.91";
    const first = await newConversation(ipCounted);
    const second = await newConversation(ipCounted);
    const otherIp = await newConversation(IP_B);

    await appendMessage({ conversationId: first.id, role: "user", content: { text: "1" } });
    const staleId = await appendMessage({ conversationId: first.id, role: "user", content: { text: "2" } });
    await appendMessage({ conversationId: first.id, role: "assistant", content: { text: "răspuns" } });
    await appendMessage({ conversationId: second.id, role: "user", content: { text: "3" } });
    await appendMessage({ conversationId: otherIp.id, role: "user", content: { text: "alt client" } });

    expect(await countUserMessagesForIpLast24h(ipCounted)).toBe(3);

    await backdateMessage(staleId, 25);
    expect(await countUserMessagesForIpLast24h(ipCounted)).toBe(2);
    expect(await countUserMessagesForIpLast24h(IP_B)).toBe(1);
  });
});

describe.skipIf(skipDb)("T02 — retention", () => {
  it("deletes idle conversations with their messages, keeps active ones", async () => {
    const stale = await newConversation(IP_A);
    await appendMessage({ conversationId: stale.id, role: "user", content: { text: "demult" } });
    const fresh = await newConversation(IP_A);
    await appendMessage({ conversationId: fresh.id, role: "user", content: { text: "acum" } });

    await backdateConversation(stale.id, 31);
    const deleted = await deleteConversationsOlderThan(30);

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await getConversation(stale.id)).toBeNull();
    // CASCADE: the transcript went with the conversation
    const orphanRows = await db
      .select({ id: assistantMessages.id })
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, stale.id));
    expect(orphanRows).toEqual([]);

    expect(await getConversation(fresh.id)).not.toBeNull();
    expect(await getConversationMessages(fresh.id)).toHaveLength(1);
  });

  it("leaves a conversation alone when it is exactly at the boundary", async () => {
    const boundary = await newConversation(IP_B);
    await backdateConversation(boundary.id, 29);

    await deleteConversationsOlderThan(30);

    expect(await getConversation(boundary.id)).not.toBeNull();
  });
});
