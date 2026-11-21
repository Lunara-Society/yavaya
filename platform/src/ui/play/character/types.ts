import type * as THREE from 'three';
import type { Look } from '@/config/play-looks';

/**
 * What every game knows of the player's character, whatever it is made of
 * (today Yavaya Genesis, docs/GENESIS.md): a group to place in the scene, a
 * frame update from the player's state, and a way to change clothes.
 */

export type Emote = 'saludo' | 'baile';

export type MotionState = {
  /** 0…1 of a full run. */
  speed: number;
  air: boolean;
  /** Vertical speed, to tell rising from falling. */
  vy: number;
  /** 0…1, the finish. */
  cheer: number;
  emote: Emote | null;
  /** The mastery moveset's actions (engine/moves.ts), and how far through it is (0…1). */
  action?: 'roll' | 'slide' | 'airdodge' | null;
  actionK?: number;
  /** 0…1 of momentum: a sprint leans further and swings harder. */
  sprint?: number;
};

export type Character = {
  group: THREE.Group;
  /** Settles once everything the character is made of has loaded. */
  ready?: Promise<void>;
  update(dt: number, state: MotionState): void;
  /** Puts on another look without rebuilding the joints (the studio). */
  dress(look: Look): void;
  dispose(): void;
};
