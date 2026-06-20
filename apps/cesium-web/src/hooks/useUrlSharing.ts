import { useCallback, useState } from "react";
import { makeCompressedBase64String, decodeBase64Data } from "@/util/Helpers";

/**
 * 管理 Sandcastle 代码与 URL 双向同步的自定义 Hook。
 *
 * - 页面加载时：若 URL hash 包含编码数据，自动解码并返回 code + html
 * - 页面加载时：若 URL 包含 `?id=<name>` 参数，返回对应 gallery 示例 ID
 * - 运行代码时：将 code + html 编码写入 URL hash，生成可分享链接
 * - 选择 gallery 示例时：将 `?id=<name>` 写入 URL search
 * - 提供复制分享链接到剪贴板的回调
 *
 * @returns galleryId      从 URL `?id=` 解析的 gallery 示例 ID（无数据时为 null）
 * @returns initialData    从 URL hash 解码的初始数据（无数据时为 null）
 * @returns setGalleryId   将 `?id=<name>` 写入 URL search
 * @returns shareToUrl     将 code + html 编码到 URL hash
 * @returns copyShareLink  复制当前分享链接到剪贴板
 */
export function useUrlSharing() {
  // 从 URL search params 解析 gallery 示例 ID（如 ?id=web-map-service-wms）
  const [galleryId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || null;
  });

  // 使用 useState 惰性初始化器在首次渲染时从 URL hash 解码数据
  // 避免在 useEffect 中调用 setState（触发级联渲染）
  const [initialData] = useState<{ code: string; html: string } | null>(() => {
    if (window.location.hash.length > 1) {
      try {
        const base64 = window.location.hash.slice(1);
        return decodeBase64Data(base64);
      } catch {
        // hash 数据损坏时静默忽略
      }
    }
    return null;
  });

  /** 将 `?id=<name>` 写入 URL search（保留 hash），移除旧 hash 避免冲突 */
  const setGalleryId = useCallback((name: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("id", name);
    url.hash = ""; // 清除旧的代码 hash，避免覆盖 gallery 示例
    window.history.replaceState(null, "", url.toString());
  }, []);

  /** 将 code + html 编码到 URL hash */
  const shareToUrl = useCallback((code: string, html: string) => {
    const base64 = makeCompressedBase64String({ code, html });
    const url = new URL(window.location.href);
    url.hash = `#${base64}`;
    url.search = ""; // 清除 ?id= 参数，使自定义代码分享链接更简洁
    window.history.replaceState(null, "", url.toString());
  }, []);

  /** 复制当前页面链接（含 search + hash）到剪贴板 */
  const copyShareLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // clipboard API 不可用时回退到旧方法
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    }
  }, []);

  return {
    galleryId,
    initialData,
    setGalleryId,
    shareToUrl,
    copyShareLink
  };
}
