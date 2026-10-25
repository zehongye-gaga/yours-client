// 本文件组装插件使用的上下文 ctx：它既是能力入口，也是隔离配置和生命周期的访问入口。
// 从上往下读即可：先看形状和识别标记，再看根环境初始化，最后看如何派生局部上下文。
// 导入只需先记用途：Dict 是字典类型；四个 Service 分别管事件、日志、属性访问、插件注册；
// InjectKey 约束可配置的服务名；symbols 提供内部属性键，getTraceable 保留调用上下文；
// Fiber 管一次插件注册的执行与清理。类型在编译后擦除，类、函数、symbol 等值才留在运行时。
import { Dict } from 'cosmokit'
import { EventsService } from './events.ts'
import { LoggerService } from './logger.ts'
import { ReflectService } from './reflect.ts'
import { InjectKey, RegistryService } from './registry.ts'
import { getTraceable, symbols } from './utils.ts'
import { Fiber } from './fiber.ts'

// 同名 interface 与下方 class 合并类型：这里声明“实例有哪些字段”，并不创建字段。
// 其他文件还能用 declare module 补充 Context 的类型；真正的方法入口由 reflect.mixin 安装。
export interface Context {
  // [表达式] 是计算属性名，symbol 键不会与普通字符串字段重名；this 类型保留派生类信息。
  [symbols.root]: this
  // 这些表可沿原型继承：局部只覆盖需要改变的服务名，其余继续从父上下文读取。
  [symbols.isolate]: Dict<symbol>
  [symbols.intercept]: Dict
  // ? 允许省略字段；| 表示类型可为其中之一，undefined 与空字符串不是同一个值。
  baseUrl?: string | undefined
  events: EventsService
  logger: LoggerService
  reflect: ReflectService
  registry: RegistryService
}

export class Context {
  // static 字段属于类（Context.root），不属于每个 ctx；unique symbol 给类型系统一个独特键。
  // readonly 只限制 TS 代码中的赋值，不等于 Object.freeze，也不冻结键所指向的表。
  static readonly root: unique symbol = symbols.root
  static readonly effect: unique symbol = symbols.effect
  static readonly filter: unique symbol = symbols.filter
  static readonly isolate: unique symbol = symbols.isolate
  static readonly intercept: unique symbol = symbols.intercept

  // “value is Context” 是类型谓词：if 分支中可把 value 当 Context 用；运行时仍靠标记判断。
  static is(value: any): value is Context {
    // ?. 遇到 null/undefined 就短路，!! 转为布尔值；as any 只放宽类型检查，不转换 value。
    return !!value?.[Context.is as any]
  }

  static {
    // static 块在类定义时执行一次。这里把 is 函数当属性键时，会触发 Symbol.toPrimitive，
    // 得到共享的 Symbol.for('cordis.is')。原型上的 true 标记可被所有实例继承；这不是 instanceof。
    Context.is[Symbol.toPrimitive] = () => Symbol.for('cordis.is')
    Context.prototype[Context.is as any] = true
  }

  constructor() {
    // 创建内核环境，而不是注册业务插件；两张无原型表分别保存隔离标识和拦截配置。
    // isolate 是服务名 → symbol，实际服务实现另存于 reflect.store。
    this[symbols.isolate] = Object.create(null)
    this[symbols.intercept] = Object.create(null)
    // self 是对当前实例的代理：属性访问由 ReflectService.handler 接管。
    const self = new Proxy<this>(this, ReflectService.handler)
    // 根引用指向代理；baseUrl 先留空，供需要来源地址的上层逻辑设置。
    this[symbols.root] = self
    this.baseUrl = undefined
    // runtime 为 null 表示根 Fiber（不是插件实例），承载根上下文的生命周期与副作用。
    this.fiber = new Fiber(self, {}, Object.create(null), null, () => [])
    // 依次装配反射、插件注册、事件、日志能力，服务内部持有的也是代理 self。
    this.reflect = new ReflectService(self)
    this.registry = new RegistryService(self)
    this.events = new EventsService(self)
    this.logger = new LoggerService(self)
    // clear() 只取出并移除初始化阶段的清理记录，不调用回调；内建能力仍然保留。
    this.fiber._disposables.clear()
    // 构造函数显式返回代理，因此 new Context() 得到的是 self，而非裸 this。
    return self
  }

  // Node 打印对象时的展示钩子，不参与插件调度。
  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Context <${this.fiber.name}>`
  }

  extend(meta = {}): this {
    // 派生靠 Object.create 建原型链，不调用构造函数，也不复制整套服务或新建 Fiber。
    // 只有 meta 指定的属性成为自有属性；例如 Fiber 会传 { fiber: this } 来改变生命周期归属。
    const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value
    const self = Object.create(getTraceable(this, this))
    for (const prop of Reflect.ownKeys(meta)) {
      // 复制描述符可保留 getter/setter、可写性和 symbol 键，直接赋值则可能先触发 getter。
      // 末尾 ! 只是“这里不会是 undefined”的编译期断言，不会生成运行时检查。
      Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop)!)
    }
    if (!shadow) return self
    // shadow 保存“这段访问代码的定义处”；外层原型保留派生后的使用处，两者不要混成一个 ctx。
    return Object.assign(Object.create(self), { [symbols.shadow]: shadow })
  }

  isolate(name: string, label?: symbol) {
    // 新表只覆盖 name 的隔离标识；复用同一个 label 可指向同一隔离域。
    // 不传 label 就新建唯一 Symbol。此处只改变查找视角，不注册、复制或搬移服务实现。
    const shadow = Object.create(this[symbols.isolate])
    shadow[name] = label ?? Symbol(name)
    return this.extend({ [symbols.isolate]: shadow })
  }

  // 这两个签名是重载，只有下面一份函数体会执行。泛型 K 让服务名与配置类型相关联；
  // 条件类型用 infer T 从服务的 metadata 类型取出配置形状，取不到则为 never（不允许的类型）。
  // string/any 重载还允许动态名称；类型提示不能替代运行时校验。
  intercept<K extends InjectKey>(name: K, config: Context[K] extends { [symbols.metadata]: infer T } ? T : never): this
  intercept(name: string, config: any): this
  intercept(name: string, config: any) {
    // 与 isolate 相同，以原型链叠加局部配置；此处只存配置，服务使用时再读取和合并。
    const intercept = Object.create(this[symbols.intercept])
    intercept[name] = config
    return this.extend({ [symbols.intercept]: intercept })
  }
}
