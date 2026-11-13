import type { Mode } from '../engine/runtime';
import { menuStage } from '../engine/stage';
import { TRIALS } from '../trials/data';
import { isOpen, readRecords } from '../trials/records';
import { el, type PlayContext } from '../context';

/**
 * The Ancient Gate (docs/PLAY.md): where the Pruebas de Maestría are chosen.
 * The character waits at the foot of a ruined obsidian gate at dusk; the
 * five trials are listed over it, each with its best time and medal, the
 * next one opening when the one before is beaten. The hardest ones are
 * there to aspire to: nothing else in Yavaya Play needs them.
 */
export function createTrialsMenu(play: PlayContext): Mode {
  const { runtime, controls, text } = play;
  const host = runtime.host;
  controls.show(false);

  const stage = menuStage(play.look());

  // --- The list ---
  const sheet = el('yp-sheet yp-dark');
  const title = el('yp-sheet-title', text('play.trials.title'), 'h2');
  const lead = el('yp-sheet-lead', text('play.trials.lead'), 'p');
  const listEl = el('yp-trials');
  const mastery = el('yp-check', '', 'label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  mastery.append(box, el('', text('play.trials.mastery'), 'span'));
  const masteryNote = el('yp-sheet-note', text('play.trials.mastery_note'), 'p');
  const moves = el('yp-sheet-note', text('play.trials.moves'), 'p');
  const local = el('yp-sheet-note', text(play.account ? 'play.trials.account_note' : 'play.trials.local_note'), 'p');
  const foot = el('yp-sheet-foot');
  const back = el('yp-ghost', text('play.close'), 'button');
  const studio = el('yp-ghost', text('play.studio.open'), 'button');
  foot.append(back, studio);
  sheet.append(title, lead, listEl, mastery, masteryNote, moves, local, foot);
  host.append(sheet);

  const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  // Bests on the account (verified) and on this phone: whichever is better.
  const records: Record<string, { best: number; medal: string }> = { ...readRecords() };
  for (const [course, b] of Object.entries(play.account?.bests ?? {})) if (!records[course] || b.seconds <= records[course]!.best) records[course] = { best: b.seconds, medal: b.medal };
  for (const t of TRIALS) {
    const open = isOpen(t.id, records);
    const card = el('yp-trial', '', 'button');
    card.dataset.tier = t.id;
    card.disabled = !open;
    const r = records[t.id];
    card.append(
      el('yp-trial-tier', `${['I', 'II', 'III', 'IV', 'V'][t.tier - 1]} · ${text(`play.trials.tier.${t.id}`)}`, 'span'),
      el('yp-trial-name', text(`play.trials.name.${t.id}`), 'span'),
      el('yp-trial-sub', open ? text(`play.trials.sub.${t.id}`) : text('play.trials.locked'), 'span'),
      el('yp-trial-best', r ? `${text('play.trials.best', { time: clock(r.best) })} · ${text(`play.medal.${r.medal}`)}` : open ? text('play.trials.untried') : '🔒', 'span'),
    );
    card.addEventListener('click', () => open && play.startTrial(t.id, box.checked));
    listEl.append(card);
  }
  back.addEventListener('click', () => play.go('plaza'));
  studio.addEventListener('click', () => play.go('studio'));

  return {
    scene: stage.scene,
    camera: stage.camera,
    fov: stage.fov,
    frame(dt) {
      stage.frame(dt, host, sheet);
    },
    state: () => ({ menu: 'trials' }),
    dispose() {
      sheet.remove();
      stage.dispose();
    },
  };
}
