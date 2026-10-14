import { Pause, Play, RotateCcw } from "lucide-react";
import type { PomodoroApi } from "../hooks/usePomodoro";
import { useT } from "../i18n";

interface Props {
  /** 计时器状态由调用方持有 —— 聚焦模式需要能直接 start(25) 续杯。 */
  timer: PomodoroApi;
  label: string;
  size?: number;
  disabled?: boolean;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 纯展示的番茄钟环（PRD §4 模块2）。 */
export function PomodoroRing({ timer, label, size = 148, disabled = false }: Props) {
  const t = useT();
  const radius = size / 2 - 7;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * timer.progress;

  const statusLabel =
    timer.status === "running"
      ? t("focus.timerRunning")
      : timer.status === "paused"
        ? t("focus.timerPaused")
        : timer.status === "finished"
          ? t("focus.timerFinished")
          : label;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={5} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={timer.status === "finished" ? "var(--tier-high)" : "var(--pulse)"}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: "stroke-dasharray 300ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="ap-mono ap-t-xl leading-none font-semibold tracking-tight">
            {format(timer.remainingMs)}
          </span>
          <span className="ap-label mt-1.5">{statusLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* 计时控制在台面上是配角，主行动永远是「完成了」——不能两个绿色主按钮同屏 */}
        {!disabled && timer.status === "running" ? (
          <button type="button" className="ap-btn" disabled={disabled} onClick={timer.pause}>
            <Pause size={13} /> {t("timer.pause")}
          </button>
        ) : !disabled && timer.status === "paused" ? (
          <button type="button" className="ap-btn" disabled={disabled} onClick={() => timer.resume()}>
            <Play size={13} /> {t("timer.resume")}
          </button>
        ) : !disabled ? (
          <button type="button" className="ap-btn" disabled={disabled} onClick={() => timer.start()}>
            <Play size={13} /> {t("timer.start")}
          </button>
        ) : null}
        {disabled ? null : (
          <button type="button" className="ap-icon-btn" aria-label={t("focus.resetTimer")} onClick={timer.reset}>
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
