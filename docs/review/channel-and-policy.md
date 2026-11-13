# TapTap H5 小游戏发布渠道与官方政策（核验日期：2026-11-13）

> 当前为开发者自查记录，不是 TapTap 平台书面批准。不同形态、地区和付费方案的要求可能不同；提交时以对应渠道后台实时字段与官方回复为准。

## 已核实的渠道选择

**优先核验「H5 小游戏」通道，不把纯前端 H5 误判成必须移植 Unity/Cocos 的普通小游戏。** TapTap 官方《小游戏介绍》明确两种上架形态：普通小游戏、H5 小游戏；《面向 AI 开发者》将普通 Tap 小游戏（WebGL）与 H5（平台域名下运行）单独区分；《MCP 安装指南》明确目前 MCP 只支持 H5 小游戏，并用 `dist` 目录上传举例。

- 游戏当前是 Vite + DOM/HTML/CSS + JavaScript + IndexedDB/Web Locks。`npm run build` 的 `dist/` 是**待平台验证的候选构建目录**，不是已提交/过审的包体；GitHub Pages `/learn/` 只是 HTTPS 网页预览。
- 优先在用户自己的认证开发者账号中，按照 H5 小游戏的 MCP 安装、扫码授权、创建游戏、上传 `dist`、平台自测路径验证。**不需要本阶段接入收费 SDK、修改玩法或在仓库加入账号密钥。**
- 官方另有普通小游戏的 TapTap 打包工具 ZIP、登录及包体规范，这条规范不能不加区分地套用于 H5 MCP。H5 真实包体生成方式、正式账号/资质和登录要求，应在官方 H5 渠道后台核对。
- 平台域名与 GitHub Pages 域名不同，当前 IndexedDB 本地存档**不能自动跨域迁移**。应在新平台域名验证首次启动/保存/刷新/多标签页锁；不要承诺跨端存档同步。
- 浏览器 Web Locks 不支持时游戏采取只读保护；必须在 TapTap H5 实际 WebView 检查，避免发布后卡在只读。见 Issue #4。

## 官方文档与适用边界

| 官方文档 | 对应判断 | 本项目下一步 |
| --- | --- | --- |
| [小游戏介绍](https://developer.taptap.cn/minigameapidoc/quick-start/guide/minigames-intro/) | 明确普通小游戏与 H5 小游戏并存 | 使用 H5 路径验证而非盲目转引擎 |
| [面向 AI 开发者](https://developer.taptap.cn/agents/) | H5 与 WebGL/原生 SDK 不能混用 | 使用 H5 文档与 MCP 路线 |
| [H5 MCP 安装指南](https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/mcp-setup/) | 当前 MCP 仅支持 H5；示例直接上传 `dist` | 用户授权后在开发者后台进行真实上传与自测 |
| [创建小游戏](https://developer.taptap.cn/minigameapidoc/quick-start/guide/creation-improvement/) | 页面可先预约；开放/正式试玩需要包体和资质 | 先创建/完善资料，再按实际渠道提审 |
| [开发者认证](https://developer.taptap.cn/minigameapidoc/quick-start/guide/registration-login/) | 注册状态不可直接提审，需认证主体 | 用户确认个人/企业认证状态 |
| [小游戏前置备案](https://developer.taptap.cn/minigameapidoc/quick-start/guide/pre-filing/) | 普通小游戏正式上架前的备案入口及流程 | **H5 具体适用性应让后台/工单确认**，不得无条件写「H5 无需备案」 |
| [小游戏审核规范](https://developer.taptap.cn/minigameapidoc/tap-operation/operation-standards/review-standards/) | 内容、误导、商业化、知识产权检查 | 结合文字/画面/音效人工审核 |
| [敏感题材全文本 FAQ 9.11](https://developer.taptap.cn/docs/store/release/publish/create-game/) | 如收到通知，需可搜索的全部实际文本 Word/Excel，走特殊审核工单 | 使用 CSV 候选做底稿，完成人工全文版再提审 |
| [小游戏宣发物料](https://developer.taptap.cn/minigameapidoc/quick-start/guide/game-publish/material/) | 横图/方图/实机截图/视频规格 | 参阅 `release-assets.md` 逐项制作 |
| [通用商店游戏物料要求](https://developer.taptap.cn/docs/store/release/publish/material/) | 512px 图标等适用于通用商店的规范 | 不作为 H5 独有规格；以 H5 创建页最终提示为准 |

## 用户必须处理的发布前置（不可由仓库 CI 证明）

1. **账号/渠道：** 登录 [TapTap 开发者中心](https://developer.taptap.cn/)，完成个人或企业主体认证；确认选「H5 小游戏」的实际入口、游戏 ID、服务区域、名称与是否有发行主体/软著要求。请勿在仓库提交证件、账号会话、私钥或扫码凭证。
2. **平台接入：** 在本人授权环境下按 H5 MCP 官方安装流程完成扫码授权和 `dist` 上传；取得实际测试链接/版本号、容器调试日志。此对话只整理文档及仓库工件，不声称已有授权或已上传。
3. **资质/备案：** 按后台要求核对版权/软著、拟发布地区、小游戏前置备案、未成年人保护、是否含内购与相应版号。普通小游戏说明「无内购不需提交版号」不等于没有其他资质；H5 必须确认渠道适用性。
4. **内容提审：** 商店资料、年龄提示、隐私政策及素材真实一致；若收到敏感题材深度审核通知，按 FAQ 9.11 创建工单，附全量已审定文字与可进入各流程的体验方式。
5. **上线验收：** Android/iOS 真机及目标 H5 容器完成全流程、断网/刷新、存档、Web Locks、异常存储测试；平台审核通过后才标记为发布完成。

## 当前证据状态

- GitHub 主线 `5583493f` 已构建与 Pages 部署；这是**代码/网页预览**的证据，不是平台小程序版本记录。
- GitHub 仓库中没有已验证的 H5 MCP 授权、平台上传记录、后台资质审核结论或真机 TapTap 运行记录。
- 不自行把三世界灾变归因于幕后反派；三波战斗中的首领只是局内威胁，不代表末日唯一源头。
