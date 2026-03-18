import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@tensorflow/tfjs", "@tensorflow-models/mobilenet"],
  },
  resolve: {
    alias: {
      "@tensorflow/tfjs$": "@tensorflow/tfjs/dist/tf.es2017.js",
    },
  },
});
