# Pixel UI 第二阶段 · 全游戏收口与验收

> Issue [#38](https://github.com/anlew07/learn/issues/38) · 分支 `design/pixel-ui-closure-20261113` · 2026-11-13

## 视觉基础

- 统一经典 **2D 像素 RPG / 像素生存** 风格。交互控件使用矩形硬边、2px 描线和无模糊偏移阴影；禁止玻璃拟态、渐变、柔光、模糊及圆角胶囊。
- 整个 UI 使用一套不超过 32 个颜色的有限色板，三世界以已有青绿、暖黄、暮紫色强调；状态与危险还用文字标明，不靠颜色单独表达。
- 重用现有 64×64 传送门、128×72 场景、32×32 分身、16×16 精英图和 144×16 九技能图集。场景/角色按 **2 倍整数缩放**；技能格 16→32，九格图集为 `288×32`，不再使用 28px 非整数缩放。
- 中文正文继续使用系统字体和现有清晰字号；禁止为了复古效果牺牲信息可读性。按钮/选择框/可展开标题至少 44 CSS px。
- `src/style.css` 管理结构、响应式布局和原有战报动效；`src/art-direction.css` 管理贴图、平涂外观、描边与像素材质，后续资产只需换 CSS 相对 URL。未接入 `status-atlas.svg`，不增加运行时资源或第三方依赖。

## 审计与清理

- 两份 CSS 原本分别约 36.4 KB 与 23.5 KB，存在渐变、柔光阴影、模糊滤镜、色彩混合和多轮重叠的视觉规则。
- 将旧渐变/模糊/色彩混合改为平涂色块与硬阴影，所有圆角声明统一为 0；合并美术层相同选择器的历史重复声明。
- 统一首页、HUD、三世界、重大事件、危机提示、援助、融合、战报、战技图集和底栏导航外观；保留内容与操作数据来源。
- 不改变引擎、数值、存档、文本审核模板、`src/ui.js` 或任何业务 `data-action`。

## 测试与已知边界

- `tests/pixel-style.test.js` 检查全局样式不能再次引入渐变/模糊/玻璃效果、硬边/调色板/图集坐标/触控与减少动画规则。
- `e2e/pixel-ui.pw.js` 用真实 Chromium 在 **320/375/390/430 CSS px** 视口检查横向溢出、可见控件触控高度、计算样式和页面切换；此验收不是手机真机验收。
- 非整数设备 DPR 或浏览器缩放可能产生不可避免的物理像素宽度差异，见 [MDN pixel art scaling](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look)。
- **仍待真机：** Android Chrome / iOS Safari 的像素密度、虚拟键盘、安全区和低端设备性能，以及对战报、三世界、各类事件与图标的人工视觉逐屏审查。自动测试与 CI 成功不等于这些验收已完成。

### 技术选型

参考 [MDN `image-rendering`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-rendering) 使用原生 CSS 像素缩放。考察过 MIT 许可的 [NES.css](https://github.com/nostalgic-css/NES.css)，但其整套按钮/排版组件会与当前原生界面重叠，增加 CSS 覆盖和资源体积；本轮不引入，沿用已有 SVG/CSS 方案。

## Chromium 截图复核（本阶段）

基于 PR CI 失败工件中的实际 **320px 与 390px** 截图进行人工视觉复核：像素头像、平涂 HUD、硬边按钮和底部导航均已呈现。发现 320px 下顶栏「首页」两个汉字竖向断行、四列计数器标签挤压；已增加顶栏按钮 `white-space: nowrap` 与最窄屏 2×2 计数器布局，并增加浏览器断言。截图仅代表 Chromium 模拟视口，不是 Android/iOS 真机测试。
