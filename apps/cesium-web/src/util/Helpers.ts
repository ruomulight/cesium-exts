import Pako from "pako";

/**
 * 将用户代码嵌入 Sandcastle 运行模板。
 *
 * 执行以下处理：
 * 1. 移除用户代码中的 `import * as Cesium from "cesium"` 语句，
 *    因为 bucket.html 已通过常规 <script> 标签加载 Cesium.js，Cesium 作为全局对象可用。
 * 2. 移除用户代码中的 `import Sandcastle from "Sandcastle"` 语句，
 *    因为 bucket.html 已通过模块 <script> 标签加载 Sandcastle.ts 并挂载到 window。
 * 3. 使用注释替换 import 语句以保持行号对齐，使编辑器中的行号与实际执行行号一致。
 * 4. 在末尾注入 `Sandcastle.finishedLoading()`。
 *
 * @param code         - 用户编写的原始 TypeScript/JavaScript 代码。
 * @param addExtraLine - 若为 `true`，在模板最前面插入一个空行，
 *                       用于在编辑器中对齐光标或保留原始行号偏移。
 * @returns 包裹了运行时样板代码的完整可执行字符串。
 */
export function embedInSandcastleTemplate(code: string, addExtraLine: boolean) {
  // 移除用户代码中的 Cesium 和 Sandcastle import 语句
  // 因为 bucket.html 已通过 <script> 标签加载了这两个全局对象
  // 使用注释替换以保持行号对齐
  const processedCode = code
    .replace(
      /^import\s+\*\s+as\s+Cesium\s+from\s+(['"])cesium\1;?\s*$/gm,
      "// Cesium is loaded as global by bucket.html"
    )
    .replace(
      /^import\s+Sandcastle\s+from\s+(['"])Sandcastle\1;?\s*$/gm,
      "// Sandcastle is loaded as global by bucket.html"
    );

  return `${addExtraLine ? "\n" : ""}${processedCode}
// 触发可能已配置的默认回调
Sandcastle.finishedLoading();
`;
}

/**
 * Sandcastle 存档数据的结构。
 * 序列化时以 JSON 数组形式存储：索引 0 为 `code`，索引 1 为 `html`。
 */
type SandcastleSaveData = {
  /** 用户编写的 JavaScript/TypeScript 代码。 */
  code: string;
  /** 用户编写的自定义 HTML 片段。 */
  html: string;
};

/**
 * 将 {@link SandcastleSaveData} 序列化为可嵌入 URL hash 的压缩 Base64 字符串。
 *
 * **编码流程：**
 * 1. 将 `[code, html]` 序列化为 JSON 字符串。
 * 2. 裁剪首尾固定的 `["` 与 `"]`（共 4 字节），以减小体积。
 * 3. 使用 raw DEFLATE（level 9）压缩裁剪后的字符串。
 * 4. 将压缩结果转为 Base64，并去除末尾的 `=` 填充字符。
 *
 * 对应的解码函数为 {@link decodeBase64Data}。
 *
 * @param data - 包含 `code` 与 `html` 的存档对象。
 * @returns 无填充的 Base64 字符串，可直接用作 URL hash 的值。
 */
export function makeCompressedBase64String(data: SandcastleSaveData) {
  // 数据以如下格式存储于 URL hash：
  // 对 JSON 数组进行 raw DEFLATE 压缩后再做 Base64 编码，索引 0 为 code，索引 1 为 html
  const { code, html } = data;
  const encode = [code, html];
  let jsonString = JSON.stringify(encode);

  // 首尾的 [" 与 "] 始终固定，裁剪掉可节省 4 字节
  jsonString = jsonString.slice(2, 2 + jsonString.length - 4);
  const pakoData = Pako.deflate(jsonString, { raw: true, level: 9 });

  // 参考：https://stackoverflow.com/questions/12710001/how-to-convert-uint8-array-to-base64-encoded-string
  let base64String = btoa(String.fromCharCode(...pakoData));
  base64String = base64String.replace(/=+$/, ""); // 去除 Base64 末尾填充字符

  return base64String;
}

/**
 * 将 URL hash 中的压缩 Base64 字符串还原为 {@link SandcastleSaveData}。
 *
 * **解码流程：**
 * 1. 补全 Base64 末尾的 `=` 填充字符（编码时已去除）。
 * 2. Base64 解码为二进制字节数组。
 * 3. 使用 raw DEFLATE 解压，还原为 JSON 字符串。
 * 4. 重新拼接首尾的 `["` 与 `"]`，解析为 JSON 数组。
 * 5. 取索引 0（`code`）与索引 1（`html`）返回。
 *
 * **兼容性说明：**
 * 历史版本的链接中，索引 2 可能存储了自定义 `<base>` 标签的 href，
 * 当前版本已不再支持该字段，若检测到将输出 `console.warn` 提示。
 *
 * 对应的编码函数为 {@link makeCompressedBase64String}。
 *
 * @param base64String - 来自 URL hash 的（无填充）Base64 字符串。
 * @returns 解码后的 {@link SandcastleSaveData} 对象，包含 `code` 与 `html`。
 */
export function decodeBase64Data(base64String: string): SandcastleSaveData {
  // 数据以如下格式存储于 URL hash：
  // 对 JSON 数组进行 raw DEFLATE 压缩后再做 Base64 编码，索引 0 为 code，索引 1 为 html

  // 补全编码时去除的末尾填充字符
  while (base64String.length % 4 !== 0) {
    base64String += "=";
  }
  // 参考：https://stackoverflow.com/questions/12710001/how-to-convert-uint8-array-to-base64-encoded-string
  const dataArray = new Uint8Array(
    atob(base64String)
      .split("")
      .map(function (c) {
        return c.charCodeAt(0);
      })
  );

  let jsonString = Pako.inflate(dataArray, { raw: true, to: "string" });

  // 编码时裁剪了首尾的 [" 与 "]，此处重新拼接还原
  jsonString = `["${jsonString}"]`;
  const json = JSON.parse(jsonString);

  // 索引 0 为 code，索引 1 为 html
  const code = json[0];
  const html = json[1];
  const baseHref = json[2];
  if (baseHref !== undefined) {
    // 历史版本曾将第三个元素用于在页面加载时修改 <base> 标签的 href。
    // 当前版本已不再支持该功能，但旧链接中可能仍携带此字段。
    console.warn("Sandcastle 不再支持通过 URL 设置页面 base 路径");
  }
  return {
    code: code,
    html: html
  };
}
