// 本文件把不同形式的插件归一化，再为每次注册建立 Fiber；注册表本身不负责执行插件主体。
// 上半部是依赖声明、装饰器和 TS 接口，下半部才是 RegistryService 的运行逻辑。
// 导入用途：Dict/StandardSchemaV1 描述字典与配置校验协议，defineProperty 写内部属性；
// Context 是能力入口，Fiber 管单次注册，DisposableList 保存实例；其余工具提供符号键、
// 临时属性视图和错误调用栈。只用到类型的名称不会保留为 JS 导入。
import { defineProperty, Dict } from 'cosmokit'
import { StandardSchemaV1 } from '@standard-schema/spec'
import { Context } from './context.ts'
import { Fiber } from './fiber.ts'
import { buildOuterStack, DisposableList, symbols, withProps } from './utils.ts'

function isApplicable(object: Plugin) {
  // 对象式插件必须有可调用的 apply；这里仅探测形状，不调用 apply。
  return object && typeof object === 'object' && typeof object.apply === 'function'
}

// 同一个 Inject 名称可同时表示类型和下方的函数。类型层的 | 表示二选一：
// ['foo'] 声明依赖，{ foo: config } 还携带使用该服务的配置；不是把服务对象直接传进来。
// keyof M 取键名集合，[K in keyof M] 是映射类型，? 允许各个键省略。
export type Inject<M = Dict> = (keyof M)[] | { [K in keyof M]?: M[K] }

// 从 Context 的字符串键中筛出带 metadata 类型标记的服务；as ... never 会排除不匹配的键。
// 这只是静态候选名称，不会在运行时遍历 Context。
export type InjectKey = keyof {
  [K in keyof Context & string as Context[K] extends { [symbols.metadata]: any } ? K : never]: any
}

export function Inject<K extends InjectKey>(name: K, config?: Context[K] extends { [symbols.metadata]: infer T } ? T : never) {
  // @Inject(...) 返回一个装饰器。class 分支改类的静态依赖；method 分支安排实例初始化钩子。
  return function (value: any, decorator: ClassDecoratorContext<any> | ClassMethodDecoratorContext<any>) {
    if (decorator.kind === 'class') {
      if (!Object.hasOwn(value, 'inject')) {
        // 自己建一层 inject 表，继承父类声明但不直接改父类的表；checkProto 标记允许后面展开它。
        defineProperty(value, 'inject', Object.create(Object.getPrototypeOf(value).inject ?? null))
        defineProperty(value.inject, symbols.checkProto, true)
      }
      value.inject[name] = config
    } else if (decorator.kind === 'method') {
      // 多个装饰器把依赖累积到原方法上。addInitializer 不在这里调用方法，
      // 而是在实例初始化时登记 initHooks，随后 Fiber 构造完实例再执行这些钩子。
      const inject = (value[symbols.decorator] ??= {}).inject ??= Object.create(null)
      inject[name] = config
      decorator.addInitializer(function () {
        const property = this[symbols.tracker]?.property
        ;(this[symbols.initHooks] ??= []).push(() => {
          (this.ctx as Context).inject(inject, (ctx) => {
            // 依赖就绪后才调用方法；临时替换被跟踪的 ctx 字段，让方法的副作用归到子 Fiber。
            return value.call(property ? withProps(this, { [property]: ctx }) : this)
          })
        })
      })
    } else {
      throw new Error('@Inject() can only be used on class or class methods')
    }
  }
}

export namespace Inject {
  // namespace 与函数同名合并，运行时因此可调用 Inject.resolve(...)。
  // 将数组、对象及装饰器继承链归一为无原型字典；null 表示声明了依赖但没有附加配置。
  export function resolve(inject: Inject | null | undefined, result: Dict = Object.create(null)) {
    if (!inject) return result
    if (Array.isArray(inject)) {
      for (const name of inject) {
        result[name] = null
      }
    } else if (Reflect.has(inject, symbols.checkProto)) {
      Object.assign(result, resolve(Object.getPrototypeOf(inject)))
      for (const name of Object.keys(inject)) {
        result[name] = inject[name] ?? null
      }
    } else {
      for (const name of Object.keys(inject)) {
        result[name] = inject[name] ?? null
      }
    }
    return result
  }
}

// T 是插件收到的配置类型，占位符会随类型一起擦除；联合类型列出三种入口写法。
// Plugin namespace 的这些接口只是描述协议，不会替插件生成类或 apply 方法。
export type Plugin<T = any> =
  | Plugin.Function<T>
  | Plugin.Constructor<T>
  | Plugin.Object<T>

export namespace Plugin {
  export interface Base<T = any> {
    // name 用于显示；Config 由 Fiber 校验配置；inject 是依赖，provide/intercept 是可选元信息。
    // 这里有字段声明，不等于 RegistryService 会自动执行这些字段描述的动作。
    name?: string
    Config?: StandardSchemaV1<any, T>
    inject?: Inject
    provide?: string | string[]
    intercept?: Dict<boolean>
  }

  export interface Transform<S, T> {
    // 这份接口用于下方的输入类型推导；运行时校验仍以 runtime.Config['~standard'] 为准。
    schema?: true
    Config: (config: S) => T
  }

  export interface Function<T = any> extends Base<T> {
    (ctx: Context, config: T): any
  }

  export interface Constructor<T = any> extends Base<T> {
    new (ctx: Context, config: T): any
  }

  export interface Object<T = any> extends Base<T> {
    apply(ctx: Context, config: T): any
  }

  export interface Runtime {
    // 一份插件定义共用一个 runtime：callback 是身份键，fibers 才是多次注册产生的实例列表。
    name?: string
    fibers: DisposableList<Fiber>
    callback: globalThis.Function
    Config?: StandardSchemaV1
  }
}

