# Yours Client 的 Cordis 内核与扩展设计

记录日期：2026-10-24。状态：v0.2，已选择直接复用并维护 Cordis 本地分支。此前自研内核方案被本方案替代。

Cordis core 源码位于 `vendor/cordis/packages/core`，基于上游提交 `35fdc969e4b6c48c48ed44717c7a018324e4dd88`，包版本 `4.0.0-rc.12`。业务代码直接从 `cordis` 导入原生 API。当前引入不改动上游源码，后续可以直接修改本地分支并补充测试。来源、许可证及变更记录见[本地分支说明](../../vendor/cordis/README.md)。

## 职责边界

| 层 | 当前职责 | 状态 |
| --- | --- | --- |
| Cordis core | Context、服务隔离、依赖注入、Fiber 生命周期、effect 与事件分发 | 已引入上游实现 |
| Workspace 管理 | Root、Workspace、Session 的产品身份、隔离键、显式共享关系 | 待实现 |
| 业务注册服务 | Tools、Views、归属、暂存批次、提交修订与旧快照租约 | 待实现 |
| Runtime 与 Broker | 独立 Node 进程、RPC、身份、权限、取消与超时 | 待实现 |
| 产品服务 | Agent、模型、MCP、存储、Profile、UI 与安装发布 | 待实现 |

可修改 Cordis 不表示所有产品逻辑都放进 core。优先通过服务和运行适配层扩展；需要改变内核行为时，在本地分支中修改并验证。

## 原生 API

| 实际 API | 用法与完成语义 |
| --- | --- |
| `new Context()` | 创建一个 Cordis 根运行环境 |
| `ctx.extend(meta)` | 派生 Context；本身不创建独立插件资源寿命 |
| `ctx.isolate(name, label?)` | 对一个服务键创建或选择隔离 realm |
| `ctx.plugin(plugin, config)` | 挂载插件，返回可等待的 Fiber 句柄 |
| `ctx.inject(keys, setup)` | 仅在声明的服务依赖满足时运行功能块 |
| `ctx.provide(name, value)` | 提供服务并登记撤销责任 |
| `ctx.effect(acquire)` | 管理函数、Promise、generator 等形式的副作用与清理 |
| `ctx.on(event, handler)` | 注册受管监听器，返回取消注册入口 |
| `ctx.emit / parallel / serial` | 分别遵守上游同步、并行等待及串行分发契约 |
| `fiber.await()` | 等待当前生命周期任务稳定；仍可能处于 PENDING，不等于服务就绪 |
| `fiber.update(config)` | 更新配置并按框架规则刷新；可清除失败记录后重试 |
| `fiber.restart()` | 重新激活现有 Fiber；不能复用已 disposed 的 Fiber |
| `fiber.dispose()` | 释放该插件 Fiber；重新启用需由宿主重新挂载 |

原生对象插件使用 `{ name, inject, apply }`，不是旧草案的 `{ id, requires, activate }`。旧草案中的 `createScope`、`mount`、`ctx.use`、`onDispose`、`handle.start/stop` 不是 Cordis 自带 API；若以后需要产品 SDK，由宿主另行定义。

```ts
import { Context } from 'cordis'

const root = new Context()
const consumer = root.inject(['tools'], ctx => {
  // 已声明依赖后，通过 ctx.tools 使用服务。
  // 这里的 tools 是产品服务，不是 Cordis 内置服务。
})
const provider = await root.plugin({
  name: 'tools-provider',
  apply(ctx) {
    ctx.provide('tools', { /* 产品契约 */ })
  },
})
await consumer.await()
await provider.dispose()
await root.fiber.dispose()
```

## 身份与 Workspace

产品仍然区分 `packageId + version`、`instanceId`、`activationId` 和 `scopeId`。这些是宿主契约，不能直接把 `fiber.uid` 当成业务激活代次：一个 Fiber 可在依赖变化时重新运行，生命周期与稳定实例身份不同。

