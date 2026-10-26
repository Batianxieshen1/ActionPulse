/**
 * 数字滚动（Wave 1 / L1 生命感）：能量环与连击的数值变化不再跳变，
 * 而是以 ease-out 三次曲线滚动到位。reduce-motion 时调用方传 disabled 直接跳变。
 * 判定与缓动抽成纯函数，可单测。
 */
import { useEffect, useRef, useState } from "react";

export function easeOutCubic(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return 1 - Math.pow(1 - clamped, 3);
}

export function countBetween(from: number, to: number, progress: number): number {
  return Math.round(from + (to - from) * easeOutCubic(progress));
}

/** 相对时间戳平滑走一格（供 rAF 循环使用的时间标准化）。 */
export function progressOf(start: number, now: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / durationMs));
}

export function useCountUp(target: number, options?: { durationMs?: number; disabled?: boolean }): number {
  const durationMs = options?.durationMs ?? 600;
  const disabled = options?.disabled ?? false;
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    if (disabled) {
      currentRef.current = target;
      setDisplay(target);
      return;
    }
    const from = currentRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const value = countBetween(from, target, progressOf(start, now, durationMs));
      currentRef.current = value;
      setDisplay(value);
      if (value !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, disabled]);

  return display;
}
