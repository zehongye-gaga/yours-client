# 第一批插件复用与接入

记录日期：2026-10-25。目标是把通用实现接入 Yours Client，形成可修改、可构建、可验证的基础，而不是把整个 Harness 作为产品宿主。

本次接入 **9 个 Harness 功能包 + 6 个 Cordis 配套插件**，并补齐 **5 个辅助库**。连同已有的 Cordis core，共 21 个本地 workspace 包。功能包中包含纯库，数量不代表产品启动时要激活 21 个插件。

## 9 个功能包如何使用

所有 Harness 源码均在 `vendor/deepseek-harness/packages/`，包名保留上游命名。

| 包名后缀 | 类型 | 已有能力 | 我们接下来要补的部分 |
| --- | --- | --- | --- |
| `dsh-storage` | Cordis 服务 | 后端注册、数据形式挂载、依赖就绪信号 | 数据目录与 Workspace 路由 |
| `dsh-storage-json` | 后端插件 | JSON KV、单文件/逐记录布局、原子文件替换 | 产品数据组织与迁移 |
| `dsh-storage-sqlite` | 后端插件 | SQLite KV、持久化与关闭 | 不直接提供会话事件日志或通用 SQL 查询层 |
| `dsh-storage-domain` | 领域插件 | Zod 校验、串行写入、提交后事件 | Workspace / 应用状态的具体 schema |
| `dsh-scope` | 作用域库 | 子作用域、贡献继承、事件筛选、释放 | 产品身份、权限与跨进程隔离 |
| `dsh-client-store` | 状态库 | 快照、订阅、Immer 更新、可选持久化 | UI 状态与业务事件连接 |
| `dsh-client-ui-slots` | UI 注册核心库 | single/list/keyed/chain、Factory、注册清理、类型契约 | 我们的 Slot 服务、React Renderer 与 iframe Bridge |
| `dsh-subprocess` | 进程接口 | 启动/取消/输出/control pipe 契约、环境处理 | 应用启动和 RPC 协议 |
| `dsh-subprocess-local` | 本地服务实现 | 普通进程与 PTY、输出上限、终止升级、宿主退出清理 | Supervisor、就绪协议、版本切换、重启策略与沙箱 |

JSON 与 SQLite 是可选择的存储后端，样例分别验证。Storage Domain 管理业务记录，Agent 会话日志仍需独立设计。

## 6 个配套插件

位于 `vendor/cordis/packages/`，与现有 core 取自同一上游提交。

| 包 | 用途 |
| --- | --- |
| `@cordisjs/plugin-loader` | 从配置装配插件、管理配置项与模块解析 |
| `@cordisjs/plugin-include` | JSON / YAML 配置文件、嵌套配置与持久更新 |
| `@cordisjs/plugin-group` | 配置中的插件分组 |
| `@cordisjs/plugin-timer` | 与插件生命周期绑定的定时任务 |
| `@cordisjs/plugin-hmr` | 开发阶段的文件监听与模块重载 |
| `@cordisjs/plugin-logger-console` | 控制台日志输出 |

HMR 是进程内开发能力。业务应用升级仍按需求实现：候选进程预热、Tools / Views 同次提交、旧请求租约与排空、失败保留旧版本。

## 依赖与版本决策

- Harness 固定于 `22ddee37…`，Cordis 固定于 `35fdc969…`。没有引入 Harness 的 Cordis fork，也没有两套 Context 身份。
- 引入 `http-proxy`、`lazy-require`、`timeout`、`win32-process` 作为进程相关运行时依赖；`launch-environment` 支撑环境契约测试。
- Harness 包的 Cordis / 配置校验导入已适配为当前工作区依赖；客户端包按本地 ESM 产物补齐依赖，不能直接照搬上游仅供打包的 devDependencies 关系。
- 配套插件采用与 core 配对的上游版本；版本号与 Harness 发布的 `@deepseek-ai/cordis-plugin-*` 不同。
- Node 要求为 22.19+ 的 22.x；原生依赖及运行路径首先验证 macOS Apple Silicon。

逐文件来源、原始哈希、本地修改与许可证在两个 vendor 目录的 `UPSTREAM.json` / `README.md` 中。

## 已建立的验证入口

| 命令 | 验证内容 |
| --- | --- |
| `pnpm check:vendor` | 来源基线、已记录的本地修改、未登记源码与测试 |
| `pnpm build` | 全部包的 TypeScript 检查、ESM / 类型声明输出、HMR YAML 资源 |
| `pnpm typecheck:contracts` | 消费编译后的 Slot 类型声明，验证正例与预期编译错误 |
| `pnpm test` | 上述检查及 Cordis / Harness 行为测试、编译产物组合测试 |
| `pnpm demo:reuse` | 无模型、无网络、无界面的完整组合样例 |

[组合样例](../../examples/reuse-foundation.mjs) 使用真实 Loader / Group 激活服务，运行一个输出模拟项目数据的 Node 子进程，将结果写入领域数据并更新 Store。它检查同级作用域不可见、卸载时 Slot / 贡献移除、定时器生命周期、进程终止和重启恢复。样例中的 Slot 仅验证注册表，尚无可见页面；GitHub 数据源尚未接入。

测试按上游条件跳过当前操作系统不适用的原生场景；通过 macOS 测试不等于 Windows / Linux 已验收。HMR 故障注入测试会输出预期错误日志。Node 22 的 SQLite 实验性提示保留。

本次验收：`pnpm test` 完成来源检查、21 包构建、Slot 类型契约检查，随后 **1,242 项测试通过、21 项按条件跳过**（78 个测试文件通过、4 个跳过）。编译产物组合样例已分别通过 JSON / SQLite 路径。

## 下一步的产品实现

1. **Workspace 与存储归属**：在 Storage Domain 上定义工作区和应用实例记录，确定 dataDir、凭证引用与恢复流程。
2. **工具 / View 注册服务与 Broker**：复用 Scope 管理贡献归属，实现暂存、原子提交、权限校验和版本租约。
3. **Node App Supervisor**：复用 Subprocess 执行和清理，补 Manifest、RPC、ready/health、更新与故障恢复。
4. **Electron 工作台**：复用 Store / SlotCore，实现 React 宿主、受控 iframe Bridge，再接真实模型与 GitHub 示例。

这些包已经提供基础实现；Agent Runtime、Session、Profile Resolver、OS 隔离和业务发布协议仍属于我们的产品层。
