#!/usr/bin/env node
/**
 * ActionPulse 本地服务：一个进程同时负责
 *   1. 托管前端（dist/，SPA 回退）
 *   2. 任务状态同步（/api/state + SSE）
 *   3. AI 语义拆解代理（/api/breakdown）
 *
 * 只用 Node 内置模块，不引入 Express / 数据库 —— PRD「轻量化、零部署成本」的约束仍然成立。
 * 局域网写入是有风险的：同 Wi-Fi 下任何人都可能读改你的清单，因此**所有数据接口都要求 token**。
 * 服务启动时会把带 token 的地址打印出来，手机打开一次即记住。
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";
import { lanAddresses } from "./lan.mjs";
import { createLlm } from "./llm.mjs";
import { createStore } from "./store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = { ...loadEnvFile(join(ROOT, ".env")), ...process.env };
const DATA_DIR = ENV.AP_DATA_DIR ? resolve(ENV.AP_DATA_DIR) : join(ROOT, "data");
const DIST_DIR = join(ROOT, "dist");
const PORT = Number(ENV.PORT ?? 5273);
const HOST = ENV.HOST ?? "0.0.0.0";
const TOKEN_FILE = join(DATA_DIR, "token.txt");
const STATE_FILE = join(DATA_DIR, "state.json");
const LLM_FILE = join(DATA_DIR, "llm.json");
const MAX_BODY_BYTES = 8 * 1024 * 1024;
/** 与 src/domain/validation.ts 的 BACKUP_VERSION 保持一致（服务端不解释 schema，只报版本）。 */
const SCHEMA_VERSION = 3;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* --------------------------------- token --------------------------------- */
function ensureToken() {
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    const existing = readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing.length >= 16) return existing;
  } catch {
    // 首次运行
  }
  const token = randomBytes(16).toString("hex");
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

const TOKEN = ensureToken();
const tokenBuffer = Buffer.from(TOKEN);
const store = createStore({ file: STATE_FILE });
const llm = createLlm({ dataFile: LLM_FILE, env: ENV });

function safeEqual(candidate) {
  if (typeof candidate !== "string") return false;
  const buffer = Buffer.from(candidate);
  if (buffer.length !== tokenBuffer.length) return false;
  return timingSafeEqual(buffer, tokenBuffer);
}

function authorized(req, url) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    return safeEqual(header.slice(7).trim());
  }
  // SSE 用的 EventSource 不能自定义请求头，因此也接受 query 里的 token
  return safeEqual(url.searchParams.get("token"));
}

/* ---------------------------------- HTTP --------------------------------- */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectPromise(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolvePromise(null);
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        rejectPromise(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", rejectPromise);
  });
}

/* ----------------------------------- SSE --------------------------------- */
const sseClients = new Set();

function broadcast(rev) {
  const payload = `data: ${JSON.stringify({ rev })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function handleEvents(req, res, url) {
  if (!authorized(req, url)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write("retry: 3000\n\n");
  res.write(`data: ${JSON.stringify({ rev: store.read().rev })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      // 连接已断，交给 close 处理
    }
  }, 25_000);

  const cleanup = () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  };
  req.on("close", cleanup);
  req.on("error", cleanup);
}

