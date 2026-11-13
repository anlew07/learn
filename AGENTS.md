# AGENTS.md — 同时穿越·末日模拟器

> 本文件约束在本仓库内工作的 AI 编程助手（包括 ChatGPT、OpenCode 等），作用范围为仓库根目录及所有子目录。项目开发细则见 [CONTRIBUTING.md](CONTRIBUTING.md)；二者冲突时先核对当前代码与用户最新要求，不要自行猜测。

## 1. 唯一仓库与项目定位

- **唯一代码仓库：** [anlew07/learn](https://github.com/anlew07/learn)；不要根据游戏中文名称另找仓库。
- **默认分支：** `main`；实际开发前重新读取最新分支状态和开放 PR。
- **游戏：**《同时穿越·末日模拟器》，面向 TapTap 的移动端 H5、多世界并行的文字生存与救援策略模拟器。
- **试玩预览：** https://anlew07.github.io/learn/ （实际是否部署成功以最新 GitHub Actions / 线上访问为准）。
- **方向：** 多个分身自主行动、资源与危机管理、跨世界援助、局内成长，以及可选的幸存者式三波战斗构筑实验。当前不是逐帧走位与碰撞的动作游戏。
- **当前事实来源：** 最新源码和测试 > 仓库中的架构/决策文档 > 历史聊天。不要把旧文档里的“待实现”当作最新状态。

## 2. 技术栈与本地环境

- Node.js **>= 22.12.0**、npm、Vite、原生 JavaScript（ES modules）和 HTML/CSS/DOM。
- Vitest 单元/集成测试；Playwright 在移动视口运行 Chromium；ESLint、Prettier。
- `idb-keyval` 管理 IndexedDB 存档；`seedrandom` 实现可复现的独立随机流。
- 纯前端优先，GitHub Pages 部署；不要无故引入后端、React/Vue、重型 UI 框架或游戏引擎。
- 先检查成熟开源实现、官方 API、维护情况、包体积和许可证。必要的依赖变更需同步更新 `package-lock.json`，重大技术迁移先与用户确认。

## 3. 首次进入仓库时的检查顺序

1. **先定位仓库** `anlew07/learn`，检查 `main` 最新 SHA、目标分支、正在开发的 PR 和本次修改范围。
2. 阅读 `README.md`、`CONTRIBUTING.md`、`ROADMAP.md`、`tasks/BACKLOG.md`；涉及核心机制时再读 `docs/08-decisions.md` 与对应专题文档。
3. 查看真实代码、调用链、`package.json`、测试和工作流；必要时检索成熟方案后再实现。
4. 优先在独立任务分支修改并发起 PR。对方分支有新提交时重新比较，不覆盖其他对话的工作。
5. 目标明确时自主完成实现、相关测试、修复与提交，不要求用户逐步回复“继续”；若权限受限如实报告。

## 4. 仓库目录与模块边界（以最新代码为准）

| 路径 | 主要职责 |
| --- | --- |
| `index.html` | H5 入口 |
| `src/engine.js` | 确定性模拟、日推进、玩家命令、事件与结局；不直接操作 DOM 或存储 |
| `src/config/game-data.js` | 静态世界/成长/战技定义 |
| `src/config/balance.js` | 平衡参数与数值计算入口 |
| `src/systems/` | 自主策略、事件/援助/融合/策略切换合同、战潮、危机提示、统计等纯规则模块 |
| `src/ui.js`、`src/style.css` | DOM 展示、输入与移动端样式；UI 不私自改游戏状态 |
| `src/services/persistence.js` | RunState/ProfileState 的 IndexedDB 原子批量持久化和串行保存 |
| `src/services/exclusive-session.js` | Web Locks 活动会话单写者，其他标签页只读 |
| `content/packages/`、`content/templates/` | 设计内容包和稳定 ID 模板；不是直接可运行的规则实现 |
| `docs/`、`docs/review/` | 架构决策、玩法说明、提审文字和上架检查资料 |
| `tests/`、`e2e/` | Vitest 规则/存档测试和 Playwright 浏览器流程 |
| `scripts/` | 固定种子平衡统计、干预对比和游戏文本导出/校验 |
| `.github/workflows/` | `ci.yml` 验证、`deploy-preview.yml` 在主分支验证通过后发布 Pages |

现有 `src/engine.js` 与 `src/ui.js` 相对较大；允许按功能、配合测试逐步拆分，但不为追求文件行数进行无关大改。

## 5. 不可破坏的玩法与技术不变量

- **每世界每天只有一个主要自主行动。** 三波战潮属于既有战斗的一部分，不额外结算第二份主要行动或战利品。
- 世界各有独立随机流、日程、持续威胁和结果；相同种子、规则版本、玩家操作顺序应可复现。不要在“预览/展示”代码里额外消耗随机数。
- 不在线也能自主推进；重大事件超时有自动结果；普通救援主线不能被随机稀有机缘卡死。
- `P100` 不等于通关，仍要通过真实主线、材料、等级、战力与状态资格检查。
- UI 预览与实际命令必须复用同一**无副作用合同**（如 `aid-contract`、`fusion-contract`、`event-contract`、`strategy-contract`），费用、冷却和资格只能由引擎最终确认。
- `applyCommand` 的操作 ID 去重、事件一次性结算、终局奖励与跨世界援助的原子性必须保留；禁止刷新、重放或重复点击获得双份奖励。
- `src/services/persistence.js` 对 RunState/ProfileState 使用 `idb-keyval` 的 `getMany/setMany`；保存使用命令时快照并串行执行，不得静默丢档或错序覆盖。
- 多标签页使用原生 Web Locks：未获锁只能只读，重新获得锁要先重读最新存档；不要未经论证换成不可靠的 `localStorage` 竞争锁。
- Alpha 测试档迁移策略可按既定版本规则处理，但不能无提示删除真实玩家数据；对存档结构变更先检查兼容性与恢复策略。

## 6. 实用命令与验证

首次准备环境：

```sh
npm ci
npm run dev
# 首次执行浏览器测试前：
npx playwright install chromium
```

按影响范围运行，完成任务时尽可能执行相关检查：

```sh
npm run lint
npm run format:check
npm run text:check
npm test
npm run build
npm run balance:check
npm run compare:interventions:check
npm run test:e2e
```

- `npm run verify` 是综合验证脚本，但**当前不包含** `text:check`；对提审文案/内容变化须额外执行 `npm run text:check`。
- `npm run balance`、`npm run compare:interventions` 可用于固定种子分析；脚本结果不等于真实玩家胜率。
- `npm run format` 会格式化多个目录，避免为小改动对大量无关文件产生格式差异。
- 修改逻辑时补正常、失败和边界用例；涉及存档、冷却、去重、独立 RNG、最终结算时加回归测试。
- Playwright 的移动视口不等同 Android Chrome / iOS Safari 真机验收。未跑的测试不能写“通过”。

## 7. 内容、UI、审核与文档

- 新内容先定义稳定 ID、触发与合法条件、自动默认结果、人工选择、费用、状态和测试；尽可能配置驱动，不把剧情展示文字当逻辑主键。
- 文字和商店包装优先突出互助、救援与文明重建；保留生存策略张力，同时遵照最新 TapTap 官方审核要求。
- 维护 `docs/review/game-text.csv` 等提审材料时，优先使用 `npm run text:export` 生成并以 `text:check` 核对，避免手工文案与真实游戏不一致。
- **美术风格为强制约束：** 全游戏统一 2D 像素风，覆盖主界面、世界场景、角色、敌人、技能、按钮、边框和装饰；参考经典像素 RPG / 像素生存游戏，使用一致的整数像素网格、有限色板、清晰硬轮廓和可辨识剪影。禁止混入写实插画、3D、玻璃拟态、霓虹渐变科技风或其他冲突风格；避免渐变、模糊、柔光和高光玻璃面作为主视觉语言。优先采用轻量 SVG 精灵图、CSS 像素块/阶梯边框和可替换素材，确保像素清晰、低资源占用。
- **文字可读性优先：** 中文正文不强制使用像素字体；可继续使用清晰的系统字体，禁止为风格牺牲字号、行距、对比度和移动端可读性。手机竖屏优先，触控目标至少 44px，兼顾 320–430 CSS px、底部安全区和减少动态效果偏好。
- UI 继续使用原生 HTML/CSS；新增素材必须符合统一像素规范，不因单个页面/角色而引入另一套画风。
- 核心玩法变更同步检查 `docs/08-decisions.md`、`CHANGELOG.md`；任务进度更新 `ROADMAP.md` 或 `tasks/BACKLOG.md`，但不要把过期进度复制进本文件。

## 8. 并行协作、交付与部署

- 不强制推送、不删除他人分支、不覆盖其他对话的提交；发生冲突先比较差异并安全合并。
- 一个 PR 聚焦一个工作范围；提交说明清晰，例如 `feat:`、`fix:`、`test:`、`docs:`。
- 修改前审查直接和间接影响；代码变更须执行相关测试。仅改文档可说明未执行运行时测试的原因。
- `Validate H5` 工作流验证主分支及 PR。Pages 发布由主分支成功验证触发；构建基路径为 `/learn/`。
- 区分**文件已创建、分支已提交、PR 已合并、CI 已通过、Pages 已发布、手机端已验收**，不得混为一谈。
- 完成后简要汇报：改动文件、关键变化、实际验证结果、PR/提交地址、未解决风险。

> 如发现本文与最新仓库冲突，请以最新代码、真实测试和用户当前决定为准，及时更新本文，而不是照旧执行错误规则。