// 下列类型只改善 plugin(...) 的调用提示：配置包含 undefined 时参数可省略。
// 元组 [config: T] 表示一段参数列表，infer R 提取入口中 ctx 之后的参数，再取第 0 个作配置。
type Spread<T> = undefined extends T ? [config?: T] : [config: T]

type GetPluginParameters<P> =
  | P extends (ctx: Context, ...args: infer R) => any
  ? R
  : P extends new (ctx: Context, ...args: infer R) => any
  ? R
  : P extends { apply(ctx: Context, ...args: infer R): any }
  ? R
  : never

type GetPluginConfig<P> =
  | P extends Plugin.Transform<infer S, any>
  ? S
  : GetPluginParameters<P>[0]

// 模块补充声明给 Context 加类型；运行时的 ctx.plugin/ctx.inject 转发入口由 ReflectService 安装。
// & 是交叉类型：返回值同时有 Fiber 接口和可 await 的 then 接口，不是两个返回值。
declare module './context.ts' {
  export interface Context {
    inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>
    plugin<P extends Plugin>(plugin: P, ...args: Spread<GetPluginConfig<P>>): Fiber & PromiseLike<Fiber>
  }
}

export class RegistryService {
  // 一个根环境共用此表；派生 ctx 的 tracker 让调用关联到使用它的上下文，而表仍是同一张。
  // private 是 TS 访问限制（不同于 JS 的 # 私有字段），_ 前缀本身没有语法上的保护作用。
  private _counter = 0
  private _internal = new Map<Function, Plugin.Runtime>()

  constructor(public ctx: Context) {
    // 参数前 public 会同时声明字段并保存参数。tracker 指定 ctx 随使用位置变化，
    // noShadow 让内建注册能力直接按使用处归属，无需套普通服务的定义处视图。
    defineProperty(this, symbols.tracker, {
      property: 'ctx',
      noShadow: true,
    })
  }

  get counter() {
    // getter 看似读属性，实际上每次读取都递增，用来给 Fiber 分配标识。
    return ++this._counter
  }

  get size() {
    // 这是定义数，不是 Fiber 数；同一插件函数可以注册多次。
    return this._internal.size
  }

  resolve(plugin: Plugin): Function | undefined {
    // 函数/类直接作键，对象取其 apply 函数作键；不会按 name 字符串去重。
    // plugin.apply may throw
    try {
      if (typeof plugin === 'function') return plugin
      if (isApplicable(plugin)) return plugin.apply
    } catch {}
  }

  get(plugin: Plugin) {
    // get/has 共用 resolve，因此传对象插件或它的 apply 可查到同一个 runtime。
    const key = this.resolve(plugin)
    return key && this._internal.get(key)
  }

  has(plugin: Plugin) {
    const key = this.resolve(plugin)
    return !!key && this._internal.has(key)
  }

  delete(plugin: Plugin) {
    // 先从表中移除定义，再发起所有实例的 dispose；这里没有 await，不代表清理已经完成。
    const key = this.resolve(plugin)
    const runtime = key && this._internal.get(key)
    if (!runtime) return
    this._internal.delete(key)
    for (const fiber of runtime.fibers) {
      fiber.dispose()
    }
    return runtime
  }

  keys() {
    // 以下四个方法只转发 Map 的遍历能力，values() 遍历的是 runtime 而非单个 Fiber。
    return this._internal.keys()
  }

  values() {
    return this._internal.values()
  }

  entries() {
    return this._internal.entries()
  }

  forEach(callback: (value: Plugin.Runtime, key: Function) => void) {
    return this._internal.forEach(callback)
  }

  inject(inject: Inject, callback: Plugin.Function<void>) {
    // 依赖回调也是一个小插件：依赖出现时运行、消失时清理，复用同一套 Fiber 生命周期。
    return this.plugin({ inject, apply: callback, name: callback.name })
  }

  plugin(plugin: Plugin, config?: any, getOuterStack = buildOuterStack()) {
    // getOuterStack 是读取调用处堆栈的回调，供后续错误诊断使用，不是插件入口。
    // resolve 只取出函数本身或对象的 apply 方法，并不在这里执行插件。
    const callback = this.resolve(plugin)
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin)
    // assertActive 实际检查父 Fiber 的 uid !== null，并非要求 state === ACTIVE。
    this.ctx.fiber.assertActive()

    // 按函数对象身份复用定义级 runtime，而非按名称；它汇总各次注册的 fibers。
    let runtime = this._internal.get(callback)
    if (!runtime) {
      let name = plugin.name
      // apply 是常见入口函数名，不把它当成有辨识度的插件显示名。
      if (name === 'apply') name = undefined
      // name、callback、Config 在首次建立 runtime 时保存，不是每次注册独有的状态。
      runtime = { name, callback, fibers: new DisposableList(), Config: plugin.Config }
      this._internal.set(callback, runtime)
    }

    // 每次注册新建 Fiber：父上下文、当前配置、规范化依赖、共享 runtime、诊断堆栈。
    const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack)
    // 创建以 fiber 为原型的包装对象，不复制字段，也不再构造一个 Fiber。
    // as 只是编译期类型断言；运行时的 thenable 能力来自下面实际赋值的 then。
    const wrapped = Object.create(fiber) as Fiber & PromiseLike<Fiber>
    // 自有 then 委托原始 fiber.await() 等待当前加载/卸载稳定；缺依赖时仍可为 PENDING。
    // await() 返回不带 then 的原始 Fiber，避免 Promise 对同一 thenable 反复吸收。
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected)
    }
    return wrapped
  }
}
