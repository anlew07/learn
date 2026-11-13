import { WORLDS } from "../config/game-data.js";
import { evaluateFusion } from "./fusion-contract.js";
import { previewFollowup } from "./event-chain.js";

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
      defaultOutcome:"到期自动谨慎调查：P+2，随后4日每日自然D增长−0.2，不消耗AP。",
      options:[
        option("safe","谨慎调查","确定P+2；未来4日每日自然D增长−0.2；不消耗AP。"),
        option("push","深入追踪 · 1AP",
          "成功率65%："+detail.success+" 失败率35%：D+5，受伤3个后续游戏日。",
          freeAP>=1,"可用行动点不足1点。"),
        option("decline","放弃线索","无额外收益或损失。"),
      ],
    };
  }
  if(e.type==="followup")return previewFollowup(state,world);
  if(e.type!=="boss")return null;
  const level=Math.max(0,world.level-Number(world.injuryUntil>=state.day));
  const direct=level>=3;
  const boosted=world.level>=2&&world.resource>=4&&freeAP>=1&&level+1>=3;
  const fusionStatus=evaluateFusion(state,world,{
    definition:WORLDS[world.id],
    bossRequirement:3,
    effectiveLevel:level,
    freeAP,
    canFinish:false,
  });
  return {...result,
    summary:"巢群首领仍在持续施压。需要有效战力Lv3；不具资格时可撤退等待成长。",
    defaultOutcome:direct?
      "到期自动击退首领，清除持续威胁。":
      "到期自动撤退，5日后可以再次挑战；巢群继续施压。",
    options:[
      option("fight","直接应对 · 免费","有效Lv3；成功得XP+8、资源+3、P+3、D−5，并清除巢群。",
        direct,"当前有效战力低于Lv3。"),
      option("boost","资源强化 · 1AP+4材料","本次有效战力+1，不改变实际等级；成功奖励与直接应对相同。",
        boosted,"需要Lv2、4材料、1可用AP，强化后有效战力至少Lv3。"),
      option("fusion","灵魂借力 · "+(fusionStatus.kind||"查看资格"),
        "仅本次战斗：需"+(fusionStatus.apCost||"足够")+"AP及同量灵魂，供力者未来3日虚弱。",
        fusionStatus.available,fusionStatus.reason),
      option("retreat","安全撤退","无费用；首领留存并继续施压，至少5日后再次挑战。"),
    ],
  };
}
