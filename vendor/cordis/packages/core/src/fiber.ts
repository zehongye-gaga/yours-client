// 本文件管理一次插件注册的生命周期：依赖齐备才加载，依赖变化先清理，再按最新目标加载。
// Fiber 在这里不是线程或协程，而是保存配置、依赖绑定、状态与清理函数的对象。
// 顺着源码读：配置校验 → effect 协议 → Fiber 建立 → 副作用收集 → 状态切换 → 更新入口。
// 导入用途：Awaitable/Dict/Plugin/Impl/StandardSchemaV1 描述数据形状；Context 是能力入口；
// defineProperty 写内部元信息，isNullable 判空；utils 提供清理列表、对象/构造器判断、跟踪与诊断。
import { Awaitable, defineProperty, Dict, isNullable } from 'cosmokit'
import { Context } from './context.ts'
import { Plugin } from './registry.ts'
import { buildOuterStack, composeError, DisposableList, getTraceable, isConstructor, isObject, symbols } from './utils.ts'
import { Impl } from './reflect.ts'
import { StandardSchemaV1 } from '@standard-schema/spec'

// 模块补充声明只扩展类型。Pick<Fiber, 'effect'> 从 Fiber 的类型取出 effect 方法签名，
// 不复制方法实现；ctx.effect 的运行时转发由 ReflectService.mixin 建立。
declare module './context.ts' {
  export interface Context extends Pick<Fiber, 'effect'> {
    fiber: Fiber
  }
}

const kValidationError = Symbol.for('ValidationError')

export class ValidationError extends TypeError {
  name = 'ValidationError'

  constructor(public issues: readonly StandardSchemaV1.Issue[]) {
    // 参数属性 public 同时保存 issues。readonly 数组只禁止经此类型改数组，不会冻结输入对象。
    super(`invalid config:\n` + issues.map(issue => {
      if (issue.path?.length) {
        return `  - ${issue.message} (at ${ValidationError.formatPath(issue.path)})`
      } else {
        return `  - ${issue.message}`
      }
    }).join('\n'))
  }

  static is(error: unknown): error is ValidationError {
    // unknown 要先检查才可安全当特定类型使用；返回注解让通过检查的分支得到类型收窄。
    return !!error?.[kValidationError]
  }

  static normalizePath(path: StandardSchemaV1.Issue['path'] = []) {
    // T['path'] 是索引访问类型；运行时将协议允许的两种路径片段统一成键，再格式化为 a.b。
    return path.map(segment => typeof segment === 'object' ? segment.key : segment)
  }

  static formatPath(path: StandardSchemaV1.Issue['path']) {
    return ValidationError.normalizePath(path).map(String).join('.')
  }
}

Object.defineProperty(ValidationError.prototype, kValidationError, {
  // 共享 symbol 标记放在原型上，is() 据此识别错误；不要求来自同一个类构造器实例。
  value: true,
})

export function resolveConfig(runtime: Plugin.Runtime, config: any) {
  // 有 Config 才校验，并返回校验器给出的 value（可能已转换），不是总把原对象原样传给插件。
  if (!runtime.Config) return config
  // TODO: async validation
  const result = runtime.Config['~standard'].validate(config)
  if ('then' in result) {
    // 本实现拒绝异步校验。探测 then 是查看协议形状，不是 instanceof Promise。
    throw new TypeError('Async config validation is not supported')
  }
  if (result.issues) {
    throw new ValidationError(result.issues)
  } else {
    return result.value
  }
}

// 此句柄既可调用来清理，也可 await 等初始化完成后拿到另一清理函数。
// PromiseLike 只要求 then 协议，不表示它一定是 Promise 实例；这些接口会从 JS 中擦除。
interface AsyncDisposable<T extends Awaitable<void> = Awaitable<void>> extends PromiseLike<() => T> {
  (): T
}

export type Disposable<T = any> = () => T

export type Effect<T = any> =
  | SyncEffect<T>
  | AsyncEffect<T>

