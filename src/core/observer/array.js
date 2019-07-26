/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// arrayMethods对象完全继承Array.prototype的属性（Array.prototype是arrayMethods的原型）
export const arrayMethods = Object.create(arrayProto)

// 重要：以下方法均会改变原数组
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]

  /*
    以上方法的共同点是：都会改变原数组
    于是，拦截这些方法，重新定义 arrayMethods['push' | 'pop' | 'shift' | 'unshift' | 'splice' | 'sort' | 'reverse']
   */
  def(arrayMethods, method, function mutator (...args) {
    const result = original.apply(this, args)
    const ob = this.__ob__
    let inserted
    // 以下3个方法会新增元素
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 观察每一项新增元素
    if (inserted) ob.observeArray(inserted)
    // notify change，通知更新
    ob.dep.notify()
    // 返回原方法值
    return result
  })
})
