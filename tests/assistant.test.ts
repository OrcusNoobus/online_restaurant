/**
 * feat-008 Asistent AI — suite (verification: `npm test -- tests/assistant`).
 * T01 covers the LLM module without any network: adapter construction and
 * the neutral-types ↔ wire-format mapping. T02 covers conversation storage
 * against the real Postgres (docker-compose; the suite migrates and seeds
 * itself). T03 runs the real assistant service + DB with the scripted fake
 * provider: tool wiring on real data, transcript persistence, round cap.
 * T04 covers the cart bridge: update_cart prices through quoteCart only.
 * T05 covers place_order: same placeOrder as the web, confirmation flow.
 * T06 covers the limits (each 422 code), provider degradation, retention
 * on conversation create, and the structured per-turn log line.
 */
import { execSync } from "node:child_process";

import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CartItem } from "@/lib/cart";
import { RESTAURANT_PHONE, RESTAURANT_TIMEZONE } from "@/lib/restaurant-config";
import { db } from "@/server/db/client";
import {
  assistantConversations,
  assistantMessages,
  orderItemOptions,
  orderItems,
  orders,
  products,
  productVariants,
  toppingGroups,
  toppings,
} from "@/server/db/schema";
import {
  AnthropicLlmProvider,
  fromAnthropicResponse,
  toAnthropicMessages,
} from "@/server/llm/anthropic";
import { LlmMessage, LlmProvider, LlmUnavailableError } from "@/server/llm/provider";
import {
  appendMessage,
  countUserMessages,
  countUserMessagesForIpLast24h,
  createConversation,
  deleteConversationsOlderThan,
  getConversation,
  getConversationMessages,
} from "@/server/repositories/assistant";
import { getMenu } from "@/server/repositories/menu";
import { getActiveZones } from "@/server/repositories/zones";
import {
  type AssistantTurnOptions,
  MAX_MESSAGE_LENGTH,
  MAX_USER_MESSAGES_PER_CONVERSATION,
  MAX_USER_MESSAGES_PER_IP_PER_DAY,
  RETENTION_DAYS,
  runAssistantTurn,
} from "@/server/services/assistant";
import { quoteCart } from "@/server/services/pricing";
import { getScheduleConfig } from "@/server/services/settings";

import { FakeLlmProvider, reply, toolCalls, usage } from "./helpers/fake-llm";

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); T02/T03 need Postgres.
const skipDb = process.env.SKIP_DB === "1";