// effect 的结果可以是一个清理函数，或通过迭代逐个交出的清理函数；异步形式等待后再收集。
// | 是“这些形状之一”，不是同时具备。下面 _execute 才负责辨认实际返回值。
type SyncEffect<T = any> =
  | Disposable<T>
  | Iterable<Disposable<T>, void, void>

type AsyncEffect<T = any> =
  | Promise<Disposable<T>>
  | AsyncIterable<Disposable<T>, void, void>

export interface EffectMeta {
  // 仅供观察副作用树：label 描述来源，children 保留嵌套 effect 的元信息。
  label: string
  children: EffectMeta[]
}

interface EffectRunner<T> {
  // epoch 标记这一轮是否仍有效；execute 做初始化，collect 接收它产生的清理函数。
  epoch: T
  execute: () => any
  collect: (dispose: Disposable) => void
  getOuterStack: () => string[]
}

// 状态是互斥的标签，不是位掩码；const enum 允许编译器把使用处展开成数值。
// PENDING 等依赖，LOADING/UNLOADING 表示进行中；ACTIVE 可用，FAILED 留待 update 重试，DISPOSED 已移除。
export const enum FiberState {
  PENDING,
  LOADING,
  ACTIVE,
  FAILED,
  DISPOSED,
  UNLOADING,
}

export class CordisError extends Error {
  constructor(public code: CordisError.Code, message?: string) {
    super(message ?? CordisError.Code[code])
  }
}

export namespace CordisError {
  // 类与 namespace 同名合并；类型 Code 是对象 Code 的键名联合，运行时 Code 保存对应消息。
  export type Code = keyof typeof Code

  export const Code = {
    INACTIVE_EFFECT: 'cannot create effect on inactive context',
  } as const
}

const INACTIVE = '__INACTIVE__'

export class Fiber {
  // uid 是注册身份，根为 0，插件为递增数字，null 表示永久移除。ctx 是交给插件使用的子上下文。
  // readonly 限制重新赋值，不冻结所引用的对象；provisions 这个 Set 仍可 add/delete。
  public uid: number | null
  public readonly ctx: Context
  public state = FiberState.PENDING
  public readonly dispose: () => Promise<void>
  // committed 是本轮运行已绑定的依赖快照；provisions 是“我提供给别人的实现”，方向相反。
  // Readonly 只约束表的类型，里面的 Impl 对象仍共享；inertia 是当前加载/卸载过程的 Promise。
  public committed: Readonly<Dict<Impl>> | undefined
  public readonly provisions = new Set<Impl>()
  public inertia: Promise<void> | undefined

  public readonly _hooks: Dict<DisposableList<Function>> = Object.create(null)
  // _hooks 保存本实例的局部事件；_disposables 拥有需要清理的副作用句柄，不是全局资源列表。
  public readonly _disposables = new DisposableList<Disposable>()

  // Same as `this.ctx`, but with a more specific type.
  protected context: Context

  // _store 跟踪当前可用的依赖候选；重载开始时再复制为 committed，避免运行中悄悄换绑定。
  // _revision 让“依赖没变但要求重启”也成为新一轮；_error 保留失败原因，_release 唤醒等待的提供者。
  private _error: any
  private _revision = 0
  private _runner: EffectRunner<string>
  private _store: Dict<Impl> = Object.create(null)
  private _release: (() => void) | undefined

