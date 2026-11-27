import seedrandom from "seedrandom";
import { getLegacyDoctrine } from "./config/legacy-doctrines.js";
import { replaySortieTrace, sortieIdentity, sortieSeed, sortieTraceFingerprint } from "./systems/sortie-trace.js";
import { previewSortieRewards } from "./systems/sortie-rewards.js";
import { SORTIE } from "./config/sortie-data.js";
import { WORLDS, POWERS, COMBOS, THRESHOLDS, LABELS } from "./config/game-data.js";
import { BALANCE, dailyDoomPressure } from "./config/balance.js";
import { selectAutonomousAction } from "./systems/action-policy.js";
import { computeWaveBonuses } from "./systems/wave-combat.js";
import { TACTICAL_ASSIST, previewTacticalAssist, tacticalAssistImpact } from "./systems/tactical-assist.js";
import { simulateSurvivorWaves, nextSurvivorFrenzy, applyFrenzyCaps } from "./systems/survivor-waves.js";
import { previewMajorEvent } from "./systems/event-contract.js";
import { recordWorldAction, recordWaveOutcome, recordBuildChoice } from "./systems/run-metrics.js";
import { summarizeFinale } from "./systems/finale-readiness.js";
import { evaluateFusion } from "./systems/fusion-contract.js";
import { previewResourceAid } from "./systems/aid-contract.js";
import { previewStrategyChange } from "./systems/strategy-contract.js";
import { captureIntervention, recordIntervention } from "./systems/intervention-ledger.js";
import { assessCrises } from "./systems/crisis-advisor.js";
import { FOLLOWUPS, canQueueFollowup, settleFollowup, followupMitigation, followupEpilogue } from "./systems/event-chain.js";
import { startCautiousInvestigation, cautiousMitigation, settleCautiousAftermath } from "./systems/clue-aftermath.js";
import { discoverEasterEgg, discoverCrossworldSecrets } from "./systems/easter-eggs.js";
const MultiworldEngine = (function () {
  "use strict";
  var VERSION = "0.2.0";
  var WORLD_ORDER = ["lingzai","zombie","beast"];
  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function r2(value) { return Math.round(value * 100) / 100; }
  function hash(input) {
    var h = 2166136261;
    var t = String(input);
    for (var i=0;i<t.length;i++) { h ^= t.charCodeAt(i); h = Math.imul(h,16777619); }
    return h >>> 0 || 123456789;
  }
  function random(w, key) {
    key = key || "rng";
    var rng = seedrandom("", { state:w[key] });
    var value = rng();
    w[key] = rng.state();
    return value;
  }
  function log(s,world,message,type) {
    s.logs.push({day:s.day, world:world||"system", text:message, kind:type||"normal"});
    if(s.logs.length>180)s.logs.splice(0,s.logs.length-180);
  }
  function worldAge(w,day){
    var bornDay=Number.isInteger(w?.bornDay)&&w.bornDay>0?w.bornDay:1;
    return Math.max(1,day-bornDay+1);
  }
  function newWorld(id, seed, runNumber, startingResourceBonus, worldNumber, slotId, bornDay) {
    var instance = Math.max(1, Number(worldNumber)||1);
    var startDay = Math.max(1,Number(bornDay)||1);
    var duration = runNumber===1?76:94;
    var rngKey = instance<=3 ? String(seed)+"/"+id : String(seed)+"/world/"+instance+"/"+id;
    var buildKey = instance<=3 ? String(seed)+"/build/"+id : String(seed)+"/build/world/"+instance+"/"+id;
    return {
      id:id,worldNumber:instance,slotId:Math.max(1,Number(slotId)||1),bornDay:startDay,
      name:WORLDS[id].name,status:"running",level:1,xp:0,resource:4+(startingResourceBonus||0),
      p:0,d:0,deadline:startDay+duration-1,strategy:id==="lingzai"?"growth":"rescue",
      action:"正在观察灾变",rng:seedrandom(rngKey, {state:true}).state(),
      buildRng:seedrandom(buildKey, {state:true}).state(),
      flags:{},milestones:[],threat:null,pendingEvent:null,queuedBoss:false,
      eventCount:0,injuryUntil:0,weaknessStart:0,weaknessUntil:0,retreat:null,
      repairUsed:false,suppression:0,echoMade:false,memoryCandidates:[],
      lastDecision:null,lastCombat:null,transitionSettled:false,
      build:{attack:[],support:[],count:0,pending:null,triggers:{},evolved:false,evolutionName:""}
    };
  }
  function fresh(seed,runNumber,waves,legacyId,worldsSavedCount) {
    var no = Math.max(1, Number(runNumber)||1);
    // The UI always passes the permanent rescue count. The omitted-argument
    // fallback keeps older integrations and deterministic fixtures compatible.
    var savedCount = Number.isInteger(worldsSavedCount)&&worldsSavedCount>=0
      ? worldsSavedCount : null;
    var slots = savedCount===null ? (no>=3?3:2) : Math.min(3,1+savedCount);
    var ids = WORLD_ORDER.slice(0,slots);
    var legacy = getLegacyDoctrine(legacyId);
    var s = {
      version:VERSION,id:"run-"+hash(seed+"/"+no),seed:String(seed),day:1,runNumber:no,active:true,
      legacyId:legacy?legacy.id:"",
      worldsSavedCount:savedCount===null?0:savedCount,worldsSavedThisRun:0,
      worldsFailedThisRun:0,worldsVisitedThisRun:ids.length,worldSlots:slots,
      worldSequence:ids.length,nextSlotId:ids.length+1,
      worldTypesSeen:ids.slice(),worldDiscoveryArchive:[],
      waves:!!waves,speed:1,paused:true,soul:8+(legacy?.startingSoul||0),ap:2+(legacy?.startingAP||0),apReserved:0,apMax:4,
      encounterPreference:"ask",pendingEncounter:null,lastEncounter:null,
      aidNext:{},fusionNext:1,echoes:[],memory:{},sequence:0,
      operationResults:{},operationOrder:[],
      worlds:ids.map(function(id,index){return newWorld(id,seed,no,legacy?.startingResource||0,index+1,index+1,1);}),logs:[],
      result:null
    };
    log(s,null,slots+"个世界已同时开启；分身将自主行动。","major");
    if(legacy)log(s,null,"文明传承生效："+legacy.title+" · "+legacy.effectLabel,"major");
    return s;
  }
  function byId(s,id){
    var matches=s.worlds.filter(function(w){return w.id===id;});
    return matches.find(function(w){return w.status==="running";})||matches[matches.length-1];
  }
  function nextWorldSpec(s){
    for(var offset=0;offset<WORLD_ORDER.length;offset++){
      var serial=s.worldSequence+offset;
      var id=WORLD_ORDER[serial%WORLD_ORDER.length];
      if(!alive(s).some(function(w){return w.id===id;})){
        s.worldSequence=serial+1;
        return {id:id,worldNumber:serial+1};
      }
    }
    return null;
  }
  function trimWorldHistory(s){
    var ended=s.worlds.filter(function(w){return w.status!=="running";});
    if(ended.length<=30)return;
    var remove=new Set(ended.slice(0,ended.length-30));
    s.worlds=s.worlds.filter(function(w){return w.status==="running"||!remove.has(w);});
  }
  function settleWorldTransitions(s){
    var terminal=s.worlds.filter(function(w){return w.status!=="running"&&!w.transitionSettled;})
      .sort(function(a,b){return (a.slotId||0)-(b.slotId||0);});
    if(!terminal.length)return;
    var previousSlots=Math.min(3,Math.max(1,Number(s.worldSlots)||alive(s).length||1));
    var saved=terminal.filter(function(w){return w.status==="saved";});
    terminal.forEach(function(w){
      w.transitionSettled=true;w.endDay=s.day;
      if(w.status==="saved"){
        s.worldsSavedThisRun=(s.worldsSavedThisRun||0)+1;
        s.worldsSavedCount=(s.worldsSavedCount||0)+1;
        (w.flags?.easterEggs||[]).forEach(function(id){
          if(!s.worldDiscoveryArchive.includes(id))s.worldDiscoveryArchive.push(id);
        });
      }else s.worldsFailedThisRun=(s.worldsFailedThisRun||0)+1;
    });
    s.worldSlots=Math.min(3,Math.max(previousSlots,1+s.worldsSavedCount));
    var extraSlots=Math.max(0,s.worldSlots-previousSlots);
    var specs=saved.map(function(w){return {slotId:w.slotId||s.nextSlotId++};});
    for(var i=0;i<extraSlots;i++)specs.push({slotId:s.nextSlotId++});
    specs.forEach(function(spec){
      var next=nextWorldSpec(s);
      if(!next)return;
      var legacy=getLegacyDoctrine(s.legacyId);
      var world=newWorld(next.id,s.seed,s.runNumber,legacy?.startingResource||0,next.worldNumber,spec.slotId,s.day+1);
      s.worlds.push(world);
      s.worldsVisitedThisRun=(s.worldsVisitedThisRun||0)+1;
      if(!s.worldTypesSeen.includes(next.id))s.worldTypesSeen.push(next.id);
      log(s,next.id,"分身穿越至第"+next.worldNumber+"个世界："+world.name+"。","major");
    });
    trimWorldHistory(s);
  }
  function restore(s,savedWorldsCount) {
    if(!s||!Array.isArray(s.worlds))return s;
    if(s.encounterPreference===undefined)s.encounterPreference="ask";
    if(s.pendingEncounter===undefined)s.pendingEncounter=null;
    if(s.lastEncounter===undefined)s.lastEncounter=null;
    var hasProgression=Number.isInteger(s.worldsSavedCount)&&Array.isArray(s.worldTypesSeen);
    if(hasProgression){
      s.worldsSavedCount=Math.max(s.worldsSavedCount,Number(savedWorldsCount)||0);
      s.worldsSavedThisRun=Number.isInteger(s.worldsSavedThisRun)?s.worldsSavedThisRun:s.worlds.filter(function(w){return w.status==="saved";}).length;
      s.worldsFailedThisRun=Number.isInteger(s.worldsFailedThisRun)?s.worldsFailedThisRun:s.worlds.filter(function(w){return w.status==="failed";}).length;
      s.worldsVisitedThisRun=Number.isInteger(s.worldsVisitedThisRun)?s.worldsVisitedThisRun:s.worlds.length;
      s.worldSlots=Math.min(3,Math.max(Number(s.worldSlots)||0,alive(s).length,Math.min(3,1+s.worldsSavedCount)));
      s.worldSequence=Math.max(Number(s.worldSequence)||0,...s.worlds.map(function(w){return Number(w.worldNumber)||0;}));
      s.nextSlotId=Math.max(Number(s.nextSlotId)||1,...s.worlds.map(function(w){return (Number(w.slotId)||0)+1;}));
      s.worldTypesSeen=Array.from(new Set([...(s.worldTypesSeen||[]),...s.worlds.map(function(w){return w.id;})]));
      s.worldDiscoveryArchive=Array.from(new Set([...(s.worldDiscoveryArchive||[]),...s.worlds.flatMap(function(w){return w.flags?.easterEggs||[];})]));
      s.worlds.forEach(function(w,index){
        if(!Number.isInteger(w.slotId))w.slotId=index+1;
        if(!Number.isInteger(w.worldNumber))w.worldNumber=index+1;
        if(!Number.isInteger(w.bornDay)||w.bornDay<1)w.bornDay=1;
        if(typeof w.transitionSettled!=="boolean")w.transitionSettled=w.status!=="running";
      });
      if(s.active)finishRun(s);
      return s;
    }
    var oldSaved=s.worlds.filter(function(w){return w.status==="saved";}).length;
    var oldFailed=s.worlds.filter(function(w){return w.status==="failed";}).length;
    s.worldsSavedCount=Math.max(0,Number(savedWorldsCount)||0);
    s.worldsSavedThisRun=0;s.worldsFailedThisRun=0;s.worldsVisitedThisRun=s.worlds.length;
    s.worldSlots=Math.min(3,Math.max(s.worlds.length,alive(s).length,1+s.worldsSavedCount));
    s.worldSequence=s.worlds.length;s.nextSlotId=s.worlds.length+1;
    s.worldTypesSeen=Array.from(new Set(s.worlds.map(function(w){return w.id;})));
    s.worldDiscoveryArchive=Array.from(new Set(s.worlds.flatMap(function(w){return w.flags?.easterEggs||[];})));
    s.worlds.forEach(function(w,index){
      if(!Number.isInteger(w.slotId))w.slotId=index+1;
      if(!Number.isInteger(w.worldNumber))w.worldNumber=index+1;
      if(!Number.isInteger(w.bornDay)||w.bornDay<1)w.bornDay=1;
      w.transitionSettled=!s.active;
    });
    if(s.active){
      finishRun(s);
    }else{
      s.worldsSavedCount+=oldSaved;
      s.worldsSavedThisRun=oldSaved;s.worldsFailedThisRun=oldFailed;
    }
    return s;
  }
  function alive(s){return s.worlds.filter(function(w){return w.status==="running";});}
  function availableAP(s){return s.ap-s.apReserved;}
  function resourceTarget(w) {
    var need=WORLDS[w.id].finalCost;
    if(w.id==="beast"&&w.suppression<2&&w.level>=3&&suppressNeeded(w))need+=4;
    return need;
  }
  function threatActive(w){return !!w.threat&&w.threat.status!=="cleared";}
  function suppressNeeded(w){return w.id==="beast"&&bossRequirement(w)>w.level&&w.level>=3&&w.p>=65;}
  function bossRequirement(w) {
    if(w.id==="zombie")return w.flags.weakness?3:4;
    if(w.id==="beast")return clamp(4+((w.phase==="狂化"||threatActive(w))?1:0)-(w.suppression>=2?1:0),4,5);
    return 0;
  }
  function effectiveLevel(s,w,bonus){return Math.max(0,w.level+(bonus||0)-(w.injuryUntil>=s.day?1:0));}
  function encounterCombatLevel(s,w){return clamp(Math.max(1,effectiveLevel(s,w)),1,4);}
  function demand(w){
    if(w.p<65)return "调查灾变根源";
    if(w.p<100)return "完善最终拯救准备";
    if(w.level<3)return "提升至终局基础等级";
    if(w.resource<resourceTarget(w))return "收集最终资源";
    if(w.id==="beast"&&bossRequirement(w)>w.level)return "压制兽王或借力";
    if(WORLDS[w.id].boss&&w.level<bossRequirement(w))return "成长或使用灵魂融合";
    return "准备完成，等待最终行动";
  }
  function produce(s,w,kind,amount) {
    if(amount>0&&w.weaknessStart<=s.day&&w.weaknessUntil>=s.day) amount*=0.7;
    if(kind==="xp"){w.xp=r2(w.xp+amount);checkLevel(s,w,false);}
    if(kind==="resource")w.resource=r2(w.resource+amount);
  }
  function checkLevel(s,w,fromMemory) {
    while(w.level<4&&w.xp>=THRESHOLDS[w.level]) {
      w.level++;
      log(s,w.id,"突破成长阶段："+WORLDS[w.id].stages[w.level-1]+"（Lv"+w.level+"）。","major");
      if(!fromMemory)w.memoryCandidates.push("level"+w.level);
      if(w.level===2)offerBuild(s,w,"首次突破Lv2");
    }
  }
  function milestone(s,w) {
    var thresholds=[30,65,100],names={30:"发现灾变异常规律",65:"定位灾难核心",100:"完成主要拯救准备"};
    thresholds.forEach(function(v){
      if(w.p>=v&&!w.flags["p"+v]){
        w.flags["p"+v]=true;
        w.milestones.push(v);
        log(s,w.id,"主线进展："+names[v]+"（"+v+"%）。","major");
        if(v===65)offerBuild(s,w,"主线定位完成");
      }
    });
  }
  function addProgress(s,w,value){w.p=r2(clamp(w.p+value,0,100));milestone(s,w);}
  function addD(w,value){w.d=r2(clamp(w.d+value,0,100));}
  function offerBuild(s,w,reason) {
    if(!s.waves||w.status!=="running"||w.build.count>=3||w.build.triggers[reason])return;
    w.build.triggers[reason]=true;
    if(w.build.pending){return;} // no queue: optional opportunities may be skipped
    var pool=POWERS[w.id].filter(function(p){
      var arr=w.build[p.slot],existing=arr.find(function(a){return a.id===p.id;});
      return existing?existing.lv<2:arr.length<(p.slot==="attack"?2:1);
    });
    if(!pool.length)return;
    var candidates=pool.slice();
    for(var i=candidates.length-1;i>0;i--){var j=Math.floor(random(w,"buildRng")*(i+1));var t=candidates[i];candidates[i]=candidates[j];candidates[j]=t;}
    w.build.pending={id:w.id+"/build/"+(++s.sequence),reason:reason,options:candidates.slice(0,3).map(function(p){return p.id;}),due:s.day+2};
    log(s,w.id,"获得战技觉醒机会，可选一项或等待自动构筑。","minor");
  }
  function chooseBuild(s,worldId,powerId,automatic){
    var w=byId(s,worldId);
    if(!w||!w.build.pending||w.status!=="running")return {ok:false,error:"没有可用的战技选择"};
    if(w.build.pending.options.indexOf(powerId)<0)return {ok:false,error:"不在本次候选列表"};
    var p=POWERS[w.id].find(function(x){return x.id===powerId;});
    var arr=w.build[p.slot],entry=arr.find(function(a){return a.id===p.id;});
    if(entry){if(entry.lv>=2)return {ok:false,error:"战技已达到当前上限"};entry.lv++;}
    else {if(arr.length>=(p.slot==="attack"?2:1))return {ok:false,error:"战技槽已满"};arr.push({id:p.id,lv:1});}
    var wasEvolved=w.build.evolved;
    w.build.count++;w.build.pending=null;
    var combo=COMBOS[w.id],all=w.build.attack.concat(w.build.support);
    if(!w.build.evolved&&w.build.count>=2&&all.some(function(x){return x.id===combo[0];})&&all.some(function(x){return x.id===combo[1];})){
      w.build.evolved=true;w.build.evolutionName=combo[2];
      log(s,w.id,"战技进化："+combo[2]+"！","major");
    }
    recordBuildChoice(w,automatic,!wasEvolved&&w.build.evolved);
    log(s,w.id,(automatic?"自动选择":"主动选择")+"战技："+p.name+(entry?" 升至Lv"+entry.lv:"")+"。","minor");
    return {ok:true};
  }
  function waveCombatBonus(s,w){
    // Resolve the encounter first: build effects are scaled by actual clears
    // and elite counters, then paid once through this battle transaction.
    var previous=w.waveMomentum;
    var momentum=previous&&s.day-previous.lastDay<=3?
      Math.min(3,previous.count+1):1;
    w.waveMomentum={lastDay:s.day,count:momentum};
    const context={day:s.day,level:w.level,momentum:momentum};
    const armed=w.tacticalAssist?.kind===TACTICAL_ASSIST.id;
    const ordinary=simulateSurvivorWaves(w.id,w.build,POWERS,context);
    const spectacle=armed?simulateSurvivorWaves(w.id,w.build,POWERS,{
      ...context,tacticalPower:TACTICAL_ASSIST.wavePower
    }):ordinary;
    const tactic=armed?tacticalAssistImpact(ordinary,spectacle):null;
    if(armed)w.tacticalAssist=null;
    var effect=computeWaveBonuses(w.id,w.build,POWERS,spectacle);
    const frenzy=nextSurvivorFrenzy(w.waveClearStreak,s.day,spectacle.fullClear);
    w.waveClearStreak={lastDay:frenzy.lastDay,count:frenzy.count};
    spectacle.frenzy=frenzy.activated;
    spectacle.clearStreak=frenzy.count;
    effect=applyFrenzyCaps(effect,frenzy.activated);
    if(frenzy.activated){
      log(s,w.id,"狂热爆发！连续第三次完整清屏，战技额外收益已计入本场上限。","major");
      // Only the first frenzy can grant a build opportunity, never a free power.
      if(w.build.pending)w.flags.frenzyBuildWaiting=true;
      else offerBuild(s,w,"首次狂热清屏");
    }
    var beforeXp=w.xp,beforeResource=w.resource,beforeD=w.d;
    if(effect.xp)produce(s,w,"xp",effect.xp);
    if(effect.resource)produce(s,w,"resource",effect.resource);
    if(effect.doomReduction)addD(w,-effect.doomReduction);
    w.lastCombat={
      day:s.day,
      action:w.action,
      stages:effect.stages,
      skills:effect.skills,
      evolution:effect.evolution,
      spectacle:spectacle,
      ...(tactic?{tactic:tactic}:{}),
      bonus:{
        xp:r2(w.xp-beforeXp),
        resource:r2(w.resource-beforeResource),
        doomReduced:r2(beforeD-w.d),
        waveClearBonus:r2(effect.waveClearBonus),
        waveLossMitigation:r2(effect.waveLossMitigation),
        waveLootModifier:r2(effect.waveLootModifier)
      }
    };
    // Record authoritative outcome after daily crisis pressure, so a tactical
    // reduction is measured rather than claimed while D is still zero.
  }
  function autoBuild(s,w) {
    if(!w.build.pending||w.build.pending.due>s.day)return;
    var opts=w.build.pending.options;
    var ranked=opts.map(function(id){
      var p=POWERS[w.id].find(function(x){return x.id===id;});
      var score=w.strategy==="clear"?(p.kind==="clear"?3:1):w.strategy==="growth"?(p.kind==="loot"?3:1):(p.kind==="defense"?3:1);
      var combo=COMBOS[w.id];
      var owned=w.build.attack.concat(w.build.support).map(function(item){return item.id;});
      if(!w.build.evolved&&
        ((owned.includes(combo[0])&&id===combo[1])||
         (owned.includes(combo[1])&&id===combo[0]))){
        score+=4;
      }
      return {id:id,score:score};
    }).sort(function(a,b){return b.score-a.score||a.id.localeCompare(b.id);});
    chooseBuild(s,w.id,ranked[0].id,true);
  }
  function resolveEvent(s,worldId,choice) {
    var w=byId(s,worldId);
    if(!s.active||!w||w.status!=="running"||!w.pendingEvent||w.pendingEvent.state!=="active")
      return {ok:false,error:"当前没有可处理的事件"};
    var preview=previewMajorEvent(s,w);
    var selected=preview&&preview.options.find(function(option){return option.id===choice;});
    if(!selected)return {ok:false,error:"此事件不支持该选项"};
    if(!selected.available)return {ok:false,error:selected.unavailableReason||"尚未满足干预条件"};

    if(choice==="fusion")return fuse(s,worldId);
    if(w.pendingEvent.type==="followup"){
      var outcome=settleFollowup(s,w,choice,{addProgress:addProgress,addD:addD,log:log});
      checkWorld(s,w);finishRun(s);
      return outcome;
    }
    if(w.pendingEvent.type==="boss"){
      if(choice==="retreat"){
        w.pendingEvent=null;
        if(w.threat)w.threat.retryDay=s.day+5;
        log(s,w.id,"谨慎撤离首领战，巢群仍在；第"+(s.day+5)+"日后可再次挑战。","minor");
        return {ok:true};
      }
      if(choice==="boost"){s.ap--;w.resource-=4;}
      finishBoss(s,w);
      return {ok:true};
    }
    if(choice==="push"){
      s.ap--;
      if(random(w)<0.65){
        addProgress(s,w,5);
        if(w.id==="lingzai"){
          w.flags.ancientSeal=true;
          w.resource=r2(w.resource+2);
          log(s,w.id,"探明古碑阵纹，获得2灵石与古阵拓本。","major");
        }else if(w.id==="zombie"){
          w.flags.weakness=true;
          log(s,w.id,"从失联广播破译母巢弱点，终战等级需求降低。","major");
        }else{
          w.suppression=Math.max(w.suppression,1);
          w.flags.beastTrail=true;
          log(s,w.id,"循巨兽足迹识破兽王活动规律，完成一阶段压制准备。","major");
        }
      }else{
        addD(w,5);w.injuryUntil=Math.max(w.injuryUntil,s.day+3);
        log(s,w.id,"深入调查失败，分身受伤3个后续游戏日，世界风险+5。","warning");
      }
    }else if(choice==="safe"){
      addProgress(s,w,2);
      startCautiousInvestigation(w,s.day);
      log(s,w.id,"谨慎保留线索：P+2，未来4日自然风险增长每天减少0.2。","minor");
    }else if(choice==="decline"){
      log(s,w.id,"主动放弃本次线索，没有额外收益或惩罚。","minor");
    }
    w.flags.sideResolved=true;
    w.pendingEvent=null;
    checkWorld(s,w);finishRun(s);
    return {ok:true};
  }
  function finishBoss(s,w){
    if(!w.threat||w.threat.status==="cleared")return;
    w.pendingEvent=null;w.threat.status="cleared";w.flags.bossDefeated=true;
    produce(s,w,"xp",8);produce(s,w,"resource",3);addProgress(s,w,3);addD(w,-5);
    w.memoryCandidates.push("elite");
    log(s,w.id,"三波排险完成，击退巢群核心；持续威胁已经解除。","major");
    if(s.waves)offerBuild(s,w,"首次击退精英");
  }
  function queuedEvent(s,w){
    // Active threats take priority over optional story rewards. An unresolved
    // follow-up remains eligible and is queued after the boss is handled.
    if(!w.pendingEvent&&threatActive(w)&&(w.queuedBoss||w.threat.status==="awaiting_alpha")&&s.day>=(w.threat.retryDay||1)){
      w.queuedBoss=false;w.eventCount++;
      w.pendingEvent={id:w.id+"/boss/"+w.eventCount,type:"boss",title:"巢群核心挑战",state:"queued",startDay:s.day+1,expiresDay:s.day+3};
    }
    if(!w.pendingEvent&&canQueueFollowup(w)){
      w.flags.followupQueued=true;
      w.eventCount++;
      w.pendingEvent={id:w.id+"/followup/"+w.eventCount,type:"followup",
        title:FOLLOWUPS[w.id].title,state:"queued",startDay:s.day+1,expiresDay:s.day+3};
      log(s,w.id,"先前成功调查的线索出现后续变化："+FOLLOWUPS[w.id].title+"。","major");
    }
  }
  function activateEvents(s,w){
    if(w.pendingEvent&&w.pendingEvent.state==="queued"&&w.pendingEvent.startDay<=s.day){
      w.pendingEvent.state="active";log(s,w.id,"重大事件："+w.pendingEvent.title+"，可干预或等待自动处理。","warning");
    }
    if(w.pendingEvent&&w.pendingEvent.state==="active"&&w.pendingEvent.expiresDay<=s.day){
      if(w.pendingEvent.type==="boss"){
        if(effectiveLevel(s,w)>=3)finishBoss(s,w);
        else {w.pendingEvent=null;if(w.threat)w.threat.retryDay=s.day+5;log(s,w.id,"实力尚不足，分身自动撤退，巢群威胁仍在。","minor");}
      }else resolveEvent(s,w.id,"safe");
    }
  }
  function newThreat(s,w){
    if(w.threat||worldAge(w,s.day)<12||w.d<10||random(w)>0.065)return;
    w.threat={id:w.id+"/threat/1",status:"active",progress:0,retryDay:1};
    log(s,w.id,"发现持续威胁："+(w.id==="zombie"?"地下停车场尸群":w.id==="beast"?"赤角兽群巢穴":"裂纹妖狼巢穴")+"。","warning");
  }
  function optionalEvent(s,w){
    if(w.pendingEvent||w.flags.sideFound||w.p<30||random(w)>0.10)return;
    w.flags.sideFound=true;w.eventCount++;
    w.pendingEvent={id:w.id+"/clue/"+w.eventCount,type:"clue",title:w.id==="lingzai"?"雾谷古碑":w.id==="zombie"?"失联广播":"巨兽足迹",state:"queued",startDay:s.day+1,expiresDay:s.day+3};
    log(s,w.id,"探索发现值得深入调查的新线索。","major");
  }
  function chooseAction(s,w){
    var result=selectAutonomousAction(w,{
      reserve:resourceTarget(w),
      bossLevel:bossRequirement(w),
      threatActive:threatActive(w),
      combatReady:effectiveLevel(s,w)>=2,
      threatUrgencyScore:BALANCE.actions.threatUrgencyScore,beastRescueNestPriorityDoom:BALANCE.actions.beastRescueNestPriorityDoom,
      nextRandom:function(){return random(w);}
    });
    w.lastDecision={
      day:s.day,actionId:result.actionId,
      reason:result.reason,alternatives:result.alternatives
    };
    return result.actionId;
  }

  function doAction(s,w,action){
    recordWorldAction(w,action);
    w.action=action;
    if(action==="growth"){
      w.action=w.id==="lingzai"?"吸纳灵气":w.id==="zombie"?"战斗训练":"吸收进化感悟";
      produce(s,w,"xp",BALANCE.actions.trainingExperience);
    }else if(action==="gather"){
      w.action=w.id==="lingzai"?"寻找灵石":w.id==="zombie"?"搜刮废土":"搜集进化结晶";
      produce(s,w,"resource",BALANCE.actions.gatheringResources);produce(s,w,"xp",0.2);
    }else if(action==="fight"){
      if(threatActive(w)&&w.level>=2&&w.threat.progress<2){
        w.threat.progress++;produce(s,w,"xp",3);produce(s,w,"resource",1);addD(w,-0.6);
        w.action="排险持续威胁 "+w.threat.progress+"/2";
        if(w.threat.progress>=2){w.queuedBoss=true;w.threat.status="awaiting_alpha";log(s,w.id,"巢群外围已肃清，首领挑战即将开启。","major");}
      }else{
        w.action=w.id==="lingzai"?"排险妖兽":w.id==="zombie"?"清理感染体":"巡护异兽";
        produce(s,w,"xp",w.level>=4?BALANCE.actions.maxStageCombatExperience:BALANCE.actions.combatExperience);produce(s,w,"resource",BALANCE.actions.combatResources);addD(w,-BALANCE.actions.combatDoomReduction);
      }
      if(s.waves){
        waveCombatBonus(s,w);
        log(s,w.id,"防线行动："+w.lastCombat.stages.join(" → ")+
          (w.lastCombat.evolution?" · "+w.lastCombat.evolution:"")+
          "。额外收益与减损已计入本次唯一战利品。","battle");
      }
    }else if(action==="explore"){
      w.action=w.id==="lingzai"?"调查灵脉":w.id==="zombie"?"追踪感染源":"追查兽王";
      addProgress(s,w,BALANCE.actions.explorationProgress);produce(s,w,"xp",0.5);optionalEvent(s,w);
    }else if(action==="rescue"){
      w.action=w.id==="lingzai"?"准备灵脉封印":w.id==="zombie"?"准备母巢净化":"准备兽王应对";
      addProgress(s,w,BALANCE.actions.preparationProgress);produce(s,w,"xp",0.2);
    }else if(action==="repair"){
      w.resource-=6;w.repairUsed=true;addD(w,-12);w.action="修复安全区防线";
      log(s,w.id,"动用6份零件进行一次性防线大修，危机压力降低。","major");
    }else if(action==="suppress"){
      w.action="压制兽王狂化";
      if(w.suppression===0){
        w.suppression=1;
        addD(w,-BALANCE.actions.beastSuppressionDoomRelief);
        log(s,w.id,"完成第一阶段兽王压制准备，危机压力-"+BALANCE.actions.beastSuppressionDoomRelief+"。","minor");
      }else if(w.resource>=4){
        w.resource-=4;w.suppression=2;
        addD(w,-BALANCE.actions.beastSuppressionDoomRelief);
        log(s,w.id,"耗费结晶完成压制；兽王战斗要求降低，危机压力-"+BALANCE.actions.beastSuppressionDoomRelief+"。","major");
      }else {w.action="搜集压制所需结晶";produce(s,w,"resource",3);}
    }
  }
  function worldPhase(w,day){
    var age=worldAge(w,day);
    return age>=70?"狂化":age>=35?"进化":"苏醒";
  }
  function worldEnd(s,w,status,reason){
    if(w.status!=="running")return;
    w.status=status;w.action=status==="saved"?"世界获救":"救援未完成";
    w.endReason=reason;w.endDay=s.day;w.transitionSettled=false;
    w.pendingEvent=null;w.queuedBoss=false;w.build.pending=null;
    if(w.retreat){s.apReserved=Math.max(0,s.apReserved-1);w.retreat=null;}
    if(status==="saved"){
      if(!w.echoMade){s.echoes.push({id:w.id,used:false});w.echoMade=true;}
      log(s,w.id,"世界获救！"+reason+(followupEpilogue(w)?" "+followupEpilogue(w):""),"success");
    }else{
      s.soul=clamp(s.soul-2,0,12);
      log(s,w.id,"救援未完成："+reason+"。灵魂强度-2。","danger");
    }
  }
  function checkWorld(s,w){
    if(w.status!=="running")return;
    if(w.d>=100)worldEnd(s,w,"failed","危机进度达到100%");
    else if(s.day>=w.deadline)worldEnd(s,w,"failed","到达灾变截止日");
    if(s.soul<=0){
      s.worlds.forEach(function(other){
        if(other.status==="running"){
          other.status="failed";other.action="灵魂坍塌";other.endReason="灵魂坍塌";other.endDay=s.day;other.transitionSettled=false;
          other.pendingEvent=null;other.build.pending=null;
          if(other.retreat){s.apReserved=Math.max(0,s.apReserved-1);other.retreat=null;}
          log(s,other.id,"灵魂支援耗尽，分身已安全撤离。","danger");
        }
      });
    }
  }
  function canFinal(s,w,bonus){
    if(w.status!=="running"||w.p<100||w.level<3||w.resource<WORLDS[w.id].finalCost||w.retreat)return false;
    if(!w.flags.p65||!w.flags.p100)return false;
    if(!WORLDS[w.id].boss)return true;
    return effectiveLevel(s,w,bonus)>=bossRequirement(w);
  }
  function finalize(s,w,bonus){
    if(!canFinal(s,w,bonus))return false;
    w.resource-=WORLDS[w.id].finalCost;
    worldEnd(s,w,"saved",w.id==="lingzai"?"灵脉核心已被封印。":w.id==="zombie"?"关键防线已稳定，感染源已完成处置。":"兽王威胁已平息，生态恢复工作开始。");
    return true;
  }
  function finishRun(s){
    if(!s||!s.active)return;
    settleWorldTransitions(s);
    discoverCrossworldSecrets(s).forEach(function(secret){log(s,null,secret.message,"minor");});
    if(alive(s).length)return;
    s.active=false;s.paused=true;
    var wins=s.worldsSavedThisRun||0,failed=s.worldsFailedThisRun||0;
    var visited=s.worldsVisitedThisRun||wins+failed;
    s.result={saved:wins,failed:failed,visited:visited,shards:wins*4+Math.max(0,failed),endedDay:s.day};
    log(s,null,"本局结束：拯救"+wins+"个世界，救援失败"+failed+"个世界，获得"+s.result.shards+"枚世界碎片。","major");
  }
  function memory(s){
    s.worlds.forEach(function(w){
      if(w.status!=="running"||(w.bornDay||1)>s.day){w.memoryCandidates=[];return;}
      var src=s.memory[w.id]||(s.memory[w.id]={count:0,lastDay:-100,keys:[]});
      if(src.count>=3||s.day<src.lastDay+6){w.memoryCandidates=[];return;}
      var dest=alive(s).filter(function(x){return x!==w;});
      if(!dest.length){w.memoryCandidates=[];return;}
      var keys=w.memoryCandidates.slice().sort(function(a,b){var aRank=a.indexOf("level")===0?0:1,bRank=b.indexOf("level")===0?0:1;return aRank-bRank||a.localeCompare(b);});
      var key=keys.find(function(k){return src.keys.indexOf(k)<0;});
      if(!key){w.memoryCandidates=[];return;}
      src.count++;src.lastDay=s.day;src.keys.push(key);
      dest.forEach(function(target){target.xp=r2(target.xp+5);checkLevel(s,target,true);});
      log(s,null,w.name+"的重大经历通过万我同源传递给"+dest.map(function(x){return x.name;}).join("、")+"：成长经验+5。","major");
      w.memoryCandidates=[];
    });
  }
  // Keep the ordinary step unchanged; an optional validated battle replaces
  // only Lingzai's daily main action, never a second bonus action.
  function tickDay(s,sortie,formalEncounter){
    if(!s||!s.active)return {ok:false,error:"本局已经结束"};
    if(s.day>1&&(s.day-1)%8===0){s.ap=Math.min(s.apMax,s.ap+2);log(s,null,"灵魂行动点恢复2点。","minor");}
    s.worlds.forEach(function(w){
      if(w.status==="running"&&(w.bornDay||1)<=s.day){queuedEvent(s,w);activateEvents(s,w);}
    });
    s.worlds.forEach(function(w){
      if(w.status!=="running"||(w.bornDay||1)>s.day)return;
      var nextPhase=worldPhase(w,s.day);
      if(w.id==="beast"&&w.phase!==nextPhase){w.phase=nextPhase;log(s,w.id,"兽王进入「"+nextPhase+"」阶段。","warning");}
      if(w.retreat){
        recordWorldAction(w,"retreat");
        w.action="闭关修炼（剩余"+w.retreat.remaining+"天）";
        w.lastDecision={day:s.day,actionId:"retreat",
          reason:"闭关占用今日主要行动，环境与活跃威胁继续施压",alternatives:[]};
        produce(s,w,"xp",w.retreat.duration===6?4.8:4);
        w.retreat.remaining--;
        if(w.retreat.remaining<=0){
          if(random(w)<(w.retreat.duration===6?0.22:0.10)){
            w.injuryUntil=Math.max(w.injuryUntil,s.day+3);log(s,w.id,"闭关遭遇灵气反噬，短暂受伤。","warning");
          }else log(s,w.id,"闭关完成，修为有所精进。","major");
          w.retreat=null;s.apReserved=Math.max(0,s.apReserved-1);
        }
      }else if(sortie&&w.id==="lingzai"){
        // Consume the real action decision RNG exactly once, as in an ordinary day.
        if(formalEncounter&&chooseAction(s,w)!=="fight")return;
        var clearingThreat=formalEncounter&&threatActive(w)&&w.level>=2&&w.threat.progress<2;
        recordWorldAction(w,formalEncounter?"fight":"sortie");
        w.action=(formalEncounter?"雾谷排险 · ":"雾谷出击 · ")+
          (sortie.outcome==="won"?"维持结界":"谨慎撤离");
        w.lastDecision={
          day:s.day,actionId:formalEncounter?"fight":"sortie",
          reason:formalEncounter?
            "本日真实排险行动由统一遭遇模拟器完成，不再重复执行自动排险":
            "本日主要行动由独立出击结算替代，不再执行其他自动行动",
          alternatives:[]
        };
        if(sortie.stones)produce(s,w,"resource",sortie.stones);
        if(sortie.experience)produce(s,w,"xp",sortie.experience);
        if(sortie.progress)addProgress(s,w,sortie.progress);
        // A real victory advances the existing threat contract, without a second loot payout.
        if(formalEncounter&&sortie.outcome==="won"){
          if(clearingThreat){
            w.threat.progress++;addD(w,-0.6);
            if(w.threat.progress>=2){w.queuedBoss=true;w.threat.status="awaiting_alpha";log(s,w.id,"巢群外围已肃清，首领挑战即将开启。","major");}
          }else addD(w,-BALANCE.actions.combatDoomReduction);
        }
        w.lastSortie={
          day:s.day,outcome:sortie.outcome,defeated:sortie.defeated,
          collectedShards:sortie.collectedShards,stones:sortie.stones,
          experience:sortie.experience,progress:sortie.progress
        };
        log(s,w.id,"雾谷出击完成："+(sortie.outcome==="won"?"结界已维持":"已返回营地")+
          "；拾取"+sortie.collectedShards+"碎片，实得灵石"+sortie.stones+"。","battle");
      }else doAction(s,w,chooseAction(s,w));
      const aftermath=settleCautiousAftermath(w,s.day);
      if(aftermath)log(s,w.id,aftermath,"minor");
      // Cosmetic discoveries never occupy event slots or consume RNG.
      const secret=discoverEasterEgg(s,w);
      if(secret)log(s,w.id,secret.message,"minor");
      // All sources of danger are calculated once after the day's major action.
      if(w.status==="running"){
        const pressure=Math.max(0,dailyDoomPressure(worldAge(w,s.day),s.runNumber)-
          followupMitigation(w,s.day,"natural")-cautiousMitigation(w,s.day));
        const tacticalReceipt=w.lastCombat?.day===s.day?w.lastCombat.tactic:null;
        const prevented=tacticalReceipt?Math.min(pressure,tacticalReceipt.dangerRelief):0;
        addD(w,pressure-prevented);
        if(tacticalReceipt){
          tacticalReceipt.dangerRelief=r2(prevented);
          w.lastCombat.bonus.doomReduced=r2(w.lastCombat.bonus.doomReduced+prevented);
          log(s,w.id,"集中火力已执行：额外击退"+tacticalReceipt.extraDefeated+
            "，本日实际减缓危机"+tacticalReceipt.dangerRelief+"；本次支援已消耗。","battle");
        }
        if(s.waves&&w.lastCombat?.day===s.day)recordWaveOutcome(w,w.lastCombat.bonus);
        if(threatActive(w)){
          const beastSuppressionMitigation=w.id==="beast"?
            Math.min(2,w.suppression||0)*BALANCE.actions.beastSuppressionThreatMitigation:0;
          addD(w,Math.max(0,0.3-followupMitigation(w,s.day,"threat")-beastSuppressionMitigation));
        }
        if(random(w)<0.015){addD(w,2.2);log(s,w.id,"灾变环境突然恶化，危机压力上涨。","warning");}
        newThreat(s,w);
        if(w.d>=100)checkWorld(s,w);
        if(w.status==="running")finalize(s,w,0);
        if(w.status==="running")checkWorld(s,w);
        if(w.status==="running")autoBuild(s,w);
        if(w.status==="running"&&w.flags.frenzyBuildWaiting&&!w.build.pending){
          w.flags.frenzyBuildWaiting=false;
          offerBuild(s,w,"首次狂热清屏");
        }
      }
    });
    // Completed worlds transition only after every current world has acted.
    memory(s);finishRun(s);
    if(s.active)s.day++;
    return {ok:true};
  }
  function encounterLocked(){return {ok:false,error:"正式遭遇尚未结算，请先结束战斗"};}
  function outsideEncounter(handler){
    return function(s,...args){return s?.pendingEncounter?encounterLocked():handler(s,...args);};
  }
  function step(s){return s?.pendingEncounter?encounterLocked():tickDay(s,null);}

  function captureSortieWorld(w) {
    return {
      key:w.worldNumber!==undefined?"world:"+w.worldNumber:
        w.slotId!==undefined?"slot:"+w.slotId:"id:"+w.id,
      id:w.id,status:w.status,level:w.level,xp:w.xp,
      resource:w.resource,p:w.p,d:w.d,action:w.action,
      decision:w.lastDecision?JSON.parse(JSON.stringify(w.lastDecision)):null
    };
  }

  /**
   * Validated by re-simulation; returns a *new* state for one atomic save.
   * Caller may display the receipt only after persisting the returned state.
   * Both same-ID and different-operation-ID replay are idempotent.
   */
  function isFormalReceipt(entry){
    return entry?.receipt?.formalEncounter===true||Boolean(entry?.receipt?.worlds?.some(function(w){return w.id==="lingzai"&&w.actionId==="fight";}));
  }
  function settleSortie(s,request){
    if(s?.pendingEncounter||request?.formalEncounter===true)return encounterLocked();
    return settleSortieTransaction(s,request,false);
  }
  function settleSortieTransaction(s,request,formalEncounter,combatLevel){
    combatLevel=combatLevel??1;
    if(!s||!request||typeof request.sortieId!=="string"||
      !Array.isArray(request.actions))return {ok:false,error:"出击结算参数无效"};
    var fingerprint=sortieTraceFingerprint(request.actions);
    var previously=s.sortieLedger&&s.sortieLedger[request.sortieId];
    if(previously){
      if(isFormalReceipt(previously)!==formalEncounter)
        return {ok:false,error:"结算类型与已有回执不匹配"};
      if(previously.fingerprint!==fingerprint){
        return {ok:false,error:"本次出击已结算，提交内容不匹配"};
      }
      return {ok:true,replayed:true,run:s,receipt:previously.receipt};
    }
    var ling=byId(s,"lingzai");
    if(!s.active||!ling||ling.status!=="running"||ling.retreat||
      request.sortieId!==sortieIdentity(s)){
      return {ok:false,error:"当前世界无法结算本次出击"};
    }
    var forgeLevel=s.sortieCamp?.forgeLevel??0;
    if(!Number.isInteger(forgeLevel)||forgeLevel<0||forgeLevel>SORTIE.forge.maxLevel)
      return {ok:false,error:"护灵剑台状态不合法"};
    var missionId=sortieMissionFromCamp(s);
    if(missionId===null||(request.missionId!==undefined&&request.missionId!==missionId)){
      return {ok:false,error:"Invalid sortie mission receipt"};
    }
    var verified=replaySortieTrace(sortieSeed(s),ling.d,request.actions,forgeLevel,missionId,"auto",combatLevel);
    if(!verified.ok)return {ok:false,error:verified.error};
    var reward=previewSortieRewards(verified.battle,{bankObjectiveOnRetreat:formalEncounter});
    if(!reward)return {ok:false,error:"战斗未完成"};
    // All consequences are applied to a clone: a failed validation, including
    // an event that closes the world before the action, changes no caller data.
    var next=JSON.parse(JSON.stringify(s));
    var before=next.worlds.map(captureSortieWorld);
    var outcome=tickDay(next,reward,formalEncounter);
    if(!outcome.ok||!byId(next,"lingzai").lastSortie||
      byId(next,"lingzai").lastSortie.day!==s.day){
      return {ok:false,error:"今日事件已阻止出击结算"};
    }
    var beforeByKey=new Map(before.map(function(w){return [w.key,w];}));
    var after=next.worlds.map(captureSortieWorld);
    var changes=after.map(function(w){
      var original=beforeByKey.get(w.key);
      if(!original)return null; // Newly opened worlds begin acting on their born day.
      var snapshot={...w};delete snapshot.key;
      return {
        ...snapshot,resourceDelta:r2(w.resource-original.resource),
        xpDelta:r2(w.xp-original.xp),pDelta:r2(w.p-original.p),
        dDelta:r2(w.d-original.d),
        actionId:w.decision&&w.decision.day===s.day?w.decision.actionId:null
      };
    }).filter(Boolean);
    var receipt={
      sortieId:request.sortieId,day:s.day,nextDay:next.day,
      battle:reward,missionId:missionId,objectiveStones:reward.objectiveStones,
      ...(formalEncounter?{formalEncounter:true}:{}),
      worlds:changes,
      newLogs:next.logs.slice(s.logs.length).map(function(entry){return {...entry};})
    };
    if(!next.sortieLedger)next.sortieLedger={};
    next.sortieLedger[request.sortieId]={fingerprint:fingerprint,receipt:receipt};
    return {ok:true,run:next,receipt:receipt};
  }

  function setStrategy(s,id,strategy){
    var preview=previewStrategyChange(s,id,strategy);
    if(!preview.available)return {ok:false,error:preview.reason};
    if(!preview.changed)return {ok:true};
    s.ap-=preview.cost;
    byId(s,id).strategy=strategy;
    log(s,id,"调整自主策略为「"+LABELS[strategy]+"」，消耗"+preview.cost+"行动点。","minor");
    return {ok:true};
  }
  function previewTactic(s,id){
    return previewTacticalAssist(s,s?byId(s,id):null,s?availableAP(s):0);
  }
  function setTactic(s,id){
    var preview=previewTactic(s,id);
    if(!preview.available)return {ok:false,error:preview.reason};
    var w=byId(s,id);
    s.ap-=TACTICAL_ASSIST.apCost;
    w.tacticalAssist={kind:TACTICAL_ASSIST.id,issuedDay:s.day};
    log(s,id,"投入1点干预点，下次自动排险集中火力（最多每波额外击退4只）。","minor");
    return {ok:true};
  }
  function retreat(s,id,duration){
    var w=byId(s,id);
    if(!s.active||!w||w.id!=="lingzai"||w.status!=="running"||w.level<2||w.retreat||[4,6].indexOf(duration)<0)return {ok:false,error:"当前无法安排闭关"};
    if(availableAP(s)<1)return {ok:false,error:"闭关需要预留1个行动点"};
    s.apReserved++;w.retreat={duration:duration,remaining:duration};log(s,id,"安排"+duration+"天闭关，预留1个灵魂行动点。","major");return {ok:true};
  }
  function exitRetreat(s,id){
    var w=byId(s,id);
    if(!s.active||!w||!w.retreat||w.status!=="running")return {ok:false,error:"没有进行中的闭关"};
    if(s.soul<=1)return {ok:false,error:"强行出关至少需要剩余1点灵魂"};
    s.soul--;addD(w,8);w.retreat=null;s.apReserved=Math.max(0,s.apReserved-1);
    log(s,id,"强行出关：灵魂强度-1，世界风险+8。","warning");
    checkWorld(s,w);finishRun(s);return {ok:true};
  }
  function aid(s,sourceId,targetId,mode){
    var preview=previewResourceAid(s,sourceId,targetId,mode);
    if(!preview.available)return {ok:false,error:preview.reason};
    var source=byId(s,sourceId),target=byId(s,targetId);
    source.resource=r2(source.resource-preview.resourceCost);
    s.ap-=preview.apCost;s.soul-=preview.soulCost;
    s.aidNext[target.id]=s.day+9;
    if(mode==="p")addProgress(s,target,preview.actualDelta);
    else addD(target,-preview.actualDelta);
    log(s,null,source.name+"支援"+target.name+"：消耗4资源、1行动点与1灵魂，"+
      (mode==="p"?"实际拯救准备+":"实际危机压力-")+preview.actualDelta+"。","major");
    return {ok:true};
  }
  function previewFusion(s,targetId,providers){
    var target=s?byId(s,targetId):null;
    return evaluateFusion(s,target,{
      definition:target?WORLDS[target.id]:null,
      bossRequirement:target?bossRequirement(target):0,
      effectiveLevel:target?effectiveLevel(s,target):0,
      freeAP:s?availableAP(s):0,
      canFinish:target?canFinal(s,target,0):false
    },providers);
  }
  function fuse(s,targetId,providers){
    var eligibility=previewFusion(s,targetId,providers);
    if(!eligibility.available)return {ok:false,error:eligibility.reason};
    var target=byId(s,targetId);
    var count=eligibility.bonusLevel;
    s.ap-=eligibility.apCost;s.soul-=eligibility.soulCost;
    s.fusionNext=s.day+(count===2?21:13);
    eligibility.donorIds.forEach(function(id){
      var provider=byId(s,id);
      provider.weaknessStart=s.day+1;provider.weaknessUntil=s.day+3;
    });
    if(eligibility.battle==="boss")finishBoss(s,target);
    else finalize(s,target,count);
    log(s,null,eligibility.kind+"成功："+target.name+"本次战斗有效等级+"+count+
      "，力量提供者未来3日成长减缓。","major");
    finishRun(s);return {ok:true};
  }
  function useEcho(s,echoWorldId,targetId){
    var echo=s.echoes.find(function(x){return x.id===echoWorldId&&!x.used;}),target=byId(s,targetId);
    if(!s.active||!echo||!target||target.status!=="running"||target.id===echoWorldId)return {ok:false,error:"回响或目标无效"};
    echo.used=true;
    if(echoWorldId==="lingzai")addD(target,-10);
    else if(echoWorldId==="zombie")target.resource=r2(target.resource+6);
    else {target.xp=r2(target.xp+8);checkLevel(s,target,true);}
    log(s,null,WORLDS[echoWorldId].name+"回响支援"+target.name+"。","major");
    return {ok:true};
  }
  /**
   * The UI sends one immutable operationId per user gesture. Replaying that
   * operation after a save/refresh returns the saved outcome with no new cost.
   * Failed outcomes are also recorded, so retries must use a fresh ID.
   */
  function applyCommand(s,command){
    if(!s||!command||typeof command.operationId!=="string"||
      !/^[A-Za-z0-9:_/.-]{1,128}$/.test(command.operationId)||
      !Array.isArray(command.args)||command.args.length>6){
      return {ok:false,error:"指令格式或操作ID不合法"};
    }
    var handlers={
      strategy:setStrategy,
      tactic:setTactic,
      retreat:retreat,
      exitRetreat:exitRetreat,
      aid:aid,
      fusion:fuse,
      event:resolveEvent,
      build:chooseBuild,
      echo:useEcho
    };
    if(!Object.prototype.hasOwnProperty.call(handlers,command.type)){
      return {ok:false,error:"未知玩家指令"};
    }
    var signature=JSON.stringify([command.type,command.args]);
    var saved=s.operationResults&&s.operationResults[command.operationId];
    if(saved){
      if(saved.signature!==signature)return {ok:false,error:"操作ID与已有指令不匹配"};
      return {...saved.result,replayed:true};
    }
    if(s.pendingEncounter)return encounterLocked();
    var before=captureIntervention(s);
    var result=handlers[command.type](s,...command.args);
    if(result.ok)recordIntervention(s,command,before);
    if(!s.operationResults)s.operationResults={};
    if(!s.operationOrder)s.operationOrder=[];
    s.operationResults[command.operationId]={signature:signature,result:{...result}};
    s.operationOrder.push(command.operationId);
    if(s.operationOrder.length>256)delete s.operationResults[s.operationOrder.shift()];
    return result;
  }
  function info(s,w) {
    var ready=canFinal(s,w,0),bossLevel=bossRequirement(w);
    return {canFinish:ready,bossRequirement:bossLevel,remainingResources:Math.max(0,resourceTarget(w)-w.resource),
      goal:demand(w),stage:WORLDS[w.id].stages[w.level-1],resourceName:WORLDS[w.id].resourceName,
      freeAP:availableAP(s),injured:w.injuryUntil>=s.day,threatActive:threatActive(w),
      finale:summarizeFinale(s,w,{definition:WORLDS[w.id],bossLevel:bossLevel,
        effectiveLevel:effectiveLevel(s,w),canFinish:ready})};
  }
  function advise(s){
    return assessCrises(s,{info:info,event:previewMajorEvent,
      fusion:previewFusion,aid:previewResourceAid});
  }
  /**
   * Predict the exact next daily action by stepping a disposable snapshot.
   * This mirrors all event activation and seeded action selection without
   * consuming RNG, advancing the day, or mutating the caller's RunState.
   */
  function previewNextAction(s,worldId){
    if(!s||typeof s!=="object"||!Array.isArray(s.worlds)||!Number.isInteger(s.day))
      return {ok:false,error:"Invalid RunState"};
    if(!s.active)return {ok:false,error:"Run is inactive"};
    if(typeof worldId!=="string"||!byId(s,worldId))
      return {ok:false,error:"World not found"};
    var day=s.day;
    var snapshot=JSON.parse(JSON.stringify(s));
    var outcome=tickDay(snapshot,null);
    if(!outcome.ok)return {ok:false,error:outcome.error};
    var world=byId(snapshot,worldId);
    var decision=world?.lastDecision;
    var acted=Boolean(decision&&decision.day===day);
    return {
      ok:true,worldId:worldId,day:day,
      actionId:acted?decision.actionId:null,
      reason:acted?decision.reason:"",
      alternatives:acted&&Array.isArray(decision.alternatives)?decision.alternatives.slice():[],
      status:world?.status??null,
      pendingEvent:world?.pendingEvent?.state==="active",
      pendingBuild:Boolean(world?.build?.pending)
    };
  }

  /** Start a real Lingzai fight only when the authoritative next action is fight. */
  function beginEncounter(s,worldId){
    if(!s||!s.active||!Array.isArray(s.worlds))return {ok:false,error:"当前远征不可进行战斗"};
    if(worldId!=="lingzai")return {ok:false,error:"首个实时遭遇暂时只开放灵灾世界"};
    if(s.pendingEncounter){
      if(s.pendingEncounter.id===sortieIdentity(s)&&s.pendingEncounter.day===s.day)
        return {ok:true,replayed:true,pending:s.pendingEncounter};
      return {ok:false,error:"已有未完成的遭遇，不能开启第二场战斗"};
    }
    if(s.sortieLedger?.[sortieIdentity(s)])return {ok:false,error:"本日遭遇已经结算"};
    var world=byId(s,worldId);
    if(!world||world.status!=="running"||world.retreat||
      world.pendingEvent?.state==="active"||world.build?.pending){
      return {ok:false,error:"当前世界有待处理事务，暂时不能进入战斗"};
    }
    // Paid tactical support belongs to the old wave resolver until mapped to real combat.
    if(s.waves&&world.tacticalAssist?.kind===TACTICAL_ASSIST.id)
      return {ok:false,error:"已安排集中火力，本次沿用自动排险"};
    var preview=previewNextAction(s,worldId);
    if(!preview.ok||preview.actionId!=="fight"||preview.status!=="running"||
      preview.pendingEvent||preview.pendingBuild){
      return {ok:false,error:"下一次真实行动不是可接管的排险战斗"};
    }
    var forgeLevel=s.sortieCamp?.forgeLevel??0;
    var missionId=sortieMissionFromCamp(s);
    if(!Number.isInteger(forgeLevel)||forgeLevel<0||forgeLevel>SORTIE.forge.maxLevel||missionId===null)
      return {ok:false,error:"当前战斗准备状态不合法"};
    var pending={
      id:sortieIdentity(s),worldId:worldId,day:s.day,
      combatLevel:encounterCombatLevel(s,world),
      seed:sortieSeed(s),danger:world.d,forgeLevel:forgeLevel,missionId:missionId,
      reason:preview.reason,actions:[],controller:"choice"
    };
    s.pendingEncounter=pending;
    s.paused=true;
    return {ok:true,pending:pending};
  }

  /** Select the objective before choosing the encounter controller. */
  function setEncounterMission(s,missionId){
    var pending=s?.pendingEncounter;
    if(!pending||pending.controller!=="choice")
      return {ok:false,error:"当前没有等待选择任务的遭遇"};
    if(typeof missionId!=="string"||!SORTIE.mission.options.includes(missionId))
      return {ok:false,error:"无效的灵灾任务"};
    if(missionId==="salvage"&&(!Number.isInteger(SORTIE.mission.rewardStones)||SORTIE.mission.rewardStones<=0))
      return {ok:false,error:"险地回收任务当前不可用"};
    if(pending.missionId===missionId&&sortieMissionFromCamp(s)===missionId)
      return {ok:true,missionId,unchanged:true};
    if(s.sortieCamp!==undefined&&s.sortieCamp!==null&&
      (typeof s.sortieCamp!=="object"||Array.isArray(s.sortieCamp)))
      return {ok:false,error:"营地任务记录无效"};
    if(!s.sortieCamp)s.sortieCamp={forgeLevel:0,buildReceipt:null};
    if(s.sortieCamp.forgeLevel===undefined)s.sortieCamp.forgeLevel=0;
    if(!Number.isInteger(s.sortieCamp.forgeLevel)||s.sortieCamp.forgeLevel<0||
      s.sortieCamp.forgeLevel>SORTIE.forge.maxLevel)
      return {ok:false,error:"护灵剑台状态不合法"};
    s.sortieCamp.missionSelection={
      missionId,day:s.day,operationId:"encounter:"+s.day+":"+missionId
    };
    pending.missionId=missionId;
    return {ok:true,missionId};
  }

  /** Choose the controller for this real encounter and remember the preference. */
  function setEncounterMode(s,mode){
    var pending=s?.pendingEncounter;
    if(!pending||pending.controller!=="choice"||!["ai","player"].includes(mode))
      return {ok:false,error:"当前没有等待选择的遭遇"};
    if(mode==="ai"&&pending.missionId==="salvage")
      return {ok:false,error:"险地回收需要本源意识接管"};
    pending.controller=mode;
    s.encounterPreference=mode;
    s.paused=mode!=="player";
    return {ok:true,controller:mode};
  }

  /** Hand the same live encounter back to the AI without resetting its state. */
  function handoffEncounterToAI(s){
    var pending=s?.pendingEncounter;
    if(!pending||pending.controller!=="player")
      return {ok:false,error:"当前没有可交还托管的战斗"};
    pending.controller="ai";
    s.paused=true;
    return {ok:true,controller:"ai"};
  }

  /** Settle the stored trace once; never accept client-authored reward numbers. */
  function settleEncounter(s,request){
    var pending=s?.pendingEncounter;
    var requestedId=request?.sortieId;
    if(!pending){
      var previous=requestedId&&s?.sortieLedger?.[requestedId];
      if(isFormalReceipt(previous))return {ok:true,replayed:true,run:s,receipt:previous.receipt};
      return {ok:false,error:"没有可结算的正式遭遇"};
    }
    if(requestedId&&requestedId!==pending.id)
      return {ok:false,error:"遭遇编号与当前待结算战斗不匹配"};
    if(!s.active||pending.worldId!=="lingzai"||pending.day!==s.day||
      pending.id!==sortieIdentity(s)||pending.seed!==sortieSeed(s)||
      !["player","ai"].includes(pending.controller)||!Array.isArray(pending.actions))
      return {ok:false,error:"正式遭遇状态无效或已过期"};
    var world=byId(s,"lingzai");
    var currentForgeLevel=s.sortieCamp?.forgeLevel??0;
    var currentMissionId=sortieMissionFromCamp(s);
    var combatLevel=pending.combatLevel??1;
    if(!world||world.status!=="running"||world.d!==pending.danger||world.retreat||
      pending.forgeLevel!==currentForgeLevel||pending.missionId!==currentMissionId||
      (pending.combatLevel!==undefined&&combatLevel!==encounterCombatLevel(s,world)))
      return {ok:false,error:"遭遇期间世界或战斗准备状态发生变化，拒绝结算"};
    var preview=previewNextAction(s,"lingzai");
    if(!preview.ok||preview.actionId!=="fight"||preview.status!=="running"||
      preview.pendingEvent||preview.pendingBuild)
      return {ok:false,error:"当前日期已不再允许结算排险遭遇"};
    if(s.waves&&world.tacticalAssist?.kind===TACTICAL_ASSIST.id)return encounterLocked();
    var result=settleSortieTransaction(s,{
      sortieId:pending.id,actions:pending.actions,missionId:pending.missionId
    },true,combatLevel);
    if(!result.ok)return result;
    var next=result.replayed?JSON.parse(JSON.stringify(s)):result.run;
    next.pendingEncounter=null;
    next.paused=true;
    next.encounterPreference=s.encounterPreference||pending.controller;
    next.lastEncounter={
      id:pending.id,day:result.receipt.day,nextDay:result.receipt.nextDay,
      battle:result.receipt.battle,worlds:result.receipt.worlds
    };
    return {...result,run:next};
  }

  return {VERSION:VERSION,WORLDS:WORLDS,POWERS:POWERS,COMBOS:COMBOS,LABELS:LABELS,THRESHOLDS:THRESHOLDS,
    fresh:fresh,restore:restore,step:step,previewNextAction:previewNextAction,beginEncounter:beginEncounter,
    setEncounterMission:setEncounterMission,setEncounterMode:setEncounterMode,handoffEncounterToAI:handoffEncounterToAI,
    settleEncounter:settleEncounter,settleSortie:settleSortie,byId:byId,info:info,advise:advise,availableAP:availableAP,chooseBuild:outsideEncounter(chooseBuild),
    setStrategy:outsideEncounter(setStrategy),retreat:outsideEncounter(retreat),exitRetreat:outsideEncounter(exitRetreat),aid:outsideEncounter(aid),fuse:outsideEncounter(fuse),
    resolveEvent:outsideEncounter(resolveEvent),previewMajorEvent:previewMajorEvent,previewFusion:previewFusion,previewAid:previewResourceAid,previewStrategy:previewStrategyChange,previewTactic:previewTactic,useEcho:outsideEncounter(useEcho),applyCommand:applyCommand,canFinal:canFinal,bossRequirement:bossRequirement};
})();
export default MultiworldEngine;
/** Validated persisted camp selection; client-side request bonuses are ignored. */
function sortieMissionFromCamp(run) {
  const selection = run.sortieCamp?.missionSelection;
  if (selection === undefined || selection === null) return "safe";
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return null;
  // A previous day's objective must never block the next day's encounter.
  if (Number.isInteger(selection.day) && selection.day < run.day) return "safe";
  if (!SORTIE.mission.options.includes(selection.missionId) ||
    selection.day !== run.day || typeof selection.operationId !== "string" ||
    !/^[A-Za-z0-9:_/.-]{1,128}$/.test(selection.operationId)) return null;
  return selection.missionId;
}
