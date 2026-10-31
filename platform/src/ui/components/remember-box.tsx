'use client';

import { useEffect, useState } from 'react';
import { SESSION_RULES } from '@/config/business-rules';

/** A quarter of an hour: long enough for Google or the two-step code page, gone if the person walks away. */
const CHOICE_SECONDS = 15 * 60;

/**
 * "Mantener mi sesión iniciada". Never ticked for the person. The answer is
 * kept as a short-lived cookie rather than a form field, because the sign-in
 * it applies to may finish elsewhere — after Google, or on the two-step code
 * page — and the server takes it, once, when it opens the session
 * (`takeRememberChoice`). It can only lengthen the idle window of that session.
 */
export function RememberBox({ label, hint }: { label: string; hint: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(document.cookie.split('; ').includes(`${SESSION_RULES.rememberCookie}=1`));
  }, []);
  const change = (next: boolean) => {
    setOn(next);
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = next
      ? `${SESSION_RULES.rememberCookie}=1; path=/; max-age=${CHOICE_SECONDS}; samesite=lax${secure}`
      : `${SESSION_RULES.rememberCookie}=; path=/; max-age=0; samesite=lax${secure}`;
  };
  return (
    <label className="auth-remember">
      <input type="checkbox" checked={on} onChange={(event) => change(event.currentTarget.checked)} aria-describedby="auth-remember-hint" />
      <span>
        <strong>{label}</strong>
        <small id="auth-remember-hint">{hint}</small>
      </span>
    </label>
  );
}
