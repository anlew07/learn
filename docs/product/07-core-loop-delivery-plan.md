# 核心闭环开发分段、架构与质量门禁（2026-11-17）

> 设计基线：`main@b9d28f09`。本文件只拆开发任务，**本 PR 不实现战斗、建设、经济或现有 UI 重构**。  
> 当前结论：正式 V0.2 是“每天一个自动行动”的双/三世界文字数值模拟；拟议灵灾手动战场和营地建设是**隔离验证的新玩法**。跨越重大定位的正式迁移须经原型审定。

## 1. 适配现有架构的合理路径

| 责任层 | 复用的已有内容 | 需新增的最小扩展 / 禁止事项 |
| --- | --- | --- |
| 配置 | `src/config/game-data.js` 灵灾战技 ID 与角色/资源名；`BALANCE` 作为历史数据参考 | `src/config/sortie-data.js` 定义战场、敌人、技能、建造成本的实验值；不要无意改正式三世界数值 |
| 战斗纯逻辑 | `src/systems/attack-patterns.js` 命名/图标，`survivor-waves.js` 可借鉴三阶段思路 | `src/systems/sortie-sim.js` 纯战场状态更新/输入/命中/拾取/确定 RNG；**不得反向依赖 DOM/存档、不得冒用现有三波加成** |
| 世界权威结算 | `src/engine.js` 世界 RNG、行动、自然压力、里程碑、跨界记忆、重大事件、`applyCommand` 幂等 | **最小化**提取“世界日结算中单世界主要行动”入口；允许灵灾用一次 `sortie` 结果代替当日自主行动，其他世界原样运行；出击结算原子化 |
| 营地建设 | `resource`、已有 Canvas 营地素材/状态，只读场景衍生 `stage-view.js` | 原型 `camp.forgeLevel`、预览费用/实际支付合同，渲染不得自己扣资源 |
| UI | 现有固定像素主场景/HUD、`src/ui/pixel-stage.js`、`src/presentation/decision-attention.js` | 独立战斗 Canvas 与触控区、短结果页和可见建造状态；不让现有 `src/ui.js` 无限膨胀为单个游戏引擎 |
| 存档 | `src/services/persistence.js` 原子批量与失败冻结、`exclusive-session.js` Web Locks | 原型档隔离；提交 `sortieId` 唯一 ledger；正式 Run/Profile 原键不动，正式旧存档恢复逻辑不受影响 |
| QA | Vitest、Playwright、固定种子、移动端 320–430 视口测试 | 无头跑原型中的两场战斗、构筑、建设、世界推进及恢复回归；不可用模拟器 FPS 冒充真机 |

**最危险的技术陷阱**：直接 `Engine.step` 会让灵灾当天按旧策略执行额外动作，且 `s.waves` 可导致旧三波战报额外加成。必须设计统一日结算入口或一次行动替换，**不能用“战斗后调用 step”硬拼接**。另一个陷阱是原 `RunState` 要求至少两世界且存档快照版本为 `0.2.0`，不能为了单世界试玩直接删掉废土或向原键写不兼容字段。

## 2. 独立 PR 阶段（依次推进，不能一份 PR 包揽）

### 阶段 2A · 灵灾可操控战场（建议**下一独立开发对话**唯一范围）

**交付**：新增独立试玩入口或开发入口、320×448 战场、角色走位、2 类追踪敌人、基础自动灵刃、受伤/生命/75 秒计时、暂停与结果测试。允许先使用纯战场沙盒状态，**不能给正式模拟档发资源**；本阶段不引入营地建设和世界日结算。

**验收**：320×568/390×844/430×932 无主文档溢出，手机触控/键盘输入可用；战斗 75 秒可以正常结束，0HP/暂停/后台安全；固定输入的结果可复现，30/60/120Hz 无逻辑差异；无 npm 大型游戏引擎。优先复用已有 SVG 与 Canvas，不批量造素材。

**建议文件所有权**：`src/systems/sortie-sim.js`、`src/config/sortie-data.js`、`src/ui/sortie-stage.js`、`src/presentation/sortie-view.js`、新测试，尽量不改 `src/engine.js`，首页入口局部接线。独立 `feat/lingzai-sortie-combat-yyyymmdd` 分支。

### 阶段 2B · 战技、拾取与战斗实际收益（下一 PR）

**交付**：25 秒战技二选一、命中/掉落、拾取和一次战斗结果候选，完全在沙盒中验证；构筑临时与世界 `build.pending` 隔离。不写永久资源、不改变世界日。

**验收**：技能差异有真实伤害/吸收效果；固定种子掉落稳定，拾取三枚兑换一灵石、未拾不算；失败与撤离规则正确；动画/跳过/重复读取不会多生成掉落。

### 阶段 2C · 原子世界结算与跨界演化（独立 PR，高风险）

**交付**：把已验证的战斗结果作为当天灵灾唯一主要行动提交，其他世界按现有引擎同一次日结算自主发展；成功/失败资源、经验、P/D 一次结算；输出权威回执；独立试验档存储。

