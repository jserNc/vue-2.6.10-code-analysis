declare interface GlobalAPI {
  cid: number;
  options: Object;
  config: Config;
  util: Object;

  extend: (options: Object) => Function;
  set: <T>(target: Object | Array<T>, key: string | number, value: T) => T;
  delete: <T>(target: Object| Array<T>, key: string | number) => void;
  nextTick: (fn: Function, context?: Object) => void | Promise<*>;
  use: (plugin: Function | Object) => GlobalAPI;
  mixin: (mixin: Object) => GlobalAPI;
  compile: (template: string) => { render: Function, staticRenderFns: Array<Function> };

  directive: (id: string, def?: Function | Object) => Function | Object | void;
  component: (id: string, def?: Class<Component> | Object) => Class<Component>;
  filter: (id: string, def?: Function) => Function | void;

  observable: <T>(value: T) => T;

  // allow dynamic method registration，为插件方式新增全局api留下口子
  [key: string]: any
};

/*
console.log(Object.keys(Vue)) 输出：
(14) ["util", "set", "delete", "nextTick", "observable", "options", "use", "mixin", "cid", "extend", "component", "directive", "filter", "version"]

为什么没有 "config"属性，是因为 src/core/global-api/index.js 中定义该属性是非枚举的：
Object.defineProperty(Vue, 'config', {
  get: ...
  set: ...
})
*/
