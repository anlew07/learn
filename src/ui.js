import "./style.css";
import Engine from "./engine.js";
import { ATTACK_PATTERNS } from "./systems/attack-patterns.js";
import { counteredEliteWaveLabels } from "./systems/survivor-waves.js";
import { cautiousAftermathSummary } from "./systems/clue-aftermath.js";
import { summarizeEasterEggCollection, summarizeCrossworldSecrets } from "./systems/easter-eggs.js";
import { mergeProfileSecrets, summarizeProfileSecrets, availableArchiveTitles, equipArchiveTitle, selectedArchiveTitle } from "./systems/profile-collection.js";
import { saveRepository } from "./services/persistence.js";
import { createExclusiveSession } from "./services/exclusive-session.js";

const app = document.querySelector("#app");
const TEMPOS = {1:20000,2:10000,4:5000};
const labelStrategies = {growth:"成长优先",clear:"清剿优先",rescue:"拯救优先"};
let run = null, profile = {runCount:0,shards:0}, tab = "world", tickStarted = performance.now();
let saveError = false;
let sessionStatus = "starting";
let commandBusy = false;
let aidSourceId = null;
let aidTargetId = null;
const session = createExclusiveSession({
  onLost() {
    sessionStatus = "readonly";
    if (run) run.paused = true;
    render();
  },
});
const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n = value => Number(value??0).toFixed(value%1===0?0:1);
const win = () => run?.worlds.filter(w=>w.status==="saved").length??0;

function queueSave() {
  if (!session.isOwner) return Promise.resolve();
  profile = mergeProfileSecrets(profile, run);
  return saveRepository.enqueueSave(run, profile)
    .then(() => {
      if (saveError) {
        saveError = false;
        render();
      }
    })
    .catch((error) => {
      saveError = true;
      console.error("存档失败", error);
      render();
    });
}
function persistenceBanner() {
  return saveError
    ? '<p class="notice" role="alert">本次存档未成功写入浏览器，请检查存储权限和剩余空间。后续操作会尝试重新保存。</p>'
    : "";
}
function sessionBanner() {
  if (session.isOwner) return "";
  const notice = sessionStatus === "starting"
    ? "正在取得本局的独占写入权限……"
    : session.supported
      ? "另一个标签页正在运行该游戏。本页面为只读，关闭原标签页后可重新取得控制权。"
      : "当前浏览器环境不支持安全的多标签页写入锁；请使用 HTTPS 或 localhost 的现代浏览器。";
  return '<section class="notice" role="alert">' + notice +
    (sessionStatus === "starting" ? "" : '<div style="margin-top:8px"><button data-action="retry-session">重新取得控制权并读取最新存档</button></div>') +
    '</section>';
}
function report(text){const el=document.querySelector("#toast");if(el){el.textContent=text;el.hidden=false;}}
function worldStatus(w){return w.status==="saved"?"已拯救":w.status==="failed"?"已崩溃":"演化中";}
function pill(status){return status==="saved"?"good":status==="failed"?"bad":"warn";}
function bar(w,key,label){return '<div><div class="bar-head"><span>'+label+'</span><b>'+n(w[key])+'%</b></div><div class="progress-track"><div class="progress-fill '+key+'" style="width:'+Math.min(100,Math.max(0,w[key]))+'%"></div></div></div>';}
/**
 * A lightweight, deterministic storyboard of the recorded three-wave outcome.
 * Rendering or replaying it never advances a day, spends resources or draws RNG.
 * Existing saved battles without spectacle simply omit the stage.
 */
