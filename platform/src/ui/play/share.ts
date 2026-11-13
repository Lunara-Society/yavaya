import { courseName } from './modes/trial';
import type { PlayContext } from './context';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

/**
 * "Beat my time" (docs/PLAY.md, "Challenges"): makes a kept run a challenge
 * and hands a link to WhatsApp (the phone's own share sheet where there is
 * one, WhatsApp's link otherwise). The friend who opens it races that run's
 * ghost; nothing about the sender but their display name and time goes with it.
 */
export async function shareChallenge(play: PlayContext, runId: string, course: string, seconds: number): Promise<boolean> {
  let path: string | null = null;
  try {
    const response = await fetch('/api/play/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId }) });
    if (response.ok) path = ((await response.json()) as { path?: string }).path ?? null;
  } catch {
    path = null;
  }
  if (!path) {
    window.alert(play.text('play.share.failed'));
    return false;
  }
  const url = `${window.location.origin}${path}`;
  const message = play.text('play.share.message', { time: clock(seconds), course: courseName(play.text, course), url });
  const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
  if (share) {
    try {
      await share.call(navigator, { text: message });
      return true;
    } catch {
      // Closed without sharing, or not allowed here: WhatsApp's own link instead.
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  return true;
}
