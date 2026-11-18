import "./sortie.css";
import { createSortie, advanceSortie, DURATION_TICKS, chooseSortieSkill, retreatSortie } from "./systems/sortie-sim.js";
import { POWERS } from "./config/game-data.js";
import { SORTIE } from "./config/sortie-data.js";
import { drawSortie } from "./ui/sortie-stage.js";
import { createExclusiveSession } from "./services/exclusive-session.js";
import { sortieRepository } from "./services/sortie-persistence.js";
import {
  createSortieArchive, recoverSortieArchive,
  prepareSortieArchive, settleSortieArchive,
  previewSortieForge, buildSortieForge,
  previewSortieCampAllocation, selectSortieCampMission,
} from "./systems/sortie-session.js";

const skillHints = {
  thunder: "每" + SORTIE.skills.thunderCooldownSeconds + "秒对最多" +
    SORTIE.skills.thunderTargets + "名附近敌人各造成" +
    SORTIE.skills.thunderDamage + "点伤害",
  rune: "立即获得一层护盾，每" + SORTIE.skills.runeRechargeSeconds +
    "秒重新充能，抵挡一次受击（包括远程灵息弹）",
};
const skillRoles = { thunder: "主动进攻", rune: "防护生存" };
const powerName = (id) => POWERS.lingzai.find((power) => power.id === id)?.name ?? id;
const skillCards = SORTIE.skills.options.map((id) =>
  '<button type="button" class="sortie-skill-card" data-sortie-skill="' + id +
    '"><strong>' + powerName(id) + " · " + skillRoles[id] + '</strong><span>' + skillHints[id] +
    '</span></button>'
).join("");

