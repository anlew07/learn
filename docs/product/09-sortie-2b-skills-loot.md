# 灵灾出击 · 阶段 2B：战技、实地拾取与只读奖励预览

> 2026-11-17 · **独立叠加 PR，基于阶段 2A 的 [PR #65](https://github.com/anlew07/learn/pull/65)，不是基于尚未合并的 main 单独替代文件**。  
> 设计原则来自产品设计 [PR #64](https://github.com/anlew07/learn/pull/64)；不意味着已经批准将正式游戏整体更换为手动战斗。

## 实际交互

1. 点击“出击雾谷”，手动走位、自动灵刃，敌方灵息弹仍可规避。每累计击退 **3 名敌人**生成一枚拾取碎片，留在**实际击倒的位置**；分身距离 **28 逻辑像素内**才获得。击倒不等于拾取，未拾取不折算资源。
2. 战斗时钟到 **25 秒**首次进入一次战技抉择，**冻结敌人、玩家、倒计时和战斗随机流**，明确从二选一中确认（可点“默认：驭雷符”）。`thunder`（驭雷符）每 4 秒对最多 2 个附近目标造成 1 点真实伤害，击倒走同一掉落合同；`rune`（聚灵阵纹）立刻获得一层护盾，每 10 秒恢复，抵挡下一次接触伤害并给短暂免伤。玩家选择仅在本场有效，**不写旧 `world.build.pending`**。
3. 战斗完成、失败或确认主动撤离后，显示纯函数生成的**本场奖励预览**。每拾取 3 碎片兑换 1 灵石，最多换 2；成功生存 75 秒额外奖励基础 3 灵石、XP+2、P+2；失败或撤离基础奖励/XP/P 均为 0，但拾取兑换仍有效。
4. 再次挑战是全新独立沙盒战斗；关闭/刷新、观战及多次查看结果都不向正式 `RunState/ProfileState` 发放任何资源，也不推进任何世界日。

## 关键技术合同

- `src/config/sortie-data.js` 增加唯一战技和战利品配置，沿用 `POWERS.lingzai` 的稳定 `thunder/rune` ID。
- `src/systems/sortie-sim.js` 只在固定 tick 中触发掉落/拾取、战技结算；战技待选时 `stepSortie` 与 `advanceSortie` 均冻结，丢弃暂停前的残余帧累计，不补算隐藏时长。没有引擎 RNG 和 DOM 依赖。
- `src/systems/sortie-rewards.js` 的 `previewSortieRewards` 为**可重复调用、不可写的纯奖励候选**；正式资源、奖励幂等提交及跨世界同步属于 2C 的权威事务，不能从本模块直接写数据库。
- `src/sortie.js` 负责 UI/弹窗/触控/暂停；`src/ui/sortie-stage.js` 只绘制实际模拟的落点、护盾、雷击，不决定攻击或随机掉落。
- 提供手动“撤离”二次确认，不把刷新视为撤离或成功；失败时不得显示生存基础奖。无额外资产、npm 依赖或后端。

## 复用调研

继续使用浏览器原生 Pointer Events + pointer capture、`requestAnimationFrame`、Canvas 2D、Page Visibility API，避免为两种技能和少量实体引入 Phaser/Kontra。文档参考：https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events 、https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame 。沿用现有 Test/Vitest + Playwright；不能把战斗回放或 CSS 特效当作权威掉落。

## 质量与阶段门禁

最低测试：25 秒恰好一次触发且冻结、选择无效 ID 拒绝、驭雷符实际命中、护盾挡接触伤害与恢复、固定刷新率/种子结果相同、每 3 击倒生成 1 碎片、必须靠近才能领取、未拾取不进奖励、成功/失败/撤离的候选值、重复查看不会多发。手机浏览器核对 320/390/430 px 的战技弹窗和撤离操作。安卓/iOS 真机及 TapTap WebView 未测试前不能宣称适配完成。

**下一阶段 2C 的必要约束**：先设计权威唯一出击/日结算事务，拒绝裸数据奖励和同一天二次自动行动；无幂等/存档迁移方案时不得写正式档。之后 2D 才允许新增护灵剑台，不在本 PR 顺手扩展。
