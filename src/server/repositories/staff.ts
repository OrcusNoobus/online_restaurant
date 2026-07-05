/**
 * Staff users + sessions SQL (003-panou-admin/05-data-model.md).
 * Sessions store only the SHA-256 of the cookie token — the auth service owns
 * token generation, hashing and every business rule; this file is queries only.
 */
import { eq, lt } from "drizzle-orm";

import { db } from "../db/client";
import { staffSessions, staffUsers } from "../db/schema";

export type StaffRole = "admin" | "staff";

export interface StaffUserRow {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  role: StaffRole;
  active: boolean;
}

const userColumns = {
  id: staffUsers.id,
  username: staffUsers.username,
  displayName: staffUsers.displayName,
  passwordHash: staffUsers.passwordHash,
  role: staffUsers.role,
  active: staffUsers.active,
};

/** Lookup is by the stored (lowercase) username — callers normalize first. */
export async function findUserByUsername(username: string): Promise<StaffUserRow | null> {
  const rows = await db.select(userColumns).from(staffUsers).where(eq(staffUsers.username, username));
  return rows[0] ?? null;
}

export interface NewStaffUser {
  username: string;
  displayName: string;
  passwordHash: string;
  role: StaffRole;
}

export async function createUser(user: NewStaffUser): Promise<number> {
  const [row] = await db.insert(staffUsers).values(user).returning({ id: staffUsers.id });
  return row.id;
}

export interface StaffSessionRow {
  id: number;
  expiresAt: Date;
  lastUsedAt: Date;
  user: StaffUserRow;
}

export async function createSession(tokenHash: string, staffUserId: number, expiresAt: Date): Promise<void> {
  await db.insert(staffSessions).values({ tokenHash, staffUserId, expiresAt });
}

export async function findSessionByTokenHash(tokenHash: string): Promise<StaffSessionRow | null> {
  const rows = await db
    .select({
      id: staffSessions.id,
      expiresAt: staffSessions.expiresAt,
      lastUsedAt: staffSessions.lastUsedAt,
      user: userColumns,
    })
    .from(staffSessions)
    .innerJoin(staffUsers, eq(staffSessions.staffUserId, staffUsers.id))
    .where(eq(staffSessions.tokenHash, tokenHash));
  return rows[0] ?? null;
}

/** Rolling 7-day expiry: the auth service decides when; this just writes it. */
export async function renewSession(sessionId: number, expiresAt: Date, lastUsedAt: Date): Promise<void> {
  await db.update(staffSessions).set({ expiresAt, lastUsedAt }).where(eq(staffSessions.id, sessionId));
}

export async function deleteSessionById(sessionId: number): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.id, sessionId));
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.tokenHash, tokenHash));
}

/** User deactivation revokes every device (003 05-data-model Lifecycle). */
export async function deleteSessionsForUser(staffUserId: number): Promise<void> {
  await db.delete(staffSessions).where(eq(staffSessions.staffUserId, staffUserId));
}

/** Expired rows are swept opportunistically on login and failed lookups. */
export async function sweepExpiredSessions(now: Date): Promise<void> {
  await db.delete(staffSessions).where(lt(staffSessions.expiresAt, now));
}
