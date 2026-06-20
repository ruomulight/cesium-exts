import { Editor, type EditorProps, type OnMount } from "@monaco-editor/react";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "../../contexts/ThemeContext";
import prettier from "prettier/standalone";
import parserBabel from "prettier/plugins/babel";
import parserEstree from "prettier/plugins/estree";

/**
 * 通过 ref 暴露给父组件的编辑器操作方法
 */
export interface SandcastleEditorHandle {
  /** 撤销上一次编辑操作 */
  undo: () => void;
  /** 重做上一次被撤销的操作 */
  redo: () => void;
}

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
  renderLineHighlight: "all",
  formatOnPaste: true, // 粘贴时自动格式化
  formatOnType: false // 输入时不自动格式化（避免干扰）
  // 快捷键：Shift+Alt+F 格式化文档
  // 快捷键：Ctrl+K Ctrl+F 格式化选中内容
};

/**
 * Sandcastle 代码编辑器组件
 * 提供代码编辑功能，基于 Monaco Editor 封装
 */
const SandcastleEditor = forwardRef<SandcastleEditorHandle, SandcastleEditorProps>(
  ({ value = "", language = "javascript", onChange, highlightLine }, ref) => {
    const { resolvedTheme } = useTheme();
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);

    // 向父组件暴露撤销/重做方法
    useImperativeHandle(ref, () => ({
      undo: () => editorRef.current?.trigger("keyboard", "undo", null),
      redo: () => editorRef.current?.trigger("keyboard", "redo", null)
    }));

    const handleEditorMount: OnMount = useCallback((editor, monaco) => {
      editorRef.current = editor;

      // 注册 Prettier 格式化提供程序
      monaco.languages.registerDocumentFormattingEditProvider("javascript", {
        async provideDocumentFormattingEdits(model) {
          const text = model.getValue();
          try {
            const formatted = await prettier.format(text, {
              parser: "babel",
              plugins: [parserBabel, parserEstree],
              semi: true,
              singleQuote: false,
              tabWidth: 2,
              trailingComma: "none",
              printWidth: 100,
              arrowParens: "avoid"
            });

            return [
              {
                range: model.getFullModelRange(),
                text: formatted
              }
            ];
          } catch (error) {
            console.error("格式化错误:", error);
            return [];
          }
        }
      });

      // 添加格式化命令
      editor.addAction({
        id: "prettier-format",
        label: "使用 Prettier 格式化",
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        contextMenuGroupId: "1_modification",
        contextMenuOrder: 1.5,
        run: async ed => {
          await ed.getAction("editor.action.formatDocument")?.run();
        }
      });
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
  }
);

// memo 允许你的组件在 props 没有改变的情况下跳过重新渲染。
// forwardRef 与 memo 组合使用，确保 ref 转发的同时保留记忆化优势
export default memo(SandcastleEditor);
