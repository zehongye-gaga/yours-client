// 本文件把 ctx.foo 这样的属性读写接到服务系统，并管理服务声明、实现与依赖通知。
// 先记两张表：props 用字符串名描述“是什么属性”；store 用隔离 symbol 找“哪份服务实现”。
// 导入用途：Dict 是字典类型，defineProperty 写跟踪标记，isNullable 判断空值；Context 是入口；
// Fiber/FiberState 用于所有权和状态检查；getTraceable/withProps 在代理访问中保留上下文与接收者。
import { defineProperty, Dict, isNullable } from 'cosmokit'
import { Context } from './context.ts'
import { getTraceable, symbols, withProps } from './utils.ts'
import { Fiber, FiberState } from './fiber.ts'

// 只补充 Context 的静态类型，方法在下方构造函数中通过 mixin 接入。
// K extends string & keyof this 限定已知字符串键，this[K] 把值类型和键关联；宽泛重载容许动态名称。
// Omit<..., 'type'> 从类型中去掉 type 字段，由实现统一填入；它不会删除运行时对象的属性。
declare module './context.ts' {
  interface Context {
    get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K]
    get(name: string, strict?: boolean): any
    set<K extends string & keyof this>(name: K, value: undefined | this[K]): void
    set(name: string, value: any): void
    provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void
    provide(name: string, value?: any): () => void
    accessor(name: string, options: Omit<Property.Accessor, 'type'>): void
    mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void
    mixin<T extends {}>(source: T, mixins: (keyof this & keyof T)[] | Dict<string>): void
  }
}

function enhanceError(error: Error) {
  // 去掉一层内部调用栈，让权限错误更靠近用户调用处；修改的是同一个 Error 对象。
  const lines = error.stack!.split('\n')
  lines.splice(0, 2, `Error: ${error.message}`)
  error.stack = lines.join('\n')
  return error
}

const RESERVED_WORDS = ['prototype', 'then']

// 特殊键交给普通对象机制，尤其 then：若将它误判成服务访问，await ctx 的探测可能抛异常。
// 注意返回注解 prop is symbol 比实际条件窄；本函数也接受下列几类字符串，阅读分支要以条件为准。
// - is a symbol
// - is a reserved word (prototype, then)
// - is a number string (0, 1, 2, ...)
// - starts with `_`
function isSpecialProperty(prop: string | symbol): prop is symbol {
  return typeof prop === 'symbol'
    || RESERVED_WORDS.includes(prop)
    || parseInt(prop).toString() === prop
    || prop.startsWith('_')
}

// 这是带判别字段的联合类型：根据 type 的字面量就能知道是否有 get/set。
// namespace 里的接口只描述两种形状，没有创建服务或访问器。
export type Property = Property.Service | Property.Accessor

export namespace Property {
  export interface Service {
    type: 'service'
  }

  export interface Accessor {
    type: 'accessor'
    get: (this: Context, receiver: any, error: Error) => any
    set?: (this: Context, value: any, receiver: any, error: Error) => boolean
  }
}

export interface Impl {
  // 一次 provide 对应一个 Impl：uid 区分新旧实现，ctx 标记提供者，value 才是真正的服务值。
  uid: number
  name: string
  ctx: Context
  // dependents 是正在使用此实现的 Fiber；release 供撤下实现时等待这些消费者清理完毕。
  dependents: Set<Fiber>
  release?: () => void
  value?: any
  // check 是附加可用性检查，消费者刷新依赖时会调用。
  check?: () => boolean
  // Actual isolation symbol; may differ from the provider context after a blocked move.
  isolate: symbol
}

