import { type ActionDispatch, useReducer } from "react";

/**
 * Sandcastle 操作行为类型定义
 */
export type SandcastleAction =
  | { type: "reset" } // 重置为初始状态
  | { type: "setCode"; code: string } // 设置当前 Javascript 代码
  | { type: "setHtml"; html: string } // 设置当前 HTML 内容
  | { type: "runSandcastle" } // 提交并运行当前代码
  | { type: "setAndRun"; code?: string; html?: string }; // 设置代码并立即执行

/**
 * 默认 Javascript 代码模板。
 * 使用 Cesium 自带 Natural Earth II，关闭 geocoder / baseLayerPicker，避免请求 ion。
 */
export const defaultJsCode = `import * as Cesium from "cesium";

const viewer = new Cesium.Viewer("cesiumContainer", {
  infoBox: false,
  baseLayerPicker: false,
  geocoder: false,
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.TileMapServiceImageryProvider.fromUrl(
      Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
    )
  )
});

viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(106.738108, 33.006706,30000000)
});
`;

/**
 * 默认 HTML 代码模板
 */
export const defaultHtmlCode = `<div id="cesiumContainer" class="fullSize"></div>
<div id="loadingOverlay"><h1>Loading...</h1></div>
`;

/**
 * 编辑器状态定义
 */
type CodeState = {
  code: string; // 当前编辑器中的 Javascript 代码
  html: string; // 当前编辑器中的 HTML 内容
  committedCode: string; // 已提交执行的 Javascript 代码
  committedHtml: string; // 已提交执行的 HTML 内容
  runNumber: number; // 运行计数器，每次执行时递增以触发 iframe 刷新
};

/**
 * 初始状态对象
 */
const initialState: CodeState = {
  code: defaultJsCode,
  html: defaultHtmlCode,
  committedCode: defaultJsCode,
  committedHtml: defaultHtmlCode,
  runNumber: 1
};

/**
 * 状态机处理器函数
 * @param state - 当前状态
 * @param action - 触发的操作
 * @returns 新的状态
 */
function reducer(state: CodeState, action: SandcastleAction): CodeState {
  switch (action.type) {
    case "reset":
      return { ...initialState };

    case "setCode":
      return {
        ...state,
        code: action.code
      };

    case "setHtml":
      return {
        ...state,
        html: action.html
      };

    case "runSandcastle":
      return {
        ...state,
        committedCode: state.code,
        committedHtml: state.html,
        runNumber: state.runNumber + 1
      };

    case "setAndRun":
      return {
        code: action.code ?? state.code,
        html: action.html ?? state.html,
        committedCode: action.code ?? state.code,
        committedHtml: action.html ?? state.html,
        runNumber: state.runNumber + 1
      };

    default:
      return state;
  }
}

/**
 * 用于管理 Sandcastle 代码状态的自定义 Hook
 * 负责处理代码编辑、页面 HTML 内容、脏标记检查以及代码运行逻辑
 *
 * @param initialData - 可选的初始代码数据（来自 URL 分享链接），覆盖默认模板
 * @returns [当前代码状态, 状态分发器]
 */
export function useCodeState(
  initialData?: { code: string; html: string } | null
): [CodeState, ActionDispatch<[action: SandcastleAction]>] {
  // 若提供了 initialData（来自分享链接），则以分享数据覆盖默认模板的初始状态
  const init = initialData
    ? {
        ...initialState,
        code: initialData.code,
        html: initialData.html,
        committedCode: initialData.code,
        committedHtml: initialData.html
      }
    : initialState;
  const [codeState, dispatch] = useReducer(reducer, init);

  return [codeState, dispatch];
}
