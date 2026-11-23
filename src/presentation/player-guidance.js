import { LABELS, POWERS, WORLDS } from "../config/game-data.js";

/**
 * Player-facing descriptions of existing rules.
 *
 * This module is deliberately read-only: callers inject the authoritative
 * Engine facade for previews, and own tutorial visibility outside the engine.
 * In particular, do not call step(), chooseAction() or any RNG here.
 */
export const PLAYER_GLOSSARY = Object.freeze([
  { id: "p", label: "救援准备", meaning: "原 P。达到100只代表主要准备完成，还要检查等级、材料和关键主线。" },
  { id: "d", label: "危机压力", meaning: "原 D。每天会受环境和持续威胁影响；达到100时世界失守。" },
  { id: "ap", label: "干预点", meaning: "原 AP。用于改变策略或执行跨世界干预；闭关预留的点数不能同时使用。" },
  { id: "level", label: "分身等级", meaning: "原 Lv。成长决定能否完成基础救援和应对部分战斗；临时借力不代替实际等级。" },
  { id: "resource", label: "世界物资", meaning: "每个世界使用自己的材料，最终行动也要消耗材料；跨世界援助不直接转移材料。" },
  { id: "aid", label: "跨界援助", meaning: "消耗来源世界的物资、干预点与灵魂强度，为另一世界减灾或推进准备。" },
  { id: "fusion", label: "灵魂借力", meaning: "在符合条件的关键战斗中临时提升有效战力，供力分身随后会短期减产。" },
  { id: "build", label: "战技搭配", meaning: "开启防线行动时可选择战技；影响当次自动战斗的表现和有限的额外收益。" },
  { id: "elite", label: "巢群首领", meaning: "持续威胁的关键挑战；清理外围后才会出现，无法应对时可撤离再准备。" },
]);

const STRATEGIES = Object.freeze({
  growth: {
    benefit: "分身更倾向训练成长，但仍会根据局势采集、探索或排险。",
    tradeoff: "训练会占用当天的主要行动，救援准备与排险可能推进得更慢。",
  },
  clear: {
    benefit: "分身更倾向排除危险、应对敌群，并获得战斗经历。",
    tradeoff: "把主要行动用于战斗，就减少了当天主动探索和准备的机会。",
  },
  rescue: {
    benefit: "分身更倾向调查线索、完善救援准备。",
    tradeoff: "如果忽略实际等级、材料和活跃威胁，即使准备达到100也可能无法救援。",
  },
});

const BUILD_KINDS = Object.freeze({
  clear: "偏向清理敌群；只有实际战斗表现达标才可能获得对应额外收益。",
  loot: "偏向收集物资；额外物资受战斗表现与单场上限约束。",
  defense: "偏向减少战斗损失及危机压力；效果受战况与单场上限约束。",
});

const ACTIONS = Object.freeze({
  growth: "训练成长",
  gather: "采集物资",
  fight: "排险战斗",
  explore: "寻找线索",
  rescue: "完善救援准备",
  repair: "修复防线",
  suppress: "压制兽王",
  retreat: "闭关修炼",
});

const EMPTY_CHOICES = () => ({
  strategies: [], events: [], builds: [], aid: [], fusion: [], retreats: [], echoes: [],
});

function validWorlds(state) {
  return Array.isArray(state?.worlds)
    ? state.worlds.filter((world) => world && WORLDS[world.id] && ["running", "saved", "failed"].includes(world.status))
    : [];
}

function runningWorlds(state) {
  return validWorlds(state).filter((world) => world.status === "running");
}

