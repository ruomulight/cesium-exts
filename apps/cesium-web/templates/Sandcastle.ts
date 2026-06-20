// ============================================================================
// Section 1: 核心状态与初始化
// ============================================================================

let defaultAction: (() => void) | undefined;
let bucket = window.location.href;
const pos = bucket.lastIndexOf("/");
if (pos > 0 && pos < bucket.length - 1) {
  bucket = bucket.substring(pos + 1);
}

declare global {
  interface Window {
    // 此变量由 bucket-client.js 的 init() 函数设置
    SANDCASTLE_OUTER_ORIGIN: string;
    // Sandcastle 辅助工具对象，由本文件挂载到 window
    Sandcastle: typeof Sandcastle;
  }
}

/**
 * 下拉菜单选项类型
 */
export type SelectOption = {
  /** 选项显示的文本 */
  text: string;
  /** 选项的值 */
  value: string;
  /** 选中该选项时的回调函数 */
  onselect: () => void;
};

/**
 * Sandcastle API 类型定义
 */
export type SandcastleAPI = typeof Sandcastle;

const registered = new Map<unknown, number>();

// ============================================================================
// Section 2: Sandcastle API（核心逻辑 + UI 工厂方法）
// ============================================================================

/**
 * 用于在 Sandcastle 中构建 UI 并与代码编辑器交互的辅助工具
 */
