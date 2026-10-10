/**
 * 礼花纸屑（PRD §4 模块4）。canvas-confetti 通过动态 import 加载，
 * 因此主包不会因为它变大；离线时由 Service Worker 缓存兜底。
 */

type BurstOrigin = { x: number; y: number };

const DARK_PALETTE = ["#c8f751", "#eaff9a", "#5eead4", "#ff9f45", "#ff5252", "#ffffff"];
// 浅色底上 #ffffff 与 #eaff9a 等于隐形，换成一组在亮底上看得见的深色纸屑
const LIGHT_PALETTE = ["#4a6b00", "#8aa800", "#0f766e", "#9a5a00", "#c02626", "#1a1d23"];

/** 礼花画在 canvas 上，拿不到 CSS 变量，所以按当前主题挑一组。 */
function palette(): string[] {
  const isLight =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  return isLight ? LIGHT_PALETTE : DARK_PALETTE;
}

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

async function loadConfetti() {
  try {
    const mod = await import("canvas-confetti");
    return mod.default;
  } catch {
    return null;
  }
}

/** 小礼花：勾选单个任务时在点击位置绽放。 */
export async function celebrateSmall(origin?: BurstOrigin): Promise<void> {
  const confetti = await loadConfetti();
  if (!confetti) return;
  confetti({
    particleCount: 42,
    spread: 68,
    startVelocity: 32,
    scalar: 0.85,
    ticks: 160,
    gravity: 0.95,
    decay: 0.92,
    colors: palette(),
    origin: origin ?? { x: 0.5, y: 0.6 },
    disableForReducedMotion: true,
  });
}

/** 大连击：左右两侧同时喷射。 */
export async function celebrateCombo(origin?: BurstOrigin): Promise<void> {
  const confetti = await loadConfetti();
  if (!confetti) return;
  const base = origin ?? { x: 0.25, y: 0.7 };
  confetti({
    particleCount: 90,
    spread: 100,
    startVelocity: 45,
    scalar: 1,
    ticks: 220,
    colors: palette(),
    origin: base,
    disableForReducedMotion: true,
  });
  window.setTimeout(() => {
    void confetti({
      particleCount: 90,
      spread: 100,
      startVelocity: 45,
      scalar: 1,
      ticks: 220,
      colors: palette(),
      origin: { x: Math.min(1, base.x + 0.5), y: base.y },
      disableForReducedMotion: true,
    });
  }, 110);
}

/** 全部清空：持续 1.2 秒的星空式礼花。 */
export async function celebrateAllClear(): Promise<void> {
  const confetti = await loadConfetti();
  if (!confetti) return;
  const end = Date.now() + 1200;
  const frame = () => {
    void confetti({
      particleCount: 6,
      angle: randomInRange(55, 125),
      spread: randomInRange(50, 90),
      startVelocity: randomInRange(30, 55),
      origin: { x: randomInRange(0.1, 0.9), y: Math.random() - 0.2 },
      colors: palette(),
      disableForReducedMotion: true,
    });
    if (Date.now() < end) window.requestAnimationFrame(frame);
  };
  frame();
}