beforeAll(() => {
  if (skipDb) return;
  execSync("npm run db:migrate", { stdio: "pipe" });
  // T03 tool tests read the real menu/zones — same self-seed as tests/orders
  execSync("npm run db:seed", { stdio: "pipe" });
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
  if (skipDb) return;
  // orders placed through the assistant (T05) carry this suite's client IP
  await db.delete(orders).where(eq(orders.clientIp, TURN_IP));
  if (createdConversationIds.length > 0) {
    await db
      .delete(assistantConversations)
      .where(inArray(assistantConversations.id, createdConversationIds));
  }
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

// --- T03 — assistant service with the scripted fake provider -----------------

const TURN_IP = "203.0.113.99";

/** runAssistantTurn, unwrapped (ok expected) + conversation tracked for the shared afterAll cleanup. */
async function runTurn(
  provider: FakeLlmProvider,
  message: string,
  cart: CartItem[] = [],
  conversationId?: string,
  options: AssistantTurnOptions = {},
) {
  const turn = await runAssistantTurn(provider, { conversationId, message, cart, clientIp: TURN_IP }, options);
  if (!turn.ok) throw new Error(`expected an ok turn, got ${turn.error}`);
  if (!createdConversationIds.includes(turn.conversationId)) {
    createdConversationIds.push(turn.conversationId);
  }
  return turn;
}

/** Seeded fixtures — same lookups as tests/orders (toppings scoped by group). */
async function findProduct(slug: string, variantName: string | null) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  const variantRows = await db
    .select({ id: productVariants.id, name: productVariants.name })
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  const variant = variantRows.find(({ name }) => name === variantName)!;
  return { productId: product.id, variantId: variant.id };
}

async function findTopping(groupName: string, toppingName: string): Promise<number> {
  const [row] = await db
    .select({ id: toppings.id })
    .from(toppings)
    .innerJoin(toppingGroups, eq(toppings.groupId, toppingGroups.id))
    .where(and(eq(toppingGroups.name, groupName), eq(toppings.name, toppingName)));
  return row.id;
}

function parseToolResult(call: { messages: LlmMessage[] }, index = 0): unknown {
  const last = call.messages[call.messages.length - 1];
  if (last.role !== "tool_results") throw new Error(`expected tool_results, got ${last.role}`);
  return JSON.parse(last.results[index].content);
}

describe.skipIf(skipDb)("T03 — menu answers ride on real DB data", () => {
  it("feeds get_menu results from Postgres and persists the full transcript", async () => {
    const fake = new FakeLlmProvider([
      toolCalls([{ id: "call_1", name: "get_menu", input: {} }], usage(300, 15)),
      reply("Avem Pizza Diavola, picantă, la 30 și 40 cm.", usage(900, 40)),
    ]);

    const turn = await runTurn(fake, "ce pizza picantă aveți?");
    expect(turn.reply).toBe("Avem Pizza Diavola, picantă, la 30 și 40 cm.");
    expect(fake.calls).toHaveLength(2);

    // round 1: system prompt + tools + only the user message
    const [first, second] = fake.calls;
    expect(first.system).toContain(RESTAURANT_PHONE);
    expect(first.tools.map(({ name }) => name)).toEqual([
      "get_menu",
      "get_delivery_zones",
      "get_schedule",
      "update_cart",
      "place_order",
    ]);
    expect(first.maxTokens).toBe(1000);
    expect(first.messages).toEqual([{ role: "user", text: "ce pizza picantă aveți?" }]);

    // round 2 replays the tool round and carries the REAL menu
    expect(second.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant_tool_calls",
      "tool_results",
    ]);
    const payload = parseToolResult(second) as {
      categories: {
        name: string;
        products: { id: number; variants: { id: number; priceBani: number }[] }[];
      }[];
    };
    const menu = await getMenu();
    // grounded in the DB: same active-only category set as getMenu()
    expect(payload.categories.map(({ name }) => name)).toEqual(menu.map(({ name }) => name));
    expect(payload.categories.flatMap(({ products }) => products)).toHaveLength(
      menu.flatMap(({ products }) => products).length,
    );
    const prices = payload.categories
      .flatMap(({ products }) => products)
      .flatMap(({ variants }) => variants)
      .map(({ priceBani }) => priceBani);
    expect(prices.length).toBeGreaterThan(0);
    for (const price of prices) {
      expect(Number.isSafeInteger(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
    }

    // transcript: user → tool round (with usage) → final reply (with usage)
    const rows = await getConversationMessages(turn.conversationId);
    expect(rows.map(({ role }) => role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(rows[1].content).toEqual({ toolCalls: [{ id: "call_1", name: "get_menu", input: {} }] });
    expect(rows[1].inputTokens).toBe(300);
    expect(rows[1].outputTokens).toBe(15);
    expect(rows[2].content).toMatchObject({ toolCallId: "call_1", name: "get_menu" });
    expect(rows[3].content).toEqual({ text: "Avem Pizza Diavola, picantă, la 30 și 40 cm." });
    expect(rows[3].inputTokens).toBe(900);
    expect(rows[3].outputTokens).toBe(40);
  });

  it("serves zones and schedule from the DB, both results in one round", async () => {
    const fake = new FakeLlmProvider([
      toolCalls([
        { id: "call_z", name: "get_delivery_zones", input: {} },
        { id: "call_s", name: "get_schedule", input: {} },
      ]),
      reply("Livrăm în toate zonele afișate."),
    ]);

    const turn = await runTurn(fake, "unde livrați și ce orar aveți?");

    const second = fake.calls[1];
    const lastEntry = second.messages[second.messages.length - 1];
    if (lastEntry.role !== "tool_results") throw new Error("expected tool_results");
    expect(lastEntry.results).toHaveLength(2);

    const zonesPayload = parseToolResult(second, 0) as {
      slug: string;
      feeBani: number;
      freeOverBani: number;
    }[];
    const zones = await getActiveZones();
    expect(zonesPayload.map(({ slug }) => slug)).toEqual(zones.map(({ slug }) => slug));
    expect(zonesPayload[0].feeBani).toBe(zones[0].feeBani);
    // contract naming: freeOverBani carries the repo's freeFromBani threshold
    expect(zonesPayload[0].freeOverBani).toBe(zones[0].freeFromBani);

    const schedulePayload = parseToolResult(second, 1) as Record<string, unknown>;
    const schedule = await getScheduleConfig();
    expect(schedulePayload.timezone).toBe(RESTAURANT_TIMEZONE);
    expect(schedulePayload.deliveryEstimateMinutes).toBe(schedule.deliveryEstimateMinutes);
    expect(schedulePayload.pickupEstimateOptionsMinutes).toEqual(
      schedule.pickupEstimateOptionsMinutes,
    );
    expect(schedulePayload.openTime).toMatch(/^\d{2}:\d{2}$/);

    // one tool row per result, in call order
    const rows = await getConversationMessages(turn.conversationId);
    expect(rows.map(({ role }) => role)).toEqual(["user", "assistant", "tool", "tool", "assistant"]);
    expect(rows[2].content).toMatchObject({ toolCallId: "call_z", name: "get_delivery_zones" });
    expect(rows[3].content).toMatchObject({ toolCallId: "call_s", name: "get_schedule" });
  });

  it("answers an unknown tool name with an error result instead of crashing", async () => {
    const fake = new FakeLlmProvider([
      toolCalls([{ id: "call_x", name: "get_weather", input: {} }]),
      reply("Vă pot ajuta doar cu meniul și comenzile."),
    ]);

    const turn = await runTurn(fake, "ce vreme e afară?");
    expect(turn.reply).toBe("Vă pot ajuta doar cu meniul și comenzile.");

    const second = fake.calls[1];
    const lastEntry = second.messages[second.messages.length - 1];
    if (lastEntry.role !== "tool_results") throw new Error("expected tool_results");
    expect(lastEntry.results[0].isError).toBe(true);

    const rows = await getConversationMessages(turn.conversationId);
    expect(rows[2].content).toMatchObject({ toolCallId: "call_x", isError: true });
  });
});

describe.skipIf(skipDb)("T03 — conversation continuity", () => {
  it("replays prior turns to the provider on the same conversation", async () => {
    const firstTurn = await runTurn(new FakeLlmProvider([reply("Bună! Cu ce vă ajut?")]), "salut");

    const fake = new FakeLlmProvider([reply("Sigur, ce produs vă interesează?")]);
    const secondTurn = await runTurn(fake, "aș comanda ceva", [], firstTurn.conversationId);

    expect(secondTurn.conversationId).toBe(firstTurn.conversationId);
    expect(fake.calls[0].messages).toEqual([
      { role: "user", text: "salut" },
      { role: "assistant", text: "Bună! Cu ce vă ajut?" },
      { role: "user", text: "aș comanda ceva" },
    ]);
  });

  it("starts a fresh conversation for an unknown conversationId", async () => {
    const fake = new FakeLlmProvider([reply("Bună!")]);
    const turn = await runTurn(fake, "salut", [], "00000000-0000-4000-8000-000000000000");

    expect(turn.conversationId).not.toBe("00000000-0000-4000-8000-000000000000");
    expect(fake.calls[0].messages).toEqual([{ role: "user", text: "salut" }]);
    expect(await getConversation(turn.conversationId)).not.toBeNull();
  });
});

describe.skipIf(skipDb)("T04 — cart bridge + update_cart", () => {
  it("lands the exact server quote (SGR line + zone fee below the threshold)", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const items = [{ ...heineken, quantity: 2, toppingIds: [sgrId] }];
    const request = { mode: "delivery" as const, zoneSlug: "santana-de-mures", items };

    const fake = new FakeLlmProvider([
      toolCalls([{ id: "call_cart", name: "update_cart", input: request }]),
      reply("Am pus 2 × Heineken în coș; totalul este 43,00 lei."),
    ]);
    const turn = await runTurn(fake, "adaugă două beri heineken");

    // the model saw the QuoteResult VERBATIM — byte-identical to quoteCart
    expect(parseToolResult(fake.calls[1])).toEqual(await quoteCart(request));

    // server money, never client math: 2×1100 base, 2×50 SGR, fee 2000 under the 4000 threshold
    expect(turn.quote).toEqual({
      items: [
        expect.objectContaining({
          productName: "Heineken 0,5 L",
          quantity: 2,
          unitPriceBani: 1100,
          lineTotalBani: 2300,
        }),
      ],
      subtotalBani: 2200,
      sgrBani: 100,
      deliveryFeeBani: 2000,
      freeDeliveryGapBani: 1700,
      totalBani: 4300,
    });
    // the resolved zone row stays service-internal (same as POST /api/cart/quote)
    expect(turn.quote).not.toHaveProperty("zone");
    expect(turn.cart).toEqual(items);
  });

  it("keeps the LAST successful quote when the cart changes twice in one turn", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    // 3700 + 300 ambalaj = 4000 — exactly AT the threshold → delivery is free
    const finalItems = [{ ...pizza30, quantity: 1, toppingIds: [ambalajId] }];

    const fake = new FakeLlmProvider([
      toolCalls([
        {
          id: "call_1",
          name: "update_cart",
          input: { mode: "pickup", items: [{ ...heineken, quantity: 1, toppingIds: [sgrId] }] },
        },
      ]),
      toolCalls([
        {
          id: "call_2",
          name: "update_cart",
          input: { mode: "delivery", zoneSlug: "santana-de-mures", items: finalItems },
        },
      ]),
      reply("Am înlocuit berea cu pizza; livrarea este gratuită."),
    ]);
    const turn = await runTurn(fake, "de fapt vreau o pizza bambini în loc");

    expect(fake.calls).toHaveLength(3);
    expect(turn.cart).toEqual(finalItems);
    expect(turn.quote).toMatchObject({
      subtotalBani: 4000,
      deliveryFeeBani: 0,
      freeDeliveryGapBani: 0,
      totalBani: 4000,
    });
  });

  it("surfaces the existing reason codes and leaves the cart untouched", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const siteCart = [{ ...heineken, quantity: 1, toppingIds: [sgrId] }];

    const fake = new FakeLlmProvider([
      toolCalls([
        {
          id: "call_bad",
          name: "update_cart",
          input: {
            mode: "delivery",
            zoneSlug: "zona-inexistenta",
            items: [{ productId: 999999, variantId: 999999, quantity: 1, toppingIds: [] }],
          },
        },
      ]),
      reply("Nu găsesc acest produs în meniu."),
    ]);
    const turn = await runTurn(fake, "adaugă produsul misterios", siteCart);

    const result = parseToolResult(fake.calls[1]) as { ok: boolean; reasons: { code: string }[] };
    expect(result.ok).toBe(false);
    expect(result.reasons.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["product_not_found", "zone_unknown"]),
    );
    // a refused quote is a NORMAL tool result the model reads — not a tool error
    const lastEntry = fake.calls[1].messages[fake.calls[1].messages.length - 1];
    if (lastEntry.role !== "tool_results") throw new Error("expected tool_results");
    expect(lastEntry.results[0].isError).toBeUndefined();

    // an unpriceable cart never commits: the site cart survives verbatim
    expect(turn.cart).toEqual(siteCart);
    expect(turn.quote).toBeNull();

    const rows = await getConversationMessages(turn.conversationId);
    expect(rows[2].content).toMatchObject({ name: "update_cart", result: { ok: false } });
  });

  it("answers malformed tool input with a tool error, cart untouched", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const siteCart = [{ ...heineken, quantity: 1, toppingIds: [sgrId] }];

    const fake = new FakeLlmProvider([
      toolCalls([{ id: "call_junk", name: "update_cart", input: { items: "toate produsele" } }]),
      reply("Îmi cer scuze, reiau cu meniul."),
    ]);
    const turn = await runTurn(fake, "pune tot meniul în coș", siteCart);

    const lastEntry = fake.calls[1].messages[fake.calls[1].messages.length - 1];
    if (lastEntry.role !== "tool_results") throw new Error("expected tool_results");
    expect(lastEntry.results[0].isError).toBe(true);
    expect(turn.cart).toEqual(siteCart);
    expect(turn.quote).toBeNull();
  });

  it("round-trips the cart unchanged when no tool touches it", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const siteCart = [{ ...pizza30, quantity: 2, toppingIds: [ambalajId] }];

    const fake = new FakeLlmProvider([reply("Cu plăcere!")]);
    const turn = await runTurn(fake, "mulțumesc", siteCart);

    expect(turn.cart).toEqual(siteCart);
    expect(turn.quote).toBeNull();
  });
});

