import { memo, useEffect, useRef, useState } from "react";
import { Panel, Group } from "react-resizable-panels";

import ConsoleMirror, { type ConsoleMessageType } from "@/components/ConsoleMirror/ConsoleMirror.tsx";

import "./Bucket.scss";
import { IframeBridge, type BridgeToBucket } from "./util/IframeBridge";

const INNER_ORIGIN = "__INNER_ORIGIN__";

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
   * @param _lineNumber - 要高亮的行号
   */
  highlightLine: (lineNumber: number) => void;

  /**
   * 向控制台追加消息的回调函数
   * @param _type - 消息类型(log/warn/error等)
   * @param _message - 消息内容
   */
  appendConsole: (type: ConsoleMessageType, message: string) => void;

  /**
   * 重置控制台的回调函数
   */
  resetConsole: (options?: { showMessage?: boolean }) => void;
}

/**
 * Bucket 沙箱组件
 *
 * 提供一个隔离的 iframe 环境用于执行用户代码,防止代码执行影响主应用。
 * 使用 memo 优化性能,避免不必要的 iframe 重新加载。
 *
 * @param props - 组件属性
 * @param props.code - 要在沙箱中执行的代码字符串
 * @param props.html - 要注入到沙箱 iframe 中的 HTML 内容
 * @param props.runNumber - 运行次数计数器,用于触发代码重新执行
 * @param props.highlightLine - 高亮指定行号的回调函数
 * @param props.appendConsole - 向控制台追加消息的回调函数
 * @param props.resetConsole - 重置控制台的回调函数
 * @returns 渲染的沙箱容器,包含一个 iframe 元素用于隔离执行代码
 *
 * @example
 * ```tsx
 * const [runCount, setRunCount] = useState(0);
 * const [consoleMessages, setConsoleMessages] = useState([]);
 *
 * const handleHighlightLine = (lineNumber: number) => {
 *   console.log(`高亮第 ${lineNumber} 行`);
 * };
 *
 * const handleAppendConsole = (type: ConsoleMessageType, message: string) => {
 *   setConsoleMessages(prev => [...prev, { type, message }]);
 * };
 *
 * const handleResetConsole = () => {
 *   setConsoleMessages([]);
 * };
 *
 * <Bucket
 *   code="console.log('Hello Cesium!');"
 *   html="<div id='cesiumContainer'></div>"
 *   runNumber={runCount}
 *   highlightLine={handleHighlightLine}
 *   appendConsole={handleAppendConsole}
 *   resetConsole={handleResetConsole}
 * />
 * ```
 */
function Bucket({ code, html, runNumber, highlightLine, appendConsole, resetConsole }: BucketProps) {
  const iframeBridge = useRef<BridgeToBucket>(null);
  const lastRunNumber = useRef<number>(Number.NEGATIVE_INFINITY);

  const [bucketReady, setBucketReady] = useState(false);

  useEffect(() => {
    if (bucketReady && runNumber !== lastRunNumber.current && iframeBridge.current) {
      // When we want to run sandcastle code we just need to reload the bucket
      // it sends a message when loaded which triggers the message handler below
      // to load the actual code
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
        // The iframe (bucket.html) sends this message on load.
        // We send the code in response to make sure the page is ready to receive it
        setBucketReady(true);
        // Firefox line numbers are zero-based, not one-based.
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
        // Console log messages from the iframe display in Sandcastle.
        appendConsole("log", message.log);
      } else if (message.type === "consoleError") {
        // Console error messages from the iframe display in Sandcastle
        let errorMsg = message.error;
        const lineNumber = message.lineNumber;
        if (lineNumber) {
          errorMsg += ` (on line ${lineNumber}`;

          if (message.url) {
            errorMsg += ` of ${message.url}`;
          }
          errorMsg += ")";
        }
        appendConsole("error", errorMsg);
      } else if (message.type === "consoleWarn") {
        // Console warning messages from the iframe display in Sandcastle.
        appendConsole("warn", message.warn);
      } else if (message.type === "highlight") {
        // Hovering objects in the embedded Cesium window.
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
    <Group orientation="vertical" className="bucket-container">
      {/* Cesium 视窗区域 */}
      <Panel minSize={20}>
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
          className="fullFrame"
          src="/templates/bucket.html"
          allowFullScreen
          loading="lazy" // 性能优化:懒加载
        />
      </Panel>
      {/* 控制台/调试信息区域 */}
      <Panel minSize={30} defaultSize={100}>
        <ConsoleMirror />
      </Panel>
    </Group>
  );
}

/**
 * 使用 memo 包裹的 Bucket 组件
 *
 * 只有当 props 发生变化时才重新渲染,防止父组件更新导致 iframe 刷新,
 * 提升性能并保持沙箱环境的稳定性。
 */
export default memo(Bucket);
