import { useState } from "react";
import { Panel, Group } from "react-resizable-panels";

import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/icon";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Bucket from "@/components/Bucket/Bucket.tsx";
import SandcastleEditor from "@/components/SandcastleEditor/SandcastleEditor";
import ConsoleMirror from "@/components/ConsoleMirror/ConsoleMirror.tsx";
import { useCodeState } from "@/hooks/useCodeState";

function App() {
  const [codeState, dispatch] = useCodeState();
  const [activeTab, setActiveTab] = useState("javascript");
  const [activeView, setActiveView] = useState<"editor" | "gallery">("gallery");

  return (
    <div className="h-screen w-screen">
      <Group orientation="horizontal">
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
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Icon icon="mdi:theme-light-dark" className="text-xl" />
            </Button>

            <Button variant="ghost" size="icon" className="h-10 w-10" title="设置">
              <Icon icon="mdi:settings-outline" className="text-xl" />
            </Button>
          </div>
        </div>

        <Panel defaultSize={600} minSize={200} className="flex flex-col m-1.25!">
          {activeView === "editor" ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
              <TabsList variant="line" className="shrink-0">
                <TabsTrigger value="javascript">Javascript</TabsTrigger>
                <TabsTrigger value="html">HTML/CSS</TabsTrigger>
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
        </Panel>

        {/* 右侧主面板：包含视图和控制台的垂直布局 */}
        <Panel minSize={200}>
          <Group orientation="vertical">
            {/* Cesium 视窗区域 */}
            <Panel minSize={20}>
              <Bucket
                code={codeState.committedCode}
                html={codeState.committedHtml}
                runNumber={codeState.runNumber}
                highlightLine={() => {}}
                appendConsole={() => {}}
                resetConsole={() => {}}
              />
            </Panel>

            {/* 控制台区域 */}
            <Panel minSize={30} defaultSize={100}>
              <ConsoleMirror />
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  );
}

export default App;
