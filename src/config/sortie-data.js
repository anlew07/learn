/** Experimental battle values. No official simulation or save economy changes. */
export const SORTIE = Object.freeze({
  width: 320,
  height: 448,
  durationSeconds: 75,
  ticksPerSecond: 60,
  player: Object.freeze({ x: 160, y: 224, radius: 11, hp: 8, speed: 95, hurtSeconds: 1 }),
  weapon: Object.freeze({ cooldownSeconds: 0.7, range: 128, speed: 220, damage: 1, lifetimeSeconds: 1 }),
  enemies: Object.freeze({
    wolf: Object.freeze({ name: "裂纹妖狼", hp: 2, speed: 34, radius: 11 }),
    shade: Object.freeze({ name: "游离妖影", hp: 1, speed: 48, radius: 9 }),
  }),
  waves: Object.freeze([
    Object.freeze({ start: 0, count: 6, duration: 25, kinds: ["wolf"] }),
    Object.freeze({ start: 25, count: 8, duration: 25, kinds: ["wolf", "shade"] }),
    Object.freeze({ start: 50, count: 10, duration: 25, kinds: ["wolf", "shade"] }),
  ]),
});
