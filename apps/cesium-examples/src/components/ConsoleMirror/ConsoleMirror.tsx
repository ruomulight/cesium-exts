import { useEffect, useRef } from "react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ConsoleMessageType = "log" | "warn" | "error";
export type ConsoleMessage = {
  type: ConsoleMessageType;
  message: string;
  id: string;
};

interface ConsoleMirrorProps {
  /** 控制台消息列表 */
  messages: ConsoleMessage[];
  /** 清空控制台的回调 */
  onClear: () => void;
}

/** 消息类型对应的图标和样式 */
const MESSAGE_CONFIG: Record<ConsoleMessageType, { icon: string; className: string }> = {
  log: { icon: "mdi:chevron-right", className: "text-foreground" },
  warn: { icon: "mdi:alert-outline", className: "text-yellow-500" },
  error: { icon: "mdi:close-circle-outline", className: "text-red-500" }
};

/**
 * 控制台镜像组件
 * 接收来自 iframe 沙箱的 console 输出并展示，支持按类型着色和清空操作
 */
function ConsoleMirror({ messages, onClear }: ConsoleMirrorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages]);

  // 统计各类型消息数量
  const counts = messages.reduce(
    (acc, msg) => {
      acc[msg.type]++;
      return acc;
    },
    { log: 0, warn: 0, error: 0 } as Record<ConsoleMessageType, number>
  );

  return (
    <div className="flex h-full flex-col border-t">
      {/* 头部栏 */}
      <div className="flex items-center justify-between border-b px-3 py-1.5 bg-muted/30">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon icon="mdi:console-line" className="text-base" />
          <span>控制台</span>
          {counts.error > 0 && (
            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-xs text-red-500">{counts.error}</span>
          )}
          {counts.warn > 0 && (
            <span className="rounded-full bg-yellow-500/15 px-1.5 py-0.5 text-xs text-yellow-500">{counts.warn}</span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="清空控制台" onClick={onClear}>
          <Icon icon="mdi:ban" className="text-sm" />
        </Button>
      </div>

      {/* 消息列表 */}
      <ScrollArea viewportRef={viewportRef} className="min-h-0 flex-1 font-mono text-xs">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            控制台输出将显示在此处
          </div>
        ) : (
          messages.map(msg => {
            const config = MESSAGE_CONFIG[msg.type];
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-1.5 border-b border-border/50 px-3 py-1 hover:bg-muted/30 ${config.className}`}
              >
                <Icon icon={config.icon} className="mt-0.5 shrink-0 text-sm" />
                <span className="whitespace-pre-wrap break-all">{msg.message}</span>
              </div>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}

export default ConsoleMirror;
