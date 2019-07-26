/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 */
// 判断一个字符串是否以 $ 或 _ 开头
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  /*
    '$'.charCodeAt(0) -> 36 -> 0x24
    '_'.charCodeAt(0) -> 95 -> 0x5F
  */
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
// 在对象上定义一个新属性或者修改一个已有属性
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
// 匹配除了a-zA-Z、$、_、数字以及其他合法字符以外的字符
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)

/*
 bailRE.test('.') -> false
 bailRE.test('$') -> false

 bailRE.test('<') -> true

 对于，bailRE.test(path)，只要 path 中有一个字符不是字母|数字|下划线|汉字|.|$等，
 就返回 true，那就认为不是路径，直接返回

 parsePath (path)(obj) 在对象 obj 中找到路径 path 对应的值

 例如：
 parsePath('aaa.bbb.ccc')({
    aaa : {
        bbb : {
            ccc : 1
        }
    }
 }) -> 1

 parsePath('aaa.bbb.ccc')({
    aaa : {
        bbb : 1
    }
 }) -> undefined

 parsePath('aaa.bbb.ccc')({
    aaa : {
        bbb : {
            ccc : {
                ddd : 1
            }
        }
    }
 }) -> {ddd: 1}
*/
// parsePath (path)(obj) 在对象 obj 找到路径 path 对应的值
export function parsePath (path: string): any {
  // 路径中遇到任何非常规字符，直接返回
  if (bailRE.test(path)) {
    return
  }
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
