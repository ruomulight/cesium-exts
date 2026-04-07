import { createContext, useContext, useEffect, useReducer, useCallback, type ReactNode } from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

type ThemeAction = { type: "SET_MODE"; mode: ThemeMode } | { type: "SET_RESOLVED_THEME"; resolvedTheme: ResolvedTheme };

const STORAGE_KEY = "cesium-web-theme";
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function getInitialState(): ThemeState {
  if (typeof window === "undefined") {
    return { mode: "system", resolvedTheme: "light" };
  }

  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  const mode = stored ?? "system";
  const resolvedTheme = resolveTheme(mode);

  return { mode, resolvedTheme };
}

function reducer(state: ThemeState, action: ThemeAction): ThemeState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, resolvedTheme: resolveTheme(action.mode) };
    case "SET_RESOLVED_THEME":
      return { ...state, resolvedTheme: action.resolvedTheme };
    default:
      return state;
  }
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({ children, defaultMode }: ThemeProviderProps) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const initial = getInitialState();
    return defaultMode ? { ...initial, mode: defaultMode } : initial;
  });

  // 同步 DOM class 和 localStorage
  useEffect(() => {
    const root = document.documentElement;

    if (state.resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    localStorage.setItem(STORAGE_KEY, state.mode);
  }, [state.mode, state.resolvedTheme]);

  // 监听系统主题变化
  useEffect(() => {
    if (state.mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      dispatch({ type: "SET_RESOLVED_THEME", resolvedTheme: e.matches ? "dark" : "light" });
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [state.mode]);

  const setTheme = useCallback((mode: ThemeMode) => {
    dispatch({ type: "SET_MODE", mode });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode: state.mode, resolvedTheme: state.resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
