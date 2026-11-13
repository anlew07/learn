# 三世界 UI 美术素材预览

> 当前仅用于 UI 草稿 PR #26。全部为项目内原创、可离线加载的 SVG。所有内容都可直接由现有 Vite / CSS 使用，不引入新的组件或包。

## 入口主视觉

![灵魂传送门](../src/assets/soul-portal.svg)

用法：首页 Hero 背景、品牌标记。重心放在「一个灵魂、三个世界」的世界观，而不是用纯文字卡片作为整个首页。

## 三个世界的场景与分身

| 世界 | 氛围场景 | 分身头像 |
| --- | --- | --- |
| 灵灾 / 修仙 | ![灵灾山门与灵气](../src/assets/world-lingzai.svg) | ![灵脉剑修](../src/assets/avatar-lingzai.svg) |
| 尸潮 / 废土 | ![尸潮废城与夕阳](../src/assets/world-zombie.svg) | ![废土守卫](../src/assets/avatar-zombie.svg) |
| 兽潮 / 荒野 | ![兽王荒野与紫月](../src/assets/world-beast.svg) | ![荒野猎手](../src/assets/avatar-beast.svg) |

角色头像目前用于世界卡片标识和**已完成战斗**的回放角色，不代表可手动控制的角色或装备模型。原有世界名称、状态和战斗记录仍由游戏引擎提供。

## 精英敌潮识别

| 敌潮 | 图标 | 现有玩法含义 |
| --- | --- | --- |
| 密集敌潮 | ![密集敌潮标志](../src/assets/elite-horde.svg) | 敌群密集，需要适配的范围技能 |
| 装甲精英 | ![装甲精英标志](../src/assets/elite-armored.svg) | 防御更强，需要适配的穿透/冲击技能 |
| 迅捷兽群 | ![迅捷兽群标志](../src/assets/elite-swift.svg) | 高速目标，需要适配的连击技能 |

精英敌潮的出现和武器克制由另一条开发主线负责。本分支仅提前准备 `data-wave-trait` 对应的 **CSS 图标显示**，没有创建精英数值、敌人规则或随机事件。合并时由现有 UI 数据决定是否出现这些标记。

## 样式与资源使用边界

- `src/art-direction.css` 是唯一的视觉覆盖层，世界头像通过 `--avatar-image` 映射。
- SVG 无外链脚本、网页字体、第三方图片或运行时依赖；图标放大不失真。
- 既有 DOM、`data-action`、ARIA、禁用状态、持久化和游戏时间不变。
- 首页微动效与战斗特效遵守 `prefers-reduced-motion`；全部重要内容仍显示文字。
- 在正式合并前使用 `npm run verify` 和手机真机检查。图片与 CSS 可独立替换、回滚。

## 选择现有轮子的记录

已经查过 [Vite 的静态资源处理](https://vite.dev/guide/assets)、[Lucide](https://lucide.dev/) 与 [Game-icons.net](https://game-icons.net/) 的方案。Vite 已支持 CSS `url()` 的构建和子路径处理；当前项目不需要引入新的 SVG 图标运行时包。Lucide 可作为后续通用 UI 功能图标备选；Game-icons 素材如需引用，应单独保留对应 CC-BY 署名。**本次没有拷贝以上两套图标，所有新增图形为原创。**
