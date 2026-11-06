'use client';

import { useEffect, useRef } from 'react';

/**
 * Hidden fields that carry the member's own date and time-zone offset with a
 * form: the server does not know where the member is, and "today" or "8:00"
 * must mean the member's today and 8:00.
 */
export function LocalTimeFields() {
  const day = useRef<HTMLInputElement>(null);
  const offset = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const now = new Date();
    if (day.current) day.current.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (offset.current) offset.current.value = String(now.getTimezoneOffset());
  }, []);
  return (
    <>
      <input type="hidden" name="day" ref={day} />
      <input type="hidden" name="offset" ref={offset} defaultValue="0" />
    </>
  );
}
