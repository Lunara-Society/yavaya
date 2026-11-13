import { courseName } from './modes/trial';
import { el, type PlayContext } from './context';

type Row = { rank: number; name: string; seconds: number; medal: string; me: boolean };
type Result = { rows: Row[]; mine: Row | null; available: boolean };

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

/**
 * A course's leaderboard over the game (docs/PLAY.md, "Leaderboards"): the
 * world, the player's country, their city. Only runs the server played
 * again and saw finish are on it, and the screen says so.
 */
export function openBoard(play: PlayContext, course: string) {
  const { text } = play;
  const host = play.runtime.host;
  const sheet = el('yp-board');
  const head = el('yp-board-head');
  const title = el('yp-board-title', `${text('play.board.title')} · ${courseName(text, course)}`, 'h2');
  const close = el('yp-icon', '✕', 'button');
  close.setAttribute('aria-label', text('play.close'));
  head.append(title, close);
  const tabs = el('yp-tabs');
  const list = el('yp-board-list', '', 'ol');
  const note = el('yp-board-note', text('play.board.note'), 'p');
  sheet.append(head, tabs, list, note);
  host.append(sheet);

  const show = async (scope: 'world' | 'country' | 'city') => {
    for (const tab of tabs.children) tab.setAttribute('aria-pressed', String((tab as HTMLElement).dataset.scope === scope));
    if (scope !== 'world' && !play.signedIn) {
      list.replaceChildren(el('yp-board-empty', text('play.board.signin'), 'li'));
      return;
    }
    list.replaceChildren(el('yp-board-empty', text('play.board.loading'), 'li'));
    let result: Result | null = null;
    try {
      const response = await fetch(`/api/play/board?course=${encodeURIComponent(course)}&scope=${scope}`, { cache: 'no-store' });
      if (response.ok) result = (await response.json()) as Result;
    } catch {
      result = null;
    }
    if (!result) return list.replaceChildren(el('yp-board-empty', text('play.board.failed'), 'li'));
    if (!result.available) return list.replaceChildren(el('yp-board-empty', text('play.board.no_place'), 'li'));
    if (!result.rows.length) return list.replaceChildren(el('yp-board-empty', text('play.board.empty'), 'li'));
    const line = (r: Row) => {
      const li = el(`yp-board-row${r.me ? ' is-me' : ''}`, '', 'li');
      li.append(el('yp-board-rank', String(r.rank), 'span'), el('yp-board-name', r.me ? `${r.name} · ${text('play.board.you')}` : r.name, 'span'), el('yp-board-time', clock(r.seconds), 'span'), el('yp-board-medal', text(`play.medal.${r.medal}`), 'span'));
      li.dataset.medal = r.medal;
      return li;
    };
    const rows = result.rows.map(line);
    if (result.mine && !result.rows.some((r) => r.me)) rows.push(el('yp-board-gap', '…', 'li'), line(result.mine));
    list.replaceChildren(...rows);
  };
  for (const scope of ['world', 'country', 'city'] as const) {
    const tab = el('yp-tab', text(`play.board.${scope}`), 'button');
    tab.dataset.scope = scope;
    tab.addEventListener('click', () => void show(scope));
    tabs.append(tab);
  }
  close.addEventListener('click', () => sheet.remove());
  void show('world');
  return () => sheet.remove();
}
