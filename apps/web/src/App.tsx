import { Panel, Group } from "react-resizable-panels";
import { Button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Bucket from "@/components/Bucket/Bucket.tsx";

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

        <Panel defaultSize={600} minSize={200}>
          <Tabs defaultValue="overview" className="w-full">
            <TabsList variant="line">
              <TabsTrigger value="overview">Javascript</TabsTrigger>
              <TabsTrigger value="analytics">HTML/CSS</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Overview</CardTitle>
                  <CardDescription>
                    View your key metrics and recent project activity. Track progress across all your active projects.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  You have 12 active projects and 3 pending tasks.
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="analytics">
              <Card>
                <CardHeader>
                  <CardTitle>Analytics</CardTitle>
                  <CardDescription>
                    Track performance and user engagement metrics. Monitor trends and identify growth opportunities.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  Page views are up 25% compared to last month.
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="reports">
              <Card>
                <CardHeader>
                  <CardTitle>Reports</CardTitle>
                  <CardDescription>
                    Generate and download your detailed reports. Export data in multiple formats for analysis.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  You have 5 reports ready and available to export.
                </CardContent>
              </Card>
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
