# 2P｜回收截止倒计时与手机风险提示

> 2026-11-19，基于 2O 合并后的 2G 隔离候选。仅改出击试验的战斗 HUD 及专属测试；不修改正式 `main`、Run/Profile、存档字段、Engine 重放或灵石数值。

## 动机与玩法合同

2O 的 2,880 次权威回放说明：中段接近（30/50 秒）比 10 秒冲刺更有生存与收益机会；**62 秒才出发**时，反向/路线偏移使目标几乎必定超时。战斗持续 75 秒，但险地目标 **第 10 秒开放、第 65 秒截止**，玩家容易把战斗时间当作任务时间。

本阶段不通过额外敌人、惩罚、缩小触摸容差“强化难度”，仅将已有两个时钟同时、清晰地表现出来。

## 实现

- 新增 `src/ui/sortie-deadline.js` **只读**预览，使用实际 `battle.tick` 与任务 `appearsAtTick/expiresAtTick/status`，不启用新 `setInterval`、`Date.now` 或独立推进；所有数据来自固定 60Hz 战斗事实。
- 在原 `src/sortie.js` 战斗目标和碎片栏之间显示紧凑一行；稳妥巡护全部隐藏，险地才显示。阶段分为未开放、正在回收、最后 10 秒警告、已完成、已过期。截止时明确「任务奖金 +0」，已完成则提示**仍须生存至 75 秒**。
- 随已有 `drawStats()` 更新，25 秒技能弹窗、手动暂停、页面失焦暂停均不更改 tick，自然冻结；切回继续按原有 `requestAnimationFrame` 推进，绝不改变一秒回收和权威结算。
- 无障碍：每秒变化的数字为 `role=timer` 且 `aria-live=off`，只在进入紧急、完成、过期等阶段时使用独立礼貌播报区，防止高频读屏干扰。设计依据：[MDN timer](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/timer_role) 与 [status](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)。
- UI 使用原有像素化营地配色、少量 CSS，确保 320×568、390×844、430×932 仍能操作虚拟摇杆，Canvas 没有被遮盖。

## 验收合同

- Vitest 使用生产 `createSortie/stepSortie`，确认稳妥隐藏、10→65 秒真实进度、第 25 秒选技冻结、最后 10 秒提示、完成与过期的正确文案，预览不修改战斗对象。
- Playwright 使用手机触摸和 CDP 按住摇杆的真实坐标，三视口从营地真实选择数据启动战斗、触摸选技、跑到过期，检查战斗与回收两个时钟独立且暂停冻结，并证明画布/摇杆始终在视口内。测试不跳过物理时间、不向战斗对象写假状态。
- 最终提交要完成 GitHub Actions 的 lint/format/text、Vitest、Vite build、三世界/出击矩阵及全部 Playwright；通过不代表真人手机或已在 Pages 上线。
- 仅允许安全集成到 2G 隔离线，不合并正式 `main`。该 PR 不实施 2O 提及的随机回收点、价格调整或任务新奖励。