const app = document.querySelector("#app");
app.className = "";
app.innerHTML = [
  '<main class="sortie-root" data-sortie-root>',
  '<header class="sortie-head"><div><strong>灵灾 · 雾谷试炼</strong><small>移动避险 · 自动灵刃 · 战技构筑</small></div>',
  '<a href="./">返回正式模拟器</a></header>',
  '<section class="sortie-intro" data-sortie-intro>',
  '<h1>出击雾谷</h1>',
  '<p class="sortie-objective"><strong>本场目标：坚持 ' + SORTIE.durationSeconds +
    ' 秒</strong><span>拖动移动躲避灵息弹，灵刃自动攻击；倒计时归零即完成试炼。</span></p>',
  '<p class="sortie-intro-tip">第 ' + SORTIE.skills.choiceSeconds +
    ' 秒自动暂停选择战技。靠近金色碎片可拾取，' +
    SORTIE.rewards.shardsPerStone + ' 片兑换 1 灵石（最多兑换 ' +
    SORTIE.rewards.maxShardStones + ' 灵石）。</p>',
  '<p class="sortie-entry-growth" data-sortie-entry-growth>先看实际资源，再决定保留还是修剑台。</p>',
  '<button class="sortie-cta" data-start-sortie>▶ 保留当前灵石 · 稳妥出击</button>',
  '<section class="sortie-2l-missions" aria-label="出击任务选择">',
  '<strong>本场任务 · 先选择风险</strong>',
  '<p data-sortie-safe-mission>稳妥巡护：撑满 75 秒，生存奖励 3 石；普通碎片最多换 2 石。</p>',
  '<button type="button" data-sortie-mission-safe>选择稳妥巡护 · 无额外任务费</button>',
  '<p class="sortie-2l-unavailable" data-sortie-salvage-description>险地回收：需接触回收点、面对守卫，未完成或撤离不领额外奖金；当前未接通。</p>',
  '<button type="button" data-sortie-mission-salvage disabled>险地回收 · 等待权威战场接入</button>',
  '</section>',
  '<section class="sortie-2l-allocation" aria-label="营地资源抉择">',
  '<strong>营地资金安排</strong><p data-sortie-budget>正在读取资源与费用……</p>',
  '<p data-sortie-keep-preview>保留全部灵石，不增加当前风险和额外收益。</p>',
  '<p data-sortie-prepare-preview>一次性回收信标：尚未启用，不能扣费。</p>',
  '<p class="sortie-2l-unavailable">回收信标为独立影子实验，不会出现在正式可购买按钮中。</p>',
  '</section>',

  '<div class="sortie-camp" data-sortie-camp>',
  '<strong>尚未取得营地状态</strong><span>灵灾与废土会在每次完整出击后共同推进一日</span>',
  '<p data-sortie-last-receipt>尚无已提交的出击回执</p></div>',
  '<section class="sortie-forge" data-sortie-forge data-level="0">',
  '<div class="sortie-forge-top"><div class="sortie-forge-pedestal" aria-hidden="true">✦</div>',
  '<div><strong>护灵剑台 · 待修复</strong><p data-sortie-forge-state>残破的基座等待灵石修复</p></div></div>',
  '<p data-sortie-forge-preview>初始灵刃 1 伤害，修复后 2 伤害</p>',
  '<button type="button" data-sortie-build hidden>消耗 6 灵石 · 修复护灵剑台</button>',
  '<small>灵石同时用于终局封印；修复后不可拆除退款。</small>',
  '</section>',
  '<p class="sortie-warning">本模式不读取、写入正式存档；收益和剑台仅存独立试验档。出击结束推进双世界一天，营地建设不推进世界日。</p></section>',
  '<section class="sortie-session-notice" data-sortie-session-notice role="status"></section>',
  '<section class="sortie-play" data-sortie-play hidden>',
  '<div class="sortie-stats"><span data-sortie-hp>生命 8/8</span>',
  '<span data-sortie-time>剩余 75 秒</span><span data-sortie-defeated>击退 0</span></div>',
  '<div class="sortie-timebar" data-sortie-timebar role="progressbar" aria-label="试炼剩余时间" aria-valuemin="0" aria-valuemax="75" aria-valuenow="75" aria-valuetext="剩余 75 秒"><span data-sortie-time-fill></span></div>',
  '<div class="sortie-goal" data-sortie-goal>目标：撑到 0 秒 · 走位避险，靠近碎片拾取</div>',
  '<div class="sortie-lootbar"><span data-sortie-loot>碎片 0 · 灵石兑换 0/2</span>',
  '<span data-sortie-power>战技：待觉醒</span></div>',
  '<div class="sortie-field"><canvas width="320" height="448" data-sortie-canvas role="img"',
  ' aria-label="雾谷战场：分身、敌人和自动飞行的灵刃"></canvas>',
  '<div class="sortie-combat-feedback" data-sortie-feedback role="status" aria-live="polite" hidden></div>',
  '<div class="sortie-pause-overlay" data-sortie-paused hidden role="status" aria-live="polite">',
  '<strong>试炼已暂停</strong><span>点击「继续试炼」恢复行动</span></div></div>',
  '<div class="sortie-controls"><div class="sortie-joystick" data-sortie-joystick',
  ' role="group" aria-label="移动摇杆：按住拖动移动；键盘也支持方向键或 WASD" aria-describedby="sortie-control-hint">',
  '<span class="sortie-knob" data-sortie-knob></span></div>',
  '<div class="sortie-actions"><button type="button" data-sortie-pause aria-pressed="false">暂停</button>',
  '<button type="button" data-sortie-retreat>撤离</button>',
  '<small id="sortie-control-hint">左侧走位 · 自动攻击</small></div></div>',
  '<div class="sortie-dialog-overlay" data-sortie-choice hidden>',
  '<section class="sortie-modal" role="dialog" aria-modal="true" aria-labelledby="sortie-choice-title">',
  '<h2 id="sortie-choice-title">战技觉醒 · 选择一项</h2>',
  '<p class="sortie-choice-state" data-sortie-choice-state>战斗时间已冻结，计时暂停。选择一种战技后继续，本场有效。</p>',
  '<p class="sortie-choice-hint">偏进攻选驭雷符，偏保命选聚灵阵纹；两者只能选一个。</p>',
  skillCards,
  '<button data-sortie-default class="sortie-default">使用默认战技：驭雷符</button>',
  '</section></div>',
  '<div class="sortie-dialog-overlay" data-sortie-confirm hidden>',
  '<section class="sortie-modal" role="dialog" aria-modal="true" aria-labelledby="sortie-retreat-title">',
  '<h2 id="sortie-retreat-title">确定撤离雾谷？</h2>',
  '<p>撤离仍消耗本日唯一行动，不获得生存基础奖；拾到的碎片会结算进独立试验档。</p>',
  '<div class="sortie-confirm-buttons"><button data-sortie-confirm-no>继续探索</button>',
  '<button data-sortie-confirm-yes>确定撤离</button></div>',
  '</section></div></section>',
  '<section class="sortie-results" data-sortie-results hidden>',
  '<div class="sortie-results-content">',
  '<h1 data-sortie-outcome>试炼结束</h1><p class="sortie-feedback" data-sortie-summary></p>',
  '<div class="sortie-result-gains" data-sortie-gains aria-label="本场结算收益" hidden></div>',
  '<p data-sortie-reward-preview>战斗结束，正在验证轨迹与写入独立试验档……</p>',
  '<div class="sortie-world-report" data-sortie-world-report></div>',
  '<p>收益已结算进独立试验档，仅供可玩性验证；正式存档与世界碎片不受影响。</p>',
  '</div><button class="sortie-cta" data-sortie-retry>返回营地</button></section></main>',
].join("");

