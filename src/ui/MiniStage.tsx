import { Target } from "lucide-react";
import { daysBetween } from "../domain/dates";
import type { Task } from "../domain/types";
import { urgencyScore } from "../domain/urgency";
import { useT } from "../i18n";
import { UrgencyBadge } from "./UrgencyBadge";

interface Props {
  focus: Task;
  today: string;
  percent: number;
  onEnterFocus: () => void;
}

/**
 * 紧凑台面条（<769 布局）：手机和停靠窄窗的「现在只做这件事」。
 * 桌面宽布局由 IdleStage 承担；这一行让窄布局也保有「打开就知道做什么」的核心应答。
 * 能量环缩小成 40px 的进度示意（数字在紧邻的能量槽里，不重复）。
 */
export function MiniStage({ focus, today, percent, onEnterFocus }: Props) {
  const t = useT();
  const due = focus.due;
  const dueText = due
    ? due < today
      ? t("card.overdue", { n: -daysBetween(today, due) })
      : due === today
        ? t("card.dueToday")
        : t("card.dueIn", { n: daysBetween(today, due) })
    : null;

  const size = 40;
  const stroke = 3.5;
  const radius = size / 2 - stroke;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="ap-mini-stage">
      <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--pulse)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(circumference * percent) / 100} ${circumference}`}
        />
      </svg>

      <div className="min-w-0 flex-1 text-center">
        <span className="ap-label">{t("stage.nowDoThis")}</span>
        <p className="ap-t-base mt-0.5 truncate font-semibold">{focus.title}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <UrgencyBadge score={urgencyScore(focus, today)} compact />
        {dueText ? <span className="ap-t-2xs text-[var(--text-faint)]">{dueText}</span> : null}
      </div>

      <button
        type="button"
        className="ap-icon-btn shrink-0"
        data-active="true"
        aria-label={t("stage.enterFocus")}
        title={t("header.focusTitle")}
        onClick={onEnterFocus}
      >
        <Target size={16} />
      </button>
    </div>
  );
}
