const DEFAULT_FIELD = Object.freeze({
  width: 320,
  height: 448,
  edgeMargin: 38,
  approachRange: 112,
  retreatRange: 70,
  repulsionRange: 62,
  projectileHorizon: 36,
  projectileDangerRadius: 30,
  pickupRange: 105,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function unit(x, y, fallback = { x: 0, y: 0 }) {
  const length = Math.hypot(x, y);
  if (length < 0.0001) return fallback;
  return { x: x / length, y: y / length };
}

function fieldOptions(field) {
  return {
    ...DEFAULT_FIELD,
    ...(field && typeof field === "object" ? field : {}),
  };
}

function aliveEnemies(battle, hero) {
  return (Array.isArray(battle?.enemies) ? battle.enemies : [])
    .filter((enemy) =>
      enemy &&
      Number.isFinite(enemy.x) &&
      Number.isFinite(enemy.y) &&
      Number(enemy.hp) > 0,
    )
    .map((enemy) => ({ enemy, range: distance(hero, enemy) }))
    .sort((a, b) =>
      a.range - b.range ||
      String(a.enemy.id ?? "").localeCompare(String(b.enemy.id ?? "")),
    );
}

function projectileThreat(shot, hero, options, index) {
  if (
    !shot ||
    ![shot.x, shot.y, shot.vx, shot.vy].every(Number.isFinite) ||
    (Number.isFinite(shot.ttl) && shot.ttl <= 0)
  ) return null;

  const velocitySquared = shot.vx * shot.vx + shot.vy * shot.vy;
  if (velocitySquared < 0.0001) return null;

  const horizon = Math.min(
    options.projectileHorizon,
    Number.isFinite(shot.ttl) ? Math.max(0, shot.ttl) : options.projectileHorizon,
  );
  const relativeX = hero.x - shot.x;
  const relativeY = hero.y - shot.y;
  const closestTick = clamp(
    (relativeX * shot.vx + relativeY * shot.vy) / velocitySquared,
    0,
    horizon,
  );
  const impact = {
    x: shot.x + shot.vx * closestTick,
    y: shot.y + shot.vy * closestTick,
  };
  let awayX = hero.x - impact.x;
  let awayY = hero.y - impact.y;
  let separation = Math.hypot(awayX, awayY);

  if (separation < 0.0001) {
    // Exact line-up: step perpendicular to the projectile, with stable tie-breaking.
    const sign = index % 2 === 0 ? 1 : -1;
    awayX = -shot.vy * sign;
    awayY = shot.vx * sign;
    separation = Math.hypot(awayX, awayY);
  }

  if (separation >= options.projectileDangerRadius) return null;
  const urgency = 1 - closestTick / Math.max(1, horizon * 1.25);
  const strength =
    (1 - separation / options.projectileDangerRadius) *
    clamp(urgency, 0.35, 1) *
    1.8;
  const direction = unit(awayX, awayY);
  return {
    x: direction.x * strength,
    y: direction.y * strength,
    separation,
    closestTick,
  };
}

/**
 * Deterministic AI movement for the same encounter state used by the player.
 *
 * This function is read-only: callers may switch between its returned input
 * and the player's joystick vector without replacing or resetting the battle.
 * Ordinary attacks remain the simulator's responsibility.
 */
export function getAutonomousEncounterInput(battle, field) {
  const options = fieldOptions(field);
  const hero = battle?.hero;
  if (!hero || !Number.isFinite(hero.x) || !Number.isFinite(hero.y)) {
    return { x: 0, y: 0 };
  }

  const enemies = aliveEnemies(battle, hero);
  const nearest = enemies[0];
  let x = 0;
  let y = 0;

  if (nearest) {
    const dx = nearest.enemy.x - hero.x;
    const dy = nearest.enemy.y - hero.y;
    const radial = unit(dx, dy);

    if (nearest.range > options.approachRange) {
      x += radial.x;
      y += radial.y;
    } else if (nearest.range < options.retreatRange) {
      x -= radial.x * 1.15;
      y -= radial.y * 1.15;
    } else {
      const firstCharacter = String(nearest.enemy.id ?? "0").charCodeAt(0) || 0;
      const orbit = firstCharacter % 2 === 0 ? 1 : -1;
      x += -radial.y * 0.55 * orbit;
      y += radial.x * 0.55 * orbit;
    }
  }

  // Nearby enemies add local pressure, so the controller avoids standing
  // inside a cluster instead of only reacting to the single nearest target.
  for (const { enemy, range } of enemies) {
    if (range >= options.repulsionRange) continue;
    const away = unit(hero.x - enemy.x, hero.y - enemy.y);
    const pressure = ((options.repulsionRange - range) / options.repulsionRange) ** 2 * 1.5;
    x += away.x * pressure;
    y += away.y * pressure;
  }

  const shots = Array.isArray(battle.hostileShots) ? battle.hostileShots : [];
  shots.forEach((shot, index) => {
    const threat = projectileThreat(shot, hero, options, index);
    if (!threat) return;
    x += threat.x;
    y += threat.y;
  });

  // Keep the clone away from arena edges; no pathfinding grid is required.
  const margin = Math.max(1, options.edgeMargin);
  if (hero.x < margin) x += ((margin - hero.x) / margin) * 0.9;
  if (hero.x > options.width - margin) x -= ((hero.x - (options.width - margin)) / margin) * 0.9;
  if (hero.y < margin) y += ((margin - hero.y) / margin) * 0.9;
  if (hero.y > options.height - margin) y -= ((hero.y - (options.height - margin)) / margin) * 0.9;

  // Pick up nearby fragments only when no enemy is already in immediate reach.
  if (
    (!nearest || nearest.range > options.retreatRange + 12) &&
    Array.isArray(battle.drops) &&
    battle.drops.length
  ) {
    const drop = battle.drops
      .filter((item) => item && Number.isFinite(item.x) && Number.isFinite(item.y))
      .map((item) => ({ item, range: distance(hero, item) }))
      .sort((a, b) => a.range - b.range)[0];
    if (drop && drop.range > 0 && drop.range <= options.pickupRange) {
      const toward = unit(drop.item.x - hero.x, drop.item.y - hero.y);
      const attraction = 0.35 * (1 - drop.range / options.pickupRange);
      x += toward.x * attraction;
      y += toward.y * attraction;
    }
  }

  const magnitude = Math.hypot(x, y);
  if (!Number.isFinite(magnitude) || magnitude < 0.08) return { x: 0, y: 0 };
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  return {
    x: clamp(x * scale, -1, 1),
    y: clamp(y * scale, -1, 1),
  };
}

/**
 * AI fallback for a choice prompt. Defensive support is preferred when the
 * clone is already hurt, surrounded, or has an incoming projectile.
 */
export function chooseAutonomousEncounterSkill(
  battle,
  options = ["thunder", "rune"],
) {
  if (!battle?.skillChoicePending || !Array.isArray(options) || !options.length) {
    return null;
  }
  const available = options.filter((id) => typeof id === "string");
  if (!available.length) return null;

  const hero = battle.hero;
  const enemies = aliveEnemies(battle, hero);
  const closeThreats = enemies.filter((item) => item.range <= 78).length;
  const field = fieldOptions();
  const incoming = (battle.hostileShots || []).some((shot, index) =>
    Boolean(projectileThreat(shot, hero, field, index)),
  );
  const preferDefense =
    (Number.isFinite(hero?.hp) && hero.hp <= 3) ||
    closeThreats >= 2 ||
    incoming;
  const preferred = preferDefense ? "rune" : "thunder";
  return available.includes(preferred) ? preferred : available[0];
}

/** One read-only decision object for an AI-owned simulation tick. */
export function getAutonomousEncounterDecision(battle, field) {
  return {
    input: getAutonomousEncounterInput(battle, field),
    skillId: chooseAutonomousEncounterSkill(battle),
  };
}