const intro = app.querySelector("[data-sortie-intro]");
const play = app.querySelector("[data-sortie-play]");
const results = app.querySelector("[data-sortie-results]");
const canvas = app.querySelector("[data-sortie-canvas]");
const health = app.querySelector("[data-sortie-hp]");
const remaining = app.querySelector("[data-sortie-time]");
const timebar = app.querySelector("[data-sortie-timebar]");
const timeFill = app.querySelector("[data-sortie-time-fill]");
const pauseOverlay = app.querySelector("[data-sortie-paused]");
const defeated = app.querySelector("[data-sortie-defeated]");
const pauseButton = app.querySelector("[data-sortie-pause]");
const lootText = app.querySelector("[data-sortie-loot]");
const goalText = app.querySelector("[data-sortie-goal]");
const eventText = app.querySelector("[data-sortie-feedback]");
const choiceState = app.querySelector("[data-sortie-choice-state]");
const gains = app.querySelector("[data-sortie-gains]");
const entryGrowth = app.querySelector("[data-sortie-entry-growth]");
const campBudget = app.querySelector("[data-sortie-budget]");
const keepPreview = app.querySelector("[data-sortie-keep-preview]");
const prepPreview = app.querySelector("[data-sortie-prepare-preview]");
const missionSafeButton = app.querySelector("[data-sortie-mission-safe]");
const missionSalvageButton = app.querySelector("[data-sortie-mission-salvage]");
const salvageDescription = app.querySelector("[data-sortie-salvage-description]");
const powerText = app.querySelector("[data-sortie-power]");
const skillOverlay = app.querySelector("[data-sortie-choice]");
const retreatOverlay = app.querySelector("[data-sortie-confirm]");
const rewardText = app.querySelector("[data-sortie-reward-preview]");
const worldReport = app.querySelector("[data-sortie-world-report]");
const camp = app.querySelector("[data-sortie-camp]");
const lastReceipt = app.querySelector("[data-sortie-last-receipt]");
const forgePanel = app.querySelector("[data-sortie-forge]");
const forgeState = app.querySelector("[data-sortie-forge-state]");
const forgePreview = app.querySelector("[data-sortie-forge-preview]");
const forgeButton = app.querySelector("[data-sortie-build]");
const sessionNotice = app.querySelector("[data-sortie-session-notice]");
const startButton = app.querySelector("[data-start-sortie]");
const joystick = app.querySelector("[data-sortie-joystick]");
const knob = app.querySelector("[data-sortie-knob]");
const keys = new Set();

let battle = null;
let phase = "intro";
let paused = false;
let pointerId = null;
let pointerVector = { x: 0, y: 0 };
let frameId = 0;
let lastFrame = null;
let retreatWasPaused = false;
let archive = null;
let actions = [];
let savedSeed = null;
let savedDanger = 0;
let savedForgeLevel = 0;
let savedMissionId = "safe";
let sessionMode = "starting";
let writeBusy = false;
let pendingWrite = null;
let writeError = null;
let restoreError = null;
let recoveryMessage = "";
let lastVisualStats = null;
let feedbackUntilTick = -1;

const session = createExclusiveSession({
  onLost() {
    sessionMode = "readonly";
    if (phase === "battle") pause();
    updateCamp();
  },
});

function worldLine(world) {
  if (!world) return "暂无世界信息";
  return world.id === "lingzai" ?
    "灵灾 · " + world.status + " · Lv" + world.level +
    " · 灵石 " + world.resource + " · 准备 " + world.p + "% · 风险 " + world.d + "%" :
    "废土救援 · " + world.status + " · Lv" + world.level +
    " · 零件 " + world.resource + " · 准备 " + world.p + "% · 风险 " + world.d + "%";
}