function survivorReplayHtml(battle) {
 const battleData=battle?.spectacle;
 if(!Array.isArray(battleData?.waves)||battleData.waves.length!==3)return "";
 const waves=battleData.waves;
 const safeWaves=waves.map((wave,index)=>{
   const encountered=Math.max(0,Number(wave.encountered)||0);
   const defeated=Math.max(0,Math.min(encountered,Number(wave.defeated)||0));
   const clear=Boolean(wave.cleared);
   const visibleCount=Math.min(9,Math.max(3,Math.ceil(encountered/4)));
   const fallenCount=Math.round(visibleCount*(encountered?defeated/encountered:0));
   const attack=wave.attack||{style:"basic",label:"基础攻击",icon:"✦",bonus:0};
   const style=["chain","pierce","fan","flurry","shockwave","storm","barrage","hunt","basic"].includes(attack.style)?
     attack.style:"basic";
   return '<div class="replay-wave attack-'+style+'" data-attack-style="'+style+'" data-wave-number="'+(index+1)+'" aria-label="第'+(index+1)+'波，'+esc(attack.label)+'，击败'+defeated+'个，共'+encountered+'个敌人">'+
     '<span class="replay-wave-name">WAVE 0'+(index+1)+'</span>'+
     '<div class="replay-swarm" aria-hidden="true">'+Array.from({length:visibleCount},(_,i)=>
       '<span class="replay-foe'+(i<fallenCount?' replay-fallen':'')+'">◆</span>'
     ).join('')+'</div>'+
     '<div class="replay-hit" aria-hidden="true">'+esc(attack.icon)+'</div>'+
     '<span class="replay-wave-count">'+defeated+' / '+encountered+(clear?' · CLEAR':'')+'</span>'+
     (wave.trait?'<span class="replay-trait" data-wave-trait="'+esc(wave.trait.id)+'">'+
       esc(wave.trait.label)+(wave.trait.countered?' · 战技克制':' · 未克制')+'</span>':'')+
     '<span class="replay-attack-name">'+(attack.ultimate?'⚡ 终极战技 · ':'')+esc(attack.label)+
       (attack.bonus?' · 战技增击+'+Number(attack.bonus):'')+'</span>'+
   '</div>';
 }).join('');
 return '<section class="survivor-replay" aria-label="三波战斗回放" data-survivor-replay>'+
   '<div class="replay-head"><span>◉ 战潮回放 · 第'+battle.day+'天</span>'+
   '<button data-action="replay-wave" type="button" aria-label="重播三波战潮">▶ 重播</button></div>'+
   '<div class="replay-arena is-playing" data-replay-arena>'+
     '<div class="replay-hero" aria-hidden="true"><span>✦</span></div>'+
     '<div class="replay-wave-stack">'+safeWaves+'</div>'+
     (battleData.frenzy?'<div class="replay-frenzy" aria-label="狂热爆发">⚡ FRENZY! 狂热爆发</div>':'')+
   '</div>'+
   '<p class="hint replay-note">按真实清剿数量生成的短时战斗演出；不是实时操作，重播不会改变本局结果。</p>'+
 '</section>';
}
function combatHtml(battle) {
 const bonus=battle.bonus||{xp:0,resource:0,doomReduced:0};
 const bonusText=[
   bonus.xp>0?"战技经验 +"+n(bonus.xp):"",
   bonus.resource>0?"额外资源 +"+n(bonus.resource):"",
   bonus.doomReduced>0?"额外减灾 "+n(bonus.doomReduced):""
 ].filter(Boolean);
 return '<div class="combat-recap" aria-label="最近一场战潮">'+
   '<div class="row-between"><b>最近战潮 · 第'+battle.day+'日</b>'+
   (battle.evolution?'<span class="pill good">✦ '+esc(battle.evolution)+'</span>':'')+'</div>'+
   (battle.spectacle?'<div class="survivor-score'+(battle.spectacle.frenzy?' frenzy-active':'')+'" aria-label="自动战潮清剿统计">'+
   '<div class="survivor-score-main"><strong>'+battle.spectacle.defeated+'</strong>'+
   '<span> / '+battle.spectacle.encountered+' 敌群清剿</span></div>'+
   '<span class="survivor-grade '+(battle.spectacle.fullClear?'survivor-clear':'')+'">'+
     (battle.spectacle.frenzy?'⚡ 狂热爆发 · ':battle.spectacle.burst?'✦ 进化爆发 · ':'')+esc(battle.spectacle.grade)+
     (battle.spectacle.momentum>1?' · 连战×'+battle.spectacle.momentum:'')+'</span>'+
   '<div class="survivor-wave-grid">'+battle.spectacle.waves.map(wave=>
     '<div class="survivor-wave"><span>第'+wave.wave+'波</span>'+
     '<b>'+wave.defeated+'/'+wave.encountered+'</b>'+
     '<i class="'+(wave.cleared?'cleared':'')+'"></i></div>'
   ).join('')+'</div></div>':'')+
 survivorReplayHtml(battle)+
 '<div class="combat-phases">'+(battle.stages||[]).map(x=>'<span>'+esc(x)+'</span>').join('<span class="combat-arrow">›</span>')+'</div>'+
   '<div class="hint">'+(battle.skills?.length?'使用战技：'+battle.skills.map(esc).join('、'):'本次依靠基础自动战斗')+'</div>'+
   '<div class="combat-rewards">'+(bonusText.length?bonusText.map(x=>'<span class="pill">'+esc(x)+'</span>').join(''):'<span class="hint">尚无额外战技收益</span>')+'</div>'+
 '</div>';
}
function crisisHtml(){
 const crises=Engine.advise(run);
 if(!crises.length)return "";
 return '<section class="panel crisis-panel" aria-label="危机决策提示">'+
 '<div class="row-between"><h2>危机观察 · 优先关注</h2>'+
 '<span class="pill warn">'+crises.length+'个世界需要注意</span></div>'+
 '<p class="hint">根据当前已发生的风险排序；这不是末日结束日预测。查看建议不会花费资源或替你自动操作。</p>'+
 crises.map(item=>'<article class="crisis-item" data-crisis-world="'+esc(item.worldId)+'">'+
 '<div class="row-between"><b>'+esc(item.worldName)+'</b>'+
 '<span class="hint">D'+n(item.doom)+' · 截止还剩'+item.remainingDays+'天</span></div>'+
 '<p class="crisis-reasons">'+item.notes.map(esc).join('；')+'</p>'+
 (item.blockers.length?'<p class="crisis-blockers">当前限制：'+item.blockers.slice(0,2).map(esc).join('；')+'</p>':'')+
 '<div class="crisis-actions">'+item.actions.slice(0,2).map(action=>
   '<div class="crisis-action"><div class="hint">'+esc(action.detail)+'</div>'+
   '<button data-action="crisis-'+action.kind+'" data-world="'+esc(action.worldId)+'"'+
   (action.kind==="aid"?' data-from="'+esc(action.sourceId)+'" data-mode="'+action.mode+'"':'')+
   '>'+esc(action.label)+'</button></div>'
 ).join('')+'</div></article>').join('')+'</section>';
}
function finaleHtml(world, status) {
 const data = status.finale;
 if (!data || world.status !== "running" || (world.p < 65 && world.d < 70)) return "";
 const completed = data.checks.filter((check) => check.ready).length;
 const open = world.p >= 90 || world.d >= 75 || data.ready;
 return '<details class="finale-preview"'+(open?' open':'')+' aria-label="终局资格预览">'+
 '<summary>终局资格 · '+completed+'/'+data.checks.length+'项满足 · 截止剩余'+data.daysLeft+'天</summary>'+
 '<div class="finale-checks">'+data.checks.map((check) =>
   '<div class="finale-check '+(check.ready?'ready':'missing')+'">'+
   '<span>'+(check.ready?'✓':'○')+' '+esc(check.label)+'</span>'+
   '<span>'+esc(check.detail)+'</span></div>'
 ).join('')+'</div>'+
 (data.ready?'<p class="hint">条件已齐全，分身将在日结算时自动尝试终局。</p>':
 '<p class="hint">缺口只反映当前状态；合法灵魂借力需另外满足AP、灵魂与供力者条件。</p>')+
 '</details>';
}
function worldHtml(w){
 const v=Engine.info(run,w),stop=w.status!=="running";
 const newStrategy=w.strategy==="growth"?"clear":"growth";
 const strategyPreview=Engine.previewStrategy(run,w.id,newStrategy);
 const boss=w.pendingEvent?.state==="active";
 const options = ['growth','clear','rescue'].map(k=>'<option value="'+k+'" '+(w.strategy===k?"selected":"")+'>'+labelStrategies[k]+'</option>').join("");
 const worldSpecific=w.id==="lingzai"?(w.retreat?"闭关剩余 "+w.retreat.remaining+" 天":w.level>=2?"可进行短期或深度闭关":"筑基解锁闭关"):w.id==="zombie"?(w.repairUsed?"安全区已进行过大修":"防线可在危机时消耗零件修复"):("兽王阶段："+(w.phase||"苏醒")+" · 要求 Lv"+v.bossRequirement+(w.suppression? " · 压制 "+w.suppression+"/2":""));
 const worldIdentity={lingzai:{glyph:"✦",label:"灵脉异变",category:"CULTIVATION"},zombie:{glyph:"☣",label:"失序禁区",category:"OUTBREAK"},beast:{glyph:"♜",label:"兽王领地",category:"BEASTFALL"}}[w.id]||{glyph:"◇",label:"异界",category:"WORLD"};
 return '<section class="world world-'+esc(w.id)+' '+(stop?w.status:"")+'" data-world-card="'+esc(w.id)+'">'+
 '<div class="world-hero"><div class="world-insignia" aria-hidden="true">'+worldIdentity.glyph+'</div>'+
 '<div class="world-identity"><span class="world-kicker">'+worldIdentity.category+' · '+worldIdentity.label+'</span>'+
 '<div class="world-head"><span class="world-title">'+esc(w.name)+'</span><span class="pill '+pill(w.status)+'">'+worldStatus(w)+'</span></div></div></div>'+
 '<div class="world-meta">Lv'+w.level+' · '+esc(v.stage)+'　|　'+esc(v.resourceName)+' <b class="resource">'+n(w.resource)+'</b>　|　剩余 '+Math.max(0,w.deadline-run.day)+' 天</div>'+
 '<div class="bars">'+bar(w,"p","拯救准备") +bar(w,"d","末日毁灭")+'</div>'+
 '<div class="world-note">正在进行：<strong>'+esc(w.action)+'</strong></div>'+
 '<div class="world-note world-goal">当前目标：'+esc(stop?worldStatus(w):v.goal)+'</div>'+
 finaleHtml(w,v)+
 '<details class="world-intel"'+(w.d>=75||w.threat&&w.threat.status!=="cleared"||cautiousAftermathSummary(w,run.day)?' open':'')+'>'+
 '<summary><span>◇ 作战情报</span><span class="intel-summary-hint">策略判断 · 状态效果</span></summary>'+
 (w.lastDecision&&!stop?'<div class="world-note"><span class="decision-label">自主判断：</span>'+esc(w.lastDecision.reason)+'</div>':'')+
 '<div class="world-extra"><span class="pill">'+esc(worldSpecific)+'</span>'+(w.threat&&w.threat.status!=="cleared"?'<span class="pill warn">活跃威胁 · 清剿 '+w.threat.progress+'/2</span>':'')+
 (v.injured?'<span class="pill bad">受伤</span>':'')+(w.weaknessUntil>=run.day&&w.weaknessStart<=run.day?'<span class="pill warn">借力虚弱</span>':'')+
 (run.waves&&w.build.evolved?'<span class="pill good">✦ '+esc(w.build.evolutionName)+'</span>':run.waves&&w.build.count?'<span class="pill">已装备战技 '+(w.build.attack.length+w.build.support.length)+'/3</span>':'')+
 (w.flags.followupOutcome?'<span class="pill '+(w.flags.followupOutcome==="commit"?"good":"")+'">后续机缘：'+
 (w.flags.followupOutcome==="commit"?"已投入":w.flags.followupOutcome==="safe"?"已整理":"已放弃")+
 (w.followupEffect?.until>=run.day?' · 效果至第'+w.followupEffect.until+'日':'')+'</span>':'')+
 (cautiousAftermathSummary(w,run.day)?'<span class="pill good">'+esc(cautiousAftermathSummary(w,run.day))+'</span>':'')+'</div></details>'+
 (run.waves&&w.lastCombat?combatHtml(w.lastCombat):"")+
 (stop?'':'<div class="select-row"><label class="muted">长期策略 <select data-action="strategy" data-world="'+w.id+'"'+
 (strategyPreview.available?'':' disabled')+'>'+options+'</select></label>'+
 '<span class="hint strategy-price">'+(strategyPreview.available?
  (strategyPreview.cost===0?'前3天切换免费':'更换需1AP'):
  '当前无法更换：'+esc(strategyPreview.reason))+'</span>'+
 (w.id==="lingzai"?(w.retreat?'<button data-action="exit-retreat" data-world="'+w.id+'">强行出关</button>':'<button data-action="retreat" data-world="'+w.id+'" '+(w.level<2||Engine.availableAP(run)<1?'disabled':'')+'>闭关</button>'):'')+
 '</div>')+
 '</section>'+
 (boss?eventHtml(w):"")+(w.build.pending?buildHtml(w):"");
}
function eventHtml(w){
 const preview=Engine.previewMajorEvent(run,w);
 if(!preview)return "";
 return '<section class="event" data-world="'+esc(w.id)+'" aria-label="重大事件干预">'+
 '<div class="row-between"><h3>⚠ '+esc(preview.title)+'</h3><span class="pill warn">第'+preview.expiry+'日自动结算</span></div>'+
 '<p class="event-summary">'+esc(preview.summary)+'</p>'+
 '<div class="event-default"><strong>不操作的结果：</strong>'+esc(preview.defaultOutcome)+'</div>'+
 '<div class="event-choice-list">'+preview.options.map(choice=>{
   const action=choice.id==="fusion"?"fusion":"event";
   return '<div class="event-choice">'+
    '<button data-action="'+action+'" data-mode="'+choice.id+'" data-world="'+w.id+'"'+
    (choice.available?'':' disabled')+'>'+esc(choice.label)+'</button>'+
    '<div class="event-choice-detail">'+esc(choice.summary)+
    (choice.available?'':'<p class="warning">暂不可选：'+esc(choice.unavailableReason)+'</p>')+
    '</div></div>';
 }).join("")+'</div></section>';
}

