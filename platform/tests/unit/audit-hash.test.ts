import { describe, expect, it } from 'vitest';
import { canonicalize, computeEventHash } from '@/server/domains/audit/service';

const baseEvent = {
  occurredAt: '2026-01-01T00:00:00.000Z',
  actorType: 'admin',
  actorUserId: 'a1b2',
  action: 'tokens.admin_grant',
  subjectType: 'user',
  subjectId: 'u1',
  district: null,
  ipHash: null,
  userAgentHash: null,
  metadata: { amount: 10, note: 'test' },
};

describe('canonical serialization', () => {
  it('is independent of key order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ outer: { z: 1, a: 2 } })).toBe(canonicalize({ outer: { a: 2, z: 1 } }));
  });

  it('preserves array order, which is meaningful', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it('drops undefined but keeps null', () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('audit hash chain', () => {
  it('is deterministic for identical content', () => {
    expect(computeEventHash(null, baseEvent)).toBe(computeEventHash(null, baseEvent));
  });

  it('changes when any field changes', () => {
    const original = computeEventHash(null, baseEvent);
    expect(computeEventHash(null, { ...baseEvent, action: 'tokens.admin_revoke' })).not.toBe(original);
    expect(computeEventHash(null, { ...baseEvent, metadata: { amount: 11, note: 'test' } })).not.toBe(
      original,
    );
    expect(computeEventHash(null, { ...baseEvent, subjectId: 'u2' })).not.toBe(original);
  });

  it('binds each record to its predecessor', () => {
    const first = computeEventHash(null, baseEvent);
    const second = computeEventHash(first, baseEvent);
    const forged = computeEventHash('different-predecessor', baseEvent);

    // The same content after a different predecessor produces a different
    // hash — which is what makes a removed or reordered record detectable.
    expect(second).not.toBe(forged);
    expect(second).not.toBe(first);
  });
});