// Resolve an access to service `name` from the def site `ctx` by walking up its fibers.
// `fiber` is the fiber whose `inject` admits the access, and `impl` is the impl the access reaches.
// - `{ impl }`: a fiber provides the impl itself in the same isolation.
// - `{ fiber, impl }`: the impl comes from the committed view of `fiber`.
// - `{ fiber }`: `fiber` declares the service but is inactive.
// - `undefined`: no fiber declares the service, or the walk reaches a context that isolates `name` again.
// 从代码定义处向父 Fiber 查找访问依据。自己提供的实现优先，其次是当前 Fiber 声明的依赖。
// 返回 { impl } 表示自身提供；{ fiber, impl } 表示依赖已绑定；只有 { fiber } 表示声明了但当前无绑定。
// undefined 表示没有访问依据。跨过对同名服务重新隔离的上下文时停止，避免借用另一隔离域的声明。
export function locate(ctx: Context, name: string): { fiber?: Fiber; impl?: Impl } | undefined {
  const key = ctx[symbols.isolate][name]
  let table = ctx[symbols.isolate]
  let fiber = ctx.fiber
  while (true) {
    let impl: Impl | undefined
    for (const provision of fiber.provisions) {
      // provisions 会暂留正在撤下的实现，使清理代码仍能访问自己提供的服务。
      if (provision.name === name && provision.ctx[symbols.isolate][name] === key) impl = provision
    }
    if (impl) return { impl }
    while (table !== fiber.ctx[symbols.isolate]) {
      // table 与 Fiber 链并行向上走；own name 说明中途显式建立过该服务的隔离边界。
      if (!table || Object.hasOwn(table, name)) return
      table = Object.getPrototypeOf(table)
    }
    // committed 是这一轮运行实际绑定的快照，而不是服务表里最新出现的那一份。
    impl = fiber.committed?.[name]
    if (impl || name in fiber.inject) return { fiber, impl }
    if (!fiber.runtime) return
    fiber = fiber.parent.fiber
  }
}

export class ReflectService {
  // Context 构造时把此对象交给 Proxy。get/set 的 ctx 是 receiver，可能是派生上下文，
  // 不一定等于裸 target；这使从原型继承来的服务入口仍能知道当前使用位置。
  static handler: ProxyHandler<Context> = {
    get: (target, prop, ctx: Context) => {
      if (isSpecialProperty(prop)) {
        return Reflect.get(target, prop, ctx)
      }
      if (Reflect.has(target, prop)) {
        // 实际存在的普通属性优先，服务对象需要时再附加跟踪代理。
        return getTraceable(ctx, Reflect.get(target, prop, ctx))
      }

      const error = new Error(`cannot get property "${prop}" without inject`)

      try {
        const def = target.reflect.props[prop]
        if (def?.type === 'accessor') {
          // 自定义访问器接到 ctx 上；receiver 可携带 ctx.foo.bar 这种关联访问的原对象。
          return def.get.call(ctx, ctx[symbols.receiver], error)
        }

        // a fiber-less def site cannot declare `inject` at all, so it keeps the unchecked root access.
        const defSite = (ctx[symbols.shadow] as Context | undefined) ?? ctx
        // 无插件 runtime 的根定义处没有 inject 声明机制，允许直接读取（strict=false）。
        // 插件代码则通过 locate 检查自身或祖先声明；不能把所有 ctx.foo 都看作一次字典读取。
        if (!defSite.fiber.runtime) return ctx.reflect.get(prop, false)
        return ctx.events.waterfall('internal/get', ctx, prop, error, () => {
          const result = locate(defSite, prop)
          if (!result) throw error
          if (result.impl) return getTraceable(ctx, result.impl.value)
          error.message = `cannot get required service "${prop}" in inactive context`
          throw error
        })
      } catch (e: any) {
        throw e === error ? enhanceError(e) : e
      }
    },

    set: (target, prop, value, ctx: Context) => {
      // 普通根对象可增加未声明字段；插件上下文写服务前必须已有 provide/accessor 声明。
      if (isSpecialProperty(prop)) {
        return Reflect.set(target, prop, value, ctx)
      }

      const error = new Error(`cannot set property "${prop}" without provide`)
      const def = target.reflect.props[prop]
      if (!def) {
        if (!ctx.fiber.runtime) return Reflect.set(target, prop, value, ctx)
        throw enhanceError(error)
      }

      try {
        if (def.type === 'accessor') {
          if (!def.set) return false
          return def.set.call(ctx, value, ctx[symbols.receiver], error)
        }

        return ctx.events.waterfall('internal/set', ctx, prop, value, error, () => {
          return ctx.reflect.set(prop, value, error)
        })
      } catch (e: any) {
        throw e === error ? enhanceError(e) : e
      }
    },

    has: (target, prop) => {
      // 对应 prop in ctx：有声明就算存在，不保证该服务此刻已经有活跃实现。
      if (isSpecialProperty(prop)) {
        return Reflect.has(target, prop)
      }
      if (Reflect.has(target, prop)) return true
      return !!target.reflect.props[prop]
    },
  }

