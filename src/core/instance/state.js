/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

/*
  先看看原生 Proxxy 用法：
  var obj = new Proxy({}, {
    get: function (target, key, receiver) {
      console.log(`getting ${key}!`);
      return Reflect.get(target, key, receiver);
    },
    set: function (target, key, value, receiver) {
      console.log(`setting ${key}!`);
      return Reflect.set(target, key, value, receiver);
    }
  });

  而 proxy(target, sourceKey, key) 作用是拦截 target[key] 的 getter/setter 操作：
  例如：proxy(vm, `_data`, key)
  get: vm[key] -> vm._data[key]
  set: vm[key] = val -> vm._data[key] = val
*/
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 注意顺序：props -> methods -> data -> computed -> watch
export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    // 激活 vm._data = {} 对象，劫持其属性的增删改查
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

/*
  ************props语法*************

  // 简单语法
  Vue.component('props-demo-simple', {
    props: ['size', 'myMessage']
  })

  // 对象语法，提供校验
  Vue.component('props-demo-advanced', {
    props: {
      // 检测类型
      height: Number,
      // 检测类型 + 其他验证
      age: {
        type: Number,
        default: 0,
        required: true,
        validator: function (value) {
          return value >= 0
        }
      }
    }
  })

  ************props + propsData语法*************

  var Comp = Vue.extend({
    props: ['msg'],
    template: '<div>{{ msg }}</div>'
  })

  var vm = new Comp({
    propsData: {
      msg: 'hello'
    }
  })
*/
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 只有根实例的 props 才转换
  if (!isRoot) {
    toggleObserving(false) // 锁定
  }

  for (const key in propsOptions) {
    keys.push(key)

    // 计算获得合法的属性值
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      // 将驼峰转为连字符形式，如 someCamelCaseValue -> some-camel-case-value
      const hyphenatedKey = hyphenate(key)

      // 保留属性则发出警告
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }

      /*
        defineReactive (
          obj: Object,
          key: string,
          val: any,
          customSetter?: ?Function,
          shallow?: boolean
        )
        第 4 个参数 customSetter 是设置属性时的回调函数

        这里将 key 都定义到 props = vm._props 对象上
      */
      defineReactive(props, key, value, () => {
        // 警告：不要直接修改 props
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      // 这里将 key 都定义到 props = vm._props 对象上
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.

    /*
      ① 上面的 defineReactive(props, key, value) 将 key 属性都定义在 vm._props 对象上了
      ② 这里 proxy(vm, `_props`, key) 意思是获取/设置 vm[key] 属性，实际上是获取/设置 vm._props[key] 属性
      ③ proxy(vm, `_props`, key) 的作用是给 vm 定义 key 属性，若 key in vm 就不必重新定义了
      ④ for ... in 循环可获取对象的所有可枚举属性（包括继承自原型链的），所以原型链上的部分 key in vm 为 true，这里只需重新定义自己的部分属性
    */
    if (!(key in vm)) {
      // 用 vm[key] 代理 vm["_props"][key]
      proxy(vm, `_props`, key)
    }
  }

  toggleObserving(true) // 解除锁定
}

function initData (vm: Component) {
  let data = vm.$options.data

  // data 若是函数，则取该函数执行结果
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}

  // 至此，data 必须为对象，若不是，则强行置为 {}，并发出警告
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods

  let i = keys.length
  while (i--) {
    const key = keys[i]
    /*
      initState 函数中初始化顺序为：
      initProps -> initMethods -> initData -> ...
    */
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      /*
       ① 上面已经将 vm.$options.data 赋值给 vm._data
       ② 这里表示 vm[key] 的 getter/setter 操作实际是对 vm._data[key] 的操作
      */
      proxy(vm, `_data`, key)
    }
  }

  /*
    若 data 为空对象 {}，那就不会走上边的 while 循环，也就不会执行 proxy(vm, `_data`, key)
    也就是说，就不能通过 vm[key] 来获取 vm._data[key] 的属性了（不过，本来空对象也没啥属性了）

    不管 data 是否为空对象了，都在这里激活该对象，即监听对象属性的 getter 收集依赖，监听对象的 setter 触发更新
  */
  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 为了避免 data 函数里【访问 vm 的属性】触发依赖收集，这里不传参，Dep.target 为 undefined，表示关闭依赖收集
  pushTarget()
  try {
    /*
     重要：这里新增 vm 作为 data 函数的实参，那么以后就可以再 data 函数了访问 vm 对象了，这个会很方便

     正因为在这里会【访问 vm 的属性】，而【访问 vm 的属性】就会触发依赖收集，
     而这里只是才刚开始进入 data 初始化阶段（getData 被 initData 调用），所以不能收集依赖

     Vue 2.4.0 这里的写法是 return data.call(vm)，不会将 vm 作为实参，所以也就不需要关闭依赖收集了

     不过，话说回来，似乎也确实没必要传实参 vm，毕竟有了 call 绑定 vm，那么 data 函数内部可以通过 this 获取到 vm
    */
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget() // 解锁依赖收集
  }
}

const computedWatcherOptions = { lazy: true }

