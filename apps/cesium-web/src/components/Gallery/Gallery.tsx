import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { loadGalleryItems, loadAllLabels, type GalleryItem } from "./gallery-data";

interface GalleryProps {
  /** 选择示例后的回调，参数为 code 和 html */
  onSelectExample: (code: string, html: string) => void;
}

/**
 * Gallery 画廊组件
 * 展示所有 Cesium Sandcastle 示例的缩略图网格，支持搜索和标签过滤
 */
function Gallery({ onSelectExample }: GalleryProps) {
  const [search, setSearch] = useState("");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // 首次挂载时异步加载 gallery 数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [loadedItems, loadedLabels] = await Promise.all([loadGalleryItems(), loadAllLabels()]);
      if (!cancelled) {
        setItems(loadedItems);
        setLabels(loadedLabels);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 根据搜索词和标签过滤示例列表
  const filteredItems = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return items.filter(item => {
      // 标签过滤
      if (activeLabel && !item.labels.includes(activeLabel)) {
        return false;
      }
      // 搜索过滤
      if (lowerSearch) {
        return (
          item.title.toLowerCase().includes(lowerSearch) ||
          item.description.toLowerCase().includes(lowerSearch) ||
          item.labels.some(l => l.toLowerCase().includes(lowerSearch))
        );
      }
      return true;
    });
  }, [search, activeLabel, items]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 搜索栏和标签过滤 */}
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        {/* 搜索输入框 */}
        <div className="relative">
          <Icon
            icon="mdi:magnify"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm"
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索示例..."
            className="w-full rounded-md border border-input bg-background px-8 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <Icon icon="mdi:close" className="text-sm" />
            </button>
          )}
        </div>

        {/* 标签过滤按钮 */}
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={activeLabel === null ? "secondary" : "outline"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setActiveLabel(null)}
            >
              全部
            </Button>
            {labels.map(label => (
              <Button
                key={label}
                variant={activeLabel === label ? "secondary" : "outline"}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setActiveLabel(activeLabel === label ? null : label)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* 示例卡片网格 */}
      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="p-4">
          {loading ? (
            <div className="flex h-125 items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <Icon icon="mdi:loading" className="animate-spin text-2xl" />
                <p>加载示例中...</p>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex h-125 items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <Icon icon="mdi:magnify-close" className="text-3xl opacity-50" />
                <p>未找到匹配的示例</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredItems.map(item => (
                <GalleryCard key={item.name} item={item} onClick={() => onSelectExample(item.code, item.html)} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** 单个 Gallery 卡片的属性 */
interface GalleryCardProps {
  item: GalleryItem;
  onClick: () => void;
}

/**
 * Gallery 示例卡片
 * 显示缩略图、标题、描述和标签，点击后加载示例到编辑器
 */
function GalleryCard({ item, onClick }: GalleryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
    >
      {/* 缩略图区域 */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon icon="mdi:image-outline" className="text-3xl text-muted-foreground/50" />
          </div>
        )}
        {/* 悬停时的运行指示器 */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
          <Icon
            icon="mdi:play-circle"
            className="text-4xl text-white opacity-0 transition-opacity group-hover:opacity-90"
          />
        </div>
      </div>

      {/* 文本信息区域 */}
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h3 className="text-sm font-medium leading-tight line-clamp-1">{item.title}</h3>
        {item.description && <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>}
        {item.labels.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {item.labels.map(label => (
              <span key={label} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export default Gallery;
