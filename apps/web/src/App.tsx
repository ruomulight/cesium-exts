import { Panel, Group } from "react-resizable-panels";
import { Button } from "@/components/ui/button.tsx";

function App() {
  return (
    <div className="h-screen w-screen">
      <Group orientation="horizontal">
        {/* 左侧侧边栏按钮区域 */}
        <div className="flex w-[3rem] flex-col justify-between py-4 border-r bg-background !m-[5px]">
          <div className="flex flex-col items-center gap-4">
            {/* --- 画廊展示切换按钮 --- */}
            <Button variant="ghost" size="icon" title="示例画廊">
              5
            </Button>

            {/* --- 代码查看器切换按钮 --- */}
            <Button variant="ghost" size="icon" title="编辑器">
              6
            </Button>
          </div>
          <div className="flex flex-col items-center gap-4">
            {/* 主题切换按钮 */}
            <Button variant="ghost" size="icon" className="h-10 w-10"></Button>

            {/* 设置按钮 */}
            <Button variant="ghost" size="icon" className="h-10 w-10" title="设置">
              设置
            </Button>
          </div>
        </div>

        <Panel defaultSize={600} minSize={200}>
          sss
        </Panel>

        {/* 右侧主面板：包含视图和控制台 */}
        <Panel minSize={200}>
          {/* Cesium 视窗区域 */}
          <Panel minSize={20}>333</Panel>
        </Panel>
      </Group>
    </div>
  );
}

export default App;