describe.skipIf(skipDb)("T05 — place_order + confirmation flow", () => {
  // Saturday 2026-07-04, 18:00 restaurant time (EEST) — open; same clock as tests/orders
  const OPEN_NOW = new Date("2026-07-04T15:00:00Z");

  async function deliveryOrderInput(overrides: Record<string, unknown> = {}) {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    return {
      mode: "delivery",
      zoneSlug: "santana-de-mures",
      items: [{ ...heineken, quantity: 2, toppingIds: [sgrId] }],
      customer: { firstName: "Ana", lastName: "Chat", phone: "0740999888", email: null },
      addressStreet: "Str. Teilor 5",
      notes: null,
      scheduledFor: null,
      paymentMethod: "cash",
      termsAccepted: true,
      ...overrides,
    };
  }

  async function ordersPlacedByThisSuite() {
    return db.select({ id: orders.id }).from(orders).where(eq(orders.clientIp, TURN_IP));
  }

  it("without confirmation nothing is placed; after confirmation the order lands like a web order", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const items = [{ ...heineken, quantity: 2, toppingIds: [sgrId] }];

    // turn 1 — the model quotes and asks for confirmation; NO place_order scripted
    const fake1 = new FakeLlmProvider([
      toolCalls([
        {
          id: "call_q",
          name: "update_cart",
          input: { mode: "delivery", zoneSlug: "santana-de-mures", items },
        },
      ]),
      reply("Sumar: 2 × Heineken 0,5 L, total 43,00 lei cu livrare la Sântana de Mureș. Confirmați?"),
    ]);
    const turn1 = await runTurn(fake1, "vreau două heineken la Sântana de Mureș", [], undefined, {
      now: OPEN_NOW,
    });

    expect(turn1.placedOrder).toBeNull();
    expect(await ordersPlacedByThisSuite()).toHaveLength(0);
    // plan D9: the persisted transcript proves no place_order ran this turn
    const rows1 = await getConversationMessages(turn1.conversationId);
    const toolNames1 = rows1
      .filter((row) => row.role === "tool")
      .map((row) => ("name" in row.content ? row.content.name : ""));
    expect(toolNames1).toEqual(["update_cart"]);

    // turn 2 — explicit confirmation → place_order with the full OrderRequest
    const fake2 = new FakeLlmProvider([
      toolCalls([{ id: "call_o", name: "place_order", input: await deliveryOrderInput() }]),
      reply("Comanda a fost plasată! Ajunge în aproximativ 60 de minute."),
    ]);
    const turn2 = await runTurn(fake2, "da, confirm comanda", turn1.cart, turn1.conversationId, {
      now: OPEN_NOW,
    });

    expect(turn2.placedOrder).toMatchObject({
      status: "new",
      mode: "delivery",
      estimateMinutes: 60,
      subtotalBani: 2200,
      sgrBani: 100,
      deliveryFeeBani: 2000,
      totalBani: 4300,
    });
    const orderId = turn2.placedOrder!.orderId;
    expect(turn2.placedOrder!.orderNumber).toBe(`#${orderId}`);
    // the site cart empties on placement — same as the web checkout clear()
    expect(turn2.cart).toEqual([]);
    expect(turn2.quote).toBeNull();

    // DB snapshot identical in shape to a web order (see tests/orders happy path)
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row).toMatchObject({
      status: "new",
      mode: "delivery",
      phone: "+40740999888",
      clientIp: TURN_IP,
      addressStreet: "Str. Teilor 5",
      estimateMinutes: 60,
      subtotalBani: 2200,
      sgrBani: 100,
      deliveryFeeBani: 2000,
      totalBani: 4300,
    });
    expect(row.zoneId).not.toBeNull();
    const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    expect(itemRows).toHaveLength(1);
    expect(itemRows[0]).toMatchObject({
      productName: "Heineken 0,5 L",
      quantity: 2,
      unitPriceBani: 1100,
      lineTotalBani: 2300,
    });
    const optionRows = await db
      .select()
      .from(orderItemOptions)
      .where(eq(orderItemOptions.orderItemId, itemRows[0].id));
    expect(optionRows).toHaveLength(1);
    expect(optionRows[0]).toMatchObject({ toppingName: "Garanție SGR", priceBani: 0, sgrDepositBani: 50 });

    // the model saw PlaceOrderResult verbatim; the transcript has exactly one place_order
    expect(parseToolResult(fake2.calls[1])).toMatchObject({
      ok: true,
      order: { orderId, orderNumber: `#${orderId}`, totalBani: 4300 },
    });
    const rows2 = await getConversationMessages(turn2.conversationId);
    const placeOrderRows = rows2.filter(
      (row) => row.role === "tool" && "name" in row.content && row.content.name === "place_order",
    );
    expect(placeOrderRows).toHaveLength(1);
  });

  it("refusal reasons round-trip verbatim and nothing is placed", async () => {
    const countBefore = (await ordersPlacedByThisSuite()).length;
    // card at the restaurant is not a delivery payment method → invalid_order
    const fake = new FakeLlmProvider([
      toolCalls([
        {
          id: "call_bad",
          name: "place_order",
          input: await deliveryOrderInput({ paymentMethod: "card_restaurant" }),
        },
      ]),
      reply("La livrare se poate plăti numerar sau cu cardul la curier."),
    ]);
    const turn = await runTurn(fake, "confirm, cu cardul la restaurant", [], undefined, { now: OPEN_NOW });

    const result = parseToolResult(fake.calls[1]) as {
      ok: boolean;
      error?: string;
      reasons?: { code: string }[];
    };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_order");
    expect(result.reasons!.map(({ code }) => code)).toContain("payment_not_allowed_for_mode");
    // a refusal is a NORMAL result the model relays — not a tool error
    const lastEntry = fake.calls[1].messages[fake.calls[1].messages.length - 1];
    if (lastEntry.role !== "tool_results") throw new Error("expected tool_results");
    expect(lastEntry.results[0].isError).toBeUndefined();

    expect(turn.placedOrder).toBeNull();
    expect(await ordersPlacedByThisSuite()).toHaveLength(countBefore);
  });

  it("answers malformed place_order input with a tool error, nothing placed", async () => {
    const countBefore = (await ordersPlacedByThisSuite()).length;
    const fake = new FakeLlmProvider([
      toolCalls([{ id: "call_junk", name: "place_order", input: { mode: "delivery" } }]),
      reply("Îmi mai trebuie produsele și datele dumneavoastră."),
    ]);
    const turn = await runTurn(fake, "plasează comanda", [], undefined, { now: OPEN_NOW });

    const lastEntry = fake.calls[1].messages[fake.calls[1].messages.length - 1];
    if (lastEntry.role !== "tool_results") throw new Error("expected tool_results");
    expect(lastEntry.results[0].isError).toBe(true);
    expect(turn.placedOrder).toBeNull();
    expect(await ordersPlacedByThisSuite()).toHaveLength(countBefore);
  });
});

