/** POST /api/assistant — contract: harness/specs/004-asistent-ai/06-contracts/api.md */
import { assistantRequestSchema } from "@/lib/assistant-schemas";
import { AnthropicLlmProvider } from "@/server/llm/anthropic";
import { type LlmProvider, LlmUnavailableError } from "@/server/llm/provider";
import { runAssistantTurn } from "@/server/services/assistant";

/**
 * First hop of x-forwarded-for, or "unknown" — never trusted from the
 * body. The daily limit needs SOME bucket even without a proxy header
 * (dev, misconfiguration): unidentifiable visitors share one cap rather
 * than getting none (assistant_conversations.client_ip is NOT NULL).
 */
function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** 06-contracts env: optional reply-token cap; garbage falls back to the code default. */
function maxReplyTokensFromEnv(): number | undefined {
  const parsed = Number(process.env.ASSISTANT_MAX_REPLY_TOKENS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Constructed lazily so the service's anti-abuse checks run before the
 * key is even looked at: a capped visitor gets the accurate 422 also
 * while the assistant is unconfigured or down. A missing key surfaces on
 * first use as LlmUnavailableError → 503, through the service's turn log.
 */
function lazyAnthropicProvider(): LlmProvider {
  let provider: LlmProvider | null = null;
  return {
    complete(input) {
      provider ??= new AnthropicLlmProvider();
      return provider.complete(input);
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }

    const parsed = assistantRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/assistant status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await runAssistantTurn(
      lazyAnthropicProvider(),
      {
        conversationId: parsed.data.conversationId,
        message: parsed.data.message,
        cart: parsed.data.cart,
        clientIp: clientIpFrom(request),
      },
      { maxReplyTokens: maxReplyTokensFromEnv() },
    );

    if (!result.ok) {
      console.log(`route=/api/assistant status=${result.error} durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: result.error }, { status: 422 });
    }

    console.log(
      `route=/api/assistant status=ok conversationId=${result.conversationId} ` +
        `placedOrder=${result.placedOrder ? result.placedOrder.orderId : "-"} durationMs=${Date.now() - startedAt}`,
    );
    // contract shape — quote/placedOrder keys are always present, possibly null
    return Response.json({
      conversationId: result.conversationId,
      reply: result.reply,
      cart: result.cart,
      quote: result.quote,
      placedOrder: result.placedOrder,
    });
  } catch (error) {
    if (error instanceof LlmUnavailableError) {
      // expected degradation (missing key / provider outage) — the shop is unaffected
      console.log(`route=/api/assistant status=assistant_unavailable durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "assistant_unavailable" }, { status: 503 });
    }
    console.error(`route=/api/assistant status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
