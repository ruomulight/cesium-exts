import { useCallback, useEffect, useRef, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Bucket from "@/components/Bucket/Bucket.tsx";
import SandcastleEditor, { type SandcastleEditorHandle } from "@/components/SandcastleEditor/SandcastleEditor";
import ConsoleMirror, {
  type ConsoleMessage,
  type ConsoleMessageType
} from "@/components/ConsoleMirror/ConsoleMirror.tsx";
import Gallery from "@/components/Gallery/Gallery";
import { useCodeState } from "@/hooks/useCodeState";
import { useUrlSharing } from "@/hooks/useUrlSharing";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { SettingsDialog } from "@/components/SettingsDialog/SettingsDialog";
import { useTheme } from "./contexts/ThemeContext";

function App() {
  const { resolvedTheme, setTheme } = useTheme();
  const [codeState, dispatch] = useCodeState();
  const [activeTab, setActiveTab] = useState("javascript");
  const editorRef = useRef<SandcastleEditorHandle>(null);

  // --- URL 分享（必须在 activeView 之前调用，以便派生初始视图） ---
  const { initialData, shareToUrl, copyShareLink } = useUrlSharing();

  const [activeView, setActiveView] = useState<"editor" | "gallery">(initialData ? "editor" : "gallery");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);

  // 从 URL hash 加载初始数据：dispatch 是副作用，放在 effect 中
  useEffect(() => {
    if (initialData) {
      dispatch({ type: "setAndRun", code: initialData.code, html: initialData.html });
    }
  }, [initialData, dispatch]);

  // 运行代码时同步到 URL hash
  const handleRun = useCallback(() => {
    dispatch({ type: "runSandcastle" });
  }, [dispatch]);

  const handleShare = useCallback(async () => {
    shareToUrl(codeState.code, codeState.html);
    const ok = await copyShareLink();
    if (ok) {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  }, [shareToUrl, copyShareLink, codeState.code, codeState.html]);

  // --- Gallery 示例加载 ---
  const handleSelectExample = useCallback(
    (code: string, html: string) => {
      dispatch({ type: "setAndRun", code, html });
      setActiveView("editor");
    },
    [dispatch]
  );

  // --- 控制台状态 ---
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);

  const appendConsole = useCallback((type: ConsoleMessageType, message: string) => {
    setConsoleMessages(prev => {
      const next = [...prev, { type, message, id: crypto.randomUUID() }];
      // 限定最多保留 1000 条消息，防止无限增长导致内存溢出
      if (next.length > 1000) {
        return next.slice(next.length - 1000);
      }
      return next;
    });
  }, []);

  const resetConsole = useCallback((options?: { showMessage?: boolean }) => {
    if (options?.showMessage) {
      setConsoleMessages([{ type: "log", message: "控制台已清空", id: crypto.randomUUID() }]);
    } else {
      setConsoleMessages([]);
    }
  }, []);

  const clearConsole = useCallback(() => {
    setConsoleMessages([]);
  }, []);

  // --- 行号高亮 ---
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);

  const handleHighlightLine = useCallback((lineNumber: number) => {
    setHighlightedLine(lineNumber);
  }, []);

  // --- 键盘快捷键 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+Enter / Cmd+Enter：运行代码
      if (isMod && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
      // Ctrl+S / Cmd+S：分享链接
      if (isMod && e.key === "s") {
        e.preventDefault();
        handleShare();
      }
      // Ctrl+L / Cmd+L：清空控制台
      if (isMod && e.key === "l") {
        e.preventDefault();
        clearConsole();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRun, handleShare, clearConsole]);

  return (
    <div className="h-screen w-screen">
      <ResizablePanelGroup orientation="horizontal">
        {/* 左侧侧边栏按钮区域 */}
        <div className="flex w-12 flex-col justify-between py-4 border-r bg-background m-1.25!">
          <div className="flex flex-col items-center gap-4">
            <Button
              variant={activeView === "gallery" ? "secondary" : "ghost"}
              size="icon"
              title="示例画廊"
              onClick={() => setActiveView("gallery")}
            >
              <Icon icon="mdi:file-image-marker" className="text-xl" />
            </Button>

            <Button
              variant={activeView === "editor" ? "secondary" : "ghost"}
              size="icon"
              title="编辑器"
              onClick={() => setActiveView("editor")}
            >
              <Icon icon="mdi:application-braces-outline" className="text-xl" />
            </Button>
          </div>
          <div className="flex flex-col items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              title={resolvedTheme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <Icon
                icon={resolvedTheme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-and-stars"}
                className="text-xl"
              />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              title="设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon icon="mdi:settings-outline" className="text-xl" />
            </Button>
          </div>
        </div>

        <ResizablePanel defaultSize={600} minSize={400} className="flex flex-col m-1.25!">
          <ErrorBoundary>
            {activeView === "editor" ? (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                <TabsList variant="line" className="flex w-full items-center justify-between px-2">
                  <div>
                    <TabsTrigger value="javascript">Javascript</TabsTrigger>
                    <TabsTrigger value="html">HTML/CSS</TabsTrigger>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="撤销 (Ctrl+Z)"
                      onClick={() => editorRef.current?.undo()}
                    >
                      <Icon icon="mdi:undo" className="text-sm" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="重做 (Ctrl+Shift+Z)"
                      onClick={() => editorRef.current?.redo()}
                    >
                      <Icon icon="mdi:redo" className="text-sm" />
                    </Button>
                    <Button onClick={handleShare} variant="outline" size="sm" title="分享链接">
                      <Icon icon="mdi:share-variant" className="text-sm" />
                    </Button>
                    <Button onClick={handleRun} variant="default" size="sm">
                      <Icon icon="mdi:play" className="text-sm" />
                      运行
                    </Button>
                  </div>
                </TabsList>

                <div className="flex-1 mt-0">
                  <div className="h-full flex flex-col">
                    <SandcastleEditor
                      ref={editorRef}
                      language={activeTab}
                      value={activeTab === "javascript" ? codeState.code : codeState.html}
                      highlightLine={activeTab === "javascript" ? highlightedLine : null}
                      onChange={val => {
                        dispatch(
                          activeTab === "javascript" ? { type: "setCode", code: val } : { type: "setHtml", html: val }
                        );
                      }}
                    />
                  </div>
                </div>
              </Tabs>
            ) : (
              <Gallery onSelectExample={handleSelectExample} />
            )}
          </ErrorBoundary>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* 右侧主面板：包含视图和控制台的垂直布局 */}
        <ResizablePanel minSize={200}>
          <ResizablePanelGroup orientation="vertical">
            {/* Cesium 视窗区域 */}
            <ResizablePanel minSize={20}>
              <ErrorBoundary>
                <Bucket
                  code={codeState.committedCode}
                  html={codeState.committedHtml}
                  runNumber={codeState.runNumber}
                  highlightLine={handleHighlightLine}
                  appendConsole={appendConsole}
                  resetConsole={resetConsole}
                />
              </ErrorBoundary>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 控制台区域 */}
            <ResizablePanel minSize={30} defaultSize={100}>
              <ConsoleMirror messages={consoleMessages} onClear={clearConsole} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        {/* 分享成功提示 */}
        {shareToast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg z-50">
            链接已复制到剪贴板
          </div>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
