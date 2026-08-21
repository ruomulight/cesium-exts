/**
 * 基于 Promise 的延迟函数，用于在异步操作期间暂停代码执行。
 * 设计初衷是配合 `async/await` 语法使用。
 *
 * @param ms - 需要等待（暂停）的毫秒数
 * @returns 返回一个在指定毫秒数后状态变为 resolve 的 Promise
 *
 * @example
 * // 使用示例：
 * console.log('开始');
 * await sleep(1000); // 暂停 1 秒钟
 * console.log('1秒后执行');
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
