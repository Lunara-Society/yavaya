import 'server-only';
import { serverEnv } from '@/config/env';
import { generateNumericCode, sha256 } from '@/server/security/crypto';

/**
 * Phone verifiers: the thing that puts a code on a member's phone and, for
 * providers that keep the code themselves, says whether what they typed is it.
 *
 * Two shapes, because providers differ:
 *  - Twilio Verify generates, sends and checks the code. We never see it, so
 *    the challenge row stores no hash and the check goes back to Twilio.
 *  - The console verifier generates the code here, writes it to the server
 *    log, and returns its hash for the challenge row. It sends nothing, so it
 *    is never reported as delivery and never counts as REAL.
 */

export type VerifierAvailability = { available: true; provider: string } | { available: false; provider: string; reason: string };

export type StartOutcome =
  | {
      ok: true;
      provider: string;
      /** Set when the code was generated here and must be checked here. */
      codeHash: string | null;
      /** The console verifier's code, for a local developer only. */
      localCode?: string;
    }
  | { ok: false; reason: 'invalid_number' | 'blocked' | 'unavailable' | 'delivery_failed' };

export type CheckOutcome = 'approved' | 'mismatch' | 'expired' | 'failed';

export interface PhoneVerifier {
  readonly key: string;
  availability(): VerifierAvailability;
  start(params: { to: string; locale: 'es' | 'en' }): Promise<StartOutcome>;
  /** Only called for challenges that stored no hash. */
  check(params: { to: string; code: string }): Promise<CheckOutcome>;
}

/**
 * Twilio Verify over its REST API. No SDK: two form posts with basic auth
 * are the whole integration, and an SDK would be a large dependency for them.
 */
export class TwilioVerifyVerifier implements PhoneVerifier {
  readonly key = 'twilio_verify';

  availability(): VerifierAvailability {
    const env = serverEnv();
    if (env.SMS_PROVIDER !== 'twilio_verify') {
      return { available: false, provider: this.key, reason: `SMS_PROVIDER is "${env.SMS_PROVIDER}", not "twilio_verify".` };
    }
    const missing = (['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'] as const).filter((name) => !env[name]);
    if (missing.length > 0) return { available: false, provider: this.key, reason: `Missing ${missing.join(', ')}.` };
    return { available: true, provider: this.key };
  }

  private async post(path: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const env = serverEnv();
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const response = await fetch(`${env.TWILIO_VERIFY_API_URL}/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body };
  }

  async start(params: { to: string; locale: 'es' | 'en' }): Promise<StartOutcome> {
    if (!this.availability().available) return { ok: false, reason: 'unavailable' };
    let result: Awaited<ReturnType<TwilioVerifyVerifier['post']>>;
    try {
      result = await this.post('Verifications', { To: params.to, Channel: 'sms', Locale: params.locale });
    } catch (error) {
      console.error('phone verification not sent:', error);
      return { ok: false, reason: 'delivery_failed' };
    }
    if (result.status >= 200 && result.status < 300) return { ok: true, provider: this.key, codeHash: null };

    // Twilio's error codes, where they change what the member should hear:
    // 60200 invalid number, 60205 a landline, 60410 a prefix Twilio blocks
    // for SMS-pumping fraud, 60605 a country not enabled on the account.
    const code = Number(result.body?.code);
    if (code === 60200 || code === 60205) return { ok: false, reason: 'invalid_number' };
    if (code === 60410 || code === 60605) return { ok: false, reason: 'blocked' };
    // The body names the problem and never contains the credentials.
    console.error('phone verification not sent:', result.status, JSON.stringify(result.body).slice(0, 300));
    return { ok: false, reason: 'delivery_failed' };
  }

  async check(params: { to: string; code: string }): Promise<CheckOutcome> {
    if (!this.availability().available) return 'failed';
    let result: Awaited<ReturnType<TwilioVerifyVerifier['post']>>;
    try {
      result = await this.post('VerificationCheck', { To: params.to, Code: params.code });
    } catch (error) {
      console.error('phone verification check failed:', error);
      return 'failed';
    }
    if (result.status === 200) return result.body?.status === 'approved' ? 'approved' : 'mismatch';
    // 404: Twilio has no pending verification for the number — it expired,
    // was already used, or ran out of attempts on Twilio's side.
    if (result.status === 404) return 'expired';
    console.error('phone verification check failed:', result.status, JSON.stringify(result.body).slice(0, 300));
    return 'failed';
  }
}

/** For local development: logs the code and sends nothing. */
export class ConsoleVerifier implements PhoneVerifier {
  readonly key = 'console';

  availability(): VerifierAvailability {
    return serverEnv().SMS_PROVIDER === 'console'
      ? { available: true, provider: this.key }
      : { available: false, provider: this.key, reason: 'SMS_PROVIDER is not "console".' };
  }

  async start(params: { to: string }): Promise<StartOutcome> {
    const code = generateNumericCode(6);
    console.info(`[console sms] verification code for ${params.to}: ${code} (not sent)`);
    return { ok: true, provider: this.key, codeHash: sha256(code), localCode: code };
  }

  async check(): Promise<CheckOutcome> {
    // Console challenges always carry a hash and are checked locally.
    return 'failed';
  }
}

const twilio = new TwilioVerifyVerifier();
const consoleVerifier = new ConsoleVerifier();

export function phoneVerifier(): PhoneVerifier | null {
  switch (serverEnv().SMS_PROVIDER) {
    case 'twilio_verify':
      return twilio;
    case 'console':
      return consoleVerifier;
    default:
      return null;
  }
}

export function phoneVerifierAvailability(): VerifierAvailability {
  const verifier = phoneVerifier();
  if (!verifier) {
    return {
      available: false,
      provider: 'unconfigured',
      reason:
        'Set SMS_PROVIDER=twilio_verify with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID. Phone verification cannot complete until then.',
    };
  }
  return verifier.availability();
}

/** True only when a code would really reach a phone. */
export function canVerifyPhones(): boolean {
  const availability = phoneVerifierAvailability();
  return availability.available && availability.provider !== 'console';
}