function updateCamp() {
  if (archive?.run) {
    const run = archive.run;
    const [ling, zombie] = run.worlds;
    camp.querySelector("strong").textContent = "营地 · 第 " + run.day + " 日（世界时间在营地冻结）";
    camp.querySelector("span").textContent = worldLine(ling) + "｜" + worldLine(zombie);
    const prior = archive.lastReceipt;
    lastReceipt.textContent = prior ?
      "已保存的第 " + prior.day + " 日回执：灵石 +" + prior.battle.stones +
      "，经验 +" + prior.battle.experience +
      "，灵刃 " + (prior.battle.weaponDamage ?? 1) + " 伤害，击退 " +
      prior.battle.defeated + "；废土当日行动：" +
      (prior.worlds[1]?.actionId || "无") +
      "。重新打开页面不会重复结算。" : "尚无已提交的出击回执";
    const forge = previewSortieForge(archive);
    const allocation = previewSortieCampAllocation(archive);
    const selected = archive.run.sortieCamp?.missionSelection;
    const selectedToday = selected?.day === run.day;
    const chosenMission = selectedToday ? selected.missionId : "safe";
    campBudget.textContent = "第 " + allocation.day + " 日 · 可用 " + allocation.stones +
      " 灵石；剑台费用 " + allocation.forge.cost + "，" +
      (allocation.forge.stones >= allocation.forge.cost ?
        "付费后剩余 " + allocation.forge.remaining : "目前还差 " +
          (allocation.forge.cost - allocation.forge.stones)) + "。";
    keepPreview.textContent = "保留资源：费用 0，剩余 " + allocation.keep.remaining +
      " 灵石；下场按原规则出击，无额外增益或惩罚。";
    prepPreview.textContent = "候选回收信标：费用 " + allocation.beacon.cost +
      "，若购买将剩余 " + allocation.beacon.remaining + "；" +
      allocation.beacon.effect + "。当前禁止付款：" + allocation.beacon.reason + "。";
    missionSafeButton.textContent = selectedToday && chosenMission === "safe" ?
      "已选稳妥巡护 · 记录已存档" : "选择稳妥巡护（默认）";
    missionSalvageButton.textContent = selectedToday && chosenMission === "salvage" ?
      "已选险地回收 · 记录已存档" : allocation.salvage.available ?
        "选择险地回收 · 候选成功奖金 +" + allocation.salvage.rewardCandidate :
        "险地回收 · 等待权威战场接入";
    salvageDescription.textContent = allocation.salvage.available ?
      "险地回收有额外守卫；走到地图中的回收点停留 1 秒并活到 75 秒，才有候选奖金 +" +
        allocation.salvage.rewardCandidate + " 灵石；未完成、失败或撤离不领任务奖金。" :
      "险地回收：需额外走位、接触实物回收点并面对守卫。" +
        allocation.salvage.reason + "；本分支不可启动该任务，也不发额外灵石。";
    const locked = !session.isOwner || writeBusy || Boolean(writeError) ||
      Boolean(restoreError) || phase !== "intro";
    missionSafeButton.disabled = !allocation.safe.available || locked ||
      (selectedToday && chosenMission !== "safe");
    missionSalvageButton.disabled = !allocation.salvage.available || locked ||
      (selectedToday && chosenMission !== "salvage");
    startButton.textContent = "▶ 保留 " + allocation.keep.remaining + " 灵石 · " +
      (chosenMission === "salvage" ? "险地回收" : "稳妥出击");
    forgePanel.dataset.level = String(forge.level);
    entryGrowth.textContent = forge.built ?
      "剑台已修复：下一场灵刃伤害 1 → " + forge.nextDamage + "；留意实际击退与资源回报。" :
      "首场后通常已能负担修复剑台的 " + forge.cost + " 灵石；请在保留资源与真实付费强化之间选择。";
    forgePanel.querySelector("strong").textContent = forge.built ?
      "护灵剑台 · 已修复" : "护灵剑台 · 待修复";
    forgeState.textContent = forge.built ? "剑台已点亮 · 灵刃基础伤害 1 → 2" :
      "残破的基座 · 完成首场出击后可投入灵石";
    forgePreview.textContent = forge.built ?
      "下次出击灵刃伤害 " + forge.nextDamage +
      "（妖狼从 2 次命中缩短到 1 次）；是否增加灵石以实际战果为准" :
      (forge.available ?
        "投入 " + forge.cost + " 灵石后剩余 " + forge.remaining +
        "；灵刃伤害 1 → " + forge.nextDamage +
        "，但到第六场的既有试验尚未证明回本" :
        (forge.reason || "首次出击后解锁") + "；修复费用 " + forge.cost + " 灵石");
    forgeButton.hidden = forge.built || !archive.lastReceipt;
    forgeButton.disabled = !forge.available || !session.isOwner ||
      writeBusy || Boolean(writeError) || Boolean(restoreError) || phase !== "intro";
    const oldBattle = archive.run.sortieCamp?.buildReceipt?.beforeStats;
    if (oldBattle && prior && prior.day > oldBattle.day) {
      lastReceipt.textContent += "｜付费后本场武器伤害 " +
        prior.battle.weaponDamage + "；首场击退 " + oldBattle.defeated +
        " → 本场击退 " + prior.battle.defeated + "；本场实得灵石 +" +
        prior.battle.stones + "（非回本保证）";
    }
  }
  const ready = session.isOwner && Boolean(archive?.run.active) &&
    archive.run.worlds[0].status === "running" && !archive.pending &&
    !writeBusy && !writeError && !restoreError;
  startButton.disabled = !ready;
  if (restoreError) {
    sessionNotice.replaceChildren();
    const warning = document.createElement("span");
    warning.textContent = "读取独立试验档失败或结构不兼容：已禁止写入，不覆盖旧数据。";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重新读取";
    retry.dataset.sortieRetryLoad = "";
    retry.addEventListener("click", initializeSession);
    sessionNotice.append(warning, retry);
  } else if (writeError) {
    sessionNotice.replaceChildren();
    const text = document.createElement("span");
    text.textContent = pendingWrite ?
      "试验档保存失败，战斗已冻结；请勿刷新，以免丢失本次临时结果。" :
      "结算验证失败，未发放任何奖励；可刷新返回出击前营地。";
    sessionNotice.append(text);
    if (pendingWrite) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试保存";
      retry.dataset.sortieRetrySave = "";
      retry.disabled = !session.isOwner || writeBusy;
      retry.addEventListener("click", retryPendingSave);
      sessionNotice.append(retry);
    }
  } else if (sessionMode === "readonly") {
    sessionNotice.replaceChildren();
    const warning = document.createElement("span");
    warning.textContent = "另一个游戏标签页持有独占锁，本页只读。";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "重新取得控制权";
    retry.dataset.sortieRetryLock = "";
    retry.addEventListener("click", initializeSession);
    sessionNotice.append(warning, retry);
  } else if (writeBusy) {
    sessionNotice.textContent = "正在保存独立试验档，请勿重复操作……";
  } else {
    sessionNotice.textContent = sessionMode === "owner" ?
      (recoveryMessage || "独立试验档已就绪；返回正式模拟器不会继承此处资源。") :
      "正在检查独占写入权与独立试验档……";
  }
  // The persistent archive notice belongs to camp; leave the battlefield and
  // settlement room for objective/changes. Still expose write/lock failures.
  sessionNotice.hidden = phase !== "intro" && sessionMode === "owner" &&
    !writeError && !restoreError;
}

