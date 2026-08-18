import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // src-tauri/target配下(Rustのビルド成果物)を監視対象から外す。
      // 含めるとコンパイル中のDLLとファイル監視がWindowsでロック競合する(EBUSY)。
      ignored: ["**/src-tauri/**"],
    },
  },
});
