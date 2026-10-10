import { Pause, Play, RotateCcw } from "lucide-react";
import type { PomodoroApi } from "../hooks/usePomodoro";

interface Props {
  /** 计时器状态由调用方持有 —— 聚焦模式需要能直接 start(25) 续杯。 */
  timer: PomodoroApi;
  label: string;
  size?: number;
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 纯展示的番茄钟环（PRD §4 模块2）。 */
export function PomodoroRing({ timer, label, size = 148 }: Props) {
  const radius = size / 2 - 7;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * timer.progress;

  const statusLabel =
    timer.status === "running" ? "专注中" : timer.status === "paused" ? "已暂停" : timer.status === "finished" ? "时间到" : label;

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
          <span className="ap-mono text-[26px] leading-none font-semibold tracking-tight">
            {format(timer.remainingMs)}
          </span>
          <span className="ap-label mt-1.5">{statusLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {timer.status === "running" ? (
          <button type="button" className="ap-btn" onClick={timer.pause}>
            <Pause size={13} /> 暂停
          </button>
        ) : timer.status === "paused" ? (
          <button type="button" className="ap-btn" data-variant="primary" onClick={() => timer.resume()}>
            <Play size={13} /> 继续
          </button>
        ) : (
          <button type="button" className="ap-btn" data-variant="primary" onClick={() => timer.start()}>
            <Play size={13} /> 开始
          </button>
        )}
        <button type="button" className="ap-icon-btn" aria-label="重置计时器" onClick={timer.reset}>
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}
