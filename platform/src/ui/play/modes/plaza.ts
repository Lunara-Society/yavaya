import type { Mode } from '../engine/runtime';
import { menuStage } from '../engine/stage';
import { DISTRICT_COURSES } from '../trials/courses';
import { readRecords } from '../trials/records';
import { openBoard } from '../board';
import { courseName } from './trial';
import { el, type PlayContext } from '../context';

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

/**
 * The Plaza (docs/PLAY.md): where Yavaya Play opens and comes back to. A
 * small menu over the gate, not a world to walk: on a phone a good list is
 * faster than a walk to a door. The player's level, XP and coins (or, for a
 * guest, how to keep them); a challenge, if a link brought one; the day's
 * route; the trials, the districts' routes, Rush; the shop, the
 * achievements, the character.
 */
export function createPlaza(play: PlayContext): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);
  const stage = menuStage(play.look());

  const sheet = el('yp-sheet yp-dark yp-plaza');
  const strip = el('yp-strip');
  if (play.account) {
    const p = play.account.progress;
    const level = el('yp-level', text('play.plaza.level', { level: p.level }), 'span');
    const bar = el('yp-xp');
    const fill = el('yp-xp-fill');
    fill.style.width = `${Math.round((100 * (p.xp - p.levelFrom)) / Math.max(1, p.levelTo - p.levelFrom))}%`;
    bar.append(fill);
    bar.title = text('play.plaza.xp', { xp: p.xp, next: p.levelTo });
    const coins = el('yp-coins', text('play.plaza.coins', { coins: p.coins }), 'span');
    strip.append(level, bar, coins);
  } else {
    const note = el('yp-sheet-note', text('play.plaza.guest'), 'p');
    const signIn = el('yp-chip', text('play.plaza.signin'), 'a');
    signIn.setAttribute('href', play.signInHref);
    strip.append(note, signIn);
  }
  const listEl = el('yp-cards');
  sheet.append(strip, listEl);
  host.append(sheet);

  const records = readRecords();
  const best = (course: string) => {
    const account = play.account?.bests[course]?.seconds;
    const local = records[course]?.best;
    const values = [account, local].filter((v): v is number => typeof v === 'number');
    return values.length ? Math.min(...values) : null;
  };
  const card = (title: string, line: string, actions: Array<[string, () => void, boolean?]>, tone = '') => {
    const c = el(`yp-card ${tone}`);
    const words = el('yp-card-words');
    words.append(el('yp-card-title', title, 'strong'), el('yp-card-line', line, 'span'));
    const buttons = el('yp-card-actions');
    for (const [label, act, primary] of actions) {
      const b = el(primary ? 'yp-primary yp-small' : 'yp-ghost yp-small', label, 'button');
      b.addEventListener('click', act);
      buttons.append(b);
    }
    c.append(words, buttons);
    listEl.append(c);
  };

  // A challenge a link brought: first, until it is taken.
  const challenge = play.challenge;
  if (challenge) {
    card(
      text('play.plaza.challenge', { name: challenge.name }),
      text('play.plaza.challenge_line', { time: clock(challenge.seconds), course: courseName(text, challenge.course) }),
      [[text('play.plaza.challenge_go'), () => {
        play.challenge = null;
        play.startCourse(challenge.course, { challenge, noCheckpoints: challenge.noCheckpoints });
      }, true]],
      'is-challenge',
    );
  }
  const daily = `dia-${play.today}`;
  const dailyBest = best(daily);
  card(text('play.plaza.daily'), [text('play.plaza.daily_line'), dailyBest !== null ? text('play.plaza.daily_best', { time: clock(dailyBest) }) : ''].filter(Boolean).join(' '), [
    [text('play.plaza.play'), () => play.startCourse(daily), true],
    [text('play.plaza.board'), () => openBoard(play, daily)],
  ], 'is-daily');
  if (play.trials) card(text('play.plaza.trials'), text('play.plaza.trials_line'), [[text('play.plaza.play'), () => play.go('trials'), true]]);
  for (const course of DISTRICT_COURSES) {
    const b = best(course.id);
    card(courseName(text, course.id), [text(`play.course.line.${course.id}`), b !== null ? text('play.plaza.best', { time: clock(b) }) : ''].filter(Boolean).join(' '), [
      [text('play.plaza.play'), () => play.startCourse(course.id), true],
      [text('play.plaza.board'), () => openBoard(play, course.id)],
    ], `is-${course.id}`);
  }
  card(text('play.menu.rush'), text('play.plaza.rush_line'), [[text('play.plaza.play'), () => play.go('rush'), true]]);
  // The Vault, and the honest word on what is still to come (the owner asked for both on the site).
  card(text('play.vault.title'), text('play.plaza.vault_line'), [[text('play.plaza.vault_open'), () => play.go('vault'), true]]);
  const foot = el('yp-sheet-foot');
  for (const [key, place] of [['play.plaza.shop', 'shop'], ['play.studio.open', 'studio']] as const) {
    const b = el('yp-ghost', text(key), 'button');
    b.addEventListener('click', () => play.go(place));
    foot.append(b);
  }
  sheet.append(foot);

  return {
    scene: stage.scene,
    camera: stage.camera,
    fov: stage.fov,
    frame(dt) {
      stage.frame(dt, host, sheet);
    },
    state: () => ({ menu: 'plaza' }),
    dispose() {
      sheet.remove();
      stage.dispose();
    },
  };
}
