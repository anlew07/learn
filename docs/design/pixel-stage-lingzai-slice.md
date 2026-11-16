# 灵灾像素场景垂直切片 · 集成与美术验收

> 2026-11-16 · 独立 PR 工作说明。本切片仅解决「默认主界面像网页长卷而不是游戏」和「有真实像素场景」；正式品质是否达到用户的 Dungreed 手机版偏好**仍需本人在手机上确认**。

## 已实现边界

- 正常玩家进入进行中的一局，默认看到**固定屏幕像素场景 + 状态 HUD + 操作区**。整页不再按长文字卡向下延伸。旧世界卡、战斗、事件、队伍及援助等完整逻辑被保留，详见「更多功能→传统详细视图」。
- 阶段目标为**灵灾遗迹**，使用本地 16×16 像素素材在 Canvas 2D 中绘制：山脉、树木、石门遗迹、营地、火焰、地形细节、分身、补给箱、威胁以及事件提示。
- 场景渲染只读取 RunState 的 day / status / d / p / threat / level / action / pendingEvent 等数值。画面表现不会调用 Engine.step、Math.random、applyCommand 或保存数据。
- 画面视角切换只改变 UI 选择，不消耗 AP/资源/游戏日；所有游戏命令通过原有引擎进行。
- 事件、策略、帮助和跨界援助可在画面内抽屉查看与操作；复杂详情只允许在抽屉内部滚动。
- `?debug=1` 默认保留旧视图，方便已有数值/存档回归测试；玩家默认走新的固定画面。测试同时验证两条路径。
- 游戏默认暂停，进入新画面需主动点击继续；多标签只读、存档失败等保护仍使用现有机制。

## 素材选型、版权与包体

- 使用 **Kenney Tiny Dungeon** 的 tile atlas / hero / NPC / monster / chest，官网 https://kenney.nl/assets/tiny-dungeon ，**CC0 1.0 Universal**。可在商业游戏内使用，不必署名；出于可追溯性仍记录作者 Kenney.nl。
- 从公开的 CC0 资源镜像 https://github.com/giobi/sgravoquest-assets 拷贝 5 个 PNG 到 `src/assets/tiny-dungeon/`，不是运行时远程请求，不需要 SDK、外链 CDN 或账号。
- 其余山脉、营地、石门、火光、角色动态、风景分层由本地 Canvas 程序绘制，未复制 Dungreed 或 Shattered Pixel Dungeon 受版权保护的精灵。
- Canvas 用 `imageSmoothingEnabled=false`、固定 320×208 逻辑像素并由浏览器按实际视口显示。无大型框架、无新 npm 依赖、无永久动画状态。
- 正式美术质量距《Dungreed》尚有差距：本次以已验版权的轻量地牢像素图集为第一批可运行素材，用户审核前**不能将整游戏像素美术标记为已完成**。

## 相关文件

- `src/presentation/stage-view.js`：纯只读的场景显示模型。
- `src/ui/pixel-stage.js`：Canvas 像素绘制；画面叠层由实际模型驱动。
- `src/stage-shell.css`：固定视口、边缘 HUD、弹出抽屉和触控安全区。
- `src/ui.js`：轻量集成场景导航/按需抽屉；保留旧事件、援助与命令处理路径。
- `tests/stage-view.test.js`、`e2e/fixed-pixel-stage.pw.js`：验证只读、移动端无主页面滚动、世界切换不推进、策略选择与读档回归。

## WorldBox 式可观察世界 · 第二轮增补（2026-11-16）

用户补充《WorldBox》《天道：创造》等模拟经营参考后，当前切片从「只有动态装饰」扩展为**一份真实世界状态对应多种场景表现**。仍以灵灾为首个验收对象，不创造独立文明模拟算法。

- **危机层**：依据实际 `d` 值，画面显示正常（小于 40）、警戒（40–74）、高危（75 以上）的地表与遗迹变化。不存在虚构敌方数量；怪物精灵仍只是威胁的示意。
- **进度层**：依据 `p` 值，30/65/100 阶段增加遗迹标记与封印准备的可视提示；**P100 不等于胜利**。只有 `status=saved` 才会出现真正的成功封印和救援旗帜，`failed` 则呈现失守景象。
- **成长/物资层**：分身实际等级让角色拥有不同阶段的小光效，已有资源值使场景出现可见补给包，**不是可操纵的建筑或真正建造了某设施**。
- **分身行动层**：读取已有 `lastDecision` 与 `action`，将角色布置在与探索/训练/采集/排险/救援相符的场景位置。动画不生成新的行动。
- **事件和近期战斗**：仅根据真实 `pendingEvent`、`lastCombat.day` 等信号显示短时像素提醒；过期战报不再永久显示为刚发生。
- 纯展示层在 `src/presentation/stage-view.js` 新增 `getWorldSceneState()`；绘制层在 `src/ui/world-scene-details.js` 使用固定像素装饰，仅传递只读 `scene`。**不写 RunState/ProfileState、不读抽样随机源、不调用引擎推进或额外战斗结算**。
- 浏览器截图：`e2e/living-world-scene.pw.js` 在一张真实 Canvas 上绘制三种**隔离的固定状态样例**（stable / critical / restored），验证像素结果不同并保存截图。**这些是受控状态样例，不是宣称已经有真人游玩达到这些状态的录像。**

**用户新增“事件切换幸存者式战斗地图”想法**已另行归档在设计 PR #50 的
[`docs/product/02-event-combat-view-modes-proposal.md`](https://github.com/anlew07/learn/blob/design/fixed-hud-reference-20261116/docs/product/02-event-combat-view-modes-proposal.md)。
其三种观察/跳过方式和奖励选择全部是**未来候选设计**，本轮没有增加新战斗、掉落或操作指令。

## 必须验证

- 320×568、320×640、375×667、375×812、390×844、430×932：**主屏无纵向/横向文档滚动**；详细抽屉内部允许滚动且能关闭。
- 首次/已有存档、两世界/三世界、暂停/自动推进、世界切换、策略、事件、战技、援助、结算、刷新、只读页可达且不丢档。
- Canvas 是否有真实图像、前景/角色/遗迹是否可辨识。需要截图和真人审阅；DOM 测试不能替代视觉与美术品质确认。
- iOS Safari、Android Chrome、TapTap WebView、性能/发热的真机结果**仍待人工确认**，不能由 Playwright 视口模拟冒充。

## 后续建议

确认「灵灾」切片符合用户对手机像素游戏的真实观感后，再统一美术语法，扩展废土与兽潮独立场景，并逐步退役旧的整页长卷视图。在这之前，不新增增量挂机、离线经济、控制摇杆或新的行动规则。