  // 一个根环境共享这些表；同名服务可在不同隔离 symbol 下各有实现。
  // _implCounter 为每次 provide 分配身份，Fiber 可借此发现同名服务已换了实现。
  public store: Dict<Impl, symbol> = Object.create(null)
  public props: Dict<Property> = Object.create(null)
  private _implCounter = 0

  constructor(public ctx: Context) {
    defineProperty(this, symbols.tracker, {
      property: 'ctx',
      noShadow: true,
    })

    // 将 ctx.get 等公开入口转发到 ctx.reflect.get 等服务方法；声明合并本身做不到这件事。
    // 初始化时先声明入口，访问时才取目标，因此 registry/events 尚未赋值也可先布好转发。
    this.mixin('reflect', ['get', 'set', 'provide', 'accessor', 'mixin'])
    this.mixin('fiber', ['runtime', 'effect'])
    this.mixin('registry', ['inject', 'plugin'])
    this.mixin('events', ['on', 'once', 'parallel', 'emit', 'serial', 'bail', 'waterfall'])
  }

  get(name: string, strict = true) {
    // 显式 ctx.get(...) 直接查当前隔离域，与 ctx.foo 走 locate 的依赖访问检查不同。
    return getTraceable(this.ctx, this._getImpl(name, strict)?.value)
  }

  _getImpl(name: string, strict = true) {
    // 默认只返回提供者状态为 ACTIVE 的实现；strict=false 也允许读取其加载/卸载中的实现。
    const key = this.ctx[symbols.isolate][name]
    const impl = key && this.store[key]
    if (!impl) return
    if (strict && impl.ctx.fiber.state !== FiberState.ACTIVE) return
    return impl
  }

  set(name: string, value: any, error?: Error) {
    // 只能由拥有该实现的 Fiber 改值。此函数不新建 Impl，也不在这里发出 notify。
    const key = this.ctx[symbols.isolate][name]
    const impl = this.store[key]
    if (!impl) {
      throw new Error(`cannot set property "${name}" without provide`)
    }
    if (impl.ctx.fiber !== this.ctx.fiber) {
      throw new Error(`cannot set property "${name}" in multiple fibers`)
    }
    impl.value = value
    return true
  }

  provide(name: string, value?: any, check?: () => boolean) {
    // 整个注册操作交给当前 Fiber.effect：拿到的清理句柄与 Fiber 生命周期绑定。
    return this.ctx.fiber.effect(() => {
      if (!this.props[name]) {
        this.props[name] ??= { type: 'service' }
      } else if (this.props[name].type !== 'service') {
        throw new Error(`property "${name}" is already declared as ${this.props[name].type}`)
      }
      this.props[name] = { type: 'service' }

      // 根表补一个默认隔离键，局部表若已覆盖则继续用局部键；同一键禁止两个实现同时注册。
      // ??= 只在现值为 null/undefined 时赋值，不能把它理解成每次都生成新的绑定。
      this.ctx[symbols.root][symbols.isolate][name] ??= Symbol(name)
      const key = this.ctx[symbols.isolate][name]
      const impl: Impl = { uid: ++this._implCounter, name, value, ctx: this.ctx, check, isolate: key, dependents: new Set() }
      if (this.store[key]) {
        throw new Error(`service "${name}" has been registered at <${this.store[key].ctx.fiber.name}>`)
      }
      this.store[key] = impl
      this.ctx.fiber.provisions.add(impl)
      if (this.ctx.fiber.state === FiberState.ACTIVE) {
        this.notify([name])
      }
      return async () => {
        // 先撤出 store 并通知，阻止新消费者绑定；暂时保留 provisions 供旧消费者清理时访问。
        if (this.store[impl.isolate] === impl) delete this.store[impl.isolate]
        this.ctx.isolate(name, impl.isolate).reflect.notify([name])
        // Retired bindings cannot gain new dependents. Wait only for their
        // cleanup, even if a fiber has left the registry or starts a new load.
        // Yield even without direct dependents so child cleanup can still
        // access the inherited service before its provision is removed.
        await new Promise<void>((resolve) => {
          // resolve 被保存在 impl 上；最后一个依赖者卸载时会调用它。无依赖也会经 await 让出一轮。
          impl.release = resolve
          if (!impl.dependents.size) resolve()
        })
        impl.release = undefined
        // ensure self access before dependencies cleanup
        this.ctx.fiber.provisions.delete(impl)
      }
    }, `ctx.provide(${JSON.stringify(name)})`)
  }

