import { memo, useCallback, useEffect, useRef, useState } from "react";

import "./Bucket.scss";
import { type ConsoleMessageType } from "@/components/ConsoleMirror/ConsoleMirror";
import { embedInSandcastleTemplate } from "@/util/Helpers";
import { type BridgeToBucket, IframeBridge, type MessageToApp } from "@/util/IframeBridge";

const INNER_ORIGIN = __INNER_ORIGIN__;
// 构建形如 `[__INNER_ORIGIN__]/[pathname]/templates/bucket.html` 的 URL
// 使用 location.pathname 使 URL 能自适应如 CI 等不同部署环境
const bucketUrl = `${new URL(`${location.pathname.replace(/[^\\/]+.html/, "")}templates/bucket.html`, __INNER_ORIGIN__)}`;

/** 沙箱代码执行超时时间（毫秒），超时后自动重置 iframe */
const EXECUTION_TIMEOUT_MS = 30_000;

/**
 * Bucket 组件的属性接口
 * @interface BucketProps
 */
interface BucketProps {
  /** 要在沙箱中执行的代码字符串 */
  code: string;
  /** 要注入到沙箱 iframe 中的 HTML 内容 */
  html: string;
  /** 运行次数计数器,用于触发代码重新执行 */
  runNumber: number;
  /** 高亮指定行号的回调函数 */
  highlightLine: (lineNumber: number) => void;
  /** 向控制台追加消息的回调函数 */
  appendConsole: (type: ConsoleMessageType, message: string) => void;
  /** 重置控制台的回调函数 */
  resetConsole: (options?: { showMessage?: boolean }) => void;
}

/**
 * Bucket 沙箱组件
 * 专注于 iframe 隔离环境的渲染与通信，不再负责外部布局。
 */
function Bucket({ code, html, runNumber, highlightLine, appendConsole, resetConsole }: BucketProps) {
  const iframeBridge = useRef<BridgeToBucket>(null);
  // 初始化为当前 runNumber，避免挂载时不必要的首次 reload
  const lastRunNumber = useRef<number>(runNumber);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // iframeKey 用于在超时或异常时强制重新挂载 iframe
  const [iframeKey, setIframeKey] = useState(0);

  // --- Refs：使消息处理器只需注册一次即可读取最新 props ---
  const codeRef = useRef(code);
  const htmlRef = useRef(html);
  const highlightRef = useRef(highlightLine);
  const appendRef = useRef(appendConsole);
  const resetRef = useRef(resetConsole);

  // 每次 props 变化后同步 refs，确保异步消息处理器始终读取最新值
  // useEffect 足够——消息处理器通过 postMessage 异步触发，refs 在此之前必已更新
  useEffect(() => {
    codeRef.current = code;
    htmlRef.current = html;
    highlightRef.current = highlightLine;
    appendRef.current = appendConsole;
    resetRef.current = resetConsole;
  });

  // --- Effect 1：用户点击"运行"时触发 iframe 重新加载 ---
  useEffect(() => {
    if (runNumber !== lastRunNumber.current && iframeBridge.current) {
      clearTimeout(timeoutRef.current);
      iframeBridge.current.sendMessage({ type: "reload" });
      lastRunNumber.current = runNumber;

      // 超时保护：若 30 秒后仍未收到 bucketReady，说明沙箱代码可能卡死，强制重置 iframe
      timeoutRef.current = setTimeout(() => {
        setIframeKey(k => k + 1);
      }, EXECUTION_TIMEOUT_MS);
    }
  }, [runNumber]);

  // --- Effect 2：注册消息处理器（仅一次） ---
  // 所有回调标识和 code/html 均通过 ref 读取，因此依赖数组为空，
  // 不会在用户输入时重复注册监听器
  useEffect(() => {
    const messageHandler = (message: MessageToApp) => {
      if (!iframeBridge.current) return;

      if (message.type === "bucketReady") {
        // iframe 已加载（或重新加载）—— 清除超时并发送代码
        clearTimeout(timeoutRef.current);
        const isFirefox = navigator.userAgent.indexOf("Firefox/") >= 0;
        resetRef.current();
        iframeBridge.current.sendMessage({
          type: "runCode",
          code: embedInSandcastleTemplate(codeRef.current, isFirefox),
          html: htmlRef.current
        });
      } else if (message.type === "consoleClear") {
        resetRef.current({ showMessage: true });
      } else if (message.type === "consoleLog") {
        appendRef.current("log", message.log);
      } else if (message.type === "consoleError") {
        let errorMsg = message.error;
        const lineNumber = message.lineNumber;
        if (lineNumber) {
          errorMsg += ` (在第 ${lineNumber} 行`;
          if (message.url) {
            errorMsg += `，属于 ${message.url}`;
          }
          errorMsg += ")";
        }
        appendRef.current("error", errorMsg);
      } else if (message.type === "consoleWarn") {
        appendRef.current("warn", message.warn);
      } else if (message.type === "highlight") {
        highlightRef.current(message.highlight);
      }
    };

    if (!iframeBridge.current) return;
    iframeBridge.current.addEventListener(messageHandler);
    return () => {
      iframeBridge.current?.removeEventListener();
    };
  }, []);

  // 组件卸载时清除超时定时器
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  // 包装 iframe ref 回调以保持稳定引用
  const handleIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
    if (
      iframe?.contentWindow &&
      (!iframeBridge.current || iframeBridge.current.targetWindow !== iframe.contentWindow)
    ) {
      iframeBridge.current = new IframeBridge(INNER_ORIGIN, iframe.contentWindow);
    }
  }, []);

  return (
    <div className="h-full w-full">
      <iframe
        key={iframeKey}
        ref={handleIframeRef}
        id="bucketFrame"
        src={bucketUrl}
        className="fullFrame"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

export default memo(Bucket);
