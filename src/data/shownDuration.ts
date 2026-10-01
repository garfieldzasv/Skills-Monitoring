/**
 * Which tooltip duration the overlay counts down, for actions where it is not the first one.
 * An index into the action's `durations` (game data), or null to show none. This only chooses
 * between the game's own values; it never changes them.
 */
export const SHOWN_DURATION: Readonly<Record<number, number | null>> = {
  25868: 1, // 疾风怒涛之计: 怒涛之计 (damage taken -10%, 20s), not 疾风之计 (movement speed, 10s)
  24310: 1, // 整体论: the mitigation (20s), not the barrier (30s)
  7561: null, // 即刻咏唱: lasts only until the next spell, so its 10s would mislead
};
