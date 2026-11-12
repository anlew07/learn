/**
 * Shared, side-effect-free preview and pre-payment validation for event choices.
 * All percentages describe the existing deterministic game rules; previews never
 * consume the world's RNG stream.
 */
export const CLUE_DETAILS = Object.freeze({
  lingzai: {
    summary:"古碑记载灵脉封印阵纹。",
    success:"P+5，获得2灵石与古阵拓本。",
  },
  zombie: {
    summary:"失联广播可能暴露母巢防御规律。",
    success:"P+5，识别母巢弱点（终战要求Lv4→Lv3）。",
  },
  beast: {
    summary:"巨兽足迹透露兽王行迹。",
    success:"P+5，完成一次兽王压制准备。",
  },
});

const option=(id,label,summary,available=true,unavailableReason="")=>({
  id,label,summary,available,unavailableReason,
});

export function previewMajorEvent(state,world) {
  const e=world?.pendingEvent;
  if(!state?.active||world?.status!=="running"||e?.state!=="active")return null;
  const freeAP=state.ap-state.apReserved;
  const result={id:e.id,type:e.type,title:e.title,expiry:e.expiresDay};
  if(e.type==="clue"){
    const detail=CLUE_DETAILS[world.id];
    return {...result,
      summary:detail.summary,
      defaultOutcome:"到期自动谨慎调查：P+2，不消耗AP。",
      options:[
        option("safe","谨慎调查","确定P+2；不消耗AP。"),
        option("push","深入追踪 · 1AP",
          "成功率65%："+detail.success+" 失败率35%：D+5，受伤3个后续游戏日。",
          freeAP>=1,"可用行动点不足1点。"),
        option("decline","放弃线索","无额外收益或损失。"),
      ],
    };
  }
  if(e.type!=="boss")return null;
  const level=Math.max(0,world.level-Number(world.injuryUntil>=state.day));
  const direct=level>=3;
  const boosted=world.level>=2&&world.resource>=4&&freeAP>=1&&level+1>=3;
  const gap=3-level;
  const donors=state.worlds.filter(x=>x!==world&&x.status==="running"&&x.level>=2&&!x.retreat).length;
  const fusion=state.runNumber>=2&&gap>0&&gap<=2&&
    (gap===1||(state.runNumber>=3&&state.worlds.length>=3))&&
    donors>=gap&&state.day>=state.fusionNext&&freeAP>=gap&&state.soul>gap;
  const fusionReason=state.runNumber<2?"第二局才解锁二人之力。":
    gap<=0?"已可独立讨伐，无需融合。":
    donors<gap?"缺少符合条件的力量提供者。":
    state.day<state.fusionNext?"灵魂融合仍在冷却中。":
    "灵魂、AP、分身数量或当前战力不足。";
  return {...result,
    summary:"巢群首领仍在持续施压。需要有效战力Lv3；不具资格时可撤退等待成长。",
    defaultOutcome:direct?
      "到期自动击败首领，清除持续威胁。":
      "到期自动撤退，5日后可以再次挑战；巢群继续施压。",
    options:[
      option("fight","直接讨伐 · 免费","有效Lv3；成功得XP+8、资源+3、P+3、D−5，并清除巢群。",
        direct,"当前有效战力低于Lv3。"),
      option("boost","资源强化 · 1AP+4材料","本次有效战力+1，不改变实际等级；成功奖励与直接讨伐相同。",
        boosted,"需要Lv2、4材料、1可用AP，强化后有效战力至少Lv3。"),
      option("fusion","灵魂借力 · "+(gap===2?"三人之力":"二人之力"),
        "本次战力提升并消耗"+Math.max(1,gap)+"AP、同量灵魂；力量提供者未来3日虚弱。",
        fusion,fusionReason),
      option("retreat","安全撤退","无费用；首领留存并继续施压，至少5日后再次挑战。"),
    ],
  };
}
