# 参与开发 · 同时穿越·末日模拟器

**唯一权威开发规范：** [统一开发规范与交付门禁](docs/engineering/00-development-standard.md)。

**完整产品功能规格：** [游戏产品设计总纲](docs/product/00-game-product-blueprint.md)。

**AI 编程助手入口：** [AGENTS.md](AGENTS.md)。

本文件仅保留快速开始指南；模块合同、代码边界、测试要求、并行分支、PR 审查、合并、回滚及发布门禁，**以统一开发规范为准**。不要在这里维护重复的第二套规则。

## 准备环境

Node.js >=22.12，npm，Vite + 原生 JavaScript 项目。

```sh
npm ci
npm run dev
```

## 常用验证

```sh
npm run lint
npm run format:check
npm run text:check
npm run text:runtime
npm run text:review
npm test
npm run build
npm run balance:check
npm run compare:interventions:check
npx playwright install chromium
npm run test:e2e
```

`npm run verify` 是快捷检查，**不能代替当前 CI 的全部文本审核与导出步骤**。运行环境不足时请明确记录未执行项。

## 提交方式

先检查最新 `main`、其他 PR 和任务归属，从最新主线开独立任务分支。用 PR 提交修改，并按 [GitHub PR 模板](.github/PULL_REQUEST_TEMPLATE.md) 填写玩家问题、实际改动、测试、兼容性与风险；不直接覆盖他人开发分支或强推主线。

**测试通过、PR 合并、GitHub Pages 部署、真实手机验收和 TapTap 正式上架是不同阶段**，必须分别验证并报告。
