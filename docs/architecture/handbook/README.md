# 微内核实现手册

[打开独立 HTML](../implementation-handbook.html)。直接用浏览器打开，无需服务器或安装依赖。

内容围绕实现时的疑问组织：职责映射、六个机制、五组时序演练、跨进程协议、热升级与数据、十二项决策、十六项验收、二十八个问题和固定版本的 Cordis 源码阅读路径。

## 使用与数据

- 已确认直接复用并允许修改 Cordis 本地分支。原生 API 与已引入源码对应；产品注册、RPC 等扩展示例仍需实现。
- 生命周期演练使用预设快照，不会运行插件或证明真实内核正确。
- 决策笔记与验收勾选保存在浏览器 localStorage。存储键为 `yours.microkernel.handbook.v1`，不会修改仓库文档或发送到服务端。
- “已验证”需要选择方案并填写证据，是作者的记录，不是自动测试结论。改变方案或证据后需要重新标记。
- JSON 备份可恢复记录；导入先显示合并预览，同编号决策使用导入值，其他记录保留，验收勾选取并集，主题不变。输入无效时不修改现有记录。
- Markdown 导出用于整理 ADR。移动 HTML、更换浏览器或清理浏览器数据前，请备份 JSON。
- 本地存储不可用时可在内存中继续填写并导出。主手册不依赖网络；外部源码链接需联网。

## 维护

| 文件 | 内容 |
| --- | --- |
| `content.mjs` | 章节资料、机制、决策、验收和来源 |
| `scenarios.mjs` | 五组演练的各分支快照与问题索引 |
| `template.html` / `styles.css` | 页面结构与响应式主题 |
| `app.js` | 导航、演练、搜索、记录与导入导出 |
| `build.mjs` | 将内容、样式、脚本和已验收架构图装配为单文件 |
| `verify.mjs` | 使用独立 Chrome 临时配置检查页面行为并截图 |
| `qa/checks.json` | 最近一次浏览器检查结果；绑定 HTML 哈希 |
| `qa/review.md` | 人工视觉检查与架构图交付回执 |

在仓库根目录执行：

```sh
node docs/architecture/handbook/build.mjs
node docs/architecture/handbook/verify.mjs
```

检查脚本默认使用 macOS 的 Google Chrome。其他安装位置可通过 `CHROME_PATH` 指定。脚本只操作临时浏览器配置并在结束后清理，不读取个人浏览器数据。截图和检查记录写入本目录的 `qa/`。

架构图的规范位于 `../diagrams/kernel-map.architecture.json`，HTML 经 archify 校验与交付。主手册原样嵌入该 HTML；不手工修改图的产物。父页面的内容策略阻止图中的可选在线字体，使用本地字体回退。图的单独 HTML 保留生成器原始行为。

Cordis 参考固定到提交 `35fdc969e4b6c48c48ed44717c7a018324e4dd88`。本地分支允许修改；修改后按本地源码和测试更新说明，不把产品的原子发布、RPC 或进程管理设计当成 Cordis 自带保证。