function number(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function display(value) {
  return String(Math.round(number(value) * 100) / 100);
}

function safePreview(callback, ...args) {
  return typeof callback === "function" ? callback(...args) : null;
}

export function getOpeningBrief(profile = {}) {
  const nextRun = Math.max(1, Math.floor(number(profile?.runCount)) + 1);
  return {
    title: "同一个意识，几处危局",
    lead: "你的一部分意识同时抵达不同的灾变世界。为何会发生这种联系，仍没有答案。",
    genre: "多世界自动生存模拟",
    mission: "尽可能帮助更多世界守住救援窗口，保留文明延续的希望。",
    automatic: "分身会按各自处境和长期策略，每个游戏日自主完成主要行动。你不需要每天替他们点击。",
    playerRole: "你决定长期策略、处理重要事件，并使用当前已开放的援助与战技。",
    stageHint: "分身自动行动；你负责策略、事件与援助。",
    stakes: "危机压力达到100或错过世界期限，救援就会失败；失败还会削弱共享的灵魂强度。",
    continuation: nextRun === 1
      ? "先守护一个世界。每成功拯救一个世界，新的世界就会加入；同时运行的世界逐步增加，最多三个。"
      : "成功拯救会让分身穿越到新世界，并逐步增加并行名额；最多同时守护三个世界。",
    shardNote: "世界碎片目前用于记录局外收获，不提供可购买的数值强化。",
    glossary: PLAYER_GLOSSARY,
  };
}

function recommendStrategy(world, info) {
  const checks = info?.finale?.checks || [];
  if (world.p >= 100 && checks.some((item) => item.id === "base-level" && !item.ready)) {
    return { id: "growth", reason: "准备已到终点，但实际等级未满足救援门槛。" };
  }
  if (world.d >= 75 && info?.threatActive && world.level >= 2) {
    return { id: "clear", reason: "危机偏高且有活跃巢群，排险值得优先考虑。" };
  }
  if (world.p < 100 && world.level >= 3) {
    return { id: "rescue", reason: "分身已有基础实力，当前还需寻找线索或完成准备。" };
  }
  return null;
}

export function getWorldGuidance(state, world, rules) {
  if (!world || !WORLDS[world.id] || !["running", "saved", "failed"].includes(world.status)) {
    return null;
  }
  const definition = WORLDS[world.id];
  const info = safePreview(rules?.info, state, world);
  const finale = info?.finale || null;
  const missing = Array.isArray(finale?.checks)
    ? finale.checks.filter((check) => !check.ready).map((check) => ({
      id: check.id, label: check.label, detail: check.detail,
    }))
    : [];
  const event = world.status === "running" ? safePreview(rules?.previewMajorEvent, state, world) : null;
  const daysLeft = Math.max(0, number(world.deadline) - number(state?.day));
  const threatActive = world.threat && world.threat.status !== "cleared";
  let focus = "";
  if (world.status === "saved") focus = "这里的救援已完成，留下的回响可能帮助其他世界。";
  else if (world.status === "failed") focus = "这里的救援窗口已经关闭；仍可复盘当时缺少的条件。";
  else if (event) focus = "重大事件正在等待处理；不操作也会在到期时按默认方式结算。";
  else if (world.d >= 90) focus = "危机已经逼近100失守线，优先查看能否减灾或排除持续威胁。";
  else if (daysLeft <= 8) focus = "距离世界期限不远，检查救援准备和最终资格的缺口。";
  else if (world.p >= 100 && missing.length) focus = "主要准备已完成，但还缺少最终救援所需的条件。";
  else if (world.p >= 100 && finale?.ready) focus = "最终条件已齐，分身将在游戏日结算时自动执行救援。";
  else if (world.p < 65) focus = "先找出灾变线索，分身会在成长与调查之间自主取舍。";
  else focus = "已定位关键线索，继续完善救援准备，同时留意物资和危险。";

  const lastDecision = world.lastDecision &&
    number(state?.day) - number(world.lastDecision.day, -100) <= 1 &&
    number(state?.day) >= number(world.lastDecision.day, -100)
    ? {
      actionId: world.lastDecision.actionId,
      actionLabel: ACTIONS[world.lastDecision.actionId] || world.action || "自主行动",
      reason: world.lastDecision.reason || "分身按当前策略和世界状况自行判断。",
    }
    : null;

  return {
    worldId: world.id,
    name: world.name || definition.name,
    status: world.status,
    headline: focus,
    rescue: { label: "救援准备", value: number(world.p) },
    danger: { label: "危机压力", value: number(world.d), lossAt: 100 },
    resource: { label: definition.resourceName, value: number(world.resource), finalCost: definition.finalCost },
    actualLevel: number(world.level),
    daysLeft,
    strategy: LABELS[world.strategy] || "未指定",
    currentlyDoing: world.action || "等待下一次自主行动",
    lastDecision,
    threat: threatActive ? {
      label: "持续威胁",
      stage: number(world.threat.progress),
      note: "巢群未解除前可能继续带来额外危机；排险也会占用当日主要行动。",
    } : null,
    finale: finale ? { ready: Boolean(finale.ready) && world.status === "running", missing, checks: finale.checks } : null,
    event: event ? {
      id: event.id, title: event.title, expiry: event.expiry,
      defaultOutcome: event.defaultOutcome,
    } : null,
    recommendation: world.status === "running" ? recommendStrategy(world, info) : null,
  };
}

export function getRunOverview(state, rules) {
  if (!state || !Array.isArray(state.worlds)) return null;
  const worlds = validWorlds(state);
  const running = worlds.filter((world) => world.status === "running");
  const saved = Number.isInteger(state.worldsSavedThisRun)
    ? state.worldsSavedThisRun : worlds.filter((world) => world.status === "saved").length;
  const failed = Number.isInteger(state.worldsFailedThisRun)
    ? state.worldsFailedThisRun : worlds.filter((world) => world.status === "failed").length;
  const total = Number.isInteger(state.worldsVisitedThisRun) ? state.worldsVisitedThisRun : worlds.length;
  const worldGuidance = running.map((world) => getWorldGuidance(state, world, rules));
  const urgent = worldGuidance.filter((item) => item.status === "running")
    .sort((a, b) =>
      Number(Boolean(b.event)) - Number(Boolean(a.event)) ||
      b.danger.value - a.danger.value ||
      a.daysLeft - b.daysLeft ||
      a.worldId.localeCompare(b.worldId));
  return {
    day: number(state.day, 1),
    active: Boolean(state.active),
    mode: state.waves ? "自动生存 + 防线战技" : "自动生存",
    rescued: saved,
    failed,
    ongoing: running.length,
    total,
    soul: number(state.soul),
    freeInterventionPoints: Math.max(0, number(state.ap) - number(state.apReserved)),
    headline: !state.active
      ? "这一轮救援已经结束，查看各世界的结果和下次可调整的地方。"
      : urgent.length
        ? "分身仍在自行行动；你现在最值得关注的是" + urgent[0].name + "。"
        : "目前没有仍在进行的世界，等待本局结果结算。",
    focusWorldId: urgent[0]?.worldId || null,
    dailyFlow: {
      automatic: "每个仍在运行且未闭关的世界，每游戏日自主执行一次主要行动；闭关会占用该行动。",
      player: "你可选择策略、重大事件、援助、借力和战技，不需要每天手动操作。",
      eventDefault: "重要事件到期会自动按既有规则处理；战技机会到期也会自动选择。",
    },
    worlds: worldGuidance,
  };
}

function eventCost(type, id, summary) {
  if (id === "safe" || id === "decline" || id === "retreat") return "不额外消耗干预点或材料。";
  if (id === "push") return "消耗1干预点；失败还有受伤和危机上升风险。";
  if (id === "boost") return "消耗1干预点与4份本世界材料，仅增强本次战斗。";
  if (id === "commit") return "消耗1干预点与3份本世界材料。";
  if (id === "fusion") return "消耗干预点与灵魂强度，并使供力者短期减产；以借力资格预览为准。";
  if (type === "boss" && id === "fight") return "不消耗干预点，但必须满足当前有效战力要求。";
  return summary?.includes("消耗") ? "以当前事件规则为准。" : "不额外消耗干预点或材料。";
}

function strategyChoices(state, world, rules) {
  const info = safePreview(rules?.info, state, world);
  const suggestion = recommendStrategy(world, info);
  return Object.keys(STRATEGIES).map((strategy) => {
    const preview = safePreview(rules?.previewStrategy, state, world.id, strategy);
    if (!preview) return null;
    return {
      kind: "strategy", worldId: world.id, choiceId: strategy,
      label: LABELS[strategy],
      available: Boolean(preview.available),
      blockedBy: preview.reason || "",
      recommended: suggestion?.id === strategy,
      recommendationReason: suggestion?.id === strategy ? suggestion.reason : "",
      why: STRATEGIES[strategy].benefit,
      potential: STRATEGIES[strategy].benefit,
      cost: preview.changed
        ? preview.cost === 0 ? "本次调整免费（前三个游戏日）。" : "本次调整消耗" + preview.cost + "干预点。"
        : "保持当前策略无需费用。",
      tradeoff: STRATEGIES[strategy].tradeoff,
      noAction: "沿用当前策略「" + (LABELS[world.strategy] || "未指定") + "」，分身继续自主判断。",
    };
  }).filter(Boolean);
}

function eventChoices(state, world, rules) {
  const preview = safePreview(rules?.previewMajorEvent, state, world);
  if (!preview || !Array.isArray(preview.options)) return [];
  return preview.options.map((choice) => ({
    kind: "event", worldId: world.id, eventId: preview.id, choiceId: choice.id,
    label: choice.label,
    available: Boolean(choice.available),
    blockedBy: choice.unavailableReason || "",
    recommended: false,
    why: "「" + preview.title + "」将在第" + preview.expiry + "日自动处理；这是可选干预。",
    potential: choice.summary,
    cost: eventCost(preview.type, choice.id, choice.summary),
    noAction: preview.defaultOutcome,
  }));
}

function buildChoices(state, world) {
  const pending = world.build?.pending;
  if (!state.waves || !pending || !Array.isArray(pending.options)) return [];
  const owned = [...(world.build.attack || []), ...(world.build.support || [])]
    .filter((item) => item && typeof item.id === "string").map((item) => item.id);
  return pending.options.map((id) => {
    const power = POWERS[world.id]?.find((entry) => entry.id === id);
    if (!power) return null;
    return {
      kind: "build", worldId: world.id, choiceId: id, label: power.name,
      available: true, blockedBy: "", recommended: false,
      why: "这项战技会加入分身的自动战斗搭配，不需要玩家手动出招。",
      potential: BUILD_KINDS[power.kind] || "效果取决于实际战斗表现。",
      cost: "本次选择不消耗干预点或材料；构筑机会有次数和槽位限制。",
      noAction: "第" + pending.due + "日将由分身自动挑选候选战技，模拟不会被阻塞。",
      alreadyOwned: owned.includes(id),
    };
  }).filter(Boolean);
}

function aidChoices(state, worlds, rules) {
  const result = [];
  for (const source of worlds) {
    for (const target of worlds) {
      if (source.id === target.id) continue;
      for (const mode of ["p", "d"]) {
        const preview = safePreview(rules?.previewAid, state, source.id, target.id, mode);
        if (!preview) continue;
        const delta = display(preview.actualDelta);
        result.push({
          kind: "aid", sourceId: source.id, worldId: target.id, choiceId: mode,
          label: mode === "p" ? "支援救援准备" : "支援减轻危机",
          available: Boolean(preview.available),
          blockedBy: preview.reason || "",
          recommended: false,
          why: "让" + source.name + "分担" + target.name + "的救援压力；不能直接转移物资。",
          potential: (mode === "p" ? "目标救援准备实际最多增加" : "目标危机压力实际最多降低") + delta + "，以本次预览为准。",
          cost: "来源消耗" + preview.resourceCost + "份材料、" + preview.apCost + "干预点和" + preview.soulCost + "灵魂强度。",
          tradeoff: preview.jeopardizesSourceFinale
            ? "警告：援助后来源世界的材料将不足以完成当前终局。"
            : "来源世界失去材料，可能影响后续救援准备。",
          noAction: "不发生本次跨界支援；两个世界仍按各自策略自主行动。",
          nextEligibleDay: preview.nextEligibleDay,
        });
      }
    }
  }
  return result;
}

function fusionChoices(state, worlds, rules) {
  return worlds.filter((world) =>
    (world.pendingEvent?.state === "active" && world.pendingEvent.type === "boss") || world.p >= 100
  ).map((world) => {
    const preview = safePreview(rules?.previewFusion, state, world.id);
    if (!preview) return null;
    return {
      kind: "fusion", worldId: world.id, choiceId: "fusion",
      label: preview.kind || "灵魂借力",
      available: Boolean(preview.available),
      blockedBy: preview.reason || "",
      recommended: false,
      why: "仅在符合条件的重大战斗中临时补足有效战力，不提高分身实际等级。",
      potential: preview.available
        ? "本次战斗有效战力提升" + preview.bonusLevel + "级；能否使用已由规则预览核对。"
        : "当前不具备借力资格。",
      cost: preview.available
        ? "消耗" + preview.apCost + "干预点和" + preview.soulCost + "灵魂强度，供力者未来3日减产，并进入冷却。"
        : "暂未执行，不消耗任何资源。",
      noAction: "保留灵魂强度和干预点，分身仍按自身战力尝试应对或等待下一次机会。",
    };
  }).filter(Boolean);
}

function retreatChoices(state, worlds) {
  return worlds.filter((world) => world.id === "lingzai").flatMap((world) => {
    if (world.retreat) {
      return [{
        kind: "exitRetreat", worldId: world.id, choiceId: "exit",
        label: "提前结束闭关",
        available: state.soul > 1,
        blockedBy: state.soul > 1 ? "" : "强行出关后必须至少保留1点灵魂强度。",
        recommended: false,
        why: "结束闭关，恢复正常的自主行动机会。",
        potential: "解除当前闭关，并释放已预留的1个干预点。",
        cost: "灵魂强度减少1，本世界危机压力增加8（受100上限限制）。",
        noAction: "继续闭关至剩余" + world.retreat.remaining + "个游戏日结束，期间仍承受环境压力。",
      }];
    }
    const allowed = world.level >= 2 && number(state.ap) - number(state.apReserved) >= 1;
    return [4, 6].map((duration) => ({
      kind: "retreat", worldId: world.id, choiceId: String(duration),
      label: duration === 4 ? "短期闭关" : "深度闭关",
      available: allowed,
      blockedBy: allowed ? "" : world.level < 2 ? "需要分身达到Lv2。" : "需要1个可预留的干预点。",
      recommended: false,
      why: "以数个游戏日的自主行动换取稳定训练，但危机不会暂停。",
      potential: duration === 4 ? "每个闭关日基础训练获得4成长经验，虚弱等状态会影响实际所得。"
        : "每个闭关日基础训练获得4.8成长经验，虚弱等状态会影响实际所得。",
      cost: "预留1干预点至出关，连续占用" + duration + "天主要行动；出关有受伤风险。",
      noAction: "继续正常自主行动，不预留干预点。",
    }));
  });
}

function echoChoices(state, worlds) {
  const echoes = Array.isArray(state.echoes) ? state.echoes : [];
  return echoes.filter((echo) => echo && !echo.used && WORLDS[echo.id]).flatMap((echo) =>
    worlds.filter((target) => target.id !== echo.id).map((target) => ({
      kind: "echo", sourceId: echo.id, worldId: target.id, choiceId: echo.id,
      label: WORLDS[echo.id].name + "的一次性回响",
      available: true, blockedBy: "", recommended: false,
      why: "让已经获救的世界把留下的经验与力量传给仍在求援的世界。",
      potential: echo.id === "lingzai" ? "目标危机压力降低最多10（最低为0）。"
        : echo.id === "zombie" ? "目标获得6份本世界物资。"
          : "目标获得8成长经验，有可能突破等级。",
      cost: "消耗这份回响一次，不占用干预点。",
      noAction: "保留回响，之后可以援助另一个仍在运行的世界。",
    }))
  );
}

export function getDecisionGuidance(state, rules) {
  const decisions = EMPTY_CHOICES();
  if (!state?.active) return decisions;
  const worlds = runningWorlds(state);
  for (const world of worlds) {
    decisions.strategies.push(...strategyChoices(state, world, rules));
    decisions.events.push(...eventChoices(state, world, rules));
    decisions.builds.push(...buildChoices(state, world));
  }
  decisions.aid = aidChoices(state, worlds, rules);
  decisions.fusion = fusionChoices(state, worlds, rules);
  decisions.retreats = retreatChoices(state, worlds);
  decisions.echoes = echoChoices(state, worlds);
  return decisions;
}

function tutorialCatalog(state) {
  const worlds = validWorlds(state);
  const active = worlds.filter((world) => world.status === "running");
  const crisis = active.find((world) =>
    world.d >= 65 || (world.threat && world.threat.status !== "cleared") ||
    world.pendingEvent?.state === "active"
  );
  const battle = worlds.find((world) =>
    world.lastCombat || number(world.metrics?.actions?.fight) > 0 ||
    world.lastDecision?.actionId === "fight" || Boolean(world.build?.pending)
  );
  return [
    {
      id: "arrival", available: true, title: "为什么有两个我？",
      text: "意识在不同世界醒来，原因仍是谜。分身会照顾眼前的人，你负责决定何时改变方向、何时伸出援手。",
      actionHint: "开始模拟，观察第一天会发生什么。",
    },
    {
      id: "first-day", available: Boolean(state && worlds.length && number(state.day) >= 1),
      title: "第一天：观察自主行动",
      text: "每天每个分身会自主选择训练、调查、采集或排险。你调整的是长期策略，重大事件和跨界援助才需要权衡是否干预。",
      actionHint: "查看任一世界的「正在进行」和「自主判断」，再决定是否更换策略。",
    },
    {
      id: "first-crisis", available: Boolean(crisis), title: "第一次危机：时间不是免费的",
      text: crisis
        ? crisis.name + "当前危机压力为" + display(crisis.d) + "。环境仍会施压；一次排险、训练或准备通常占用同一天的主要行动。"
        : "危机压力会逐日增长，持续威胁可能使局势恶化。援助和重大事件是可选干预，不必每天点击。",
      actionHint: "比较当前危险、世界期限和救援条件；查看重大事件不操作时的默认结局。",
    },
    {
      id: "first-battle", available: Boolean(battle), title: "第一次战斗：战技与生存相连",
      text: state?.waves
        ? "分身会自动排险，战技搭配影响三波战斗表现；实际清敌表现可带来有上限的成长、材料和减灾收益，不会额外占用一天。"
        : "排险是分身自动行动之一，可积累经验和材料、缓解部分危机；本局未开启三波防线战技模式。",
      actionHint: state?.waves
        ? "有战技候选时可主动选，也可等分身自动选择；查看战报中的实际额外收益。"
        : "观察排险后的等级、材料和危机变化，了解它为何会影响救援。",
    },
    {
      id: "first-ending", available: Boolean(state && state.active === false), title: "这一局结束了，下一步呢？",
      text: "查看每个世界的失败主因与剩余缺口。救援成功会留下回响；重开一局可以尝试另一种策略。世界碎片目前是记录，不是属性商店。",
      actionHint: "打开结算解释，选一项最想改变的决策再开始下一局。",
    },
  ];
}

/** seenIds/skipped are view preferences owned by UI; no save format changes. */
export function getTutorialGuidance(state, { seenIds = [], skipped = false } = {}) {
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  const steps = tutorialCatalog(state).map((step) => ({
    ...step, seen: seen.has(step.id),
  }));
  return {
    steps,
    current: skipped ? null : steps.find((step) => step.available && !step.seen) || null,
    skipped: Boolean(skipped),
    canSkip: true,
    canReview: true,
  };
}

function failureEvidence(state, world) {
  const logs = Array.isArray(state.logs) ? state.logs : [];
  const recent = [...logs].reverse().find((row) =>
    row && row.world === world.id &&
    typeof row.text === "string" &&
    (/救援未完成：/.test(row.text) || /灵魂支援耗尽/.test(row.text))
  );
  const message = recent?.text || "";
  if (message.includes("危机进度达到100%")) {
    return { id: "danger", text: "记录显示：危机压力达到100，救援窗口关闭。" };
  }
  if (message.includes("到达灾变截止日")) {
    return { id: "deadline", text: "记录显示：世界到达灾变截止日，救援未完成。" };
  }
  if (message.includes("灵魂支援耗尽")) {
    return { id: "soul", text: "记录显示：共享的灵魂强度耗尽，仍在运行的分身撤离。" };
  }
  return { id: "unknown", text: "结算记录没有足够信息判定单一失败原因；下列只是结束时的状态。" };
}

function worldOutcome(state, world, rules) {
  const definition = WORLDS[world.id];
  if (world.status === "saved") {
    return {
      worldId: world.id, name: world.name || definition.name,
      status: "saved", result: "救援完成",
      mainFactor: "该世界已通过引擎终局资格判定并完成救援。",
      observedGaps: [], nextTry: ["留意这次成功的准备顺序，并尝试把援助机会留给其他世界。"],
    };
  }
  const evidence = failureEvidence(state, world);
  const info = safePreview(rules?.info, state, world);
  const checks = info?.finale?.checks || [];
  const gaps = [];
  if (world.p < 100) gaps.push("结束时救援准备仅有" + display(world.p) + "/100。");
  if (!world.flags?.p65 || !world.flags?.p100) gaps.push("结束时关键主线标记尚未齐全。");
  if (world.level < 3) gaps.push("结束时实际等级Lv" + world.level + "，低于基础门槛Lv3。");
  if (world.resource < definition.finalCost) {
    gaps.push("结束时" + definition.resourceName + "为" + display(world.resource) + "，终局需要" + definition.finalCost + "。");
  }
  const combat = checks.find((item) => item.id === "combat");
  if (combat && !combat.ready) gaps.push("结束时终战有效战力尚未达标：" + combat.detail + "。");
  const logs = Array.isArray(state.logs) ? state.logs : [];
  if (logs.some((row) => row?.world === world.id && typeof row.text === "string" && row.text.includes("自动撤退"))) {
    gaps.push("本局曾出现因战力不足而自动撤离首领挑战的记录；不代表这是唯一败因。");
  }

  const nextTry = [];
  if (evidence.id === "danger") nextTry.push("提前关注持续威胁和减灾援助，不要等危机接近100才调整。");
  if (evidence.id === "deadline") nextTry.push("更早推进调查与救援准备，留出完成终局条件的时间。");
  if (evidence.id === "soul") nextTry.push("保留灵魂强度，评估连续援助和借力的共同消耗。");
  if (world.p < 100 || !world.flags?.p65 || !world.flags?.p100) {
    nextTry.push("在成长达标后尽早转向线索调查与救援准备。");
  }
  if (world.resource < definition.finalCost) nextTry.push("提前储备终局材料，避免跨界援助挤占来源世界的储备。");
  if (world.level < 3 || (combat && !combat.ready)) {
    nextTry.push("提早提升实际等级，并在终战前核对受伤、压制或合法借力条件。");
  }
  if (!nextTry.length) nextTry.push("下次对照最后几天的行动与事件记录，调整策略切换时机。");
  return {
    worldId: world.id, name: world.name || definition.name, status: "failed",
    result: "救援未完成",
    mainFactor: evidence.text,
    factorId: evidence.id,
    observedGaps: gaps,
    nextTry: [...new Set(nextTry)].slice(0, 3),
  };
}

export function getOutcomeGuidance(state, profile = {}, rules) {
  if (!state || state.active !== false || !Array.isArray(state.worlds)) return null;
  const worlds = validWorlds(state).filter((world) => world.status !== "running");
  const saved = worlds.filter((world) => world.status === "saved").length;
  const result = state.result || {};
  return {
    title: "这一轮，" + saved + "个世界守住了希望",
    summary: "每个世界的结局各自成立；未能救援的世界不会抹去其他世界的努力。",
    rescued: saved,
    failed: worlds.length - saved,
    endedDay: Number.isFinite(result.endedDay) ? result.endedDay : null,
    earnedShards: Number.isFinite(result.shards) ? result.shards : null,
    profileRuns: number(profile?.runCount),
    continuation: "再次出发可更换策略，第二局解锁灵魂借力，第三局增加生态守护世界。局外世界碎片暂不提供战力购买。",
    worlds: worlds.map((world) => worldOutcome(state, world, rules)),
  };
}

export function getPlayerGuidance(state, profile = {}, rules, tutorialOptions = {}) {
  return {
    opening: getOpeningBrief(profile),
    overview: getRunOverview(state, rules),
    choices: getDecisionGuidance(state, rules),
    tutorial: getTutorialGuidance(state, tutorialOptions),
    outcome: getOutcomeGuidance(state, profile, rules),
  };
}
