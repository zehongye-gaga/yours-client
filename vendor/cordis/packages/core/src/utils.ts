// 本文件是内核的底层工具：可移除列表、共享符号、原型与代理、错误堆栈拼接。
// 不必先跳进依赖：defineProperty 用于定义内部属性；Context/Service 只提供符号键的类型。
// import type 明确只导入类型，编译后的 JS 不会因此加载那两个模块，避免不必要的运行时依赖。
import { defineProperty } from 'cosmokit'
import type { Context } from './context.ts'
import type { Service } from './service.ts'

// 按注册次序保存对象（常见是清理函数或 Fiber）。T 受 WeakKey 约束，才能作为 WeakMap 的键。
// Map 强引用保留有效项目；WeakMap 仅反查项目的编号，不会独自阻止已移除对象被回收。
export class DisposableList<T extends WeakKey> {
  private sn = 0
  private map = new Map<number, T>()
  private weak = new WeakMap<T, number>()

  get length() {
    return this.map.size
  }

  push(value: T) {
    // 编号每次递增；返回的闭包捕获这一次 sn，所以可精确移除这条记录，不调用 value。
    // 同一 value 重复 push 时，weak 只记最后一次编号；delete(value) 也只定位最后一次。
    const sn = ++this.sn
    this.map.set(sn, value)
    this.weak.set(value, sn)
    return () => this.map.delete(sn)
  }

  delete(value: T) {
    const sn = this.weak.get(value)
    if (!sn) return false
    return this.map.delete(sn)
  }

  clear() {
    // 清空记录并返回逆序快照，方便“后注册先清理”；这里本身不执行任何清理函数。
    const values = [...this.map.values()]
    this.map.clear()
    return values.reverse()
  }

  [Symbol.iterator]() {
    // 实现可迭代协议，使 for...of / [...list] 按当前 Map 的插入顺序取值。
    return this.map.values()
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    // Node 调试打印用，避免把内部两张表暴露为阅读重点。
    return [...this]
  }
}

export interface Tracker {
  // associate 关联服务前缀（foo.bar）；property 指向对象保存上下文的字段（通常 ctx）。
  // noShadow 让内建能力直接按使用处工作，跳过普通服务的方法 shadow 包装。
  associate?: string
  property?: string
  noShadow?: boolean
}

// Symbol.for 用字符串取全局注册表中同一个 symbol；Symbol(...) 则每次新建不同身份。
// 这些键是内部协议，避免与用户的字符串属性撞名；不要把 symbol 当作安全或私有访问控制。
// as typeof Context.root 等只对齐静态类型，不读取运行时 Context，也不转换 symbol 的值。
export const symbols = {
  // internal symbols
  shadow: Symbol.for('cordis.shadow'),
  caller: Symbol.for('cordis.caller'),
  receiver: Symbol.for('cordis.receiver'),
  original: Symbol.for('cordis.original'),
  decorator: Symbol.for('cordis.decorator'),
  initHooks: Symbol.for('cordis.initHooks'),
  checkProto: Symbol.for('cordis.checkProto'),

  // context symbols
  root: Symbol.for('cordis.root') as typeof Context.root,
  effect: Symbol.for('cordis.effect') as typeof Context.effect,
  filter: Symbol.for('cordis.filter') as typeof Context.filter,
  isolate: Symbol.for('cordis.isolate') as typeof Context.isolate,
  intercept: Symbol.for('cordis.intercept') as typeof Context.intercept,

  // service symbols
  init: Symbol.for('cordis.init') as typeof Service.init,
  check: Symbol.for('cordis.check') as typeof Service.check,
  invoke: Symbol.for('cordis.invoke') as typeof Service.invoke,
  metadata: Symbol.for('cordis.metadata') as typeof Service.metadata,
  extend: Symbol.for('cordis.extend') as typeof Service.extend,
  tracker: Symbol.for('cordis.tracker') as typeof Service.tracker,
  mergeIntercept: Symbol.for('cordis.mergeIntercept') as typeof Service.mergeIntercept,
  resolveIntercept: Symbol.for('cordis.resolveIntercept') as typeof Service.resolveIntercept,
}

