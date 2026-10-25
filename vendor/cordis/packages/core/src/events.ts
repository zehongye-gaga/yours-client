// 本文件维护事件监听表，并提供不同的派发策略；监听注册本身是 Fiber 拥有的副作用。
// 阅读顺序：事件调用的类型 → 内建钩子 → 派发方式 → 注册/注销 → 内部事件协议。
// 导入用途：Awaitable 表示同步值或 Promise，Promisify 将结果类型包装为 Promise；
// defineProperty 写跟踪元信息；
// Context 提供过滤符号，Fiber/FiberState 描述事件参数，resolveConfig 校验插件配置；
// DisposableList 存可移除的回调，symbols 是内部属性键。
import { Awaitable, defineProperty, Promisify } from 'cosmokit'
import { Context } from './context.ts'
import { Fiber, FiberState, resolveConfig } from './fiber.ts'
import { DisposableList, symbols } from './utils.ts'

export function isBailed(value: any) {
  // 只有 null、undefined、false 表示继续。0 和空字符串也算有效结果，不能用 if (value) 替代。
  return value !== null && value !== false && value !== undefined
}

// 条件类型 + infer 从函数形状提取参数元组、返回值和 this 类型；不调用函数，也不生成 JS。
// TS 签名里的 this: T 是接收者注解，不占一个实际参数；运行时接收者由 call/apply 决定。
export type Parameters<F> = F extends (...args: infer P) => any ? P : never
export type ReturnType<F> = F extends (...args: any) => infer R ? R : never
export type ThisType<F> = F extends (this: infer T, ...args: any) => any ? T : never

// 字符串字面量联合限制允许的模式名称，与运行时枚举对象不同。
export type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall'

// 补充 Context 的类型，实际入口由 ReflectService.mixin 转发到本服务。
// K 由事件名推导，Events[K] 决定参数和结果；NoInfer 避免 thisArg 反过来干扰事件名推导。
// 每对重载支持 (name, ...args) 或 (thisArg, name, ...args)，不是两份实现。
declare module './context.ts' {
  export interface Context {
    /* eslint-disable max-len */
    parallel<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promise<void>
    parallel<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promise<void>
    emit<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): void
    emit<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): void
    serial<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType<Events[K]>>
    serial<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType<Events[K]>>
    bail<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
    bail<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
    waterfall<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
    waterfall<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType<Events[K]>
    on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
    once<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean
    /* eslint-enable max-len */
  }
}

export interface EventOptions {
  // prepend 把普通监听插到队首；global 跳过派发者的 Context.filter 过滤，仍受所属 Fiber 清理。
  prepend?: boolean
  global?: boolean
}

export interface Hook extends EventOptions {
  // ctx 记录注册位置，供过滤与生命周期归属使用；它不自动成为 callback 的 this。
  ctx: Context
  callback: (...args: any[]) => any
}

export class EventsService {
  // 共享的事件名 → Hook[] 表。Object.create(null) 不继承 toString 等键，适合当字典。
  // Record<keyof any, ...> 是类型层的键值映射；实际事件名可为字符串或 symbol。
  _hooks: Record<keyof any, Hook[]> = Object.create(null)

