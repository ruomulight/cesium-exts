import { Component, type ReactNode } from "react";

/**
 * ErrorBoundary 组件的 Props 接口
 */
interface Props {
  /** 子组件 */
  children: ReactNode;
  /** 自定义错误降级 UI，传入则优先使用，否则使用默认 UI */
  fallback?: ReactNode;
}

/**
 * ErrorBoundary 组件的 State 接口
 */
interface State {
  /** 是否捕获到错误 */
  hasError: boolean;
  /** 捕获的错误对象 */
  error: Error | null;
}

/**
 * ErrorBoundary 错误边界组件
 *
 * 用于捕获其子组件树中的 JavaScript 错误，
 * 显示备用 UI 而不是崩溃整个应用。
 *
 * 注意事项：
 * - 只能捕获**渲染阶段**、生命周期方法中和构造函数中的错误
 * - 无法捕获以下类型的错误：
 *   - 事件处理器中的错误（需使用 try/catch）
 *   - 异步代码中的错误（需使用 Promise.catch）
 *   - 服务端渲染错误
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  /**
   * 构造函数
   * @param props - 组件属性
   */
  constructor(props: Props) {
    super(props);
    // 初始化状态，不显示错误
    this.state = { hasError: false, error: null };
  }

  /**
   * 从错误派生新状态
   * 当子组件抛出错误时被调用，返回值将作为新的 state
   *
   * @param error - 捕获到的错误对象
   * @returns 更新后的状态对象
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * 组件捕获到错误后的回调
   * 用于记录错误日志、发送错误报告等副作用
   *
   * @param error - 捕获到的错误对象
   * @param errorInfo - 包含 componentStack 属性的错误信息
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 将错误信息打印到控制台，便于开发调试
    console.error("ErrorBoundary 捕获到错误:", error, errorInfo);
  }

  /**
   * 渲染方法
   * 根据状态决定渲染子组件还是错误降级 UI
   *
   * @returns React 节点
   */
  render() {
    // 如果捕获到错误，渲染错误 UI
    if (this.state.hasError) {
      // 优先使用自定义 fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误降级 UI
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-destructive/10 p-8 text-destructive">
          <div className="flex flex-col items-center gap-2 text-center">
            {/* 错误图标 */}
            <span className="text-4xl">⚠️</span>
            {/* 错误标题 */}
            <h2 className="text-xl font-semibold">出错了</h2>
            {/* 错误描述 */}
            <p className="max-w-md text-sm opacity-80">{this.state.error?.message || "发生了一个意外错误"}</p>
          </div>
          {/* 重试按钮，点击后重置状态尝试恢复 */}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            重试
          </button>
        </div>
      );
    }

    // 正常渲染子组件
    return this.props.children;
  }
}

/**
 * ErrorBoundary 组件的简写导出
 * 功能与具名导出相同，方便直接使用
 */
export default ErrorBoundary;