function buildHtml(w){
 const b=w.build.pending;
 const combo=Engine.COMBOS[w.id];
 const owned=w.build.attack.concat(w.build.support).map(item=>item.id);
 const powerName=id=>Engine.POWERS[w.id].find(p=>p.id===id)?.name||id;
 const comboText=combo.slice(0,2).map(powerName).join(' + ')+' → '+combo[2];
 const label=w.build.evolved?'已完成进化':owned.includes(combo[0])||owned.includes(combo[1])?'已具备一项组合组件':'可以尝试收集组合组件';
 return '<section class="panel build-panel"><div class="row-between"><b>✧ '+esc(w.name)+' · 战技觉醒</b><span class="pill">第 '+b.due+' 日自动选择</span></div>'+
 '<div class="muted">可主动三选一，也可以继续挂机，分身将自动挑选。</div>'+
 '<div class="build-combo"><strong>组合目标：</strong>'+esc(comboText)+'<div class="hint">'+label+'</div></div>'+
 '<div class="build-choice">'+b.options.map(id=>{
 const power=Engine.POWERS[w.id].find(x=>x.id===id);
 const canEvolve=!w.build.evolved&&
   ((owned.includes(combo[0])&&id===combo[1])||(owned.includes(combo[1])&&id===combo[0]));
 const equipped=w.build.attack.concat(w.build.support).find(item=>item.id===id);
 return '<button data-action="build" data-world="'+w.id+'" data-power="'+id+'">'+
 esc(power.name)+(equipped?' · 升Lv'+(equipped.lv+1):'')+
 '<small style="display:block;color:#91a9bd">'+(power.kind==="clear"?"清潮":power.kind==="defense"?"减损":"资源")+'</small>'+
 (ATTACK_PATTERNS[id]?'<small class="build-counter-hint">克制：'+
 esc(counteredEliteWaveLabels(ATTACK_PATTERNS[id].style).join('、')||'暂无限定敌群')+
 '</small>':'')+
 (canEvolve?'<small class="success-text">✦ 选择后进化</small>':'')+
 '</button>';
 }).join("")+'</div></section>';
}