  constructor(private ctx: Context) {
    // 参数属性 private ctx 会保存参数；tracker 让内建事件服务按使用它的 ctx 注册副作用。
    defineProperty(this, symbols.tracker, {
      property: 'ctx',
      noShadow: true,
    })

    // 特例：普通 internal/update 监听属于一个 Fiber，而非整个环境，重载时应随它一起移除。
    // 普通 function 保留可由派发者指定的 this；箭头函数则捕获外层 this。
    this.on('internal/listener', function (this: Context, name, listener, options: EventOptions) {
      if (name === 'internal/update' && !options.global) {
        const hooks = this.fiber._hooks['internal/update'] ??= new DisposableList()
        const method = options.prepend ? 'unshift' : 'push'
        // 按当前实现，prepend 会尝试 unshift；DisposableList 仅有 push，勿据此推断此特例支持 prepend。
        return this.fiber.effect(() => hooks[method](listener), 'ctx.on("internal/update")')
      }
    })

    // 全局桥接器在更新时取出目标 Fiber 的局部回调；闭包 cbs 是本次调用的快照。
    // 每次 next() 继续下一个回调，末尾交回外层 next，最终是否重启由调用链决定。
    this.on('internal/update', function (config, next) {
      const cbs = [...this._hooks['internal/update'] || []]
      const _next = () => {
        const cb = cbs.shift() ?? next
        return cb.call(this, config, _next)
      }
      return _next()
    }, { global: true, prepend: true })

    // 配置也通过调用链处理：先取 next() 的原始值，再用插件声明的协议校验/转换。
    this.on('internal/config', (fiber, next) => {
      return resolveConfig(fiber.runtime!, next())
    })
  }

  private _resolve(type: string, args: any[]) {
    // 解析重载并直接移除 args 的前缀，留下真正传给监听器的参数。
    const thisArg = typeof args[0] === 'object' || typeof args[0] === 'function' ? args.shift() : null
    const name: string | symbol = args.shift()
    if ((typeof name !== 'string' || !name.startsWith('internal/')) && this._hooks['internal/dispatch']?.length) {
      this.emit('internal/dispatch', type, name, args, thisArg)
    }
    const filter = thisArg?.[Context.filter]
    // 过滤用注册时的 hook.ctx；执行时的 this 却是本次传入的 thisArg。
    // 先生成 callback 快照，派发途中增删监听不会改变这次已选中的数组。
    const callbacks = (this._hooks[name] || [])
      .filter(hook => hook.global || !filter || filter.call(thisArg, hook.ctx))
      .map(hook => hook.callback)
    // as const 保留元组位置和只读类型，不会冻结运行时数组。
    return [thisArg, callbacks, name] as const
  }

  /** @deprecated */
  dispatch(type: string, args: any[]) {
    // 旧接口只返回绑定好 this 的函数列表，本身尚未调用这些函数。
    const [thisArg, callbacks] = this._resolve(type, args)
    return callbacks.map(callback => callback.bind(thisArg))
  }

  async parallel(...args: any[]) {
    // 同时启动所有监听器，等全部 settled 后汇总错误；单个失败不使等待提前结束。
    const [thisArg, callbacks, name] = this._resolve('parallel', args)
    const results = await Promise.allSettled(callbacks.map(async callback => Reflect.apply(callback, thisArg, args)))
    const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    // 上面的类型谓词让 TS 知道这些结果有 reason 字段；真正过滤仍靠 status 比较。
    if (!errors.length) return
    const label = typeof name === 'symbol' ? String(name) : `"${name}"`
    throw new AggregateError(errors.map(error => error.reason), `one or more listeners of event ${label} failed`)
  }

  emit(...args: any[]) {
    // 同步依次调用，丢弃返回值。不会等待异步监听；同步抛错会中断这个 for 循环。
    const [thisArg, callbacks] = this._resolve('emit', args)
    for (const callback of callbacks) Reflect.apply(callback, thisArg, args)
  }

  async serial(...args: any[]) {
    // 逐个 await，遇到首个有效结果就停止；这里的“serial”包含短路，并非保证跑完所有监听。
    const [thisArg, callbacks] = this._resolve('serial', args)
    for (const callback of callbacks) {
      const result = await Reflect.apply(callback, thisArg, args)
      if (isBailed(result)) return result
    }
  }

  bail(...args: any[]) {
    // serial 的同步版本；若监听器返回 Promise，这里会把 Promise 本身视为有效结果并返回。
    const [thisArg, callbacks] = this._resolve('bail', args)
    for (const callback of callbacks) {
      const result = Reflect.apply(callback, thisArg, args)
      if (isBailed(result)) return result
    }
  }