const GeneratorFunction = function* () {}.constructor
const AsyncGeneratorFunction = async function* () {}.constructor

export function isConstructor(func: any): func is new (...args: any) => any {
  // 这是适合插件入口的形状探测：无 prototype、生成器等排除；不是通用 JS 可构造性证明。
  // 类型谓词使通过分支后的 func 可写 new；真正 new 是否成功仍取决于运行时对象。
  // async function or arrow function
  if (!func.prototype) return false
  // generator function or malformed definition
  // we cannot use below check because `mock.fn()` is proxied
  // if (func.prototype.constructor !== func) return false
  if (func instanceof GeneratorFunction) return false
  // polyfilled AsyncGeneratorFunction === Function
  if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false
  return true
}

export function joinPrototype(proto1: {}, proto2: {}) {
  // 递归复制 proto1 到 Object.prototype 之前的原型层，再接到 proto2 上。
  // 用属性描述符保留 getter/setter 与可写性；不直接改原链，常用于给服务接上 Function.prototype。
  if (proto1 === Object.prototype) return proto2
  const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2))
  for (const key of Reflect.ownKeys(proto1)) {
    Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key)!)
  }
  return result
}

export function isObject(value: any): value is {} {
  // 这里“对象”也包含函数，供代理和 thenable 检测使用；null 要先排除。
  return value && (typeof value === 'object' || typeof value === 'function')
}

export function getPropertyDescriptor(target: any, prop: string | symbol) {
  // 沿原型链找描述符本身，避免为探测属性就触发 getter；找不到时隐式返回 undefined。
  let proto = target
  while (proto) {
    const desc = Reflect.getOwnPropertyDescriptor(proto, prop)
    if (desc) return desc
    proto = Object.getPrototypeOf(proto)
  }
}

export function getTraceable<T>(ctx: Context, value: T): T {
  // 原始值直接返回；shadow 上下文先解出使用处；有 tracker 的对象才需要代理。
  // T 保持静态输入输出类型相同，不保证返回的对象与 value 严格相等。
  if (!isObject(value)) return value
  if (Object.hasOwn(value, symbols.shadow)) {
    return Object.getPrototypeOf(value)
  }
  const tracker = value[symbols.tracker]
  if (!tracker) return value
  return createTraceable(ctx, value, tracker)
}

export function withProps(target: any, props?: {}) {
  // 临时叠加属性视图，不复制 props 到 target。读写先看 prop in props（包含其原型），
  // constructor 特意例外，保留 target 自己的类身份；Reflect 的 receiver 保证访问器接到正确 this。
  if (!props) return target
  return new Proxy(target, {
    get: (target, prop, receiver) => {
      if (prop in props && prop !== 'constructor') return Reflect.get(props, prop, receiver)
      return Reflect.get(target, prop, receiver)
    },
    set: (target, prop, value, receiver) => {
      if (prop in props && prop !== 'constructor') return Reflect.set(props, prop, value, receiver)
      return Reflect.set(target, prop, value, receiver)
    },
  })
}

function withProp(target: any, prop: string | symbol, value: any) {
  // 单属性只读视图用于临时替换上下文/接收者；writable:false 是实际运行时属性描述符。
  // 它与 TS readonly 不同，底层 Reflect.set 可能失败，严格模式赋值还可能抛错。
  return withProps(target, Object.defineProperty(Object.create(null), prop, {
    value,
    writable: false,
  }))
}

