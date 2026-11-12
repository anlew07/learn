# 内容包工作区

**目标：** 逐步填充可复用的世界内容。当前是设计阶段，没有游戏代码和已验证数值。

## 通用模板

| 文件 | 内容 |
| --- | --- |
| [世界模板](templates/world.md) | 世界定义、末日、成长、结局 |
| [行动模板](templates/action.md) | 自主行动前置、评分、效果 |
| [事件模板](templates/event.md) | 重大事件、自动结果、干预 |
| [分支模板](templates/branch.md) | 经历标记和后续条件 |
| [威胁模板](templates/threat.md) | 巢穴、感染区、兽群 |
| [成长模板](templates/growth.md) | 境界与等级解锁 |
| [敌人模板](templates/enemy.md) | 普通、精英、首领与战斗结果 |

## 第一批内容包

- [灵灾01：修炼与境界](packages/lingzai/01-cultivation.md)（初稿）
- [灵灾02：妖兽生态与狩猎](packages/lingzai/02-beasts.md)（设计稿）
- [灵灾03：探索、机缘与封印](packages/lingzai/03-exploration-seal.md)（设计稿）
- [尸潮01：废土生存与母巢](packages/zombie/01-survival-mothernest.md)（设计稿）
- [双世界联动01：灵灾×尸潮](packages/soul-link/01-dual-world.md)（**本轮设计稿：记忆、援助、二人之力、边界测试**）

后续重点为兽潮01及三世界联动。能力参数和所有玩法结果仍需程序验证。

## 更新流程

新增内容需要：稳定ID、前置条件、自动/手动处理、效果、经历标记、后续关联、存档字段与边界测试。新增规则优先调整本包，再由 docs/04-soul-link.md 等权威文档归纳统一接口。数值需标记【暂定待测】，关键变更记入 docs/08-decisions.md 和 CHANGELOG。