**验收**：世界日严格 +1，灵灾行动计数恰好 1、废土行动计数恰好 1；不重复旧战潮奖励；无穷重放仍只领一次；另世界独立 RNG、事件、记忆不受 UI 渲染顺序影响；冻结/刷新/存储写入失败/双标签都安全。该阶段需经对正式 `Engine.step` 的完整固定种子回归。

### 阶段 2D · 唯一建造 + 2 场闭环 + 移动端验收（独立 PR）

**交付**：护灵剑台 Lv1（花 6 灵石、下一次伤害 1→2）、营地状态差分、引导在第一场后提示升级、第二场结果对比，保留原正式入口。

**验收**：第一场成功基础奖足够解锁建造，重按不多扣；不建与建后同种子/输入的第二场伤害差异可复现；从首页进入→两场出击→建造→返回一条完整自动化 Playwright 路径可通过；看到真实废土当日变化；所有构建及存档回归检查通过。手机真人可玩性另作发布前验收，本阶段不强制邀请测试者。

### 阶段 2E · 切片评估与是否更换默认核心的产品门禁（非功能开发，独立评审）

对比不建造/建造、技能 A/B、手动移动/完全不移动的固定脚本，核对生存秒数、击倒数、带回灵石、两场成本回收、另一世界真实行动与风险、操作中断/恢复的稳定性。检查 3–5 分钟实际可达，并指出无敌站桩、只刷灵石或资源枯竭等不良循环。

**重大决策门禁**：只有在切片达到“可玩且值得第二场”的结果后，才提议是否把出击成为正式局主入口、是否提供自动观战作为无障碍方案、如何将旧策略主循环调整成“远征之间的长期规划”。此门禁**不可在文档 PR 自动视为通过**。

## 3. 性能、工具与调研结论

- `Canvas 2D` 足够支撑开放小地图/24–28 敌人/少量投射物；按固定步长（建议 1/60 秒）更新纯逻辑，用 `requestAnimationFrame` 绘制。对每帧时间 delta 做限幅并在后台冻结，避免回前台瞬间撞出 24 个敌人。
- 图片用已存在的原创像素资产并尽可能组合 sprite atlas；设置 `imageSmoothingEnabled=false`；尽量避免每帧 DOM diff、大量 Canvas 阴影、循环重新加载 SVG。真机目标**持续至少 30 FPS，理想 60 FPS**；包体增量目标需在实现时量化（本 PR 不假报实测）。
- Web 输入使用 `Pointer Events`（必要的 pointer capture）+ 仅控制区 `touch-action:none`；页面后台按 Page Visibility API 暂停。桌面键盘用于自动化与调试。不要为了简单二维碰撞引入 Box2D、复杂寻路或全引擎。
- 调研的可选轻库 [Kontra.js](https://straker.github.io/kontra/) 具备轻量 Sprite/GameLoop/Pointer 模块、MIT 许可，可解决重复基础设施；**不在首阶段装新库**，待 2A 结果证明现有 Canvas + 极薄工具层难维护时再决策。与引入 Phaser/后端相比，当前方案最少迁移和包体成本。

官方参考：
- MDN 游戏帧循环：https://developer.mozilla.org/en-US/docs/Games/Anatomy
- MDN Canvas 优化：https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- MDN Pointer Events：https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- MDN 页面后台暂停：https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- Kontra 官方及 MIT：https://github.com/straker/kontra

## 4. CI 与 PR 审查原则

当前文档-only PR 没有实际逻辑变更，**不能声称已运行战斗、构建或手机**。实现 PR 依据影响范围运行 `npm run lint`、`npm run format:check`、`npm test`、`npm run build`、`npm run balance:check`、`npm run balance:matrix:check`、`npm run compare:interventions:check`、`npm run test:e2e` 和文本校验。特别注意：所有新文案需同步导出及 TapTap 审核台账。

持续核对最新 `main`、开放 PR、文件所有权；新阶段从新 main 独立分支和 PR，不沿用旧战斗结算分支，不强推，不改别人正在开发的 UI/存档。PR 通过 ≠ 合并，合并 ≠ GitHub Pages 部署，Pages 成功 ≠ 真机或 TapTap 上架。

## 5. 下一开发对话推荐提示词（仅 2A，不提前展开 2B）

> 你负责《同时穿越·末日模拟器》第二阶段 2A：灵灾出击的可控战场。先核对 `anlew07/learn` 最新 main、开放 PR，并读 `docs/product/05-core-loop-direction-and-audit.md`、`06-lingzai-sortie-prototype.md`、`07-core-loop-delivery-plan.md` 以及现有 Canvas/测试。仅做隔离原型入口、320×448 战场、摇杆移动、两类追踪敌人、自动灵刃、生命/暂停/75 秒胜负，Vitest 和 Playwright 验证并开独立 PR。**不要实现掉落发奖、营地建筑、正式世界日结算或旧存档迁移**。不要重构整个 UI。若总方向仍处于 RFC 待审定状态，保持实验入口和数据隔离，不自行替换正式主循环。完成后回报文件、测试、提交 SHA、PR 和未决问题。