function createShadow(useSite: Context, target: any, property: string | undefined, receiver: any) {
  // 普通服务对象通常保存其定义处 ctx。调用时给 receiver 一个临时 ctx 视图：
  // 原型代表使用处，shadow 标记保存定义处。这样副作用归使用者，访问依赖仍检查服务自己的声明。
  // 只从数据属性描述符的 value 取定义处；没有这个字段则直接沿用 receiver。
  if (!property) return receiver
  const value = getPropertyDescriptor(target, property)?.value
  if (!value) return receiver
  const defSite = (value[symbols.shadow] as Context | undefined) ?? value
  return withProp(receiver, property, useSite.extend({ [symbols.shadow]: defSite }))
}

function createShadowMethod(ctx: Context, value: any, outer: any, shadow: {}) {
  // 仅当按 outer.method() 调用时替换 this；用户显式 call(other) 时尊重其 thisArg。
  // 方法返回的服务对象继续带追踪，避免链式调用丢失上下文。
  return new Proxy(value, {
    apply: (target, thisArg, args) => {
      if (thisArg === outer) thisArg = shadow
      return getTraceable(ctx, Reflect.apply(target, thisArg, args))
    },
  })
}

// `ctx` may be a shadow, i.e. a pair of:
// - def site: where the accessing code was defined, governs service resolution
// - use site: where the service is consumed, governs intercept, isolate and effects
// 在此把两个视角分开：defSite 是代码定义处（依赖访问依据），useSite 是服务使用处（局部设置与副作用）。
// Proxy 不复制服务状态；下面的 get/set/apply 只是改变访问和调用时使用的视图。
function createTraceable(ctx: Context, value: any, tracker: Tracker) {
  const defSite = (ctx[symbols.shadow] as Context | undefined) ?? ctx
  const useSite = ctx[symbols.shadow] ? Object.getPrototypeOf(ctx) as Context : ctx
  const proxy = new Proxy(value, {
    get: (target, prop, receiver) => {
      // 这三个特殊入口分别暴露原对象、定义处、使用处；读取常见的 .ctx 会得到 useSite。
      if (prop === symbols.original) return target
      if (prop === symbols.caller) return defSite
      if (prop === tracker.property) return useSite
      if (typeof prop === 'symbol') {
        // 其余符号协议原样交给 Reflect，避免当成字符串形式的服务关联访问。
        return Reflect.get(target, prop, receiver)
      }
      // `ctx` rather than `useSite`, so that `ctx.foo.bar` and `ctx['foo.bar']` are
      // governed by the same def site
      if (tracker.associate && useSite.reflect.props[`${tracker.associate}.${prop}`]) {
        // 已声明 foo.bar 时，ctx.foo.bar 转回 ctx['foo.bar'] 的访问流程；
        // 携带 receiver 让扩展属性还能访问原对象，保留 ctx 则让两种写法受同一定义处约束。
        return Reflect.get(ctx, `${tracker.associate}.${prop}`, withProp(ctx, symbols.receiver, receiver))
      }
      let shadow: any, innerValue: any
      const desc = getPropertyDescriptor(target, prop)
      if (desc && 'value' in desc) {
        // 普通数据属性直接取描述符值；getter 必须调用，因此在 else 中先准备 shadow 接收者。
        innerValue = desc.value
      } else {
        shadow = createShadow(useSite, target, tracker.property, receiver)
        innerValue = Reflect.get(target, prop, shadow)
      }
      const innerTracker = innerValue?.[symbols.tracker]
      // 子对象自带 tracker 就继续追踪；未启用 noShadow 的普通方法包装 this；其他值原样返回。
      if (innerTracker) {
        return createTraceable(useSite, innerValue, innerTracker)
      } else if (!tracker.noShadow && typeof innerValue === 'function') {
        shadow ??= createShadow(useSite, target, tracker.property, receiver)
        return createShadowMethod(useSite, innerValue, receiver, shadow)
      } else {
        return innerValue
      }
    },
    set: (target, prop, value, receiver) => {
      // 禁止改追踪身份字段；关联属性转给 Context，其余写入使用带 shadow 的接收者。
      if (prop === symbols.original) return false
      if (prop === symbols.caller) return false
      if (prop === tracker.property) return false
      if (typeof prop === 'symbol') {
        return Reflect.set(target, prop, value, receiver)
      }
      if (tracker.associate && useSite.reflect.props[`${tracker.associate}.${prop}`]) {
        return Reflect.set(ctx, `${tracker.associate}.${prop}`, value, withProp(ctx, symbols.receiver, receiver))
      }
      const shadow = createShadow(useSite, target, tracker.property, receiver)
      return Reflect.set(target, prop, value, shadow)
    },
    apply: (target, thisArg, args) => {
      // 仅函数对象可触发 apply。可调用服务会在这个视图上执行 invoke，使调用也携带使用处配置。
      const receiver = tracker.noShadow
        ? proxy
        : createShadow(useSite, target, tracker.property, proxy)
      return applyTraceable(receiver, target, thisArg, args)
    },
  })
  return proxy
}

