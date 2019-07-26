/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

/*
  ./array.js 中：
  const arrayProto = Array.prototype
  export const arrayMethods = Object.create(arrayProto)

  ① 到这里 arrayMethods 是个空对象 {}，只不过原型指向 Array.prototype
  ② 然后，foreach 循环，通过 def() 方法为 arrayMethods 添加 ["push", "pop", "shift", "unshift", "splice", "sort", "reverse"] 等不可枚举属性
  ③ 虽然这些属性不可枚举，但是 Object.getOwnPropertyNames 方法可以返回属性的不可枚举属性
  ④ 所以，arrayKeys 为 ["push", "pop", "shift", "unshift", "splice", "sort", "reverse"]
 */
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
/*
  【Observer类】是和每一个【被观察的对象】关联的。一旦关联建立，
  就会拦截【被观察的对象】的每个属性的 getter/setters 进行劫持。
  其中：getter 会触发依赖收集；setter会触发通知更新。

  【Observer类】 -----vaule属性对应------> 【被观察的对象】
  【被观察的对象】 ----__ob__属性对应------>【Observer类】
*/
export class Observer {
  value: any; // 【被观察的对象】
  dep: Dep;   //  对【被观察的对象】感兴趣的订阅者主题对象，value更新时会通过该主题对象分发通知
  vmCount: number; // 同一个 value 对象可以作为多个组件的根 $data，vmCount 用来标记共有多少个组件将对象 value 作为根 $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0

    def(value, '__ob__', this) // 近似相当于value.__ob__ = this