function controls(){
 return '<header class="topbar"><div class="game-brand"><div class="brand-mark" aria-hidden="true">✧</div><div>'+
 '<div class="brand">同时穿越</div><div class="micro">MULTIVERSE · 末日模拟器</div></div></div>'+
 '<button class="home-link" data-action="home">⌂ 首页</button></header>'+
 '<section class="run-dashboard" aria-label="本局总览">'+
 '<div class="dashboard-heading"><div><span class="eyebrow">SURVIVAL OPERATION</span>'+
 '<h1>第 '+run.day+' 天 <span class="dashboard-subtitle">/ 多世界行动</span></h1></div>'+
 '<span class="run-live">'+(run.active?'● 进行中':'◆ 本局结束')+'</span></div>'+
 '<div class="metrics"><div class="metric"><b>第 '+run.day+' 天</b><span>◷ 全局游戏日</span></div>'+
 '<div class="metric"><b>'+run.soul+'</b><span>◈ 灵魂强度</span></div>'+
 '<div class="metric"><b>'+Engine.availableAP(run)+'<small> / '+run.apMax+'</small></b><span>✧ 可用行动点</span></div>'+
 '<div class="metric"><b>'+win()+'<small> / '+run.worlds.length+'</small></b><span>✓ 已拯救世界</span></div></div>'+
 '<div class="controls"><button class="btn run-toggle" data-action="toggle">'+(run.paused?'▶ 继续模拟':'Ⅱ 暂停模拟')+'</button>'+
 '<label class="speed-control"><span>模拟速度</span><select aria-label="模拟速度" data-action="speed">'+
 '<option value="1" '+(run.speed===1?"selected":"")+'>1× · 20秒/日</option>'+
 '<option value="2" '+(run.speed===2?"selected":"")+'>2× · 10秒/日</option>'+
 '<option value="4" '+(run.speed===4?"selected":"")+'>4× · 5秒/日</option></select></label>'+
 (new URLSearchParams(location.search).has("debug")?'<button data-action="step">调试：+1天</button>':'')+
 '</div></section>';
}
function aidChoicesHtml(fromId,toId){
 const from=run.worlds.find(w=>w.id===fromId);
 const to=run.worlds.find(w=>w.id===toId);
 const materialWarning=from&&to&&from.id!==to.id&&
   from.resource>=Engine.WORLDS[from.id].finalCost&&
   from.resource-4<Engine.WORLDS[from.id].finalCost?
   '<p class="aid-warning">注意：这次援助会让来源世界的材料低于自身终局需求，可能延后救援。</p>':"";
 return '<p class="hint">目标现状：'+(to?('P'+n(to.p)+' / D'+n(to.d)+' · 截止剩余'+Math.max(0,to.deadline-run.day)+'天'):'未选择')+
   '。每次消耗来源4材料、1AP、1灵魂；同一目标两类援助共享冷却。</p>'+
 '<div class="aid-options">'+["p","d"].map(mode=>{
   const preview=Engine.previewAid(run,fromId,toId,mode);
   const title=mode==="p"?"增加拯救准备":"压制毁灭压力";
   const effect=mode==="p"?"P+"+n(preview.actualDelta):"D−"+n(preview.actualDelta);
   const detail=preview.available?
     '本次实际'+effect+'，来源援助后剩余'+n(preview.sourceAfter)+'材料。':
     '当前不可使用：'+preview.reason;
   return '<div class="aid-option"><button data-action="aid" data-mode="'+mode+'"'+
     (preview.available?'':' disabled')+'>'+title+' · '+effect+'</button>'+
     '<div class="hint">'+esc(detail)+'</div></div>';
 }).join("")+'</div>'+materialWarning;
}
function updateAidChoices(){
 const source=document.querySelector("#aid-from");
 const target=document.querySelector("#aid-to");
 const preview=document.querySelector("#aid-choice-preview");
 if(!source||!target||!preview||!run)return;
 aidSourceId=source.value;
 aidTargetId=target.value;
 preview.innerHTML=aidChoicesHtml(aidSourceId,aidTargetId);
}
function soulHtml(){
 const running=run.worlds.filter(w=>w.status==="running");
 if(!running.some(w=>w.id===aidSourceId))aidSourceId=running[0]?.id||null;
 if(!running.some(w=>w.id===aidTargetId))
   aidTargetId=running.find(w=>w.id!==aidSourceId)?.id||running[0]?.id||null;
 const options=(selected)=>running.map(w=>
   '<option value="'+w.id+'"'+(w.id===selected?' selected':'')+'>'+
   esc(w.name)+'（资源'+n(w.resource)+'）</option>').join("");
 const echoes=run.echoes.filter(e=>!e.used);
 return '<div class="stack"><section class="panel"><h2>万我同源</h2>'+
 '<p class="muted">比较实际收益再决定是否消耗灵魂。援助不占分身的每日主要行动，但不能给同一世界重复刷新冷却。</p>'+
 '<div class="select-row"><label>来源世界 <select id="aid-from">'+options(aidSourceId)+'</select></label></div>'+
 '<div class="select-row"><label>目标世界 <select id="aid-to">'+options(aidTargetId)+'</select></label></div>'+
 '<div id="aid-choice-preview" aria-live="polite">'+aidChoicesHtml(aidSourceId,aidTargetId)+'</div>'+
 '<p class="hint">闭关分身允许提供资源，但不能参与二人或三人之力。</p></section>'+
 '<section class="panel"><h2>灵魂融合</h2><p class="muted">二人之力第2局解锁；三人之力第3局解锁。当前冷却至第 '+run.fusionNext+' 天。</p>'+
 running.map(w=>{
 const f=Engine.previewFusion(run,w.id);
 const reason=f.available?
   f.kind+'：消耗'+f.apCost+'AP / '+f.soulCost+'灵魂；供力者'+f.donorIds.map(id=>Engine.WORLDS[id].name).join('、')+'未来3日收益−30%':
   '当前不可借力：'+f.reason+(f.apCost?'（需'+f.apCost+'AP / '+f.soulCost+'灵魂）':'');
 return '<div class="soul-row fusion-row"><div><b>'+esc(w.name)+'</b><div class="hint">'+esc(reason)+'</div></div>'+
 '<button data-action="fusion" data-world="'+w.id+'" '+(f.available?'':'disabled')+'>'+
 (f.available?'发动'+esc(f.kind):'条件未满足')+'</button></div>';
 }).join("")+'</section>'+
 '<section class="panel"><h2>世界回响</h2>'+(echoes.length?echoes.map(e=>'<div class="soul-row"><b>'+Engine.WORLDS[e.id].name+' 回响</b><div class="event-actions">'+running.filter(w=>w.id!==e.id).map(w=>'<button data-action="echo" data-from="'+e.id+'" data-world="'+w.id+'">支援'+w.name+'</button>').join("")+'</div></div>').join(""):'<div class="muted">还没有可使用的世界回响。已拯救世界不再参与普通援助。</div>')+'</section>'+interventionHtml(4)+'</div>';
}
function interventionHtml(limit=5){
 const entries=Array.isArray(run.interventions)?run.interventions.slice(-limit).reverse():[];
 if(!entries.length)return "";
 const precise=(value)=>String(Number(value.toFixed(2)));
 const signed=(value)=>value>0?"+"+precise(value):precise(value);
 const changes=(entry)=>entry.changes.flatMap((world)=>{
  const parts=[];
  for(const [key,label] of [["p","拯救准备"],["d","毁灭压力"],["resource","资源"],["xp","经验"]]){
   if(world.effects[key])parts.push(label+signed(world.effects[key]));
  }
  if(world.strategyFrom!==world.strategyTo){
   parts.push("策略："+(labelStrategies[world.strategyFrom]||world.strategyFrom)+" → "+
     (labelStrategies[world.strategyTo]||world.strategyTo));
  }
  if(world.statusFrom!==world.statusTo)parts.push("世界状态："+world.statusTo);
  if(world.buildAdded>0)parts.push("新增战技"+world.buildAdded+"项");
  if(world.eventResolved)parts.push("重大事件已处理");
  if(world.retreatFrom!==world.retreatTo)parts.push(world.retreatTo?"进入闭关":"退出闭关");
  return parts.length?['<div class="intervention-world"><b>'+esc(world.name)+'</b>：'+
    parts.map(esc).join(" · ")+'</div>']:[];
 }).join("");
 return '<section class="panel intervention-history" aria-label="已结算干预"><h2>你的决定带来了什么</h2>'+
 '<p class="hint">以下是当时真实结算的差额，不是未来天数预测；后续变化仍取决于世界自主行动。</p>'+
 entries.map(entry=>'<article class="intervention-item">'+
   '<div class="row-between"><b>第'+entry.day+'日 · '+esc(entry.title)+'</b>'+
   '<span class="pill">实际已结算</span></div>'+
   '<div class="hint">全局成本：'+
     (entry.apSpent?'AP−'+n(entry.apSpent)+' ':'')+
     (entry.soulSpent?'灵魂−'+n(entry.soulSpent):'')+
     (!entry.apSpent&&!entry.soulSpent?'无AP/灵魂消耗':'')+'</div>'+
   '<div class="intervention-effects">'+changes(entry)+'</div>'+
   (entry.nextAidDay?'<div class="hint">此目标再次援助：第'+entry.nextAidDay+'日起</div>':'')+
   (entry.nextFusionDay?'<div class="hint">灵魂借力冷却至第'+entry.nextFusionDay+'日</div>':'')+
 '</article>').join("")+'</section>';
}
function statsHtml(){
 return '<section class="panel session-stats"><h2>本局行动统计</h2>'+
 '<p class="hint">真实行动次数与战潮累计额外收益；不计入第二次战利品。</p>'+
 run.worlds.map(w=>{
  const m=w.metrics||{},a=m.actions||{};
  return '<div class="stats-world"><b>'+esc(w.name)+'</b>'+
   '<div class="muted">成长 '+(a.growth||0)+' · 采集 '+(a.gather||0)+
   ' · 清剿 '+(a.fight||0)+' · 探索 '+(a.explore||0)+
   ' · 拯救准备 '+(a.rescue||0)+'</div>'+
   (run.waves?'<div class="muted">战潮 '+(m.waveCombats||0)+' 场 · 战技进化 '+
    (m.evolutions||0)+' 次 · 额外XP '+n(m.extraXp||0)+
    ' · 额外资源 '+n(m.extraResources||0)+
    ' · 额外减灾 '+n(m.extraDoomReduction||0)+'</div>':'')+
  '</div>';
 }).join("")+'</section>';
}
function collectionHtml() {
 const collection = summarizeEasterEggCollection(run);
 return '<section class="panel" aria-label="本局彩蛋图鉴" data-collection>'+
 '<div class="row-between"><h2>隐藏发现 · 本局彩蛋图鉴</h2><span class="pill">'+collection.found+' / '+collection.total+'</span></div>'+
 '<p class="hint">发现记录属于本局存档；不会增加战力、资源或行动点。未解锁的世界不计入本局收集进度。</p>'+
 (collection.complete?'<p class="pill good">✦ 隐藏称号：三个世界都在摸鱼</p>':'')+
 '<div class="collection-list">'+collection.entries.map(entry=>
 '<article class="collection-entry" data-secret-world="'+esc(entry.worldId)+'" data-discovered="'+entry.found+'">'+
 '<b>'+esc(entry.worldName)+' · '+esc(entry.title)+'</b>'+
 '<p class="hint">'+esc(entry.detail)+'</p></article>'
 ).join('')+'</div>'+
 '<h3>跨世界秘密 · '+summarizeCrossworldSecrets(run).filter(item=>item.found).length+
 ' / '+summarizeCrossworldSecrets(run).length+'</h3>'+
 '<div class="collection-list">'+summarizeCrossworldSecrets(run).map(item=>
 '<article class="collection-entry" data-crossworld-secret="'+esc(item.id)+'" data-discovered="'+item.found+'">'+
 '<b>'+esc(item.title)+'</b><p class="hint">'+esc(item.detail)+'</p></article>'
 ).join('')+'</div></section>';
}
function logsHtml(){
 return collectionHtml()+'<section class="panel"><h2>世界战报</h2><div class="muted">普通行为自动合并，关键危机和突破保留记录。</div>'+
 run.logs.slice(-42).reverse().map(l=>'<div class="log '+esc(l.kind)+'"><b>Day '+l.day+' '+(l.world==="system"?"全局":Engine.WORLDS[l.world]?.name||"全局")+'</b>'+esc(l.text)+'</div>').join("")+'</section>'+interventionHtml(24);
}
function profileArchiveHtml(){
 const archive=summarizeProfileSecrets(profile);
 return '<section class="panel" aria-label="跨局收藏" data-profile-archive>'+
 '<div class="row-between"><h2>灵魂收藏 · 永久发现</h2><span class="pill">'+archive.found+' / '+archive.total+'</span></div>'+
 '<p class="hint">跨局保留彩蛋与联动剧情的发现记录；仅在本浏览器的个人存档中保存，不影响每局难度。</p>'+
 (archive.complete?'<p class="pill good">✦ 已解锁永久称号：末日休假协会会长</p>':'')+
 '<div class="collection-titles" aria-label="纪念称号选择"><h3>纪念称号</h3>'+
 '<p class="hint">已解锁的称号可以装备在首页展示；没有数值加成。</p>'+
 '<div class="event-actions">'+
 '<button data-action="equip-title" data-title=""'+(!selectedArchiveTitle(profile)?' disabled':'')+'>不展示称号</button>'+
 availableArchiveTitles(profile).map(item=>
 '<button data-action="equip-title" data-title="'+esc(item.id)+'"'+
 (!item.available||profile.selectedTitle===item.id?' disabled':'')+'>'+
 esc(item.label)+(item.available?'':' · 未解锁')+
 (profile.selectedTitle===item.id?' · 已装备':'')+'</button>'
 ).join('')+'</div></div>'+
 '<details class="archive-discoveries"><summary>查看发现记录 <span>'+archive.found+' / '+archive.total+' 已解锁</span></summary>'+
 '<div class="collection-list">'+archive.entries.map(item=>
 '<div class="collection-entry" data-archive-id="'+esc(item.id)+'" data-discovered="'+item.found+'">'+
 '<b>'+esc(item.title)+'</b><span class="hint">'+(item.type==="world"?"世界发现":"跨世界秘密")+'</span></div>'
 ).join('')+'</div></details></section>';
}
function homeHtml(){
 return '<header class="topbar"><div class="game-brand"><div class="brand-mark" aria-hidden="true">✧</div><div><div class="brand">同时穿越</div>'+
 '<div class="micro">MULTIVERSE · 末日模拟器</div></div></div><span class="pill">EARLY ACCESS · V0.2</span></header>'+
 '<section class="hero"><div class="hero-orb" aria-hidden="true"><span>✧</span></div>'+
 '<div class="eyebrow">THREE WORLDS · ONE SOUL</div>'+
 (selectedArchiveTitle(profile)?'<p class="pill good" data-equipped-title>✦ '+esc(selectedArchiveTitle(profile))+'</p>':'')+
 '<h1>一个灵魂。<br><em>三场末日。</em></h1>'+
 '<p>修仙、尸潮、兽王。三个世界同时倒计时，每次选择都可能改变终局。</p>'+
 '<div class="hero-actions">'+
 (run?'<button class="btn" data-action="continue">▶ 继续穿越 · 第'+run.day+'天</button>':'<button class="btn" data-action="new-run">✦ 开始第 '+(profile.runCount+1)+' 局</button>')+
 (run?'<button class="btn-soft" data-action="new-run">重新开启</button>':'')+'</div></section>'+
 '<section class="panel progression-panel"><div class="row-between"><h2>旅程档案</h2><span class="eyebrow">YOUR PROGRESS</span></div>'+
 '<div class="progress-summary"><div><strong>'+profile.runCount+'</strong><span>完成局数</span></div>'+
 '<div><strong>'+profile.shards+'</strong><span>世界碎片</span></div>'+
 '<div><strong>'+Math.min(3,Math.max(1,profile.runCount+1))+'</strong><span>已解锁阶段</span></div></div>'+
 '<p class="muted">首局开启灵灾与尸潮，第三局解锁兽潮。分身自动行动，你负责关键抉择。</p>'+
 '<label class="experiment-toggle"><input id="waves-enabled" type="checkbox" checked /> 开启战潮增强 · 三波战斗与战技构筑</label></section>'+
 profileArchiveHtml()+
 '<p class="hint footnote">开发中版本 · 游戏进度仅保存在当前浏览器</p>';
}
function render(){
 app.classList.toggle("readonly",!session.isOwner);
 const banner = sessionBanner();
 if(!run||tab==="home"){app.innerHTML=banner+homeHtml()+persistenceBanner();return;}
 if(!run.active){
  const content=tab==="log"?statsHtml()+logsHtml():
   '<section class="panel result"><h2>这一次的末日已经结束</h2><p><strong>'+run.result.saved+' / '+run.worlds.length+'</strong></p>'+
   '<p>成功拯救的世界 · 获得世界碎片 '+run.result.shards+'</p><div class="event-actions" style="justify-content:center"><button class="btn" data-action="new-run">开始下一次穿越</button><button data-action="tab" data-tab="log">查看本局经历</button></div></section>'+
   statsHtml()+run.worlds.map(worldHtml).join("");
  app.innerHTML=banner+controls()+'<div class="stack">'+content+'</div>'+footer()+persistenceBanner();return;
 }
 app.innerHTML=banner+controls()+(tab==="world"?'<div class="stack game-content"><div class="section-banner"><div><span class="eyebrow">WORLD STATUS</span><h2>平行世界</h2></div><span class="section-hint">'+run.worlds.length+' 个世界同步演化</span></div>'+crisisHtml()+run.worlds.map(worldHtml).join("")+interventionHtml(2)+'</div>':tab==="soul"?soulHtml():statsHtml()+logsHtml())+footer()+'<p id="toast" class="notice" hidden></p>'+persistenceBanner();
}
function footer(){return '<nav class="footer-nav" aria-label="主要导航">'+
 '<button data-action="tab" data-tab="world" class="'+(tab==="world"?"active":"")+'"'+(tab==="world"?' aria-current="page"':'')+'><span class="nav-glyph" aria-hidden="true">◇</span><span>末日世界</span></button>'+
 '<button data-action="tab" data-tab="soul" class="'+(tab==="soul"?"active":"")+'"'+(tab==="soul"?' aria-current="page"':'')+'><span class="nav-glyph" aria-hidden="true">✧</span><span>灵魂联结</span></button>'+
 '<button data-action="tab" data-tab="log" class="'+(tab==="log"?"active":"")+'"'+(tab==="log"?' aria-current="page"':'')+'><span class="nav-glyph" aria-hidden="true">▤</span><span>战报图鉴</span></button></nav>';}
