export const scenarios = [
  {
    "id": "dependency",
    "title": "依赖上线与下线",
    "subtitle": "B 依赖 A，先挂载 B。",
    "decision": "D04",
    "lesson": "服务的逻辑可用性与物理资源寿命不同。退出时可以先关闭新入口，再为消费者收尾保留依赖。",
    "branches": [
      {
        "id": "normal",
        "label": "完整生命周期",
        "steps": [
          {
            "title": "消费者先到达",
            "explanation": "B 已启用，但 storage@1 尚未出现。它等待，不进入失败。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "absent",
                "generation": "—",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "waiting",
                "generation": "—",
                "note": "缺少 storage@1"
              }
            ],
            "revision": "r0",
            "visible": [],
            "staged": [],
            "resources": [],
            "invariant": "未满足依赖时不能执行 B.apply。",
            "log": "mount B → waiting: storage@1"
          },
          {
            "title": "提供者正在准备",
            "explanation": "A 获取连接并暂存服务。B 仍然看不到可调用的 storage@1。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "activating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "waiting",
                "generation": "—",
                "note": ""
              }
            ],
            "revision": "r0",
            "visible": [],
            "staged": [
              "storage@1 / owner A1"
            ],
            "resources": [
              "A1 数据连接（准备中）"
            ],
            "invariant": "声明服务与服务就绪是两个时刻。",
            "log": "A1.prepare → service staged"
          },
          {
            "title": "A 提交，唤醒 B",
            "explanation": "A 成功提交服务。协调器为 B 分配 B1，并把它绑定到 A1。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "activating",
                "generation": "B1",
                "note": "依赖绑定 A1"
              }
            ],
            "revision": "r1",
            "visible": [
              "storage@1 → A1"
            ],
            "staged": [],
            "resources": [
              "A1 数据连接",
              "B1 临时初始化资源"
            ],
            "invariant": "B1 的依赖目标明确，不能在执行中静默换成 A2。",
            "log": "commit A1 → evaluate B → activate B1"
          },
          {
            "title": "双方运行",
            "explanation": "B 发布工具和视图。注册项归 B1，Storage 连接归 A1。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "active",
                "generation": "B1",
                "note": ""
              }
            ],
            "revision": "r2",
            "visible": [
              "storage@1 → A1",
              "github.search → B1",
              "github.dashboard → B1"
            ],
            "staged": [],
            "resources": [
              "A1 数据连接",
              "B1 定时任务与订阅"
            ],
            "invariant": "服务可见性与资源所有权分别建模。",
            "log": "commit B1 → registry revision r2"
          },
          {
            "title": "用户停止 A",
            "explanation": "停止分配新工作，B 开始收尾。A 的资源仍保留，供 B 完成必要清理。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "deactivating",
                "generation": "A1",
                "note": "等待消费者"
              },
              {
                "name": "B · GitHub",
                "state": "deactivating",
                "generation": "B1",
                "note": "清理中"
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [
              "A1 数据连接（仅保留清理访问）",
              "B1 待释放订阅"
            ],
            "invariant": "撤销外部入口不等于立刻销毁提供者。",
            "log": "retire A1/B1 bindings → dispose consumers first"
          },
          {
            "title": "B 完成收尾",
            "explanation": "B 清理结束，释放对 A1 的依赖。由于 B 仍启用，它返回等待状态。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "deactivating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "waiting",
                "generation": "—",
                "note": "仍启用，等待服务"
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [
              "A1 数据连接"
            ],
            "invariant": "消费者完成清理后，提供者才能释放资源。",
            "log": "B1.dispose done → release A1 dependency"
          },
          {
            "title": "A 已停止",
            "explanation": "A 保持用户要求的停用状态；B 等待未来的提供者。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "stopped",
                "generation": "—",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "waiting",
                "generation": "—",
                "note": ""
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [],
            "invariant": "显式停止不能因依赖变化自行恢复。",
            "log": "A1.dispose done → A stopped"
          },
          {
            "title": "重新启用后恢复",
            "explanation": "用户重新启用 A。A2 和 B2 分别完成准备与提交，旧代次不复用。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "active",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "B · GitHub",
                "state": "active",
                "generation": "B2",
                "note": ""
              }
            ],
            "revision": "r5",
            "visible": [
              "storage@1 → A2",
              "github.search → B2",
              "github.dashboard → B2"
            ],
            "staged": [],
            "resources": [
              "A2 数据连接",
              "B2 定时任务与订阅"
            ],
            "invariant": "保留实例配置，重新创建运行资源。",
            "log": "start A → commit A2 → commit B2"
          }
        ]
      }
    ]
  },
  {
    "id": "cancellation",
    "title": "启动中取消与迟到结果",
    "subtitle": "连接还没建立，用户已经停止插件。",
    "decision": "D05",
    "lesson": "取消只能表达意图；底层操作可能仍然完成。代次校验和迟到资源清理必须同时存在。",
    "branches": [
      {
        "id": "normal",
        "label": "底层连接忽略取消",
        "steps": [
          {
            "title": "开始异步获取",
            "explanation": "A1 发起连接请求，尚未获得连接对象。",
            "nodes": [
              {
                "name": "插件实例",
                "state": "activating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "异步连接",
                "state": "pending",
                "generation": "A1",
                "note": ""
              }
            ],
            "revision": "r0",
            "visible": [],
            "staged": [],
            "resources": [
              "pending connect()"
            ],
            "invariant": "在 await 之前就建立激活代次与取消信号。",
            "log": "begin A1 → await connect()"
          },
          {
            "title": "用户发出停止",
            "explanation": "目标状态改为 disabled，A1 失效，信号被取消。连接请求还可能在底层运行。",
            "nodes": [
              {
                "name": "插件实例",
                "state": "deactivating",
                "generation": "A1",
                "note": "已失效"
              },
              {
                "name": "异步连接",
                "state": "pending",
                "generation": "A1",
                "note": "不保证立即结束"
              }
            ],
            "revision": "r0",
            "visible": [],
            "staged": [],
            "resources": [
              "pending connect()（取消已请求）"
            ],
            "invariant": "超时或 abort 不代表底层任务已停止。",
            "log": "stop → invalidate A1 → abort signal"
          },
          {
            "title": "迟到的连接成功",
            "explanation": "connect() 返回连接，但协调器发现 A1 已不是有效激活。",
            "nodes": [
              {
                "name": "插件实例",
                "state": "deactivating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "异步连接",
                "state": "stale",
                "generation": "A1",
                "note": "禁止发布"
              }
            ],
            "revision": "r0",
            "visible": [],
            "staged": [],
            "resources": [
              "迟到连接 → 立即 close()"
            ],
            "invariant": "过期结果只能清理，不能 provide 或更新新状态。",
            "log": "connect resolved → stale generation → close()"
          },
          {
            "title": "停止完成",
            "explanation": "迟到资源已经释放，没有服务、监听或连接残留。",
            "nodes": [
              {
                "name": "插件实例",
                "state": "stopped",
                "generation": "—",
                "note": ""
              },
              {
                "name": "异步连接",
                "state": "disposed",
                "generation": "A1",
                "note": ""
              }
            ],
            "revision": "r0",
            "visible": [],
            "staged": [],
            "resources": [],
            "invariant": "stop 的完成语义必须明确是否等待受管清理。",
            "log": "A1 cleanup complete → stopped"
          },
          {
            "title": "新一代独立运行",
            "explanation": "再次启动使用 A2；来自 A1 的消息被拒绝，而不是写入 A2 的资源容器。",
            "nodes": [
              {
                "name": "插件实例",
                "state": "active",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "旧回调",
                "state": "stale",
                "generation": "A1",
                "note": ""
              }
            ],
            "revision": "r1",
            "visible": [
              "service@1 → A2"
            ],
            "staged": [],
            "resources": [
              "A2 独立连接"
            ],
            "invariant": "旧结果不能借用新 activationId。",
            "log": "commit A2; reject late callback from A1"
          }
        ]
      }
    ]
  },
  {
    "id": "transaction",
    "title": "多项注册的原子发布",
    "subtitle": "工具准备好了，UI 却可能准备失败。",
    "decision": "D07",
    "lesson": "注册事务保证可见性一致，不能自动撤销已经发生的外部数据库写入或网络操作。",
    "branches": [
      {
        "id": "failure",
        "label": "UI 准备失败",
        "steps": [
          {
            "title": "已有稳定版本",
            "explanation": "系统已有 r4；候选插件 C1 尚未发布任何能力。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "activating",
                "generation": "C1",
                "note": ""
              }
            ],
            "revision": "r4",
            "visible": [
              "已有工具与界面 / r4"
            ],
            "staged": [],
            "resources": [
              "C1 临时资源"
            ],
            "invariant": "准备失败不能破坏现有修订。",
            "log": "begin batch C1 against r4"
          },
          {
            "title": "工具登记到暂存区",
            "explanation": "github.search 已准备，但普通 Agent 查询仍只读到 r4。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "activating",
                "generation": "C1",
                "note": ""
              }
            ],
            "revision": "r4",
            "visible": [
              "已有工具与界面 / r4"
            ],
            "staged": [
              "github.search → C1"
            ],
            "resources": [
              "C1 临时资源"
            ],
            "invariant": "staged 不等于 published。",
            "log": "stage tool github.search"
          },
          {
            "title": "UI 准备抛错",
            "explanation": "候选激活失败。批次整体撤销，工具从未被普通读者看见。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "deactivating",
                "generation": "C1",
                "note": "UI 初始化失败"
              }
            ],
            "revision": "r4",
            "visible": [
              "已有工具与界面 / r4"
            ],
            "staged": [],
            "resources": [
              "C1 临时资源（清理中）"
            ],
            "invariant": "不能留下“可调用工具 + 缺失面板”的半成品。",
            "log": "view preparation failed → rollback C1 batch"
          },
          {
            "title": "失败已清理",
            "explanation": "C1 进入 failed，报告原因；当前注册仍是 r4。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "failed",
                "generation": "C1",
                "note": ""
              }
            ],
            "revision": "r4",
            "visible": [
              "已有工具与界面 / r4"
            ],
            "staged": [],
            "resources": [],
            "invariant": "失败结果可诊断，且没有受管资源残留。",
            "log": "cleanup C1 complete; current revision remains r4"
          }
        ]
      },
      {
        "id": "success",
        "label": "全部准备成功",
        "steps": [
          {
            "title": "开始准备批次",
            "explanation": "当前读者继续使用 r4。候选准备服务、工具和界面。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "activating",
                "generation": "C1",
                "note": ""
              }
            ],
            "revision": "r4",
            "visible": [
              "已有工具与界面 / r4"
            ],
            "staged": [],
            "resources": [
              "C1 临时资源"
            ],
            "invariant": "准备期间没有对普通读者的可见变化。",
            "log": "begin C1 batch"
          },
          {
            "title": "注册准备完整",
            "explanation": "工具与视图均在暂存区，尚未发布。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "activating",
                "generation": "C1",
                "note": ""
              }
            ],
            "revision": "r4",
            "visible": [
              "已有工具与界面 / r4"
            ],
            "staged": [
              "github.search → C1",
              "github.dashboard → C1"
            ],
            "resources": [
              "C1 就绪资源"
            ],
            "invariant": "提交前校验冲突、代次与基准修订。",
            "log": "validate batch → ready to commit"
          },
          {
            "title": "一次切换修订",
            "explanation": "单一发布点把完整 r5 设为当前快照，随后发送变化通知。",
            "nodes": [
              {
                "name": "当前环境",
                "state": "active",
                "generation": "stable",
                "note": ""
              },
              {
                "name": "候选插件",
                "state": "active",
                "generation": "C1",
                "note": ""
              }
            ],
            "revision": "r5",
            "visible": [
              "已有工具与界面",
              "github.search → C1",
              "github.dashboard → C1"
            ],
            "staged": [],
            "resources": [
              "C1 活跃资源"
            ],
            "invariant": "任何一次快照读取只能得到完整 r4 或完整 r5。",
            "log": "commit r5 → enqueue registry.changed"
          }
        ]
      }
    ]
  },
  {
    "id": "cleanup",
    "title": "消费者先于提供者释放",
    "subtitle": "B 的清理过程还需要调用 A。",
    "decision": "D06",
    "lesson": "依赖决定消费者与提供者的释放顺序。Cordis 外层 disposer 可并行，复合 effect 内逆序；必须全部完成的清理要明确错误处理。",
    "branches": [
      {
        "id": "normal",
        "label": "有依赖的清理",
        "steps": [
          {
            "title": "建立依赖关系",
            "explanation": "B 使用 A 的 Storage，并登记了订阅与任务。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · Runtime",
                "state": "active",
                "generation": "B1",
                "note": ""
              }
            ],
            "revision": "r2",
            "visible": [
              "storage@1 → A1",
              "工具 → B1"
            ],
            "staged": [],
            "resources": [
              "A1 连接",
              "B1 订阅",
              "B1 任务"
            ],
            "invariant": "内核记录 B1 → A1 的反向依赖。",
            "log": "dependents(A1) = { B1 }"
          },
          {
            "title": "开始停用",
            "explanation": "新的外部调用被拒绝，B 运行任务接到取消；A 还不能关闭连接。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "deactivating",
                "generation": "A1",
                "note": "保留清理访问"
              },
              {
                "name": "B · Runtime",
                "state": "deactivating",
                "generation": "B1",
                "note": ""
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [
              "A1 连接（持有）",
              "B1 订阅",
              "B1 任务（取消中）"
            ],
            "invariant": "运行取消信号与清理调用的期限不能简单共用同一个已取消信号。",
            "log": "retire public routes → request B1 cleanup"
          },
          {
            "title": "清理消费者资源",
            "explanation": "B 先取消订阅，再完成依赖于 A 的必要收尾。产品对必须继续的清理应显式汇总错误，不假定原生复合 effect 自动继续。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "deactivating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · Runtime",
                "state": "deactivating",
                "generation": "B1",
                "note": "最后一次清理调用"
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [
              "A1 连接（持有）",
              "B1 收尾调用"
            ],
            "invariant": "提供者有效到消费者释放依赖为止。",
            "log": "dispose B1 effects → release dependency"
          },
          {
            "title": "消费者已经释放",
            "explanation": "B1 资源清理完成，A1 的消费者集合为空。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "deactivating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · Runtime",
                "state": "disposed",
                "generation": "B1",
                "note": ""
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [
              "A1 连接"
            ],
            "invariant": "此时 A 才可以释放底层服务资源。",
            "log": "dependents(A1) = {}"
          },
          {
            "title": "提供者最后关闭",
            "explanation": "A 的连接关闭。实例可最终释放，或根据目标状态等待下一次启动。",
            "nodes": [
              {
                "name": "A · Storage",
                "state": "disposed",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "B · Runtime",
                "state": "disposed",
                "generation": "B1",
                "note": ""
              }
            ],
            "revision": "r3",
            "visible": [],
            "staged": [],
            "resources": [],
            "invariant": "成功清理后，受管资源计数回到零。",
            "log": "close A1 connection → teardown complete"
          }
        ]
      }
    ]
  },
  {
    "id": "upgrade",
    "title": "热升级与旧调用快照",
    "subtitle": "Step S1 正在使用 v1，此时发布 v2。",
    "decision": "D10",
    "lesson": "固定工具定义还不够，执行目标也必须固定。旧 Step 的租约可能在切换后才真正发起某个工具调用。",
    "branches": [
      {
        "id": "success",
        "label": "候选就绪并切换",
        "steps": [
          {
            "title": "旧 Step 已获取快照",
            "explanation": "S1 在 r7 获取工具定义，并保留指向 v1 / A1 的目标租约。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "absent",
                "generation": "—",
                "note": ""
              },
              {
                "name": "Step S1",
                "state": "running",
                "generation": "r7",
                "note": ""
              }
            ],
            "revision": "r7",
            "visible": [
              "tool → v1 / A1",
              "view → v1 / A1"
            ],
            "staged": [],
            "resources": [
              "A1 资源",
              "S1 旧快照租约"
            ],
            "invariant": "租约覆盖整个 Step 所需的定义与目标。",
            "log": "S1.acquire(r7, targets A1)"
          },
          {
            "title": "候选预热",
            "explanation": "A2 只读共享状态，准备新的工具与视图。v1 仍是当前版本。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "activating",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "Step S1",
                "state": "running",
                "generation": "r7",
                "note": ""
              }
            ],
            "revision": "r7",
            "visible": [
              "tool → v1 / A1",
              "view → v1 / A1"
            ],
            "staged": [
              "tool → v2 / A2",
              "view → v2 / A2"
            ],
            "resources": [
              "A1 资源",
              "A2 候选资源",
              "S1 旧快照租约"
            ],
            "invariant": "候选写任务尚未接管，准备失败不会改变当前路由。",
            "log": "warm A2 → stage contributions"
          },
          {
            "title": "一次发布 r8",
            "explanation": "新 Step 使用 v2。S1 仍可使用自己已经获得的旧快照；旧 UI 入口按版本策略失效。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "draining",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "active",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "Step S1",
                "state": "running",
                "generation": "r7",
                "note": ""
              }
            ],
            "revision": "r8",
            "visible": [
              "新调用 → v2 / A2",
              "新界面 → v2 / A2"
            ],
            "staged": [],
            "resources": [
              "A1 被 S1 保留",
              "A2 活跃资源"
            ],
            "invariant": "切换阻止新的旧版本租约，但不偷偷重定向已固定的调用。",
            "log": "commit r8 → stop issuing new A1 leases"
          },
          {
            "title": "S1 调用旧工具",
            "explanation": "即使调用发生在切换之后，只要 S1 的租约仍有效，它也调用 A1，而不是把旧参数结构送给 A2。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "draining",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "active",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "Step S1",
                "state": "running",
                "generation": "r7 → A1",
                "note": ""
              }
            ],
            "revision": "r8",
            "visible": [
              "新调用 → v2 / A2",
              "新界面 → v2 / A2"
            ],
            "staged": [],
            "resources": [
              "S1 → A1 工具执行",
              "A2 活跃资源"
            ],
            "invariant": "工具 Schema 与处理器代次必须匹配。",
            "log": "execute S1.tool using A1 target"
          },
          {
            "title": "旧租约释放",
            "explanation": "S1 完成。A1 没有剩余调用，可以清理。共享数据写入权交接仍由业务协议约束。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "deactivating",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "active",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "Step S1",
                "state": "completed",
                "generation": "r7",
                "note": ""
              }
            ],
            "revision": "r8",
            "visible": [
              "tool → v2 / A2",
              "view → v2 / A2"
            ],
            "staged": [],
            "resources": [
              "A1 清理中",
              "A2 活跃资源"
            ],
            "invariant": "路由切换不能代替业务写入冲突控制。",
            "log": "S1.release() → leaseCount(A1) = 0"
          },
          {
            "title": "升级完成",
            "explanation": "A1 退出，只剩 A2。若旧调用超过期限，需走取消与明确失败路径，不能报告无损完成。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "disposed",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "active",
                "generation": "A2",
                "note": ""
              },
              {
                "name": "Step S1",
                "state": "completed",
                "generation": "r7",
                "note": ""
              }
            ],
            "revision": "r8",
            "visible": [
              "tool → v2 / A2",
              "view → v2 / A2"
            ],
            "staged": [],
            "resources": [
              "A2 活跃资源"
            ],
            "invariant": "回收旧运行资源，保留所需代码和业务数据记录。",
            "log": "dispose A1 → terminate old runtime"
          }
        ]
      },
      {
        "id": "failure",
        "label": "候选准备失败",
        "steps": [
          {
            "title": "v1 继续服务",
            "explanation": "当前修订 r7，新版本还没有生效。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "activating",
                "generation": "A2",
                "note": ""
              }
            ],
            "revision": "r7",
            "visible": [
              "tool → v1 / A1",
              "view → v1 / A1"
            ],
            "staged": [],
            "resources": [
              "A1 活跃资源",
              "A2 候选资源"
            ],
            "invariant": "当前路由在准备阶段保持不变。",
            "log": "begin A2 preparation"
          },
          {
            "title": "健康检查失败",
            "explanation": "A2 无法就绪，撤销候选注册并清理候选资源。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "deactivating",
                "generation": "A2",
                "note": ""
              }
            ],
            "revision": "r7",
            "visible": [
              "tool → v1 / A1",
              "view → v1 / A1"
            ],
            "staged": [],
            "resources": [
              "A1 活跃资源",
              "A2 清理中"
            ],
            "invariant": "失败发生在提交之前，因此无需把当前路由切回去。",
            "log": "health check failed → discard candidate A2"
          },
          {
            "title": "继续使用旧版本",
            "explanation": "A2 进入失败状态供诊断，A1 继续工作。提交后的故障恢复是另一个需要设计的场景。",
            "nodes": [
              {
                "name": "旧版本 v1",
                "state": "active",
                "generation": "A1",
                "note": ""
              },
              {
                "name": "新版本 v2",
                "state": "failed",
                "generation": "A2",
                "note": ""
              }
            ],
            "revision": "r7",
            "visible": [
              "tool → v1 / A1",
              "view → v1 / A1"
            ],
            "staged": [],
            "resources": [
              "A1 活跃资源"
            ],
            "invariant": "准备失败保留旧版本，不等于承诺任何阶段都能回滚数据。",
            "log": "A2 cleaned; current revision remains r7"
          }
        ]
      }
    ]
  }
];

