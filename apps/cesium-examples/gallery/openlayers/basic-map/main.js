/* global ol */
// 预览环境已提供 OpenLayers 的全局 ol 对象。
new ol.Map({
  target: "map",
  layers: [new ol.layer.Tile({ source: new ol.source.OSM() })],
  view: new ol.View({
    center: ol.proj.fromLonLat([116.4074, 39.9042]),
    zoom: 5
  })
});
