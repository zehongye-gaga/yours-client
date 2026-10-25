// 本文件提供服务基类：把实例发布到 ctx，并让服务调用携带使用位置和局部配置。
// 服务是插件可提供的一项能力；Service 对象与负责其生命周期的 Fiber 不是同一个对象。
// 导入用途：defineProperty 写内部属性，isNullable 判断 null/undefined；Context 给出环境；
// locate 找到准许访问的依赖声明，工具函数构造可调用对象、连接原型并跟踪上下文。
import { defineProperty, isNullable } from 'cosmokit'
import { Context } from './context.ts'
import { locate } from './reflect.ts'
import { createCallable, joinPrototype, symbols, Tracker } from './utils.ts'

// abstract 禁止 TS 调用方直接 new Service；T 是服务接受的拦截配置类型。
// out 标注协变：比较两个 Service<T> 类型时，T 从更具体到更宽的赋值关系保持同方向。
// 它只影响类型兼容性检查，没有运行时的“输出参数”。
export abstract class Service<out T = never> {
  // 这些 static symbol 是扩展协议的键，如子类用 [Service.init]() 声明初始化方法。
  // readonly 是编译期约束，unique symbol 让各键的类型互不混淆；真正的值来自 symbols。
  static readonly init: unique symbol = symbols.init
  static readonly check: unique symbol = symbols.check
  static readonly invoke: unique symbol = symbols.invoke
  static readonly metadata: unique symbol = symbols.metadata
  static readonly extend: unique symbol = symbols.extend
  static readonly tracker: unique symbol = symbols.tracker
  static readonly mergeIntercept: unique symbol = symbols.mergeIntercept
  static readonly resolveIntercept: unique symbol = symbols.resolveIntercept

  // declare 只贡献类型，不生成实例字段；所以 metadata 能指导 config 的类型推导而不占配置存储。
  declare [symbols.metadata]: T

  // ! 告诉编译器此字段会稍后赋值；初始化仍要靠下方构造函数，! 不会补默认值。
  public name!: string

  constructor(protected ctx: Context, name: string) {
    // protected ctx 既声明受保护字段也保存参数；name 空缺时读取类的静态 provide 名称。
    name ??= this.constructor['provide'] as string

    let self = this
    const tracker: Tracker = {
      associate: name,
      property: 'ctx',
    }
    if (self[symbols.invoke]) {
      // 有 invoke 协议就返回真正的函数对象，使服务能写成 ctx.foo(...)；
      // 连接原型保留服务方法，同时保留 Function 的能力，不是仅用类型断言伪装成函数。
      self = createCallable(name, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker)
    }
    self.ctx = ctx
    self.name = name
    defineProperty(self, symbols.tracker, tracker)

    // 发布由此 ctx 的 Fiber 持有；check 是供消费者判断当前实现是否可用的可选钩子。
    // 这是先登记实现，是否可供依赖加载还要看提供者 Fiber 的状态。
    self.ctx.reflect.provide(name, self, this[symbols.check])
    return self
  }

  protected [symbols.filter](ctx: Context) {
    // 事件过滤协议：只让同一服务隔离域中的监听者接收相应事件。
    return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name]
  }

  protected [symbols.extend](props?: any) {
    // 以当前服务为原型建立一个局部变体，附加 props；不再次 provide，也不深拷贝内部状态。
    let self: any
    if (this[Service.invoke]) {
      self = createCallable(this.name, this, this[symbols.tracker])
    } else {
      self = Object.create(this)
    }
    return Object.assign(self, props)
  }

  [symbols.mergeIntercept](...values: T[]): T {
    // 默认浅合并，后面的同名属性覆盖前面；子类可重写这个符号方法定义自己的合并规则。
    return Object.assign({}, ...values)
  }

  [symbols.resolveIntercept](): T {
    // 收集顺序：定义处最近一层 inject 的配置 → 使用处从外到内的 intercept 配置。
    // unshift 把沿原型链向外找到的配置放在前面，因此默认合并时更内层的设置优先。
    const values: T[] = []
    let intercept = this.ctx[Context.intercept]
    while (this.name in intercept) {
      if (Object.hasOwn(intercept, this.name)) {
        values.unshift(intercept[this.name])
      }
      intercept = Object.getPrototypeOf(intercept)
    }
    // caller 保留服务调用代码的定义处；只取 locate 返回的那一层依赖声明，
    // 不把所有祖先 inject 叠加。若是自己提供的服务或越过隔离边界，则可能没有该配置。
    const value = locate((this as any)[symbols.caller] ?? this.ctx, this.name)?.fiber?.inject[this.name]
    if (!isNullable(value)) values.unshift(value)
    const merge = this[symbols.mergeIntercept] ?? Service.prototype[symbols.mergeIntercept]
    return merge.apply(this, values)
  }

  static [Symbol.hasInstance](instance: any) {
    // 自定义 instanceof：可调用服务与代理改变了普通原型关系，因此沿构造器继承链找目标类。
    // instanceof Service/某子类 会进入此方法；不是按是否有 name/ctx 字段来判断。
    if (!instance) return false
    let constructor = instance.constructor
    while (constructor) {
      // constructor may be a proxy
      constructor = constructor.prototype?.constructor
      if (constructor === this) return true
      constructor &&= Object.getPrototypeOf(constructor)
    }
    return false
  }
}