function applyTraceable(proxy: any, value: any, thisArg: any, args: any[]) {
  // 未声明 invoke 就按普通函数调用；声明了则使用协议方法，以代理为 this。
  if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args)
  return value[symbols.invoke].apply(proxy, args)
}

export function createCallable(name: string, proto: {}, tracker: Tracker) {
  // 返回真正的 function 对象，再挂上服务原型，所以它既能 (...) 调用，也能访问服务方法。
  // self 闭包在将来被调用时才读取 self.ctx；此函数创建时还不执行服务。
  const self = function (...args: any[]) {
    const proxy = createTraceable(self['ctx'], self, tracker)
    return Reflect.apply(proxy, this, args)
  }
  defineProperty(self, 'name', name)
  return Object.setPrototypeOf(self, proto)
}

interface StackInfo {
  // 保存内部栈的参照位置，方便错误发生时把框架细节替换为注册/调用处的外层栈。
  offset: number
  error: Error
}

function handleError(info: StackInfo, reason: any, getOuterStack: () => string[]): never {
  // never 表示本函数不会正常返回，因为每条路径最终都 throw。
  // 非 Error 风格的拒绝值先包装；已有堆栈则尝试找连接点，找不到就原样抛出。
  const innerLines = info.error.stack!.split('\n')

  // malformed error
  if (typeof reason?.stack !== 'string') {
    const outerError = new Error(reason)
    const lines = outerError.stack!.split('\n')
    lines.splice(1, Infinity, ...getOuterStack())
    outerError.stack = lines.join('\n')
    throw outerError
  }

  // long stack trace
  const lines: string[] = reason.stack.split('\n')
  let index = lines.indexOf(innerLines[2])
  if (index === -1) throw reason

  index -= info.offset
  while (index > 0) {
    if (!lines[index - 1].endsWith(' (<anonymous>)')) break
    index -= 1
  }
  lines.splice(index, Infinity, ...getOuterStack())
  reason.stack = lines.join('\n')
  throw reason
}

export function composeError<T>(callback: (info: StackInfo) => T, getOuterStack = buildOuterStack()): T {
  // 同步返回值保持原状；同步异常和 thenable 拒绝都交给同一堆栈处理。
  // 这里只探测对象有 then，未验证 then 一定为函数；调用时的异常也会进入 catch。
  const info: StackInfo = { offset: 1, error: new Error() }

  try {
    const result: any = callback(info)
    if (isObject(result) && 'then' in result) {
      return (result as any).then(undefined, (reason) => handleError(info, reason, getOuterStack)) as T
    } else {
      return result
    }
  } catch (reason: any) {
    handleError(info, reason, getOuterStack)
  }
}

export function buildOuterStack(offset = 0) {
  // 现在捕获 Error，返回闭包以后才切分栈字符串；保留的是注册位置，而非清理发生时的位置。
  const outerError = new Error()
  return () => outerError.stack!.split('\n').slice(3 + offset)
}
