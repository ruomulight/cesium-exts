/**
 * 通用工具类
 */
export class Util {
  /**
   * 合并多个对象到一个新对象中
   * @param args - 要合并的对象列表
   * @returns 合并后的新对象
   */
  static merge<T extends Record<string, unknown>>(...args: T[]): T {
    const merged: T = {} as T;
    for (const obj of args) {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          merged[key] = obj[key]!;
        }
      }
    }
    return merged;
  }
}
