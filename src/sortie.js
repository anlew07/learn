import "./sortie.css";
import { createSortie, advanceSortie, DURATION_TICKS } from "./systems/sortie-sim.js";
import { SORTIE } from "./config/sortie-data.js";
import { drawSortie } from "./ui/sortie-stage.js";

const app = document.querySelector("#app");
app.className = "";
app.innerHTML = [
  '<main class="sortie-root" data-sortie-root>',
  '<header class="sortie-head"><div><strong>灵灾 · 雾谷试炼</strong><small>第二阶段 2A · 独立战斗沙盒</small></div>',
  '<a href="./">返回正式模拟器</a></header>',
  '<section class="sortie-intro" data-sortie-intro>',
  '<h1>出击雾谷</h1>',
  '<p>手动走位躲开妖影，灵刃会自动攻击最近的敌人。尝试生存 75 秒，观察不同的敌潮。</p>',
  '<button class="sortie-cta" data-start-sortie>▶ 出击雾谷</button>',
  '<p class="sortie-warning">本模式不读取或修改正式存档；暂不掉落灵石，也不推进任何世界日。</p></section>',
  '<section class="sortie-play" data-sortie-play hidden>',
  '<div class="sortie-stats"><span data-sortie-hp>生命 8/8</span>',
  '<span data-sortie-time>剩余 75 秒</span><span data-sortie-defeated>击退 0</span></div>',
  '<div class="sortie-field"><canvas width="320" height="448" data-sortie-canvas role="img"',
  ' aria-label="雾谷战场：分身、敌人和自动飞行的灵刃"></canvas></div>',
  '<div class="sortie-controls"><div class="sortie-joystick" data-sortie-joystick',
  ' role="group" aria-label="移动摇杆：按住拖动移动；键盘也支持方向键或 WASD">',
  '<span class="sortie-knob" data-sortie-knob></span></div>',
  '<div class="sortie-actions"><button data-sortie-pause>暂停</button>',
  '<small>拖动左侧移动<br>自动释放灵刃</small></div></div></section>',
  '<section class="sortie-results" data-sortie-results hidden>',
  '<h1 data-sortie-outcome>试炼结束</h1><p class="sortie-feedback" data-sortie-summary></p>',
  '<p>这是纯战斗原型：本场成绩不会发放真实资源或改变其他世界。</p>',
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
  results.hidden = false;
  app.querySelector("[data-sortie-outcome]").textContent =
    battle.outcome === "won" ? "结界稳住了！" : "分身撤离 · 试炼失败";
  app.querySelector("[data-sortie-summary]").textContent =
    "存活 " + (battle.tick / SORTIE.ticksPerSecond).toFixed(1) +
    " 秒，击退 " + battle.defeated + " 只妖影，释放灵刃 " + battle.fired + " 次。";
  results.dataset.result = battle.outcome;
}

function loop(now) {
  if (phase !== "battle" || paused) return;
  if (lastFrame === null) lastFrame = now;
  const elapsed = Math.min(50, Math.max(0, now - lastFrame));
  lastFrame = now;
  advanceSortie(battle, currentInput(), elapsed);
  drawStats();
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
  if (phase === "battle" && key === "Escape") {
    event.preventDefault();
    if (paused) resume();
    else pause();
  }
  if (phase === "battle" && validKeys.has(key)) {
    event.preventDefault();
    if (!paused) keys.add(key);
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
