import { parseLook, DEFAULT_LOOK, type Look } from '@/config/play-looks';
import { createControls } from './engine/controls';
import { createRuntime } from './engine/runtime';
import { cue, textReader, type PlayContext, type Place } from './context';
import { createRush } from './modes/rush';
import { createStudio } from './modes/studio';

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
      runtime.show(place === 'studio' ? createStudio(play, { first: false }) : createRush(play));
    },
    cue,
  };

  runtime.show(look ? createRush(play) : createStudio(play, { first: true }));

  return () => {
    controls.dispose();
    runtime.dispose();
  };
}
