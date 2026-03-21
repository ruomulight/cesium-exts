import { type ConsoleMessage } from "./ConsoleWrapper";

/**
 * 桥接消息的默认泛型结构。
 * 当未指定具体消息类型时，所有消息至少需要包含一个 `type` 字符串字段。
 */
type MessageWithType = {
  type: string;
} & Record<string, unknown>;

/**
 * 从 bucket（iframe）发往 app（父窗口）的消息类型。
 *
 * | 类型             | 说明                              |
 * |-----------------|-----------------------------------|
 * | `bucketReady`   | bucket 初始化完成的通知            |
 * | `ConsoleMessage`| 将 bucket 内的控制台输出转发给父窗口 |
 * | `highlight`     | 请求父窗口高亮指定行号              |
 */
export type MessageToApp = { type: "bucketReady" } | ConsoleMessage | { type: "highlight"; highlight: number };

/**
 * 从 app（父窗口）发往 bucket（iframe）的消息类型。
 *
 * | 类型       | 说明                          |
 * |-----------|-------------------------------|
 * | `reload`  | 指示 bucket 重新加载自身         |
 * | `runCode` | 指示 bucket 执行给定的代码与 HTML |
 */
export type MessageToBucket = { type: "reload" } | { type: "runCode"; code: string; html: string };

/** 便捷类型别名：在 app（父窗口）侧使用的桥接实例类型。 */
export type BridgeToApp = IframeBridge<MessageToApp, MessageToBucket>;

/** 便捷类型别名：在 bucket（iframe）侧使用的桥接实例类型。 */
export type BridgeToBucket = IframeBridge<MessageToBucket, MessageToApp>;

/**
 * 所有跨帧消息的内部信封结构。
 *
 * 通过固定的 `id` 字段将本桥接的消息与第三方库（如 React DevTools、
 * Monaco Editor）产生的 `postMessage` 流量区分开来。
 *
 * @template T - 业务层消息载荷的类型。
 */
type MessageAugment<T> = { id: "sandcastle-bridge"; message: T };

/**
 * 类型守卫：检查原始 `MessageEvent` 是否符合本桥接使用的 `MessageAugment` 信封结构。
 *
 * @template T   - 期望的业务层消息载荷类型。
 * @param event  - 待检查的原始 DOM `MessageEvent`。
 * @returns 若 `event.data` 符合 `MessageAugment<T>` 结构则返回 `true`，
 *          同时将事件类型收窄为 `MessageEvent<MessageAugment<T>>`。
 */
function isKnownMessageStructure<T>(event: MessageEvent): event is MessageEvent<MessageAugment<T>> {
  return event.data?.id === "sandcastle-bridge" && event.data?.message;
}

/**
 * 父窗口与 iframe 之间具备类型安全与来源校验的 `postMessage` 桥接工具。
 *
 * 通信双方各自实例化一个 `IframeBridge`，并将 `targetWindow` 指向**对方**窗口。
 * 两个泛型参数由 TypeScript 在编译期约束合法的消息方向：
 *
 * ```
 * 父窗口  ──[MessageToApp]──▶  IframeBridge<MessageToApp,  MessageToBucket>
 *         ◀─[MessageToBucket]──
 *
 * iframe  ──[MessageToBucket]▶  IframeBridge<MessageToBucket, MessageToApp>
 *         ◀─[MessageToApp]────
 * ```
 *
 * @template SendMessageType    - 本桥接**发送**的消息类型，默认为 `MessageWithType`。
 * @template RecieveMessageType - 本桥接**接收**的消息类型，默认为 `MessageWithType`。
 *                                （注：原参数名拼写为 `Recieve`，保持不变以兼容现有接口。）
 */
export class IframeBridge<SendMessageType = MessageWithType, RecieveMessageType = MessageWithType> {
  /**
   * 远端窗口的预期来源（origin）。
   * 同时用于 `postMessage` 的目标限定和接收消息时的来源校验。
   */
  remoteOrigin: string;

