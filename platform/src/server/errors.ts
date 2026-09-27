/**
 * Domain errors.
 *
 * Every error carries an i18n key rather than an English sentence, so nothing
 * user-facing is hard-coded in a language. `expose` marks errors whose detail
 * is safe to show a client; everything else surfaces as a generic failure and
 * is only fully recorded server-side.
 */
export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'risk_blocked'
  | 'insufficient_tokens'
  | 'action_not_billable'
  | 'integration_unconfigured'
  | 'internal';

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly details: Record<string, unknown>;
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    messageKey: string,
    options: { details?: Record<string, unknown>; expose?: boolean; cause?: unknown } = {},
  ) {
    super(`${code}: ${messageKey}`, options.cause ? { cause: options.cause } : undefined);
    this.name = 'DomainError';
    this.code = code;
    this.messageKey = messageKey;
    this.details = options.details ?? {};
    this.expose = options.expose ?? true;
  }
}

export const errors = {
  unauthenticated: () => new DomainError('unauthenticated', 'error.unauthenticated'),
  forbidden: (permission?: string) =>
    new DomainError('forbidden', 'error.forbidden', {
      details: permission ? { permission } : {},
    }),
  notFound: (resource: string) =>
    new DomainError('not_found', 'error.not_found', { details: { resource } }),
  validation: (messageKey: string, details: Record<string, unknown> = {}) =>
    new DomainError('validation_failed', messageKey, { details }),
  conflict: (messageKey: string, details: Record<string, unknown> = {}) =>
    new DomainError('conflict', messageKey, { details }),
  rateLimited: (retryAfterSeconds: number) =>
    new DomainError('rate_limited', 'error.rate_limited', { details: { retryAfterSeconds } }),
  riskBlocked: (assessmentId: string) =>
    // The score and its factors are deliberately not exposed: telling an abuser
    // which signal tripped is telling them what to change.
    new DomainError('risk_blocked', 'error.risk_blocked', {
      details: { assessmentId },
      expose: false,
    }),
  insufficientTokens: (required: number, available: number) =>
    new DomainError('insufficient_tokens', 'error.insufficient_tokens', {
      details: { required, available },
    }),
  actionNotBillable: (actionKey: string) =>
    new DomainError('action_not_billable', 'error.action_not_billable', {
      details: { actionKey },
      expose: false,
    }),
  integrationUnconfigured: (integration: string) =>
    new DomainError('integration_unconfigured', 'error.integration_unconfigured', {
      details: { integration },
    }),
  internal: (detail: string, cause?: unknown) =>
    new DomainError('internal', 'error.internal', { details: { detail }, expose: false, cause }),
};

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

/** Shape returned to a client. Never includes non-exposable detail. */
export function toClientError(error: unknown): {
  code: ErrorCode;
  messageKey: string;
  details: Record<string, unknown>;
} {
  if (isDomainError(error) && error.expose) {
    return { code: error.code, messageKey: error.messageKey, details: error.details };
  }
  if (isDomainError(error)) {
    return { code: error.code, messageKey: error.messageKey, details: {} };
  }
  return { code: 'internal', messageKey: 'error.internal', details: {} };
}