  constructor(
    // 带 public 的构造参数会存成实例字段；parent 是父上下文，runtime 为 null 仅用于根 Fiber。
    public parent: Context,
    public config: any,
    public inject: Dict<any>,
    public runtime: Plugin.Runtime | null,
    getOuterStack: () => string[],
  ) {
    const collect = (dispose: Disposable) => {
      this._disposables.push(dispose)
    }

    if (runtime) {
      this.uid = parent.registry.counter
      this.ctx = this.context = parent.extend({ fiber: this })

      // 定义这份执行计划时尚未执行插件；后面的依赖刷新决定何时进入 _reload。
      this._runner = {
        epoch: INACTIVE,
        getOuterStack,
        execute: function (this: Fiber) {
          const config = this._resolve(this.config)
          if (isConstructor(runtime.callback)) {
            // 可构造入口用 new，创建实例后先跑装饰器登记的钩子，再取可选 init 的结果。
            // 这里并非只靠 TS 的 class 语法识别，普通有可构造形状的函数也可能进入此分支。
            // eslint-disable-next-line new-cap
            const instance = new runtime.callback(this.ctx, config)
            for (const hook of instance?.[symbols.initHooks] ?? []) {
              hook()
            }
            return instance?.[symbols.init]?.()
          } else {
            // 非构造入口直接调用，返回值交给 _execute 作为 effect 收集。
            return runtime.callback(this.ctx, config)
          }
        },
        collect,
      }

      this.context.emit('internal/plugin', this)

      // 初始化依赖候选；缺任意一项时 _refresh 会保持 PENDING，注册本身仍已完成。
      for (const name of Object.keys(this.inject)) {
        this._checkImpl(name)
      }

      this.dispose = parent.fiber.effect(() => {
        // 子 Fiber 的清理属于父 Fiber 的 effect，所以父插件卸载会带动它注册的子插件清理。
        const remove = runtime.fibers.push(this)
        try {
          this._refresh()
        } catch (error) {
          this.ctx.logger.error(error)
          this._error = error
        }
        return async () => {
          // 这个闭包稍后才执行，保留原 Fiber/runtime/remove；先作废身份，再撤出注册列表。
          this.uid = null
          this.context.emit('internal/plugin', this)
          if (this.ctx.registry.has(runtime.callback)) {
            remove()
            if (!runtime.fibers.length) {
              this.ctx.registry.delete(runtime.callback)
            }
          }
          this._setEpoch(INACTIVE)
          // 当前过程结束可能接出下一段卸载，故循环等到 inertia 真正清空。
          // `inertia` never rejects: `_reload` and `_unload` both log their
          // own work errors. A rejection here would mean the logger itself
          // failed, so let it propagate.
          while (this.inertia) {
            await this.inertia
          }
          // `_setEpoch()` above returns early for a fiber that was not ACTIVE,
          // so the cached state is not refreshed. Re-derive it now that
          // `uid` is null; the empty callback falls through to `_getState()`.
          this._updateState(() => {})
        }
      }, 'ctx.plugin()')
    } else {
      // 根没有插件入口和依赖，直接 ACTIVE；根 dispose 等价于 restart：清掉其副作用后仍可复用。
      this.uid = 0
      this.ctx = this.context = parent
      this.state = FiberState.ACTIVE
      this.committed = Object.create(null)
      this._runner = {
        epoch: '0',
        getOuterStack,
        execute: () => {},
        collect,
      }
      this.dispose = () => this.restart()
    }
  }

  get name() {
    // 自己没有显示名就沿父 Fiber 找，最终回落为 root；此名不充当插件身份键。
    let fiber: Fiber = this
    do {
      if (fiber.runtime?.name) return fiber.runtime.name
      fiber = fiber.parent.fiber
    } while (fiber !== fiber.parent.fiber)
    return 'root'
  }

  assertActive() {
    // 名称容易误读：只禁止已 dispose 的 uid=null；PENDING/LOADING 等阶段仍允许创建 effect。
    if (this.uid !== null) return
    throw new CordisError('INACTIVE_EFFECT')
  }

  private _resolve(config: any) {
    // 给事件调用链一个返回原始配置的终点，默认监听器会校验；其他监听可包裹这个过程。
    return this.context.waterfall('internal/config', this, () => config)
  }

