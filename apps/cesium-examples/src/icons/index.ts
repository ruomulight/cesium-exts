/**
 * @file Iconify 离线图标注册。
 *
 * `@iconify/react` 默认向 Iconify API 按需拉取图标数据。
 * 这里改用官方离线入口，在首屏渲染前把 Material Design Icons 整包注册进本地存储。
 * 业务组件继续写 `<Icon icon="mdi:..." />`，未注册的图标不会再发起远程请求。
 *
 * 只安装实际用到的集合（当前为 `@iconify-json/mdi`）。不要引入包含全部图标库的 `@iconify/json`。
 * 新增其他前缀时，安装对应的 `@iconify-json/*` 并在此处再调用一次 `addCollection`。
 *
 * 必须在应用入口于 `createRoot().render()` 之前以副作用导入。
 */

import { icons as mdiIcons } from "@iconify-json/mdi";
import { addCollection } from "@iconify/react/offline";

addCollection(mdiIcons);
