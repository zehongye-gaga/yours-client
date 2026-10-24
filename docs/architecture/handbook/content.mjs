export const content = {
  "meta": {
    "title": "Yours Client 微内核实现手册",
    "version": "0.2",
    "date": "2026-10-24",
    "commit": "35fdc969e4b6c48c48ed44717c7a018324e4dd88"
  },
  "chapters": [
    {
      "id": "overview",
      "number": "00",
      "title": "从哪里开始",
      "subtitle": "目标、约束与阅读路径"
    },
    {
      "id": "boundaries",
      "number": "01",
      "title": "职责与架构",
      "subtitle": "谁负责什么，能力在哪里运行"
    },
    {
      "id": "mechanisms",
      "number": "02",
      "title": "内核机制与扩展",
      "subtitle": "Cordis 原生行为与产品扩展边界"
    },
    {
      "id": "scenarios",
      "number": "03",
      "title": "生命周期演练",
      "subtitle": "逐步检查成功、取消与失败"
    },
    {
      "id": "interfaces",
      "number": "04",
      "title": "接口与进程",
      "subtitle": "Context、RPC 与权限边界"
    },
    {
      "id": "upgrade",
      "number": "05",
      "title": "热升级与数据",
      "subtitle": "注册切换、旧调用与持久化"
    },
    {
      "id": "decisions",
      "number": "06",
      "title": "决策工作台",
      "subtitle": "选择方案，记录理由与证据"
    },
    {
      "id": "roadmap",
      "number": "07",
      "title": "实施与验收",
      "subtitle": "小步交付，用行为证明正确性"
    },
    {
      "id": "questions",
      "number": "08",
      "title": "实现问题索引",
      "subtitle": "按当前卡住的问题寻找答案"
    },
    {
      "id": "sources",
      "number": "09",
      "title": "源码与术语",
      "subtitle": "固定版本的阅读路径与概念表"
    }
  ],
  "confirmed": [
    [
      "客户端",
      "Electron · macOS Apple Silicon 首发"
    ],
    [
      "模型接入",
      "客户端直连 OpenAI 兼容接口"
    ],
    [
      "插件来源",
      "可信内置插件 + 本地导入"
    ],
    [
      "内核方向",
      "直接复用 Cordis · 可修改本地分支"
    ],
    [
      "首个验收",
      "GitHub 动态工作台"
    ],
    [
      "当前阶段",
      "源码、构建、测试与生命周期样例已接通"
    ]
  ],
  "paths": [
    {
      "title": "先理解系统",
      "text": "看职责边界，再区分包、实例、激活和进程。",
      "target": "boundaries",
      "action": "建立共同语言",
      "number": "01"
    },
    {
      "title": "准备接入 Cordis",
      "text": "先理解原生 API 和测试，再落实产品的服务与运行边界。",
      "target": "mechanisms",
      "action": "理解内核与扩展",
      "number": "02"
    },
    {
      "title": "正在做取舍",
      "text": "比较方案，写下理由和能推翻当前选择的证据。",
      "target": "decisions",
      "action": "记录架构决策",
      "number": "03"
    }
  ],
  "responsibilities": [
    {
      "need": "启用新插件",
      "kernel": "Fiber、服务依赖与原生注册",
      "outside": "Installer 准备代码；Runtime 加载入口",
      "proof": "先装消费者、后装提供者，也能按依赖启动。"
    },
    {
      "need": "停止或卸载",
      "kernel": "释放 Fiber、受管资源与消费者依赖",
      "outside": "Supervisor 终止进程；安装层决定数据保留",
      "proof": "停止后不再接受新调用，受管监听和任务被释放。"
    },
    {
      "need": "工作台个性化",
      "kernel": "Context 派生与按服务键 isolate",
      "outside": "Workspace 映射范围；Profile 选择启用；Policy 授权",
      "proof": "两个 Workspace 可以解析到不同的服务实现。"
    },
    {
      "need": "动态工具与 UI",
      "kernel": "用 effect 绑定业务资源清理",
      "outside": "Tools / Views 实现暂存、提交、修订；Renderer 展示",
      "proof": "激活结束才发布完整注册，停止时撤销入口。"
    },
    {
      "need": "业务插件升级",
      "kernel": "管理新旧 Fiber 与受管资源",
      "outside": "注册服务提交修订；部署预热；Broker 保留租约；Runtime 排空",
      "proof": "一次 Agent Step 的工具定义与执行目标保持一致。"
    },
    {
      "need": "故障恢复与诊断",
      "kernel": "失败状态、依赖原因、清理结果",
      "outside": "宿主监控进程；策略决定重试；Storage 恢复数据",
      "proof": "能解释为何没启动、为何停止，以及还有哪些资源未释放。"
    }
  ],
  "layers": [
    {
      "label": "Cordis 本地分支",
      "tag": "已引入",
      "text": "沿用已有机制，后续可以按需要修改源码。",
      "items": [
        "Context / isolate / 服务",
        "plugin / inject / Fiber",
        "effect / Events / Logger"
      ]
    },
    {
      "label": "领域服务",
      "tag": "语义",
      "text": "定义 Agent、工具、存储和界面的具体行为。",
      "items": [
        "Agent / Model Provider",
        "Tools / Views / Storage",
        "Policy / Profile Resolver"
      ]
    },
    {
      "label": "宿主与运行环境",
      "tag": "执行",
      "text": "提供进程、系统访问、持久化及隔离。",
      "items": [
        "Electron / Supervisor",
        "RPC / Capability Broker",
        "文件系统 / 凭证 / Sandbox"
      ]
    }
  ],
  "identities": [
    {
      "name": "packageId + version",
      "label": "代码包",
      "example": "github-workbench@1.2.0",
      "text": "不可变的发布单元。安装层保存代码和 Manifest。"
    },
    {
      "name": "instanceId",
      "label": "启用实例",
      "example": "workspace-a/github-main",
      "text": "关联作用域与配置。停止或重启不必改变实例身份。"
    },
    {
      "name": "activationId",
      "label": "一次激活",
      "example": "github-main / generation 7",
      "text": "产品运行代次，由 Runtime 发放。不同于 Cordis Fiber 的 uid 或内部 epoch。"
    },
    {
      "name": "scopeId",
      "label": "可见范围",
      "example": "root / workspace-a / session-2",
      "text": "宿主定义的 Workspace / Session 范围，再映射到 Context 和服务隔离键。"
    }
  ],
  "mechanisms": [
    {
      "id": "scope",
      "name": "Context 与服务隔离",
      "english": "Cordis service realms",
      "color": "teal",
      "question": "同一个服务名，在不同工作台里应该找到谁？",
      "idea": "直接使用 Context.extend 与 isolate。isolate 按服务键选择 realm；产品 Workspace 需要明确映射，不自带通用的父级回退查找树。",
      "structures": [
        "Context.extend(meta)",
        "Context.isolate(serviceKey, label)",
        "Workspace → service realm mapping"
      ],
      "steps": [
        "先列出要按 Workspace 隔离的服务，以及允许共享的服务。",
        "在同一 Workspace 中复用对应服务的 realm 标签。",
        "插件的清理仍由 Fiber 和 effect 负责；Context 派生不等于独立生命周期。",
        "跨范围共享或授权由宿主显式实现，必要时使用独立根 Context。"
      ],
      "invariant": "隔离只覆盖明确配置的服务键。产品 scopeId、资源归属和调用权限不能混为同一件事。",
      "trap": "以为 ctx.extend() 自动隔离所有服务，或以为 isolate() 提供一个自动向父级回退的 Scope 容器。",
      "decide": "产品服务替换后，使用原生依赖重新激活，还是通过稳定代理保留旧目标？",
      "decisionId": "D03",
      "code": "// Cordis 原生 API；完整 Workspace 管理另行实现\nconst root = new Context();\nconst workspaceA = root.isolate('storage', Symbol('workspace-a'));\nconst workspaceB = root.isolate('storage', Symbol('workspace-b'));\nawait workspaceA.plugin(ctx => {\n  ctx.provide('storage', { workspaceId: 'a' });\n});\nawait workspaceA.inject(['storage'], ctx => {\n  console.log(ctx.storage.workspaceId); // a\n});\n// workspaceB 的 storage 属于另一个 realm。",
      "sources": [
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/context.ts",
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/reflect.ts"
      ],
      "codeLabel": "Cordis 原生 API · 示例"
    },
    {
      "id": "dependencies",
      "name": "服务与依赖注入",
      "english": "Cordis inject",
      "color": "blue",
      "question": "插件启动顺序和依赖变更，如何避免靠人工编排？",
      "idea": "通过原生 plugin / inject 声明服务依赖，Cordis 根据绑定变化运行或回收功能块。产品 Manifest 分析与依赖环诊断另行设计。",
      "structures": [
        "plugin: { name, inject, apply }",
        "ctx.inject(keys, setup)",
        "Fiber.committed / 服务绑定"
      ],
      "steps": [
        "声明消费者依赖，通过 ctx.inject 或插件 inject 字段挂载。",
        "依赖缺失时保持 PENDING；fiber.await() 结束不等于依赖已满足。",
        "提供者可用后由 Cordis 激活消费者，绑定变化由框架协调。",
        "进程健康、Manifest 冲突与已知依赖环由产品服务诊断。"
      ],
      "invariant": "稳定 Tools 服务与具体工具贡献项分开。更新一项工具不应靠替换整个 Tools 服务完成。",
      "trap": "把 await ctx.plugin() 当作业务 ready；把 npm 依赖当服务依赖；把 Manifest 环检测当 Cordis 自带保证。",
      "decide": "怎样定义“就绪”：插件准备完成后由产品注册服务统一提交，还是额外设置显式 ready 握手？",
      "decisionId": "D04",
      "code": "const consumer = root.inject(['storage'], ctx => {\n  // 声明依赖后读取原生 Context 上的服务。\n  const subscription = ctx.storage.subscribe();\n  return () => subscription.cancel();\n});\nawait consumer.await();\n// 此时也可能仍为 PENDING，不能直接宣布应用 ready。",
      "sources": [
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/registry.ts",
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/fiber.ts#L395"
      ],
      "codeLabel": "Cordis 原生 API · 示例"
    },
    {
      "id": "lifecycle",
      "name": "激活与状态协调",
      "english": "Cordis Fiber lifecycle",
      "color": "teal",
      "question": "正在启动时又收到停止，旧结果还有没有权利生效？",
      "idea": "进程内依赖刷新与 epoch 沿用 Cordis Fiber。产品的 enabled 意图、持久实例 ID、远程 activationId 和进程状态由宿主映射。",
      "structures": [
        "PENDING / LOADING / ACTIVE",
        "FAILED / DISPOSED / UNLOADING",
        "instanceId / activationId: host-owned"
      ],
      "steps": [
        "由宿主保存实例配置与 enabled 状态，再调用 ctx.plugin。",
        "更新与刷新使用原生 update / restart；await 等待当前任务稳定。",
        "停用时释放 Fiber；重新启用创建新的 Fiber，保留产品实例记录。",
        "远程连接发放独立 activationId，过期消息不能修改当前注册。"
      ],
      "invariant": "Fiber uid 不等于产品 activationId。已 disposed 的插件 Fiber 需要重新挂载，不能直接 start。",
      "trap": "调用旧草案的 start / stop 或 ctx.signal，误认为它们已经是 Cordis API；依赖私有 epoch 作为长期插件协议。",
      "decide": "连续 start / stop / restart，是逐个执行，还是收敛到最新意图？",
      "decisionId": "D05",
      "code": "// 原生句柄；宿主另存 enabled / instanceId。\nconst fiber = root.plugin(plugin, config);\nawait fiber.await();\nawait fiber.update(nextConfig);\nawait fiber.dispose();\n// 重新启用：重新挂载，得到新的 Fiber。\nconst nextFiber = root.plugin(plugin, nextConfig);",
      "sources": [
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/fiber.ts#L426",
        "https://developer.mozilla.org/en-US/docs/Web/API/AbortController"
      ],
      "codeLabel": "Cordis 原生 API · 示例"
    },
    {
      "id": "effects",
      "name": "受管资源与清理",
      "english": "Owned effects",
      "color": "amber",
      "question": "插件退出后，为什么还有定时器或连接活着？",
      "idea": "使用原生 effect 或 generator，在获得资源后登记 disposer。Cordis 外层清理可并行，复合 effect 内部逆序；消费者依赖决定提供者的释放时机。",
      "structures": [
        "ctx.effect(acquire)",
        "generator → yield disposer",
        "Fiber.getEffects() / 依赖释放"
      ],
      "steps": [
        "获取资源后及时 yield 或登记 disposer，覆盖部分初始化失败。",
        "有严格先后关系的资源放在同一个复合 effect 中。",
        "需要失败后仍全部清理的操作，使用独立 effect 或显式错误汇总并测试。",
        "进程超时、强制终止与远程取消由 Runtime / Supervisor 承担。"
      ],
      "invariant": "清理入口幂等不等于每次清理都成功；必须验证错误和迟到结果。不能承诺所有插件资源全局串行逆序释放。",
      "trap": "以为独立 effect 总是串行清理，或以为任意复合 effect 内的一项失败都会自动继续后续清理。",
      "decide": "直接使用 Cordis generator / effect，还是在产品 SDK 中增加便利的 onDispose 封装？",
      "decisionId": "D06",
      "code": "// Cordis 支持的 generator effect 形式。\nawait ctx.effect(async function* () {\n  const connection = await connect();\n  yield () => connection.close();\n  const subscription = await connection.subscribe();\n  yield () => subscription.cancel();\n});\n// 正常复合清理：subscription → connection。\n// 失败后是否继续所有清理需按产品要求补测试。",
      "sources": [
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/fiber.ts",
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/tests/dispose.spec.ts"
      ],
      "codeLabel": "Cordis 原生 effect · 资源函数为示意"
    },
    {
      "id": "registration",
      "name": "注册批次与快照",
      "english": "Product registry extension",
      "color": "blue",
      "question": "工具已经出现，面板却初始化失败，该留下什么？",
      "idea": "这部分由产品注册服务实现。Cordis 负责插件与 effect 的寿命，Tools / Views 另行实现暂存、完整修订和原子发布；业务副作用不在注册事务里。",
      "structures": [
        "Batch { ownerActivation, stagedEntries }",
        "RegistrySnapshot { revision, entries }",
        "Lease { revision, targets, release }"
      ],
      "steps": [
        "准备期间收集服务、工具与 UI 的注册描述，普通读者看不到暂存项。",
        "提交前重新检查归属、冲突、依赖和基准修订。",
        "构造下一份完整快照，通过单一发布点切换可见修订。",
        "提交完成后再发通知；通知失败不能把已提交版本假装回滚。"
      ],
      "invariant": "读者只看到完整旧修订或完整新修订；旧 Step 的工具定义和执行目标来自同一份快照。",
      "trap": "依次修改 tools Map、await 一次、再修改 views Map；中间读者会看到混合版本。",
      "decide": "采用统一不可变快照，还是让每个注册表参加准备与提交协议？",
      "decisionId": "D07",
      "code": "// 设计示意：提交路径内不执行外部异步代码\nconst next = buildSnapshot(current, stagedBatch);\nvalidate(next, stagedBatch.owner);\nassertBaseRevision(stagedBatch.baseRevision, current.revision);\ncurrent = next; // 唯一发布点\nqueueNotification({ type: 'registry.changed', revision: next.revision });\n// 已固定旧快照的调用，继续持有旧 targets。",
      "sources": [],
      "codeLabel": "产品注册服务伪代码 · 尚未实现"
    },
    {
      "id": "events",
      "name": "事件与可观察性",
      "english": "Cordis event contracts",
      "color": "amber",
      "question": "一个监听器报错，应该阻止其他人收到通知吗？",
      "idea": "保留 Cordis 原生分发契约。emit 同步执行，parallel 等待全部监听并汇总后抛错；需要仅记录通知错误时，在外层封装单独的通知服务。",
      "structures": [
        "ctx.on(event, callback)",
        "ctx.emit / parallel / serial",
        "通知服务捕获 AggregateError"
      ],
      "steps": [
        "根据是否等待结果选择原生分发方式。",
        "emit 不等待 Promise，同步抛错可能中断后续监听。",
        "parallel 等待本批监听，失败时抛出 AggregateError；调用方必须处理。",
        "通知服务可捕获异常并送诊断，但不悄悄改写 ctx.emit 的含义。"
      ],
      "invariant": "进程内事件遵守本地 Cordis 代码。跨进程授权与业务返回值由 Broker 和服务协议承担。",
      "trap": "把旧草案的“emit 并行等待且不抛错”套在原生 Cordis 上。",
      "decide": "通知采用并行等待并汇总错误，还是串行等待？",
      "decisionId": "D08",
      "code": "// 应用层通知服务的示意封装；不修改 ctx.emit。\nasync function notify(ctx, event, payload) {\n  try {\n    await ctx.parallel(event, payload);\n  } catch (error) {\n    diagnostics.record(error);\n  }\n}",
      "sources": [
        "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/events.ts"
      ],
      "codeLabel": "基于 Cordis parallel 的产品封装示意"
    }
  ],
  "interfaceRows": [
    [
      "new Context()",
      "根运行环境",
      "独立于 Electron、模型 SDK 与数据库。"
    ],
    [
      "ctx.plugin({ name, inject, apply }, config)",
      "可等待 Fiber",
      "沿用原生插件形态；产品包身份在外层。"
    ],
    [
      "ctx.inject(keys, setup)",
      "依赖功能块",
      "缺少依赖时 PENDING；等待稳定不保证已就绪。"
    ],
    [
      "fiber.update / restart / dispose",
      "原生生命周期操作",
      "已释放 Fiber 不能复用；产品停用状态由宿主保存。"
    ],
    [
      "ctx.isolate(name, label)",
      "派生 Context",
      "按服务键隔离，不自动建立产品 Scope 树。"
    ],
    [
      "ctx.provide / ctx.effect",
      "受管资源与释放入口",
      "业务注册事务另由 Tools / Views 实现。"
    ],
    [
      "ctx.on / emit / parallel / serial",
      "原生事件分发",
      "同步、并行与串行的完成及错误契约不同。"
    ]
  ],
  "pluginExample": "// 原生 Cordis 插件外形；tools / views 为待实现产品服务。\nexport const githubPlugin = {\n  name: 'github-workbench',\n  inject: ['tools', 'views'],\n  apply(ctx, config) {\n    // 概念契约：业务批次绑定插件资源寿命。\n    ctx.effect(() => {\n      const batch = ctx.tools.beginBatch(config.activationId);\n      batch.stageTool({ name: 'github.listPullRequests' });\n      batch.stageView({ id: 'github.dashboard', mode: 'iframe' });\n      // stage / commit 是产品服务 API，不是 Cordis 自带。\n      return () => batch.dispose();\n    });\n  },\n};",
  "rpcExample": "// 发送方提出调用；宿主从连接绑定读取调用者身份。\n{\n  \"jsonrpc\": \"2.0\",\n  \"id\": \"request-42\",\n  \"method\": \"service.call\",\n  \"params\": {\n    \"service\": \"github@1\",\n    \"operation\": \"listPullRequests\",\n    \"input\": { \"repository\": \"owner/repo\" }\n  }\n}\n\n// 取消是我们的扩展，仍需校验 request 所有权。\n{\n  \"jsonrpc\": \"2.0\",\n  \"method\": \"request.cancel\",\n  \"params\": { \"requestId\": \"request-42\" }\n}",
  "rpcSteps": [
    "连接握手并绑定 instance / activation / scope 身份。",
    "校验协议版本、方法白名单以及输入结构。",
    "由 Broker 检查调用权限和预算，固定目标代次。",
    "执行服务；以 requestId 关联结果、取消和超时。",
    "连接关闭时拒绝挂起调用、释放订阅并撤销远程注册。"
  ],
  "processFacts": [
    [
      "同进程插件",
      "适合可信内置服务。可共享对象，但公开扩展服务应面向未来的异步契约。同步死循环无法靠 Promise 超时抢占。"
    ],
    [
      "Node 子进程",
      "承载业务 Runtime，支持进程监控和强制终止。进程边界本身不限制文件、网络或凭证访问。"
    ],
    [
      "UI iframe",
      "承载隔离界面。敏感操作交给受控 Bridge；校验来源、发送窗口、消息结构及绑定权限。"
    ],
    [
      "Cordis 本地分支",
      "已复用无 Electron 的 core。可以修改源码并维护回归测试；进程、权限和产品注册事务在框架之上补充。"
    ]
  ],
  "upgradeStages": [
    {
      "name": "准备",
      "code": "PREPARE",
      "detail": "验证 Manifest、依赖和入口，建立候选激活。代码目录不可变，业务数据目录独立。"
    },
    {
      "name": "预热",
      "code": "WARM",
      "detail": "候选就绪，工具和视图仍暂存。候选只读共享状态，写任务尚未接管。"
    },
    {
      "name": "切换",
      "code": "COMMIT",
      "detail": "工具和 UI 共同切换注册修订。新 Step 和新请求使用新目标。"
    },
    {
      "name": "排空",
      "code": "DRAIN",
      "detail": "已经持有旧快照的 Step 可继续调用旧目标。等待引用释放或到达明确期限。"
    },
    {
      "name": "回收",
      "code": "DISPOSE",
      "detail": "撤销旧激活剩余入口，执行清理并终止旧进程。记录异常和未完成任务。"
    }
  ],
  "dataRows": [
    [
      "包代码与静态资源",
      "Package Store",
      "不可变版本目录",
      "升级创建新目录，保留回退所需版本。"
    ],
    [
      "实例启用配置",
      "宿主配置服务",
      "版本、scope、config、enabled",
      "重启重新挂载，不序列化 Context 或进程句柄。"
    ],
    [
      "工具与视图注册",
      "注册服务",
      "运行时快照 + revision",
      "进程重启后重新登记，旧 activation 消息失效。"
    ],
    [
      "业务事实",
      "插件 Storage",
      "独立数据目录 / 数据库",
      "首版要求格式兼容；代码回退不等于数据回滚。"
    ],
    [
      "会话与工具记录",
      "Session Storage",
      "请求、结果、目标版本",
      "中断调用标记为中断，不静默当作成功或自动重放。"
    ],
    [
      "凭证",
      "宿主凭证服务",
      "受控引用",
      "不下发到普通 UI 或任意插件；调用时经授权代理使用。"
    ]
  ],
  "decisions": [
    {
      "id": "D01",
      "group": "内核边界",
      "title": "业务注册表如何接入统一生命周期？",
      "baseline": "Cordis effect 绑定清理归属，产品 Tools / Views 管理批次与修订。",
      "why": "如果每个注册表各写一套清理逻辑，升级与失败撤销容易出现不同步。",
      "options": [
        {
          "id": "owned",
          "label": "统一受管注册基座",
          "text": "在产品服务层复用 owner、staging、commit、dispose 的注册基座。",
          "tradeoff": "需要先定义一个足够小的扩展接口。"
        },
        {
          "id": "participants",
          "label": "各服务实现事务参与接口",
          "text": "产品发布协调器负责调度，服务各自实现准备与提交。",
          "tradeoff": "各服务实现责任更多，必须验证提交阶段不失败。"
        }
      ],
      "recommended": "owned",
      "test": "让 Tools 准备成功、Views 准备失败；任何读者都不应看到半成品。",
      "revisit": "新注册表无法用共同基座表达自身语义时。"
    },
    {
      "id": "D02",
      "group": "身份与实例",
      "title": "同一作用域能否启用多个同包实例？",
      "baseline": "包、实例、激活和进程分开建模。",
      "why": "多个 GitHub 连接或不同配置可能需要同一包的多个实例，但服务与工具名称必须消除歧义。",
      "options": [
        {
          "id": "explicit",
          "label": "显式实例 ID，多实例可选",
          "text": "默认一个实例，只有明确提供唯一 instanceId 时才创建额外实例。",
          "tradeoff": "需要定义工具命名和选择规则；服务键冲突仍然拒绝。"
        },
        {
          "id": "singleton",
          "label": "首版每 Scope 每包一个实例",
          "text": "用 Workspace 区分不同配置。",
          "tradeoff": "实现简单，但同一工作台组合多个连接受限。"
        }
      ],
      "recommended": "explicit",
      "test": "同包两实例能独立停止；一个实例不能撤销另一个的注册。",
      "revisit": "出现多个账户或多仓库连接需求时。"
    },
    {
      "id": "D03",
      "group": "作用域",
      "title": "产品服务替换后，消费者何时切换？",
      "baseline": "Cordis 按服务绑定协调依赖；Workspace 共享与覆盖规则由宿主明确实现。",
      "why": "查找结果变化会影响既有连接、缓存和资源所有权。",
      "options": [
        {
          "id": "reactivate",
          "label": "重新激活受影响消费者",
          "text": "使用 Cordis 原生依赖变化，结束旧运行后使用新绑定。",
          "tradeoff": "行为一致，切换期间可能暂时不可用。"
        },
        {
          "id": "pinned",
          "label": "当前激活继续固定旧绑定",
          "text": "产品稳定代理持有旧目标，下一激活才切换；这是额外策略。",
          "tradeoff": "不中断现有工作，但同时存在两种有效绑定。"
        }
      ],
      "recommended": "reactivate",
      "test": "在明确 realm 内撤销旧提供者、安装新提供者，检查消费者与清理顺序。",
      "revisit": "需要长连接无中断切换时。"
    },
    {
      "id": "D04",
      "group": "依赖与就绪",
      "title": "什么时刻可以宣布插件已经就绪？",
      "baseline": "Cordis await 仅等待当前任务稳定，应用 ready 还需宿主检查依赖与进程健康。",
      "why": "过早可见会让消费者调用尚未监听的服务。",
      "options": [
        {
          "id": "activation",
          "label": "激活成功后统一提交",
          "text": "Cordis 插件完成准备后，由产品注册服务统一提交。",
          "tradeoff": "协议简单，作者必须遵守准备完成的约定。"
        },
        {
          "id": "handshake",
          "label": "额外就绪与健康握手",
          "text": "Runtime 再验证连接与健康状态，随后请求内核提交。",
          "tradeoff": "适合子进程，但应避免两个互相等待的 ready 状态。"
        }
      ],
      "recommended": "activation",
      "test": "服务仍在建立连接时，依赖消费者保持 waiting。",
      "revisit": "接入真实 Node 进程时，在内核提交前增加宿主健康验证。"
    },
    {
      "id": "D05",
      "group": "异步生命周期",
      "title": "连续启停请求怎样协调？",
      "baseline": "宿主协调用户 enabled 意图，进程内 Fiber 生命周期沿用 Cordis。",
      "why": "逐个等待慢激活会拖延用户停止；任意抢占又可能遗留副作用。",
      "options": [
        {
          "id": "converge",
          "label": "收敛到最新意图",
          "text": "更新目标状态，过期代次取消与清理。",
          "tradeoff": "句柄需明确“被取代”的结果，不能把它报告成成功。"
        },
        {
          "id": "ordered",
          "label": "严格逐个执行命令",
          "text": "每个命令按顺序完成，结果直观。",
          "tradeoff": "慢启动可能延迟停止，仍需专门取消通道。"
        }
      ],
      "recommended": "converge",
      "test": "插件仍在初始化时连续启用 → 停用 → 启用；只有最终有效实例可以发布业务注册。",
      "revisit": "需要精确重放操作序列的管理工具出现时。"
    },
    {
      "id": "D06",
      "group": "资源管理",
      "title": "部分初始化如何即时登记清理？",
      "baseline": "沿用 Cordis effect；明确复合逆序、外层并行与失败处理。",
      "why": "在 apply 末尾才返回 disposer，无法覆盖中途抛错的获取过程。",
      "options": [
        {
          "id": "onDispose",
          "label": "显式 onDispose / resource API",
          "text": "产品 SDK 在原生 effect 上提供便利登记；需要维护新增接口。",
          "tradeoff": "简单易审查，需要约束作者不要遗漏登记。"
        },
        {
          "id": "generator",
          "label": "generator / yield 获取协议",
          "text": "直接使用 Cordis effect / generator，每次获取后 yield 清理。",
          "tradeoff": "表达集中，但 API 学习和异步边界更复杂。"
        }
      ],
      "recommended": "generator",
      "test": "获取 A 成功、获取 B 失败，A 必须被清理一次。",
      "revisit": "插件资源获取模式高度重复，显式登记容易遗漏时。"
    },
    {
      "id": "D07",
      "group": "注册一致性",
      "title": "怎样实现工具与 UI 的一次发布？",
      "baseline": "暂存项不可见，提交发布完整修订。",
      "why": "多个 Map 的独立更新会产生工具已出现、界面仍旧的混合版本。",
      "options": [
        {
          "id": "snapshot",
          "label": "统一不可变注册快照",
          "text": "构造下一修订，通过单一引用切换发布。",
          "tradeoff": "容易推理，需衡量快照构建与保留旧版本的成本。"
        },
        {
          "id": "coordinator",
          "label": "各注册表准备后统一提交",
          "text": "注册表维护各自结构，共用提交协调器。",
          "tradeoff": "提交协议更复杂，必须禁止中途 await 和部分失败。"
        }
      ],
      "recommended": "snapshot",
      "test": "在高频读取中提交新版本，每次读到的工具与 UI 修订必须一致。",
      "revisit": "注册量大到快照复制成为实际瓶颈时，以测量证据调整。"
    },
    {
      "id": "D08",
      "group": "事件",
      "title": "通知监听器如何执行与报告错误？",
      "baseline": "原生 emit / parallel 保持上游语义，产品通知服务另行处理错误。",
      "why": "分发顺序决定延迟和异常影响，不能由实现偶然决定。",
      "options": [
        {
          "id": "parallel",
          "label": "并行等待并汇总诊断",
          "text": "通知服务调用 ctx.parallel，捕获 AggregateError 并记录诊断。",
          "tradeoff": "无完成顺序保证，慢监听仍需独立超时策略。"
        },
        {
          "id": "serial",
          "label": "逐个等待并收集错误",
          "text": "启动顺序稳定，错误不中断后续监听。",
          "tradeoff": "一个慢监听会延迟整个通知链。"
        }
      ],
      "recommended": "parallel",
      "test": "一个监听抛错、一个成功，成功监听必须执行且错误可定位。",
      "revisit": "某类事件确实需要有序语义时，定义独立类型而非隐含依赖。"
    },
    {
      "id": "D09",
      "group": "RPC",
      "title": "跨进程暴露显式方法还是任意对象？",
      "baseline": "远程方法异步、输入输出可序列化，身份绑定连接。",
      "why": "Context 的对象属性和本地函数无法直接形成安全稳定的远程契约。",
      "options": [
        {
          "id": "explicit",
          "label": "显式方法描述与 Schema",
          "text": "限定服务和操作名，校验输入、输出与权限。",
          "tradeoff": "需要维护协议声明，但升级和审查清晰。"
        },
        {
          "id": "proxy",
          "label": "生成受约束的代理层",
          "text": "从显式契约生成调用代理，保留类型便利。",
          "tradeoff": "需增加生成过程；运行时仍不得访问未声明属性。"
        }
      ],
      "recommended": "explicit",
      "test": "伪造调用者字段不能改变宿主绑定身份，未暴露方法必须被拒绝。",
      "revisit": "协议稳定且样板代码明显增加时，再从契约生成代理。"
    },
    {
      "id": "D10",
      "group": "升级",
      "title": "旧版本调用何时必须结束？",
      "baseline": "Step 固定旧工具定义与目标，切换后新 Step 使用新修订。",
      "why": "无限等待会让旧进程长期存活；立即销毁会破坏执行中的调用。",
      "options": [
        {
          "id": "bounded",
          "label": "租约 + 有界排空",
          "text": "等待旧引用释放，到期取消并返回明确错误。",
          "tradeoff": "需要按任务预算制定期限，不能承诺所有旧任务都完成。"
        },
        {
          "id": "manual",
          "label": "持续保留，用户手动结束",
          "text": "适合少量超长任务，界面展示旧版本占用。",
          "tradeoff": "资源和数据写入交接更难管理。"
        }
      ],
      "recommended": "bounded",
      "test": "在旧 Step 尚未调用完工具时升级，目标保持旧版本；超时后租约被清理。",
      "revisit": "出现需要跨数小时运行的任务时，增加任务迁移或版本保留策略。"
    },
    {
      "id": "D11",
      "group": "恢复",
      "title": "重启后怎样处理未完成的工具调用？",
      "baseline": "保存配置和事实，运行对象重新创建，副作用不能无条件重放。",
      "why": "客户端崩溃时，远端操作可能已成功但结果尚未写回。",
      "options": [
        {
          "id": "interrupted",
          "label": "标记中断，等待明确恢复",
          "text": "先恢复环境，再显示未确定的操作状态。",
          "tradeoff": "用户可能需要介入，但不重复执行未知副作用。"
        },
        {
          "id": "idempotent",
          "label": "仅自动恢复已声明幂等操作",
          "text": "要求幂等键或可查询的执行结果。",
          "tradeoff": "必须由具体服务提供证据，不能仅靠工具名称判断。"
        }
      ],
      "recommended": "interrupted",
      "test": "模拟远端已成功、本地结果未落盘的崩溃窗口，重启不自动重复写入。",
      "revisit": "具体工具支持幂等键与状态查询时逐项开放恢复。"
    },
    {
      "id": "D12",
      "group": "诊断",
      "title": "怎样解释插件为何没有启动或没有释放？",
      "baseline": "暴露状态、缺失依赖、失败与清理错误。",
      "why": "只有日志文本会让配置问题、依赖等待与运行崩溃混在一起。",
      "options": [
        {
          "id": "snapshot-events",
          "label": "诊断快照 + 有界事件记录",
          "text": "当前状态与最近变化一起提供，关联实例与激活代次。",
          "tradeoff": "需脱敏和容量限制，避免日志无限增长。"
        },
        {
          "id": "events",
          "label": "仅结构化事件日志",
          "text": "先降低实现规模，由调用方重建状态。",
          "tradeoff": "重建成本高，截断日志后可能缺少解释。"
        }
      ],
      "recommended": "snapshot-events",
      "test": "能回答“在等谁”“谁还占用旧版本”“哪项清理失败”。",
      "revisit": "遥测规模和跨设备查询有真实需求时。"
    }
  ],
  "roadmap": [
    {
      "id": "phase-1",
      "title": "复用与验证 Cordis",
      "label": "源码已引入",
      "deliver": "原样引入 core 与测试，构建真实 cordis 包，运行依赖与清理样例。",
      "checks": [
        "scope-lookup",
        "scope-isolation",
        "effect-once",
        "effect-late"
      ]
    },
    {
      "id": "phase-2",
      "title": "Workspace 与实例映射",
      "label": "补齐产品语义",
      "deliver": "产品身份、服务隔离范围、启用配置、原生状态映射与 Manifest 诊断。",
      "checks": [
        "deps-order",
        "deps-recover",
        "deps-cycle",
        "lifecycle-race"
      ]
    },
    {
      "id": "phase-3",
      "title": "注册与协议",
      "label": "形成稳定边界",
      "deliver": "注册批次、快照、错误协议、同进程与内存传输适配器。",
      "checks": [
        "batch-atomic",
        "snapshot-target",
        "rpc-identity",
        "rpc-disconnect"
      ]
    },
    {
      "id": "phase-4",
      "title": "真实桌面闭环",
      "label": "接入产品环境",
      "deliver": "Electron、Node 进程、真实模型、GitHub 工具与工作台、持久化。",
      "checks": [
        "process-lifecycle",
        "real-tools",
        "ui-revision",
        "restart-state"
      ]
    }
  ],
  "checks": [
    {
      "id": "scope-lookup",
      "text": "显式服务 realm 的可见性符合 Workspace 共享策略。"
    },
    {
      "id": "scope-isolation",
      "text": "两个 Workspace 的实例不能跨域撤销或覆盖注册。"
    },
    {
      "id": "effect-once",
      "text": "复合 effect 正常逆序释放；独立资源的错误处理符合约定。"
    },
    {
      "id": "effect-late",
      "text": "取消后才获取成功的资源立即释放。"
    },
    {
      "id": "deps-order",
      "text": "插件乱序挂载仍按依赖激活。"
    },
    {
      "id": "deps-recover",
      "text": "提供者下线，消费者先收尾；恢复后重新激活。"
    },
    {
      "id": "deps-cycle",
      "text": "Manifest 层区分缺失依赖与已知环，不假定 Cordis 自带分析。"
    },
    {
      "id": "lifecycle-race",
      "text": "连续启停后，过期代次无法发布或覆盖新状态。"
    },
    {
      "id": "batch-atomic",
      "text": "部分准备失败不暴露半成品，提交呈现完整修订。"
    },
    {
      "id": "snapshot-target",
      "text": "旧 Step 的工具定义与执行目标始终匹配。"
    },
    {
      "id": "rpc-identity",
      "text": "伪造身份字段和未授权方法被拒绝。"
    },
    {
      "id": "rpc-disconnect",
      "text": "RPC 断线会拒绝挂起请求并释放订阅。"
    },
    {
      "id": "process-lifecycle",
      "text": "插件真实进程启动、停止和异常退出被宿主管理。"
    },
    {
      "id": "real-tools",
      "text": "真实模型能够发现并调用 GitHub 插件工具。"
    },
    {
      "id": "ui-revision",
      "text": "注册升级后工具与 UI 使用一致修订；缺序可恢复快照。"
    },
    {
      "id": "restart-state",
      "text": "重启恢复配置与数据；未完成副作用不会无条件重放。"
    }
  ],
  "sources": [
    {
      "title": "Context 与隔离",
      "file": "context.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/context.ts",
      "purpose": "看上下文派生与服务隔离，别直接把它等同于产品的用户权限。",
      "topic": "scope",
      "chapter": "mechanisms"
    },
    {
      "title": "插件挂载与注入",
      "file": "registry.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/registry.ts",
      "purpose": "看定义、运行实例与 inject 如何关联。",
      "topic": "dependencies",
      "chapter": "mechanisms"
    },
    {
      "title": "激活、代次与资源",
      "file": "fiber.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/fiber.ts",
      "purpose": "重点看 _refresh、_setEpoch、_reload、_unload 与 effect。",
      "topic": "lifecycle",
      "chapter": "mechanisms"
    },
    {
      "title": "服务变化与释放",
      "file": "reflect.ts / service.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/reflect.ts",
      "purpose": "看服务绑定如何通知消费者，以及提供者为何等待消费者收尾。",
      "topic": "dependencies",
      "chapter": "mechanisms"
    },
    {
      "title": "事件分发",
      "file": "events.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/src/events.ts",
      "purpose": "逐个比较 emit、parallel、serial、bail 和 waterfall 的契约。",
      "topic": "events",
      "chapter": "mechanisms"
    },
    {
      "title": "资源与依赖清理测试",
      "file": "dispose.spec.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/tests/dispose.spec.ts",
      "purpose": "直接运行已有测试，修改本地内核时补充对应回归用例。",
      "topic": "effects",
      "chapter": "mechanisms"
    },
    {
      "title": "服务释放测试",
      "file": "service-dispose.spec.ts",
      "url": "https://github.com/cordiverse/cordis/blob/35fdc969e4b6c48c48ed44717c7a018324e4dd88/packages/core/tests/service-dispose.spec.ts",
      "purpose": "对照消费者与提供者的释放顺序。",
      "topic": "effects",
      "chapter": "mechanisms"
    },
    {
      "title": "JSON-RPC 2.0",
      "file": "协议规范",
      "url": "https://www.jsonrpc.org/specification",
      "purpose": "请求、响应、错误与通知；取消和订阅关闭需自行扩展。",
      "chapter": "interfaces"
    },
    {
      "title": "Electron 安全边界",
      "file": "官方安全文档",
      "url": "https://www.electronjs.org/docs/latest/tutorial/security",
      "purpose": "Renderer 的权限、上下文隔离、IPC 发送者验证与内容边界。",
      "chapter": "interfaces"
    },
    {
      "title": "取消信号",
      "file": "AbortController",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/AbortController",
      "purpose": "取消是协作机制；不要把超时等同于底层任务已经终止。",
      "chapter": "mechanisms",
      "topic": "lifecycle"
    },
    {
      "title": "iframe 消息桥",
      "file": "window.postMessage",
      "url": "https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage",
      "purpose": "校验来源与发送窗口，使用明确的目标来源。",
      "chapter": "interfaces"
    }
  ],
  "glossary": [
    [
      "Context",
      "Cordis 插件入口；产品身份通过宿主映射，不整体跨进程传输。"
    ],
    [
      "Service",
      "具有稳定标识和契约的可依赖能力。"
    ],
    [
      "Contribution",
      "工具、视图等业务注册项，归某次激活所有。"
    ],
    [
      "Scope",
      "产品的能力可见范围，需要明确映射到 Cordis 的服务 realm 或独立 Context。"
    ],
    [
      "Instance",
      "某个作用域中启用的插件配置实例。"
    ],
    [
      "Activation / generation",
      "一次启动产生的运行代次，用于判断异步结果是否仍有效。"
    ],
    [
      "Effect / disposer",
      "已登记资源及其释放操作。"
    ],
    [
      "Injection block",
      "根据独立依赖启停、归父插件所有的功能块。"
    ],
    [
      "Staging",
      "准备资源与注册，但尚未对普通读者发布。"
    ],
    [
      "Revision",
      "一份完整可见注册快照的版本。"
    ],
    [
      "Lease",
      "对旧快照或旧执行目标的保留引用，需要显式释放。"
    ],
    [
      "Drain",
      "停止分配新的工作，等待已有引用和调用结束。"
    ],
    [
      "Broker",
      "绑定身份、校验权限并路由受控调用的入口。"
    ],
    [
      "Supervisor",
      "负责真实进程启动、监控、停止和强制终止的宿主组件。"
    ],
    [
      "Desired / observed state",
      "用户希望实例处于的状态，与实例当前实际运行状态。"
    ],
    [
      "ADR",
      "架构决策记录：背景、选择、理由、代价和验证证据。"
    ]
  ]
};
