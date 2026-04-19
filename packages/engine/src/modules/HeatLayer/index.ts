import h337, { Heatmap } from "./src/core";

class HeatLayer {
  heatmap: Heatmap;
  constructor() {
    this.heatmap = h337.create({});
  }
}

export default HeatLayer;
