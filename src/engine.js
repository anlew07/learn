import seedrandom from "seedrandom";
import { WORLDS, POWERS, COMBOS, THRESHOLDS, LABELS } from "./config/game-data.js";
import { BALANCE, dailyDoomPressure } from "./config/balance.js";
import { selectAutonomousAction } from "./systems/action-policy.js";
import { computeWaveBonuses } from "./systems/wave-combat.js";
import { previewMajorEvent } from "./systems/event-contract.js";
import { recordWorldAction, recordWaveOutcome, recordBuildChoice } from "./systems/run-metrics.js";
import { summarizeFinale } from "./systems/finale-readiness.js";
const MultiworldEngine = (function () {
  "use strict";
  var VERSION = "0.2.0";
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
  function newWorld(id, seed, runNumber) {
    return {
      id:id,name:WORLDS[id].name,status:"running",level:1,xp:0,resource:4,
      p:0,d:0,deadline:runNumber===1?76:94,strategy:id==="lingzai"?"growth":"rescue",
      action:"正在观察末日",rng:seedrandom(String(seed)+"/"+id, {state:true}).state(),
      buildRng:seedrandom(String(seed)+"/build/"+id, {state:true}).state(),
      flags:{},milestones:[],threat:null,pendingEvent:null,queuedBoss:false,
      eventCount:0,injuryUntil:0,weaknessStart:0,weaknessUntil:0,retreat:null,
      repairUsed:false,suppression:0,echoMade:false,memoryCandidates:[],
      lastDecision:null,lastCombat:null,
      build:{attack:[],support:[],count:0,pending:null,triggers:{},evolved:false,evolutionName:""}
    };
  }
  function fresh(seed,runNumber,waves) {
    var no = Math.max(1, Number(runNumber)||1);
    var ids = no>=3?["lingzai","zombie","beast"]:["lingzai","zombie"];
    var s = {
      version:VERSION,id:"run-"+hash(seed+"/"+no),seed:String(seed),day:1,runNumber:no,active:true,
      waves:!!waves,speed:1,paused:true,soul:8,ap:2,apReserved:0,apMax:4,
      aidNext:{},fusionNext:1,echoes:[],memory:{},sequence:0,
      operationResults:{},operationOrder:[],
      worlds:ids.map(function(id){return newWorld(id,seed,no);}),logs:[],
      result:null
    };
    log(s,null,ids.length+"个世界已同时开启；分身将自主行动。","major");
    return s;
  }
  function byId(s,id){return s.worlds.find(function(w){return w.id===id;});}
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
  function demand(w){
    if(w.p<65)return "调查末日根源";
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
    var thresholds=[30,65,100],names={30:"发现末日异常规律",65:"定位灾难核心",100:"完成主要拯救准备"};
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
    var effect=computeWaveBonuses(w.id,w.build,POWERS);
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
      bonus:{
        xp:r2(w.xp-beforeXp),
        resource:r2(w.resource-beforeResource),
        doomReduced:r2(beforeD-w.d)
      }
    };
    recordWaveOutcome(w,w.lastCombat.bonus);
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
        log(s,w.id,"深入调查失败，分身受伤3个后续游戏日，世界毁灭+5。","warning");
      }
    }else if(choice==="safe"){
      addProgress(s,w,2);
      log(s,w.id,"谨慎保留线索，拯救准备+2。","minor");
    }else if(choice==="decline"){
      log(s,w.id,"主动放弃本次线索，没有额外收益或惩罚。","minor");
    }
    w.flags.sideResolved=true;
    w.pendingEvent=null;
    checkWorld(s,w);
    return {ok:true};
  }
  function finishBoss(s,w){
    if(!w.threat||w.threat.status==="cleared")return;
    w.pendingEvent=null;w.threat.status="cleared";w.flags.bossDefeated=true;
    produce(s,w,"xp",8);produce(s,w,"resource",3);addProgress(s,w,3);addD(w,-5);
    w.memoryCandidates.push("elite");
    log(s,w.id,"三波清剿完成，击败巢群首领；持续威胁已经解除。","major");
    if(s.waves)offerBuild(s,w,"首次击败精英");
  }
  function queuedEvent(s,w){
    if(!w.pendingEvent&&threatActive(w)&&(w.queuedBoss||w.threat.status==="awaiting_alpha")&&s.day>=(w.threat.retryDay||1)){
      w.queuedBoss=false;w.eventCount++;
      w.pendingEvent={id:w.id+"/boss/"+w.eventCount,type:"boss",title:"巢群首领挑战",state:"queued",startDay:s.day+1,expiresDay:s.day+3};
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
    if(w.threat||s.day<12||w.d<10||random(w)>0.065)return;
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
      threatUrgencyScore:BALANCE.actions.threatUrgencyScore,
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
        w.action="清剿持续威胁 "+w.threat.progress+"/2";
        if(w.threat.progress>=2){w.queuedBoss=true;w.threat.status="awaiting_alpha";log(s,w.id,"巢群外围已肃清，首领挑战即将开启。","major");}
      }else{
        w.action=w.id==="lingzai"?"清剿妖兽":w.id==="zombie"?"清理感染体":"狩猎异兽";
        produce(s,w,"xp",w.level>=4?BALANCE.actions.maxStageCombatExperience:BALANCE.actions.combatExperience);produce(s,w,"resource",BALANCE.actions.combatResources);addD(w,-BALANCE.actions.combatDoomReduction);
      }
      if(s.waves){
        waveCombatBonus(s,w);
        log(s,w.id,"战潮："+w.lastCombat.stages.join(" → ")+
          (w.lastCombat.evolution?" · "+w.lastCombat.evolution:"")+
          "。额外收益与减损已计入本次唯一战利品。","battle");
      }
    }else if(action==="explore"){
      w.action=w.id==="lingzai"?"调查灵脉":w.id==="zombie"?"追踪感染源":"追查兽王";
      addProgress(s,w,BALANCE.actions.explorationProgress);produce(s,w,"xp",0.5);optionalEvent(s,w);
    }else if(action==="rescue"){
      w.action=w.id==="lingzai"?"准备灵脉封印":w.id==="zombie"?"准备母巢净化":"准备兽王讨伐";
      addProgress(s,w,BALANCE.actions.preparationProgress);produce(s,w,"xp",0.2);
    }else if(action==="repair"){
      w.resource-=6;w.repairUsed=true;addD(w,-12);w.action="修复安全区防线";
      log(s,w.id,"动用6份零件进行一次性防线大修，毁灭压力降低。","major");
    }else if(action==="suppress"){
      w.action="压制兽王狂化";
      if(w.suppression===0){w.suppression=1;log(s,w.id,"完成第一阶段兽王压制准备。","minor");}
      else if(w.resource>=4){w.resource-=4;w.suppression=2;log(s,w.id,"耗费结晶完成压制；当前兽王战斗要求降低。","major");}
      else {w.action="搜集压制所需结晶";produce(s,w,"resource",3);}
    }
  }
  function worldPhase(w,day){return day>=70?"狂化":day>=35?"进化":"苏醒";}
  function worldEnd(s,w,status,reason){
    if(w.status!=="running")return;
    w.status=status;w.action=status==="saved"?"世界获救":"世界崩溃";
    w.pendingEvent=null;w.queuedBoss=false;w.build.pending=null;
    if(w.retreat){s.apReserved=Math.max(0,s.apReserved-1);w.retreat=null;}
    if(status==="saved"){
      if(!w.echoMade){s.echoes.push({id:w.id,used:false});w.echoMade=true;}
      log(s,w.id,"世界获救！"+reason,"success");
    }else{
      s.soul=clamp(s.soul-2,0,12);
      log(s,w.id,"末日降临："+reason+"。灵魂强度-2。","danger");
    }
  }
  function checkWorld(s,w){
    if(w.status!=="running")return;
    if(w.d>=100)worldEnd(s,w,"failed","毁灭进度达到100%");
    else if(s.day>=w.deadline)worldEnd(s,w,"failed","到达末日截止日");
    if(s.soul<=0){
      s.worlds.forEach(function(other){
        if(other.status==="running"){
          other.status="failed";other.action="灵魂坍塌";other.pendingEvent=null;other.build.pending=null;
          if(other.retreat){s.apReserved=Math.max(0,s.apReserved-1);other.retreat=null;}
          log(s,other.id,"灵魂归零，世界失去最后的分身。","danger");
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
    worldEnd(s,w,"saved",w.id==="lingzai"?"灵脉核心已被封印。":w.id==="zombie"?"母巢守卫被击败，感染核心已净化。":"兽王倒下，变异源被摧毁。");
    return true;
  }
  function finishRun(s){
    if(!s.active||alive(s).length)return;
    s.active=false;s.paused=true;
    var wins=s.worlds.filter(function(w){return w.status==="saved";}).length;
    s.result={saved:wins,failed:s.worlds.length-wins,shards:wins*4+Math.max(0,s.worlds.length-wins),endedDay:s.day};
    log(s,null,"本局结束：拯救"+wins+"个世界，获得"+s.result.shards+"枚世界碎片。","major");
  }
  function memory(s){
    s.worlds.forEach(function(w){
      if(w.status!=="running"){w.memoryCandidates=[];return;}
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
  function step(s){
    if(!s||!s.active)return {ok:false,error:"本局已经结束"};
    if(s.day>1&&(s.day-1)%8===0){s.ap=Math.min(s.apMax,s.ap+2);log(s,null,"灵魂行动点恢复2点。","minor");}
    s.worlds.forEach(function(w){if(w.status==="running"){queuedEvent(s,w);activateEvents(s,w);}});
    s.worlds.forEach(function(w){
      if(w.status!=="running")return;
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
      }else doAction(s,w,chooseAction(s,w));
      // All sources of danger are calculated once after the day's major action.
      if(w.status==="running"){
        addD(w,dailyDoomPressure(s.day,s.runNumber));
        if(threatActive(w))addD(w,0.3);
        if(random(w)<0.015){addD(w,2.2);log(s,w.id,"末日环境突然恶化，毁灭压力上涨。","warning");}
        newThreat(s,w);
        if(w.d>=100)checkWorld(s,w);
        if(w.status==="running")finalize(s,w,0);
        if(w.status==="running")checkWorld(s,w);
        if(w.status==="running")autoBuild(s,w);
      }
    });
    memory(s);finishRun(s);
    if(s.active)s.day++;
    return {ok:true};
  }
  function setStrategy(s,id,strategy){
    var w=byId(s,id);
    if(!s.active||!w||w.status!=="running"||!LABELS[strategy])return {ok:false,error:"策略或世界状态无效"};
    if(w.strategy===strategy)return {ok:true};
    var charge=s.day>3?1:0;
    if(availableAP(s)<charge)return {ok:false,error:"可用行动点不足"};
    s.ap-=charge;w.strategy=strategy;log(s,id,"调整自主策略为「"+LABELS[strategy]+"」。","minor");return {ok:true};
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
    log(s,id,"强行出关：灵魂强度-1，世界毁灭+8。","warning");
    checkWorld(s,w);finishRun(s);return {ok:true};
  }
  function aid(s,sourceId,targetId,mode){
    var a=byId(s,sourceId),b=byId(s,targetId);
    if(!s.active||!a||!b||a===b||a.status!=="running"||b.status!=="running")return {ok:false,error:"需要两个仍在运行的不同世界"};
    if(["p","d"].indexOf(mode)<0)return {ok:false,error:"援助类型无效"};
    if(a.resource<4||availableAP(s)<1||s.soul<=1)return {ok:false,error:"来源资源、行动点或灵魂强度不足"};
    if(s.day<(s.aidNext[b.id]||1))return {ok:false,error:"目标世界援助冷却中"};
    a.resource-=4;s.ap--;s.soul--;s.aidNext[b.id]=s.day+9;
    if(mode==="p")addProgress(s,b,12);else addD(b,-12);
    log(s,null,a.name+"支援"+b.name+"：消耗4资源、1行动点与1灵魂，"+(mode==="p"?"拯救进度+12":"毁灭进度-12")+"。","major");
    return {ok:true};
  }
  function fuse(s,targetId,providers){
    var target=byId(s,targetId);
    if(!s.active||!target||target.status!=="running")return {ok:false,error:"目标世界已结束"};
    if(s.runNumber<2)return {ok:false,error:"第二局才解锁灵魂叠加"};
    var haveBoss=target.pendingEvent&&target.pendingEvent.state==="active"&&target.pendingEvent.type==="boss";
    var haveFinal=WORLDS[target.id].boss&&target.p>=100&&target.level>=3&&target.resource>=WORLDS[target.id].finalCost&&target.flags.p65&&target.flags.p100;
    if(!haveBoss&&!haveFinal)return {ok:false,error:"当前没有可融合的重大战斗"};
    if(haveFinal&&canFinal(s,target,0))return {ok:false,error:"当前分身已经可以独立获胜"};
    var need=haveBoss?3:bossRequirement(target);
    var gap=need-effectiveLevel(s,target);
    if(gap<=0)return {ok:false,error:"无需借力即可获胜"};
    var count=gap===1?1:2;
    if(count===2&&(s.runNumber<3||s.worlds.length<3))return {ok:false,error:"需要三世界模式的三人之力"};
    if(gap>2)return {ok:false,error:"即使三人之力也不足以获胜"};
    var pool=alive(s).filter(function(w){return w!==target&&w.level>=2&&!w.retreat;});
    if(providers&&providers.length)pool=providers.map(function(id){return byId(s,id);}).filter(function(w){return w&&w!==target&&w.status==="running"&&w.level>=2&&!w.retreat;});
    if(pool.length<count)return {ok:false,error:"没有足够的可借力分身（闭关中不可借出）"};
    if(availableAP(s)<count||s.soul<=count)return {ok:false,error:"行动点或灵魂强度不足"};
    if(s.day<s.fusionNext)return {ok:false,error:"灵魂融合正在冷却"};
    s.ap-=count;s.soul-=count;s.fusionNext=s.day+(count===2?21:13);
    pool.slice(0,count).forEach(function(w){w.weaknessStart=s.day+1;w.weaknessUntil=s.day+3;});
    if(haveBoss)finishBoss(s,target);else finalize(s,target,count);
    log(s,null,(count===2?"三人之力":"二人之力")+"成功："+target.name+"本次战斗有效等级+"+count+"，力量提供者未来3日成长减缓。","major");
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
    var result=handlers[command.type](s,...command.args);
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
  return {VERSION:VERSION,WORLDS:WORLDS,POWERS:POWERS,COMBOS:COMBOS,LABELS:LABELS,THRESHOLDS:THRESHOLDS,
    fresh:fresh,step:step,byId:byId,info:info,availableAP:availableAP,chooseBuild:chooseBuild,
    setStrategy:setStrategy,retreat:retreat,exitRetreat:exitRetreat,aid:aid,fuse:fuse,
    resolveEvent:resolveEvent,previewMajorEvent:previewMajorEvent,useEcho:useEcho,applyCommand:applyCommand,canFinal:canFinal,bossRequirement:bossRequirement};
})();
export default MultiworldEngine;