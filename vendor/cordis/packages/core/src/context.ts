import { Dict } from 'cosmokit'
import { EventsService } from './events.ts'
import { LoggerService } from './logger.ts'
import { ReflectService } from './reflect.ts'
import { InjectKey, RegistryService } from './registry.ts'
import { getTraceable, symbols } from './utils.ts'
import { Fiber } from './fiber.ts'

export interface Context {
  [symbols.root]: this
  [symbols.isolate]: Dict<symbol>
  [symbols.intercept]: Dict
  baseUrl?: string | undefined
  events: EventsService
  logger: LoggerService
  reflect: ReflectService
  registry: RegistryService
}

export class Context {
  static readonly root: unique symbol = symbols.root
  static readonly effect: unique symbol = symbols.effect
  static readonly filter: unique symbol = symbols.filter
  static readonly isolate: unique symbol = symbols.isolate
  static readonly intercept: unique symbol = symbols.intercept

  static is(value: any): value is Context {
    return !!value?.[Context.is as any]
  }

  static {
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

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Context <${this.fiber.name}>`
  }

  extend(meta = {}): this {
    const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value
    const self = Object.create(getTraceable(this, this))
    for (const prop of Reflect.ownKeys(meta)) {
      Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop)!)
    }
    if (!shadow) return self
    return Object.assign(Object.create(self), { [symbols.shadow]: shadow })
  }

  isolate(name: string, label?: symbol) {
    const shadow = Object.create(this[symbols.isolate])
    shadow[name] = label ?? Symbol(name)
    return this.extend({ [symbols.isolate]: shadow })
  }

  intercept<K extends InjectKey>(name: K, config: Context[K] extends { [symbols.metadata]: infer T } ? T : never): this
  intercept(name: string, config: any): this
  intercept(name: string, config: any) {
    const intercept = Object.create(this[symbols.intercept])
    intercept[name] = config
    return this.extend({ [symbols.intercept]: intercept })
  }
}
