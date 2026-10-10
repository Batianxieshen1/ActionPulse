import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 主题配色的可读性守卫。
 *
 * 为什么需要它：颜色是最容易被"随手改一下"改坏的东西，而且改坏了没有报错、没有红屏，
 * 只有用户觉得"看不清"。这里把 WCAG 对比度变成断言，两套主题都跑。
 *
 * 阈值依据 WCAG 2.1 AA：
 *  - 正文（<18.66px 常规字重）需要 >= 4.5:1  → 本文件里的文字都属于这一类
 *  - 大字 / 图形对象需要 >= 3:1
 * 刻意不校验发丝级装饰边框：两套主题的 --line 都远低于 3:1，这是刻意的视觉选择
 * （输入框还靠底色区分，聚焦时会升到满强度主色）。这一点在文档里如实说明，而不是假装达标。
 */
const CSS = readFileSync(fileURLToPath(new URL("../src/index.css", import.meta.url)), "utf8");
const LINES = CSS.split(/\r?\n/);

type Rgba = { r: number; g: number; b: number; a: number };

function readBlock(startIdx: number): Record<string, string> {
  let open = startIdx;
  while (open < LINES.length && !LINES[open].includes("{")) open += 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < LINES.length; i += 1) {
    for (const ch of LINES[i]) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const map: Record<string, string> = {};
  for (let i = open + 1; i < end; i += 1) {
    const m = LINES[i].match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

const dark = readBlock(LINES.findIndex((t) => t.trim() === ":root,"));
const light = readBlock(LINES.findIndex((t) => t.includes('[data-theme="light"]')));

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/i;
const MIX = /^color-mix\(in srgb,\s*var\((--[a-z0-9-]+)\)\s+([\d.]+)%,\s*transparent\)$/;

function parse(value: string, block: Record<string, string>, depth = 0): Rgba {
  const v = value.trim();
  const hex = v.match(HEX);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const rgba = v.match(RGBA);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  }
  const mix = v.match(MIX);
  if (mix && depth < 4) {
    const base = parse(block[mix[1]] ?? "#000000", block, depth + 1);
    return { r: base.r, g: base.g, b: base.b, a: Number(mix[2]) / 100 };
  }
  throw new Error("无法解析的颜色: " + v);
}

/** 把带透明度的颜色叠在不透明底色上，得到"眼睛实际看到的颜色"。 */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}
function ratio(a: Rgba, b: Rgba): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
const r2 = (x: number) => Math.round(x * 100) / 100;

/** 还原真实的层叠：shell 底色 -> 面板底 -> 卡片底。 */
function surfaces(block: Record<string, string>) {
  const shell = over(parse(block["--ink-950"], block), { r: 255, g: 255, b: 255, a: 1 });
  const panel = over(parse(block["--panel-bg-top"], block), shell);
  const card = over(parse(block["--card-top"], block), panel);
  return { shell, panel, card };
}

const TEXT_TOKENS = [
  "--text",
  "--text-dim",
  "--text-faint",
  "--pulse",
  "--tier-critical",
  "--tier-high",
  "--tier-medium",
  "--tier-low",
];

describe.each([
  ["深色", dark],
  ["浅色", light],
])("%s主题的对比度", (label, block) => {
  const s = surfaces(block);

  it("所有文字色在三种底色上都达到 AA（>= 4.5:1）", () => {
    const failures: string[] = [];
    for (const token of TEXT_TOKENS) {
      const color = parse(block[token], block);
      for (const [surfaceName, surface] of Object.entries(s)) {
        const value = r2(ratio(color, surface));
        if (value < 4.5) failures.push(`${label} ${token} 在 ${surfaceName} 上 = ${value}:1`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("主色按钮上的文字达到 AA", () => {
    const fg = parse(block["--on-accent"], block);
    const bg = parse(block["--pulse"], block);
    const value = r2(ratio(fg, bg));
    expect(value, `${label} --on-accent / --pulse = ${value}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("结构令牌齐全，两套主题一一对应", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it("主题块里没有漏掉的硬编码颜色（必须全部走令牌）", () => {
    // 令牌值本身当然可以是字面量；这里检查的是"使用点"。
    const colorRe = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
    const blocks = [
      [LINES.findIndex((t) => t.trim() === ":root {"), LINES.findIndex((t) => t.includes('[data-theme="light"]'))],
    ];
    void blocks;
    const darkStart = LINES.findIndex((t) => t.trim() === ":root,");
    const lightStart = LINES.findIndex((t) => t.includes('[data-theme="light"]'));
    const lightEnd = lightStart + 80;
    const offenders: string[] = [];
    let inComment = false;
    for (let i = 0; i < LINES.length; i += 1) {
      const t = LINES[i];
      // 块注释要跨行跟踪状态，否则注释里的色值会被误报
      const opens = t.includes("/*");
      const closes = t.includes("*/");
      if (inComment) {
        if (closes) inComment = false;
        continue;
      }
      if (opens) {
        if (!closes) inComment = true;
        continue;
      }
      const inDark = i >= darkStart && i <= darkStart + 80;
      const inLight = i >= lightStart && i <= lightEnd;
      const inStruct = i < 26;
      if (inDark || inLight || inStruct) continue;
      if (/mask-image/.test(t)) continue;
      if (colorRe.test(t)) offenders.push(`${i + 1}: ${t.trim()}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("配色意图", () => {
  it("浅色主色不能沿用深色那个电光柠檬（亮底上 1.24:1，等于隐形）", () => {
    expect(light["--pulse"]).not.toBe(dark["--pulse"]);
    expect(dark["--pulse"]).toBe("#c8f751");
    expect(light["--pulse"]).toBe("#4a6b00");
  });

  it("浅色必须是亮底深字，深色必须是暗底亮字", () => {
    expect(luminance(parse(light["--ink-950"], light))).toBeGreaterThan(0.5);
    expect(luminance(parse(light["--text"], light))).toBeLessThan(0.1);
    expect(luminance(parse(dark["--ink-950"], dark))).toBeLessThan(0.05);
    expect(luminance(parse(dark["--text"], dark))).toBeGreaterThan(0.5);
  });
});
