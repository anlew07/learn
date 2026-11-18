# 2L-C｜两场出击移动端 QA（隔离基线与待验证项）

> 2026-11-18。来源：[#74 2L 总控合同](https://github.com/anlew07/learn/pull/74#issuecomment-6972676974)、[#93 2L 设计合同](https://github.com/anlew07/learn/pull/93)；工作分支 `test/sortie-2l-mobile-loop-20261118`，目标是 2G 隔离分支，不部署 `main`。**本 QA 严禁用“基线测试通过”声称 2L-A/B 新任务已完成。**

## 已核实的开始状态

- 2026-11-18 建立测试时，2L-A `feat/sortie-2l-guarded-recovery-20261118`、2L-B `prototype/sortie-2l-camp-allocation-20261118`、2L-C 均与 2G 提交 `8f3c75d45b17c0fcfbcf3995ac8b31944709c46f` **ahead 0 / behind 0**，尚无 A/B 新玩法实现。
- 原有 2H、2J QA 验证过三种移动视口，但 2J 的剑台按钮路径曾调用自动滚动，且第二场用的是撤离，不等于两场完整 75 秒成功。
- 既有玩法：开局 4 灵石、75 秒出击、25 秒战技冻结、3 石胜利保底、3 碎片兑 1 石最多 2 石；现有 6 石剑台能真实改变下一场基础武器伤害。新目标、新准备与 `objectiveStones` **不在该基线中**。

## 本分支新增的可执行门禁

| 层 | 用例 | 真实验证手段 |
| --- | --- | --- |
| Playwright | 320×568、390×844、430×932，首场与再次出击均打满 75 秒 | Chromium 移动触摸模式；CDP touchStart/touchMove/touchEnd 对摇杆持续移动；不靠键盘、模拟结算或领奖接口 |
| Playwright | 25 秒自动战技冻结，选雷/纹后继续 | 核对 1500 tick、冻结期不增加 tick；战技按钮用坐标 `touchscreen.tap` |
| Playwright | 首胜、战斗奖励、双世界收据、营地真付费 | 从 IndexedDB 正式读取隔离档；按实际 base/shard 收据核对资源；支付应正好减少 6 石且不推进日 |
| Playwright | 320px 营地触屏可到达、无关键按钮越界 | `getBoundingClientRect` + `elementFromPoint` 检查后坐标点击；按钮在屏幕外仅用真实手指 swipe 滚动营地，不调用 `locator.click()`/`scrollIntoViewIfNeeded()` |
| Playwright | 第二场中途刷新、重开后完成 | 已购剑台保持，未完成出击不推进世界日、不重领奖；再次开始并完成真实第二场；正式 Run/Profile 仍为空 |
| Vitest | 40 seeds × D0/40/75 × 雷/纹 = 240 场安全基线 | 固定 60Hz、25 秒冻结、75 秒、普通奖励、碎片不重复/丢失；**不是新增险地风险实证** |
| Vitest | 5 个两场权威回放样本 | 双世界结算、付款幂等、第二次出击武器伤害、第二场中断、相同 ID 不能二次结算 |
| Vitest | 正式存档隔离 | 内存仓库的两个正式键哨兵前后完全不变 |

### 截图留存

Playwright 将各分辨率截图保存至 `test-results/camp-ui/sortie-2l-<宽>x<高>-<阶段>.png`，包含：`camp-first`、`battle-first`、`skill-thunder-frozen`、`receipt-first`、`forge-paid`、`skill-rune-frozen`、`interrupted-second`、`battle-second-grown`、`receipt-second`。CI 已有 `camp-ui-mobile-screenshots` artifact 上传流程。

上述截图必须在**最终 HEAD CI 成功、且 artifact 确认存在**后才称为“已取得截图证据”。Chromium 截图≠iOS/Android/TapTap WebView 真机，亦≠真人理解度访谈。

## 2L-A/B 尚待验证（绝不标绿）

以下为 **BLOCKED / 待 A+B 玩法接口及联合分支**，已以 Playwright `test.fixme` 和 Vitest `it.todo` 留下显式提醒，不把占位当合格：

1. 营地触摸选择 `missionId=safe|salvage`，任务与旧档的默认值、非法 ID 校验和显式风险提示。
2. 地图有实体资源目标，手指控制角色实际靠近；敌人/守卫源于真战斗，接触、未触及、失败与撤离路径可区分。
3. `objectiveStones` 只从权威 replay 完成任务且胜利时单列发放；原 3+2 不受影响；双世界收据、相同 sortieId 防重复。
4. 一次性准备真实扣费与操作 ID 幂等、只生效次场、不会伪加资源；和不消费、永久剑台比较下一场实战效果。
5. 新任务需 40 种子 × 3D × 双战技 × 绕场/主动回收/误操作进行真实风险收益配对，尤其确认“额外金币并非没有风险的必选项”。

**基线验收≠2L 整体产品验收。** 即使本分支 CI 全绿，也不得接受或自动合并 2L-A/B，更不得凭这些用例宣布新玩法可玩、收益通过或已上线。

## 运行方式与证据标准

本地：`npx vitest run tests/sortie-two-run-2l.test.js`；`npx playwright test e2e/sortie-playable-2l.pw.js --project=mobile-chromium`。完整 CI 依 `.github/workflows/ci.yml`（lint、format、文本、Vitest、Vite 构建、矩阵、Playwright、截图）。

最终 CI 运行号、HEAD SHA、passed/skipped、artifact 链接、失败日志与修复记录必须在运行完成后更新，禁止把“已提交测试”写成“已通过测试”。如 320 竖屏无法通过实际 swipe 点击付费，应判定真实可操作性 blocker，回报 B 修改 UI，而非在 QA 中用程序滚动蒙混过关。

## 当前交付边界

只新增 `e2e/sortie-playable-2l.pw.js`、`tests/sortie-two-run-2l.test.js`、`docs/qa/sortie-2l-playable.md`。不修改生产代码、正式档、定价、伤害、任务或部署。Draft PR 留待总控联合验收，不自行合并。
