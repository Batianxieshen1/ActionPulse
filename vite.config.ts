/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { networkInterfaces } from "node:os";

/** 收集本机所有非回环 IPv4 地址（用于局域网手机访问提示）。 */
export function lanAddresses(): string[] {
  const found = new Set<string>();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) found.add(addr.address);
    }
  }
  return [...found].sort();
}

/** 启动时在终端打印多端访问地址（规范 §6.3 要求）。 */
function printLanUrlsPlugin(port: number): Plugin {
  return {
    name: "actionpulse:print-lan-urls",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const lines = [
          "",
          "  \u25b6  ActionPulse 脉冲行动",
          `  \u251c\u2500 本机:   http://localhost:${port}/`,
        ];
        for (const ip of lanAddresses()) {
          lines.push(`  \u251c\u2500 手机:   http://${ip}:${port}/   (需同一 Wi-Fi)`);
        }
        lines.push("  \u2514\u2500 提示:   手机浏览器「添加到主屏幕」即可全屏运行", "");
        console.log(lines.join("\n"));
      });
    },
  };
}

const PORT = 5273;

export default defineConfig({
  plugins: [react(), tailwindcss(), printLanUrlsPlugin(PORT)],
  server: {
    host: "0.0.0.0",
    port: PORT,
    strictPort: false,
    // 开发模式下把 /api 转给本地同步服务，让开发与生产的接口路径完全一致
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.AP_API_PORT ?? 5274}`,
        changeOrigin: false,
      },
    },
  },
  preview: { host: "0.0.0.0", port: PORT + 1 },
  build: { target: "es2022", sourcemap: false },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
  },
});
