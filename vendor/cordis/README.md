# Yours Client 的 Cordis 本地分支

这份源码是 Yours Client 使用的微内核。当前原样引入 Cordis `4.0.0-rc.12` 的 `packages/core`，基于提交 [`35fdc969e4b6c48c48ed44717c7a018324e4dd88`](https://github.com/cordiverse/cordis/tree/35fdc969e4b6c48c48ed44717c7a018324e4dd88)，后续可以直接修改本目录源码。

当前引入 9 个源码文件、17 个测试及测试辅助 TypeScript 文件，连同包描述、README、配置和 MIT 许可证共 36 个上游文件。`UPSTREAM.json` 保留原始来源和文件哈希；当前没有上游源码修改。loader、hmr、include 等其他包尚未引入。

## 使用

根目录通过 pnpm workspace 把 `cordis` 解析到 `packages/core`。执行 `pnpm build:cordis` 会生成 `packages/core/lib`，业务代码直接 `import { Context } from 'cordis'`，不是从 npm 下载另一个同名内核。

构建由项目根目录的 `tsconfig.cordis.json` 管理，保留上游的核心类型检查选项，并把源码中的 `.ts` 相对导入转换为产物中的 `.js`。上游自己的配置只作为原始资料保留；本项目不使用上游的 Yarn / Yakumo 构建系统。

`bin.js` 也按原样保留，但其配套 loader/include 不在当前范围中；现在的入口是 Context API 和根目录示例，不是 Cordis CLI。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm demo:cordis
```

## 后续修改

可以直接改 `packages/core/src`，并在 `packages/core/tests` 或项目 `tests/` 中补充对应的回归测试。产品的 RPC、Workspace 管理、工具/UI 注册服务先放在外层；需要改变内核语义时，可以修改本地 Cordis。

原始 `files` 哈希保持不变。在 `UPSTREAM.json` 的 `sourceModifications` 数组记录本地修改，格式为 `{ "path": "packages/core/src/xxx.ts", "sha256": "修改后文件哈希", "reason": "变更目的" }`；新增文件使用同样格式，删除文件将 `sha256` 设为 `null`。`pnpm check:vendor` 检查的是已记录的基线与本地变更，不禁止维护分支。

同步上游时先比较固定提交与目标提交，再合并本地变更，更新来源记录，并运行完整测试。不要仅替换版本号。MIT 的版权和许可文本保留在 [LICENSE](LICENSE) 和包目录内，后续分发也需包含。
