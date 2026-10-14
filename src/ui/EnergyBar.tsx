import { Flame, Zap } from "lucide-react";
import { useT } from "../i18n";

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
  const t = useT();
  return (
    <button
      type="button"
      className="block w-full cursor-pointer space-y-2 text-left"
      aria-label={t("energy.openDebrief")}
      title={t("energy.openDebriefTitle")}
      onClick={onOpenDebrief}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="ap-label">{t("energy.label")}</span>
        <div className="flex items-center gap-1.5">
          {combo >= 2 ? (
            <span className="ap-combo" data-hot={combo >= 3 ? "true" : undefined} title={t("energy.comboTitle", { n: combo })}>
              <Flame size={12} />
              <span className="ap-mono">x{combo}</span>
            </span>
          ) : null}
          {streak > 0 ? (
            <span className="ap-chip" data-tone="today" title={t("energy.streakTitle", { n: streak })}>
              <Zap size={11} />
              <span className="ap-mono">{streak}</span> {t("debrief.streakUnit")}
            </span>
          ) : null}
          <span className="ap-mono ap-t-xs text-[var(--text-dim)]">
            {done}/{total}
          </span>
        </div>
      </div>
      <div className="ap-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("energy.done")}>
        <div className="ap-meter__fill" style={{ width: `${percent}%` }} />
      </div>
    </button>
  );
}
