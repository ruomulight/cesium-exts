/**
 * ThemeContext.tsx - 主题管理上下文
 *
 * 提供 React 应用的主题切换能力，支持三种模式：
 * - light: 始终使用浅色主题
 * - dark: 始终使用深色主题
 * - system: 跟随操作系统偏好自动切换
 *
 * 主题状态会：
 * 1. 持久化到 localStorage，刷新后保持用户选择
 * 2. 同步到 DOM 的 class 属性（添加/移除 .dark 类）
 * 3. 响应系统主题变化（当模式为 system 时）
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useReducer } from "react";

// ============================================================================
// 类型定义
// ============================================================================

/** 支持的主题模式 */
type ThemeMode = "light" | "dark" | "system";

/** 经过解析后的实际主题（跟随 system 偏好后确定） */
type ResolvedTheme = "light" | "dark";

/** 主题状态的完整结构 */
interface ThemeState {
  /** 当前选择的主题模式 */
  mode: ThemeMode;
  /** 经过解析后的实际主题 */
  resolvedTheme: ResolvedTheme;
}

/** ThemeContext 提供给消费者的值结构 */
interface ThemeContextValue {
  /** 当前选择的主题模式 */
  mode: ThemeMode;
  /** 经过解析后的实际主题 */
  resolvedTheme: ResolvedTheme;
  /** 设置主题模式的回调函数 */
  setTheme: (mode: ThemeMode) => void;
}

/** ThemeReducer 支持的动作类型 */
type ThemeAction =
  | { type: "SET_MODE"; mode: ThemeMode } // 设置主题模式（会同步更新 resolvedTheme）
  | { type: "SET_RESOLVED_THEME"; resolvedTheme: ResolvedTheme }; // 仅更新已解析的主题（用于响应系统变化）

// ============================================================================
// 常量
// ============================================================================

/** localStorage 存储主题配置的键名 */
const STORAGE_KEY = "cesium-web-theme";

// ============================================================================
// Context
// ============================================================================

/** ThemeContext - 提供主题管理能力的 React Context */
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// ============================================================================
// 内部工具函数
// ============================================================================

/**
 * 根据给定的主题模式解析出实际应使用的主题
 *
 * @param mode - 主题模式
 *   - "system": 查询 window.matchMedia 获取系统偏好
 *   - "light" | "dark": 直接返回对应的主题
 * @returns 最终确定的主题类型
 *
 * @example
 * resolveTheme("system") // 用户偏好深色时返回 "dark"
 * resolveTheme("light")  // 返回 "light"
 * resolveTheme("dark")   // 返回 "dark"
 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

/**
 * 从 localStorage 和系统偏好中获取初始主题状态
 *
 * @returns 包含 mode 和 resolvedTheme 的初始状态
 *
 * 服务端渲染（window 不存在）时默认返回 system + light
 * 有存储值时使用存储值，否则默认使用 system
 */
function getInitialState(): ThemeState {
  // SSR 场景：window 不存在，返回安全的默认值
  if (typeof window === "undefined") {
    return { mode: "system", resolvedTheme: "light" };
  }

  // 从 localStorage 读取用户之前的主题选择
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  const mode = stored ?? "system"; // 无存储值时默认为 system
  const resolvedTheme = resolveTheme(mode);

  return { mode, resolvedTheme };
}

/**
 * 主题状态 reducer - 处理所有主题相关的状态更新
 *
 * @param state - 当前状态
 * @param action - 要执行的动作
 * @returns 更新后的新状态
 *
 * 动作类型：
 * - SET_MODE: 设置主题模式（会同步根据新模式重新解析 resolvedTheme）
 * - SET_RESOLVED_THEME: 仅更新已解析主题（用于响应系统主题变化）
 */
function reducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
    case "SET_MODE":
      // 设置新模式后，需要同步重新解析 resolvedTheme
      return { ...state, mode: action.mode, resolvedTheme: resolveTheme(action.mode) };
    case "SET_RESOLVED_THEME":
      // 仅更新 resolvedTheme，mode 保持不变（用于 system 模式下跟随系统）
      return { ...state, resolvedTheme: action.resolvedTheme };
    default:
      return state;
  }
}

// ============================================================================
// Provider 组件
// ============================================================================

interface ThemeProviderProps {
  /** 要包裹的子组件 */
  children: ReactNode;
  /** 可选的默认主题模式，会覆盖从 localStorage 读取的值 */
  defaultMode?: ThemeMode;
}

/**
 * ThemeProvider - 主题管理 Provider 组件
 *
 * 在应用根组件外层调用，为整个应用提供主题管理能力。
 *
 * @example
 * ```tsx
 * <ThemeProvider defaultMode="dark">
 *   <App />
 * </ThemeProvider>
 * ```
 *
 * 功能：
 * 1. 管理主题状态（mode + resolvedTheme）
 * 2. 将主题变化同步到 DOM class（添加 .dark 或移除）
 * 3. 将用户选择持久化到 localStorage
 * 4. 监听系统主题变化并自动更新（仅在 mode="system" 时）
 */
export function ThemeProvider({ children, defaultMode }: ThemeProviderProps) {
  // 使用 useReducer 管理复杂主题状态
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const initial = getInitialState();
    // 如果传入了 defaultMode，用它覆盖初始值
    return defaultMode ? { ...initial, mode: defaultMode } : initial;
  });

  // ---------------------------------------------------------------------------
  // 副作用：同步 DOM class 和 localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;

    // 根据 resolvedTheme 添加或移除 .dark 类
    // CSS 中可以使用 .dark { ... } 或 :is(.dark) ... 来定义深色样式
    if (state.resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // 将用户选择持久化到 localStorage
    localStorage.setItem(STORAGE_KEY, state.mode);
  }, [state.mode, state.resolvedTheme]);

  // ---------------------------------------------------------------------------
  // 副作用：监听系统主题变化
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // 仅在 mode 为 system 时才需要监听系统主题变化
    if (state.mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // 系统主题变化时的回调
    const handleChange = (e: MediaQueryListEvent) => {
      // 更新 resolvedTheme，mode 保持为 "system"
      dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: e.matches ? "dark" : "light" });
    };

    // 添加监听器，监听系统主题变化
    mediaQuery.addEventListener("change", handleChange);

    // 组件卸载时移除监听器，防止内存泄漏
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [state.mode]);

  // ---------------------------------------------------------------------------
  // 暴露给消费者的方法
  // ---------------------------------------------------------------------------
  const setTheme = useCallback((mode: ThemeMode) => {
    dispatch({ type: "SET_MODE", mode });
  }, []);

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  return (
    <ThemeContext.Provider value={{ mode: state.mode, resolvedTheme: state.resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useTheme - 消费主题上下文的 Hook
 *
 * @returns 包含当前主题状态和设置方法的对象
 * @throws 如果在 ThemeProvider 外调用，抛出错误
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { mode, resolvedTheme, setTheme } = useTheme();
 *
 *   return (
 *     <button onClick={() => setTheme(mode === "dark" ? "light" : "dark")}>
 *       当前: {resolvedTheme}，点击切换
 *     </button>
 *   );
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
