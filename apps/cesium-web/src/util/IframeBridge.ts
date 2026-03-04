import { type ConsoleMessage } from "./ConsoleWrapper";

/**
 * 如果没有明确指定，默认用于为 Bridge（桥接）消息提供基础结构的泛型类型。
 */
type MessageWithType = {
  type: string;
} & Record<string, unknown>;

/**
 * 发送给主应用（App）的消息类型定义
 */
export type MessageToApp = { type: "bucketReady" } | ConsoleMessage | { type: "highlight"; highlight: number };

/**
 * 发送给沙箱/容器（Bucket）的消息类型定义
 */
export type MessageToBucket = { type: "reload" } | { type: "runCode"; code: string; html: string };

/**
 * App 端的 iframe 消息桥接器类型（向 Bucket 发送，从 Bucket 接收）
 */
export type BridgeToApp = IframeBridge<MessageToApp, MessageToBucket>;

/**
 * Bucket 端的 iframe 消息桥接器类型（向 App 发送，从 App 接收）
 */
export type BridgeToBucket = IframeBridge<MessageToBucket, MessageToApp>;

/**
 * 消息包装器类型，用于在跨域通信时通过特定的 id ("sandcastle-bridge") 来标识我们的内部消息
 * @template T 实际携带的消息负载类型
 */
type MessageAugment<T> = { id: "sandcastle-bridge"; message: T };

/**
 * 自定义类型保护函数，用于判断 MessageEvent 是否包含我们预期的消息结构
 *
 * @template T 预期的消息类型
 * @param {MessageEvent} event - 收到的 postMessage 事件
 * @returns {boolean} 如果是已知的消息结构则返回 true
 */
function isKnownMessageStructure<T>(event: MessageEvent): event is MessageEvent<MessageAugment<T>> {
  return event.data?.id === "sandcastle-bridge" && event.data?.message;
}

/**
 * Iframe 消息通信桥接类
 * 用于在不同的 Window（例如父窗口与 iframe 之间）进行安全的 postMessage 通信。
 *
 * @template SendMessageType 允许发送的消息类型
 * @template RecieveMessageType 允许接收的消息类型
 */
// 修复了原代码缺少 '<' 的语法错误
export class IframeBridge<SendMessageType = MessageWithType, RecieveMessageType = MessageWithType> {
  /** 允许通信的远程窗口的源（Origin），用于安全校验 */
  remoteOrigin: string;
  /** 通信的目标窗口对象 */
  targetWindow: Window;
  /** 内部保存的窗口 message 事件监听器引用，方便后续移除 */
  #windowListener: ((event: MessageEvent<MessageAugment<RecieveMessageType>>) => void) | undefined;

  /**
   * 构造函数
   * @param {string} remoteOrigin - 远程窗口的安全源 (例如 "https://example.com")
   * @param {Window} targetWindow - 目标窗口实例 (例如 iframe.contentWindow 或 parent)
   */
  constructor(remoteOrigin: string, targetWindow: Window) {
    this.remoteOrigin = remoteOrigin;
    this.targetWindow = targetWindow;
  }

  /**
   * 向目标窗口发送消息
   *
   * @param {SendMessageType} message - 要发送的消息内容
   */
  sendMessage(message: SendMessageType) {
    if (window === this.targetWindow) {
      // 当只有当前页面打开（目标窗口就是自身）时，不要执行发送。
      // 否则会引发无限循环触发自身的监听器从而导致浏览器崩溃，
      // 或者产生监听自身消息的“回音”效应。
      return;
    }
    this.targetWindow.postMessage({ id: "sandcastle-bridge", message: message }, this.remoteOrigin);
  }

  /**
   * 注册消息接收监听器
   *
   * @param {(event: RecieveMessageType) => void} handler - 处理接收到的消息的回调函数
   * @returns 注册的事件处理函数引用
   */
  addEventListener(handler: (event: RecieveMessageType) => void) {
    this.#windowListener = (e: MessageEvent<MessageAugment<RecieveMessageType>> | MessageEvent) => {
      if (!isKnownMessageStructure<RecieveMessageType>(e)) {
        // 完全忽略任何不符合预期结构的消息。
        // 例如 React devtools 的通信消息，或 Monaco Editor 的内部警告。
        return;
      }

      if (e.origin !== this.remoteOrigin) {
        // 出于安全考虑，忽略来自未知源（origin）的消息
        return;
      }
      if (window === e.source) {
        // 忽略由当前窗口自己发出的消息
        return;
      }

      handler(e.data.message);
    };

    window.addEventListener("message", this.#windowListener);
    return this.#windowListener;
  }

  /**
   * 移除已注册的消息接收监听器
   * 防止内存泄漏或重复监听
   */
  removeEventListener() {
    if (this.#windowListener) {
      window.removeEventListener("message", this.#windowListener);
    }
  }
}
