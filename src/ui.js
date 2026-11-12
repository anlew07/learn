import "./style.css";
import Engine from "./engine.js";
import { saveRepository } from "./services/persistence.js";
import { createExclusiveSession } from "./services/exclusive-session.js";

const app = document.querySelector("#app");
const TEMPOS = {1:20000,2:10000,4:5000};
const labelStrategies = {growth:"成长优先",clear:"清剿优先",rescue:"拯救优先"};
let run = null, profile = {runCount:0,shards:0}, tab = "world", tickStarted = performance.now();
let saveError = false;
let sessionStatus = "starting";
let commandBusy = false;
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
   '<div class="combat-phases">'+(battle.stages||[]).map(x=>'<span>'+esc(x)+'</span>').join('<span class="combat-arrow">›</span>')+'</div>'+
   '<div class="hint">'+(battle.skills?.length?'使用战技：'+battle.skills.map(esc).join('、'):'本次依靠基础自动战斗')+'</div>'+
   '<div class="combat-rewards">'+(bonusText.length?bonusText.map(x=>'<span class="pill">'+esc(x)+'</span>').join(''):'<span class="hint">尚无额外战技收益</span>')+'</div>'+
 '</div>';
}
function worldHtml(w){
 const v=Engine.info(run,w),stop=w.status!=="running";
 const boss=w.pendingEvent?.state==="active";
 const options = ['growth','clear','rescue'].map(k=>'<option value="'+k+'" '+(w.strategy===k?"selected":"")+'>'+labelStrategies[k]+'</option>').join("");
 const worldSpecific=w.id==="lingzai"?(w.retreat?"闭关剩余 "+w.retreat.remaining+" 天":w.level>=2?"可进行短期或深度闭关":"筑基解锁闭关"):w.id==="zombie"?(w.repairUsed?"安全区已进行过大修":"防线可在危机时消耗零件修复"):("兽王阶段："+(w.phase||"苏醒")+" · 要求 Lv"+v.bossRequirement+(w.suppression? " · 压制 "+w.suppression+"/2":""));
 return '<section class="world '+(stop?w.status:"")+'">'+
 '<div class="world-head"><span class="world-title">'+esc(w.name)+'</span><span class="pill '+pill(w.status)+'">'+worldStatus(w)+'</span></div>'+
 '<div class="world-meta">Lv'+w.level+' · '+esc(v.stage)+'　|　'+esc(v.resourceName)+' <b class="resource">'+n(w.resource)+'</b>　|　剩余 '+Math.max(0,w.deadline-run.day)+' 天</div>'+
 '<div class="bars">'+bar(w,"p","拯救准备") +bar(w,"d","末日毁灭")+'</div>'+
 '<div class="world-note">正在进行：<strong>'+esc(w.action)+'</strong></div>'+
 '<div class="world-note">当前目标：'+esc(stop?worldStatus(w):v.goal)+'</div>'+
 (w.lastDecision&&!stop?'<div class="world-note"><span class="decision-label">自主判断：</span>'+esc(w.lastDecision.reason)+'</div>':'')+
 '<div class="world-extra"><span class="pill">'+esc(worldSpecific)+'</span>'+(w.threat&&w.threat.status!=="cleared"?'<span class="pill warn">活跃威胁 · 清剿 '+w.threat.progress+'/2</span>':'')+
 (v.injured?'<span class="pill bad">受伤</span>':'')+(w.weaknessUntil>=run.day&&w.weaknessStart<=run.day?'<span class="pill warn">借力虚弱</span>':'')+
 (run.waves&&w.build.evolved?'<span class="pill good">✦ '+esc(w.build.evolutionName)+'</span>':run.waves&&w.build.count?'<span class="pill">已装备战技 '+(w.build.attack.length+w.build.support.length)+'/3</span>':'')+'</div>'+
 (run.waves&&w.lastCombat?combatHtml(w.lastCombat):"")+
 (stop?'':'<div class="select-row"><label class="muted">长期策略 <select data-action="strategy" data-world="'+w.id+'">'+options+'</select></label>'+
 (w.id==="lingzai"?(w.retreat?'<button data-action="exit-retreat" data-world="'+w.id+'">强行出关</button>':'<button data-action="retreat" data-world="'+w.id+'" '+(w.level<2||Engine.availableAP(run)<1?'disabled':'')+'>闭关</button>'):'')+
 '</div>')+
 '</section>'+
 (boss?eventHtml(w):"")+(w.build.pending?buildHtml(w):"");
}
function eventHtml(w){
 const e=w.pendingEvent;
 const isBoss=e.type==="boss";
 return '<section class="event"><h3>⚠ '+esc(e.title)+'</h3><div class="muted">第 '+e.expiresDay+' 日到期；默认：首领战可胜则自动清巢，否则撤退；线索则谨慎调查</div><div class="event-actions">'+
 (isBoss?'<button data-action="event" data-mode="boost" data-world="'+w.id+'">结晶强化 · 1AP / 4材料</button><button data-action="fusion" data-world="'+w.id+'">二人 / 三人之力</button><button data-action="event" data-mode="retreat" data-world="'+w.id+'">安全撤离</button>':
 '<button data-action="event" data-mode="safe" data-world="'+w.id+'">谨慎调查 · P+2</button><button data-action="event" data-mode="push" data-world="'+w.id+'">深入追踪 · 1AP / 有风险</button><button data-action="event" data-mode="decline" data-world="'+w.id+'">放弃线索</button>')+
 '</div></section>';
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
 (canEvolve?'<small class="success-text">✦ 选择后进化</small>':'')+
 '</button>';
 }).join("")+'</div></section>';
}

