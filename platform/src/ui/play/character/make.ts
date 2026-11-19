import * as THREE from 'three';
import type { Look } from '@/config/play-looks';
import { buildCharacter, type Character, type MotionState } from './build';

/**
 * The one way the games make the player's character: the drawn one, or
 * Yavaya Genesis (docs/GENESIS.md) when its switch is on for this player.
 *
 * Genesis's code (its file loader and decoder) is fetched only when it is
 * used, so a player who still has the drawn character downloads nothing
 * more. Until it has arrived, the character is an empty group that keeps
 * the moves' timing; `ready` settles once it is drawn.
 */
let genesis = false;

/** Set once per page from the server's answer (PlaySetup.genesis). */
export function setGenesis(on: boolean) {
  genesis = on;
}

export function makeCharacter(look: Look): Character {
  if (!genesis) return buildCharacter(look);
  const group = new THREE.Group();
  let inner: Character | null = null;
  let wanted = look;
  let disposed = false;
  const ready = import('../genesis/character').then(async ({ buildGenesisCharacter }) => {
    if (disposed) return;
    inner = buildGenesisCharacter(wanted);
    group.add(inner.group);
    await inner.ready;
  });
  return {
    group,
    ready,
    update(dt: number, state: MotionState) {
      inner?.update(dt, state);
    },
    dress(next: Look) {
      wanted = next;
      inner?.dress(next);
    },
    dispose() {
      disposed = true;
      inner?.dispose();
      group.clear();
    },
  };
}
