# 开发规范 · 同时穿越：末日模拟器

## 项目目标

维护一款**文字型、多世界并行**的 TapTap H5 游戏；不要让实时战斗、地图和额外状态条破坏核心的自主模拟体验。

技术设计以**成熟、可验证、可替换**为原则。构建使用 Vite，测试使用 Vitest，代码检查使用 ESLint，格式化使用 Prettier，存档依赖 idb-keyval，随机数使用 seedrandom；除非出现明确的产品需求，不自研它们的替代品。

## 代码边界

- `src/config/game-data.js`：静态世界、战技、成长信息；不读写游戏运行状态。
- `src/config/balance.js`：统一调参入口和阶段毁灭压力计算，**不添加 DOM 或持久化依赖**。
- `src/engine.js`：纯游戏状态转换、主要行动、事件和结局。只操作显式传入的状态，不查询 DOM 或存储。
- `src/systems/action-policy.js`：策略评分/解释文本，作为纯计算返回结果；使用传入的随机回调，不读取浏览器状态。调分先运行固定种子 A/B。
- `src/systems/wave-combat.js`：计算三波战潮的封顶加成与阶段描述；不直接扣终局费用、修改实际Lv或产生第二份战利品。
- `src/systems/event-contract.js`：重大事件的副作用为零的选项展示与支付前检查；新事件必须让UI和引擎共用合法性合同，不能单独编写显示用假概率。
- `src/systems/run-metrics.js`：仅统计已结算的行动和战潮收益，不允许额外生成资源或随机事件。报表由 `scripts/balance-report.mjs` 读取RunState统计字段生成，不重新模拟战斗。
- `src/systems/finale-readiness.js`：只能展示终局门槛，从引擎接收实际`canFinal`与战斗资格；不能独立重写结局扣费、产出或覆盖等级规则。
- `src/systems/fusion-contract.js`：提供副作用为零的融合资格、费用和供力者计算；引擎`fuse`和UI预览必须消费同一结果。对显式ID列表去重，不能以重复供力者绕过人数门槛。
- `src/systems/aid-contract.js`：唯一的援助支付前合同，明确实际P/D增量、费用、源世界材料风险和共享冷却；纯计算无RNG、无存档写入。UI直接呈现合同，引擎`aid`在扣费前重新确认。
- `src/systems/strategy-contract.js`：唯一长期策略切换支付前合同，支持免费期、闭关AP预留和无效状态；引擎和世界卡必须读取同一规则，操作失败必须重绘真实状态。
- `src/systems/intervention-ledger.js`：只做动作结算前后快照差异/本局历史上限，不允许预判未发生的结果、重新应用收益或抽取随机数。由`applyCommand`成功分支调用，重复操作ID由既有去重层兜底。
- `src/systems/crisis-advisor.js`：只通过既有规则合同判断当前风险和可执行操作；输入RunState和外部纯函数回调，不操作战斗、不生成奖励、不做未来天数预测。UI只做导航，不直接支付。
- `scripts/intervention-compare.mjs`：本地固定种子批量对照，结果必须带脚本化干预、成功执行比例和结局差异，不得宣称玩家真实胜率。
- `src/ui.js`：展示和用户指令。只能调用引擎的正式接口；不可私自修改世界的等级、资源、冷却或结局。
- `src/services/persistence.js`：使用idb-keyval批量事务读写RunState/ProfileState；不引入世界规则、UI DOM或剧情内容，测试通过可注入存储驱动执行。
- `src/services/exclusive-session.js`：Web Locks原生单写者模式；不维护自研localStorage心跳锁。未获得锁的页面只读，重新获取锁后必须重读最新存档。
- `src/engine.js` 的 `applyCommand`：玩家指令边界，传入稳定操作ID与类型/参数；相同操作ID按已保存结果重放不再次改变状态，冲突签名拒绝。
- `scripts/balance-report.mjs`：独立批量运行与可复现的结果统计。
- `tests/`：关键规则、极端状态与回归测试。一个功能改变至少对应一个正常和一个异常用例。

`src/engine.js` 与 `src/ui.js` 仍属于早期**大型模块**，后续按照功能逐步拆分；避免一次性无测试重写。目录拆分本身不算完成，必须保持现有存档与行为语义或明确升级版本。

## 本地验证

需要 Node.js 22.12+ 和 npm。

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run build
npm run balance:check
npx playwright install chromium # 首次安装浏览器
npm run test:e2e
```

需要格式化新增文件时使用 `npm run format`。已有大型模块尚未批量格式化，`format:check` 先覆盖新增脚本和工具配置；相关技术债逐步处理，不为了过检查把整个游戏引擎一次性重写。已由 GitHub Runner 生成并提交 `package-lock.json`，且冻结安装已校验；所有常规 CI 使用 `npm ci`。改变依赖时运行 `npm install` 更新并审查 lockfile，再提交；不能只改版本号不更新锁文件。

## 设计内容到代码

先定义稳定 ID、触发/合法条件、默认结果、人工干预、一次性标记、冷却和边界测试。游戏内容应优先写入 `content/packages/`，成熟后再移入 `src/config/`；不能把剧情名称作为逻辑主键。

重要规则包括：每世界每天只有一个主要行动；重大事件会自动处理；P100不是获胜；伤势/魂力/资源检验先于扣费；一次事件不重复结算；跨世界联动只能通过正式接口；战潮三波不追加奖励次数。

## 提交与评审

1. 一个提交集中解决一项问题（例如平衡参数、事件修复或存档边界），提交信息推荐 `feat:`、`fix:`、`test:`、`refactor:`、`docs:`。
2. 任何行为变化同步更新测试和 `CHANGELOG.md`；核心设计分歧更新 `docs/08-decisions.md`。
3. 新增库前检查必要性、体积、维护状态、许可证与现成API。默认避免新UI框架和自研工具。
4. 未通过真实运行的测试不能标记“通过”；没有真实构建证据不能声称“可发布”。
5. 早期alpha可以明确升级版本并重开存档，不为未发布版本制造迁移负担；公开版再规划迁移策略。

## 外部阻塞

2026-11-12：此前私有仓库执行曾出现 `runner_id=0`、`steps=[]` 的启动失败；改为公开仓库并重跑后，[Actions #43193096251](https://github.com/anlew07/learn/actions/runs/43193096251) 的完整检查已通过。现在的重点是依赖锁文件与移动浏览器真机验收，不要再将CI环境描述为阻塞。
