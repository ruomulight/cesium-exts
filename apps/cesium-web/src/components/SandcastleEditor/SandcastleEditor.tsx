import { Editor } from "@monaco-editor/react";
import { useState } from "react";

/**
 * Sandcastle 代码编辑器组件
 * 提供代码编辑、运行、重置等功能
 */
function SandcastleEditor() {
  // 当前编辑器中的代码内容
  const [code, setCode] = useState("// some comment\nconsole.log('Hello Cesium');");

  // 处理编辑器内容变化
  const handleEditorChange = (value: string | undefined) => {
    setCode(value || "");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Monaco Editor 编辑器主体 */}
      <div className="flex-1 overflow-hidden">
        <Editor
          theme="dark"
          defaultLanguage="javascript"
          value={code}
          onChange={handleEditorChange}
          options={{
            fontSize: 14,
            minimap: { enabled: false }, // 禁用缩略图以节省空间
            scrollBeyondLastLine: false,
            automaticLayout: true, // 自动适应容器大小变化
            tabSize: 2,
            padding: { top: 10 },
            fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace"
          }}
        />
      </div>
    </div>
  );
}

export default SandcastleEditor;
