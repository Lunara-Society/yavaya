import 'server-only';
import { cookies } from 'next/headers';
import { TWO_STEP_RULES } from '@/config/business-rules';
import { serverEnv } from '@/config/env';
import { seal, unseal } from './sealed';

/**
 * The two cookies of two-step sign-in, both sealed and httpOnly.
 *
 *   pending — someone passed the password (or Google) for an account with
 *             two-step on; no session exists yet, only this, for a few minutes
 *   setup   — the new secret while the member scans it and types the first
 *             code; tied to their account, so it cannot be planted on another
 *
 * Sealed means signed, not hidden. That is fine for both: the pending one
 * names an account its holder already proved they can reach, and the setup
 * secret is the one the member is looking at on the screen.
 */
const PENDING = 'yav_2step';
const SETUP = 'yav_2step_setup';

const base = () => ({ httpOnly: true, secure: serverEnv().APP_ENV !== 'local', sameSite: 'lax' as const, path: '/' });

export type PendingSecondStep = { userId: string; to: string; google?: string };

export async function holdSecondStep(pending: PendingSecondStep): Promise<void> {
  const ttl = TWO_STEP_RULES.pendingMinutes * 60;
  (await cookies()).set(PENDING, seal('two-step-pending', pending, ttl), { ...base(), maxAge: ttl });
}

export async function readSecondStep(): Promise<PendingSecondStep | null> {
  return unseal<PendingSecondStep>('two-step-pending', (await cookies()).get(PENDING)?.value);
}

export async function dropSecondStep(): Promise<void> {
  (await cookies()).delete(PENDING);
}

export async function holdSetup(userId: string, secret: string): Promise<void> {
  const ttl = TWO_STEP_RULES.setupMinutes * 60;
  (await cookies()).set(SETUP, seal('two-step-setup', { userId, secret }, ttl), { ...base(), maxAge: ttl });
}

/** The secret being set up, only for the account it was made for. */
export async function readSetup(userId: string): Promise<string | null> {
  const value = unseal<{ userId: string; secret: string }>('two-step-setup', (await cookies()).get(SETUP)?.value);
  return value && value.userId === userId ? value.secret : null;
}

export async function dropSetup(): Promise<void> {
  (await cookies()).delete(SETUP);
}
