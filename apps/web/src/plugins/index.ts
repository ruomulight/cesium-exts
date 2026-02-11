import { cesiumInit } from "./cesiumInit.ts";

export default {
  install() {
    cesiumInit();
  }
};

export const useAppInitialization = () => {
  cesiumInit();
};
