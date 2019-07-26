/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
 /*
    为什么新建一个 watcher 就可以起到观察表达式/函数的作用呢？

    / 新建 Vue 实例
    vm = new Vue({
      data : {
        aaa : {
            bbb : {
                ccc : {
                    ddd : 1
                }
            }
        }
      }
    });

    // 新建 watcher
    var watcher = new Watcher(vm, 'aaa.bbb.ccc' , cb, options);

    理一理这个 watcher 工作的基本流程：

    (1) 执行 watcher = new Watcher() 会定义 watcher.getter = parsePath('aaa.bbb.ccc')（这是一个函数，稍后会解释），同时也会定义 watcher.value = watcher.get()，而这会触发执行 watcher.get()
    (2) 执行 watcher.get() 就是执行 watcher.getter.call(vm, vm)
    (3) parsePath('aaa.bbb.ccc').call(vm, vm) 会触发 vm.aaa.bbb.ccc 属性读取操作
    (5) vm.aaa.bbb.ccc 属性读取会触发 aaa.bbb.cc 属性的 get 函数（在 defineReactive$$1 函数中定义）
    (6) get 函数会触发 dep.depend()，也就是 Dep.target.addDep(dep)，即把 Dep.target 这个 Watcher 实例添加到 dep.subs 数组里（也就是说，dep 可以发布消息通知给订阅者 Dep.target）
    (7) 那么 Dep.targe 又是什么呢？其实 (2) 中执行 watcher.get() 之前已经将 Dep.target 锁定为当前 watcher（等到 watcher.get() 执行结束时释放 Dep.target）
    (8) 于是，watcher 就进入了 aaa.bbb.ccc 属性的订阅数组，也就是说 watcher 这个订阅者订阅了 aaa.bbb.ccc 属性
    (9) 当给 aaa.bbb.ccc 属性赋值时，如 vm.aaa.bbb.ccc = 100 会触发 vm 的 aaa.bbb.ccc 属性的 set 函数（在 defineReactive$$1 函数中定义）
    (10) set 函数触发 dep.notify()
    (11) 执行 dep.notify() 就会遍历 dep.subs 中的所有 watcher，并依次执行 watcher.update()
    (12) 执行 watcher.update() 又会触发 watcher.run()
    (13) watcher.run() 触发 watcher.cb.call(watcher.vm, value, oldValue);
 */
 /*
    一个 watcher 实例主要做以下几件事：
    ① 解析表达式 expOrFn，它可能是字符串形式的表达式或者是函数
    ② 收集主题 deps。watcher 取值过程中若获取某个”活性“属性 key，那么就说明这个 watcher 对属性 key 感兴趣，就把 watcher 和 key 的 dep 互相”关注“
    ③ 当 expOrFn 变化时，就能触发回调函数 cb 执行
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm

    // 标记渲染 watcher
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)

    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    // 1. expOrFn 为函数，那就将其赋值给 this.getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    // 2. expOrFn 为形如 'aaa.bbb.ccc' 的路径
    } else {
      // parsePath(path)(obj) 在对象 obj 找到路径 path 对应的值
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    // 重要：this.lazy 为假时会触发 this.get() -> this.getter.call(vm, vm)
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // 会触发活性对象属性的 getter 操作，也就是说会引起该 watcher 对活性对象属性的订阅
  get () {
    // 将 Dep.target 锁定为当前 watcher
    pushTarget(this)

    let value
    const vm = this.vm
    try {
      /*
        例如：
        var vm = new Vue({
          data : {
              a : 1
          }
        });

        对于 expOrFn = 'a'
        this.getter = parsePath('a')

        于是 this.getter.call(vm, vm)
        -> vm.a

        【重要】这里属性获取操作触发当前 Watcher 实例对 vm.a 属性的订阅

        这里对 vm.a 的属性读取会触发 defineReactive 函数中对 vm 的 a 属性的 get 操作的拦截
        于是当前 watcher 实例会订阅 a 属性的变化（添加到 dep.subs 数组里）
       */
      value = this.getter.call(vm, vm)
      /*
        官方文档指出：
        如果你为一个计算属性使用了箭头函数，则 this 不会指向这个组件的实例，不过你仍然可以将其实例作为函数的第一个参数来访问。
        computed: {
          aDouble: vm => vm.a * 2
        }

        原因在于：这里执行 this.getter 函数时不光内部 this 指向 vm，连实参也是 vm
      */
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // 将 value 和其子元素（属性）对应的主题 id 统统收集到 seenObjects 中
        traverse(value)
      }
      // 解除锁定
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 互相关注
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      // 若 newDepIds 中没有 dep.id，说明这个 watcher 不再对这个 dep 感兴趣了，那就取消订阅
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    /*
      ① 这样没有创建新的集合，便完成了两个集合内容的交换。
      ② 试问，为什么需要 this.newDepIds = tmp 这一句？
        假如没这一句，那么 this.depIds 和 this.newDepIds 指针一样，它们会一起被清空了
    */
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()


    tmp = this.deps
    this.deps = this.newDeps
    // 改变 this.newDeps 指向，否则 this.deps 和 this.newDeps 一起清空
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 当订阅主题发出通知时，执行该函数
  update () {
    /*
      1. 标记 this.dirty 置为 true

      ① 若 this.dirty 为 false：
      在获取计算属性时就不会执行 watcher.evaluate() 以重新计算
      ② 反之，当订阅主题发出通知时，这里会将 this.dirty 置为 true
      那么下次获取该计算属性的值时，就会执行 watcher.evaluate() 以重新计算
    */
    if (this.lazy) {
      this.dirty = true
    // 2. 同步执行 this.run
    } else if (this.sync) {
      this.run()
    // 3. 当前 watcher 入队，异步执行 this.run
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // watcher 队列调度时，执行该方法
  run () {
    if (this.active) {
      const value = this.get()
      /*
        ① 监听的属性值改变，才会执行后面的回调函数等操作
        ② value 为引用类型的对象/数组时，即使引用不变，其值还是可能改变的
      */
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        // 更新值
        this.value = value

        // expOrFn 关联的属性值变化后，执行回调函数
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  // lazy watcher 会用到该方法
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  /*
     将当前 watcher1 的收集所有关注主题对象都交给当前的 Dep.target 这个 watcher2

     这相当于是一个好友推荐功能：
     ① watcher1 感兴趣的好友列表是 deps
     ② 现将其好友 deps 全都推荐给 wathcher2（Dep.target）
  */
  depend () {
    let i = this.deps.length
    while (i--) {
      /*
      看看 Dep.prototype.depend : function(){
          if (Dep.target) {
            Dep.target.addDep(this)
          }
      }

      所以，这里的作用是：
      遍历 this.deps，然后对每一个 dep 执行 Dep.target.addDep(dep)
     */
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  // 从所有依赖的订阅列表中移除该 watcher
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 从 vm 的 watcher 列表移除当前 watcher。这是个有点昂贵的操作，所以，如果 vm 正在被销毁，就跳过这个操作。
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
