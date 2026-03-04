import { useEffect, useState } from "react";

/**
 * 用于根据当前加载的具体 Sandcastle 示例动态更新页面标题（document.title）的自定义 Hook。
 * 当代码处于“脏”状态（即有未保存的修改）时，会自动在标题中追加星号（*）作为提示。
 *
 * @returns {Object} 返回包含状态更新函数的对象
 * @property {React.Dispatch<React.SetStateAction<string>>} setPageTitle - 用于设置当前 Sandcastle 示例名称的函数
 * @property {React.Dispatch<React.SetStateAction<boolean>>} setIsDirty - 用于设置代码是否已被修改（脏状态）的函数
 *
 * @example
 * // 使用示例：
 * const { setPageTitle, setIsDirty } = usePageTitle();
 * setPageTitle("My Custom Demo"); // 页面标题将更新包含该名称
 * setIsDirty(true); // 页面标题将出现 * 号
 */
export function usePageTitle() {
  const [title, setPageTitle] = useState("New Sandcastle");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const host = window.location.host;
    let envString = "";

    if (host.includes("localhost") && host !== "localhost:8080") {
      // 提取非 8080 端口号作为前缀，
      // 这有助于在浏览器标签页中区分本地 Sandcastle 的不同开发或测试环境
      envString = `${host.replace("localhost:", "")} `;
    }

    const dirtyIndicator = isDirty ? "*" : "";

    if (title === "" || title === "New Sandcastle") {
      // 如果没有查看特定的（已命名）示例演示，则无需在窗口/标签页中堆砌名称
      document.title = `${envString}Sandcastle${dirtyIndicator} | CesiumJS`;
    } else {
      document.title = `${envString}${title}${dirtyIndicator} | Sandcastle | CesiumJS`;
    }
  }, [title, isDirty]);

  return { setPageTitle, setIsDirty };
}