async function persistCandidate(candidate, onSaved) {
  if (!session.isOwner || writeBusy) return;
  pendingWrite = { candidate, onSaved };
  writeBusy = true;
  writeError = null;
  updateCamp();
  try {
    await sortieRepository.enqueueSave(candidate);
    if (!session.isOwner) throw new Error("保存期间失去写入权");
    archive = candidate;
    recoveryMessage = "";
    pendingWrite = null;
    writeError = null;
    writeBusy = false;
    onSaved();
    updateCamp();
  } catch (error) {
    writeBusy = false;
    writeError = error;
    if (phase === "battle") pause();
    console.error("出击试验档保存失败", error);
    updateCamp();
  }
}

async function retryPendingSave() {
  if (!pendingWrite || writeBusy || !session.isOwner) return;
  const pending = pendingWrite;
  await persistCandidate(pending.candidate, pending.onSaved);
}

async function initializeSession() {
  if (writeBusy) return;
  sessionMode = "starting";
  updateCamp();
  const owner = await session.acquire();
  if (!owner) {
    sessionMode = "readonly";
    updateCamp();
    return;
  }
  try {
    const saved = await sortieRepository.load();
    const recovered = saved ? recoverSortieArchive(saved) : null;
    if (!session.isOwner) throw new Error("读取时失去独占锁");
    archive = recovered?.archive ?? createSortieArchive("sortie-camp-" + Date.now());
    // Reacquiring a previously lost lock invalidates any in-memory battle,
    // even if it was paused: only the saved pre-sortie snapshot may survive.
    if (phase !== "intro") {
      cancelAnimationFrame(frameId);
      resetMovement();
      battle = null;
      actions = [];
      phase = "intro";
      paused = false;
      play.hidden = true;
      results.hidden = true;
      skillOverlay.hidden = true;
      retreatOverlay.hidden = true;
      intro.hidden = false;
    }
    sessionMode = "owner";
    restoreError = null;
    writeError = null;
    pendingWrite = null;
    recoveryMessage = recovered?.interrupted ?
      "上次出击未完成提交，已回退到出击前营地；没有发奖或推进世界日。" : "";
  } catch (error) {
    console.error("独立试验档读取失败", error);
    restoreError = error;
    // Do not monopolize the game's common Web Lock with an unreadable archive.
    await session.release();
  }
  updateCamp();
}

function currentInput() {
  if (pointerId !== null) return pointerVector;
  const x = Number(keys.has("ArrowRight") || keys.has("d")) -
    Number(keys.has("ArrowLeft") || keys.has("a"));
  const y = Number(keys.has("ArrowDown") || keys.has("s")) -
    Number(keys.has("ArrowUp") || keys.has("w"));
  return { x, y };
}

function resetMovement() {
  const activePointerId = pointerId;
  pointerId = null;
  pointerVector = { x: 0, y: 0 };
  knob.style.transform = "translate(0px, 0px)";
  keys.clear();
  if (activePointerId !== null && joystick.hasPointerCapture(activePointerId)) {
    joystick.releasePointerCapture(activePointerId);
  }
}

function drawStats() {
  if (!battle) return;
  if (lastVisualStats) {
    const notices = [];
    let kind = "defeat";
    if (battle.defeated > lastVisualStats.defeated) {
      notices.push("击退 +" + (battle.defeated - lastVisualStats.defeated));
    }
    if (battle.collectedShards > lastVisualStats.shards) {
      notices.push("拾取碎片 +" + (battle.collectedShards - lastVisualStats.shards));
      const conversion = (count) => Math.min(SORTIE.rewards.maxShardStones,
        Math.floor(count / SORTIE.rewards.shardsPerStone));
      const earned = conversion(battle.collectedShards) - conversion(lastVisualStats.shards);
      if (earned > 0) notices.push("兑换灵石 +" + earned);
      kind = "loot";
    }
    if (battle.hero.hp < lastVisualStats.hp) {
      notices.push("受击 生命 -" + (lastVisualStats.hp - battle.hero.hp));
      kind = "hurt";
    }
    if (notices.length) {
      eventText.textContent = notices.join(" · ");
      eventText.dataset.kind = kind;
      feedbackUntilTick = battle.tick + SORTIE.ticksPerSecond * 2;
    }
  }
  lastVisualStats = {
    hp: battle.hero.hp, shards: battle.collectedShards, defeated: battle.defeated,
  };
  eventText.hidden = battle.tick >= feedbackUntilTick || !eventText.textContent;
  health.textContent = "生命 " + battle.hero.hp + "/" + SORTIE.player.hp;
  const remainingTicks = Math.max(0, DURATION_TICKS - battle.tick);
  const secondsLeft = Math.ceil(remainingTicks / SORTIE.ticksPerSecond);
  remaining.textContent = "剩余 " + secondsLeft + " 秒";
  const mission = battle.mission;
  const missionHint = mission?.id === "salvage" ?
    mission.status === "completed" ? " · 回收完成，仍需活到 75 秒" :
      mission.status === "expired" ? " · 回收点已过期，不得任务奖金" :
        mission.status === "scheduled" ? " · 10 秒出现险地目标" :
          " · 回收点：" + Math.floor(mission.progressTicks /
            mission.requiredTicks * 100) + "%，提防守卫" : "";
  goalText.textContent = battle.skillChoicePending ?
    "时间已冻结 · 选择战技后继续" :
    "目标：撑到 0 秒" + missionHint + (battle.skillId ?
      " · " + powerName(battle.skillId) + "已生效" :
      " · " + SORTIE.skills.choiceSeconds + " 秒时觉醒战技");
  timebar.setAttribute("aria-valuenow", String(secondsLeft));
  timebar.setAttribute("aria-valuetext", "剩余 " + secondsLeft + " 秒");
  timeFill.style.width = (remainingTicks / DURATION_TICKS * 100).toFixed(2) + "%";
  health.dataset.low = String(battle.hero.hp <= 2);
  defeated.textContent = "击退 " + battle.defeated;
  canvas.dataset.weaponDamage = String(battle.weaponDamage);
  lootText.textContent = "碎片 " + battle.collectedShards +
    " · 灵石兑换 " + Math.min(SORTIE.rewards.maxShardStones,
      Math.floor(battle.collectedShards / SORTIE.rewards.shardsPerStone)) + "/2";
  powerText.textContent = (battle.skillChoicePending ? "战技：待抉择" :
    battle.skillId ? "战技：" + powerName(battle.skillId) : "战技：待觉醒") +
    " · 灵刃 " + battle.weaponDamage;
  canvas.dataset.collected = String(battle.collectedShards);
  canvas.dataset.dropped = String(battle.drops.length);
  canvas.dataset.skill = battle.skillId || "";
  canvas.dataset.heroX = battle.hero.x.toFixed(2);
  canvas.dataset.heroY = battle.hero.y.toFixed(2);
  canvas.dataset.ticks = String(battle.tick);
  drawSortie(canvas, battle);
  drawCampMissionTarget(canvas, battle);
}

