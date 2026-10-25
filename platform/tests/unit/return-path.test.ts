import { describe, expect, it } from 'vitest';
import { loginHref, safeNext } from '@/server/auth/return-path';

describe('the way back after signing in', () => {
  it('returns to a page on this site, query included', () => {
    expect(safeNext('/work/posts/new')).toBe('/work/posts/new');
    expect(safeNext('/services/new?cat=plumbing')).toBe('/services/new?cat=plumbing');
    expect(safeNext('/notifications/open/0b6f3c2e-8a51-4c1e-9d3f-2f7a1c9e4b10')).toBe('/notifications/open/0b6f3c2e-8a51-4c1e-9d3f-2f7a1c9e4b10');
  });

  it('never leaves the site', () => {
    for (const elsewhere of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 'evil.example', ' /mercadito', '/mercadito\n']) {
      expect(safeNext(elsewhere)).toBe('/');
    }
    expect(safeNext('')).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });

  it('never sends someone back to the sign-in pages', () => {
    for (const loop of ['/login', '/login?next=/mercadito', '/login/codigo', '/register', '/register/google']) {
      expect(safeNext(loop)).toBe('/');
    }
    // A page that merely starts with the same letters is a page like any other.
    expect(safeNext('/login-help')).toBe('/login-help');
  });

  it('builds the address of the sign-in page that comes back', () => {
    expect(loginHref('/work/posts/new')).toBe('/login?next=%2Fwork%2Fposts%2Fnew');
    expect(loginHref('/services/new?cat=plumbing', '/register')).toBe('/register?next=%2Fservices%2Fnew%3Fcat%3Dplumbing');
    expect(loginHref('/')).toBe('/login');
    expect(loginHref('//evil.example')).toBe('/login');
  });
});
