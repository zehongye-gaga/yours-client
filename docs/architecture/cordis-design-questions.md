# 采用 Cordis 后的实现问题

记录日期：2026-10-24。直接复用并维护 Cordis 本地分支，已替代此前自研内核方向。核心原生行为先读源码和测试；产品需要的新语义通过外层服务或明确的本地修改实现。

## 优先回答的六个问题

### Q1 哪些已有能力直接复用

Context、服务依赖、Fiber、effect 和事件分发使用 Cordis。工具、UI、RPC、权限、Workspace 和持久化由产品定义。首次引入不改动 core，之后允许修改。

需要回答：业务注册服务如何绑定 Cordis 的资源所有权？哪些需求确实需要修改 core？每项本地改动用什么测试说明理由？

### Q2 产品实例怎样映射到 Fiber

包、instanceId、activationId、scopeId 和进程身份继续分开建模。Fiber 是进程内运行句柄，不替代持久化的产品实例记录，也不作为远程身份凭证。

需要回答：多实例的唯一范围是什么？停用后重新挂载如何保留 instanceId？依赖变化时怎样发放产品 activationId？配置变更、停止与删除数据分别由谁处理？

### Q3 Workspace 如何使用 isolate

`ctx.isolate(name, label)` 作用于一个服务键；`ctx.extend()` 只派生上下文。Cordis 不直接提供旧草案的通用父级回退树。

需要回答：采用每 Workspace 独立 Context，还是共享根加服务键 realm？哪些键隔离、哪些键共享？跨 Workspace 调用是否必须显式代理？如何防止漏隔离一个新服务？

完成标准：用服务矩阵验证可见性，权限由 Broker 单独检查。

### Q4 如何定义服务与应用就绪

`fiber.await()` 等待当前生命周期任务稳定；缺失依赖的 Fiber 可能仍是 PENDING。不要把可 await 的句柄直接理解为业务服务健康。

需要回答：Node 监听、远程握手、Tools / Views 暂存完成后，哪个宿主服务宣布应用 ready？声明依赖环与缺失包如何在 Manifest 层诊断？这些检查不假定由 Cordis 自动完成。

### Q5 产品启停命令如何使用原生生命周期

沿用 `plugin / inject / update / restart / dispose`。已释放 Fiber 不再启动；产品重新启用时重新挂载。

需要回答：同时启停时宿主收敛到哪个 enabled 状态？哪一个 Promise 表示请求受理、哪一个表示清理结束？失败如何通过 update 或重新挂载重试？旧进程消息如何被拒绝？

### Q6 资源登记与清理的顺序是什么

使用原生 effect、generator 和返回 disposer 的协议。外层 disposer 可以并行，复合 effect 内部有逆序语义；依赖消费者应先完成必要收尾。

需要回答：部分初始化时如何及时 yield 已获得资源的 disposer？哪些清理必须串行？单项清理失败后哪些操作仍要执行？取消后迟到的连接怎样释放？清理超时由谁终止进程？

## 产品扩展的六个问题

### Q7 Tools 与 Views 如何一起发布

由产品注册服务实现 staging、commit、revision 和撤销。Cordis 提供清理归属，不提供跨业务注册表事务。

验证：第二项准备失败时，第一项也不可见；普通读者只看到完整旧或新修订。注册回退不冒充数据库或远程 API 回滚。

### Q8 何时使用 emit 或 parallel

`emit` 同步分发，不等待异步返回；`parallel` 等待并汇总异常后抛错。需要仅记录通知错误时，在独立通知服务中包裹，不改写同名原生方法的含义。

验证：同步异常、异步异常、慢监听和卸载都具有明确行为；权限不依赖监听顺序。

### Q9 远程进程如何接入

Context 不整体传给子进程。宿主运行 Cordis 服务代理，远程协议只传可序列化请求、结果和 handlerId。

验证：连接绑定身份、每次授权、取消请求归属、超时与断线释放；拒绝插件伪造的身份字段。

### Q10 旧 Step 与旧进程何时可以释放

旧工具定义和执行目标一起固定。尚在等待模型返回的 Step 也可能持有旧版本，不能只统计当前执行的 RPC。

需要决定排空期限、到期取消与失败报告。业务写入交接独立于注册路由切换。

### Q11 如何保存与恢复

保存配置、启用状态、包版本及业务事实，重启重新挂载。未完成调用标记中断；是否自动重试取决于幂等性和副作用。

关闭窗口是否继续后台运行，是单独的产品策略；退出应用时明确关闭或移交 Runtime。

### Q12 如何维护本地 Cordis

原始上游提交与哈希保存在 `vendor/cordis/UPSTREAM.json`。可以修改源码，记录原因与本地哈希，增加回归用例，再运行上游与项目测试。

需要回答：何时同步上游修复？哪些 API 变化会影响插件 SDK？诊断怎样关联产品 instanceId、activationId 与当前 Fiber 状态？

## 源码阅读路径

| 入口 | 阅读重点 |
| --- | --- |
| [context.ts](../../vendor/cordis/packages/core/src/context.ts) / [isolate.spec.ts](../../vendor/cordis/packages/core/tests/isolate.spec.ts) | Context 派生、按服务键隔离、绑定视图 |
| [registry.ts](../../vendor/cordis/packages/core/src/registry.ts) | plugin、inject 和 Fiber 的组织 |
| [fiber.ts](../../vendor/cordis/packages/core/src/fiber.ts) | epoch、_refresh、_reload、_unload、effect 与状态 |
| [reflect.ts](../../vendor/cordis/packages/core/src/reflect.ts) / [service.ts](../../vendor/cordis/packages/core/src/service.ts) | 服务提供、通知和消费者依赖 |
| [events.ts](../../vendor/cordis/packages/core/src/events.ts) | emit、parallel、serial、bail、waterfall 的不同语义 |
| [dispose.spec.ts](../../vendor/cordis/packages/core/tests/dispose.spec.ts) / [service-dispose.spec.ts](../../vendor/cordis/packages/core/tests/service-dispose.spec.ts) | 失败、取消和依赖释放案例 |

上游基线固定为 [35fdc969](https://github.com/cordiverse/cordis/tree/35fdc969e4b6c48c48ed44717c7a018324e4dd88)。[上游包 README](../../vendor/cordis/packages/core/README.md)说明 API 尚未稳定。升级或修改后，以本地源码和通过的测试为准。

## 第一批行为案例

1. 消费者先于提供者挂载；提供者下线、恢复后消费者怎样变化。
2. 异步获取资源期间停用；迟到资源怎样释放。
3. 工具准备成功、UI 准备失败；产品注册服务怎样避免部分可见。
4. 消费者清理仍需使用提供者；提供者不能提前销毁。
5. 旧 Step 持有快照时发布新版本；调用、UI 和数据写入分别归属谁。

案例 1、2、4 优先对照 Cordis 实际测试；案例 3、5 是待实现的注册与部署服务契约。
