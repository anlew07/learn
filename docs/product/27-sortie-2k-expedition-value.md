# 灵灾出击 2K-B · 出击回收目标与权威资源收益单变量实验

> 2026-11-18；独立分支 `experiment/sortie-2k-expedition-value-20261118`，base 为隔离的 [PR #74](https://github.com/anlew07/learn/pull/74)（2J 已整合 HEAD `7e6cd2ee91574ab837f6931f3fc38a5e298ed70e`）。本报告记录待验收候选，不代表正式机制已批准。

## 实际瓶颈及复用依据

原始引擎 `src/systems/sortie-sim.js` 每实际击退 3 敌在死亡地点产生 1 枚碎片；触摸半径 28px，3 枚碎片兑换 1 灵石，封顶 2 石；战斗胜利另给固定 3 石，总上限 5 石。实际`Engine.settleSortie`通过 `replaySortieTrace` 重新计算碎片、奖励与灵灾/废土两世界变化，同一个 `sortieId`/操作指纹防止重复结算。不能把渲染层的计数或自造存档数字当经济证据。

既有 2I-B/2J-B 实验显示：主动追逐掉落碎片往往能轻松捡满两石；碎片死亡位置通常离活敌较远，而缩小拾取半径或把碎片推向敌群的候选未建立稳定的受伤成本。因此这轮只试一个**出击目的与保底灵石的重新分配**，不用改敌伤、速度、掉落、奖励上限或正式存档。

## 单一候选及风险

**候选 `one-victory-stone-requires-contested-recovery-96px`（仅临时隔离副本，不保留生产改动）：** 获胜时原本固定 3 灵石拆为 2 石保底 + 1 石可选回收目标。若本场至少一次在距离**仍活着的敌人 ≤96px** 时拾取了一枚真实生成的碎片，才获得该 1 石；否则获胜仅得 2 石保底。碎片本身仍按 3:1、最多 2 石兑换。失败/撤离仍无胜利保底；战斗总奖励上限仍是 5 石。接触敌人不自动扣血，距离只是**任务危险代理**，不能等同已证实发生实际受击。候选的价值需靠真实对照证明。

此规则本质上**把一部分无条件收入变为有条件收入**，不是额外发钱；如果绕场少 1 石而主动拾取仍毫无实际危险，这只能说明存在经济激励，不能说明产生了好玩的风险—回报，也可能引起强制玩家冒险、惩罚新手的反效果。

## 方法与双世界验证

- 精确固定种子遵循既有 `sortie-2e-fixed-000..039-danger-D` 约定；D=0/40/75 × thunder/rune × kite/pickup/reverse/short-reverse/drift，共 30 组，每组 40 对，**1,200 对 / 2,400 次权威出击**。
- 复用 `pickupRouteInput` 与真实 60Hz 出击引擎，按 25 秒技能冻结和 75 秒结束录制每帧动作。基线与候选使用**完全相同的动作记录**，因此真实碰撞、被击、击退、胜败和碎片数必须一一相同；任何不一致则失败。
- 候选只在临时目录复制 `src`，将 `collectFragments` 的真实拾取加入 96px 观测，并替换 `previewSortieRewards` 的 1 石胜利保底兑换条件，原 `Engine.settleSortie` 与 `sortie-trace` 等权威程序代码不变。两版各通过 `prepareSortieArchive→settleSortieArchive→Engine.settleSortie` 独立回放；不仅比较奖励预览，还比较正式试验档中的灵灾资源与废土世界日推进、危险、资源。
- 相同路线内候选未改变物理，所以受击变化**必然为 0**；真正值得研究的是主动路线相对保命绕场的受击差与资源差（包括反向误操作），以及险地目标的可完成率。脚本路线并非真人触摸，不能声称玩家胜率。
- 检查守恒 `击退→掉落→拾取`、`stones = baseStones + shardStones`、总奖励 ≤5、技能选择不提前、重复 `sortieId` 不双发和篡改指纹拒绝。临时副本用完即删，**不修改**正式 Run/Profile、2G、2F、main 或其他开发线。

## 数据结果与产品裁决

40 固定种子结果以 `node scripts/sortie-expedition-value-2k.mjs --seeds=40 --assert` 输出的 `EXPEDITION_VALUE_2K_JSON` 为准。本节在 CI 后填写实测分组，不能在执行前写成已经通过。

**当前状态：研究假设、待数值验收。** 若仅“绕场少拿 1 石”而主动路线没有稳定增加的真实受击/失败风险，或高危误操作令新目标不可稳定完成，必须**撤回运行时改动**并建议总控另行决定经济闭环设计，不能因测试通过而直接合入。

## 复验命令与工程边界

```sh
node scripts/sortie-expedition-value-2k.mjs --seeds=40 --assert
npx vitest run tests/sortie-expedition-value-2k.test.js
npm run lint
npm run format:check
npm run text:check
npm test
npm run build
npm run sortie:matrix:check
npm run test:e2e
```

Draft PR 最终 HEAD 必须核对 GitHub Actions 的完整 lint/format/text/Vitest/build/三世界数值/出击矩阵/Playwright 结果；测试未通过前不申请合并。未完成 Android/iOS/TapTap WebView 真机与真人试玩。
