import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Bucket from "@/components/Bucket/Bucket.tsx";
import SandcastleEditor from "@/components/SandcastleEditor/SandcastleEditor";
import ConsoleMirror from "@/components/ConsoleMirror/ConsoleMirror.tsx";
import { useCodeState } from "@/hooks/useCodeState";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { SettingsDialog } from "@/components/SettingsDialog/SettingsDialog";
import { useTheme } from "./contexts/ThemeContext";

function App() {
  const { resolvedTheme, setTheme } = useTheme();
  const [codeState, dispatch] = useCodeState();
  const [activeTab, setActiveTab] = useState("javascript");
  const [activeView, setActiveView] = useState<"editor" | "gallery">("gallery");
  const [settingsOpen, setSettingsOpen] = useState(false);

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
                icon={resolvedTheme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-waning-crescent"}
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

                  <div>
                    <Button onClick={() => dispatch({ type: "runSandcastle" })} variant="default" size="sm">
                      <Icon icon="mdi:play" className="text-sm" />
                      运行
                    </Button>
                  </div>
                </TabsList>

                <div className="flex-1 mt-0">
                  <div className="h-full flex flex-col">
                    <SandcastleEditor
                      language={activeTab}
                      value={activeTab === "javascript" ? codeState.code : codeState.html}
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
              <div className="flex items-center justify-center h-full bg-muted/30 text-muted-foreground border rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <Icon icon="mdi:view-grid-plus-outline" className="text-4xl opacity-50" />
                  <p>画廊视图正在开发中...</p>
                </div>
              </div>
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
                  highlightLine={() => {}}
                  appendConsole={() => {}}
                  resetConsole={() => {}}
                />
              </ErrorBoundary>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 控制台区域 */}
            <ResizablePanel minSize={30} defaultSize={100}>
              <ConsoleMirror />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
