import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * 回归守卫：Service Worker 曾经把 /api/state 的 GET 响应也缓存了，
 * 结果第二台设备永远在回放一个过期快照，表现为"同步不上"。
 * 这个 bug 只有在「Service Worker + 多端」同时存在时才暴露，单测和单端 E2E 都抓不到，
 * 所以在这里钉住它的前提条件。
 */
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const source = readFileSync(join(publicDir, "sw.js"), "utf8");

describe("public/ 下的脚本必须真实可解析", () => {
  // 只用字符串匹配是不够的：注释里混进 "**/" 会让块注释提前结束，
  // 整个 SW 语法错误、直接不注册，而字符串断言依然全绿。这里做真实解析。
  it("public/ 下每个 .js 都能被 JavaScript 引擎解析", () => {
    const scripts = readdirSync(publicDir, { recursive: true })
      .map((entry) => String(entry).replace(/\\/g, "/"))
      .filter((entry) => entry.endsWith(".js"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const relative of scripts) {
      const text = readFileSync(join(publicDir, relative), "utf8");
      expect(() => new Script(text, { filename: relative }), relative).not.toThrow();
    }
  });
});

describe("Service Worker 的缓存边界", () => {
  it("绝不拦截 /api/ 请求（同步与 AI 必须每次打到服务端）", () => {
    expect(source).toContain('url.pathname.startsWith("/api/")');
  });

  it("对 /api/ 的处理是直接 return，而不是走缓存分支", () => {
    const index = source.indexOf('url.pathname.startsWith("/api/")');
    const after = source.slice(index, index + 120);
    expect(after).toMatch(/return/);
  });

  it("缓存名带版本号，改策略时旧缓存能被清掉", () => {
    expect(source).toMatch(/const CACHE = "actionpulse-v\d+"/);
  });

  it("跨域请求不拦截", () => {
    expect(source).toContain("url.origin !== self.location.origin");
  });

  it("非 GET 请求不拦截", () => {
    expect(source).toContain('request.method !== "GET"');
  });
});