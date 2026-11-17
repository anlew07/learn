import "./sortie.css";
import { createSortie, advanceSortie, DURATION_TICKS, chooseSortieSkill, retreatSortie } from "./systems/sortie-sim.js";
import { previewSortieRewards } from "./systems/sortie-rewards.js";
import { POWERS } from "./config/game-data.js";
import { SORTIE } from "./config/sortie-data.js";
import { drawSortie } from "./ui/sortie-stage.js";

const skillHints = {
  thunder: "每" + SORTIE.skills.thunderCooldownSeconds + "秒对最多" +
    SORTIE.skills.thunderTargets + "名附近敌人各造成" +
    SORTIE.skills.thunderDamage + "点伤害",
  rune: "立即获得一层护盾，每" + SORTIE.skills.runeRechargeSeconds +
    "秒重新充能，抵挡一次近身接触",
};
const powerName = (id) => POWERS.lingzai.find((power) => power.id === id)?.name ?? id;
const skillCards = SORTIE.skills.options.map((id) =>
  '<button type="button" class="sortie-skill-card" data-sortie-skill="' + id +
    '"><strong>' + powerName(id) + '</strong><span>' + skillHints[id] +
    '</span></button>'
).join("");

const app = document.querySelector("#app");
app.className = "";
app.innerHTML = [
  '<main class="sortie-root" data-sortie-root>',
  '<header class="sortie-head"><div><strong>灵灾 · 雾谷试炼</strong><small>第二阶段 2B · 独立战斗沙盒</small></div>',
  '<a href="./">返回正式模拟器</a></header>',
  '<section class="sortie-intro" data-sortie-intro>',
  '<h1>出击雾谷</h1>',
  '<p>拖动移动躲避灵息弹，灵刃自动攻击。击倒敌人会留下碎片：靠近拾取，25秒时选择一项战技！</p>',
  '<button class="sortie-cta" data-start-sortie>▶ 出击雾谷</button>',
  '<p class="sortie-warning">本模式碎片与灵石只做战斗奖励预览，不读取、写入正式存档或推进世界日。</p></section>',
  '<section class="sortie-play" data-sortie-play hidden>',
  '<div class="sortie-stats"><span data-sortie-hp>生命 8/8</span>',
  '<span data-sortie-time>剩余 75 秒</span><span data-sortie-defeated>击退 0</span></div>',
  '<div class="sortie-lootbar"><span data-sortie-loot>碎片 0 · 灵石兑换 0/2</span>',
  '<span data-sortie-power>战技：待觉醒</span></div>',
  '<div class="sortie-field"><canvas width="320" height="448" data-sortie-canvas role="img"',
  ' aria-label="雾谷战场：分身、敌人和自动飞行的灵刃"></canvas></div>',
  '<div class="sortie-controls"><div class="sortie-joystick" data-sortie-joystick',
  ' role="group" aria-label="移动摇杆：按住拖动移动；键盘也支持方向键或 WASD">',
  '<span class="sortie-knob" data-sortie-knob></span></div>',
  '<div class="sortie-actions"><button data-sortie-pause>暂停</button>',
  '<button data-sortie-retreat>撤离</button>',
  '<small>左侧走位 · 自动攻击</small></div></div>',
  '<div class="sortie-dialog-overlay" data-sortie-choice hidden>',
  '<section class="sortie-modal" role="dialog" aria-modal="true" aria-labelledby="sortie-choice-title">',
  '<h2 id="sortie-choice-title">战技觉醒 · 选择一项</h2>',
  '<p>战斗时间已冻结。选定后才继续，本场有效。</p>',
  skillCards,
  '<button data-sortie-default class="sortie-default">使用默认战技：驭雷符</button>',
  '</section></div>',
  '<div class="sortie-dialog-overlay" data-sortie-confirm hidden>',
  '<section class="sortie-modal" role="dialog" aria-modal="true" aria-labelledby="sortie-retreat-title">',
  '<h2 id="sortie-retreat-title">确定撤离雾谷？</h2>',
  '<p>撤离不获得生存基础奖励，只计算已经拾到的碎片（仍然仅预览）。</p>',
  '<div class="sortie-confirm-buttons"><button data-sortie-confirm-no>继续探索</button>',
  '<button data-sortie-confirm-yes>确定撤离</button></div>',
  '</section></div></section>',
  '<section class="sortie-results" data-sortie-results hidden>',
  '<h1 data-sortie-outcome>试炼结束</h1><p class="sortie-feedback" data-sortie-summary></p>',
  '<p data-sortie-reward-preview>灵石奖励预览</p>',
  '<p>所有奖励仅为沙盒估算：不会进入正式存档，不增加资源或推进世界日。</p>',
  '<button class="sortie-cta" data-sortie-retry>再次挑战</button></section></main>',
].join("");

