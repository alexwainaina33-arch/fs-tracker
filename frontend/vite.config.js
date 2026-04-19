// vite.config.js
// ⚡ Automatically stamps a unique build timestamp into sw.js on every build.
// This forces the installed PWA to detect a new service worker after every Vercel deploy.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// ── Plugin: inject build timestamp into sw.js ─────────────────────────────────
function stampServiceWorker() {
  return {
    name: "stamp-sw",
    // Runs AFTER the build output is written
    closeBundle() {
      const swPath = path.resolve(__dirname, "dist/sw.js");
      if (!fs.existsSync(swPath)) {
        console.warn("[stamp-sw] dist/sw.js not found — skipping stamp");
        return;
      }
      const timestamp = Date.now(); // unique on every build
      let content = fs.readFileSync(swPath, "utf-8");
      content = content.replace("__BUILD_TIMESTAMP__", String(timestamp));
      fs.writeFileSync(swPath, content);
      console.log(`[stamp-sw] ✅ Stamped sw.js with cache version: fieldtrack-${timestamp}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],

  server: { port: 3000, host: true },
});