import { Editor, type EditorProps } from "@monaco-editor/react";
import { memo, useState } from "react";

/**
 * SandcastleEditor 组件的属性接口
 */
interface SandcastleEditorProps {
  /**
   * 初始代码内容
   */
  initialValue?: string;
  /**
   * 编程语言
   * @default "javascript"
   */
  language?: string;
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
const SandcastleEditor = ({ initialValue = "", language = "javascript" }: SandcastleEditorProps) => {
  // 当前编辑器中的代码内容
  const [editorValue, setEditorValue] = useState(initialValue);

  /**
   * 处理编辑器内容变化
   * @param value - 变化后的代码内容
   */
  const handleEditorChange = (value: string | undefined) => {
    setEditorValue(value ?? "");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Monaco Editor 编辑器主体 */}
      <div className="flex-1 overflow-hidden">
        <Editor
          theme="dark"
          defaultLanguage={language}
          value={editorValue}
          onChange={handleEditorChange}
          options={DEFAULT_EDITOR_OPTIONS}
        />
      </div>
    </div>
  );
};

// memo 允许你的组件在 props 没有改变的情况下跳过重新渲染。
export default memo(SandcastleEditor);
