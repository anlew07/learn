/**
 * Small, purely cosmetic secrets. Triggers read existing run state and do not
 * consume RNG, AP, materials or event slots.
 *
 * Keep each id stable: saved games use these IDs to suppress repeats.
 */
export const EASTER_EGGS = Object.freeze({
  lingzai: Object.freeze({
    id: "lingzai/tea-break",
    minDay: 7,
    title: "修仙也要摸鱼",
    message: "彩蛋「修仙也要摸鱼」：分身刚摆好聚灵阵，灵兽却叼来一壶茶。阵法运转如常，今天的修行多了一点茶香。",
    eligible: (world) => world.level >= 2 && world.strategy === "growth",
  }),
  zombie: Object.freeze({
    id: "zombie/expired-coffee",
    minDay: 13,
    title: "末日便利店",
    message: "彩蛋「末日便利店」：废墟自动售货机还亮着灯，上面写着「末日特供咖啡，保质期：昨天」。分身决定只拍照留念。",
    eligible: (world) => world.level >= 2 && world.resource >= 6,
  }),
  beast: Object.freeze({
    id: "beast/dancing-beasts",
    minDay: 21,
    title: "兽潮蹦迪夜",
    message: "彩蛋「兽潮蹦迪夜」：远处兽群突然围着一块会发光的晶石整齐摇摆。分身默默记下：兽王的部下似乎也需要放假。",
    eligible: (world) => world.suppression >= 1,
  }),
});

export function previewEasterEgg(state, world) {
  const egg = EASTER_EGGS[world?.id];
  if (
    !state?.active ||
    world?.status !== "running" ||
    !egg ||
    state.day < egg.minDay ||
    world.flags?.easterEggs?.includes(egg.id) ||
    !egg.eligible(world)
  ) return null;
  return { id: egg.id, title: egg.title, message: egg.message };
}

/** The caller owns logging. This function only marks the discovered secret. */
export function discoverEasterEgg(state, world) {
  const egg = previewEasterEgg(state, world);
  if (!egg) return null;
  if (!world.flags) world.flags = {};
  if (!Array.isArray(world.flags.easterEggs)) world.flags.easterEggs = [];
  world.flags.easterEggs.push(egg.id);
  return egg;
}
