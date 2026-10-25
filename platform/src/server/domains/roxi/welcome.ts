import 'server-only';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { roxiWelcomePlays, userRoles, users } from '@/server/db/schema';
import { ROXI_RULES } from '@/config/business-rules';
import { operationalEnv } from '@/config/env';
import { canonicalEmail } from '@/server/domains/identity/normalize';
import { getSetting } from '@/server/domains/platform/settings';

/**
 * Roxi's welcome voice notes: a short recorded message in Roxi's voice, for
 * exactly two people, on their next two logins, ten seconds after they sign
 * in (the owner's request, October 2026).
 *
 * Who hears one is decided here, on the server, from the account itself:
 *
 * - `community_manager` — the holder of an active community manager role
 *   whose first name is Tania. The note says her name, so the role alone is
 *   not enough: whoever else is appointed later must not hear it.
 * - `owner` — the bootstrap administrator: the account at PRIMARY_ADMIN_EMAIL
 *   that also holds the admin role. The address only picks out *which* admin
 *   is greeted; it grants nothing, and without the role there is no note.
 *
 * Nothing the browser sends can change the answer, and the audio route asks
 * this module again before serving a byte.
 */

export const WELCOME_KEYS = ['community_manager', 'owner'] as const;
export type WelcomeKey = (typeof WELCOME_KEYS)[number];

/** First name the community manager's note is recorded for. */
const COMMUNITY_MANAGER_FIRST_NAME = 'tania';

export type WelcomeRules = { plays: number; delaySeconds: number; windowMinutes: number };

export async function welcomeRules(executor: Executor): Promise<WelcomeRules> {
  const [plays, delaySeconds, windowMinutes] = await Promise.all([
    getSetting(executor, 'roxi.welcome_plays', ROXI_RULES.welcomePlays),
    getSetting(executor, 'roxi.welcome_delay_seconds', ROXI_RULES.welcomeDelaySeconds),
    getSetting(executor, 'roxi.welcome_login_window_minutes', ROXI_RULES.welcomeLoginWindowMinutes),
  ]);
  return { plays, delaySeconds, windowMinutes };
}

/** Case and accents folded, so "TANIA", "Tanía" and "tania" are the same first name. */
export function firstNameFolded(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  return first.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Which welcome, if any, this account is the recipient of. */
export async function welcomeAudience(executor: Executor, userId: string, now = new Date()): Promise<WelcomeKey | null> {
  const [person] = await executor
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!person) return null;

  const held = await executor
    .select({ roleKey: userRoles.roleKey })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.scope, 'global'),
        isNull(userRoles.revokedAt),
        inArray(userRoles.roleKey, ['admin', 'community_manager']),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)),
      ),
    );
  const roles = new Set(held.map((row) => row.roleKey));

  if (roles.has('admin') && canonicalEmail(person.email) === canonicalEmail(operationalEnv().PRIMARY_ADMIN_EMAIL)) return 'owner';
  if (roles.has('community_manager') && firstNameFolded(person.displayName) === COMMUNITY_MANAGER_FIRST_NAME) return 'community_manager';
  return null;
}

export type PendingWelcome = {
  key: WelcomeKey;
  /** Which of the recordings: the first login hears the first one. */
  variant: number;
  /** Milliseconds from now until Roxi speaks: the rest of the wait after signing in. */
  delayMs: number;
};

/**
 * The welcome this login should play, or null.
 *
 * A login counts while it is fresh (inside the window after signing in) and
 * while fewer than `plays` logins have been welcomed. The same login asking
 * again — a reload, another tab — gets the same note until it is played.
 */
export async function pendingWelcome(
  executor: Executor,
  session: { userId: string; sessionId: string; createdAt: Date },
  now = new Date(),
): Promise<PendingWelcome | null> {
  const rules = await welcomeRules(executor);
  if (now.getTime() - session.createdAt.getTime() > rules.windowMinutes * 60_000) return null;
  const key = await welcomeAudience(executor, session.userId, now);
  if (!key) return null;
  const found = await welcomeVariant(executor, session, key, rules.plays);
  // Played (or dismissed) on this login already: it is not offered again by itself.
  if (!found || found.played) return null;
  return { key, variant: found.variant, delayMs: Math.max(0, session.createdAt.getTime() + rules.delaySeconds * 1000 - now.getTime()) };
}

/**
 * Which recording this login hears: one more than the logins welcomed before
 * it. A login already welcomed keeps its own number, so a replay on the same
 * login is the same note; past the limit there is none.
 */
async function welcomeVariant(
  executor: Executor,
  session: { userId: string; sessionId: string },
  key: WelcomeKey,
  plays: number,
): Promise<{ variant: number; played: boolean } | null> {
  const rows = await executor
    .select({ sessionId: roxiWelcomePlays.sessionId })
    .from(roxiWelcomePlays)
    .where(and(eq(roxiWelcomePlays.userId, session.userId), eq(roxiWelcomePlays.welcomeKey, key)))
    .orderBy(roxiWelcomePlays.playedAt);
  const own = rows.findIndex((row) => row.sessionId === session.sessionId);
  if (own >= 0) return own < plays ? { variant: own + 1, played: true } : null;
  return rows.length < plays ? { variant: rows.length + 1, played: false } : null;
}

/**
 * The recording this login may fetch: the pending one, or the one it already
 * played (so the member can listen again on the same login). Null for anyone
 * else, and for a login that is neither.
 */
export async function welcomeRecording(
  executor: Executor,
  session: { userId: string; sessionId: string; createdAt: Date },
  now = new Date(),
): Promise<{ key: WelcomeKey; variant: number } | null> {
  const key = await welcomeAudience(executor, session.userId, now);
  if (!key) return null;
  const rules = await welcomeRules(executor);
  const found = await welcomeVariant(executor, session, key, rules.plays);
  if (!found) return null;
  // A fresh login may fetch its note; an old one only the note it already played.
  if (!found.played && now.getTime() - session.createdAt.getTime() > rules.windowMinutes * 60_000) return null;
  return { key, variant: found.variant };
}

/**
 * Records that this login's note was played or dismissed, and says whether
 * this call was the one that recorded it. Idempotent on the login: the second
 * call for the same session changes nothing and returns false. Only the
 * recipient of a pending note can record one.
 */
export async function recordWelcomePlayed(
  executor: Executor,
  session: { userId: string; sessionId: string; createdAt: Date },
  now = new Date(),
): Promise<boolean> {
  const pending = await pendingWelcome(executor, session, now);
  if (!pending) return false;
  // Two tabs can report the same login at once; only the row that lands counts.
  const inserted = await executor
    .insert(roxiWelcomePlays)
    .values({ userId: session.userId, sessionId: session.sessionId, welcomeKey: pending.key, playedAt: now })
    .onConflictDoNothing()
    .returning({ sessionId: roxiWelcomePlays.sessionId });
  return inserted.length > 0;
}

/** How many logins have heard their note (for tests and the owner's curiosity). */
export async function welcomesPlayed(executor: Executor, userId: string): Promise<number> {
  const [row] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(roxiWelcomePlays)
    .where(eq(roxiWelcomePlays.userId, userId));
  return row?.n ?? 0;
}
