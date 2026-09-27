import { describe, expect, it } from 'vitest';
import { usesTransactionPooler } from '@/server/db/client';

/**
 * Connection-pooler detection.
 *
 * This is not cosmetic. Against a transaction-mode pooler, each transaction may
 * land on a different backend, so a server-side prepared statement created on
 * one connection is missing on the next. The failure appears as "prepared
 * statement does not exist" — and typically only under load, once more than one
 * backend is in play, which is the worst time to discover it.
 */
describe('transaction pooler detection', () => {
  it('detects the conventional pooler port', () => {
    expect(usesTransactionPooler('postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres')).toBe(
      true,
    );
  });

  it('detects the pgbouncer flag regardless of port', () => {
    expect(usesTransactionPooler('postgres://u:p@host:5432/db?pgbouncer=true')).toBe(true);
  });

  it('treats a direct connection as unpooled, so prepared statements stay on', () => {
    expect(usesTransactionPooler('postgres://u:p@db.example.supabase.co:5432/postgres')).toBe(false);
    expect(usesTransactionPooler('postgres://yavaya:yavaya@127.0.0.1:5432/yavaya_dev')).toBe(false);
  });

  it('honours an explicit override in both directions', () => {
    // A pooler on a non-standard port, and a direct connection that merely
    // looks like one.
    expect(usesTransactionPooler('postgres://u:p@host:5432/db', true)).toBe(true);
    expect(usesTransactionPooler('postgres://u:p@host:6543/db', false)).toBe(false);
  });

  it('does not throw on an unparseable URL', () => {
    // A malformed URL is the environment's problem to report, not a crash
    // inside pooler detection.
    expect(usesTransactionPooler('not a url')).toBe(false);
  });
});
