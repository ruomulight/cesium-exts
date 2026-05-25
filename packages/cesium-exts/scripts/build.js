import path from "path";
import { fileURLToPath } from "url";
import { EOL } from "os";
import { readFile, writeFile } from "fs/promises";
import { globby } from "globby";
import { rollup } from "rollup";

// 获取当前文件所在目录和项目根目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..").replace(/\\/g, "/");

/**
 * 工作区源文件配置
 * 定义了每个工作区需要包含的源文件路径模式 (glob patterns)
 * @type {Object.<string, string[]>}
 */
const workspaceSourceFiles = {
  // 引擎核心模块，包含 Utils 和功能模块
  // 使用绝对路径避免路径混淆
  engine: ["src/Utils/**/*.ts", "src/modules/**/index.ts"]
};

/**
 * 执行 Cesium 扩展的构建流程
 * 目前主要负责为 engine 工作区生成统一的入口文件
 */
export async function buildCesiumExts() {
  await createIndexJs("engine");
}

/**
 * 使用 Rollup 打包 TypeScript 代码
 * 读取 rollup.config.js 配置并执行打包
 */
export async function rollupBuild() {
  // 1：确保工作目录切换到项目根目录
  process.chdir(projectRoot);

  // 关键步骤 2：动态导入配置
  // 此时 CWD 已经是根目录，rollup.config.js 内的路径解析就会正确
  const { default: rollupConfig } = await import("../rollup.config.js");

  for (const config of rollupConfig) {
    let bundle;
    try {
      bundle = await rollup(config);
      // 统一处理单个或多个输出配置
      const outputOptionsArray = Array.isArray(config.output) ? config.output : [config.output].filter(Boolean);

      // 并行写入所有输出
      await Promise.all(outputOptionsArray.map(outputOptions => bundle.write(outputOptions)));
    } catch (error) {
      console.error(`❌ Rollup 打包失败 [${config.input || "未知"}]:`, error);
      throw error;
    } finally {
      // 确保 bundle 总是被关闭，释放资源
      await bundle.close();
    }
  }

  // 生成 dist/package.json
  await generateDistPackageJson();
}

/**
 * 为指定工作区创建入口索引文件 (index.ts/js)
 * 该函数会扫描工作区下的源文件，并生成包含所有导出的 index 文件
 *
 * @param {string} workspace - 工作区名称，对应 workspaceSourceFiles 中的 key
 * @returns {Promise<string>} 生成的索引文件内容
 * @throws {Error} 当找不到指定工作区的源文件配置时抛出错误
 */
export async function createIndexJs(workspace) {
  // 获取指定工作区的源文件路径模式
  const workspaceSources = workspaceSourceFiles[workspace];

  // 如果找不到指定工作区的源文件配置，则抛出错误
  if (!workspaceSources) {
    throw new Error(`找不到工作区的源文件：${workspace}`);
  }

  // 使用 globby 匹配所有符合模式的文件
  // glob 模式使用绝对路径,不需要指定 cwd
  const files = await globby(workspaceSources);

  // 工作区根目录路径就是项目根目录(packages/engine)
  const workspaceRoot = projectRoot;

  // 使用 map + join 代替循环拼接字符串
  const contents = files
    .map(file => {
      // 1. 将 globby 返回的相对路径（相对于 projectRoot）转换为绝对路径
      const absolutePath = path.resolve(projectRoot, file);

      // 2. 计算相对于工作区根目录的相对路径
      const relativePath = path.relative(workspaceRoot, absolutePath);

      // 2. 将文件路径转换为模块导入路径
      const moduleId = filePathToModuleId(relativePath);

      // 3. 提取导出名
      let assignmentName;
      const lowerPath = relativePath.toLowerCase();

      if (lowerPath.includes("index")) {
        // 如果包含 index，提取上一层目录名作为导出名
        const pathParts = relativePath.split(path.sep);
        assignmentName = pathParts[pathParts.length - 2];
      } else {
        // 不包含 index 时，使用文件名（不含扩展名）
        assignmentName = path.basename(relativePath, path.extname(relativePath));

        // 为着色器文件添加前缀
        if (moduleId.startsWith("Source/Shaders/")) {
          assignmentName = `_shaders${assignmentName}`;
        }
      }

      // 4. 统一处理导出名：替换特殊字符为下划线
      assignmentName = assignmentName.replace(/[.-]/g, "_");

      // 5. 返回导出语句
      return `export { default as ${assignmentName} } from './${moduleId}';`;
    })
    .join(EOL);

  // 将生成的内容写入索引文件
  await writeFile(path.join(workspaceRoot, "index.ts"), contents, {
    encoding: "utf-8"
  });

  return contents;
}

/**
 * 将文件路径转换为模块 ID
 * 用于生成 import/export 语句中的路径部分
 *
 * 处理逻辑：
 * 1. 移除文件扩展名（如 .ts, .js 等）
 * 2. 将 Windows 风格的反斜杠(\)路径分隔符替换为 Unix 风格的正斜杠(/)
 *
 * @param {string} moduleId - 原始文件路径 (例如: "Utils\Math.ts")
 * @returns {string} 转换后的模块 ID (例如: "Utils/Math")
 *
 * @example
 * filePathToModuleId("Utils\\Math.ts"); // returns "Utils/Math"
 * @example
 * filePathToModuleId("Cord/Entity.js"); // returns "Cord/Entity"
 */
function filePathToModuleId(moduleId) {
  return moduleId.substring(0, moduleId.lastIndexOf(".")).replace(/\\/g, "/");
}

/**
 * 在 dist 目录生成 npm 发布用的 package.json
 */
async function generateDistPackageJson() {
  const rootPkg = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf-8"));

  const pkg = {
    name: rootPkg.name,
    version: rootPkg.version,
    description: rootPkg.description,
    type: "module",
    main: "./cesium-exts.cjs.js",
    module: "./cesium-exts.esm.js",
    exports: {
      ".": {
        import: "./cesium-exts.esm.js",
        require: "./cesium-exts.cjs.js"
      }
    },
    files: ["cesium-exts.cjs.js", "cesium-exts.esm.js", "cesium-exts.umd.js", "types"],
    types: "./types/index.d.ts",
    keywords: rootPkg.keywords,
    author: rootPkg.author,
    license: rootPkg.license,
    peerDependencies: {
      cesium: rootPkg.peerDependencies.cesium
    }
  };

  await writeFile(path.join(projectRoot, "dist", "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  console.log("☯ dist/package.json 已生成");
}
