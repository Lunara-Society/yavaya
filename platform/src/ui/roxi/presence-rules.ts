import { ROXI_RULES } from '@/config/business-rules';
import type { RoxiPrefs } from './prefs';

/**
 * When Roxi may step forward on her own — the small check-in and the
 * simulated call — decided by pure rules so they can be tested without a
 * clock or a browser. The component (presence.tsx) feeds them the time, the
 * page and what this browser remembers, and does exactly what they say.
 *
 * The rules lean towards silence: any doubt (quiet hours, a sensitive page,
 * a form in progress for the call, a recent decline) means nothing appears.
 */

export type PresenceMemory = {
  /** Local day (YYYY-MM-DD) of the last check-in shown, and how many that day. */
  checkInDay?: string;
  checkInsToday?: number;
  /** Epoch ms before which no call rings (after a decline or a missed call). */
  callNotBefore?: number;
};

/**
 * Pages where Roxi never steps forward: paying, security and account
 * settings, appeals, sign-in, Espacio Violeta. Someone there is busy with
 * something that must not be interrupted.
 */
export const SENSITIVE_PAGE = /^\/(violeta|login|register|verify|reset|apelacion|auth|settings|account\/tokens|account\/phone|admin|ops)(\/|$)/;

/** Forms where a member may want a hand finishing (the check-in says so). */
export const FORM_PAGE = /^\/(mercadito\/publish|community\/new|services\/new|work\/posts\/new|work\/profile|animals\/lost\/new|yavayago\/store|yavayago\/driver)(\/|$)/;

export function localDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Inside quiet hours, which may wrap past midnight (21 → 7). From = to means none. */
export function inQuietHours(hour: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

export type PresenceContext = {
  now: Date;
  pathname: string;
  prefs: RoxiPrefs;
  memory: PresenceMemory;
  /** Minutes of visible browsing in this tab without opening Roxi. */
  browsingMinutes: number;
  /** Roxi was opened (or a welcome note is showing) in this tab. */
  engaged: boolean;
  visible: boolean;
};

function calm(context: PresenceContext): boolean {
  return (
    context.visible &&
    !context.engaged &&
    !SENSITIVE_PAGE.test(context.pathname) &&
    !inQuietHours(context.now.getHours(), context.prefs.quietFrom, context.prefs.quietTo)
  );
}

export function checkInDue(context: PresenceContext, rules = ROXI_RULES): boolean {
  if (context.prefs.mode === 'quiet' || !calm(context)) return false;
  if (context.browsingMinutes < rules.checkInAfterMinutes) return false;
  const today = localDay(context.now);
  const shown = context.memory.checkInDay === today ? (context.memory.checkInsToday ?? 0) : 0;
  return shown < rules.checkInsPerDay;
}

/** The browsing minutes after which this tab's call rings: one random point in the range, fixed per tab. */
export function callAfterMinutes(random: number, rules = ROXI_RULES): number {
  const { min, max } = rules.callAfterMinutes;
  return min + Math.min(Math.max(random, 0), 1) * (max - min);
}

export function callDue(context: PresenceContext, ringAt: number, rules = ROXI_RULES): boolean {
  if (context.prefs.mode !== 'proactive' || !calm(context)) return false;
  // A call never interrupts a form: the check-in offers help there instead.
  if (FORM_PAGE.test(context.pathname)) return false;
  if (context.memory.callNotBefore && context.now.getTime() < context.memory.callNotBefore) return false;
  return context.browsingMinutes >= ringAt && rules.callRingSeconds > 0;
}

export function afterCheckIn(memory: PresenceMemory, now: Date): PresenceMemory {
  const today = localDay(now);
  const shown = memory.checkInDay === today ? (memory.checkInsToday ?? 0) : 0;
  return { ...memory, checkInDay: today, checkInsToday: shown + 1 };
}

/** Declined or missed: no call again for the cooldown. An answered call also rests for the same time. */
export function afterCall(memory: PresenceMemory, now: Date, rules = ROXI_RULES): PresenceMemory {
  return { ...memory, callNotBefore: now.getTime() + rules.callCooldownHours * 3_600_000 };
}
