/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
// 重置调度状态，以上所有状态信息都重置为默认值
function resetSchedulerState () {
  /*
   ① 清空 queue、activatedChildren 等数组（将数组 length 置为 0 是即清空数组）
   ② 计位器 index 置 0
  */
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
/*
  注意这里的语法：
  ① () => number 是变量 getNow 的类型，也就是返回值为数值的函数
  ② 和 let getNow = () => Date.now 不要混淆了
  ③ getNow 的默认值是 Date.now，部分浏览器会重写为 performance.now
*/
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  // 当前时间戳
  currentFlushTimestamp = getNow()

  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  /*
     在 flush 之前，对 queue 进行排序，原因有三：
     1. 组件更新时从父组件到子组件的顺序（因为父组件会比子组件先创建）
     2. 组件的自定义 watcher 会比渲染 watcher 先执行计算（因为自定义 watcher 先创建）
     3. 如果某个组件在父组件的 watcher 执行期间被销毁了，那么这个组件的 watcher 就可以不执行了
  */
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 这里没有对 queue.length 进行缓存，是因为在循环过程中，可能还会有新的 watcher 加入到 queue 中
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null

    watcher.run()

    /*
        ① 前面说过，这个 queue 在循环执行过程中是可以动态更新的，也就是允许新的 watcher 入队
        ② 若执行 watcher.run() 过程中，又执行 queueWatcher() 将这个 watcher 入队了，于是 has[id] = true
        ③ 那就把 circular[id] 加 1，表示这个 watcher 又 run 了一次
        ④ 若在这个 for 循环某个 watcher run 的次数超过了 MAX_UPDATE_COUNT（这里是 100 次），那就可能出现了无限循环，立即终止循环
     */
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      // MAX_UPDATE_COUNT 值为 100
      if (circular[id] > MAX_UPDATE_COUNT) {
        // 警告：可能是个无限循环...
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  // 重置之前保留副本
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置所有状态信息
  resetSchedulerState()

  // call component updated and activated hooks
  // 调用激活钩子，更新钩子
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

// 依次遍历 queue 中 watcher，分别调用对应的 vm 的 updated 钩子函数
function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 该 watcher 为渲染 watcher && 已渲染过 && 还未销毁
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
 // 标记 vm 激活
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

// 遍历 queue 中所有 vm，依次激活 vm 的子组件
function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true

    // 1. 不在 flushing 过程中，直接将 watcher 放在队尾，反正 flushing 开始后会重现排序
    if (!flushing) {
      queue.push(watcher)
    // 2. 正在 flushing 过程中，那就找个合适的位置插队吧
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      // 在有序数组 queue 中找到合适位置，让 watcher 插个队
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }

    // queue the flush
    // 启动 flushSchedulerQueue，并关闭开关
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue)
    }
  }
}