function controls(){
 return '<header class="topbar"><div><div class="brand">☼ 同时穿越：末日模拟器</div><div class="micro">双世界 / 三世界 · 自动模拟原型</div></div><button data-action="home">首页</button></header>'+
 '<div class="metrics"><div class="metric"><b>第 '+run.day+' 天</b><span>全局游戏日</span></div><div class="metric"><b>'+run.soul+'</b><span>灵魂强度</span></div>'+
 '<div class="metric"><b>'+Engine.availableAP(run)+' / '+run.apMax+'</b><span>可用行动点</span></div><div class="metric"><b>'+win()+' / '+run.worlds.length+'</b><span>获救世界</span></div></div>'+
 '<div class="controls" style="margin:12px 0"><button class="btn" data-action="toggle">'+(run.paused?"▶ 继续模拟":"Ⅱ 暂停模拟")+'</button>'+
 '<span class="muted">速度</span><select data-action="speed"><option value="1" '+(run.speed===1?"selected":"")+'>1× · 20秒/日</option><option value="2" '+(run.speed===2?"selected":"")+'>2× · 10秒/日</option><option value="4" '+(run.speed===4?"selected":"")+'>4× · 5秒/日</option></select>'+
 (new URLSearchParams(location.search).has("debug")?'<button data-action="step">调试：+1天</button>':'')+'</div>';
}
function soulHtml(){
 const running=run.worlds.filter(w=>w.status==="running");
 const choices=running.map(w=>'<option value="'+w.id+'">'+w.name+'（资源'+n(w.resource)+'）</option>').join("");
 const echoes=run.echoes.filter(e=>!e.used);
 return '<div class="stack"><section class="panel"><h2>万我同源</h2><p class="muted">资源援助不占分身每日行动，但会消耗来源世界的材料、1行动点和1灵魂；同一目标援助有冷却。</p>'+
 '<div class="select-row"><label>来源世界 <select id="aid-from">'+choices+'</select></label></div>'+
 '<div class="select-row"><label>目标世界 <select id="aid-to">'+choices+'</select></label></div>'+
 '<div class="event-actions"><button data-action="aid" data-mode="p">援助拯救 +12</button><button data-action="aid" data-mode="d">压制毁灭 −12</button></div>'+
 '<p class="hint">闭关分身允许提供资源，但不能参与二人或三人之力。二人之力需指定正在等待处理的精英战，或符合资格的终局战。</p></section>'+
 '<section class="panel"><h2>灵魂融合</h2><p class="muted">二人之力第2局解锁；三人之力第3局解锁。当前冷却至第 '+run.fusionNext+' 天。</p>'+
 running.map(w=>'<div class="soul-row row-between"><span>'+w.name+' · '+(w.id==="lingzai"?"条件型封印":"战斗终局")+'</span><button data-action="fusion" data-world="'+w.id+'" '+(run.runNumber<2||w.id==="lingzai"?'disabled':'')+'>为此世界借力</button></div>').join("")+'</section>'+
 '<section class="panel"><h2>世界回响</h2>'+(echoes.length?echoes.map(e=>'<div class="soul-row"><b>'+Engine.WORLDS[e.id].name+' 回响</b><div class="event-actions">'+running.filter(w=>w.id!==e.id).map(w=>'<button data-action="echo" data-from="'+e.id+'" data-world="'+w.id+'">支援'+w.name+'</button>').join("")+'</div></div>').join(""):'<div class="muted">还没有可使用的世界回响。已拯救世界不再参与普通援助。</div>')+'</section></div>';
}
function logsHtml(){
 return '<section class="panel"><h2>世界战报</h2><div class="muted">普通行为自动合并，关键危机和突破保留记录。</div>'+
 run.logs.slice(-42).reverse().map(l=>'<div class="log '+esc(l.kind)+'"><b>Day '+l.day+' '+(l.world==="system"?"全局":Engine.WORLDS[l.world]?.name||"全局")+'</b>'+esc(l.text)+'</div>').join("")+'</section>';
}
function homeHtml(){
 return '<header class="topbar"><div class="brand">☼ 同时穿越：末日模拟器</div><span class="pill">V0.2 开发原型</span></header>'+
 '<section class="hero"><div class="eyebrow">同一个灵魂 · 不同的末日</div><h1>一个我救不了末日，<br>就让多个我一起上。</h1>'+
 '<p>分身自动修炼、搜刮、狩猎、成长。你只负责关键选择和跨世界援助。</p>'+
 '<div class="stack" style="margin-top:20px">'+
 (run?'<button class="btn" data-action="continue">继续当前模拟 · 第'+run.day+'天</button>':'<button class="btn" data-action="new-run">开始第 '+(profile.runCount+1)+' 局</button>')+
 (run?'<button data-action="new-run">放弃本局，重新开启</button>':'')+'</div></section>'+
 '<section class="panel" style="margin-top:14px"><h2>进度与解锁</h2><p class="muted">已经完成 '+profile.runCount+' 局 · 世界碎片 '+profile.shards+' 枚。</p>'+
 '<p class="muted">第一局同时开启灵灾和尸潮；第二局解锁二人之力；第三局开启兽潮与三人之力。</p>'+
 '<p class="muted">战潮实验在每局开始前选择：让自动战斗拥有三波战报与稀疏战技构筑，或保持纯模拟。</p>'+
 '<label><input id="waves-enabled" type="checkbox" checked /> 开启战潮增强实验（可以取消）</label></section>'+
 '<p class="hint" style="margin-top:16px">本作仍处于早期原型，所有成长、怪物与世界恶化数值会根据测试调整。</p>';
}
function render(){
 app.classList.toggle("readonly",!session.isOwner);
 const banner = sessionBanner();
 if(!run||tab==="home"){app.innerHTML=banner+homeHtml()+persistenceBanner();return;}
 if(!run.active){
  app.innerHTML=banner+controls()+'<div class="stack"><section class="panel result"><h2>这一次的末日已经结束</h2><p><strong>'+run.result.saved+' / '+run.worlds.length+'</strong></p>'+
  '<p>成功拯救的世界 · 获得世界碎片 '+run.result.shards+'</p><div class="event-actions" style="justify-content:center"><button class="btn" data-action="new-run">开始下一次穿越</button><button data-action="tab" data-tab="log">查看本局经历</button></div></section>'+run.worlds.map(worldHtml).join("")+'</div>'+footer()+persistenceBanner();return;
 }
 app.innerHTML=banner+controls()+(tab==="world"?'<div class="stack">'+run.worlds.map(worldHtml).join("")+'</div>':tab==="soul"?soulHtml():logsHtml())+footer()+'<p id="toast" class="notice" hidden></p>'+persistenceBanner();
}
function footer(){return '<nav class="footer-nav"><button data-action="tab" data-tab="world" class="'+(tab==="world"?"active":"")+'">末日世界</button><button data-action="tab" data-tab="soul" class="'+(tab==="soul"?"active":"")+'">万我同源</button><button data-action="tab" data-tab="log" class="'+(tab==="log"?"active":"")+'">战报记录</button></nav>';}
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
 if(!session.isOwner){report("当前标签页是只读副本，请重新取得控制权。");return;}
 if(commandBusy)return;
 if(action==="new-run"){confirmNew();return;}
 if(!run)return;
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
   if(!a||!b){report("请选择来源和目标");return;}
   if(!window.confirm("来源世界消耗4资源、1行动点和1点灵魂强度，确定要援助吗？"))return;
   execute("aid",[a,b,mode]);return;
 }
}
app.addEventListener("click",event=>{const t=event.target.closest("[data-action]");if(t)handleClick(t);});
app.addEventListener("change",event=>{
 const t=event.target,action=t.dataset.action;
 if(!run||!session.isOwner||commandBusy)return;
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
