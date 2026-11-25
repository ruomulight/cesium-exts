/** 离线注册实际使用的图标；新增图标时导入并在此注册。 */
import openlayers from "@iconify-icons/logos/openlayers";
import alertOutline from "@iconify-icons/mdi/alert-outline";
import applicationBracesOutline from "@iconify-icons/mdi/application-braces-outline";
import ban from "@iconify-icons/mdi/ban";
import chevronRight from "@iconify-icons/mdi/chevron-right";
import closeCircleOutline from "@iconify-icons/mdi/close-circle-outline";
import codeTags from "@iconify-icons/mdi/code-tags";
import consoleLine from "@iconify-icons/mdi/console-line";
import monitor from "@iconify-icons/mdi/monitor";
import moonWaningCrescent from "@iconify-icons/mdi/moon-waning-crescent";
import play from "@iconify-icons/mdi/play";
import redo from "@iconify-icons/mdi/redo";
import settingsOutline from "@iconify-icons/mdi/settings-outline";
import shareVariant from "@iconify-icons/mdi/share-variant";
import undo from "@iconify-icons/mdi/undo";
import whiteBalanceSunny from "@iconify-icons/mdi/white-balance-sunny";
import cesium from "@iconify-icons/simple-icons/cesium";
import { addIcon } from "@iconify/react/offline";

// 使用显式导入，使打包工具只包含用到的图标。
const icons = {
  "logos:openlayers": openlayers,
  "simple-icons:cesium": cesium,
  "mdi:alert-outline": alertOutline,
  "mdi:application-braces-outline": applicationBracesOutline,
  "mdi:ban": ban,
  "mdi:chevron-right": chevronRight,
  "mdi:close-circle-outline": closeCircleOutline,
  "mdi:code-tags": codeTags,
  "mdi:console-line": consoleLine,
  "mdi:monitor": monitor,
  "mdi:moon-waning-crescent": moonWaningCrescent,
  "mdi:play": play,
  "mdi:redo": redo,
  "mdi:settings-outline": settingsOutline,
  "mdi:share-variant": shareVariant,
  "mdi:undo": undo,
  "mdi:white-balance-sunny": whiteBalanceSunny
};

for (const [name, data] of Object.entries(icons)) {
  addIcon(name, data);
}
