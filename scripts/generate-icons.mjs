/**
 * 无需任何图形依赖，直接手写 PNG 编码生成应用图标。
 * 思路：先用 3 倍超采样绘制，再做盒式滤波降采样，得到带抗锯齿的边缘。
 * 运行：npm run gen:icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SS = 3; // 超采样倍数

/* ------------------------------- PNG 编码 ------------------------------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------- 画布 --------------------------------- */
function createSurface(size) {
  const n = size * SS;
  const data = new Float64Array(n * n * 4);
  return { n, data };
}

function blend(surface, x, y, rgb, alpha) {
  const { n, data } = surface;
  if (x < 0 || y < 0 || x >= n || y >= n || alpha <= 0) return;
  const i = (y * n + x) * 4;
  const sa = alpha;
  const da = data[i + 3];
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  data[i] = (rgb[0] * sa + data[i] * da * (1 - sa)) / oa;
  data[i + 1] = (rgb[1] * sa + data[i + 1] * da * (1 - sa)) / oa;
  data[i + 2] = (rgb[2] * sa + data[i + 2] * da * (1 - sa)) / oa;
  data[i + 3] = oa;
}

function fillRectGradient(surface, size, top, bottom) {
  const n = size * SS;
  for (let y = 0; y < n; y += 1) {
    const t = y / (n - 1);
    const rgb = [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t,
    ];
    for (let x = 0; x < n; x += 1) blend(surface, x, y, rgb, 1);
  }
}

function strokePolyline(surface, points, widthPx, rgb) {
  const radius = widthPx / 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const distance = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(distance / 0.4));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      const minX = Math.floor(cx - radius);
      const maxX = Math.ceil(cx + radius);
      const minY = Math.floor(cy - radius);
      const maxY = Math.ceil(cy + radius);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) blend(surface, x, y, rgb, 1);
        }
      }
    }
  }
}

function downsample(surface, size) {
  const n = surface.n;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * n + (x * SS + sx)) * 4;
          const alpha = surface.data[i + 3];
          r += surface.data[i] * alpha;
          g += surface.data[i + 1] * alpha;
          b += surface.data[i + 2] * alpha;
          a += alpha;
        }
      }
      const count = SS * SS;
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(Math.min(255, r / a));
        out[o + 1] = Math.round(Math.min(255, g / a));
        out[o + 2] = Math.round(Math.min(255, b / a));
      }
      out[o + 3] = Math.round((a / count) * 255);
    }
  }
  return out;
}

/* --------------------------------- 绘制 --------------------------------- */
const BG_TOP = [22, 26, 34];
const BG_BOTTOM = [6, 7, 10];
const LIME = [200, 247, 81];

/** 归一化坐标的心搏折线；inset 控制图形在画布中占据的比例（maskable 需要留安全区）。 */
function pulsePoints(size, inset) {
  const s = size * SS;
  const x = (v) => (inset + v * (1 - 2 * inset)) * s;
  const y = (v) => (inset + v * (1 - 2 * inset)) * s;
  return [
    [x(0.0), y(0.5)],
    [x(0.26), y(0.5)],
    [x(0.36), y(0.5)],
    [x(0.43), y(0.24)],
    [x(0.5), y(0.78)],
    [x(0.57), y(0.36)],
    [x(0.64), y(0.5)],
    [x(0.72), y(0.5)],
    [x(0.78), y(0.42)],
    [x(0.84), y(0.6)],
    [x(0.9), y(0.5)],
    [x(1.0), y(0.5)],
  ];
}

function renderIcon(size, { inset, padding, corner }) {
  const surface = createSurface(size);
  const s = size * SS;
  const pad = padding * s;
  const inner = s - pad * 2;

  // 底板：corner=0 时为满幅方形（iOS 的 apple-touch-icon 与 maskable 图标需要这样，
  // 因为系统会自己套遮罩；透明圆角会被系统当成"图里有个透明角"而不是"图标是圆的"）
  const radius = inner * corner;
  for (let y = 0; y < s; y += 1) {
    for (let x = 0; x < s; x += 1) {
      const px = x + 0.5 - pad;
      const py = y + 0.5 - pad;
      if (px < 0 || py < 0 || px > inner || py > inner) continue;
      const cx = Math.min(Math.max(px, radius), inner - radius);
      const cy = Math.min(Math.max(py, radius), inner - radius);
      if (Math.hypot(px - cx, py - cy) > radius) continue;
      const t = py / inner;
      blend(surface, x, y, [
        BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
        BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
        BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
      ], 1);
    }
  }

  // 心搏线：先画一层低透明度描边当辉光，再画实线
  const points = pulsePoints(size, inset);
  strokePolyline(surface, points, size * SS * 0.085, [LIME[0], LIME[1], LIME[2]]);
  strokePolyline(surface, points, size * SS * 0.045, [234, 255, 154]);

  return downsample(surface, size);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, inset: 0.16, padding: 0.04, corner: 0.22 },
  { file: "icon-512.png", size: 512, inset: 0.16, padding: 0.04, corner: 0.22 },
  // iOS 主屏图标：必须是满幅不透明的正方形，圆角交给系统
  { file: "apple-touch-icon.png", size: 180, inset: 0.19, padding: 0, corner: 0 },
  // maskable：满幅填充，图形落在中心 80% 安全区内
  { file: "maskable-512.png", size: 512, inset: 0.26, padding: 0, corner: 0 },
];

for (const target of targets) {
  const rgba = renderIcon(target.size, {
    inset: target.inset,
    padding: target.padding,
    corner: target.corner,
  });
  const path = join(outDir, target.file);
  writeFileSync(path, encodePng(target.size, target.size, rgba));
  console.log(`generated ${target.file} (${target.size}x${target.size})`);
}