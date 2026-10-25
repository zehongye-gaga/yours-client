# Yours Client 的 Cordis 本地分支

这份源码是 Yours Client 使用的微内核与配套插件。基于提交 [`35fdc969e4b6c48c48ed44717c7a018324e4dd88`](https://github.com/cordiverse/cordis/tree/35fdc969e4b6c48c48ed44717c7a018324e4dd88)，后续可以直接修改本目录源码。

当前包含 `core@4.0.0-rc.12`、`loader@1.0.0-rc.9`、`include@1.2.0`、`group@1.0.0`、`timer@1.1.4`、`hmr@1.1.2` 和 `logger-console@1.0.0`，共 141 个来源文件（含逐包许可证）。`UPSTREAM.json` 保留原始文件哈希与本地变更。核心仍是原来的 9 个源码文件；本次没有修改核心源码。

配套插件选择与 core 相同的上游快照。Harness 的配套插件属于另一条分支，未混入这套内核。本地仅调整 HMR 测试的 Loader `baseUrl`，让独立工作区中的根配置项具有明确解析位置；运行时源码保持上游内容。

## 使用

根目录通过 pnpm workspace 把 `cordis` 解析到 `packages/core`。执行 `pnpm build:cordis` 会生成 `packages/core/lib`，业务代码直接 `import { Context } from 'cordis'`，不是从 npm 下载另一个同名内核。

`pnpm build` 通过根目录 `tsconfig.vendor.json` 和 `scripts/build-vendor.mjs` 构建全部复用包。它转换 `.ts` 相对导入、保留 JavaScript 可访问的枚举，并用 esbuild 将 HMR 的 YAML 语言资源内联；依赖保持外部包引用，所有消费者共享同一个 `cordis`。`tsconfig.cordis.json` 仍可用于单独构建 core。上游自己的配置保留作参考；本项目不使用 Yarn / Yakumo 构建系统。

`bin.js` 按原样保留；本次接入使用 Context / Loader API 和根目录示例，产品启动入口随后实现。开发时的 ESM HMR 需要 Node 模块加载器内部接口，测试通过 `--expose-internals` 启用；它不承担业务插件的进程级原子升级。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm demo:cordis
pnpm demo:reuse
```

## 后续修改

可以直接改 `packages/core/src`，并在 `packages/core/tests` 或项目 `tests/` 中补充对应的回归测试。产品的 RPC、Workspace 管理、工具/UI 注册服务先放在外层；需要改变内核语义时，可以修改本地 Cordis。

原始 `files` 哈希保持不变。在 `UPSTREAM.json` 的 `sourceModifications` 数组记录本地修改，格式为 `{ "path": "packages/core/src/xxx.ts", "sha256": "修改后文件哈希", "reason": "变更目的" }`；新增文件使用同样格式，删除文件将 `sha256` 设为 `null`。`pnpm check:vendor` 检查的是已记录的基线与本地变更，不禁止维护分支。

同步上游时先比较固定提交与目标提交，再合并本地变更，更新来源记录，并运行完整测试。不要仅替换版本号。MIT 的版权和许可文本保留在 [LICENSE](LICENSE) 和包目录内，后续分发也需包含。