/*
  初始化计算属性，分两步：
  1. 对每一个 key 新建一个 watcher
  watchers[key] = new Watcher(
    vm,
    getter || noop,
    noop,
    computedWatcherOptions
  )

  2. 定义 vm[key] 属性，即拦截 getter/setter。这一步会用到上一步的 watcher 收集的主题依赖。
  defineComputed(vm, key, userDef)
*/
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    /*
      computed: {
        // 仅读取
        aDouble: function () {
          return this.a * 2
        },
        // 读取和设置
        aPlus: {
          get: function () {
            return this.a + 1
          },
          set: function (v) {
            this.a = v - 1
          }
        },
        // 箭头函数的实参是 vm，原因见 Watcher 构造函数的定义
        aSquare: vm => vm.a * vm.a
      }
    */
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      // 定义 target[key] 属性，即拦截 getter/setter
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

// 拦截 target[key] 计算属性的 getter/setter
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  // 定义 target[key] 属性，即拦截 getter/setter
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      /*
        ① 每次 watcher 关注的订阅主题执行 dep.notify() 发出通知，会导致 watcher.update() 执行
        ② 上面可以看到计算属性的 watcher.lazy 均为 true
        ③ watcher.update() 执行时碰到 watcher.lazy 为 true，会将 watcher.dirty 置为 true
        ④ 这意味着 watcher 关注的属性改变了，所以该计算属性需要重新计算
        ⑤ 当然了，正如 lazy 意味惰性，计算属性也没有立即计算，等到”这里“才重新计算
        ⑥ ”这里“指的是当前函数执行，当前函数是赋值给计算属性 key 对应的 getter 方法
        ⑦ 也就是说，等到再次获取该计算属性（执行 getter）方法时才重新计算属性值
      */
      if (watcher.dirty) {
        watcher.evaluate()
      }

      /*
         watcher.depend() 的作用是对 watcher 的所有 deps 进行遍历，对每一个 dep 执行 Dep.target.addDep(dep)
         其实就是一个关注的动作，关注谁呢？举例：

          computed: {
            aPlusB: function() {
              return this.a + this.b
            }
          }

         aPlusB 对应的 watcher 关注的目标就是 this.a 和 this.b，也就是它们分别对应的 dep

         再看，watcher.depend() 的作用是：
         将当前 watcher1 的收集所有关注主题对象都交给当前的 Dep.target 这个 watcher2

         这相当于是一个好友推荐功能：
         ① watcher1 感兴趣的好友列表是 deps
         ② 现将其好友 deps 全都推荐给 wathcher2（Dep.target）

         为什么要将 watcher 的订阅主题对象都推荐给 Dep.target 呢？

         别忘了当前函数是一个计算属性 aPlusB 的 getter 函数（这里 computedGetter 方法其实是赋值给上面 aPlusB 属性的 getter 方法，也就是每次获取 vm.aPlusB 属性就会走到这里函数里）
         回想一下 Dep.target 是在执行 value = Dep.target.getter.call(vm, vm) 期间被锁定的。
         也就是说在 Dep.target 计算 value 值的过程中调用了计算属性 aPlusB 的 getter 函数。
         于是，可以认为 Dep.target 对 aPlusB 关注，而 aPlusB 又对 a、b 关注。
         所以，Dep.target 需要对 a、b 的动态也表示关注。

         回过头来看，好像 Dep.target 并没有对 aPlusB 表示关注，其实是没有必要
         a，b 才是自变量，aPlusB 只是因变量，关注自变量就够了，不然还会引起重复”反馈“等问题
      */
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}


// 绑定内部 this 和第一个实参
function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

// 遍历所有 methods，将函数内部 this 都锁定为 vm
function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      // 1. method 必须为函数
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      // 2. method 函数名不能和 props 属性名重名
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      // 3. 不能和已有的方法同名（主要指 _ 或 $ 开头的方法名）
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    // 函数内部的 this 锁定为 vm
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

// 初始化 watch
function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]

    /*
    watch: {
      a: function (val, oldVal) {
        console.log('new: %s, old: %s', val, oldVal)
      },
      // 方法名
      b: 'someMethod',
      // 深度 watcher
      c: {
        handler: function (val, oldVal) { },
        deep: true
      },
      // 该回调将会在侦听开始之后被立即调用
      d: {
        handler: function (val, oldVal) { },
        immediate: true
      },
      e: [
        'handle1',
        function handle2 (val, oldVal) { },
        {
          handler: function handle3 (val, oldVal) { },
        }
      ],
      // watch vm.e.f's value: {g: 5}
      'e.f': function (val, oldVal) { }
    }
    */
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 调用 vm.$watch(expOrFn, handler, options) 来监听
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  /*
    get: vm.$data -> vm._data
    set: 警告：不允许设置 vm.$data 属性
  */
  Object.defineProperty(Vue.prototype, '$data', dataDef)

  /*
    get: vm.$props -> vm._props
    set: 警告：不允许设置 vm.$props 属性
  */
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 监听函数或表达式的变化，返回值为取消监听的函数句柄
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // 立即调用 cb 回调函数，实参为 watcher.value
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }

    // 返回一个句柄，可以取消监听
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