// --- T06 — limits, degradation, retention, observability ----------------------

/** Seeds N role-user rows — the fixture for the 40/conversation and 60/IP/day caps. */
async function seedUserMessages(conversationId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await appendMessage({ conversationId, role: "user", content: { text: `mesaj ${i + 1}` } });
  }
}

async function conversationIdsForIp(clientIp: string): Promise<string[]> {
  const rows = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(eq(assistantConversations.clientIp, clientIp));
  return rows.map(({ id }) => id);
}

describe.skipIf(skipDb)("T06 — anti-abuse limits", () => {
  it("refuses an over-long message before persisting anything or calling the provider", async () => {
    const ip = "203.0.113.71";
    const fake = new FakeLlmProvider([]);

    const result = await runAssistantTurn(fake, {
      message: "a".repeat(MAX_MESSAGE_LENGTH + 1),
      cart: [],
      clientIp: ip,
    });

    expect(result).toEqual({ ok: false, error: "message_too_long" });
    expect(fake.calls).toHaveLength(0);
    // nothing persisted: no conversation was opened for the refused turn
    expect(await conversationIdsForIp(ip)).toEqual([]);
  });

  it("allows user message 40 and refuses message 41 (conversation_limit)", async () => {
    const ip = "203.0.113.72";
    const conversation = await newConversation(ip);
    await seedUserMessages(conversation.id, MAX_USER_MESSAGES_PER_CONVERSATION - 1);

    const atLimit = await runAssistantTurn(new FakeLlmProvider([reply("Sigur!")]), {
      conversationId: conversation.id,
      message: "mai am o întrebare",
      cart: [],
      clientIp: ip,
    });
    expect(atLimit.ok).toBe(true);

    const fake = new FakeLlmProvider([]);
    const refused = await runAssistantTurn(fake, {
      conversationId: conversation.id,
      message: "și încă una",
      cart: [],
      clientIp: ip,
    });

    expect(refused).toEqual({ ok: false, error: "conversation_limit" });
    expect(fake.calls).toHaveLength(0);
    // the refused message was never stored — the cap cannot overshoot
    expect(await countUserMessages(conversation.id)).toBe(MAX_USER_MESSAGES_PER_CONVERSATION);
  });

  it("counts the daily cap per IP across conversations and refuses message 61 (daily_limit)", async () => {
    const ip = "203.0.113.73";
    const first = await newConversation(ip);
    const second = await newConversation(ip);
    await seedUserMessages(first.id, 30);
    await seedUserMessages(second.id, MAX_USER_MESSAGES_PER_IP_PER_DAY - 30 - 1);

    const atLimit = await runAssistantTurn(new FakeLlmProvider([reply("Da!")]), {
      conversationId: second.id,
      message: "ultima pe azi",
      cart: [],
      clientIp: ip,
    });
    expect(atLimit.ok).toBe(true);

    const fake = new FakeLlmProvider([]);
    const refused = await runAssistantTurn(fake, { message: "încă una", cart: [], clientIp: ip });

    expect(refused).toEqual({ ok: false, error: "daily_limit" });
    expect(fake.calls).toHaveLength(0);
    // the refused turn opened no conversation for this IP
    expect(await conversationIdsForIp(ip)).toHaveLength(2);

    // an unrelated visitor is unaffected by someone else's cap
    const other = await runAssistantTurn(new FakeLlmProvider([reply("Bună!")]), {
      message: "salut",
      cart: [],
      clientIp: "203.0.113.74",
    });
    expect(other.ok).toBe(true);
    if (other.ok) createdConversationIds.push(other.conversationId);
  });
});

