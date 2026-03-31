import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/icon";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon icon="mdi:settings-outline" className="text-xl" />
            设置
          </AlertDialogTitle>
          <AlertDialogDescription>配置 Cesium Web 开发环境</AlertDialogDescription>
        </AlertDialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">通用</TabsTrigger>
            <TabsTrigger value="editor">编辑器</TabsTrigger>
            <TabsTrigger value="cesium">Cesium</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">启用调试模式</p>
                <p className="text-sm text-muted-foreground">显示额外的调试信息</p>
              </div>
              <Button variant="outline" size="sm">
                未实现
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">控制台镜像</p>
                <p className="text-sm text-muted-foreground">在底部面板显示代码中的 console 输出</p>
              </div>
              <Button variant="outline" size="sm">
                未实现
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">自动运行</p>
                <p className="text-sm text-muted-foreground">代码变更后自动执行</p>
              </div>
              <Button variant="outline" size="sm">
                未实现
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="editor" className="space-y-6 pt-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">主题</p>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" className="justify-start">
                  <Icon icon="mdi:white-balance-sunny" className="mr-2" />
                  浅色
                </Button>
                <Button variant="outline" className="justify-start">
                  <Icon icon="mdi:moon-waning-crescent" className="mr-2" />
                  深色
                </Button>
                <Button variant="outline" className="justify-start">
                  <Icon icon="mdi:theme-light-dark" className="mr-2" />
                  自动
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cesium" className="space-y-4 pt-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Cesium 资源基础 URL</p>
              <input
                type="text"
                defaultValue="https://cesium.com/downloads/cesiumjs/releases/1.137/Build/Cesium"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
              <p className="text-sm text-muted-foreground">指定 CesiumJS 资源文件的基础路径</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">启用地形</p>
                <p className="text-sm text-muted-foreground">默认启用 Cesium World Terrain</p>
              </div>
              <Button variant="outline" size="sm">
                未实现
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">显示信息框</p>
                <p className="text-sm text-muted-foreground">显示帧率和渲染信息</p>
              </div>
              <Button variant="outline" size="sm">
                未实现
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            恢复默认
          </Button>
          <Button onClick={() => onOpenChange(false)}>保存</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
