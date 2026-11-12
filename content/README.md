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

## 已建立的第一批内容包

- [灵灾01：修炼与境界](packages/lingzai/01-cultivation.md)（初稿）
- [灵灾02：妖兽生态与狩猎](packages/lingzai/02-beasts.md)（设计稿）
- [灵灾03：探索、机缘与封印](packages/lingzai/03-exploration-seal.md)（设计稿）
- [尸潮01：废土生存与母巢](packages/zombie/01-survival-mothernest.md)（本轮新增设计稿）

后续：[双世界联动01]、兽潮01和三世界联动逐步填充，不一次堆满。

## 更新流程

每个条目至少需要：稳定ID、合法条件、自动行为或自动结果、玩家干预、即时效果、经历标记、后续关联、存档字段、异常测试。没有抽到随机机缘时必须能按普通主线完成。调整数值请注明【暂定待测】，核心规则改动先更新 docs/08-decisions.md。
