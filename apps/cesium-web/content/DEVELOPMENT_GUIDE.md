/\*\*

- 项目开发规范和最佳实践指南
  \*/

# Cesium Web 开发规范

## 📁 文件组织规范

### 目录结构

```
src/
├── components/          # React 组件
│   ├── [ComponentName]/ # 组件目录（PascalCase）
│   │   ├── index.tsx   # 组件导出
│   │   ├── [ComponentName].tsx
│   │   ├── [ComponentName].module.css  # 可选样式
│   │   └── types.ts    # 可选类型定义
│   └── ui/             # 可复用 UI 组件
├── hooks/              # 自定义 Hooks（use开头）
├── contexts/           # React Context
├── util/               # 工具函数（camelCase）
├── constants/          # 常量定义（UPPER_SNAKE_CASE）
├── types/              # 类型定义（*.d.ts）
└── lib/                # 第三方库封装
```

### 命名约定

#### 文件命名

- **组件**: `PascalCase.tsx` (例: `SandcastleEditor.tsx`)
- **工具函数**: `camelCase.ts` (例: `bucket-client.ts`, `IframeBridge.ts`)
- **类型定义**: `camelCase.d.ts` (例: `global.d.ts`, `sandcastle.d.ts`)
- **常量**: `index.ts` 或 `constants.ts`

#### 变量命名

