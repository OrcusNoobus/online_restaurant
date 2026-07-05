/**
 * Assistant conversation + transcript SQL (004 05-data-model.md). Pure data
 * access — the anti-abuse thresholds (40/conversation, 60/IP/day) and the
 * 30-day retention policy live in the assistant service; this file only
 * counts and deletes what it is told to. Time math runs DB-side (now(),
 * make_interval) so app and DB clocks cannot disagree.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { type AssistantMessageContent, assistantConversations, assistantMessages } from "../db/schema";

export type { AssistantMessageContent };

export type AssistantMessageRole = "user" | "assistant" | "tool";

export interface AssistantConversationRow {
  id: string;
  clientIp: string;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface AssistantMessageRow {
  id: number;
  role: AssistantMessageRole;
  content: AssistantMessageContent;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: Date;
}

export interface NewAssistantMessage {
  conversationId: string;
  role: AssistantMessageRole;
  content: AssistantMessageContent;
  /** Provider-reported usage for the turn — assistant rows only. */
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/** Issues the server-side conversation id (uuid = the transcript's access token). */
export async function createConversation(clientIp: string): Promise<AssistantConversationRow> {
  const [row] = await db.insert(assistantConversations).values({ clientIp }).returning();
  return row;
}

export async function getConversation(conversationId: string): Promise<AssistantConversationRow | null> {
  const rows = await db
    .select()
    .from(assistantConversations)
    .where(eq(assistantConversations.id, conversationId));
  return rows[0] ?? null;
}

/** Full transcript in insertion order — the provider replay + audit read. */
export async function getConversationMessages(conversationId: string): Promise<AssistantMessageRow[]> {
  return db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      inputTokens: assistantMessages.inputTokens,
      outputTokens: assistantMessages.outputTokens,
      createdAt: assistantMessages.createdAt,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(asc(assistantMessages.id));
}

/**
 * One transaction: insert the transcript row + bump the conversation's
 * last_activity_at (the retention clock — an active conversation must
 * never be reaped mid-chat).
 */
export async function appendMessage(message: NewAssistantMessage): Promise<number> {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(assistantMessages)
      .values({
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        inputTokens: message.inputTokens ?? null,
        outputTokens: message.outputTokens ?? null,
      })
      .returning({ id: assistantMessages.id });

    await tx
      .update(assistantConversations)
      .set({ lastActivityAt: sql`now()` })
      .where(eq(assistantConversations.id, message.conversationId));

    return id;
  });
}

/** Feeds the ≤ 40-user-messages-per-conversation limit. */
export async function countUserMessages(conversationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .where(and(eq(assistantMessages.conversationId, conversationId), eq(assistantMessages.role, "user")));
  return row.count;
}

/** Feeds the ≤ 60-user-messages-per-IP-per-24h limit, across conversations. */
export async function countUserMessagesForIpLast24h(clientIp: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .innerJoin(assistantConversations, eq(assistantMessages.conversationId, assistantConversations.id))
    .where(
      and(
        eq(assistantConversations.clientIp, clientIp),
        eq(assistantMessages.role, "user"),
        sql`${assistantMessages.createdAt} > now() - interval '24 hours'`,
      ),
    );
  return row.count;
}

/**
 * Retention (004 research D6): drop conversations idle for more than
 * `days`; messages go with them via CASCADE. Returns how many were
 * deleted, for the structured log line.
 */
export async function deleteConversationsOlderThan(days: number): Promise<number> {
  const deleted = await db
    .delete(assistantConversations)
    .where(sql`${assistantConversations.lastActivityAt} < now() - make_interval(days => ${days})`)
    .returning({ id: assistantConversations.id });
  return deleted.length;
}
