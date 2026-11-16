import { LABELS, WORLDS } from "../src/config/game-data.js";

export const STRATEGY_IDS = Object.freeze(Object.keys(LABELS));

/**
 * Enumerate every fixed per-world strategy profile in stable world/strategy order.
 * This is analysis tooling only; it does not modify engine rules or live saves.
 */
export function buildStrategyProfiles(worldIds, strategies = STRATEGY_IDS) {
  if (!Array.isArray(worldIds) || worldIds.length === 0) {
    throw new TypeError("worldIds must be a non-empty array");
  }
  if (
    worldIds.some((worldId) => typeof worldId !== "string" || !Object.hasOwn(WORLDS, worldId)) ||
    new Set(worldIds).size !== worldIds.length
  ) {
    throw new RangeError("worldIds must contain unique known world IDs");
  }
  if (
    !Array.isArray(strategies) ||
    strategies.length === 0 ||
    strategies.some((strategy) => !Object.hasOwn(LABELS, strategy)) ||
    new Set(strategies).size !== strategies.length
  ) {
    throw new RangeError("strategies must contain unique known strategy IDs");
  }

  return worldIds.reduce(
    (profiles, worldId) =>
      profiles.flatMap((profile) =>
        strategies.map((strategy) => {
          const selection = { ...profile.strategies, [worldId]: strategy };
          return {
            id: worldIds.map((id) => `${id}-${selection[id]}`).join("__"),
            strategies: selection,
          };
        }),
      ),
    [{ id: "", strategies: {} }],
  );
}
