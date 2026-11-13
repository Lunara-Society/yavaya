import { describe, expect, it } from 'vitest';
import { TRIALS, medal, type Trial, type TrialId } from '@/ui/play/trials/data';
import { TrialSim } from '@/ui/play/trials/sim';
import { StepInput, decodeRun, encodeRun, replayRun } from '@/ui/play/trials/run';
import { ROUTES, RoutePilot, fly } from '../helpers/play-routes';

/**
 * Every Prueba de Maestría is played to the end, here, with the moveset a
 * player has (the stick, Saltar, Esquivar) and nothing else, before it
 * ships. A route is a list of legs: where to steer, what to wait for, when
 * to jump or dodge. The route's time is each trial's `reference`, the
 * measure its medals are cut from (data.ts, `medal`).
 *
 * The routes read the hazards' clocks the way a player reads them on the
 * screen (where the pendulum is, whether a vent glows), never anything a
 * player could not see.
 */

const DT = 1 / 120;


// Helpers a route is written with.

describe('Pruebas de Maestría', () => {
  for (const trial of TRIALS.filter((t) => ROUTES[t.id as TrialId].length)) {
    it(`${trial.id} can be finished with the moveset`, () => {
      const run = fly(trial, ROUTES[trial.id as TrialId]);
      expect(run.fails).toEqual([]);
      expect(run.sim.finished).toBe(true);
      // The reference the medals are cut from is the route's real time.
      expect(Math.abs(run.time - trial.reference)).toBeLessThan(0.3);
    });
  }

  it('can be won without a single checkpoint, as the Guardián medal asks', () => {
    for (const trial of TRIALS) {
      const run = fly(trial, ROUTES[trial.id as TrialId], { noCheckpoints: true });
      expect(run.sim.finished, trial.id).toBe(true);
      expect(run.sim.usedCheckpoint, trial.id).toBe(false);
    }
  });

  it('is played the same by the pilot that steers the films', () => {
    for (const trial of TRIALS) {
      const sim = new TrialSim(trial);
      const pilot = new RoutePilot(sim, ROUTES[trial.id as TrialId]);
      while (!sim.finished && sim.time < 60) sim.step(DT, pilot);
      expect(sim.finished, trial.id).toBe(true);
      expect(sim.fails, trial.id).toBe(0);
    }
  });

  it('keeps a run as its input, which the server plays again to the same time', () => {
    for (const trial of TRIALS) {
      for (const noCheckpoints of [false, true]) {
        const run = fly(trial, ROUTES[trial.id as TrialId], { noCheckpoints });
        const text = encodeRun(run.samples);
        const back = decodeRun(text)!;
        expect(back).toEqual(run.samples);
        const replayed = replayRun(trial, back, noCheckpoints);
        expect(replayed.finished, trial.id).toBe(true);
        expect(replayed.seconds).toBe(run.sim.time);
        expect(replayed.medal).toBe(medal(trial, run.sim.time, run.sim.usedCheckpoint));
        // Small enough to send from a phone.
        expect(text.length, trial.id).toBeLessThan(6000);
      }
    }
  });

  it('refuses a run that does not end at the finish, or that goes on after it', () => {
    const trial = TRIALS[0]!;
    const run = fly(trial, ROUTES[trial.id as TrialId]);
    expect(replayRun(trial, run.samples.slice(0, -30), false).finished).toBe(false);
    expect(replayRun(trial, [...run.samples, ...run.samples.slice(0, 10)], false).finished).toBe(false);
    // Played on another course, the same thumbs do not finish it.
    expect(replayRun(TRIALS[1]!, run.samples, false).finished).toBe(false);
    expect(decodeRun('not a run')).toBeNull();
    expect(decodeRun('')).toBeNull();
  });

  it('plays a course the same after a restart as when new', () => {
    // A restart in the game must leave nothing behind (a crumbled tile, a risen step), or the server's fresh replay would differ.
    const trial = TRIALS[2]!;
    const run = fly(trial, ROUTES[trial.id as TrialId]);
    const sim = new TrialSim(trial);
    const input = new StepInput();
    for (const sample of run.samples.slice(0, 900)) {
      input.feed(sample, sim.time * 1000);
      sim.step(DT, input, sim.time * 1000);
    }
    sim.restart();
    const again = new StepInput();
    for (const sample of run.samples) {
      const now = sim.time * 1000;
      again.feed(sample, now);
      sim.step(DT, again, now);
      if (sim.finished) break;
    }
    expect(sim.finished).toBe(true);
    expect(sim.time).toBe(run.sim.time);
  });

  it('cuts medals from the reference', () => {
    const t = { ...TRIALS[0]!, reference: 40 };
    expect(medal(t, 41, false)).toBe('guardian');
    expect(medal(t, 41, true)).toBe('obsidiana');
    expect(medal(t, 53, true)).toBe('oro');
    expect(medal(t, 200, true)).toBe('completado');
  });
});