  private _execute<T>(runner: EffectRunner<T>) {
    // 统一适配初始化结果。T 只区分 epoch 的类型；执行前保存 oldEpoch 检测异步迭代是否过期。
    const oldEpoch = runner.epoch
    return composeError((info) => {
      const safeCollect = (dispose: void | Disposable) => {
        // 空结果允许；非空结果必须为函数。不会自动把任意对象的 dispose 方法当清理协议。
        if (typeof dispose === 'function') {
          runner.collect(dispose)
        } else if (!isNullable(dispose)) {
          throw new TypeError('Invalid effect')
        }
      }
      const effect: Effect = runner.execute.call(this)
      if (typeof effect === 'function') {
        return runner.collect(effect)
      } else if (isNullable(effect)) {
        // return
      } else if (!isObject(effect)) {
        throw new TypeError('Invalid effect')
      } else if ('then' in effect) {
        // 等 Promise/thenable 交出清理函数；本分支没有 epoch 取消，已经启动的异步工作仍会结束。
        return effect.then(safeCollect)
      } else if (Symbol.iterator in effect) {
        // 同步生成器会一路 next 到 done，每次产出（包含最后的返回值）都过 safeCollect。
        info.error = new Error()
        const iter = effect[Symbol.iterator]()
        while (true) {
          const result = iter.next()
          safeCollect(result.value)
          if (result.done) return
        }
      } else if (Symbol.asyncIterator in effect) {
        // 异步迭代每轮在发起 next 前检查 epoch；不能强行中断一个已经在等待的 next()。
        const iter = effect[Symbol.asyncIterator]()
        return (async () => {
          // force async stack trace
          await Promise.resolve()
          info.error = new Error()
          while (true) {
            if (runner.epoch !== oldEpoch) return
            const result = await iter.next()
            safeCollect(result.value)
            if (result.done) return
          }
        })()
      } else {
        throw new TypeError('Invalid effect')
      }
    }, runner.getOuterStack)
  }

  // 重载描述同步/异步初始化的调用接口，下面只有一个实现。
  // execute 立即开始；返回 wrapper 用于之后清理，await wrapper 则等待初始化并取清理函数。
  // 签名中的 Promise 不意味着每条运行路径都创建 Promise：纯同步清理路径实际也可能返回 undefined。
  effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>
  effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>
  effect(execute: () => Effect, label = 'anonymous'): any {
    this.assertActive()

    const disposables: Disposable[] = []
    const dispose = () => {
      // 本 effect 内后收集的先清理；遇到异步清理后，余下的接到 then 链中顺序执行。
      // splice 先拿空列表，使重复清理不会重复执行已取出的函数；同步抛错仍会向调用者传播。
      let task!: void | Promise<void>
      for (const dispose of disposables.splice(0).reverse()) {
        if (task) {
          task = task.then(dispose)
        } else {
          const result = dispose()
          if (isObject(result) && 'then' in result) {
            task = result as any
          }
        }
      }
      return task
    }

    const meta: EffectMeta = { label, children: [] }
    const runner: EffectRunner<boolean> = {
      execute,
      epoch: true,
      collect: (dispose) => {
        disposables.push(dispose)
        this._disposables.delete(dispose)
        // 如果收集的是内层 effect，把它从 Fiber 顶层列表移走，避免父/子层各清理一次。
        if (dispose[symbols.effect]) {
          meta.children.push(dispose[symbols.effect])
        }
      },
      getOuterStack: buildOuterStack(),
    }

    let task: void | Promise<void>
    try {
      task = this._execute(runner)
    } catch (reason) {
      // 初始化同步失败时先清理已经收集的部分，再把错误交给调用者。
      dispose()
      throw reason
    }

    // prevent unhandled rejection — both from `task` itself and from the
    // disposer chain if it fails to settle cleanly.
    task?.catch(dispose).catch((error) => this.ctx.logger.error(error))

    const wrapper = defineProperty(() => {
      // 箭头函数闭包保存 runner/task/disposables；epoch=false 让主动清理只启动一次。
      if (!runner.epoch) return
      runner.epoch = false
      return task ? task.then(dispose) : dispose()
    }, symbols.effect, meta) as AsyncDisposable

    const disposeAsync = () => {
      if (!runner.epoch) return
      runner.epoch = false
      return dispose()
    }
    wrapper.then = async (onFulfilled, onRejected) => {
      // await 会调用 then；交出不带 then 的 disposeAsync，避免 Promise 继续吸收同一个句柄。
      return Promise.resolve(task)
        .then(() => disposeAsync)
        .then(onFulfilled, onRejected)
    }
    disposables.push(this._disposables.push(wrapper))
    // push 返回“从顶层列表移除 wrapper”的函数，把它也纳入局部清理，保持两边记录一致。
    return wrapper
  }

