import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

/*
 添加全局 api，["util", "set", "delete", "nextTick", "observable", "options", "use", "mixin", "cid", "extend", "component", "directive", "filter", "version"]
 其中，Vue.util在官方文档中并未列出，不过它其实是可用的，包括以下4个方法：
 Vue.util = {
   warn,
   extend,
   mergeOptions,
   defineReactive
 }
 */
initGlobalAPI(Vue)

Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

Vue.version = '__VERSION__'

export default Vue
