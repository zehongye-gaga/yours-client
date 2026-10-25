# Harness 功能包的本地提取分支

来源：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness/tree/22ddee3792402c3e70ec5f86a63c3e3e895a2f60)，固定提交 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，包版本 `0.2.1-rc.3`，2026-10-25 引入。这里只保留选中的包和必要辅助库，共 240 个来源文件；没有引入完整 Harness。

## 范围

| 组 | 本地目录 |
| --- | --- |
| 存储 4 包 | `packages/storage/{storage,storage-json,storage-sqlite,storage-domain}` |
| 作用域库 | `packages/core/scope` |
| 客户端基础库 2 包 | `packages/client/{store,ui-slots}` |
| 进程服务 2 包 | `packages/subprocess/{subprocess,subprocess-local}` |
| 辅助库 5 包 | `packages/util/{http-proxy,launch-environment,lazy-require,timeout}`、`packages/subprocess/win32-process` |

每包保留源码、测试、说明、必要脚本和 MIT 许可证。原包名保留为 `@deepseek-ai/dsh-*`，均标为 `private`，通过 pnpm workspace 链接。包内 README 是上游资料；其中未引入的相对文档链接请在上述固定提交中阅读。产品接入边界见 [复用说明](../../docs/architecture/plugin-reuse.md)。

## 本地适配

完整的逐文件记录在 [UPSTREAM.json](UPSTREAM.json) 的 `sourceModifications`，原始 `files` 哈希不改写。

1. 源码、测试和 manifest 中的 `@deepseek-ai/cordis` 改为本地 `cordis`。配置校验使用标准 `schemastery`；没有引入 Harness 的 core、Schemastery 或 Cosmokit 分支。
2. 改为本地非打包 ESM 产物：运行时代码与 `.d.ts` 同置 `lib/`，`./runner` 指向 `lib/bin.js`。补齐 Store 的 Immer / Zustand 安装依赖，以及 Slot 声明所需的 Store / React 关系。源码行为不因原来的前端打包约定而缺依赖。
3. 各包 tsconfig 供编辑器和源码测试使用；实际输出由项目根目录统一构建。上游 `tsdown.config.ts` 保留作参考，本项目不执行它们。
4. `subprocess-local/src/spawn-runner.ts` 的两处 `Process.disconnect` 调用使用可选调用，适配当前 Node 类型声明中的可选方法。
5. `subprocess-local/tests/process-exit.spec.ts` 直接通过 `tsx/esm` 启动原测试 fixture，替代依赖完整 Agent / Session 的 `loader-smoke`。未删减原来的进程退出场景。

`launch-environment` 目前主要由子进程环境契约测试使用；其余 4 个辅助库在运行时依赖闭包内。辅助库不等于额外的产品插件。

## 构建与验证

在项目根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test:reuse
pnpm typecheck:contracts
pnpm demo:reuse
```

Node 最低版本提升至 22.19（当前限定 22.x），满足固定的 `undici@8.11.2`。`node-pty` 与 `koffi` 的原生安装脚本已纳入 pnpm 允许列表；保留上游修复 `spawn-helper` 可执行位的 postinstall。首轮验收平台是 macOS Apple Silicon，Windows / Linux 原生分支仍需对应平台验收。

Scope 与 SlotCore 是库，需由宿主服务绑定生命周期；SlotCore 不包含实际 React Renderer。Subprocess 是进程执行基础，尚不是 Mini App Supervisor 或 OS 沙箱。

## 后续修改与上游同步

可以直接修改本目录源码。每个变更都在 `sourceModifications` 记录路径、修改后 SHA-256 和原因；新增文件采用同样格式，删除使用 `sha256: null`。`pnpm check:vendor` 会发现未记录的变化与新增源码/测试。不要把当前内容直接重设为新的上游基线。

同步时比较固定提交与目标提交，合并本地适配，重新检查依赖闭包并跑相关测试。分发时保留 [LICENSE](LICENSE) 和每包许可证。
