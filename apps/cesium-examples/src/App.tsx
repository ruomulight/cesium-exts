import { useCallback, useRef, useState } from "react";

import type { ConsoleMessage, ConsoleMessageType } from "@/components/ConsoleMirror/ConsoleMirror";
import type { GalleryItem } from "@/types/sandcastle";

import Bucket from "@/components/Bucket/Bucket";
import ConsoleMirror from "@/components/ConsoleMirror/ConsoleMirror";
import Gallery from "@/components/Gallery/Gallery";
import { Icon } from "@/components/icon";
import { ModeToggle } from "@/components/mode-toggle";
import SandcastleEditor, { type SandcastleEditorHandle } from "@/components/SandcastleEditor/SandcastleEditor";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCodeState } from "@/hooks/useCodeState";
import { useUrlSharing } from "@/hooks/useUrlSharing";

function App() {
  // --- URL 分享（必须在 activeView 之前调用，以便派生初始视图） ---
  const { galleryId, initialData, setGalleryId, buildShareUrl, copyShareLink } = useUrlSharing();

  // 编辑器草稿态（code/html）与已提交态（committedCode/committedHtml/runNumber）
  // 将 URL 分享数据作为初始值传入，使分享链接打开时编辑器与 iframe 即呈现分享内容
  const [codeState, dispatch] = useCodeState(initialData);
  // 编辑器实例引用，用于触发 undo / redo 等命令式操作
  const editorRef = useRef<SandcastleEditorHandle>(null);

  // 主视图切换：URL 带数据时默认进编辑器，否则默认进画廊
  const [activeView, setActiveView] = useState<"editor" | "gallery">(initialData || galleryId ? "gallery" : "editor");
  // 编辑器 Tab 切换：javascript / html
  const [activeTab, setActiveTab] = useState("javascript");
  const [shareToast, setShareToast] = useState(false);

  // 由 Bucket 回传的高亮行号，用于在编辑器中标记报错/警告行
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);

  /** Bucket 在执行过程中请求高亮某一行时调用 */
  const handleHighlightLine = useCallback((lineNumber: number) => {
    setHighlightedLine(lineNumber);
  }, []);

  const handleShare = useCallback(async () => {
    // 仅构造分享链接并复制到剪贴板，不修改当前页面 URL，避免丢失 ?id= 等浏览状态
    const url = buildShareUrl(codeState.code, codeState.html);
    const ok = await copyShareLink(url);
    if (ok) {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  }, [buildShareUrl, copyShareLink, codeState.code, codeState.html]);

  /** 点击「运行」按钮：将草稿态提交为已提交态并递增 runNumber，触发 Bucket 重建 iframe */
  const handleRun = useCallback(() => {
    dispatch({ type: "runSandcastle" });
  }, [dispatch]);

  /** 点击画廊卡片：直接运行示例，停留画廊视图即时查看效果，同时将 `?id=` 写入 URL */
  const handleRunExample = useCallback(
    (item: GalleryItem) => {
      dispatch({ type: "setAndRun", code: item.code, html: item.html });
      setGalleryId(item.name);
    },
    [dispatch, setGalleryId]
  );

  /** 点击画廊卡片上的代码图标：载入示例代码并切换到编辑器视图 */
  const handleSelectExample = useCallback(
    (item: GalleryItem) => {
      dispatch({ type: "setAndRun", code: item.code, html: item.html });
      setGalleryId(item.name);
      setActiveView("editor");
    },
    [dispatch, setGalleryId]
  );

  // 控制台消息列表：由 Bucket 通过 postMessage 回传，ConsoleMirror 渲染
  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([]);

  /**
   * 追加一条控制台消息。
   * 超过 1000 条时丢弃最旧的消息，防止内存无限增长。
   */
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

  /** 用户点击控制台「清空」按钮时调用 */
  const clearConsole = useCallback(() => {
    setConsoleMessages([]);
  }, []);

  /**
   * 在 Bucket 重新运行代码前重置控制台。
   * @param options.showMessage  是否显示一条「控制台已清空」提示（而非完全空白）
   */
  const resetConsole = useCallback((options?: { showMessage?: boolean }) => {
    if (options?.showMessage) {
      setConsoleMessages([{ type: "log", message: "控制台已清空", id: crypto.randomUUID() }]);
    } else {
      setConsoleMessages([]);
    }
  }, []);

  return (
    // 根容器:占满整个视口
    <div className="h-screen w-screen">
      {/* 水平方向可缩放面板组:左栏 | 中栏 | 右栏 */}
      <ResizablePanelGroup orientation="horizontal">
        {/* 左侧侧边栏按钮区域 */}
        <div className="flex w-12 h-full flex-col justify-between py-4 border-r bg-background">
          {/* 顶部按钮组:示例画廊、编辑器入口 */}
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

          {/* 底部按钮组:主题切换、设置 */}
          <div className="flex flex-col items-center gap-4">
            <ModeToggle />

            <Button variant="ghost" size="icon" className="h-10 w-10" title="设置">
              <Icon icon="mdi:settings-outline" className="text-xl" />
            </Button>
          </div>
        </div>

        {/* 中间主面板:主内容区 */}
        <ResizablePanel defaultSize={600} minSize={400} className="flex flex-col m-1.25!">
          <div className="h-full flex flex-col">
            {activeView === "gallery" ? (
              // 画廊模式:展示内置示例列表
              <Gallery onRun={handleRunExample} onSelect={handleSelectExample} />
            ) : (
              // 编辑器模式:Tab 切换 JS / HTML，顶栏放置撤销/重做/分享/运行
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                <TabsList variant="line" className="flex w-full items-center justify-between px-2">
                  <div>
                    <TabsTrigger value="javascript">Javascript</TabsTrigger>
                    <TabsTrigger value="html">HTML/CSS</TabsTrigger>
                  </div>

                  {/* 工具按钮组:撤销 / 重做 / 分享 / 运行 */}
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
                    <Button variant="default" size="sm" onClick={handleRun}>
                      <Icon icon="mdi:play" className="text-sm" />
                      运行
                    </Button>
                  </div>
                </TabsList>

                {/* 编辑器主体:按当前 Tab 绑定对应的草稿值与 onChange */}
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
            )}
          </div>
        </ResizablePanel>

        {/* 可拖拽分隔手柄 */}
        <ResizableHandle withHandle />

        {/* 右侧面板:内部嵌套垂直方向的可缩放面板组 */}
        <ResizablePanel minSize={200}>
          <ResizablePanelGroup orientation="vertical">
            {/* 右上面板:Bucket - iframe 内执行用户代码 */}
            <ResizablePanel minSize={20}>
              <Bucket
                code={codeState.committedCode}
                html={codeState.committedHtml}
                runNumber={codeState.runNumber}
                highlightLine={handleHighlightLine}
                appendConsole={appendConsole}
                resetConsole={resetConsole}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 右下面板:ConsoleMirror - 展示运行时控制台输出 */}
            <ResizablePanel minSize={30} defaultSize={100}>
              <ConsoleMirror messages={consoleMessages} onClear={clearConsole} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        {/* 分享成功提示 */}
        {shareToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg z-50">
            链接已复制到剪贴板
          </div>
        )}
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
