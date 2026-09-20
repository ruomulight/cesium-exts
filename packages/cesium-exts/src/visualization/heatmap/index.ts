import h337, { type Heatmap } from "./core";

export class HeatLayer {
  heatmap: Heatmap;
  constructor() {
    this.heatmap = h337.create({});
  }
}