  notify(names: string[], filter = (ctx: Context, name: string) => ctx[symbols.isolate][name] === this.ctx[symbols.isolate][name]) {
    // 用 filter（默认比较隔离域）筛选声明过相应依赖的 Fiber；先重查各实现，再决定是否加载/卸载。
    for (const runtime of this.ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        let hasUpdate = false
        for (const name of names) {
          if (!(name in fiber.inject)) continue
          if (!filter(fiber.ctx, name)) continue
          hasUpdate = true
          fiber._checkImpl(name)
        }
        if (!hasUpdate) continue
        fiber._refresh()
      }
    }
    for (const name of names) {
      // 再发服务事件。临时派发者携带 filter，事件系统据此筛选监听者的注册上下文。
      const self: Context = Object.create(this.ctx)
      self[symbols.filter] = (target: Context) => filter(target, name)
      this.ctx.events.emit(self, 'internal/service', name, this._getImpl(name, false)?.value)
    }
  }

  accessor(name: string, options: Omit<Property.Accessor, 'type'>) {
    // 注册的是读写规则而非服务实现；清理时删除规则。已有同名规则/服务声明则拒绝覆盖。
    return this.ctx.fiber.effect(() => {
      if (name in this.props) {
        throw new Error(`property "${name}" is already declared as ${this.props[name].type}`)
      }
      this.props[name] = { type: 'accessor', ...options }
      return () => delete this.props[name]
    }, `ctx.accessor(${JSON.stringify(name)})`)
  }

  mixin(source: any, mixins: string[] | Dict<string>) {
    // 将来源的属性映射为 ctx 上的访问器：数组同名映射，字典则是 来源键 → 暴露键。
    // 当前 getTarget 的实际取值是 ctx[source]，不要仅凭上方泛型重载推断额外的运行时分支。
    const self = this
    // function* 是生成器；每个 yield 交出一个访问器的清理函数，统一由外层 effect 收集。
    return this.ctx.fiber.effect(function* () {
      const entries = Array.isArray(mixins) ? mixins.map(key => [key, key]) : Object.entries(mixins)
      const getTarget = (ctx: Context, error: Error) => {
        // TODO enhance error message
        return ctx[source]
      }
      for (const [key, value] of entries) {
        yield self.accessor(value, {
          get(receiver, error) {
            const service = getTarget(this, error)
            if (isNullable(service)) return service
            const mixin = receiver ? withProps(receiver, service) : service
            // receiver 存在时将来源属性叠到接收者视图上；getter 和方法都用这个视图作 this。
            const value = Reflect.get(service, key, mixin)
            if (typeof value !== 'function') return value
            return value.bind(mixin ?? service)
          },
          set(value, receiver, error) {
            const service = getTarget(this, error)
            const mixin = receiver ? withProps(receiver, service) : service
            return Reflect.set(service, key, value, mixin)
          },
        })
      }
    }, `ctx.mixin(${JSON.stringify(source)})`)
  }

  trace<T>(value: T) {
    // T 表示输入输出保持同一种静态类型；运行时必要时会用代理携带当前 ctx。
    return getTraceable(this.ctx, value)
  }

  bind<T extends Function>(callback: T) {
    // 包装函数调用和 new 调用：只给传入对象附加追踪，不预先固定 callback 的 this。
    return new Proxy(callback, {
      apply: (target, thisArg, args) => {
        return Reflect.apply(target, this.trace(thisArg), args.map(arg => this.trace(arg)))
      },
      construct: (target, args, newTarget) => {
        return Reflect.construct(target, args.map(arg => this.trace(arg)), newTarget)
      },
    })
  }
}