  /**
   * 消息发送的目标 `Window` 对象。
   * 父窗口侧通常为 `iframe.contentWindow`，iframe 侧通常为 `window.parent`。
   */
  targetWindow: Window;

  /**
   * 注册到 `window` 上的原始 `message` 事件监听函数。
   * 保存引用以便 {@link removeEventListener} 能够精确移除。
   */
  #windowListener: ((event: MessageEvent<MessageAugment<RecieveMessageType>>) => void) | undefined;

  /**
   * 创建一个新的 `IframeBridge` 实例。
   *
   * @param remoteOrigin - 对端窗口的来源，例如 `"https://example.com"`。
   *                       来源不匹配的消息将被静默丢弃。
   * @param targetWindow - {@link sendMessage} 调用 `postMessage` 的目标窗口引用。
   *                       父窗口侧传入 `iframe.contentWindow`，
   *                       iframe 侧传入 `window.parent`。
   */
  constructor(remoteOrigin: string, targetWindow: Window) {
    this.remoteOrigin = remoteOrigin;
    this.targetWindow = targetWindow;
  }

  /**
   * 向远端窗口发送一条类型安全的消息。
   *
   * 消息在发送前会被包装为 {@link MessageAugment} 信封，
   * 以便接收侧的 {@link addEventListener} 能将其与无关的 `postMessage` 流量区分开来。
   *
   * **空操作保护**：若 `targetWindow` 与当前 `window` 为同一对象，
   * 调用将被静默跳过，防止在无 iframe 的本地环境中触发无限消息反馈循环。
   *
   * @param message - 待发送的业务层消息载荷。
   */
  sendMessage(message: SendMessageType) {
    if (window === this.targetWindow) {
      // don't run when it's only this page open. It can crash the browser with an endless
      // loop of triggering our own message listener or just create "feedback" listening to our own messages
      return;
    }
    this.targetWindow.postMessage({ id: "sandcastle-bridge", message: message }, this.remoteOrigin);
  }

  /**
   * 注册消息处理函数，在收到来自远端窗口的合法消息时触发。
   *
   * 处理函数被调用前，消息需通过以下三道校验：
   * 1. **信封校验** — 事件数据必须携带 `sandcastle-bridge` 包装，
   *    过滤掉 React DevTools、Monaco Editor 等第三方消息。
   * 2. **来源校验** — `event.origin` 必须与 {@link remoteOrigin} 完全一致，
   *    过滤掉非预期来源的消息。
   * 3. **同窗口校验** — 消息来源不得是当前窗口自身，
   *    防止意外处理自发消息。
   *
   * > ⚠️ 重复调用本方法会覆盖内部保存的监听引用，但**不会**自动移除旧监听。
   * > 如需替换处理函数，请先调用 {@link removeEventListener}。
   *
   * @param handler - 接收已解包的业务层消息载荷的回调函数。
   * @returns 已挂载到 `window` 上的原始监听函数，
   *          供需要直接管理监听生命周期的调用方使用。
   */
  addEventListener(handler: (event: RecieveMessageType) => void) {
    this.#windowListener = (e: MessageEvent<MessageAugment<RecieveMessageType>> | MessageEvent) => {
      if (!isKnownMessageStructure<RecieveMessageType>(e)) {
        // completely ignore any message that doesn't have the structure we expect
        // For example react devtools messages or monaco editor alerts
        return;
      }

      if (e.origin !== this.remoteOrigin) {
        // ignore messages from origins we don't recognize
        return;
      }
      if (window === e.source) {
        // ignore messages that come from the same window
        return;
      }

      handler(e.data.message);
    };
    window.addEventListener("message", this.#windowListener);
    return this.#windowListener;
  }

  /**
   * 移除最近一次 {@link addEventListener} 注册的消息监听函数。
   *
   * 若从未调用过 {@link addEventListener}，本方法为空操作，不会抛出异常。
   */
  removeEventListener() {
    if (this.#windowListener) {
      window.removeEventListener("message", this.#windowListener);
    }
  }
}
