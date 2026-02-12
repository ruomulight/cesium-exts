import { Icon as IconifyIcon } from "@iconify/react";
import type { IconProps } from "@iconify/react";
import { cn } from "@/lib/utils";

interface Props extends IconProps {
  /**
   * 是否旋转
   */
  spin?: boolean;
}

/**
 * 通用图标组件
 */
export function Icon({ icon, className, spin, ...props }: Props) {
  return <IconifyIcon icon={icon} className={cn("inline-block", spin && "animate-spin", className)} {...props} />;
}
