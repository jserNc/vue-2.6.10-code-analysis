/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

// 将 val 和其子元素（属性）对应的主题 id 统统收集到 seenObjects 中
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)

  // 1. val 不是数组、不是对象、不可扩展，直接返回
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  // 2. val 已被观察，seenObjects 收集主题 id
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  // 3. val 是数组，seenObjects 还要递归收集每个子元素主题 id
  if (isA) {
    i = val.length
    while (i--) _traverse(val[i], seen)
  // 4. val 是对象，seenObjects 还要递归收集每个子属性主题 id
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
