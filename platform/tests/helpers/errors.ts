import { expect } from 'vitest';

/**
 * Drizzle wraps a driver error in a generic "Failed query" error and keeps the
 * database's own message on `cause`. These helpers look through that chain, so
 * assertions test what Postgres actually said rather than the wrapper.
 */
export function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current && chain.length < 10) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

export function errorMatches(error: unknown, pattern: RegExp): boolean {
  return causeChain(error).some((link) => {
    const message = (link as { message?: unknown }).message;
    return typeof message === 'string' && pattern.test(message);
  });
}

export function errorHasCode(error: unknown, code: string): boolean {
  return causeChain(error).some((link) => (link as { code?: unknown }).code === code);
}

/** Asserts that a database operation was refused by the append-only guard. */
export async function expectAppendOnlyRefusal(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(
      errorMatches(error, /append-only/i),
      `expected an append-only refusal, got: ${describe(error)}`,
    ).toBe(true);
    return;
  }
  throw new Error('expected the operation to be refused, but it succeeded');
}

/** Asserts that a database operation was refused by a constraint. */
export async function expectConstraintRefusal(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error('expected the operation to be refused, but it succeeded');
}

function describe(error: unknown): string {
  return causeChain(error)
    .map((link) => String((link as { message?: unknown }).message ?? link))
    .join(' <- ');
}