    /*
    ① value 为如下格式数组：
       [
        { message: 'Foo' },
        { message: 'Bar' }
      ]
      依次遍历观察每一个对象
    */
    if (Array.isArray(value)) {
      // hasProto 为 true 则表明可以用对象的 __proto__ 属性
      if (hasProto) {
        protoAugment(value, arrayMethods) // value.__proto__ = arrayMethods，原型被劫持
      } else {
        copyAugment(value, arrayMethods, arrayKeys) // 若是不能劫持原型，那就将原型方法直接赋值给value对象
      }
      this.observeArray(value)
    /*
    ② value 为如下格式对象：
      { message: 'Foo' }
    */
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 依次劫持对象 obj 的每个属性的 getter、setter
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 依次观察数组每一项
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
// 简单粗暴劫持原型
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
// 依次将源对象的指定属性赋值给目标对象
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
/*
  返回一个与 value 对象/数组关联的 Observer 实例
  ① 若之前有创建过关联的 Observer 实例，那就用它，不需重新创建。
  ② 若之前没有关联的 Observer 实例，那就用 new Observer(value) 新创建一个

  本质就是调用 new Observer(value)。为 value 创建一个 Observer 实例。asRootData 为 true 表示当前 value 为根数据。
*/
export function observe (value: any, asRootData: ?boolean): Observer | void {
  //（若value不是对象/数组，则返回默认值undefined）
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void

  // ① 有关联的 Observer 实例，那就用它
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  // ② 没有关联的 Observer 实例，那就新建它
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  // 若作为根data，那么计数器加1
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
 /*
  在 obj 对象上拦截 key 属性的 get/set 操作，通俗地说有两点：

  ① 若在新建 watcher = new Watcher() 实例时，获取 obj[key] 属性，说明这个 watcher 对 obj[key] 属性感兴趣，那么就收集这个 watcher；
  ② 在设置 obj[key] = val 时，执行 customSetter()，并通知 watcher，然后 watcher 会执行相应的动作来更新视图
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 订阅者主题对象
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  /*
    ① observe(val) 的作用是观察 val 对象，若观察”成功“，返回观察者对象（真值）
    ② val 是 obj 对象的属性值，观察 val 意味着递归观察 obj 的子属性
    ③ shallow 意为”浅的“，若”深观察“并且观察”成功“，childOb 为 val 的观察者对象

    observe(val) -> new Observer(val) -> defineReactive()
  */
  let childOb = !shallow && observe(val)


  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val

      /*
          看看这句代码的执行流程：
          dep.depend()
          -> Dep.target.addDep(dep)
          -> Dep.target.newDepIds.add(dep.id)
             Dep.target.newDeps.push(dep)
             dep.addSub(Dep.target)

          也就是说：
          ① Dep.target 这个 watcher 收录 dep/dep.id（主题/主题id）
          ② dep 主题的订阅列表也收录 Dep.target 这个 watcher

          再深挖一下：
          ① Dep.target 表示正在计算当前属性值的 watcher，这是全局唯一的。任意时刻只允许有一个 watcher 正在计算。
          ② 代码流程能走到这个 Getter 方法里，说明此时 watcher 要获取 obj[key] 这个值
          ③ 这就说明正在计算属性值的 watcher 对 obj[key] 这个值感兴趣，反过来理解就是 obj[key] 会影响到计算结果
          ④ 那就把 obj[key] 对应的主题订阅对象和 watcher ”互相关注“
          ⑤ 所以当 obj[key] 改变时会通知 watcher。

          也就是说 watcher 需关注 obj[key] 对应的主题 dep，当 obj[key] 改变时再由 dep 来给 watcher 发通知。
      */
      if (Dep.target) {
        /*
         ① 会执行 Dep.target.addDep(dep)，即 watcher 关注 dep
         ② 也会执行 dep.addSub(Dep.target)，即 dep 关注 watcher

         所以，这个操作可以理解为 Dep.target 和 dep ”互相关注“
        */
        dep.depend()

        if (childOb) {
          // 子属性 obj[key] 的子属性对应的 dep 也和 watcher 互关
          childOb.dep.depend()

          // 数组 value 的每一项和当前 watcher 互关
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        /*
          注意：set/set 函数在这里是闭包，所以能共用 val 的值，简化一下 defineReactive$$1 函数看得更清楚：

          function defineReactive (obj, key, val) {
            Object.defineProperty(obj, key, {
              get: function () {
                return val
              },
              set: function (newVal) {
                val = newVal;
              }
            });
          }

          ① 当我们给 key 赋值时，如 obj[key] = 100 -> val = 100
          ② 当我们获取 key 的值时，即 obj[key] -> val (100)

          也就是说 100 是存在 val 这个中间变量里，这个 val 变量不属于 get 函数，也不属于 set 函数
          但它们可以共用
         */
        val = newVal
      }

      // 递归观察新的的属性值的子属性
      childOb = !shallow && observe(newVal)

      // 重点：属性值变化了，通知所有 watcher，这是视图发起变化的导火索
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// 用该方法给对象设置一个新的属性，可以在属性变化时触发视图更新
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // 1. target 为数组，调用已被劫持的 splice 方法来设置值，可以触发更新
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    /*
      这里为什么要先改变 target.length ?

      需求： 在数组 target = [1,2,3] 索引 10 处插入 'a'

      ① 直接调用 splice 方法插入，达不到预期效果
      target.splice(10, 1, 'a')
      -> target: [1, 2, 3, "a"]

      ② 先改变 target.length，再调用 splice 方法插入
      target.length = 10;
      target.splice(10, 1, 'a')
      -> target: [1, 2, 3, empty × 7, "a"]
    */
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }

  // 2. key 属性已经存在于 target 对象中，直接设置值可以触发更新
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }

  // 相当于 ob.value = target
  const ob = (target: any).__ob__

  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }


  if (!ob) {
    target[key] = val
    return val
  }

  // 3. target 对象新增 key 属性，拦截该属性的 getter/setter
  defineReactive(ob.value, key, val)

  // 通知更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // 1. target 为数组，调用已被劫持的 splice 方法来删除值，可以触发更新
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }

  // 相当于 ob.value = target
  const ob = (target: any).__ob__

  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }

  // 2. target 为对象，并且不存在 key 属性，直接返回
  if (!hasOwn(target, key)) {
    return
  }

  // 3. target 为对象，并且存在 key 属性，删除属性
  delete target[key]
  if (!ob) {
    return
  }

  // 通知更新
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
 // 数组的每一项和当前 watcher 互关
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    // e.__ob__.dep 和当前正在计算属性的 watcher “互相关注”
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
