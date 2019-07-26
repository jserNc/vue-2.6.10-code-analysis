/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  // makeMap 函数创造一个key-vlaue映射表，返回一个函数，判断某个 key 是否在该映射表里
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  // 发出警告：实例的属性/方法未定义
  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  // 发出警告：应通过 $data[key] 形式来获取属性
  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  // 是否原生支持 Proxy
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    // 内置修饰符
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        // 1. 内置修饰符不可重置
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        // 2. 可以自定义其他修饰符
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // 拦截 in 运算符，如 propKey in proxy，返回布尔值
  const hasHandler = {
    has (target, key) {
      const has = key in target

      // 全局内置变量 或 '_' 开头的变量（不存在于 target.$data 对象中）
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))


      if (!has && !isAllowed) {
        // 1. 警告：应通过 $data[key] 形式来获取属性
        if (key in target.$data) warnReservedPrefix(target, key)
        // 2. 警告：实例的属性/方法未定义
        else warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  // 拦截对象属性的的读取，如 proxy.foo和proxy['foo']
  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        // 1. 警告：应通过 $data[key] 形式来获取属性
        if (key in target.$data) warnReservedPrefix(target, key)
        // 2. 警告：实例的属性/方法未定义
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  // 拦截 vm 属性，对获取或查询不存在的属性时发出警告
  initProxy = function initProxy (vm) {
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      const handlers = options.render && options.render._withStripped
        ? getHandler // 拦截对象属性的读取
        : hasHandler // 拦截 prop in vm 的操作，返回一个布尔值
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