async function execute(type,args){
 if(!session.isOwner || commandBusy || !run) return;
 commandBusy=true;
 const result=Engine.applyCommand(run,{
   operationId:crypto.randomUUID(),
   type,
   args,
 });
 if(!result.ok){
   commandBusy=false;
   queueSave();
   render(); // Restore controls to authoritative state after a rejected change.
   report(result.error || "操作不满足条件");
   return;
 }
 if(!run.active)reward();
 const saved=queueSave();
 render();
 await saved;
 commandBusy=false;
}
function reward(){
 if(!run?.result||run.rewarded)return;
 run.rewarded=true;profile.runCount++;profile.shards+=run.result.shards;
}
function confirmNew(){
 if(!session.isOwner || commandBusy)return false;
 if(run&&run.active&&!window.confirm("将放弃当前模拟并开启新的一局，确定吗？"))return false;
 profile=mergeProfileSecrets(profile,run);
 const seed=Date.now().toString(36)+"-"+Math.floor(Math.random()*100000);
 const waves=document.querySelector("#waves-enabled")?.checked??run?.waves??true;
 run=Engine.fresh(seed,profile.runCount+1,waves);tab="world";queueSave();render();return true;
}
function handleClick(target){
 const action=target.dataset.action,id=target.dataset.world,mode=target.dataset.mode;
 if(action==="retry-session"){claimSession();return;}
 if(action==="home"){tab="home";render();return;}
 if(action==="continue"){tab="world";render();return;}
 if(action==="tab"){tab=target.dataset.tab;render();return;}
 if(action==="replay-wave"){
   const arena=target.closest("[data-survivor-replay]")?.querySelector("[data-replay-arena]");
   if(!arena)return;
   arena.classList.remove("is-playing");
   // Restart the storyboard even if its animation is already running.
   void arena.offsetWidth;
   arena.classList.add("is-playing");
   return;
 }
 if(action==="equip-title"){
   if(!session.isOwner || commandBusy)return;
   const updated=equipArchiveTitle(profile,target.dataset.title??"");
   if(!updated.ok){report(updated.reason);return;}
   profile=updated.profile;
   queueSave();
   render();
   return;
 }
 if(!session.isOwner){report("当前标签页是只读副本，请重新取得控制权。");return;}
 if(commandBusy)return;
 if(action==="new-run"){confirmNew();return;}
 if(!run)return;
 if(action==="crisis-aid"){
   const choices=Engine.advise(run);
   const selected=choices.find(item=>item.worldId===id)?.actions.find(item=>
     item.kind==="aid"&&item.sourceId===target.dataset.from&&item.mode===mode);
   if(!selected){render();return;}
   aidSourceId=selected.sourceId;aidTargetId=id;tab="soul";render();return;
 }
 if(action==="crisis-fusion"){
   if(!Engine.previewFusion(run,id).available){render();return;}
   tab="soul";render();return;
 }
 if(action==="crisis-event"){
   if(!Engine.previewMajorEvent(run,Engine.byId(run,id))){render();return;}
   tab="world";render();
   document.querySelector('.event[data-world="'+id+'"]')?.scrollIntoView({
     behavior:"smooth",block:"center"
   });
   return;
 }
 if(action==="toggle"){run.paused=!run.paused;tickStarted=performance.now();queueSave();render();return;}
 if(action==="step"){const result=Engine.step(run);if(!run.active)reward();queueSave();render();if(!result.ok)report(result.error);return;}
 if(action==="retreat"){
   const length=window.confirm("安排6天深度闭关吗？\n取消则安排4天短闭关。")?6:4;
   execute("retreat",[id,length]);return;
 }
 if(action==="exit-retreat"){
   if(window.confirm("强行出关将失去1点灵魂，毁灭进度+8，确定吗？"))execute("exitRetreat",[id]);
   return;
 }
 if(action==="event"){execute("event",[id,mode]);return;}
 if(action==="build"){execute("build",[id,target.dataset.power,false]);return;}
 if(action==="fusion"){execute("fusion",[id]);return;}
 if(action==="echo"){execute("echo",[target.dataset.from,id]);return;}
 if(action==="aid"){
   const a=document.querySelector("#aid-from")?.value,b=document.querySelector("#aid-to")?.value;
   const preview=Engine.previewAid(run,a,b,mode);
   if(!preview.available){report(preview.reason);return;}
   const effect=mode==="p"?"拯救准备+"+n(preview.actualDelta):
     "毁灭压力−"+n(preview.actualDelta);
   const reserve=preview.jeopardizesSourceFinale?
     "\n注意：来源本局终局所需材料将变得不足。":"";
   if(!window.confirm("本次实际"+effect+"；来源消耗4资源、1AP、1灵魂。"+reserve+"\n确认援助吗？"))return;
   execute("aid",[a,b,mode]);return;
 }
}
app.addEventListener("click",event=>{const t=event.target.closest("[data-action]");if(t)handleClick(t);});
app.addEventListener("change",event=>{
 const t=event.target,action=t.dataset.action;
 if(!run||!session.isOwner||commandBusy)return;
 if(t.id==="aid-from"||t.id==="aid-to"){updateAidChoices();return;}
 if(action==="strategy"){execute("strategy",[t.dataset.world,t.value]);return;}
 if(action==="speed"){run.speed=Number(t.value)||1;tickStarted=performance.now();queueSave();render();}
});
document.addEventListener("visibilitychange",()=>{
 if(document.hidden&&run&&session.isOwner&&!run.paused){run.paused=true;tickStarted=performance.now();queueSave();}
});
window.addEventListener("pagehide",()=>{if(run&&session.isOwner)queueSave();});
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&run&&tab!=="world"){tab="world";render();}});
setInterval(()=>{
 if(!session.isOwner||commandBusy||!run||run.paused||!run.active||document.hidden){tickStarted=performance.now();return;}
 const now=performance.now();
 if(now-tickStarted >= (TEMPOS[run.speed] || TEMPOS[1])){
   // Single day maximum per timer tick: never batch unseen days after background throttling.
   tickStarted=now;
   const priorActive=new Set(run.worlds.filter(w=>w.pendingEvent?.state==="active").map(w=>w.pendingEvent.id));
   const result=Engine.step(run);
   if(!result.ok){run.paused=true;}
   const newUrgent=run.worlds.some(w=>w.pendingEvent?.state==="active"&&!priorActive.has(w.pendingEvent.id));
   if(newUrgent&&run.speed===4){run.paused=true;tab="world";}
   if(!run.active)reward();
   queueSave();render();
 }
},300);
async function claimSession() {
 sessionStatus="starting";
 render();
 const acquired=await session.acquire();
 sessionStatus=acquired?"owned":"readonly";
 try {
   // Always reload AFTER acquiring a lock: a previous tab may have progressed.
   const { run: saved, profile: account }=await saveRepository.load();
   if(account&&typeof account.runCount==="number")profile=account;
   if(saved&&saved.version===Engine.VERSION&&Array.isArray(saved.worlds)){
     run=saved;run.paused=true;
     if(acquired&&run.result&&!run.rewarded){reward();queueSave();}
   }else{
     run=null;
   }
   if(acquired){tab="world";saveError=false;}
 }catch(error){
   saveError=true;
   console.error("恢复存档失败",error);
 }
 tickStarted=performance.now();
 render();
}
claimSession();
