# AGENTS.md — AI 开发入口（《同时穿越·末日模拟器》）

> **唯一权威开发规范：** [`docs/engineering/00-development-standard.md`](docs/engineering/00-development-standard.md)。
> **产品功能和页面规格：** [`docs/product/00-game-product-blueprint.md`](docs/product/00-game-product-blueprint.md)。
> **快速上手：** [`CONTRIBUTING.md`](CONTRIBUTING.md)。
>
> 本文件只用于帮助新 AI 开发对话快速找到项目及规则，不再维护与统一开发规范重复的另一套标准。对 `anlew07/learn` 仓库全部目录生效。

## 1. 仓库、平台与启动检查

- 唯一仓库：https://github.com/anlew07/learn ，目标分支 `main`；试玩预览：https://anlew07.github.io/learn/ 。
- 游戏：面向 TapTap H5 手机竖屏的**多世界自动生存/救援策略模拟**，世界会自主行动，玩家管理战略选择、关键事件和跨界援助。视觉为轻量 2D 像素生存 RPG。
- 技术：Vite + 原生 JS / HTML / CSS / DOM + Vitest + Playwright + idb-keyval + seedrandom；Node.js >=22.12。
- **任何开发前**先检查最新 `main` SHA、正在进行的 PR、工作分支和目标模块，再读上面的产品与开发规范，以及相关源码与测试。
- 现有代码与验证结果 > 旧文档里的状态表 > 历史聊天；**不把未合并 PR 当成已经上线**。

## 2. AI 必须遵守的高风险边界

- **先找已有成熟实现与官方文档，再开发**；不为遵守旧结构重复造轮子，也不随意引入重型框架、引擎或后端。
- 本项目采用**最多 A/UI、B/玩法、C/质量发布三个并行开发对话 + 总控集成**；每项任务独立分支/PR，不强制推送、不覆盖其他分支，不擅自直接推送 `main`。
- UI 只能发送正式命令/展示规则结果，不能自行扣资源、决定胜负、产生额外收益；规则/展示/存档应分层。详细模块合同见统一开发规范第 4、13 节。
- 每个世界每天只有**一个主要自主行动**；三波战斗不二次结算；P100 不是自动通关；固定种子与独立 RNG 必须可复现；命令操作 ID 必须幂等。
- 存档必须保护 RunState/ProfileState 的批量原子写入、失败暂停、损坏档拒绝覆盖和 Web Locks 单写者；禁止静默清档或多标签双写。
- 新手引导不强制阻塞模拟，事件有超时默认处理；增量挂机、云存档、商业化、全量清档、重大玩法/架构变更**未经用户明确决定不得擅自加入**。
- UI 使用统一的 2D 像素末日营地风格，中文可读性、移动端触控与无障碍优先；不使用霓虹玻璃科技控制台风。
- TapTap 审核是人工/平台决定；GitHub Pages 部署成功不代表已上架，更不等于真实手机兼容。

## 3. 研发执行入口

1. 阅读 [统一开发规范](docs/engineering/00-development-standard.md) 的需求准入、文件归属、测试与发布门禁。
2. 阅读 [产品总纲](docs/product/00-game-product-blueprint.md) 中对应页面编号和验收；若设计未确定，不自行扩大功能范围。
3. 读 `src/engine.js`、`src/ui.js`、`src/systems/`、`src/services/` 中对应代码和 `tests/`、`e2e/` 的现有用例。
4. 从最新 `main` 新建任务分支：检查 → 实现 → 测试 → 修复 → PR → 报告；无需为普通技术细节反复询问用户。
5. 真实运行相关检查；仓库全量 CI 使用 lint、format:check、text:check、text:runtime、text:review、Vitest、build、balance:check、compare:interventions:check、Playwright。具体见统一规范第 7 节。
6. 简要汇报：实际修改、测试证据、PR/提交 SHA、主线/Pages/真机状态与未决风险。不得将文件创建或分支提交误报为上线成功。

> **规范冲突时**：先查当前仓库代码与用户最新要求，形成可审查的修订 PR，不以此入口文件创造另一套隐藏规则。
