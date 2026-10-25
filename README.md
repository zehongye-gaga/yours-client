# Yours Client

Yours Client 是一个以聊天为入口、可以组合 Agent 能力和持久运行应用的桌面客户端。项目已接入 Cordis 内核、6 个配套插件，以及从 DeepSeek Harness 提取的 9 个功能包和 5 个辅助库；支持本地修改、构建、测试和组合样例。Electron 界面与产品业务服务尚待实现。

## 已确认方向

- Electron 桌面端，首版在 macOS Apple Silicon 上打包和验收。
- 客户端直连 OpenAI 兼容的 Chat Completions 服务。
- 直接复用 Cordis core，源码放入仓库，后续可以按产品需要修改。
- 首版支持可信内置插件和本地导入，用 GitHub 工作台验证真实模型调用、Node 插件、动态 UI 和持久化。

## 项目文档

| 文档 | 用途 |
| --- | --- |
| [微内核实现手册 · HTML](docs/architecture/implementation-handbook.html) | 离线交互阅读、生命周期演练、实现问题与架构决策记录 |
| [产品需求](docs/product-requirements.md) | 产品目标、已确认范围、验收场景和后续阶段 |
| [微内核职责与需求映射](docs/architecture/microkernel-responsibilities.md) | Cordis 解决的问题、内核支撑的产品需求及各层分工 |
| [采用 Cordis 的决策](docs/architecture/decisions/0001-adopt-cordis.md) | 本地分支、上游来源和扩展边界 |
| [插件复用清单与接入说明](docs/architecture/plugin-reuse.md) | 已引入能力、目录、适配、验证方式，以及下一步需要实现的产品层 |
| [微内核设计](docs/architecture/microkernel-design.md) | 模块边界、核心模型、公开接口和生命周期基线 |
| [Cordis 参考与设计问题](docs/architecture/cordis-design-questions.md) | 实现前重点回答的问题、源码阅读路径和验证场景 |

下一步用已有 Storage / Scope 构建 Workspace，用 Subprocess 构建 Node App Supervisor，再实现工具与 View 的发布注册、RPC 和 Electron UI。

HTML 手册可以直接用浏览器打开，不需要启动服务。笔记保存在当前浏览器，支持 JSON 备份与导入、Markdown 导出；原始文档不会被自动修改。[手册维护与构建说明](docs/architecture/handbook/README.md)。

## 运行内核样例

需要 Node.js 22.19+（22.x）与 pnpm 10.30.1；原生进程依赖已在 macOS Apple Silicon 验证。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm demo:cordis
pnpm demo:reuse
```

[本地 Cordis 源码](vendor/cordis/packages/core/src)通过 workspace 作为 `cordis` 包使用。样例演示依赖等待、服务上线、消费者先清理、服务恢复及最终释放，无需配置模型。上游提交、MIT 许可证与后续修改方法见 [Cordis 本地分支说明](vendor/cordis/README.md)。

`demo:reuse` 使用编译后的包，经真实 Loader / Group 组合 Storage、Domain、Timer 和 Subprocess，再接 Scope、Store、SlotCore。它验证子进程输出持久化、Store 更新、作用域隔离、注册卸载、进程停止和重启恢复；JSON 与 SQLite 分别执行，临时数据自动清理。它是无界面的接入样例，尚未接入真实 GitHub 或模型。

Harness 提取包保留原包名，源码和中文说明位于 [vendor/deepseek-harness](vendor/deepseek-harness/README.md)。`pnpm build` 生成所有包的 ESM 与类型声明；`pnpm test` 检查来源记录、构建、Slot 类型契约和行为测试。产物 `lib/` 不入库。
