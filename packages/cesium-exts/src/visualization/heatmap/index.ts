import h337, { type Heatmap } from "./core";

class HeatLayer {
  heatmap: Heatmap;
  constructor() {
    this.heatmap = h337.create({});
  }
}

export default HeatLayer;
