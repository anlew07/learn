import { SORTIE } from "../config/sortie-data.js";

export const TICK_MS = 1000 / SORTIE.ticksPerSecond;
export const DURATION_TICKS = SORTIE.durationSeconds * SORTIE.ticksPerSecond;

function hashSeed(input) {
  let hash = 2166136261;
  for (const letter of String(input)) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return hash >>> 0 || 1;
}
function random(battle) {
  let x = battle.rng;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  battle.rng = x >>> 0 || 1;
  return battle.rng / 4294967296;
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeSchedule(danger) {
  return SORTIE.waves.flatMap((wave) => {
    const count = wave.count + (wave.start === 50 ? (danger >= 75 ? 6 : danger >= 40 ? 3 : 0) : 0);
    return Array.from({ length: count }, (_, i) => ({
      tick: Math.round((wave.start + (i + 1) * wave.duration / (count + 1)) * SORTIE.ticksPerSecond),
      kind: wave.kinds[i % wave.kinds.length],
    }));
  });
}
export function createSortie(seed = "lingzai-demo", danger = 0, forgeLevel = 0, missionId = "safe", options = {}) {
  if (!SORTIE.mission.options.includes(missionId)) throw new Error("Invalid sortie mission");
  const skillReleaseMode = options?.skillReleaseMode ?? "auto";
  if (!["auto", "manual"].includes(skillReleaseMode)) throw new Error("Invalid skill release mode");
  const combatLevel = options?.combatLevel ?? 1;
  if (!Number.isInteger(combatLevel) || combatLevel < 1 || combatLevel > 4) {
    throw new Error("Invalid combat level");
  }
  const safeDanger = clamp(Number.isFinite(danger) ? danger : 0, 0, 100);
  if (!Number.isInteger(forgeLevel) || forgeLevel < 0 ||
    forgeLevel > SORTIE.forge.maxLevel) throw new Error("Invalid forge level");
  return {
    seed: String(seed), rng: hashSeed(seed), danger: safeDanger, tick: 0, remainderMs: 0,
    skillReleaseMode, combatLevel,
    maxHp: SORTIE.player.hp + combatLevel - 1,
    forgeLevel, weaponDamage: SORTIE.weapon.damage + forgeLevel * SORTIE.forge.damageBonus,
    hero: { x: SORTIE.player.x, y: SORTIE.player.y, hp: SORTIE.player.hp + combatLevel - 1, invulnerable: 0 },
    enemies: [], shots: [], hostileShots: [], schedule: makeSchedule(safeDanger), nextSpawn: 0,
    drops: [], collectedShards: 0,
    skillOffered: false, skillChoicePending: false, skillId: null,
    thunderNextTick: 0, thunderHits: 0, flashTargets: [], flashUntil: 0,
    runeShield: 0, runeNextTick: 0, shieldBlocks: 0,
    nextId: 1, nextShotTick: 1, fired: 0, defeated: 0, hurt: 0, outcome: "running", mission: createRecoveryMission(missionId),
  };
}
function spawnEnemy(battle, kind) {
  const edge = Math.floor(random(battle) * 4);
  const pos = 18 + random(battle) * (edge < 2 ? SORTIE.height - 36 : SORTIE.width - 36);
  const p = edge === 0 ? { x: 12, y: pos } : edge === 1 ? { x: SORTIE.width - 12, y: pos } :
    edge === 2 ? { x: pos, y: 12 } : { x: pos, y: SORTIE.height - 12 };
  battle.enemies.push({ id: battle.nextId++, kind, ...p, hp: SORTIE.enemies[kind].hp });
  if (kind === "shade") {
    const dx = battle.hero.x - p.x;
    const dy = battle.hero.y - p.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const speed = SORTIE.hostileProjectile.speed / SORTIE.ticksPerSecond;
    // Slow aimed projectile gives moving players an actual reason to dodge.
    battle.hostileShots.push({ x: p.x, y: p.y, vx: dx / length * speed,
      vy: dy / length * speed, ttl: SORTIE.hostileProjectile.ttlSeconds * SORTIE.ticksPerSecond });
  }
}
function moveHero(battle, input) {
  const dx = Number.isFinite(input?.x) ? input.x : 0;
  const dy = Number.isFinite(input?.y) ? input.y : 0;
  const magnitude = Math.hypot(dx, dy);
  if (!magnitude) return;
  const speed = SORTIE.player.speed / SORTIE.ticksPerSecond / Math.max(1, magnitude);
  const radius = SORTIE.player.radius;
  battle.hero.x = clamp(battle.hero.x + dx * speed, radius, SORTIE.width - radius);
  battle.hero.y = clamp(battle.hero.y + dy * speed, radius, SORTIE.height - radius);
}
function fire(battle) {
  if (battle.tick < battle.nextShotTick) return;
  const target = battle.enemies.map((enemy) => ({ enemy, range: distance(battle.hero, enemy) }))
    .filter(({ range }) => range <= SORTIE.weapon.range)
    .sort((a, b) => a.range - b.range || a.enemy.id - b.enemy.id)[0];
  if (!target) return;
  const dx = (target.enemy.x - battle.hero.x) / Math.max(0.001, target.range);
  const dy = (target.enemy.y - battle.hero.y) / Math.max(0.001, target.range);
  battle.shots.push({
    x: battle.hero.x, y: battle.hero.y,
    vx: dx * SORTIE.weapon.speed / SORTIE.ticksPerSecond,
    vy: dy * SORTIE.weapon.speed / SORTIE.ticksPerSecond,
    ttl: SORTIE.weapon.lifetimeSeconds * SORTIE.ticksPerSecond,
  });
  battle.fired++;
  battle.nextShotTick = battle.tick + Math.round(SORTIE.weapon.cooldownSeconds * SORTIE.ticksPerSecond);
}
function damageEnemy(battle, enemy, damage) {
  if (enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  if (enemy.hp === 0) {
    battle.defeated++;
    if (battle.defeated % SORTIE.rewards.defeatedPerShard === 0) {
      // The actual defeated position matters: players must approach the fragment.
      battle.drops.push({ id: enemy.id, x: enemy.x, y: enemy.y });
    }
  }
}

function collectFragments(battle) {
  const uncollected = [];
  for (const drop of battle.drops) {
    if (distance(drop, battle.hero) <= SORTIE.rewards.pickupRadius) {
      battle.collectedShards++;
    } else {
      uncollected.push(drop);
    }
  }
  battle.drops = uncollected;
}

function applySkillEffects(battle) {
  if (battle.skillReleaseMode === "manual") return;
  if (battle.skillId === "thunder" && battle.tick >= battle.thunderNextTick) {
    battle.thunderNextTick += Math.round(
      SORTIE.skills.thunderCooldownSeconds * SORTIE.ticksPerSecond,
    );
    const targets = battle.enemies
      .map((enemy) => ({ enemy, range: distance(enemy, battle.hero) }))
      .filter(({ enemy, range }) => enemy.hp > 0 && range <= SORTIE.skills.thunderRange)
      .sort((a, b) => a.range - b.range || a.enemy.id - b.enemy.id)
      .slice(0, SORTIE.skills.thunderTargets)
      .map(({ enemy }) => enemy);
    if (targets.length) {
      battle.flashTargets = targets.map(({ x, y }) => ({ x, y }));
      battle.flashUntil = battle.tick + 15;
      battle.thunderHits += targets.length;
      for (const enemy of targets) damageEnemy(battle, enemy, SORTIE.skills.thunderDamage);
      battle.enemies = battle.enemies.filter((enemy) => enemy.hp > 0);
    }
  }
  if (battle.skillId === "rune" && battle.tick >= battle.runeNextTick) {
    battle.runeNextTick += Math.round(
      SORTIE.skills.runeRechargeSeconds * SORTIE.ticksPerSecond,
    );
    battle.runeShield = 1;
  }
}

function advanceShots(battle) {
  for (const shot of battle.shots) {
    shot.x += shot.vx; shot.y += shot.vy; shot.ttl--;
    const victim = battle.enemies.find((enemy) =>
      enemy.hp > 0 && distance(shot, enemy) <= SORTIE.enemies[enemy.kind].radius + 3);
    if (victim) {
      damageEnemy(battle, victim, battle.weaponDamage);
      shot.ttl = 0;
    }
    if (shot.x < -10 || shot.x > SORTIE.width + 10 || shot.y < -10 || shot.y > SORTIE.height + 10) shot.ttl = 0;
  }
  battle.shots = battle.shots.filter((shot) => shot.ttl > 0);
  battle.enemies = battle.enemies.filter((enemy) => enemy.hp > 0);
}
function advanceHostileShots(battle) {
  let contact = false, guardContact = false;
  for (const shot of battle.hostileShots) {
    shot.x += shot.vx;
    shot.y += shot.vy;
    shot.ttl--;
    if (distance(shot, battle.hero) <= SORTIE.player.radius + 5) {
      shot.ttl = 0;
      contact = true; if (shot.missionGuard) guardContact = true;
    }
    if (shot.x < -10 || shot.x > SORTIE.width + 10 ||
        shot.y < -10 || shot.y > SORTIE.height + 10) shot.ttl = 0;
  }
  battle.hostileShots = battle.hostileShots.filter((shot) => shot.ttl > 0);
  return { contact, guardContact };
}
function advanceEnemies(battle) {
  for (const enemy of battle.enemies) {
    const dx = battle.hero.x - enemy.x;
    const dy = battle.hero.y - enemy.y;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    const step = Math.min(len, SORTIE.enemies[enemy.kind].speed / SORTIE.ticksPerSecond);
    enemy.x += dx / len * step; enemy.y += dy / len * step;
  }
}
/** No world-building slot is touched: this choice exists only during this sortie. */
export function chooseSortieSkill(battle, powerId) {
  if (!battle || battle.outcome !== "running" || !battle.skillChoicePending) {
    return { ok: false, error: "当前没有待选择的战技" };
  }
  if (!SORTIE.skills.options.includes(powerId)) {
    return { ok: false, error: "战技不在候选列表" };
  }
  battle.skillId = powerId;
  battle.skillChoicePending = false;
  if (battle.skillReleaseMode === "manual") {
    battle.thunderNextTick = battle.tick;
    battle.runeNextTick = battle.tick;
    return { ok: true, skillId: powerId };
  }
  if (powerId === "thunder") {
    battle.thunderNextTick = battle.tick +
      Math.round(SORTIE.skills.thunderCooldownSeconds * SORTIE.ticksPerSecond);
  }
  if (powerId === "rune") {
    battle.runeShield = 1;
    battle.runeNextTick = battle.tick +
      Math.round(SORTIE.skills.runeRechargeSeconds * SORTIE.ticksPerSecond);
  }
  return { ok: true, skillId: powerId };
}

/**
 * Manual-release mode separates choosing a power from deciding when to use it.
 * A failed cast (no target / existing shield / cooldown) never spends a charge.
 */
export function castSortieSkill(battle) {
  if (!battle || battle.outcome !== "running" || battle.skillChoicePending) {
    return { ok: false, error: "当前不能释放战技" };
  }
  if (battle.skillReleaseMode !== "manual") {
    return { ok: false, error: "当前战技采用自动释放" };
  }
  if (battle.skillId === "thunder") {
    if (battle.tick < battle.thunderNextTick) {
      return { ok: false, error: "驭雷符仍在冷却" };
    }
    const target = battle.enemies
      .map((enemy) => ({ enemy, range: distance(enemy, battle.hero) }))
      .filter(({ enemy, range }) =>
        enemy.hp > 0 && range <= SORTIE.skills.thunderRange,
      )
      .sort((a, b) => a.range - b.range || a.enemy.id - b.enemy.id)[0];
    if (!target) return { ok: false, error: "攻击范围内没有目标" };

    battle.thunderNextTick =
      battle.tick + Math.round(SORTIE.skills.thunderCooldownSeconds * SORTIE.ticksPerSecond);
    battle.flashTargets = [{ x: target.enemy.x, y: target.enemy.y }];
    battle.flashUntil = battle.tick + 15;
    battle.thunderHits++;
    damageEnemy(battle, target.enemy, SORTIE.skills.thunderDamage);
    battle.enemies = battle.enemies.filter((enemy) => enemy.hp > 0);
    return { ok: true, skillId: "thunder", targets: 1 };
  }
  if (battle.skillId === "rune") {
    if (battle.runeShield > 0) return { ok: false, error: "护盾尚未消耗" };
    if (battle.tick < battle.runeNextTick) {
      return { ok: false, error: "聚灵阵纹仍在充能" };
    }
    battle.runeNextTick =
      battle.tick + Math.round(SORTIE.skills.runeRechargeSeconds * SORTIE.ticksPerSecond);
    battle.runeShield = 1;
    return { ok: true, skillId: "rune", shield: 1 };
  }
  return { ok: false, error: "尚未选择战技" };
}

/** Manual retreat is an explicit end, unlike refreshing an uncommitted sandbox. */
export function retreatSortie(battle) {
  if (!battle || battle.outcome !== "running") {
    return { ok: false, error: "战斗已经结束" };
  }
  battle.outcome = "retreated";
  battle.skillChoicePending = false;
  battle.remainderMs = 0;
  return { ok: true };
}

/** One fixed 60 Hz simulation tick; this module never touches the official Engine. */
export function stepSortie(battle, input = { x: 0, y: 0 }) {
  if (battle.outcome !== "running" || battle.skillChoicePending) return battle;
  battle.tick++;
  moveHero(battle, input);
  while (battle.nextSpawn < battle.schedule.length &&
    battle.schedule[battle.nextSpawn].tick <= battle.tick &&
    battle.enemies.length < 24) {
    spawnEnemy(battle, battle.schedule[battle.nextSpawn].kind);
    battle.nextSpawn++;
  }
  advanceEnemies(battle);
  fire(battle);
  advanceShots(battle);
  applySkillEffects(battle);
  collectFragments(battle);
  const projectile = advanceHostileShots(battle);
  const touchingEnemies = battle.enemies.filter((enemy) =>
    distance(enemy, battle.hero) < SORTIE.player.radius + SORTIE.enemies[enemy.kind].radius);
  const bodyContact = touchingEnemies.length > 0;
  if (battle.hero.invulnerable > 0) battle.hero.invulnerable--;
  if (battle.hero.invulnerable === 0 && (bodyContact || projectile.contact)) {
    let damaged = bodyContact || projectile.contact;
    if (damaged && battle.runeShield > 0) {
      // One rune charge blocks the next damage source, including ranged projectiles.
      battle.runeShield = 0;
      battle.shieldBlocks++;
      battle.hero.invulnerable = Math.round(
        SORTIE.player.hurtSeconds * SORTIE.ticksPerSecond,
      );
      damaged = false;
    }
    if (damaged) {
      battle.hero.hp--;
      battle.hurt++;
      if (touchingEnemies.some((enemy) => enemy.missionGuard) || projectile.guardContact) {
        battle.mission.guardDamage++;
      }
      battle.hero.invulnerable = Math.round(SORTIE.player.hurtSeconds * SORTIE.ticksPerSecond);
      if (battle.hero.hp <= 0) battle.outcome = "lost";
    }
  }
  advanceRecoverySite(battle);
  if (battle.tick >= DURATION_TICKS && battle.outcome === "running") battle.outcome = "won";
  if (battle.outcome === "running" && !battle.skillOffered &&
    battle.tick >= SORTIE.skills.choiceSeconds * SORTIE.ticksPerSecond) {
    battle.skillOffered = true;
    battle.skillChoicePending = true;
  }
  return battle;
}
/** Rendering cadence never changes the fixed-tick battle result. */
export function advanceSortie(battle, input, deltaMs, onTick) {
  if (battle.outcome !== "running" || battle.skillChoicePending ||
    !Number.isFinite(deltaMs) || deltaMs <= 0) return battle;
  battle.remainderMs += Math.min(deltaMs, 250);
  const steps = Math.floor((battle.remainderMs + 1e-7) / TICK_MS);
  battle.remainderMs -= steps * TICK_MS;
  for (let i = 0; i < steps && battle.outcome === "running" && !battle.skillChoicePending; i++) {
    stepSortie(battle, input);
    if (onTick) onTick(battle, input);
  }
  if (battle.outcome !== "running" || battle.skillChoicePending) battle.remainderMs = 0;
  return battle;
}

export function createRecoveryMission(missionId) {
  return {
    id: missionId,
    status: missionId === "salvage" ? "scheduled" : "inactive",
    x: SORTIE.mission.x, y: SORTIE.mission.y,
    appearsAtTick: SORTIE.mission.appearsAtSeconds * SORTIE.ticksPerSecond,
    expiresAtTick: SORTIE.mission.expiresAtSeconds * SORTIE.ticksPerSecond,
    collectRadius: SORTIE.mission.collectRadius,
    requiredTicks: SORTIE.mission.collectSeconds * SORTIE.ticksPerSecond,
    progressTicks: 0, firstContactTick: null, completedTick: null,
    guardTriggeredTick: null, guardCount: 0, guardDamage: 0,
  };
}

/**
 * An optional recovery site. Guardians are real wolf/shade enemies with the
 * original collision, weapons, projectiles and defeat/shard mechanics.
 * None are created in the safe mission.
 */
function spawnMissionGuard(battle, kind, x, y) {
  const position = {
    x: clamp(x, 14, SORTIE.width - 14),
    y: clamp(y, 14, SORTIE.height - 14),
  };
  const guard = {
    id: battle.nextId++, kind, ...position,
    hp: SORTIE.enemies[kind].hp, missionGuard: true,
  };
  battle.enemies.push(guard);
  if (kind === "shade") {
    const dx = battle.hero.x - position.x;
    const dy = battle.hero.y - position.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const speed = SORTIE.hostileProjectile.speed / SORTIE.ticksPerSecond;
    battle.hostileShots.push({
      x: position.x, y: position.y,
      vx: dx / length * speed, vy: dy / length * speed,
      ttl: SORTIE.hostileProjectile.ttlSeconds * SORTIE.ticksPerSecond,
      missionGuard: true,
    });
  }
}

function advanceRecoverySite(battle) {
  const mission = battle.mission;
  if (mission.id !== "salvage" ||
    mission.status === "completed" || mission.status === "expired") return;
  if (battle.tick < mission.appearsAtTick) return;
  if (battle.tick >= mission.expiresAtTick) {
    mission.status = "expired";
    mission.progressTicks = 0;
    return;
  }
  if (mission.status === "scheduled") mission.status = "available";
  const range = distance(battle.hero, mission);
  if (mission.guardTriggeredTick === null && range <= SORTIE.mission.guardTriggerRadius) {
    mission.guardTriggeredTick = battle.tick;
    // Three nearby, normal enemies at D40; four at D75, two at D0.
    const count = battle.danger >= 75 ? 4 : battle.danger >= 40 ? 3 : 2;
    const offsets = [
      { x: -28, y: -12 }, { x: 25, y: 18 },
      { x: 10, y: -32 }, { x: -19, y: 32 },
    ];
    for (let i = 0; i < count; i++) {
      spawnMissionGuard(battle, i % 2 ? "shade" : "wolf",
        mission.x + offsets[i].x, mission.y + offsets[i].y);
    }
    mission.guardCount = count;
  }
  if (range > mission.collectRadius || battle.outcome !== "running") {
    mission.progressTicks = 0;
    return;
  }
  if (mission.firstContactTick === null) mission.firstContactTick = battle.tick;
  mission.progressTicks++;
  if (mission.progressTicks >= mission.requiredTicks) {
    mission.status = "completed";
    mission.completedTick = battle.tick;
  }
}

