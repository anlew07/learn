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

/** Read-only run collection. Missing worlds stay locked until that run unlocks them. */
export function summarizeEasterEggCollection(state) {
  const entries = (state?.worlds || []).map((world) => {
    const definition = EASTER_EGGS[world.id];
    if (!definition) return null;
    const found = Boolean(world.flags?.easterEggs?.includes(definition.id));
    return {
      worldId: world.id,
      worldName: world.name,
      id: definition.id,
      found,
      title: found ? definition.title : "？？？",
      detail: found ? definition.message : "尚未发现：留意世界成长与特殊经历。",
    };
  }).filter(Boolean);
  const found = entries.filter((entry) => entry.found).length;
  return {
    found,
    total: entries.length,
    complete: entries.length === 3 && found === 3,
    entries,
  };
}

/** Independent, non-rewarding combinations of existing world discoveries. */
export const CROSSWORLD_SECRETS = Object.freeze([
  Object.freeze({
    id: "crossworld/tea-and-coffee",
    worlds: Object.freeze(["lingzai", "zombie"]),
    title: "末日茶咖会",
    message: "跨世界彩蛋「末日茶咖会」：修仙分身贡献灵茶，废土分身贡献过期咖啡。灵魂会议最终决定：这两样还是不要混着喝。",
  }),
  Object.freeze({
    id: "crossworld/three-world-party",
    worlds: Object.freeze(["lingzai", "zombie", "beast"]),
    title: "三个我都不想加班",
    message: "跨世界彩蛋「三个我都不想加班」：灵茶、咖啡和会跳舞的兽群在灵魂记忆中碰头。三位分身一致通过了末日休假提案。",
  }),
]);

function hasAllClues(state, worlds) {
  return worlds.every((id) => {
    const world = state?.worlds?.find((item) => item.id === id);
    return Boolean(world?.flags?.easterEggs?.includes(EASTER_EGGS[id].id));
  });
}

export function previewCrossworldSecrets(state) {
  if (!state?.active) return [];
  return CROSSWORLD_SECRETS.filter((secret) =>
    hasAllClues(state, secret.worlds) && !state.crossworldSecrets?.includes(secret.id),
  );
}

/** Record secrets once, even if a legacy save omitted the new collection field. */
export function discoverCrossworldSecrets(state) {
  const available = previewCrossworldSecrets(state);
  if (!available.length) return [];
  if (!Array.isArray(state.crossworldSecrets)) state.crossworldSecrets = [];
  for (const secret of available) state.crossworldSecrets.push(secret.id);
  return available;
}

/** A pure collection summary, suitable for display in archived completed runs. */
export function summarizeCrossworldSecrets(state) {
  return CROSSWORLD_SECRETS
    .filter((secret) => secret.worlds.every((id) => state?.worlds?.some((world) => world.id === id)))
    .map((secret) => {
      const found = Boolean(state?.crossworldSecrets?.includes(secret.id));
      return {
        id: secret.id,
        found,
        title: found ? secret.title : "？？？",
        detail: found ? secret.message : "尚未发现：试着在不同世界收集隐藏经历。",
      };
    });
}
