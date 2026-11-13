# TapTap 审核与发布渠道核验（2026-11-13）

> 本文件记录提审前自查，不代表 TapTap 审核通过、资质齐备或可直接发布。提交前需再次核验官方最新要求。

## 关键结论

- 现有 Vite H5 + GitHub Pages 是网页试玩预览；主线 CI 和 Pages 部署成功 **不等于 TapTap 小游戏发布合格**。目前没有证据表明已制作 TapTap 官方打包工具要求的 ZIP，完成小游戏登录、备案、资质或审核。
- **发布方式待人工决策/与官方确认**：使用 TapTap「小游戏」通道，还是平台允许的其他 H5 试玩形式。不可把普通网页地址直接当作小游戏包体，也不要为适配发布擅自迁移技术栈。
- 小游戏官方说明：正式上线（试玩版）需提交专用包体及资质；通过官方打包工具生成 ZIP，接入 TapTap 登录；不含内购的小游戏仍须核对小游戏前置备案等要求。
- 游戏审核侧：血腥暴力、误导性宣传、侵权素材及未成年人保护等应整体核对；关键词命中仅帮助定位风险，不能代替人工判断。
- 游戏若收到敏感题材深度审核通知，官方 FAQ 要求可搜索到每句游戏内文字的 Word/Excel；动态 `【变量】`、源码片段及审核候选 CSV **不是最终完整提审稿**。

## 官方来源及行动

| 来源 | 主要要求 | 项目动作 |
| --- | --- | --- |
| [TapTap 游戏审核规范 v4](https://developer.taptap.cn/docs/store/release/publish/agree/) | 内容、商店物料与知识产权规范 | 全文案与素材人工复核 |
| [小游戏审核规范](https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/review-standards/) | 不得出现血腥暴力等违规内容、不得虚假宣传 | 结合画面、音效、文字整体检查 |
| [创建小游戏](https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/) | 选择小游戏发布方式，提供专用 ZIP、平台登录和适用资质/备案 | 核实技术兼容及商店后台上线流程 |
| [敏感题材文本提审 FAQ 9.11](https://developer.taptap.cn/docs/store/release/publish/create-game/) | 如收到通知，按指定工单走全文本深度审核 | 审定无代码 Word/Excel 并保留版本依据 |
| [小游戏自查自审标准](https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/self-review-standards/) | 未成年人保护、数据、付费、广告、自审 | 按实际已实现能力逐项确认 |
| [小游戏宣发物料](https://developer.taptap.cn/minigameapidoc/quick-start/guide/game-publish/material/) | 横图 1920×1080、方图 1440×1440、至少三张实机截图≥1280×720、录屏等 | 物料必须来自真实游戏，不拿概念图冒充实机 |

## 发布阻塞项（人工/真机）

- [ ] 官方开发者后台确认发布方式、地区、主体/适用资质、适龄、防沉迷、备案；截图或工单留证
- [ ] 若选小游戏：确认 DOM、IndexedDB、Web Locks 与 TapTap 容器的兼容性，打包工具的 ZIP、平台登录、后台自测与提交审核流程
- [ ] 审核各世界成功/失败/自动结果，历史存档日志、隐藏彩蛋、UI 提示、商店资料；整理可搜索全文本审定版
- [ ] 权利人授权、AI 素材来源、隐私说明与实际 SDK/付费/广告行为一致
- [ ] 真机 Android Chrome、iOS Safari、TapTap 目标容器分别核验；不得把桌面移动视口测试视作真机通过
