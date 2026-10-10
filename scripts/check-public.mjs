#!/usr/bin/env node
// public/ 目录下的文件原样拷贝进 dist，不经过 Vite/TS 的任何解析。
// server/ 与 scripts/ 下的 .mjs 也只在真正执行时才会被 Node 解析。
//
// 教训：public/sw.js 曾经因为块注释里出现了「星号紧跟斜杠」的组合而被提前终结，
// 导致整个 Service Worker 语法错误、完全无法注册。但 vite build 一切正常、
// 单元测试也全绿 —— 只有真正在浏览器里跑一次才会暴露。
// 所以这里在构建前，把所有会被原样交付的脚本用 Node 真实解析一遍。
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = ["public", "server", "scripts"];
const EXTENSIONS = [".js", ".mjs", ".cjs"];

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    // parentPath 在 Node 20+ 可用；兼容旧版本时退回 path
    const base = entry.parentPath ?? entry.path;
    out.push(join(base, entry.name));
  }
  return out;
}

let failures = 0;
let checked = 0;
for (const target of TARGETS) {
  let files;
  try {
    files = collect(join(root, target));
  } catch {
    continue;
  }
  for (const file of files) {
    checked += 1;
    const label = relative(root, file).replace(/\\\\/g, "/");
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
      console.log("  ok    " + label);
    } catch (error) {
      failures += 1;
      const message = String(error.stderr ?? error.message).split("\n").slice(0, 4).join("\n        ");
      console.error("  FAIL  " + label + "\n        " + message);
    }
  }
}

if (failures > 0) {
  console.error(
    "\n有 " + failures + " 个脚本无法解析。它们不经过打包器，语法错误不会让 vite build 失败，" +
      "但会在运行时静默失效（Service Worker 就是直接不注册）。",
  );
  process.exit(1);
}
console.log("脚本语法检查通过（" + checked + " 个文件）");
