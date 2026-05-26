import * as Cesium from "cesium";

/**
 * 描述单个雷达实例的空间坐标点位
 */
export interface RadarPosition {
  /** 经度 (十进制度数) */
  longitude: number;
  /** 纬度 (十进制度数) */
  latitude: number;
  /** 高度/海拔 (米)，默认为 0 */
  height?: number;
}

/**
 * 立体雷达扫描矩阵系统初始化配置参数
 */
export interface RadarScanOptions {
  /** 初始化时的雷达点位数组，默认为空数组 [] */
  positions?: RadarPosition[];
  /** 雷达探测半径（米），默认 1500 */
  radius?: number;
  /** 雷达扫描特效的主题颜色，支持 Hex 字符串或 Cesium.Color 对象，默认 '#99ff00' */
  color?: string | Cesium.Color;
  /** 雷达扫描扇面的旋转速度乘数，默认 1.0 */
  speed?: number;
  /** 扫描面拖尾的最高发光亮度 (推荐范围: 0.0 ~ 2.0)，默认 0.8 */
  scanAlpha?: number;
  /** 顶部立体半圆罩的基础透明度 (推荐范围: 0.0 ~ 1.0)，默认 0.2 */
  domeBaseAlpha?: number;
  /** 底部地面罗盘底盘的基础透明度 (推荐范围: 0.0 ~ 1.0)，默认 0.15 */
  groundBaseAlpha?: number;
  /** 底盘离地的高度偏移量（米），用于防止与三维地形 (Terrain) 发生 Z-Fighting 深度冲突，默认 5.0 */
  groundOffset?: number;
  /** 实例化后是否立即在场景中显示，默认 true */
  show?: boolean;
}
