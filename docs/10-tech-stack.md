# 10 · 原型技术选型：优先成熟工具

**状态：初始工程决策，不代表已完成浏览器兼容和部署验证。**

## 已选择

| 需求 | 工具 | 采用原因 |
| --- | --- | --- |
| H5开发与打包 | [Vite](https://vite.dev/guide/) | 支持vanilla JavaScript，无需React或复杂前端框架 |
| 测试/批量模拟 | [Vitest](https://vitest.dev/guide/) | 同构的JS测试执行环境，便于逐步添加可复现测试 |
| 本地存档 | [idb-keyval](https://github.com/jakearchibald/idb-keyval) | 用简洁的promise API封装IndexedDB，不自己写原生事务样板代码 |
| 随机数 | [seedrandom](https://github.com/davidbau/seedrandom) | 可命名、可导出状态的种子随机序列；每世界独立，读档后继续 |
| UI | 原生HTML/CSS/JS | 维持TapTap H5文字模拟器轻量路线，不引入框架渲染层 |
| CI | GitHub Actions | 每次push自动运行测试与构建（需仓库Actions开启） |

## 为何不直接引入吸血鬼幸存者的动作引擎

本项目没有实时碰撞、手动走位或每帧子弹仿真需求。直接加入一套2D动作物理引擎会改变用户目标和设备负担。战潮先作为可开关的三波战斗表现层；后期如果真有动画需求，再评估成熟轻量引擎，而不是先写自研物理系统。

## 保存与兼容

基于IndexedDB保存当前局和Profile。当前原型只保证同版本恢复；浏览器清理数据仍会丢失。早期内部测试可以明确重开，不为未发行存档做复杂迁移。未来需要“跨设备存档”才评估服务器/插件。

## 安装和运行

~~~bash
npm install
npm run dev
# 浏览器打开终端提示的地址，手机可访问同一局域网中的开发服务器
npm test
npm run build
npm run preview
~~~

本项目需要Node.js满足当前Vite/Vitest版本要求，建议Node.js 22.12+。本地环境若无法访问npm，需在联网开发环境或者GitHub Actions安装依赖；无依赖安装就不能声称已完成正式打包测试。

首次GitHub Actions运行在启动阶段失败，未返回可用执行日志，已登记Issue #2。现已使用公开seedrandom源码对引擎和17条测试进行独立JS冒烟验证；这不等于Vite生产构建和手机真机测试。

## 存档原子性

现在使用 idb-keyval 内建的 `getMany/setMany`，将RunState和ProfileState在一个批量事务中读写；避免自定义IndexedDB事务封装，也避免结局奖励发生“只写入一半”的问题。存储操作封装于 `src/services/persistence.js`；新回归测试 `tests/persistence.test.js` 覆盖连续写入、快照和错误恢复。多标签页冲突和正式备份/导入导出尚未完成。

## 单写者与操作幂等

沿用成熟的原生 `navigator.locks.request()`，在安全上下文中为同来源窗口提供单写者保护；可选的 `ifAvailable` 表示锁被占用时立即进入只读，而不是挂起UI。该功能不依赖单独的同步依赖。

用浏览器自带的 `crypto.randomUUID()` 生成一次性的UI操作ID；指令应用与已处理结果存放于本局RunState，防止刷新时同一操作重新扣费。当前只持久化最近256个操作ID，世界终局/事件仍有其独立不可重复条件。

参考：[MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)、[MDN LockManager.request](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request)。Web Locks仅保证同一来源的浏览器标签页协调，不提供云存档。

## 2026-11-12 · CI恢复

仓库由 Private 改为 Public 后，重新执行的 [Actions #43193096251](https://github.com/anlew07/learn/actions/runs/43193096251) 完整通过了 `npm install`、`npm run lint`、`npm run format:check`、`npm test`、`npm run build`、`npm run balance:check`。此前“尚无正式构建测试”的段落是历史故障记录；**截至本次重新执行已得到正式构建通过证据**。仍须完成真实浏览器与手机测试。尚无锁文件，后续提交 `package-lock.json` 再改用 `npm ci`。

## Chromium 自动浏览器测试与锁依赖

引入 [Playwright Test](https://playwright.dev/docs/intro)（当前锁定1.65.0），使用其 `webServer` 配置自动启动 Vite，Chromium 390×844移动视口验证新局、存档和多标签页写入锁。在公开仓库的Actions运行 [#43195674404](https://github.com/anlew07/learn/actions/runs/43195674404) 实际通过。报告和失败trace由原生Playwright/GitHub Actions生成，不自研浏览器自动化。

npm依赖锁文件由GitHub托管Node 22环境执行 `npm install --package-lock-only` 生成，随后 `npm ci` 校验；常规验证工作流切换到 `npm ci`，后续更新依赖需要一起提交新的锁文件。

## 可公开试玩的HTTPS预览（部署准备完成，尚未启用）

`.github/workflows/deploy-preview.yml` 使用GitHub官方 `configure-pages@v5`、`upload-pages-artifact@v4`、`deploy-pages@v4`。工作流只消费`Validate H5`已成功的main提交，确保不绕过Vitest、ESLint、Vite、平衡检查及Playwright测试。CI自行构建可用的Vite静态产物并设置 `--base=/learn/`。

GitHub Pages默认未启用时官方action返回404；不能以`GITHUB_TOKEN`凭空创建Pages站点，也不应上传PAT到仓库。设置一次 `Settings → Pages → Source: GitHub Actions` 后自动部署。工作流检测到Pages未启用将保留说明并跳过发布，而非谎称页面可访问。正式URL必须在成功发布后核验。
