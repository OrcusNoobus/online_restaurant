/**
 * feat-008 T07 — POST /api/assistant at the route layer: 400 validation,
 * 200 contract shape, 422 limit mapping, 503 degradation. The Anthropic
 * adapter class is module-mocked so the route runs against the scripted
 * fake provider (03-research D9) — the real adapter is unit-tested in
 * tests/assistant.test.ts (T01), and the missing-key constructor throw
 * lands in the same LlmUnavailableError catch this file exercises.
 */
import { execSync } from "node:child_process";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db/client";
import { assistantConversations } from "@/server/db/schema";
import { type LlmProvider, LlmUnavailableError } from "@/server/llm/provider";
import { appendMessage, createConversation } from "@/server/repositories/assistant";
import { MAX_USER_MESSAGES_PER_CONVERSATION } from "@/server/services/assistant";

import { FakeLlmProvider, reply } from "./helpers/fake-llm";

/** The route news up AnthropicLlmProvider; each test scripts this holder instead. */
const scripted = vi.hoisted(() => ({ current: null as LlmProvider | null }));

vi.mock("@/server/llm/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/llm/anthropic")>();
  class ScriptedProvider implements LlmProvider {
    complete(input: Parameters<LlmProvider["complete"]>[0]) {
      if (!scripted.current) throw new Error("route test forgot to set scripted.current");
      return scripted.current.complete(input);
    }
  }
  return { ...actual, AnthropicLlmProvider: ScriptedProvider };
});

import { POST as postAssistantRoute } from "@/app/api/assistant/route";

const skipDb = process.env.SKIP_DB === "1";

/** TEST-NET-3, unique to this file — counters and cleanup never touch other suites. */
const ROUTE_IP = "203.0.113.201";

beforeAll(() => {
  if (skipDb) return;
  // conversations only — no catalog reads in this file, so no seed needed
  execSync("npm run db:migrate", { stdio: "pipe" });
}, 120_000);

afterAll(async () => {
  if (skipDb) return;
  await db.delete(assistantConversations).where(eq(assistantConversations.clientIp, ROUTE_IP));
});

function assistantRequest(body: unknown): Request {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${ROUTE_IP}, 10.0.0.1` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe.skipIf(skipDb)("POST /api/assistant — 400 validation", () => {
  it("rejects invalid JSON and shape violations without touching the provider", async () => {
    const fake = new FakeLlmProvider([]);
    scripted.current = fake;

    const invalidJson = await postAssistantRoute(assistantRequest("nu e json"));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toBe("validation");

    const badShapes: unknown[] = [
      {}, // message missing
      { message: "", cart: [] }, // empty
      { message: "   ", cart: [] }, // whitespace only — trim applies first
      { message: "a".repeat(501), cart: [] }, // zod cap answers before the service 422
      { message: "salut" }, // cart missing
      { message: "salut", cart: [{ productId: 0 }] }, // junk cart line
      // malformed id is a shape violation — it protects the uuid column cast
      { message: "salut", cart: [], conversationId: "nu-e-uuid" },
    ];
    for (const body of badShapes) {
      const response = await postAssistantRoute(assistantRequest(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("validation");
    }

    expect(fake.calls).toHaveLength(0);
  });
});

describe.skipIf(skipDb)("POST /api/assistant — 200 contract shape", () => {
  it("returns the contract keys, stores the forwarded IP, and continues the conversation", async () => {
    scripted.current = new FakeLlmProvider([reply("Bună! Cu ce vă pot ajuta?")]);
    const response = await postAssistantRoute(assistantRequest({ message: "salut", cart: [] }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["cart", "conversationId", "placedOrder", "quote", "reply"]);
    expect(body.reply).toBe("Bună! Cu ce vă pot ajuta?");
    expect(body.cart).toEqual([]);
    expect(body.quote).toBeNull();
    expect(body.placedOrder).toBeNull();

    // route wiring: the FIRST x-forwarded-for hop landed on the conversation
    const [row] = await db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.id, body.conversationId));
    expect(row.clientIp).toBe(ROUTE_IP);

    // the returned id continues the same conversation on the next call
    scripted.current = new FakeLlmProvider([reply("Sigur!")]);
    const second = await postAssistantRoute(
      assistantRequest({ conversationId: body.conversationId, message: "mai ești?", cart: [] }),
    );
    expect(second.status).toBe(200);
    expect((await second.json()).conversationId).toBe(body.conversationId);
  });

  it("treats a valid-but-unknown conversationId as a new conversation, not an error", async () => {
    scripted.current = new FakeLlmProvider([reply("Bună!")]);
    const ghost = "00000000-0000-4000-8000-00000000c0de";
    const response = await postAssistantRoute(
      assistantRequest({ conversationId: ghost, message: "salut", cart: [] }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).conversationId).not.toBe(ghost);
  });

  it("wires ASSISTANT_MAX_REPLY_TOKENS from the env into the provider call", async () => {
    vi.stubEnv("ASSISTANT_MAX_REPLY_TOKENS", "512");
    try {
      const fake = new FakeLlmProvider([reply("Ok.")]);
      scripted.current = fake;
      await postAssistantRoute(assistantRequest({ message: "salut", cart: [] }));
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0].maxTokens).toBe(512);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe.skipIf(skipDb)("POST /api/assistant — 422 limit mapping", () => {
  it("maps a service refusal to 422 {error} without calling the provider", async () => {
    const fake = new FakeLlmProvider([]);
    scripted.current = fake;

    const conversation = await createConversation(ROUTE_IP);
    for (let i = 0; i < MAX_USER_MESSAGES_PER_CONVERSATION; i++) {
      await appendMessage({ conversationId: conversation.id, role: "user", content: { text: `mesaj ${i + 1}` } });
    }

    const response = await postAssistantRoute(
      assistantRequest({ conversationId: conversation.id, message: "încă una", cart: [] }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "conversation_limit" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe.skipIf(skipDb)("POST /api/assistant — 503 degradation", () => {
  it("answers 503 assistant_unavailable when the provider throws LlmUnavailableError", async () => {
    scripted.current = {
      async complete() {
        throw new LlmUnavailableError("simulated outage");
      },
    };
    const response = await postAssistantRoute(assistantRequest({ message: "mai livrați?", cart: [] }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "assistant_unavailable" });
  });
});
