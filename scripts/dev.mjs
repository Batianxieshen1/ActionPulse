#!/usr/bin/env node
/**
 * 开发模式：一条命令同时拉起「本地 API 服务」和「Vite 前端」。
 * - API 服务跑在 5274，负责同步与 AI 代理
 * - Vite 跑在 5273，把 /api 代理给 5274
 * 这样开发环境和生产环境（npm start）的接口路径完全一致，前端不需要任何环境判断。
 * 零依赖：只用 node:child_process。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lanAddresses } from "../server/lan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = process.env.AP_API_PORT ?? "5274";
const VITE_PORT = process.env.AP_VITE_PORT ?? "5273";
const DATA_DIR = process.env.AP_DATA_DIR ? resolve(process.env.AP_DATA_DIR) : join(ROOT, "data");
const TOKEN_FILE = join(DATA_DIR, "token.txt");

const api = spawn(process.execPath, [fileURLToPath(new URL("../server/index.mjs", import.meta.url))], {
  stdio: "inherit",
  env: { ...process.env, PORT: API_PORT, AP_DEV: "1" },
});

const vite = spawn(
  process.execPath,
  [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))],
  { stdio: "inherit", env: process.env },
);

/** 等后端把 token 写出来后，打印一份可以直接给手机用的地址（开发模式下前端归 Vite 管）。 */
async function printAccessUrls() {
  for (let i = 0; i < 60; i += 1) {
    if (existsSync(TOKEN_FILE)) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  let token = "";
  try {
    token = readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    // 还没生成，下面的地址就不带 token
  }
  const query = token ? `?token=${token}` : "";

  const ips = lanAddresses();

  const lines = ["", "  ▶  ActionPulse 开发地址（前端 Vite + 后端同步）", `  ├─ 桌面:   http://localhost:${VITE_PORT}/${query}`];
  for (const ip of ips) {
    lines.push(`  ├─ 手机:   http://${ip}:${VITE_PORT}/${query}   (需同一 Wi-Fi)`);
  }
  if (ips.length === 0) lines.push("  ├─ 手机:   没有找到可用的局域网地址（当前可能没连 Wi-Fi）");
  if (!token) lines.push("  ├─ 注意:   尚未读到 token，请用后端打印的 token 手动追加");
  lines.push("  ├─ 说明:   手机走 http + 局域网 IP，不是安全上下文，离线缓存不可用（同步正常）");
  lines.push("  └─ 提示:   端口以 Vite 实际输出为准", "");
  console.log(lines.join("\n"));
}
void printAccessUrls();

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [api, vite]) {
    try {
      child.kill();
    } catch {
      // 已经退出
    }
  }
  process.exit(code);
}

api.on("exit", (code) => {
  if (!shuttingDown) {
    console.error(`\n[dev] API 服务退出（code ${code}），正在关闭 Vite…`);
    shutdown(code ?? 1);
  }
});
vite.on("exit", (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
