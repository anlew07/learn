# 同时穿越：末日模拟器

> **已进入 H5 可运行原型开发阶段 · V0.2 alpha**  
> 多世界并行、分身自主行动、跨世界记忆与力量援助、幸存者式自动战潮实验。

同一个灵魂，同时穿越多个末日世界。分身会自主成长、清剿、探索与拯救；玩家负责战略偏好、关键事件和有限的跨世界援助。

## 快速运行

需要 Node.js 22.12+、npm，以及网络连接用于安装依赖。

~~~bash
npm ci
npm run dev
~~~

在终端提供的地址打开网页。开发服务器可供同一局域网中的手机通过计算机局域网IP访问。

~~~bash
npm run lint           # ESLint 静态检查
npm run format:check   # 新增工具模块格式规范检查
npm test               # Vitest 核心规则测试
npm run build          # Vite 打包到 dist/
npm run balance:check  # 固定种子、各策略数值回归
npx playwright install chromium  # 首次安装浏览器依赖
npm run test:e2e      # Chromium 竖屏浏览器体验测试
npm run preview        # 预览生产打包
~~~

**GitHub Actions 已在公开仓库成功完成真实依赖安装、ESLint、Prettier、Vitest、Vite build 与数值检查**（[通过的运行记录](https://github.com/anlew07/learn/actions/runs/43193096251)，2026-11-12）。仍然需要手机浏览器与多标签页真机验收。

## 第一份原型已经包含什么？

| 系统 | 初步实现 |
| --- | --- |
| 并行世界 | 第一局灵灾+尸潮；第三局加入兽潮 |
| 全局日历 | 1×20秒/日，2×10秒/日，4×5秒/日，暂停/恢复 |
| 每日自主行动 | 成长、采集、清剿、探索、拯救与策略倾向，世界卡展示自主判断依据 |
| 末日变化 | 自然恶化、持续巢穴/尸群；重大事件预览成功率、费用、自动结局与可用条件 |
| 成长与终局 | 四阶段成长，P100后检查资源、等级与最终条件 |
| 灵魂机制 | 重大记忆、P/D援助、二人/三人之力、世界回响 |
| 专属规则 | 灵灾闭关、尸潮一次防线大修、兽潮两次压制 |
| 战潮实验 | 可开关三波战报；局内战技三选一、组合进化和实际额外收益可视化 |
| 存档 | idb-keyval / IndexedDB；本局与永久进度原子批量保存，重开默认暂停 |
| 自动测试 | 引擎关键规则、通关路径、随机可复现测试 |

**现阶段不算正式试玩：** 战潮技能已初步提供有限的清剿经验、资源和减损修正，但尚待真实平衡；世界成长、灾难、AP数值属于待调整的实验值；美术/音效、完整内容表、无障碍和移动端兼容还需继续做。

## 主要目录

| 路径 | 用途 |
| --- | --- |
| [index.html](index.html) | H5 页面入口 |
| [src/engine.js](src/engine.js) | 可复现的模拟核心 |
| [src/systems/action-policy.js](src/systems/action-policy.js) | 可解释自主决策，不依赖UI/存档 |
| [src/systems/wave-combat.js](src/systems/wave-combat.js) | 战潮数值封顶及三波文本模板 |
| [src/systems/event-contract.js](src/systems/event-contract.js) | 重大事件预览、合法选项和支付前校验 |
| [src/ui.js](src/ui.js) / [src/style.css](src/style.css) | 竖屏交互和样式 |
| [src/services/persistence.js](src/services/persistence.js) | 独立持久化服务，原子批量写入与队列 |
| [tests/engine.test.js](tests/engine.test.js) | 核心规则测试 |
| [docs/09-player-journey.md](docs/09-player-journey.md) | 完整局流程与玩法操作预算 |
| [docs/10-tech-stack.md](docs/10-tech-stack.md) | 使用 Vite/Vitest/idb-keyval/seedrandom 的理由 |
| [docs/08-decisions.md](docs/08-decisions.md) | 架构决策和实验状态 |
| [content/README.md](content/README.md) | 三世界与联动内容包 |
| [ROADMAP.md](ROADMAP.md) / [tasks/BACKLOG.md](tasks/BACKLOG.md) | 优先级与待办 |

## 版本原则

游戏设计**核心基线V1**保留；代码原型 **V0.2 alpha** 不是定稿。玩法规则优先在 docs 中记录，内容模板继续向数据化迁移。早期测试允许明显提示后重置旧存档，不承诺旧测试档兼容。

当前版本不需要服务器或账号、没有离线挂机；数据保存在浏览器本地。不要在仓库中上传私密存档、账号信息或密钥。

**当前状态：** Chromium 手机视口下的 3 个浏览器流程已在 CI 通过，包含开局/恢复、标签页接管和灵魂援助存档；`package-lock.json` 已提交、CI 使用 `npm ci`。下一步仍需 Android/iOS 真机 HTTPS 测试，并继续优化自动策略与战潮体验。

## 多标签页安全保护（V0.2）

为避免两个窗口同时推进同一局，游戏使用浏览器的 Web Locks API 锁定当前存档。**一次只能有一个活动写入标签页**，其他标签页只读，关闭原标签页后点击“重新取得控制权”即可重读最新存档后继续。每次玩家指令有唯一操作ID，同一操作重复提交时不会再次扣费或发奖。

Web Locks 需要**安全上下文**：正式部署应使用 HTTPS，本机 `localhost` 开发正常；手机直接访问电脑局域网IP的普通 `http://` 地址可能因无法使用Web Locks而只读。真机测试请配置可信的HTTPS域名或安全隧道，不建议关闭安全检查。以上是浏览器功能限制，不是需要自研同步服务的理由。

这些功能已通过独立模拟测试，**尚需真实多标签页和手机浏览器验证**。没有支持 Web Locks 的环境默认只读，不会冒险双写。
