import { describe, expect, it } from 'vitest';
import { DISTRICT_COURSES, PIECES, assemble, courseById, dailyCourse, type PieceId } from '@/ui/play/trials/courses';
import { replayRun, encodeRun, decodeRun } from '@/ui/play/trials/run';
import { fly } from '../helpers/play-routes';
import { courseRoute, pieceAt } from '../helpers/course-routes';

/**
 * La Ruta del Día and the districts' courses (trials/courses.ts) are built
 * from pieces of the trials. Each piece is played alone and between others,
 * every district course end to end, and a long run of days: a course is
 * offered only if a route finishes it.
 */

const days = (from: string, count: number) => Array.from({ length: count }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

function play(course: ReturnType<typeof dailyCourse>, noCheckpoints = false) {
  const run = fly(course, courseRoute(course), { noCheckpoints, limit: 240 });
  const z = Number(/ z (-?[\d.]+)/.exec(run.fails[0] ?? '')?.[1] ?? 0);
  const where = run.fails.length ? `${course.id}: ${run.fails[0]} in ${pieceAt(course, z)}` : '';
  return { run, where };
}

describe('Courses built from the trials', () => {
  for (const id of Object.keys(PIECES) as PieceId[]) {
    for (const m of [1, -1]) {
      it(`piece ${id} (${m > 0 ? 'as cut' : 'mirrored'}) can be crossed`, () => {
        const course = assemble(`t-${id}`, 'daily', 'volcan', [{ piece: 'piedras', m: 1 }, { piece: id, m }, { piece: 'puente', m: 1 }]);
        const { run, where } = play(course);
        expect(where).toBe('');
        expect(run.sim.finished).toBe(true);
      });
    }
  }

  for (const course of DISTRICT_COURSES) {
    it(`the ${course.id} course can be finished, with and without checkpoints`, () => {
      for (const noCheckpoints of [false, true]) {
        const { run, where } = play(course, noCheckpoints);
        expect(where).toBe('');
        expect(run.sim.finished).toBe(true);
      }
    });
  }

  it('gives a finishable route every day for the next two months', () => {
    const problems: string[] = [];
    const ratios: number[] = [];
    for (const day of days('2026-11-14', 62)) {
      const course = dailyCourse(day);
      const { run, where } = play(course);
      if (where || !run.sim.finished) problems.push(where || `${day}: unfinished at z ${run.sim.player.z.toFixed(1)} leg ${run.leg}`);
      else ratios.push(run.time / course.reference);
    }
    expect(problems).toEqual([]);
    // The reference (the pieces' usual times summed) stays close to a real run, so the medals mean much the
    // same every day: the route always earns Oro at least, and never beats the reference by much. (A route that
    // waits for a hazard's window takes longer on some days; the medals' multiples leave room for that.)
    expect(Math.min(...ratios)).toBeGreaterThan(0.85);
    expect(Math.max(...ratios)).toBeLessThan(1.35);
  });

  it('keeps a day the same for everyone, and changes it the next day', () => {
    expect(JSON.stringify(dailyCourse('2026-11-20'))).toBe(JSON.stringify(dailyCourse('2026-11-20')));
    expect(dailyCourse('2026-11-20').placed.map((p) => p.piece)).not.toEqual(dailyCourse('2026-11-21').placed.map((p) => p.piece));
    expect(courseById('dia-2026-11-20')?.id).toBe('dia-2026-11-20');
    expect(courseById('dia-2026-13-40')).toBeNull();
    expect(courseById('nope')).toBeNull();
    expect(courseById('barrio')?.kind).toBe('district');
  });

  it('checks a day route run on the server the same way', () => {
    const course = dailyCourse('2026-11-20');
    const { run } = play(course);
    const replayed = replayRun(courseById(course.id)!, decodeRun(encodeRun(run.samples))!, false);
    expect(replayed.finished).toBe(true);
    expect(replayed.seconds).toBe(run.time);
  });
});
