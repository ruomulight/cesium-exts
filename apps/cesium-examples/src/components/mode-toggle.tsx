/**
 * ModeToggle - 主题模式切换器
 *
 * 以下拉菜单形式提供 浅色 / 深色 / 跟随系统 三种主题模式的选择。
 * 触发器显示当前模式对应的图标，菜单中当前选中项会带勾选标记。
 */

import { Icon } from "@/components/icon";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

/** 主题模式类型（与 theme-provider 内部定义保持一致） */
type ThemeMode = "light" | "dark" | "system";

/** 各主题模式的展示元数据：图标与文案 */
const THEME_META: Record<ThemeMode, { icon: string; label: string }> = {
  light: { icon: "mdi:white-balance-sunny", label: "浅色" },
  dark: { icon: "mdi:moon-waning-crescent", label: "深色" },
  system: { icon: "mdi:monitor", label: "跟随系统" }
};

/** 下拉菜单中可选的主题模式顺序 */
const THEME_OPTIONS: ThemeMode[] = ["light", "dark", "system"];

export function ModeToggle() {
  const { mode, setTheme } = useTheme();
  const current = THEME_META[mode];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="h-10 w-10" title={`主题：${current.label}`} />}
      >
        <Icon icon={current.icon} className="text-xl" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8}>
        <DropdownMenuRadioGroup value={mode} onValueChange={value => setTheme(value as ThemeMode)}>
          {THEME_OPTIONS.map(themeMode => {
            const meta = THEME_META[themeMode];
            return (
              <DropdownMenuRadioItem key={themeMode} value={themeMode} className="pr-8 pl-1.5">
                <Icon icon={meta.icon} className="size-4!" />
                <span>{meta.label}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
