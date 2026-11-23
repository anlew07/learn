# 2Y · 正式世界行动反馈与同屏战报直达

> 基线：`main@0427ff6`（2X 已合并）。本步修正展示一致性，不新增战斗规则。

## 玩家问题与可观察结果

正式世界的 `world.action` 来自**已结算日**，但主场景仍把它标为“今日动向”，Canvas 更以“分身正在”描述；真实战报被藏进“更多功能”。新玩家因此很难区分“此刻的日历推进”“已经完成的自主行动”与“上日战斗回顾”。

本步在原场景里修正：
- 首日没有 `lastDecision` 时提示待命；不宣称已经执行过行动。
- 正常日结算后只读 `lastDecision.day`，显示“上日行动”及已完成行动。终局的最终日允许“本日结算”。
- 仅真实的上日 `lastCombat.spectacle` 回顾出现“昨日战报”和 44px 的“战报 ›”触控按钮；直接打开已有战斗记录，展示实际三波与 2X 已结算战术差额。不生成新战斗、收益或额外游戏日。
- Canvas 无障碍标签明确“上日交战回顾”，不误称实时权威打击。战报按钮不添加主 HUD 行。

## 复用与边界

复用现有 `getStageView`、`getRecentEncounter`、`scene-panel=report`、像素 CSS 和触控事件委托。无新依赖或资产，不修改引擎、数值、存档字段、随机数/时间线。参考《Loop Hero》“自动行动 + 有代价的间接介入”，不照搬游戏规则。参考 [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) 与 [减少动态效果](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)：沿用前台限帧和静态降动效。

## 验收

- Vitest：未结算、最近日、过期行动、终局最后日、10 次纯展示不更改存档内存。
- Playwright：320×568、390×844、430×932，真实 Engine 自动结算产生战斗，触摸场景内战报按钮、检查尺寸和无障碍文本。
- CI：lint、文本清单、Vitest、构建、固定种子和浏览器回归。
- 未覆盖：新的实时权威战斗、真机手感测评、实际玩家理解度、正式 Pages / TapTap 发布。
