import { useMemo } from "react";

import type { GalleryItem } from "@/types/sandcastle";

import { Icon } from "@/components/icon";
import { getGalleryItems } from "@/util/gallery";

interface GalleryProps {
  /** 点击卡片：直接运行示例，停留在画廊视图查看效果 */
  onRun: (item: GalleryItem) => void;
  /** 点击代码图标：将示例载入编辑器 */
  onSelect: (item: GalleryItem) => void;
}

/**
 * 示例画廊组件
 * 以官方 Sandcastle 风格的纵向列表展示可用示例（横向卡片：缩略图 + 标题/描述 + 标签），
 * 点击卡片直接运行示例（onRun），点击标题右侧的代码图标进入编辑器（onSelect）
 */
export default function Gallery({ onRun, onSelect }: GalleryProps) {
  // glob 模块常量在 HMR 时会重新求值，因此使用空依赖数组即可
  const items = useMemo(() => getGalleryItems(), []);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">暂无示例</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="flex flex-col gap-2 p-2">
        {items.map(item => {
          // 行数 badge：代码行数（与官方 Sandcastle 的 "N lines" 一致）
          const lineCount = item.code.split("\n").length;

          return (
            <button
              key={item.name}
              type="button"
              onClick={() => onRun(item)}
              className="flex h-35 w-full items-start gap-2 rounded-lg bg-card p-2 text-left transition-colors duration-150 ease-out hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {/* 缩略图：3:2 固定比例（max 225×150），右下角为行数 badge */}
              <div className="relative h-full w-[38.2%] max-w-56.25 shrink-0 rounded-sm bg-muted">
                <img
                  src={item.thumbnailUrl}
                  alt={`${item.title} 缩略图`}
                  loading="lazy"
                  className="h-full w-full rounded-sm border border-border object-cover"
                />
                <span className="absolute bottom-1 right-1 rounded-xs bg-muted px-1 py-0.5 text-[10px] leading-none text-foreground/85">
                  {lineCount} lines
                </span>
              </div>

              {/* 内容区：标题 + 描述在上，标签在下 */}
              <section className="flex min-w-0 flex-1 flex-col justify-between gap-1 overflow-hidden">
                <header className="">
                  <h3 className="flex items-center justify-between gap-2 text-base font-normal leading-6 text-foreground">
                    <span className="min-w-0 truncate font-semibold">{item.title}</span>
                    <Icon
                      onClick={e => {
                        e.stopPropagation();
                        onSelect(item);
                      }}
                      icon="mdi:code-tags"
                      className="shrink-0 cursor-pointer"
                    />
                  </h3>

                  <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{item.description}</p>
                </header>
                {item.labels.length > 0 && (
                  <ul className="flex flex-wrap justify-items-start gap-1">
                    {item.labels.map(label => (
                      <li key={label}>
                        <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2 text-xs text-secondary-foreground">
                          {label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </button>
          );
        })}
      </div>
    </div>
  );
}
