import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "path";
import { type BuildEnvironmentOptions, type ConfigEnv, defineConfig, loadEnv } from "vite";
import viteCesiumExtsDev from "vite-cesium-exts-dev";
import CesiumPlugin from "vite-cesium-plugin";
import cesiumSandcastle from "vite-cesium-sandcastle";

import pkg from "./package.json" with { type: "json" };

export default defineConfig((mode: ConfigEnv) => {
  // 手动加载环境变量
  const env = loadEnv(mode.mode, "env") as ImportMetaEnv;

  return {
    // 指定 .env 文件所在的目录（相对于项目根目录）
    envDir: path.resolve(import.meta.dirname, "env"),

    plugins: [
      CesiumPlugin(),
      viteCesiumExtsDev(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      cesiumSandcastle({
        cesiumBaseUrl: "/cesium/",
        // 把 bucket-client 注册为独立的 build entry，
        // 插件会在 writeBundle 钩子里把 templates/bucket.html 中
        // 的 `../src/util/bucket-client.ts` 引用替换为真实的 chunk 文件名
        bucketClientEntry: "src/util/bucket-client.ts"
      })
    ],
    optimizeDeps: {
      // 预打包 cesium 与 cesium-exts，使 bucket iframe 内的裸说明符 import
      // （通过 importmap 映射到 /node_modules/.vite/deps/）能在浏览器侧拿到
      // 一个完整、含所有嵌套依赖的 ES Module 产物
      include: []
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src")
      }
    },

    // 配置开发服务器
    server: {
      // 允许通过 IP 地址访问开发服务器
      host: env.VITE_HOST,
      // 服务器启动时是否自动打开浏览器
      open: false
    },

    // 构建配置
    build: {
      chunkSizeWarningLimit: 5000,
      reportCompressedSize: false,
      cssMinify: "lightningcss",
      // minify 默认使用 'oxc'，压缩速度比 terser 快 30-90 倍
      rolldownOptions: {
        checks: {
          pluginTimings: false
        },
        output: {
          entryFileNames: "js/[name].[hash].js",
          chunkFileNames: "js/[name].[hash].js",

          assetFileNames: assetInfo => {
            const assetName = assetInfo.names[0];

            if (!assetName) {
              return "assets/[name].[hash][extname]";
            }

            const info = assetName.split(".");
            let extType = info[info.length - 1];
            if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetName)) {
              extType = "media";
            } else if (/\.(png|jpe?g|gif|svg)(\?.*)?$/.test(assetName)) {
              extType = "img";
            } else if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetName)) {
              extType = "fonts";
            }
            return `${extType}/[name].[hash].[ext]`;
          }
        }
      }
    } as BuildEnvironmentOptions,

    // 配置全局常量
    define: {
      __APP_INFO__: pkg,
      __INNER_ORIGIN__: "location.origin",
      __OUTER_ORIGIN__: "location.origin"
    }
  };
});
