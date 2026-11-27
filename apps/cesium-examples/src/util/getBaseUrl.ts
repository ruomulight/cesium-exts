/**
 * 获取当前页面的完整地址，不包含查询参数和哈希片段。
 *
 * 地址保留协议、主机（包含非默认端口）和路径，适合在不携带当前页面状态时生成链接。
 * 例如 `https://example.com/app?id=1#map` 返回 `https://example.com/app`。
 *
 * @returns 当前页面去除查询参数和哈希片段后的地址。
 */
export function getBaseUrl() {
  return `${location.protocol}//${location.host}${location.pathname}`;
}
