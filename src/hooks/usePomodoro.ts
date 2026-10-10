import { useCallback, useEffect, useRef, useState } from "react";

export type PomodoroStatus = "idle" | "running" | "paused" | "finished";

export interface PomodoroApi {
  status: PomodoroStatus;
  remainingMs: number;
  /** 本**次实际在跑**的总时长（start 可临时指定，因此不一定等于 minutes 参数）。 */
  totalMs: number;
  progress: number;
  /** 已跑过的毫秒数，用于结算专注时长。 */
  elapsedMs: number;
  /**
   * 开始计时。可临时指定时长 —— 「⚡2 分钟启动」结束后一键续杯成标准番茄钟就靠它：
   * 直接 start(25) 即可无缝切换，不需要先改设置再等一轮渲染。
   */
  start: (minutesOverride?: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

/**
 * 极简番茄钟（PRD §4 模块2 / v2.1 模块二）。
 * 用「目标结束时间戳」而不是 setInterval 累加计时，这样后台标签页被节流也不会走慢。
 */
export function usePomodoro(minutes: number, onFinish?: () => void): PomodoroApi {
  const configuredMs = Math.max(1, minutes) * 60_000;
  const [status, setStatus] = useState<PomodoroStatus>("idle");
  const [remainingMs, setRemainingMs] = useState(configuredMs);
  // 本次实际在跑的时长：start() 可以临时覆盖，进度条与 elapsed 都以它为准
  const [activeTotalMs, setActiveTotalMs] = useState(configuredMs);
  const deadlineRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  // 时长设置变化时，未开始/已完成的计时器同步到新时长。正在跑的一律不动。
  useEffect(() => {
    if (status === "idle" || status === "finished") {
      setRemainingMs(configuredMs);
      setActiveTotalMs(configuredMs);
      setStatus("idle");
    }
  }, [configuredMs, status]);

  useEffect(() => {
    if (status !== "running") return;
    let frame = 0;
    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const left = deadline - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setStatus("finished");
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinish?.();
        }
        return;
      }
      setRemainingMs(left);
      frame = window.setTimeout(tick, 250);
    };
    tick();
    return () => window.clearTimeout(frame);
  }, [status, onFinish]);

  const start = useCallback(
    (minutesOverride?: number) => {
      const ms = Math.max(1, minutesOverride ?? minutes) * 60_000;
      finishedRef.current = false;
      deadlineRef.current = Date.now() + ms;
      setActiveTotalMs(ms);
      setRemainingMs(ms);
      setStatus("running");
    },
    [minutes],
  );

  const pause = useCallback(() => {
    setStatus((current) => {
      if (current !== "running") return current;
      if (deadlineRef.current !== null) setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
      return "paused";
    });
  }, []);

  const resume = useCallback(() => {
    setStatus((current) => {
      if (current !== "paused") return current;
      deadlineRef.current = Date.now() + remainingMs;
      return "running";
    });
  }, [remainingMs]);

  const reset = useCallback(() => {
    finishedRef.current = false;
    deadlineRef.current = null;
    setRemainingMs(activeTotalMs);
    setStatus("idle");
  }, [activeTotalMs]);

  const progress = activeTotalMs === 0 ? 0 : Math.min(1, Math.max(0, 1 - remainingMs / activeTotalMs));
  const elapsedMs = Math.max(0, activeTotalMs - remainingMs);

  return { status, remainingMs, totalMs: activeTotalMs, progress, elapsedMs, start, pause, resume, reset };
}
