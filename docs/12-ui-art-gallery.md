# 像素末日 · UI 素材画廊（Pixel Art v1）

> 独立美术分支 `design/ui-art-direction-20261113` · [草稿 PR #26](https://github.com/anlew07/learn/pull/26)。本页图片即仓库中可直接使用的原创像素 SVG，不是外部参考图，也不更改玩法逻辑。

## 1. 一个灵魂：入口视觉

![64×64 像素灵魂传送门](../src/assets/soul-portal.svg)

64 × 64 像素格，使用少量纯色方块和方角传送门。首页和品牌图标复用同一素材，没有重复导出大图。

## 2. 三个世界：像素场景 + 分身

| 世界 | 128 × 72 像素场景 | 32 × 32 像素分身 |
| --- | --- | --- |
| 灵灾 · 修仙 | ![像素仙山与灵气山门](../src/assets/world-lingzai.svg) | ![像素灵脉剑修](../src/assets/avatar-lingzai.svg) |
| 尸潮 · 废土 | ![像素夕阳废城与废墟](../src/assets/world-zombie.svg) | ![像素废土守卫](../src/assets/avatar-zombie.svg) |
| 兽潮 · 荒野 | ![像素紫月兽王荒野](../src/assets/world-beast.svg) | ![像素荒野猎手](../src/assets/avatar-beast.svg) |

场景用于世界卡氛围，真实文字、P/D 进度、策略及危机操作保持现有 DOM；头像用于世界标识及**已结算**战潮回放。

## 3. 三类精英敌潮标识

| 敌群 | 16 × 16 图标 | 对应现有玩法 |
| --- | --- | --- |
| 密集敌潮 | ![像素密集敌群](../src/assets/elite-horde.svg) | 密集敌群，需要适合的范围战技 |
| 装甲精英 | ![像素装甲精英](../src/assets/elite-armored.svg) | 装甲阻挡与穿透克制 |
| 迅捷兽群 | ![像素迅捷兽群](../src/assets/elite-swift.svg) | 快速目标与连击克制 |

显示逻辑仍取决于主线战报真实的 `data-wave-trait`，美术分支不新增伤害、敌群或奖励。

## 4. 九式战技共用一张像素图集

![9 个 16×16 技能像素图标，依次为基础、连锁、穿透、扇形、疾风、冲击、雷暴、弹幕、狩猎](../src/assets/attack-atlas.svg)

`attack-atlas.svg`：144 × 16（9 格，每格 16 × 16）。战报里用同一张本地图的 CSS `background-position` 区分：

| 格序 | 现有战斗 style | 对应图标 |
| --- | --- | --- |
| 0 | `basic` | 基础星芒 |
| 1 | `chain` | 电链 |
| 2 | `pierce` | 穿透剑 |
| 3 | `fan` | 扇形刀 |
| 4 | `flurry` | 连击 |
| 5 | `shockwave` | 冲击波 |
| 6 | `storm` | 雷暴终技 |
| 7 | `barrage` | 弹幕终技 |
| 8 | `hunt` | 追猎终技 |

图集只负责静态视觉；所有技能的结算、攻击类型与战报来自现有系统。

## 体积与实现规范

**11 张 SVG 源文件合计 13,857 字节（约 13.5 KiB），未压缩。** 单个资源都低于 2.4 KB。小尺寸不是把大插画缩成缩略图，而是直接以整数格像素绘制：

- 格子尺寸：图标 16 × 16、人物 32 × 32、传送门 64 × 64、场景 128 × 72。
- 素材全部使用少量 HEX 色板、纯色 `<path>` 与 `shape-rendering="crispEdges"`；不使用滤镜、渐变、透明 PNG、大尺寸位图、字体、外链或脚本。
- 显示采用 `image-rendering: pixelated`，避免小精灵放大时模糊；CSS 处理大背景和响应式布局，不提供超大背景图片。
- 动效仍遵守 `prefers-reduced-motion`；不将重要信息仅放进像素图，保留标签及进度数值。
- 直接复用已有 Vite 对 CSS `url()` 的相对路径打包，适配 GitHub Pages 的 `/learn/`。无需安装 SpriteJS、Canvas 引擎或新图标库。
- 如将来需要逐帧动画，可复用这一套分格方法制作统一 sprite sheet；目前没有额外引入 GIF、大型 GIF 帧或运行时解析器。

## 维护与验证

运行 `npm run verify` 或查看 PR CI；`tests/ui-art.test.js` 对源文件数量、网格、静态资源安全、色板数量、图集映射、资源总预算和低动态设置进行验证。

**注意：** UI 分支独立于并行开发的 `main`。只有完成分支对齐、移动端视觉验收和自动测试后再考虑合并；当前网站不会因这套素材自动改变。
