import { useCallback, useState } from "react";
import { makeCompressedBase64String, decodeBase64Data } from "@/util/Helpers";

/**
 * 管理 Sandcastle 代码与 URL hash 双向同步的自定义 Hook。
 *
 * - 页面加载时：若 URL hash 包含编码数据，自动解码并返回 code + html
 * - 运行代码时：将 code + html 编码写入 URL hash，生成可分享链接
 * - 提供复制分享链接到剪贴板的回调
 *
 * @returns initialData  从 URL hash 解码的初始数据（无数据时为 null）
 * @returns shareToUrl    将 code + html 编码到 URL hash
 * @returns copyShareLink 复制当前分享链接到剪贴板
 */
export function useUrlSharing() {
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

  /** 将 code + html 编码到 URL hash */
  const shareToUrl = useCallback((code: string, html: string) => {
    const base64 = makeCompressedBase64String({ code, html });
    window.history.replaceState(null, "", `#${base64}`);
  }, []);

  /** 复制当前页面链接（含 hash）到剪贴板 */
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
    initialData,
    shareToUrl,
    copyShareLink
  };
}