/** A 2L-A mission entity is rendered from real tick state, never a fake pickup. */
function drawCampMissionTarget(targetCanvas, state) {
  const mission = state?.mission;
  if (!mission || mission.id !== "salvage" ||
    !["available", "completed"].includes(mission.status)) return;
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;
  const completed = mission.status === "completed";
  ctx.save();
  ctx.fillStyle = completed ? "#2e6b47" : "#9a7730";
  ctx.strokeStyle = completed ? "#aaf1b1" : "#ffe59b";
  ctx.lineWidth = 3;
  ctx.fillRect(mission.x - 14, mission.y - 14, 28, 28);
  ctx.strokeRect(mission.x - 14, mission.y - 14, 28, 28);
  ctx.fillStyle = "#ffefbc";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(completed ? "已取" : "回收", mission.x, mission.y + 3);
  if (!completed) {
    const progress = Math.max(0, Math.min(1,
      mission.progressTicks / mission.requiredTicks));
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#a1dfb2";
    ctx.beginPath();
    ctx.arc(mission.x, mission.y, 22, -Math.PI / 2,
      -Math.PI / 2 + progress * 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

function endBattle() {
  cancelAnimationFrame(frameId);
  phase = "end";
  resetMovement();
  play.hidden = true;
  skillOverlay.hidden = true;
  retreatOverlay.hidden = true;
  results.hidden = false;
  gains.hidden = true;
  gains.replaceChildren();
  app.querySelector("[data-sortie-outcome]").textContent = battle.outcome === "won" ?
    "结界稳住了！" : battle.outcome === "retreated" ? "谨慎撤离雾谷" : "分身撤离 · 试炼失败";
  app.querySelector("[data-sortie-summary]").textContent =
    "存活 " + (battle.tick / SORTIE.ticksPerSecond).toFixed(1) +
    " 秒，击退 " + battle.defeated + " 只妖影，释放灵刃 " + battle.fired + " 次。";
  results.dataset.result = battle.outcome;
  rewardText.textContent = "正在复算真实战斗记录并提交本次唯一的双世界日结算……";
  worldReport.textContent = "";
  const staged = settleSortieArchive(archive, actions);
  if (!staged.ok) {
    writeError = new Error(staged.error);
    rewardText.textContent = "结算已冻结：" + staged.error + "。请刷新回退本次未提交的战斗。";
    updateCamp();
    return;
  }
  void persistCandidate(staged.archive, () => {
    const receipt = staged.receipt;
    const reward = receipt.battle;
    const objectiveStones = Number.isFinite(reward.objectiveStones) ?
      reward.objectiveStones : null;
    const missionDetail = objectiveStones === null ? "" :
      " + 险地任务 " + objectiveStones + "（状态 " + reward.objectiveStatus +
        "，守卫造成 " + reward.objectiveGuardDamage + " 次受击；仅真实达成且胜利才发）";
    rewardText.textContent = "本场已权威结算：灵刃 " + reward.weaponDamage +
      " 伤害，拾取碎片 " + reward.collectedShards +
      "（未拾取 " + reward.uncollectedShards + "），灵石 " + reward.stones +
      "（生存 " + reward.baseStones + " + 拾取兑换 " + reward.shardStones +
      missionDetail + "），经验 +" + reward.experience +
      "，救援准备 +" + reward.progress + "。";
    rewardText.dataset.stones = String(reward.stones);
    const items = [
      ["本场灵石", "+" + reward.stones],
      ["经验", "+" + reward.experience],
      ["救援准备", "+" + reward.progress],
      ["拾取碎片", String(reward.collectedShards)],
    ];
    if (objectiveStones !== null) {
      items.push(["回收奖金（权威）", "+" + objectiveStones]);
    }
    gains.replaceChildren(...items.map(([label, value]) => {
      const item = document.createElement("div");
      const heading = document.createElement("small");
      const amount = document.createElement("strong");
      heading.textContent = label;
      amount.textContent = value;
      item.append(heading, amount);
      return item;
    }));
    gains.hidden = false;
    worldReport.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = "双世界当日变化 · 第 " + receipt.day + " 日结算 → 第 " +
      receipt.nextDay + " 日";
    worldReport.append(heading);
    const delta = (value) => (value >= 0 ? "+" : "") + value;
    for (const world of receipt.worlds) {
      const item = document.createElement("p");
      item.textContent = (world.id === "lingzai" ? "灵灾" : "废土救援") +
        "：资源 " + delta(world.resourceDelta) +
        " · 经验 " + delta(world.xpDelta) +
        " · 准备 " + delta(world.pDelta) +
        " · 风险 " + delta(world.dDelta) +
        "；主要行动：" + (world.actionId || "未执行");
      worldReport.append(item);
    }
    worldReport.dataset.day = String(receipt.nextDay);
  });
}

function loop(now) {
  if (phase !== "battle" || paused) return;
  if (lastFrame === null) lastFrame = now;
  const elapsed = Math.min(50, Math.max(0, now - lastFrame));
  lastFrame = now;
  advanceSortie(battle, currentInput(), elapsed, (_battle, input) => {
    actions.push(["tick", input.x, input.y]);
  });
  drawStats();
  if (battle.skillChoicePending) {
    choiceState.textContent = "战斗时间已冻结 · " + remaining.textContent +
      "。选定战技后计时才会继续。";
    phase = "choice";
    resetMovement();
    skillOverlay.hidden = false;
    skillOverlay.querySelector("[data-sortie-skill]").focus();
    lastFrame = null;
    return;
  }
  if (battle.outcome !== "running") {
    endBattle();
    return;
  }
  frameId = requestAnimationFrame(loop);
}

function resume() {
  if (phase !== "battle" || !paused || !session.isOwner || writeError || restoreError) return;
  paused = false;
  pauseButton.textContent = "暂停";
  pauseButton.setAttribute("aria-pressed", "false");
  pauseOverlay.hidden = true;
  lastFrame = null;
  frameId = requestAnimationFrame(loop);
}

function pause() {
  if (phase !== "battle" || paused) return;
  paused = true;
  resetMovement();
  cancelAnimationFrame(frameId);
  pauseButton.textContent = "继续试炼";
  pauseButton.setAttribute("aria-pressed", "true");
  pauseOverlay.hidden = false;
  lastFrame = null;
}

async function start() {
  if (!session.isOwner || writeBusy || writeError || restoreError || phase === "battle" ||
    phase === "choice") return;
  const prepared = prepareSortieArchive(archive);
  if (!prepared.ok) {
    sessionNotice.textContent = prepared.error;
    return;
  }
  savedSeed = prepared.seed;
  savedDanger = prepared.danger;
  savedForgeLevel = prepared.forgeLevel;
  savedMissionId = prepared.missionId;
  await persistCandidate(prepared.archive, launchBattle);
}

function launchBattle() {
  cancelAnimationFrame(frameId);
  resetMovement();
  actions = [];
  battle = createSortie(savedSeed, savedDanger, savedForgeLevel, savedMissionId);
  phase = "battle";
  paused = false;
  lastFrame = null;
  intro.hidden = true;
  results.hidden = true;
  skillOverlay.hidden = true;
  retreatOverlay.hidden = true;
  play.hidden = false;
  pauseButton.textContent = "暂停";
  pauseButton.setAttribute("aria-pressed", "false");
  pauseOverlay.hidden = true;
  lastVisualStats = null;
  feedbackUntilTick = -1;
  eventText.hidden = true;
  eventText.textContent = "";
  drawStats();
  frameId = requestAnimationFrame(loop);
}

app.querySelector("[data-start-sortie]").addEventListener("click", start);
missionSalvageButton.addEventListener("click", () => {
  if (!archive || !session.isOwner || writeBusy || writeError || restoreError ||
    phase !== "intro") return;
  const operationId = "mission:salvage:" + archive.run.id + ":day-" + archive.run.day;
  const selected = selectSortieCampMission(archive, "salvage", operationId);
  if (!selected.ok) {
    recoveryMessage = selected.error;
    updateCamp();
    return;
  }
  if (selected.replayed) {
    recoveryMessage = "本日险地回收已记录，不重复接取或领奖金。";
    updateCamp();
    return;
  }
  void persistCandidate(selected.archive, () => {
    recoveryMessage = "险地回收已保存；只有接触目标并胜利才可能获得任务奖金。";
    updateCamp();
  });
});
missionSafeButton.addEventListener("click", () => {
  if (!archive || !session.isOwner || writeBusy || writeError || restoreError ||
    phase !== "intro") return;
  const operationId = "mission:safe:" + archive.run.id + ":day-" + archive.run.day;
  const selected = selectSortieCampMission(archive, "safe", operationId);
  if (!selected.ok) {
    recoveryMessage = selected.error;
    updateCamp();
    return;
  }
  if (selected.replayed) {
    recoveryMessage = "稳妥巡护已记录，重复选择未产生费用或新奖励。";
    updateCamp();
    return;
  }
  void persistCandidate(selected.archive, () => {
    recoveryMessage = "本日稳妥巡护已存档；额外任务奖金不可用。";
    updateCamp();
  });
});
forgeButton.addEventListener("click", () => {
  if (!archive || !session.isOwner || writeBusy || writeError || restoreError ||
    phase !== "intro") return;
  const operationId = "forge:" + archive.run.id + ":day-" + archive.run.day;
  const candidate = buildSortieForge(archive, operationId);
  if (!candidate.ok) {
    recoveryMessage = candidate.error;
    updateCamp();
    return;
  }
  if (candidate.replayed) {
    recoveryMessage = "护灵剑台已修复，此次操作没有重复扣费。";
    updateCamp();
    return;
  }
  void persistCandidate(candidate.archive, () => {
    recoveryMessage = "护灵剑台修复完成！实际扣除 " + candidate.receipt.cost +
      " 灵石，剩余 " + candidate.receipt.afterStones +
      "。下一场灵刃伤害变为 " + candidate.receipt.weaponDamage + "。";
    updateCamp();
  });
});
app.querySelector("[data-sortie-retry]").addEventListener("click", () => {
  if (writeBusy || writeError || !archive || !session.isOwner) return;
  phase = "intro";
  results.hidden = true;
  intro.hidden = false;
  updateCamp();
});
pauseButton.addEventListener("click", () => {
  if (paused) resume();
  else pause();
});

function pickSkill(id) {
  if (phase !== "choice" || document.hidden || !session.isOwner || writeError) return;
  const choice = chooseSortieSkill(battle, id);
  if (!choice.ok) return;
  actions.push(["skill", id]);
  skillOverlay.hidden = true;
  phase = "battle";
  paused = false;
  lastFrame = null;
  drawStats();
  frameId = requestAnimationFrame(loop);
}
for (const button of app.querySelectorAll("[data-sortie-skill]")) {
  button.addEventListener("click", () => pickSkill(button.dataset.sortieSkill));
}
app.querySelector("[data-sortie-default]").addEventListener("click", () => {
  pickSkill(SORTIE.skills.options[0]);
});

app.querySelector("[data-sortie-retreat]").addEventListener("click", () => {
  if (phase !== "battle" || !session.isOwner || writeError) return;
  retreatWasPaused = paused;
  if (!paused) pause();
  retreatOverlay.hidden = false;
  retreatOverlay.querySelector("[data-sortie-confirm-no]").focus();
});
function closeRetreat() {
  retreatOverlay.hidden = true;
  if (!retreatWasPaused && !document.hidden) resume();
}
app.querySelector("[data-sortie-confirm-no]").addEventListener("click", closeRetreat);
app.querySelector("[data-sortie-confirm-yes]").addEventListener("click", () => {
  if (phase !== "battle") return;
  const result = retreatSortie(battle);
  if (result.ok) {
    actions.push(["retreat"]);
    endBattle();
  }
});

function moveJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2;
  const dy = event.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(dx, dy);
  // Map the full usable knob travel to full movement, rather than requiring
  // the finger to reach the joystick's outer border.
  const maxDistance = Math.max(1, rect.width * 0.3);
  const ratio = Math.min(1, length / maxDistance);
  pointerVector = length ? {
    x: dx / length * ratio,
    y: dy / length * ratio,
  } : { x: 0, y: 0 };
  knob.style.transform = "translate(" +
    (pointerVector.x * maxDistance).toFixed(0) + "px, " +
    (pointerVector.y * maxDistance).toFixed(0) + "px)";
}

joystick.addEventListener("pointerdown", (event) => {
  if (phase !== "battle" || paused || pointerId !== null || event.isPrimary === false) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  event.preventDefault();
  pointerId = event.pointerId;
  try {
    joystick.setPointerCapture(event.pointerId);
  } catch {
    pointerId = null;
    return;
  }
  moveJoystick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (phase !== "battle" || paused || pointerId !== event.pointerId) return;
  if (event.cancelable) event.preventDefault();
  moveJoystick(event);
});
function releaseJoystick(event) {
  if (pointerId !== event.pointerId) return;
  pointerId = null;
  pointerVector = { x: 0, y: 0 };
  knob.style.transform = "translate(0px, 0px)";
}
for (const kind of ["pointerup", "pointercancel", "lostpointercapture"]) {
  joystick.addEventListener(kind, releaseJoystick);
}

const validKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"]);
window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (phase === "battle" && key === "Escape" && !retreatOverlay.hidden) {
    event.preventDefault();
    closeRetreat();
    return;
  }
  if (phase === "battle" && key === "Escape") {
    event.preventDefault();
    if (paused) resume();
    else pause();
  }
  if (phase === "battle" && validKeys.has(key)) {
    event.preventDefault();
    if (!paused && retreatOverlay.hidden) keys.add(key);
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
});
window.addEventListener("blur", () => {
  if (phase === "battle") pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frameId);
  void session.release();
});

updateCamp();
void initializeSession();
