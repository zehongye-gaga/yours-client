# 直接采用并维护 Cordis 本地分支

日期：2026-10-24。状态：已确认。

## 决策

Yours Client 不从零实现微内核，直接引入 Cordis core 源码作为项目可维护的本地分支。先原样搬入，后续允许按产品需要修改内核；保留 MIT 许可证、上游来源和本地变更记录。

初始基线为 `cordis@4.0.0-rc.12`，提交 `35fdc969e4b6c48c48ed44717c7a018324e4dd88`。源码、测试和许可证保存在 `vendor/cordis`，由 pnpm workspace 解析为 `cordis` 包。

## 原因与影响

直接复用已有的 Context、服务依赖、Fiber、effect 和事件实现，保留上游对异步生命周期和回收行为的验证。研发集中到产品的 Workspace、Agent、Node Runtime、RPC、注册发布与 UI。

原生行为按 Cordis 源码执行。旧草案的统一 Scope 查找树、onDispose、start/stop、跨注册表事务和统一并行通知，不再被描述为已有内核 API。这些产品契约需重新映射或在外层实现；确需改 core 时可以在本地分支修改。

## 维护

当前导入无上游源码修改。`UPSTREAM.json` 保留原始文件哈希，`sourceModifications` 记录后续修改目的和当前哈希。先完成回归测试再合并上游更新；上游版本号不代表本地修改已被上游接受。

不在这次引入中同时实现 Electron、模型调用、MCP、业务注册事务或独立进程运行环境。它们继续作为后续产品工作。
