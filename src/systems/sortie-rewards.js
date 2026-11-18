import { SORTIE } from "../config/sortie-data.js";

/**
 * A pure, ephemeral estimate. This MUST NOT mutate Engine, RunState or ProfileState.
 * Stage 2C alone may later issue a validated, idempotent authoritative receipt.
 */
export function previewSortieRewards(battle) {
  if (!battle || battle.outcome === "running") return null;
  const { rewards } = SORTIE;
  const collectedShards = Math.max(0, Math.floor(battle.collectedShards || 0));
  const shardStones = Math.min(rewards.maxShardStones,
    Math.floor(collectedShards / rewards.shardsPerStone));
  const won = battle.outcome === "won";
  const baseStones = won ? rewards.baseStonesOnWin : 0;
  const mission = battle.mission;
  const missionBonusStones = won && mission?.id === "salvage" &&
    mission.status === "completed" ? SORTIE.mission.rewardStones : 0;
  return Object.freeze({
    outcome: battle.outcome,
    survivedSeconds: battle.tick / SORTIE.ticksPerSecond,
    defeated: battle.defeated,
    weaponDamage: battle.weaponDamage,
    collectedShards,
    uncollectedShards: battle.drops.length,
    shardStones,
    objectiveStones: missionBonusStones,
    baseStones,
    missionId: mission?.id ?? "safe",
    objectiveStatus: mission?.status ?? "inactive",
    objectiveCompletedTick: mission?.completedTick ?? null,
    objectiveGuardCount: mission?.guardCount ?? 0,
    objectiveGuardDamage: mission?.guardDamage ?? 0,
    stones: baseStones + shardStones + missionBonusStones,
    experience: won ? rewards.experienceOnWin : 0,
    progress: won ? rewards.progressOnWin : 0,
  });
}