export const questions = [
  {
    "q": "微内核和 Agent Loop 有什么区别？",
    "a": "内核管理能力如何组合、启停和清理。Agent Loop 负责请求模型、选择工具、推进 Step。把 Loop 作为服务挂载，能保留替换实现的边界。",
    "tags": [
      "职责",
      "Agent"
    ],
    "target": "boundaries"
  },
  {
    "q": "为什么不直接维护一个插件数组？",
    "a": "数组可以记录加载项，但不能单独表达依赖就绪、服务隔离、资源归属和依赖变化后的清理顺序。项目直接使用 Cordis 已有机制，在其上补充产品服务。",
    "tags": [
      "依赖",
      "内核"
    ],
    "target": "mechanisms",
    "topic": "dependencies"
  },
  {
    "q": "一个插件包一定对应一个进程吗？",
    "a": "不一定。包是代码单元，实例关联配置，激活拥有运行资源，进程由 Runtime 分配。可信内置实例可以同进程，业务 Runtime 可以独立进程。",
    "tags": [
      "身份",
      "进程"
    ],
    "target": "boundaries"
  },
  {
    "q": "Context 是全局服务容器吗？",
    "a": "Context 是访问服务与注册资源的入口。派生 Context 可共享服务，isolate 按指定服务键选择 realm，并非通用的父级回退树。Workspace 的服务映射和权限仍由产品宿主明确管理。",
    "tags": [
      "Context",
      "Scope"
    ],
    "target": "mechanisms",
    "topic": "scope"
  },
  {
    "q": "为什么插件有自己的资源容器，还要共享 Scope？",
    "a": "资源归属决定谁退出时清理什么；服务 realm 决定插件能发现哪个服务实例。Cordis 用 Fiber 生命周期与按服务键隔离分别处理两者，产品 Scope 再把 Workspace 映射到这些机制。",
    "tags": [
      "资源",
      "Scope"
    ],
    "target": "mechanisms",
    "topic": "scope"
  },
  {
    "q": "缺少依赖应该报错还是等待？",
    "a": "当前基线是等待并显示缺失项。已知声明图中的依赖环是配置错误；尚未安装的提供者不是环。显式停用和等待依赖也必须分开。",
    "tags": [
      "依赖",
      "waiting"
    ],
    "target": "mechanisms",
    "topic": "dependencies"
  },
  {
    "q": "服务提供者替换后，消费者怎么办？",
    "a": "基础服务按选定契约使受影响消费者重新激活。业务工具是稳定 Tools 服务内的注册项，其升级不应迫使整个 Agent 服务重启。",
    "tags": [
      "服务",
      "升级"
    ],
    "target": "decisions",
    "decision": "D03"
  },
  {
    "q": "为什么工具注册和服务注册要分开？",
    "a": "Agent 依赖稳定的工具注册服务，具体 GitHub 工具只是其中的贡献项。分开之后，工具目录可以变化，而 Agent 的基础依赖不必随每项工具变化而重建。",
    "tags": [
      "Tools",
      "注册"
    ],
    "target": "boundaries"
  },
  {
    "q": "apply 返回就代表业务服务可用了吗？",
    "a": "Cordis 对象插件使用 apply，类服务可用 Service.init。await Fiber 只等待当前任务稳定，也可能仍为 PENDING；应用 ready 由宿主结合依赖、进程健康和业务准备明确判定。",
    "tags": [
      "apply",
      "就绪"
    ],
    "target": "decisions",
    "decision": "D04"
  },
  {
    "q": "把全部操作放进一个队列就安全了吗？",
    "a": "沿用 Cordis 进程内协调。产品宿主可以串行提交启停意图，但不要在全局锁里等待插件代码与其依赖。远程结果还需检查宿主 activationId。",
    "tags": [
      "并发",
      "队列"
    ],
    "target": "mechanisms",
    "topic": "lifecycle"
  },
  {
    "q": "AbortController 能强制停止插件吗？",
    "a": "不能。取消信号需要被调用方协作处理，Promise 超时也不会抢占同步死循环。旧代次仍需禁止发布；真实进程的强制终止交给 Supervisor。",
    "tags": [
      "取消",
      "AbortSignal"
    ],
    "target": "scenarios",
    "scenario": "cancellation"
  },
  {
    "q": "插件已经停止，异步连接却刚刚成功怎么办？",
    "a": "检查资源所属的 activation 是否仍有效。若已失效，立即清理连接，不允许注册服务。这个失败路径和正常返回 disposer 同样重要。",
    "tags": [
      "迟到",
      "资源"
    ],
    "target": "scenarios",
    "scenario": "cancellation"
  },
  {
    "q": "清理时为什么先停消费者？",
    "a": "消费者的收尾可能依赖提供者，例如取消持久化订阅。先撤销新入口，再保留必要的清理访问；消费者释放依赖后，提供者才关闭底层资源。",
    "tags": [
      "清理",
      "依赖"
    ],
    "target": "scenarios",
    "scenario": "cleanup"
  },
  {
    "q": "最后返回一个 dispose 函数够不够？",
    "a": "若 apply 中途失败，最后的 disposer 不会返回。使用 Cordis effect / generator，获得资源后及时 yield 清理；onDispose 如需提供，属于产品 SDK 扩展。",
    "tags": [
      "dispose",
      "effect"
    ],
    "target": "decisions",
    "decision": "D06"
  },
  {
    "q": "工具出现了但界面初始化失败，怎么撤销？",
    "a": "先把工具和界面加入暂存批次，所有准备成功后统一发布。准备失败撤销暂存并释放资源，普通读者从未看见这批半成品。",
    "tags": [
      "事务",
      "UI"
    ],
    "target": "scenarios",
    "scenario": "transaction"
  },
  {
    "q": "注册事务能回滚数据库写入吗？",
    "a": "不能自动做到。注册事务控制能力的可见性；外部写入必须由业务事务、补偿或幂等策略管理。候选预热阶段应限制共享状态写入。",
    "tags": [
      "事务",
      "数据"
    ],
    "target": "upgrade"
  },
  {
    "q": "热升级只冻结工具 Schema 够吗？",
    "a": "还要冻结执行目标。否则旧 Step 依据旧参数定义生成的调用，可能被路由到新版本处理器。租约应同时持有定义、目标和生命周期。",
    "tags": [
      "升级",
      "快照"
    ],
    "target": "scenarios",
    "scenario": "upgrade"
  },
  {
    "q": "旧版本一直有任务，能无限等吗？",
    "a": "需要选择排空政策：有界等待到期取消，或明确保留旧运行环境并让用户管理。期限应结合任务预算，不能靠无限延长资源寿命解决。",
    "tags": [
      "排空",
      "超时"
    ],
    "target": "decisions",
    "decision": "D10"
  },
  {
    "q": "新版本提交后坏了，切回代码就行吗？",
    "a": "还要检查数据格式和已经发生的副作用。准备失败保留旧版本比较直接；提交后的回退必须定义兼容性、写入权交接和恢复策略。",
    "tags": [
      "回滚",
      "数据"
    ],
    "target": "upgrade"
  },
  {
    "q": "Context 可以完整通过 RPC 传过去吗？",
    "a": "应拆成受控协议。生命周期回调和资源留在本进程，服务调用传可序列化值，函数由 SDK 绑定为处理器 ID。宿主保持权威注册和身份。",
    "tags": [
      "RPC",
      "Context"
    ],
    "target": "interfaces"
  },
  {
    "q": "请求里写上 pluginId 就能确认身份吗？",
    "a": "调用方可以伪造字段。宿主应从已经认证并绑定的连接读取实例、激活与作用域，再结合权限判定。请求只能引用它有权操作的资源。",
    "tags": [
      "权限",
      "RPC"
    ],
    "target": "interfaces"
  },
  {
    "q": "Node 子进程是不是安全沙箱？",
    "a": "它能帮助隔离进程故障和执行寿命，但默认仍可能访问本机文件、网络和凭证。首版只执行可信插件；开放任意代码前需真正的系统隔离。",
    "tags": [
      "安全",
      "进程"
    ],
    "target": "interfaces"
  },
  {
    "q": "为什么事件不承担所有业务请求？",
    "a": "请求需要明确的处理者、结果、超时与错误契约。通知适合观察状态变化；把授权、返回值和通知混在同一个事件里会让行为依赖隐含顺序。",
    "tags": [
      "事件",
      "服务"
    ],
    "target": "mechanisms",
    "topic": "events"
  },
  {
    "q": "运行状态如何保存到下次启动？",
    "a": "保存实例配置、启用状态、版本和业务事实；进程、Promise、Context 和连接对象重新创建。未完成操作需要标记中断并判断是否可安全恢复。",
    "tags": [
      "持久化",
      "恢复"
    ],
    "target": "decisions",
    "decision": "D11"
  },
  {
    "q": "关窗口和退出应用，插件都应该停止吗？",
    "a": "这是尚需决定的产品运行策略。关闭窗口可以保留后台运行；退出进程则需要关闭或移交 Runtime。不要在没有明确策略时让两者隐式等价。",
    "tags": [
      "后台",
      "桌面"
    ],
    "target": "decisions",
    "decision": "D11"
  },
  {
    "q": "先写哪一部分，最容易验证方向？",
    "a": "先运行现有 Cordis 测试与生命周期样例，再映射 Workspace、产品实例和原生状态。接着做 Tools / Views 注册服务，最后接入进程、模型与界面。",
    "tags": [
      "路线",
      "测试"
    ],
    "target": "roadmap"
  },
  {
    "q": "要直接复制 Cordis 的全部 API 吗？",
    "a": "已决定直接引入 Cordis core 并维护本地分支。原生 API 沿用源码；后续可以修改并补回归测试。产品的 Workspace、RPC 和注册发布仍要补充。",
    "tags": [
      "Cordis",
      "选型"
    ],
    "target": "sources"
  },
  {
    "q": "如何知道失败后有没有遗留资源？",
    "a": "让诊断快照关联 instance、activation、依赖、注册数量和待清理资源。测试里检查释放后的计数与迟到消息，而不只检查状态变成 stopped。",
    "tags": [
      "诊断",
      "资源"
    ],
    "target": "decisions",
    "decision": "D12"
  }
];
