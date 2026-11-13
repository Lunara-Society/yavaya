import { parseLook, DEFAULT_LOOK, type Look } from '@/config/play-looks';
import { createControls } from './engine/controls';
import { createRuntime } from './engine/runtime';
import { cue, textReader, type Account, type Challenge, type PlayContext, type Place, type RunVerdict } from './context';
import { createPlaza } from './modes/plaza';
import { createRush } from './modes/rush';
import { createShop } from './modes/shop';
import { createStudio } from './modes/studio';
import { createTrial } from './modes/trial';
import { createTrialsMenu } from './modes/trials-menu';
import { courseById } from './trials/courses';

/**
 * Yavaya Play, started (docs/PLAY.md). Brings up the screen and the thumbs
 * once, then shows one activity at a time: the Character Studio on a first
 * visit, then the game.
 *
 * Where the look is kept: on the account for a signed-in player (the page
 * hands it over; saving goes to /api/play/profile), on this phone for
 * anyone else. A look made on the phone before signing in is carried to the
 * account the first time it is seen signed in.
 */

export type PlaySetup = {
  texts: Record<string, string>;
  /** The account's saved look, or null (none yet, or not signed in). */
  look: unknown;
  signedIn: boolean;
  /** The Pruebas de Maestría are open to this player (the switch, or the owner's preview). */
  trials?: boolean;
  /** The signed-in player's progress on the account; null for a guest. */
  account?: Account | null;
  /** Today in UTC, from the server's clock: which Ruta del Día is today's. */
  today?: string;
  /** A shared run the page was opened to race (`?reto=`), or null. */
  challenge?: Challenge | null;
  /** The sign-in page, coming back to Yavaya Play. */
  signInHref?: string;
};

const LOCAL_LOOK = 'yavaya.play.look';

function readLocal(): Look | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_LOOK);
    return raw ? parseLook(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(look: Look): boolean {
  try {
    window.localStorage.setItem(LOCAL_LOOK, JSON.stringify(look));
    return true;
  } catch {
    return false;
  }
}

async function writeAccount(look: Look): Promise<boolean> {
  try {
    const response = await fetch('/api/play/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ look }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function startPlay(host: HTMLElement, setup: PlaySetup): () => void {
  const text = textReader(setup.texts);
  const runtime = createRuntime(host);
  const controls = createControls(runtime, { jump: text('play.jump') });

  const accountLook = setup.signedIn ? parseLook(setup.look) : null;
  const localLook = readLocal();
  let look: Look | null = accountLook ?? localLook;
  // Made on this phone before signing in: carried to the account now.
  if (setup.signedIn && !accountLook && localLook) void writeAccount(localLook);

  const today = setup.today ?? new Date().toISOString().slice(0, 10);

  /** A finished run, to the server to be played again (docs/PLAY.md, "Verified runs"). */
  async function submitRun(course: string, input: string, noCheckpoints: boolean): Promise<RunVerdict> {
    if (!setup.signedIn) return { ok: false, reason: 'signed_out' };
    try {
      const response = await fetch('/api/play/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ course, input, noCheckpoints }) });
      if (!response.ok) return { ok: false, reason: 'refused' };
      const verdict = (await response.json()) as Extract<RunVerdict, { ok: true }>;
      const account = play.account;
      if (account) {
        account.progress = verdict.progress;
        account.achievements = [...new Set([...account.achievements, ...verdict.achievements])];
        account.owned = [...new Set([...account.owned, ...verdict.items])];
        if (verdict.best && verdict.runId) account.bests[course] = { seconds: verdict.seconds, medal: verdict.medal, runId: verdict.runId };
      }
      return verdict;
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  const play: PlayContext = {
    runtime,
    controls,
    text,
    signedIn: setup.signedIn,
    look: () => look ?? DEFAULT_LOOK,
    async saveLook(next) {
      const kept = setup.signedIn ? await writeAccount(next) : writeLocal(next);
      if (kept) {
        look = next;
        // The phone keeps a copy either way, so a later visit opens straight away.
        writeLocal(next);
      }
      return kept;
    },
    go(place: Place) {
      if (place === 'trials' && setup.trials) runtime.show(createTrialsMenu(play));
      else if (place === 'studio') runtime.show(createStudio(play, { first: false }));
      else if (place === 'rush') runtime.show(createRush(play));
      else if (place === 'shop') runtime.show(createShop(play));
      else runtime.show(createPlaza(play));
    },
    startTrial(id, noCheckpoints) {
      if (setup.trials) runtime.show(createTrial(play, id, { noCheckpoints }));
    },
    startCourse(id, options = {}) {
      const course = courseById(id);
      // The trials stay behind their own switch; the day's route and the districts' are part of the game.
      if (!course || (course.kind === 'trial' && !setup.trials)) return;
      runtime.show(createTrial(play, id, { noCheckpoints: options.noCheckpoints ?? false, challenge: options.challenge ?? null }));
    },
    trials: Boolean(setup.trials),
    cue,
    account: setup.signedIn ? (setup.account ?? null) : null,
    submitRun,
    signal(event, course, segment = 0) {
      // Anonymous and best-effort: a count lost is fine, a game slowed is not.
      void fetch('/api/play/signal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, course, segment }), keepalive: true }).catch(() => undefined);
    },
    today,
    challenge: setup.challenge ?? null,
    signInHref: setup.signInHref ?? '/auth/login',
  };

  runtime.show(look ? createPlaza(play) : createStudio(play, { first: true }));

  return () => {
    controls.dispose();
    runtime.dispose();
  };
}
