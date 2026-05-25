import { memo, useEffect, useRef, useState } from "react";

import "./Bucket.scss";
import { IframeBridge, type BridgeToBucket, type MessageToApp } from "@/util/IframeBridge";
import { embedInSandcastleTemplate } from "@/util/Helpers";
import { type ConsoleMessageType } from "@/components/ConsoleMirror/ConsoleMirror.tsx";

const INNER_ORIGIN = __INNER_ORIGIN__;
// This constructs urls like `[__INNER_ORIGIN__]/[pathname]/templates/bucket.html`
// using location.pathname lets this adapt to deployed locations like CI
const bucketUrl = `${new URL(`${location.pathname.replace(/[^\\/]+.html/, "")}templates/bucket.html`, __INNER_ORIGIN__)}`;

/**
 * Bucket 组件的属性接口
 * @interface BucketProps
 */
interface BucketProps {
  /**
   * 要在沙箱中执行的代码字符串
   */
  code: string;

  /**
   * 要注入到沙箱 iframe 中的 HTML 内容
   */
  html: string;

  /**
   * 运行次数计数器,用于触发代码重新执行
   */
  runNumber: number;

  /**
   * 高亮指定行号的回调函数
   */
  highlightLine: (lineNumber: number) => void;

  /**
   * 向控制台追加消息的回调函数
   */
  appendConsole: (type: ConsoleMessageType, message: string) => void;

  /**
   * 重置控制台的回调函数
   */
  resetConsole: (options?: { showMessage?: boolean }) => void;
}

/**
 * Bucket 沙箱组件
 * 专注于 iframe 隔离环境的渲染与通信，不再负责外部布局。
 */
function Bucket({ code, html, runNumber, highlightLine, appendConsole, resetConsole }: BucketProps) {
  const iframeBridge = useRef<BridgeToBucket>(null);
  const lastRunNumber = useRef<number>(Number.NEGATIVE_INFINITY);

  const [bucketReady, setBucketReady] = useState(false);

  useEffect(() => {
    if (bucketReady && runNumber !== lastRunNumber.current && iframeBridge.current) {
      iframeBridge.current.sendMessage({
        type: "reload"
      });
    }
    lastRunNumber.current = runNumber;
  }, [bucketReady, code, html, runNumber]);

  useEffect(() => {
    const messageHandler = function (message: MessageToApp) {
      if (!iframeBridge.current) {
        return;
      }

      if (message.type === "bucketReady") {
        setBucketReady(true);
        const isFirefox = navigator.userAgent.indexOf("Firefox/") >= 0;
        resetConsole();
        iframeBridge.current.sendMessage({
          type: "runCode",
          code: embedInSandcastleTemplate(code, isFirefox),
          html
        });
      } else if (message.type === "consoleClear") {
        resetConsole({ showMessage: true });
      } else if (message.type === "consoleLog") {
        appendConsole("log", message.log);
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
        appendConsole("error", errorMsg);
      } else if (message.type === "consoleWarn") {
        appendConsole("warn", message.warn);
      } else if (message.type === "highlight") {
        highlightLine(message.highlight);
      }
    };

    if (!iframeBridge.current) {
      return;
    }
    iframeBridge.current.addEventListener(messageHandler);
    return () => iframeBridge.current?.removeEventListener();
  }, [code, html, highlightLine, resetConsole, appendConsole]);

  return (
    <div className="h-full w-full">
      <iframe
        ref={iframe => {
          if (
            iframe?.contentWindow &&
            (!iframeBridge.current || iframeBridge.current.targetWindow !== iframe.contentWindow)
          ) {
            iframeBridge.current = new IframeBridge(INNER_ORIGIN, iframe.contentWindow);
          }
        }}
        id="bucketFrame"
        src={bucketUrl}
        className="fullFrame"
        sandbox="allow-scripts allow-same-origin"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

export default memo(Bucket);