- **组件**: `PascalCase` (例: `SandcastleEditor`)
- **函数/变量**: `camelCase` (例: `embedInSandcastleTemplate`)
- **常量**: `UPPER_SNAKE_CASE` (例: `SANDCASTLE_BRIDGE_ID`)
- **类型/接口**: `PascalCase` (例: `GalleryItem`, `SandcastleAPI`)
- **私有字段**: `#privateField` (使用 # 前缀)

## 🎨 代码风格

### TypeScript

```typescript
// ✅ 推荐
interface ComponentProps {
  /** 属性说明（使用 JSDoc） */
  title: string;
  /** 可选属性使用 ? */
  description?: string;
  /** 回调函数类型明确 */
  onChange: (value: string) => void;
}

// ✅ 使用类型推断
const galleryItems = [...]; // 自动推断类型

// ✅ 明确函数返回类型（公共 API）
export function parseYaml(text: string): Record<string, unknown> {
  // ...
}

// ✅ 使用 const 断言
export const MESSAGE_TYPES = {
  RELOAD: "reload",
  RUN_CODE: "runCode"
} as const;

// ❌ 避免使用 any
function process(data: any) { } // 不好
function process(data: unknown) { } // 好
```

### React 组件

```typescript
// ✅ 推荐的组件结构
import { memo } from 'react';
import type { FC } from 'react';

interface MyComponentProps {
  // Props 定义
}

/**
 * 组件说明（JSDoc）
 * @param props - 属性说明
 */
export const MyComponent: FC<MyComponentProps> = memo(({ prop1, prop2 }) => {
  // Hooks 调用
  const [state, setState] = useState();

  // 事件处理器
  const handleClick = useCallback(() => {
    // ...
  }, []);

  // 渲染
  return (
    <div>
      {/* JSX */}
    </div>
  );
});

// 设置 displayName（利于调试）
MyComponent.displayName = 'MyComponent';

export default MyComponent;
```

### 注释规范

````typescript
/**
 * 函数/类/组件的完整说明
 *
 * 可以包含多行详细描述和使用示例
 *
 * @param param1 - 参数说明
 * @param param2 - 参数说明
 * @returns 返回值说明
 *
 * @example
 * ```ts
 * const result = myFunction('test');
 * ```
 */
export function myFunction(param1: string, param2: number): string {
  // 单行注释说明逻辑
  const result = processData(param1);

  // TODO: 待完成的任务
  // FIXME: 需要修复的问题
  // NOTE: 重要提示

  return result;
}
````

## 🛠️ 工具函数规范

### 纯函数优先

```typescript
// ✅ 纯函数（无副作用）
export function formatDate(date: Date): string {
  return date.toISOString();
}

// ❌ 避免修改输入参数
function badSort(arr: number[]): number[] {
  return arr.sort(); // 会修改原数组！
}

// ✅ 返回新数组
function goodSort(arr: number[]): number[] {
  return [...arr].sort();
}
```

### 错误处理

```typescript
// ✅ 明确的错误处理
export function parseYaml(text: string): Record<string, unknown> {
  try {
    return parse(text);
  } catch (error) {
    console.error("Failed to parse YAML:", error);
    return {};
  }
}

// ✅ 类型守卫
function isValidConfig(config: unknown): config is Config {
  return typeof config === "object" && config !== null && "title" in config;
}
```

## 🔌 插件开发规范

### Vite 插件

````typescript
import type { Plugin } from "vite";

interface MyPluginOptions {
  /** 选项说明 */
  option1?: string;
}

/**
 * 插件说明
 *
 * @param options - 配置选项
 * @returns Vite 插件对象
 *
 * @example
 * ```ts
 * export default defineConfig({
 *   plugins: [myPlugin({ option1: 'value' })]
 * });
 * ```
 */
export function myPlugin(options: MyPluginOptions = {}): Plugin {
  // 标准化配置
  const config = {
    option1: options.option1 ?? "default"
  };

  return {
    name: "my-plugin",

    config() {
      // 配置钩子
    },

    configResolved(resolvedConfig) {
      // 配置解析完成
    },

    transformIndexHtml(html) {
      // HTML 转换
      return html;
    }
  };
}
````

## 📦 依赖管理

### Import 顺序

```typescript
// 1. Node.js 内置模块
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2. 外部依赖
import React from "react";
import { Editor } from "@monaco-editor/react";

// 3. 内部模块（绝对路径）
import { Button } from "@/components/ui/button";
import { useCodeState } from "@/hooks/useCodeState";

// 4. 相对路径导入
import { helper } from "./utils";
import type { MyType } from "./types";

// 5. 样式文件
import "./styles.css";
```

### 避免循环依赖

```typescript
// ❌ 不好：A.ts 和 B.ts 互相导入
// A.ts
import { B } from "./B";

// B.ts
import { A } from "./A";

// ✅ 好：提取共享类型到单独文件
// types.ts
export interface SharedType {}

// A.ts
import type { SharedType } from "./types";

// B.ts
import type { SharedType } from "./types";
```

## 🧪 测试规范（待实施）

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should handle click events', () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);

    screen.getByRole('button').click();
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

## 🔐 安全规范

### 输入验证

```typescript
// ✅ 清理用户输入
import DOMPurify from "dompurify";

function loadUserHtml(html: string) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["div", "p", "span"],
    FORCE_BODY: true
  });
  return sanitized;
}
```

### iframe 通信安全

```typescript
// ✅ 验证消息来源
window.addEventListener("message", event => {
  // 检查来源
  if (event.origin !== expectedOrigin) {
    return;
  }

  // 检查消息结构
  if (!isValidMessage(event.data)) {
    return;
  }

  // 处理消息
  handleMessage(event.data);
});
```

## 📊 性能优化

### React 优化

```typescript
// ✅ 使用 memo 避免不必要的重渲染
export const ExpensiveComponent = memo(({ data }) => {
  // ...
});

// ✅ 使用 useCallback 缓存回调
const handleClick = useCallback(() => {
  // ...
}, [dependencies]);

// ✅ 使用 useMemo 缓存计算结果
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(data);
}, [data]);
```

### 代码分割

```typescript
// ✅ 动态导入
const HeavyComponent = lazy(() => import('./HeavyComponent'));

<Suspense fallback={<Loading />}>
  <HeavyComponent />
</Suspense>
```

## 🚀 Git 提交规范

### Commit Message 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具配置

### 示例

```bash
feat(sandcastle): 添加代码书签高亮功能

- 实现 Sandcastle.declare() API
- 支持自动行号定位
- 添加高亮样式

Closes #123
```

## ✅ 代码审查清单

- [ ] 代码符合 TypeScript 规范
- [ ] 添加了必要的注释和文档
- [ ] 类型定义完整准确
- [ ] 没有 console.log 等调试代码
- [ ] 错误处理完善
- [ ] 考虑了边界情况
- [ ] 性能影响可接受
- [ ] 可访问性（a11y）考虑
- [ ] 构建通过，无警告
- [ ] 类型检查通过

## 📚 推荐资源

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [React 最佳实践](https://react.dev/learn)
- [Vite 插件开发](https://vitejs.dev/guide/api-plugin.html)
- [Cesium 官方文档](https://cesium.com/docs/)
