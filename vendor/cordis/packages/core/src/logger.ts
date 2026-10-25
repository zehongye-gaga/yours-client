// 本文件分两层：Logger 生成一条条结构化日志，LoggerService 共享序号、导出器和有限缓冲区。
// 格式化是显式能力，最终如何输出由 exporter.export 决定；默认导出器只存内存，不打印终端。
// 导入用途：defineProperty 写内部标记，hyphenate 整理默认名称；Context/Fiber 关联调用位置；
// Service 复用拦截配置规则；utils 让日志服务成为可调用对象，并保留原型和上下文追踪。
import { defineProperty, hyphenate } from 'cosmokit'
import { Context } from './context.ts'
import { Fiber } from './fiber.ts'
import { Service } from './service.ts'
import { createCallable, joinPrototype, symbols, Tracker } from './utils.ts'

// 字面量联合限定四种名称；LoggerMethod/Formatter 是函数类型，编译后不会生成函数实现。
export type LoggerType = 'error' | 'info' | 'warn' | 'debug'

export type LoggerMethod = (format: any, ...param: any[]) => void

export type Formatter = (value: any, exporter: Exporter, message: Message) => any

export const enum LoggerLevel {
  // 数值越大放行越详细的日志；例如 INFO(2) 允许 ERROR/WARN/INFO，过滤 DEBUG(3)。
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface Message {
  // sn 是整个 LoggerService 的递增序号，ts 是毫秒时间戳；args 保留原始参数供各导出器处理。
  sn: number
  ts: number
  name: string
  type: LoggerType
  level: number
  args: any[]
  fiber?: WeakRef<Fiber>
  // WeakRef 只弱引用日志所属 Fiber，使缓冲日志不会仅因这个字段阻止 Fiber 被垃圾回收。
}

export interface Exporter {
  // colors/maxLength/formatters 给 Logger.format 使用；levels 控制导出门槛，export 才负责实际接收消息。
  colors?: number | false
  maxLength?: number
  levels?: Record<string, number>
  formatters?: Record<string, Formatter>
  export(message: Message): void
}

export const defaultFormatters: Record<string, Formatter> = {
  // 对应 %s/%d 等占位符；%o/%O 在此用 JSON.stringify，并非完整的对象检查器。
  s: (value) => String(value),
  d: (value) => Math.trunc(Number(value)),
  i: (value) => Math.trunc(Number(value)),
  f: (value) => Number(value),
  o: (value) => JSON.stringify(value),
  O: (value) => JSON.stringify(value),
  c: () => '',
  C: (value, exporter, message) => {
    return Logger.color(exporter, Logger.code(message.name, exporter.colors), value)
  },
}

export interface LoggerOptions {
  name: string
  meta?: Partial<Message>
  level?: number
}

// 同名 interface 与 class 合并，使 Object.assign 赋入的字段和动态创建的四个方法有类型。
// Record 把联合中的每个键映射到 LoggerMethod；Partial<Message> 则让消息元信息的字段都可省略。
export interface Logger extends LoggerOptions {}
export interface Logger extends Record<LoggerType, LoggerMethod> {}

function isAggregateError(error: any): error is Error & { errors: Error[] } {
  // 只检查 Error 实例和 errors 数组，也接受具有这种形状的其他 Error 子类。
  return error instanceof Error && Array.isArray(error['errors'])
}

export class Logger {
  static color(exporter: Exporter, code: number, value: any, decoration = '') {
    // 根据导出器颜色能力包一层 ANSI 转义码；未启用颜色时直接转字符串。
    if (!exporter.colors) return '' + value
    return `\u001b[3${code < 8 ? code : '8;5;' + code}${exporter.colors >= 2 ? decoration : ''}m${value}\u001b[0m`
  }

  static code(name: string, level?: false | number) {
    // 由名称算稳定的颜色索引；位运算把 hash 压为 32 位整数，不是安全散列。
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 3) - hash) + name.charCodeAt(i) + 13
      hash |= 0
    }
    const colors = !level ? [] : level >= 2 ? c256 : c16
    return colors[Math.abs(hash) % colors.length]
  }

  static format(exporter: Exporter, message: Message): string {
    // 复制参数数组后再消费，不移动 message.args 的元素；错误优先显示堆栈，非字符串用 %o。
    const args = message.args.slice()
    if (args[0] instanceof Error) {
      args[0] = args[0].stack || args[0].message
      args.unshift('%s')
    } else if (typeof args[0] !== 'string') {
      args.unshift('%o')
    }

    let format: string = args.shift()
    format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
      // %% 不消费参数；自定义格式化器优先，未知占位符保留原文。
      if (match === '%%') return '%'
      const formatter = exporter.formatters?.[char] ?? defaultFormatters[char]
      if (typeof formatter === 'function') {
        const value = args.shift()
        return formatter(value, exporter, message)
      }
      return match
    })

    const oFormatter = exporter.formatters?.o ?? defaultFormatters.o
    // 多余参数追加到末尾，对象也通过格式化器转换。
    for (let arg of args) {
      if (typeof arg === 'object' && arg) {
        arg = oFormatter(arg, exporter, message)
      }
      format += ' ' + arg
    }

    const { maxLength = 10240 } = exporter
    // 按行截断（不是截断整条消息），省略号额外占三个字符。
    return format.split(/\r?\n/g).map(line => {
      return line.slice(0, maxLength) + (line.length > maxLength ? '...' : '')
    }).join('\n')
  }

  constructor(options: LoggerOptions, private service: LoggerService) {
    // Logger 保存名称/配置并共用 service；四个方法由 _method 返回闭包，捕获此 Logger 的 this。
    Object.assign(this, options)
    this.error = this._method('error', LoggerLevel.ERROR)
    this.info = this._method('info', LoggerLevel.INFO)
    this.warn = this._method('warn', LoggerLevel.WARN)
    this.debug = this._method('debug', LoggerLevel.DEBUG)
  }

  private _method(type: LoggerType, level: number): LoggerMethod {
    return (...args: any[]) => {
      if (args.length === 1 && args[0] instanceof Error) {
        // cause 为真值时先记录原因再记录外层错误；否则非空聚合错误展开成员后结束本次调用。
        if (args[0].cause) {
          this[type](args[0].cause)
        } else if (isAggregateError(args[0]) && args[0].errors.length) {
          // An aggregate with no members has nothing to flatten; it is logged
          // as itself, like any other error.
          args[0].errors.forEach(error => this[type](error))
          return
        }
      }

      const sn = ++this.service._snMessage
      const ts = Date.now()
      // 同一次调用的各导出器共用序号/时间；每个导出器独立选择等级并接收自己的 Message 对象。
      for (const exporter of this.service.exporters.values()) {
        // 优先级：此名称的 exporter 配置 → exporter 默认 → Logger 配置 → INFO。
        const targetLevel = exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? LoggerLevel.INFO
        if (targetLevel < level) continue
        const message: Message = { sn, ts, type, level, name: this.name, ...this.meta, args }
        // 对象展开是浅复制，meta 可覆盖前面字段；args 最后写入。此处不自动调用 Logger.format。
        exporter.export(message)
      }
    }
  }
}

