import { Editor, type EditorProps, type OnMount } from "@monaco-editor/react";
import { memo, useCallback, useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * SandcastleEditor 组件的属性接口
 */
interface SandcastleEditorProps {
  /** 当前代码内容 */
  value?: string;
  /** 编程语言 @default "javascript" */
  language?: string;
  /** 编辑内容发生变化时的回调 */
  onChange?: (value: string) => void;
  /** 需要高亮的行号，null 表示不高亮 */
  highlightLine?: number | null;
}

/**
 * 默认编辑器配置
 */
const DEFAULT_EDITOR_OPTIONS: EditorProps["options"] = {
  fontSize: 14,
  minimap: { enabled: false }, // 禁用缩略图以节省空间
  scrollBeyondLastLine: false,
  automaticLayout: true, // 自动适应容器大小变化
  tabSize: 2,
  padding: { top: 10 },
  fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
  fixedOverflowWidgets: true,
  roundedSelection: false,
  renderLineHighlight: "all"
};

/**
 * Sandcastle 代码编辑器组件
 * 提供代码编辑功能，基于 Monaco Editor 封装
 */
const SandcastleEditor = ({ value = "", language = "javascript", onChange, highlightLine }: SandcastleEditorProps) => {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

  const handleEditorMount: OnMount = useCallback(editor => {
    editorRef.current = editor;
  }, []);

  // 高亮行号变化时更新 Monaco 装饰
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // 清除旧装饰
    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }

    if (highlightLine && highlightLine > 0) {
      decorationsRef.current = editor.createDecorationsCollection([
        {
          range: {
            startLineNumber: highlightLine,
            startColumn: 1,
            endLineNumber: highlightLine,
            endColumn: 1
          },
          options: {
            isWholeLine: true,
            className: "highlighted-line-bg",
            glyphMarginClassName: "highlighted-line-glyph"
          }
        }
      ]);

      // 滚动到高亮行
      editor.revealLineInCenter(highlightLine);
    }
  }, [highlightLine]);

  /**
   * 处理编辑器内容变化
   * @param val - 变化后的代码内容
   */
  const handleEditorChange = (val: string | undefined) => {
    onChange?.(val ?? "");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Monaco Editor 编辑器主体 */}
      <div className="flex-1 overflow-hidden">
        <Editor
          theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
          language={language}
          value={value}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={DEFAULT_EDITOR_OPTIONS}
        />
      </div>
    </div>
  );
};

// memo 允许你的组件在 props 没有改变的情况下跳过重新渲染。
export default memo(SandcastleEditor);
