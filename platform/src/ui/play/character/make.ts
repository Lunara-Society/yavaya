import * as THREE from 'three';
import type { Look } from '@/config/play-looks';
import type { Character, MotionState } from './types';

/**
 * The one way the games make the player's character: Yavaya Genesis
 * (docs/GENESIS.md), the only character since 21 November 2026 (the drawn
 * one it replaced was removed at the owner's request).
 *
 * Genesis's code (its file loader and decoder) is a chunk of its own,
 * fetched the first time a character is made. Until it has arrived, the
 * character is an empty group that keeps the moves' timing; `ready` settles
 * once it is drawn.
 */
export function makeCharacter(look: Look): Character {
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
