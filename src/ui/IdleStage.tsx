import { ArrowRight, Check, Moon, Target } from "lucide-react";
import { daysBetween } from "../domain/dates";
import type { Task } from "../domain/types";
import { urgencyScore } from "../domain/urgency";
import { idleQuote } from "../feedback/quotes";
import { PulseLine } from "./PulseLine";
import { UrgencyBadge } from "./UrgencyBadge";

interface Props {
  focus: Task | null;
  upcoming: Task[];
  today: string;
  beat: number;
  energy: { done: number; total: number; percent: number };
  streak: number;
  combo: number;
  totalCompleted: number;
  onEnterFocus: () => void;
  onToggle: (task: Task, origin?: { x: number; y: number }) => void;
}

/**
 * 桌面端台面：把「现在只做这件事」放大到整块屏幕，而不是让右侧留一片空洞。
 * 窗口缩到 768px 以下时会自动隐藏，只剩左侧面板。
 */
export function IdleStage({
  focus,
  upcoming,
  today,
  beat,
  energy,
  streak,
  combo,
  totalCompleted,
  onEnterFocus,
  onToggle,
}: Props) {
  const quote = idleQuote(energy.percent, streak, Date.now());
  const ring = 168;
  const radius = ring / 2 - 8;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex w-full max-w-[620px] flex-col items-center gap-9">
      <PulseLine beat={beat} height={64} />

      <div className="flex items-center gap-8">
        <div className="relative" style={{ width: ring, height: ring }}>
          <svg width={ring} height={ring} className="-rotate-90">
            <circle cx={ring / 2} cy={ring / 2} r={radius} fill="none" stroke="var(--track)" strokeWidth={6} />
            <circle
              cx={ring / 2}
              cy={ring / 2}
              r={radius}
              fill="none"
              stroke="var(--pulse)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${(circumference * energy.percent) / 100} ${circumference}`}
              style={{ transition: "stroke-dasharray 620ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="ap-mono ap-t-2xl leading-none font-semibold">{energy.percent}</span>
            <span className="ap-label mt-1">今日能量 %</span>
          </div>
        </div>

        <dl className="ap-mono space-y-2.5 ap-t-sm">
          <div className="flex items-baseline gap-3">
            <dt className="w-16 text-[var(--text-faint)]">今日承诺</dt>
            <dd className="ap-t-md">
              {energy.done}/{energy.total}
            </dd>
          </div>
          <div className="flex items-baseline gap-3">
            <dt className="w-16 text-[var(--text-faint)]">连续天数</dt>
            <dd className="ap-t-md">{streak}</dd>
          </div>
          <div className="flex items-baseline gap-3">
            <dt className="w-16 text-[var(--text-faint)]">当前连击</dt>
            <dd className="ap-t-md">x{combo}</dd>
          </div>
          <div className="flex items-baseline gap-3">
            <dt className="w-16 text-[var(--text-faint)]">累计完成</dt>
            <dd className="ap-t-md">{totalCompleted}</dd>
          </div>
        </dl>
      </div>

      {focus ? (
        <div className="w-full space-y-4 text-center">
          <span className="ap-label">现在只做这件事</span>
          <h2 className="ap-t-2xl leading-[1.25] font-semibold tracking-tight">{focus.title}</h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <UrgencyBadge score={urgencyScore(focus, today)} />
            {focus.due ? (
              <span className="ap-chip" data-tone={focus.due < today ? "danger" : "today"}>
                {focus.due < today
                  ? `已超期 ${-daysBetween(today, focus.due)} 天`
                  : focus.due === today
                    ? "今天截止"
                    : `${daysBetween(today, focus.due)} 天后截止`}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              className="ap-btn"
              data-variant="primary"
              style={{ padding: "11px 20px", fontSize: "var(--fs-md)" }}
              onClick={onEnterFocus}
            >
              <Target size={15} /> 进入聚焦模式
            </button>
            <button
              type="button"
              className="ap-btn"
              style={{ padding: "11px 16px" }}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onToggle(focus, {
                  x: (rect.left + rect.width / 2) / window.innerWidth,
                  y: (rect.top + rect.height / 2) / window.innerHeight,
                });
              }}
            >
              <Check size={15} strokeWidth={3} /> 直接完成
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <Moon size={26} className="mx-auto text-[var(--text-faint)]" />
          <h2 className="ap-t-xl font-semibold">清单见底了</h2>
          <p className="ap-t-sm text-[var(--text-faint)]">在左边写下下一件事，或者好好休息。</p>
        </div>
      )}

      {upcoming.length > 0 ? (
        <div className="w-full">
          <div className="mb-2 flex items-center justify-between">
            <span className="ap-label">紧随其后</span>
            <button type="button" className="ap-btn" data-variant="ghost" style={{ fontSize: "var(--fs-xs)", padding: "3px 8px" }} onClick={onEnterFocus}>
              全部收进聚焦 <ArrowRight size={11} />
            </button>
          </div>
          <ul className="space-y-1.5">
            {upcoming.map((task) => (
              <li key={task.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2">
                <span className="ap-mono w-6 ap-t-xs text-[var(--text-faint)]">
                  {String(urgencyScore(task, today)).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 truncate ap-t-base">{task.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="max-w-[44ch] text-center ap-t-sm leading-6 text-[var(--text-faint)]">{quote}</p>
    </div>
  );
}