/* ---------------------------------- 静态资源 ---------------------------------- */
function serveFile(res, file, status = 200) {
  const headers = { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" };
  // Vite 产物的文件名带内容哈希，可以放心长缓存；其余一律 no-cache
  headers["cache-control"] = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(file)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
  res.writeHead(status, headers);
  createReadStream(file).pipe(res);
}

function serveStatic(res, url) {
  if (!existsSync(join(DIST_DIR, "index.html"))) {
    sendJson(res, 503, { error: "前端还没有构建，请先运行 npm run build" });
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = "/";
  }
  if (pathname === "/") pathname = "/index.html";

  // 目录穿越防护：解析后的路径必须老老实实待在 dist 里
  const target = resolve(DIST_DIR, `.${pathname}`);
  if (target !== DIST_DIR && !target.startsWith(DIST_DIR + sep)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  if (existsSync(target) && statSync(target).isFile()) {
    serveFile(res, target);
    return;
  }
  // SPA 回退：未知路径交给前端路由
  serveFile(res, join(DIST_DIR, "index.html"));
}

/* ---------------------------------- API ---------------------------------- */
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/health") {
    // 公开（不含任何数据），客户端用它判断"同步服务是否在这台机器上"。
    // schema 版本与客户端 domain/validation.ts 的 BACKUP_VERSION 对应，改一处要一起改。
    sendJson(res, 200, { ok: true, name: "actionpulse", schema: SCHEMA_VERSION, aiConfigured: llm.configured() });
    return;
  }

  if (url.pathname === "/api/events") {
    handleEvents(req, res, url);
    return;
  }

  if (!authorized(req, url)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  if (route === "GET /api/state") {
    const { rev, state } = store.read();
    sendJson(res, 200, { rev, state });
    return;
  }

  if (route === "PUT /api/state") {
    const body = await readBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "请求体必须是对象" });
      return;
    }
    if (!body.state || typeof body.state !== "object" || !Array.isArray(body.state.tasks)) {
      sendJson(res, 400, { error: "state.tasks 必须是数组" });
      return;
    }
    const baseRev = Number.isFinite(body.baseRev) ? body.baseRev : -1;
    const result = store.write(baseRev, body.state);
    if (!result.ok) {
      sendJson(res, 409, { rev: result.rev, state: result.state });
      return;
    }
    broadcast(result.rev);
    sendJson(res, 200, { rev: result.rev });
    return;
  }

  if (route === "GET /api/llm/config") {
    sendJson(res, 200, llm.publicConfig());
    return;
  }

  if (route === "PUT /api/llm/config") {
    const body = await readBody(req);
    sendJson(res, 200, llm.saveConfig(body ?? {}));
    return;
  }

  if (route === "DELETE /api/llm/config") {
    sendJson(res, 200, llm.clearConfig());
    return;
  }

  if (route === "POST /api/breakdown") {
    const body = await readBody(req);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (title.length === 0) {
      sendJson(res, 400, { error: "title 必填" });
      return;
    }
    const notes = typeof body?.notes === "string" ? body.notes : "";
    const { buildBreakdownMessages } = await import("./prompt.mjs");
    const content = await llm.complete(buildBreakdownMessages(title, notes));
    sendJson(res, 200, { content });
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

/* ---------------------------------- 启动 ---------------------------------- */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      const code = error?.code ?? "error";
      const status = code === "not_configured" ? 503 : code === "bad_config" ? 400 : 502;
      sendJson(res, status, { error: String(error?.message ?? error), code });
    });
    return;
  }

  serveStatic(res, url);
});

const IS_DEV = ENV.AP_DEV === "1";

server.listen(PORT, HOST, () => {
  // 开发模式下页面由 Vite 托管（这个进程只是个后端），打印自己的地址会把用户引到一份过期的 dist 上。
  if (IS_DEV) {
    console.log(
      [
        "",
        `  ▶  ActionPulse 同步服务（开发模式，后端 ${PORT}）`,
        `  ├─ 配对 token: ${TOKEN}`,
        `  ├─ AI:         ${llm.configured() ? "已配置" : "未配置（使用离线动词模板）"}`,
        "  └─ 前端请用下面 Vite 打印的 5273 地址，并追加 ?token=<上面的 token>",
        "",
      ].join("\n"),
    );
    return;
  }

  const phones = lanAddresses();
  const lines = [
    "",
    "  ▶  ActionPulse 脉冲行动 · 本地服务",
    `  ├─ 桌面:   http://localhost:${PORT}/?token=${TOKEN}   ← 功能最完整，建议日常用这个`,
  ];
  for (const ip of phones) {
    lines.push(`  ├─ 手机:   http://${ip}:${PORT}/?token=${TOKEN}   (需同一 Wi-Fi)`);
  }
  if (phones.length === 0) {
    lines.push("  ├─ 手机:   没有找到可用的局域网地址（当前可能没连 Wi-Fi）");
  }
  lines.push(`  ├─ 数据:   ${STATE_FILE}`);
  lines.push(`  ├─ AI:     ${llm.configured() ? "已配置，语义拆解可用" : "未配置，使用离线动词模板"}`);
  // 说实话：浏览器不把「http + 局域网 IP」当作安全上下文，Service Worker 因而不可用。
  if (phones.length > 0) {
    lines.push("  ├─ 说明:   手机走的是 http + 局域网 IP，浏览器不视其为安全上下文，");
    lines.push("  │         所以「离线缓存」用不了（同步、界面、音效一切正常）。");
  }
  lines.push("  └─ 提示:   桌面端是 localhost（安全上下文），离线缓存可用", "");
  console.log(lines.join("\n"));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        // 忽略
      }
    }
    server.close(() => process.exit(0));
  });
}
