import h337, { Heatmap } from "./src/core";

class HeatLayer {
  heatmap: Heatmap;
  constructor() {
    console.log(8);

    this.heatmap = h337.create({});
  }
}

export default HeatLayer;