Cordis 的 `isolate()` 按服务键处理隔离，并不自动建立“当前 Scope → 父 Scope”的通用查找树。Workspace 管理需要列出要隔离的服务键、复用同一 Workspace 的 realm 标签，并明确哪些服务允许共享。`extend()` 也不等于创建 Workspace。

第一版可通过独立根 Context，或对明确服务键分配 realm 标签来实现 Workspace。具体策略需要在多 Workspace 服务矩阵中验证；不把旧方案的父级回退行为当成 Cordis 已有保证。

## 生命周期与回收

沿用原生状态 `PENDING / LOADING / ACTIVE / FAILED / DISPOSED / UNLOADING`。产品显示的 waiting、stopped、draining 是宿主状态映射，不是新写一套 Cordis 状态机。

- 服务依赖变化、实例刷新和内部 epoch 由 Cordis 处理。
- 产品停用先保存 `enabled=false` 再释放 Fiber；重新启用重新挂载，保留产品 instanceId。
- 子进程的连接身份与 activationId 由 Runtime 管理，旧连接不能重新注册新代次能力。
- Cordis 协调依赖消费者与提供者的释放；插件必须登记自己的连接、订阅和任务。
- 外层多个 disposer 可以并行；单个复合 effect 内部逆序回收。不要承诺“所有资源全局串行 LIFO”。
- 不承诺任意单个复合 effect 内的失败都自动继续所有清理；对必须全部执行的清理应使用独立受管 effect 或显式错误汇总，并补回归测试。
- 同进程取消需要协作，不能靠 Promise 超时抢占同步代码。Node 进程强制终止由 Supervisor 执行。

30 秒激活、5 秒清理是运行适配层的候选默认期限，不是上游 Cordis 已启用的行为。

## 事件契约

`emit()` 是同步分发；同步异常可能中断后续监听，异步返回值不由 emit 等待。`parallel()` 等待本批监听完成，并在失败时抛出 AggregateError。`serial()` 等接口按上游契约使用。

如果 UI 通知需要“监听失败仅记录诊断”，提供单独的通知服务，在 `parallel()` 外捕获与记录错误。不要在保留原方法名的同时悄悄改变 Cordis 语义。跨进程权限校验仍走 Broker，业务请求走显式服务。

## 注册发布与升级

Cordis 的服务与事件注册不自动组成跨 Tools / Views 的原子事务。产品注册服务需要实现：

1. 以宿主 activationId 归属业务注册；通过 Cordis effect 绑定释放责任。
2. 候选工具和视图先暂存，准备失败撤销暂存并释放资源。
3. 通过单一可见快照修订发布完整 Tools / Views 集合。
4. Agent Step 固定工具定义和执行目标，并持有旧版本租约。
5. 部署服务停止分配新的旧版本工作，排空后释放旧 Fiber 和进程。

首版预热只读共享业务状态，切换后再接管写任务；数据格式要求兼容。注册回退不撤销外部写入，数据迁移与任务写权限交接另行设计。

## 跨进程与持久化

Cordis Context 留在宿主进程。Runtime 将远程能力映射为本地服务代理，RPC 采用 JSON-RPC 2.0，取消、订阅与预算为产品扩展。身份来自已认证连接，函数通过 handlerId 引用，参数与结果需要可序列化。

宿主保存实例配置、启用状态、包版本和业务数据位置，启动时重新挂载；不序列化 Fiber、Promise、Context 或进程对象。未完成业务操作标记中断，按幂等性决定恢复方式。

## 当前工程入口

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm demo:cordis
```

根目录构建配置生成 Cordis 的 `lib`，上游源码与测试保持可追溯。原生测试验证核心机制，项目集成测试验证通过真实 `cordis` 包导入的行为。样例覆盖消费者先到达、提供者上线、提供者退出、消费者先收尾、服务恢复与最终释放。

后续顺序为 Workspace 管理 → Tools / Views 注册服务 → Runtime 与 Broker → Agent 和 Electron。完整的客户端验收见[产品需求](../product-requirements.md)。
