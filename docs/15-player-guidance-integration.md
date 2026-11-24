# 15 · 玩家引导与决策反馈接口（第三阶段 B）

> 适用分支：feat/player-guidance-phase3-20261116
> 原始引擎基线：main@b665d9e3（历史审计）；2026-11-24 已按 2AC 的 1→2→3 世界扩张更新玩家文案与首救援引导，不改引擎或存档格式。

## 首次玩家路径审计

| 玩家时刻 | 引擎实际规则 | 理解障碍 | 模块给出的解释 |
| --- | --- | --- | --- |
| 开局 | 新档首局一个世界；成功救援逐步解锁 1→2→3 个并行名额 | 不知道玩家在操纵谁，也不理解救援为何带来扩张 | 自动分身、目标、玩家职责与世界名额成长 |
| 第一天 | 每世界每天一项主要行动（闭关会占用） | 误以为要每日点击 | 自动行为与可选决策分开 |
| 危机 | 危机100或到期则失守，巢群可能加速危机 | 不懂危险数字的后果 | 即时风险、事件默认处理和机会成本 |
| 战斗 | 防线战斗占原有行动，战技额外收益有上限 | 不懂战斗为何影响救援 | 战技与经验、材料、减灾之间的联系 |
| 准备100 | 还要核对主线、实际等级、材料、有效战力 | 满进度却不能通关 | 直接列出实际终局资格缺口 |
| 结算 | 最后结果可能是危机、截止日、灵魂耗尽 | 不知道下一局改变什么 | 证据支持的主因与结束时状态缺口 |
| 下一局 | 初始并行名额由永久成功救援数决定；文明传承由远征完成数与世界碎片解锁 | 混淆世界名额成长与文明传承 | 明确区分 1→2→3 世界扩张与局外传承 |

世界观只确立“一份意识，多处危局，联系原因未明”。不指定幕后反派。

## 研究与方案选择

- Apple Developer, Onboarding for Games: https://developer.apple.com/app-store/onboarding-for-games/
  建议短而分阶段的教学、边玩边理解、可跳过与事后重看。
- Nielsen Norman Group, Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
  初始展示核心信息，复杂功能在需要时展开。
- 本项目优先复用现有状态和预览合同，不安装教程依赖、不引入教学任务引擎、不额外修改存档。

## 函数 API

路径：src/presentation/player-guidance.js

| 导出 | 作用 |
| --- | --- |
| getPlayerGuidance(run, profile, Engine, tutorialOptions) | 聚合 opening / overview / choices / tutorial / outcome |
| getOpeningBrief(profile) | 开始前动机、目标、解锁与术语 |
| getRunOverview(run, Engine) | 今日摘要、核心循环、各世界焦点 |
| getWorldGuidance(run, world, Engine) | 世界危机、真实终局缺口、策略建议 |
| getDecisionGuidance(run, Engine) | strategies / events / builds / aid / fusion / retreats / echoes 七类决策 |
| getTutorialGuidance(run, tutorialOptions) | 6张由状态触发的卡片及 current，包含首次救援扩张说明 |
| getOutcomeGuidance(run, profile, Engine) | 结局、已证实失败原因、观察到的缺口和建议 |
| PLAYER_GLOSSARY | 九个易理解的玩家术语 |

A 线用法（示意，B 不修改 UI）：导入 Engine 和 getPlayerGuidance，然后调用 getPlayerGuidance(run, profile, Engine, { seenIds: tutorialPrefs.seenIds, skipped: tutorialPrefs.skipped })。返回对象中：
- opening：适合开始前的短说明。
- overview.worlds：卡片可显示 headline、finale.missing、lastDecision；overview.focusWorldId 可用于突出关注世界。
- choices：每项包含 kind / choiceId / available / blockedBy / why / potential / cost / noAction；部分包含 tradeoff、recommended 和 recommendationReason。
- tutorial.current：当前可提示的卡片；tutorial.steps：全部可复看，skip 不会隐藏帮助列表。
- outcome：仅局终返回，否则为 null；outcome.worlds 包含 mainFactor、observedGaps、nextTry。

## 行为与职责边界

1. 资格检查和数值费用来自 Engine.info、Engine.previewMajorEvent、Engine.previewStrategy、Engine.previewAid、Engine.previewFusion；引导不直接执行命令。实际点击仍需 Engine.applyCommand 最终校验。
2. recommended 只是对当前真实缺口的启发式建议，绝不是胜率、结果或未来收益预测。
3. 完成准备100不等于成功；finale.missing 展示实际未达条件。救援成功后材料已结算扣除，不得按剩余资源逆推“成功前材料不足”。
4. 决策数组包含不可用选项。A 线宜只在主屏展示重要事件和当前焦点，援助与借力等高级信息按需展开。不要把所有表格平铺到手机一屏。
5. tutorialOptions.seenIds 为可选已读 ID 数组；skipped 为可选跳过标记。六个稳定 ID：arrival、first-day、first-rescue、first-crisis、first-battle、first-ending。首次救援卡片由本局真实成功救援状态触发；触发不要求顺序完成，跳过绝不暂停模拟。
6. 模块不保存已读/跳过数据。若 A 线需要跨次访问保持已读，可先在 UI 的临时展示状态处理；涉及持久化合同更改应与总控协商。
7. 结算只能从有效日志判别危机100 / 到期 / 灵魂耗尽；180条日志裁剪或旧档缺失时必须显示“原因未知”，其他仅列为结束时缺口。
8. 世界碎片当前只记录数量，收藏称号不改变数值。不可宣传未实现的跨局永久战力成长。

## 测试与交接

tests/player-guidance.test.js 覆盖首局/第三局、第一天、跳过重看、危机、战斗、策略价格、事件默认、援助、借力、战技、闭关、回响、终局条件、失败复盘、缺失字段与提示前后种子一致性。

由于本 PR 不接入 UI，真实手机上的视觉和触达率由 A 线集成后验收。新文案须重新导出静态及动态审核清单，不能视作 TapTap 审核已通过。
