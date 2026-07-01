import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/panel",
  build: {
    outDir: "../../dist/panel",
    emptyOutDir: true,
  },
});
