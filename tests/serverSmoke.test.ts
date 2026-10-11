import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 服务端冒烟测试：真实起一个子进程，验证「起服务 → health → 鉴权 → 读写」整条链。
 *
 * 为什么要有它：service worker 事故证明过「测试全绿 ≠ 链路通」——此前服务端唯一被
 * 测过的是 lan.mjs 的地址收集，server/index.mjs 本体没有任何自动化守护。
 * 打包器不碰它、单测不 import 它，它坏了全套测试依然绿。
 */
const PORT = 36000 + (process.pid % 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_FILE = fileURLToPath(new URL("../server/index.mjs", import.meta.url));

let child: ChildProcess;
let dataDir: string;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), "ap-smoke-"));
  child = spawn(process.execPath, [SERVER_FILE], {
    env: { ...process.env, PORT: String(PORT), AP_DATA_DIR: dataDir },
    stdio: "ignore",
  });
});

afterAll(() => {
  child?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

async function waitForHealth(timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // 还没起来，继续等
    }
    if (Date.now() > deadline) {
      throw new Error(`服务在 ${timeoutMs}ms 内没有就绪（端口 ${PORT} 可能被占用或启动失败）`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

describe("server smoke（真实子进程）", () => {
  it(
    "/api/health 公开可访问，报出服务名与 schema 版本",
    async () => {
      await waitForHealth();
      const response = await fetch(`${BASE}/api/health`);
      const body = (await response.json()) as { ok?: boolean; name?: string; schema?: number };
      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.name).toBe("actionpulse");
      expect(body.schema).toBe(3);
    },
    20_000,
  );

  it("无 token 写状态被拒（401）", async () => {
    await waitForHealth();
    const response = await fetch(`${BASE}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRev: 0, state: { tasks: [] } }),
    });
    expect(response.status).toBe(401);
  });

  it("带 token 可以写入并读回状态", async () => {
    await waitForHealth();
    const token = readFileSync(join(dataDir, "token.txt"), "utf8").trim();
    expect(token.length).toBeGreaterThanOrEqual(16);

    const state = { version: 3, tasks: [], habits: [], settings: {}, stats: {}, tombstones: {}, daily: {} };
    const put = await fetch(`${BASE}/api/state`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ baseRev: 0, state }),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`${BASE}/api/state`, { headers: { authorization: `Bearer ${token}` } });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { rev?: number };
    expect(body.rev).toBe(1);
  });
});
