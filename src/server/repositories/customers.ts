/**
 * Customer accounts + sessions SQL (005-conturi-clienti/05-data-model.md).
 * Sessions store only the SHA-256 of the cookie token — the customer-auth
 * service owns token generation, hashing and every business rule; this file
 * is queries only. Callers normalize email (lowercase) and phone (+40…)
 * BEFORE these functions — the DB stores one canonical spelling of each.
 */
import { eq, lt } from "drizzle-orm";

import { db } from "../db/client";
import { customers, customerSessions } from "../db/schema";

export interface CustomerRow {
  id: number;
  email: string;
  passwordHash: string | null;
  googleSub: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  addressStreet: string | null;
  zoneId: number | null;
  termsAcceptedAt: Date;
}

const customerColumns = {
  id: customers.id,
  email: customers.email,
  passwordHash: customers.passwordHash,
  googleSub: customers.googleSub,
  firstName: customers.firstName,
  lastName: customers.lastName,
  phone: customers.phone,
  addressStreet: customers.addressStreet,
  zoneId: customers.zoneId,
  termsAcceptedAt: customers.termsAcceptedAt,
};

export async function findCustomerById(id: number): Promise<CustomerRow | null> {
  const rows = await db.select(customerColumns).from(customers).where(eq(customers.id, id));
  return rows[0] ?? null;
}

/** Lookup is by the stored (lowercase) email — callers normalize first. */
export async function findCustomerByEmail(email: string): Promise<CustomerRow | null> {
  const rows = await db.select(customerColumns).from(customers).where(eq(customers.email, email));
  return rows[0] ?? null;
}

export async function findCustomerByGoogleSub(googleSub: string): Promise<CustomerRow | null> {
  const rows = await db.select(customerColumns).from(customers).where(eq(customers.googleSub, googleSub));
  return rows[0] ?? null;
}

export interface NewCustomer {
  email: string;
  passwordHash?: string | null;
  googleSub?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  termsAcceptedAt: Date;
}

export async function createCustomer(customer: NewCustomer): Promise<number> {
  const [row] = await db.insert(customers).values(customer).returning({ id: customers.id });
  return row.id;
}

/** Profile fields only — email/credentials never travel through here. */
export interface CustomerProfilePatch {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  addressStreet?: string | null;
  zoneId?: number | null;
}

export async function updateCustomerProfile(id: number, patch: CustomerProfilePatch): Promise<void> {
  await db.update(customers).set(patch).where(eq(customers.id, id));
}

/** D-e linking: a verified Google email matched an existing account. */
export async function setCustomerGoogleSub(id: number, googleSub: string): Promise<void> {
  await db.update(customers).set({ googleSub }).where(eq(customers.id, id));
}

/** Operator CLI path (Q4 phone recovery) — never called from a route. */
export async function setCustomerPasswordHash(id: number, passwordHash: string): Promise<void> {
  await db.update(customers).set({ passwordHash }).where(eq(customers.id, id));
}

export interface CustomerSessionRow {
  id: number;
  expiresAt: Date;
  lastUsedAt: Date;
  customer: CustomerRow;
}

export async function createCustomerSession(
  tokenHash: string,
  customerId: number,
  expiresAt: Date,
): Promise<void> {
  await db.insert(customerSessions).values({ tokenHash, customerId, expiresAt });
}

export async function findCustomerSessionByTokenHash(
  tokenHash: string,
): Promise<CustomerSessionRow | null> {
  const rows = await db
    .select({
      id: customerSessions.id,
      expiresAt: customerSessions.expiresAt,
      lastUsedAt: customerSessions.lastUsedAt,
      customer: customerColumns,
    })
    .from(customerSessions)
    .innerJoin(customers, eq(customerSessions.customerId, customers.id))
    .where(eq(customerSessions.tokenHash, tokenHash));
  return rows[0] ?? null;
}

/** Rolling 30-day expiry: the auth service decides when; this just writes it. */
export async function renewCustomerSession(
  sessionId: number,
  expiresAt: Date,
  lastUsedAt: Date,
): Promise<void> {
  await db.update(customerSessions).set({ expiresAt, lastUsedAt }).where(eq(customerSessions.id, sessionId));
}

export async function deleteCustomerSessionById(sessionId: number): Promise<void> {
  await db.delete(customerSessions).where(eq(customerSessions.id, sessionId));
}

export async function deleteCustomerSessionByTokenHash(tokenHash: string): Promise<void> {
  await db.delete(customerSessions).where(eq(customerSessions.tokenHash, tokenHash));
}

/** Expired rows are swept opportunistically on login and failed lookups. */
export async function sweepExpiredCustomerSessions(now: Date): Promise<void> {
  await db.delete(customerSessions).where(lt(customerSessions.expiresAt, now));
}