  waterfall(...args: any[]) {
    // 这里的 waterfall 是 next 调用链，不是自动把上一个返回值传给下一个。
    // 最后一个参数 inner 是终点函数；监听器不调用 next，就可截断链或自行返回结果。
    const [thisArg, callbacks] = this._resolve('waterfall', args)
    const inner = args.pop()
    const dispatch = () => {
      const callback = callbacks.shift()
      if (!callback) return inner()
      let called = false
      // 每个监听器各有自己的 called 闭包，所以 await 后再调用第二次 next 也会被拒绝。
      const next = () => {
        if (called) throw new Error('next() called multiple times')
        called = true
        return dispatch()
      }
      return Reflect.apply(callback, thisArg, [...args, next])
    }
    return dispatch()
  }

  private register(label: string, name: string | symbol, callback: any, options: EventOptions): () => void {
    // effect 执行注册并保存反向操作；返回的清理函数可主动调用，也会随所属 Fiber 清理。
    const method = options.prepend ? 'unshift' : 'push'
    return this.ctx.fiber.effect(() => {
      const hooks = this._hooks[name] ??= []
      hooks[method]({ ctx: this.ctx, callback, ...options })
      return () => this.unregister(name, callback)
    }, label)
  }

  private unregister(name: string | symbol, callback: any) {
    // 按函数对象身份移除一项，最后一项删掉时也删除事件键。
    const hooks = this._hooks[name]
    if (!hooks) return
    const index = hooks.findIndex(hook => hook.callback === callback)
    if (index >= 0) {
      hooks.splice(index, 1)
      if (!hooks.length) delete this._hooks[name]
      return true
    }
  }

  on(name: string | symbol, listener: (...args: any) => any, options?: boolean | EventOptions) {
    // 布尔值是 prepend 的简写；对象形式还能指定 global。
    if (typeof options !== 'object') {
      options = { prepend: options }
    }

    // handle special events
    this.ctx.fiber.assertActive()
    // bind 包装监听器接收到的对象，使服务参数仍能追踪上下文；不是预先把 this 固定成 ctx。
    listener = this.ctx.reflect.bind(listener)
    const result = this.bail(this.ctx, 'internal/listener', name, listener, options)
    // 内部钩子若接管注册，会返回它自己的清理句柄；否则走普通 Hook[] 注册。
    if (result) return result

    const label = `ctx.on(${typeof name === 'string' ? JSON.stringify(name) : name.toString()})`
    return this.register(label, name, listener, options)
  }

  once(name: string | symbol, listener: (...args: any) => any, options?: boolean | EventOptions) {
    // dispose 被闭包捕获，先注销再执行用户回调，避免回调再次触发同一事件时重复进入。
    const dispose = this.on(name, function (...args: any[]) {
      dispose()
      return listener.apply(this, args)
    }, options)
    return dispose
  }
}

// 内部事件的静态协议，可通过声明合并扩展。此处没有实际派发；派发点在各服务/Fiber 中。
// plugin/status/service 通知变化，config/get/set/update 的 next 允许包裹或截断默认行为。
// 注意 internal/listener 的旧签名末参仍写为 boolean；上面的实现实际传 EventOptions 对象。
export interface Events {
  [key: symbol]: (...args: any[]) => any
  'internal/plugin'(fiber: Fiber): void
  'internal/status'(fiber: Fiber, oldValue: FiberState): void
  'internal/service'(this: Context, name: string, value: any): void
  'internal/update'(this: Fiber, resolvedConfig: any, next: () => Awaitable<void>): Awaitable<void>
  'internal/commit'(fiber: Fiber, originalConfig: any): void
  'internal/config'(fiber: Fiber, next: () => any): any
  'internal/get'(ctx: Context, name: string, error: Error, next: () => any): any
  'internal/set'(ctx: Context, name: string, value: any, error: Error, next: () => boolean): boolean
  'internal/listener'(this: Context, name: string, listener: any, prepend: boolean): void
  'internal/dispatch'(mode: DispatchMode, name: string | symbol, args: any[], thisArg: any): void
}
