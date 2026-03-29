import path from "path";

import tailwindcss from "@tailwindcss/vite";
import { type BuildEnvironmentOptions, defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  // 定义全局常量，用于 Bucket 组件的跨域通信
  // __INNER_ORIGIN__: iframe bucket 页面的 origin (默认使用 location.origin)
  // __OUTER_ORIGIN__: 父级应用的 origin
  define: {
    __INNER_ORIGIN__: JSON.stringify(process.env.VITE_INNER_ORIGIN || ""),
    __OUTER_ORIGIN__: JSON.stringify(process.env.VITE_OUTER_ORIGIN || ""),
    __CESIUM_BASE_URL__: JSON.stringify(process.env.VITE_CESIUM_BASE_URL || "/cesium")
  },
  // 配置开发服务器
  server: {
    // 允许通过 IP 地址访问开发服务器
    host: "0.0.0.0",
    // 服务器启动时是否自动打开浏览器
    open: true
  },
  // 构建配置
  build: {
    // 设置输出目录为项目根目录下的 dist/Sandcastle
    outDir: "dist",
    // 确保构建前清理目录
    emptyOutDir: true,
    // 消除打包大小超过500kb警告
    chunkSizeWarningLimit: 2000,
    // Vite 2.6.x 以上需要配置 minify: "terser", terserOptions 才能生效
    minify: "terser",
    // 配置 Terser 压缩选项
    terserOptions: {
      compress: {
        // 防止 Infinity 被压缩成 1/0，这可能会导致 Chrome 上的性能问题
        keep_infinity: true,
        // 生产环境去除 console
        drop_console: true,
        // 生产环境去除 debugger
        drop_debugger: true
      },
      format: {
        // 删除注释
        comments: false
      }
    },
    // 配置 Rollup 打包选项
    rollupOptions: {
      output: {
        // 用于从入口点创建的块的打包输出格式[name]表示文件名,[hash]表示该文件内容hash值
        entryFileNames: "js/[name].[hash].js",
        // 用于命名代码拆分时创建的共享块的输出命名
        chunkFileNames: "js/[name].[hash].js",
        // 用于输出静态资源的命名，[ext]表示文件扩展名
        assetFileNames: assetInfo => {
          // 获取文件信息并按点分割
          const info = assetInfo.names[0]!.split(".");
          // 获取文件扩展名
          let extType = info[info.length - 1];
          // console.log('文件信息',assetInfo.names[0])
          // 判断文件是否为媒体文件
          if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetInfo.names[0]!)) {
            extType = "media";
          }
          // 判断文件是否为图片文件
          else if (/\.(png|jpe?g|gif|svg)(\?.*)?$/.test(assetInfo.names[0]!)) {
            extType = "img";
          }
          // 判断文件是否为字体文件
          else if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetInfo.names[0]!)) {
            extType = "fonts";
          }
          // 返回格式化后的文件名
          return `${extType}/[name].[hash].[ext]`;
        }
      }
    }
  } as BuildEnvironmentOptions
});
