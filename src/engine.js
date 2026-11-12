import seedrandom from "seedrandom";
const MultiworldEngine = (function () {
  "use strict";
  var VERSION = "0.1.0";
  var WORLDS = {
    lingzai: { name: "灵灾", resourceName: "灵石", stages: ["练气", "筑基", "金丹", "元婴"], finalCost: 10, boss: false },
    zombie: { name: "尸潮", resourceName: "废土零件", stages: ["幸存者", "猎杀者", "清剿者", "末日猎手"], finalCost: 12, boss: true },
    beast: { name: "兽潮", resourceName: "进化结晶", stages: ["猎人", "强化者", "超凡猎人", "进化领主"], finalCost: 14, boss: true }
  };
  var POWERS = {
    lingzai: [{id:"thunder",name:"驭雷符",slot:"attack",kind:"clear"},{id:"sword",name:"飞剑回旋",slot:"attack",kind:"loot"},{id:"rune",name:"聚灵阵纹",slot:"support",kind:"defense"}],
    zombie: [{id:"blades",name:"碎片飞刃",slot:"attack",kind:"clear"},{id:"arc",name:"电弧投射器",slot:"attack",kind:"loot"},{id:"armor",name:"简易护甲",slot:"support",kind:"defense"}],
    beast: [{id:"claws",name:"裂爪连击",slot:"attack",kind:"clear"},{id:"roar",name:"震地咆哮",slot:"attack",kind:"loot"},{id:"instinct",name:"追猎直觉",slot:"support",kind:"defense"}]
  };
  var COMBOS = {lingzai:["thunder","rune","雷阵连锁"],zombie:["blades","armor","钢雨防线"],beast:["claws","instinct","连环猎杀"]};
  var THRESHOLDS = [0, 14, 42, 78];
  var LABELS = {growth:"成长优先",clear:"清剿优先",rescue:"拯救优先"};
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
    w.build.count++;w.build.pending=null;
    var combo=COMBOS[w.id],all=w.build.attack.concat(w.build.support);
    if(!w.build.evolved&&w.build.count>=2&&all.some(function(x){return x.id===combo[0];})&&all.some(function(x){return x.id===combo[1];})){
      w.build.evolved=true;w.build.evolutionName=combo[2];
      log(s,w.id,"战技进化："+combo[2]+"！","major");
    }
    log(s,w.id,(automatic?"自动选择":"主动选择")+"战技："+p.name+(entry?" 升至Lv"+entry.lv:"")+"。","minor");
    return {ok:true};
  }
  function autoBuild(s,w) {
    if(!w.build.pending||w.build.pending.due>s.day)return;
    var opts=w.build.pending.options;
    var ranked=opts.map(function(id){
      var p=POWERS[w.id].find(function(x){return x.id===id;});
      var score=w.strategy==="clear"?(p.kind==="clear"?3:1):w.strategy==="growth"?(p.kind==="loot"?3:1):(p.kind==="defense"?3:1);
      return {id:id,score:score};
    }).sort(function(a,b){return b.score-a.score||a.id.localeCompare(b.id);});
    chooseBuild(s,w.id,ranked[0].id,true);
  }
  function resolveEvent(s,worldId,choice) {
    var w=byId(s,worldId);
    if(!s.active||!w||w.status!=="running"||!w.pendingEvent||w.pendingEvent.state!=="active")return {ok:false,error:"当前没有可处理的事件"};
    var e=w.pendingEvent;
    if(choice==="fusion")return fuse(s,worldId);
    if(e.type==="boss"){
      if(choice==="boost"&&!(w.level>=2&&w.resource>=4&&availableAP(s)>=1&&effectiveLevel(s,w,1)>=3))
        return {ok:false,error:"缺少强化条件、灵石/零件或行动点"};
      if(choice==="retreat"){w.pendingEvent=null;w.threat.retryDay=s.day+5;log(s,w.id,"撤出危险区域，暂缓讨伐首领。","minor");return {ok:true};}
      var level=effectiveLevel(s,w,choice==="boost"?1:0);
      if(level<3)return {ok:false,error:"当前战斗实力不足，建议撤退或借力"};
      if(choice==="boost"){s.ap--;w.resource-=4;}
      finishBoss(s,w);
      return {ok:true};
    }
    if(choice==="push"){
      if(availableAP(s)<1)return {ok:false,error:"行动点不足"};
      s.ap--;
      if(random(w)<0.65){
        addProgress(s,w,5);w.flags.weakness=w.id==="zombie";
        log(s,w.id,"深入调查成功，获得更多末日线索。","major");
      }else{
        addD(w,5);w.injuryUntil=Math.max(w.injuryUntil,s.day+3);
        log(s,w.id,"深入调查失败，分身受伤，世界危险增加。","warning");
      }
    }else if(choice==="safe"){addProgress(s,w,2);log(s,w.id,"谨慎保存关键线索。","minor");}
    else if(choice!=="decline")return {ok:false,error:"未知事件选项"};
    w.flags.sideResolved=true;w.pendingEvent=null;checkWorld(s,w);
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
    if(!w.pendingEvent&&w.queuedBoss&&threatActive(w)&&s.day>=(w.threat.retryDay||1)){
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
    var strat=w.strategy,need=resourceTarget(w);
    var list=[
      {id:"growth",score:(strat==="growth"?8:2)+(w.level<3?3:0)+(w.p>=100&&w.level<4?8:0)},
      {id:"gather",score:(strat==="growth"?2:1)+(w.resource<need?7:0)+(w.resource<4?3:0)},
      {id:"fight",score:(strat==="clear"?8:2)+(threatActive(w)?5:0)+(w.d>75?3:0)},
      {id:"explore",score:(strat==="rescue"?7:2)+(w.p<65?4:0)},
      {id:"rescue",score:(strat==="rescue"?8:2)+(w.p>=65&&w.p<100?9:0)}
    ];
    list=list.filter(function(a){
      if(a.id==="explore")return w.p<65;
      if(a.id==="rescue")return w.p>=65&&w.p<100;
      if(a.id==="fight")return w.level>=1;
      if(a.id==="growth"&&w.level===4&&w.p>=100)return false;
      return true;
    });
    if(w.level>=3&&w.p<65){list.forEach(function(a){if(a.id==="explore")a.score+=12;if(a.id==="growth")a.score-=8;});}
    if(w.level>=3&&w.p>=65&&w.p<100){list.forEach(function(a){if(a.id==="rescue")a.score+=9;if(a.id==="growth")a.score-=7;});}
    if(w.level>=4){list.forEach(function(a){if(a.id==="growth")a.score-=12;});}
    if(w.level>=3&&w.p<65){list.forEach(function(a){if(a.id==="explore")a.score+=12;if(a.id==="growth")a.score-=8;});}
    if(w.level>=3&&w.p>=65&&w.p<100){list.forEach(function(a){if(a.id==="rescue")a.score+=9;if(a.id==="growth")a.score-=7;});}
    if(w.level>=4){list.forEach(function(a){if(a.id==="growth")a.score-=12;});}
    if(w.p>=100){list.forEach(function(a){
      if(a.id==="growth"&&w.level<bossRequirement(w))a.score+=24;
      if(a.id==="growth"&&w.level<3)a.score+=18;
      if(a.id==="gather"&&w.resource<need)a.score+=16;
    });}
    if(w.id==="zombie"&&!w.repairUsed&&w.d>=85&&w.resource>=6)return "repair";
    if(w.id==="zombie"&&!w.repairUsed&&w.d>=55&&w.resource>=WORLDS[w.id].finalCost+6&&strat!=="growth")return "repair";
    if(w.id==="beast"&&suppressNeeded(w)&&w.level>=4)return "suppress";
    if(!list.length)return "gather";
    list.forEach(function(a){a.score+=(random(w)-0.5)*2;});
    list.sort(function(a,b){return b.score-a.score;});
    return list[0].id;
  }
  function doAction(s,w,action){
    w.action=action;
    if(action==="growth"){
      w.action=w.id==="lingzai"?"吸纳灵气":w.id==="zombie"?"战斗训练":"吸收进化感悟";
      produce(s,w,"xp",3);
    }else if(action==="gather"){
      w.action=w.id==="lingzai"?"寻找灵石":w.id==="zombie"?"搜刮废土":"搜集进化结晶";
      produce(s,w,"resource",3);produce(s,w,"xp",0.2);
    }else if(action==="fight"){
      if(threatActive(w)&&w.level>=2&&w.threat.progress<2){
        w.threat.progress++;produce(s,w,"xp",3);produce(s,w,"resource",1);addD(w,-0.6);
        w.action="清剿持续威胁 "+w.threat.progress+"/2";
        if(w.threat.progress>=2){w.queuedBoss=true;w.threat.status="awaiting_alpha";log(s,w.id,"巢群外围已肃清，首领挑战即将开启。","major");}
      }else{
        w.action=w.id==="lingzai"?"清剿妖兽":w.id==="zombie"?"清理感染体":"狩猎异兽";
        produce(s,w,"xp",w.level>=4?2:3);produce(s,w,"resource",1);addD(w,-0.35);
      }
      if(s.waves)log(s,w.id,"战潮：第一波清剿外围 → 第二波压制敌群 → 第三波清理残敌；仅结算一次战利品。","battle");
    }else if(action==="explore"){
      w.action=w.id==="lingzai"?"调查灵脉":w.id==="zombie"?"追踪感染源":"追查兽王";
      addProgress(s,w,3.3);produce(s,w,"xp",0.5);optionalEvent(s,w);
    }else if(action==="rescue"){
      w.action=w.id==="lingzai"?"准备灵脉封印":w.id==="zombie"?"准备母巢净化":"准备兽王讨伐";
      addProgress(s,w,4);produce(s,w,"xp",0.2);
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
        w.action="闭关修炼（剩余"+w.retreat.remaining+"天）";
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
        addD(w,(s.day<35?1.3:s.day<70?1.65:2.1)*(s.runNumber===1?0.82:s.runNumber===2?1.3:1.15));
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
    else if(echoWorldId==="zombie")produce(s,target,"resource",6);
    else {target.xp=r2(target.xp+8);checkLevel(s,target,true);}
    log(s,null,WORLDS[echoWorldId].name+"回响支援"+target.name+"。","major");
    return {ok:true};
  }
  function info(s,w) {
    return {canFinish:canFinal(s,w,0),bossRequirement:bossRequirement(w),remainingResources:Math.max(0,resourceTarget(w)-w.resource),
      goal:demand(w),stage:WORLDS[w.id].stages[w.level-1],resourceName:WORLDS[w.id].resourceName,
      freeAP:availableAP(s),injured:w.injuryUntil>=s.day,threatActive:threatActive(w)};
  }
  return {VERSION:VERSION,WORLDS:WORLDS,POWERS:POWERS,LABELS:LABELS,THRESHOLDS:THRESHOLDS,
    fresh:fresh,step:step,byId:byId,info:info,availableAP:availableAP,chooseBuild:chooseBuild,
    setStrategy:setStrategy,retreat:retreat,exitRetreat:exitRetreat,aid:aid,fuse:fuse,
    resolveEvent:resolveEvent,useEcho:useEcho,canFinal:canFinal,bossRequirement:bossRequirement};
})();
export default MultiworldEngine;