// 两套可选终端颜色表，code() 按导出器能力选择。
export const c16 = [6, 2, 3, 4, 5, 1]
export const c256 = [
  20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62,
  63, 68, 69, 74, 75, 76, 77, 78, 79, 80, 81, 92, 93, 98, 99, 112, 113,
  129, 134, 135, 148, 149, 160, 161, 162, 163, 164, 165, 166, 167, 168,
  169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200,
  201, 202, 203, 204, 205, 206, 207, 208, 209, 214, 215, 220, 221,
]

export namespace LoggerService {
  // 只有配置接口，描述 ctx.intercept('logger', ...) 可覆盖的名称和等级。
  export interface Intercept {
    name?: string
    level?: number
  }
}

export interface LoggerService extends Record<LoggerType, LoggerMethod> {
  // 调用签名表示 ctx.logger(name) 可返回 Logger；运行时可调用性必须靠下方 createCallable 实现。
  (name?: string): Logger
}

export class LoggerService {
  // declare 只给配置类型推导提供 metadata，不生成字段。
  declare [symbols.metadata]: LoggerService.Intercept

  bufferSize = 1000
  // 这些是一个根环境共享的状态；ctx 则会经追踪代理体现当前使用处。
  buffer: Message[] = []
  ctx!: Context

  _snMessage = 0
  _snExporter = 0
  exporters = new Map<number, Exporter>()

  constructor(ctx: Context) {
    const tracker: Tracker = {
      property: 'ctx',
      noShadow: true,
    }
    const self = createCallable('logger', joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker) as unknown as LoggerService
    // 双重 as 是告诉 TS 如何看待对象，不会改变对象；真正的 function 已由 createCallable 创建。
    // 拷贝类字段初始值（包含同一 buffer/Map 引用），再返回 self，所以 new 的结果是这个函数。
    Object.assign(self, this)
    self.ctx = ctx
    defineProperty(self, symbols.tracker, tracker)

    self.exporter({
      // 默认只在内存保留最近的日志：超上限删最老项；若上限缩小导致超出多项，就一次 splice。
      colors: 3,
      export: (message) => {
        self.buffer.push(message)
        // for better performance
        const overflow = self.buffer.length - self.bufferSize
        if (overflow === 1) {
          self.buffer.shift()
        } else if (overflow > 1) {
          self.buffer.splice(0, overflow)
        }
      },
    })

    return self
  }

  exporter(exporter: Exporter) {
    // 动态增加输出目标也是 effect：调用者 Fiber 清理时移除这个导出器，不影响其他目标。
    return this.ctx.effect(() => {
      const id = ++this._snExporter
      this.exporters.set(id, exporter)
      return () => this.exporters.delete(id)
    }, 'ctx.logger.exporter()')
  }

  [symbols.invoke](name?: string): Logger {
    // ctx.logger(...) 的真实入口。caller 用于确定日志归属的 Fiber，ctx 提供使用处的拦截配置。
    const caller = (this as any)[symbols.caller] as Context | undefined
    const config: LoggerService.Intercept = Service.prototype[Service.resolveIntercept].call(this)
    const fiber = (caller ?? this.ctx).fiber
    name ??= config.name
    // ??= 只在 null/undefined 时补值，所以显式传空字符串仍会保留。
    name ??= hyphenate(fiber.name)
    return new Logger({
      name,
      level: config.level,
      meta: { fiber: new WeakRef(fiber) },
    }, this)
  }

  static {
    // 类定义时为原型补四个快捷方法；ctx.logger.info(...) 等价于先生成当前 Logger 再调用 info。
    // as const 让 type 保持四种字面量类型；function 的 this 由调用位置决定。
    for (const type of ['error', 'info', 'warn', 'debug'] as const) {
      ;(LoggerService.prototype as any)[type] = function (this: LoggerService, ...args: any[]) {
        return (this as any)()[type](...args)
      }
    }
  }
}
