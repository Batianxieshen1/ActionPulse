import { Flame, Zap } from "lucide-react";

interface Props {
  done: number;
  total: number;
  percent: number;
  combo: number;
  streak: number;
  /** 点击打开今日战报（PRD-v2.1 模块四的显式入口）。 */
  onOpenDebrief: () => void;
}

/** 今日能量槽 + 连击 + 连续天数（PRD §4 模块4）。整块可点，作为战报的显式入口。 */
export function EnergyBar({ done, total, percent, combo, streak, onOpenDebrief }: Props) {
  return (
    <button
      type="button"
      className="block w-full cursor-pointer space-y-2 text-left"
      aria-label="查看今日战报"
      title="点击查看今日战报"
      onClick={onOpenDebrief}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ap-label">今日能量</span>
        <div className="flex items-center gap-1.5">
          {combo >= 2 ? (
            <span className="ap-combo" data-hot={combo >= 3 ? "true" : undefined} title={`${combo} 连击`}>
              <Flame size={12} />
              <span className="ap-mono">x{combo}</span>
            </span>
          ) : null}
          {streak > 0 ? (
            <span className="ap-chip" data-tone="today" title={`连续 ${streak} 天有完成记录`}>
              <Zap size={11} />
              <span className="ap-mono">{streak}</span> 天
            </span>
          ) : null}
          <span className="ap-mono ap-t-xs text-[var(--text-dim)]">
            {done}/{total}
          </span>
        </div>
      </div>
      <div className="ap-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="今日完成度">
        <div className="ap-meter__fill" style={{ width: `${percent}%` }} />
      </div>
    </button>
  );
}
