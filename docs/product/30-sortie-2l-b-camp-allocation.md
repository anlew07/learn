# 2L-B · 两场营地资金配置、一次性准备影子验证

> 2026-11-18；**独立 Draft 候选，不是正式玩法审批或已部署版本**。本报告与 #74 2L 总控评论、2L 产品合同 [PR #93](https://github.com/anlew07/learn/pull/93) 对齐。工作分支 `prototype/sortie-2l-camp-allocation-20261118`，PR base `balance/sortie-core-loop-2g-rune-20261117`（起始 SHA `8f3c75d45b17c0fcfbcf3995ac8b31944709c46f`）。

## 1. 真实资源事实与设计边界

- 灵灾开局 **4 灵石**；稳妥巡护撑满 75 秒有 **3 灵石**生存保底，3 碎片兑换 1 灵石、普通兑换至多 2 灵石。出击失败/撤离按现有权威规则处理，界面不另发放奖金。剑台**永久 6 石**，武器基础伤害 **1→2**，仅第一次付款。双世界只有真正完成出击才推进一日。
- 2K-C 的 40 固定种子 × 3 危险 × 2 战技 × 3 路线共 720 首场观察，**718/720** 已有足够灵石修复剑台；无建设第二场 **719/720** 胜局。这是来自 #74 2K 总控的**既有数据，不冒充本线重新跑出的计数**。因此本线没有“需要攒很久才能修剑台”的假文案。
- 2I/2K 六场工程证据已表明剑台很难通过额外击退兑换资源回本。其**真实效果只有武器伤害**，不许写成自动多赚灵石、减少受击、或保底成功。
- 2L-A [Draft PR #94](https://github.com/anlew07/learn/pull/94) 已提出 `run.sortieCamp.missionSelection={missionId,day,operationId}`、`createSortie(seed,danger,forgeLevel,missionId)`、`battle.mission`、`receipt.battle.objectiveStones`、`receipt.objectiveStones`。检查时 A 分支比 2G ahead 3 commits（HEAD `987e5d575ce8f11be5d99443bfd145ac2b85f41e`）；**接口仍处 Draft，未通过联合 CI / 产品审查**。

## 2. 已实现的真正可运行部分

营地的实际选项由 `previewSortieCampAllocation` 同一个预算视图产生，展示当前日、灵石、成本、付款后余额、真实效果与边界。

| 选择 | 真实付款 / 剩余 | 可兑现的下场作用 | 风险 / 限制 |
| --- | --- | --- | --- |
| **保留资源** | 0 / 保留全部当前资源 | 按原出击玩法，不改技能/奖励 | 仅能获得本场真实获胜/普通碎片；不保证后续资源 |
| **修复护灵剑台** | 真实扣 6 / 当前余额 −6 | 永久武器伤害 1→2；下次由 `Engine.settleSortie` 权威重放 `forgeLevel` | 现有六场实证尚未回本；资源仍需保留供世界经营 |
| **回收信标（唯一准备候选）** | **影子模型**成本 2 / 余额 −2 | **待验证**：拟让下一场险地回收接触容差 +20px；不加 HP、不直接加灵石 | **不会在正式试玩页出现可付款按钮**；必须由 A 的固定 tick 状态和 replay 验证真实完成率/风险才可启用 |

- **任务选择**：`safe` 为旧存档默认，操作 ID 与选定日持久记录于出击独立档；重复相同 ID 不修改快照，冲突 ID / 非法任务拒绝。刷新未完成的出击不能凭前端多领奖；原有 `sortieId` 仍是权威结算 ID。
- **按 A 接口的兼容预留**：`SORTIE.mission` 不存在（当前独立 2G base）时，`salvage` 按钮不可用、输入被服务层拒绝；A 任务配置和引擎一起集成后，才允许单日记录选取 `salvage`，准备返回 `missionId`，现场 `createSortie` 接收相同任务类型，战场 Canvas 按 `battle.mission` 画真正可接触目标及进度环。第二场回执仅展示引擎给出的 `objectiveStones`，UI 没有任何资源修改路径。上一日残留的任务选择在新一日准备时清理，避免 A 权威校验拒绝原有安全任务。
- **保存顺序**：原有独占 Web Lock、IndexedDB 异步保存、失败重试保持不变；只有保存成功才能进入战斗/显示建设成功。永久剑台付款保留同一快照中的任务记录；建设/选择不推进世界日。
- 出击回营后展示**权威灵石分项、上/下场击退与武器伤害、双世界当日资源、经验、准备与风险变化**。额外任务奖金只可能来自 `receipt.battle`，未连通时绝不臆造“+2”。

## 3. 影子准备的可核查边界

`scripts/sortie-camp-allocation-2l.mjs` 的 `buyShadowBeacon`、`consumeShadowBeacon` **仅是未引入生产 UI 的独立副本实验**：

1. 首场前不能购入；首次出击已完成、没有 pending、资金不少于 2 且未修剑台才可在影子模型买入。
2. 返回新的克隆快照，不改变传入的存档；同一操作 ID replay 不二次扣费，另一操作 ID、资金不足、非法 ID 都失败。
3. 成功后暂记 `charges=1`，中断后仍有一次机会；只有下次真正从 `Engine.settleSortie` 产生的同 `sortieId`、次日回执才允许标记 `charges=0` / `usedOn`。不能耗尽后再购。
4. **对照实际不改变 `battle`，没有 A 的任务机制就没有可验证的使用收益**。这特意证明“付费和消费幂等”≠“准备效果成立”。在 A 未验证 `preparationId` 的权威 replay 合同前，不得合并可购买按钮或声称安全性提升。

## 4. 固定种子、权威双世界对照与不成立结果

运行：

```bash
node scripts/sortie-camp-allocation-2l.mjs --seeds=40 --sorties=6
npx vitest run tests/sortie-camp-allocation-2l.test.js
```

脚本复用既有 `sortie-forge-roi-2h.mjs` 权威实验：40 固定 seed × D0/40/75 × 驭雷符/聚灵阵纹 × 站桩/绕场/主动拾取，共 **720 个首场配对**。只有完成首场且足够资金的样本真正付 6 石，不以预建剑台冒充支付。每对从相同首场快照分支，保存 `no-build` / `forge` 的真实结算后第 **2、6** 场胜局、击退、受击、余命、拾取、收入与净余额；没活到对应场次不可作为真实战斗。脚本在 CLI 输出 `CAMP_ALLOCATION_2L_JSON=`，分组含 `matched` / `built` / `paidBack`；不能用“加回价格”的会计模拟称真实回本。

**本轮隔离矩阵不能得出险地任务或信标的资源 ROI**：B 不拥有 2L-A 引擎，目前还没有经过 A+B 同分支的任务奖金/守卫/一次性准备回放。候选信标先保留为“不成立 / 待验证”，没有把 2K 否决的 +2 HP 再包装成战前准备。站桩的建造成功率与 2K 的三条主动路线不同，不应把 718/720 当成本线的分母。

## 5. 必须交给 2L-A / 总控的接口冻结项

- `missionId` 仅 `safe|salvage`；`run.sortieCamp.missionSelection={missionId,day,operationId}` 为唯一权威输入。旧档无字段=安全；非法值、不匹配当前日、重复 `sortieId` 均不可领额外奖金。
- 场景 replay 与展示需从**同一持久选择和同一次准备**取得 `missionId`、`preparationId`；`battle.mission` 应报告首次目标可见、接触、完成、守卫受击和是否过期。候选回收信标目前仅提议 `preparationId=salvage-beacon`，成本 2、一次性使真实回收点接触半径增加 20px；**未经 A 的同意和验证不视为已冻结的引擎参数**。
- 真正的信标须只在当日任务是 `salvage` 时允许付款；准备一旦锁定当前 `sortieId`，刷新重开不会再扣，结算成功后用权威回执耗尽；失败/撤离是否消耗须 A+B 一致固定，默认本候选为“一次出击即消耗”。
- B 的 UI 不得合成、覆盖、自己提交 `objectiveStones`。任务成功但未赢、任务未完成、撤离时必须清楚显示 **0** 额外石；单列原本 3 石获胜与最多 2 石普通兑换，不降低其上限。

## 6. 测试、CI、发布与未通过门禁

- 专属测试覆盖：safe 操作 ID 重放/冲突、旧档升级/隔离、危险任务禁用、真实 6 石付款保留任务、被复制的影子 2 石付款、刷新中断、非法付款、准备耗尽、双世界权威回执及完整 40 seed 到第二/六场的明细。
- 完整工程测试由独立 Draft PR 的 **Validate H5** 运行：lint、format、文案导出审核、Vitest、build、世界平衡和干预对照、原出击矩阵、Chromium Playwright。CI 的最终 URL / 成功结果须以**最终提交 SHA 对应的运行记录**为准，不用之前 2G 的绿色代替。
- **明确未通过**：A+B 合并后任务可玩/新奖金的真实风险—收益、准备接触半径带来的完成率/实际安全/实际净资源差、出击第二场/第六场候选收益、2L-C 320×568/390×844/430×932 真实触屏、Android/iOS/TapTap WebView、真人 3–5 分钟理解度。在这些通过前保留 Draft，不合 2G/2F/main，不部署。