describe.skipIf(skipDb)("T06 — provider degradation", () => {
  it("lets LlmUnavailableError escape after persisting the user message", async () => {
    const ip = "203.0.113.75";
    const down: LlmProvider = {
      async complete() {
        throw new LlmUnavailableError("simulated outage");
      },
    };

    await expect(
      runAssistantTurn(down, { message: "mai livrați azi?", cart: [], clientIp: ip }),
    ).rejects.toBeInstanceOf(LlmUnavailableError);

    // the audit trail survives the outage: conversation + user row exist
    const ids = await conversationIdsForIp(ip);
    expect(ids).toHaveLength(1);
    createdConversationIds.push(ids[0]);
    const rows = await getConversationMessages(ids[0]);
    expect(rows.map(({ role }) => role)).toEqual(["user"]);
    expect(rows[0].content).toEqual({ text: "mai livrați azi?" });
  });
});

describe.skipIf(skipDb)("T06 — retention rides on conversation create", () => {
  it("reaps idle conversations on create, never on turns of existing conversations", async () => {
    const stale = await newConversation(IP_A);
    await backdateConversation(stale.id, RETENTION_DAYS + 1);
    const active = await newConversation(IP_A);

    // a turn on an EXISTING conversation does not run the reaper
    const existingTurn = await runAssistantTurn(new FakeLlmProvider([reply("Bună!")]), {
      conversationId: active.id,
      message: "salut",
      cart: [],
      clientIp: IP_A,
    });
    expect(existingTurn.ok).toBe(true);
    expect(await getConversation(stale.id)).not.toBeNull();

    // a turn that CREATES a conversation reaps the idle one first
    const freshTurn = await runAssistantTurn(new FakeLlmProvider([reply("Bună!")]), {
      message: "salut",
      cart: [],
      clientIp: IP_A,
    });
    expect(freshTurn.ok).toBe(true);
    if (freshTurn.ok) createdConversationIds.push(freshTurn.conversationId);
    expect(await getConversation(stale.id)).toBeNull();
  });
});

