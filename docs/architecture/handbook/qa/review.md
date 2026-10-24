# 手册交付与视觉检查

检查日期：2026-10-24。手册版本：v0.2，直接采用可修改的 Cordis 本地分支。

## 主手册

- 产物：[implementation-handbook.html](../../implementation-handbook.html)
- SHA-256：`2301629ffb53d5457b88b57b21f961e1c61a0876a6b5b611340921e51a108dda`
- 大小：899483 bytes。
- 浏览器行为检查：126 项通过，0 个运行时异常；详见 [checks.json](checks.json)。
- 5 组场景、7 个分支、34 个预设步骤已检查；这些是手册交互检查，不是微内核运行测试。
- 10 个章节在 1440、1600、1920、760、390 像素宽度共 50 次检查中无页面横向溢出。长文纵向滚动属于正常行为。
- 深浅主题、手机目录、搜索与定位、决策状态、刷新恢复、验收清单、JSON 与 Markdown 下载、导入预览与合并已验证。
- 无效导入保持现有记录；含 HTML 的笔记按文本呈现。改变方案或证据会要求重新标记验证状态。
- 检查全程使用离线浏览器。嵌入图的可选在线字体被父页面 CSP 阻止，没有取得外部资源；图使用本地字体回退。外部源码链接需要联网。
- 架构图在主 HTML 中按字节原样嵌入，主手册可单独复制和打开。
- Cordis 原生 API、服务隔离、Fiber 状态、effect 清理和事件行为已按本地源码更新；产品注册事务、RPC 和升级协议明确标为待实现扩展。

源码另行通过 `pnpm test`：156 个上游测试与 2 个项目集成测试，共 158 个；`pnpm demo:cordis` 验证依赖等待、上线、消费者先清理、服务恢复和最终释放。这些结果与手册的浏览器检查分别记录，不把页面演练当作真实运行测试。

人工查看了首页深浅主题、1920 桌面、390 窄屏、核心机制、升级演练、决策表单、窄屏演练及嵌入架构图的截图。文字、卡片、连线、表单与操作区没有发现遮挡或裁切。视觉检查结论：**passed**。

截图中的 `QA：` 笔记来自独立临时浏览器，未写入交付 HTML 或用户浏览器。最终首页截图的记录数为 0。

| 画面 | 证据 |
| --- | --- |
| 首页浅色 / 深色 | [浅色](overview-light-1440.png)、[深色](overview-dark-1440.png) |
| 大桌面首页 | [1920 px](overview-light-1920.png) |
| 窄屏首页与演练 | [首页](overview-mobile-390.png)、[演练](scenario-mobile-390.png) |
| 核心机制 | [生命周期原理](mechanisms-light.png) |
| 升级时序 | [旧 Step 调用旧工具](upgrade-simulation.png) |
| 决策工作台 | [表单与状态](decision-workbench.png) |
| 嵌入架构图 | [图形预览](architecture-modal.png) |

## 独立架构图回执

```text
diagram_type: architecture
output: /Users/relu/Documents/yours-client/docs/architecture/diagrams/kernel-map.html
specification_sha256: a9c3bbdb04302d09b5fe17e37a436d2a60cbee8f666d59d0738b34dda3754208
artifact_sha256: a0e8f7b04ab8a7ed8fde7c81618e3e6bd80f9a6c0e15fe9b39a5e90cd2877358
validation: 9/9 showcase, 0 errors, 0 warnings
visual_review: passed
correction_rounds: 0
```

架构图通过 1440×900、1600×1000、1920×1080、2048×1320 的首屏容纳检查，并人工查看了最小和最大尺寸的深浅主题截图。本次将内核节点更新为 Cordis 本地分支，沿用已验收布局，无新增修正轮次；未修改受验收的生成 HTML。

机器回执中的 `visualReview: pending` 表示自动化工具不作人工视觉结论；本文件补充对同一哈希产物的人工检查。

- [交付回执](../../diagrams/kernel-map.delivery.json)
- [自动视觉检查](../../diagrams/kernel-map.visual-check.json)
- [四张图的对照页](../../diagrams/kernel-map.visual-check.html)
