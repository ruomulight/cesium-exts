import { Panel, Group } from "react-resizable-panels";

import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Bucket from "@/components/Bucket/Bucket.tsx";
import SandcastleEditor from "@/components/SandcastleEditor/SandcastleEditor";

function App() {
  return (
    <div className="h-screen w-screen">
      <Group orientation="horizontal">
        {/* 左侧侧边栏按钮区域 */}
        <div className="flex w-[3rem] flex-col justify-between py-4 border-r bg-background !m-[5px]">
          <div className="flex flex-col items-center gap-4">
            {/* --- 画廊展示切换按钮 --- */}
            <Button variant="ghost" size="icon" title="示例画廊">
              <Icon icon="mdi:file-image-marker" className="text-xl" />
            </Button>

            {/* --- 代码查看器切换按钮 --- */}
            <Button variant="ghost" size="icon" title="编辑器">
              <Icon icon="mdi:application-braces-outline" className="text-xl" />
            </Button>
          </div>
          <div className="flex flex-col items-center gap-4">
            {/* 主题切换按钮 */}
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Icon icon="mdi:theme-light-dark" className="text-xl" />
            </Button>

            {/* 设置按钮 */}
            <Button variant="ghost" size="icon" className="h-10 w-10" title="设置">
              <Icon icon="mdi:settings-outline" className="text-xl" />
            </Button>
          </div>
        </div>

        <Panel defaultSize={600} minSize={200} className="flex flex-col !m-[5px]">
          <Tabs defaultValue="overview" className="w-full h-full flex flex-col">
            <TabsList variant="line" className="flex-shrink-0">
              <TabsTrigger value="overview">Javascript</TabsTrigger>
              <TabsTrigger value="analytics">HTML/CSS</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="flex-1 mt-0">
              <div className="h-full flex flex-col">
                <SandcastleEditor></SandcastleEditor>
              </div>
            </TabsContent>
            <TabsContent value="analytics" className="flex-1 mt-0">
              <div className="h-full flex flex-col">
                <SandcastleEditor></SandcastleEditor>
              </div>
            </TabsContent>
          </Tabs>
        </Panel>

        {/* 右侧主面板：包含视图和控制台 */}
        <Panel minSize={200}>
          {/* Cesium 视窗区域 - Bucket 内部已包含两个 Panel 和一个 Group */}
          <Bucket
            code="console.log('Hello Cesium!');"
            html="<div id='cesiumContainer'></div>"
            runNumber={1}
            highlightLine={() => {}}
            appendConsole={() => {}}
            resetConsole={() => {}}
          />
        </Panel>
      </Group>
    </div>
  );
}

export default App;
