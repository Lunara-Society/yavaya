import { PLAY_RULES } from './business-rules';

/**
 * A player's level from their XP (docs/PLAY.md, "Progress"): level n needs
 * PLAY_RULES.levelStep × n × (n − 1) / 2 XP in all, so each level asks a
 * little more than the one before. Shared by the server, which stores only
 * XP, and the game, which draws the bar.
 */
export function levelOf(xp: number): { level: number; from: number; to: number } {
  const step = PLAY_RULES.levelStep;
  let level = 1;
  while ((step * (level + 1) * level) / 2 <= xp) level += 1;
  return { level, from: (step * level * (level - 1)) / 2, to: (step * (level + 1) * level) / 2 };
}