describe.skipIf(skipDb)("T06 — structured turn log", () => {
  it("emits one parseable line with outcome, rounds, tools and token totals", async () => {
    const logSpy = vi.spyOn(console, "log");
    try {
      const fake = new FakeLlmProvider([
        toolCalls([{ id: "call_s", name: "get_schedule", input: {} }], usage(300, 15)),
        reply("Suntem deschiși până la 22:00.", usage(700, 30)),
      ]);
      const turn = await runTurn(fake, "până la ce oră sunteți deschiși?");

      const lines = logSpy.mock.calls
        .map((args) => String(args[0]))
        .filter((line) => line.startsWith("service=assistant") && line.includes(turn.conversationId));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("outcome=reply");
      expect(lines[0]).toContain("rounds=2");
      expect(lines[0]).toContain("tools=get_schedule");
      expect(lines[0]).toContain("tokensIn=1000");
      expect(lines[0]).toContain("tokensOut=45");
      expect(lines[0]).toMatch(/durationMs=\d+/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe.skipIf(skipDb)("T03 — the tool loop is bounded", () => {
  it("stops after 6 provider rounds and replies politely with the phone", async () => {
    // 7 scripted tool rounds — the service must consume at most 6
    const fake = new FakeLlmProvider(
      Array.from({ length: 7 }, (_, i) =>
        toolCalls([{ id: `loop_${i}`, name: "get_schedule", input: {} }]),
      ),
    );

    const turn = await runTurn(fake, "care e orarul?");

    expect(fake.calls).toHaveLength(6);
    expect(turn.reply).toContain(RESTAURANT_PHONE);

    // every persisted tool call has its result, plus the fallback reply:
    // 1 user + 6 × (assistant toolCalls + tool result) + 1 assistant text
    const rows = await getConversationMessages(turn.conversationId);
    expect(rows).toHaveLength(14);
    const lastRow = rows[rows.length - 1];
    expect(lastRow.role).toBe("assistant");
    expect(lastRow.content).toEqual({ text: turn.reply });
  });
});