const intro = app.querySelector("[data-sortie-intro]");
const play = app.querySelector("[data-sortie-play]");
const results = app.querySelector("[data-sortie-results]");
const canvas = app.querySelector("[data-sortie-canvas]");
const health = app.querySelector("[data-sortie-hp]");
const remaining = app.querySelector("[data-sortie-time]");
const defeated = app.querySelector("[data-sortie-defeated]");
const pauseButton = app.querySelector("[data-sortie-pause]");
const lootText = app.querySelector("[data-sortie-loot]");
const powerText = app.querySelector("[data-sortie-power]");
const skillOverlay = app.querySelector("[data-sortie-choice]");
const retreatOverlay = app.querySelector("[data-sortie-confirm]");
const rewardText = app.querySelector("[data-sortie-reward-preview]");
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
let attempt = 0;
let retreatWasPaused = false;

function currentInput() {
  if (pointerId !== null) return pointerVector;
  const x = Number(keys.has("ArrowRight") || keys.has("d")) -
    Number(keys.has("ArrowLeft") || keys.has("a"));
  const y = Number(keys.has("ArrowDown") || keys.has("s")) -
    Number(keys.has("ArrowUp") || keys.has("w"));
  return { x, y };
}

function resetMovement() {
  pointerId = null;
  pointerVector = { x: 0, y: 0 };
  knob.style.transform = "translate(0px, 0px)";
  keys.clear();
}

function drawStats() {
  if (!battle) return;
  health.textContent = "生命 " + battle.hero.hp + "/" + SORTIE.player.hp;
  remaining.textContent = "剩余 " +
    Math.max(0, Math.ceil((DURATION_TICKS - battle.tick) / SORTIE.ticksPerSecond)) + " 秒";
  defeated.textContent = "击退 " + battle.defeated;
  lootText.textContent = "碎片 " + battle.collectedShards +
    " · 灵石兑换 " + Math.min(SORTIE.rewards.maxShardStones,
      Math.floor(battle.collectedShards / SORTIE.rewards.shardsPerStone)) + "/2";
  powerText.textContent = battle.skillChoicePending ? "战技：待抉择" :
    battle.skillId ? "战技：" + powerName(battle.skillId) : "战技：待觉醒";
  canvas.dataset.collected = String(battle.collectedShards);
  canvas.dataset.dropped = String(battle.drops.length);
  canvas.dataset.skill = battle.skillId || "";
  canvas.dataset.heroX = battle.hero.x.toFixed(2);
  canvas.dataset.heroY = battle.hero.y.toFixed(2);
  canvas.dataset.ticks = String(battle.tick);
  drawSortie(canvas, battle);
}