const Sandcastle = {
  /**
   * 内部注册表，暴露给 bucket-client.ts 以便统一消息路由。
   * 存储 key → lineNumber 的映射，供 highlight() 查找行号。
   */
  _registered: registered,
  /**
   * 在首次加载以及由其他辅助工具设置的选项发生更改时被调用。
   * 默认情况下为空操作，需要时可使用自定义重置逻辑进行重写。
   */
  reset() {},

  /**
   * 在代码中创建一个“书签”，在该书签位置运行代码时会高亮显示
   *
   * @param key 要声明的键（通常是回调函数）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 我们不关心键的具体类型
  declare(key: any) {
    /*eslint-disable no-empty*/
    try {
      // 某些浏览器（如 IE）在实际抛出错误之前没有 stack 属性。
      let stack = "";
      try {
        throw new Error();
      } catch (error) {
        if (error instanceof Error && error.stack !== undefined) {
          stack = error.stack.toString();
        }
      }
      let needle = `${bucket}:`; // Firefox
      let pos = stack.indexOf(needle);
      if (pos < 0) {
        needle = "<anonymous>:"; // Chrome
        pos = stack.indexOf(needle);
      }
      if (pos < 0) {
        needle = " (Unknown script code:"; // IE 11
        pos = stack.indexOf(needle);
      }
      if (pos >= 0) {
        pos += needle.length;
        const lineNumber = parseInt(stack.substring(pos), 10);
        registered.set(key, lineNumber);
      }
    } catch {}
  },

  /**
   * 在代码中高亮显示给定的“书签”
   *
   * @param key 要高亮显示的键
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 我们不关心键的具体类型
  highlight(key: any) {
    if (key !== undefined) {
      const lineNumber = registered.get(key) ?? registered.get(key.primitive);
      if (lineNumber !== undefined) {
        window.parent.postMessage(
          {
            id: "sandcastle-bridge",
            message: { type: "highlight", highlight: lineNumber }
          },
          window.SANDCASTLE_OUTER_ORIGIN
        );
        return;
      }
    }

    window.parent.postMessage(
      { id: "sandcastle-bridge", message: { type: "highlight", highlight: 0 } },
      window.SANDCASTLE_OUTER_ORIGIN
    );
  },

  /**
   * 向页面发送 Sandcastle 加载完成的信号，并调用已设置的默认操作。
   * 此方法作为加载过程的一部分自动调用，通常不需要手动调用。
   */
  finishedLoading() {
    Sandcastle.reset();

    if (defaultAction) {
      Sandcastle.highlight(defaultAction);
      defaultAction();
      defaultAction = undefined;
    }

    document.body.classList.remove("sandcastle-loading");
  },

  /**
   * 创建一个带有复选框的切换按钮
   *
   * @param text 按钮标签
   * @param checked 默认选中状态
   * @param onchange 按钮点击时的回调函数
   * @param toolbarId 要添加到的元素 ID，默认为默认工具栏
   */
  addToggleButton(text: string, checked: boolean, onchange: (newValue: boolean) => void, toolbarId?: string) {
    Sandcastle.declare(onchange);

    const input = document.createElement("input");
    input.checked = checked;
    input.type = "checkbox";
    input.style.pointerEvents = "none";
    input.className = "stratakit-mimic-switch";

    const label = document.createElement("label");
    label.appendChild(document.createTextNode(text));
    label.style.pointerEvents = "none";
    label.className = "stratakit-mimic-label";

    const field = document.createElement("div");
    field.className = "stratakit-mimic-field";
    // stratakit 之前被称为 kiwi，但在某些内部属性中仍沿用该名称
    field.dataset.kiwiLabelPlacement = "after";
    field.dataset.kiwiControlType = "checkable";
    field.appendChild(input);
    field.appendChild(label);

    field.onclick = function () {
      Sandcastle.reset();
      Sandcastle.highlight(onchange);
      input.checked = !input.checked;
      onchange(input.checked);
    };

    const toolbar = document.getElementById(toolbarId || "toolbar");
    if (!toolbar) {
      throw new Error(`找不到工具栏: ${toolbarId}`);
    }
    toolbar.appendChild(field);
  },

  /**
   * 创建一个普通按钮
   *
   * @param text 按钮标签
   * @param onclick 按钮点击时的回调函数
   * @param toolbarId 要添加到的元素 ID，默认为默认工具栏
   */
  addToolbarButton(text: string, onclick: () => void, toolbarId?: string) {
    Sandcastle.declare(onclick);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "stratakit-mimic-button";
    // stratakit 之前被称为 kiwi，但在某些内部属性中仍沿用该名称
    button.dataset.kiwiVariant = "solid";
    button.dataset.kiwiTone = "neutral";
    button.onclick = function () {
      Sandcastle.reset();
      Sandcastle.highlight(onclick);
      onclick();
    };
    button.textContent = text;

    const toolbar = document.getElementById(toolbarId || "toolbar");
    if (!toolbar) {
      throw new Error(`找不到工具栏: ${toolbarId}`);
    }
    toolbar.appendChild(button);
  },

  /**
   * 创建一个按钮，并将该 Sandcastle 示例的默认操作设置为其点击处理程序
   *
   * @param text 按钮标签
   * @param onclick 按钮点击时的回调函数
   * @param toolbarId 要添加到的元素 ID，默认为默认工具栏
   */
  addDefaultToolbarButton(text: string, onclick: () => void, toolbarId?: string) {
    Sandcastle.addToolbarButton(text, onclick, toolbarId);
    defaultAction = onclick;
  },

  /**
   * 创建一个带有给定选项的下拉菜单
   *
   * @param options 下拉菜单的可选项
   * @param toolbarId 要添加到的元素 ID，默认为默认工具栏
   */
  addToolbarMenu(options: SelectOption[], toolbarId?: string) {
    const menu = document.createElement("select");
    menu.className = "stratakit-mimic-button stratakit-mimic-select";
    // stratakit 之前被称为 kiwi，但在某些内部属性中仍沿用该名称
    menu.dataset.kiwiVariant = "solid";
    menu.dataset.kiwiTone = "neutral";
    menu.onchange = function () {
      Sandcastle.reset();
      const item = options[menu.selectedIndex];
      if (item && typeof item.onselect === "function") {
        item.onselect();
      }
    };

    const wrapper = document.createElement("div");
    wrapper.className = "stratakit-mimic-select-root";
    wrapper.appendChild(menu);

    // 直接从 HTML 字符串生成元素参考：https://stackoverflow.com/a/35385518/7416863
    const icon = document.createElement("template");
    icon.innerHTML = `<svg width="16" height="16" fill="none" viewBox="0 0 16 16" class="stratakit-mimic-icon stratakit-mimic-disclosure-arrow stratakit-mimic-select-arrow" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M8 10 5 7h6l-3 3Z" clip-rule="evenodd"></path></svg>`;
    wrapper.appendChild(icon.content.firstChild!);

    const toolbar = document.getElementById(toolbarId || "toolbar");
    if (!toolbar) {
      throw new Error(`找不到工具栏: ${toolbarId}`);
    }
    toolbar.appendChild(wrapper);

    if (!defaultAction && typeof options[0].onselect === "function") {
      defaultAction = options[0].onselect;
    }

    for (let i = 0, len = options.length; i < len; ++i) {
      const option = document.createElement("option");
      option.textContent = options[i].text;
      option.value = options[i].value;
      menu.appendChild(option);
    }
  },

  /**
   * 创建一个下拉菜单，并将第一个选项的处理程序设置为该 Sandcastle 示例的默认操作
   *
   * @param options 下拉菜单的可选项
   * @param toolbarId 要添加到的元素 ID，默认为默认工具栏
   */
  addDefaultToolbarMenu(options: SelectOption[], toolbarId?: string) {
    Sandcastle.addToolbarMenu(options, toolbarId);
    defaultAction = options[0].onselect;
  }
};

// ============================================================================
// Section 3: 全局导出（挂载到 window + ESM export）
// ============================================================================

// 将 Sandcastle 挂载到 window，使 iframe 中动态注入的代码可直接访问全局 Sandcastle 对象
// 而无需通过 import map 或 ESM import 语句
window.Sandcastle = Sandcastle;

export default Sandcastle;
