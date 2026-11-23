/**
 * Small, capped permanent doctrines carried between expeditions.
 * Each expedition can equip exactly one doctrine; effects are applied only
 * when Engine.fresh creates a new RunState.
 */
export const LEGACY_DOCTRINES = Object.freeze([
  Object.freeze({
    id: "supply",
    title: "余烬行囊",
    branch: "生存准备",
    cost: 4,
    minRuns: 0,
    description: "每个新世界开局多携带一份基础物资。",
    effectLabel: "各世界初始物资 +1",
    startingResource: 1,
  }),
  Object.freeze({
    id: "soul",
    title: "同源回响",
    branch: "灵魂联结",
    cost: 6,
    minRuns: 1,
    description: "每次新远征开始时，额外储备一点灵魂。",
    effectLabel: "初始灵魂 +1",
    startingSoul: 1,
  }),
  Object.freeze({
    id: "command",
    title: "前线预案",
    branch: "战术调度",
    cost: 8,
    minRuns: 2,
    description: "新远征开始时，额外获得一点可用干预点。",
    effectLabel: "初始干预点 AP +1",
    startingAP: 1,
  }),
]);

export function getLegacyDoctrine(id) {
  return LEGACY_DOCTRINES.find((item) => item.id === id) ?? null;
}