  getEffects() {
    // 只返回带元信息的顶层副作用，children 表示嵌套关系，不会执行清理。
    return [...this._disposables]
      .map<EffectMeta>(dispose => dispose[symbols.effect])
      .filter(Boolean)
  }

  private _getState() {
    // 稳定状态的优先级：已移除 → 失败 → epoch 有效 → 等待依赖；过渡状态另由 _updateState 指定。
    if (this.uid === null) return FiberState.DISPOSED
    if (this._error) return FiberState.FAILED
    if (this._runner.epoch !== INACTIVE) return FiberState.ACTIVE
    return FiberState.PENDING
  }

  private _updateState(callback: () => void | FiberState) {
    const oldState = this.state
    this.state = callback() ?? this._getState()
    // callback 可以显式返回 LOADING/UNLOADING；否则重新推导稳定状态。
    if (oldState === this.state) return
    // FIXME internal/fiber-info
    this.context.emit('internal/status', this, oldState)

    // only notify changes between ACTIVE and NON-ACTIVE states
    if (oldState !== FiberState.ACTIVE && this.state !== FiberState.ACTIVE) return
    for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
      const impl = this.ctx.reflect.store[key as symbol]
      if (impl.ctx.fiber !== this) continue
      this.ctx.isolate(impl.name, impl.isolate).reflect.notify([impl.name])
    }
  }

  _checkImpl(name: string) {
    // 在当前隔离域找 ACTIVE 实现，再调用可选 check；不满足或检查抛错就移除候选。
    const impl = this.ctx.reflect._getImpl(name, true)
    if (!impl) return delete this._store[name]
    try {
      if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) {
        return delete this._store[name]
      }
    } catch (error) {
      impl.ctx.logger.error(error)
      return delete this._store[name]
    }
    this._store[name] = impl
  }

  _refresh() {
    // epoch 是“重启修订号 + 各依赖 Impl.uid”的字符串签名，不是时间戳或配置内容的散列。
    // 一项缺失即 INACTIVE；同名服务换新 Impl 或 restart 增修订号都会改变签名。
    let epoch = `${this._revision}`
    for (const name of Object.keys(this.inject)) {
      const impl = this._store[name]
      if (!impl) {
        epoch = INACTIVE
        break
      }
      epoch += ':' + impl.uid
    }
    this._setEpoch(epoch)
  }

  private _setEpoch(epoch: string) {
    // 合并调度入口：相同目标不重复做；失败由 update 清除后才能恢复。
    const oldEpoch = this._runner.epoch
    if (epoch === oldEpoch) return
    // a failed fiber only recovers through update(), which clears _error
    if (this._error) return
    this._runner.epoch = epoch
    if (this.inertia) return
    // 若已有过程在途，只记录最新 epoch，由那一轮完成时接续，避免并发运行两次插件主体。
    this._updateState(() => {
      if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
        this.inertia = this._reload()
        return FiberState.LOADING
      } else {
        this.inertia = this._unload()
        return FiberState.UNLOADING
      }
    })
  }

  private async _reload() {
    // 固定本轮依赖快照并登记反向引用：提供者因此知道“还有谁正在用我”。
    this.committed = { ...this._store }
    for (const impl of Object.values(this.committed)) {
      if (impl.ctx.fiber === this) continue
      impl.dependents.add(this)
    }
    const oldEpoch = this._runner.epoch
    try {
      await Promise.resolve()
      // 让出微任务后再确认目标没过期，避免刚安排加载又立刻失效时仍执行旧入口。
      if (this._runner.epoch === oldEpoch) {
        await this._execute(this._runner)
      }
    } catch (reason) {
      // impl guarantees that the error is non-null (?)
      this.ctx.logger.error(reason)
      // A superseded load still needs cleanup, but cannot fail the new target.
      if (this._runner.epoch === oldEpoch) {
        this._error = reason
        this._runner.epoch = INACTIVE
      }
    }
    this._updateState(() => {
      if (this._runner.epoch === oldEpoch) {
        this.inertia = undefined
      } else {
        this.inertia = this._unload()
        return FiberState.UNLOADING
      }
    })
  }

  private async _unload() {
    // 先等使用我所提供服务的 Fiber 卸载，后清理我的资源；这样消费者清理时仍可用旧服务。
    // 此等待靠反向依赖集合与 _release 唤醒，不靠固定延时。
    // Dependents are notified when this fiber leaves ACTIVE, but may still
    // access its services during their own teardown, so the effects of this
    // fiber are only disposed after every dependent has unloaded.
    while ([...this.provisions].some(impl => impl.dependents.size)) {
      await new Promise<void>((resolve) => this._release = resolve)
    }
    this._release = undefined
    await Promise.all(this._disposables.clear().map(async (dispose) => {
      // clear 只取出记录；这里才调用。顶层句柄按逆注册顺序启动，但通过 Promise.all 并行等待，
      // 不要误以为所有顶层异步清理都串行。单个 effect 内部的清理顺序见上方 dispose 闭包。
      try {
        await composeError(async (info) => {
          await Promise.resolve()
          info.error = new Error()
          await dispose()
        }, this._runner.getOuterStack)
      } catch (reason) {
        this.ctx.logger.error(reason)
      }
    }))
    // release the providers waiting for this fiber to unload
    for (const impl of Object.values(this.committed ?? {})) {
      // 我已清理完，解除对依赖服务的占用；最后一个消费者离开时唤醒正在撤下/卸载的提供者。
      if (!impl.dependents.delete(this) || impl.dependents.size) continue
      impl.release?.()
      impl.ctx.fiber._release?.()
    }
    this.committed = undefined
    this._updateState(() => {
      // 这期间目标可能又变了：仍 INACTIVE 就结束，否则接着加载最新一轮。
      if (this._runner.epoch === INACTIVE) {
        this.inertia = undefined
      } else {
        this.inertia = this._reload()
        return FiberState.LOADING
      }
    })
  }

  async await() {
    // await 是普通方法名。等当前加载/卸载稳定并传播记录的失败；PENDING 也可立即返回，
    // 不承诺依赖未来一定出现，更不等于“插件已经 ACTIVE”。
    while (this.inertia) {
      await this.inertia
    }
    if (this._error) throw this._error
    return this
  }

  async restart() {
    // 总是取 ctx.fiber 的原对象，避免在 registry 返回的原型包装对象上另存状态。
    // 修订号递增使显式重启在依赖不变时也有效；本方法本身不会清除失败原因。
    const fiber = this.ctx.fiber
    fiber.assertActive()
    fiber._revision++
    fiber._refresh()
    await fiber.await()
  }

  update(config: any, noSave = false): Awaitable<void> {
    // 已有有效目标时先校验新配置；校验失败会在覆盖原配置前抛出。
    // noSave 只跳过 internal/commit 通知，下面仍会写 fiber.config，并清除旧失败以允许重试。
    const fiber = this.ctx.fiber
    fiber.assertActive()
    const loaded = fiber._runner.epoch !== INACTIVE
    const resolved = loaded ? fiber._resolve(config) : undefined
    if (!noSave) fiber.context.emit('internal/commit', fiber, config)
    fiber.config = config
    fiber._error = undefined
    const restart = () => fiber.restart()
    // 局部/全局 update 监听可处理配置并截断 next；走到终点才默认重启。
    const result = loaded
      ? fiber.context.waterfall(fiber, 'internal/update', resolved, restart)
      : restart()
    // a listener may veto the restart, in which case there is nothing to await
    if (result === undefined) return
    const task = Promise.resolve(result)
    // the failure is already reported by the fiber, so mark it handled here:
    // a caller that drops the result cannot turn it into an unhandled
    // rejection, while `await update()` still observes it
    task.catch(() => {})
    return task
  }
}
