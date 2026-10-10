/**
 * 移动端触感反馈（PRD §2.2）。
 * iOS Safari 至今不实现 navigator.vibrate，因此这里是能力探测式调用，失败必须静默。
 */

export type HapticPattern = "tick" | "complete" | "combo" | "warn";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tick: 8,
  complete: 18,
  combo: [14, 40, 26],
  warn: [30, 60, 30],
};

export function vibrate(pattern: HapticPattern = "complete"): void {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // 设备不支持或被策略拦截：忽略。
  }
}

export function supportsVibration(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  } catch {
    return false;
  }
}