function endBattle() {
  cancelAnimationFrame(frameId);
  phase = "end";
  resetMovement();
  play.hidden = true;
  skillOverlay.hidden = true;
  retreatOverlay.hidden = true;
  results.hidden = false;
  app.querySelector("[data-sortie-outcome]").textContent = battle.outcome === "won" ?
    "结界稳住了！" : battle.outcome === "retreated" ? "谨慎撤离雾谷" : "分身撤离 · 试炼失败";
  app.querySelector("[data-sortie-summary]").textContent =
    "存活 " + (battle.tick / SORTIE.ticksPerSecond).toFixed(1) +
    " 秒，击退 " + battle.defeated + " 只妖影，释放灵刃 " + battle.fired + " 次。";
  const receipt = previewSortieRewards(battle);
  rewardText.textContent = "本场奖励预览：拾取碎片 " + receipt.collectedShards +
    "（未拾取 " + receipt.uncollectedShards + "），灵石 " + receipt.stones +
    "（生存 " + receipt.baseStones + " + 拾取兑换 " + receipt.shardStones +
    "），经验 +" + receipt.experience + "，救援准备 +" + receipt.progress + "。";
  rewardText.dataset.stones = String(receipt.stones);
  results.dataset.result = battle.outcome;
}

function loop(now) {
  if (phase !== "battle" || paused) return;
  if (lastFrame === null) lastFrame = now;
  const elapsed = Math.min(50, Math.max(0, now - lastFrame));
  lastFrame = now;
  advanceSortie(battle, currentInput(), elapsed);
  drawStats();
  if (battle.skillChoicePending) {
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
  if (phase !== "battle" || !paused) return;
  paused = false;
  pauseButton.textContent = "暂停";
  lastFrame = null;
  frameId = requestAnimationFrame(loop);
}

function pause() {
  if (phase !== "battle" || paused) return;
  paused = true;
  resetMovement();
  cancelAnimationFrame(frameId);
  pauseButton.textContent = "继续试炼";
  lastFrame = null;
}

function start() {
  cancelAnimationFrame(frameId);
  resetMovement();
  battle = createSortie("lingzai-sortie-" + ++attempt);
  phase = "battle";
  paused = false;
  lastFrame = null;
  intro.hidden = true;
  results.hidden = true;
  skillOverlay.hidden = true;
  retreatOverlay.hidden = true;
  play.hidden = false;
  pauseButton.textContent = "暂停";
  drawStats();
  frameId = requestAnimationFrame(loop);
}

app.querySelector("[data-start-sortie]").addEventListener("click", start);
app.querySelector("[data-sortie-retry]").addEventListener("click", start);
pauseButton.addEventListener("click", () => {
  if (paused) resume();
  else pause();
});

function pickSkill(id) {
  if (phase !== "choice" || document.hidden) return;
  const choice = chooseSortieSkill(battle, id);
  if (!choice.ok) return;
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
  if (phase !== "battle") return;
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
  if (result.ok) endBattle();
});

function moveJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const dx = event.clientX - rect.left - rect.width / 2;
  const dy = event.clientY - rect.top - rect.height / 2;
  const length = Math.hypot(dx, dy);
  const ratio = Math.min(1, length / (rect.width / 2));
  pointerVector = length ? {
    x: dx / length * ratio,
    y: dy / length * ratio,
  } : { x: 0, y: 0 };
  knob.style.transform = "translate(" +
    (pointerVector.x * rect.width * 0.3).toFixed(0) + "px, " +
    (pointerVector.y * rect.height * 0.3).toFixed(0) + "px)";
}
joystick.addEventListener("pointerdown", (event) => {
  if (phase !== "battle" || paused || pointerId !== null) return;
  pointerId = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (phase === "battle" && !paused && pointerId === event.pointerId) moveJoystick(event);
});
for (const kind of ["pointerup", "pointercancel", "lostpointercapture"]) {
  joystick.addEventListener(kind, (event) => {
    if (pointerId === event.pointerId) {
      pointerId = null;
      pointerVector = { x: 0, y: 0 };
      knob.style.transform = "translate(0px, 0px)";
    }
  });
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
window.addEventListener("pagehide", () => cancelAnimationFrame(frameId));
